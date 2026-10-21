-- R1 · Esquema `core` (común a todas las apps del proyecto compartido). Contrato: equipo/r1-contrato.md §2.1.
-- Idempotente: se puede aplicar varias veces (Supabase CLI o pegado en el SQL Editor vía supabase/r1.sql).
-- Requisitos de Supabase: esquemas `auth` (auth.users, auth.uid()) y roles `anon`, `authenticated`, `service_role`.

create schema if not exists core;
grant usage on schema core to authenticated, service_role;

-- ---------- Apps ----------
create table if not exists core.apps (
  id   text primary key check (id ~ '^[a-z][a-z0-9_]{1,30}$'),
  name text not null default ''
);
insert into core.apps (id, name) values ('grasa', 'Pérdida de Grasa') on conflict (id) do nothing;

-- ---------- Perfiles (1:1 con auth.users) ----------
create table if not exists core.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 60),
  created_at   timestamptz not null default now()
);

create or replace function core.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into core.profiles (id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 60))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists core_on_auth_user_created on auth.users;
create trigger core_on_auth_user_created after insert on auth.users
  for each row execute function core.handle_new_user();

-- ---------- Acceso por app y rol ('admin' se da a mano en SQL, nunca por API) ----------
create table if not exists core.app_access (
  user_id    uuid not null references auth.users(id) on delete cascade,
  app_id     text not null references core.apps(id),
  role       text not null check (role in ('client','coach','admin')),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, app_id, role)
);

create or replace function core.has_role(p_app text, p_role text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from core.app_access a
                 where a.user_id = auth.uid() and a.app_id = p_app and a.role = p_role and a.active);
$$;

-- ---------- Consentimientos: SOLO INSERCIÓN (prueba de autorización, Ley 1581) ----------
create table if not exists core.consent_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  app_id      text not null references core.apps(id),
  kind        text not null check (kind in ('terms','privacy','adult','sensitive_health','photos_cloud',
                                            'share_body','share_notes','share_nutrition','share_habits','share_photos')),
  granted     boolean not null,
  version     text not null check (char_length(version) between 1 and 20),
  -- SHA-256 (hex) del texto exacto que vio el usuario (legal o de la pantalla de compartir). Extensión de S3-1 al
  -- contrato: permite probar QUÉ se aceptó aunque el texto cambie después.
  text_hash   text not null check (text_hash ~ '^[0-9a-f]{64}$'),
  coach_id    uuid null,                                   -- para share_*: con qué coach
  client_at   timestamptz not null,                        -- cuándo lo marcó el usuario (puede ser offline)
  created_at  timestamptz not null default now()           -- cuándo llegó al servidor (lo fija el trigger)
);
create index if not exists consent_events_user on core.consent_events (user_id, app_id, kind, created_at desc);

-- El servidor fija created_at (no se puede antedatar) y acota client_at al reloj del servidor (+5 min).
create or replace function core.consent_events_stamp() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.created_at := clock_timestamp();   -- distinto aunque lleguen varios en la misma transacción
  new.client_at := least(new.client_at, now() + interval '5 minutes');
  return new;
end $$;
drop trigger if exists consent_events_stamp on core.consent_events;
create trigger consent_events_stamp before insert on core.consent_events
  for each row execute function core.consent_events_stamp();

-- Ni UPDATE ni DELETE ni TRUNCATE, para nadie (tampoco service_role ni el dueño de la tabla). Única excepción: el
-- borrado EN CASCADA por la baja de la cuenta (contrato §2.1; si el abogado pide conservarlos, se cambia a set null).
create or replace function core.consent_events_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from auth.users u where u.id = old.user_id) then
    return old;   -- cascada de la baja: el usuario ya no existe
  end if;
  raise exception 'consent_events es solo-inserción (% no permitido)', tg_op using errcode = '42501';
end $$;
drop trigger if exists consent_events_no_update on core.consent_events;
create trigger consent_events_no_update before update or delete on core.consent_events
  for each row execute function core.consent_events_immutable();
drop trigger if exists consent_events_no_truncate on core.consent_events;
create trigger consent_events_no_truncate before truncate on core.consent_events
  for each statement execute function core.consent_events_immutable();

-- ---------- RLS ----------
alter table core.apps enable row level security;
alter table core.profiles enable row level security;
alter table core.app_access enable row level security;
alter table core.consent_events enable row level security;

drop policy if exists apps_read on core.apps;
create policy apps_read on core.apps for select to authenticated using (true);

drop policy if exists profiles_own_read on core.profiles;
create policy profiles_own_read on core.profiles for select to authenticated using (id = auth.uid());
drop policy if exists profiles_own_update on core.profiles;
create policy profiles_own_update on core.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists app_access_own_read on core.app_access;
create policy app_access_own_read on core.app_access for select to authenticated using (user_id = auth.uid());

drop policy if exists consent_own_read on core.consent_events;
create policy consent_own_read on core.consent_events for select to authenticated using (user_id = auth.uid());
drop policy if exists consent_own_insert on core.consent_events;
create policy consent_own_insert on core.consent_events for insert to authenticated with check (user_id = auth.uid());

-- ---------- Permisos (la API de datos exige GRANT explícitos; nunca a anon) ----------
revoke all on all tables in schema core from anon, public;
grant select on core.apps, core.profiles, core.app_access, core.consent_events to authenticated;
grant update (display_name) on core.profiles to authenticated;
grant insert on core.consent_events to authenticated;
revoke update, delete, truncate on core.consent_events from authenticated, service_role;

-- ---------- RPC ----------
create or replace function core.my_roles(p_app text) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(a.role order by a.role), '{}')
  from core.app_access a where a.user_id = auth.uid() and a.app_id = p_app and a.active;
$$;

-- Da el rol 'client' en la app si no lo tiene. Devuelve mis roles.
create or replace function core.join_app(p_app text) returns text[]
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'auth' using errcode = '28000'; end if;
  if not exists (select 1 from core.apps where id = p_app) then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into core.app_access (user_id, app_id, role) values (auth.uid(), p_app, 'client') on conflict do nothing;
  return core.my_roles(p_app);
end $$;

-- Último evento por tipo (para no volver a pedir la aceptación legal en otro dispositivo).
create or replace function core.my_consents(p_app text)
returns table (kind text, granted boolean, version text, client_at timestamptz, text_hash text)
language sql stable security definer set search_path = '' as $$
  select distinct on (e.kind) e.kind, e.granted, e.version, e.client_at, e.text_hash
  from core.consent_events e
  where e.user_id = auth.uid() and e.app_id = p_app and e.kind not like 'share\_%'
  order by e.kind, e.created_at desc, e.client_at desc, e.id desc;
$$;

-- Registra un consentimiento calculando el hash del texto en el servidor (alternativa a insertar con text_hash).
create or replace function core.record_consent(p_app text, p_kind text, p_granted boolean, p_version text,
  p_text text, p_client_at timestamptz default now(), p_coach uuid default null) returns uuid
language sql security invoker set search_path = '' as $$
  insert into core.consent_events (user_id, app_id, kind, granted, version, text_hash, coach_id, client_at)
  values (auth.uid(), p_app, p_kind, p_granted, p_version,
          encode(sha256(convert_to(p_text, 'UTF8')), 'hex'), p_coach, p_client_at)
  returning id;
$$;

-- Baja de la cuenta: borra auth.users (cascada a todo). Antes el cliente borra sus fotos del Storage (§2.4).
create or replace function core.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'auth' using errcode = '28000'; end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke execute on all functions in schema core from public, anon;
grant execute on function core.my_roles(text), core.join_app(text), core.my_consents(text),
  core.record_consent(text, text, boolean, text, text, timestamptz, uuid), core.delete_my_account(),
  core.has_role(text, text) to authenticated;
