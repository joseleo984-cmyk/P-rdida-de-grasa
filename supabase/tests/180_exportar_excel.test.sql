-- R1 v1.14: M6 «Exportar a Excel» (concepto jurídico 6). Lo clave:
--   · cada exportación queda registrada SIN contenido (cuántos asesorados, categorías, rango, casilla) y solo si el coach aceptó la versión del
--     acuerdo con la cláusula 14; sin casilla no se registra (y la app no entrega el archivo);
--   · el coach ve SU historial; nadie lee la tabla por la API; el admin solo ve CUÁNTAS (M9), nunca identidades; nada para anon;
--   · los datos del archivo salen de coach_pull: se comprueba que con los permisos de compartir y la pausa privada no trae nada que no deba.
begin;
create function tests.today() returns date language sql stable security definer set search_path = '' as $$ select grasa.today_bogota() $$;
-- Acuerdo del coach con versión concreta (tests.agree usa la versión 't').
create function tests.agree_v(p_name text, p_version text, p_granted boolean default true) returns void
language sql security definer set search_path = '' as $$
  insert into core.consent_events (user_id, app_id, kind, granted, version, text_hash, client_at)
  values (tests.uid(p_name), 'grasa', 'coach_agreement', p_granted, p_version, tests.h(p_version), now())
$$;
grant execute on all functions in schema tests to authenticated, anon;

select tests.cloud('ana'); select tests.cloud('bea');
select tests.agree_v('x', '0.4-A7-coach'); select tests.agree('y'); select tests.consent('admin', 'coach_agreement');
insert into core.app_access (user_id, app_id, role, active) values (tests.uid('admin'), 'grasa', 'admin', true) on conflict (user_id, app_id, role) do update set active = true;
select tests.login('x'); select core.join_app('grasa');
select set_config('t.code_x', (select invite_code from grasa.become_coach('Coach X Fit')), true);
reset role; select tests.login('y'); select core.join_app('grasa');
select set_config('t.code_y', (select invite_code from grasa.become_coach('Coach Y Fit')), true);
reset role;
-- Ana comparte comidas pero NO hábitos ni notas; Bea comparte hábitos y notas.
select tests.login('ana'); select core.join_app('grasa');
select grasa.join_coach(current_setting('t.code_x'), jsonb_build_object('body', true, 'nutrition', true, 'habits', false, 'notes', false, 'version', '0.1', 'text_hash', tests.h('c')));
reset role; select tests.login('bea'); select core.join_app('grasa');
select grasa.join_coach(current_setting('t.code_x'), jsonb_build_object('body', true, 'nutrition', true, 'habits', true, 'notes', true, 'version', '0.1', 'text_hash', tests.h('c')));
reset role; select tests.paid('ana', 30); select tests.paid('bea', 30);

-- ================= Lo que llega al coach para el archivo (coach_pull): permisos y pausa =================
select tests.login('ana');
select grasa.sync_push(jsonb_build_array(
  jsonb_build_object('id', gen_random_uuid(), 'kind', 'entry', 'nkey', (tests.today() - 3)::text, 'date', tests.today() - 3, 'data', '{"weight": 70, "note": "nota privada de Ana"}'::jsonb, 'updated_at', now()),
  jsonb_build_object('id', gen_random_uuid(), 'kind', 'habit', 'nkey', (tests.today() - 3)::text, 'date', tests.today() - 3, 'data', '{"water": 2, "trained": true}'::jsonb, 'updated_at', now())), '[]'::jsonb);
reset role;
-- Un registro de Bea escrito en pausa (el servidor lo marca pause_private) no debe llegar nunca.
select tests.login('bea');
select grasa.sync_push(jsonb_build_array(
  jsonb_build_object('id', gen_random_uuid(), 'kind', 'habit', 'nkey', (tests.today() - 2)::text, 'date', tests.today() - 2, 'data', '{"water": 3, "trained": true, "effort": "duro"}'::jsonb, 'updated_at', now())), '[]'::jsonb);
reset role; select tests.paid('bea', -1); select tests.login('bea');
select grasa.sync_push(jsonb_build_array(
  jsonb_build_object('id', gen_random_uuid(), 'kind', 'habit', 'nkey', (tests.today() - 1)::text, 'date', tests.today() - 1, 'data', '{"water": 1, "trained": true}'::jsonb, 'updated_at', now())), '[]'::jsonb);
reset role; select tests.paid('bea', 30);
select tests.ok((select pause_private from grasa.records where user_id = tests.uid('bea') and kind = 'habit' and nkey = (tests.today() - 1)::text), 'el hábito escrito en pausa quedó privado');
select tests.login('x');
select tests.ok(not exists (select 1 from jsonb_array_elements(grasa.coach_pull(tests.uid('ana')) -> 'records') r where r ->> 'kind' = 'habit'),
  'archivo: de quien NO comparte hábitos no llega ningún hábito ni entreno');
select tests.ok(not exists (select 1 from jsonb_array_elements(grasa.coach_pull(tests.uid('ana')) -> 'records') r where r -> 'data' ? 'note'),
  'archivo: sin share_notes no llega la nota privada');
select tests.ok((select count(*) = 1 from jsonb_array_elements(grasa.coach_pull(tests.uid('bea')) -> 'records') r where r ->> 'kind' = 'habit'),
  'archivo: lo escrito en pausa privada NO llega (solo el hábito normal de Bea)');
select tests.ok(not exists (select 1 from jsonb_array_elements(grasa.coach_pull(tests.uid('bea')) -> 'photos')), 'archivo: sin fotos compartidas no llega ninguna');

-- ================= Sin la versión del acuerdo con la cláusula 14 no se registra =================
select tests.throws($$select grasa.log_export(1, array['medidas'], tests.today() - 30, tests.today(), true)$$, 'export_agreement_required',
  'con el acuerdo 0.4-A7-coach (sin la cláusula 14) NO puede exportar');
select tests.ok((select count(*) = 2 from grasa.coach_clients()), 'pero el resto de la app sigue funcionando con la 0.4 (sin re-aceptación forzada)');
reset role; select tests.agree_v('x', '0.5-A7-coach'); select tests.login('x');

-- ================= Registro de cada exportación =================
select tests.throws($$select grasa.log_export(2, array['medidas'], tests.today() - 30, tests.today(), false)$$, 'custody_required', 'sin la casilla marcada: no se registra');
select tests.throws($$select grasa.log_export(2, array['medidas'], tests.today() - 30, tests.today(), null)$$, 'custody_required', 'casilla nula: no se registra');
select tests.throws($$select grasa.log_export(2, array['fotos'], tests.today() - 30, tests.today(), true)$$, 'invalid', 'las fotos no son una categoría exportable');
select tests.throws($$select grasa.log_export(2, array[]::text[], tests.today() - 30, tests.today(), true)$$, 'invalid', 'sin categorías: invalid');
select tests.throws($$select grasa.log_export(3, array['medidas'], tests.today() - 30, tests.today(), true)$$, 'invalid', 'más asesorados de los que tiene: invalid');
select tests.throws($$select grasa.log_export(0, array['medidas'], tests.today() - 30, tests.today(), true)$$, 'invalid', 'cero asesorados: invalid');
select tests.throws($$select grasa.log_export(1, array['medidas'], tests.today(), tests.today() - 1, true)$$, 'invalid', 'desde después de hasta: invalid');
select tests.throws($$select grasa.log_export(1, array['medidas'], tests.today(), tests.today() + 5, true)$$, 'invalid', 'hasta en el futuro: invalid');
select tests.ok((grasa.log_export(2, array['medidas', 'comidas', 'habitos', 'entrenos', 'medidas'], tests.today() - 90, tests.today(), true)) ->> 'clients' = '2',
  'con acuerdo 0.5 y casilla: queda registrada');
select grasa.log_export(1, array['comidas'], tests.today() - 30, tests.today(), true);
select tests.ok((select count(*) = 2 from grasa.my_exports()), 'el coach ve su historial');
select tests.ok((select categories = array['comidas', 'entrenos', 'habitos', 'medidas'] and clients = 2 and date_from = tests.today() - 90
  from grasa.my_exports() order by created_at, clients desc limit 1), 'guarda categorías (sin repetir), cuántos asesorados y el rango');
reset role;
select tests.ok((select count(*) = 2 and bool_and(custody_ack) and bool_and(agreement_version = '0.5-A7-coach') from grasa.coach_exports where coach_id = tests.uid('x')),
  'guarda que la casilla se marcó y con qué versión del acuerdo');
select tests.ok(not exists (select 1 from information_schema.columns where table_schema = 'grasa' and table_name = 'coach_exports'
  and column_name not in ('id', 'coach_id', 'created_at', 'clients_count', 'categories', 'date_from', 'date_to', 'custody_ack', 'agreement_version')),
  'la tabla NO tiene columnas para contenido ni para identidades de asesorados');
select tests.throws($$insert into grasa.coach_exports (coach_id, clients_count, categories, date_from, date_to, custody_ack, agreement_version)
  values (tests.uid('x'), 1, array['medidas'], current_date, current_date, false, 'x')$$, 'check', 'ni a mano se guarda una exportación sin la casilla');

-- ================= Quién ve qué =================
select tests.login('x');
select tests.throws($$select count(*) from grasa.coach_exports$$, 'permission denied', 'nadie lee la tabla de exportaciones por la API');
select tests.throws($$insert into grasa.coach_exports (coach_id, clients_count, categories, date_from, date_to, custody_ack, agreement_version) values (auth.uid(), 1, array['medidas'], current_date, current_date, true, 'x')$$,
  'permission denied', 'nadie escribe la tabla de exportaciones por la API');
reset role; select tests.login('y');
select tests.ok(not exists (select 1 from grasa.my_exports()), 'otro coach NO ve las exportaciones de X');
select tests.throws($$select grasa.log_export(1, array['medidas'], tests.today() - 30, tests.today(), true)$$, 'export_agreement_required', 'Y (acuerdo sin cláusula 14) no exporta');
reset role; select tests.login('ana');
select tests.throws($$select * from grasa.my_exports()$$, 'forbidden', 'un asesorado NO ve nada de esto');
select tests.throws($$select grasa.log_export(1, array['medidas'], tests.today() - 30, tests.today(), true)$$, 'forbidden', 'un asesorado no puede registrar exportaciones');
reset role; select tests.login('admin');
select tests.ok(((grasa.admin_coach_usage(tests.uid('x'), tests.today())) ->> 'exports')::int = 2, 'M9: el admin ve SOLO cuántas exportaciones hizo el coach en el mes');
reset role;
-- El admin nunca recibe ids de asesorados en la respuesta de M9.
select tests.login('admin');
select tests.ok(position(tests.uid('ana')::text in (grasa.admin_coach_usage(tests.uid('x'), tests.today()))::text) = 0
  and position(tests.uid('bea')::text in (grasa.admin_coach_usage(tests.uid('x'), tests.today()))::text) = 0, 'M9 no trae identidades de asesorados');
select tests.throws($$select * from grasa.my_exports()$$, 'forbidden', 'el admin (sin ser coach) no lee historiales de exportación');
reset role;
-- Coach suspendido: no exporta.
update grasa.coaches set active = false where user_id = tests.uid('x');
select tests.login('x');
select tests.throws($$select grasa.log_export(1, array['medidas'], tests.today() - 30, tests.today(), true)$$, 'forbidden', 'un coach suspendido no exporta');
reset role;
-- Retirar el acuerdo (último evento granted = false) también lo impide.
update grasa.coaches set active = true where user_id = tests.uid('x');
select tests.agree_v('x', '0.5-A7-coach', false);
select tests.login('x');
select tests.throws($$select grasa.log_export(1, array['medidas'], tests.today() - 30, tests.today(), true)$$, 'forbidden', 'acuerdo retirado: no exporta');
reset role;

-- ================= Permisos =================
select tests.login('anon');
select tests.throws($$select grasa.log_export(1, array['medidas'], current_date, current_date, true)$$, 'permission denied', 'anon no ejecuta log_export');
select tests.throws($$select * from grasa.my_exports()$$, 'permission denied', 'anon no ejecuta my_exports');
reset role;
select tests.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'grasa' and p.proname in ('log_export', 'my_exports', 'export_agreement_of', 'export_agreement_versions', 'admin_coach_usage')
    and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('public', p.oid, 'execute'))), 'ninguna función de M6 para anon ni public');
select tests.ok(not has_function_privilege('authenticated', 'grasa.export_agreement_of(uuid)', 'execute'), 'la función interna del acuerdo no se ejecuta por la API');
select tests.ok((select bool_and(p.prosecdef) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'grasa' and p.proname in ('log_export', 'my_exports')),
  'log_export y my_exports son SECURITY DEFINER');
rollback;
