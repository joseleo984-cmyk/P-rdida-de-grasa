-- R1 v1.19 · Avisos push (concepto jurídico del 1/11/2026). Aditiva e idempotente, encima de v1.18.
--   · Consentimiento `push` (just-in-time: la persona lo da al tocar «Activar avisos», NUNCA en el registro). Sin él no se guarda ningún dispositivo.
--   · Guardamos solo el identificador técnico del dispositivo (endpoint + 2 claves públicas del navegador) y 2 preferencias. Se borran al apagar los avisos
--     y al eliminar la cuenta (ON DELETE CASCADE). Ninguna tabla guarda texto de avisos: el contenido lo fija la app (frases neutrales, sin datos de salud).
--   · Avisos de este lote: mensaje del coach (nota nueva) y rutina nueva o cambiada. Los triggers solo ponen una fila en `push_outbox`; una función de borde
--     (`push-enviar`, llamada por un Database Webhook) la envía. Recordatorio diario e insignias: etapa siguiente.
-- Pruebas: supabase/tests/220_push.test.sql.

alter table core.consent_events drop constraint if exists consent_events_kind_check;
alter table core.consent_events add constraint consent_events_kind_check check (kind in (
  'terms', 'privacy', 'adult', 'sensitive_health', 'cloud_transfer', 'photos_cloud', 'photo_view_coach', 'coach_agreement',
  'share_body', 'share_notes', 'share_nutrition', 'share_habits', 'share_photos', 'liga', 'coach_data', 'push'));

create table if not exists grasa.push_devices (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null unique check (char_length(endpoint) between 20 and 1000 and endpoint like 'https://%'),
  p256dh     text not null check (char_length(p256dh) between 20 and 200),
  auth       text not null check (char_length(auth) between 8 and 100),
  created_at timestamptz not null default now()
);
create index if not exists push_devices_user on grasa.push_devices (user_id);

create table if not exists grasa.push_prefs (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  coach_msgs boolean not null default true,
  routines   boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists grasa.push_outbox (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('coach_msg', 'routine')),
  created_at timestamptz not null default now(),
  sent_at    timestamptz null
);
create index if not exists push_outbox_pending on grasa.push_outbox (created_at) where sent_at is null;

-- Claves VAPID del servicio (las crea la función de borde la primera vez). Solo la lee/escribe service_role por funciones.
create table if not exists grasa.push_config (
  id            boolean primary key default true check (id),
  vapid_public  text not null,
  vapid_private text not null
);

alter table grasa.push_devices enable row level security;
alter table grasa.push_prefs enable row level security;
alter table grasa.push_outbox enable row level security;
alter table grasa.push_config enable row level security;
revoke all on grasa.push_devices, grasa.push_prefs, grasa.push_outbox, grasa.push_config from public, anon, authenticated, service_role;

-- ============ Persona: activar, apagar, preferencias ============
create or replace function grasa.push_register(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  if not core.consent_is_granted(uid, 'grasa', 'push') then raise exception 'forbidden' using errcode = '42501', detail = 'push_consent_required'; end if;
  insert into grasa.push_devices (user_id, endpoint, p256dh, auth) values (uid, p_endpoint, p_p256dh, p_auth)
    on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
  insert into grasa.push_prefs (user_id) values (uid) on conflict (user_id) do nothing;
  -- como máximo 5 dispositivos por persona (se van los más viejos)
  delete from grasa.push_devices d where d.user_id = uid and d.id not in (
    select x.id from grasa.push_devices x where x.user_id = uid order by x.created_at desc, x.id limit 5);
end $$;

create or replace function grasa.push_unregister(p_endpoint text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  delete from grasa.push_devices d where d.user_id = uid and d.endpoint = p_endpoint;
end $$;

-- Apagar los avisos: el identificador del dispositivo se borra del registro activo (y lo pendiente por enviar).
create or replace function grasa.push_off() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  delete from grasa.push_devices d where d.user_id = uid;
  delete from grasa.push_outbox o where o.user_id = uid and o.sent_at is null;
end $$;

create or replace function grasa.push_state() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); p grasa.push_prefs;
begin
  select x.* into p from grasa.push_prefs x where x.user_id = uid;
  return jsonb_build_object(
    'consent', core.consent_is_granted(uid, 'grasa', 'push'),
    'devices', (select count(*) from grasa.push_devices d where d.user_id = uid),
    'coach_msgs', coalesce(p.coach_msgs, true), 'routines', coalesce(p.routines, true));
end $$;

create or replace function grasa.push_set_prefs(p_coach_msgs boolean, p_routines boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  if p_coach_msgs is null or p_routines is null then raise exception 'invalid' using errcode = '22023'; end if;
  insert into grasa.push_prefs (user_id, coach_msgs, routines, updated_at) values (uid, p_coach_msgs, p_routines, now())
    on conflict (user_id) do update set coach_msgs = excluded.coach_msgs, routines = excluded.routines, updated_at = now();
end $$;

-- ============ Avisos a la cola (INTERNAS) ============
create or replace function grasa.push_enqueue(p_user uuid, p_kind text) returns void
language plpgsql security definer set search_path = '' as $$
declare allowed boolean;
begin
  if not exists (select 1 from grasa.push_devices d where d.user_id = p_user) then return; end if;
  if not core.consent_is_granted(p_user, 'grasa', 'push') then return; end if;
  select case p_kind when 'coach_msg' then coalesce(p.coach_msgs, true) when 'routine' then coalesce(p.routines, true) else false end
    into allowed from (select 1) s left join grasa.push_prefs p on p.user_id = p_user;
  if not coalesce(allowed, false) then return; end if;
  -- sin ráfagas: si ya hay uno igual pendiente, no se añade otro
  if exists (select 1 from grasa.push_outbox o where o.user_id = p_user and o.kind = p_kind and o.sent_at is null) then return; end if;
  insert into grasa.push_outbox (user_id, kind) values (p_user, p_kind);
end $$;

create or replace function grasa.push_on_comment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.deleted_at is null then perform grasa.push_enqueue(new.client_id, 'coach_msg'); end if;
  return new;
end $$;
drop trigger if exists push_on_comment on grasa.comments;
create trigger push_on_comment after insert on grasa.comments for each row execute function grasa.push_on_comment();

create or replace function grasa.push_on_routine() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n jsonb := to_jsonb(new);
begin
  -- to_jsonb para no depender de columnas (visible nace en v1.8): solo avisa si es visible y cambió algo que la persona ve
  if coalesce((n->>'visible')::boolean, true) and (tg_op = 'INSERT' or (to_jsonb(old)->'visible', to_jsonb(old)->'content', to_jsonb(old)->'title') is distinct from (n->'visible', n->'content', n->'title')) then
    perform grasa.push_enqueue(new.client_id, 'routine');
  end if;
  return new;
end $$;
drop trigger if exists push_on_routine on grasa.routines;
create trigger push_on_routine after insert or update on grasa.routines for each row execute function grasa.push_on_routine();

create or replace function grasa.push_on_daily() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select k.client_id from grasa.coach_links k where k.coach_id = new.coach_id and k.status = 'active' loop
    perform grasa.push_enqueue(r.client_id, 'routine');
  end loop;
  return new;
end $$;
drop trigger if exists push_on_daily on grasa.daily_routines;
create trigger push_on_daily after insert or update on grasa.daily_routines for each row execute function grasa.push_on_daily();

-- ============ Solo service_role (función de borde `push-enviar`) ============
create or replace function grasa.push_keys_get() returns jsonb
language sql stable security definer set search_path = '' as $$
  select (select jsonb_build_object('public', c.vapid_public, 'private', c.vapid_private) from grasa.push_config c where c.id)
$$;

create or replace function grasa.push_keys_set(p_public text, p_private text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  insert into grasa.push_config (id, vapid_public, vapid_private) values (true, p_public, p_private) on conflict (id) do nothing;
  return grasa.push_keys_get();
end $$;

-- Reclama (marca como enviados) hasta p_limit avisos pendientes de las últimas 24 h y devuelve sus dispositivos. Una vez, sin repetir.
create or replace function grasa.push_take(p_limit integer default 50) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare out jsonb;
begin
  with taken as (
    update grasa.push_outbox o set sent_at = now()
    where o.id in (select x.id from grasa.push_outbox x where x.sent_at is null and x.created_at > now() - interval '24 hours' order by x.id limit greatest(1, least(coalesce(p_limit, 50), 200)))
    returning o.id, o.user_id, o.kind)
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'kind', t.kind, 'devices', coalesce((
    select jsonb_agg(jsonb_build_object('endpoint', d.endpoint, 'p256dh', d.p256dh, 'auth', d.auth)) from grasa.push_devices d where d.user_id = t.user_id), '[]'::jsonb))), '[]'::jsonb)
    into out from taken t;
  delete from grasa.push_outbox o where o.sent_at is not null and o.sent_at < now() - interval '7 days';
  return out;
end $$;

-- El servicio de avisos dijo que el dispositivo ya no existe (410/404): se borra.
create or replace function grasa.push_gone(p_endpoint text) returns void
language sql security definer set search_path = '' as $$
  delete from grasa.push_devices d where d.endpoint = p_endpoint
$$;

revoke execute on function grasa.push_register(text, text, text), grasa.push_unregister(text), grasa.push_off(), grasa.push_state(), grasa.push_set_prefs(boolean, boolean),
  grasa.push_enqueue(uuid, text), grasa.push_on_comment(), grasa.push_on_routine(), grasa.push_on_daily(),
  grasa.push_keys_get(), grasa.push_keys_set(text, text), grasa.push_take(integer), grasa.push_gone(text) from public, anon, authenticated, service_role;
grant execute on function grasa.push_register(text, text, text), grasa.push_unregister(text), grasa.push_off(), grasa.push_state(), grasa.push_set_prefs(boolean, boolean) to authenticated;
grant execute on function grasa.push_keys_get(), grasa.push_keys_set(text, text), grasa.push_take(integer), grasa.push_gone(text) to service_role;
