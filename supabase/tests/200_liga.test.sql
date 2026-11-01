-- R1 v1.16: liga semanal de constancia (concepto jurídico 7): opt-in reforzado, alias de catálogo cerrado, mínimo 5, solo alias y puntos, salir al instante.
begin;
create function tests.wk() returns date language sql stable security definer set search_path = '' as $$ select grasa.week_monday(grasa.today_bogota()) $$;
create function tests.seed_pts(p_name text, p_day date, p_src text, p_points int) returns void language sql security definer set search_path = '' as $$
  insert into grasa.points_log (user_id, day, source, points) values (tests.uid(p_name), p_day, p_src, p_points)
$$;
create function tests.catalog() returns text[] language sql stable security definer set search_path = '' as $$ select grasa.liga_aliases() $$;
create function tests.agree_v(p_name text, p_version text, p_granted boolean default true) returns void
language sql security definer set search_path = '' as $$
  insert into core.consent_events (user_id, app_id, kind, granted, version, text_hash, client_at)
  values (tests.uid(p_name), 'grasa', 'coach_agreement', p_granted, p_version, tests.h(p_version), now())
$$;
-- Más asesorados para la meta colectiva (mínimo 5).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000e1', 'c1@test.co', '{"display_name":"Ce Uno"}'),
  ('00000000-0000-4000-8000-0000000000e2', 'c2@test.co', '{"display_name":"Ce Dos"}'),
  ('00000000-0000-4000-8000-0000000000e3', 'c3@test.co', '{"display_name":"Ce Tres"}'),
  ('00000000-0000-4000-8000-0000000000e4', 'c4@test.co', '{"display_name":"Ce Cuatro"}'),
  ('00000000-0000-4000-8000-0000000000e5', 'c5@test.co', '{"display_name":"Ce Cinco"}');
insert into tests.users values ('c1', '00000000-0000-4000-8000-0000000000e1'), ('c2', '00000000-0000-4000-8000-0000000000e2'),
  ('c3', '00000000-0000-4000-8000-0000000000e3'), ('c4', '00000000-0000-4000-8000-0000000000e4'), ('c5', '00000000-0000-4000-8000-0000000000e5');
grant execute on all functions in schema tests to authenticated, anon;

select tests.agree('x'); select tests.agree('y'); select tests.consent('admin', 'coach_agreement');
insert into core.app_access (user_id, app_id, role, active) values (tests.uid('admin'), 'grasa', 'admin', true) on conflict (user_id, app_id, role) do update set active = true;
select tests.login('x'); select core.join_app('grasa');
select set_config('t.code_x', (select invite_code from grasa.become_coach('Coach X Fit')), true);
reset role; select tests.login('y'); select core.join_app('grasa');
select set_config('t.code_y', (select invite_code from grasa.become_coach('Coach Y Fit')), true);
reset role;
-- Todos con A3 + A4, vinculados a X compartiendo hábitos y comidas (c5 todavía no se vincula), y al día con el pago.
select tests.cloud(n) from unnest(array['ana', 'bea', 'c1', 'c2', 'c3', 'c4', 'c5']) n;
do $$ declare n text; begin
  foreach n in array array['ana', 'bea', 'c1', 'c2', 'c3', 'c4'] loop
    perform tests.login(n); perform core.join_app('grasa');
    perform grasa.join_coach(current_setting('t.code_x'), jsonb_build_object('body', true, 'nutrition', true, 'habits', true, 'notes', false, 'version', '0.1', 'text_hash', tests.h('c')));
    reset role;
    perform tests.paid(n, 30);
  end loop;
end $$;


-- ================= Sin la cláusula de ligas en el acuerdo del coach, la liga no existe =================
select tests.login('ana');
select tests.ok((grasa.my_liga() ->> 'enabled')::boolean = false and (grasa.my_liga() ->> 'opted_in')::boolean = false, 'sin cláusula en el acuerdo: liga no habilitada y apagada por defecto');
select tests.throws($$select grasa.liga_join()$$, 'liga_not_enabled', 'unirse sin que el coach acepte la cláusula de ligas: no');
reset role; select tests.agree_v('x', '0.7-A7-coach'); select tests.login('ana');
select tests.ok((grasa.my_liga() ->> 'enabled')::boolean and not (grasa.my_liga() ->> 'opted_in')::boolean, 'con la cláusula: habilitada pero apagada (la persona decide)');
select tests.throws($$select grasa.liga_join()$$, 'consent_required', 'sin «mayor de edad» no se puede entrar (menores fuera)');
reset role; select tests.consent('ana', 'adult'); select tests.login('ana');
select tests.throws($$select grasa.liga_join()$$, 'liga_consent_required', 'sin la casilla de la liga (consentimiento) no se une');
reset role; select tests.consent('ana', 'liga'); select tests.login('ana');
select tests.ok((grasa.liga_join() ->> 'opted_in')::boolean, 'con la casilla: se une');
select tests.ok((grasa.my_liga() ->> 'alias') = any (tests.catalog()), 'el alias sale del catálogo cerrado');
select tests.ok((grasa.my_liga() ->> 'published')::boolean = false and (grasa.my_liga() -> 'table') = 'null'::jsonb, 'con 1 participante no hay tabla');
reset role;

select tests.ok(grasa.export_agreement_of(tests.uid('x')) = '0.7-A7-coach', 'la 0.6 del acuerdo sigue valiendo para exportar (trae la cláusula 14)');

-- ================= Mínimo 5: con 4 o menos no se publica nada =================
do $$ declare n text; begin
  foreach n in array array['bea', 'c1', 'c2'] loop
    perform tests.agree_v('x', '0.7-A7-coach') where false;
    insert into core.consent_events (user_id, app_id, kind, granted, version, text_hash, client_at)
      select tests.uid(n), 'grasa', k, true, 't', tests.h(k), now() from unnest(array['adult', 'liga']) k;
    perform tests.login(n); perform grasa.liga_join(); reset role;
  end loop;
end $$;
select tests.login('bea');
select tests.ok(not (grasa.my_liga() ->> 'published')::boolean and (grasa.my_liga() -> 'table') = 'null'::jsonb and (grasa.my_liga() ->> 'participants')::int = 5 - 1, 'con 4 participantes: sin tabla ni puntajes, ni para los que participan');
reset role;
insert into core.consent_events (user_id, app_id, kind, granted, version, text_hash, client_at)
  select tests.uid('c3'), 'grasa', k, true, 't', tests.h(k), now() from unnest(array['adult', 'liga']) k;
select tests.login('c3'); select grasa.liga_join(); reset role;
select tests.seed_pts('ana', tests.wk(), 'registro', 10); select tests.seed_pts('bea', tests.wk(), 'registro', 12); select tests.seed_pts('bea', tests.wk(), 'agua', 3);
select tests.seed_pts('c1', tests.wk(), 'registro', 4);

-- ================= Con 5: tabla con alias y puntos, nada más =================
select tests.login('ana');
select tests.ok((grasa.my_liga() ->> 'published')::boolean and jsonb_array_length(grasa.my_liga() -> 'table') = 5, 'con 5 participantes se publica la tabla');
select tests.ok((select bool_and(r ?& array['alias', 'points', 'me'] and (select count(*) from jsonb_object_keys(r)) = 3) from jsonb_array_elements(grasa.my_liga() -> 'table') r),
  'cada fila trae solo alias, puntos y «yo»: ni nombre, ni id, ni peso, medidas, comidas o fotos');
select tests.ok((select count(distinct r ->> 'alias') = 5 and bool_and((r ->> 'alias') = any (tests.catalog())) from jsonb_array_elements(grasa.my_liga() -> 'table') r), 'alias únicos y del catálogo');
select tests.ok((select count(*) = 1 from jsonb_array_elements(grasa.my_liga() -> 'table') r where (r ->> 'me')::boolean), 'solo una fila es la mía');
select tests.ok((grasa.my_liga() -> 'table' -> 0 ->> 'points')::int = 15 and (grasa.my_liga() -> 'table' -> 1 ->> 'points')::int = 10, 'ordenada por puntos de constancia (15, 10, …)');
select tests.ok(not (grasa.my_liga()::text ~* 'ana|email|weight|kg'), 'la respuesta no trae nombres ni cifras corporales');
reset role;

-- ================= Quien no participa no ve la tabla; el coach no ve quién es quién =================
select tests.login('c5'); select core.join_app('grasa'); reset role;
select tests.login('x');
select tests.ok((grasa.coach_liga() ->> 'enabled')::boolean and (grasa.coach_liga() ->> 'published')::boolean and (grasa.coach_liga() ->> 'participants')::int = 5, 'el coach ve que está habilitada y cuántos participan (con 5 o más)');
select tests.ok(not (grasa.coach_liga()::text ~* 'alias|ana|bea'), 'el coach NO ve alias ni personas');
reset role; select tests.login('y');
select tests.ok(not (grasa.coach_liga() ->> 'enabled')::boolean, 'otro coach sin la cláusula: no habilitada');
reset role; select tests.login('ana');
select tests.throws($$select grasa.coach_liga()$$, 'forbidden', 'un asesorado no usa la función del coach');
reset role; select tests.login('anon');
select tests.throws($$select grasa.my_liga()$$, '', 'sin sesión no hay liga');
reset role;

-- ================= Salir, pausa y revocar: desaparecen al instante =================
select tests.login('c3'); select grasa.liga_leave();
select tests.ok((grasa.my_liga() ->> 'opted_in')::boolean = false and (grasa.my_liga() ->> 'alias') is null, 'salir apaga el interruptor y borra el alias');
reset role;
select tests.ok((select liga_alias is null and not liga_opt_in from grasa.coach_links where client_id = tests.uid('c3') and status = 'active'), 'el alias se borra de la base');
select tests.login('ana');
select tests.ok(not (grasa.my_liga() ->> 'published')::boolean and (grasa.my_liga() ->> 'participants')::int = 4, 'al salir uno, quedan 4: la tabla deja de publicarse');
reset role;
select tests.login('c3'); select grasa.liga_join(); reset role;
select tests.paid('c2', -5);
select tests.login('ana');
select tests.ok((grasa.my_liga() ->> 'participants')::int = 4 and not (grasa.my_liga() ->> 'published')::boolean, 'quien queda en pausa por pago deja de contar y de verse');
reset role; select tests.paid('c2', 30);
select tests.consent('bea', 'liga', false);
select tests.login('ana');
select tests.ok((grasa.my_liga() ->> 'participants')::int = 4, 'revocar el consentimiento de la liga lo saca de la tabla aunque el interruptor siguiera encendido');
reset role;
select tests.login('c4'); select tests.ok((grasa.liga_leave() ->> 'alias') is null, 'salir es idempotente y siempre permitido');
reset role;
rollback;
