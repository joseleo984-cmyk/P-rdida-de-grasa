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
