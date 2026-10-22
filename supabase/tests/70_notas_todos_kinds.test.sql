-- QA en vivo S3, hallazgo H6: `coach_pull` debe quitar `note` en TODOS los kinds compartibles (profile, entry,
-- food, habit) mientras el cliente no consienta `notes`; con `notes` la nota llega. `library` nunca llega.
-- Falla sin la migración 20261021150000 (antes solo se quitaba en kind = 'entry').
begin;
select tests.agree('x'); select tests.cloud('ana');   -- Sprint 7

select tests.login('x');
select set_config('t.code_x', (select invite_code from grasa.become_coach('Coach X Notas')), true);
reset role; select tests.login('ana');
select grasa.join_coach(current_setting('t.code_x'),
  jsonb_build_object('body', true, 'notes', false, 'nutrition', true, 'habits', true, 'photos', false,
                     'version', '0.1', 'text_hash', tests.h('compartir')));
select grasa.sync_push(jsonb_build_array(
  jsonb_build_object('id', '71000000-0000-4000-8000-000000000001', 'kind', 'profile', 'nkey', 'profile',
                     'data', jsonb_build_object('sex', 'female', 'note', 'nota perfil'), 'updated_at', '2026-10-20T10:00:00Z'),
  jsonb_build_object('id', '71000000-0000-4000-8000-000000000002', 'kind', 'entry', 'nkey', '2026-10-20', 'date', '2026-10-20',
                     'data', jsonb_build_object('weight', 80, 'note', 'nota entry'), 'updated_at', '2026-10-20T10:00:00Z'),
  jsonb_build_object('id', '71000000-0000-4000-8000-000000000003', 'kind', 'food', 'nkey', '71000000-0000-4000-8000-000000000003',
                     'date', '2026-10-20', 'data', jsonb_build_object('name', 'Arepa', 'kcal', 300, 'note', 'nota food'),
                     'updated_at', '2026-10-20T10:00:00Z'),
  jsonb_build_object('id', '71000000-0000-4000-8000-000000000004', 'kind', 'habit', 'nkey', '2026-10-20', 'date', '2026-10-20',
                     'data', jsonb_build_object('steps', 9000, 'note', 'nota habit'), 'updated_at', '2026-10-20T10:00:00Z'),
  jsonb_build_object('id', '71000000-0000-4000-8000-000000000005', 'kind', 'library', 'nkey', 'arepa',
                     'data', jsonb_build_object('name', 'Arepa', 'note', 'nota library'), 'updated_at', '2026-10-20T10:00:00Z')),
  '[]'::jsonb);

-- ---------- Sin share_notes: ningún kind trae note ----------
reset role; select tests.login('x');
select set_config('t.pull', grasa.coach_pull(tests.uid('ana'), null)::text, true);
select tests.ok((select count(*) from jsonb_array_elements(current_setting('t.pull')::jsonb -> 'records')) = 4,
  'H6: X recibe profile, entry, food y habit (nunca library)');
select tests.ok(not exists (select 1 from jsonb_array_elements(current_setting('t.pull')::jsonb -> 'records') e
                            where e ->> 'kind' = 'library'), 'H6: library nunca llega al coach');
select tests.ok((select not (e -> 'data' ? 'note') from jsonb_array_elements(current_setting('t.pull')::jsonb -> 'records') e
                 where e ->> 'kind' = 'profile'), 'H6: profile llega SIN note con share_notes = false');
select tests.ok((select not (e -> 'data' ? 'note') from jsonb_array_elements(current_setting('t.pull')::jsonb -> 'records') e
                 where e ->> 'kind' = 'entry'), 'H6: entry llega SIN note con share_notes = false');
select tests.ok((select not (e -> 'data' ? 'note') and e -> 'data' ->> 'name' = 'Arepa'
                 from jsonb_array_elements(current_setting('t.pull')::jsonb -> 'records') e
                 where e ->> 'kind' = 'food'), 'H6: food llega SIN note (y con el resto de datos) con share_notes = false');
select tests.ok((select not (e -> 'data' ? 'note') and (e -> 'data' ->> 'steps')::int = 9000
                 from jsonb_array_elements(current_setting('t.pull')::jsonb -> 'records') e
                 where e ->> 'kind' = 'habit'), 'H6: habit llega SIN note (y con el resto de datos) con share_notes = false');
select tests.ok(not exists (select 1 from jsonb_array_elements(current_setting('t.pull')::jsonb -> 'records') e
                            where e -> 'data' ? 'note'), 'H6: ningún registro del pull trae note');

-- ---------- Con share_notes: la nota llega en todos los kinds compartidos ----------
reset role; select tests.login('ana');
select grasa.update_shares(jsonb_build_object('body', true, 'notes', true, 'nutrition', true, 'habits', true, 'photos', false,
                                              'version', '0.1', 'text_hash', tests.h('compartir')));
reset role; select tests.login('x');
select set_config('t.pull', grasa.coach_pull(tests.uid('ana'), null)::text, true);
select tests.ok((select count(*) from jsonb_array_elements(current_setting('t.pull')::jsonb -> 'records') e
                 where e -> 'data' ? 'note') = 4, 'H6: con share_notes la nota llega en profile, entry, food y habit');
select tests.ok(not exists (select 1 from jsonb_array_elements(current_setting('t.pull')::jsonb -> 'records') e
                            where e ->> 'kind' = 'library'), 'H6: con share_notes library sigue sin llegar');

-- El dueño conserva sus notas intactas en el servidor.
reset role; select tests.login('ana');
select tests.ok((select count(*) from grasa.records where data ? 'note') = 5, 'H6: las notas del dueño no se tocan');
rollback;
