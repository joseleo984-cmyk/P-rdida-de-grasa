-- Sprint 11 (r1 v1.6): cobros manuales y bloqueo por pago.
--   · El coach del vínculo marca «pagado hasta» (set_client_payment); otro coach y el propio cliente NO pueden.
--   · Vencido (sin fecha o pasada, hora de Bogotá): sync_push y la subida de fotos fallan con 42501 'payment_required';
--     sync_pull, update_shares, leave_coach, borrar fotos y borrar la cuenta siguen permitidos.
--   · Sin vínculo activo nunca se bloquea. El día límite (pagado hasta = hoy) sigue al día.
begin;
select tests.cloud('ana'); select tests.cloud('bea'); select tests.agree('x'); select tests.agree('y');

-- Coaches X e Y; Ana con X, Bea sin coach
select tests.login('x');
select core.join_app('grasa');
select set_config('t.code_x', (select invite_code from grasa.become_coach('Coach X Fit')), true);
reset role; select tests.login('y');
select core.join_app('grasa');
select grasa.become_coach('Coach Y Fit');
reset role; select tests.login('ana');
select core.join_app('grasa');
select grasa.join_coach(current_setting('t.code_x'), jsonb_build_object('body', true, 'version', '0.1', 'text_hash', tests.h('compartir')));

-- ---------- Recién vinculada: sin fecha = vencida ----------
select tests.ok((select paid_until is null and paid = false and days_left is null from grasa.my_link()), 'vínculo nuevo: sin fecha de pago, my_link dice paid = false');
select tests.throws($$select grasa.sync_push('[]', '[]')$$, 'payment_required', 'cliente vinculado SIN fecha de pago: sync_push falla con payment_required');
do $$ declare c text; m text; d text; begin
  begin perform grasa.sync_push('[]', '[]'); exception when others then c := sqlstate; m := sqlerrm; get stacked diagnostics d = pg_exception_detail; end;
  perform tests.ok(c = '42501' and m = 'payment_required' and d = 'payment_required', 'el error es SQLSTATE 42501, mensaje y detail payment_required');
end $$;
select tests.ok(grasa.sync_pull(null) ? 'cursor', 'vencida: sync_pull SIGUE permitido (puede ver y descargar sus datos)');
select tests.ok(grasa.payment_blocked_me(), 'payment_blocked_me() es true para ella');

-- ---------- El cliente NO puede cambiar su estado de pago ----------
select tests.throws(format($$update grasa.coach_links set paid_until = current_date + 30 where client_id = %L$$, tests.uid('ana')), 'permission denied', 'el cliente no puede hacer UPDATE directo de paid_until');
select tests.throws(format($$select grasa.set_client_payment(%L, current_date + 30)$$, tests.uid('ana')), 'forbidden', 'el cliente no puede llamar a set_client_payment sobre sí mismo');
select tests.throws($$insert into grasa.coach_links (coach_id, client_id, paid_until) values (gen_random_uuid(), gen_random_uuid(), current_date)$$, 'permission denied', 'el cliente no puede insertar vínculos');

-- ---------- Otro coach y quien no es coach NO pueden marcarlo ----------
reset role; select tests.login('y');
select tests.throws(format($$select grasa.set_client_payment(%L, grasa.today_bogota() + 30)$$, tests.uid('ana')), 'permission denied', 'today_bogota es interna (Y no la ejecuta)');
select tests.throws(format($$select grasa.set_client_payment(%L, (now() at time zone 'America/Bogota')::date + 30)$$, tests.uid('ana')), 'forbidden', 'otro coach (Y) NO puede marcar el pago de la cliente de X');
reset role; select tests.login('bea');
select tests.throws(format($$select grasa.set_client_payment(%L, (now() at time zone 'America/Bogota')::date + 30)$$, tests.uid('ana')), 'forbidden', 'una persona que no es coach no puede marcar pagos (ni siquiera con el acuerdo ausente)');
reset role; select tests.ok((select paid_until is null from grasa.coach_links where client_id = tests.uid('ana')), 'tras los intentos ajenos el vínculo sigue sin fecha');

-- ---------- El coach de ese vínculo SÍ ----------
select tests.login('x');
select tests.ok((select (grasa.set_client_payment(tests.uid('ana'), (now() at time zone 'America/Bogota')::date + 30)) ->> 'days_left')::int = 30, 'el coach X marca «pagó hasta hoy + 30»: days_left = 30');
select tests.ok((select paid and days_left = 30 and paid_until = (now() at time zone 'America/Bogota')::date + 30 and paid_marked_at is not null
                 from grasa.coach_clients() where client_id = tests.uid('ana')), 'coach_clients devuelve paid_until, paid, days_left y paid_marked_at');
reset role; select tests.login('ana');
select tests.ok((select paid and days_left = 30 and paid_until is not null from grasa.my_link()), 'my_link (la cliente) ve el mismo estado');
select tests.ok(not grasa.payment_blocked_me(), 'al día: ya no está bloqueada');
select tests.ok(grasa.sync_push(jsonb_build_array(jsonb_build_object('id', '11000000-0000-4000-8000-000000000001', 'kind', 'entry', 'nkey', '2026-10-20',
  'date', '2026-10-20', 'data', '{"neck":34.5,"waist":84}'::jsonb, 'updated_at', '2026-10-20T10:00:00Z')), '[]') ? 'server_now', 'al día: sync_push funciona (también medidas nuevas)');

-- ---------- Rangos de fecha, null y coach sin acuerdo ----------
reset role; select tests.login('x');
select tests.throws(format($$select grasa.set_client_payment(%L, (now() at time zone 'America/Bogota')::date + 1000)$$, tests.uid('ana')), 'invalid', 'fecha a más de 400 días: invalid');
select tests.throws(format($$select grasa.set_client_payment(%L, date '2000-01-01')$$, tests.uid('ana')), 'invalid', 'fecha muy antigua: invalid');
select tests.ok((grasa.set_client_payment(tests.uid('ana'), null) ->> 'paid')::boolean = false, 'null deja sin pago registrado');
reset role; select tests.consent('x', 'coach_agreement', false); select tests.login('x');
select tests.throws(format($$select grasa.set_client_payment(%L, (now() at time zone 'America/Bogota')::date + 30)$$, tests.uid('ana')), 'coach_agreement_required', 'coach sin acuerdo vigente: no puede marcar pagos');
reset role; select tests.agree('x');

-- ---------- Día límite y vencimiento (hora de Bogotá) ----------
select tests.paid('ana', 0);
select tests.login('ana');
select tests.ok(not grasa.payment_blocked_me() and (select paid and days_left = 0 from grasa.my_link()), 'día límite: pagado hasta HOY sigue al día (days_left = 0)');
select tests.ok(grasa.sync_push('[]', '[]') ? 'server_now', 'día límite: sync_push funciona');
reset role; select tests.paid('ana', -1); select tests.login('ana');
select tests.ok(grasa.payment_blocked_me() and (select not paid and days_left = -1 from grasa.my_link()), 'pagado hasta AYER: vencida (days_left = -1)');
select tests.throws($$select grasa.sync_push('[]', '[]')$$, 'payment_required', 'vencida desde ayer: sync_push falla');
select tests.throws($$select grasa.sync_push(jsonb_build_array(jsonb_build_object('id', '11000000-0000-4000-8000-000000000002', 'kind', 'entry', 'nkey', '2026-10-21',
  'date', '2026-10-21', 'data', '{"neck":35}'::jsonb, 'updated_at', '2026-10-21T10:00:00Z')), '[]')$$, 'payment_required', 'vencida: no se guarda ni una medida nueva');
select tests.ok(not exists (select 1 from grasa.records where nkey = '2026-10-21'), '... y no quedó nada escrito');
select tests.ok(grasa.sync_pull(null) ? 'records', 'vencida: sync_pull sigue funcionando');
-- Hora de Bogotá, no UTC: a las 23:30 en Bogotá (04:30 UTC del día siguiente) «hoy» sigue siendo el día de Bogotá.
select tests.ok(((timestamptz '2026-10-24 04:30:00+00') at time zone 'America/Bogota')::date = date '2026-10-23', 'a las 04:30 UTC todavía es el día anterior en Bogotá (UTC-5)');

-- ---------- Lo que siempre se permite con el acceso en pausa ----------
select tests.ok((select (grasa.update_shares(jsonb_build_object('body', true, 'notes', false, 'nutrition', false, 'habits', true, 'photos', false,
  'version', '0.1', 'text_hash', tests.h('c')))).share_habits), 'vencida: puede cambiar lo que comparte (update_shares)');
-- Fotos (Storage): subir se bloquea; leer y borrar no
select tests.throws(format($$insert into storage.objects (bucket_id, name) values ('grasa-photos', '%s/20000000-0000-4000-8000-0000000000b1.jpg')$$, tests.uid('ana')),
  'row-level security', 'vencida: subir una foto a Storage se rechaza');
reset role; select tests.paid('ana', 5); select tests.login('ana');
insert into storage.objects (bucket_id, name) values ('grasa-photos', tests.uid('ana') || '/20000000-0000-4000-8000-0000000000b1.jpg');
select tests.ok((select count(*) from storage.objects where name like tests.uid('ana') || '/%') = 1, 'al día: sube la foto');
reset role; select tests.paid('ana', -3); select tests.login('ana');
select tests.ok((select count(*) from storage.objects where name like tests.uid('ana') || '/%') = 1, 'vencida: sigue pudiendo VER su foto');
select tests.throws(format($$update storage.objects set name = '%s/20000000-0000-4000-8000-0000000000b2.jpg' where name like '%s/%%'$$, tests.uid('ana'), tests.uid('ana')),
  'row-level security', 'vencida: reemplazar el archivo (UPDATE) también se rechaza');
delete from storage.objects where name like tests.uid('ana') || '/%';
select tests.ok((select count(*) from storage.objects where name like tests.uid('ana') || '/%') = 0, 'vencida: puede BORRAR sus fotos');

-- ---------- Sin vínculo activo no se bloquea ----------
reset role; select tests.login('bea');
select tests.ok(not grasa.payment_blocked_me() and not exists (select 1 from grasa.my_link()), 'Bea (sin coach) no está bloqueada y my_link no devuelve nada');
select tests.ok(grasa.sync_push('[]', '[]') ? 'server_now', 'sin vínculo: sync_push funciona siempre');
-- Ana deja a su coach: ya no se bloquea (el vínculo termina; el coach deja de ver sus datos)
reset role; select tests.login('ana');
select grasa.leave_coach();
select tests.ok(not grasa.payment_blocked_me(), 'tras dejar al coach (vínculo terminado) no está bloqueada');
select tests.ok(grasa.sync_push('[]', '[]') ? 'server_now', '... y sincroniza');
-- Volver a vincularse: el vínculo nuevo nace sin fecha (vencido hasta que el coach marque)
select grasa.join_coach(current_setting('t.code_x'), jsonb_build_object('body', true, 'version', '0.1', 'text_hash', tests.h('compartir')));
select tests.ok(grasa.payment_blocked_me(), 'un vínculo nuevo nace vencido hasta que el coach marque el pago');

-- ---------- Borrar la cuenta SIEMPRE se puede ----------
select core.delete_my_account();
reset role;
select tests.ok(not exists (select 1 from auth.users where id = tests.uid('ana')), 'vencida: puede borrar su cuenta (derecho del titular)');

-- ---------- Seguridad de las funciones ----------
select tests.ok(not has_function_privilege('authenticated', 'grasa.client_payment_blocked(uuid)', 'execute')
                and not has_function_privilege('authenticated', 'grasa.today_bogota()', 'execute')
                and not has_function_privilege('anon', 'grasa.set_client_payment(uuid, date)', 'execute')
                and not has_function_privilege('anon', 'grasa.require_payment()', 'execute')
                and not has_function_privilege('anon', 'grasa.payment_blocked_me()', 'execute')
                and has_function_privilege('authenticated', 'grasa.set_client_payment(uuid, date)', 'execute'),
  'client_payment_blocked(uuid) y today_bogota son internas; anon no ejecuta nada; authenticated solo lo suyo');
select tests.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'grasa' and p.proname in ('client_payment_blocked', 'payment_blocked_me', 'require_payment', 'set_client_payment')
    and (not p.prosecdef or not coalesce(p.proconfig @> array['search_path=""'], false))), 'las funciones de pago son SECURITY DEFINER con search_path fijo');
select tests.ok(not has_column_privilege('authenticated', 'grasa.coach_links', 'paid_until', 'update')
                and has_column_privilege('authenticated', 'grasa.coach_links', 'paid_until', 'select'), 'authenticated solo puede LEER paid_until (RLS: coach y cliente del vínculo)');
rollback;
