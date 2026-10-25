-- UX Etapa 2 (r1 v1.11): pregunta de salud (L4), meta de proteína del coach (L5), retos del coach y modo autónomo en pausa (P1).
-- Lo central de P1 se comprueba en el SERVIDOR: lo que el asesorado escribe en pausa nunca sale por coach_pull ni por coach_clients,
-- tampoco después de reactivar, aunque intente desmarcarlo por la API de tablas o lo suba sin conexión después de reactivar.
begin;
select tests.cloud('ana'); select tests.cloud('bea'); select tests.agree('x'); select tests.agree('y');
select tests.login('x');
select core.join_app('grasa');
select set_config('t.code_x', (select invite_code from grasa.become_coach('Coach X Fit')), true);
reset role; select tests.login('y');
select core.join_app('grasa');
select set_config('t.code_y', (select invite_code from grasa.become_coach('Coach Y Fit')), true);
reset role; select tests.login('ana');
select core.join_app('grasa');
select grasa.join_coach(current_setting('t.code_x'), jsonb_build_object('body', true, 'notes', false, 'nutrition', true, 'habits', true, 'photos', false,
  'version', '0.1', 'text_hash', tests.h('compartir')));
reset role; select tests.login('bea');
select core.join_app('grasa');
select grasa.join_coach(current_setting('t.code_y'), jsonb_build_object('body', true, 'habits', true, 'version', '0.1', 'text_hash', tests.h('compartir')));
reset role; select tests.paid('ana', 30); select tests.paid('bea', 30);

-- Fechas relativas a hoy (Bogotá) para los registros. tests.today() envuelve grasa.today_bogota(), que es interna.
create function tests.today() returns date language sql stable security definer set search_path = '' as $$ select grasa.today_bogota() $$;
grant execute on function tests.today() to authenticated;
select set_config('t.d0', to_char(tests.today(), 'YYYY-MM-DD'), true);
select set_config('t.d1', to_char(tests.today() - 1, 'YYYY-MM-DD'), true);
select set_config('t.d2', to_char(tests.today() - 2, 'YYYY-MM-DD'), true);
select set_config('t.d3', to_char(tests.today() - 3, 'YYYY-MM-DD'), true);
select set_config('t.d9', to_char(tests.today() - 9, 'YYYY-MM-DD'), true);
create function tests.habit(p_id text, p_day text, p_water numeric, p_at text default null) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('id', p_id, 'kind', 'habit', 'nkey', p_day, 'date', p_day,
    'data', jsonb_build_object('water', p_water), 'updated_at', coalesce(p_at, now()::text)))
$$;
grant execute on function tests.habit(text, text, numeric, text) to authenticated;
create function tests.coach_sees(p_client text, p_day text) returns boolean language sql as $$
  select exists (select 1 from jsonb_array_elements(grasa.coach_pull(tests.uid(p_client)) -> 'records') e where e ->> 'kind' = 'habit' and e ->> 'nkey' = p_day)
$$;
grant execute on function tests.coach_sees(text, text) to authenticated;

-- ================= H1: pregunta de salud (L4) =================
select tests.login('ana');
select tests.ok((grasa.set_health_answer('condition', 'yes', '1.0-L4', tests.h('bloque L4'))) ->> 'answer' = 'yes', 'la asesorada responde «Sí» a la pregunta de salud');
select tests.ok((select count(*) from grasa.health_answers) = 1 and jsonb_array_length(grasa.my_health()) = 1, 'ella ve su respuesta (tabla con RLS y my_health)');
select tests.throws($$select grasa.set_health_answer('condition', 'tal vez', '1.0-L4', tests.h('x'))$$, 'invalid', 'respuesta fuera de Sí / No / Prefiero no responder: invalid');
select tests.throws($$select grasa.set_health_answer('diagnostico', 'yes', '1.0-L4', tests.h('x'))$$, 'invalid', 'solo hay dos preguntas (no se guarda ningún diagnóstico)');
select tests.throws($$select grasa.set_health_answer('condition', 'yes', '1.0-L4', 'sin-hash')$$, 'invalid', 'sin el hash del texto que vio: invalid');
select tests.throws(format($$insert into grasa.health_answers (user_id, question, answer, version, text_hash) values (%L, 'pregnancy', 'yes', 'v', %L)$$, tests.uid('bea'), tests.h('x')),
  'row-level security', 'no puede escribir la respuesta de OTRA persona');
select tests.throws($$delete from grasa.health_answers$$, 'permission denied', 'nadie borra respuestas por la API (sin DELETE)');
reset role; select tests.login('x');
select tests.ok((select count(*) from grasa.health_answers) = 0, 'el coach NO lee la tabla de respuestas (RLS: 0 filas)');
update grasa.health_answers set answer = 'no';
reset role;
select tests.ok((select answer from grasa.health_answers where user_id = tests.uid('ana')) = 'yes', 'el coach no puede cambiar la respuesta (su UPDATE no toca ninguna fila)');
select tests.login('x');
select tests.throws(format($$insert into grasa.health_answers (user_id, question, answer, version, text_hash) values (%L, 'pregnancy', 'yes', 'v', %L)$$, tests.uid('ana'), tests.h('x')),
  'row-level security', 'el coach no puede escribir una respuesta por la asesorada');
select tests.throws(format($$select grasa.health_flag(%L, 'condition')$$, tests.uid('ana')), 'permission denied', 'health_flag es interna (no se puede sondear a nadie)');
select tests.ok((select health_restriction and not pregnancy_state from grasa.coach_clients() where client_id = tests.uid('ana')), 'el coach vinculado ve SOLO el indicador: restricción sí, embarazo no');
select tests.ok(not exists (select 1 from information_schema.routines r join information_schema.parameters p on p.specific_name = r.specific_name
  where r.routine_schema = 'grasa' and r.routine_name = 'coach_clients' and p.parameter_name in ('answer', 'version', 'text_hash', 'answered_at')),
  'coach_clients no trae la respuesta, la versión ni la fecha: solo los dos booleanos');
reset role; select tests.login('y');
select tests.ok(not exists (select 1 from grasa.coach_clients() where client_id = tests.uid('ana')), 'otro coach (Y) no ve a la asesorada ni su indicador');
reset role; select tests.login('ana');
select grasa.set_health_answer('pregnancy', 'yes', '1.0-L4E', tests.h('bloque embarazo'));
reset role; select tests.login('x');
select tests.ok((select health_restriction and pregnancy_state from grasa.coach_clients() where client_id = tests.uid('ana')), 'con «Sí» a la pregunta de embarazo, lactancia o posparto el coach ve ese estado');
reset role; select tests.login('ana');
select grasa.set_health_answer('condition', 'skip', '1.0-L4', tests.h('bloque L4'));
select grasa.set_health_answer('pregnancy', 'no', '1.0-L4E', tests.h('bloque embarazo'));
reset role; select tests.login('x');
select tests.ok((select not health_restriction and not pregnancy_state from grasa.coach_clients() where client_id = tests.uid('ana')), '«Prefiero no responder» y «No» no muestran ningún indicador');
reset role; select tests.login('ana'); select grasa.set_health_answer('condition', 'yes', '1.0-L4', tests.h('bloque L4'));
reset role; select tests.consent('ana', 'sensitive_health', false); select tests.login('x');
select tests.ok((select not health_restriction from grasa.coach_clients() where client_id = tests.uid('ana')), 'si retira A3 (datos de salud), el coach deja de ver el indicador');
reset role; select tests.login('ana');
select tests.throws($$select grasa.set_health_answer('condition', 'no', '1.0-L4', tests.h('bloque L4'))$$, 'consent_required', 'sin A3 vigente no se guarda la respuesta');
reset role; select tests.consent('ana', 'sensitive_health', true);

-- ================= H2: meta de proteína (L5) =================
select tests.login('x');
select tests.ok((grasa.set_protein_goal(tests.uid('ana'), 110)) ->> 'protein_goal_g' = '110', 'el coach fija la meta de proteína de su asesorada (110 g)');
select tests.ok((select protein_goal_g = 110 from grasa.coach_clients() where client_id = tests.uid('ana')), 'coach_clients devuelve la meta');
select tests.throws(format($$select grasa.set_protein_goal(%L, 1000)$$, tests.uid('ana')), 'invalid', 'meta fuera de 20–400 g: invalid');
reset role; select tests.login('ana');
select tests.ok((select protein_goal_g = 110 from grasa.my_link()), 'la asesorada lee la meta que puso SU coach');
select tests.throws(format($$select grasa.set_protein_goal(%L, 150)$$, tests.uid('ana')), 'forbidden', 'la asesorada no puede ponerse la meta (la propone solo el coach)');
select tests.throws(format($$update grasa.coach_links set protein_goal_g = 150 where client_id = %L$$, tests.uid('ana')), 'permission denied', 'ni por la API de tablas');
reset role; select tests.login('y');
select tests.throws(format($$select grasa.set_protein_goal(%L, 150)$$, tests.uid('ana')), 'forbidden', 'otro coach no puede ponerle meta');
reset role; select tests.login('bea');
select tests.ok((select protein_goal_g is null from grasa.my_link()), 'sin meta del coach queda null (la app no calcula ninguna)');
reset role; select tests.login('x');
select tests.ok((grasa.set_protein_goal(tests.uid('ana'), null)) ->> 'protein_goal_g' is null, 'el coach puede quitar la meta (null)');
select grasa.set_protein_goal(tests.uid('ana'), 110);

-- ================= H4: P1, modo autónomo en pausa =================
reset role; select tests.login('ana');
select grasa.sync_push(tests.habit('40000000-0000-4000-8000-000000000001', current_setting('t.d9'), 2), '[]');
select grasa.sync_push(jsonb_build_array(jsonb_build_object('id', '40000000-0000-4000-8000-0000000000e0', 'kind', 'entry', 'nkey', current_setting('t.d9'),
  'date', current_setting('t.d9'), 'data', '{"weight":71}'::jsonb, 'updated_at', now()::text)), '[]');
reset role; select tests.login('x');
select tests.ok(tests.coach_sees('ana', current_setting('t.d9')), 'al día: el coach ve el hábito de hace 9 días');
-- Pausa desde hace 4 días (pagado hasta hace 5)
reset role; select tests.paid('ana', -5); select tests.login('ana');
select tests.ok(grasa.payment_blocked_me(), 'la asesorada está en pausa');
select tests.ok((select (pauses -> -1 ->> 'from')::date = tests.today() - 4 and (pauses -> -1 -> 'to') = 'null'::jsonb from grasa.my_link()), 'my_link trae la pausa en curso (desde hace 4 días, sin fin)');
select tests.ok((grasa.sync_push(tests.habit('40000000-0000-4000-8000-000000000002', current_setting('t.d1'), 1.5), '[]')) ? 'server_now', 'EN PAUSA: sync_push acepta hábitos (registro autónomo)');
select tests.throws($$select grasa.sync_push(jsonb_build_array(jsonb_build_object('id', '40000000-0000-4000-8000-0000000000e1', 'kind', 'entry', 'nkey', current_setting('t.d1'),
  'date', current_setting('t.d1'), 'data', '{"weight":70}'::jsonb, 'updated_at', now()::text)), '[]')$$, 'payment_required', 'en pausa: una medida sigue con payment_required');
select tests.throws($$select grasa.sync_push(tests.habit('40000000-0000-4000-8000-000000000003', current_setting('t.d0'), 1) || jsonb_build_array(jsonb_build_object('id', '40000000-0000-4000-8000-0000000000f1',
  'kind', 'food', 'nkey', '40000000-0000-4000-8000-0000000000f1', 'date', current_setting('t.d0'), 'data', '{"name":"x"}'::jsonb, 'updated_at', now()::text)), '[]')$$,
  'payment_required', 'en pausa: un lote con hábitos Y comidas se rechaza entero (solo hábitos)');
select tests.throws($$select grasa.sync_push('[]', '[]')$$, 'payment_required', 'en pausa: un envío vacío sigue diciendo payment_required (la app sabe que está en pausa)');
select tests.throws(format($$select grasa.sync_push('[]', jsonb_build_array(jsonb_build_object('id', '40000000-0000-4000-8000-0000000000b1', 'date', %L, 'pose', 'frente',
  'storage_path', %L, 'created_at', now()::text, 'updated_at', now()::text)))$$, current_setting('t.d0'), tests.uid('ana') || '/40000000-0000-4000-8000-0000000000b1.jpg'),
  'payment_required', 'en pausa: las fotos siguen con payment_required');
-- Edita en pausa un día de ANTES de la pausa
select grasa.sync_push(tests.habit('40000000-0000-4000-8000-000000000001', current_setting('t.d9'), 3), '[]');
select tests.ok((select bool_and(pause_private) from grasa.records where kind = 'habit' and nkey in (current_setting('t.d1'), current_setting('t.d9'))),
  'el SERVIDOR marca privado todo lo escrito en pausa (también la edición de un día anterior)');
select tests.ok(jsonb_array_length(grasa.sync_pull(null) -> 'records') >= 2, 'la asesorada sigue viendo sus registros de la pausa (son suyos)');
reset role; select tests.login('x');
select tests.ok(not tests.coach_sees('ana', current_setting('t.d1')), 'EN PAUSA: el coach NO ve el hábito registrado durante la pausa (coach_pull)');
select tests.ok(not tests.coach_sees('ana', current_setting('t.d9')), 'EN PAUSA: tampoco ve el día anterior que se editó en la pausa');
reset role;
select set_config('t.entry_at', (select server_updated_at::text from grasa.records where user_id = tests.uid('ana') and kind = 'entry'), true);
select tests.login('x');
select tests.ok((select last_activity = current_setting('t.entry_at')::timestamptz
                 from grasa.coach_clients() where client_id = tests.uid('ana')), 'coach_clients: la «última actividad» no delata lo de la pausa');
select tests.ok((select (pauses -> -1 -> 'to') = 'null'::jsonb from grasa.coach_clients() where client_id = tests.uid('ana')), 'el coach recibe la pausa en curso (para congelar la constancia)');
-- Reactivación: el coach marca el pago
select grasa.set_client_payment(tests.uid('ana'), tests.today() + 30);
select tests.ok((select (pauses -> 0 ->> 'from')::date = tests.today() - 4 and (pauses -> 0 ->> 'to')::date = tests.today() - 1 and jsonb_array_length(pauses) = 1
                 from grasa.coach_clients() where client_id = tests.uid('ana')), 'al marcar el pago queda guardada la pausa cerrada (hace 4 días → ayer)');
select tests.ok(not tests.coach_sees('ana', current_setting('t.d1')) and not tests.coach_sees('ana', current_setting('t.d9')), 'REACTIVADA: el coach SIGUE sin ver lo de la pausa');
reset role; select tests.login('ana');
select tests.ok(not grasa.payment_blocked_me(), 'reactivada');
update grasa.records set pause_private = false where user_id = tests.uid('ana');
select tests.ok((select bool_and(pause_private) from grasa.records where user_id = tests.uid('ana') and kind = 'habit' and nkey in (current_setting('t.d1'), current_setting('t.d9'))),
  'la asesorada no puede desmarcarlo por la API de tablas (el disparador lo deja privado)');
select grasa.sync_push(tests.habit('40000000-0000-4000-8000-000000000002', current_setting('t.d1'), 2.5), '[]');
-- Sin conexión durante la pausa: lo anotó hace 2 días y lo sube hoy, ya reactivada
select grasa.sync_push(tests.habit('40000000-0000-4000-8000-000000000004', current_setting('t.d2'), 1), '[]');
select grasa.sync_push(tests.habit('40000000-0000-4000-8000-000000000005', current_setting('t.d0'), 2), '[]');
reset role; select tests.login('x');
select tests.ok(not tests.coach_sees('ana', current_setting('t.d1')), 'editar después de reactivar un día de la pausa no lo vuelve visible');
select tests.ok(not tests.coach_sees('ana', current_setting('t.d2')), 'lo anotado sin conexión EN la pausa y subido después tampoco llega al coach (la fecha cae en la pausa)');
select tests.ok(tests.coach_sees('ana', current_setting('t.d0')), 'lo de hoy (ya reactivada) sí lo ve');
reset role;
select tests.ok((select count(*) from grasa.records where user_id = tests.uid('ana') and kind = 'habit' and not pause_private) = 1, 'solo el hábito de hoy es visible para el coach');
select tests.login('x');

-- ================= H3: retos del coach =================
select tests.ok((grasa.create_challenge('50000000-0000-4000-8000-000000000001', '3 entrenos esta semana', 'trained', 3, tests.today() - 3, tests.today() + 3,
  array[tests.uid('ana')])) -> 'members' -> 0 ->> 'done' = '0', 'el coach lanza un reto a su asesorada (7 días, se cumple con 3)');
select tests.throws($$select grasa.create_challenge('50000000-0000-4000-8000-000000000009', 'Baja 2 kg', 'weight', 3, tests.today(), tests.today() + 6, array[tests.uid('ana')])$$,
  'invalid', 'no hay retos de kilos: el hábito solo puede ser de proceso');
select tests.throws($$select grasa.create_challenge('50000000-0000-4000-8000-000000000009', 'Agua', 'water', 9, tests.today(), tests.today() + 6, array[tests.uid('ana')])$$,
  'invalid', 'la meta no puede pasar de los días del reto');
select tests.throws($$select grasa.create_challenge('50000000-0000-4000-8000-000000000009', 'Agua', 'water', 5, tests.today(), tests.today() + 6, array[tests.uid('bea')])$$,
  'forbidden', 'no puede asignar un reto a la asesorada de otro coach');
select tests.throws($$select * from grasa.challenges$$, 'permission denied', 'las tablas de retos no se leen por la API (solo funciones)');
reset role; select tests.consent('x', 'coach_agreement', false); select tests.login('x');
select tests.throws($$select grasa.create_challenge('50000000-0000-4000-8000-000000000009', 'Agua', 'water', 5, tests.today(), tests.today() + 6, array[tests.uid('ana')])$$,
  'coach_agreement_required', 'sin acuerdo vigente no lanza retos');
reset role; select tests.agree('x'); select tests.login('ana');
select tests.ok(jsonb_array_length(grasa.my_challenges()) = 1 and grasa.my_challenges() -> 0 ->> 'business_name' = 'Coach X Fit', 'la asesorada ve el reto de su coach');
select tests.ok((grasa.mark_challenge('50000000-0000-4000-8000-000000000001', tests.today(), true)) -> 'marks' = jsonb_build_array(tests.today()), 'marca su avance de hoy');
select tests.throws($$select grasa.mark_challenge('50000000-0000-4000-8000-000000000001', tests.today() + 10, true)$$, 'invalid', 'no marca días fuera del reto');
select tests.ok(grasa.my_challenges() -> 0 -> 'members' = 'null'::jsonb, 'la asesorada NO ve a los demás miembros (sin clasificación pública)');
reset role; select tests.login('bea');
select tests.ok(jsonb_array_length(grasa.my_challenges()) = 0, 'otra asesorada no ve el reto');
select tests.throws($$select grasa.mark_challenge('50000000-0000-4000-8000-000000000001', tests.today(), true)$$, 'not_found', 'ni lo puede marcar');
reset role; select tests.login('y');
select tests.ok(jsonb_array_length(grasa.list_challenges()) = 0, 'otro coach no ve el reto');
select tests.throws($$select grasa.delete_challenge('50000000-0000-4000-8000-000000000001')$$, 'not_found', 'ni lo puede borrar');
reset role; select tests.login('x');
select tests.ok((grasa.list_challenges() -> 0 -> 'members' -> 0 ->> 'done')::int = 1, 'el coach ve el avance (1 día)');
-- Marca en pausa: privada para siempre
reset role; select tests.paid('ana', -1); select tests.login('ana');
select grasa.mark_challenge('50000000-0000-4000-8000-000000000001', tests.today() - 1, true);
select tests.ok(jsonb_array_length(grasa.my_challenges() -> 0 -> 'marks') = 2, 'en pausa también puede marcar (ve sus 2 días)');
reset role; select tests.login('x');
select tests.ok((grasa.list_challenges() -> 0 -> 'members' -> 0 ->> 'done')::int = 1, 'el coach NO cuenta la marca hecha en pausa');
select grasa.set_client_payment(tests.uid('ana'), tests.today() + 30);
select tests.ok((grasa.list_challenges() -> 0 -> 'members' -> 0 ->> 'done')::int = 1, '... ni después de reactivar');
select grasa.delete_challenge('50000000-0000-4000-8000-000000000001');
reset role; select tests.login('ana');
select tests.ok(jsonb_array_length(grasa.my_challenges()) = 0, 'el coach quita el reto: deja de verse');

-- ================= Seguridad de las funciones nuevas =================
reset role;
select tests.ok(not has_function_privilege('authenticated', 'grasa.day_in_pause(uuid, date)', 'execute')
                and not has_function_privilege('authenticated', 'grasa.link_pauses_json(uuid)', 'execute')
                and not has_function_privilege('authenticated', 'grasa.challenge_out(grasa.challenges, uuid)', 'execute')
                and not has_function_privilege('anon', 'grasa.set_health_answer(text, text, text, text)', 'execute')
                and not has_function_privilege('anon', 'grasa.mark_challenge(uuid, date, boolean)', 'execute'),
  'las auxiliares son internas y anon no ejecuta nada nuevo');
select tests.ok(not has_table_privilege('authenticated', 'grasa.link_pauses', 'select') and not has_table_privilege('authenticated', 'grasa.challenge_marks', 'select'),
  'link_pauses y challenge_marks no se leen por la API de tablas');
rollback;
