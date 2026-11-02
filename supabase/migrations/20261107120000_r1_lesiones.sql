-- R1 v1.20 · Lesiones y condiciones médicas con seguimiento del coach (concepto jurídico 13, 2/11/2026). Aditiva e idempotente, encima de v1.19.
--   · Consentimiento `injury` (just-in-time): la persona autoriza registrar su restricción y compartirla con su coach al guardar la primera vez. Si lo retira,
--     el coach deja de ver TODO de inmediato (la función del coach devuelve vacío). Sin él no se guarda nada.
--   · `injuries`: lesión (temporal: activa → en recuperación → superada) o condición médica (de por vida: siempre activa). Una lesión puede reclasificarse a
--     condición (el modal literal queda con su versión y huella). Texto libre del propio asesorado; la plataforma no interpreta ni diagnostica.
--   · `injury_notes`: seguimiento escrito por el coach. El asesorado las ve. Todo en cascada con la cuenta; al desvincularse el coach pierde el acceso al instante.
--   · Aviso push al coach (neutral, «Tienes un aviso de un asesorado»): nueva lesión, cambio de estado o conversión. Preferencia `alerts` (por defecto sí).
-- Pruebas: supabase/tests/230_lesiones.test.sql.

alter table core.consent_events drop constraint if exists consent_events_kind_check;
alter table core.consent_events add constraint consent_events_kind_check check (kind in (
  'terms', 'privacy', 'adult', 'sensitive_health', 'cloud_transfer', 'photos_cloud', 'photo_view_coach', 'coach_agreement',
  'share_body', 'share_notes', 'share_nutrition', 'share_habits', 'share_photos', 'liga', 'coach_data', 'push', 'injury'));

create table if not exists grasa.injuries (
  id           uuid primary key,
  client_id    uuid not null references auth.users(id) on delete cascade,
  kind         text not null check (kind in ('lesion', 'condicion')),
  area         text not null check (char_length(btrim(area)) between 2 and 80),
  description  text null check (description is null or char_length(description) <= 500),
  status       text not null default 'activa' check (status in ('activa', 'recuperacion', 'superada')),
  onset        date null,
  version      text not null check (char_length(version) between 1 and 20),
  text_hash    text not null check (text_hash ~ '^[0-9a-f]{64}$'),
  converted_at timestamptz null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (kind <> 'condicion' or status = 'activa')
);
create index if not exists injuries_client on grasa.injuries (client_id, updated_at);

create table if not exists grasa.injury_notes (
  id         uuid primary key default gen_random_uuid(),
  injury_id  uuid not null references grasa.injuries(id) on delete cascade,
  coach_id   uuid not null references auth.users(id) on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists injury_notes_injury on grasa.injury_notes (injury_id, created_at);

alter table grasa.injuries enable row level security;
alter table grasa.injury_notes enable row level security;
revoke all on grasa.injuries, grasa.injury_notes from public, anon, authenticated, service_role;

-- ============ Salida (INTERNA) ============
create or replace function grasa.injury_out(i grasa.injuries) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', i.id, 'kind', i.kind, 'area', i.area, 'description', i.description, 'status', i.status, 'onset', i.onset,
    'convertedAt', i.converted_at, 'createdAt', i.created_at, 'updatedAt', i.updated_at,
    'notes', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body, 'createdAt', n.created_at) order by n.created_at, n.id)
                       from grasa.injury_notes n where n.injury_id = i.id), '[]'::jsonb))
$$;

-- ============ Asesorado ============
create or replace function grasa.injury_save(p_id uuid, p_kind text, p_area text, p_description text, p_status text, p_onset date, p_version text, p_text_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); i grasa.injuries; st text;
begin
  perform core.require_cloud_consent('grasa');
  if not core.consent_is_granted(uid, 'grasa', 'injury') then raise exception 'forbidden' using errcode = '42501', detail = 'injury_consent_required'; end if;
  if p_id is null or p_kind not in ('lesion', 'condicion') or coalesce(p_status, 'activa') not in ('activa', 'recuperacion', 'superada')
     or coalesce(p_version, '') = '' or char_length(p_version) > 20 or coalesce(p_text_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid' using errcode = '22023';
  end if;
  st := case when p_kind = 'condicion' then 'activa' else coalesce(p_status, 'activa') end;   -- la condición médica no se «supera»
  select x.* into i from grasa.injuries x where x.id = p_id;
  if found and i.client_id <> uid then raise exception 'forbidden' using errcode = '42501'; end if;
  if found then
    update grasa.injuries x set area = btrim(p_area), description = nullif(btrim(coalesce(p_description, '')), ''), status = case when x.kind = 'condicion' then 'activa' else st end,
      onset = p_onset, updated_at = now() where x.id = p_id returning * into i;
  else
    insert into grasa.injuries (id, client_id, kind, area, description, status, onset, version, text_hash)
      values (p_id, uid, p_kind, btrim(p_area), nullif(btrim(coalesce(p_description, '')), ''), st, p_onset, p_version, p_text_hash) returning * into i;
  end if;
  return grasa.injury_out(i);
end $$;

create or replace function grasa.injury_convert(p_id uuid, p_version text, p_text_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); i grasa.injuries;
begin
  if not core.consent_is_granted(uid, 'grasa', 'injury') then raise exception 'forbidden' using errcode = '42501', detail = 'injury_consent_required'; end if;
  if coalesce(p_version, '') = '' or char_length(p_version) > 20 or coalesce(p_text_hash, '') !~ '^[0-9a-f]{64}$' then raise exception 'invalid' using errcode = '22023'; end if;
  select x.* into i from grasa.injuries x where x.id = p_id and x.client_id = uid;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if i.kind <> 'lesion' then raise exception 'invalid' using errcode = '22023', detail = 'already_condition'; end if;
  update grasa.injuries x set kind = 'condicion', status = 'activa', converted_at = now(), version = p_version, text_hash = p_text_hash, updated_at = now()
    where x.id = p_id returning * into i;
  return grasa.injury_out(i);
end $$;

create or replace function grasa.injury_delete(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  delete from grasa.injuries x where x.id = p_id and x.client_id = uid;
end $$;

create or replace function grasa.my_injuries() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  return coalesce((select jsonb_agg(grasa.injury_out(i) order by i.updated_at desc, i.id) from grasa.injuries i where i.client_id = uid), '[]'::jsonb);
end $$;

-- ============ Coach ============
-- Solo con vínculo activo y con la autorización de la persona vigente: si la retira o se desvincula, el coach no ve NADA.
create or replace function grasa.coach_injuries(p_client uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform grasa.require_coach_of(p_client);
  if not core.consent_is_granted(p_client, 'grasa', 'injury') then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(grasa.injury_out(i) order by (i.status = 'superada'), i.updated_at desc, i.id) from grasa.injuries i where i.client_id = p_client), '[]'::jsonb);
end $$;

create or replace function grasa.injury_note_add(p_injury uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); i grasa.injuries; n grasa.injury_notes;
begin
  select x.* into i from grasa.injuries x where x.id = p_injury;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform grasa.require_coach_of(i.client_id);
  if not core.consent_is_granted(i.client_id, 'grasa', 'injury') then raise exception 'forbidden' using errcode = '42501', detail = 'injury_consent_required'; end if;
  if coalesce(btrim(p_body), '') = '' or char_length(btrim(p_body)) > 500 then raise exception 'invalid' using errcode = '22023'; end if;
  insert into grasa.injury_notes (injury_id, coach_id, body) values (p_injury, uid, btrim(p_body)) returning * into n;
  update grasa.injuries x set updated_at = now() where x.id = p_injury;
  return jsonb_build_object('id', n.id, 'body', n.body, 'createdAt', n.created_at);
end $$;

-- ============ Aviso push al coach ============
alter table grasa.push_prefs add column if not exists alerts boolean not null default true;
alter table grasa.push_outbox drop constraint if exists push_outbox_kind_check;
alter table grasa.push_outbox add constraint push_outbox_kind_check check (kind in ('coach_msg', 'routine', 'client_alert'));

create or replace function grasa.push_enqueue(p_user uuid, p_kind text) returns void
language plpgsql security definer set search_path = '' as $$
declare allowed boolean;
begin
  if not exists (select 1 from grasa.push_devices d where d.user_id = p_user) then return; end if;
  if not core.consent_is_granted(p_user, 'grasa', 'push') then return; end if;
  select case p_kind when 'coach_msg' then coalesce(p.coach_msgs, true) when 'routine' then coalesce(p.routines, true) when 'client_alert' then coalesce(p.alerts, true) else false end
    into allowed from (select 1) s left join grasa.push_prefs p on p.user_id = p_user;
  if not coalesce(allowed, false) then return; end if;
  if exists (select 1 from grasa.push_outbox o where o.user_id = p_user and o.kind = p_kind and o.sent_at is null) then return; end if;
  insert into grasa.push_outbox (user_id, kind) values (p_user, p_kind);
end $$;

create or replace function grasa.push_on_injury() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c uuid;
begin
  if tg_op = 'INSERT' or (old.status, old.kind) is distinct from (new.status, new.kind) then
    select k.coach_id into c from grasa.coach_links k where k.client_id = new.client_id and k.status = 'active';
    if c is not null then perform grasa.push_enqueue(c, 'client_alert'); end if;
  end if;
  return new;
end $$;
drop trigger if exists push_on_injury on grasa.injuries;
create trigger push_on_injury after insert or update on grasa.injuries for each row execute function grasa.push_on_injury();

drop function if exists grasa.push_set_prefs(boolean, boolean);
create or replace function grasa.push_set_prefs(p_coach_msgs boolean, p_routines boolean, p_alerts boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  if p_coach_msgs is null or p_routines is null or p_alerts is null then raise exception 'invalid' using errcode = '22023'; end if;
  insert into grasa.push_prefs (user_id, coach_msgs, routines, alerts, updated_at) values (uid, p_coach_msgs, p_routines, p_alerts, now())
    on conflict (user_id) do update set coach_msgs = excluded.coach_msgs, routines = excluded.routines, alerts = excluded.alerts, updated_at = now();
end $$;

create or replace function grasa.push_state() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); p grasa.push_prefs;
begin
  select x.* into p from grasa.push_prefs x where x.user_id = uid;
  return jsonb_build_object(
    'consent', core.consent_is_granted(uid, 'grasa', 'push'),
    'devices', (select count(*) from grasa.push_devices d where d.user_id = uid),
    'coach_msgs', coalesce(p.coach_msgs, true), 'routines', coalesce(p.routines, true), 'alerts', coalesce(p.alerts, true));
end $$;

revoke execute on function grasa.injury_out(grasa.injuries), grasa.injury_save(uuid, text, text, text, text, date, text, text), grasa.injury_convert(uuid, text, text), grasa.injury_delete(uuid),
  grasa.my_injuries(), grasa.coach_injuries(uuid), grasa.injury_note_add(uuid, text), grasa.push_on_injury(), grasa.push_enqueue(uuid, text),
  grasa.push_set_prefs(boolean, boolean, boolean), grasa.push_state() from public, anon, authenticated, service_role;
grant execute on function grasa.injury_save(uuid, text, text, text, text, date, text, text), grasa.injury_convert(uuid, text, text), grasa.injury_delete(uuid),
  grasa.my_injuries(), grasa.coach_injuries(uuid), grasa.injury_note_add(uuid, text), grasa.push_set_prefs(boolean, boolean, boolean), grasa.push_state() to authenticated;
