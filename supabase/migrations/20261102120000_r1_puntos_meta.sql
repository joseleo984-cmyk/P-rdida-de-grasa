-- R1 v1.15 · Puntos de constancia personales, meta colectiva del team y ranking privado sin kilos (concepto jurídico 7, 26/10/2026).
-- Aditiva e idempotente: se aplica encima de v1.14. Contrato: equipo/r1-contrato.md §24. Pruebas: supabase/tests/190_puntos_meta.test.sql.
--   Q1  grasa.points_log: puntos de constancia por persona, día y fuente. Los CALCULA EL SERVIDOR (un disparador sobre grasa.records y otro
--       sobre grasa.challenge_marks) con las reglas de la propuesta de gamificación aprobada; el teléfono nunca envía puntos, así que no se
--       pueden inventar. Nadie lee ni escribe la tabla por la API (RLS sin políticas y sin permisos).
--       Reglas (las mismas que puntos.js, la referencia ejecutable del servidor falso):
--         · registrar el día 2 · agua cumplida 1 (≥ 8 vasos = 2 L) · pasos 1 (≥ 8.000) · sueño 1 (7 a 10 h) · comidas 1 (≥ 2 registradas)
--         · entreno 3, solo hasta los entrenos por semana del plan (la meta de días de entreno del coach; 5 si no hay)
--         · descanso planificado o «me siento mal» (hábito `rest` = 'plan' | 'sick', sin entreno ese día) 2, hasta los días de descanso del plan
--           (7 − entrenos del plan, mínimo 1 y máximo 3 por semana)
--         · medidas 3 por REGISTRAR, una vez por semana y con 6 días o más entre registros con puntos. Nunca por el valor.
--         · volver tras más de 7 días sin registrar 5 (una vez cada 30 días)
--         · bonos: semana constante 5 (el lunes, por la semana anterior; misma regla de comodines que constancia.js) y reto del coach cumplido
--           10 (máximo 2 por semana). Un día de reto cuenta para los puntos SOLO si ese día hay registro real (a tiempo) del hábito del reto.
--         · tope 12 al día (sin contar los bonos) y 80 a la semana (lunes a domingo, hora de Bogotá).
--         · solo cuentan registros de HOY y AYER (y mañana, por el desfase de zona horaria del teléfono): lo que llega más tarde se guarda pero
--           no da puntos, y los puntos de un día pasado quedan fijos. Los de hoy y ayer se recalculan desde lo registrado (editar no suma doble).
--         · valores raros (más de 60.000 pasos, más de 8 L de agua, más de 14 h de sueño, peso fuera de 30–300 kg o cintura fuera de 40–200 cm)
--           se guardan sin puntos.
--         · en pausa (por pago o en un día de una pausa cerrada) no se gana ni se pierde nada; lo pause_private nunca suma.
--         · NUNCA hay puntos por peso, centímetros, kcal ni fotos (las fotos ni siquiera se leen).
--   Q2  grasa.my_points(): la persona ve SUS puntos (semana, hoy, detalle de la semana, 8 semanas, mejor semana, total). Nadie más los pide así.
--   Q3  grasa.coach_points(p_from, p_to): el coach ve, para el ranking privado (M5), los puntos y los hábitos cumplidos de SUS asesorados con
--       vínculo activo. Puntos solo de quien le comparte hábitos Y comidas (los puntos salen de ellos); hábitos cumplidos solo de quien comparte
--       hábitos. Si no, null («no comparte»). El admin no tiene ninguna función de puntos.
--   Q4  Meta colectiva del team (concepto 7, punto 7): grasa.team_goals (una por coach y semana: «Entre todos: N entrenos» o «N puntos»).
--       grasa.team_goal_out devuelve SOLO el total y cuántas personas suman, y NADA si son menos de 5. Nunca ids ni aportes individuales.
--       Suman, por defecto, los vínculos activos que no están en pausa, con A3 + A4 vigentes, que comparten hábitos y comidas con el coach
--       (así el total nunca revela algo que el coach no ve) y que no se retiraron (coach_links.team_opt_out, «No sumar mis hábitos a la meta del
--       team»). Menores de 18: pueden participar (concepto 7, punto 11); su exclusión aplica solo a ligas, que no existen.
--   Q5  El ranking privado del coach deja de ordenar por «Progreso a la meta» (kilos o cintura): eso se cambió en la app (concepto 7, punto 10);
--       coach_analytics no cambia (sigue alimentando las gráficas y la tendencia por categorías, que se listan en orden alfabético).
-- Fuera de alcance (concepto 7): ligas, posición relativa, su opt-in, la cláusula 7.6 y la Etapa 3.

-- ============ Q1: puntos ============
create table if not exists grasa.points_log (
  user_id    uuid not null references auth.users(id) on delete cascade,
  day        date not null,
  source     text not null check (source ~ '^(registro|agua|pasos|sueno|entreno|descanso|comidas|medidas|volviste|semana|reto:[0-9a-f-]{36})$'),
  points     smallint not null check (points between 1 and 12),
  created_at timestamptz not null default now(),
  primary key (user_id, day, source)
);
alter table grasa.points_log enable row level security;
revoke all on grasa.points_log from public, anon, authenticated, service_role;

-- Retirarse de la meta colectiva (opt-out). Por defecto, suma.
alter table grasa.coach_links add column if not exists team_opt_out boolean not null default false;

-- Lunes de la semana de un día. INTERNA.
create or replace function grasa.week_monday(p_day date) returns date
language sql immutable set search_path = '' as $$ select p_day - (extract(isodow from p_day)::int - 1) $$;

-- ¿El hábito del día trae algo anotado? ¿Trae un valor raro? ¿La medida trae algún dato? ¿Es rara? INTERNAS (sin privilegios).
create or replace function grasa.pts_habit_has(d jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(grasa.num_of(d, 'water'), 0) > 0 or coalesce(grasa.num_of(d, 'steps'), 0) > 0 or coalesce(grasa.num_of(d, 'sleep'), 0) > 0
      or d -> 'trained' = 'true'::jsonb or coalesce(d ->> 'rest', '') in ('plan', 'sick');
$$;
create or replace function grasa.pts_habit_rare(d jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(grasa.num_of(d, 'steps'), 0) > 60000 or coalesce(grasa.num_of(d, 'water'), 0) > 8 or coalesce(grasa.num_of(d, 'sleep'), 0) > 14;
$$;
create or replace function grasa.pts_entry_has(d jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select exists (select 1 from unnest(array['weight', 'waist', 'abdomen', 'hip', 'neck', 'armR', 'armL', 'back', 'thighR', 'thighL', 'bodyFat']) k
                 where grasa.num_of(d, k) is not null);
$$;
create or replace function grasa.pts_entry_rare(d jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(grasa.num_of(d, 'weight') not between 30 and 300, false) or coalesce(grasa.num_of(d, 'waist') not between 40 and 200, false);
$$;

-- Entrenos por semana del plan: la meta de días de entreno que fijó el coach; 5 si no hay. INTERNA.
create or replace function grasa.points_plan(p_user uuid) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce((select l.goal_trained_days from grasa.coach_links l where l.client_id = p_user and l.status = 'active' limit 1), 5)::int;
$$;

-- Suma de puntos de una persona en un rango (nunca más de 80 por semana: ya se acota al escribir). INTERNA.
create or replace function grasa.points_sum(p_user uuid, p_from date, p_to date) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(p.points), 0)::int from grasa.points_log p where p.user_id = p_user and p.day between p_from and p_to;
$$;

-- ¿Ese día hay registro (a tiempo, no privado, no raro) del hábito de un reto? INTERNA.
create or replace function grasa.pts_habit_on(p_user uuid, p_day date, p_habit text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when p_habit = 'foods' then exists (select 1 from grasa.records r where r.user_id = p_user and r.kind = 'food' and r.date = p_day
                                                   and r.deleted_at is null and not r.pause_private)
         else exists (select 1 from grasa.records r where r.user_id = p_user and r.kind = 'habit' and r.date = p_day and r.deleted_at is null
                        and not r.pause_private and not grasa.pts_habit_rare(r.data)
                        and case p_habit when 'water' then coalesce(grasa.num_of(r.data, 'water'), 0) > 0
                                         when 'steps' then coalesce(grasa.num_of(r.data, 'steps'), 0) > 0
                                         when 'sleep' then coalesce(grasa.num_of(r.data, 'sleep'), 0) > 0
                                         when 'trained' then r.data -> 'trained' = 'true'::jsonb else false end) end;
$$;

-- Recalcula los puntos de UN día de una persona (y los bonos que dependan de él). INTERNA: la llaman los disparadores.
create or replace function grasa.points_refresh(p_user uuid, p_day date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  today date := grasa.today_bogota(); wk date; h jsonb; ent jsonb; nfood int; plan int; restcap int; pts jsonb := '{}'::jsonb;
  daily text[] := array['registro', 'entreno', 'descanso', 'agua', 'pasos', 'sueno', 'comidas', 'medidas', 'volviste'];
  src text; v int; room int; prev date; real_days int; frozen int; missing int; ch record; verified int;
begin
  if p_user is null or p_day is null or p_day < today - 1 or p_day > today + 1 then return; end if;   -- solo hoy y ayer (+ desfase)
  if grasa.client_payment_blocked(p_user) or grasa.day_in_pause(p_user, p_day) then return; end if;  -- en pausa: ni se gana ni se pierde
  wk := grasa.week_monday(p_day);
  plan := grasa.points_plan(p_user);
  restcap := least(3, greatest(1, 7 - plan));
  select r.data into h from grasa.records r where r.user_id = p_user and r.kind = 'habit' and r.date = p_day and r.deleted_at is null and not r.pause_private;
  if h is not null and (grasa.pts_habit_rare(h) or not grasa.pts_habit_has(h)) then h := null; end if;
  select count(*) into nfood from grasa.records r where r.user_id = p_user and r.kind = 'food' and r.date = p_day and r.deleted_at is null and not r.pause_private;
  select r.data into ent from grasa.records r where r.user_id = p_user and r.kind = 'entry' and r.date = p_day and r.deleted_at is null and not r.pause_private;
  if ent is not null and (grasa.pts_entry_rare(ent) or not grasa.pts_entry_has(ent)) then ent := null; end if;

  delete from grasa.points_log where user_id = p_user and day = p_day and source = any (daily);
  if h is not null or nfood > 0 or ent is not null then pts := pts || '{"registro": 2}'; end if;
  if h is not null then
    if coalesce(grasa.num_of(h, 'water'), 0) >= 2 then pts := pts || '{"agua": 1}'; end if;
    if coalesce(grasa.num_of(h, 'steps'), 0) >= 8000 then pts := pts || '{"pasos": 1}'; end if;
    if coalesce(grasa.num_of(h, 'sleep'), 0) between 7 and 10 then pts := pts || '{"sueno": 1}'; end if;
    if h -> 'trained' = 'true'::jsonb then
      if (select count(*) from grasa.points_log p where p.user_id = p_user and p.source = 'entreno' and p.day between wk and wk + 6) < plan then
        pts := pts || '{"entreno": 3}';
      end if;
    elsif h ->> 'rest' in ('plan', 'sick') then
      if (select count(*) from grasa.points_log p where p.user_id = p_user and p.source = 'descanso' and p.day between wk and wk + 6) < restcap then
        pts := pts || '{"descanso": 2}';
      end if;
    end if;
  end if;
  if nfood >= 2 then pts := pts || '{"comidas": 1}'; end if;
  if ent is not null and not exists (select 1 from grasa.points_log p where p.user_id = p_user and p.source = 'medidas'
                                     and (abs(p.day - p_day) < 6 or p.day between wk and wk + 6)) then
    pts := pts || '{"medidas": 3}';
  end if;
  if pts ? 'registro' then
    select max(r.date) into prev from grasa.records r where r.user_id = p_user and r.kind in ('entry', 'food', 'habit')
      and r.deleted_at is null and not r.pause_private and r.date < p_day;
    if prev is not null and prev < p_day - 7
       and not exists (select 1 from grasa.points_log p where p.user_id = p_user and p.source = 'volviste' and p.day > p_day - 30 and p.day < p_day) then
      pts := pts || '{"volviste": 5}';
    end if;
  end if;
  -- Topes: 12 al día (solo lo diario) y 80 a la semana (todo). Se recorta en orden: lo último de la lista es lo primero que se pierde.
  room := least(12, 80 - grasa.points_sum(p_user, wk, wk + 6));
  foreach src in array daily loop
    v := least(coalesce((pts ->> src)::int, 0), greatest(room, 0));
    if v > 0 then insert into grasa.points_log (user_id, day, source, points) values (p_user, p_day, src, v); room := room - v; end if;
  end loop;

  -- Bono «semana constante» (el lunes, por la semana anterior ya cerrada): ≥ 4 días con registro, o ≥ 2 con comodines (2 por semana) que
  -- cubren días pasados sin registro (los días de pausa no cuentan como faltantes), como constancia.js.
  if wk <= today and not exists (select 1 from grasa.points_log p where p.user_id = p_user and p.day = wk and p.source = 'semana') then
    select count(distinct p.day) into real_days from grasa.points_log p where p.user_id = p_user and p.source = 'registro' and p.day between wk - 7 and wk - 1;
    select count(*) into frozen from generate_series(wk - 7, wk - 1, interval '1 day') g(d) where grasa.day_in_pause(p_user, g.d::date);
    missing := 7 - real_days - frozen;
    if real_days >= 4 or (real_days >= 2 and real_days + least(2, missing) >= 4) then
      v := least(5, 80 - grasa.points_sum(p_user, wk, wk + 6));
      if v > 0 then insert into grasa.points_log (user_id, day, source, points) values (p_user, wk, 'semana', v) on conflict do nothing; end if;
    end if;
  end if;

  -- Bono «reto cumplido» (10, máximo 2 por semana): cuenta SOLO los días marcados con registro real a tiempo del hábito del reto.
  for ch in select x.id, x.habit, x.target_days from grasa.challenges x
      join grasa.challenge_members mb on mb.challenge_id = x.id and mb.client_id = p_user
      join grasa.coach_links l on l.coach_id = x.coach_id and l.client_id = p_user and l.status = 'active'
      where x.deleted_at is null and x.start_day <= p_day and x.end_day >= p_day - 31
        and not exists (select 1 from grasa.points_log p where p.user_id = p_user and p.source = 'reto:' || x.id::text)
  loop
    select count(*) into verified from grasa.challenge_marks m
      where m.challenge_id = ch.id and m.client_id = p_user and not m.pause_private
        and exists (select 1 from grasa.points_log p where p.user_id = p_user and p.day = m.day and p.source = 'registro')
        and grasa.pts_habit_on(p_user, m.day, ch.habit);
    if verified >= ch.target_days
       and (select count(*) from grasa.points_log p where p.user_id = p_user and p.source like 'reto:%' and p.day between wk and wk + 6) < 2 then
      v := least(10, 80 - grasa.points_sum(p_user, wk, wk + 6));
      if v > 0 then insert into grasa.points_log (user_id, day, source, points) values (p_user, p_day, 'reto:' || ch.id::text, v) on conflict do nothing; end if;
    end if;
  end loop;
end $$;

-- Disparadores: cada registro que llega (sync_push) recalcula su día; cada marca de reto revisa el bono del día de hoy.
create or replace function grasa.points_on_record() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind in ('entry', 'food', 'habit') then
    perform grasa.points_refresh(new.user_id, new.date);
    if tg_op = 'UPDATE' and old.date is distinct from new.date then perform grasa.points_refresh(new.user_id, old.date); end if;
  end if;
  return null;
end $$;
drop trigger if exists records_points on grasa.records;
create trigger records_points after insert or update on grasa.records for each row execute function grasa.points_on_record();

create or replace function grasa.points_on_mark() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform grasa.points_refresh(new.client_id, grasa.today_bogota());
  return null;
end $$;
drop trigger if exists challenge_marks_points on grasa.challenge_marks;
create trigger challenge_marks_points after insert or update on grasa.challenge_marks for each row execute function grasa.points_on_mark();

-- ============ Q2: mis puntos (solo la persona en sesión) ============
create or replace function grasa.my_points() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); today date := grasa.today_bogota(); wk date := grasa.week_monday(grasa.today_bogota());
begin
  return jsonb_build_object(
    'today', today, 'week_start', wk,
    'week', grasa.points_sum(uid, wk, wk + 6),
    'today_points', grasa.points_sum(uid, today, today),
    'log', coalesce((select jsonb_agg(jsonb_build_object('day', p.day, 'kind', split_part(p.source, ':', 1), 'points', p.points) order by p.day, p.source)
                     from grasa.points_log p where p.user_id = uid and p.day between wk and wk + 6), '[]'::jsonb),
    'weeks', (select jsonb_agg(jsonb_build_object('start', wk - 7 * k, 'points', grasa.points_sum(uid, wk - 7 * k, wk - 7 * k + 6)) order by k desc)
              from generate_series(0, 7) k),
    'best', coalesce((select max(s) from (select sum(p.points) s from grasa.points_log p where p.user_id = uid and p.day < wk
                                          group by grasa.week_monday(p.day)) x), 0),
    'total', coalesce((select sum(p.points) from grasa.points_log p where p.user_id = uid), 0),
    'plan', grasa.points_plan(uid),
    'paused', grasa.client_payment_blocked(uid),
    'team_opt_out', (select l.team_opt_out from grasa.coach_links l where l.client_id = uid and l.status = 'active' limit 1));
end $$;

-- ============ Q3: puntos y hábitos cumplidos para el ranking privado del coach ============
create or replace function grasa.coach_points(p_from date, p_to date)
returns table (client_id uuid, points int, habits_met int)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_active_coach(); today date := grasa.today_bogota();
begin
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 92 or p_to > today + 2 or p_from < today - 400 then
    raise exception 'invalid' using errcode = '22023', detail = 'rango de fechas no válido';
  end if;
  return query
  select l.client_id,
    case when l.share_habits and l.share_nutrition then grasa.points_sum(l.client_id, p_from, p_to) end,
    case when l.share_habits then (select coalesce(sum((coalesce(grasa.num_of(r.data, 'water'), 0) >= 2)::int + (coalesce(grasa.num_of(r.data, 'steps'), 0) >= 8000)::int
                                                     + (coalesce(grasa.num_of(r.data, 'sleep'), 0) between 7 and 10)::int), 0)::int
                                   from grasa.records r where r.user_id = l.client_id and r.kind = 'habit' and r.deleted_at is null and not r.pause_private
                                     and r.date between p_from and p_to and not grasa.pts_habit_rare(r.data)) end
  from grasa.coach_links l
  where l.coach_id = uid and l.status = 'active' and grasa.coach_can_see(l.client_id, 'body')
  order by l.created_at, l.client_id;
end $$;

-- ============ Q4: meta colectiva del team ============
create table if not exists grasa.team_goals (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references grasa.coaches(user_id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  metric     text not null check (metric in ('entrenos', 'puntos')),
  target     int not null check (target between 1 and 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (coach_id, week_start)
);
alter table grasa.team_goals enable row level security;
revoke all on grasa.team_goals from public, anon, authenticated, service_role;

-- La meta de esta semana de un coach, AGREGADA: total y cuántas personas suman; con menos de 5, ni el total ni el número. Nunca ids ni aportes
-- individuales. null si no hay meta esta semana. INTERNA.
create or replace function grasa.team_goal_out(p_coach uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare g grasa.team_goals; n int; total int; wk date := grasa.week_monday(grasa.today_bogota());
begin
  select * into g from grasa.team_goals t where t.coach_id = p_coach and t.week_start = wk;
  if not found then return null; end if;
  with part as (
    select l.client_id as uid from grasa.coach_links l join grasa.coaches c on c.user_id = l.coach_id and c.active
    where l.coach_id = p_coach and l.status = 'active' and not l.team_opt_out and l.share_habits and l.share_nutrition
      and core.consent_is_granted(l.client_id, 'grasa', 'sensitive_health') and core.consent_is_granted(l.client_id, 'grasa', 'cloud_transfer')
      and not grasa.client_payment_blocked(l.client_id)
  ), contrib as (
    select p.user_id, sum(p.points) as s, count(*) filter (where p.source = 'entreno') as e
    from grasa.points_log p join part on part.uid = p.user_id where p.day between wk and wk + 6 group by p.user_id
  )
  select (select count(*) from part),
         case when g.metric = 'entrenos' then (select coalesce(sum(c.e), 0) from contrib c) else (select coalesce(sum(least(80, c.s)), 0) from contrib c) end
    into n, total;
  return jsonb_build_object('metric', g.metric, 'target', g.target, 'week_start', wk, 'week_end', wk + 6, 'min', 5, 'published', n >= 5,
    'participants', case when n >= 5 then n end, 'total', case when n >= 5 then total end);
end $$;

-- El coach (activo, con acuerdo) fija o cambia la meta de ESTA semana para su team. Sin catálogo: entrenos o puntos y un número que él escribe.
create or replace function grasa.set_team_goal(p_metric text, p_target int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_active_coach(); wk date := grasa.week_monday(grasa.today_bogota());
begin
  if p_metric is null or p_metric not in ('entrenos', 'puntos') then raise exception 'invalid' using errcode = '22023', detail = 'meta: entrenos o puntos'; end if;
  if p_target is null or p_target < 1 or (p_metric = 'entrenos' and p_target > 2000) or (p_metric = 'puntos' and p_target > 20000) then
    raise exception 'invalid' using errcode = '22023', detail = 'número de la meta fuera de rango';
  end if;
  insert into grasa.team_goals (coach_id, week_start, metric, target) values (uid, wk, p_metric, p_target)
    on conflict (coach_id, week_start) do update set metric = excluded.metric, target = excluded.target, updated_at = now();
  return grasa.team_goal_out(uid);
end $$;

-- Quitar la meta de esta semana (reduce: solo exige ser coach).
create or replace function grasa.delete_team_goal() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  if not exists (select 1 from grasa.coaches c where c.user_id = uid) then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from grasa.team_goals t where t.coach_id = uid and t.week_start = grasa.week_monday(grasa.today_bogota());
end $$;

-- La meta del team que ve el coach: el mismo agregado (sin desglose individual en esta vista).
create or replace function grasa.coach_team_goal() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_active_coach();
begin
  return grasa.team_goal_out(uid);
end $$;

-- La meta del team que ve el asesorado (la de su coach ACTIVO): el agregado y si él se retiró. null sin coach o sin meta esta semana.
create or replace function grasa.my_team_goal() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); l grasa.coach_links; g jsonb;
begin
  select x.* into l from grasa.coach_links x join grasa.coaches c on c.user_id = x.coach_id and c.active
    where x.client_id = uid and x.status = 'active' limit 1;
  if not found then return null; end if;
  g := grasa.team_goal_out(l.coach_id);
  if g is null then return jsonb_build_object('none', true, 'opted_out', l.team_opt_out); end if;
  return g || jsonb_build_object('opted_out', l.team_opt_out);
end $$;

-- «No sumar mis hábitos a la meta del team» (opt-out) o volver a sumar. Solo la propia persona, sobre su vínculo activo.
create or replace function grasa.set_team_opt_out(p_out boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  if p_out is null then raise exception 'invalid' using errcode = '22023'; end if;
  update grasa.coach_links set team_opt_out = p_out, updated_at = now() where client_id = uid and status = 'active';
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  return grasa.my_team_goal();
end $$;

-- ============ Permisos: nada por defecto; solo authenticated en las RPC (cada una comprueba quién es). Nunca anon. ============
revoke execute on function grasa.week_monday(date), grasa.pts_habit_has(jsonb), grasa.pts_habit_rare(jsonb), grasa.pts_entry_has(jsonb), grasa.pts_entry_rare(jsonb),
  grasa.points_plan(uuid), grasa.points_sum(uuid, date, date), grasa.pts_habit_on(uuid, date, text), grasa.points_refresh(uuid, date),
  grasa.points_on_record(), grasa.points_on_mark(), grasa.my_points(), grasa.coach_points(date, date), grasa.team_goal_out(uuid),
  grasa.set_team_goal(text, int), grasa.delete_team_goal(), grasa.coach_team_goal(), grasa.my_team_goal(), grasa.set_team_opt_out(boolean)
  from public, anon, authenticated, service_role;
grant execute on function grasa.my_points(), grasa.coach_points(date, date), grasa.set_team_goal(text, int), grasa.delete_team_goal(),
  grasa.coach_team_goal(), grasa.my_team_goal(), grasa.set_team_opt_out(boolean) to authenticated;
