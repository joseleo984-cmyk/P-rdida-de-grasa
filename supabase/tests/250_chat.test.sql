-- v1.22: chat asesorado ⇄ coach. Solo con vínculo activo; el coach necesita el Acuerdo 1.0; límites; avisos neutros; sin lectura cruzada.
begin;
select tests.agree('x'); select tests.cloud('ana'); select tests.agree('y');
select tests.login('x');
select set_config('t.code', (select invite_code from grasa.become_coach('Coach Chat')), true);
reset role; select tests.login('ana');
select grasa.join_coach(current_setting('t.code'), jsonb_build_object('body', true, 'notes', false, 'nutrition', true, 'habits', true, 'photos', false, 'version', '0.1', 'text_hash', tests.h('compartir')));

-- asesorado escribe
select tests.ok((grasa.chat_send(gen_random_uuid(), null, '  Hola coach, ¿cómo voy?  ')->>'body') = 'Hola coach, ¿cómo voy?', 'el asesorado escribe a su coach (texto recortado)');
select set_config('t.m1', (select (grasa.chat_list(null)->0->>'id')), true);
select tests.ok((grasa.chat_send(current_setting('t.m1')::uuid, null, 'otro texto')->>'body') = 'Hola coach, ¿cómo voy?', 'reenviar el mismo id no duplica');
select tests.ok((select jsonb_array_length(grasa.chat_list(null))) = 1, 'solo queda un mensaje');
select tests.throws($$select grasa.chat_send(gen_random_uuid(), null, '   ')$$, 'invalid', 'no se envía vacío');
select tests.throws($$select grasa.chat_send(gen_random_uuid(), null, repeat('a', 1001))$$, 'invalid', 'máximo 1000 caracteres');
select tests.ok((grasa.chat_send(gen_random_uuid(), null, repeat('a', 1000))->>'body') is not null, '1000 caracteres sí');

-- coach: sin el Acuerdo 1.0 no lee ni responde
reset role; select tests.login('x');
select tests.throws($$select grasa.chat_list(tests.uid('ana'))$$, 'forbidden', 'sin el Acuerdo 1.0 el coach no lee el chat');
select tests.throws($$select grasa.chat_send(gen_random_uuid(), tests.uid('ana'), 'Hola')$$, 'forbidden', 'ni responde');
insert into core.consent_events (user_id, app_id, kind, granted, version, text_hash, client_at) values (auth.uid(), 'grasa', 'coach_agreement', true, '1.0-A7-coach', tests.h('A7'), now() + interval '1 second');
select tests.ok((select jsonb_array_length(grasa.chat_list(tests.uid('ana')))) = 2, 'con el Acuerdo 1.0 el coach ve los mensajes');
select tests.ok((select (grasa.chat_unread()->0->>'n')::int) = 2, 'el coach tiene 2 sin leer');
select grasa.chat_mark_read(tests.uid('ana'));
select tests.ok(grasa.chat_unread() = '[]'::jsonb, 'al leer quedan en cero');
select tests.ok((grasa.chat_send(gen_random_uuid(), tests.uid('ana'), 'Vas muy bien')->>'mine')::boolean, 'el coach responde y el mensaje es suyo');

-- otro coach sin vínculo no ve nada
reset role; select tests.login('y'); select grasa.become_coach('Coach Y3');
insert into core.consent_events (user_id, app_id, kind, granted, version, text_hash, client_at) values (auth.uid(), 'grasa', 'coach_agreement', true, '1.0-A7-coach', tests.h('A7'), now() + interval '1 second');
select tests.throws($$select grasa.chat_list(tests.uid('ana'))$$, 'forbidden', 'un coach sin vínculo no lee');
select tests.throws($$select grasa.chat_send(gen_random_uuid(), tests.uid('ana'), 'hola')$$, 'forbidden', 'ni escribe');

-- el asesorado ve la respuesta
reset role; select tests.login('ana');
select tests.ok((select jsonb_array_length(grasa.chat_list(null))) = 3, 'el asesorado ve los 3 mensajes');
select tests.ok((select (grasa.chat_unread()->0->>'n')::int) = 1, 'el asesorado tiene 1 sin leer');
select grasa.chat_mark_read(null);
select tests.ok(grasa.chat_unread() = '[]'::jsonb, 'leído');
-- límite por hora
select tests.ok((select count(*) from (select grasa.chat_send(gen_random_uuid(), null, 'm' || g) from generate_series(1, 28) g) s) = 28, 'hasta 30 por hora (ya llevaba 2)');
select tests.throws($$select grasa.chat_send(gen_random_uuid(), null, 'uno más')$$, 'rate_limited', 'el mensaje 31 de la hora se rechaza');

-- al desvincularse el coach pierde el acceso
reset role; select tests.login('ana');
select grasa.leave_coach();
select tests.throws($$select grasa.chat_send(gen_random_uuid(), null, 'hola')$$, 'not_found', 'sin coach no hay chat');
reset role; select tests.login('x');
select tests.throws($$select grasa.chat_list(tests.uid('ana'))$$, 'forbidden', 'el coach pierde el acceso al desvincularse');
rollback;
