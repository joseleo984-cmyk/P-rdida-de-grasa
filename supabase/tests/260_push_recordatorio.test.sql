-- v1.23: recordatorio diario. Apagado por defecto; con hora elegida se encola UNA vez al día dentro de su ventana; no antes de la hora ni 2 horas después.
begin;
select tests.cloud('ana');
select tests.login('ana');
insert into core.consent_events (user_id, app_id, kind, granted, version, text_hash, client_at)
  values (auth.uid(), 'grasa', 'push', true, '0.2-A11-push', tests.h('push'), now());
select grasa.push_register('https://push.example/abc123456789012345', repeat('p', 40), repeat('a', 20));
select tests.ok(not (grasa.push_state()->>'reminder')::boolean and grasa.push_state()->>'reminder_at' = '20:00', 'el recordatorio viene apagado y con 20:00 de hora sugerida');
reset role;
select tests.ok(grasa.push_daily_tick() = 0, 'apagado no se encola nada');

-- hora = ahora (Colombia): se encola una vez
select tests.login('ana');
select grasa.push_set_prefs(true, true, true, true, (now() at time zone 'America/Bogota')::time(0));
reset role;
select tests.ok(grasa.push_daily_tick() = 1, 'a su hora se encola');
select tests.ok((select count(*) from grasa.push_outbox where user_id = tests.uid('ana') and kind = 'reminder' and sent_at is null) = 1, 'queda UN aviso `reminder` sin contenido');
select tests.ok(grasa.push_daily_tick() = 0, 'el mismo día no se repite');

-- cambiar la hora lo vuelve a permitir; una hora lejana no dispara
update grasa.push_outbox set sent_at = now();
select tests.login('ana');
select grasa.push_set_prefs(true, true, true, true, ((now() at time zone 'America/Bogota')::time(0) + interval '5 hours')::time);
reset role;
select tests.ok(grasa.push_daily_tick() = 0, 'antes de su hora no se encola');
select tests.login('ana');
select grasa.push_set_prefs(true, true, true, true, ((now() at time zone 'America/Bogota')::time(0) - interval '3 hours')::time);
reset role;
select tests.ok(grasa.push_daily_tick() = 0 or extract(hour from (now() at time zone 'America/Bogota')) < 3, 'pasadas 2 horas de su hora ya no se encola');

-- apagado: no se encola; el estado devuelve la hora
select tests.login('ana');
select grasa.push_set_prefs(true, true, true, false, '07:30');
select tests.ok((grasa.push_state()->>'reminder_at') = '07:30' and not (grasa.push_state()->>'reminder')::boolean, 'el estado guarda la hora');
reset role;
select tests.ok(not exists (select 1 from information_schema.routine_privileges where routine_schema = 'grasa' and routine_name = 'push_daily_tick' and grantee in ('anon', 'authenticated', 'service_role')), 'el programador no es accesible desde la app');
rollback;
