-- Estilo v2 (r1 v1.12): aviso de dolor (concepto jurídico 4). Solo la persona escribe su reporte (por una función), el coach NO lee la tabla,
-- el indicador «Reportó dolor» llega en coach_clients() SOLO al coach vinculado y activo (sin depender del permiso de hábitos), se marca revisado
-- y lo reportado durante la pausa (P1) no le llega nunca.
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
-- Ana NO comparte sus hábitos (permiso opcional): el aviso igual tiene que llegar.
select grasa.join_coach(current_setting('t.code_x'), jsonb_build_object('body', true, 'notes', false, 'nutrition', true, 'habits', false, 'photos', false,
  'version', '0.1', 'text_hash', tests.h('compartir')));
reset role; select tests.login('bea');
select core.join_app('grasa');
reset role;
create function tests.today() returns date language sql stable security definer set search_path = '' as $$ select grasa.today_bogota() $$;
grant execute on function tests.today() to authenticated;
select tests.paid('ana', 30);

-- Sin coach vinculado no hay a quién avisar: se rechaza (la app no dice «Tu coach ha sido notificado»).
select tests.login('bea');
select tests.throws($$select grasa.report_pain(tests.today(), true, '1.0-D4', tests.h('dolor'))$$, 'no_coach', 'sin vínculo activo con un coach: no se guarda y no se finge el aviso');
reset role;

-- ================= Escritura: solo la dueña, solo por la función =================
select tests.login('ana');
select tests.ok((grasa.report_pain(tests.today(), false, '1.0-D4', tests.h('dolor'))) ->> 'pain' = 'false', 'responde «No»');
select tests.ok((grasa.report_pain(tests.today(), true, '1.0-D4', tests.h('dolor'))) ->> 'notified' = 'true', 'cambia a «Sí»: queda avisado al coach');
select tests.throws($$select grasa.report_pain(tests.today() - 5, true, '1.0-D4', tests.h('dolor'))$$, 'invalid', 'solo hoy (± 1 día por la zona del teléfono)');
select tests.throws($$select grasa.report_pain(tests.today(), null, '1.0-D4', tests.h('dolor'))$$, 'invalid', 'la respuesta es Sí o No: nada más');
select tests.throws($$select grasa.report_pain(tests.today(), true, '1.0-D4', 'sin-hash')$$, 'invalid', 'sin el hash del texto que vio: invalid');
select tests.throws($$select count(*) from grasa.pain_reports$$, 'permission denied', 'ni la dueña lee la tabla directo (solo por funciones)');
select tests.throws(format($$insert into grasa.pain_reports (user_id, day, pain, version, text_hash) values (%L, current_date, true, 'v', %L)$$, tests.uid('bea'), tests.h('x')),
  'permission denied', 'nadie escribe por la API de tablas (tampoco por otra persona)');
select tests.ok(not exists (select 1 from information_schema.columns where table_schema = 'grasa' and table_name = 'pain_reports' and data_type = 'text'
  and column_name not in ('version', 'text_hash')), 'la tabla no tiene ningún campo de texto libre (no se pregunta qué duele)');
reset role;

-- ================= El coach: indicador sí, tabla no =================
select tests.login('x');
select tests.throws($$select count(*) from grasa.pain_reports$$, 'permission denied', 'el coach NO lee la tabla de reportes');
select tests.throws($$update grasa.pain_reports set pain = false$$, 'permission denied', 'el coach no cambia el reporte');
select tests.throws(format($$select grasa.pain_flag(%L)$$, tests.uid('ana')), 'permission denied', 'pain_flag es interna (no se puede sondear a nadie)');
select tests.ok((select pain_reported = tests.today() from grasa.coach_clients() where client_id = tests.uid('ana')),
  'el coach vinculado recibe «Reportó dolor» con la fecha, aunque ella no comparta sus hábitos');
select tests.ok(not exists (select 1 from information_schema.routines r join information_schema.parameters p on p.specific_name = r.specific_name
  where r.routine_schema = 'grasa' and r.routine_name = 'coach_clients' and p.parameter_name in ('pain', 'version', 'text_hash', 'reported_at')),
  'coach_clients solo trae la fecha del indicador: ni la respuesta, ni la versión, ni el hash');
reset role; select tests.login('y');
select tests.ok(not exists (select 1 from grasa.coach_clients() where client_id = tests.uid('ana')), 'otro coach (Y) no ve a la asesorada ni su indicador');
select tests.throws(format($$select grasa.review_pain(%L)$$, tests.uid('ana')), 'forbidden', 'otro coach no puede marcarlo revisado');
reset role; select tests.login('ana');
select tests.throws(format($$select grasa.review_pain(%L)$$, tests.uid('ana')), 'forbidden', 'la asesorada no puede marcar su propio aviso como revisado');
reset role;

-- ================= Revisado =================
select tests.login('x');
select tests.ok((grasa.review_pain(tests.uid('ana'))) -> 'pain_reported' = 'null'::jsonb, 'el coach lo marca revisado');
select tests.ok((select pain_reported is null from grasa.coach_clients() where client_id = tests.uid('ana')), 'revisado: el indicador desaparece');
reset role; select tests.login('ana');
select grasa.report_pain(tests.today(), true, '1.0-D4', tests.h('dolor'));
reset role; select tests.login('x');
select tests.ok((select pain_reported = tests.today() from grasa.coach_clients() where client_id = tests.uid('ana')), 'un nuevo «Sí» vuelve a quedar sin revisar');
select grasa.review_pain(tests.uid('ana'));
reset role;
-- Si retira A3 (datos de salud), el coach deja de recibir el indicador.
select tests.login('ana'); select grasa.report_pain(tests.today() - 1, true, '1.0-D4', tests.h('dolor')); reset role;
select tests.consent('ana', 'sensitive_health', false);
select tests.login('x');
select tests.ok((select pain_reported is null from grasa.coach_clients() where client_id = tests.uid('ana')), 'sin A3 vigente no llega el indicador');
reset role; select tests.consent('ana', 'sensitive_health', true);
select tests.login('x'); select grasa.review_pain(tests.uid('ana')); reset role;

-- ================= Pausa (P1): no llega al coach, ni después de reactivar =================
select tests.paid('ana', -3);
select tests.login('ana');
select tests.ok((grasa.report_pain(tests.today(), true, '1.0-D4', tests.h('dolor'))) ->> 'notified' = 'false', 'en pausa queda privado (la app no lo pregunta en pausa)');
reset role; select tests.login('x');
select tests.ok((select pain_reported is null from grasa.coach_clients() where client_id = tests.uid('ana')), 'el coach no ve lo reportado durante la pausa');
select grasa.set_client_payment(tests.uid('ana'), tests.today() + 30);
select tests.ok((select pain_reported is null from grasa.coach_clients() where client_id = tests.uid('ana')), 'tampoco después de reactivar el pago');
reset role; select tests.login('ana');
select tests.ok((grasa.report_pain(tests.today(), true, '1.0-D4', tests.h('dolor'))) ->> 'notified' = 'false', 'la fila nacida en la pausa sigue privada aunque se vuelva a enviar');
reset role;
select tests.ok(not has_function_privilege('anon', 'grasa.report_pain(date, boolean, text, text)', 'execute')
                and not has_function_privilege('authenticated', 'grasa.pain_flag(uuid)', 'execute'), 'anon no reporta; pain_flag no se ejecuta desde la API');
rollback;
