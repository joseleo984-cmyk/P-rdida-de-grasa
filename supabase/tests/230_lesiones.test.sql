-- v1.20: lesiones y condiciones médicas. Sin autorización no se guarda; el coach solo ve con vínculo activo y autorización vigente; condición = siempre activa.
begin;
select tests.agree('x'); select tests.cloud('ana');
select tests.login('x');
select set_config('t.code', (select invite_code from grasa.become_coach('Coach Lesiones')), true);
reset role; select tests.login('ana');
select grasa.join_coach(current_setting('t.code'), jsonb_build_object('body', true, 'notes', false, 'nutrition', true, 'habits', true, 'photos', false, 'version', '0.1', 'text_hash', tests.h('compartir')));

select tests.throws($$select grasa.injury_save('a1000000-0000-4000-8000-000000000001', 'lesion', 'Rodilla derecha', null, 'activa', current_date, '0.1-A12', repeat('a', 64))$$, 'forbidden', 'sin la autorización `injury` no se guarda nada');
insert into core.consent_events (user_id, app_id, kind, granted, version, text_hash, client_at) values (auth.uid(), 'grasa', 'injury', true, '0.1-A12', tests.h('A12'), now());
select tests.ok((grasa.injury_save('a1000000-0000-4000-8000-000000000001', 'lesion', 'Rodilla derecha', 'Dolor al bajar escaleras', 'activa', current_date, '0.1-A12', repeat('a', 64))->>'status') = 'activa', 'con la autorización se guarda la lesión');
select tests.ok((grasa.injury_save('a1000000-0000-4000-8000-000000000002', 'condicion', 'Hipertensión', null, 'superada', null, '0.1-A12', repeat('b', 64))->>'status') = 'activa', 'una condición médica no se puede «superar»: queda activa');
select tests.throws($$select grasa.injury_save('a1000000-0000-4000-8000-000000000003', 'otra', 'x', null, 'activa', null, '0.1-A12', repeat('a', 64))$$, 'invalid', 'solo lesión o condición');
select tests.throws($$select grasa.injury_save('a1000000-0000-4000-8000-000000000003', 'lesion', 'Hombro', null, 'activa', null, '0.1-A12', 'no-es-huella')$$, 'invalid', 'exige la huella del texto');
select tests.ok((grasa.injury_save('a1000000-0000-4000-8000-000000000001', 'lesion', 'Rodilla derecha', 'Mejor', 'recuperacion', current_date, '0.1-A12', repeat('a', 64))->>'status') = 'recuperacion', 'el asesorado actualiza el estado');
select tests.throws($$select grasa.injury_convert('a1000000-0000-4000-8000-000000000002', '0.1-A12c', repeat('c', 64))$$, 'invalid', 'una condición no se reclasifica otra vez');
select tests.ok((grasa.injury_convert('a1000000-0000-4000-8000-000000000001', '0.1-A12c', repeat('c', 64))->>'kind') = 'condicion', 'una lesión de por vida pasa a condición médica');
select tests.ok((select jsonb_array_length(grasa.my_injuries())) = 2, 'el asesorado ve sus dos registros');

-- el coach vinculado los ve y hace seguimiento
reset role; select tests.login('x');
select tests.ok((select jsonb_array_length(grasa.coach_injuries(tests.uid('ana')))) = 2, 'el coach vinculado ve lo declarado');
select tests.ok((grasa.injury_note_add('a1000000-0000-4000-8000-000000000001', 'Evitar sentadilla profunda')->>'body') = 'Evitar sentadilla profunda', 'el coach agrega una nota de seguimiento');
select tests.throws($$select grasa.injury_note_add('a1000000-0000-4000-8000-000000000001', '   ')$$, 'invalid', 'la nota no puede ir vacía');
-- otro coach no ve ni anota
reset role; select tests.agree('y'); select tests.login('y'); select grasa.become_coach('Coach Y');
select tests.throws($$select grasa.coach_injuries(tests.uid('ana'))$$, 'forbidden', 'un coach sin vínculo no ve nada');
select tests.throws($$select grasa.injury_note_add('a1000000-0000-4000-8000-000000000001', 'hola')$$, 'forbidden', 'ni anota');
reset role; select tests.cloud('bea'); select tests.login('bea');
insert into core.consent_events (user_id, app_id, kind, granted, version, text_hash, client_at) values (auth.uid(), 'grasa', 'injury', true, '0.1-A12', tests.h('A12'), now());
select tests.ok((select jsonb_array_length(grasa.my_injuries())) = 0, 'otra persona no ve registros ajenos');
select tests.throws($$select grasa.injury_save('a1000000-0000-4000-8000-000000000001', 'lesion', 'Rodilla', null, 'activa', null, '0.1-A12', repeat('a', 64))$$, 'forbidden', 'nadie pisa el registro de otro');

-- si la persona retira la autorización, el coach deja de ver todo
reset role; select tests.login('ana');
insert into core.consent_events (user_id, app_id, kind, granted, version, text_hash, client_at) values (auth.uid(), 'grasa', 'injury', false, '0.1-A12', tests.h('A12'), now() + interval '1 second');
reset role; select tests.login('x');
select tests.ok((select jsonb_array_length(grasa.coach_injuries(tests.uid('ana')))) = 0, 'sin autorización vigente el coach no ve nada');

-- aviso push al coach: neutral y solo si activó los avisos
reset role; select tests.login('x');
insert into core.consent_events (user_id, app_id, kind, granted, version, text_hash, client_at) values (auth.uid(), 'grasa', 'push', true, '0.2-A11-push', tests.h('push'), now());
select grasa.push_register('https://push.example/coach123456789012345', repeat('p', 40), repeat('a', 20));
reset role; select tests.login('ana');
insert into core.consent_events (user_id, app_id, kind, granted, version, text_hash, client_at) values (auth.uid(), 'grasa', 'injury', true, '0.1-A12', tests.h('A12'), now() + interval '2 seconds');
select grasa.injury_save('a1000000-0000-4000-8000-000000000009', 'lesion', 'Hombro', null, 'activa', null, '0.1-A12', repeat('a', 64));
reset role;
select tests.ok((select count(*) from grasa.push_outbox where user_id = tests.uid('x') and kind = 'client_alert' and sent_at is null) = 1, 'una lesión nueva deja UN aviso neutral en la cola del coach');
select tests.ok(not exists (select 1 from information_schema.columns where table_schema = 'grasa' and table_name = 'push_outbox' and column_name in ('body', 'title', 'area', 'description')), 'la cola no guarda zona ni descripción');
select tests.login('x'); select grasa.push_set_prefs(true, true, false); reset role;
update grasa.push_outbox set sent_at = now();
select tests.login('ana');
select grasa.injury_save('a1000000-0000-4000-8000-000000000009', 'lesion', 'Hombro', null, 'superada', null, '0.1-A12', repeat('a', 64));
reset role;
select tests.ok((select count(*) from grasa.push_outbox where user_id = tests.uid('x') and sent_at is null) = 0, 'con «avisos de asesorados» apagado no se encola');
select tests.ok(not exists (select 1 from information_schema.table_privileges where table_schema = 'grasa' and table_name in ('injuries', 'injury_notes') and grantee in ('anon', 'authenticated', 'service_role')), 'las tablas no son accesibles directo');
rollback;
