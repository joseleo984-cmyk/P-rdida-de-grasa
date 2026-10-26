-- R1 v1.15: puntos de constancia (calculados en el SERVIDOR), meta colectiva del team (agregada, mínimo 5) y permisos (concepto jurídico 7).
-- Fechas SIEMPRE con la de Bogotá (tests.today()), nunca current_date. Las pruebas no dependen del día de la semana: lo que necesita otros
-- días de la semana en curso se siembra como superusuario en grasa.points_log (tests.other_day).
begin;
create function tests.today() returns date language sql stable security definer set search_path = '' as $$ select grasa.today_bogota() $$;
create function tests.wk() returns date language sql stable security definer set search_path = '' as $$ select grasa.week_monday(grasa.today_bogota()) $$;
-- n-ésimo día (1..6) de ESTA semana que no es hoy.
create function tests.other_day(n int) returns date language sql stable security definer set search_path = '' as $$
  select d from (select (grasa.week_monday(grasa.today_bogota()) + k) as d from generate_series(0, 6) k) x
  where d <> grasa.today_bogota() order by d offset n - 1 limit 1
$$;
-- Sube UN registro de la persona en sesión (como lo haría la app).
create function tests.push(p_kind text, p_day date, p_data jsonb, p_id uuid default gen_random_uuid()) returns void language sql as $$
  select grasa.sync_push(jsonb_build_array(jsonb_build_object('id', p_id, 'kind', p_kind,
    'nkey', case when p_kind = 'food' then p_id::text else p_day::text end, 'date', p_day, 'data', p_data, 'updated_at', clock_timestamp())), '[]'::jsonb)
$$;
-- Puntos de una persona: en un día (todas las fuentes), o de una fuente.
create function tests.pts(p_name text, p_day date) returns int language sql stable security definer set search_path = '' as $$
  select coalesce(sum(points), 0)::int from grasa.points_log where user_id = tests.uid(p_name) and day = p_day
$$;
create function tests.src(p_name text, p_day date, p_src text) returns int language sql stable security definer set search_path = '' as $$
  select coalesce(sum(points), 0)::int from grasa.points_log where user_id = tests.uid(p_name) and day = p_day and source = p_src
$$;
create function tests.psum(p_name text, p_from date, p_to date) returns int language sql stable security definer set search_path = '' as $$
  select grasa.points_sum(tests.uid(p_name), p_from, p_to)
$$;
create function tests.seed_pts(p_name text, p_day date, p_src text, p_points int) returns void language sql security definer set search_path = '' as $$
  insert into grasa.points_log (user_id, day, source, points) values (tests.uid(p_name), p_day, p_src, p_points)
$$;

-- Más asesorados para la meta colectiva (mínimo 5).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000e1', 'c1@test.co', '{"display_name":"Ce Uno"}'),
  ('00000000-0000-4000-8000-0000000000e2', 'c2@test.co', '{"display_name":"Ce Dos"}'),
  ('00000000-0000-4000-8000-0000000000e3', 'c3@test.co', '{"display_name":"Ce Tres"}'),
  ('00000000-0000-4000-8000-0000000000e4', 'c4@test.co', '{"display_name":"Ce Cuatro"}'),
  ('00000000-0000-4000-8000-0000000000e5', 'c5@test.co', '{"display_name":"Ce Cinco"}');
insert into tests.users values ('c1', '00000000-0000-4000-8000-0000000000e1'), ('c2', '00000000-0000-4000-8000-0000000000e2'),
  ('c3', '00000000-0000-4000-8000-0000000000e3'), ('c4', '00000000-0000-4000-8000-0000000000e4'), ('c5', '00000000-0000-4000-8000-0000000000e5');
grant execute on all functions in schema tests to authenticated, anon;

select tests.agree('x'); select tests.agree('y'); select tests.consent('admin', 'coach_agreement');
insert into core.app_access (user_id, app_id, role, active) values (tests.uid('admin'), 'grasa', 'admin', true) on conflict (user_id, app_id, role) do update set active = true;
select tests.login('x'); select core.join_app('grasa');
select set_config('t.code_x', (select invite_code from grasa.become_coach('Coach X Fit')), true);
reset role; select tests.login('y'); select core.join_app('grasa');
select set_config('t.code_y', (select invite_code from grasa.become_coach('Coach Y Fit')), true);
reset role;
-- Todos con A3 + A4, vinculados a X compartiendo hábitos y comidas (c5 todavía no se vincula), y al día con el pago.
select tests.cloud(n) from unnest(array['ana', 'bea', 'c1', 'c2', 'c3', 'c4', 'c5']) n;
do $$ declare n text; begin
  foreach n in array array['ana', 'bea', 'c1', 'c2', 'c3', 'c4'] loop
    perform tests.login(n); perform core.join_app('grasa');
    perform grasa.join_coach(current_setting('t.code_x'), jsonb_build_object('body', true, 'nutrition', true, 'habits', true, 'notes', false, 'version', '0.1', 'text_hash', tests.h('c')));
    reset role;
    perform tests.paid(n, 30);
  end loop;
end $$;

-- ================= Reglas: un día normal =================
select tests.login('ana');
select tests.push('habit', tests.today(), '{"water": 2, "steps": 8000, "sleep": 8, "trained": true}');
reset role;
select tests.ok(tests.pts('ana', tests.today()) = 8, 'día: registrar 2 + agua 1 + pasos 1 + sueño 1 + entreno 3 = 8');
select tests.ok(tests.src('ana', tests.today(), 'registro') = 2 and tests.src('ana', tests.today(), 'entreno') = 3, 'cada fuente queda con sus puntos');
select tests.login('ana');
select tests.push('habit', tests.today(), '{"water": 2, "steps": 8000, "sleep": 8, "trained": true}');
reset role;
select tests.ok(tests.pts('ana', tests.today()) = 8, 'editar el mismo día recalcula desde lo registrado: no suma doble');
select tests.login('ana');
select tests.push('habit', tests.today(), '{"water": 1.75, "steps": 25000, "sleep": 11, "trained": true}');
reset role;
select tests.ok(tests.src('ana', tests.today(), 'agua') = 0 and tests.src('ana', tests.today(), 'pasos') = 1 and tests.src('ana', tests.today(), 'sueno') = 0,
  'agua bajo la meta no suma; 25.000 pasos valen lo mismo que 8.000; dormir más de 10 h no suma');
-- Comidas: por registrar (≥ 2), nunca por las kcal.
select tests.login('ana');
select tests.push('food', tests.today(), '{"name": "Arepa", "kcal": 5000}');
reset role;
select tests.ok(tests.src('ana', tests.today(), 'comidas') = 0, 'una sola comida no da el punto de comidas');
select tests.login('ana');
select tests.push('food', tests.today(), '{"name": "Fruta", "kcal": 80}');
reset role;
select tests.ok(tests.src('ana', tests.today(), 'comidas') = 1, 'dos comidas registradas: 1 punto, sin importar las kcal (5.000 o 80)');
-- Medidas: 3 por registrar, una vez por semana; nunca por el resultado.
select tests.login('ana');
select tests.push('entry', tests.today(), '{"weight": 70}', '70000000-0000-4000-8000-0000000000a1');
reset role;
select tests.ok(tests.src('ana', tests.today(), 'medidas') = 3, 'medirse: 3 puntos por registrar');
select set_config('t.before', tests.pts('ana', tests.today())::text, true);
select tests.login('ana');
select tests.push('entry', tests.today(), '{"weight": 95, "waist": 110}', '70000000-0000-4000-8000-0000000000a1');
reset role;
select tests.ok(tests.pts('ana', tests.today()) = current_setting('t.before')::int and tests.src('ana', tests.today(), 'medidas') = 3,
  'cambiar el valor (70 → 95 kg, más cintura) no cambia los puntos: nunca por el resultado');
select tests.login('ana');
select tests.push('entry', tests.today() - 1, '{"weight": 70}');
reset role;
select tests.ok(tests.src('ana', tests.today() - 1, 'medidas') = 0, 'otra medida a menos de 6 días de la que dio puntos: 0 (una vez por semana)');
select tests.ok(tests.src('ana', tests.today() - 1, 'registro') = 2, '… pero el día sí cuenta como registrado');
-- Fotos: nunca dan puntos (ni siquiera hay disparador sobre grasa.photos).
select tests.ok(not exists (select 1 from pg_trigger t where t.tgrelid = 'grasa.photos'::regclass and not t.tgisinternal
  and t.tgfoid in ('grasa.points_on_record()'::regprocedure, 'grasa.points_on_mark()'::regprocedure)), 'las fotos no tienen ningún cálculo de puntos');

-- ================= Solo hoy y ayer; valores raros =================
select tests.login('ana');
select tests.push('habit', tests.today() - 3, '{"water": 2, "steps": 9000, "sleep": 8, "trained": true}');
select tests.push('habit', tests.today() - 1, '{"water": 2}');
reset role;
select tests.ok(tests.pts('ana', tests.today() - 3) = 0, 'un registro de hace 3 días se guarda pero no da puntos');
select tests.ok(exists (select 1 from grasa.records where user_id = tests.uid('ana') and kind = 'habit' and date = tests.today() - 3), '… y sí quedó guardado');
select tests.ok(tests.src('ana', tests.today() - 1, 'agua') = 1, 'un registro de AYER sí da puntos');
select tests.login('bea');
select tests.push('habit', tests.today(), '{"water": 9, "steps": 70000, "sleep": 15}');
reset role;
select tests.ok(tests.pts('bea', tests.today()) = 0, 'valores raros (70.000 pasos, 9 L, 15 h): se guardan sin puntos, ni siquiera el de registrar');
select tests.login('bea');
select tests.push('entry', tests.today(), '{"weight": 900}');
reset role;
select tests.ok(tests.pts('bea', tests.today()) = 0, 'un peso imposible (900 kg) tampoco da puntos');

-- ================= Tope diario de 12 (y «volviste») =================
select tests.login('c1');
select tests.push('habit', tests.today() - 20, '{"water": 2}');   -- registro viejo (no da puntos): marca la ausencia
select tests.push('habit', tests.today(), '{"water": 2, "steps": 8000, "sleep": 8, "trained": true}');
select tests.push('food', tests.today(), '{"name": "A"}'); select tests.push('food', tests.today(), '{"name": "B"}');
select tests.push('entry', tests.today(), '{"weight": 80}');
reset role;
select tests.ok(tests.pts('c1', tests.today()) = 12, 'tope diario: 2+1+1+1+3+1+3+5 (volviste) = 17 → 12');
select tests.ok(tests.src('c1', tests.today(), 'volviste') = 0, 'lo que pasa del tope se recorta por el final (volviste)');
-- Quitar el entreno deja espacio: entra «volviste» (5) y el día sigue en 12 como máximo.
select tests.login('c1');
select tests.push('habit', tests.today(), '{"water": 2, "steps": 8000, "sleep": 8, "trained": false}');
reset role;
select tests.ok(tests.src('c1', tests.today(), 'volviste') = 3 and tests.pts('c1', tests.today()) = 12, '«volviste» tras más de 7 días sin registrar, dentro del tope de 12');

-- ================= Entrenos hasta el plan; descanso planificado y «me siento mal» =================
select tests.login('x');
select grasa.set_goals(tests.uid('c2'), '{"trained_days": 2}');
reset role;
select tests.seed_pts('c2', tests.other_day(1), 'entreno', 3); select tests.seed_pts('c2', tests.other_day(2), 'entreno', 3);
select tests.login('c2');
select tests.push('habit', tests.today(), '{"trained": true}');
reset role;
select tests.ok(tests.src('c2', tests.today(), 'entreno') = 0 and tests.src('c2', tests.today(), 'registro') = 2,
  'plan de 2 entrenos ya cumplido: el tercero de la semana no da puntos de entreno');
select tests.login('c3');
select tests.push('habit', tests.today(), '{"rest": "plan"}');
reset role;
select tests.ok(tests.src('c3', tests.today(), 'descanso') = 2 and tests.pts('c3', tests.today()) = 4, 'descanso planificado: 2 (+ 2 por registrar)');
select tests.login('c3');
select tests.push('habit', tests.today(), '{"rest": "sick"}');
reset role;
select tests.ok(tests.src('c3', tests.today(), 'descanso') = 2, '«me siento mal» cuenta como descanso planificado: 2');
select tests.seed_pts('c3', tests.other_day(1), 'descanso', 2); select tests.seed_pts('c3', tests.other_day(2), 'descanso', 2);
select tests.login('c3');
select tests.push('habit', tests.today(), '{"rest": "plan", "water": 2}');
reset role;
select tests.ok(tests.src('c3', tests.today(), 'descanso') = 0, 'con el plan de 5 entrenos hay 2 descansos con puntos por semana: el tercero no suma');

-- ================= Tope semanal de 80 =================
do $$ declare k int; begin
  for k in 1..6 loop perform tests.seed_pts('c4', tests.other_day(k), 'registro', 12); end loop;
end $$;
select tests.seed_pts('c4', tests.other_day(1), 'agua', 3);   -- 75 en la semana
select tests.login('c4');
select tests.push('habit', tests.today(), '{"water": 2, "steps": 8000, "sleep": 8, "trained": true}');
reset role;
select tests.ok(tests.pts('c4', tests.today()) = 5 and tests.psum('c4', tests.wk(), tests.wk() + 6) = 80, 'tope semanal: con 75 en la semana, el día suma 5 (80)');
delete from grasa.points_log where user_id = tests.uid('c4');

-- ================= Pausa: ni se gana ni se pierde; lo pause_private no suma =================
select set_config('t.c4', tests.psum('c4', tests.today() - 1, tests.today())::text, true);
select tests.paid('c4', -1);
select tests.login('c4');
select tests.push('habit', tests.today() - 1, '{"water": 2, "trained": true}');
reset role;
select tests.ok((select pause_private from grasa.records where user_id = tests.uid('c4') and kind = 'habit' and date = tests.today() - 1), 'el hábito escrito en pausa quedó privado');
select tests.ok(tests.pts('c4', tests.today() - 1) = 0, 'en pausa no se ganan puntos');
select tests.ok(tests.psum('c4', tests.today() - 1, tests.today()) = current_setting('t.c4')::int, 'y no se pierde nada de lo que había');
select tests.paid('c4', 30);
select tests.login('c4');
select tests.push('habit', tests.today() - 1, '{"water": 2, "trained": true}');
reset role;
select tests.ok(tests.pts('c4', tests.today() - 1) = 0, 'al volver, lo escrito en pausa (pause_private) sigue sin sumar');

-- ================= Retos: un día de reto suma solo si hay registro real =================
select tests.login('x');
select set_config('t.reto', (grasa.create_challenge('80000000-0000-4000-8000-000000000001'::uuid, 'Agua 1 día', 'water', 1, tests.today() - 1, tests.today() + 5,
  array[tests.uid('bea')]) ->> 'id'), true);
reset role; select tests.login('bea');
select grasa.mark_challenge(current_setting('t.reto')::uuid, tests.today(), true);
reset role;
select tests.ok(tests.src('bea', tests.today(), 'reto:' || current_setting('t.reto')) = 0, 'marcar el reto sin registro de agua: cuenta para el reto pero NO da puntos');
select tests.login('bea');
select tests.push('habit', tests.today(), '{"water": 1}');
reset role;
select tests.ok(tests.src('bea', tests.today(), 'reto:' || current_setting('t.reto')) = 10, 'con la marca Y el agua registrada ese día: reto cumplido, 10 puntos');
select tests.login('bea');
select tests.push('habit', tests.today(), '{"water": 1.25}');
select grasa.mark_challenge(current_setting('t.reto')::uuid, tests.today() - 1, true);
reset role;
select tests.ok((select count(*) = 1 from grasa.points_log where user_id = tests.uid('bea') and source like 'reto:%'), 'el bono del reto se da una sola vez');

-- ================= Semana constante (bono del lunes) =================
select tests.seed_pts('ana', tests.wk() - 7, 'registro', 2); select tests.seed_pts('ana', tests.wk() - 6, 'registro', 2);
select tests.seed_pts('ana', tests.wk() - 5, 'registro', 2); select tests.seed_pts('ana', tests.wk() - 4, 'registro', 2);
select tests.login('ana');
select tests.push('habit', tests.today(), '{"water": 2, "steps": 8000, "sleep": 8, "trained": true}');
reset role;
select tests.ok(tests.src('ana', tests.wk(), 'semana') = 5, 'semana anterior constante (4 días con registro): bono de 5 el lunes');

-- ================= Quién ve qué =================
select tests.login('ana');
select tests.ok((grasa.my_points() ->> 'today_points')::int = tests.pts('ana', tests.today()), 'my_points: la persona ve sus puntos de hoy');
select tests.ok((grasa.my_points() ->> 'week')::int = tests.psum('ana', tests.wk(), tests.wk() + 6), 'my_points: y los de la semana');
select tests.ok(jsonb_array_length(grasa.my_points() -> 'weeks') = 8, 'my_points: las 8 últimas semanas (para compararse consigo misma)');
select tests.ok(not (grasa.my_points()::text like '%' || tests.uid('bea')::text || '%') and not (grasa.my_points()::text like '%' || tests.uid('ana')::text || '%'),
  'my_points no trae ningún id (ni el propio ni el de otra persona)');
select tests.throws($$select * from grasa.points_log$$, 'permission denied', 'un asesorado no lee la tabla de puntos');
select tests.throws($$select * from grasa.coach_points(tests.today() - 6, tests.today())$$, 'forbidden', 'un asesorado no pide puntos de nadie (coach_points)');
select tests.throws($$select grasa.coach_team_goal()$$, 'forbidden', 'un asesorado no usa la vista del coach');
select tests.throws($$select grasa.set_team_goal('entrenos', 10)$$, 'forbidden', 'un asesorado no crea metas del team');
reset role; select tests.login('bea');
select tests.ok((grasa.my_points() ->> 'today_points')::int = tests.pts('bea', tests.today()), 'otra persona ve SOLO lo suyo');
reset role; select tests.login('admin');
select tests.throws($$select * from grasa.coach_points(tests.today() - 6, tests.today())$$, 'forbidden', 'el admin no ve puntos de asesorados');
select tests.throws($$select grasa.coach_team_goal()$$, 'forbidden', 'el admin no ve metas del team');
select tests.ok((grasa.my_points() ->> 'total')::int = 0, 'el admin solo pide los suyos (vacíos)');
reset role;
select tests.ok(not has_function_privilege('anon', 'grasa.my_points()', 'execute') and not has_function_privilege('anon', 'grasa.coach_points(date, date)', 'execute')
  and not has_function_privilege('anon', 'grasa.my_team_goal()', 'execute') and not has_function_privilege('anon', 'grasa.coach_team_goal()', 'execute')
  and not has_function_privilege('anon', 'grasa.set_team_goal(text, int)', 'execute') and not has_function_privilege('anon', 'grasa.set_team_opt_out(boolean)', 'execute'),
  'anon no ejecuta ninguna función de puntos ni de la meta');
select tests.ok(not has_function_privilege('authenticated', 'grasa.points_refresh(uuid, date)', 'execute')
  and not has_function_privilege('authenticated', 'grasa.team_goal_out(uuid)', 'execute') and not has_function_privilege('authenticated', 'grasa.points_sum(uuid, date, date)', 'execute'),
  'las internas (cálculo, agregado, suma por persona) no se llaman por la API');
select tests.ok(not has_table_privilege('authenticated', 'grasa.points_log', 'select') and not has_table_privilege('authenticated', 'grasa.points_log', 'insert')
  and not has_table_privilege('authenticated', 'grasa.team_goals', 'select') and not has_table_privilege('authenticated', 'grasa.team_goals', 'insert'),
  'nadie lee ni escribe puntos ni metas por la API de tablas (el teléfono no puede inventarse puntos)');
-- Coach: puntos de SUS asesorados para el ranking privado; null si no comparte hábitos y comidas.
select tests.login('ana'); select grasa.update_shares(jsonb_build_object('body', true, 'nutrition', true, 'habits', false, 'notes', false, 'photos', false, 'version', '0.1', 'text_hash', tests.h('c')));
reset role; select tests.login('x');
select tests.ok((select points is null and habits_met is null from grasa.coach_points(tests.today() - 6, tests.today()) where client_id = tests.uid('ana')),
  'coach_points: de quien no comparte hábitos, null («no comparte»), nunca 0');
select tests.ok((select points = tests.psum('bea', tests.today() - 6, tests.today()) from grasa.coach_points(tests.today() - 6, tests.today()) where client_id = tests.uid('bea')),
  'coach_points: los puntos de un asesorado suyo que comparte');
select tests.ok((select count(*) = 6 from grasa.coach_points(tests.today() - 6, tests.today())), 'coach_points: solo sus asesorados vinculados');
reset role; select tests.login('y');
select tests.ok((select count(*) = 0 from grasa.coach_points(tests.today() - 6, tests.today())), 'otro coach no ve puntos de los asesorados de X');
reset role;
select tests.login('ana'); select grasa.update_shares(jsonb_build_object('body', true, 'nutrition', true, 'habits', true, 'notes', false, 'photos', false, 'version', '0.1', 'text_hash', tests.h('c')));
reset role;

-- ================= Meta colectiva del team =================
-- Participan: vínculo activo, sin pausa, comparten hábitos y comidas, sin opt-out. Hoy: ana, bea, c1, c2, c3, c4 = 6.
select set_config('t.e6', (select count(*) from grasa.points_log where source = 'entreno' and day between tests.wk() and tests.wk() + 6
  and user_id in (select client_id from grasa.coach_links where coach_id = tests.uid('x') and status = 'active'))::text, true);
select tests.login('x');
select tests.throws($$select grasa.set_team_goal('kilos', 10)$$, 'invalid', 'solo entrenos o puntos (nunca kilos)');
select tests.throws($$select grasa.set_team_goal('entrenos', 0)$$, 'invalid', 'el número de la meta va de 1 en adelante');
select tests.ok((grasa.set_team_goal('entrenos', 60) ->> 'published')::boolean, 'el coach publica «Entre todos: 60 entrenos» para esta semana');
select tests.ok((select (g ->> 'participants')::int = 6 and (g ->> 'target')::int = 60 and g ->> 'metric' = 'entrenos' from grasa.coach_team_goal() g), 'el coach ve cuántos participan (6) y la meta');
select tests.ok((grasa.coach_team_goal() ->> 'total')::int = current_setting('t.e6')::int and current_setting('t.e6')::int > 0, 'el total = entrenos con puntos de la semana de quienes suman');
select tests.ok((select array_agg(k order by k) = array['metric', 'min', 'participants', 'published', 'target', 'total', 'week_end', 'week_start'] from jsonb_object_keys(grasa.coach_team_goal()) k),
  'el agregado del coach trae SOLO meta, total y cuántos participan: ninguna lista ni aporte individual');
select tests.ok(grasa.coach_team_goal()::text !~ '[0-9a-f]{8}-[0-9a-f]{4}-', 'ningún id en la meta del team');
reset role; select tests.login('bea');
select tests.ok((select (g ->> 'participants')::int = 6 and (g ->> 'published')::boolean and not (g ->> 'opted_out')::boolean from (select grasa.my_team_goal() g) q),
  'el asesorado ve la barra común: total y cuántos participan');
select tests.ok((select array_agg(k order by k) = array['metric', 'min', 'opted_out', 'participants', 'published', 'target', 'total', 'week_end', 'week_start'] from jsonb_object_keys(grasa.my_team_goal()) k),
  'el asesorado no recibe nada individual de nadie');
reset role;
-- Menos de 5: no se publica (ni el total ni cuántos).
select tests.paid('c4', -1); select tests.paid('c3', -1);
select tests.login('ana');
select tests.ok((select not (g ->> 'published')::boolean and g -> 'total' = 'null'::jsonb and g -> 'participants' = 'null'::jsonb from (select grasa.my_team_goal() g) q),
  'con 4 participantes (2 en pausa no suman) la meta NO se publica: sin total y sin número');
reset role; select tests.login('x');
select tests.ok((select not (g ->> 'published')::boolean and g -> 'total' = 'null'::jsonb from (select grasa.coach_team_goal() g) q), 'el coach tampoco ve el total con menos de 5');
reset role;
select tests.paid('c3', 30);
-- Opt-out: «No sumar mis hábitos a la meta del team». c5 entra y quedan 6; c2 se retira → 5 y su aporte sale del total.
select tests.login('c5'); select core.join_app('grasa');
select grasa.join_coach(current_setting('t.code_x'), jsonb_build_object('body', true, 'nutrition', true, 'habits', true, 'notes', false, 'version', '0.1', 'text_hash', tests.h('c')));
reset role; select tests.paid('c5', 30);
select tests.login('c5'); select tests.push('habit', tests.today(), '{"trained": true}'); reset role;
select tests.login('x');
select set_config('t.total6', grasa.coach_team_goal() ->> 'total', true);
select tests.ok((grasa.coach_team_goal() ->> 'participants')::int = 6, 'con c5: 6 participan');
reset role;
select set_config('t.c1e', (select count(*) from grasa.points_log where user_id = tests.uid('c2') and source = 'entreno' and day between tests.wk() and tests.wk() + 6)::text, true);
select tests.ok(current_setting('t.c1e')::int = 2, 'c2 aporta 2 entrenos esta semana');
select tests.login('c2');
select tests.ok((grasa.set_team_opt_out(true) ->> 'opted_out')::boolean, 'opt-out: la persona se retira de la meta del team');
reset role; select tests.login('x');
select tests.ok((select (g ->> 'participants')::int = 5 and (g ->> 'total')::int = current_setting('t.total6')::int - current_setting('t.c1e')::int from (select grasa.coach_team_goal() g) q),
  'quien se retira deja de contar y su aporte sale del total');
reset role; select tests.login('c2');
select tests.ok(not (grasa.set_team_opt_out(false) ->> 'opted_out')::boolean, 'y puede volver a sumar');
reset role;
-- Meta de puntos: suma de puntos de la semana (cada persona con su tope de 80).
select set_config('t.p6', (select coalesce(sum(least(80, s)), 0) from (select sum(points) s from grasa.points_log
    where day between tests.wk() and tests.wk() + 6 and user_id in (select tests.uid(n) from unnest(array['ana', 'bea', 'c1', 'c2', 'c3', 'c5']) n) group by user_id) z)::text, true);
select tests.login('x');
select tests.ok((select (g ->> 'metric') = 'puntos' and (g ->> 'total')::int = current_setting('t.p6')::int and (g ->> 'participants')::int = 6
  from (select grasa.set_team_goal('puntos', 2000) g) q), '«Entre todos: 2.000 puntos»: el total es la suma de puntos de la semana de quienes suman');
reset role;
-- Otro coach y quien no tiene coach: nada.
select tests.login('y');
select tests.ok(grasa.coach_team_goal() is null, 'otro coach no ve la meta de X (no tiene meta)');
reset role;
select tests.login('x'); select grasa.delete_team_goal(); reset role; select tests.login('ana');
select tests.ok((grasa.my_team_goal() ->> 'none')::boolean, 'sin meta esta semana, el asesorado no ve barra');
reset role;
rollback;
