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
