-- v1.18: el consentimiento `coach_data` es un tipo propio, independiente de `coach_agreement`.
begin;
select tests.login('x');
select core.join_app('grasa');
insert into core.consent_events (user_id, app_id, kind, granted, version, text_hash, client_at) values
  (auth.uid(), 'grasa', 'coach_agreement', true, '0.7-A7-coach', tests.h('A7'),  '2026-11-05T10:00:00Z'),
  (auth.uid(), 'grasa', 'coach_data',      true, '0.1-A10-coach', tests.h('A10'), '2026-11-05T10:00:01Z');
select tests.ok((select granted and version = '0.1-A10-coach' and text_hash = tests.h('A10') from core.my_consents('grasa') where kind = 'coach_data'),
  'coach_data se registra con su propia versión y huella');
select tests.ok((select count(distinct text_hash) from core.consent_events where kind in ('coach_agreement', 'coach_data') and user_id = auth.uid()) = 2,
  'el acuerdo y la autorización de datos son dos eventos con huellas distintas');
select tests.throws($$insert into core.consent_events (user_id, app_id, kind, granted, version, text_hash, client_at)
  values (tests.uid('ana'), 'grasa', 'coach_data', true, '0.1-A10-coach', tests.h('A10'), now())$$, 'row-level security',
  'nadie registra la autorización de datos a nombre de otro');
rollback;
