-- Etapa 2 (r1 v1.7): rutinas de ejercicios y biblioteca de GIFs del coach.
--   · El coach registra GIFs (tipo, tamaño y firma de bytes validados) y arma UNA rutina por cliente vinculado (máx. 7 días × 12 ejercicios).
--   · Bucket 'ejercicios': el coach sube solo un id registrado a su carpeta; el cliente lee SOLO los GIFs de su coach con vínculo activo.
--   · Otro coach no ve rutinas ni GIFs ajenos; un cliente no ve la rutina de otro; sin vínculo activo no se lee nada.
--   · Con el acceso en pausa por pago el cliente sigue viendo su rutina (es lectura).
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
reset role; select tests.login('bea');
select core.join_app('grasa');
select grasa.join_coach(current_setting('t.code_x'), jsonb_build_object('body', true, 'version', '0.1', 'text_hash', tests.h('c')));
reset role;

-- ---------- Tablas cerradas: nadie las toca por la API de tablas ----------
select tests.login('x');
select tests.throws($$select count(*) from grasa.routines$$, 'permission denied', 'el coach no lee grasa.routines directamente (solo por funciones)');
select tests.throws($$select count(*) from grasa.exercise_gifs$$, 'permission denied', 'el coach no lee grasa.exercise_gifs directamente');
select tests.throws($$insert into grasa.exercise_gifs (id, coach_id, name, mime, size_bytes) values (gen_random_uuid(), auth.uid(), 'x', 'image/gif', 1)$$, 'permission denied', 'ni inserta GIFs saltándose register_gif');
reset role; select tests.login('ana');
select tests.throws($$select count(*) from grasa.routines$$, 'permission denied', 'el cliente no lee grasa.routines directamente');
reset role; select tests.login('anon');
select tests.throws($$select grasa.my_routine()$$, 'permission denied', 'anon no ejecuta my_routine');
select tests.throws($$select grasa.my_gifs()$$, 'permission denied', 'anon no ejecuta my_gifs');
reset role;

-- ---------- Registrar un GIF: tipo, tamaño y firma de bytes ----------
select tests.login('x');
select tests.ok((grasa.register_gif('a0000000-0000-4000-8000-000000000001', '  Press de banca  ', 'image/gif', 120000, '474946383961010001000000') ->> 'name') = 'Press de banca',
  'el coach registra un GIF89a de 120 KB (el nombre se recorta)');
select tests.ok((grasa.register_gif('a0000000-0000-4000-8000-000000000002', 'Sentadilla', 'image/webp', 2000000, '524946462400000057454250') ->> 'mime') = 'image/webp',
  'registra un WebP animado válido (RIFF…WEBP)');
select tests.ok((grasa.register_gif('a0000000-0000-4000-8000-000000000001', 'Press banca plano', 'image/gif', 120000, '474946383761010001000000') ->> 'name') = 'Press banca plano'
                and (select count(*) from grasa.my_gifs()) = 2, 'registrar dos veces el mismo id actualiza (reintento seguro), no duplica');
select tests.throws($$select grasa.register_gif(gen_random_uuid(), 'Foto', 'image/png', 1000, '474946383961010001000000')$$, 'invalid', 'tipo image/png rechazado');
select tests.throws($$select grasa.register_gif(gen_random_uuid(), 'Video', 'video/mp4', 1000, '474946383961010001000000')$$, 'invalid', 'tipo video/mp4 rechazado');
select tests.throws($$select grasa.register_gif(gen_random_uuid(), 'Grande', 'image/gif', 3145729, '474946383961010001000000')$$, 'invalid', 'más de 3 MB rechazado');
select tests.throws($$select grasa.register_gif(gen_random_uuid(), 'Vacío', 'image/gif', 0, '474946383961010001000000')$$, 'invalid', 'archivo de 0 bytes rechazado');
select tests.ok((grasa.register_gif('a0000000-0000-4000-8000-0000000000f1', 'Justo 3 MB', 'image/gif', 3145728, '474946383961010001000000') ->> 'size_bytes')::int = 3145728, 'exactamente 3 MB sí se acepta');
select tests.throws($$select grasa.register_gif(gen_random_uuid(), 'Falso', 'image/gif', 1000, '89504e470d0a1a0a00000000')$$, 'invalid', 'un PNG disfrazado de GIF (firma de bytes distinta) se rechaza');
select tests.throws($$select grasa.register_gif(gen_random_uuid(), 'Falso', 'image/webp', 1000, '474946383961010001000000')$$, 'invalid', 'bytes de GIF con tipo webp se rechazan');
select tests.throws($$select grasa.register_gif(gen_random_uuid(), 'Sin firma', 'image/gif', 1000, null)$$, 'invalid', 'sin firma de bytes se rechaza');
select tests.throws($$select grasa.register_gif(gen_random_uuid(), 'Corta', 'image/gif', 1000, '4749463839')$$, 'invalid', 'firma incompleta se rechaza');
select tests.throws($$select grasa.register_gif(gen_random_uuid(), '   ', 'image/gif', 1000, '474946383961010001000000')$$, 'invalid', 'nombre vacío rechazado');
select tests.throws($$select grasa.register_gif(gen_random_uuid(), repeat('a', 61), 'image/gif', 1000, '474946383961010001000000')$$, 'invalid', 'nombre de más de 60 caracteres rechazado');
select grasa.delete_gif('a0000000-0000-4000-8000-0000000000f1');
select tests.ok((select count(*) from grasa.my_gifs()) = 2, 'my_gifs lista las 2 animaciones del coach (el de prueba de 3 MB se borró)');

-- Otro coach no puede pisar ni borrar un GIF ajeno, ni ve la biblioteca de X
reset role; select tests.login('y');
select tests.throws($$select grasa.register_gif('a0000000-0000-4000-8000-000000000001', 'Mío ahora', 'image/gif', 1000, '474946383961010001000000')$$, 'forbidden', 'Y no puede pisar el id de un GIF de X');
select tests.throws($$select grasa.delete_gif('a0000000-0000-4000-8000-000000000001')$$, 'not_found', 'Y no puede borrar un GIF de X (ni sabe que existe)');
select tests.ok((select count(*) from grasa.my_gifs()) = 0, 'Y no ve los GIFs de X en su biblioteca');
select grasa.register_gif('b0000000-0000-4000-8000-000000000001', 'Remo de Y', 'image/gif', 5000, '474946383961010001000000');
-- Quien no es coach ni tiene acuerdo no registra
reset role; select tests.login('bea');
select tests.throws($$select grasa.register_gif(gen_random_uuid(), 'Intruso', 'image/gif', 1000, '474946383961010001000000')$$, 'forbidden', 'un cliente (sin acuerdo de coach) no registra GIFs');
select tests.throws($$select grasa.my_gifs()$$, 'forbidden', 'un cliente no ve biblioteca de coach');

-- ---------- Storage: el coach sube solo ids registrados a su carpeta ----------
reset role; select tests.login('x');
insert into storage.objects (bucket_id, name) values ('ejercicios', tests.uid('x') || '/a0000000-0000-4000-8000-000000000001.gif');
insert into storage.objects (bucket_id, name) values ('ejercicios', tests.uid('x') || '/a0000000-0000-4000-8000-000000000002.gif');
select tests.ok((select count(*) from storage.objects where bucket_id = 'ejercicios') = 2, 'el coach sube sus dos GIFs registrados a su carpeta y los ve');
select tests.throws(format($$insert into storage.objects (bucket_id, name) values ('ejercicios', '%s/a0000000-0000-4000-8000-0000000000aa.gif')$$, tests.uid('x')), 'row-level security', 'subir un id NO registrado se rechaza');
select tests.throws(format($$insert into storage.objects (bucket_id, name) values ('ejercicios', '%s/a0000000-0000-4000-8000-000000000001.gif')$$, tests.uid('y')), 'row-level security', 'X no sube a la carpeta de otro coach');
select tests.throws(format($$insert into storage.objects (bucket_id, name) values ('ejercicios', '%s/a0000000-0000-4000-8000-000000000001.png')$$, tests.uid('x')), 'row-level security', 'extensión distinta de .gif rechazada');
select tests.throws(format($$insert into storage.objects (bucket_id, name) values ('ejercicios', '%s/sub/a0000000-0000-4000-8000-000000000001.gif')$$, tests.uid('x')), 'row-level security', 'subcarpetas rechazadas');
select tests.throws($$insert into storage.objects (bucket_id, name) values ('ejercicios', 'a0000000-0000-4000-8000-000000000001.gif')$$, 'row-level security', 'sin carpeta de coach rechazado');

-- ---------- Storage: quién lee ----------
reset role; select tests.login('ana');
select tests.ok((select count(*) from storage.objects where bucket_id = 'ejercicios') = 2, 'Ana (cliente vinculada a X, aunque su pago NO esté al día) lee los GIFs de su coach');
select tests.ok(grasa.payment_blocked_me(), '... y está en pausa por pago (sin fecha): ver es lectura, no se bloquea');
select tests.throws(format($$insert into storage.objects (bucket_id, name) values ('ejercicios', '%s/a0000000-0000-4000-8000-000000000001.gif')$$, tests.uid('x')), 'row-level security', 'un cliente no sube GIFs ni a la carpeta de su coach');
delete from storage.objects where bucket_id = 'ejercicios';
reset role;
select tests.ok((select count(*) from storage.objects where bucket_id = 'ejercicios') = 2, 'un cliente no borra los GIFs de su coach (el DELETE no afecta ninguna fila)');
select tests.login('y');
select tests.ok((select count(*) from storage.objects where bucket_id = 'ejercicios') = 0, 'otro coach (Y) no ve los archivos de X');
select tests.throws(format($$insert into storage.objects (bucket_id, name) values ('ejercicios', '%s/a0000000-0000-4000-8000-000000000001.gif')$$, tests.uid('y')), 'row-level security', 'Y no puede subir a SU carpeta un id que registró X');
insert into storage.objects (bucket_id, name) values ('ejercicios', tests.uid('y') || '/b0000000-0000-4000-8000-000000000001.gif');
select tests.ok((select count(*) from storage.objects where bucket_id = 'ejercicios') = 1, 'Y ve solo el suyo');
delete from storage.objects where bucket_id = 'ejercicios' and name like tests.uid('x') || '/%';
reset role;
select tests.ok((select count(*) from storage.objects where bucket_id = 'ejercicios' and name like tests.uid('x') || '/%') = 2, 'Y tampoco borra archivos de X');
select tests.login('admin');
select tests.ok((select count(*) from storage.objects where bucket_id = 'ejercicios') = 0, 'una persona sin vínculo con ningún coach no lee ningún GIF');
reset role;

-- ---------- Rutinas: crear ----------
select tests.login('x');
select set_config('t.r1', $j${"days":[
  {"title":"Día 1 – Pecho y tríceps","exercises":[
    {"name":"Press de banca","sets":"4 × 12","note":"Baja despacio","gif":"a0000000-0000-4000-8000-000000000001"},
    {"name":"Fondos","sets":"3 × 10"}]},
  {"title":"Día 2 – Descanso","exercises":[]}]}$j$, true);
select tests.ok((grasa.save_routine(tests.uid('ana'), '  Rutina de fuerza  ', current_setting('t.r1')::jsonb) ->> 'title') = 'Rutina de fuerza', 'el coach X crea la rutina de Ana (con un GIF suyo y un día de descanso)');
select tests.ok((grasa.get_routine(tests.uid('ana')) -> 'content' -> 'days' -> 0 -> 'exercises' -> 0 ->> 'gif') = 'a0000000-0000-4000-8000-000000000001', 'get_routine devuelve el contenido guardado');
select grasa.save_routine(tests.uid('ana'), 'Rutina de fuerza v2', current_setting('t.r1')::jsonb);
reset role;
select tests.ok((select count(*) from grasa.routines where client_id = tests.uid('ana')) = 1 and (select title from grasa.routines where client_id = tests.uid('ana')) = 'Rutina de fuerza v2', 'guardar otra vez REEMPLAZA: una sola rutina por cliente');
select tests.login('x');
select tests.ok(grasa.get_routine(tests.uid('bea')) is null, 'Bea todavía no tiene rutina (null)');

-- Validación en el servidor
select tests.throws(format($$select grasa.save_routine(%L, 'T', %L::jsonb)$$, tests.uid('ana'), '{"days":[]}'), 'invalid', 'cero días rechazado');
select tests.throws(format($$select grasa.save_routine(%L, 'T', %L::jsonb)$$, tests.uid('ana'),
  (select jsonb_build_object('days', jsonb_agg(jsonb_build_object('title', 'D' || g, 'exercises', '[]'::jsonb)))::text from generate_series(1, 8) g)), 'invalid', '8 días rechazado (máximo 7)');
select tests.ok((grasa.save_routine(tests.uid('ana'), 'T', (select jsonb_build_object('days', jsonb_agg(jsonb_build_object('title', 'D' || g, 'exercises', '[]'::jsonb))) from generate_series(1, 7) g)) ->> 'title') = 'T', '7 días exactos sí');
select tests.throws(format($$select grasa.save_routine(%L, 'T', %L::jsonb)$$, tests.uid('ana'),
  (select jsonb_build_object('days', jsonb_build_array(jsonb_build_object('title', 'D', 'exercises', jsonb_agg(jsonb_build_object('name', 'E' || g, 'sets', '3 × 10')))))::text from generate_series(1, 13) g)), 'invalid', '13 ejercicios en un día rechazado (máximo 12)');
select tests.ok((grasa.save_routine(tests.uid('ana'), 'T', (select jsonb_build_object('days', jsonb_build_array(jsonb_build_object('title', 'D', 'exercises', jsonb_agg(jsonb_build_object('name', 'E' || g, 'sets', '3 × 10'))))) from generate_series(1, 12) g)) ->> 'title') = 'T', '12 ejercicios exactos sí');
select tests.throws(format($$select grasa.save_routine(%L, '', %L::jsonb)$$, tests.uid('ana'), current_setting('t.r1')), 'invalid', 'título vacío rechazado');
select tests.throws(format($$select grasa.save_routine(%L, %L, %L::jsonb)$$, tests.uid('ana'), repeat('t', 61), current_setting('t.r1')), 'invalid', 'título de 61 caracteres rechazado');
select tests.throws(format($$select grasa.save_routine(%L, 'T', %L::jsonb)$$, tests.uid('ana'), '{"days":[{"title":"D","exercises":[{"name":"E"}]}]}'), 'invalid', 'ejercicio sin series × repeticiones rechazado');
select tests.throws(format($$select grasa.save_routine(%L, 'T', %L::jsonb)$$, tests.uid('ana'), '{"days":[{"title":"D","exercises":[{"name":"E","sets":"3 × 10","peso":50}]}]}'), 'invalid', 'claves desconocidas rechazadas');
select tests.throws(format($$select grasa.save_routine(%L, 'T', %L::jsonb)$$, tests.uid('ana'), '{"days":[{"title":"D","exercises":[{"name":"E","sets":"3 × 10","gif":"no-es-uuid"}]}]}'), 'invalid', 'GIF que no es un uuid rechazado');
select tests.throws(format($$select grasa.save_routine(%L, 'T', %L::jsonb)$$, tests.uid('ana'), '{"days":[{"title":"D","exercises":[]}],"extra":1}'), 'invalid', 'clave extra en la raíz rechazada');
select tests.throws(format($$select grasa.save_routine(%L, 'T', %L::jsonb)$$, tests.uid('ana'), '{"days":[{"title":"D","exercises":[{"name":"E","sets":"3 × 10","note":"' || repeat('n', 201) || '"}]}]}'), 'invalid', 'nota de más de 200 caracteres rechazada');
select tests.throws(format($$select grasa.save_routine(%L, 'T', %L::jsonb)$$, tests.uid('ana'), '{"days":[{"title":"D","exercises":[{"name":"E","sets":"3 × 10","gif":"b0000000-0000-4000-8000-000000000001"}]}]}'), 'gif_not_found', 'usar el GIF de OTRO coach en una rutina se rechaza');
select tests.throws(format($$select grasa.save_routine(%L, 'T', %L::jsonb)$$, tests.uid('ana'), '[1,2]'), 'invalid', 'contenido que no es un objeto rechazado');
select tests.throws(format($$select grasa.save_routine(%L, 'T', %L::jsonb)$$, tests.uid('ana'), '{"days":[{"title":"D","exercises":[{"name":"' || repeat('x', 61) || '","sets":"3"}]}]}'), 'invalid', 'nombre de ejercicio de 61 caracteres rechazado');
select grasa.save_routine(tests.uid('ana'), 'Rutina de fuerza', current_setting('t.r1')::jsonb);

-- ---------- Rutinas: quién ve qué ----------
reset role; select tests.login('y');
select tests.throws(format($$select grasa.get_routine(%L)$$, tests.uid('ana')), 'forbidden', 'otro coach (Y) no lee la rutina del cliente de X');
select tests.throws(format($$select grasa.save_routine(%L, 'Mía', %L::jsonb)$$, tests.uid('ana'), '{"days":[{"title":"D","exercises":[]}]}'), 'forbidden', 'ni crea una rutina para el cliente de X');
select tests.ok(grasa.my_routine() is null, 'Y (que no es cliente de nadie) no tiene rutina');
select grasa.delete_routine(tests.uid('ana'));
reset role;
select tests.ok(exists (select 1 from grasa.routines where client_id = tests.uid('ana')), 'Y no puede borrar la rutina de X (delete_routine solo toca las propias)');
select tests.login('bea');
select tests.ok(grasa.my_routine() is null, 'Bea no ve la rutina de Ana (my_routine devuelve solo la propia)');
select tests.throws(format($$select grasa.get_routine(%L)$$, tests.uid('ana')), 'forbidden', 'un cliente no usa get_routine (función de coach)');
select tests.throws(format($$select grasa.save_routine(%L, 'Mía', %L::jsonb)$$, tests.uid('bea'), '{"days":[{"title":"D","exercises":[]}]}'), 'forbidden', 'un cliente no se arma su propia rutina por la API');
reset role; select tests.login('ana');
select tests.ok((grasa.my_routine() ->> 'title') = 'Rutina de fuerza' and (grasa.my_routine() ->> 'coach_id') = tests.uid('x')::text, 'Ana ve SU rutina, con el id de su coach');
select tests.ok(grasa.payment_blocked_me() and grasa.my_routine() is not null, 'con el acceso en pausa por pago, Ana sigue viendo su rutina');
select tests.ok((grasa.my_routine() ->> 'client_id') = tests.uid('ana')::text, 'la rutina que ve es la suya');

-- Un coach sin acuerdo vigente no usa las funciones de coach (sus archivos sí los ve)
reset role; select tests.consent('x', 'coach_agreement', false); select tests.login('x');
select tests.throws(format($$select grasa.get_routine(%L)$$, tests.uid('ana')), 'coach_agreement_required', 'sin acuerdo vigente: get_routine falla');
select tests.throws(format($$select grasa.save_routine(%L, 'T', %L::jsonb)$$, tests.uid('ana'), '{"days":[{"title":"D","exercises":[]}]}'), 'coach_agreement_required', 'sin acuerdo vigente: save_routine falla');
select tests.throws($$select grasa.register_gif(gen_random_uuid(), 'Nuevo', 'image/gif', 1000, '474946383961010001000000')$$, 'coach_agreement_required', 'sin acuerdo vigente: register_gif falla');
select tests.throws($$select grasa.my_gifs()$$, 'coach_agreement_required', 'sin acuerdo vigente: my_gifs falla');
select tests.ok((select count(*) from storage.objects where bucket_id = 'ejercicios') = 2, 'sin acuerdo sigue pudiendo ver sus archivos');
select tests.ok(not grasa.gif_upload_allowed('a0000000-0000-4000-8000-000000000001'), 'sin acuerdo vigente la política de subida (gif_upload_allowed) dice que no');
reset role; select tests.agree('x');

-- ---------- Borrar un GIF en uso y borrar rutinas ----------
select tests.login('x');
select tests.ok((select uses from grasa.my_gifs() where id = 'a0000000-0000-4000-8000-000000000001') = 1 and (select uses from grasa.my_gifs() where id = 'a0000000-0000-4000-8000-000000000002') = 0, 'my_gifs cuenta en cuántas rutinas se usa cada animación');
select tests.throws($$select grasa.delete_gif('a0000000-0000-4000-8000-000000000001')$$, 'gif_in_use', 'un GIF en uso en una rutina no se puede borrar');
select grasa.delete_gif('a0000000-0000-4000-8000-000000000002');
select tests.ok((select count(*) from grasa.my_gifs()) = 1, 'uno sin uso sí se borra');
select grasa.delete_routine(tests.uid('ana'));
select tests.ok(grasa.get_routine(tests.uid('ana')) is null, 'el coach borra la rutina de Ana');
select grasa.delete_gif('a0000000-0000-4000-8000-000000000001');
select tests.ok((select count(*) from grasa.my_gifs()) = 0, 'ya sin uso, el GIF se borra');
-- Tras borrar el registro, el cliente ya no lee ese archivo (aunque quede en Storage hasta que la app lo borre)
reset role; select tests.login('ana');
select tests.ok((select count(*) from storage.objects where bucket_id = 'ejercicios') = 0, 'GIF sin registro: el cliente ya no lo lee');
reset role; select tests.login('x');
delete from storage.objects where bucket_id = 'ejercicios';
select tests.ok((select count(*) from storage.objects where bucket_id = 'ejercicios') = 0, 'el coach borra sus archivos de Storage');

-- ---------- Sin vínculo activo no se lee nada ----------
select grasa.register_gif('a0000000-0000-4000-8000-000000000003', 'Dominadas', 'image/gif', 9000, '474946383961010001000000');
insert into storage.objects (bucket_id, name) values ('ejercicios', tests.uid('x') || '/a0000000-0000-4000-8000-000000000003.gif');
select grasa.save_routine(tests.uid('bea'), 'Rutina de Bea', '{"days":[{"title":"Día 1","exercises":[{"name":"Dominadas","sets":"3 × 8","gif":"a0000000-0000-4000-8000-000000000003"}]}]}'::jsonb);
reset role; select tests.login('bea');
select tests.ok(grasa.my_routine() is not null and (select count(*) from storage.objects where bucket_id = 'ejercicios') = 1, 'Bea (vinculada) ve su rutina y el GIF');
select grasa.leave_coach();
select tests.ok(grasa.my_routine() is null, 'Bea se desvincula: ya no ve la rutina');
select tests.ok((select count(*) from storage.objects where bucket_id = 'ejercicios') = 0, '... ni lee el GIF (sin vínculo activo)');
reset role; select tests.login('x');
select tests.throws(format($$select grasa.get_routine(%L)$$, tests.uid('bea')), 'forbidden', 'y el coach ya no ve la rutina de quien se fue');
select tests.throws(format($$select grasa.save_routine(%L, 'T', %L::jsonb)$$, tests.uid('bea'), '{"days":[{"title":"D","exercises":[]}]}'), 'forbidden', '... ni la edita');

-- ---------- La baja del coach no deja GIFs en Storage ----------
select tests.throws($$select core.delete_my_account()$$, 'invalid', 'el coach no puede borrar su cuenta mientras queden GIFs en Storage');
delete from storage.objects where bucket_id = 'ejercicios';
select core.delete_my_account();
reset role;
select tests.ok(not exists (select 1 from auth.users where id = tests.uid('x')) and not exists (select 1 from grasa.exercise_gifs where coach_id = tests.uid('x'))
                and not exists (select 1 from grasa.routines where coach_id = tests.uid('x')), 'tras la baja del coach no quedan sus GIFs ni sus rutinas');

-- ---------- Seguridad de las funciones y tablas ----------
select tests.ok(not has_function_privilege('authenticated', 'grasa.gif_head_ok(text, text)', 'execute')
                and not has_function_privilege('authenticated', 'grasa.routine_content_ok(jsonb)', 'execute')
                and not has_function_privilege('authenticated', 'grasa.routine_out(grasa.routines)', 'execute')
                and not has_function_privilege('anon', 'grasa.save_routine(uuid, text, jsonb)', 'execute')
                and not has_function_privilege('anon', 'grasa.client_can_read_gif(uuid, uuid)', 'execute')
                and has_function_privilege('authenticated', 'grasa.save_routine(uuid, text, jsonb)', 'execute'),
  'las validaciones son internas; anon no ejecuta nada; authenticated solo las funciones de la persona en sesión');
select tests.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'grasa' and p.proname in ('register_gif', 'my_gifs', 'delete_gif', 'gif_upload_allowed', 'client_can_read_gif', 'save_routine', 'get_routine', 'delete_routine', 'my_routine')
    and (not p.prosecdef or not coalesce(p.proconfig @> array['search_path=""'], false))), 'las funciones de rutinas son SECURITY DEFINER con search_path fijo');
select tests.ok(not has_table_privilege('authenticated', 'grasa.routines', 'select') and not has_table_privilege('authenticated', 'grasa.exercise_gifs', 'select')
                and (select relrowsecurity from pg_class where oid = 'grasa.routines'::regclass) and (select relrowsecurity from pg_class where oid = 'grasa.exercise_gifs'::regclass),
  'las dos tablas nuevas tienen RLS y ningún permiso directo');
rollback;
