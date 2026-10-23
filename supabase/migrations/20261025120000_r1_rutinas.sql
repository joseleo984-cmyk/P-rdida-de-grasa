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
