-- Cuentas (join_app, roles, perfil) y consent_events SOLO INSERCIÓN con hash del texto.
begin;

select tests.login('ana');
select tests.ok(core.join_app('grasa') = array['client'], 'join_app da el rol client');
select tests.ok(core.join_app('grasa') = array['client'], 'join_app es idempotente');
select tests.ok(core.my_roles('grasa') = array['client'], 'my_roles devuelve mis roles');
select tests.throws($$select core.join_app('otra')$$, 'not_found', 'join_app de una app inexistente falla');
select tests.throws($$insert into core.app_access (user_id, app_id, role) values (auth.uid(), 'grasa', 'admin')$$,
  'permission denied', 'nadie se da rol (admin/coach) insertando en app_access');
select tests.ok((select count(*) from core.profiles) = 1, 'cada uno ve solo su perfil');
update core.profiles set display_name = 'Ana M.' where id = auth.uid();
select tests.ok((select display_name from core.profiles) = 'Ana M.', 'puede cambiar su display_name');
update core.profiles set display_name = 'hackeado' where id = tests.uid('bea');
select tests.throws($$update core.profiles set id = gen_random_uuid()$$, 'permission denied', 'no puede cambiar su id de perfil');

-- Consentimientos legales
insert into core.consent_events (user_id, app_id, kind, granted, version, text_hash, client_at)
values (auth.uid(), 'grasa', 'terms', true, '0.1', tests.h('T&C 0.1'), '2026-10-21T10:00:00Z'),
       (auth.uid(), 'grasa', 'sensitive_health', true, '0.1', tests.h('salud'), '2026-10-21T10:00:00Z');
select core.record_consent('grasa', 'sensitive_health', false, '0.1', 'texto salud', '2026-10-21T11:00:00Z');
select tests.ok((select text_hash from core.consent_events where kind = 'sensitive_health' and not granted) = tests.h('texto salud'),
  'record_consent guarda el SHA-256 del texto calculado en el servidor');
select tests.ok((select granted from core.my_consents('grasa') where kind = 'sensitive_health') = false,
  'my_consents devuelve el ÚLTIMO evento por tipo (revocación)');
select tests.throws($$insert into core.consent_events (user_id, app_id, kind, granted, version, text_hash, client_at)
  values (tests.uid('bea'), 'grasa', 'terms', true, '0.1', tests.h('x'), now())$$,
  'row-level security', 'no puede registrar consentimientos a nombre de otro');
select tests.throws($$insert into core.consent_events (user_id, app_id, kind, granted, version, text_hash, client_at)
  values (auth.uid(), 'grasa', 'terms', true, '0.1', 'no-es-un-hash', now())$$,
  'check', 'text_hash debe ser SHA-256 hex');
select tests.throws($$insert into core.consent_events (user_id, app_id, kind, granted, version, text_hash, client_at)
  values (auth.uid(), 'grasa', 'inventado', true, '0.1', tests.h('x'), now())$$, 'check', 'kind fuera de la lista se rechaza');
insert into core.consent_events (user_id, app_id, kind, granted, version, text_hash, client_at, created_at)
values (auth.uid(), 'grasa', 'privacy', true, '0.1', tests.h('p'), '2030-01-01T00:00:00Z', '2000-01-01T00:00:00Z');
select tests.ok((select created_at > now() - interval '1 minute' and client_at <= now() + interval '5 minutes'
                 from core.consent_events where kind = 'privacy'),
  'created_at lo fija el servidor (no se antedata) y client_at futuro se acota a +5 min');

-- Solo inserción: ni UPDATE ni DELETE (ni siquiera el superusuario o service_role)
select tests.throws($$update core.consent_events set granted = true$$, 'permission denied', 'usuario: UPDATE en consent_events denegado');
select tests.throws($$delete from core.consent_events$$, 'permission denied', 'usuario: DELETE en consent_events denegado');
reset role;
select tests.ok((select display_name from core.profiles where id = tests.uid('bea')) = 'Bea',
  'Ana no pudo cambiar el perfil de Bea (UPDATE sin filas por RLS)');
select tests.throws($$update core.consent_events set granted = true$$, 'solo-inserción', 'superusuario: UPDATE bloqueado por trigger');
select tests.throws($$delete from core.consent_events$$, 'solo-inserción', 'superusuario: DELETE bloqueado por trigger');
select tests.throws($$truncate core.consent_events$$, 'solo-inserción', 'TRUNCATE bloqueado');
set local role service_role;
select tests.throws($$update core.consent_events set granted = true$$, 'permission denied', 'service_role: UPDATE denegado');
reset role;

-- Otro usuario no ve los consentimientos de Ana
select tests.login('bea');
select tests.ok((select count(*) from core.consent_events) = 0, 'Bea no ve los consentimientos de Ana');
select tests.ok((select display_name from core.profiles where id = tests.uid('ana')) is null, 'Bea no ve el perfil de Ana');

-- Baja de cuenta: cascada (incluye consent_events, única forma de borrarlos)
select tests.login('ana');
select core.delete_my_account();
reset role;
select tests.ok(not exists (select 1 from auth.users where id = tests.uid('ana'))
                and not exists (select 1 from core.consent_events where user_id = tests.uid('ana'))
                and not exists (select 1 from core.profiles where id = tests.uid('ana')),
  'delete_my_account borra la cuenta y en cascada perfil y consentimientos');

rollback;
