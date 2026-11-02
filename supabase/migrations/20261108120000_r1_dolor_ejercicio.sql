-- R1 v1.21 · Dolor por ejercicio, lista «ejercicios a evitar» y Acuerdo del Coach 0.9 (concepto jurídico 13, 2/11/2026). Aditiva e idempotente, encima de v1.20.
--   · Consentimiento `pain_report` (just-in-time): se pide al tocar por primera vez «Reportar molestia o dolor» (modal literal del abogado).
--   · `exercise_pain`: ejercicio (nombre que escribió el coach, clave normalizada) + día, solo con coach activo. Aviso push neutral al coach.
--   · `avoid_exercises`: lista del coach por asesorado. El coach solo la ve/edita (y solo ve el historial de dolor) con el Acuerdo 0.9 (cláusula de listas
--     de exclusión) y con vínculo activo; el historial de dolor además exige la autorización vigente de la persona.
--   · 0.9-A7-coach = el acuerdo con la «Uso de listas de exclusión y adaptaciones»; vale también para la liga y exportar.
-- Pruebas: supabase/tests/240_dolor_ejercicio.test.sql.

alter table core.consent_events drop constraint if exists consent_events_kind_check;
alter table core.consent_events add constraint consent_events_kind_check check (kind in (
  'terms', 'privacy', 'adult', 'sensitive_health', 'cloud_transfer', 'photos_cloud', 'photo_view_coach', 'coach_agreement',
  'share_body', 'share_notes', 'share_nutrition', 'share_habits', 'share_photos', 'liga', 'coach_data', 'push', 'injury', 'pain_report'));

create or replace function grasa.liga_agreement_versions() returns text[]
language sql immutable set search_path = '' as $$ select array['0.7-A7-coach', '0.8-A7-coach', '0.9-A7-coach']::text[] $$;
create or replace function grasa.export_agreement_versions() returns text[]
language sql immutable set search_path = '' as $$ select array['0.5-A7-coach', '0.6-A7-coach', '0.7-A7-coach', '0.8-A7-coach', '0.9-A7-coach']::text[] $$;
create or replace function grasa.restrictions_agreement_versions() returns text[]
language sql immutable set search_path = '' as $$ select array['0.9-A7-coach']::text[] $$;

create or replace function grasa.restrictions_agreement_ok(p_coach uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select x.granted and x.version = any (grasa.restrictions_agreement_versions())
                   from (select e.granted, e.version from core.consent_events e
                         where e.user_id = p_coach and e.app_id = 'grasa' and e.kind = 'coach_agreement'
                         order by e.created_at desc, e.client_at desc, e.id desc limit 1) x), false)
$$;

create or replace function grasa.exercise_key(p_name text) returns text
language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(translate(lower(coalesce(p_name, '')), 'áéíóúüñàèìòù', 'aeiouunaeiou'), '\s+', ' ', 'g'))
$$;

create table if not exists grasa.exercise_pain (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references auth.users(id) on delete cascade,
  exercise_key  text not null check (char_length(exercise_key) between 1 and 80),
  exercise_name text not null check (char_length(exercise_name) between 1 and 80),
  day           date not null,
  version       text not null check (char_length(version) between 1 and 20),
  text_hash     text not null check (text_hash ~ '^[0-9a-f]{64}$'),
  created_at    timestamptz not null default now(),
  unique (client_id, exercise_key, day)
);
create index if not exists exercise_pain_client on grasa.exercise_pain (client_id, day);

create table if not exists grasa.avoid_exercises (
  coach_id      uuid not null references auth.users(id) on delete cascade,
  client_id     uuid not null references auth.users(id) on delete cascade,
  exercise_key  text not null check (char_length(exercise_key) between 1 and 80),
  exercise_name text not null check (char_length(exercise_name) between 1 and 80),
  created_at    timestamptz not null default now(),
  primary key (coach_id, client_id, exercise_key)
);

alter table grasa.exercise_pain enable row level security;
alter table grasa.avoid_exercises enable row level security;
revoke all on grasa.exercise_pain, grasa.avoid_exercises from public, anon, authenticated, service_role;

-- ============ Asesorado ============
create or replace function grasa.pain_report_exercise(p_exercise text, p_day date, p_version text, p_text_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); k text := grasa.exercise_key(p_exercise); c uuid;
begin
  perform core.require_cloud_consent('grasa');
  if not core.consent_is_granted(uid, 'grasa', 'pain_report') then raise exception 'forbidden' using errcode = '42501', detail = 'pain_consent_required'; end if;
  if k = '' or char_length(k) > 80 or char_length(btrim(p_exercise)) > 80 or p_day is null or p_day not between grasa.today_bogota() - 1 and grasa.today_bogota() + 1
     or coalesce(p_version, '') = '' or char_length(p_version) > 20 or coalesce(p_text_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid' using errcode = '22023';
  end if;
  select l.coach_id into c from grasa.coach_links l where l.client_id = uid and l.status = 'active';
  if c is null then raise exception 'not_found' using errcode = 'P0002', detail = 'no_coach'; end if;
  insert into grasa.exercise_pain (client_id, exercise_key, exercise_name, day, version, text_hash)
    values (uid, k, btrim(p_exercise), p_day, p_version, p_text_hash) on conflict (client_id, exercise_key, day) do nothing;
  perform grasa.push_enqueue(c, 'client_alert');
  return jsonb_build_object('exercise', btrim(p_exercise), 'day', p_day);
end $$;

create or replace function grasa.my_exercise_pain() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('exercise', p.exercise_name, 'day', p.day) order by p.day desc, p.created_at desc) from grasa.exercise_pain p where p.client_id = uid), '[]'::jsonb);
end $$;

-- ============ Coach ============
-- {agreement: false} si todavía no aceptó el Acuerdo 0.9; si sí: lista «a evitar» y, con la autorización vigente de la persona, su historial de dolor.
create or replace function grasa.coach_exercise_flags(p_client uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_coach_of(p_client);
begin
  if not grasa.restrictions_agreement_ok(uid) then return jsonb_build_object('agreement', false, 'avoid', '[]'::jsonb, 'pain', '[]'::jsonb); end if;
  return jsonb_build_object('agreement', true,
    'avoid', coalesce((select jsonb_agg(jsonb_build_object('exercise', a.exercise_name) order by a.created_at) from grasa.avoid_exercises a where a.coach_id = uid and a.client_id = p_client), '[]'::jsonb),
    'pain', case when core.consent_is_granted(p_client, 'grasa', 'pain_report')
                 then coalesce((select jsonb_agg(jsonb_build_object('exercise', p.exercise_name, 'day', p.day) order by p.day desc, p.created_at desc) from grasa.exercise_pain p where p.client_id = p_client), '[]'::jsonb)
                 else '[]'::jsonb end);
end $$;

create or replace function grasa.avoid_add(p_client uuid, p_exercise text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_coach_of(p_client); k text := grasa.exercise_key(p_exercise);
begin
  if not grasa.restrictions_agreement_ok(uid) then raise exception 'forbidden' using errcode = '42501', detail = 'restrictions_agreement_required'; end if;
  if k = '' or char_length(k) > 80 or char_length(btrim(p_exercise)) > 80 then raise exception 'invalid' using errcode = '22023'; end if;
  insert into grasa.avoid_exercises (coach_id, client_id, exercise_key, exercise_name) values (uid, p_client, k, btrim(p_exercise)) on conflict do nothing;
end $$;

create or replace function grasa.avoid_remove(p_client uuid, p_exercise text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_coach_of(p_client);
begin
  if not grasa.restrictions_agreement_ok(uid) then raise exception 'forbidden' using errcode = '42501', detail = 'restrictions_agreement_required'; end if;
  delete from grasa.avoid_exercises a where a.coach_id = uid and a.client_id = p_client and a.exercise_key = grasa.exercise_key(p_exercise);
end $$;

revoke execute on function grasa.liga_agreement_versions(), grasa.export_agreement_versions(), grasa.restrictions_agreement_versions(), grasa.restrictions_agreement_ok(uuid), grasa.exercise_key(text),
  grasa.pain_report_exercise(text, date, text, text), grasa.my_exercise_pain(), grasa.coach_exercise_flags(uuid), grasa.avoid_add(uuid, text), grasa.avoid_remove(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function grasa.pain_report_exercise(text, date, text, text), grasa.my_exercise_pain(), grasa.coach_exercise_flags(uuid), grasa.avoid_add(uuid, text), grasa.avoid_remove(uuid, text) to authenticated;
