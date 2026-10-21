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

create or replace function grasa.coach_clients()
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
create or replace function grasa.coach_clients()
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
create or replace function grasa.my_link()
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

select 'OK r1 v1' as resultado;
commit;
