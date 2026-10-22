-- Matriz del contrato §2.5.2: cliente A (con coach X), cliente B (sin coach), coach X, coach Y, anónimo, admin.
-- Quién lee/escribe qué en records, photos, Storage, comentarios; revocar o terminar corta el acceso al instante.
begin;
-- Sprint 7: el servidor exige el acuerdo del coach (A7) y A3+A4 del cliente.
select tests.agree('x'); select tests.agree('y'); select tests.cloud('ana'); select tests.cloud('bea');

-- ---------- Preparación ----------
select tests.login('x');
select set_config('t.code_x', (select invite_code from grasa.become_coach('Coach X Fit')), true);
reset role; select tests.login('y');
select grasa.become_coach('Coach Y');
reset role; select tests.login('ana');
select grasa.join_coach(current_setting('t.code_x'),
  jsonb_build_object('body', true, 'notes', false, 'nutrition', true, 'habits', false, 'photos', false,
                     'version', '0.1', 'text_hash', tests.h('compartir')));
select grasa.sync_push(jsonb_build_array(
  jsonb_build_object('id', '10000000-0000-4000-8000-000000000001', 'kind', 'profile', 'nkey', 'profile',
                     'data', jsonb_build_object('sex', 'female', 'height', 165), 'updated_at', '2026-10-20T10:00:00Z'),
  jsonb_build_object('id', '10000000-0000-4000-8000-000000000002', 'kind', 'entry', 'nkey', '2026-10-20', 'date', '2026-10-20',
                     'data', jsonb_build_object('weight', 80, 'note', 'nota privada'), 'updated_at', '2026-10-20T10:00:00Z'),
  jsonb_build_object('id', '10000000-0000-4000-8000-000000000003', 'kind', 'food', 'nkey', '10000000-0000-4000-8000-000000000003',
                     'date', '2026-10-20', 'data', jsonb_build_object('name', 'Arepa', 'kcal', 300), 'updated_at', '2026-10-20T10:00:00Z'),
  jsonb_build_object('id', '10000000-0000-4000-8000-000000000004', 'kind', 'habit', 'nkey', '2026-10-20', 'date', '2026-10-20',
                     'data', jsonb_build_object('steps', 9000), 'updated_at', '2026-10-20T10:00:00Z'),
  jsonb_build_object('id', '10000000-0000-4000-8000-000000000005', 'kind', 'library', 'nkey', 'arepa',
                     'data', jsonb_build_object('name', 'Arepa', 'kcal', 300), 'updated_at', '2026-10-20T10:00:00Z')),
  jsonb_build_array(
  jsonb_build_object('id', '20000000-0000-4000-8000-000000000001', 'date', '2026-10-01', 'pose', 'frente',
                     'storage_path', tests.uid('ana') || '/20000000-0000-4000-8000-000000000001.jpg', 'shared_with_coach', true,
                     'created_at', '2026-10-01T10:00:00Z', 'updated_at', '2026-10-01T10:00:00Z'),
  jsonb_build_object('id', '20000000-0000-4000-8000-000000000002', 'date', '2026-10-15', 'pose', 'perfil',
                     'storage_path', tests.uid('ana') || '/20000000-0000-4000-8000-000000000002.jpg', 'shared_with_coach', false,
                     'created_at', '2026-10-15T10:00:00Z', 'updated_at', '2026-10-15T10:00:00Z')));
insert into storage.objects (bucket_id, name) values
  ('grasa-photos', tests.uid('ana') || '/20000000-0000-4000-8000-000000000001.jpg'),
  ('grasa-photos', tests.uid('ana') || '/20000000-0000-4000-8000-000000000002.jpg'),
  ('grasa-photos', tests.uid('ana') || '/no-es-uuid.jpg');
select tests.ok((select count(*) from grasa.records) = 5 and (select count(*) from grasa.photos) = 2
                and (select count(*) from storage.objects) = 3, 'A ve sus 5 registros, 2 fotos y 3 archivos');
select tests.throws(format($$insert into storage.objects (bucket_id, name) values ('grasa-photos', '%s/x.jpg')$$, tests.uid('bea')),
  'row-level security', 'A no puede subir archivos a la carpeta de B');

-- ---------- Cliente B: no ve ni toca nada de A ----------
reset role; select tests.login('bea');
select tests.ok((select count(*) from grasa.records) = 0 and (select count(*) from grasa.photos) = 0
                and (select count(*) from storage.objects) = 0, 'B no ve registros, fotos ni archivos de A');
select tests.throws(format($$insert into grasa.records (id, user_id, kind, nkey, data, updated_at)
  values (gen_random_uuid(), %L, 'profile', 'profile', '{}', now())$$, tests.uid('ana')), 'row-level security',
  'B no puede insertar registros a nombre de A');
update grasa.records set data = '{"hack":1}' where user_id = tests.uid('ana');
update grasa.photos set shared_with_coach = true where user_id = tests.uid('ana');
delete from storage.objects where name like tests.uid('ana') || '/%';
select tests.throws($$select grasa.coach_pull(tests.uid('ana'), null)$$, 'forbidden', 'B (no coach) no puede usar coach_pull');
insert into grasa.records (id, user_id, kind, nkey, data, updated_at) values (gen_random_uuid(), auth.uid(), 'profile', 'profile', '{}', now());
select tests.ok((select count(*) from grasa.records) = 1, 'B escribe sus propios datos');
reset role;
select tests.ok((select count(*) from grasa.records where user_id = tests.uid('ana') and data ? 'hack') = 0
                and (select shared_with_coach from grasa.photos where id = '20000000-0000-4000-8000-000000000002') = false
                and (select count(*) from storage.objects where name like tests.uid('ana') || '/%') = 3,
  'los UPDATE/DELETE de B sobre datos de A no afectan a ninguna fila');

-- ---------- Coach X: nunca lee las tablas de salud directamente ----------
select tests.login('x');
select tests.ok((select count(*) from grasa.records) = 0 and (select count(*) from grasa.photos) = 0,
  'X no lee grasa.records ni grasa.photos directamente (solo vía coach_pull)');
select set_config('t.pull', grasa.coach_pull(tests.uid('ana'), null)::text, true);
select tests.ok((select array_agg(e ->> 'kind' order by e ->> 'kind') from jsonb_array_elements(current_setting('t.pull')::jsonb -> 'records') e)
                = array['entry','food','profile'], 'X con body+nutrition ve profile, entry y food (sin habit ni library)');
select tests.ok((select not (e -> 'data' ? 'note') and (e -> 'data' ->> 'weight')::numeric = 80
                 from jsonb_array_elements(current_setting('t.pull')::jsonb -> 'records') e where e ->> 'kind' = 'entry'),
  'sin share_notes, el registro corporal llega SIN note');
select tests.ok(jsonb_array_length(current_setting('t.pull')::jsonb -> 'photos') = 0, 'sin share_photos, X no ve metadatos de fotos');
select tests.ok((select count(*) from storage.objects) = 0, 'sin share_photos, X no ve archivos en Storage');
select tests.throws($$select grasa.coach_photo_opened('20000000-0000-4000-8000-000000000001')$$, 'forbidden',
  'sin share_photos, X no puede abrir fotos');
select tests.throws($$select grasa.coach_pull(tests.uid('bea'), null)$$, 'forbidden', 'X no ve a B (sin vínculo)');
select tests.throws(format($$insert into grasa.records (id, user_id, kind, nkey, data, updated_at)
  values (gen_random_uuid(), %L, 'profile', 'profile', '{}', now())$$, tests.uid('ana')), 'row-level security',
  'X no puede escribir datos de su cliente');
select tests.ok((select count(*) from grasa.coach_links) = 1, 'X ve su vínculo con A');

-- ---------- Coach Y: no ve a A ----------
reset role; select tests.login('y');
select tests.throws($$select grasa.coach_pull(tests.uid('ana'), null)$$, 'forbidden', 'Y no ve a A');
select tests.ok((select count(*) from storage.objects) = 0 and (select count(*) from grasa.coach_links) = 0,
  'Y no ve archivos ni vínculos de A');
select tests.throws($$select grasa.add_comment(gen_random_uuid(), tests.uid('ana'), null, 'hola')$$, 'forbidden',
  'Y no puede comentar a A');

-- ---------- A comparte más: notas, hábitos y fotos ----------
reset role; select tests.login('ana');
select grasa.update_shares(jsonb_build_object('body', true, 'notes', true, 'nutrition', true, 'habits', true, 'photos', true,
                                              'version', '0.1', 'text_hash', tests.h('compartir')));
select tests.ok((select count(*) from core.consent_events where kind like 'share_%') = 8,
  'update_shares registra un consent_event solo por cada categoría que cambia (5 + 3)');
select tests.throws($$select grasa.update_shares('{"body":false,"version":"0.1","text_hash":"%s"}')$$, 'obligatorio',
  'no se puede dejar de compartir body sin terminar el vínculo');
reset role; select tests.login('x');
select set_config('t.pull', grasa.coach_pull(tests.uid('ana'), null)::text, true);
select tests.ok((select array_agg(e ->> 'kind' order by e ->> 'kind') from jsonb_array_elements(current_setting('t.pull')::jsonb -> 'records') e)
                = array['entry','food','habit','profile'], 'con habits, X ve también el hábito; library nunca');
select tests.ok((select e -> 'data' ->> 'note' from jsonb_array_elements(current_setting('t.pull')::jsonb -> 'records') e
                 where e ->> 'kind' = 'entry') = 'nota privada', 'con share_notes, la nota llega');
select tests.ok((select array_agg(e ->> 'id') from jsonb_array_elements(current_setting('t.pull')::jsonb -> 'photos') e)
                = array['20000000-0000-4000-8000-000000000001'], 'con share_photos, X ve SOLO la foto marcada como compartida');
select tests.ok((select array_agg(name) from storage.objects) = array[tests.uid('ana') || '/20000000-0000-4000-8000-000000000001.jpg'],
  'Storage: X lee solo el archivo de la foto compartida (no la otra ni rutas no UUID)');
select grasa.coach_photo_opened('20000000-0000-4000-8000-000000000001');
select tests.throws($$select grasa.coach_photo_opened('20000000-0000-4000-8000-000000000002')$$, 'forbidden',
  'X no puede abrir la foto no compartida');
delete from storage.objects;
reset role;
select tests.ok((select count(*) from storage.objects where name like tests.uid('ana') || '/%') = 3,
  'el coach no puede borrar archivos del cliente (solo lectura)');
select tests.ok((select count(*) from grasa.photo_views where coach_id = tests.uid('x')) = 1, 'la apertura queda en photo_views');

-- ---------- Comentarios ----------
select tests.login('x');
select grasa.add_comment('30000000-0000-4000-8000-000000000001', tests.uid('ana'), '2026-10-20', '¡Buen trabajo esta semana!');
select tests.ok((select count(*) from grasa.comments) = 1, 'X comenta a su cliente y ve su comentario');
select tests.throws($$select grasa.mark_comment_read('30000000-0000-4000-8000-000000000001')$$, 'not_found',
  'el coach no marca como leído (solo el cliente)');
select tests.throws($$update grasa.comments set body = 'cambiado'$$, 'permission denied', 'nadie edita comentarios directamente');
reset role; select tests.login('ana');
select tests.ok((select body from grasa.comments) = '¡Buen trabajo esta semana!', 'A lee el comentario de su coach');
select grasa.mark_comment_read('30000000-0000-4000-8000-000000000001');
select tests.ok((select read_at is not null from grasa.comments), 'A marca el comentario como leído');
select tests.throws($$select grasa.delete_comment('30000000-0000-4000-8000-000000000001')$$, 'not_found',
  'el cliente no borra comentarios del coach');
select tests.ok((select count(*) from grasa.photo_views) = 1, 'A ve quién abrió sus fotos (photo_views)');
reset role; select tests.login('bea');
select tests.ok((select count(*) from grasa.comments) = 0 and (select count(*) from grasa.photo_views) = 0,
  'B no ve comentarios ni accesos de A');

-- ---------- Revocar una categoría: efecto inmediato ----------
reset role; select tests.login('ana');
select grasa.update_shares(jsonb_build_object('body', true, 'notes', false, 'nutrition', false, 'habits', true, 'photos', false,
                                              'version', '0.1', 'text_hash', tests.h('compartir')));
reset role; select tests.login('x');
select set_config('t.pull', grasa.coach_pull(tests.uid('ana'), null)::text, true);
select tests.ok((select array_agg(e ->> 'kind' order by e ->> 'kind') from jsonb_array_elements(current_setting('t.pull')::jsonb -> 'records') e)
                = array['entry','habit','profile'], 'al revocar nutrition, X deja de ver las comidas en la siguiente llamada');
select tests.ok((select not (e -> 'data' ? 'note') from jsonb_array_elements(current_setting('t.pull')::jsonb -> 'records') e
                 where e ->> 'kind' = 'entry'), 'al revocar notes, la nota deja de llegar');
select tests.ok(jsonb_array_length(current_setting('t.pull')::jsonb -> 'photos') = 0 and (select count(*) from storage.objects) = 0,
  'al revocar photos, X pierde metadatos y archivos al instante');

-- ---------- Terminar el vínculo: X pierde todo acceso ----------
reset role; select tests.login('ana');
select grasa.update_shares(jsonb_build_object('body', true, 'photos', true, 'version', '0.1', 'text_hash', tests.h('compartir')));
select grasa.leave_coach();
reset role; select tests.login('x');
select tests.throws($$select grasa.coach_pull(tests.uid('ana'), null)$$, 'forbidden', 'tras terminar, coach_pull → forbidden');
select tests.ok((select count(*) from storage.objects) = 0, 'tras terminar, X no lee archivos aunque las fotos sigan compartidas');
select tests.throws($$select grasa.add_comment(gen_random_uuid(), tests.uid('ana'), null, 'hola')$$, 'forbidden',
  'tras terminar, X no puede comentar');
select tests.ok(not grasa.coach_can_see(tests.uid('ana'), 'body'), 'coach_can_see devuelve false tras terminar');
reset role; select tests.login('ana');
select tests.ok((select count(*) from grasa.comments) = 1, 'A conserva los comentarios tras terminar el vínculo');

-- ---------- Admin: cobro sin acceso a datos de salud ----------
reset role;
insert into core.app_access (user_id, app_id, role) values (tests.uid('admin'), 'grasa', 'admin');
select tests.login('admin');
select tests.ok((select count(*) from grasa.records) = 0 and (select count(*) from grasa.photos) = 0
                and (select count(*) from storage.objects) = 0, 'el admin NO ve datos de salud ni fotos');
select tests.ok((select count(*) from grasa.billing_active_clients(current_date)) >= 0, 'el admin puede consultar el conteo de cobro');
reset role; select tests.login('x');
select tests.throws($$select * from grasa.billing_active_clients(current_date)$$, 'forbidden', 'un coach no accede al conteo de cobro');
rollback;
