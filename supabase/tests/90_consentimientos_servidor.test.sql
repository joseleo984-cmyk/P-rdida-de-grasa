-- Sprint 7 (r1 v1.5): el SERVIDOR impone los consentimientos. Quien llame directo a la API no se los salta.
--   · Coach sin acuerdo vigente (A7): become_coach, rotate_invite_code, coach_clients, coach_pull, add_comment,
--     coach_photo_opened fallan con 42501 'forbidden'; su código de invitación no sirve.
--   · Cliente sin A3 (sensitive_health) + A4 (cloud_transfer) vigentes: sync_push, sync_pull y join_coach fallan con
--     42501 'consent_required'. Retirar (granted = false) bloquea de nuevo. "Vigente" = el último evento del tipo.
begin;

-- ---------- Coach sin acuerdo ----------
select tests.login('x');
select core.join_app('grasa');
select tests.throws($$select grasa.become_coach('Coach X Fit')$$, 'forbidden', 'become_coach sin acuerdo del coach: forbidden');
select tests.throws($$select grasa.become_coach('Coach X Fit')$$, 'coach_agreement_required', '... y el detalle dice coach_agreement_required');
do $$ declare c text; begin
  begin perform grasa.become_coach('Coach X Fit'); exception when others then c := sqlstate; end;
  perform tests.ok(c = '42501', 'el error del coach sin acuerdo es SQLSTATE 42501');
end $$;
select tests.ok(not exists (select 1 from grasa.coaches where user_id = tests.uid('x'))
                and not (core.my_roles('grasa') @> array['coach']), 'become_coach sin acuerdo no crea ficha ni da el rol coach');
-- Un evento a medias (granted = false) tampoco vale
reset role; select tests.consent('x', 'coach_agreement', false); select tests.login('x');
select tests.throws($$select grasa.become_coach('Coach X Fit')$$, 'forbidden', 'acuerdo con granted = false: become_coach sigue bloqueado');

-- Con acuerdo: funciona
reset role; select tests.agree('x'); select tests.login('x');
select set_config('t.code', (select invite_code from grasa.become_coach('Coach X Fit')), true);
select tests.ok(current_setting('t.code') ~ '^[A-Z2-9]{6}$', 'con el acuerdo vigente become_coach funciona y da el código');
select tests.ok((select count(*) from grasa.coach_clients()) = 0, 'con acuerdo: coach_clients responde (lista vacía)');
select tests.ok(grasa.rotate_invite_code() is not null, 'con acuerdo: rotate_invite_code funciona');
select set_config('t.code', (select invite_code from grasa.coaches where user_id = tests.uid('x')), true);

-- Ana (cliente) sin consentimientos
reset role; select tests.login('ana');
select tests.throws($$select grasa.sync_push('[]', '[]')$$, 'consent_required', 'cliente sin A3 ni A4: sync_push falla con consent_required');
select tests.throws($$select grasa.sync_pull(null)$$, 'consent_required', 'cliente sin A3 ni A4: sync_pull falla con consent_required');
select tests.throws(format($$select grasa.join_coach(%L, '{"body":true,"version":"0.1","text_hash":"%s"}')$$, current_setting('t.code'), tests.h('c')),
  'consent_required', 'cliente sin A3 ni A4: join_coach falla con consent_required');
select tests.ok((select count(*) from grasa.coach_links) = 0, '... y no queda ningún vínculo');
-- Solo A3 no basta; solo A4 tampoco
reset role; select tests.consent('ana', 'sensitive_health'); select tests.login('ana');
select tests.throws($$select grasa.sync_push('[]', '[]')$$, 'consent_required', 'solo A3 (sin A4): sync_push sigue bloqueado');
reset role; select tests.consent('ana', 'sensitive_health', false); select tests.consent('ana', 'cloud_transfer'); select tests.login('ana');
select tests.throws($$select grasa.sync_pull(null)$$, 'consent_required', 'solo A4 (A3 retirada): sync_pull sigue bloqueado');
-- Mensaje y SQLSTATE exactos que la app mapea (remote.js: 'consent_required' / 'forbidden', 42501)
do $$ declare m text; c text; m2 text; c2 text; d2 text;
begin
  begin perform grasa.sync_pull(null); exception when others then m := sqlerrm; c := sqlstate; end;
  perform tests.ok(m = 'consent_required' and c = '42501', 'consent_required llega con SQLSTATE 42501 y mensaje exacto');
end $$;
reset role; select tests.consent('ana', 'sensitive_health'); select tests.login('ana');   -- A3 + A4 vigentes

-- Ana con A3 + A4: sincroniza y se vincula
select tests.ok(grasa.sync_push(jsonb_build_array(jsonb_build_object('id', '90000000-0000-4000-8000-000000000001', 'kind', 'entry',
  'nkey', '2026-10-20', 'date', '2026-10-20', 'data', '{"weight":80}'::jsonb, 'updated_at', '2026-10-20T10:00:00Z')), '[]') ? 'server_now',
  'con A3 + A4 vigentes sync_push funciona');
select tests.ok(jsonb_array_length(grasa.sync_pull(null) -> 'records') = 1, 'con A3 + A4 vigentes sync_pull funciona');
select tests.ok((grasa.join_coach(current_setting('t.code'), jsonb_build_object('body', true, 'nutrition', true, 'version', '0.1',
  'text_hash', tests.h('c')))).status = 'active', 'con A3 + A4 vigentes join_coach funciona (coach con acuerdo)');

-- El coach con acuerdo lee y comenta
reset role; select tests.login('x');
select tests.ok(jsonb_array_length(grasa.coach_pull(tests.uid('ana'), null) -> 'records') = 1, 'coach con acuerdo: coach_pull devuelve los datos compartidos');
select tests.ok((select count(*) from grasa.coach_clients()) = 1, 'coach con acuerdo: coach_clients lista a Ana');
select tests.ok((grasa.add_comment('91000000-0000-4000-8000-000000000001', tests.uid('ana'), null, 'Hola')).body = 'Hola', 'coach con acuerdo: add_comment funciona');

-- ---------- Revocar el acuerdo bloquea de nuevo (al instante) ----------
reset role; select tests.consent('x', 'coach_agreement', false); select tests.login('x');
select tests.throws($$select * from grasa.coach_clients()$$, 'forbidden', 'acuerdo retirado: coach_clients bloqueado');
select tests.throws($$select grasa.coach_pull(tests.uid('ana'), null)$$, 'forbidden', 'acuerdo retirado: coach_pull bloqueado');
select tests.throws($$select grasa.add_comment(gen_random_uuid(), tests.uid('ana'), null, 'otra')$$, 'forbidden', 'acuerdo retirado: add_comment bloqueado');
select tests.throws($$select grasa.rotate_invite_code()$$, 'forbidden', 'acuerdo retirado: rotate_invite_code bloqueado');
select tests.throws($$select grasa.become_coach('Coach X Fit')$$, 'forbidden', 'acuerdo retirado: become_coach bloqueado');
select tests.throws($$select grasa.coach_photo_opened(gen_random_uuid())$$, 'forbidden', 'acuerdo retirado: coach_photo_opened bloqueado');
-- Lo que reduce acceso sigue disponible para el coach: terminar un vínculo y borrar su comentario
select tests.ok((select count(*) from grasa.comments where coach_id = tests.uid('x')) = 1, 'el comentario previo sigue existiendo');
select grasa.delete_comment('91000000-0000-4000-8000-000000000001');
select tests.ok((select deleted_at is not null from grasa.comments where id = '91000000-0000-4000-8000-000000000001'), 'sin acuerdo el coach aún puede borrar su comentario');

-- El código de un coach SIN acuerdo no sirve para nadie
reset role; select tests.cloud('bea'); select tests.login('bea');
select tests.ok(not exists (select 1 from grasa.preview_invite_code(current_setting('t.code'))), 'código de coach sin acuerdo: vista previa vacía');
select tests.ok((grasa.join_coach(current_setting('t.code'), jsonb_build_object('body', true, 'version', '0.1', 'text_hash', tests.h('c')))).id is null,
  'código de coach sin acuerdo: join_coach devuelve null (invalid_code), como un código caducado');
select tests.ok(not exists (select 1 from grasa.coach_links where client_id = tests.uid('bea')), '... y no se crea el vínculo');
-- Si el coach vuelve a aceptar, el código vuelve a servir
reset role; select tests.agree('x'); select tests.login('bea');
select tests.ok(exists (select 1 from grasa.preview_invite_code(current_setting('t.code'))), 'el coach acepta de nuevo: el mismo código vuelve a servir');
select tests.ok((grasa.join_coach(current_setting('t.code'), jsonb_build_object('body', true, 'version', '0.1', 'text_hash', tests.h('c')))).status = 'active',
  'y Bea se vincula');

-- ---------- Revocar A4 / A3 bloquea la sincronización (el último evento manda) ----------
reset role; select tests.consent('ana', 'cloud_transfer', false); select tests.login('ana');
select tests.throws($$select grasa.sync_push('[]', '[]')$$, 'consent_required', 'A4 retirada: sync_push bloqueado');
select tests.throws($$select grasa.sync_pull(null)$$, 'consent_required', 'A4 retirada: sync_pull bloqueado');
reset role; select tests.consent('ana', 'cloud_transfer'); select tests.login('ana');
select tests.ok(grasa.sync_pull(null) ? 'cursor', 'A4 aceptada otra vez: sync_pull vuelve a funcionar');
reset role; select tests.consent('ana', 'sensitive_health', false); select tests.login('ana');
select tests.throws($$select grasa.sync_push('[]', '[]')$$, 'consent_required', 'A3 retirada: sync_push bloqueado');
-- Sus datos locales/servidor siguen ahí: solo se corta el acceso por la API de sincronización
reset role;
select tests.ok(exists (select 1 from grasa.records where user_id = tests.uid('ana')), 'retirar A3 no borra lo ya guardado (se borra al borrar la cuenta)');

-- ---------- Seguridad de los ayudantes ----------
select tests.ok(not has_function_privilege('authenticated', 'core.consent_is_granted(uuid, text, text)', 'execute')
                and not has_function_privilege('anon', 'core.consent_is_granted(uuid, text, text)', 'execute')
                and not has_function_privilege('authenticated', 'grasa.coach_has_agreement(uuid)', 'execute')
                and not has_function_privilege('authenticated', 'grasa.require_coach_agreement()', 'execute'),
  'authenticated y anon NO ejecutan los ayudantes internos (no se sondean consentimientos ajenos)');
select tests.ok(has_function_privilege('authenticated', 'core.require_cloud_consent(text)', 'execute')
                and not has_function_privilege('anon', 'core.require_cloud_consent(text)', 'execute'),
  'solo authenticated ejecuta require_cloud_consent (informa del propio estado)');
select tests.ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('core', 'grasa') and p.proname in ('consent_is_granted', 'require_cloud_consent', 'coach_has_agreement', 'require_coach_agreement')
    and (not p.prosecdef or not coalesce(p.proconfig @> array['search_path=""'], false))),
  'los ayudantes son SECURITY DEFINER con search_path fijo');
set local role anon;
select tests.throws($$select grasa.sync_push('[]', '[]')$$, 'permission denied', 'anon no ejecuta sync_push');
reset role;

rollback;
