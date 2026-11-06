-- v1.25: «Tienes clase hoy». Con recordatorio activo y clase programada HOY (vínculo activo) el aviso es `class_today`; sin clase, `reminder`; sin recordatorio, nada.
begin;
select set_config('t.today', grasa.today_bogota()::text, true);
select tests.agree('x'); select tests.cloud('ana'); select tests.cloud('bea');
select tests.login('x');
select set_config('t.code', (select invite_code from grasa.become_coach('Coach Hoy')), true);
select set_config('t.tpl', (grasa.save_template(null, 'Pierna', '{"days":[{"title":"Día 1 – Pierna","exercises":[{"name":"Sentadilla","sets":"3×10"}]}]}'::jsonb)->>'id'), true);
reset role; select tests.login('ana');
select grasa.join_coach(current_setting('t.code'), jsonb_build_object('body', true, 'version', '0.1', 'text_hash', tests.h('c')));
insert into core.consent_events (user_id, app_id, kind, granted, version, text_hash, client_at) values (auth.uid(), 'grasa', 'push', true, '0.2-A11-push', tests.h('push'), now());
select grasa.push_register('https://push.example/ana123456789012345', repeat('p', 40), repeat('a', 20));
select grasa.push_set_prefs(true, true, true, true, (now() at time zone 'America/Bogota')::time(0));
reset role; select tests.login('bea');
select grasa.join_coach(current_setting('t.code'), jsonb_build_object('body', true, 'version', '0.1', 'text_hash', tests.h('c')));
insert into core.consent_events (user_id, app_id, kind, granted, version, text_hash, client_at) values (auth.uid(), 'grasa', 'push', true, '0.2-A11-push', tests.h('push'), now());
select grasa.push_register('https://push.example/bea123456789012345', repeat('q', 40), repeat('b', 20));
select grasa.push_set_prefs(true, true, true, true, (now() at time zone 'America/Bogota')::time(0));
-- el coach programa HOY solo a Ana
reset role; select tests.login('x');
select grasa.schedule_set(tests.uid('ana'), array[current_setting('t.today')::date], current_setting('t.tpl')::uuid);
reset role;
select tests.ok(grasa.push_daily_tick() = 2, 'a su hora se encola uno para cada una');
select tests.ok((select kind from grasa.push_outbox where user_id = tests.uid('ana') and sent_at is null) = 'class_today', 'Ana (con clase hoy) recibe `class_today`');
select tests.ok((select count(*) from grasa.push_outbox where user_id = tests.uid('ana') and sent_at is null) = 1, 'y solo uno, no dos');
select tests.ok((select kind from grasa.push_outbox where user_id = tests.uid('bea') and sent_at is null) = 'reminder', 'Bea (sin clase) recibe el recordatorio de siempre');
-- sin recordatorio activo no hay aviso aunque haya clase
update grasa.push_outbox set sent_at = now();
update grasa.push_prefs set reminder_last = null;
select tests.login('ana'); select grasa.push_set_prefs(true, true, true, false, '20:00'); reset role;
update grasa.push_prefs set reminder_last = null where user_id = tests.uid('ana');
select tests.ok((select count(*) from grasa.push_outbox where user_id = tests.uid('ana') and sent_at is null) = 0, 'sin recordatorio activo no queda nada en la cola de Ana');
-- si el vínculo ya no está activo, la clase no cuenta
select tests.login('ana'); select grasa.push_set_prefs(true, true, true, true, (now() at time zone 'America/Bogota')::time(0)); reset role;
select tests.login('ana'); select grasa.leave_coach(); reset role;
select grasa.push_daily_tick();
select tests.ok((select kind from grasa.push_outbox where user_id = tests.uid('ana') and sent_at is null) = 'reminder', 'sin vínculo activo vuelve el recordatorio normal');
select tests.ok(not exists (select 1 from information_schema.routine_privileges where routine_schema = 'grasa' and routine_name in ('push_daily_tick', 'push_enqueue') and grantee in ('anon', 'authenticated', 'service_role')), 'el programador y la cola no son accesibles desde la app');
rollback;
