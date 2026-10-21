-- QA · Revisión de seguridad adversarial de R1 (S3-1): RLS, funciones con privilegios, escalada, fuerza bruta,
-- Storage y borrado de cuenta. Datos de salud y fotos: cualquier fuga es grave.
--
-- Dos tipos de comprobación:
--   tests.ok / tests.throws  → protección que DEBE existir (si falla, hay un agujero nuevo).
--   tests.hole(presente, id, msg) → AGUJERO CONOCIDO, descrito en equipo/handoffs/2026-10-21-S3-1-qa-veredicto.md.
--     · Mientras exista, se informa como "AGUJERO CONOCIDO" sin romper la suite (como test.fail en Playwright).
--     · Con PGOPTIONS='-c qa.strict=on' npm run test:db, cada agujero presente FALLA (modo estricto).
--     · Cuando se corrija, la comprobación FALLA con "ya está corregido": cámbiala por tests.ok.

create or replace function tests.hole(p_present boolean, p_id text, p_msg text) returns void language plpgsql as $$
begin
  if p_present then
    if coalesce(current_setting('qa.strict', true), '') = 'on' then
      raise exception 'FALLO - AGUJERO % - %', p_id, p_msg;
    end if;
    raise notice 'AGUJERO CONOCIDO % - %', p_id, p_msg;
  else
    raise exception 'FALLO - el agujero % ya está corregido: cambia tests.hole por tests.ok (%)', p_id, p_msg;
  end if;
end $$;
grant execute on function tests.hole(boolean, text, text) to authenticated, anon, service_role;

-- ======================================================================================================
-- 1. Estructura: nada ejecutable por anon, funciones internas cerradas, sin vistas que salten la RLS
-- ======================================================================================================
begin;
select tests.ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('core', 'grasa') and has_function_privilege('anon', p.oid, 'execute')),
  'anon no ejecuta NINGUNA función de core/grasa');
select tests.ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('core', 'grasa') and p.prosecdef
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search\_path=%')),
  'toda función SECURITY DEFINER de core/grasa fija search_path');
-- Funciones internas con privilegios: si authenticated pudiera llamarlas, saltaría el límite de intentos
-- (valid_coach_for), bloquearía a otros (count_attempt con p_uid ajeno) o falsificaría consentimientos (log_shares).
select tests.ok(not has_function_privilege('authenticated', 'grasa.count_attempt(uuid)', 'execute'),
  'authenticated NO ejecuta grasa.count_attempt (podría agotar los intentos de otro usuario)');
select tests.ok(not has_function_privilege('authenticated', 'grasa.valid_coach_for(text)', 'execute'),
  'authenticated NO ejecuta grasa.valid_coach_for (saltaría el límite de 20/h)');
select tests.ok(not has_function_privilege('authenticated', 'grasa.log_shares(uuid, uuid, jsonb, grasa.coach_links)', 'execute'),
  'authenticated NO ejecuta grasa.log_shares (falsificaría consent_events de otro)');
select tests.ok(not has_function_privilege('authenticated', 'core.handle_new_user()', 'execute'),
  'authenticated NO ejecuta core.handle_new_user');
-- Lista blanca: las ÚNICAS funciones SECURITY DEFINER ejecutables por authenticated son las RPC del contrato.
select tests.ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('core', 'grasa') and p.prosecdef and has_function_privilege('authenticated', p.oid, 'execute')
    and n.nspname || '.' || p.proname not in (
      'core.my_roles', 'core.join_app', 'core.my_consents', 'core.delete_my_account', 'core.has_role',
      'grasa.coach_can_see', 'grasa.coach_can_see_photo', 'grasa.become_coach', 'grasa.rotate_invite_code',
      'grasa.preview_invite_code', 'grasa.join_coach', 'grasa.update_shares', 'grasa.leave_coach', 'grasa.end_client',
      'grasa.coach_clients', 'grasa.coach_pull', 'grasa.add_comment', 'grasa.delete_comment', 'grasa.mark_comment_read',
      'grasa.coach_photo_opened', 'grasa.billing_active_clients', 'grasa.my_link')),
  'authenticated solo ejecuta las SECURITY DEFINER de la lista blanca del contrato');
select tests.ok(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('core', 'grasa') and c.relkind in ('v', 'm')
    and not coalesce(c.reloptions @> array['security_invoker=true'], false)),
  'no hay vistas en core/grasa que salten la RLS (o son security_invoker)');
select tests.ok(not has_schema_privilege('authenticated', 'core', 'create') and not has_schema_privilege('authenticated', 'grasa', 'create')
                and not has_schema_privilege('anon', 'core', 'usage') and not has_schema_privilege('anon', 'grasa', 'usage'),
  'authenticated no crea objetos en core/grasa; anon ni siquiera tiene USAGE');
select tests.ok(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('core', 'grasa') and c.relkind = 'r'
    and (has_table_privilege('authenticated', c.oid, 'delete') or has_table_privilege('authenticated', c.oid, 'truncate')
         or has_table_privilege('authenticated', c.oid, 'references') or has_table_privilege('authenticated', c.oid, 'trigger'))),
  'authenticated no tiene DELETE/TRUNCATE/REFERENCES/TRIGGER en ninguna tabla de core/grasa');
select tests.ok(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('core', 'grasa') and c.relkind = 'r' and not c.relforcerowsecurity and c.relrowsecurity is not true),
  'todas las tablas de core/grasa tienen RLS');
rollback;

-- ======================================================================================================
-- Preparación común (se repite en cada bloque porque cada uno hace rollback)
-- ======================================================================================================
create or replace function tests.qa_setup() returns void language plpgsql as $$
begin
  perform tests.login('x');
  perform set_config('t.code_x', (select invite_code from grasa.become_coach('Coach X Fit')), true);
  perform set_config('role', 'postgres', true);
  perform tests.login('ana');
  perform grasa.join_coach(current_setting('t.code_x'),
    jsonb_build_object('body', true, 'notes', false, 'nutrition', true, 'habits', false, 'photos', true,
                       'version', '0.1', 'text_hash', tests.h('compartir')));
  perform grasa.sync_push(jsonb_build_array(
    jsonb_build_object('id', '10000000-0000-4000-8000-0000000000a1', 'kind', 'entry', 'nkey', '2026-10-20', 'date', '2026-10-20',
                       'data', jsonb_build_object('weight', 80, 'note', 'nota privada de Ana'), 'updated_at', '2026-10-20T10:00:00Z'),
    jsonb_build_object('id', '10000000-0000-4000-8000-0000000000a2', 'kind', 'library', 'nkey', 'arepa',
                       'data', jsonb_build_object('name', 'Arepa', 'kcal', 300), 'updated_at', '2026-10-20T10:00:00Z')),
    jsonb_build_array(
    jsonb_build_object('id', '20000000-0000-4000-8000-0000000000a1', 'date', '2026-10-01', 'pose', 'frente',
                       'storage_path', tests.uid('ana') || '/20000000-0000-4000-8000-0000000000a1.jpg', 'shared_with_coach', true,
                       'created_at', '2026-10-01T10:00:00Z', 'updated_at', '2026-10-01T10:00:00Z'),
    jsonb_build_object('id', '20000000-0000-4000-8000-0000000000a2', 'date', '2026-10-02', 'pose', 'perfil',
                       'storage_path', tests.uid('ana') || '/20000000-0000-4000-8000-0000000000a2.jpg', 'shared_with_coach', false,
                       'created_at', '2026-10-02T10:00:00Z', 'updated_at', '2026-10-02T10:00:00Z')));
  insert into storage.objects (bucket_id, name) values
    ('grasa-photos', tests.uid('ana') || '/20000000-0000-4000-8000-0000000000a1.jpg'),
    ('grasa-photos', tests.uid('ana') || '/20000000-0000-4000-8000-0000000000a2.jpg');
  perform set_config('role', 'postgres', true);
  perform tests.login('x');
  perform grasa.add_comment('30000000-0000-4000-8000-0000000000a1', tests.uid('ana'), '2026-10-20', 'Buen trabajo');
  perform grasa.coach_photo_opened('20000000-0000-4000-8000-0000000000a1');
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- ======================================================================================================
-- 2. Cliente B contra los datos de A (ids adivinados o filtrados, RPC, Storage, consentimientos, roles)
-- ======================================================================================================
begin;
select tests.qa_setup();
select tests.login('bea');
select tests.throws($$select grasa.sync_push('[]', jsonb_build_array(jsonb_build_object('id', '20000000-0000-4000-8000-0000000000a1',
  'date', '2026-10-01', 'pose', 'frente', 'storage_path', tests.uid('bea') || '/20000000-0000-4000-8000-0000000000a1.jpg',
  'shared_with_coach', true, 'created_at', '2026-10-01T10:00:00Z', 'updated_at', '2030-01-01T00:00:00Z')))$$,
  'row-level security', 'B no sobrescribe una foto de A reutilizando su id en sync_push');
select tests.throws(format($$insert into grasa.records (id, user_id, kind, nkey, data, updated_at)
  values (gen_random_uuid(), %L, 'profile', 'profile', '{}', now())$$, tests.uid('ana')),
  'row-level security', 'B no inserta registros a nombre de A');
update grasa.records set data = '{"weight":1}' where user_id = tests.uid('ana');
update grasa.photos set shared_with_coach = true where user_id = tests.uid('ana');
select tests.throws(format($$insert into storage.objects (bucket_id, name) values ('grasa-photos', '%s/20000000-0000-4000-8000-0000000000ff.jpg')$$,
  tests.uid('ana')), 'row-level security', 'B no sube archivos a la carpeta de A');
update storage.objects set name = name || '.x' where name like tests.uid('ana') || '/%';
delete from storage.objects where name like tests.uid('ana') || '/%';
select tests.throws(format($$insert into core.consent_events (user_id, app_id, kind, granted, version, text_hash, client_at)
  values (%L, 'grasa', 'share_photos', true, '0.1', '%s', now())$$, tests.uid('ana'), tests.h('x')),
  'row-level security', 'B no registra consentimientos a nombre de A');
select tests.throws($$select grasa.coach_pull(tests.uid('ana'))$$, 'forbidden', 'B (sin ser coach) no hace coach_pull de A');
select grasa.become_coach('Coach Bea');
select tests.throws($$select grasa.coach_pull(tests.uid('ana'))$$, 'forbidden', 'B convertida en coach tampoco ve a A sin vínculo');
select tests.throws($$select grasa.add_comment(gen_random_uuid(), tests.uid('ana'), null, 'spam')$$, 'forbidden', 'B no comenta a A');
select tests.throws($$select grasa.end_client(tests.uid('ana'))$$, 'not_found', 'B no termina el vínculo de A con X');
select tests.throws($$select grasa.coach_photo_opened('20000000-0000-4000-8000-0000000000a1')$$, 'forbidden',
  'B no registra vistas ni comprueba fotos de A');
select tests.throws($$select grasa.mark_comment_read('30000000-0000-4000-8000-0000000000a1')$$, 'not_found', 'B no marca comentarios de A');
select tests.throws($$select grasa.delete_comment('30000000-0000-4000-8000-0000000000a1')$$, 'not_found', 'B no borra comentarios de X');
select tests.throws($$select grasa.add_comment('30000000-0000-4000-8000-0000000000a1', tests.uid('bea'), null, 'x')$$, 'forbidden',
  'B no reutiliza el id de un comentario ajeno para leerlo');
select tests.ok(not grasa.coach_can_see(tests.uid('ana'), 'body') and not grasa.coach_can_see_photo(tests.uid('ana'), '20000000-0000-4000-8000-0000000000a1'),
  'coach_can_see / coach_can_see_photo no dan acceso a B');
-- Escalada de rol
select tests.throws($$insert into core.app_access (user_id, app_id, role) values (auth.uid(), 'grasa', 'admin')$$,
  'permission denied', 'B no se da el rol admin insertando en core.app_access');
select tests.throws($$update core.app_access set role = 'admin' where user_id = auth.uid()$$, 'permission denied',
  'B no cambia su rol a admin');
select tests.throws($$update core.profiles set id = tests.uid('ana') where id = auth.uid()$$, 'permission denied',
  'B no cambia el id de su perfil');
update core.profiles set display_name = 'hackeado' where id = tests.uid('ana');
select tests.ok(not core.has_role('grasa', 'admin'), 'become_coach no da admin');
select tests.throws($$select * from grasa.billing_active_clients('2026-10-01')$$, 'forbidden', 'B (coach) no ve la facturación');
select tests.throws($$select * from grasa.invite_attempts$$, 'permission denied', 'B no lee los intentos de invitación');
select tests.ok((select count(*) from grasa.coach_links) = 0, 'B no ve el vínculo de A con X');
select tests.ok((select count(*) from grasa.comments) = 0 and (select count(*) from grasa.photo_views) = 0,
  'B no ve comentarios ni vistas de fotos de A');
select tests.ok((select count(*) from core.consent_events where user_id = tests.uid('ana')) = 0, 'B no lee consentimientos de A');
reset role;
select tests.ok((select data ->> 'weight' from grasa.records where user_id = tests.uid('ana') and kind = 'entry') = '80'
                and (select shared_with_coach from grasa.photos where id = '20000000-0000-4000-8000-0000000000a2') = false
                and (select count(*) from storage.objects where name like tests.uid('ana') || '/%' and name like '%.jpg') = 2
                and (select display_name from core.profiles where id = tests.uid('ana')) = 'Ana',
  'tras todos los intentos de B, los datos, fotos, archivos y perfil de A siguen intactos');
rollback;

-- ======================================================================================================
-- 3. Coach X: nunca escribe datos del cliente; tras terminar el vínculo pierde el acceso
-- ======================================================================================================
begin;
select tests.qa_setup();
select tests.login('x');
select tests.throws(format($$insert into grasa.records (id, user_id, kind, nkey, data, updated_at)
  values (gen_random_uuid(), %L, 'profile', 'profile', '{}', now())$$, tests.uid('ana')), 'row-level security',
  'X no inserta registros en los datos de A');
update grasa.records set data = '{}' where user_id = tests.uid('ana');
update grasa.photos set deleted_at = now() where user_id = tests.uid('ana');
delete from storage.objects where name like tests.uid('ana') || '/%';
update storage.objects set name = 'x' where name like tests.uid('ana') || '/%';
select tests.ok((select count(*) from storage.objects) = 1, 'X solo ve en Storage el archivo de la foto compartida');
select tests.ok(not grasa.coach_can_see_photo(tests.uid('ana'), '20000000-0000-4000-8000-0000000000a2'),
  'X no accede a la foto NO marcada como compartida');
select tests.throws($$select grasa.coach_photo_opened('20000000-0000-4000-8000-0000000000a2')$$, 'forbidden',
  'X no registra vista de la foto no compartida');
select set_config('t.pull', grasa.coach_pull(tests.uid('ana'))::text, true);
select tests.ok(not exists (select 1 from jsonb_array_elements(current_setting('t.pull')::jsonb -> 'records') e
                            where e ->> 'kind' = 'library' or e -> 'data' ? 'note'),
  'coach_pull de X: sin library y sin note (share_notes = false)');
select tests.ok(position('nota privada' in current_setting('t.pull')) = 0, 'el texto de la nota no aparece en ningún campo del pull');
select tests.throws($$select grasa.coach_pull(tests.uid('bea'))$$, 'forbidden', 'X no hace pull de clientes que no son suyos');
-- Fin del vínculo
select grasa.end_client(tests.uid('ana'));
select tests.throws($$select grasa.coach_pull(tests.uid('ana'))$$, 'forbidden', 'tras terminar, X no hace pull');
select tests.ok((select count(*) from storage.objects) = 0, 'tras terminar, X no ve ningún archivo de A');
select tests.throws($$select grasa.add_comment(gen_random_uuid(), tests.uid('ana'), null, 'hola')$$, 'forbidden', 'tras terminar, X no comenta');
select tests.ok(not exists (select 1 from grasa.coach_clients()), 'tras terminar, A no aparece en coach_clients');
reset role;
select tests.ok((select data ->> 'note' from grasa.records where user_id = tests.uid('ana') and kind = 'entry') = 'nota privada de Ana'
                and (select count(*) from grasa.photos where user_id = tests.uid('ana') and deleted_at is null) = 2
                and (select count(*) from storage.objects where name like tests.uid('ana') || '/%.jpg') = 2,
  'X no modificó ni borró nada de A (registros, fotos ni archivos)');
rollback;

-- ======================================================================================================
-- 4. Fuerza bruta del código de invitación (límite 20/hora)
-- ======================================================================================================
begin;
select tests.login('x');
select set_config('t.code_x', (select invite_code from grasa.become_coach('Coach X Fit')), true);
reset role; select tests.login('bea');
-- Por la API cada llamada es su propia transacción: un error la revierte entera. tests.throws lo reproduce con un
-- subbloque (savepoint) que también se revierte. D1 corregido: un código inválido devuelve NULL (no lanza), así que
-- el intento queda registrado; a partir del 21.º en una hora, rate_limited.
do $$ declare nulls int := 0; limited int := 0; r grasa.coach_links; begin
  for i in 1..25 loop
    begin
      r := grasa.join_coach('ZZZZZ' || substr('ABCDEFGHJKMNPQRSTUVWXYZ23', i, 1),
        jsonb_build_object('body', true, 'version', '0.1', 'text_hash', tests.h('c')));
      if r.id is null then nulls := nulls + 1; end if;
    exception when others then
      if sqlerrm = 'rate_limited' then limited := limited + 1; else raise; end if;
    end;
  end loop;
  perform tests.ok(nulls = 20 and limited = 5, format('25 códigos inventados: 20 devuelven null y 5 rate_limited (%s/%s)', nulls, limited));
end $$;
reset role;
select tests.ok((select count(*) from grasa.invite_attempts where user_id = tests.uid('bea')) = 20,
  'QA-S3-1-D1 corregido: los intentos fallidos por join_coach SÍ cuentan para el límite de 20/h');
select tests.login('bea');
select tests.throws(format($$select grasa.join_coach(%L, jsonb_build_object('body', true, 'version', '0.1', 'text_hash', tests.h('c')))$$,
  current_setting('t.code_x')), 'rate_limited',
  'QA-S3-1-D1 corregido: tras 20 intentos fallidos, ni el código bueno se acepta hasta pasada la hora');
rollback;

begin;
-- La vista previa sí cuenta (devuelve 0 filas en lugar de error): 20 y el 21.º se bloquea.
select tests.login('bea');
select count(*) from (select grasa.preview_invite_code('ZZZZZZ') from generate_series(1, 20)) s;
select tests.throws($$select grasa.preview_invite_code('ZZZZZZ')$$, 'rate_limited', 'preview_invite_code: el 21.º intento en 1 h se bloquea');
select tests.throws($$select grasa.join_coach('ZZZZZZ', jsonb_build_object('body', true, 'version', '0.1', 'text_hash', tests.h('c')))$$, 'rate_limited', 'el límite de preview también bloquea join_coach');
rollback;

-- ======================================================================================================
-- 5. Consentimientos: no se pueden falsificar ni reescribir
-- ======================================================================================================
begin;
select tests.login('ana');
select tests.throws($$update core.consent_events set granted = false$$, 'permission denied', 'el titular no modifica sus consentimientos');
select tests.throws($$delete from core.consent_events$$, 'permission denied', 'el titular no borra sus consentimientos');
insert into core.consent_events (user_id, app_id, kind, granted, version, text_hash, client_at, created_at)
  values (auth.uid(), 'grasa', 'terms', true, '0.1', tests.h('t'), '2020-01-01', '2020-01-01');
select tests.ok((select created_at from core.consent_events where kind = 'terms') > now() - interval '1 minute',
  'created_at lo fija el servidor aunque el cliente envíe otro');
reset role;
select tests.throws($$delete from core.consent_events$$, 'solo-inserción', 'ni el superusuario borra consentimientos de un usuario vivo');
rollback;

-- ======================================================================================================
-- 6. Borrado de cuenta: no deben quedar datos del titular
-- ======================================================================================================
begin;
select tests.qa_setup();
select tests.login('ana');
select tests.throws($$select core.delete_my_account()$$, 'borra primero tus fotos',
  'QA-S3-1-D3 corregido: delete_my_account se niega mientras queden fotos del usuario en Storage');
delete from storage.objects where name like tests.uid('ana') || '/%';   -- la app borra primero sus fotos (API de Storage)
select core.delete_my_account();
reset role;
select tests.ok(not exists (select 1 from grasa.records where user_id = tests.uid('ana'))
                and not exists (select 1 from grasa.photos where user_id = tests.uid('ana'))
                and not exists (select 1 from grasa.coach_links where client_id = tests.uid('ana'))
                and not exists (select 1 from grasa.comments where client_id = tests.uid('ana'))
                and not exists (select 1 from core.consent_events where user_id = tests.uid('ana'))
                and not exists (select 1 from core.profiles where id = tests.uid('ana')),
  'la baja borra registros, fotos (metadatos), vínculos, comentarios, consentimientos y perfil');
select tests.ok(not exists (select 1 from grasa.photo_views where client_id = tests.uid('ana')),
  'QA-S3-1-D2 corregido: photo_views (FK en cascada) no deja quién vio las fotos del titular');
select tests.ok(not exists (select 1 from grasa.invite_attempts where user_id = tests.uid('ana')),
  'QA-S3-1-D2 corregido: invite_attempts (FK en cascada) no deja filas del titular');
select tests.ok(not exists (select 1 from storage.objects where name like tests.uid('ana') || '/%'),
  'QA-S3-1-D3 corregido: tras la baja no quedan fotos del titular en Storage');
rollback;

-- D3 (red de seguridad): una baja hecha fuera de la app (p. ej. desde el panel) deja la carpeta; orphan_photo_folders
-- la detecta y solo service_role puede consultarla (el script supabase/tools/sweep-orphan-photos.js borra los archivos).
begin;
select tests.qa_setup();
delete from auth.users where id = tests.uid('ana');   -- baja "por fuera", sin pasar por delete_my_account
select tests.ok((select files from grasa.orphan_photo_folders() where folder = tests.uid('ana')::text) = 2,
  'orphan_photo_folders lista la carpeta de fotos sin usuario y su número de archivos');
select tests.ok(not has_function_privilege('authenticated', 'grasa.orphan_photo_folders()', 'execute')
                and has_function_privilege('service_role', 'grasa.orphan_photo_folders()', 'execute'),
  'orphan_photo_folders solo la ejecuta service_role');
rollback;

begin;
select tests.qa_setup();
select tests.login('x');
select core.delete_my_account();
reset role;
select tests.ok(not exists (select 1 from grasa.coaches where user_id = tests.uid('x'))
                and not exists (select 1 from grasa.coach_links where coach_id = tests.uid('x'))
                and not exists (select 1 from grasa.comments where coach_id = tests.uid('x')),
  'la baja del coach borra su ficha, sus vínculos y sus comentarios');
select tests.ok(exists (select 1 from grasa.records where user_id = tests.uid('ana')),
  'la baja del coach NO borra datos de sus clientes');
select tests.ok(not exists (select 1 from grasa.photo_views where coach_id = tests.uid('x')),
  'QA-S3-1-D2 corregido: tras la baja del coach no quedan sus filas en grasa.photo_views');
rollback;

drop function tests.qa_setup();
