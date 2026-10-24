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

select 'OK r1 v1' as resultado;
commit;
