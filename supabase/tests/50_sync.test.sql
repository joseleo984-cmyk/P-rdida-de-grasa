-- sync_push / sync_pull (contrato §2.3 y §2.5.3): LWW, empate determinista, marca futura recortada, clave natural
-- conserva el id del servidor, lápidas, cursor con solape y paginación.
begin;
select tests.cloud('ana'); select tests.cloud('bea');   -- Sprint 7: sync exige A3 + A4
select tests.login('ana');

-- 1. Alta y LWW por registro
select grasa.sync_push(jsonb_build_array(jsonb_build_object('id', '40000000-0000-4000-8000-000000000001', 'kind', 'entry',
  'nkey', '2026-10-20', 'date', '2026-10-20', 'data', '{"weight":80}'::jsonb, 'updated_at', '2026-10-20T10:00:00Z')));
select tests.ok((select (data ->> 'weight')::int from grasa.records where nkey = '2026-10-20') = 80
                and (select server_updated_at is not null from grasa.records where nkey = '2026-10-20'), 'push inserta y fija server_updated_at');
select set_config('t.r', grasa.sync_push(jsonb_build_array(jsonb_build_object('id', '40000000-0000-4000-8000-000000000001',
  'kind', 'entry', 'nkey', '2026-10-20', 'date', '2026-10-20', 'data', '{"weight":79}'::jsonb, 'updated_at', '2026-10-20T09:00:00Z')))::text, true);
select tests.ok((select (data ->> 'weight')::int from grasa.records where nkey = '2026-10-20') = 80,
  'una versión más vieja NO pisa la del servidor');
select tests.ok(jsonb_array_length(current_setting('t.r')::jsonb -> 'rejected' -> 'records') = 1
                and (current_setting('t.r')::jsonb -> 'rejected' -> 'records' -> 0 -> 'data' ->> 'weight')::int = 80,
  'y se devuelve en rejected la fila del servidor que ganó');
select grasa.sync_push(jsonb_build_array(jsonb_build_object('id', '40000000-0000-4000-8000-000000000001', 'kind', 'entry',
  'nkey', '2026-10-20', 'date', '2026-10-20', 'data', '{"weight":78.5}'::jsonb, 'updated_at', '2026-10-20T11:00:00Z')));
select tests.ok((select (data ->> 'weight')::numeric from grasa.records where nkey = '2026-10-20') = 78.5, 'una versión más nueva gana');

-- 2. Empate: determinista (gana el JSON mayor, como newer() de schema.js), sin importar el orden de llegada
select grasa.sync_push(jsonb_build_array(jsonb_build_object('id', '40000000-0000-4000-8000-000000000001', 'kind', 'entry',
  'nkey', '2026-10-20', 'date', '2026-10-20', 'data', '{"weight":90}'::jsonb, 'updated_at', '2026-10-20T11:00:00Z')));
select grasa.sync_push(jsonb_build_array(jsonb_build_object('id', '40000000-0000-4000-8000-000000000001', 'kind', 'entry',
  'nkey', '2026-10-20', 'date', '2026-10-20', 'data', '{"weight":10}'::jsonb, 'updated_at', '2026-10-20T11:00:00Z')));
select tests.ok((select data ->> 'weight' from grasa.records where nkey = '2026-10-20') = '90',
  'empate de updated_at: gana el data mayor (90 > 78.5 > 10 como texto), igual en cualquier orden');

-- 3. Reloj adelantado: la marca se recorta a now() + 5 min
select grasa.sync_push(jsonb_build_array(jsonb_build_object('id', '40000000-0000-4000-8000-000000000002', 'kind', 'habit',
  'nkey', '2026-10-21', 'date', '2026-10-21', 'data', '{"steps":1}'::jsonb, 'updated_at', '2030-01-01T00:00:00Z')));
select tests.ok((select updated_at <= now() + interval '5 minutes' from grasa.records where kind = 'habit'),
  'updated_at en 2030 se recorta a now() + 5 min');

-- 4. Clave natural: dos pesajes del mismo día con ids distintos → una fila, con el id del servidor
select grasa.sync_push(jsonb_build_array(jsonb_build_object('id', '40000000-0000-4000-8000-0000000000ff', 'kind', 'entry',
  'nkey', '2026-10-20', 'date', '2026-10-20', 'data', '{"weight":95}'::jsonb, 'updated_at', '2026-10-20T12:00:00Z')));
select tests.ok((select count(*) from grasa.records where nkey = '2026-10-20') = 1
                and (select id from grasa.records where nkey = '2026-10-20') = '40000000-0000-4000-8000-000000000001'
                and (select data ->> 'weight' from grasa.records where nkey = '2026-10-20') = '95',
  'mismo día, otro id: gana el más nuevo pero se conserva el id del servidor');

-- 5. Lápidas
select grasa.sync_push(jsonb_build_array(jsonb_build_object('id', '40000000-0000-4000-8000-000000000001', 'kind', 'entry',
  'nkey', '2026-10-20', 'date', '2026-10-20', 'data', '{}'::jsonb, 'updated_at', '2026-10-20T13:00:00Z', 'deleted_at', '2026-10-20T13:00:00Z')));
select tests.ok((select deleted_at is not null and data = '{}' from grasa.records where nkey = '2026-10-20'), 'la lápida se sincroniza como una fila más');

-- 6. Validaciones
select tests.throws($$select grasa.sync_push(jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'kind', 'entry',
  'nkey', '2026-10-22', 'date', '2026-10-23', 'data', '{}'::jsonb, 'updated_at', now())))$$, 'check', 'entry: nkey debe ser su fecha');
select tests.throws($$select grasa.sync_push(jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'kind', 'otro',
  'nkey', 'x', 'data', '{}'::jsonb, 'updated_at', now())))$$, 'check', 'kind desconocido se rechaza');
select tests.throws($$select grasa.sync_push(jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'kind', 'library',
  'nkey', 'x', 'data', jsonb_build_object('big', repeat('x', 6000)), 'updated_at', now())))$$, 'check', 'data > 4 KB se rechaza');
select tests.throws($$select grasa.sync_push((select jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'kind', 'library',
  'nkey', 'k' || i, 'data', '{}'::jsonb, 'updated_at', now())) from generate_series(1, 501) i))$$, 'máximo 500', 'más de 500 elementos por llamada se rechaza');
select tests.throws(format($$select grasa.sync_push('[]', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'date', '2026-10-01',
  'pose', 'frente', 'storage_path', '%s/otra.jpg', 'created_at', now(), 'updated_at', now())))$$, tests.uid('bea')), 'check',
  'la ruta de la foto debe ser {mi_id}/{id_foto}.jpg');

-- 7. Fotos: LWW por id y cambio de shared_with_coach
select grasa.sync_push('[]', jsonb_build_array(jsonb_build_object('id', '50000000-0000-4000-8000-000000000001', 'date', '2026-10-01',
  'pose', 'frente', 'storage_path', tests.uid('ana') || '/50000000-0000-4000-8000-000000000001.jpg', 'shared_with_coach', false,
  'created_at', '2026-10-01T10:00:00Z', 'updated_at', '2026-10-01T10:00:00Z')));
select grasa.sync_push('[]', jsonb_build_array(jsonb_build_object('id', '50000000-0000-4000-8000-000000000001', 'date', '2026-10-01',
  'pose', 'frente', 'storage_path', tests.uid('ana') || '/50000000-0000-4000-8000-000000000001.jpg', 'shared_with_coach', true,
  'created_at', '2026-10-01T10:00:00Z', 'updated_at', '2026-10-02T10:00:00Z')));
select tests.ok((select shared_with_coach from grasa.photos), 'foto: la versión más nueva (compartida) gana');

-- 8. sync_pull: solo lo mío, cursor y solape de 30 s
reset role; select tests.login('bea');
select grasa.sync_push(jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'kind', 'profile', 'nkey', 'profile',
  'data', '{"sex":"female"}'::jsonb, 'updated_at', now())));
reset role; select tests.login('ana');
select set_config('t.p', grasa.sync_pull(null)::text, true);
select tests.ok(jsonb_array_length(current_setting('t.p')::jsonb -> 'records') = 2
                and jsonb_array_length(current_setting('t.p')::jsonb -> 'photos') = 1
                and not (current_setting('t.p')::jsonb -> 'records' -> 0 ? 'user_id'),
  'sync_pull devuelve solo mis registros y fotos (sin user_id)');
select tests.ok((current_setting('t.p')::jsonb ->> 'cursor')::timestamptz
                = greatest((select max(server_updated_at) from grasa.records where user_id = auth.uid()),
                           (select max(server_updated_at) from grasa.photos where user_id = auth.uid())),
  'cursor = mayor server_updated_at devuelto (entre registros, fotos y comentarios)');
select tests.ok(jsonb_array_length((grasa.sync_pull((current_setting('t.p')::jsonb ->> 'cursor')::timestamptz)) -> 'records') = 2,
  'ventana de solape: con el cursor devuelto se vuelven a recibir las filas de los últimos 30 s (fusión idempotente)');
reset role;
-- (el trigger fija server_updated_at en cada UPDATE: se desactiva solo para simular filas de hace una hora)
alter table grasa.records disable trigger records_stamp;
update grasa.records set server_updated_at = server_updated_at - interval '1 hour' where user_id = tests.uid('ana');
alter table grasa.records enable trigger records_stamp;
update grasa.records set server_updated_at = '2000-01-01T00:00:00Z' where user_id = tests.uid('bea');
select tests.ok((select server_updated_at > now() - interval '1 minute' from grasa.records where user_id = tests.uid('bea')),
  'un UPDATE no puede antedatar server_updated_at (lo fija el trigger con el reloj del servidor)');
select tests.login('ana');
select tests.ok(jsonb_array_length((grasa.sync_pull(now() - interval '10 minutes')) -> 'records') = 0,
  'fuera de la ventana no se repiten filas');
select set_config('t.p', grasa.sync_pull(null, 1)::text, true);
select tests.ok((current_setting('t.p')::jsonb ->> 'has_more')::boolean
                and jsonb_array_length(current_setting('t.p')::jsonb -> 'records') = 1, 'paginación: p_limit = 1 → has_more');

-- 9. Paginación con MÁS filas que p_limit dentro de la ventana de 30 s (S3-3): las páginas siguientes van sin solape
select grasa.sync_push((select jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'kind', 'habit',
  'nkey', to_char(date '2026-09-01' + i, 'YYYY-MM-DD'), 'date', date '2026-09-01' + i, 'data', '{}'::jsonb, 'updated_at', now()))
  from generate_series(1, 7) i));
do $$
declare res jsonb; cur timestamptz := null; seen text[] := '{}'; pages int := 0; first boolean := true;
begin
  loop
    res := grasa.sync_pull(cur, 3, first);
    first := false; pages := pages + 1;
    seen := seen || array(select e ->> 'nkey' from jsonb_array_elements(res -> 'records') e);
    exit when not (res ->> 'has_more')::boolean or pages > 20;
    cur := (res ->> 'cursor')::timestamptz;
  end loop;
  perform tests.ok(pages <= 6 and (select count(distinct x) from unnest(seen) x where x like '2026-09-%') = 7,
    format('paginación sin solape entre páginas: avanza (%s páginas) y trae las 7 filas nuevas', pages));
end $$;
select tests.ok((select (grasa.sync_pull(null, 3, true) -> 'records' -> 0 ->> 'nkey') =
                        (select (grasa.sync_pull(null, 3, true) -> 'records' -> 0 ->> 'nkey'))),
  'con solape (primera página) el resultado es estable');
rollback;
