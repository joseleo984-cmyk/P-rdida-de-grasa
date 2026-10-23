-- Etapa 2c (r1 v1.9): videos cortos como demostración de ejercicios.
--   · register_gif acepta video/mp4, video/quicktime y video/webm con su FIRMA de bytes (ftyp / ftyp+«qt  » / EBML) y tope de 10 MB; GIF/WebP siguen en 3 MB.
--   · Rechaza: tipo no permitido, firma falsa o de otro tipo, más de 10 MB (video) y más de 3 MB (GIF/WebP). La tabla lo vuelve a imponer (checks).
--   · Bucket 'ejercicios': 10 MB y los 5 tipos. Cliente con vínculo activo lee el video de su coach; sin vínculo (o de otro coach) no lee nada.
--   · La migración es idempotente y conserva lo que ya había (la app vieja, que solo sube GIF/WebP, sigue funcionando).
begin;
select tests.cloud('ana'); select tests.cloud('bea'); select tests.agree('x'); select tests.agree('y');

select tests.login('x');
select core.join_app('grasa');
select set_config('t.code_x', (select invite_code from grasa.become_coach('Coach X Fit')), true);
reset role; select tests.login('y');
select core.join_app('grasa');
select grasa.become_coach('Coach Y Fit');
reset role; select tests.login('ana');
select core.join_app('grasa');
select grasa.join_coach(current_setting('t.code_x'), jsonb_build_object('body', true, 'version', '0.1', 'text_hash', tests.h('c')));
reset role;

-- ---------- Estructura ----------
select tests.ok(exists (select 1 from storage.buckets where id = 'ejercicios' and not public and file_size_limit = 10485760
                        and allowed_mime_types = array['image/gif', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm']),
  'bucket ejercicios: privado, 10 MB y gif/webp/mp4/mov/webm');
select tests.ok(not exists (select 1 from pg_constraint where conrelid = 'grasa.exercise_gifs'::regclass and conname in ('exercise_gifs_mime_check', 'exercise_gifs_size_bytes_check'))
                and (select count(*) from pg_constraint where conrelid = 'grasa.exercise_gifs'::regclass and conname in ('exercise_gifs_mime_ok', 'exercise_gifs_size_ok')) = 2,
  'los checks de v1.7 se sustituyeron por los de v1.9 (tipo y tope por tipo)');

-- ---------- Registrar videos: tipo, tamaño y firma de bytes ----------
select tests.login('x');
-- Firmas: mp4 «....ftypisom» · mov «....ftypqt  » · webm «1A45DFA3….»
select tests.ok((grasa.register_gif('d0000000-0000-4000-8000-000000000001', 'Sentadilla mp4', 'video/mp4', 5000000, '000000206674797069736f6d') ->> 'mime') = 'video/mp4', 'mp4 con ftyp (marca isom) se acepta');
select tests.ok((grasa.register_gif('d0000000-0000-4000-8000-000000000002', 'Sentadilla mov', 'video/quicktime', 8000000, '000000146674797071742020') ->> 'mime') = 'video/quicktime', 'mov (ftyp + «qt  ») se acepta');
select tests.ok((grasa.register_gif('d0000000-0000-4000-8000-000000000003', 'Sentadilla webm', 'video/webm', 900000, '1a45dfa39f4286810142f781') ->> 'mime') = 'video/webm', 'webm (EBML) se acepta');
select tests.ok((grasa.register_gif('d0000000-0000-4000-8000-000000000004', 'mp4 marca mp42', 'video/mp4', 1000, '0000001866747970' || '6d703432') ->> 'mime') = 'video/mp4', 'mp4 con otra marca ISO (mp42) también');
select tests.ok((grasa.register_gif('d0000000-0000-4000-8000-000000000005', 'Justo 10 MB', 'video/mp4', 10485760, '000000206674797069736f6d') ->> 'size_bytes')::int = 10485760, 'exactamente 10 MB de video sí');
select tests.ok((grasa.register_gif('d0000000-0000-4000-8000-000000000005', 'Justo 10 MB', 'video/mp4', 10485760, '000000206674797069736F6D') ->> 'name') = 'Justo 10 MB', 'la firma en mayúsculas también vale (se pasa a minúsculas)');
select tests.throws($$select grasa.register_gif(gen_random_uuid(), 'Grande', 'video/mp4', 10485761, '000000206674797069736f6d')$$, 'invalid', 'video de más de 10 MB rechazado');
select tests.throws($$select grasa.register_gif(gen_random_uuid(), 'Grande', 'video/webm', 52428800, '1a45dfa39f4286810142f781')$$, 'invalid', 'webm de 50 MB rechazado');
select tests.throws($$select grasa.register_gif(gen_random_uuid(), 'Grande', 'image/gif', 3145729, '474946383961010001000000')$$, 'invalid', 'GIF de más de 3 MB sigue rechazado');
select tests.throws($$select grasa.register_gif(gen_random_uuid(), 'Grande', 'image/webp', 5000000, '524946462400000057454250')$$, 'invalid', 'WebP de más de 3 MB sigue rechazado (aunque un video de 5 MB sí)');
select tests.ok((grasa.register_gif('d0000000-0000-4000-8000-000000000006', 'GIF 3 MB', 'image/gif', 3145728, '474946383961010001000000') ->> 'size_bytes')::int = 3145728, 'GIF de exactamente 3 MB sigue valiendo');
select tests.throws($$select grasa.register_gif(gen_random_uuid(), 'Falso', 'video/mp4', 1000, '89504e470d0a1a0a00000000')$$, 'invalid', 'un PNG disfrazado de mp4 se rechaza');
select tests.throws($$select grasa.register_gif(gen_random_uuid(), 'Falso', 'video/mp4', 1000, '474946383961010001000000')$$, 'invalid', 'bytes de GIF con tipo mp4 se rechazan');
select tests.throws($$select grasa.register_gif(gen_random_uuid(), 'Falso', 'image/gif', 1000, '000000206674797069736f6d')$$, 'invalid', 'bytes de mp4 con tipo gif se rechazan');
select tests.throws($$select grasa.register_gif(gen_random_uuid(), 'Falso', 'video/mp4', 1000, '000000206674797170736f6d')$$, 'invalid', 'ftyq (no ftyp) se rechaza');
select tests.throws($$select grasa.register_gif(gen_random_uuid(), 'Falso', 'video/mp4', 1000, '667479700000002069736f6d')$$, 'invalid', 'ftyp fuera de los bytes 4–7 se rechaza');
select tests.throws($$select grasa.register_gif(gen_random_uuid(), 'Falso', 'video/quicktime', 1000, '000000206674797069736f6d')$$, 'invalid', 'mov sin la marca «qt  » (es un mp4) se rechaza');
select tests.throws($$select grasa.register_gif(gen_random_uuid(), 'Falso', 'video/webm', 1000, '000000206674797069736f6d')$$, 'invalid', 'bytes de mp4 con tipo webm se rechazan');
select tests.throws($$select grasa.register_gif(gen_random_uuid(), 'Falso', 'video/webm', 1000, '1a45dfa49f4286810142f781')$$, 'invalid', 'EBML con un byte distinto se rechaza');
select tests.throws($$select grasa.register_gif(gen_random_uuid(), 'Sin firma', 'video/mp4', 1000, null)$$, 'invalid', 'video sin firma de bytes se rechaza');
select tests.throws($$select grasa.register_gif(gen_random_uuid(), 'Corta', 'video/mp4', 1000, '0000002066747970')$$, 'invalid', 'firma incompleta se rechaza');
select tests.throws($$select grasa.register_gif(gen_random_uuid(), 'Avi', 'video/avi', 1000, '000000206674797069736f6d')$$, 'invalid', 'tipo video/avi no permitido');
select tests.throws($$select grasa.register_gif(gen_random_uuid(), 'Mkv', 'video/x-matroska', 1000, '1a45dfa39f4286810142f781')$$, 'invalid', 'tipo video/x-matroska no permitido');
select tests.throws($$select grasa.register_gif(gen_random_uuid(), 'Pdf', 'application/pdf', 1000, '000000206674797069736f6d')$$, 'invalid', 'tipo application/pdf no permitido');
select tests.throws($$select grasa.register_gif(gen_random_uuid(), 'Foto', 'image/png', 1000, '89504e470d0a1a0a00000000')$$, 'invalid', 'tipo image/png sigue sin permitirse');
select tests.throws($$select grasa.register_gif(gen_random_uuid(), 'Vacío', 'video/mp4', 0, '000000206674797069736f6d')$$, 'invalid', 'video de 0 bytes rechazado');
select tests.throws($$select grasa.register_gif(gen_random_uuid(), 'Sin tipo', null, 1000, '000000206674797069736f6d')$$, 'invalid', 'sin tipo rechazado');
select tests.ok((select count(*) from grasa.my_gifs()) = 6, 'quedaron registrados 5 videos y el GIF de 3 MB: my_gifs los lista (6)');
select tests.ok((select mime from grasa.my_gifs() where id = 'd0000000-0000-4000-8000-000000000002') = 'video/quicktime', 'my_gifs devuelve el tipo del video');
-- Reintentar el mismo id con otro tipo actualiza (misma regla que v1.7)
select tests.ok((grasa.register_gif('d0000000-0000-4000-8000-000000000003', 'Sentadilla webm v2', 'video/webm', 800000, '1a45dfa39f4286810142f781') ->> 'name') = 'Sentadilla webm v2', 'reintentar con el mismo id actualiza el registro');

-- ---------- Otro coach y quien no es coach ----------
reset role; select tests.login('y');
select tests.throws($$select grasa.register_gif('d0000000-0000-4000-8000-000000000001', 'Mío', 'video/mp4', 1000, '000000206674797069736f6d')$$, 'forbidden', 'Y no pisa el video de X');
select tests.ok((select count(*) from grasa.my_gifs()) = 0, 'Y no ve los videos de X');
reset role; select tests.login('ana');
select tests.throws($$select grasa.register_gif(gen_random_uuid(), 'Intruso', 'video/mp4', 1000, '000000206674797069736f6d')$$, 'forbidden', 'un cliente (sin acuerdo de coach) no registra videos');
reset role;

-- ---------- La tabla impone lo mismo (aunque alguien se salte la función) ----------
select tests.throws(format($$insert into grasa.exercise_gifs (id, coach_id, name, mime, size_bytes) values (gen_random_uuid(), %L, 'x', 'video/mp4', 10485761)$$, tests.uid('x')), 'check', 'tabla: video de más de 10 MB viola el check');
select tests.throws(format($$insert into grasa.exercise_gifs (id, coach_id, name, mime, size_bytes) values (gen_random_uuid(), %L, 'x', 'image/gif', 3145729)$$, tests.uid('x')), 'check', 'tabla: GIF de más de 3 MB viola el check');
select tests.throws(format($$insert into grasa.exercise_gifs (id, coach_id, name, mime, size_bytes) values (gen_random_uuid(), %L, 'x', 'video/avi', 10)$$, tests.uid('x')), 'check', 'tabla: tipo no permitido viola el check');
select tests.throws(format($$insert into grasa.exercise_gifs (id, coach_id, name, mime, size_bytes) values (gen_random_uuid(), %L, 'x', 'video/mp4', 0)$$, tests.uid('x')), 'check', 'tabla: 0 bytes viola el check');

-- ---------- Storage: el coach sube el video (nombre {id}.gif) y solo su cliente con vínculo activo lo lee ----------
select tests.login('x');
insert into storage.objects (bucket_id, name) values ('ejercicios', tests.uid('x') || '/d0000000-0000-4000-8000-000000000001.gif');
select tests.ok((select count(*) from storage.objects where bucket_id = 'ejercicios') = 1, 'el coach sube el archivo de un video registrado y lo ve');
select tests.throws(format($$insert into storage.objects (bucket_id, name) values ('ejercicios', '%s/d0000000-0000-4000-8000-0000000000aa.gif')$$, tests.uid('x')), 'row-level security', 'subir un video NO registrado se rechaza');
reset role; select tests.login('ana');
select tests.ok((select count(*) from storage.objects where bucket_id = 'ejercicios') = 1, 'Ana (cliente vinculada a X) lee el video de su coach');
select tests.throws(format($$insert into storage.objects (bucket_id, name) values ('ejercicios', '%s/d0000000-0000-4000-8000-000000000001.gif')$$, tests.uid('x')), 'row-level security', 'un cliente no sube videos a la carpeta de su coach');
reset role; select tests.login('bea');
select tests.ok((select count(*) from storage.objects where bucket_id = 'ejercicios') = 0, 'Bea (sin ningún vínculo) no lee el video');
reset role; select tests.login('y');
select tests.ok((select count(*) from storage.objects where bucket_id = 'ejercicios') = 0, 'otro coach no lee el video de X');
reset role; select tests.login('ana');
select grasa.leave_coach();
select tests.ok((select count(*) from storage.objects where bucket_id = 'ejercicios') = 0, 'Ana se desvincula: ya no lee el video (sin vínculo activo)');
reset role;

-- ---------- Un video se usa en una rutina: delete_gif y my_gifs lo cuentan igual ----------
select tests.login('x');
select tests.ok(exists (select 1 from storage.objects where bucket_id = 'ejercicios'), 'el coach sigue viendo su archivo');
select tests.throws(format($$select grasa.save_routine(%L, 'T', %L::jsonb)$$, tests.uid('ana'), '{"days":[{"title":"D","exercises":[{"name":"Sentadilla","sets":"3 × 10","gif":"d0000000-0000-4000-8000-000000000001"}]}]}'), 'forbidden', 'Ana ya no es cliente: no se le arma rutina');
select grasa.save_template(null, 'Plantilla con video', '{"days":[{"title":"D","exercises":[{"name":"Sentadilla","sets":"3 × 10","gif":"d0000000-0000-4000-8000-000000000001"}]}]}'::jsonb);
select tests.ok((select uses from grasa.my_gifs() where id = 'd0000000-0000-4000-8000-000000000001') = 1, 'my_gifs cuenta el uso de un video en una plantilla');
select tests.throws($$select grasa.delete_gif('d0000000-0000-4000-8000-000000000001')$$, 'gif_in_use', 'un video en uso no se puede borrar');
select grasa.delete_gif('d0000000-0000-4000-8000-000000000002');
select tests.ok((select count(*) from grasa.my_gifs() where id = 'd0000000-0000-4000-8000-000000000002') = 0, 'un video sin uso sí se borra');
reset role;

-- ---------- Migración: idempotente y conserva datos ----------
-- Un GIF registrado ANTES (como en v1.8) y la migración aplicada otra vez dos veces encima.
insert into grasa.exercise_gifs (id, coach_id, name, mime, size_bytes) values ('d0000000-0000-4000-8000-0000000000c1', tests.uid('x'), 'GIF de antes', 'image/gif', 120000);
\ir ../migrations/20261027120000_r1_rutinas_video.sql
\ir ../migrations/20261027120000_r1_rutinas_video.sql
select tests.ok((select count(*) from grasa.exercise_gifs where id = 'd0000000-0000-4000-8000-0000000000c1' and size_bytes = 120000) = 1, 'migración idempotente: el GIF de antes se conserva');
select tests.ok((select count(*) from pg_constraint where conrelid = 'grasa.exercise_gifs'::regclass and conname in ('exercise_gifs_mime_ok', 'exercise_gifs_size_ok')) = 2
                and exists (select 1 from storage.buckets where id = 'ejercicios' and file_size_limit = 10485760), 'migración idempotente: dos checks y bucket de 10 MB tras aplicarla dos veces más');
select tests.login('x');
select tests.ok((grasa.register_gif('d0000000-0000-4000-8000-0000000000c2', 'GIF de la app vieja', 'image/gif', 200000, '474946383961010001000000') ->> 'mime') = 'image/gif', 'la app vieja sigue subiendo GIF como antes');
reset role;

-- ---------- Seguridad: las funciones siguen cerradas ----------
select tests.ok(not has_function_privilege('authenticated', 'grasa.gif_head_ok(text, text)', 'execute')
                and not has_function_privilege('anon', 'grasa.register_gif(uuid, text, text, int, text)', 'execute')
                and has_function_privilege('authenticated', 'grasa.register_gif(uuid, text, text, int, text)', 'execute'),
  'gif_head_ok sigue interna; anon no registra; authenticated sí (solo coaches pasan la función)');
select tests.ok((select p.prosecdef and coalesce(p.proconfig @> array['search_path=""'], false) from pg_proc p where p.oid = 'grasa.register_gif(uuid, text, text, int, text)'::regprocedure),
  'register_gif sigue siendo SECURITY DEFINER con search_path fijo');
rollback;
