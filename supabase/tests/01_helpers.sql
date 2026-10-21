-- SOLO PRUEBAS LOCALES: ayudas para escribir la matriz RLS en SQL.
--   select tests.login('ana');   → actúa como ese usuario (rol authenticated + JWT sub). `reset role` vuelve a superusuario.
--   select tests.ok(cond, 'mensaje')            → NOTICE "ok - mensaje" o excepción "FALLO - mensaje".
--   select tests.throws($$sql$$, 'patrón', 'm') → la sentencia debe fallar con un error que contenga el patrón.
create schema tests;
grant usage on schema tests to authenticated, anon, service_role;

-- Usuarios de la matriz del contrato (§2.5): cliente A (con coach X), cliente B (sin coach), coach X, coach Y, admin.
create table tests.users (name text primary key, id uuid not null);
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-00000000000a', 'ana@test.co',   '{"display_name":"Ana"}'),
  ('00000000-0000-4000-8000-00000000000b', 'bea@test.co',   '{"display_name":"Bea"}'),
  ('00000000-0000-4000-8000-0000000000c1', 'xavi@test.co',  '{"display_name":"Coach X"}'),
  ('00000000-0000-4000-8000-0000000000c2', 'yoli@test.co',  '{"display_name":"Coach Y"}'),
  ('00000000-0000-4000-8000-0000000000ad', 'admin@test.co', '{}');
insert into tests.users values
  ('ana', '00000000-0000-4000-8000-00000000000a'), ('bea', '00000000-0000-4000-8000-00000000000b'),
  ('x', '00000000-0000-4000-8000-0000000000c1'), ('y', '00000000-0000-4000-8000-0000000000c2'),
  ('admin', '00000000-0000-4000-8000-0000000000ad');
grant select on tests.users to authenticated, anon, service_role;

create function tests.uid(p_name text) returns uuid language sql stable as $$
  select id from tests.users where name = p_name
$$;

-- Ajustes locales a la transacción (cada archivo de pruebas corre en su propia transacción).
create function tests.login(p_name text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(tests.uid(p_name)::text, ''), true);
  perform set_config('role', case when p_name = 'anon' then 'anon' else 'authenticated' end, true);
end $$;

create function tests.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then raise exception 'FALLO - %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end $$;

create function tests.throws(p_sql text, p_pattern text, p_msg text) returns void language plpgsql as $$
declare detail text; err text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics detail = pg_exception_detail;
    err := sqlerrm || coalesce(' / ' || nullif(detail, ''), '');   -- el patrón puede estar en el mensaje o en DETAIL
    if err ilike '%' || p_pattern || '%' then raise notice 'ok - %', p_msg; return; end if;
    raise exception 'FALLO - % (error inesperado: %)', p_msg, err;
  end;
  raise exception 'FALLO - % (no dio error)', p_msg;
end $$;

-- Hash de ejemplo para consent_events (SHA-256 de un texto).
create function tests.h(p_text text) returns text language sql immutable as $$
  select encode(sha256(convert_to(p_text, 'UTF8')), 'hex')
$$;

grant execute on all functions in schema tests to authenticated, anon, service_role;
