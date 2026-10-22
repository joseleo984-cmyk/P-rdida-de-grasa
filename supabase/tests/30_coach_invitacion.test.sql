-- Coach, código de invitación (caducidad, usos, intentos) y vínculo coach ↔ cliente.
begin;
-- Sprint 7: el servidor exige el acuerdo del coach (A7) y A3+A4 del cliente.
select tests.agree('x'); select tests.agree('y'); select tests.cloud('ana'); select tests.cloud('bea');

-- Coach X se da de alta
select tests.login('x');
select set_config('t.code', (select invite_code from grasa.become_coach('Coach X Fit')), true);
select tests.ok(current_setting('t.code') ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$', 'become_coach da un código de 6 símbolos sin 0 O 1 I L');
select tests.ok((select invite_code from grasa.become_coach('Otro nombre')) = current_setting('t.code'), 'become_coach es idempotente');
select tests.ok(core.my_roles('grasa') @> array['coach'], 'become_coach da el rol coach');
select tests.throws($$select grasa.become_coach('x')$$, 'invalid', 'nombre comercial demasiado corto');
select tests.throws($$update grasa.coaches set free_clients = 999$$, 'permission denied', 'el coach no edita su fila directamente');

-- Ana: vista previa y unión
reset role; select tests.login('ana');
select tests.ok((select business_name from grasa.preview_invite_code(lower(current_setting('t.code')))) = 'Coach X Fit',
  'preview_invite_code devuelve solo el nombre comercial (acepta minúsculas)');
select tests.ok(not exists (select 1 from grasa.preview_invite_code('ZZZZZZ')), 'código inexistente: vista previa vacía');
select tests.ok((select count(*) from grasa.coaches) = 0, 'el cliente no lee la tabla de coaches');
select tests.throws(format($$select grasa.join_coach(%L, '{"body":false,"version":"0.1","text_hash":"%s"}')$$,
  current_setting('t.code'), tests.h('compartir')), 'obligatorio', 'compartir peso/medidas (body) es obligatorio');
select tests.throws(format($$select grasa.join_coach(%L, '{"body":true}')$$, current_setting('t.code')), 'invalid',
  'join_coach exige version y text_hash para el consentimiento de compartir');
select set_config('t.link', (select (grasa.join_coach(current_setting('t.code'),
  jsonb_build_object('body', true, 'nutrition', true, 'habits', false, 'version', '0.1', 'text_hash', tests.h('compartir'))
)).id::text), true);
select tests.ok((select status from grasa.coach_links where id = current_setting('t.link')::uuid) = 'active', 'Ana queda vinculada a X');
select tests.ok((select count(*) from core.consent_events where kind like 'share_%' and coach_id = tests.uid('x')) = 5,
  'join_coach registra los 5 consent_events share_* con el coach');
select tests.ok((select granted from core.consent_events where kind = 'share_habits') = false
                and (select text_hash from core.consent_events where kind = 'share_body') = tests.h('compartir'),
  'cada evento guarda su valor y el hash del texto de compartir');
select tests.throws($$update grasa.coach_links set share_photos = true$$, 'permission denied', 'el vínculo solo cambia por RPC');
-- S3-3b: my_link() da el vínculo activo con el nombre comercial (sin exponer el código ni la tabla de coaches)
select tests.ok((select business_name from grasa.my_link()) = 'Coach X Fit'
                and (select id from grasa.my_link()) = current_setting('t.link')::uuid
                and (select share_habits from grasa.my_link()) = false,
  'my_link devuelve el vínculo activo del cliente con el nombre comercial del coach');
reset role; select tests.login('bea');
select tests.ok(not exists (select 1 from grasa.my_link()), 'my_link: sin vínculo activo no devuelve nada');
reset role; select tests.login('ana');
select grasa.leave_coach();
select tests.ok(not exists (select 1 from grasa.my_link()), 'my_link: tras terminar el vínculo no devuelve nada');
reset role;
select tests.ok(not has_function_privilege('anon', 'grasa.my_link()', 'execute'), 'anon no ejecuta my_link');
rollback;

-- Límites del código (usos y caducidad), rotación y un solo coach activo.
begin;
select tests.agree('x'); select tests.agree('y'); select tests.cloud('ana'); select tests.cloud('bea'); select tests.cloud('y');
select tests.login('x');
select grasa.become_coach('Coach X Fit');
-- Código con límite de 1 uso y 7 días
select set_config('t.code', grasa.rotate_invite_code(7, 1), true);
reset role; select tests.login('ana');
select tests.ok((grasa.join_coach(current_setting('t.code'), jsonb_build_object('body', true, 'version', '0.1',
  'text_hash', tests.h('c')))).status = 'active', 'código de 1 uso: el primer cliente se vincula');
reset role; select tests.login('bea');
select tests.ok((grasa.join_coach(current_setting('t.code'), jsonb_build_object('body', true, 'version', '0.1', 'text_hash', tests.h('c')))).id is null,
  'código de 1 uso: el segundo cliente no puede usarlo (devuelve null: el intento cuenta)');

-- Código caducado
reset role; select tests.login('x');
select set_config('t.code', grasa.rotate_invite_code(7, null), true);
reset role;
update grasa.coaches set invite_expires_at = now() - interval '1 minute' where user_id = tests.uid('x');
select tests.login('bea');
select tests.ok((grasa.join_coach(current_setting('t.code'), jsonb_build_object('body', true, 'version', '0.1', 'text_hash', tests.h('c')))).id is null,
  'invitación caducada: join_coach falla (devuelve null: el intento cuenta)');
select tests.ok(not exists (select 1 from grasa.preview_invite_code(current_setting('t.code'))), 'invitación caducada: vista previa vacía');

-- Rotar invalida el código anterior; el nuevo funciona
reset role; select tests.login('x');
select set_config('t.old', current_setting('t.code'), true);
select set_config('t.code', grasa.rotate_invite_code(), true);
reset role; select tests.login('bea');
select tests.ok((grasa.join_coach(current_setting('t.old'), jsonb_build_object('body', true, 'version', '0.1', 'text_hash', tests.h('c')))).id is null,
  'el código anterior deja de servir tras rotar (devuelve null: el intento cuenta)');
select tests.ok((grasa.join_coach(current_setting('t.code'), jsonb_build_object('body', true, 'version', '0.1',
  'text_hash', tests.h('c')))).status = 'active', 'el código nuevo sí sirve');

-- Un solo coach activo: unirse a Y termina el vínculo con X
reset role; select tests.login('y');
select set_config('t.code_y', (select invite_code from grasa.become_coach('Coach Y')), true);
reset role; select tests.login('bea');
select grasa.join_coach(current_setting('t.code_y'), jsonb_build_object('body', true, 'version', '0.1', 'text_hash', tests.h('c')));
select tests.ok((select count(*) from grasa.coach_links where status = 'active') = 1
                and (select coach_id from grasa.coach_links where status = 'active') = tests.uid('y'),
  'unirse a otro coach termina el vínculo anterior (1 coach activo)');

-- El coach no puede ser su propio cliente
reset role; select tests.login('y');
select tests.throws(format($$select grasa.join_coach(%L, '{"body":true,"version":"0.1","text_hash":"%s"}')$$,
  current_setting('t.code_y'), tests.h('c')), 'propio coach', 'un coach no se vincula consigo mismo');

-- coach_clients: lista del coach con nombre y categorías; límite gratis
reset role; select tests.login('x');
select tests.ok((select count(*) from grasa.coach_clients()) = 1 and (select display_name from grasa.coach_clients()) = 'Ana',
  'coach_clients: X ve a Ana (activa) con su nombre, no a Bea (terminado)');
reset role; update grasa.coaches set free_clients = 0 where user_id = tests.uid('x'); select tests.login('x');
select tests.ok((select over_free_limit from grasa.coach_clients()), 'over_free_limit avisa al pasar del límite gratis');
reset role; select tests.login('bea');
select tests.throws($$select * from grasa.coach_clients()$$, 'forbidden', 'un cliente (sin acuerdo de coach) no obtiene lista de clientes');

-- Terminar: el cliente se va / el coach termina
reset role; select tests.login('ana');
select grasa.leave_coach();
select tests.ok((select status from grasa.coach_links where client_id = auth.uid()) = 'ended', 'leave_coach termina el vínculo');
reset role; select tests.login('y');
select grasa.end_client(tests.uid('bea'));
select tests.ok(not exists (select 1 from grasa.coach_clients()), 'end_client termina el vínculo del coach');
select tests.throws($$select grasa.end_client(tests.uid('ana'))$$, 'not_found', 'un coach no termina vínculos ajenos');
rollback;

-- Límite de intentos: 20 por hora por usuario (los fallidos cuentan)
begin;
select tests.cloud('bea');
select tests.login('bea');
do $$ begin for i in 1..20 loop perform grasa.preview_invite_code('ZZZZZZ'); end loop; end $$;
select tests.throws($$select grasa.preview_invite_code('ZZZZZZ')$$, 'rate_limited', 'el intento 21 en una hora: rate_limited');
select tests.throws($$select grasa.join_coach('ZZZZZZ', jsonb_build_object('body', true, 'version', '0.1', 'text_hash', tests.h('c')))$$, 'rate_limited', 'también join_coach queda limitado');
reset role; select tests.login('ana');
select tests.ok(not exists (select 1 from grasa.preview_invite_code('ZZZZZZ')), 'el límite es por usuario (Ana sigue pudiendo)');
rollback;
