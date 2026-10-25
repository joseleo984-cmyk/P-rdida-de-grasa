-- R1 v1.13: metas del coach (concepto 5), analítica del coach (M3/M5), panel admin (M7–M10) y avisos.
-- Lo clave: el coach solo ve cifras de SUS asesorados vinculados y activos (sin pause_private, con los permisos de compartir);
-- el admin NUNCA recibe datos de salud ni nombres, iniciales o ids de asesorados, y nada de esto es accesible a anon.
begin;
-- Tres asesorados más para los conteos por coach (el mínimo de grupo es 3).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000d1', 'c1@test.co', '{"display_name":"Ceci Uno"}'),
  ('00000000-0000-4000-8000-0000000000d2', 'c2@test.co', '{"display_name":"Ceci Dos"}'),
  ('00000000-0000-4000-8000-0000000000d3', 'c3@test.co', '{"display_name":"Ceci Tres"}');
insert into tests.users values ('c1', '00000000-0000-4000-8000-0000000000d1'), ('c2', '00000000-0000-4000-8000-0000000000d2'), ('c3', '00000000-0000-4000-8000-0000000000d3');
create function tests.today() returns date language sql stable security definer set search_path = '' as $$ select grasa.today_bogota() $$;
create function tests.rec(p_kind text, p_day date, p_data jsonb) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('id', u, 'kind', p_kind, 'nkey', case when p_kind = 'food' then u::text else p_day::text end,
    'date', p_day, 'data', p_data, 'updated_at', now())) from (select gen_random_uuid() u) x
$$;
-- Todas las claves (a cualquier profundidad) de un jsonb.
create function tests.keys(p jsonb) returns setof text language sql immutable as $$
  select distinct k from jsonb_path_query(p, 'lax $.**') v, jsonb_object_keys(case when jsonb_typeof(v) = 'object' then v else '{}'::jsonb end) k
$$;
grant execute on all functions in schema tests to authenticated, anon;

select tests.cloud(n) from unnest(array['ana', 'bea', 'c1', 'c2', 'c3']) n;
select tests.agree('x'); select tests.agree('y');
select tests.login('x'); select core.join_app('grasa');
select set_config('t.code_x', (select invite_code from grasa.become_coach('Coach X Fit')), true);
reset role; select tests.login('y'); select core.join_app('grasa');
select set_config('t.code_y', (select invite_code from grasa.become_coach('Coach Y Fit')), true);
reset role;
-- Ana NO comparte hábitos; c1, c2 y c3 sí. Bea sigue sin coach.
select tests.login('ana'); select core.join_app('grasa');
select grasa.join_coach(current_setting('t.code_x'), jsonb_build_object('body', true, 'nutrition', true, 'habits', false, 'version', '0.1', 'text_hash', tests.h('c')));
reset role;
do $$ declare n text; begin
  foreach n in array array['c1', 'c2', 'c3'] loop
    perform tests.login(n); perform core.join_app('grasa');
    perform grasa.join_coach(current_setting('t.code_x'), jsonb_build_object('body', true, 'nutrition', true, 'habits', true, 'version', '0.1', 'text_hash', tests.h('c')));
    reset role;
  end loop;
end $$;
select tests.paid(n, 30) from unnest(array['ana', 'c1', 'c2', 'c3']) n;

-- ================= K1: metas del coach =================
select tests.login('x');
select tests.ok((select goals = '{}'::jsonb from grasa.coach_clients() where client_id = tests.uid('ana')), 'sin metas: goals vacío (la plataforma no propone ningún número)');
select tests.ok((grasa.set_goals(tests.uid('ana'), '{"weight_kg": 69.7, "waist_cm": 74, "protein_g": 110, "water_days": 5, "trained_days": 3}')) -> 'goals'
  = '{"weight_kg": 69.7, "waist_cm": 74.0, "protein_g": 110, "water_days": 5, "trained_days": 3}'::jsonb, 'el coach fija metas de peso, cintura, proteína y hábitos');
select tests.ok((select protein_goal_g = 110 from grasa.coach_clients() where client_id = tests.uid('ana')), 'la proteína REUSA protein_goal_g (v1.11), no se duplica');
select grasa.set_protein_goal(tests.uid('ana'), 120);
select tests.ok((select (goals ->> 'protein_g')::int = 120 from grasa.coach_clients() where client_id = tests.uid('ana')), 'set_protein_goal y set_goals hablan del mismo dato');
select tests.throws(format($$select grasa.set_goals(%L, '{"weight_kg": 10}')$$, tests.uid('ana')), 'invalid', 'peso fuera de rango: invalid');
select tests.throws(format($$select grasa.set_goals(%L, '{"water_days": 9}')$$, tests.uid('ana')), 'invalid', 'más de 7 días por semana: invalid');
select tests.throws(format($$select grasa.set_goals(%L, '{"kcal": 1800}')$$, tests.uid('ana')), 'invalid', 'metas que no existen (kcal) se rechazan');
select tests.throws(format($$select grasa.set_goals(%L, '{"weight_kg": "70"}')$$, tests.uid('ana')), 'invalid', 'la meta debe ser un número');
reset role; select tests.login('y');
select tests.throws(format($$select grasa.set_goals(%L, '{"weight_kg": 60}')$$, tests.uid('ana')), 'forbidden', 'otro coach no fija metas a quien no es suyo');
reset role; select tests.login('ana');
select tests.throws(format($$select grasa.set_goals(%L, '{"weight_kg": 60}')$$, tests.uid('ana')), 'forbidden', 'la asesorada no fija sus propias metas');
select tests.ok((select goals ->> 'weight_kg' = '69.7' and goals ->> 'waist_cm' = '74.0' and goals ->> 'protein_g' = '120' and not goals ? 'steps_days' from grasa.my_link()),
  'la asesorada lee SUS metas en my_link(); las vacías no vienen');
select tests.throws($$update grasa.coach_links set goal_weight_kg = 50$$, 'permission denied', 'nadie cambia metas por la API de tablas');
reset role; select tests.login('x');
select tests.ok((grasa.set_goals(tests.uid('ana'), '{"weight_kg": 69.7, "waist_cm": 74, "protein_g": 110, "water_days": 5, "trained_days": 3}')) ? 'goals', 'vuelve a fijar las metas');
select tests.ok((grasa.set_goals(tests.uid('c3'), '{}')) -> 'goals' = '{}'::jsonb, 'un objeto vacío quita todas las metas');
reset role;

-- ================= K2: analítica del coach =================
-- Ana: pesos en 4 semanas y una comida; c1: hábitos con entreno; c2: un entreno en PAUSA (privado para siempre); c3 sin datos.
select tests.login('ana');
select grasa.sync_push(tests.rec('entry', tests.today() - 21, '{"weight": 74.0, "waist": 78.5}') || tests.rec('entry', tests.today() - 14, '{"weight": 73.4}')
  || tests.rec('entry', tests.today() - 7, '{"weight": 73.0}') || tests.rec('entry', tests.today(), '{"weight": 72.6, "waist": 77.5, "note": "secreto"}')
  || tests.rec('food', tests.today() - 1, '{"name": "Arepa", "kcal": 300, "protein": 10}') || tests.rec('habit', tests.today(), '{"trained": true}'), '[]');
reset role; select tests.login('c1');
select grasa.sync_push(tests.rec('habit', tests.today(), '{"trained": true, "water": 2}') || tests.rec('habit', tests.today() - 2, '{"trained": true}')
  || tests.rec('habit', tests.today() - 3, '{"water": 1}'), '[]');
reset role;
select tests.paid('c2', -3);
select tests.login('c2'); select grasa.sync_push(tests.rec('habit', tests.today(), '{"trained": true}'), '[]'); reset role;
select tests.paid('c2', 30);
select tests.ok((select bool_and(pause_private) from grasa.records where user_id = tests.uid('c2')), 'lo anotado por c2 en pausa quedó pause_private');

select tests.login('x');
create temp table an as select * from grasa.coach_analytics(tests.today() - 13, tests.today());
select tests.ok((select count(*) from an) = 4, 'el coach recibe una fila por cada asesorado vinculado y activo (4)');
select tests.ok((select trained_days is null and not shares_habits from an where client_id = tests.uid('ana')),
  'Ana no comparte hábitos: sus entrenos salen null («no comparte»), nunca 0');
select tests.ok((select log_days = array[tests.today() - 7, tests.today() - 1, tests.today()] from an where client_id = tests.uid('ana')),
  'días con registro de Ana: medidas y comidas (su hábito no cuenta: no lo comparte)');
select tests.ok((select cardinality(trained_days) = 2 and cardinality(log_days) = 3 from an where client_id = tests.uid('c1')), 'c1: 2 días con entreno y 3 con registro');
select tests.ok((select cardinality(log_days) = 0 and trained_days = '{}' from an where client_id = tests.uid('c2')),
  'lo escrito en PAUSA (pause_private) no cuenta para el coach: ni registro ni entreno');
select tests.ok((select weight_first = 74.0 and weight_last = 72.6 and waist_first = 78.5 and waist_last = 77.5 from an where client_id = tests.uid('ana')),
  'primera y última medida de peso y cintura');
select tests.ok((select jsonb_array_length(weight_weeks) = 4 and (weight_weeks -> 0 ->> 'kg')::numeric = 72.6 from an where client_id = tests.uid('ana')),
  'promedios semanales de peso (semana 0 = la que termina hoy)');
select tests.ok(not exists (select 1 from information_schema.routines r join information_schema.parameters p on p.specific_name = r.specific_name
  where r.routine_schema = 'grasa' and r.routine_name = 'coach_analytics' and p.parameter_name in ('data', 'note', 'display_name', 'food', 'kcal')),
  'coach_analytics no devuelve registros ni notas: solo cifras');
select tests.throws($$select * from grasa.coach_analytics(tests.today(), tests.today() - 3)$$, 'invalid', 'rango al revés: invalid');
select tests.throws($$select * from grasa.coach_analytics(tests.today() - 200, tests.today())$$, 'invalid', 'más de 92 días: invalid');
drop table an;
reset role; select tests.login('y');
select tests.ok((select count(*) from grasa.coach_analytics(tests.today() - 6, tests.today())) = 0, 'otro coach (Y) no ve a los asesorados de X');
reset role; select tests.login('ana');
select tests.throws($$select * from grasa.coach_analytics(tests.today() - 6, tests.today())$$, 'forbidden', 'un asesorado no puede pedir analítica (ni ver un ranking)');
reset role; select tests.login('anon');
select tests.throws($$select * from grasa.coach_analytics(current_date - 6, current_date)$$, 'permission denied', 'anon no ejecuta coach_analytics');
reset role;
select tests.consent('c1', 'cloud_transfer', false);
select tests.login('x');
select tests.ok(not exists (select 1 from grasa.coach_analytics(tests.today() - 6, tests.today()) where client_id = tests.uid('c1')), 'sin A4 vigente, el asesorado sale de la analítica');
reset role; select tests.consent('c1', 'cloud_transfer', true);

-- ================= K5: días en que el coach abrió el panel =================
select tests.login('x');
select grasa.coach_panel_opened(tests.today());
select grasa.coach_panel_opened(tests.today());
select tests.throws($$select grasa.coach_panel_opened(tests.today() - 10)$$, 'invalid', 'solo hoy (± 1 día)');
select tests.throws($$select count(*) from grasa.coach_panel_days$$, 'permission denied', 'nadie lee la tabla de días por la API');
reset role; select tests.login('ana');
select tests.throws($$select grasa.coach_panel_opened(tests.today())$$, 'forbidden', 'un asesorado no registra días de panel');
reset role;
select tests.ok((select count(*) = 1 from grasa.coach_panel_days where coach_id = tests.uid('x')), 'una fila por día y solo la fecha');
select tests.ok((select count(*) = 2 from information_schema.columns where table_schema = 'grasa' and table_name = 'coach_panel_days'), 'la tabla solo tiene coach y día');

-- ================= K3: el panel admin solo con el rol (que se da a mano en SQL) =================
select tests.login('x');
select tests.throws($$select * from grasa.admin_coaches(current_date)$$, 'forbidden', 'un coach no ve el panel admin');
select tests.throws($$select grasa.admin_usage(current_date)$$, 'forbidden', 'un coach no ve el uso general');
reset role; select tests.login('ana');
select tests.throws(format($$select grasa.admin_coach_usage(%L, current_date)$$, tests.uid('x')), 'forbidden', 'un asesorado no ve el uso por coach');
select tests.throws($$select * from grasa.admin_success(current_date)$$, 'forbidden', 'un asesorado no ve el éxito de los coaches');
select tests.throws(format($$select grasa.admin_set_coach_active(%L, false, null)$$, tests.uid('x')), 'forbidden', 'nadie sin rol suspende coaches');
select tests.throws($$select grasa.admin_save_notice(null, 'Hola coaches', 'Texto de prueba', current_date, current_date + 1)$$, 'forbidden', 'nadie sin rol publica avisos');
reset role; select tests.login('anon');
select tests.throws($$select grasa.admin_usage(current_date)$$, 'permission denied', 'anon no ejecuta funciones admin');
reset role;
insert into core.app_access (user_id, app_id, role) values (tests.uid('admin'), 'grasa', 'admin');
select tests.login('admin');
select tests.ok(core.has_role('grasa', 'admin'), 'el admin tiene el rol (dado en SQL)');

-- M7: coaches y cobro. «Asesorado activo» coincide con grasa.billing_active_clients.
create temp table ac as select * from grasa.admin_coaches(current_date);
select tests.ok((select count(*) from ac) = 2, 'el admin ve a los 2 coaches');
select tests.ok((select a.active_clients = b.active_clients from ac a join grasa.billing_active_clients(current_date) b on b.coach_id = a.coach_id
  where a.coach_id = tests.uid('x')), 'asesorados activos del mes = grasa.billing_active_clients');
select tests.ok((select active_clients = 3 and linked_clients = 4 and over_free = 0 and free_clients = 5 from ac where coach_id = tests.uid('x')), 'X: 4 vinculados, 3 activos (c3 no registró nada), 0 sobre el cupo de 5');
select tests.ok((select coach_name = 'Coach X' and business_name = 'Coach X Fit' from ac where coach_id = tests.uid('x')), 'identidad del COACH: negocio y nombre');
select tests.ok(not exists (select 1 from ac where coach_id in (tests.uid('ana'), tests.uid('c1'), tests.uid('c2'), tests.uid('c3'))), 'ninguna fila es de un asesorado');
drop table ac;

-- Ley 1581 / concepto 5: ni salud ni identidades de asesorados. Columnas de las funciones admin y claves de los JSON, contra una lista blanca.
select tests.ok(not exists (select 1 from information_schema.routines r join information_schema.parameters p on p.specific_name = r.specific_name
  where r.routine_schema = 'grasa' and r.routine_name like 'admin\_%' and p.parameter_mode in ('OUT', 'INOUT')
    and p.parameter_name not in ('coach_id', 'business_name', 'coach_name', 'active', 'free_clients', 'active_clients', 'over_free', 'linked_clients',
      'created_at', 'last_reason', 'habits_pct', 'habits_group', 'retention_90', 'cohort_90', 'retention_180', 'cohort_180', 'on_time_pct', 'paying_group',
      'id', 'title', 'body', 'starts_on', 'ends_on')),
  'las columnas de las funciones admin están todas en la lista blanca (sin salud ni asesorados)');
select tests.ok(not exists (select 1 from information_schema.routines r join information_schema.parameters p on p.specific_name = r.specific_name
  where r.routine_schema = 'grasa' and (r.routine_name like 'admin\_%' or r.routine_name = 'coach_notices') and p.parameter_mode in ('OUT', 'INOUT')
    and p.parameter_name ~* '(weight|waist|peso|cintura|kg|cm|medida|food|comida|kcal|protein|photo|foto|health|salud|pain|dolor|water|steps|sleep|client_id|display)'),
  'ninguna columna admin habla de peso, medidas, comidas, fotos, salud, dolor o hábitos con valor, ni de ids de asesorados');
select set_config('t.u', grasa.admin_usage(current_date)::text, true);
select set_config('t.cu', grasa.admin_coach_usage(tests.uid('x'), current_date)::text, true);
select tests.ok(not exists (select k from tests.keys(current_setting('t.u')::jsonb) k
  where k not in ('coaches_active', 'coaches_total', 'coaches_new', 'clients_active', 'signups', 'drops', 'retention30', 'cohort', 'kept', 'sizes', 's1_5', 's6_10', 's11',
                  'weeks', 'start', 'records', 'ref')), 'admin_usage: todas las claves en la lista blanca');
select tests.ok(not exists (select k from tests.keys(current_setting('t.cu')::jsonb) k
  where k not in ('active_clients', 'retention30', 'cohort', 'kept', 'last_action_at', 'last_panel_day', 'panel_days', 'weeks', 'start', 'pct_logging', 'trained', 'ref',
                  'exports')),   -- v1.14 (M6): solo la CANTIDAD de exportaciones del mes
  'admin_coach_usage: todas las claves en la lista blanca');
select tests.ok(not exists (select k from tests.keys(current_setting('t.u')::jsonb || current_setting('t.cu')::jsonb) k
  where k ~* '(weight|waist|peso|cintura|kg|cm|medida|food|kcal|protein|photo|health|pain|water|steps|sleep|name|client_id)'),
  'concepto 5: ninguna función admin devuelve claves de peso o medidas (ni salud ni nombres)');
select tests.ok(position(tests.uid('ana')::text in current_setting('t.u') || current_setting('t.cu')) = 0
  and position(tests.uid('c1')::text in current_setting('t.u') || current_setting('t.cu')) = 0
  and position('Ana' in current_setting('t.u') || current_setting('t.cu')) = 0 and position('Ceci' in current_setting('t.u') || current_setting('t.cu')) = 0,
  'ni ids ni nombres de asesorados dentro de los JSON del admin');
select tests.ok((select string_agg(t::text, '') from grasa.admin_success(current_date) t) !~ '(00000000-0000-4000-8000-0000000000(0a|d1|d2|d3)|Ana|Ceci)',
  'admin_success: ni ids ni nombres de asesorados');

-- M8 / M9: cifras.
select tests.ok((current_setting('t.u')::jsonb ->> 'clients_active')::int = 3 and (current_setting('t.u')::jsonb ->> 'coaches_active')::int = 2
  and (current_setting('t.u')::jsonb ->> 'signups')::int = 4 and jsonb_array_length(current_setting('t.u')::jsonb -> 'weeks') = 8
  and (current_setting('t.u')::jsonb #>> '{sizes,s1_5}')::int = 1, 'uso general: 2 coaches, 3 asesorados activos, 4 altas, 8 semanas, tamaños');
select tests.ok((current_setting('t.cu')::jsonb -> 'weeks' -> 7 ->> 'pct_logging')::int = 50 and (current_setting('t.cu')::jsonb -> 'weeks' -> 7 ->> 'trained')::int = 2
  and current_setting('t.cu')::jsonb -> 'panel_days' = jsonb_build_array(tests.today()),
  'por coach: 50 % registró esta semana (Ana y c1; c2 en pausa no cuenta), 2 entrenos visibles, días de panel');
select tests.ok((grasa.admin_coach_usage(tests.uid('y'), current_date) -> 'weeks' -> 7 -> 'pct_logging') = 'null'::jsonb,
  'con menos de 3 asesorados no se da el porcentaje (no se puede deducir a una persona)');
select tests.ok((select habits_group = 3 and on_time_pct = 100 and paying_group = 4 from grasa.admin_success(current_date) where coach_id = tests.uid('x')),
  'éxito de X: 3 comparten hábitos, 100 % al día con el pago');
select tests.throws(format($$select grasa.admin_coach_usage(%L, current_date)$$, tests.uid('ana')), 'not_found', 'un asesorado no es un coach: not_found');

-- ================= K4: suspender y reactivar =================
select tests.ok((grasa.admin_set_coach_active(tests.uid('x'), false, 'Prueba de suspensión')) ->> 'active' = 'false', 'el admin suspende a X con motivo');
select tests.ok((select not active and last_reason = 'Prueba de suspensión' from grasa.admin_coaches(current_date) where coach_id = tests.uid('x')), 'queda suspendido y el motivo lo ve el admin');
select tests.throws($$select count(*) from grasa.coach_admin_events$$, 'permission denied', 'el registro de suspensiones no se lee por la API');
reset role;
select tests.paid('ana', -2);
select tests.login('x');
select tests.throws($$select * from grasa.coach_analytics(tests.today() - 6, tests.today())$$, 'forbidden', 'suspendido: el coach no ve la analítica');
select tests.throws(format($$select grasa.coach_pull(%L, null)$$, tests.uid('ana')), 'forbidden', 'suspendido: el coach no ve datos');
select tests.throws($$select * from grasa.coach_notices(tests.today())$$, 'forbidden', 'suspendido: tampoco lee avisos');
reset role; select tests.login('ana');
select tests.ok(not grasa.payment_blocked_me(), 'la asesorada de un coach suspendido NO queda en pausa por pago (su coach no puede marcar pagos)');
select tests.ok((grasa.sync_push(tests.rec('entry', tests.today() - 2, '{"weight": 72.9}'), '[]')) ? 'server_now', 'y sigue sincronizando sus datos');
select tests.ok(exists (select 1 from grasa.my_link()) and jsonb_array_length(grasa.sync_pull(null) -> 'records') >= 6, 'conserva su vínculo y sus datos');
reset role; select tests.login('bea');
select tests.ok((grasa.join_coach(current_setting('t.code_x'), jsonb_build_object('body', true, 'version', '0.1', 'text_hash', tests.h('c')))).id is null,
  'nadie se vincula a un coach suspendido (su código no sirve)');
reset role; select tests.login('admin');
select grasa.admin_set_coach_active(tests.uid('x'), true, null);
reset role; select tests.login('ana');
select tests.ok(grasa.payment_blocked_me(), 'reactivado: vuelve la regla normal de pago');
reset role; select tests.paid('ana', 30);

-- ================= K6: avisos =================
select tests.login('admin');
select set_config('t.n1', (grasa.admin_save_notice(null, 'Mantenimiento el domingo', 'La app puede ir lenta. Tus datos no se pierden.', current_date - 1, current_date + 5)) ->> 'id', true);
select grasa.admin_save_notice(null, 'Cobro de septiembre', 'Ya terminó.', current_date - 1, current_date - 1);
select tests.throws($$select grasa.admin_save_notice(null, 'X', 'Texto', current_date, current_date)$$, 'invalid', 'título demasiado corto: invalid');
select tests.throws($$select grasa.admin_save_notice(null, 'Hola coaches', 'Texto', current_date + 5, current_date)$$, 'invalid', 'hasta antes que desde: invalid');
select tests.ok((select count(*) = 2 from grasa.admin_list_notices()), 'el admin lista sus avisos');
reset role; select tests.login('x');
select tests.ok((select count(*) = 1 and min(title) = 'Mantenimiento el domingo' from grasa.coach_notices(tests.today())), 'el coach activo lee SOLO los vigentes');
select tests.throws($$select count(*) from grasa.platform_notices$$, 'permission denied', 'nadie lee la tabla de avisos por la API');
select tests.throws($$select grasa.admin_delete_notice(current_setting('t.n1')::uuid)$$, 'forbidden', 'el coach no borra avisos');
reset role; select tests.login('ana');
select tests.throws($$select * from grasa.coach_notices(tests.today())$$, 'forbidden', 'un asesorado NUNCA lee los avisos de la plataforma');
reset role; select tests.login('admin');
select grasa.admin_delete_notice(current_setting('t.n1')::uuid);
reset role; select tests.login('x');
select tests.ok(not exists (select 1 from grasa.coach_notices(tests.today())), 'borrado: deja de verse');
reset role;

-- ================= Permisos =================
select tests.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'grasa' and p.proname in ('goals_json', 'num_of', 'require_admin', 'client_active_in_month', 'coach_active_clients', 'month_ref', 'client_payment_blocked')
    and has_function_privilege('authenticated', p.oid, 'execute')), 'las funciones internas nuevas no se ejecutan por la API');
select tests.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'grasa' and (p.proname like 'admin\_%' or p.proname in ('set_goals', 'coach_analytics', 'coach_panel_opened', 'coach_notices'))
    and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('public', p.oid, 'execute'))), 'ninguna función nueva para anon ni public');
rollback;
