-- Sprint 6: tipos de consentimiento nuevos, compartir apagado por defecto y archivo mínimo seudonimizado de la prueba
-- del consentimiento (core.consent_archive) que sobrevive a la baja de la cuenta.
begin;

-- ---------- Tipos nuevos (A4, A6a, A6b, A7) y uno inválido ----------
select tests.login('ana');
select core.join_app('grasa');
insert into core.consent_events (user_id, app_id, kind, granted, version, text_hash, client_at) values
  (auth.uid(), 'grasa', 'cloud_transfer',   true, '0.2-A4',  tests.h('A4'),  '2026-10-22T10:00:00Z'),
  (auth.uid(), 'grasa', 'photos_cloud',     true, '0.2-A6a', tests.h('A6a'), '2026-10-22T10:01:00Z'),
  (auth.uid(), 'grasa', 'photo_view_coach', true, '0.2-A6b', tests.h('A6b'), '2026-10-22T10:02:00Z'),
  (auth.uid(), 'grasa', 'photo_view_coach', false, '0.2-A6b', tests.h('A6b'), '2026-10-22T10:03:00Z');
select tests.ok((select count(*) from core.consent_events where kind in ('cloud_transfer','photos_cloud','photo_view_coach')) = 4,
  'los tipos cloud_transfer, photos_cloud y photo_view_coach se aceptan');
select tests.ok((select granted from core.my_consents('grasa') where kind = 'photo_view_coach') = false
                and (select granted from core.my_consents('grasa') where kind = 'cloud_transfer') = true,
  'my_consents devuelve el último evento de los tipos nuevos');
select tests.throws($$insert into core.consent_events (user_id, app_id, kind, granted, version, text_hash, client_at)
  values (auth.uid(), 'grasa', 'photo_cloud', true, '0.2-A6a', tests.h('x'), now())$$, 'check', 'un tipo con otro nombre (photo_cloud) se rechaza');
select tests.throws($$insert into core.consent_events (user_id, app_id, kind, granted, version, text_hash, client_at)
  values (auth.uid(), 'grasa', 'inventado', true, '1', tests.h('x'), now())$$, 'check', 'un tipo inventado se rechaza');

select tests.login('x');
select core.join_app('grasa');
select grasa.become_coach('Coach X');
insert into core.consent_events (user_id, app_id, kind, granted, version, text_hash, client_at)
values (auth.uid(), 'grasa', 'coach_agreement', true, '0.2-A7', tests.h('A7'), '2026-10-22T11:00:00Z');
select tests.ok((select granted and version = '0.2-A7' from core.my_consents('grasa') where kind = 'coach_agreement'),
  'coach_agreement se registra y se lee con versión y huella');
select tests.throws($$insert into core.consent_events (user_id, app_id, kind, granted, version, text_hash, client_at)
  values (tests.uid('ana'), 'grasa', 'coach_agreement', true, '0.2-A7', tests.h('A7'), now())$$, 'row-level security',
  'nadie registra el acuerdo de coach a nombre de otro');

-- ---------- Compartir nace apagado ----------
reset role;
select tests.ok((select column_default from information_schema.columns where table_schema = 'grasa' and table_name = 'coach_links'
                 and column_name = 'share_nutrition') = 'false'
                and (select column_default from information_schema.columns where table_schema = 'grasa' and table_name = 'coach_links'
                 and column_name = 'share_habits') = 'false',
  'comidas y hábitos nacen apagados por defecto en coach_links');

-- ---------- El archivo no se lee ni se escribe por la API ----------
select tests.ok(not has_table_privilege('anon', 'core.consent_archive', 'select')
                and not has_table_privilege('authenticated', 'core.consent_archive', 'select')
                and not has_table_privilege('service_role', 'core.consent_archive', 'select'),
  'anon, authenticated y service_role no tienen SELECT sobre consent_archive');
select tests.ok(not has_table_privilege('authenticated', 'core.consent_archive', 'insert')
                and not has_table_privilege('authenticated', 'core.consent_archive', 'update')
                and not has_table_privilege('authenticated', 'core.consent_archive', 'delete')
                and not has_table_privilege('service_role', 'core.consent_archive', 'insert'),
  'nadie con rol de la API escribe en consent_archive');
select tests.ok(not has_table_privilege('authenticated', 'core.archive_secret', 'select')
                and not has_table_privilege('service_role', 'core.archive_secret', 'select')
                and not has_table_privilege('anon', 'core.archive_secret', 'select'),
  'la sal del servidor no se lee por la API');
select tests.ok((select relrowsecurity from pg_class where oid = 'core.consent_archive'::regclass)
                and not exists (select 1 from pg_policy where polrelid = 'core.consent_archive'::regclass),
  'consent_archive: RLS activada y sin ninguna política');
select tests.login('ana');
select tests.throws($$select count(*) from core.consent_archive$$, 'permission denied', 'authenticated: SELECT en consent_archive denegado');
select tests.throws($$insert into core.consent_archive (user_pseudo_id, app_id, kind, action, version, text_hash, client_at, event_at)
  values (repeat('a', 64), 'grasa', 'terms', 'grant', '1', repeat('b', 64), now(), now())$$, 'permission denied',
  'authenticated: INSERT en consent_archive denegado');
reset role;
set local role anon;
select tests.throws($$select count(*) from core.consent_archive$$, 'permission denied', 'anon: SELECT en consent_archive denegado');
reset role;
set local role service_role;
select tests.throws($$select count(*) from core.consent_archive$$, 'permission denied', 'service_role: SELECT en consent_archive denegado');
select tests.throws($$select salt from core.archive_secret$$, 'permission denied', 'service_role: la sal no se lee');
reset role;
select tests.ok(not exists (select 1 from pg_constraint where conrelid = 'core.consent_archive'::regclass and contype = 'f'),
  'consent_archive no tiene ninguna clave foránea hacia auth.users');
select tests.ok(not exists (select 1 from information_schema.columns where table_schema = 'core' and table_name = 'consent_archive'
                            and column_name in ('user_id', 'coach_id', 'email', 'display_name', 'name')),
  'consent_archive no tiene columnas de correo, nombre ni uuid de usuario');

-- ---------- Solo inserción (también para el dueño de la base) ----------
insert into core.consent_archive (user_pseudo_id, app_id, kind, action, version, text_hash, client_at, event_at)
values (repeat('a', 64), 'grasa', 'terms', 'grant', '1', repeat('b', 64), now(), now());
select tests.throws($$update core.consent_archive set action = 'revoke'$$, 'solo-inserción', 'consent_archive: UPDATE bloqueado');
select tests.throws($$delete from core.consent_archive$$, 'solo-inserción', 'consent_archive: DELETE de filas vigentes bloqueado');
select tests.throws($$truncate core.consent_archive$$, 'solo-inserción', 'consent_archive: TRUNCATE bloqueado');
-- Filas VENCIDAS (purge_after pasado): el dueño de la base podrá depurarlas cuando el abogado fije el plazo.
insert into core.consent_archive (user_pseudo_id, app_id, kind, action, version, text_hash, client_at, event_at, purge_after)
values (repeat('c', 64), 'grasa', 'terms', 'grant', '1', repeat('b', 64), now(), now(), now() - interval '1 day');
delete from core.consent_archive where purge_after < now();
select tests.ok((select count(*) from core.consent_archive where user_pseudo_id = repeat('c', 64)) = 0
                and (select count(*) from core.consent_archive where user_pseudo_id = repeat('a', 64)) = 1,
  'solo se puede depurar lo vencido; lo vigente sigue');
delete from core.consent_archive where false;

-- ---------- La baja deja la prueba mínima, sin datos personales ----------
select tests.login('ana');
insert into core.consent_events (user_id, app_id, kind, granted, version, text_hash, coach_id, client_at)
values (auth.uid(), 'grasa', 'photo_view_coach', true, '0.2-A6b', tests.h('A6b'), tests.uid('x'), '2026-10-22T10:04:00Z');
select core.delete_my_account();
reset role;
select tests.ok(not exists (select 1 from auth.users where id = tests.uid('ana'))
                and not exists (select 1 from core.consent_events where user_id = tests.uid('ana')),
  'delete_my_account borra la cuenta y sus consent_events');
select tests.ok((select count(*) from core.consent_archive where user_pseudo_id <> repeat('a', 64) and user_pseudo_id <> repeat('c', 64)) = 5
                and (select count(distinct user_pseudo_id) from core.consent_archive where user_pseudo_id <> repeat('a', 64)) = 1,
  'la baja archivó los 5 consentimientos de Ana bajo un único seudónimo');
select tests.ok(not exists (
  select 1 from core.consent_archive a
  where a.user_pseudo_id = tests.uid('ana')::text or to_jsonb(a)::text ilike '%ana@test.co%' or to_jsonb(a)::text ilike '%' || tests.uid('ana')::text || '%'
     or to_jsonb(a)::text ilike '%' || tests.uid('x')::text || '%'),
  'el archivo no contiene el uuid, el correo ni el nombre de Ana ni el uuid del coach');
select tests.ok((select count(*) from core.consent_archive where kind = 'photo_view_coach' and action = 'revoke') = 1
                and (select count(*) from core.consent_archive where kind = 'photo_view_coach' and coach_pseudo_id ~ '^[0-9a-f]{64}$') = 1
                and (select count(*) from core.consent_archive where kind = 'cloud_transfer' and action = 'grant' and version = '0.2-A4'
                     and text_hash = tests.h('A4')) = 1,
  'el archivo conserva tipo, acción grant/revoke, versión y huella del texto');
select tests.ok((select count(*) from core.consent_archive where user_pseudo_id <> repeat('a', 64) and user_pseudo_id <> repeat('c', 64)
                 and archived_at > now() - interval '1 minute') = 5, 'el archivo registra la fecha de baja');

-- Una cuenta sin consentimientos se borra sin dejar nada en el archivo.
select tests.login('bea');
select core.delete_my_account();
reset role;
select tests.ok((select count(*) from core.consent_archive where user_pseudo_id <> repeat('a', 64) and user_pseudo_id <> repeat('c', 64)) = 5,
  'borrar una cuenta sin consentimientos no añade filas al archivo');

rollback;
