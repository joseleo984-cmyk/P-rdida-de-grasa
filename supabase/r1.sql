-- GENERADO por scripts/build-r1.js a partir de supabase/migrations/. NO EDITAR A MANO.
-- Base de datos de R1 (r1 v1): equipo/r1-contrato.md §2. Idempotente: se puede pegar entero en el SQL Editor
-- de Supabase (primero en el proyecto de PRUEBAS). Al final debe mostrar una fila con "OK r1 v1".
begin;

-- ======== 20261021120000_r1_core.sql ========
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

-- ======== 20261021120100_r1_grasa.sql ========
-- R1 · Esquema `grasa` (app Pérdida de Grasa). Contrato: equipo/r1-contrato.md §2.2 y §2.3.
-- Regla D3: el dueño usa RLS directa; el COACH NUNCA lee tablas de salud directamente: solo vía funciones
-- SECURITY DEFINER que comprueban vínculo activo + categoría y filtran campos (sin `note`, sin `library`).
-- Idempotente.

create schema if not exists grasa;
grant usage on schema grasa to authenticated, service_role;

-- ============ Coach, código de invitación y vínculo ============
create table if not exists grasa.coaches (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  business_name   text not null check (char_length(business_name) between 2 and 60),
  invite_code     text not null unique check (invite_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$'),
  -- Extensión de S3-1 al contrato: caducidad y límite de usos opcionales del código vigente (null = sin límite).
  invite_expires_at timestamptz null,
  invite_max_uses   int null check (invite_max_uses between 1 and 500),
  invite_uses       int not null default 0,
  free_clients    int  not null default 5,
  active          boolean not null default true,
  code_rotated_at timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create table if not exists grasa.coach_links (
  id              uuid primary key default gen_random_uuid(),
  coach_id        uuid not null references grasa.coaches(user_id) on delete cascade,
  client_id       uuid not null references auth.users(id) on delete cascade,
  status          text not null default 'active' check (status in ('active','ended')),
  share_body      boolean not null default true check (share_body),     -- obligatoria mientras exista el vínculo
  share_notes     boolean not null default false,
  share_nutrition boolean not null default true,
  share_habits    boolean not null default true,
  share_photos    boolean not null default false,
  created_at      timestamptz not null default now(),
  ended_at        timestamptz null,
  updated_at      timestamptz not null default now(),
  check (coach_id <> client_id),
  check ((status = 'ended') = (ended_at is not null))
);
create unique index if not exists one_active_coach on grasa.coach_links (client_id) where status = 'active';
create index if not exists coach_links_coach on grasa.coach_links (coach_id, status);

create table if not exists grasa.invite_attempts (
  user_id    uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists invite_attempts_user on grasa.invite_attempts (user_id, created_at);

-- ============ Datos sincronizados (espejo de Schema.toRecords) ============
create table if not exists grasa.records (
  id                uuid not null,
  user_id           uuid not null references auth.users(id) on delete cascade,
  kind              text not null check (kind in ('profile','entry','food','habit','library')),
  nkey              text not null check (char_length(nkey) between 1 and 80),
  date              date null,
  data              jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 4096),
  updated_at        timestamptz not null,
  deleted_at        timestamptz null,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, kind, nkey),
  -- Clave natural coherente con la columna: entry/habit → la fecha; food → su id; profile → 'profile'.
  check (case kind
           when 'entry'   then date is not null and nkey = to_char(date, 'YYYY-MM-DD')
           when 'habit'   then date is not null and nkey = to_char(date, 'YYYY-MM-DD')
           when 'food'    then date is not null and nkey = id::text
           when 'profile' then nkey = 'profile'
           else true end)
);
create index if not exists records_pull on grasa.records (user_id, server_updated_at);

create table if not exists grasa.photos (
  id                uuid primary key,
  user_id           uuid not null references auth.users(id) on delete cascade,
  date              date not null,
  pose              text not null check (pose in ('frente','perfil','espalda')),
  width             int null check (width between 1 and 20000),
  height            int null check (height between 1 and 20000),
  storage_path      text not null,
  shared_with_coach boolean not null default false,
  created_at        timestamptz not null,
  updated_at        timestamptz not null,
  deleted_at        timestamptz null,
  server_updated_at timestamptz not null default clock_timestamp(),
  check (storage_path = user_id::text || '/' || id::text || '.jpg')
);
create index if not exists photos_pull on grasa.photos (user_id, server_updated_at);

create table if not exists grasa.comments (
  id                uuid primary key,
  link_id           uuid not null references grasa.coach_links(id) on delete cascade,
  coach_id          uuid not null,
  client_id         uuid not null,
  ref_date          date null,
  body              text not null check (char_length(body) between 1 and 1000),
  created_at        timestamptz not null default now(),
  read_at           timestamptz null,
  deleted_at        timestamptz null,
  server_updated_at timestamptz not null default clock_timestamp()
);
create index if not exists comments_client on grasa.comments (client_id, server_updated_at);
create index if not exists comments_coach on grasa.comments (coach_id, server_updated_at);

create table if not exists grasa.photo_views (
  id        uuid primary key default gen_random_uuid(),
  photo_id  uuid not null,
  coach_id  uuid not null,
  client_id uuid not null,
  viewed_at timestamptz not null default now()
);

-- server_updated_at = reloj del servidor (cursor de pull); updated_at acotado a now() + 5 min (como Schema.clampStamp).
create or replace function grasa.stamp_row() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.server_updated_at := clock_timestamp();
  if tg_table_name in ('records', 'photos') then
    new.updated_at := least(new.updated_at, now() + interval '5 minutes');
    if new.deleted_at is not null then new.deleted_at := least(new.deleted_at, now() + interval '5 minutes'); end if;
    if tg_op = 'UPDATE' then new.user_id := old.user_id; new.id := old.id; end if;   -- dueño e id inmutables
  end if;
  return new;
end $$;
drop trigger if exists records_stamp on grasa.records;
create trigger records_stamp before insert or update on grasa.records for each row execute function grasa.stamp_row();
drop trigger if exists photos_stamp on grasa.photos;
create trigger photos_stamp before insert or update on grasa.photos for each row execute function grasa.stamp_row();
drop trigger if exists comments_stamp on grasa.comments;
create trigger comments_stamp before insert or update on grasa.comments for each row execute function grasa.stamp_row();

-- ============ Comprobaciones de acceso del coach ============
-- ¿El usuario actual es coach con vínculo ACTIVO con p_client y el cliente comparte la categoría p_scope?
-- Se evalúa en cada llamada: revocar o terminar el vínculo corta el acceso en la siguiente consulta.
create or replace function grasa.coach_can_see(p_client uuid, p_scope text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from grasa.coach_links l
    join grasa.coaches c on c.user_id = l.coach_id and c.active
    where l.client_id = p_client and l.coach_id = auth.uid() and l.status = 'active'
      and case p_scope when 'body' then l.share_body when 'notes' then l.share_notes
                       when 'nutrition' then l.share_nutrition when 'habits' then l.share_habits
                       when 'photos' then l.share_photos else false end);
$$;

create or replace function grasa.coach_can_see_photo(p_owner uuid, p_photo uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select grasa.coach_can_see(p_owner, 'photos') and exists (
    select 1 from grasa.photos p
    where p.id = p_photo and p.user_id = p_owner and p.shared_with_coach and p.deleted_at is null);
$$;

-- Conversión segura (para rutas de Storage manipuladas): null si no es un UUID.
create or replace function grasa.try_uuid(p text) returns uuid
language sql immutable set search_path = '' as $$
  select case when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p::uuid end;
$$;

-- ============ RLS ============
alter table grasa.coaches enable row level security;
alter table grasa.coach_links enable row level security;
alter table grasa.invite_attempts enable row level security;
alter table grasa.records enable row level security;
alter table grasa.photos enable row level security;
alter table grasa.comments enable row level security;
alter table grasa.photo_views enable row level security;

drop policy if exists coaches_own on grasa.coaches;
create policy coaches_own on grasa.coaches for select to authenticated using (user_id = auth.uid());

drop policy if exists links_participants on grasa.coach_links;
create policy links_participants on grasa.coach_links for select to authenticated
  using (client_id = auth.uid() or coach_id = auth.uid());

-- invite_attempts: sin políticas (nadie la lee ni escribe por la API; solo las RPC).

drop policy if exists records_owner_select on grasa.records;
create policy records_owner_select on grasa.records for select to authenticated using (user_id = auth.uid());
drop policy if exists records_owner_insert on grasa.records;
create policy records_owner_insert on grasa.records for insert to authenticated with check (user_id = auth.uid());
drop policy if exists records_owner_update on grasa.records;
create policy records_owner_update on grasa.records for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists photos_owner_select on grasa.photos;
create policy photos_owner_select on grasa.photos for select to authenticated using (user_id = auth.uid());
drop policy if exists photos_owner_insert on grasa.photos;
create policy photos_owner_insert on grasa.photos for insert to authenticated with check (user_id = auth.uid());
drop policy if exists photos_owner_update on grasa.photos;
create policy photos_owner_update on grasa.photos for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists comments_participants on grasa.comments;
create policy comments_participants on grasa.comments for select to authenticated
  using (client_id = auth.uid() or coach_id = auth.uid());

drop policy if exists photo_views_client on grasa.photo_views;
create policy photo_views_client on grasa.photo_views for select to authenticated using (client_id = auth.uid());

-- Perfiles: el coach no lee core.profiles directamente (lo hace coach_clients()).

revoke all on all tables in schema grasa from anon, public;
grant select on grasa.coaches, grasa.coach_links, grasa.comments, grasa.photo_views to authenticated;
grant select, insert, update on grasa.records, grasa.photos to authenticated;

-- ============ RPC: coach, código e invitación ============
create or replace function grasa.new_invite_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   -- 31 símbolos, sin 0 O 1 I L
  b bytea := uuid_send(gen_random_uuid());
  c text := '';
begin
  for i in 0..5 loop c := c || substr(alphabet, (get_byte(b, i) % 31) + 1, 1); end loop;
  return c;
end $$;

create or replace function grasa.require_uid() returns uuid
language plpgsql stable set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'auth' using errcode = '28000'; end if;
  return auth.uid();
end $$;

-- Crea la ficha de coach (idempotente) y da el rol 'coach'. Devuelve el código vigente.
create or replace function grasa.become_coach(p_business_name text) returns table (invite_code text)
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); code text;
begin
  if p_business_name is null or char_length(trim(p_business_name)) not between 2 and 60 then
    raise exception 'invalid' using errcode = '22023';
  end if;
  if not exists (select 1 from grasa.coaches where user_id = uid) then
    loop
      code := grasa.new_invite_code();
      exit when not exists (select 1 from grasa.coaches c where c.invite_code = code);
    end loop;
    insert into grasa.coaches (user_id, business_name, invite_code) values (uid, trim(p_business_name), code);
  end if;
  insert into core.app_access (user_id, app_id, role) values (uid, 'grasa', 'coach'), (uid, 'grasa', 'client')
    on conflict do nothing;
  return query select c.invite_code from grasa.coaches c where c.user_id = uid;
end $$;

-- Código nuevo: el anterior deja de servir para vínculos NUEVOS. Caducidad y límite de usos opcionales.
create or replace function grasa.rotate_invite_code(p_valid_days int default null, p_max_uses int default null) returns text
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); code text;
begin
  if not exists (select 1 from grasa.coaches where user_id = uid) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_valid_days is not null and p_valid_days not between 1 and 365 then raise exception 'invalid' using errcode = '22023'; end if;
  loop
    code := grasa.new_invite_code();
    exit when not exists (select 1 from grasa.coaches c where c.invite_code = code);
  end loop;
  update grasa.coaches set invite_code = code, code_rotated_at = now(), invite_uses = 0,
    invite_expires_at = case when p_valid_days is null then null else now() + make_interval(days => p_valid_days) end,
    invite_max_uses = p_max_uses
  where user_id = uid;
  return code;
end $$;

-- Registra el intento y aplica el límite (20/hora). Devuelve false si se superó.
create or replace function grasa.count_attempt(p_uid uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from grasa.invite_attempts a where a.user_id = p_uid and a.created_at > now() - interval '1 hour') >= 20 then
    return false;
  end if;
  insert into grasa.invite_attempts (user_id) values (p_uid);
  return true;
end $$;

-- Coach vigente para un código, o null si no sirve (inexistente, caducado, agotado o coach inactivo).
create or replace function grasa.valid_coach_for(p_code text) returns uuid
language sql stable security definer set search_path = '' as $$
  select c.user_id from grasa.coaches c
  where c.invite_code = upper(trim(p_code)) and c.active
    and (c.invite_expires_at is null or c.invite_expires_at > now())
    and (c.invite_max_uses is null or c.invite_uses < c.invite_max_uses);
$$;

-- Vista previa: solo el nombre comercial. Los intentos fallidos cuentan para el límite (no se lanza error para
-- que el intento quede registrado): devuelve 0 filas si el código no sirve; error 'rate_limited' si > 20/h.
create or replace function grasa.preview_invite_code(p_code text) returns table (business_name text)
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  if not grasa.count_attempt(uid) then raise exception 'rate_limited' using errcode = '54000'; end if;
  return query select c.business_name from grasa.coaches c where c.user_id = grasa.valid_coach_for(p_code);
end $$;

-- p_shares: { body: true, notes, nutrition, habits, photos, version, text_hash, client_at? }
-- version y text_hash (SHA-256 del texto de la pantalla de compartir) se guardan en los consent_events share_*.
create or replace function grasa.log_shares(p_uid uuid, p_coach uuid, p_shares jsonb, p_old grasa.coach_links)
returns void language plpgsql security definer set search_path = '' as $$
declare k text; v boolean;
begin
  if coalesce(p_shares ->> 'text_hash', '') !~ '^[0-9a-f]{64}$' or coalesce(p_shares ->> 'version', '') = '' then
    raise exception 'invalid' using errcode = '22023', detail = 'p_shares necesita version y text_hash';
  end if;
  foreach k in array array['body','notes','nutrition','habits','photos'] loop
    v := coalesce((p_shares ->> k)::boolean, false);
    if p_old is null or v is distinct from (case k when 'body' then p_old.share_body when 'notes' then p_old.share_notes
        when 'nutrition' then p_old.share_nutrition when 'habits' then p_old.share_habits else p_old.share_photos end) then
      insert into core.consent_events (user_id, app_id, kind, granted, version, text_hash, coach_id, client_at)
      values (p_uid, 'grasa', 'share_' || k, v, p_shares ->> 'version', p_shares ->> 'text_hash', p_coach,
              coalesce((p_shares ->> 'client_at')::timestamptz, now()));
    end if;
  end loop;
end $$;

create or replace function grasa.join_coach(p_code text, p_shares jsonb) returns grasa.coach_links
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); coach uuid; link grasa.coach_links;
begin
  if not grasa.count_attempt(uid) then raise exception 'rate_limited' using errcode = '54000'; end if;
  coach := grasa.valid_coach_for(p_code);
  if coach is null then raise exception 'invalid_code' using errcode = 'P0002'; end if;
  if coach = uid then raise exception 'invalid' using errcode = '22023', detail = 'no puedes ser tu propio coach'; end if;
  if coalesce((p_shares ->> 'body')::boolean, false) is not true then
    raise exception 'invalid' using errcode = '22023', detail = 'compartir peso y medidas es obligatorio';
  end if;
  perform 1 from grasa.coaches where user_id = coach for update;   -- serializa el conteo de usos
  if grasa.valid_coach_for(p_code) is null then raise exception 'invalid_code' using errcode = 'P0002'; end if;
  update grasa.coach_links set status = 'ended', ended_at = now(), updated_at = now()
    where client_id = uid and status = 'active';
  insert into grasa.coach_links (coach_id, client_id, share_body, share_notes, share_nutrition, share_habits, share_photos)
  values (coach, uid, true, coalesce((p_shares ->> 'notes')::boolean, false),
          coalesce((p_shares ->> 'nutrition')::boolean, false), coalesce((p_shares ->> 'habits')::boolean, false),
          coalesce((p_shares ->> 'photos')::boolean, false))
  returning * into link;
  perform grasa.log_shares(uid, coach, p_shares, null);
  update grasa.coaches set invite_uses = invite_uses + 1 where user_id = coach;
  insert into core.app_access (user_id, app_id, role) values (uid, 'grasa', 'client') on conflict do nothing;
  return link;
end $$;

create or replace function grasa.update_shares(p_shares jsonb) returns grasa.coach_links
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); old grasa.coach_links; link grasa.coach_links;
begin
  select * into old from grasa.coach_links where client_id = uid and status = 'active' for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if coalesce((p_shares ->> 'body')::boolean, false) is not true then
    raise exception 'invalid' using errcode = '22023', detail = 'compartir peso y medidas es obligatorio; para dejar de compartir, termina el vínculo';
  end if;
  perform grasa.log_shares(uid, old.coach_id, p_shares, old);
  update grasa.coach_links set
    share_notes = coalesce((p_shares ->> 'notes')::boolean, false),
    share_nutrition = coalesce((p_shares ->> 'nutrition')::boolean, false),
    share_habits = coalesce((p_shares ->> 'habits')::boolean, false),
    share_photos = coalesce((p_shares ->> 'photos')::boolean, false),
    updated_at = now()
  where id = old.id returning * into link;
  return link;
end $$;

create or replace function grasa.leave_coach() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  update grasa.coach_links set status = 'ended', ended_at = now(), updated_at = now()
    where client_id = uid and status = 'active';
end $$;

create or replace function grasa.end_client(p_client uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  update grasa.coach_links set status = 'ended', ended_at = now(), updated_at = now()
    where coach_id = uid and client_id = p_client and status = 'active';
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end $$;

-- v1.6: el tipo de salida cambió en 20261024120000_r1_pagos_coach.sql; se borra antes para que r1.sql siga siendo idempotente (se vuelve a conceder al final).
drop function if exists grasa.coach_clients();
create function grasa.coach_clients()
returns table (client_id uuid, display_name text, link_id uuid, since timestamptz, shares jsonb,
               last_activity timestamptz, over_free_limit boolean)
language sql stable security definer set search_path = '' as $$
  select l.client_id, p.display_name, l.id, l.created_at,
         jsonb_build_object('body', l.share_body, 'notes', l.share_notes, 'nutrition', l.share_nutrition,
                            'habits', l.share_habits, 'photos', l.share_photos),
         (select max(r.server_updated_at) from grasa.records r where r.user_id = l.client_id),
         row_number() over (order by l.created_at, l.id) > c.free_clients
  from grasa.coach_links l
  join grasa.coaches c on c.user_id = l.coach_id
  left join core.profiles p on p.id = l.client_id
  where l.coach_id = auth.uid() and l.status = 'active'
  order by l.created_at;
$$;

-- ============ RPC: lectura del coach (filtrada) ============
create or replace function grasa.coach_pull(p_client uuid, p_since timestamptz default '1970-01-01T00:00:00Z')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare l grasa.coach_links; since timestamptz := coalesce(p_since, '1970-01-01T00:00:00Z') - interval '30 seconds';
  recs jsonb; phs jsonb; cms jsonb; cur timestamptz;
begin
  perform grasa.require_uid();
  select * into l from grasa.coach_links
    where coach_id = auth.uid() and client_id = p_client and status = 'active';
  if not found or not grasa.coach_can_see(p_client, 'body') then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'nkey', r.nkey, 'date', r.date,
           'data', case when r.kind = 'entry' and not l.share_notes then r.data - 'note' else r.data end,
           'updated_at', r.updated_at, 'deleted_at', r.deleted_at, 'server_updated_at', r.server_updated_at)
           order by r.server_updated_at), '[]'::jsonb), max(r.server_updated_at)
    into recs, cur
    from grasa.records r
    where r.user_id = p_client and r.server_updated_at > since
      and (r.kind in ('profile','entry')
           or (r.kind = 'food' and l.share_nutrition)
           or (r.kind = 'habit' and l.share_habits));              -- 'library' nunca
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'date', p.date, 'pose', p.pose, 'width', p.width,
           'height', p.height, 'storage_path', p.storage_path, 'created_at', p.created_at, 'updated_at', p.updated_at,
           'server_updated_at', p.server_updated_at) order by p.server_updated_at), '[]'::jsonb)
    into phs
    from grasa.photos p
    where l.share_photos and p.user_id = p_client and p.shared_with_coach and p.deleted_at is null
      and p.server_updated_at > since;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.server_updated_at), '[]'::jsonb) into cms
    from grasa.comments c where c.link_id = l.id and c.server_updated_at > since;
  return jsonb_build_object('records', recs, 'photos', phs, 'comments', cms,
                            'cursor', coalesce(cur, p_since), 'server_now', now());
end $$;

-- ============ RPC: sincronización del dueño (SECURITY INVOKER: aplica la RLS) ============
create or replace function grasa.sync_push(p_records jsonb default '[]', p_photos jsonb default '[]') returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare uid uuid := grasa.require_uid(); r jsonb; got uuid; rejected_r jsonb := '[]'; rejected_p jsonb := '[]';
begin
  if jsonb_typeof(coalesce(p_records, '[]')) <> 'array' or jsonb_typeof(coalesce(p_photos, '[]')) <> 'array' then
    raise exception 'invalid' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p_records, '[]')) + jsonb_array_length(coalesce(p_photos, '[]')) > 500 then
    raise exception 'invalid' using errcode = '22023', detail = 'máximo 500 elementos por llamada';
  end if;
  for r in select * from jsonb_array_elements(coalesce(p_records, '[]')) loop
    got := null;
    insert into grasa.records as t (id, user_id, kind, nkey, date, data, updated_at, deleted_at)
    values ((r ->> 'id')::uuid, uid, r ->> 'kind', r ->> 'nkey', (r ->> 'date')::date,
            coalesce(r -> 'data', '{}'::jsonb), (r ->> 'updated_at')::timestamptz, (r ->> 'deleted_at')::timestamptz)
    on conflict (user_id, kind, nkey) do update
      set data = excluded.data, date = excluded.date, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at
      where excluded.updated_at > t.updated_at
         or (excluded.updated_at = t.updated_at and excluded.data::text > t.data::text)
    returning t.id into got;
    if got is null then   -- ganó la fila del servidor: se devuelve para que el cliente la fusione
      rejected_r := rejected_r || (select to_jsonb(t) - 'user_id' from grasa.records t
                                   where t.user_id = uid and t.kind = r ->> 'kind' and t.nkey = r ->> 'nkey');
    end if;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(p_photos, '[]')) loop
    got := null;
    insert into grasa.photos as t (id, user_id, date, pose, width, height, storage_path, shared_with_coach,
                                   created_at, updated_at, deleted_at)
    values ((r ->> 'id')::uuid, uid, (r ->> 'date')::date, r ->> 'pose', (r ->> 'width')::int, (r ->> 'height')::int,
            r ->> 'storage_path', coalesce((r ->> 'shared_with_coach')::boolean, false),
            (r ->> 'created_at')::timestamptz, (r ->> 'updated_at')::timestamptz, (r ->> 'deleted_at')::timestamptz)
    on conflict (id) do update
      set date = excluded.date, pose = excluded.pose, width = excluded.width, height = excluded.height,
          shared_with_coach = excluded.shared_with_coach, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at
      where excluded.updated_at > t.updated_at
    returning t.id into got;
    if got is null then
      rejected_p := rejected_p || (select to_jsonb(t) - 'user_id' from grasa.photos t where t.id = (r ->> 'id')::uuid);
    end if;
  end loop;
  return jsonb_build_object('server_now', now(), 'rejected', jsonb_build_object('records', rejected_r, 'photos', rejected_p));
end $$;

-- p_overlap (S3-3): la ventana de solape de 30 s solo en la PRIMERA página de cada ciclo. Las siguientes piden
-- `>= cursor` sin solape: si no, con más de p_limit filas en 30 s la paginación no avanzaría nunca. Con `>=` como mucho
-- se repite la última fila de la página anterior (la fusión del cliente es idempotente).
drop function if exists grasa.sync_pull(timestamptz, int);
create or replace function grasa.sync_pull(p_since timestamptz default '1970-01-01T00:00:00Z', p_limit int default 1000,
  p_overlap boolean default true)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare uid uuid := grasa.require_uid();
  since timestamptz := coalesce(p_since, '1970-01-01T00:00:00Z') - case when coalesce(p_overlap, true) then interval '30 seconds' else interval '0' end;
  lim int := least(greatest(coalesce(p_limit, 1000), 1), 5000);
  recs jsonb; phs jsonb; cms jsonb; nr int; np int; nc int; mr timestamptz; mp timestamptz; mc timestamptz;
  more boolean; cur timestamptz;
begin
  select coalesce(jsonb_agg(to_jsonb(x) - 'user_id' order by x.server_updated_at), '[]'), count(*), max(x.server_updated_at)
    into recs, nr, mr
    from (select * from grasa.records r where r.user_id = uid and r.server_updated_at >= since
          order by r.server_updated_at limit lim) x;
  select coalesce(jsonb_agg(to_jsonb(x) - 'user_id' order by x.server_updated_at), '[]'), count(*), max(x.server_updated_at)
    into phs, np, mp
    from (select * from grasa.photos p where p.user_id = uid and p.server_updated_at >= since
          order by p.server_updated_at limit lim) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.server_updated_at), '[]'), count(*), max(x.server_updated_at)
    into cms, nc, mc
    from (select * from grasa.comments c where c.client_id = uid and c.server_updated_at >= since
          order by c.server_updated_at limit lim) x;
  more := nr = lim or np = lim or nc = lim;
  -- Con más páginas, el cursor es el MENOR de los máximos de las tablas llenas (nada queda sin leer).
  cur := case when more then least(case when nr = lim then mr end, case when np = lim then mp end, case when nc = lim then mc end)
              else greatest(mr, mp, mc) end;
  return jsonb_build_object('records', recs, 'photos', phs, 'comments', cms,
                            'cursor', coalesce(cur, p_since), 'has_more', more, 'server_now', now());
end $$;

-- ============ RPC: comentarios y registro de accesos a fotos ============
create or replace function grasa.add_comment(p_id uuid, p_client uuid, p_ref_date date, p_body text) returns grasa.comments
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); l grasa.coach_links; c grasa.comments;
begin
  select * into l from grasa.coach_links where coach_id = uid and client_id = p_client and status = 'active';
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into grasa.comments (id, link_id, coach_id, client_id, ref_date, body)
  values (p_id, l.id, uid, p_client, p_ref_date, p_body)
  on conflict (id) do nothing returning * into c;
  if c.id is null then select * into c from grasa.comments where id = p_id and coach_id = uid; end if;
  if c.id is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return c;
end $$;

create or replace function grasa.delete_comment(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  update grasa.comments set deleted_at = coalesce(deleted_at, now()) where id = p_id and coach_id = uid;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end $$;

create or replace function grasa.mark_comment_read(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  update grasa.comments set read_at = coalesce(read_at, now()) where id = p_id and client_id = uid;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end $$;

create or replace function grasa.coach_photo_opened(p_photo uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); owner uuid;
begin
  select p.user_id into owner from grasa.photos p where p.id = p_photo;
  if owner is null or not grasa.coach_can_see_photo(owner, p_photo) then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into grasa.photo_views (photo_id, coach_id, client_id) values (p_photo, uid, owner);
end $$;

-- ============ Admin (sin acceso a datos de salud) ============
-- Clientes activos de cada coach en un mes (vínculo activo y ≥ 1 registro sincronizado en los 30 días previos).
create or replace function grasa.billing_active_clients(p_month date)
returns table (coach_id uuid, business_name text, active_clients bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not core.has_role('grasa', 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select c.user_id, c.business_name, count(distinct l.client_id)
    from grasa.coaches c
    join grasa.coach_links l on l.coach_id = c.user_id and l.status = 'active'
    where exists (select 1 from grasa.records r where r.user_id = l.client_id
                  and r.server_updated_at >= (date_trunc('month', p_month) + interval '1 month') - interval '30 days'
                  and r.server_updated_at < date_trunc('month', p_month) + interval '1 month')
    group by c.user_id, c.business_name;
end $$;

revoke execute on all functions in schema grasa from public, anon;
grant execute on function
  grasa.coach_can_see(uuid, text), grasa.coach_can_see_photo(uuid, uuid), grasa.try_uuid(text),
  grasa.become_coach(text), grasa.rotate_invite_code(int, int), grasa.preview_invite_code(text),
  grasa.join_coach(text, jsonb), grasa.update_shares(jsonb), grasa.leave_coach(), grasa.end_client(uuid),
  grasa.coach_clients(), grasa.coach_pull(uuid, timestamptz), grasa.sync_push(jsonb, jsonb),
  grasa.sync_pull(timestamptz, int, boolean), grasa.add_comment(uuid, uuid, date, text), grasa.delete_comment(uuid),
  grasa.mark_comment_read(uuid), grasa.coach_photo_opened(uuid), grasa.billing_active_clients(date),
  grasa.require_uid()
to authenticated;

-- ======== 20261021120200_r1_storage.sql ========
-- R1 · Storage: bucket PRIVADO de fotos y sus políticas. Contrato: equipo/r1-contrato.md §2.4.
-- Ruta: '{user_id}/{photo_id}.jpg'. Lectura solo con URL firmada (createSignedUrl), nunca pública. Idempotente.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('grasa-photos', 'grasa-photos', false, 2097152, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Dueño: todo dentro de su carpeta.
drop policy if exists grasa_photos_owner_select on storage.objects;
create policy grasa_photos_owner_select on storage.objects for select to authenticated
  using (bucket_id = 'grasa-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists grasa_photos_owner_insert on storage.objects;
create policy grasa_photos_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'grasa-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists grasa_photos_owner_update on storage.objects;
create policy grasa_photos_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'grasa-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'grasa-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists grasa_photos_owner_delete on storage.objects;
create policy grasa_photos_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'grasa-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Coach: SOLO lectura, si el vínculo está activo, comparte fotos y esa foto está marcada como compartida.
-- try_uuid evita errores con rutas manipuladas (no UUID → sin acceso).
drop policy if exists grasa_photos_coach_select on storage.objects;
create policy grasa_photos_coach_select on storage.objects for select to authenticated
  using (bucket_id = 'grasa-photos'
         and grasa.coach_can_see_photo(grasa.try_uuid((storage.foldername(name))[1]),
                                       grasa.try_uuid(split_part(storage.filename(name), '.', 1))));

-- ======== 20261021130000_r1_fix_seguridad.sql ========
-- R1 · Correcciones de la revisión de seguridad de QA (equipo/handoffs/2026-10-21-S3-1-qa-veredicto.md). Idempotente.
--   D1  join_coach: un código inválido ya NO lanza error (devuelve null) para que el intento quede contado; los intentos
--       se serializan por usuario (pg_advisory_xact_lock) y se purgan a los 1 día.
--   D2  FK con borrado en cascada en photo_views e invite_attempts (la baja no deja metadatos huérfanos).
--   D3  delete_my_account se niega si quedan fotos del usuario en Storage; función de barrido para service_role.
--   O1  Permisos: se revoca TODO lo concedido directamente a authenticated/service_role y se vuelve a conceder
--       exactamente la lista blanca (por si el proyecto real tiene privilegios por defecto en esquemas nuevos).
--   O4  coach_clients.last_activity solo con categorías compartidas.   O7  coach_pull no devuelve datos de lápidas.

-- ============ D1: límite de intentos que no se puede eludir ============
create or replace function grasa.count_attempt(p_uid uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  -- Serializa por usuario: N llamadas simultáneas no pueden pasar todas con < 20.
  perform pg_advisory_xact_lock(hashtext('grasa:invite:' || p_uid::text));
  delete from grasa.invite_attempts a where a.user_id = p_uid and a.created_at < now() - interval '1 day';
  if (select count(*) from grasa.invite_attempts a where a.user_id = p_uid and a.created_at > now() - interval '1 hour') >= 20 then
    return false;
  end if;
  insert into grasa.invite_attempts (user_id) values (p_uid);
  return true;
end $$;

-- Código inválido, caducado o agotado → devuelve NULL (remote.js lo convierte en RemoteError('invalid_code')).
-- No se lanza error para que la transacción confirme el intento. Las comprobaciones que no dependen del código
-- (categorías, versión, hash) van ANTES: así un error no revela si el código existe.
create or replace function grasa.join_coach(p_code text, p_shares jsonb) returns grasa.coach_links
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); coach uuid; link grasa.coach_links;
begin
  if coalesce((p_shares ->> 'body')::boolean, false) is not true then
    raise exception 'invalid' using errcode = '22023', detail = 'compartir peso y medidas es obligatorio';
  end if;
  if coalesce(p_shares ->> 'text_hash', '') !~ '^[0-9a-f]{64}$' or coalesce(p_shares ->> 'version', '') = '' then
    raise exception 'invalid' using errcode = '22023', detail = 'p_shares necesita version y text_hash';
  end if;
  if not grasa.count_attempt(uid) then raise exception 'rate_limited' using errcode = '54000'; end if;
  coach := grasa.valid_coach_for(p_code);
  if coach is null then return null; end if;
  perform 1 from grasa.coaches where user_id = coach for update;   -- serializa el conteo de usos
  if grasa.valid_coach_for(p_code) is null then return null; end if;
  if coach = uid then raise exception 'invalid' using errcode = '22023', detail = 'no puedes ser tu propio coach'; end if;
  update grasa.coach_links set status = 'ended', ended_at = now(), updated_at = now()
    where client_id = uid and status = 'active';
  insert into grasa.coach_links (coach_id, client_id, share_body, share_notes, share_nutrition, share_habits, share_photos)
  values (coach, uid, true, coalesce((p_shares ->> 'notes')::boolean, false),
          coalesce((p_shares ->> 'nutrition')::boolean, false), coalesce((p_shares ->> 'habits')::boolean, false),
          coalesce((p_shares ->> 'photos')::boolean, false))
  returning * into link;
  perform grasa.log_shares(uid, coach, p_shares, null);
  update grasa.coaches set invite_uses = invite_uses + 1 where user_id = coach;
  insert into core.app_access (user_id, app_id, role) values (uid, 'grasa', 'client') on conflict do nothing;
  return link;
end $$;

-- ============ D2: sin metadatos huérfanos tras la baja ============
delete from grasa.photo_views v where not exists (select 1 from auth.users u where u.id = v.client_id)
  or not exists (select 1 from auth.users u where u.id = v.coach_id)
  or not exists (select 1 from grasa.photos p where p.id = v.photo_id);
delete from grasa.invite_attempts a where not exists (select 1 from auth.users u where u.id = a.user_id);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'photo_views_client_fk') then
    alter table grasa.photo_views add constraint photo_views_client_fk foreign key (client_id) references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'photo_views_coach_fk') then
    alter table grasa.photo_views add constraint photo_views_coach_fk foreign key (coach_id) references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'photo_views_photo_fk') then
    alter table grasa.photo_views add constraint photo_views_photo_fk foreign key (photo_id) references grasa.photos(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'invite_attempts_user_fk') then
    alter table grasa.invite_attempts add constraint invite_attempts_user_fk foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
end $$;

-- ============ D3: la baja no puede dejar fotos en Storage ============
-- En Supabase los archivos no se pueden borrar por SQL (hay que usar la API de Storage): la app borra primero
-- '{uid}/*' de 'grasa-photos' y después llama aquí. Si quedan archivos, se niega y la app reintenta.
create or replace function core.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'auth' using errcode = '28000'; end if;
  if exists (select 1 from storage.objects o
             where o.bucket_id = 'grasa-photos' and (storage.foldername(o.name))[1] = auth.uid()::text) then
    raise exception 'invalid' using errcode = '22023', detail = 'borra primero tus fotos de Storage';
  end if;
  delete from auth.users where id = auth.uid();
end $$;

-- Red de seguridad (bajas hechas desde el panel de Supabase, fallos a mitad): carpetas del bucket sin usuario.
-- Solo service_role. La usa supabase/tools/sweep-orphan-photos.js, que borra los archivos con la API de Storage.
create or replace function grasa.orphan_photo_folders() returns table (folder text, files bigint)
language sql stable security definer set search_path = '' as $$
  select (storage.foldername(o.name))[1], count(*)
  from storage.objects o
  where o.bucket_id = 'grasa-photos'
    and not exists (select 1 from auth.users u where u.id::text = (storage.foldername(o.name))[1])
  group by 1;
$$;

-- ============ O7: coach_pull sin datos en las lápidas ============
create or replace function grasa.coach_pull(p_client uuid, p_since timestamptz default '1970-01-01T00:00:00Z')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare l grasa.coach_links; since timestamptz := coalesce(p_since, '1970-01-01T00:00:00Z') - interval '30 seconds';
  recs jsonb; phs jsonb; cms jsonb; cur timestamptz;
begin
  perform grasa.require_uid();
  select * into l from grasa.coach_links
    where coach_id = auth.uid() and client_id = p_client and status = 'active';
  if not found or not grasa.coach_can_see(p_client, 'body') then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'nkey', r.nkey, 'date', r.date,
           'data', case when r.deleted_at is not null then '{}'::jsonb
                        when r.kind = 'entry' and not l.share_notes then r.data - 'note' else r.data end,
           'updated_at', r.updated_at, 'deleted_at', r.deleted_at, 'server_updated_at', r.server_updated_at)
           order by r.server_updated_at), '[]'::jsonb), max(r.server_updated_at)
    into recs, cur
    from grasa.records r
    where r.user_id = p_client and r.server_updated_at > since
      and (r.kind in ('profile','entry')
           or (r.kind = 'food' and l.share_nutrition)
           or (r.kind = 'habit' and l.share_habits));              -- 'library' nunca
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'date', p.date, 'pose', p.pose, 'width', p.width,
           'height', p.height, 'storage_path', p.storage_path, 'created_at', p.created_at, 'updated_at', p.updated_at,
           'server_updated_at', p.server_updated_at) order by p.server_updated_at), '[]'::jsonb)
    into phs
    from grasa.photos p
    where l.share_photos and p.user_id = p_client and p.shared_with_coach and p.deleted_at is null
      and p.server_updated_at > since;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.server_updated_at), '[]'::jsonb) into cms
    from grasa.comments c where c.link_id = l.id and c.server_updated_at > since;
  return jsonb_build_object('records', recs, 'photos', phs, 'comments', cms,
                            'cursor', coalesce(cur, p_since), 'server_now', now());
end $$;

-- ============ O4: última actividad solo de lo que el cliente comparte ============
-- v1.6: el tipo de salida cambió en 20261024120000_r1_pagos_coach.sql; se borra antes para que r1.sql siga siendo idempotente (se vuelve a conceder al final).
drop function if exists grasa.coach_clients();
create function grasa.coach_clients()
returns table (client_id uuid, display_name text, link_id uuid, since timestamptz, shares jsonb,
               last_activity timestamptz, over_free_limit boolean)
language sql stable security definer set search_path = '' as $$
  select l.client_id, p.display_name, l.id, l.created_at,
         jsonb_build_object('body', l.share_body, 'notes', l.share_notes, 'nutrition', l.share_nutrition,
                            'habits', l.share_habits, 'photos', l.share_photos),
         (select max(r.server_updated_at) from grasa.records r
          where r.user_id = l.client_id
            and (r.kind in ('profile','entry') or (r.kind = 'food' and l.share_nutrition) or (r.kind = 'habit' and l.share_habits))),
         row_number() over (order by l.created_at, l.id) > c.free_clients
  from grasa.coach_links l
  join grasa.coaches c on c.user_id = l.coach_id
  left join core.profiles p on p.id = l.client_id
  where l.coach_id = auth.uid() and l.status = 'active'
  order by l.created_at;
$$;

-- ============ O1: permisos exactos (lista blanca) ============
revoke all on all tables in schema core, grasa from public, anon, authenticated, service_role;
revoke all on all sequences in schema core, grasa from public, anon, authenticated, service_role;
revoke execute on all functions in schema core, grasa from public, anon, authenticated, service_role;
revoke all on schema core, grasa from public, anon;
grant usage on schema core, grasa to authenticated, service_role;

grant select on core.apps, core.profiles, core.app_access, core.consent_events to authenticated;
grant update (display_name) on core.profiles to authenticated;
grant insert on core.consent_events to authenticated;
grant select on grasa.coaches, grasa.coach_links, grasa.comments, grasa.photo_views to authenticated;
grant select, insert, update on grasa.records, grasa.photos to authenticated;

grant execute on function
  core.my_roles(text), core.join_app(text), core.my_consents(text), core.delete_my_account(), core.has_role(text, text),
  core.record_consent(text, text, boolean, text, text, timestamptz, uuid),
  grasa.coach_can_see(uuid, text), grasa.coach_can_see_photo(uuid, uuid), grasa.try_uuid(text), grasa.require_uid(),
  grasa.become_coach(text), grasa.rotate_invite_code(int, int), grasa.preview_invite_code(text),
  grasa.join_coach(text, jsonb), grasa.update_shares(jsonb), grasa.leave_coach(), grasa.end_client(uuid),
  grasa.coach_clients(), grasa.coach_pull(uuid, timestamptz), grasa.sync_push(jsonb, jsonb),
  grasa.sync_pull(timestamptz, int, boolean), grasa.add_comment(uuid, uuid, date, text), grasa.delete_comment(uuid),
  grasa.mark_comment_read(uuid), grasa.coach_photo_opened(uuid), grasa.billing_active_clients(date)
to authenticated;
grant execute on function grasa.orphan_photo_folders() to service_role;

-- ======== 20261021140000_r1_my_link.sql ========
-- R1 · S3-3b: grasa.my_link() — vínculo activo del cliente CON el nombre comercial del coach. Idempotente.
-- Motivo: remote.client.myLink() / joinCoach() devuelven { businessName } (contrato §3.4), pero el cliente no puede
-- leer grasa.coaches (RLS coaches_own: solo su propia fila, y esa tabla lleva el código de invitación). Esta función
-- expone SOLO el nombre comercial del coach con el que el usuario tiene un vínculo activo, nada más.
-- v1.6: el tipo de salida cambió en 20261024120000_r1_pagos_coach.sql; se borra antes para que r1.sql siga siendo idempotente (se vuelve a conceder al final).
drop function if exists grasa.my_link();
create function grasa.my_link()
returns table (id uuid, coach_id uuid, business_name text, share_body boolean, share_notes boolean,
               share_nutrition boolean, share_habits boolean, share_photos boolean, since timestamptz)
language sql stable security definer set search_path = '' as $$
  select l.id, l.coach_id, c.business_name, l.share_body, l.share_notes, l.share_nutrition, l.share_habits,
         l.share_photos, l.created_at
  from grasa.coach_links l
  join grasa.coaches c on c.user_id = l.coach_id
  where l.client_id = auth.uid() and l.status = 'active'
  limit 1;
$$;

revoke execute on function grasa.my_link() from public, anon;
grant execute on function grasa.my_link() to authenticated;

-- ======== 20261021150000_r1_notas_todos_kinds.sql ========
-- R1 v1.3 (QA en vivo S3, hallazgo H6): `coach_pull` solo quitaba `note` en kind = 'entry'; una fila `food`
-- o `habit` (o `profile`) con `note` en `data` llegaba al coach con share_notes = false. Ahora `note` se quita en
-- TODOS los kinds mientras el cliente no consienta `notes`. Única ruta de lectura del coach sobre grasa.records
-- (coach_clients solo devuelve fechas; sync_pull y la RLS de records son del dueño). Misma firma: grants intactos.

create or replace function grasa.coach_pull(p_client uuid, p_since timestamptz default '1970-01-01T00:00:00Z')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare l grasa.coach_links; since timestamptz := coalesce(p_since, '1970-01-01T00:00:00Z') - interval '30 seconds';
  recs jsonb; phs jsonb; cms jsonb; cur timestamptz;
begin
  perform grasa.require_uid();
  select * into l from grasa.coach_links
    where coach_id = auth.uid() and client_id = p_client and status = 'active';
  if not found or not grasa.coach_can_see(p_client, 'body') then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'nkey', r.nkey, 'date', r.date,
           'data', case when r.deleted_at is not null then '{}'::jsonb
                        when not l.share_notes then r.data - 'note' else r.data end,   -- H6: en TODO kind
           'updated_at', r.updated_at, 'deleted_at', r.deleted_at, 'server_updated_at', r.server_updated_at)
           order by r.server_updated_at), '[]'::jsonb), max(r.server_updated_at)
    into recs, cur
    from grasa.records r
    where r.user_id = p_client and r.server_updated_at > since
      and (r.kind in ('profile','entry')
           or (r.kind = 'food' and l.share_nutrition)
           or (r.kind = 'habit' and l.share_habits));              -- 'library' nunca
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'date', p.date, 'pose', p.pose, 'width', p.width,
           'height', p.height, 'storage_path', p.storage_path, 'created_at', p.created_at, 'updated_at', p.updated_at,
           'server_updated_at', p.server_updated_at) order by p.server_updated_at), '[]'::jsonb)
    into phs
    from grasa.photos p
    where l.share_photos and p.user_id = p_client and p.shared_with_coach and p.deleted_at is null
      and p.server_updated_at > since;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.server_updated_at), '[]'::jsonb) into cms
    from grasa.comments c where c.link_id = l.id and c.server_updated_at > since;
  return jsonb_build_object('records', recs, 'photos', phs, 'comments', cms,
                            'cursor', coalesce(cur, p_since), 'server_now', now());
end $$;

revoke execute on function grasa.coach_pull(uuid, timestamptz) from public, anon;
grant execute on function grasa.coach_pull(uuid, timestamptz) to authenticated;

-- ======== 20261022120000_r1_consentimientos_s6.sql ========
-- R1 v1.4 · Sprint 6: autorizaciones A1–A8 (equipo/legal/borradores/autorizaciones-en-app.md) y bloqueos de la
-- preasesoría legal. Idempotente. UNA sola migración en vuelo (regla del equipo).
--   C1  Nuevos tipos de consentimiento: cloud_transfer (A4), photo_view_coach (A6b), coach_agreement (A7).
--       A6a sigue siendo `photos_cloud` (ya existía en el CHECK; no se duplica con otro nombre).
--   C2  Compartir con el coach nace APAGADO por categoría (A5 sin casillas premarcadas): defaults a false.
--   C3  core.consent_archive: prueba MÍNIMA y seudonimizada del consentimiento, que sobrevive a la baja de la cuenta
--       (preasesoría P11/P2). Solo inserción, sin FK a auth.users, sin correo ni nombre, ilegible con los roles de la API.
--   C4  core.delete_my_account copia los consentimientos al archivo ANTES de borrar en cascada.
-- Todo lo demás de seguridad queda igual: RLS, SECURITY DEFINER con search_path fijo, lista blanca de privilegios.

-- ============ C1: tipos de consentimiento ============
alter table core.consent_events drop constraint if exists consent_events_kind_check;
alter table core.consent_events add constraint consent_events_kind_check check (kind in (
  'terms', 'privacy', 'adult', 'sensitive_health', 'cloud_transfer', 'photos_cloud', 'photo_view_coach', 'coach_agreement',
  'share_body', 'share_notes', 'share_nutrition', 'share_habits', 'share_photos'));

-- ============ C2: compartir apagado por defecto ============
alter table grasa.coach_links alter column share_nutrition set default false;
alter table grasa.coach_links alter column share_habits set default false;

-- ============ C3: archivo mínimo seudonimizado de la prueba del consentimiento ============
-- Sal del servidor: una sola fila, la crea esta migración y nunca sale de la base (nadie la lee por la API).
create table if not exists core.archive_secret (
  singleton boolean primary key default true check (singleton),
  salt      text not null
);
insert into core.archive_secret (singleton, salt)
values (true, encode(sha256(convert_to(gen_random_uuid()::text || clock_timestamp()::text || gen_random_uuid()::text, 'UTF8')), 'hex'))
on conflict (singleton) do nothing;

create table if not exists core.consent_archive (
  id               uuid primary key default gen_random_uuid(),
  user_pseudo_id   text not null check (user_pseudo_id ~ '^[0-9a-f]{64}$'),   -- sha256(sal || ':' || user_id): no es el uuid
  coach_pseudo_id  text null check (coach_pseudo_id ~ '^[0-9a-f]{64}$'),
  app_id           text not null,
  kind             text not null check (kind in (
    'terms', 'privacy', 'adult', 'sensitive_health', 'cloud_transfer', 'photos_cloud', 'photo_view_coach', 'coach_agreement',
    'share_body', 'share_notes', 'share_nutrition', 'share_habits', 'share_photos')),
  action           text not null check (action in ('grant', 'revoke')),
  version          text not null check (char_length(version) between 1 and 20),
  text_hash        text not null check (text_hash ~ '^[0-9a-f]{64}$'),
  client_at        timestamptz not null,
  event_at         timestamptz not null,                       -- cuándo llegó al servidor el evento original
  archived_at      timestamptz not null default now(),         -- fecha de baja de la cuenta
  -- Plazo máximo propuesto (borrador: 3 a 5 años; lo fija el abogado). NO se borra solo: el borrado queda para el
  -- dueño de la base cuando se decida el plazo (el disparador permite borrar solo filas vencidas).
  purge_after      timestamptz not null default now() + interval '5 years'
);
create index if not exists consent_archive_user on core.consent_archive (user_pseudo_id, app_id, kind, event_at);

create or replace function core.consent_archive_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and old.purge_after < now() then return old; end if;
  raise exception 'consent_archive es solo-inserción (% no permitido)', tg_op using errcode = '42501';
end $$;
drop trigger if exists consent_archive_no_update on core.consent_archive;
create trigger consent_archive_no_update before update or delete on core.consent_archive
  for each row execute function core.consent_archive_guard();
drop trigger if exists consent_archive_no_truncate on core.consent_archive;
create trigger consent_archive_no_truncate before truncate on core.consent_archive
  for each statement execute function core.consent_archive_guard();

-- RLS activada y SIN políticas: ni authenticated ni service_role la leen. Solo el dueño de la base (SQL Editor).
alter table core.archive_secret enable row level security;
alter table core.consent_archive enable row level security;
revoke all on core.archive_secret, core.consent_archive from public, anon, authenticated, service_role;
revoke execute on function core.consent_archive_guard() from public, anon, authenticated, service_role;

-- ============ C4: la baja conserva solo la prueba mínima ============
create or replace function core.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_salt text;
begin
  if v_uid is null then raise exception 'auth' using errcode = '28000'; end if;
  if exists (select 1 from storage.objects o
             where o.bucket_id = 'grasa-photos' and (storage.foldername(o.name))[1] = v_uid::text) then
    raise exception 'invalid' using errcode = '22023', detail = 'borra primero tus fotos de Storage';
  end if;
  select s.salt into v_salt from core.archive_secret s where s.singleton;
  -- Misma transacción que el borrado: o se archiva y se borra, o no pasa nada.
  insert into core.consent_archive (user_pseudo_id, coach_pseudo_id, app_id, kind, action, version, text_hash, client_at, event_at)
  select encode(sha256(convert_to(v_salt || ':' || e.user_id::text, 'UTF8')), 'hex'),
         case when e.coach_id is null then null else encode(sha256(convert_to(v_salt || ':' || e.coach_id::text, 'UTF8')), 'hex') end,
         e.app_id, e.kind, case when e.granted then 'grant' else 'revoke' end, e.version, e.text_hash, e.client_at, e.created_at
  from core.consent_events e where e.user_id = v_uid
  order by e.created_at, e.id;
  delete from auth.users where id = v_uid;
end $$;

revoke execute on function core.delete_my_account() from public, anon;
grant execute on function core.delete_my_account() to authenticated;

-- ======== 20261023120000_r1_consentimientos_servidor.sql ========
-- R1 v1.5 · Sprint 7: el servidor IMPONE los consentimientos (antes solo la app los exigía: quien llamara directo a la
-- API se los saltaba). Idempotente. UNA sola migración en vuelo (regla del equipo).
--   E1  Coach: become_coach, rotate_invite_code, coach_clients, coach_pull, add_comment y coach_photo_opened fallan con
--       42501 'forbidden' (detail 'coach_agreement_required') si el coach NO tiene vigente el acuerdo (A7).
--       Un código de invitación solo sirve si su coach tiene el acuerdo vigente (valid_coach_for): preview_invite_code
--       lo trata como inexistente y join_coach devuelve null (invalid_code), igual que un código caducado.
--   E3  Lectura del coach: coach_can_see (que usan coach_pull y las fotos) exige además que el CLIENTE tenga vigentes
--       sensitive_health y cloud_transfer. Si retira A3 o A4, el coach deja de ver sus datos en la siguiente consulta (A8).
--   E2  Cliente: sync_push, sync_pull y join_coach fallan con 42501 'consent_required' si NO tiene vigentes
--       sensitive_health (A3) y cloud_transfer (A4).
-- "Vigente" = el ÚLTIMO evento de ese tipo de la persona tiene granted = true. No se mira la versión del texto: la app
-- gestiona la re-aceptación por versión. Retirar la autorización (granted = false) bloquea de nuevo al instante.
-- Sin cambios en RLS ni en los permisos de tablas. Todas las funciones nuevas: SECURITY DEFINER con search_path fijo.
-- Las auxiliares internas no se conceden a ningún rol de la API; solo la comprobación del propio usuario va a authenticated.

-- ============ Auxiliares ============
-- ¿El último evento de ese tipo de p_user tiene granted = true? (INTERNA: no se concede a la API; con un uuid libre
-- permitiría sondear los consentimientos de otras personas.)
create or replace function core.consent_is_granted(p_user uuid, p_app text, p_kind text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select e.granted from core.consent_events e
                   where e.user_id = p_user and e.app_id = p_app and e.kind = p_kind
                   order by e.created_at desc, e.client_at desc, e.id desc limit 1), false);
$$;

-- Exige A3 (sensitive_health) y A4 (cloud_transfer) vigentes de la persona en sesión. Se llama desde las funciones de
-- sincronización (SECURITY INVOKER), por eso se concede a authenticated: solo informa del propio estado.
create or replace function core.require_cloud_consent(p_app text default 'grasa') returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'auth' using errcode = '28000'; end if;
  if not (core.consent_is_granted(auth.uid(), p_app, 'sensitive_health')
          and core.consent_is_granted(auth.uid(), p_app, 'cloud_transfer')) then
    raise exception 'consent_required' using errcode = '42501',
      detail = 'faltan las autorizaciones de datos de salud (A3) y copia en la nube (A4)';
  end if;
end $$;

-- ¿Ese coach tiene vigente el acuerdo del coach (A7)? (INTERNA)
create or replace function grasa.coach_has_agreement(p_coach uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select core.consent_is_granted(p_coach, 'grasa', 'coach_agreement');
$$;

-- Exige el acuerdo vigente de la persona en sesión (INTERNA: la llaman las funciones de coach, que son SECURITY DEFINER).
create or replace function grasa.require_coach_agreement() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'auth' using errcode = '28000'; end if;
  if not core.consent_is_granted(auth.uid(), 'grasa', 'coach_agreement') then
    raise exception 'forbidden' using errcode = '42501', detail = 'coach_agreement_required';
  end if;
end $$;

-- ============ E3: el coach solo ve a clientes que mantienen A3 + A4 ============
-- Misma firma y mismos permisos que en r1_grasa; se añade la condición sobre el consentimiento del cliente.
create or replace function grasa.coach_can_see(p_client uuid, p_scope text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from grasa.coach_links l
    join grasa.coaches c on c.user_id = l.coach_id and c.active
    where l.client_id = p_client and l.coach_id = auth.uid() and l.status = 'active'
      and core.consent_is_granted(p_client, 'grasa', 'sensitive_health')
      and core.consent_is_granted(p_client, 'grasa', 'cloud_transfer')
      and case p_scope when 'body' then l.share_body when 'notes' then l.share_notes
                       when 'nutrition' then l.share_nutrition when 'habits' then l.share_habits
                       when 'photos' then l.share_photos else false end);
$$;

-- ============ E1: coach ============
-- Un código solo sirve si su coach tiene el acuerdo vigente (además de activo, no caducado y con usos).
create or replace function grasa.valid_coach_for(p_code text) returns uuid
language sql stable security definer set search_path = '' as $$
  select c.user_id from grasa.coaches c
  where c.invite_code = upper(trim(p_code)) and c.active
    and (c.invite_expires_at is null or c.invite_expires_at > now())
    and (c.invite_max_uses is null or c.invite_uses < c.invite_max_uses)
    and grasa.coach_has_agreement(c.user_id);
$$;

create or replace function grasa.become_coach(p_business_name text) returns table (invite_code text)
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); code text;
begin
  perform grasa.require_coach_agreement();
  if p_business_name is null or char_length(trim(p_business_name)) not between 2 and 60 then
    raise exception 'invalid' using errcode = '22023';
  end if;
  if not exists (select 1 from grasa.coaches where user_id = uid) then
    loop
      code := grasa.new_invite_code();
      exit when not exists (select 1 from grasa.coaches c where c.invite_code = code);
    end loop;
    insert into grasa.coaches (user_id, business_name, invite_code) values (uid, trim(p_business_name), code);
  end if;
  insert into core.app_access (user_id, app_id, role) values (uid, 'grasa', 'coach'), (uid, 'grasa', 'client')
    on conflict do nothing;
  return query select c.invite_code from grasa.coaches c where c.user_id = uid;
end $$;

create or replace function grasa.rotate_invite_code(p_valid_days int default null, p_max_uses int default null) returns text
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); code text;
begin
  if not exists (select 1 from grasa.coaches where user_id = uid) then raise exception 'forbidden' using errcode = '42501'; end if;
  perform grasa.require_coach_agreement();
  if p_valid_days is not null and p_valid_days not between 1 and 365 then raise exception 'invalid' using errcode = '22023'; end if;
  loop
    code := grasa.new_invite_code();
    exit when not exists (select 1 from grasa.coaches c where c.invite_code = code);
  end loop;
  update grasa.coaches set invite_code = code, code_rotated_at = now(), invite_uses = 0,
    invite_expires_at = case when p_valid_days is null then null else now() + make_interval(days => p_valid_days) end,
    invite_max_uses = p_max_uses
  where user_id = uid;
  return code;
end $$;

-- Pasa de SQL a plpgsql para poder exigir el acuerdo. Mismas columnas y mismo resultado que en r1_fix_seguridad (O4).
-- v1.6: el tipo de salida cambió en 20261024120000_r1_pagos_coach.sql; se borra antes para que r1.sql siga siendo idempotente (se vuelve a conceder al final).
drop function if exists grasa.coach_clients();
create function grasa.coach_clients()
returns table (client_id uuid, display_name text, link_id uuid, since timestamptz, shares jsonb,
               last_activity timestamptz, over_free_limit boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform grasa.require_coach_agreement();
  return query
  select l.client_id, p.display_name, l.id, l.created_at,
         jsonb_build_object('body', l.share_body, 'notes', l.share_notes, 'nutrition', l.share_nutrition,
                            'habits', l.share_habits, 'photos', l.share_photos),
         (select max(r.server_updated_at) from grasa.records r
          where r.user_id = l.client_id
            and core.consent_is_granted(l.client_id, 'grasa', 'sensitive_health')
            and core.consent_is_granted(l.client_id, 'grasa', 'cloud_transfer')
            and (r.kind in ('profile','entry') or (r.kind = 'food' and l.share_nutrition) or (r.kind = 'habit' and l.share_habits))),
         row_number() over (order by l.created_at, l.id) > c.free_clients
  from grasa.coach_links l
  join grasa.coaches c on c.user_id = l.coach_id
  left join core.profiles p on p.id = l.client_id
  where l.coach_id = auth.uid() and l.status = 'active'
  order by l.created_at;
end $$;

create or replace function grasa.coach_pull(p_client uuid, p_since timestamptz default '1970-01-01T00:00:00Z')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare l grasa.coach_links; since timestamptz := coalesce(p_since, '1970-01-01T00:00:00Z') - interval '30 seconds';
  recs jsonb; phs jsonb; cms jsonb; cur timestamptz;
begin
  perform grasa.require_uid();
  perform grasa.require_coach_agreement();
  select * into l from grasa.coach_links
    where coach_id = auth.uid() and client_id = p_client and status = 'active';
  if not found or not grasa.coach_can_see(p_client, 'body') then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'nkey', r.nkey, 'date', r.date,
           'data', case when r.deleted_at is not null then '{}'::jsonb
                        when not l.share_notes then r.data - 'note' else r.data end,   -- H6: en TODO kind
           'updated_at', r.updated_at, 'deleted_at', r.deleted_at, 'server_updated_at', r.server_updated_at)
           order by r.server_updated_at), '[]'::jsonb), max(r.server_updated_at)
    into recs, cur
    from grasa.records r
    where r.user_id = p_client and r.server_updated_at > since
      and (r.kind in ('profile','entry')
           or (r.kind = 'food' and l.share_nutrition)
           or (r.kind = 'habit' and l.share_habits));              -- 'library' nunca
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'date', p.date, 'pose', p.pose, 'width', p.width,
           'height', p.height, 'storage_path', p.storage_path, 'created_at', p.created_at, 'updated_at', p.updated_at,
           'server_updated_at', p.server_updated_at) order by p.server_updated_at), '[]'::jsonb)
    into phs
    from grasa.photos p
    where l.share_photos and p.user_id = p_client and p.shared_with_coach and p.deleted_at is null
      and p.server_updated_at > since;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.server_updated_at), '[]'::jsonb) into cms
    from grasa.comments c where c.link_id = l.id and c.server_updated_at > since;
  return jsonb_build_object('records', recs, 'photos', phs, 'comments', cms,
                            'cursor', coalesce(cur, p_since), 'server_now', now());
end $$;

create or replace function grasa.add_comment(p_id uuid, p_client uuid, p_ref_date date, p_body text) returns grasa.comments
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); l grasa.coach_links; c grasa.comments;
begin
  perform grasa.require_coach_agreement();
  select * into l from grasa.coach_links where coach_id = uid and client_id = p_client and status = 'active';
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into grasa.comments (id, link_id, coach_id, client_id, ref_date, body)
  values (p_id, l.id, uid, p_client, p_ref_date, p_body)
  on conflict (id) do nothing returning * into c;
  if c.id is null then select * into c from grasa.comments where id = p_id and coach_id = uid; end if;
  if c.id is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return c;
end $$;

create or replace function grasa.coach_photo_opened(p_photo uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); owner uuid;
begin
  perform grasa.require_coach_agreement();
  select p.user_id into owner from grasa.photos p where p.id = p_photo;
  if owner is null or not grasa.coach_can_see_photo(owner, p_photo) then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into grasa.photo_views (photo_id, coach_id, client_id) values (p_photo, uid, owner);
end $$;

-- ============ E2: cliente ============
-- join_coach (cuerpo de r1_fix_seguridad D1 + la comprobación de consentimiento, antes de contar el intento).
create or replace function grasa.join_coach(p_code text, p_shares jsonb) returns grasa.coach_links
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); coach uuid; link grasa.coach_links;
begin
  if coalesce((p_shares ->> 'body')::boolean, false) is not true then
    raise exception 'invalid' using errcode = '22023', detail = 'compartir peso y medidas es obligatorio';
  end if;
  if coalesce(p_shares ->> 'text_hash', '') !~ '^[0-9a-f]{64}$' or coalesce(p_shares ->> 'version', '') = '' then
    raise exception 'invalid' using errcode = '22023', detail = 'p_shares necesita version y text_hash';
  end if;
  perform core.require_cloud_consent('grasa');
  if not grasa.count_attempt(uid) then raise exception 'rate_limited' using errcode = '54000'; end if;
  coach := grasa.valid_coach_for(p_code);
  if coach is null then return null; end if;
  perform 1 from grasa.coaches where user_id = coach for update;   -- serializa el conteo de usos
  if grasa.valid_coach_for(p_code) is null then return null; end if;
  if coach = uid then raise exception 'invalid' using errcode = '22023', detail = 'no puedes ser tu propio coach'; end if;
  update grasa.coach_links set status = 'ended', ended_at = now(), updated_at = now()
    where client_id = uid and status = 'active';
  insert into grasa.coach_links (coach_id, client_id, share_body, share_notes, share_nutrition, share_habits, share_photos)
  values (coach, uid, true, coalesce((p_shares ->> 'notes')::boolean, false),
          coalesce((p_shares ->> 'nutrition')::boolean, false), coalesce((p_shares ->> 'habits')::boolean, false),
          coalesce((p_shares ->> 'photos')::boolean, false))
  returning * into link;
  perform grasa.log_shares(uid, coach, p_shares, null);
  update grasa.coaches set invite_uses = invite_uses + 1 where user_id = coach;
  insert into core.app_access (user_id, app_id, role) values (uid, 'grasa', 'client') on conflict do nothing;
  return link;
end $$;

-- sync_push y sync_pull: SECURITY INVOKER (la RLS sigue mandando); solo se añade la comprobación del consentimiento.
create or replace function grasa.sync_push(p_records jsonb default '[]', p_photos jsonb default '[]') returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare uid uuid := grasa.require_uid(); r jsonb; got uuid; rejected_r jsonb := '[]'; rejected_p jsonb := '[]';
begin
  perform core.require_cloud_consent('grasa');
  if jsonb_typeof(coalesce(p_records, '[]')) <> 'array' or jsonb_typeof(coalesce(p_photos, '[]')) <> 'array' then
    raise exception 'invalid' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p_records, '[]')) + jsonb_array_length(coalesce(p_photos, '[]')) > 500 then
    raise exception 'invalid' using errcode = '22023', detail = 'máximo 500 elementos por llamada';
  end if;
  for r in select * from jsonb_array_elements(coalesce(p_records, '[]')) loop
    got := null;
    insert into grasa.records as t (id, user_id, kind, nkey, date, data, updated_at, deleted_at)
    values ((r ->> 'id')::uuid, uid, r ->> 'kind', r ->> 'nkey', (r ->> 'date')::date,
            coalesce(r -> 'data', '{}'::jsonb), (r ->> 'updated_at')::timestamptz, (r ->> 'deleted_at')::timestamptz)
    on conflict (user_id, kind, nkey) do update
      set data = excluded.data, date = excluded.date, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at
      where excluded.updated_at > t.updated_at
         or (excluded.updated_at = t.updated_at and excluded.data::text > t.data::text)
    returning t.id into got;
    if got is null then   -- ganó la fila del servidor: se devuelve para que el cliente la fusione
      rejected_r := rejected_r || (select to_jsonb(t) - 'user_id' from grasa.records t
                                   where t.user_id = uid and t.kind = r ->> 'kind' and t.nkey = r ->> 'nkey');
    end if;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(p_photos, '[]')) loop
    got := null;
    insert into grasa.photos as t (id, user_id, date, pose, width, height, storage_path, shared_with_coach,
                                   created_at, updated_at, deleted_at)
    values ((r ->> 'id')::uuid, uid, (r ->> 'date')::date, r ->> 'pose', (r ->> 'width')::int, (r ->> 'height')::int,
            r ->> 'storage_path', coalesce((r ->> 'shared_with_coach')::boolean, false),
            (r ->> 'created_at')::timestamptz, (r ->> 'updated_at')::timestamptz, (r ->> 'deleted_at')::timestamptz)
    on conflict (id) do update
      set date = excluded.date, pose = excluded.pose, width = excluded.width, height = excluded.height,
          shared_with_coach = excluded.shared_with_coach, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at
      where excluded.updated_at > t.updated_at
    returning t.id into got;
    if got is null then
      rejected_p := rejected_p || (select to_jsonb(t) - 'user_id' from grasa.photos t where t.id = (r ->> 'id')::uuid);
    end if;
  end loop;
  return jsonb_build_object('server_now', now(), 'rejected', jsonb_build_object('records', rejected_r, 'photos', rejected_p));
end $$;

create or replace function grasa.sync_pull(p_since timestamptz default '1970-01-01T00:00:00Z', p_limit int default 1000,
  p_overlap boolean default true)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare uid uuid := grasa.require_uid();
  since timestamptz := coalesce(p_since, '1970-01-01T00:00:00Z') - case when coalesce(p_overlap, true) then interval '30 seconds' else interval '0' end;
  lim int := least(greatest(coalesce(p_limit, 1000), 1), 5000);
  recs jsonb; phs jsonb; cms jsonb; nr int; np int; nc int; mr timestamptz; mp timestamptz; mc timestamptz;
  more boolean; cur timestamptz;
begin
  perform core.require_cloud_consent('grasa');
  select coalesce(jsonb_agg(to_jsonb(x) - 'user_id' order by x.server_updated_at), '[]'), count(*), max(x.server_updated_at)
    into recs, nr, mr
    from (select * from grasa.records r where r.user_id = uid and r.server_updated_at >= since
          order by r.server_updated_at limit lim) x;
  select coalesce(jsonb_agg(to_jsonb(x) - 'user_id' order by x.server_updated_at), '[]'), count(*), max(x.server_updated_at)
    into phs, np, mp
    from (select * from grasa.photos p where p.user_id = uid and p.server_updated_at >= since
          order by p.server_updated_at limit lim) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.server_updated_at), '[]'), count(*), max(x.server_updated_at)
    into cms, nc, mc
    from (select * from grasa.comments c where c.client_id = uid and c.server_updated_at >= since
          order by c.server_updated_at limit lim) x;
  more := nr = lim or np = lim or nc = lim;
  cur := case when more then least(case when nr = lim then mr end, case when np = lim then mp end, case when nc = lim then mc end)
              else greatest(mr, mp, mc) end;
  return jsonb_build_object('records', recs, 'photos', phs, 'comments', cms,
                            'cursor', coalesce(cur, p_since), 'has_more', more, 'server_now', now());
end $$;

-- ============ Permisos ============
-- create or replace conserva los permisos de las funciones que ya existían. Las nuevas nacen sin ellos (se cierran las
-- internas y se concede solo la comprobación del propio usuario).
revoke execute on function core.consent_is_granted(uuid, text, text), grasa.coach_has_agreement(uuid),
  grasa.require_coach_agreement() from public, anon, authenticated, service_role;
revoke execute on function core.require_cloud_consent(text) from public, anon, authenticated, service_role;
grant execute on function core.require_cloud_consent(text) to authenticated;

-- ======== 20261024120000_r1_pagos_coach.sql ========
-- R1 v1.6 · Sprint 11 («App para coaches», Etapa 1): cobros manuales y bloqueo por pago. Idempotente. UNA sola migración en vuelo.
-- El cliente le paga a su coach POR FUERA de la app; el coach lo marca. La plataforma no cobra nada.
--   P1  grasa.coach_links.paid_until (date, «pagado hasta») y paid_marked_at (cuándo lo marcó el coach). Solo el coach del vínculo
--       los cambia, con grasa.set_client_payment (SECURITY DEFINER). El cliente NO puede modificarlos (solo tiene SELECT).
--       Los vínculos que ya existían al aplicar esta migración reciben 30 días desde hoy (periodo de gracia, una sola vez).
--   P2  «Al día» = paid_until >= hoy en America/Bogota (Colombia no tiene horario de verano). Sin fecha o con fecha pasada = vencido.
--   P3  coach_clients() y my_link() devuelven paid_until, paid_marked_at, paid y days_left (para que el coach y el cliente lo vean).
--   P4  Cliente CON vínculo activo y vencido: sync_push y la subida de fotos fallan con 42501 'payment_required' (detail 'payment_required').
--       sync_pull, update_shares, leave_coach, borrar fotos y borrar la cuenta SIGUEN permitidos (derecho del titular: ver, descargar, borrar).
--       Cliente sin vínculo activo: nunca se bloquea.
-- Sin cambios en RLS ni en los permisos de tablas. Funciones nuevas: SECURITY DEFINER con search_path fijo; las internas, cerradas a la API.

-- ============ P1: columnas (y gracia única para los vínculos existentes) ============
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'grasa' and table_name = 'coach_links' and column_name = 'paid_until') then
    alter table grasa.coach_links add column paid_until date null, add column paid_marked_at timestamptz null;
    update grasa.coach_links set paid_until = (now() at time zone 'America/Bogota')::date + 30, paid_marked_at = now()
      where status = 'active';
  end if;
end $$;

-- ============ Auxiliares ============
-- Hoy en Bogotá (la fecha de corte de los pagos). INTERNA.
create or replace function grasa.today_bogota() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Bogota')::date;
$$;

-- ¿Ese cliente tiene un vínculo activo vencido (sin fecha o paid_until < hoy)? INTERNA: con un uuid libre permitiría sondear el pago de otros.
create or replace function grasa.client_payment_blocked(p_client uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from grasa.coach_links l
                 where l.client_id = p_client and l.status = 'active'
                   and (l.paid_until is null or l.paid_until < grasa.today_bogota()));
$$;

-- Lo mismo para la persona en sesión, sin parámetros (lo usa la política de Storage; no se puede sondear a otros).
create or replace function grasa.payment_blocked_me() returns boolean
language sql stable security definer set search_path = '' as $$
  select grasa.client_payment_blocked(auth.uid());
$$;

-- Exige estar al día (o no tener coach). La llaman sync_push (SECURITY INVOKER) y las funciones de subida.
create or replace function grasa.require_payment() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'auth' using errcode = '28000'; end if;
  if grasa.client_payment_blocked(auth.uid()) then
    raise exception 'payment_required' using errcode = '42501', detail = 'payment_required';
  end if;
end $$;

-- ============ P1: el coach marca el pago ============
-- p_paid_until: «pagado hasta» (null = sin pago registrado). Fecha razonable: de hoy − 400 a hoy + 400 días.
-- Solo el coach ACTIVO con el acuerdo vigente de ese vínculo ACTIVO. Devuelve el estado resultante.
create or replace function grasa.set_client_payment(p_client uuid, p_paid_until date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); l grasa.coach_links; today date := grasa.today_bogota();
begin
  perform grasa.require_coach_agreement();
  if p_client is null then raise exception 'invalid' using errcode = '22023'; end if;
  select x.* into l from grasa.coach_links x
    join grasa.coaches c on c.user_id = x.coach_id and c.active
    where x.coach_id = uid and x.client_id = p_client and x.status = 'active'
    for update of x;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_paid_until is not null and (p_paid_until < today - 400 or p_paid_until > today + 400) then
    raise exception 'invalid' using errcode = '22023', detail = 'la fecha de pago está fuera de un rango razonable';
  end if;
  update grasa.coach_links set paid_until = p_paid_until, paid_marked_at = now(), updated_at = now() where id = l.id;
  return jsonb_build_object('client_id', p_client, 'paid_until', p_paid_until, 'paid_marked_at', now(),
    'paid', p_paid_until is not null and p_paid_until >= today,
    'days_left', case when p_paid_until is null then null else p_paid_until - today end);
end $$;

-- ============ P3: coach_clients y my_link con el estado del pago ============
-- Cambian las columnas de salida: hay que borrar y volver a crear (y volver a conceder el permiso).
drop function if exists grasa.coach_clients();
create function grasa.coach_clients()
returns table (client_id uuid, display_name text, link_id uuid, since timestamptz, shares jsonb,
               last_activity timestamptz, over_free_limit boolean,
               paid_until date, paid_marked_at timestamptz, paid boolean, days_left int)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform grasa.require_coach_agreement();
  return query
  select l.client_id, p.display_name, l.id, l.created_at,
         jsonb_build_object('body', l.share_body, 'notes', l.share_notes, 'nutrition', l.share_nutrition,
                            'habits', l.share_habits, 'photos', l.share_photos),
         (select max(r.server_updated_at) from grasa.records r
          where r.user_id = l.client_id
            and core.consent_is_granted(l.client_id, 'grasa', 'sensitive_health')
            and core.consent_is_granted(l.client_id, 'grasa', 'cloud_transfer')
            and (r.kind in ('profile','entry') or (r.kind = 'food' and l.share_nutrition) or (r.kind = 'habit' and l.share_habits))),
         row_number() over (order by l.created_at, l.id) > c.free_clients,
         l.paid_until, l.paid_marked_at,
         (l.paid_until is not null and l.paid_until >= grasa.today_bogota()),
         case when l.paid_until is null then null else l.paid_until - grasa.today_bogota() end
  from grasa.coach_links l
  join grasa.coaches c on c.user_id = l.coach_id
  left join core.profiles p on p.id = l.client_id
  where l.coach_id = auth.uid() and l.status = 'active'
  order by l.created_at;
end $$;
revoke execute on function grasa.coach_clients() from public, anon;
grant execute on function grasa.coach_clients() to authenticated;

drop function if exists grasa.my_link();
create function grasa.my_link()
returns table (id uuid, coach_id uuid, business_name text, share_body boolean, share_notes boolean,
               share_nutrition boolean, share_habits boolean, share_photos boolean, since timestamptz,
               paid_until date, paid_marked_at timestamptz, paid boolean, days_left int)
language sql stable security definer set search_path = '' as $$
  select l.id, l.coach_id, c.business_name, l.share_body, l.share_notes, l.share_nutrition, l.share_habits,
         l.share_photos, l.created_at, l.paid_until, l.paid_marked_at,
         (l.paid_until is not null and l.paid_until >= grasa.today_bogota()),
         case when l.paid_until is null then null else l.paid_until - grasa.today_bogota() end
  from grasa.coach_links l
  join grasa.coaches c on c.user_id = l.coach_id
  where l.client_id = auth.uid() and l.status = 'active'
  limit 1;
$$;
revoke execute on function grasa.my_link() from public, anon;
grant execute on function grasa.my_link() to authenticated;

-- ============ P4: sync_push exige estar al día ============
-- Mismo cuerpo que en r1_consentimientos_servidor; solo se añade require_payment() (después de los consentimientos).
create or replace function grasa.sync_push(p_records jsonb default '[]', p_photos jsonb default '[]') returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare uid uuid := grasa.require_uid(); r jsonb; got uuid; rejected_r jsonb := '[]'; rejected_p jsonb := '[]';
begin
  perform core.require_cloud_consent('grasa');
  perform grasa.require_payment();
  if jsonb_typeof(coalesce(p_records, '[]')) <> 'array' or jsonb_typeof(coalesce(p_photos, '[]')) <> 'array' then
    raise exception 'invalid' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p_records, '[]')) + jsonb_array_length(coalesce(p_photos, '[]')) > 500 then
    raise exception 'invalid' using errcode = '22023', detail = 'máximo 500 elementos por llamada';
  end if;
  for r in select * from jsonb_array_elements(coalesce(p_records, '[]')) loop
    got := null;
    insert into grasa.records as t (id, user_id, kind, nkey, date, data, updated_at, deleted_at)
    values ((r ->> 'id')::uuid, uid, r ->> 'kind', r ->> 'nkey', (r ->> 'date')::date,
            coalesce(r -> 'data', '{}'::jsonb), (r ->> 'updated_at')::timestamptz, (r ->> 'deleted_at')::timestamptz)
    on conflict (user_id, kind, nkey) do update
      set data = excluded.data, date = excluded.date, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at
      where excluded.updated_at > t.updated_at
         or (excluded.updated_at = t.updated_at and excluded.data::text > t.data::text)
    returning t.id into got;
    if got is null then   -- ganó la fila del servidor: se devuelve para que el cliente la fusione
      rejected_r := rejected_r || (select to_jsonb(t) - 'user_id' from grasa.records t
                                   where t.user_id = uid and t.kind = r ->> 'kind' and t.nkey = r ->> 'nkey');
    end if;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(p_photos, '[]')) loop
    got := null;
    insert into grasa.photos as t (id, user_id, date, pose, width, height, storage_path, shared_with_coach,
                                   created_at, updated_at, deleted_at)
    values ((r ->> 'id')::uuid, uid, (r ->> 'date')::date, r ->> 'pose', (r ->> 'width')::int, (r ->> 'height')::int,
            r ->> 'storage_path', coalesce((r ->> 'shared_with_coach')::boolean, false),
            (r ->> 'created_at')::timestamptz, (r ->> 'updated_at')::timestamptz, (r ->> 'deleted_at')::timestamptz)
    on conflict (id) do update
      set date = excluded.date, pose = excluded.pose, width = excluded.width, height = excluded.height,
          shared_with_coach = excluded.shared_with_coach, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at
      where excluded.updated_at > t.updated_at
    returning t.id into got;
    if got is null then
      rejected_p := rejected_p || (select to_jsonb(t) - 'user_id' from grasa.photos t where t.id = (r ->> 'id')::uuid);
    end if;
  end loop;
  return jsonb_build_object('server_now', now(), 'rejected', jsonb_build_object('records', rejected_r, 'photos', rejected_p));
end $$;

-- ============ P4: la subida de fotos (Storage) también exige estar al día ============
-- Solo INSERT y UPDATE (subir o reemplazar). Leer y BORRAR siguen permitidos con el acceso en pausa.
drop policy if exists grasa_photos_owner_insert on storage.objects;
create policy grasa_photos_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'grasa-photos' and (storage.foldername(name))[1] = auth.uid()::text
              and not grasa.payment_blocked_me());
drop policy if exists grasa_photos_owner_update on storage.objects;
create policy grasa_photos_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'grasa-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'grasa-photos' and (storage.foldername(name))[1] = auth.uid()::text
              and not grasa.payment_blocked_me());

-- ============ Permisos ============
-- Las funciones nuevas nacen sin permisos: se cierran las internas y se conceden solo las que usa el propio usuario.
revoke execute on function grasa.today_bogota(), grasa.client_payment_blocked(uuid), grasa.payment_blocked_me(),
  grasa.require_payment(), grasa.set_client_payment(uuid, date) from public, anon, authenticated, service_role;
-- Solo informan del estado de la persona en sesión (sin parámetros de usuario).
grant execute on function grasa.payment_blocked_me(), grasa.require_payment() to authenticated;
-- El coach marca el pago (la propia función exige ser coach activo con acuerdo y vínculo activo con ese cliente).
grant execute on function grasa.set_client_payment(uuid, date) to authenticated;

-- ======== 20261025120000_r1_rutinas.sql ========
-- R1 v1.7 · «App para coaches», Etapa 2: rutinas de ejercicios y biblioteca de GIFs del coach. Idempotente. UNA sola migración en vuelo.
--   U1  grasa.exercise_gifs: biblioteca del coach (el GIF se sube UNA vez y se reutiliza en varios ejercicios y clientes). Máx. 3 MB,
--       solo image/gif e image/webp, máx. 200 por coach. El registro valida tipo, tamaño y la FIRMA de bytes (los 12 primeros).
--   U2  Bucket PRIVADO 'ejercicios' (ruta '{coach_id}/{gif_id}.gif'; el límite de 3 MB y los tipos permitidos también los impone Storage).
--       Lectura solo con URL firmada. El coach sube/lee/borra SOLO en su carpeta y solo un GIF que registró antes; el cliente lee un GIF
--       solo si es de SU coach con vínculo activo. Los GIFs son contenido del coach, no datos de salud del cliente: no dependen de A3/A4
--       ni del pago (el cliente en pausa sigue pudiendo ver su rutina, igual que ve sus datos).
--   U3  grasa.routines: UNA rutina por (coach, cliente): título + días + ejercicios en jsonb, validado por grasa.routine_content_ok
--       (máx. 7 días, 12 ejercicios por día; nombre, series × repeticiones, nota y GIF opcionales). Solo se escribe y se lee con funciones
--       SECURITY DEFINER: el coach exige acuerdo vigente (A7) y vínculo activo; el cliente solo lee la de su coach con vínculo activo.
--   U4  core.delete_my_account también se niega si quedan GIFs del coach en Storage (la app los borra antes con la API de Storage).
-- RLS activada en las dos tablas SIN políticas ni permisos directos: nadie las toca por la API de tablas, solo por las funciones.

-- ============ U1/U3: tablas ============
create table if not exists grasa.exercise_gifs (
  id         uuid primary key,
  coach_id   uuid not null references auth.users(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 60),
  mime       text not null check (mime in ('image/gif', 'image/webp')),
  size_bytes int  not null check (size_bytes between 1 and 3145728),
  created_at timestamptz not null default now()
);
create index if not exists exercise_gifs_coach_idx on grasa.exercise_gifs (coach_id, created_at);

create table if not exists grasa.routines (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references auth.users(id) on delete cascade,
  client_id  uuid not null references auth.users(id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 60),
  content    jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (coach_id, client_id)
);
create index if not exists routines_client_idx on grasa.routines (client_id);

alter table grasa.exercise_gifs enable row level security;
alter table grasa.routines enable row level security;
revoke all on grasa.exercise_gifs, grasa.routines from public, anon, authenticated, service_role;

-- ============ Validaciones puras (INTERNAS) ============
-- ¿Los primeros 12 bytes (en hexadecimal, minúsculas) son los de un GIF (GIF87a / GIF89a) o un WebP (RIFF....WEBP)?
create or replace function grasa.gif_head_ok(p_head text, p_mime text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(case
    when p_head is null or p_head !~ '^[0-9a-f]{24}$' then false
    when p_mime = 'image/gif' then substr(p_head, 1, 12) in ('474946383761', '474946383961')
    when p_mime = 'image/webp' then substr(p_head, 1, 8) = '52494646' and substr(p_head, 17, 8) = '57454250'
    else false end, false);
$$;

-- Forma de la rutina: {"days":[{"title":"Día 1 – Pecho","exercises":[{"name":"Press","sets":"4 × 12","note":"…","gif":"<uuid>"}]}]}.
-- 1 a 7 días; 0 a 12 ejercicios por día (un día puede ser de descanso). Claves desconocidas = inválido.
create or replace function grasa.routine_content_ok(p jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare d jsonb; e jsonb;
begin
  if p is null or jsonb_typeof(p) is distinct from 'object' or octet_length(p::text) > 30000 then return false; end if;
  if exists (select 1 from jsonb_object_keys(p) k where k <> 'days') then return false; end if;
  if jsonb_typeof(p -> 'days') is distinct from 'array' or jsonb_array_length(p -> 'days') not between 1 and 7 then return false; end if;
  for d in select x from jsonb_array_elements(p -> 'days') x loop
    if jsonb_typeof(d) is distinct from 'object' or exists (select 1 from jsonb_object_keys(d) k where k not in ('title', 'exercises')) then return false; end if;
    if jsonb_typeof(d -> 'title') is distinct from 'string' or char_length(btrim(d ->> 'title')) not between 1 and 60 then return false; end if;
    if jsonb_typeof(d -> 'exercises') is distinct from 'array' or jsonb_array_length(d -> 'exercises') > 12 then return false; end if;
    for e in select x from jsonb_array_elements(d -> 'exercises') x loop
      if jsonb_typeof(e) is distinct from 'object' or exists (select 1 from jsonb_object_keys(e) k where k not in ('name', 'sets', 'note', 'gif')) then return false; end if;
      if jsonb_typeof(e -> 'name') is distinct from 'string' or char_length(btrim(e ->> 'name')) not between 1 and 60 then return false; end if;
      if jsonb_typeof(e -> 'sets') is distinct from 'string' or char_length(btrim(e ->> 'sets')) not between 1 and 30 then return false; end if;
      if e ? 'note' and (jsonb_typeof(e -> 'note') is distinct from 'string' or char_length(e ->> 'note') > 200) then return false; end if;
      if e ? 'gif' and (jsonb_typeof(e -> 'gif') is distinct from 'string' or (e ->> 'gif') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then return false; end if;
    end loop;
  end loop;
  return true;
end $$;

-- ============ U1: biblioteca de GIFs del coach ============
-- Registra un GIF ANTES de subir el archivo (la política de Storage solo deja subir un id registrado). Reintentar con el mismo id actualiza.
-- p_head: los 12 primeros bytes del archivo en hexadecimal (el cliente los lee). Storage no mira los bytes: es la defensa extra de la BD.
create or replace function grasa.register_gif(p_id uuid, p_name text, p_mime text, p_size int, p_head text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); g grasa.exercise_gifs; nm text := btrim(coalesce(p_name, ''));
begin
  perform grasa.require_coach_agreement();
  if not exists (select 1 from grasa.coaches c where c.user_id = uid and c.active) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_id is null or char_length(nm) not between 1 and 60 then raise exception 'invalid' using errcode = '22023', detail = 'el nombre debe tener entre 1 y 60 caracteres'; end if;
  if p_mime is null or p_mime not in ('image/gif', 'image/webp') then raise exception 'invalid' using errcode = '22023', detail = 'solo GIF o WebP'; end if;
  if p_size is null or p_size not between 1 and 3145728 then raise exception 'invalid' using errcode = '22023', detail = 'el archivo debe pesar como máximo 3 MB'; end if;
  if not grasa.gif_head_ok(lower(p_head), p_mime) then raise exception 'invalid' using errcode = '22023', detail = 'el archivo no parece un GIF o un WebP'; end if;
  select x.* into g from grasa.exercise_gifs x where x.id = p_id;
  if found and g.coach_id <> uid then raise exception 'forbidden' using errcode = '42501'; end if;
  if not found and (select count(*) from grasa.exercise_gifs x where x.coach_id = uid) >= 200 then
    raise exception 'invalid' using errcode = '22023', detail = 'la biblioteca está llena (máximo 200 animaciones)';
  end if;
  insert into grasa.exercise_gifs as t (id, coach_id, name, mime, size_bytes) values (p_id, uid, nm, p_mime, p_size)
    on conflict (id) do update set name = excluded.name, mime = excluded.mime, size_bytes = excluded.size_bytes
    returning * into g;
  return jsonb_build_object('id', g.id, 'name', g.name, 'mime', g.mime, 'size_bytes', g.size_bytes, 'created_at', g.created_at, 'uses', 0);
end $$;

-- La biblioteca del coach, con cuántas rutinas suyas usan cada animación.
create or replace function grasa.my_gifs()
returns table (id uuid, name text, mime text, size_bytes int, created_at timestamptz, uses int)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  perform grasa.require_coach_agreement();
  return query
  select g.id, g.name, g.mime, g.size_bytes, g.created_at,
         (select count(*)::int from grasa.routines r
          where r.coach_id = uid and jsonb_path_exists(r.content, '$.days[*].exercises[*] ? (@.gif == $id)', jsonb_build_object('id', g.id::text)))
  from grasa.exercise_gifs g where g.coach_id = uid order by g.created_at desc, g.id;
end $$;

-- Borra el registro (el archivo lo borra la app con la API de Storage). Se niega si alguna rutina lo usa. Reduce acceso: no exige acuerdo.
create or replace function grasa.delete_gif(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  if not exists (select 1 from grasa.exercise_gifs g where g.id = p_id and g.coach_id = uid) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if exists (select 1 from grasa.routines r
             where r.coach_id = uid and jsonb_path_exists(r.content, '$.days[*].exercises[*] ? (@.gif == $id)', jsonb_build_object('id', p_id::text))) then
    raise exception 'invalid' using errcode = '22023', detail = 'gif_in_use';
  end if;
  delete from grasa.exercise_gifs where id = p_id and coach_id = uid;
end $$;

-- ============ U2: Storage ============
-- ¿Puedo SUBIR este archivo? Solo un GIF que YO registré, con el acuerdo vigente y coach activo. (Sin parámetros de usuario: no se sondea a otros.)
create or replace function grasa.gif_upload_allowed(p_gif uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_gif is not null and auth.uid() is not null
     and grasa.coach_has_agreement(auth.uid())
     and exists (select 1 from grasa.coaches c where c.user_id = auth.uid() and c.active)
     and exists (select 1 from grasa.exercise_gifs g where g.id = p_gif and g.coach_id = auth.uid());
$$;

-- ¿Puedo LEER el GIF de ese coach? Solo si soy su cliente con vínculo activo (y el coach sigue activo) y el GIF existe en su biblioteca.
create or replace function grasa.client_can_read_gif(p_coach uuid, p_gif uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_coach is not null and p_gif is not null and auth.uid() is not null and exists (
    select 1 from grasa.coach_links l
    join grasa.coaches c on c.user_id = l.coach_id and c.active
    join grasa.exercise_gifs g on g.coach_id = l.coach_id and g.id = p_gif
    where l.client_id = auth.uid() and l.coach_id = p_coach and l.status = 'active');
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ejercicios', 'ejercicios', false, 3145728, array['image/gif', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Coach: su carpeta. Subir y reemplazar exigen el id registrado (y el acuerdo); leer y borrar, no.
drop policy if exists ejercicios_coach_select on storage.objects;
create policy ejercicios_coach_select on storage.objects for select to authenticated
  using (bucket_id = 'ejercicios' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists ejercicios_coach_insert on storage.objects;
create policy ejercicios_coach_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'ejercicios' and (storage.foldername(name))[1] = auth.uid()::text
              and array_length(storage.foldername(name), 1) = 1 and storage.filename(name) ~* '^[0-9a-f-]{36}\.gif$'
              and grasa.gif_upload_allowed(grasa.try_uuid(split_part(storage.filename(name), '.', 1))));
drop policy if exists ejercicios_coach_update on storage.objects;
create policy ejercicios_coach_update on storage.objects for update to authenticated
  using (bucket_id = 'ejercicios' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'ejercicios' and (storage.foldername(name))[1] = auth.uid()::text
              and array_length(storage.foldername(name), 1) = 1 and storage.filename(name) ~* '^[0-9a-f-]{36}\.gif$'
              and grasa.gif_upload_allowed(grasa.try_uuid(split_part(storage.filename(name), '.', 1))));
drop policy if exists ejercicios_coach_delete on storage.objects;
create policy ejercicios_coach_delete on storage.objects for delete to authenticated
  using (bucket_id = 'ejercicios' and (storage.foldername(name))[1] = auth.uid()::text);
-- Cliente: SOLO lectura, de los GIFs de su coach (try_uuid evita errores con rutas manipuladas).
drop policy if exists ejercicios_client_select on storage.objects;
create policy ejercicios_client_select on storage.objects for select to authenticated
  using (bucket_id = 'ejercicios'
         and grasa.client_can_read_gif(grasa.try_uuid((storage.foldername(name))[1]), grasa.try_uuid(split_part(storage.filename(name), '.', 1))));

-- ============ U3: rutinas ============
create or replace function grasa.routine_out(r grasa.routines) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('id', r.id, 'coach_id', r.coach_id, 'client_id', r.client_id, 'title', r.title, 'content', r.content,
                            'created_at', r.created_at, 'updated_at', r.updated_at);
$$;

-- Crea o reemplaza la rutina de ese cliente. Solo el coach ACTIVO con acuerdo vigente y vínculo ACTIVO con ese cliente.
create or replace function grasa.save_routine(p_client uuid, p_title text, p_content jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); r grasa.routines; t text := btrim(coalesce(p_title, ''));
begin
  perform grasa.require_coach_agreement();
  if p_client is null or not exists (select 1 from grasa.coach_links l join grasa.coaches c on c.user_id = l.coach_id and c.active
                                     where l.coach_id = uid and l.client_id = p_client and l.status = 'active') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(t) not between 1 and 60 then raise exception 'invalid' using errcode = '22023', detail = 'el título debe tener entre 1 y 60 caracteres'; end if;
  if not grasa.routine_content_ok(p_content) then raise exception 'invalid' using errcode = '22023', detail = 'la rutina no es válida (máximo 7 días y 12 ejercicios por día)'; end if;
  if exists (select 1 from jsonb_path_query(p_content, '$.days[*].exercises[*].gif') g(v)
             where not exists (select 1 from grasa.exercise_gifs x where x.coach_id = uid and x.id::text = lower(g.v #>> '{}'))) then
    raise exception 'invalid' using errcode = '22023', detail = 'gif_not_found';
  end if;
  insert into grasa.routines as t2 (coach_id, client_id, title, content) values (uid, p_client, t, p_content)
    on conflict (coach_id, client_id) do update set title = excluded.title, content = excluded.content, updated_at = now()
    returning * into r;
  return grasa.routine_out(r);
end $$;

-- La rutina que ese coach armó para ese cliente (null si no hay). Solo el coach con acuerdo y vínculo activo.
create or replace function grasa.get_routine(p_client uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); r grasa.routines;
begin
  perform grasa.require_coach_agreement();
  if p_client is null or not exists (select 1 from grasa.coach_links l join grasa.coaches c on c.user_id = l.coach_id and c.active
                                     where l.coach_id = uid and l.client_id = p_client and l.status = 'active') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select x.* into r from grasa.routines x where x.coach_id = uid and x.client_id = p_client;
  if not found then return null; end if;
  return grasa.routine_out(r);
end $$;

-- Borra la rutina de ese cliente (solo la propia del coach). Reduce acceso: no exige acuerdo ni vínculo activo.
create or replace function grasa.delete_routine(p_client uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  delete from grasa.routines where coach_id = uid and client_id = p_client;
end $$;

-- La rutina de la persona en sesión: solo la de su coach con vínculo activo (y coach activo). Se ve aunque su acceso esté en pausa.
create or replace function grasa.my_routine() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); r grasa.routines;
begin
  select x.* into r from grasa.routines x
    join grasa.coach_links l on l.coach_id = x.coach_id and l.client_id = x.client_id and l.status = 'active'
    join grasa.coaches c on c.user_id = x.coach_id and c.active
    where x.client_id = uid;
  if not found then return null; end if;
  return grasa.routine_out(r);
end $$;

-- ============ U4: la baja del coach tampoco deja GIFs en Storage ============
-- Mismo cuerpo que en r1_consentimientos_s6 (C4); solo se añade la comprobación del bucket 'ejercicios'.
create or replace function core.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_salt text;
begin
  if v_uid is null then raise exception 'auth' using errcode = '28000'; end if;
  if exists (select 1 from storage.objects o
             where o.bucket_id in ('grasa-photos', 'ejercicios') and (storage.foldername(o.name))[1] = v_uid::text) then
    raise exception 'invalid' using errcode = '22023', detail = 'borra primero tus fotos y archivos de Storage';
  end if;
  select s.salt into v_salt from core.archive_secret s where s.singleton;
  -- Misma transacción que el borrado: o se archiva y se borra, o no pasa nada.
  insert into core.consent_archive (user_pseudo_id, coach_pseudo_id, app_id, kind, action, version, text_hash, client_at, event_at)
  select encode(sha256(convert_to(v_salt || ':' || e.user_id::text, 'UTF8')), 'hex'),
         case when e.coach_id is null then null else encode(sha256(convert_to(v_salt || ':' || e.coach_id::text, 'UTF8')), 'hex') end,
         e.app_id, e.kind, case when e.granted then 'grant' else 'revoke' end, e.version, e.text_hash, e.client_at, e.created_at
  from core.consent_events e where e.user_id = v_uid
  order by e.created_at, e.id;
  delete from auth.users where id = v_uid;
end $$;
revoke execute on function core.delete_my_account() from public, anon;
grant execute on function core.delete_my_account() to authenticated;

-- ============ Permisos ============
-- Las funciones nuevas nacen sin permisos: se cierran todas y se conceden solo las que usa la persona en sesión (cada una comprueba quién es).
revoke execute on function grasa.gif_head_ok(text, text), grasa.routine_content_ok(jsonb), grasa.routine_out(grasa.routines),
  grasa.register_gif(uuid, text, text, int, text), grasa.my_gifs(), grasa.delete_gif(uuid),
  grasa.gif_upload_allowed(uuid), grasa.client_can_read_gif(uuid, uuid),
  grasa.save_routine(uuid, text, jsonb), grasa.get_routine(uuid), grasa.delete_routine(uuid), grasa.my_routine()
  from public, anon, authenticated, service_role;
grant execute on function grasa.register_gif(uuid, text, text, int, text), grasa.my_gifs(), grasa.delete_gif(uuid),
  grasa.gif_upload_allowed(uuid), grasa.client_can_read_gif(uuid, uuid),
  grasa.save_routine(uuid, text, jsonb), grasa.get_routine(uuid), grasa.delete_routine(uuid), grasa.my_routine()
  to authenticated;

-- ======== 20261026120000_r1_rutinas_biblioteca.sql ========
-- R1 v1.8 · «App para coaches», Etapa 2b: biblioteca de rutinas del coach, asignación (copias), mostrar/ocultar y «Rutina de hoy». Aditiva e idempotente.
--   V1  grasa.routine_templates: «Mis rutinas», plantillas reutilizables del coach (no pertenecen a ningún cliente). Máx. 50 por coach.
--   V2  grasa.routines (la tabla de v1.7) pasa a ser «rutinas ASIGNADAS»: se quita el único (coach, cliente) para que un asesorado tenga VARIAS
--       (máx. 20 por coach+cliente) y se añade `visible` (por defecto true). Las filas que ya existían quedan como asignadas VISIBLES: no se pierde nada.
--       Asignar una plantilla CREA UNA COPIA independiente (título y contenido copiados): editar la plantilla después no cambia las copias.
--   V3  grasa.daily_routines: la «Rutina de hoy» del coach (una por coach): copia del contenido de una plantilla + el día 'AAAA-MM-DD' que manda el
--       coach desde su dispositivo. El cliente la pide con my_daily(su fecha de hoy) y solo la recibe si COINCIDE con el día publicado.
--   V4  Borrar un GIF en uso se niega si lo usa una plantilla, una rutina asignada o la del día (my_gifs cuenta las tres).
--   V5  Compatibilidad con la app vieja (el SQL se aplica ANTES que la app): save_routine / get_routine / delete_routine / my_routine siguen
--       existiendo y actúan sobre la PRIMERA rutina (la más antigua) del cliente; my_routine devuelve la primera VISIBLE.
-- RLS activada en las dos tablas nuevas SIN políticas ni permisos directos: solo se tocan por funciones SECURITY DEFINER (coach: acuerdo A7 vigente
-- y, para tocar a un cliente, vínculo ACTIVO con él; cliente: solo lo suyo, solo lo visible, solo con vínculo activo con coach activo).
-- core.delete_my_account no cambia: las tres tablas cuelgan de auth.users con on delete cascade (cliente → sus rutinas; coach → plantillas, rutinas y el día).

-- ============ V1/V3: tablas nuevas ============
create table if not exists grasa.routine_templates (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references auth.users(id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 60),
  content    jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists routine_templates_coach_idx on grasa.routine_templates (coach_id, created_at);

create table if not exists grasa.daily_routines (
  coach_id     uuid primary key references auth.users(id) on delete cascade,
  template_id  uuid references grasa.routine_templates(id) on delete set null,
  title        text not null check (char_length(title) between 1 and 60),
  content      jsonb not null,
  day          date not null,
  published_at timestamptz not null default now()
);

alter table grasa.routine_templates enable row level security;
alter table grasa.daily_routines enable row level security;
revoke all on grasa.routine_templates, grasa.daily_routines from public, anon, authenticated, service_role;

-- ============ V2: las rutinas existentes pasan a ser «asignadas» ============
alter table grasa.routines add column if not exists visible boolean not null default true;
-- Fuera el único (coach, cliente) de v1.7 (cualquier restricción UNIQUE de esa tabla; la clave primaria no se toca).
do $$ declare c text;
begin
  for c in select con.conname from pg_constraint con where con.conrelid = 'grasa.routines'::regclass and con.contype = 'u' loop
    execute format('alter table grasa.routines drop constraint %I', c);
  end loop;
end $$;
create index if not exists routines_coach_client_idx on grasa.routines (coach_id, client_id, created_at);

-- ============ Salidas y validaciones (INTERNAS) ============
create or replace function grasa.routine_out(r grasa.routines) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('id', r.id, 'coach_id', r.coach_id, 'client_id', r.client_id, 'title', r.title, 'content', r.content,
                            'visible', r.visible, 'created_at', r.created_at, 'updated_at', r.updated_at);
$$;
create or replace function grasa.template_out(t grasa.routine_templates) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('id', t.id, 'coach_id', t.coach_id, 'title', t.title, 'content', t.content, 'created_at', t.created_at, 'updated_at', t.updated_at);
$$;
create or replace function grasa.daily_out(d grasa.daily_routines) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('coach_id', d.coach_id, 'template_id', d.template_id, 'title', d.title, 'content', d.content, 'day', d.day, 'published_at', d.published_at);
$$;

-- Título y contenido válidos, y todos los GIF citados son del coach. Lanza invalid (con detail) si no.
create or replace function grasa.check_routine_input(p_coach uuid, p_title text, p_content jsonb) returns text
language plpgsql stable security definer set search_path = '' as $$
declare t text := btrim(coalesce(p_title, ''));
begin
  if char_length(t) not between 1 and 60 then raise exception 'invalid' using errcode = '22023', detail = 'el título debe tener entre 1 y 60 caracteres'; end if;
  if not grasa.routine_content_ok(p_content) then raise exception 'invalid' using errcode = '22023', detail = 'la rutina no es válida (máximo 7 días y 12 ejercicios por día)'; end if;
  if exists (select 1 from jsonb_path_query(p_content, '$.days[*].exercises[*].gif') g(v)
             where not exists (select 1 from grasa.exercise_gifs x where x.coach_id = p_coach and x.id::text = lower(g.v #>> '{}'))) then
    raise exception 'invalid' using errcode = '22023', detail = 'gif_not_found';
  end if;
  return t;
end $$;

-- ¿Soy coach ACTIVO con acuerdo vigente y con vínculo ACTIVO con ese cliente? Si no, forbidden.
create or replace function grasa.require_coach_of(p_client uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  perform grasa.require_coach_agreement();
  if p_client is null or not exists (select 1 from grasa.coach_links l join grasa.coaches c on c.user_id = l.coach_id and c.active
                                     where l.coach_id = uid and l.client_id = p_client and l.status = 'active') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return uid;
end $$;

-- ¿Soy coach activo con acuerdo vigente? Devuelve mi id.
create or replace function grasa.require_active_coach() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  perform grasa.require_coach_agreement();
  if not exists (select 1 from grasa.coaches c where c.user_id = uid and c.active) then raise exception 'forbidden' using errcode = '42501'; end if;
  return uid;
end $$;

-- En cuántas rutinas (plantillas + asignadas + la del día) de ese coach se usa un GIF.
create or replace function grasa.gif_uses(p_coach uuid, p_gif uuid) returns int
language sql stable security definer set search_path = '' as $$
  select ((select count(*) from grasa.routine_templates t where t.coach_id = p_coach
             and jsonb_path_exists(t.content, '$.days[*].exercises[*] ? (@.gif == $id)', jsonb_build_object('id', p_gif::text)))
        + (select count(*) from grasa.routines r where r.coach_id = p_coach
             and jsonb_path_exists(r.content, '$.days[*].exercises[*] ? (@.gif == $id)', jsonb_build_object('id', p_gif::text)))
        + (select count(*) from grasa.daily_routines d where d.coach_id = p_coach
             and jsonb_path_exists(d.content, '$.days[*].exercises[*] ? (@.gif == $id)', jsonb_build_object('id', p_gif::text))))::int;
$$;

-- ============ V4: biblioteca de GIFs (misma firma; ahora cuenta plantillas, asignadas y la del día) ============
create or replace function grasa.my_gifs()
returns table (id uuid, name text, mime text, size_bytes int, created_at timestamptz, uses int)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  perform grasa.require_coach_agreement();
  return query
  select g.id, g.name, g.mime, g.size_bytes, g.created_at, grasa.gif_uses(uid, g.id)
  from grasa.exercise_gifs g where g.coach_id = uid order by g.created_at desc, g.id;
end $$;

create or replace function grasa.delete_gif(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  if not exists (select 1 from grasa.exercise_gifs g where g.id = p_id and g.coach_id = uid) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if grasa.gif_uses(uid, p_id) > 0 then raise exception 'invalid' using errcode = '22023', detail = 'gif_in_use'; end if;
  delete from grasa.exercise_gifs where id = p_id and coach_id = uid;
end $$;

-- ============ V1: «Mis rutinas» (plantillas del coach) ============
-- p_id null = crear (máx. 50 por coach); con id = reemplazar esa plantilla (solo si es mía).
create or replace function grasa.save_template(p_id uuid, p_title text, p_content jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_active_coach(); t grasa.routine_templates; ti text;
begin
  ti := grasa.check_routine_input(uid, p_title, p_content);
  if p_id is null then
    perform pg_advisory_xact_lock(hashtextextended('rtpl:' || uid::text, 0));
    if (select count(*) from grasa.routine_templates x where x.coach_id = uid) >= 50 then
      raise exception 'invalid' using errcode = '22023', detail = 'template_limit';
    end if;
    insert into grasa.routine_templates (coach_id, title, content) values (uid, ti, p_content) returning * into t;
  else
    update grasa.routine_templates x set title = ti, content = p_content, updated_at = now() where x.id = p_id and x.coach_id = uid returning * into t;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;
  return grasa.template_out(t);
end $$;

create or replace function grasa.list_templates() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_active_coach();
begin
  return coalesce((select jsonb_agg(grasa.template_out(t) order by t.created_at, t.id) from grasa.routine_templates t where t.coach_id = uid), '[]'::jsonb);
end $$;

-- Borra la plantilla. Las copias ya asignadas y la del día NO cambian (son independientes). Reduce acceso: no exige acuerdo.
create or replace function grasa.delete_template(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  delete from grasa.routine_templates where id = p_id and coach_id = uid;
end $$;

-- ============ V2: asignar (copias), rutinas de un asesorado, mostrar/ocultar ============
-- Crea UNA COPIA independiente de la plantilla para cada asesorado de la lista (1 a 100, todos con vínculo ACTIVO; visible por defecto).
-- Todo o nada: si alguno no es tuyo (forbidden) o ya tiene 20 rutinas (invalid, detail routine_limit), no se crea ninguna.
create or replace function grasa.assign_template(p_template uuid, p_clients uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_active_coach(); t grasa.routine_templates; c uuid; r grasa.routines; res jsonb := '[]'::jsonb;
begin
  select x.* into t from grasa.routine_templates x where x.id = p_template and x.coach_id = uid;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_clients is null or cardinality(p_clients) not between 1 and 100 or array_position(p_clients, null) is not null then
    raise exception 'invalid' using errcode = '22023', detail = 'elige entre 1 y 100 asesorados';
  end if;
  foreach c in array (select array_agg(distinct u.v order by u.v) from unnest(p_clients) as u(v)) loop
    if not exists (select 1 from grasa.coach_links l where l.coach_id = uid and l.client_id = c and l.status = 'active') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('rrut:' || uid::text || c::text, 0));
    if (select count(*) from grasa.routines x where x.coach_id = uid and x.client_id = c) >= 20 then
      raise exception 'invalid' using errcode = '22023', detail = 'routine_limit';
    end if;
    insert into grasa.routines (coach_id, client_id, title, content, visible) values (uid, c, t.title, t.content, true) returning * into r;
    res := res || jsonb_build_array(grasa.routine_out(r));
  end loop;
  return res;
end $$;

-- Las rutinas que ese coach asignó a ese cliente (visibles u ocultas), de la más antigua a la más nueva.
create or replace function grasa.list_client_routines(p_client uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_coach_of(p_client);
begin
  return coalesce((select jsonb_agg(grasa.routine_out(r) order by r.created_at, r.id) from grasa.routines r where r.coach_id = uid and r.client_id = p_client), '[]'::jsonb);
end $$;

-- p_id null = crear una rutina nueva para ese cliente (máx. 20); con id = modificar ESA copia (la visibilidad no cambia).
create or replace function grasa.save_client_routine(p_client uuid, p_id uuid, p_title text, p_content jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_coach_of(p_client); r grasa.routines; ti text;
begin
  ti := grasa.check_routine_input(uid, p_title, p_content);
  if p_id is null then
    perform pg_advisory_xact_lock(hashtextextended('rrut:' || uid::text || p_client::text, 0));
    if (select count(*) from grasa.routines x where x.coach_id = uid and x.client_id = p_client) >= 20 then
      raise exception 'invalid' using errcode = '22023', detail = 'routine_limit';
    end if;
    insert into grasa.routines (coach_id, client_id, title, content) values (uid, p_client, ti, p_content) returning * into r;
  else
    update grasa.routines x set title = ti, content = p_content, updated_at = now()
      where x.id = p_id and x.coach_id = uid and x.client_id = p_client returning * into r;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;
  return grasa.routine_out(r);
end $$;

-- Quita la copia de ese asesorado (solo la propia del coach). Reduce acceso: no exige acuerdo ni vínculo activo.
create or replace function grasa.delete_client_routine(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  delete from grasa.routines where id = p_id and coach_id = uid;
end $$;

-- «Visible para el asesorado». Ocultar reduce acceso (no exige acuerdo ni vínculo); mostrar sí exige acuerdo y vínculo activo.
create or replace function grasa.set_routine_visible(p_id uuid, p_visible boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); r grasa.routines;
begin
  if p_visible is null then raise exception 'invalid' using errcode = '22023'; end if;
  select x.* into r from grasa.routines x where x.id = p_id and x.coach_id = uid;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_visible then perform grasa.require_coach_of(r.client_id); end if;
  update grasa.routines x set visible = p_visible where x.id = p_id returning * into r;
  return grasa.routine_out(r);
end $$;

-- ============ V3: «Rutina de hoy» ============
-- Publica (copia) una plantilla para TODOS los asesorados activos. p_day = el día 'AAAA-MM-DD' del dispositivo del coach; el servidor solo
-- acepta de hoy-2 a hoy+2 en Bogotá (cualquier zona horaria del mundo cae dentro). Reemplaza la anterior (una por coach).
create or replace function grasa.publish_daily(p_template uuid, p_day date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_active_coach(); t grasa.routine_templates; d grasa.daily_routines;
begin
  if p_day is null or p_day not between grasa.today_bogota() - 2 and grasa.today_bogota() + 2 then
    raise exception 'invalid' using errcode = '22023', detail = 'bad_day';
  end if;
  select x.* into t from grasa.routine_templates x where x.id = p_template and x.coach_id = uid;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into grasa.daily_routines as y (coach_id, template_id, title, content, day, published_at) values (uid, t.id, t.title, t.content, p_day, now())
    on conflict (coach_id) do update set template_id = excluded.template_id, title = excluded.title, content = excluded.content, day = excluded.day, published_at = now()
    returning * into d;
  return grasa.daily_out(d);
end $$;

-- La del día de ESTE coach (null si no hay), tal como está publicada (aunque su día ya pasó).
create or replace function grasa.get_daily() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_active_coach(); d grasa.daily_routines;
begin
  select x.* into d from grasa.daily_routines x where x.coach_id = uid;
  if not found then return null; end if;
  return grasa.daily_out(d);
end $$;

-- Quita la «Rutina de hoy». Reduce acceso: no exige acuerdo.
create or replace function grasa.clear_daily() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  delete from grasa.daily_routines where coach_id = uid;
end $$;

-- ============ Lo que ve el cliente ============
-- Sus rutinas VISIBLES (solo las de su coach con vínculo activo y coach activo), de la más antigua a la más nueva. También con el acceso en pausa por pago.
create or replace function grasa.my_routines() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  return coalesce((select jsonb_agg(grasa.routine_out(x) order by x.created_at, x.id)
                   from grasa.routines x
                   join grasa.coach_links l on l.coach_id = x.coach_id and l.client_id = x.client_id and l.status = 'active'
                   join grasa.coaches c on c.user_id = x.coach_id and c.active
                   where x.client_id = uid and x.visible), '[]'::jsonb);
end $$;

-- La «Rutina de hoy» de SU coach, solo si el día publicado es EXACTAMENTE p_today (la fecha de hoy de su dispositivo, 'AAAA-MM-DD'; así «hoy» es hoy
-- donde esté la persona, igual que Hábitos y Medidas). Sin vínculo activo, con coach inactivo o de otro día: null.
create or replace function grasa.my_daily(p_today date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); d grasa.daily_routines;
begin
  if p_today is null then return null; end if;
  select x.* into d from grasa.daily_routines x
    join grasa.coach_links l on l.coach_id = x.coach_id and l.client_id = uid and l.status = 'active'
    join grasa.coaches c on c.user_id = x.coach_id and c.active
    where x.day = p_today;
  if not found then return null; end if;
  return grasa.daily_out(d);
end $$;

-- ============ V5: funciones de v1.7 (misma firma) sobre «la primera rutina» ============
create or replace function grasa.save_routine(p_client uuid, p_title text, p_content jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_coach_of(p_client); r grasa.routines; ti text; first_id uuid;
begin
  ti := grasa.check_routine_input(uid, p_title, p_content);
  perform pg_advisory_xact_lock(hashtextextended('rrut:' || uid::text || p_client::text, 0));
  select x.id into first_id from grasa.routines x where x.coach_id = uid and x.client_id = p_client order by x.created_at, x.id limit 1;
  if first_id is null then
    insert into grasa.routines (coach_id, client_id, title, content) values (uid, p_client, ti, p_content) returning * into r;
  else
    update grasa.routines x set title = ti, content = p_content, updated_at = now() where x.id = first_id returning * into r;
  end if;
  return grasa.routine_out(r);
end $$;

create or replace function grasa.get_routine(p_client uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_coach_of(p_client); r grasa.routines;
begin
  select x.* into r from grasa.routines x where x.coach_id = uid and x.client_id = p_client order by x.created_at, x.id limit 1;
  if not found then return null; end if;
  return grasa.routine_out(r);
end $$;

create or replace function grasa.delete_routine(p_client uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  delete from grasa.routines where id = (select x.id from grasa.routines x where x.coach_id = uid and x.client_id = p_client order by x.created_at, x.id limit 1);
end $$;

create or replace function grasa.my_routine() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); r grasa.routines;
begin
  select x.* into r from grasa.routines x
    join grasa.coach_links l on l.coach_id = x.coach_id and l.client_id = x.client_id and l.status = 'active'
    join grasa.coaches c on c.user_id = x.coach_id and c.active
    where x.client_id = uid and x.visible order by x.created_at, x.id limit 1;
  if not found then return null; end if;
  return grasa.routine_out(r);
end $$;

-- ============ Permisos ============
revoke execute on function grasa.template_out(grasa.routine_templates), grasa.daily_out(grasa.daily_routines),
  grasa.check_routine_input(uuid, text, jsonb), grasa.require_coach_of(uuid), grasa.require_active_coach(), grasa.gif_uses(uuid, uuid),
  grasa.save_template(uuid, text, jsonb), grasa.list_templates(), grasa.delete_template(uuid), grasa.assign_template(uuid, uuid[]),
  grasa.list_client_routines(uuid), grasa.save_client_routine(uuid, uuid, text, jsonb), grasa.delete_client_routine(uuid),
  grasa.set_routine_visible(uuid, boolean), grasa.publish_daily(uuid, date), grasa.get_daily(), grasa.clear_daily(),
  grasa.my_routines(), grasa.my_daily(date)
  from public, anon, authenticated, service_role;
revoke execute on function grasa.routine_out(grasa.routines) from public, anon, authenticated, service_role;
grant execute on function grasa.save_template(uuid, text, jsonb), grasa.list_templates(), grasa.delete_template(uuid), grasa.assign_template(uuid, uuid[]),
  grasa.list_client_routines(uuid), grasa.save_client_routine(uuid, uuid, text, jsonb), grasa.delete_client_routine(uuid),
  grasa.set_routine_visible(uuid, boolean), grasa.publish_daily(uuid, date), grasa.get_daily(), grasa.clear_daily(),
  grasa.my_routines(), grasa.my_daily(date)
  to authenticated;

-- ======== 20261027120000_r1_rutinas_video.sql ========
-- R1 v1.9 · «App para coaches», Etapa 2c: VIDEOS CORTOS como demostración de ejercicios. Aditiva e idempotente. UNA sola migración en vuelo.
--   W1  grasa.exercise_gifs admite también video/mp4, video/quicktime (.mov del iPhone) y video/webm. Topes por tipo: GIF/WebP ≤ 3 MB (como en v1.7), video ≤ 10 MB.
--   W2  grasa.gif_head_ok valida la FIRMA de bytes de los videos: mp4/mov = «ftyp» en los bytes 4–7 (mov además con la marca «qt  » en los bytes 8–11);
--       webm = cabecera EBML 1A45DFA3. register_gif (mismos parámetros) aplica el tipo, el tope por tipo y la firma.
--   W3  Bucket privado 'ejercicios': file_size_limit 10 MB y los 5 tipos permitidos. (Storage no distingue tipos: el tope de 3 MB para GIF/WebP lo impone
--       register_gif y la app; la duración máxima de 15 s es un límite blando que solo comprueba la app, el servidor no ve el video.)
-- Todo lo demás (tablas, RLS, políticas de Storage, my_gifs, delete_gif, gif_uses, rutinas) queda igual. La app vieja sigue funcionando: sigue subiendo GIF/WebP.

-- ============ W1: tabla (tipos y topes por tipo) ============
-- Los checks de columna de v1.7 se llaman exercise_gifs_mime_check y exercise_gifs_size_bytes_check; se sustituyen por otros con nombre propio.
alter table grasa.exercise_gifs drop constraint if exists exercise_gifs_mime_check;
alter table grasa.exercise_gifs drop constraint if exists exercise_gifs_size_bytes_check;
alter table grasa.exercise_gifs drop constraint if exists exercise_gifs_mime_ok;
alter table grasa.exercise_gifs drop constraint if exists exercise_gifs_size_ok;
alter table grasa.exercise_gifs add constraint exercise_gifs_mime_ok
  check (mime in ('image/gif', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'));
alter table grasa.exercise_gifs add constraint exercise_gifs_size_ok
  check (size_bytes >= 1 and size_bytes <= case when mime like 'video/%' then 10485760 else 3145728 end);

-- ============ W2: firma de bytes y registro ============
-- ¿Los primeros 12 bytes (hexadecimal, minúsculas) son los del tipo declarado?
--   gif: GIF87a/GIF89a · webp: RIFF....WEBP · mp4: «ftyp» en los bytes 4–7 (cualquier marca ISO) · quicktime: «ftyp» + marca «qt  » · webm: EBML 1A45DFA3
create or replace function grasa.gif_head_ok(p_head text, p_mime text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(case
    when p_head is null or p_head !~ '^[0-9a-f]{24}$' then false
    when p_mime = 'image/gif' then substr(p_head, 1, 12) in ('474946383761', '474946383961')
    when p_mime = 'image/webp' then substr(p_head, 1, 8) = '52494646' and substr(p_head, 17, 8) = '57454250'
    when p_mime = 'video/mp4' then substr(p_head, 9, 8) = '66747970'
    when p_mime = 'video/quicktime' then substr(p_head, 9, 8) = '66747970' and substr(p_head, 17, 8) = '71742020'
    when p_mime = 'video/webm' then substr(p_head, 1, 8) = '1a45dfa3'
    else false end, false);
$$;

-- Mismos parámetros que en v1.7. p_head = los 12 primeros bytes del archivo en hexadecimal (el cliente los lee).
create or replace function grasa.register_gif(p_id uuid, p_name text, p_mime text, p_size int, p_head text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); g grasa.exercise_gifs; nm text := btrim(coalesce(p_name, ''));
begin
  perform grasa.require_coach_agreement();
  if not exists (select 1 from grasa.coaches c where c.user_id = uid and c.active) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_id is null or char_length(nm) not between 1 and 60 then raise exception 'invalid' using errcode = '22023', detail = 'el nombre debe tener entre 1 y 60 caracteres'; end if;
  if p_mime is null or p_mime not in ('image/gif', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm') then
    raise exception 'invalid' using errcode = '22023', detail = 'solo GIF, WebP o video MP4, MOV o WebM';
  end if;
  if p_size is null or p_size < 1 or p_size > (case when p_mime like 'video/%' then 10485760 else 3145728 end) then
    raise exception 'invalid' using errcode = '22023', detail = case when p_mime like 'video/%' then 'el video debe pesar como máximo 10 MB' else 'el archivo debe pesar como máximo 3 MB' end;
  end if;
  if not grasa.gif_head_ok(lower(p_head), p_mime) then raise exception 'invalid' using errcode = '22023', detail = 'el archivo no parece un GIF, un WebP ni un video MP4, MOV o WebM'; end if;
  select x.* into g from grasa.exercise_gifs x where x.id = p_id;
  if found and g.coach_id <> uid then raise exception 'forbidden' using errcode = '42501'; end if;
  if not found and (select count(*) from grasa.exercise_gifs x where x.coach_id = uid) >= 200 then
    raise exception 'invalid' using errcode = '22023', detail = 'la biblioteca está llena (máximo 200 animaciones)';
  end if;
  insert into grasa.exercise_gifs as t (id, coach_id, name, mime, size_bytes) values (p_id, uid, nm, p_mime, p_size)
    on conflict (id) do update set name = excluded.name, mime = excluded.mime, size_bytes = excluded.size_bytes
    returning * into g;
  return jsonb_build_object('id', g.id, 'name', g.name, 'mime', g.mime, 'size_bytes', g.size_bytes, 'created_at', g.created_at, 'uses', 0);
end $$;

-- ============ W3: bucket ============
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ejercicios', 'ejercicios', false, 10485760, array['image/gif', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Permisos: las funciones se redefinen con la misma firma; se repiten los grants de v1.7 por si el entorno los perdió.
revoke execute on function grasa.gif_head_ok(text, text), grasa.register_gif(uuid, text, text, int, text) from public, anon, authenticated, service_role;
grant execute on function grasa.register_gif(uuid, text, text, int, text) to authenticated;

-- ======== 20261028120000_r1_bitacora_fotos.sql ========
-- R1 v1.10 · «App para coaches», textos legales del 24/10/2026: BITÁCORA «Quién vio mis fotos». Aditiva e idempotente. UNA sola migración en vuelo.
--   B1  grasa.my_photo_views(p_limit): el CLIENTE lee las últimas veces (máx. 100) que su coach abrió una de sus fotos: cuándo, qué foto (fecha y pose) y el
--       nombre comercial del coach. El texto aprobado de A6b promete «una bitácora de visualización disponible en mi perfil»; esta función la hace posible.
--   Por qué una función y no un SELECT directo: la política photo_views_client ya deja leer SUS filas, pero el nombre del coach (grasa.coaches) y los datos de
--   la foto no se leen por RLS si el vínculo terminó. La función solo devuelve filas con client_id = quien llama (auth.uid()), nunca de otra persona.
-- Las peticiones de medidas (peso, abdomen y cadera obligatorios en el formulario nuevo) NO necesitan SQL: viajan dentro de `data` (jsonb) del registro `entry`.
-- Tablas, RLS, coach_photo_opened y todo lo demás quedan igual.

create or replace function grasa.my_photo_views(p_limit int default 100)
returns table (id uuid, viewed_at timestamptz, photo_id uuid, photo_date date, pose text, coach_name text)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  return query
    select v.id, v.viewed_at, v.photo_id, p.date, p.pose, c.business_name
      from grasa.photo_views v
      left join grasa.photos p on p.id = v.photo_id
      left join grasa.coaches c on c.user_id = v.coach_id
     where v.client_id = uid
     order by v.viewed_at desc, v.id desc
     limit least(greatest(coalesce(p_limit, 100), 1), 100);
end $$;

-- Mismos permisos que el resto de funciones del cliente: ni público ni anónimo; sí authenticated.
revoke execute on function grasa.my_photo_views(int) from public, anon, authenticated, service_role;
grant execute on function grasa.my_photo_views(int) to authenticated;

-- ======== 20261029120000_r1_etapa2_coach.sql ========
-- R1 v1.11 · «App para coaches», UX Etapa 2: pregunta de salud (L4), meta de proteína del coach (L5), retos del coach y modo autónomo en pausa (P1).
-- Aditiva e idempotente: se aplica encima de v1.10. UNA sola migración en vuelo.
--   H1  grasa.health_answers: respuesta del ASESORADO a las dos preguntas de salud (L4 y la de embarazo, lactancia o posparto, concepto 3).
--       Una fila por (persona, pregunta): 'yes' | 'no' | 'skip' (Prefiero no responder), con la versión y el hash del bloque de texto que vio.
--       RLS: solo la dueña o el dueño la lee y la escribe (por la API de tablas o con grasa.set_health_answer, SECURITY INVOKER). Nunca se guarda
--       el diagnóstico ni ningún detalle. Escribirla exige A3 + A4 vigentes (es un dato de salud que va a la nube).
--       El coach NO tiene ninguna política sobre la tabla: solo recibe dos booleanos en coach_clients() (health_restriction, pregnancy_state),
--       y solo si la respuesta es 'yes', el vínculo está activo y el asesorado mantiene A3 + A4.
--   H2  grasa.coach_links.protein_goal_g: meta orientativa de proteína (g/día) que ESCRIBE EL COACH (set_protein_goal). La plataforma no la calcula
--       ni la sugiere: sin meta del coach queda null. El asesorado la lee en my_link().
--   H3  Retos del coach: grasa.challenges (título, hábito de proceso, días meta, fechas), grasa.challenge_members (a quién se asigna) y
--       grasa.challenge_marks (los días que el asesorado marca «lo cumplí»). Solo por funciones SECURITY DEFINER. Sin premios ni ranking:
--       el coach ve el avance de cada asesorado suyo; el asesorado solo ve el suyo.
--   H4  P1 · modo autónomo en pausa. Con el vínculo activo y vencido, sync_push ACEPTA hábitos (kind 'habit') y nada más (medidas, comidas,
--       perfil, biblioteca y fotos siguen con payment_required). Todo registro escrito mientras la persona está en pausa queda marcado
--       grasa.records.pause_private = true por un disparador (no lo decide el cliente y no se puede desmarcar: una vez privado, privado para siempre).
--       coach_pull y coach_clients (última actividad) NUNCA devuelven filas privadas, ni durante la pausa ni después de reactivar. Lo mismo para
--       las marcas de retos hechas en pausa.
--   H5  grasa.link_pauses: periodos de pausa ya cerrados de cada vínculo (los registra set_client_payment al pasar de vencido a pagado). my_link() y
--       coach_clients() devuelven `pauses` (cerrados + el actual si sigue en pausa) para CONGELAR la constancia en esos días.
-- Fuera de alcance (Etapa 3, sin activar): alertas L6, finalidad L6d, cláusulas 7.3/7.4 y política v1.1.

-- ============ H1: respuestas de salud ============
create table if not exists grasa.health_answers (
  user_id     uuid not null references auth.users(id) on delete cascade,
  question    text not null check (question in ('condition', 'pregnancy')),
  answer      text not null check (answer in ('yes', 'no', 'skip')),
  version     text not null check (char_length(version) between 1 and 20),
  text_hash   text not null check (text_hash ~ '^[0-9a-f]{64}$'),
  answered_at timestamptz not null default now(),
  primary key (user_id, question)
);
alter table grasa.health_answers enable row level security;
revoke all on grasa.health_answers from public, anon, authenticated, service_role;
grant select, insert, update on grasa.health_answers to authenticated;
drop policy if exists health_owner_select on grasa.health_answers;
create policy health_owner_select on grasa.health_answers for select to authenticated using (user_id = auth.uid());
drop policy if exists health_owner_insert on grasa.health_answers;
create policy health_owner_insert on grasa.health_answers for insert to authenticated with check (user_id = auth.uid());
drop policy if exists health_owner_update on grasa.health_answers;
create policy health_owner_update on grasa.health_answers for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- La escribe la persona en sesión (SECURITY INVOKER: pasa por la RLS de arriba). Exige A3 + A4. Devuelve la fila.
create or replace function grasa.set_health_answer(p_question text, p_answer text, p_version text, p_text_hash text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare uid uuid := grasa.require_uid(); r grasa.health_answers;
begin
  perform core.require_cloud_consent('grasa');
  if p_question not in ('condition', 'pregnancy') or p_answer not in ('yes', 'no', 'skip')
     or coalesce(p_version, '') = '' or char_length(p_version) > 20 or coalesce(p_text_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid' using errcode = '22023';
  end if;
  insert into grasa.health_answers as t (user_id, question, answer, version, text_hash, answered_at)
  values (uid, p_question, p_answer, p_version, p_text_hash, now())
  on conflict (user_id, question) do update
    set answer = excluded.answer, version = excluded.version, text_hash = excluded.text_hash, answered_at = excluded.answered_at
  returning * into r;
  return jsonb_build_object('question', r.question, 'answer', r.answer, 'version', r.version, 'answered_at', r.answered_at);
end $$;

-- Mis respuestas (para que la app sepa si ya respondió). SECURITY INVOKER: la RLS solo deja ver las propias.
create or replace function grasa.my_health() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('question', h.question, 'answer', h.answer, 'version', h.version, 'answered_at', h.answered_at)
                  order by h.question), '[]'::jsonb)
  from grasa.health_answers h where h.user_id = auth.uid();
$$;

-- ¿Ese cliente respondió «Sí» a esa pregunta? INTERNA (con un uuid libre permitiría sondear a otros): solo la usan las funciones del coach.
create or replace function grasa.health_flag(p_client uuid, p_question text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from grasa.health_answers h where h.user_id = p_client and h.question = p_question and h.answer = 'yes');
$$;

-- ============ H2: meta de proteína del coach ============
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'grasa' and table_name = 'coach_links' and column_name = 'protein_goal_g') then
    alter table grasa.coach_links add column protein_goal_g int null check (protein_goal_g between 20 and 400);
  end if;
end $$;

-- El coach (activo, con acuerdo y vínculo activo) fija o quita (null) la meta de ese asesorado. La app nunca propone el número.
create or replace function grasa.set_protein_goal(p_client uuid, p_grams int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_coach_of(p_client);
begin
  if p_grams is not null and p_grams not between 20 and 400 then raise exception 'invalid' using errcode = '22023', detail = 'la meta va de 20 a 400 g'; end if;
  update grasa.coach_links set protein_goal_g = p_grams, updated_at = now()
    where coach_id = uid and client_id = p_client and status = 'active';
  return jsonb_build_object('client_id', p_client, 'protein_goal_g', p_grams);
end $$;

-- ============ H4: registros privados de la pausa ============
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'grasa' and table_name = 'records' and column_name = 'pause_private') then
    alter table grasa.records add column pause_private boolean not null default false;
  end if;
end $$;

-- Lo marca el SERVIDOR: la fila queda privada si la dueña está en pausa al escribir (vínculo activo vencido) o si la fecha del registro cae dentro
-- de una pausa ya cerrada de su vínculo activo (lo anotado sin conexión durante la pausa y subido después de reactivar). Una fila privada no vuelve
-- a ser visible (ni aunque se edite después de reactivar: su contenido nació en la pausa). El cliente no puede desmarcarla ni por la API de tablas.
create or replace function grasa.mark_pause_private() returns trigger
language plpgsql security definer set search_path = '' as $$
declare now_private boolean := grasa.client_payment_blocked(new.user_id) or (new.date is not null and grasa.day_in_pause(new.user_id, new.date));
begin
  if tg_op = 'UPDATE' then new.pause_private := old.pause_private or now_private;
  else new.pause_private := now_private; end if;
  return new;
end $$;
drop trigger if exists records_pause_private on grasa.records;
create trigger records_pause_private before insert or update on grasa.records for each row execute function grasa.mark_pause_private();

-- sync_push: mismo cuerpo que en r1_pagos_coach; en pausa se aceptan SOLO hábitos (al menos uno) y nada de fotos.
create or replace function grasa.sync_push(p_records jsonb default '[]', p_photos jsonb default '[]') returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare uid uuid := grasa.require_uid(); r jsonb; got uuid; rejected_r jsonb := '[]'; rejected_p jsonb := '[]';
begin
  perform core.require_cloud_consent('grasa');
  if jsonb_typeof(coalesce(p_records, '[]')) <> 'array' or jsonb_typeof(coalesce(p_photos, '[]')) <> 'array' then
    raise exception 'invalid' using errcode = '22023';
  end if;
  if grasa.payment_blocked_me() and (jsonb_array_length(coalesce(p_photos, '[]')) > 0 or jsonb_array_length(coalesce(p_records, '[]')) = 0
      or exists (select 1 from jsonb_array_elements(coalesce(p_records, '[]')) e where e ->> 'kind' is distinct from 'habit')) then
    perform grasa.require_payment();   -- P1: en pausa solo el registro autónomo de hábitos; lo demás sigue en payment_required
  end if;
  if jsonb_array_length(coalesce(p_records, '[]')) + jsonb_array_length(coalesce(p_photos, '[]')) > 500 then
    raise exception 'invalid' using errcode = '22023', detail = 'máximo 500 elementos por llamada';
  end if;
  for r in select * from jsonb_array_elements(coalesce(p_records, '[]')) loop
    got := null;
    insert into grasa.records as t (id, user_id, kind, nkey, date, data, updated_at, deleted_at)
    values ((r ->> 'id')::uuid, uid, r ->> 'kind', r ->> 'nkey', (r ->> 'date')::date,
            coalesce(r -> 'data', '{}'::jsonb), (r ->> 'updated_at')::timestamptz, (r ->> 'deleted_at')::timestamptz)
    on conflict (user_id, kind, nkey) do update
      set data = excluded.data, date = excluded.date, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at
      where excluded.updated_at > t.updated_at
         or (excluded.updated_at = t.updated_at and excluded.data::text > t.data::text)
    returning t.id into got;
    if got is null then   -- ganó la fila del servidor: se devuelve para que el cliente la fusione
      rejected_r := rejected_r || (select to_jsonb(t) - 'user_id' - 'pause_private' from grasa.records t
                                   where t.user_id = uid and t.kind = r ->> 'kind' and t.nkey = r ->> 'nkey');
    end if;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(p_photos, '[]')) loop
    got := null;
    insert into grasa.photos as t (id, user_id, date, pose, width, height, storage_path, shared_with_coach,
                                   created_at, updated_at, deleted_at)
    values ((r ->> 'id')::uuid, uid, (r ->> 'date')::date, r ->> 'pose', (r ->> 'width')::int, (r ->> 'height')::int,
            r ->> 'storage_path', coalesce((r ->> 'shared_with_coach')::boolean, false),
            (r ->> 'created_at')::timestamptz, (r ->> 'updated_at')::timestamptz, (r ->> 'deleted_at')::timestamptz)
    on conflict (id) do update
      set date = excluded.date, pose = excluded.pose, width = excluded.width, height = excluded.height,
          shared_with_coach = excluded.shared_with_coach, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at
      where excluded.updated_at > t.updated_at
    returning t.id into got;
    if got is null then
      rejected_p := rejected_p || (select to_jsonb(t) - 'user_id' from grasa.photos t where t.id = (r ->> 'id')::uuid);
    end if;
  end loop;
  return jsonb_build_object('server_now', now(), 'rejected', jsonb_build_object('records', rejected_r, 'photos', rejected_p));
end $$;

-- coach_pull: mismo cuerpo que en r1_consentimientos_servidor; NUNCA devuelve filas escritas en pausa (pause_private).
create or replace function grasa.coach_pull(p_client uuid, p_since timestamptz default '1970-01-01T00:00:00Z')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare l grasa.coach_links; since timestamptz := coalesce(p_since, '1970-01-01T00:00:00Z') - interval '30 seconds';
  recs jsonb; phs jsonb; cms jsonb; cur timestamptz;
begin
  perform grasa.require_uid();
  perform grasa.require_coach_agreement();
  select * into l from grasa.coach_links
    where coach_id = auth.uid() and client_id = p_client and status = 'active';
  if not found or not grasa.coach_can_see(p_client, 'body') then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'nkey', r.nkey, 'date', r.date,
           'data', case when r.deleted_at is not null then '{}'::jsonb
                        when not l.share_notes then r.data - 'note' else r.data end,   -- H6: en TODO kind
           'updated_at', r.updated_at, 'deleted_at', r.deleted_at, 'server_updated_at', r.server_updated_at)
           order by r.server_updated_at), '[]'::jsonb), max(r.server_updated_at)
    into recs, cur
    from grasa.records r
    where r.user_id = p_client and r.server_updated_at > since
      and not r.pause_private                                        -- P1: lo de la pausa nunca llega al coach
      and (r.kind in ('profile','entry')
           or (r.kind = 'food' and l.share_nutrition)
           or (r.kind = 'habit' and l.share_habits));              -- 'library' nunca
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'date', p.date, 'pose', p.pose, 'width', p.width,
           'height', p.height, 'storage_path', p.storage_path, 'created_at', p.created_at, 'updated_at', p.updated_at,
           'server_updated_at', p.server_updated_at) order by p.server_updated_at), '[]'::jsonb)
    into phs
    from grasa.photos p
    where l.share_photos and p.user_id = p_client and p.shared_with_coach and p.deleted_at is null
      and p.server_updated_at > since;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.server_updated_at), '[]'::jsonb) into cms
    from grasa.comments c where c.link_id = l.id and c.server_updated_at > since;
  return jsonb_build_object('records', recs, 'photos', phs, 'comments', cms,
                            'cursor', coalesce(cur, p_since), 'server_now', now());
end $$;

-- ============ H5: periodos de pausa ============
create table if not exists grasa.link_pauses (
  id         uuid primary key default gen_random_uuid(),
  link_id    uuid not null references grasa.coach_links(id) on delete cascade,
  from_day   date not null,
  to_day     date not null,
  created_at timestamptz not null default now(),
  check (from_day <= to_day)
);
create index if not exists link_pauses_link on grasa.link_pauses (link_id, from_day);
alter table grasa.link_pauses enable row level security;
revoke all on grasa.link_pauses from public, anon, authenticated, service_role;

-- ¿Ese día cae dentro de una pausa cerrada del vínculo activo de esa persona? INTERNA.
create or replace function grasa.day_in_pause(p_user uuid, p_day date) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from grasa.link_pauses x join grasa.coach_links l on l.id = x.link_id
                 where l.client_id = p_user and l.status = 'active' and p_day between x.from_day and x.to_day);
$$;

-- Pausas de un vínculo: [{from, to}] cerradas y, si sigue vencido, la actual con to = null. INTERNA.
create or replace function grasa.link_pauses_json(p_link uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_agg(jsonb_build_object('from', x.from_day, 'to', x.to_day) order by x.from_day)
                   from grasa.link_pauses x where x.link_id = p_link), '[]'::jsonb)
      || coalesce((select jsonb_build_array(jsonb_build_object('from',
                     coalesce(l.paid_until + 1, (l.paid_marked_at at time zone 'America/Bogota')::date, (l.created_at at time zone 'America/Bogota')::date),
                     'to', null))
                   from grasa.coach_links l
                   where l.id = p_link and l.status = 'active' and (l.paid_until is null or l.paid_until < grasa.today_bogota())), '[]'::jsonb);
$$;

-- set_client_payment: mismo cuerpo que en r1_pagos_coach; si el vínculo estaba vencido y pasa a pagado, se guarda la pausa que termina (hasta ayer).
create or replace function grasa.set_client_payment(p_client uuid, p_paid_until date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); l grasa.coach_links; today date := grasa.today_bogota(); since date;
begin
  perform grasa.require_coach_agreement();
  if p_client is null then raise exception 'invalid' using errcode = '22023'; end if;
  select x.* into l from grasa.coach_links x
    join grasa.coaches c on c.user_id = x.coach_id and c.active
    where x.coach_id = uid and x.client_id = p_client and x.status = 'active'
    for update of x;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_paid_until is not null and (p_paid_until < today - 400 or p_paid_until > today + 400) then
    raise exception 'invalid' using errcode = '22023', detail = 'la fecha de pago está fuera de un rango razonable';
  end if;
  if (l.paid_until is null or l.paid_until < today) and p_paid_until is not null and p_paid_until >= today then
    since := coalesce(l.paid_until + 1, (l.paid_marked_at at time zone 'America/Bogota')::date, (l.created_at at time zone 'America/Bogota')::date);
    if since <= today - 1 then insert into grasa.link_pauses (link_id, from_day, to_day) values (l.id, since, today - 1); end if;
  end if;
  update grasa.coach_links set paid_until = p_paid_until, paid_marked_at = now(), updated_at = now() where id = l.id;
  return jsonb_build_object('client_id', p_client, 'paid_until', p_paid_until, 'paid_marked_at', now(),
    'paid', p_paid_until is not null and p_paid_until >= today,
    'days_left', case when p_paid_until is null then null else p_paid_until - today end);
end $$;

-- ============ coach_clients y my_link con lo nuevo (cambian las columnas: borrar y volver a crear) ============
drop function if exists grasa.coach_clients();
create function grasa.coach_clients()
returns table (client_id uuid, display_name text, link_id uuid, since timestamptz, shares jsonb,
               last_activity timestamptz, over_free_limit boolean,
               paid_until date, paid_marked_at timestamptz, paid boolean, days_left int,
               protein_goal_g int, health_restriction boolean, pregnancy_state boolean, pauses jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform grasa.require_coach_agreement();
  return query
  select l.client_id, p.display_name, l.id, l.created_at,
         jsonb_build_object('body', l.share_body, 'notes', l.share_notes, 'nutrition', l.share_nutrition,
                            'habits', l.share_habits, 'photos', l.share_photos),
         (select max(r.server_updated_at) from grasa.records r
          where r.user_id = l.client_id and not r.pause_private
            and core.consent_is_granted(l.client_id, 'grasa', 'sensitive_health')
            and core.consent_is_granted(l.client_id, 'grasa', 'cloud_transfer')
            and (r.kind in ('profile','entry') or (r.kind = 'food' and l.share_nutrition) or (r.kind = 'habit' and l.share_habits))),
         row_number() over (order by l.created_at, l.id) > c.free_clients,
         l.paid_until, l.paid_marked_at,
         (l.paid_until is not null and l.paid_until >= grasa.today_bogota()),
         case when l.paid_until is null then null else l.paid_until - grasa.today_bogota() end,
         l.protein_goal_g,
         grasa.coach_can_see(l.client_id, 'body') and grasa.health_flag(l.client_id, 'condition'),
         grasa.coach_can_see(l.client_id, 'body') and grasa.health_flag(l.client_id, 'pregnancy'),
         grasa.link_pauses_json(l.id)
  from grasa.coach_links l
  join grasa.coaches c on c.user_id = l.coach_id
  left join core.profiles p on p.id = l.client_id
  where l.coach_id = auth.uid() and l.status = 'active'
  order by l.created_at;
end $$;

drop function if exists grasa.my_link();
create function grasa.my_link()
returns table (id uuid, coach_id uuid, business_name text, share_body boolean, share_notes boolean,
               share_nutrition boolean, share_habits boolean, share_photos boolean, since timestamptz,
               paid_until date, paid_marked_at timestamptz, paid boolean, days_left int,
               protein_goal_g int, pauses jsonb)
language sql stable security definer set search_path = '' as $$
  select l.id, l.coach_id, c.business_name, l.share_body, l.share_notes, l.share_nutrition, l.share_habits,
         l.share_photos, l.created_at, l.paid_until, l.paid_marked_at,
         (l.paid_until is not null and l.paid_until >= grasa.today_bogota()),
         case when l.paid_until is null then null else l.paid_until - grasa.today_bogota() end,
         l.protein_goal_g, grasa.link_pauses_json(l.id)
  from grasa.coach_links l
  join grasa.coaches c on c.user_id = l.coach_id
  where l.client_id = auth.uid() and l.status = 'active'
  limit 1;
$$;

-- ============ H3: retos del coach ============
create table if not exists grasa.challenges (
  id          uuid primary key,
  coach_id    uuid not null references auth.users(id) on delete cascade,
  title       text not null check (char_length(title) between 3 and 60),
  habit       text not null check (habit in ('water', 'steps', 'sleep', 'trained', 'foods')),
  target_days int  not null check (target_days between 1 and 31),
  start_day   date not null,
  end_day     date not null,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz null,
  check (start_day <= end_day and end_day - start_day <= 30 and target_days <= end_day - start_day + 1)
);
create index if not exists challenges_coach on grasa.challenges (coach_id, end_day);
create table if not exists grasa.challenge_members (
  challenge_id uuid not null references grasa.challenges(id) on delete cascade,
  client_id    uuid not null references auth.users(id) on delete cascade,
  primary key (challenge_id, client_id)
);
create index if not exists challenge_members_client on grasa.challenge_members (client_id);
create table if not exists grasa.challenge_marks (
  challenge_id  uuid not null,
  client_id     uuid not null,
  day           date not null,
  pause_private boolean not null default false,
  created_at    timestamptz not null default now(),
  primary key (challenge_id, client_id, day),
  foreign key (challenge_id, client_id) references grasa.challenge_members(challenge_id, client_id) on delete cascade
);
alter table grasa.challenges enable row level security;
alter table grasa.challenge_members enable row level security;
alter table grasa.challenge_marks enable row level security;
revoke all on grasa.challenges, grasa.challenge_members, grasa.challenge_marks from public, anon, authenticated, service_role;

-- Salida de un reto. p_client: solo las marcas de esa persona (vista del asesorado, incluidas las de su pausa); null: todos los miembros sin
-- las marcas privadas de la pausa (vista del coach), con su nombre y cuántos días lleva. INTERNA.
create or replace function grasa.challenge_out(ch grasa.challenges, p_client uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', ch.id, 'coach_id', ch.coach_id, 'business_name', (select c.business_name from grasa.coaches c where c.user_id = ch.coach_id),
    'title', ch.title, 'habit', ch.habit, 'target_days', ch.target_days, 'start_day', ch.start_day, 'end_day', ch.end_day, 'created_at', ch.created_at,
    'marks', case when p_client is null then null else coalesce((select jsonb_agg(m.day order by m.day) from grasa.challenge_marks m
                   where m.challenge_id = ch.id and m.client_id = p_client), '[]'::jsonb) end,
    'members', case when p_client is not null then null else coalesce((select jsonb_agg(jsonb_build_object('client_id', mb.client_id,
                   'display_name', coalesce(pr.display_name, ''),
                   'done', (select count(*) from grasa.challenge_marks m where m.challenge_id = ch.id and m.client_id = mb.client_id and not m.pause_private))
                   order by pr.display_name, mb.client_id)
                 from grasa.challenge_members mb
                 join grasa.coach_links l on l.client_id = mb.client_id and l.coach_id = ch.coach_id and l.status = 'active'
                 left join core.profiles pr on pr.id = mb.client_id
                 where mb.challenge_id = ch.id), '[]'::jsonb) end);
$$;

-- El coach lanza un reto para 1 a 100 asesorados suyos (todos con vínculo activo). Todo o nada.
create or replace function grasa.create_challenge(p_id uuid, p_title text, p_habit text, p_target int, p_start date, p_end date, p_clients uuid[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_active_coach(); c uuid; ch grasa.challenges; today date := grasa.today_bogota();
begin
  if p_id is null or p_title is null or char_length(trim(p_title)) not between 3 and 60 or p_habit not in ('water', 'steps', 'sleep', 'trained', 'foods')
     or p_target is null or p_start is null or p_end is null or p_start > p_end or p_end - p_start > 30 or p_target not between 1 and p_end - p_start + 1
     or p_start < today - 7 or p_start > today + 60 then
    raise exception 'invalid' using errcode = '22023', detail = 'reto no válido';
  end if;
  if p_clients is null or cardinality(p_clients) not between 1 and 100 or array_position(p_clients, null) is not null then
    raise exception 'invalid' using errcode = '22023', detail = 'elige entre 1 y 100 asesorados';
  end if;
  if (select count(*) from grasa.challenges x where x.coach_id = uid and x.deleted_at is null and x.end_day >= today) >= 20 then
    raise exception 'invalid' using errcode = '22023', detail = 'challenge_limit';
  end if;
  foreach c in array (select array_agg(distinct u.v) from unnest(p_clients) as u(v)) loop
    if not exists (select 1 from grasa.coach_links l where l.coach_id = uid and l.client_id = c and l.status = 'active') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end loop;
  insert into grasa.challenges (id, coach_id, title, habit, target_days, start_day, end_day)
  values (p_id, uid, trim(p_title), p_habit, p_target, p_start, p_end) returning * into ch;
  insert into grasa.challenge_members (challenge_id, client_id) select ch.id, u.v from (select distinct v from unnest(p_clients) as v) u;
  return grasa.challenge_out(ch, null);
end $$;

-- Retos del coach (no borrados, que terminaron hace 30 días o menos), del más reciente al más antiguo.
create or replace function grasa.list_challenges() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_active_coach();
begin
  return coalesce((select jsonb_agg(grasa.challenge_out(x, null) order by x.start_day desc, x.created_at desc)
                   from grasa.challenges x where x.coach_id = uid and x.deleted_at is null and x.end_day >= grasa.today_bogota() - 30), '[]'::jsonb);
end $$;

-- Quitar un reto (reduce acceso: no exige acuerdo vigente).
create or replace function grasa.delete_challenge(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  update grasa.challenges set deleted_at = coalesce(deleted_at, now()) where id = p_id and coach_id = uid;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end $$;

-- Mis retos (asesorado): de mi coach ACTIVO, no borrados, que terminaron hace 14 días o menos. Se ven aunque esté en pausa.
create or replace function grasa.my_challenges() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  return coalesce((select jsonb_agg(grasa.challenge_out(x, uid) order by x.start_day desc, x.created_at desc)
                   from grasa.challenges x
                   join grasa.challenge_members mb on mb.challenge_id = x.id and mb.client_id = uid
                   join grasa.coach_links l on l.coach_id = x.coach_id and l.client_id = uid and l.status = 'active'
                   join grasa.coaches c on c.user_id = x.coach_id and c.active
                   where x.deleted_at is null and x.end_day >= grasa.today_bogota() - 14), '[]'::jsonb);
end $$;

-- El asesorado marca (o desmarca) un día del reto. El día debe estar dentro del reto y no después de mañana (Bogotá: el teléfono puede ir
-- un día adelante). Exige A3 + A4. En pausa SÍ se puede (modo autónomo), y la marca queda privada (el coach no la cuenta, ni después).
create or replace function grasa.mark_challenge(p_id uuid, p_day date, p_done boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); ch grasa.challenges;
begin
  perform core.require_cloud_consent('grasa');
  select x.* into ch from grasa.challenges x
    join grasa.challenge_members mb on mb.challenge_id = x.id and mb.client_id = uid
    join grasa.coach_links l on l.coach_id = x.coach_id and l.client_id = uid and l.status = 'active'
    where x.id = p_id and x.deleted_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_day is null or p_day < ch.start_day or p_day > ch.end_day or p_day > grasa.today_bogota() + 1 then
    raise exception 'invalid' using errcode = '22023', detail = 'día fuera del reto';
  end if;
  if coalesce(p_done, false) then
    insert into grasa.challenge_marks (challenge_id, client_id, day, pause_private)
    values (ch.id, uid, p_day, grasa.client_payment_blocked(uid) or grasa.day_in_pause(uid, p_day))
    on conflict (challenge_id, client_id, day) do update set pause_private = grasa.challenge_marks.pause_private or excluded.pause_private;
  else
    delete from grasa.challenge_marks m where m.challenge_id = ch.id and m.client_id = uid and m.day = p_day;
  end if;
  return grasa.challenge_out(ch, uid);
end $$;

-- ============ Permisos ============
-- Las funciones nuevas nacen sin permisos: se cierran todas y se conceden solo las que llama la persona en sesión (cada una comprueba quién es).
revoke execute on function grasa.set_health_answer(text, text, text, text), grasa.my_health(), grasa.health_flag(uuid, text),
  grasa.set_protein_goal(uuid, int), grasa.mark_pause_private(), grasa.day_in_pause(uuid, date), grasa.link_pauses_json(uuid), grasa.challenge_out(grasa.challenges, uuid),
  grasa.create_challenge(uuid, text, text, int, date, date, uuid[]), grasa.list_challenges(), grasa.delete_challenge(uuid),
  grasa.my_challenges(), grasa.mark_challenge(uuid, date, boolean), grasa.coach_clients(), grasa.my_link(),
  grasa.set_client_payment(uuid, date), grasa.sync_push(jsonb, jsonb), grasa.coach_pull(uuid, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function grasa.set_health_answer(text, text, text, text), grasa.my_health(), grasa.set_protein_goal(uuid, int),
  grasa.create_challenge(uuid, text, text, int, date, date, uuid[]), grasa.list_challenges(), grasa.delete_challenge(uuid),
  grasa.my_challenges(), grasa.mark_challenge(uuid, date, boolean), grasa.coach_clients(), grasa.my_link(),
  grasa.set_client_payment(uuid, date), grasa.sync_push(jsonb, jsonb), grasa.coach_pull(uuid, timestamptz)
  to authenticated;

-- ======== 20261030120000_r1_aviso_dolor.sql ========
-- R1 v1.12 · Estilo v2: aviso de dolor al terminar (o al salir de) el entreno guiado. Concepto jurídico 4 (equipo/legal/concepto-4-2026-10-25.md).
-- Aditiva e idempotente: se aplica encima de v1.11. Mismo patrón que health_answers / health_flag (v1.11).
--   D1  grasa.pain_reports: UNA fila por (persona, día) con la respuesta cerrada a «¿Sentiste dolor que te impidiera entrenar con normalidad?»
--       (pain = true/false), la versión y el hash del texto que vio. Nunca se guarda qué duele ni ningún detalle (no hay campo de texto).
--       RLS activada SIN políticas ni permisos: nadie la lee ni la escribe por la API de tablas. Solo se escribe con grasa.report_pain
--       (SECURITY DEFINER, con auth.uid(): cada persona solo escribe la suya). Exige A3 + A4 vigentes y un vínculo activo con un coach activo
--       (si no hay a quién avisar, se rechaza y la app no dice «Tu coach ha sido notificado»).
--   D2  El coach NO lee la tabla. En grasa.coach_clients() recibe `pain_reported` (date): el día del último «Sí» que aún no marcó como revisado,
--       solo de su asesorado con vínculo activo y con A3 + A4 vigentes. NO depende de los permisos opcionales (hábitos, cuerpo, etc.): el aviso
--       llega siempre que la persona tenga el vínculo activo. grasa.review_pain(cliente) lo marca revisado (solo su coach).
--   D3  P1: lo reportado mientras la persona está en pausa (vínculo activo vencido) o con fecha dentro de una pausa cerrada queda
--       pause_private = true (lo decide el servidor, igual que grasa.mark_pause_private) y no llega al coach, ni después de reactivar.
--       La app no hace la pregunta en pausa (el entreno guiado no se ofrece), así que «Tu coach ha sido notificado» nunca se muestra en pausa.

create table if not exists grasa.pain_reports (
  user_id       uuid not null references auth.users(id) on delete cascade,
  day           date not null,
  pain          boolean not null,
  version       text not null check (char_length(version) between 1 and 20),
  text_hash     text not null check (text_hash ~ '^[0-9a-f]{64}$'),
  pause_private boolean not null default false,
  reported_at   timestamptz not null default now(),
  reviewed_at   timestamptz null,
  primary key (user_id, day)
);
alter table grasa.pain_reports enable row level security;
revoke all on grasa.pain_reports from public, anon, authenticated, service_role;

-- El asesorado responde (No / Sí) para un día (el del teléfono: hoy, ayer o mañana respecto de Bogotá). Un nuevo «Sí» vuelve a quedar sin revisar.
create or replace function grasa.report_pain(p_day date, p_pain boolean, p_version text, p_text_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); today date := grasa.today_bogota(); priv boolean; r grasa.pain_reports;
begin
  perform core.require_cloud_consent('grasa');
  if p_day is null or p_pain is null or p_day not between today - 1 and today + 1
     or coalesce(p_version, '') = '' or char_length(p_version) > 20 or coalesce(p_text_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid' using errcode = '22023';
  end if;
  if not exists (select 1 from grasa.coach_links l join grasa.coaches c on c.user_id = l.coach_id and c.active
                 where l.client_id = uid and l.status = 'active') then
    raise exception 'not_found' using errcode = 'P0002', detail = 'no_coach';
  end if;
  priv := grasa.client_payment_blocked(uid) or grasa.day_in_pause(uid, p_day);
  insert into grasa.pain_reports as t (user_id, day, pain, version, text_hash, pause_private, reported_at, reviewed_at)
  values (uid, p_day, p_pain, p_version, p_text_hash, priv, now(), null)
  on conflict (user_id, day) do update
    set pain = excluded.pain, version = excluded.version, text_hash = excluded.text_hash, reported_at = excluded.reported_at,
        pause_private = t.pause_private or excluded.pause_private,
        reviewed_at = case when excluded.pain then null else t.reviewed_at end
  returning * into r;
  return jsonb_build_object('day', r.day, 'pain', r.pain, 'notified', r.pain and not r.pause_private);
end $$;

-- Día del último «Sí» sin revisar y fuera de la pausa (null si no hay). INTERNA: con un uuid libre permitiría sondear a otros.
create or replace function grasa.pain_flag(p_client uuid) returns date
language sql stable security definer set search_path = '' as $$
  select max(x.day) from grasa.pain_reports x
  where x.user_id = p_client and x.pain and x.reviewed_at is null and not x.pause_private;
$$;

-- El coach (activo, con acuerdo y vínculo activo con esa persona) marca como revisado lo que ella reportó. Devuelve el indicador que queda.
create or replace function grasa.review_pain(p_client uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_coach_of(p_client);
begin
  update grasa.pain_reports set reviewed_at = now()
    where user_id = p_client and pain and reviewed_at is null and not pause_private;
  return jsonb_build_object('client_id', p_client, 'pain_reported', grasa.pain_flag(p_client));
end $$;

-- ============ coach_clients con el indicador «Reportó dolor» (cambian las columnas: borrar y volver a crear; mismo cuerpo que v1.11) ============
drop function if exists grasa.coach_clients();
create function grasa.coach_clients()
returns table (client_id uuid, display_name text, link_id uuid, since timestamptz, shares jsonb,
               last_activity timestamptz, over_free_limit boolean,
               paid_until date, paid_marked_at timestamptz, paid boolean, days_left int,
               protein_goal_g int, health_restriction boolean, pregnancy_state boolean, pauses jsonb, pain_reported date)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform grasa.require_coach_agreement();
  return query
  select l.client_id, p.display_name, l.id, l.created_at,
         jsonb_build_object('body', l.share_body, 'notes', l.share_notes, 'nutrition', l.share_nutrition,
                            'habits', l.share_habits, 'photos', l.share_photos),
         (select max(r.server_updated_at) from grasa.records r
          where r.user_id = l.client_id and not r.pause_private
            and core.consent_is_granted(l.client_id, 'grasa', 'sensitive_health')
            and core.consent_is_granted(l.client_id, 'grasa', 'cloud_transfer')
            and (r.kind in ('profile','entry') or (r.kind = 'food' and l.share_nutrition) or (r.kind = 'habit' and l.share_habits))),
         row_number() over (order by l.created_at, l.id) > c.free_clients,
         l.paid_until, l.paid_marked_at,
         (l.paid_until is not null and l.paid_until >= grasa.today_bogota()),
         case when l.paid_until is null then null else l.paid_until - grasa.today_bogota() end,
         l.protein_goal_g,
         grasa.coach_can_see(l.client_id, 'body') and grasa.health_flag(l.client_id, 'condition'),
         grasa.coach_can_see(l.client_id, 'body') and grasa.health_flag(l.client_id, 'pregnancy'),
         grasa.link_pauses_json(l.id),
         case when c.active and core.consent_is_granted(l.client_id, 'grasa', 'sensitive_health')
                   and core.consent_is_granted(l.client_id, 'grasa', 'cloud_transfer')
              then grasa.pain_flag(l.client_id) end
  from grasa.coach_links l
  join grasa.coaches c on c.user_id = l.coach_id
  left join core.profiles p on p.id = l.client_id
  where l.coach_id = auth.uid() and l.status = 'active'
  order by l.created_at;
end $$;

-- ============ Permisos ============
revoke execute on function grasa.report_pain(date, boolean, text, text), grasa.pain_flag(uuid), grasa.review_pain(uuid), grasa.coach_clients()
  from public, anon, authenticated, service_role;
grant execute on function grasa.report_pain(date, boolean, text, text), grasa.review_pain(uuid), grasa.coach_clients() to authenticated;

-- ======== 20261031120000_r1_analitica_admin.sql ========
-- R1 v1.13 · Analítica del coach (M3/M5), metas del coach (M1/M2/M4, concepto jurídico 5), panel admin (M7–M10) y avisos de la plataforma.
-- Aditiva e idempotente: se aplica encima de v1.12. UNA sola migración en vuelo.
--   K1  Metas OPCIONALES que fija el coach por asesorado (concepto 5, punto 1): peso (kg), cintura (cm) y hábitos por semana (días con agua
--       cumplida, días con pasos cumplidos, noches con sueño cumplido, días de entreno). La proteína REUSA coach_links.protein_goal_g (v1.11).
--       Columnas nuevas de grasa.coach_links, todas null por defecto (= sin meta). La plataforma no calcula ni sugiere ningún número.
--       Solo escribe grasa.set_goals (coach activo, con acuerdo y vínculo activo). El asesorado las lee en my_link() (`goals`) y el coach en
--       coach_clients() (`goals`). Sin meta, la clave no viene (jsonb_strip_nulls).
--   K2  grasa.coach_analytics(p_from, p_to): cifras por asesorado vinculado y activo para la pestaña «Analítica» (M3) y el ranking privado (M5).
--       NO baja registros: devuelve días con registro, días con entreno, promedios semanales de peso y la primera/última medida de peso y cintura.
--       Respeta exactamente lo que el coach ya ve con coach_pull: vínculo activo, coach activo, A3 + A4 del asesorado, comidas solo si las
--       comparte, hábitos solo si los comparte (si no, `trained_days` = null → «no comparte», nunca cero) y NUNCA filas pause_private.
--   K3  Panel admin (solo core.has_role('grasa','admin'), que se da A MANO en SQL; ninguna función lo concede). Ley 1581 / concepto 5 punto 4:
--       el admin NUNCA recibe datos de salud (peso, medidas, comidas, fotos, salud, dolor, hábitos con valores) ni nombres, iniciales o ids de
--       asesorados: solo cantidades agregadas por coach o totales. Con menos de 3 asesorados en el grupo, los porcentajes por coach salen null.
--       Concepto 5 punto 6: «coaches con mayor éxito» SOLO con negocio y adherencia (hábitos completados, retención a 3 y 6 meses, puntualidad
--       de pagos). Prohibido usar kilos, centímetros o cualquier cambio corporal (prueba en 170_analitica_admin).
--       «Asesorado activo» = MISMA definición que grasa.billing_active_clients (vínculo activo y ≥ 1 registro sincronizado en los 30 días
--       previos al cierre del mes): grasa.client_active_in_month.
--   K4  Suspender / reactivar coaches (grasa.coaches.active) con motivo opcional que solo ve el admin (grasa.coach_admin_events).
--       Efecto de un coach inactivo (ya existía): no ve datos (coach_can_see), no escribe rutinas, metas ni notas, su código no sirve para
--       vincularse. Sus asesorados siguen usando la app y conservan sus datos. NUEVO: un asesorado de un coach suspendido ya NO queda en pausa
--       por pago (client_payment_blocked exige coach activo), porque el coach no puede marcar pagos mientras esté suspendido.
--   K5  Días en que el coach abrió su panel: grasa.coach_panel_days (coach, día). SOLO la fecha, nada más; se borran las de más de 120 días.
--   K6  Avisos de la plataforma (M10): grasa.platform_notices. Solo el admin escribe; todo coach ACTIVO lee los vigentes (coach_notices).
-- Fuera de alcance: exportar a Excel (M6) y la Etapa 3.

-- ============ K1: metas del coach ============
alter table grasa.coach_links add column if not exists goal_weight_kg numeric(4,1) null check (goal_weight_kg between 30 and 300);
alter table grasa.coach_links add column if not exists goal_waist_cm numeric(4,1) null check (goal_waist_cm between 40 and 200);
alter table grasa.coach_links add column if not exists goal_water_days smallint null check (goal_water_days between 1 and 7);
alter table grasa.coach_links add column if not exists goal_steps_days smallint null check (goal_steps_days between 1 and 7);
alter table grasa.coach_links add column if not exists goal_sleep_days smallint null check (goal_sleep_days between 1 and 7);
alter table grasa.coach_links add column if not exists goal_trained_days smallint null check (goal_trained_days between 1 and 7);

-- Metas de un vínculo como jsonb (sin las vacías). INTERNA.
create or replace function grasa.goals_json(p_link uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_strip_nulls(jsonb_build_object(
      'weight_kg', l.goal_weight_kg, 'waist_cm', l.goal_waist_cm, 'protein_g', l.protein_goal_g,
      'water_days', l.goal_water_days, 'steps_days', l.goal_steps_days, 'sleep_days', l.goal_sleep_days, 'trained_days', l.goal_trained_days))
    from grasa.coach_links l where l.id = p_link), '{}'::jsonb);
$$;

-- El coach fija TODAS las metas de una vez: lo que no viene (o viene null) queda vacío. Claves desconocidas = invalid.
create or replace function grasa.set_goals(p_client uuid, p_goals jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_coach_of(p_client); g jsonb := coalesce(p_goals, '{}'::jsonb); k text; lid uuid;
  w numeric; wa numeric; pr int; d1 int; d2 int; d3 int; d4 int;
begin
  if jsonb_typeof(g) <> 'object' then raise exception 'invalid' using errcode = '22023'; end if;
  for k in select jsonb_object_keys(g) loop
    if k not in ('weight_kg', 'waist_cm', 'protein_g', 'water_days', 'steps_days', 'sleep_days', 'trained_days') then
      raise exception 'invalid' using errcode = '22023', detail = 'meta desconocida: ' || left(k, 30);
    end if;
    if g -> k <> 'null'::jsonb and jsonb_typeof(g -> k) <> 'number' then raise exception 'invalid' using errcode = '22023', detail = 'la meta debe ser un número'; end if;
  end loop;
  w := round((g ->> 'weight_kg')::numeric, 1); wa := round((g ->> 'waist_cm')::numeric, 1);
  pr := (g ->> 'protein_g')::numeric; d1 := (g ->> 'water_days')::numeric; d2 := (g ->> 'steps_days')::numeric;
  d3 := (g ->> 'sleep_days')::numeric; d4 := (g ->> 'trained_days')::numeric;
  if (w is not null and w not between 30 and 300) or (wa is not null and wa not between 40 and 200) or (pr is not null and pr not between 20 and 400)
     or (d1 is not null and d1 not between 1 and 7) or (d2 is not null and d2 not between 1 and 7)
     or (d3 is not null and d3 not between 1 and 7) or (d4 is not null and d4 not between 1 and 7) then
    raise exception 'invalid' using errcode = '22023', detail = 'meta fuera de rango';
  end if;
  update grasa.coach_links set goal_weight_kg = w, goal_waist_cm = wa, protein_goal_g = pr, goal_water_days = d1, goal_steps_days = d2,
         goal_sleep_days = d3, goal_trained_days = d4, updated_at = now()
    where coach_id = uid and client_id = p_client and status = 'active' returning id into lid;
  return jsonb_build_object('client_id', p_client, 'goals', grasa.goals_json(lid));
end $$;

-- my_link: mismo cuerpo que v1.11 + `goals` (cambian las columnas: borrar y volver a crear).
drop function if exists grasa.my_link();
create function grasa.my_link()
returns table (id uuid, coach_id uuid, business_name text, share_body boolean, share_notes boolean,
               share_nutrition boolean, share_habits boolean, share_photos boolean, since timestamptz,
               paid_until date, paid_marked_at timestamptz, paid boolean, days_left int,
               protein_goal_g int, pauses jsonb, goals jsonb)
language sql stable security definer set search_path = '' as $$
  select l.id, l.coach_id, c.business_name, l.share_body, l.share_notes, l.share_nutrition, l.share_habits,
         l.share_photos, l.created_at, l.paid_until, l.paid_marked_at,
         (l.paid_until is not null and l.paid_until >= grasa.today_bogota()),
         case when l.paid_until is null then null else l.paid_until - grasa.today_bogota() end,
         l.protein_goal_g, grasa.link_pauses_json(l.id), grasa.goals_json(l.id)
  from grasa.coach_links l
  join grasa.coaches c on c.user_id = l.coach_id
  where l.client_id = auth.uid() and l.status = 'active'
  limit 1;
$$;

-- coach_clients: mismo cuerpo que v1.12 + `goals`.
drop function if exists grasa.coach_clients();
create function grasa.coach_clients()
returns table (client_id uuid, display_name text, link_id uuid, since timestamptz, shares jsonb,
               last_activity timestamptz, over_free_limit boolean,
               paid_until date, paid_marked_at timestamptz, paid boolean, days_left int,
               protein_goal_g int, health_restriction boolean, pregnancy_state boolean, pauses jsonb, pain_reported date, goals jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform grasa.require_coach_agreement();
  return query
  select l.client_id, p.display_name, l.id, l.created_at,
         jsonb_build_object('body', l.share_body, 'notes', l.share_notes, 'nutrition', l.share_nutrition,
                            'habits', l.share_habits, 'photos', l.share_photos),
         (select max(r.server_updated_at) from grasa.records r
          where r.user_id = l.client_id and not r.pause_private
            and core.consent_is_granted(l.client_id, 'grasa', 'sensitive_health')
            and core.consent_is_granted(l.client_id, 'grasa', 'cloud_transfer')
            and (r.kind in ('profile','entry') or (r.kind = 'food' and l.share_nutrition) or (r.kind = 'habit' and l.share_habits))),
         row_number() over (order by l.created_at, l.id) > c.free_clients,
         l.paid_until, l.paid_marked_at,
         (l.paid_until is not null and l.paid_until >= grasa.today_bogota()),
         case when l.paid_until is null then null else l.paid_until - grasa.today_bogota() end,
         l.protein_goal_g,
         grasa.coach_can_see(l.client_id, 'body') and grasa.health_flag(l.client_id, 'condition'),
         grasa.coach_can_see(l.client_id, 'body') and grasa.health_flag(l.client_id, 'pregnancy'),
         grasa.link_pauses_json(l.id),
         case when c.active and core.consent_is_granted(l.client_id, 'grasa', 'sensitive_health')
                   and core.consent_is_granted(l.client_id, 'grasa', 'cloud_transfer')
              then grasa.pain_flag(l.client_id) end,
         grasa.goals_json(l.id)
  from grasa.coach_links l
  join grasa.coaches c on c.user_id = l.coach_id
  left join core.profiles p on p.id = l.client_id
  where l.coach_id = auth.uid() and l.status = 'active'
  order by l.created_at;
end $$;

-- ============ K2: analítica del coach (agregada en el servidor) ============
-- Peso o cintura numérico de un registro (null si no es número). INTERNA.
create or replace function grasa.num_of(p_data jsonb, p_key text) returns numeric
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p_data -> p_key) = 'number' then (p_data ->> p_key)::numeric end;
$$;

create or replace function grasa.coach_analytics(p_from date, p_to date)
returns table (client_id uuid, shares_habits boolean, shares_nutrition boolean, since date,
               log_days date[], trained_days date[], weight_weeks jsonb,
               weight_first numeric, weight_last numeric, waist_first numeric, waist_last numeric)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_active_coach(); today date := grasa.today_bogota();
begin
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 92 or p_to > today + 2 or p_from < today - 400 then
    raise exception 'invalid' using errcode = '22023', detail = 'rango de fechas no válido';
  end if;
  return query
  with v as (   -- lo que el coach ya ve con coach_pull: vínculo activo, A3 + A4, permisos, sin pausa privada, sin lápidas
    select l.client_id as cid, l.share_habits as sh, l.share_nutrition as sn, (l.created_at at time zone 'America/Bogota')::date as since_d
    from grasa.coach_links l
    where l.coach_id = uid and l.status = 'active' and grasa.coach_can_see(l.client_id, 'body')
  ), rec as (
    select v.cid, r.kind, coalesce(r.date, case when r.nkey ~ '^\d{4}-\d{2}-\d{2}$' then r.nkey::date end) as d, r.data
    from v join grasa.records r on r.user_id = v.cid
    where not r.pause_private and r.deleted_at is null
      and (r.kind = 'entry' or (r.kind = 'food' and v.sn) or (r.kind = 'habit' and v.sh))
  )
  select v.cid, v.sh, v.sn, v.since_d,
    coalesce((select array_agg(distinct x.d order by x.d) from rec x where x.cid = v.cid and x.d between p_from and p_to
              and (x.kind <> 'habit' or x.data <> '{}'::jsonb)), '{}'::date[]),
    case when v.sh then coalesce((select array_agg(distinct x.d order by x.d) from rec x where x.cid = v.cid and x.kind = 'habit'
              and x.d between p_from and p_to and x.data -> 'trained' = 'true'::jsonb), '{}'::date[]) end,
    coalesce((select jsonb_agg(jsonb_build_object('w', w.k, 'kg', w.kg) order by w.k)
              from (select (p_to - x.d) / 7 as k, round(avg(grasa.num_of(x.data, 'weight')), 2) as kg
                    from rec x where x.cid = v.cid and x.kind = 'entry' and grasa.num_of(x.data, 'weight') is not null
                      and x.d <= p_to and x.d > p_to - 42
                    group by 1) w), '[]'::jsonb),
    (select grasa.num_of(x.data, 'weight') from rec x where x.cid = v.cid and x.kind = 'entry' and grasa.num_of(x.data, 'weight') is not null and x.d <= p_to order by x.d asc limit 1),
    (select grasa.num_of(x.data, 'weight') from rec x where x.cid = v.cid and x.kind = 'entry' and grasa.num_of(x.data, 'weight') is not null and x.d <= p_to order by x.d desc limit 1),
    (select grasa.num_of(x.data, 'waist') from rec x where x.cid = v.cid and x.kind = 'entry' and grasa.num_of(x.data, 'waist') is not null and x.d <= p_to order by x.d asc limit 1),
    (select grasa.num_of(x.data, 'waist') from rec x where x.cid = v.cid and x.kind = 'entry' and grasa.num_of(x.data, 'waist') is not null and x.d <= p_to order by x.d desc limit 1)
  from v
  order by v.since_d, v.cid;
end $$;

-- ============ K5: días en que el coach abrió su panel (solo la fecha) ============
create table if not exists grasa.coach_panel_days (
  coach_id uuid not null references auth.users(id) on delete cascade,
  day      date not null,
  primary key (coach_id, day)
);
alter table grasa.coach_panel_days enable row level security;
revoke all on grasa.coach_panel_days from public, anon, authenticated, service_role;

create or replace function grasa.coach_panel_opened(p_day date) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); today date := grasa.today_bogota();
begin
  if not exists (select 1 from grasa.coaches c where c.user_id = uid) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_day is null or p_day not between today - 1 and today + 1 then raise exception 'invalid' using errcode = '22023'; end if;
  insert into grasa.coach_panel_days (coach_id, day) values (uid, p_day) on conflict do nothing;
  delete from grasa.coach_panel_days where coach_id = uid and day < today - 120;
end $$;

-- ============ K3: panel admin ============
create or replace function grasa.require_admin() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  if not core.has_role('grasa', 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  return uid;
end $$;

-- ¿Ese asesorado cuenta como ACTIVO del mes? MISMA regla que grasa.billing_active_clients: vínculo activo (con ese coach) y ≥ 1 registro
-- sincronizado en los 30 días previos al cierre del mes. INTERNA.
create or replace function grasa.client_active_in_month(p_coach uuid, p_client uuid, p_month date) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from grasa.coach_links l where l.coach_id = p_coach and l.client_id = p_client and l.status = 'active')
     and exists (select 1 from grasa.records r where r.user_id = p_client
                 and r.server_updated_at >= (date_trunc('month', p_month) + interval '1 month') - interval '30 days'
                 and r.server_updated_at < date_trunc('month', p_month) + interval '1 month');
$$;
create or replace function grasa.coach_active_clients(p_coach uuid, p_month date) returns int
language sql stable security definer set search_path = '' as $$
  select count(distinct l.client_id)::int from grasa.coach_links l
  where l.coach_id = p_coach and l.status = 'active' and grasa.client_active_in_month(p_coach, l.client_id, p_month);
$$;
-- Día de referencia de un mes: su último día, o hoy si el mes está en curso. INTERNA.
create or replace function grasa.month_ref(p_month date) returns date
language sql stable set search_path = '' as $$
  select least((date_trunc('month', p_month) + interval '1 month' - interval '1 day')::date, grasa.today_bogota());
$$;

-- Registro de suspensiones (motivo opcional que solo ve el admin).
create table if not exists grasa.coach_admin_events (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references auth.users(id) on delete cascade,
  active     boolean not null,
  reason     text null check (char_length(reason) <= 200),
  admin_id   uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table grasa.coach_admin_events enable row level security;
revoke all on grasa.coach_admin_events from public, anon, authenticated, service_role;

-- M7: coaches y cobro del mes. Solo identidad del COACH (negocio y nombre) y cantidades; nada de sus asesorados.
create or replace function grasa.admin_coaches(p_month date)
returns table (coach_id uuid, business_name text, coach_name text, active boolean, free_clients int,
               active_clients int, over_free int, linked_clients int, created_at timestamptz, last_reason text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform grasa.require_admin();
  if p_month is null then raise exception 'invalid' using errcode = '22023'; end if;
  return query
  select c.user_id, c.business_name, coalesce(pr.display_name, ''), c.active, c.free_clients,
         grasa.coach_active_clients(c.user_id, p_month),
         greatest(grasa.coach_active_clients(c.user_id, p_month) - c.free_clients, 0),
         (select count(*)::int from grasa.coach_links l where l.coach_id = c.user_id and l.status = 'active'),
         c.created_at,
         (select e.reason from grasa.coach_admin_events e where e.coach_id = c.user_id order by e.created_at desc limit 1)
  from grasa.coaches c left join core.profiles pr on pr.id = c.user_id
  order by c.active desc, c.business_name;
end $$;

create or replace function grasa.admin_set_coach_active(p_coach uuid, p_active boolean, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_admin(); r text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if p_active is null or char_length(coalesce(r, '')) > 200 then raise exception 'invalid' using errcode = '22023'; end if;
  update grasa.coaches set active = p_active where user_id = p_coach;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into grasa.coach_admin_events (coach_id, active, reason, admin_id) values (p_coach, p_active, r, uid);
  return jsonb_build_object('coach_id', p_coach, 'active', p_active);
end $$;

-- M8: uso general, solo totales.
create or replace function grasa.admin_usage(p_month date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ref date; m0 date; m1 date; out jsonb;
begin
  perform grasa.require_admin();
  if p_month is null then raise exception 'invalid' using errcode = '22023'; end if;
  ref := grasa.month_ref(p_month); m0 := date_trunc('month', p_month)::date; m1 := (m0 + interval '1 month')::date;
  with sizes as (select grasa.coach_active_clients(c.user_id, p_month) n from grasa.coaches c where c.active),
       cohort as (select l.status from grasa.coach_links l
                  where (l.created_at at time zone 'America/Bogota')::date >= ref - 60 and (l.created_at at time zone 'America/Bogota')::date < ref - 30)
  select jsonb_build_object(
    'coaches_active', (select count(*) from grasa.coaches c where c.active),
    'coaches_total', (select count(*) from grasa.coaches),
    'coaches_new', (select count(*) from grasa.coaches c where c.created_at >= m0 and c.created_at < m1),
    'clients_active', (select coalesce(sum(n), 0) from sizes),
    'signups', (select count(*) from grasa.coach_links l where l.created_at >= m0 and l.created_at < m1),
    'drops', (select count(*) from grasa.coach_links l where l.ended_at >= m0 and l.ended_at < m1),
    'retention30', jsonb_build_object('cohort', (select count(*) from cohort), 'kept', (select count(*) from cohort where status = 'active')),
    'sizes', jsonb_build_object('s1_5', (select count(*) from sizes where n between 1 and 5), 's6_10', (select count(*) from sizes where n between 6 and 10),
                                's11', (select count(*) from sizes where n >= 11)),
    'weeks', (select jsonb_agg(jsonb_build_object('start', ref - 7 * k - 6, 'records',
               (select count(*) from grasa.records r
                where r.kind in ('entry', 'food', 'habit') and r.deleted_at is null and r.date between ref - 7 * k - 6 and ref - 7 * k
                  and exists (select 1 from grasa.coach_links l where l.client_id = r.user_id and l.status = 'active'))) order by k desc)
              from generate_series(0, 7) k),
    'ref', ref) into out;
  return out;
end $$;

-- M9: uso de UN coach. Solo conteos; con menos de 3 asesorados activos, los porcentajes y los entrenos por semana salen null (no se puede
-- deducir a una persona). Nunca pesos, medidas, comidas, fotos ni salud.
create or replace function grasa.admin_coach_usage(p_coach uuid, p_month date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ref date; n int; out jsonb; c grasa.coaches;
begin
  perform grasa.require_admin();
  select * into c from grasa.coaches where user_id = p_coach;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_month is null then raise exception 'invalid' using errcode = '22023'; end if;
  ref := grasa.month_ref(p_month);
  n := grasa.coach_active_clients(p_coach, p_month);
  with lk as (select l.client_id, l.share_habits, (l.created_at at time zone 'America/Bogota')::date as since_d
              from grasa.coach_links l where l.coach_id = p_coach and l.status = 'active'),
       cohort as (select l.status from grasa.coach_links l where l.coach_id = p_coach
                  and (l.created_at at time zone 'America/Bogota')::date >= ref - 60 and (l.created_at at time zone 'America/Bogota')::date < ref - 30)
  select jsonb_build_object(
    'active_clients', n,
    'retention30', jsonb_build_object('cohort', (select count(*) from cohort), 'kept', (select count(*) from cohort where status = 'active')),
    'last_action_at', greatest(
        (select max(x.created_at) from grasa.comments x where x.coach_id = p_coach),
        (select max(l.paid_marked_at) from grasa.coach_links l where l.coach_id = p_coach),
        (select max(t.updated_at) from grasa.routine_templates t where t.coach_id = p_coach),
        (select max(t.updated_at) from grasa.routines t where t.coach_id = p_coach),
        (select max(t.created_at) from grasa.challenges t where t.coach_id = p_coach)),
    'last_panel_day', (select max(d.day) from grasa.coach_panel_days d where d.coach_id = p_coach),
    'panel_days', coalesce((select jsonb_agg(d.day order by d.day) from grasa.coach_panel_days d where d.coach_id = p_coach and d.day between ref - 6 and ref), '[]'::jsonb),
    'weeks', (select jsonb_agg(jsonb_build_object('start', ref - 7 * k - 6,
               'pct_logging', case when (select count(*) from lk where lk.since_d <= ref - 7 * k) >= 3 then
                  round(100.0 * (select count(*) from lk where lk.since_d <= ref - 7 * k and exists (
                      select 1 from grasa.records r where r.user_id = lk.client_id and r.deleted_at is null and not r.pause_private
                        and r.kind in ('entry', 'food', 'habit') and r.date between ref - 7 * k - 6 and ref - 7 * k))
                    / (select count(*) from lk where lk.since_d <= ref - 7 * k)) end,
               'trained', case when (select count(*) from lk where lk.share_habits) >= 3 then
                  (select count(*) from lk join grasa.records r on r.user_id = lk.client_id
                   where lk.share_habits and r.kind = 'habit' and r.deleted_at is null and not r.pause_private
                     and r.date between ref - 7 * k - 6 and ref - 7 * k and r.data -> 'trained' = 'true'::jsonb) end) order by k desc)
              from generate_series(0, 7) k),
    'ref', ref) into out;
  return out;
end $$;

-- «Coaches con mayor éxito» (concepto 5, punto 6): SOLO negocio y adherencia. Nunca kilos, centímetros ni cambios corporales.
--   habits_pct     % de sus asesorados que comparten hábitos y completaron alguno (agua ≥ 2 L, pasos ≥ 8000, sueño ≥ 7 h o entrenó) en ≥ 4 de los
--                  últimos 7 días (mismas reglas de «cumplido» que habitos.js). null con menos de 3 asesorados que comparten hábitos.
--   retention_90 / retention_180   % de los vínculos que empezaron hace 3 a 6 meses (o 6 a 12) que siguen activos. null sin cohorte.
--   on_time_pct    % de sus vínculos activos que están al día con el pago (paid_until ≥ hoy). null sin asesorados.
create or replace function grasa.admin_success(p_month date)
returns table (coach_id uuid, business_name text, habits_pct int, habits_group int, retention_90 int, cohort_90 int,
               retention_180 int, cohort_180 int, on_time_pct int, paying_group int)
language plpgsql stable security definer set search_path = '' as $$
declare ref date;
begin
  perform grasa.require_admin();
  if p_month is null then raise exception 'invalid' using errcode = '22023'; end if;
  ref := grasa.month_ref(p_month);
  return query
  with lk as (select l.coach_id, l.client_id, l.share_habits, l.paid_until from grasa.coach_links l where l.status = 'active'),
       hab as (select lk.coach_id, lk.client_id,
                 (select count(distinct r.date) from grasa.records r where r.user_id = lk.client_id and r.kind = 'habit' and r.deleted_at is null
                    and not r.pause_private and r.date between ref - 6 and ref
                    and (coalesce(grasa.num_of(r.data, 'water'), 0) >= 2 or coalesce(grasa.num_of(r.data, 'steps'), 0) >= 8000
                         or coalesce(grasa.num_of(r.data, 'sleep'), 0) >= 7 or r.data -> 'trained' = 'true'::jsonb)) as ok_days
               from lk where lk.share_habits),
       coh as (select l.coach_id,
                 count(*) filter (where l.created_at::date between ref - 180 and ref - 90) as c90,
                 count(*) filter (where l.created_at::date between ref - 180 and ref - 90 and l.status = 'active') as k90,
                 count(*) filter (where l.created_at::date between ref - 365 and ref - 181) as c180,
                 count(*) filter (where l.created_at::date between ref - 365 and ref - 181 and l.status = 'active') as k180
               from grasa.coach_links l group by l.coach_id)
  select c.user_id, c.business_name,
    case when (select count(*) from hab h where h.coach_id = c.user_id) >= 3 then
      round(100.0 * (select count(*) from hab h where h.coach_id = c.user_id and h.ok_days >= 4) / (select count(*) from hab h where h.coach_id = c.user_id))::int end,
    (select count(*)::int from hab h where h.coach_id = c.user_id),
    case when coalesce(co.c90, 0) > 0 then round(100.0 * co.k90 / co.c90)::int end, coalesce(co.c90, 0)::int,
    case when coalesce(co.c180, 0) > 0 then round(100.0 * co.k180 / co.c180)::int end, coalesce(co.c180, 0)::int,
    case when (select count(*) from lk where lk.coach_id = c.user_id) > 0 then
      round(100.0 * (select count(*) from lk where lk.coach_id = c.user_id and lk.paid_until >= grasa.today_bogota())
            / (select count(*) from lk where lk.coach_id = c.user_id))::int end,
    (select count(*)::int from lk where lk.coach_id = c.user_id)
  from grasa.coaches c left join coh co on co.coach_id = c.user_id
  order by c.business_name;
end $$;

-- ============ K6: avisos de la plataforma (solo comunicación operativa, técnica o de servicio) ============
create table if not exists grasa.platform_notices (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(title) between 3 and 80),
  body       text not null check (char_length(body) between 3 and 400),
  starts_on  date not null,
  ends_on    date not null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz null,
  check (starts_on <= ends_on and ends_on - starts_on <= 90)
);
alter table grasa.platform_notices enable row level security;
revoke all on grasa.platform_notices from public, anon, authenticated, service_role;

create or replace function grasa.admin_save_notice(p_id uuid, p_title text, p_body text, p_from date, p_to date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_admin(); t text := btrim(coalesce(p_title, '')); b text := btrim(coalesce(p_body, '')); n grasa.platform_notices;
begin
  if char_length(t) not between 3 and 80 or char_length(b) not between 3 and 400 or p_from is null or p_to is null or p_from > p_to
     or p_to - p_from > 90 or p_to < grasa.today_bogota() - 1 then
    raise exception 'invalid' using errcode = '22023';
  end if;
  if p_id is null then
    insert into grasa.platform_notices (title, body, starts_on, ends_on, created_by) values (t, b, p_from, p_to, uid) returning * into n;
  else
    update grasa.platform_notices set title = t, body = b, starts_on = p_from, ends_on = p_to where id = p_id and deleted_at is null returning * into n;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;
  return jsonb_build_object('id', n.id, 'title', n.title, 'body', n.body, 'starts_on', n.starts_on, 'ends_on', n.ends_on, 'created_at', n.created_at);
end $$;

create or replace function grasa.admin_list_notices()
returns table (id uuid, title text, body text, starts_on date, ends_on date, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform grasa.require_admin();
  return query select n.id, n.title, n.body, n.starts_on, n.ends_on, n.created_at from grasa.platform_notices n
    where n.deleted_at is null order by n.starts_on desc, n.created_at desc limit 50;
end $$;

create or replace function grasa.admin_delete_notice(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform grasa.require_admin();
  update grasa.platform_notices set deleted_at = now() where id = p_id and deleted_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end $$;

-- Coach ACTIVO: avisos vigentes en su día (el del teléfono; hoy ± 1 respecto de Bogotá).
create or replace function grasa.coach_notices(p_today date)
returns table (id uuid, title text, body text, starts_on date, ends_on date)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); today date := grasa.today_bogota();
begin
  if not exists (select 1 from grasa.coaches c where c.user_id = uid and c.active) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_today is null or p_today not between today - 1 and today + 1 then raise exception 'invalid' using errcode = '22023'; end if;
  return query select n.id, n.title, n.body, n.starts_on, n.ends_on from grasa.platform_notices n
    where n.deleted_at is null and p_today between n.starts_on and n.ends_on order by n.starts_on desc, n.created_at desc limit 3;
end $$;

-- ============ K4: un coach suspendido no deja a sus asesorados en pausa por pago ============
-- Mismo cuerpo que en r1_pagos_coach + «el coach del vínculo está activo».
create or replace function grasa.client_payment_blocked(p_client uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from grasa.coach_links l join grasa.coaches c on c.user_id = l.coach_id and c.active
                 where l.client_id = p_client and l.status = 'active'
                   and (l.paid_until is null or l.paid_until < grasa.today_bogota()));
$$;

-- ============ Permisos: nada por defecto; solo authenticated en las RPC (que comprueban el rol dentro). Nunca anon. ============
revoke execute on function grasa.goals_json(uuid), grasa.set_goals(uuid, jsonb), grasa.my_link(), grasa.coach_clients(),
  grasa.num_of(jsonb, text), grasa.coach_analytics(date, date), grasa.coach_panel_opened(date), grasa.require_admin(),
  grasa.client_active_in_month(uuid, uuid, date), grasa.coach_active_clients(uuid, date), grasa.month_ref(date),
  grasa.admin_coaches(date), grasa.admin_set_coach_active(uuid, boolean, text), grasa.admin_usage(date), grasa.admin_coach_usage(uuid, date),
  grasa.admin_success(date), grasa.admin_save_notice(uuid, text, text, date, date), grasa.admin_list_notices(), grasa.admin_delete_notice(uuid),
  grasa.coach_notices(date), grasa.client_payment_blocked(uuid)
  from public, anon, authenticated, service_role;
grant execute on function grasa.set_goals(uuid, jsonb), grasa.my_link(), grasa.coach_clients(), grasa.coach_analytics(date, date),
  grasa.coach_panel_opened(date), grasa.admin_coaches(date), grasa.admin_set_coach_active(uuid, boolean, text), grasa.admin_usage(date),
  grasa.admin_coach_usage(uuid, date), grasa.admin_success(date), grasa.admin_save_notice(uuid, text, text, date, date), grasa.admin_list_notices(),
  grasa.admin_delete_notice(uuid), grasa.coach_notices(date)
  to authenticated;

-- ======== 20261101120000_r1_exportar_excel.sql ========
-- R1 v1.14 · M6 «Exportar a Excel» del coach (concepto jurídico 6, 25/10/2026). Aditiva e idempotente: se aplica encima de v1.13.
--   X1  grasa.coach_exports: registro de CADA exportación. Guarda quién (el coach), cuándo, CUÁNTOS asesorados (un número: nunca quiénes),
--       qué categorías (medidas, comidas, habitos, entrenos), el rango de fechas, que la casilla de custodia se marcó y con qué versión del
--       acuerdo. NUNCA el contenido de los datos. Nadie la lee por la API de tablas (RLS sin políticas y sin permisos).
--   X2  grasa.log_export(...): la llama la app ANTES de entregar el archivo. Exige coach ACTIVO, con el acuerdo vigente y, además, con la
--       versión del acuerdo que trae la cláusula 14 «Descarga y custodia local de datos de los asesorados» (0.5-A7-coach) como ÚLTIMA aceptación
--       registrada (si no: forbidden, detail 'export_agreement_required'); la casilla marcada (si no: invalid, 'custody_required'); al menos un
--       asesorado y no más de los que tiene vinculados y visibles; categorías conocidas (las fotos no existen como categoría); rango válido.
--       Límite: 60 exportaciones por coach y día.
--       Los DATOS del archivo salen de coach_pull (mismos permisos de siempre: vínculo activo, A3 + A4 del asesorado, comidas y hábitos solo si los
--       comparte, notas solo con share_notes, nunca pause_private, nunca fotos, salud L4 ni dolor): esta migración no abre ningún dato nuevo.
--   X3  grasa.my_exports(): el coach ve SU propio historial (las 50 últimas).
--   X4  Admin (M9): grasa.admin_coach_usage añade `exports` = CUÁNTAS exportaciones hizo ese coach en el mes. Solo la cantidad.
-- Fuera de alcance: las alertas L6, la tarjeta 106/192 y las cláusulas 7.3/7.4 (Etapa 3).

-- ============ X1: registro de exportaciones (sin contenido) ============
create table if not exists grasa.coach_exports (
  id                uuid primary key default gen_random_uuid(),
  coach_id          uuid not null references auth.users(id) on delete cascade,
  created_at        timestamptz not null default now(),
  clients_count     int not null check (clients_count between 1 and 1000),
  categories        text[] not null check (cardinality(categories) between 1 and 4
                      and categories <@ array['medidas', 'comidas', 'habitos', 'entrenos']::text[]),
  date_from         date not null,
  date_to           date not null,
  custody_ack       boolean not null check (custody_ack),
  agreement_version text not null check (char_length(agreement_version) between 1 and 20),
  check (date_from <= date_to)
);
create index if not exists coach_exports_coach on grasa.coach_exports (coach_id, created_at desc);
alter table grasa.coach_exports enable row level security;
revoke all on grasa.coach_exports from public, anon, authenticated, service_role;

-- Versiones del acuerdo del coach que traen la cláusula 14 (las mismas que CT.A7_EXPORT_VERSIONS en consent-texts-solo.js). INTERNA.
create or replace function grasa.export_agreement_versions() returns text[]
language sql immutable set search_path = '' as $$ select array['0.5-A7-coach']::text[] $$;

-- ¿La ÚLTIMA aceptación del acuerdo registrada por ese coach está vigente y trae la cláusula 14? Devuelve su versión o null. INTERNA.
create or replace function grasa.export_agreement_of(p_coach uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when x.granted and x.version = any (grasa.export_agreement_versions()) then x.version end
  from (select e.granted, e.version from core.consent_events e
        where e.user_id = p_coach and e.app_id = 'grasa' and e.kind = 'coach_agreement'
        order by e.created_at desc, e.client_at desc, e.id desc limit 1) x;
$$;

-- ============ X2: registrar una exportación ============
create or replace function grasa.log_export(p_clients int, p_categories text[], p_from date, p_to date, p_custody boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_active_coach(); today date := grasa.today_bogota(); ver text; cats text[]; n int; r grasa.coach_exports;
begin
  ver := grasa.export_agreement_of(uid);
  if ver is null then raise exception 'forbidden' using errcode = '42501', detail = 'export_agreement_required'; end if;
  if p_custody is distinct from true then raise exception 'invalid' using errcode = '22023', detail = 'custody_required'; end if;
  select array_agg(distinct c order by c) into cats from unnest(coalesce(p_categories, '{}'::text[])) c;
  if cats is null or cardinality(cats) > 4 or not cats <@ array['medidas', 'comidas', 'habitos', 'entrenos']::text[] then
    raise exception 'invalid' using errcode = '22023', detail = 'categoría no válida';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to > today + 1 or p_from < today - 3660 then
    raise exception 'invalid' using errcode = '22023', detail = 'rango de fechas no válido';
  end if;
  select count(*) into n from grasa.coach_links l
    where l.coach_id = uid and l.status = 'active' and grasa.coach_can_see(l.client_id, 'body');
  if p_clients is null or p_clients < 1 or p_clients > n then
    raise exception 'invalid' using errcode = '22023', detail = 'número de asesorados no válido';
  end if;
  if (select count(*) from grasa.coach_exports e where e.coach_id = uid and e.created_at > now() - interval '1 day') >= 60 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  insert into grasa.coach_exports (coach_id, clients_count, categories, date_from, date_to, custody_ack, agreement_version)
    values (uid, p_clients, cats, p_from, p_to, true, ver) returning * into r;
  return jsonb_build_object('id', r.id, 'created_at', r.created_at, 'clients', r.clients_count, 'categories', to_jsonb(r.categories),
                            'from', r.date_from, 'to', r.date_to);
end $$;

-- ============ X3: historial propio del coach ============
create or replace function grasa.my_exports()
returns table (id uuid, created_at timestamptz, clients int, categories text[], date_from date, date_to date)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  if not exists (select 1 from grasa.coaches c where c.user_id = uid) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select e.id, e.created_at, e.clients_count, e.categories, e.date_from, e.date_to
    from grasa.coach_exports e where e.coach_id = uid order by e.created_at desc limit 50;
end $$;

-- ============ X4: M9, solo la CANTIDAD de exportaciones del coach en el mes (mismo cuerpo que v1.13 + `exports`) ============
create or replace function grasa.admin_coach_usage(p_coach uuid, p_month date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ref date; n int; out jsonb; c grasa.coaches;
begin
  perform grasa.require_admin();
  select * into c from grasa.coaches where user_id = p_coach;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_month is null then raise exception 'invalid' using errcode = '22023'; end if;
  ref := grasa.month_ref(p_month);
  n := grasa.coach_active_clients(p_coach, p_month);
  with lk as (select l.client_id, l.share_habits, (l.created_at at time zone 'America/Bogota')::date as since_d
              from grasa.coach_links l where l.coach_id = p_coach and l.status = 'active'),
       cohort as (select l.status from grasa.coach_links l where l.coach_id = p_coach
                  and (l.created_at at time zone 'America/Bogota')::date >= ref - 60 and (l.created_at at time zone 'America/Bogota')::date < ref - 30)
  select jsonb_build_object(
    'active_clients', n,
    'retention30', jsonb_build_object('cohort', (select count(*) from cohort), 'kept', (select count(*) from cohort where status = 'active')),
    'last_action_at', greatest(
        (select max(x.created_at) from grasa.comments x where x.coach_id = p_coach),
        (select max(l.paid_marked_at) from grasa.coach_links l where l.coach_id = p_coach),
        (select max(t.updated_at) from grasa.routine_templates t where t.coach_id = p_coach),
        (select max(t.updated_at) from grasa.routines t where t.coach_id = p_coach),
        (select max(t.created_at) from grasa.challenges t where t.coach_id = p_coach)),
    'last_panel_day', (select max(d.day) from grasa.coach_panel_days d where d.coach_id = p_coach),
    'panel_days', coalesce((select jsonb_agg(d.day order by d.day) from grasa.coach_panel_days d where d.coach_id = p_coach and d.day between ref - 6 and ref), '[]'::jsonb),
    'weeks', (select jsonb_agg(jsonb_build_object('start', ref - 7 * k - 6,
               'pct_logging', case when (select count(*) from lk where lk.since_d <= ref - 7 * k) >= 3 then
                  round(100.0 * (select count(*) from lk where lk.since_d <= ref - 7 * k and exists (
                      select 1 from grasa.records r where r.user_id = lk.client_id and r.deleted_at is null and not r.pause_private
                        and r.kind in ('entry', 'food', 'habit') and r.date between ref - 7 * k - 6 and ref - 7 * k))
                    / (select count(*) from lk where lk.since_d <= ref - 7 * k)) end,
               'trained', case when (select count(*) from lk where lk.share_habits) >= 3 then
                  (select count(*) from lk join grasa.records r on r.user_id = lk.client_id
                   where lk.share_habits and r.kind = 'habit' and r.deleted_at is null and not r.pause_private
                     and r.date between ref - 7 * k - 6 and ref - 7 * k and r.data -> 'trained' = 'true'::jsonb) end) order by k desc)
              from generate_series(0, 7) k),
    -- v1.14 (M6): SOLO cuántas exportaciones a Excel hizo el coach en el mes. Nunca quién, qué asesorados ni qué datos.
    'exports', (select count(*) from grasa.coach_exports e where e.coach_id = p_coach
                and e.created_at >= date_trunc('month', p_month) and e.created_at < date_trunc('month', p_month) + interval '1 month'),
    'ref', ref) into out;
  return out;
end $$;

-- ============ Permisos: nada por defecto; solo authenticated en las RPC (que comprueban el rol dentro). Nunca anon. ============
revoke execute on function grasa.export_agreement_versions(), grasa.export_agreement_of(uuid), grasa.log_export(int, text[], date, date, boolean),
  grasa.my_exports(), grasa.admin_coach_usage(uuid, date)
  from public, anon, authenticated, service_role;
grant execute on function grasa.log_export(int, text[], date, date, boolean), grasa.my_exports(), grasa.admin_coach_usage(uuid, date) to authenticated;

-- ======== 20261102120000_r1_puntos_meta.sql ========
-- R1 v1.15 · Puntos de constancia personales, meta colectiva del team y ranking privado sin kilos (concepto jurídico 7, 26/10/2026).
-- Aditiva e idempotente: se aplica encima de v1.14. Contrato: equipo/r1-contrato.md §24. Pruebas: supabase/tests/190_puntos_meta.test.sql.
--   Q1  grasa.points_log: puntos de constancia por persona, día y fuente. Los CALCULA EL SERVIDOR (un disparador sobre grasa.records y otro
--       sobre grasa.challenge_marks) con las reglas de la propuesta de gamificación aprobada; el teléfono nunca envía puntos, así que no se
--       pueden inventar. Nadie lee ni escribe la tabla por la API (RLS sin políticas y sin permisos).
--       Reglas (las mismas que puntos.js, la referencia ejecutable del servidor falso):
--         · registrar el día 2 · agua cumplida 1 (≥ 8 vasos = 2 L) · pasos 1 (≥ 8.000) · sueño 1 (7 a 10 h) · comidas 1 (≥ 2 registradas)
--         · entreno 3, solo hasta los entrenos por semana del plan (la meta de días de entreno del coach; 5 si no hay)
--         · descanso planificado o «me siento mal» (hábito `rest` = 'plan' | 'sick', sin entreno ese día) 2, hasta los días de descanso del plan
--           (7 − entrenos del plan, mínimo 1 y máximo 3 por semana)
--         · medidas 3 por REGISTRAR, una vez por semana y con 6 días o más entre registros con puntos. Nunca por el valor.
--         · volver tras más de 7 días sin registrar 5 (una vez cada 30 días)
--         · bonos: semana constante 5 (el lunes, por la semana anterior; misma regla de comodines que constancia.js) y reto del coach cumplido
--           10 (máximo 2 por semana). Un día de reto cuenta para los puntos SOLO si ese día hay registro real (a tiempo) del hábito del reto.
--         · tope 12 al día (sin contar los bonos) y 80 a la semana (lunes a domingo, hora de Bogotá).
--         · solo cuentan registros de HOY y AYER (y mañana, por el desfase de zona horaria del teléfono): lo que llega más tarde se guarda pero
--           no da puntos, y los puntos de un día pasado quedan fijos. Los de hoy y ayer se recalculan desde lo registrado (editar no suma doble).
--         · valores raros (más de 60.000 pasos, más de 8 L de agua, más de 14 h de sueño, peso fuera de 30–300 kg o cintura fuera de 40–200 cm)
--           se guardan sin puntos.
--         · en pausa (por pago o en un día de una pausa cerrada) no se gana ni se pierde nada; lo pause_private nunca suma.
--         · NUNCA hay puntos por peso, centímetros, kcal ni fotos (las fotos ni siquiera se leen).
--   Q2  grasa.my_points(): la persona ve SUS puntos (semana, hoy, detalle de la semana, 8 semanas, mejor semana, total). Nadie más los pide así.
--   Q3  grasa.coach_points(p_from, p_to): el coach ve, para el ranking privado (M5), los puntos y los hábitos cumplidos de SUS asesorados con
--       vínculo activo. Puntos solo de quien le comparte hábitos Y comidas (los puntos salen de ellos); hábitos cumplidos solo de quien comparte
--       hábitos. Si no, null («no comparte»). El admin no tiene ninguna función de puntos.
--   Q4  Meta colectiva del team (concepto 7, punto 7): grasa.team_goals (una por coach y semana: «Entre todos: N entrenos» o «N puntos»).
--       grasa.team_goal_out devuelve SOLO el total y cuántas personas suman, y NADA si son menos de 5. Nunca ids ni aportes individuales.
--       Suman, por defecto, los vínculos activos que no están en pausa, con A3 + A4 vigentes, que comparten hábitos y comidas con el coach
--       (así el total nunca revela algo que el coach no ve) y que no se retiraron (coach_links.team_opt_out, «No sumar mis hábitos a la meta del
--       team»). Menores de 18: pueden participar (concepto 7, punto 11); su exclusión aplica solo a ligas, que no existen.
--   Q5  El ranking privado del coach deja de ordenar por «Progreso a la meta» (kilos o cintura): eso se cambió en la app (concepto 7, punto 10);
--       coach_analytics no cambia (sigue alimentando las gráficas y la tendencia por categorías, que se listan en orden alfabético).
-- Fuera de alcance (concepto 7): ligas, posición relativa, su opt-in, la cláusula 7.6 y la Etapa 3.

-- ============ Q1: puntos ============
create table if not exists grasa.points_log (
  user_id    uuid not null references auth.users(id) on delete cascade,
  day        date not null,
  source     text not null check (source ~ '^(registro|agua|pasos|sueno|entreno|descanso|comidas|medidas|volviste|semana|reto:[0-9a-f-]{36})$'),
  points     smallint not null check (points between 1 and 12),
  created_at timestamptz not null default now(),
  primary key (user_id, day, source)
);
alter table grasa.points_log enable row level security;
revoke all on grasa.points_log from public, anon, authenticated, service_role;

-- Retirarse de la meta colectiva (opt-out). Por defecto, suma.
alter table grasa.coach_links add column if not exists team_opt_out boolean not null default false;

-- Lunes de la semana de un día. INTERNA.
create or replace function grasa.week_monday(p_day date) returns date
language sql immutable set search_path = '' as $$ select p_day - (extract(isodow from p_day)::int - 1) $$;

-- ¿El hábito del día trae algo anotado? ¿Trae un valor raro? ¿La medida trae algún dato? ¿Es rara? INTERNAS (sin privilegios).
create or replace function grasa.pts_habit_has(d jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(grasa.num_of(d, 'water'), 0) > 0 or coalesce(grasa.num_of(d, 'steps'), 0) > 0 or coalesce(grasa.num_of(d, 'sleep'), 0) > 0
      or d -> 'trained' = 'true'::jsonb or coalesce(d ->> 'rest', '') in ('plan', 'sick');
$$;
create or replace function grasa.pts_habit_rare(d jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(grasa.num_of(d, 'steps'), 0) > 60000 or coalesce(grasa.num_of(d, 'water'), 0) > 8 or coalesce(grasa.num_of(d, 'sleep'), 0) > 14;
$$;
create or replace function grasa.pts_entry_has(d jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select exists (select 1 from unnest(array['weight', 'waist', 'abdomen', 'hip', 'neck', 'armR', 'armL', 'back', 'thighR', 'thighL', 'bodyFat']) k
                 where grasa.num_of(d, k) is not null);
$$;
create or replace function grasa.pts_entry_rare(d jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(grasa.num_of(d, 'weight') not between 30 and 300, false) or coalesce(grasa.num_of(d, 'waist') not between 40 and 200, false);
$$;

-- Entrenos por semana del plan: la meta de días de entreno que fijó el coach; 5 si no hay. INTERNA.
create or replace function grasa.points_plan(p_user uuid) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce((select l.goal_trained_days from grasa.coach_links l where l.client_id = p_user and l.status = 'active' limit 1), 5)::int;
$$;

-- Suma de puntos de una persona en un rango (nunca más de 80 por semana: ya se acota al escribir). INTERNA.
create or replace function grasa.points_sum(p_user uuid, p_from date, p_to date) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(p.points), 0)::int from grasa.points_log p where p.user_id = p_user and p.day between p_from and p_to;
$$;

-- ¿Ese día hay registro (a tiempo, no privado, no raro) del hábito de un reto? INTERNA.
create or replace function grasa.pts_habit_on(p_user uuid, p_day date, p_habit text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when p_habit = 'foods' then exists (select 1 from grasa.records r where r.user_id = p_user and r.kind = 'food' and r.date = p_day
                                                   and r.deleted_at is null and not r.pause_private)
         else exists (select 1 from grasa.records r where r.user_id = p_user and r.kind = 'habit' and r.date = p_day and r.deleted_at is null
                        and not r.pause_private and not grasa.pts_habit_rare(r.data)
                        and case p_habit when 'water' then coalesce(grasa.num_of(r.data, 'water'), 0) > 0
                                         when 'steps' then coalesce(grasa.num_of(r.data, 'steps'), 0) > 0
                                         when 'sleep' then coalesce(grasa.num_of(r.data, 'sleep'), 0) > 0
                                         when 'trained' then r.data -> 'trained' = 'true'::jsonb else false end) end;
$$;

-- Recalcula los puntos de UN día de una persona (y los bonos que dependan de él). INTERNA: la llaman los disparadores.
create or replace function grasa.points_refresh(p_user uuid, p_day date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  today date := grasa.today_bogota(); wk date; h jsonb; ent jsonb; nfood int; plan int; restcap int; pts jsonb := '{}'::jsonb;
  daily text[] := array['registro', 'entreno', 'descanso', 'agua', 'pasos', 'sueno', 'comidas', 'medidas', 'volviste'];
  src text; v int; room int; prev date; real_days int; frozen int; missing int; ch record; verified int;
begin
  if p_user is null or p_day is null or p_day < today - 1 or p_day > today + 1 then return; end if;   -- solo hoy y ayer (+ desfase)
  if grasa.client_payment_blocked(p_user) or grasa.day_in_pause(p_user, p_day) then return; end if;  -- en pausa: ni se gana ni se pierde
  wk := grasa.week_monday(p_day);
  plan := grasa.points_plan(p_user);
  restcap := least(3, greatest(1, 7 - plan));
  select r.data into h from grasa.records r where r.user_id = p_user and r.kind = 'habit' and r.date = p_day and r.deleted_at is null and not r.pause_private;
  if h is not null and (grasa.pts_habit_rare(h) or not grasa.pts_habit_has(h)) then h := null; end if;
  select count(*) into nfood from grasa.records r where r.user_id = p_user and r.kind = 'food' and r.date = p_day and r.deleted_at is null and not r.pause_private;
  select r.data into ent from grasa.records r where r.user_id = p_user and r.kind = 'entry' and r.date = p_day and r.deleted_at is null and not r.pause_private;
  if ent is not null and (grasa.pts_entry_rare(ent) or not grasa.pts_entry_has(ent)) then ent := null; end if;

  delete from grasa.points_log where user_id = p_user and day = p_day and source = any (daily);
  if h is not null or nfood > 0 or ent is not null then pts := pts || '{"registro": 2}'; end if;
  if h is not null then
    if coalesce(grasa.num_of(h, 'water'), 0) >= 2 then pts := pts || '{"agua": 1}'; end if;
    if coalesce(grasa.num_of(h, 'steps'), 0) >= 8000 then pts := pts || '{"pasos": 1}'; end if;
    if coalesce(grasa.num_of(h, 'sleep'), 0) between 7 and 10 then pts := pts || '{"sueno": 1}'; end if;
    if h -> 'trained' = 'true'::jsonb then
      if (select count(*) from grasa.points_log p where p.user_id = p_user and p.source = 'entreno' and p.day between wk and wk + 6) < plan then
        pts := pts || '{"entreno": 3}';
      end if;
    elsif h ->> 'rest' in ('plan', 'sick') then
      if (select count(*) from grasa.points_log p where p.user_id = p_user and p.source = 'descanso' and p.day between wk and wk + 6) < restcap then
        pts := pts || '{"descanso": 2}';
      end if;
    end if;
  end if;
  if nfood >= 2 then pts := pts || '{"comidas": 1}'; end if;
  if ent is not null and not exists (select 1 from grasa.points_log p where p.user_id = p_user and p.source = 'medidas'
                                     and (abs(p.day - p_day) < 6 or p.day between wk and wk + 6)) then
    pts := pts || '{"medidas": 3}';
  end if;
  if pts ? 'registro' then
    select max(r.date) into prev from grasa.records r where r.user_id = p_user and r.kind in ('entry', 'food', 'habit')
      and r.deleted_at is null and not r.pause_private and r.date < p_day;
    if prev is not null and prev < p_day - 7
       and not exists (select 1 from grasa.points_log p where p.user_id = p_user and p.source = 'volviste' and p.day > p_day - 30 and p.day < p_day) then
      pts := pts || '{"volviste": 5}';
    end if;
  end if;
  -- Topes: 12 al día (solo lo diario) y 80 a la semana (todo). Se recorta en orden: lo último de la lista es lo primero que se pierde.
  room := least(12, 80 - grasa.points_sum(p_user, wk, wk + 6));
  foreach src in array daily loop
    v := least(coalesce((pts ->> src)::int, 0), greatest(room, 0));
    if v > 0 then insert into grasa.points_log (user_id, day, source, points) values (p_user, p_day, src, v); room := room - v; end if;
  end loop;

  -- Bono «semana constante» (el lunes, por la semana anterior ya cerrada): ≥ 4 días con registro, o ≥ 2 con comodines (2 por semana) que
  -- cubren días pasados sin registro (los días de pausa no cuentan como faltantes), como constancia.js.
  if wk <= today and not exists (select 1 from grasa.points_log p where p.user_id = p_user and p.day = wk and p.source = 'semana') then
    select count(distinct p.day) into real_days from grasa.points_log p where p.user_id = p_user and p.source = 'registro' and p.day between wk - 7 and wk - 1;
    select count(*) into frozen from generate_series(wk - 7, wk - 1, interval '1 day') g(d) where grasa.day_in_pause(p_user, g.d::date);
    missing := 7 - real_days - frozen;
    if real_days >= 4 or (real_days >= 2 and real_days + least(2, missing) >= 4) then
      v := least(5, 80 - grasa.points_sum(p_user, wk, wk + 6));
      if v > 0 then insert into grasa.points_log (user_id, day, source, points) values (p_user, wk, 'semana', v) on conflict do nothing; end if;
    end if;
  end if;

  -- Bono «reto cumplido» (10, máximo 2 por semana): cuenta SOLO los días marcados con registro real a tiempo del hábito del reto.
  for ch in select x.id, x.habit, x.target_days from grasa.challenges x
      join grasa.challenge_members mb on mb.challenge_id = x.id and mb.client_id = p_user
      join grasa.coach_links l on l.coach_id = x.coach_id and l.client_id = p_user and l.status = 'active'
      where x.deleted_at is null and x.start_day <= p_day and x.end_day >= p_day - 31
        and not exists (select 1 from grasa.points_log p where p.user_id = p_user and p.source = 'reto:' || x.id::text)
  loop
    select count(*) into verified from grasa.challenge_marks m
      where m.challenge_id = ch.id and m.client_id = p_user and not m.pause_private
        and exists (select 1 from grasa.points_log p where p.user_id = p_user and p.day = m.day and p.source = 'registro')
        and grasa.pts_habit_on(p_user, m.day, ch.habit);
    if verified >= ch.target_days
       and (select count(*) from grasa.points_log p where p.user_id = p_user and p.source like 'reto:%' and p.day between wk and wk + 6) < 2 then
      v := least(10, 80 - grasa.points_sum(p_user, wk, wk + 6));
      if v > 0 then insert into grasa.points_log (user_id, day, source, points) values (p_user, p_day, 'reto:' || ch.id::text, v) on conflict do nothing; end if;
    end if;
  end loop;
end $$;

-- Disparadores: cada registro que llega (sync_push) recalcula su día; cada marca de reto revisa el bono del día de hoy.
create or replace function grasa.points_on_record() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind in ('entry', 'food', 'habit') then
    begin   -- los puntos nunca deben impedir que se guarde un registro: si algo falla, se registra el aviso y se sigue
      perform grasa.points_refresh(new.user_id, new.date);
      if tg_op = 'UPDATE' and old.date is distinct from new.date then perform grasa.points_refresh(new.user_id, old.date); end if;
    exception when others then
      raise warning 'points_refresh falló (%): %', sqlstate, sqlerrm;
    end;
  end if;
  return null;
end $$;
drop trigger if exists records_points on grasa.records;
create trigger records_points after insert or update on grasa.records for each row execute function grasa.points_on_record();

create or replace function grasa.points_on_mark() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin   -- igual que en points_on_record: una falla de puntos no impide marcar el reto
    perform grasa.points_refresh(new.client_id, grasa.today_bogota());
  exception when others then
    raise warning 'points_refresh falló (%): %', sqlstate, sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists challenge_marks_points on grasa.challenge_marks;
create trigger challenge_marks_points after insert or update on grasa.challenge_marks for each row execute function grasa.points_on_mark();

-- ============ Q2: mis puntos (solo la persona en sesión) ============
create or replace function grasa.my_points() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); today date := grasa.today_bogota(); wk date := grasa.week_monday(grasa.today_bogota());
begin
  return jsonb_build_object(
    'today', today, 'week_start', wk,
    'week', grasa.points_sum(uid, wk, wk + 6),
    'today_points', grasa.points_sum(uid, today, today),
    'log', coalesce((select jsonb_agg(jsonb_build_object('day', p.day, 'kind', split_part(p.source, ':', 1), 'points', p.points) order by p.day, p.source)
                     from grasa.points_log p where p.user_id = uid and p.day between wk and wk + 6), '[]'::jsonb),
    'weeks', (select jsonb_agg(jsonb_build_object('start', wk - 7 * k, 'points', grasa.points_sum(uid, wk - 7 * k, wk - 7 * k + 6)) order by k desc)
              from generate_series(0, 7) k),
    'best', coalesce((select max(s) from (select sum(p.points) s from grasa.points_log p where p.user_id = uid and p.day < wk
                                          group by grasa.week_monday(p.day)) x), 0),
    'total', coalesce((select sum(p.points) from grasa.points_log p where p.user_id = uid), 0),
    'plan', grasa.points_plan(uid),
    'paused', grasa.client_payment_blocked(uid),
    'team_opt_out', (select l.team_opt_out from grasa.coach_links l where l.client_id = uid and l.status = 'active' limit 1));
end $$;

-- ============ Q3: puntos y hábitos cumplidos para el ranking privado del coach ============
create or replace function grasa.coach_points(p_from date, p_to date)
returns table (client_id uuid, points int, habits_met int)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_active_coach(); today date := grasa.today_bogota();
begin
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 92 or p_to > today + 2 or p_from < today - 400 then
    raise exception 'invalid' using errcode = '22023', detail = 'rango de fechas no válido';
  end if;
  return query
  select l.client_id,
    case when l.share_habits and l.share_nutrition then grasa.points_sum(l.client_id, p_from, p_to) end,
    case when l.share_habits then (select coalesce(sum((coalesce(grasa.num_of(r.data, 'water'), 0) >= 2)::int + (coalesce(grasa.num_of(r.data, 'steps'), 0) >= 8000)::int
                                                     + (coalesce(grasa.num_of(r.data, 'sleep'), 0) between 7 and 10)::int), 0)::int
                                   from grasa.records r where r.user_id = l.client_id and r.kind = 'habit' and r.deleted_at is null and not r.pause_private
                                     and r.date between p_from and p_to and not grasa.pts_habit_rare(r.data)) end
  from grasa.coach_links l
  where l.coach_id = uid and l.status = 'active' and grasa.coach_can_see(l.client_id, 'body')
  order by l.created_at, l.client_id;
end $$;

-- ============ Q4: meta colectiva del team ============
create table if not exists grasa.team_goals (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references grasa.coaches(user_id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  metric     text not null check (metric in ('entrenos', 'puntos')),
  target     int not null check (target between 1 and 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (coach_id, week_start)
);
alter table grasa.team_goals enable row level security;
revoke all on grasa.team_goals from public, anon, authenticated, service_role;

-- La meta de esta semana de un coach, AGREGADA: total y cuántas personas suman; con menos de 5, ni el total ni el número. Nunca ids ni aportes
-- individuales. null si no hay meta esta semana. INTERNA.
create or replace function grasa.team_goal_out(p_coach uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare g grasa.team_goals; n int; total int; wk date := grasa.week_monday(grasa.today_bogota());
begin
  select * into g from grasa.team_goals t where t.coach_id = p_coach and t.week_start = wk;
  if not found then return null; end if;
  with part as (
    select l.client_id as uid from grasa.coach_links l join grasa.coaches c on c.user_id = l.coach_id and c.active
    where l.coach_id = p_coach and l.status = 'active' and not l.team_opt_out and l.share_habits and l.share_nutrition
      and core.consent_is_granted(l.client_id, 'grasa', 'sensitive_health') and core.consent_is_granted(l.client_id, 'grasa', 'cloud_transfer')
      and not grasa.client_payment_blocked(l.client_id)
  ), contrib as (
    select p.user_id, sum(p.points) as s, count(*) filter (where p.source = 'entreno') as e
    from grasa.points_log p join part on part.uid = p.user_id where p.day between wk and wk + 6 group by p.user_id
  )
  select (select count(*) from part),
         case when g.metric = 'entrenos' then (select coalesce(sum(c.e), 0) from contrib c) else (select coalesce(sum(least(80, c.s)), 0) from contrib c) end
    into n, total;
  return jsonb_build_object('metric', g.metric, 'target', g.target, 'week_start', wk, 'week_end', wk + 6, 'min', 5, 'published', n >= 5,
    'participants', case when n >= 5 then n end, 'total', case when n >= 5 then total end);
end $$;

-- El coach (activo, con acuerdo) fija o cambia la meta de ESTA semana para su team. Sin catálogo: entrenos o puntos y un número que él escribe.
create or replace function grasa.set_team_goal(p_metric text, p_target int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_active_coach(); wk date := grasa.week_monday(grasa.today_bogota());
begin
  if p_metric is null or p_metric not in ('entrenos', 'puntos') then raise exception 'invalid' using errcode = '22023', detail = 'meta: entrenos o puntos'; end if;
  if p_target is null or p_target < 1 or (p_metric = 'entrenos' and p_target > 2000) or (p_metric = 'puntos' and p_target > 20000) then
    raise exception 'invalid' using errcode = '22023', detail = 'número de la meta fuera de rango';
  end if;
  insert into grasa.team_goals (coach_id, week_start, metric, target) values (uid, wk, p_metric, p_target)
    on conflict (coach_id, week_start) do update set metric = excluded.metric, target = excluded.target, updated_at = now();
  return grasa.team_goal_out(uid);
end $$;

-- Quitar la meta de esta semana (reduce: solo exige ser coach).
create or replace function grasa.delete_team_goal() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  if not exists (select 1 from grasa.coaches c where c.user_id = uid) then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from grasa.team_goals t where t.coach_id = uid and t.week_start = grasa.week_monday(grasa.today_bogota());
end $$;

-- La meta del team que ve el coach: el mismo agregado (sin desglose individual en esta vista).
create or replace function grasa.coach_team_goal() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_active_coach();
begin
  return grasa.team_goal_out(uid);
end $$;

-- La meta del team que ve el asesorado (la de su coach ACTIVO): el agregado y si él se retiró. null sin coach o sin meta esta semana.
create or replace function grasa.my_team_goal() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); l grasa.coach_links; g jsonb;
begin
  select x.* into l from grasa.coach_links x join grasa.coaches c on c.user_id = x.coach_id and c.active
    where x.client_id = uid and x.status = 'active' limit 1;
  if not found then return null; end if;
  g := grasa.team_goal_out(l.coach_id);
  if g is null then return jsonb_build_object('none', true, 'opted_out', l.team_opt_out); end if;
  return g || jsonb_build_object('opted_out', l.team_opt_out);
end $$;

-- «No sumar mis hábitos a la meta del team» (opt-out) o volver a sumar. Solo la propia persona, sobre su vínculo activo.
create or replace function grasa.set_team_opt_out(p_out boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  if p_out is null then raise exception 'invalid' using errcode = '22023'; end if;
  update grasa.coach_links set team_opt_out = p_out, updated_at = now() where client_id = uid and status = 'active';
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  return grasa.my_team_goal();
end $$;

-- ============ Permisos: nada por defecto; solo authenticated en las RPC (cada una comprueba quién es). Nunca anon. ============
revoke execute on function grasa.week_monday(date), grasa.pts_habit_has(jsonb), grasa.pts_habit_rare(jsonb), grasa.pts_entry_has(jsonb), grasa.pts_entry_rare(jsonb),
  grasa.points_plan(uuid), grasa.points_sum(uuid, date, date), grasa.pts_habit_on(uuid, date, text), grasa.points_refresh(uuid, date),
  grasa.points_on_record(), grasa.points_on_mark(), grasa.my_points(), grasa.coach_points(date, date), grasa.team_goal_out(uuid),
  grasa.set_team_goal(text, int), grasa.delete_team_goal(), grasa.coach_team_goal(), grasa.my_team_goal(), grasa.set_team_opt_out(boolean)
  from public, anon, authenticated, service_role;
grant execute on function grasa.my_points(), grasa.coach_points(date, date), grasa.set_team_goal(text, int), grasa.delete_team_goal(),
  grasa.coach_team_goal(), grasa.my_team_goal(), grasa.set_team_opt_out(boolean) to authenticated;

-- ======== 20261103120000_r1_liga.sql ========
-- R1 v1.16 · Liga semanal de constancia (función 5 del piloto; concepto jurídico 7, puntos 3, 4, 11 y 12). Aditiva e idempotente, encima de v1.15.
--   L1  Opt-in reforzado, APAGADO por defecto: coach_links.liga_opt_in + liga_alias. Entrar exige, en el servidor: vínculo activo, coach activo con
--       la versión del acuerdo que trae la cláusula de ligas (0.6-A7-coach), A3 + A4 + «mayor de edad» vigentes, el consentimiento `liga`
--       (casilla literal del concepto 7, registrado por la app con la huella del texto), hábitos y comidas compartidos (los puntos salen de ellos)
--       y pago al día. Sin eso, la persona sigue con el 100 % de su asesoría.
--   L2  Alias de CATÁLOGO CERRADO (24 nombres neutrales), único dentro del team de un coach. Nunca nombres libres. Se asigna al unirse y se libera
--       al salir. El coach NO tiene función alguna que muestre quién es cada alias (cláusula de ligas, punto 8 del concepto).
--   L3  Mínimo 5 participantes: con 4 o menos NO se publica tabla ni puntajes (ni siquiera a los participantes), solo el aviso literal.
--   L4  Tabla semanal: lunes a domingo (Bogotá), SOLO alias y puntos de constancia (los que calcula el servidor; nunca peso, medidas, kcal ni fotos),
--       tope 80 a la semana. Sin histórico: no existe ninguna tabla ni función de semanas pasadas; cada lunes arranca de cero.
--   L5  Menores de 18: la app solo admite mayores de edad (consentimiento `adult` obligatorio); además la unión lo vuelve a exigir.
--   L6  Salir: apaga el interruptor y borra el alias; desaparece de la tabla activa al instante. Quien deja de estar vinculado, en pausa o sin
--       consentimiento vigente deja de contar y de verse sin que nadie tenga que hacer nada.
--   L7  La versión 0.6-A7-coach trae además la cláusula 14, así que sigue valiendo para exportar (grasa.export_agreement_versions pasa a 0.5 y 0.6).
-- Pruebas: supabase/tests/200_liga.test.sql. Contrato: equipo/r1-contrato.md §25.

-- ============ L0: tipo de consentimiento `liga` ============
alter table core.consent_events drop constraint if exists consent_events_kind_check;
alter table core.consent_events add constraint consent_events_kind_check check (kind in (
  'terms', 'privacy', 'adult', 'sensitive_health', 'cloud_transfer', 'photos_cloud', 'photo_view_coach', 'coach_agreement',
  'share_body', 'share_notes', 'share_nutrition', 'share_habits', 'share_photos', 'liga'));

alter table grasa.coach_links add column if not exists liga_opt_in boolean not null default false;
alter table grasa.coach_links add column if not exists liga_alias text null;

-- Versiones del acuerdo del coach que traen la cláusula de ligas (las mismas que CT.A7_LIGA_VERSIONS en consent-texts-solo.js). INTERNA.
create or replace function grasa.liga_agreement_versions() returns text[]
language sql immutable set search_path = '' as $$ select array['0.6-A7-coach']::text[] $$;

create or replace function grasa.liga_agreement_of(p_coach uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when x.granted and x.version = any (grasa.liga_agreement_versions()) then x.version end
  from (select e.granted, e.version from core.consent_events e
        where e.user_id = p_coach and e.app_id = 'grasa' and e.kind = 'coach_agreement'
        order by e.created_at desc, e.client_at desc, e.id desc limit 1) x;
$$;

-- Catálogo cerrado de alias (concepto 7, punto 3). Mismo orden que LIGA_ALIASES en puntos.js / remote-fake.js. INTERNA.
create or replace function grasa.liga_aliases() returns text[]
language sql immutable set search_path = '' as $$
  select array['Halcón', 'Titán', 'Roble', 'Fénix', 'Cóndor', 'Jaguar', 'Delfín', 'Lince', 'Pino', 'Cedro', 'Águila', 'Lobo',
               'Puma', 'Ceiba', 'Colibrí', 'Roca', 'Río', 'Volcán', 'Nevado', 'Ámbar', 'Trueno', 'Coral', 'Bosque', 'Montaña']::text[]
$$;

-- ¿Cuenta HOY esta persona en la liga de su coach? (opt-in + todo lo que el opt-in exige, vigente). INTERNA.
create or replace function grasa.liga_active(p_link grasa.coach_links) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_link.status = 'active' and p_link.liga_opt_in and p_link.liga_alias is not null
    and exists (select 1 from grasa.coaches c where c.user_id = p_link.coach_id and c.active)
    and grasa.liga_agreement_of(p_link.coach_id) is not null
    and p_link.share_habits and p_link.share_nutrition
    and core.consent_is_granted(p_link.client_id, 'grasa', 'sensitive_health') and core.consent_is_granted(p_link.client_id, 'grasa', 'cloud_transfer')
    and core.consent_is_granted(p_link.client_id, 'grasa', 'adult') and core.consent_is_granted(p_link.client_id, 'grasa', 'liga')
    and not grasa.client_payment_blocked(p_link.client_id)
$$;

-- L7: exportar sigue funcionando con la 0.6 (que incluye la cláusula 14).
create or replace function grasa.export_agreement_versions() returns text[]
language sql immutable set search_path = '' as $$ select array['0.5-A7-coach', '0.6-A7-coach']::text[] $$;

-- ============ L1: unirse ============
create or replace function grasa.liga_join() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); l grasa.coach_links; used text[]; pick text; cat text[] := grasa.liga_aliases(); start int; i int;
begin
  select x.* into l from grasa.coach_links x where x.client_id = uid and x.status = 'active' limit 1 for update;
  if not found then raise exception 'not_found' using errcode = 'P0002', detail = 'sin coach'; end if;
  if not exists (select 1 from grasa.coaches c where c.user_id = l.coach_id and c.active) or grasa.liga_agreement_of(l.coach_id) is null then
    raise exception 'forbidden' using errcode = '42501', detail = 'liga_not_enabled';
  end if;
  if not (core.consent_is_granted(uid, 'grasa', 'sensitive_health') and core.consent_is_granted(uid, 'grasa', 'cloud_transfer')
          and core.consent_is_granted(uid, 'grasa', 'adult')) then
    raise exception 'forbidden' using errcode = '42501', detail = 'consent_required';
  end if;
  if not core.consent_is_granted(uid, 'grasa', 'liga') then raise exception 'forbidden' using errcode = '42501', detail = 'liga_consent_required'; end if;
  if not (l.share_habits and l.share_nutrition) then raise exception 'forbidden' using errcode = '42501', detail = 'liga_requires_habits'; end if;
  if grasa.client_payment_blocked(uid) then raise exception 'forbidden' using errcode = '42501', detail = 'paused'; end if;
  if l.liga_alias is null then
    select coalesce(array_agg(k.liga_alias), '{}') into used from grasa.coach_links k
      where k.coach_id = l.coach_id and k.status = 'active' and k.liga_alias is not null;
    start := abs(hashtext(uid::text)) % cardinality(cat);
    for i in 0 .. cardinality(cat) - 1 loop
      pick := cat[1 + (start + i) % cardinality(cat)];
      exit when not pick = any (used);
      pick := null;
    end loop;
    if pick is null then raise exception 'invalid' using errcode = '22023', detail = 'liga_full'; end if;
  else pick := l.liga_alias; end if;
  update grasa.coach_links set liga_opt_in = true, liga_alias = pick, updated_at = now() where id = l.id;
  return grasa.my_liga();
end $$;

-- ============ L6: salir (reduce: solo exige ser la persona en sesión) ============
create or replace function grasa.liga_leave() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  update grasa.coach_links set liga_opt_in = false, liga_alias = null, updated_at = now() where client_id = uid and status = 'active';
  return grasa.my_liga();
end $$;

-- ============ L3 + L4: mi liga ============
-- Siempre devuelve el estado (enabled, opted_in, alias). La TABLA solo existe para quien participa Y hay 5 o más participantes; si no, null.
create or replace function grasa.my_liga() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); l grasa.coach_links; wk date := grasa.week_monday(grasa.today_bogota()); n int; tbl jsonb; mine boolean; coach_ok boolean;
begin
  select x.* into l from grasa.coach_links x where x.client_id = uid and x.status = 'active' limit 1;
  if not found then return jsonb_build_object('enabled', false, 'opted_in', false, 'alias', null, 'min', 5, 'published', false, 'table', null); end if;
  coach_ok := exists (select 1 from grasa.coaches c where c.user_id = l.coach_id and c.active) and grasa.liga_agreement_of(l.coach_id) is not null;
  mine := coach_ok and grasa.liga_active(l);
  select count(*) into n from grasa.coach_links k where k.coach_id = l.coach_id and coach_ok and grasa.liga_active(k);
  if mine and n >= 5 then
    select jsonb_agg(jsonb_build_object('alias', t.alias, 'points', t.pts, 'me', t.me) order by t.pts desc, t.alias) into tbl
    from (select k.liga_alias as alias, least(80, grasa.points_sum(k.client_id, wk, wk + 6)) as pts, (k.client_id = uid) as me
          from grasa.coach_links k where k.coach_id = l.coach_id and grasa.liga_active(k)) t;
  end if;
  return jsonb_build_object('enabled', coach_ok, 'opted_in', mine, 'alias', case when mine then l.liga_alias end,
    'week_start', wk, 'week_end', wk + 6, 'min', 5,
    'participants', case when mine then n end, 'published', mine and n >= 5, 'table', tbl);
end $$;

-- El coach: SOLO si la liga está habilitada para su team y cuántos participan (con menos de 5, ni el número). Nunca alias ni personas.
create or replace function grasa.coach_liga() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_active_coach(); n int; ok boolean := grasa.liga_agreement_of(uid) is not null;
begin
  select count(*) into n from grasa.coach_links k where k.coach_id = uid and ok and grasa.liga_active(k);
  return jsonb_build_object('enabled', ok, 'min', 5, 'published', n >= 5, 'participants', case when n >= 5 then n end);
end $$;

revoke execute on function grasa.liga_agreement_versions(), grasa.liga_agreement_of(uuid), grasa.liga_aliases(), grasa.liga_active(grasa.coach_links),
  grasa.liga_join(), grasa.liga_leave(), grasa.my_liga(), grasa.coach_liga() from public, anon, authenticated, service_role;
grant execute on function grasa.liga_join(), grasa.liga_leave(), grasa.my_liga(), grasa.coach_liga() to authenticated;

-- ======== 20261104120000_r1_liga_premios.sql ========
-- R1 v1.17 · Cláusula 16 (prohibición de pagos y responsabilidad sobre incentivos; concepto jurídico 8, 31/10/2026). Aditiva e idempotente, encima de v1.16.
--   · Versión del acuerdo del coach 0.7-A7-coach = la 0.6 + la «Cláusula 16». La liga ahora exige ESA versión (trae las cláusulas 15 y 16); un coach que solo
--     tenga la 0.6 debe aceptar la 0.7 para mantener su liga habilitada. Exportar sigue valiendo con 0.5, 0.6 y 0.7 (todas traen la cláusula 14).
-- Pruebas: supabase/tests/200_liga.test.sql.
create or replace function grasa.liga_agreement_versions() returns text[]
language sql immutable set search_path = '' as $$ select array['0.7-A7-coach']::text[] $$;

create or replace function grasa.export_agreement_versions() returns text[]
language sql immutable set search_path = '' as $$ select array['0.5-A7-coach', '0.6-A7-coach', '0.7-A7-coach']::text[] $$;

select 'OK r1 v1' as resultado;
commit;
