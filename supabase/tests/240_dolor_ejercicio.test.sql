-- v1.21: dolor por ejercicio y lista «a evitar». Sin autorización no se guarda; el coach necesita el Acuerdo 0.9 y vínculo activo; el historial de dolor exige la autorización vigente.
begin;
select tests.agree('x'); select tests.cloud('ana');
select tests.login('x');
select set_config('t.code', (select invite_code from grasa.become_coach('Coach Dolor')), true);
reset role; select tests.login('ana');
select grasa.join_coach(current_setting('t.code'), jsonb_build_object('body', true, 'notes', false, 'nutrition', true, 'habits', true, 'photos', false, 'version', '0.1', 'text_hash', tests.h('compartir')));

reset role;
select tests.ok(grasa.exercise_key('  Sentadilla   Búlgara ') = 'sentadilla bulgara', 'la clave del ejercicio ignora mayúsculas, tildes y espacios repetidos');
select tests.login('ana');
select tests.throws($$select grasa.pain_report_exercise('Sentadilla', current_date, '0.1-A13', repeat('a', 64))$$, 'forbidden', 'sin la autorización `pain_report` no se guarda nada');
insert into core.consent_events (user_id, app_id, kind, granted, version, text_hash, client_at) values (auth.uid(), 'grasa', 'pain_report', true, '0.1-A13', tests.h('A13'), now());
select tests.ok((grasa.pain_report_exercise('Sentadilla', current_date, '0.1-A13', repeat('a', 64))->>'exercise') = 'Sentadilla', 'con la autorización se guarda el dolor del ejercicio');
select grasa.pain_report_exercise('sentadilla ', current_date, '0.1-A13', repeat('a', 64));
select tests.ok((select jsonb_array_length(grasa.my_exercise_pain())) = 1, 'el mismo ejercicio el mismo día no se duplica');
select tests.throws($$select grasa.pain_report_exercise('Sentadilla', current_date - 30, '0.1-A13', repeat('a', 64))$$, 'invalid', 'solo hoy, ayer o mañana');
select tests.throws($$select grasa.pain_report_exercise('   ', current_date, '0.1-A13', repeat('a', 64))$$, 'invalid', 'el ejercicio no puede ir vacío');

-- coach: sin el Acuerdo 0.9 no ve nada ni edita la lista
reset role; select tests.login('x');
select tests.ok((grasa.coach_exercise_flags(tests.uid('ana'))->>'agreement')::boolean = false, 'sin el Acuerdo 0.9 el coach no ve el historial ni la lista');
select tests.throws($$select grasa.avoid_add(tests.uid('ana'), 'Peso muerto')$$, 'forbidden', 'ni agrega a «evitar»');
insert into core.consent_events (user_id, app_id, kind, granted, version, text_hash, client_at) values (auth.uid(), 'grasa', 'coach_agreement', true, '0.9-A7-coach', tests.h('A7'), now() + interval '1 second');
select tests.ok((select jsonb_array_length(grasa.coach_exercise_flags(tests.uid('ana'))->'pain')) = 1, 'con el Acuerdo 0.9 ve el historial de dolor');
select grasa.avoid_add(tests.uid('ana'), 'Peso muerto'); select grasa.avoid_add(tests.uid('ana'), 'peso  MUERTO');
select tests.ok((select jsonb_array_length(grasa.coach_exercise_flags(tests.uid('ana'))->'avoid')) = 1, 'la lista «a evitar» no repite ejercicios');
-- otro coach no ve ni edita
reset role; select tests.agree('y'); select tests.login('y'); select grasa.become_coach('Coach Y2');
insert into core.consent_events (user_id, app_id, kind, granted, version, text_hash, client_at) values (auth.uid(), 'grasa', 'coach_agreement', true, '0.9-A7-coach', tests.h('A7'), now() + interval '1 second');
select tests.throws($$select grasa.coach_exercise_flags(tests.uid('ana'))$$, 'forbidden', 'un coach sin vínculo no ve nada');
select tests.throws($$select grasa.avoid_add(tests.uid('ana'), 'Remo')$$, 'forbidden', 'ni edita');
-- retirar la autorización de dolor: el coach deja de ver el historial (la lista que él armó sigue siendo suya)
reset role; select tests.login('ana');
insert into core.consent_events (user_id, app_id, kind, granted, version, text_hash, client_at) values (auth.uid(), 'grasa', 'pain_report', false, '0.1-A13', tests.h('A13'), now() + interval '1 second');
reset role; select tests.login('x');
select tests.ok((select jsonb_array_length(grasa.coach_exercise_flags(tests.uid('ana'))->'pain')) = 0, 'sin autorización vigente el coach no ve el dolor');
select tests.ok((select jsonb_array_length(grasa.coach_exercise_flags(tests.uid('ana'))->'avoid')) = 1, 'su lista «a evitar» permanece');
select grasa.avoid_remove(tests.uid('ana'), 'PESO MUERTO');
select tests.ok((select jsonb_array_length(grasa.coach_exercise_flags(tests.uid('ana'))->'avoid')) = 0, 'el coach puede quitar un ejercicio de la lista');
-- aviso push neutral al coach al reportar dolor
reset role; select tests.login('x');
insert into core.consent_events (user_id, app_id, kind, granted, version, text_hash, client_at) values (auth.uid(), 'grasa', 'push', true, '0.2-A11-push', tests.h('push'), now());
select grasa.push_register('https://push.example/coach123456789012345', repeat('p', 40), repeat('a', 20));
reset role; update grasa.push_outbox set sent_at = now();
select tests.login('ana');
insert into core.consent_events (user_id, app_id, kind, granted, version, text_hash, client_at) values (auth.uid(), 'grasa', 'pain_report', true, '0.1-A13', tests.h('A13'), now() + interval '2 seconds');
select grasa.pain_report_exercise('Remo', current_date, '0.1-A13', repeat('a', 64));
reset role;
select tests.ok((select count(*) from grasa.push_outbox where user_id = tests.uid('x') and kind = 'client_alert' and sent_at is null) = 1, 'un reporte de dolor deja UN aviso neutral en la cola del coach');
select tests.ok(not exists (select 1 from information_schema.table_privileges where table_schema = 'grasa' and table_name in ('exercise_pain', 'avoid_exercises') and grantee in ('anon', 'authenticated', 'service_role')), 'las tablas no son accesibles directo');
rollback;
