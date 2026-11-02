-- v1.19: avisos push. Sin consentimiento no se guarda nada; con él, nota del coach y rutina nueva ponen UNA fila en la cola; apagar borra todo.
begin;
select tests.agree('x'); select tests.cloud('ana');
select tests.login('x');
select set_config('t.code', (select invite_code from grasa.become_coach('Coach Push')), true);
reset role; select tests.login('ana');
select grasa.join_coach(current_setting('t.code'), jsonb_build_object('body', true, 'notes', false, 'nutrition', true, 'habits', true, 'photos', false, 'version', '0.1', 'text_hash', tests.h('compartir')));

-- sin consentimiento no se registra
select tests.throws($$select grasa.push_register('https://push.example/abc123456789012345', repeat('p', 40), repeat('a', 20))$$, 'forbidden', 'sin el consentimiento `push` no se guarda el dispositivo');
insert into core.consent_events (user_id, app_id, kind, granted, version, text_hash, client_at)
  values (auth.uid(), 'grasa', 'push', true, '0.1-push', tests.h('push'), now());
select grasa.push_register('https://push.example/abc123456789012345', repeat('p', 40), repeat('a', 20));
select tests.ok((select (grasa.push_state()->>'devices')::int) = 1 and (grasa.push_state()->>'consent')::boolean, 'con el consentimiento queda registrado');
select tests.throws($$select grasa.push_register('http://inseguro.example/abc123456789012345', repeat('p', 40), repeat('a', 20))$$, 'check', 'solo endpoints https');

-- el coach escribe una nota → UNA fila (la segunda, mientras la primera está pendiente, no se añade)
reset role; select tests.login('x');
select grasa.add_comment('90000000-0000-4000-8000-000000000001', tests.uid('ana'), current_date, 'Hola');
select grasa.add_comment('90000000-0000-4000-8000-000000000002', tests.uid('ana'), current_date, 'Hola otra vez');
reset role;
select tests.ok((select count(*) from grasa.push_outbox where user_id = tests.uid('ana') and kind = 'coach_msg') = 1, 'una nota → un aviso en cola, sin ráfagas');
select tests.ok(not exists (select 1 from information_schema.columns where table_schema = 'grasa' and table_name = 'push_outbox' and column_name in ('body', 'title', 'text', 'message')),
  'la cola no guarda texto de avisos (el contenido lo fija la app)');

-- preferencias: con «mensajes del coach» apagado no se encola
select tests.login('ana');
select grasa.push_set_prefs(false, true);
reset role;
update grasa.push_outbox set sent_at = now();   -- (como superusuario de pruebas) lo anterior ya salió
select tests.login('x');
select grasa.add_comment('90000000-0000-4000-8000-000000000003', tests.uid('ana'), current_date, 'Otra');
reset role;
select tests.ok((select count(*) from grasa.push_outbox where user_id = tests.uid('ana') and sent_at is null) = 0, 'con «mensajes del coach» apagado no se encola');

-- reclamar y marcar; el dispositivo viaja con el aviso
select tests.login('ana'); select grasa.push_set_prefs(true, true); reset role;
select tests.login('x');
select grasa.add_comment('90000000-0000-4000-8000-000000000004', tests.uid('ana'), current_date, 'Nueva');
reset role;
set local role service_role;
select tests.ok((select jsonb_array_length(grasa.push_take(10))) = 1, 'push_take devuelve lo pendiente');
select tests.ok((select jsonb_array_length(grasa.push_take(10))) = 0, 'y no lo repite');
reset role;

-- apagar borra el dispositivo; eliminar la cuenta borra todo (cascade)
select tests.login('ana');
select grasa.push_off();
select tests.ok((select (grasa.push_state()->>'devices')::int) = 0, 'apagar los avisos borra el identificador del dispositivo');
reset role;
select tests.ok(not exists (select 1 from information_schema.table_privileges where table_schema = 'grasa' and table_name in ('push_devices', 'push_config', 'push_outbox', 'push_prefs') and grantee in ('anon', 'authenticated', 'service_role')),
  'ninguna tabla de avisos es accesible directo (solo por funciones)');
rollback;
