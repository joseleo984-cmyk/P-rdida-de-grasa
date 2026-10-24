-- Textos legales del 24/10/2026 (r1 v1.10): bitácora «Quién vio mis fotos» (grasa.my_photo_views).
--   · El cliente ve SOLO las aperturas de sus fotos: cuándo, qué foto (fecha y pose) y el nombre del coach; la más reciente primero; tope de 100.
--   · Otro cliente, otro coach y el propio coach no ven filas ajenas; anónimo no ejecuta la función; una foto de otro no aparece.
--   · Tras terminar el vínculo, el cliente sigue viendo su bitácora (con el nombre del coach).
--   · La migración es idempotente y no toca lo que ya había.
begin;
select tests.agree('x'); select tests.agree('y'); select tests.cloud('ana'); select tests.cloud('bea');

-- Preparación: coach X con cliente Ana (fotos compartidas) y coach Y con cliente Bea
select tests.login('x');
select set_config('t.code_x', (select invite_code from grasa.become_coach('Coach X Fit')), true);
reset role; select tests.login('y');
select set_config('t.code_y', (select invite_code from grasa.become_coach('Coach Y Fit')), true);
reset role; select tests.login('ana');
select grasa.join_coach(current_setting('t.code_x'), jsonb_build_object('body', true, 'photos', true, 'version', '0.1', 'text_hash', tests.h('c')));
reset role; select tests.login('bea');
select grasa.join_coach(current_setting('t.code_y'), jsonb_build_object('body', true, 'photos', true, 'version', '0.1', 'text_hash', tests.h('c')));
reset role; select tests.paid('ana'); select tests.paid('bea'); select tests.login('ana');
select grasa.sync_push('[]'::jsonb, jsonb_build_array(
  jsonb_build_object('id', '20000000-0000-4000-8000-000000000001', 'date', '2026-10-01', 'pose', 'frente',
                     'storage_path', tests.uid('ana') || '/20000000-0000-4000-8000-000000000001.jpg', 'shared_with_coach', true,
                     'created_at', '2026-10-01T10:00:00Z', 'updated_at', '2026-10-01T10:00:00Z'),
  jsonb_build_object('id', '20000000-0000-4000-8000-000000000002', 'date', '2026-10-15', 'pose', 'perfil',
                     'storage_path', tests.uid('ana') || '/20000000-0000-4000-8000-000000000002.jpg', 'shared_with_coach', true,
                     'created_at', '2026-10-15T10:00:00Z', 'updated_at', '2026-10-15T10:00:00Z')));
reset role; select tests.login('bea');
select grasa.sync_push('[]'::jsonb, jsonb_build_array(
  jsonb_build_object('id', '20000000-0000-4000-8000-0000000000b1', 'date', '2026-10-02', 'pose', 'espalda',
                     'storage_path', tests.uid('bea') || '/20000000-0000-4000-8000-0000000000b1.jpg', 'shared_with_coach', true,
                     'created_at', '2026-10-02T10:00:00Z', 'updated_at', '2026-10-02T10:00:00Z')));
reset role;

-- ---------- Vacía mientras nadie mire ----------
select tests.login('ana');
select tests.ok((select count(*) from grasa.my_photo_views()) = 0, 'sin aperturas, la bitácora de Ana está vacía');
reset role;

-- ---------- Las aperturas del coach aparecen, la más reciente primero ----------
select tests.login('x');
select grasa.coach_photo_opened('20000000-0000-4000-8000-000000000001');
reset role;
update grasa.photo_views set viewed_at = '2026-10-20T15:00:00Z' where coach_id = tests.uid('x');
select tests.login('x');
select grasa.coach_photo_opened('20000000-0000-4000-8000-000000000002');
reset role; select tests.login('y');
select grasa.coach_photo_opened('20000000-0000-4000-8000-0000000000b1');
reset role;

select tests.login('ana');
select tests.ok((select count(*) from grasa.my_photo_views()) = 2, 'Ana ve sus 2 aperturas (no la de Bea)');
select tests.ok((select array_agg(photo_id::text order by viewed_at desc) from grasa.my_photo_views())
                = array['20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001'], 'la más reciente va primero');
select tests.ok((select photo_date = '2026-10-15' and pose = 'perfil' and coach_name = 'Coach X Fit'
                   from grasa.my_photo_views() where photo_id = '20000000-0000-4000-8000-000000000002'), 'trae la fecha y la pose de la foto y el nombre del coach');
select tests.ok((select count(*) from grasa.my_photo_views(1)) = 1, 'p_limit acota el resultado');
select tests.ok((select count(*) from grasa.my_photo_views(0)) = 1 and (select count(*) from grasa.my_photo_views(null)) = 2, 'p_limit 0 se sube a 1 y null vale 100');
reset role;

-- ---------- Otras personas no ven lo ajeno ----------
select tests.login('bea');
select tests.ok((select count(*) from grasa.my_photo_views()) = 1 and (select coach_name from grasa.my_photo_views()) = 'Coach Y Fit', 'Bea ve solo su apertura');
reset role; select tests.login('x');
select tests.ok((select count(*) from grasa.my_photo_views()) = 0, 'el coach no ve aperturas por esta función (no es cliente)');
reset role;
select tests.ok(not has_function_privilege('anon', 'grasa.my_photo_views(int)', 'execute')
                and has_function_privilege('authenticated', 'grasa.my_photo_views(int)', 'execute'), 'anónimo no ejecuta; authenticated sí');
select tests.ok((select p.prosecdef and coalesce(p.proconfig @> array['search_path=""'], false) from pg_proc p where p.oid = 'grasa.my_photo_views(int)'::regprocedure),
  'SECURITY DEFINER con search_path fijo');
set role anon;
select tests.throws($$select * from grasa.my_photo_views()$$, 'permission denied', 'anónimo no puede llamarla');
reset role;

-- ---------- Tras terminar el vínculo el cliente conserva su bitácora ----------
select tests.login('ana');
select grasa.leave_coach();
select tests.ok((select count(*) from grasa.my_photo_views()) = 2, 'tras dejar al coach, Ana sigue viendo quién abrió sus fotos');
reset role;

-- ---------- Tope de 100 ----------
insert into grasa.photo_views (photo_id, coach_id, client_id, viewed_at)
  select '20000000-0000-4000-8000-000000000001', tests.uid('x'), tests.uid('ana'), '2026-10-21T00:00:00Z'::timestamptz + (g || ' seconds')::interval from generate_series(1, 150) g;
select tests.login('ana');
select tests.ok((select count(*) from grasa.my_photo_views(500)) = 100, 'nunca más de 100 filas');
reset role;

-- ---------- Migración idempotente ----------
\ir ../migrations/20261028120000_r1_bitacora_fotos.sql
\ir ../migrations/20261028120000_r1_bitacora_fotos.sql
select tests.login('ana');
select tests.ok((select count(*) from grasa.my_photo_views(500)) = 100, 'migración idempotente: la función sigue igual');
reset role;
select tests.ok(not has_function_privilege('anon', 'grasa.my_photo_views(int)', 'execute') and has_function_privilege('authenticated', 'grasa.my_photo_views(int)', 'execute'),
  'migración idempotente: permisos intactos');
rollback;
