-- R1 v1.13 · Analítica del coach (M3/M5), metas del coach (M1/M2/M4, concepto jurídico 5), panel admin (M7–M10) y avisos de la plataforma.
-- Aditiva e idempotente: se aplica encima de v1.12. UNA sola migración en vuelo.
--   K1  Metas OPCIONALES que fija el coach por asesorado (concepto 5, punto 1): peso (kg), cintura (cm) y hábitos por semana (días con agua
--       cumplida, días con pasos cumplidos, noches con sueño cumplido, días de entreno). La proteína REUSA coach_links.protein_goal_g (v1.11).
--       Columnas nuevas de grasa.coach_links, todas null por defecto (= sin meta). La plataforma no calcula ni sugiere ningún número.
--       Solo escribe grasa.set_goals (coach activo, con acuerdo y vínculo activo). El asesorado las lee en my_link() (`goals`) y el coach en
--       coach_clients() (`goals`). Sin meta, la clave no viene (jsonb_strip_nulls).
--   K2  grasa.coach_analytics(p_from, p_to): cifras por asesorado vinculado y activo para la pestaña «Analítica» (M3) y el ranking privado (M5).
--       NO baja registros: devuelve días con registro, días con entreno, promedios semanales de peso y la primera/última medida de peso y cintura.
--       Respeta exactamente lo que el coach ya ve con coach_pull: vínculo activo, coach activo, A3 + A4 del asesorado, comidas solo si las
--       comparte, hábitos solo si los comparte (si no, `trained_days` = null → «no comparte», nunca cero) y NUNCA filas pause_private.
--   K3  Panel admin (solo core.has_role('grasa','admin'), que se da A MANO en SQL; ninguna función lo concede). Ley 1581 / concepto 5 punto 4:
--       el admin NUNCA recibe datos de salud (peso, medidas, comidas, fotos, salud, dolor, hábitos con valores) ni nombres, iniciales o ids de
--       asesorados: solo cantidades agregadas por coach o totales. Con menos de 3 asesorados en el grupo, los porcentajes por coach salen null.
--       Concepto 5 punto 6: «coaches con mayor éxito» SOLO con negocio y adherencia (hábitos completados, retención a 3 y 6 meses, puntualidad
--       de pagos). Prohibido usar kilos, centímetros o cualquier cambio corporal (prueba en 170_analitica_admin).
--       «Asesorado activo» = MISMA definición que grasa.billing_active_clients (vínculo activo y ≥ 1 registro sincronizado en los 30 días
--       previos al cierre del mes): grasa.client_active_in_month.
--   K4  Suspender / reactivar coaches (grasa.coaches.active) con motivo opcional que solo ve el admin (grasa.coach_admin_events).
--       Efecto de un coach inactivo (ya existía): no ve datos (coach_can_see), no escribe rutinas, metas ni notas, su código no sirve para
--       vincularse. Sus asesorados siguen usando la app y conservan sus datos. NUEVO: un asesorado de un coach suspendido ya NO queda en pausa
--       por pago (client_payment_blocked exige coach activo), porque el coach no puede marcar pagos mientras esté suspendido.
--   K5  Días en que el coach abrió su panel: grasa.coach_panel_days (coach, día). SOLO la fecha, nada más; se borran las de más de 120 días.
--   K6  Avisos de la plataforma (M10): grasa.platform_notices. Solo el admin escribe; todo coach ACTIVO lee los vigentes (coach_notices).
-- Fuera de alcance: exportar a Excel (M6) y la Etapa 3.

-- ============ K1: metas del coach ============
alter table grasa.coach_links add column if not exists goal_weight_kg numeric(4,1) null check (goal_weight_kg between 30 and 300);
alter table grasa.coach_links add column if not exists goal_waist_cm numeric(4,1) null check (goal_waist_cm between 40 and 200);
alter table grasa.coach_links add column if not exists goal_water_days smallint null check (goal_water_days between 1 and 7);
alter table grasa.coach_links add column if not exists goal_steps_days smallint null check (goal_steps_days between 1 and 7);
alter table grasa.coach_links add column if not exists goal_sleep_days smallint null check (goal_sleep_days between 1 and 7);
alter table grasa.coach_links add column if not exists goal_trained_days smallint null check (goal_trained_days between 1 and 7);

-- Metas de un vínculo como jsonb (sin las vacías). INTERNA.
create or replace function grasa.goals_json(p_link uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_strip_nulls(jsonb_build_object(
      'weight_kg', l.goal_weight_kg, 'waist_cm', l.goal_waist_cm, 'protein_g', l.protein_goal_g,
      'water_days', l.goal_water_days, 'steps_days', l.goal_steps_days, 'sleep_days', l.goal_sleep_days, 'trained_days', l.goal_trained_days))
    from grasa.coach_links l where l.id = p_link), '{}'::jsonb);
$$;

-- El coach fija TODAS las metas de una vez: lo que no viene (o viene null) queda vacío. Claves desconocidas = invalid.
create or replace function grasa.set_goals(p_client uuid, p_goals jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_coach_of(p_client); g jsonb := coalesce(p_goals, '{}'::jsonb); k text; lid uuid;
  w numeric; wa numeric; pr int; d1 int; d2 int; d3 int; d4 int;
begin
  if jsonb_typeof(g) <> 'object' then raise exception 'invalid' using errcode = '22023'; end if;
  for k in select jsonb_object_keys(g) loop
    if k not in ('weight_kg', 'waist_cm', 'protein_g', 'water_days', 'steps_days', 'sleep_days', 'trained_days') then
      raise exception 'invalid' using errcode = '22023', detail = 'meta desconocida: ' || left(k, 30);
    end if;
    if g -> k <> 'null'::jsonb and jsonb_typeof(g -> k) <> 'number' then raise exception 'invalid' using errcode = '22023', detail = 'la meta debe ser un número'; end if;
  end loop;
  w := round((g ->> 'weight_kg')::numeric, 1); wa := round((g ->> 'waist_cm')::numeric, 1);
  pr := (g ->> 'protein_g')::numeric; d1 := (g ->> 'water_days')::numeric; d2 := (g ->> 'steps_days')::numeric;
  d3 := (g ->> 'sleep_days')::numeric; d4 := (g ->> 'trained_days')::numeric;
  if (w is not null and w not between 30 and 300) or (wa is not null and wa not between 40 and 200) or (pr is not null and pr not between 20 and 400)
     or (d1 is not null and d1 not between 1 and 7) or (d2 is not null and d2 not between 1 and 7)
     or (d3 is not null and d3 not between 1 and 7) or (d4 is not null and d4 not between 1 and 7) then
    raise exception 'invalid' using errcode = '22023', detail = 'meta fuera de rango';
  end if;
  update grasa.coach_links set goal_weight_kg = w, goal_waist_cm = wa, protein_goal_g = pr, goal_water_days = d1, goal_steps_days = d2,
         goal_sleep_days = d3, goal_trained_days = d4, updated_at = now()
    where coach_id = uid and client_id = p_client and status = 'active' returning id into lid;
  return jsonb_build_object('client_id', p_client, 'goals', grasa.goals_json(lid));
end $$;

-- my_link: mismo cuerpo que v1.11 + `goals` (cambian las columnas: borrar y volver a crear).
drop function if exists grasa.my_link();
create function grasa.my_link()
returns table (id uuid, coach_id uuid, business_name text, share_body boolean, share_notes boolean,
               share_nutrition boolean, share_habits boolean, share_photos boolean, since timestamptz,
               paid_until date, paid_marked_at timestamptz, paid boolean, days_left int,
               protein_goal_g int, pauses jsonb, goals jsonb)
language sql stable security definer set search_path = '' as $$
  select l.id, l.coach_id, c.business_name, l.share_body, l.share_notes, l.share_nutrition, l.share_habits,
         l.share_photos, l.created_at, l.paid_until, l.paid_marked_at,
         (l.paid_until is not null and l.paid_until >= grasa.today_bogota()),
         case when l.paid_until is null then null else l.paid_until - grasa.today_bogota() end,
         l.protein_goal_g, grasa.link_pauses_json(l.id), grasa.goals_json(l.id)
  from grasa.coach_links l
  join grasa.coaches c on c.user_id = l.coach_id
  where l.client_id = auth.uid() and l.status = 'active'
  limit 1;
$$;

-- coach_clients: mismo cuerpo que v1.12 + `goals`.
drop function if exists grasa.coach_clients();
create function grasa.coach_clients()
returns table (client_id uuid, display_name text, link_id uuid, since timestamptz, shares jsonb,
               last_activity timestamptz, over_free_limit boolean,
               paid_until date, paid_marked_at timestamptz, paid boolean, days_left int,
               protein_goal_g int, health_restriction boolean, pregnancy_state boolean, pauses jsonb, pain_reported date, goals jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform grasa.require_coach_agreement();
  return query
  select l.client_id, p.display_name, l.id, l.created_at,
         jsonb_build_object('body', l.share_body, 'notes', l.share_notes, 'nutrition', l.share_nutrition,
                            'habits', l.share_habits, 'photos', l.share_photos),
         (select max(r.server_updated_at) from grasa.records r
          where r.user_id = l.client_id and not r.pause_private
            and core.consent_is_granted(l.client_id, 'grasa', 'sensitive_health')
            and core.consent_is_granted(l.client_id, 'grasa', 'cloud_transfer')
            and (r.kind in ('profile','entry') or (r.kind = 'food' and l.share_nutrition) or (r.kind = 'habit' and l.share_habits))),
         row_number() over (order by l.created_at, l.id) > c.free_clients,
         l.paid_until, l.paid_marked_at,
         (l.paid_until is not null and l.paid_until >= grasa.today_bogota()),
         case when l.paid_until is null then null else l.paid_until - grasa.today_bogota() end,
         l.protein_goal_g,
         grasa.coach_can_see(l.client_id, 'body') and grasa.health_flag(l.client_id, 'condition'),
         grasa.coach_can_see(l.client_id, 'body') and grasa.health_flag(l.client_id, 'pregnancy'),
         grasa.link_pauses_json(l.id),
         case when c.active and core.consent_is_granted(l.client_id, 'grasa', 'sensitive_health')
                   and core.consent_is_granted(l.client_id, 'grasa', 'cloud_transfer')
              then grasa.pain_flag(l.client_id) end,
         grasa.goals_json(l.id)
  from grasa.coach_links l
  join grasa.coaches c on c.user_id = l.coach_id
  left join core.profiles p on p.id = l.client_id
  where l.coach_id = auth.uid() and l.status = 'active'
  order by l.created_at;
end $$;

-- ============ K2: analítica del coach (agregada en el servidor) ============
-- Peso o cintura numérico de un registro (null si no es número). INTERNA.
create or replace function grasa.num_of(p_data jsonb, p_key text) returns numeric
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p_data -> p_key) = 'number' then (p_data ->> p_key)::numeric end;
$$;

create or replace function grasa.coach_analytics(p_from date, p_to date)
returns table (client_id uuid, shares_habits boolean, shares_nutrition boolean, since date,
               log_days date[], trained_days date[], weight_weeks jsonb,
               weight_first numeric, weight_last numeric, waist_first numeric, waist_last numeric)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_active_coach(); today date := grasa.today_bogota();
begin
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 92 or p_to > today + 2 or p_from < today - 400 then
    raise exception 'invalid' using errcode = '22023', detail = 'rango de fechas no válido';
  end if;
  return query
  with v as (   -- lo que el coach ya ve con coach_pull: vínculo activo, A3 + A4, permisos, sin pausa privada, sin lápidas
    select l.client_id as cid, l.share_habits as sh, l.share_nutrition as sn, (l.created_at at time zone 'America/Bogota')::date as since_d
    from grasa.coach_links l
    where l.coach_id = uid and l.status = 'active' and grasa.coach_can_see(l.client_id, 'body')
  ), rec as (
    select v.cid, r.kind, coalesce(r.date, case when r.nkey ~ '^\d{4}-\d{2}-\d{2}$' then r.nkey::date end) as d, r.data
    from v join grasa.records r on r.user_id = v.cid
    where not r.pause_private and r.deleted_at is null
      and (r.kind = 'entry' or (r.kind = 'food' and v.sn) or (r.kind = 'habit' and v.sh))
  )
  select v.cid, v.sh, v.sn, v.since_d,
    coalesce((select array_agg(distinct x.d order by x.d) from rec x where x.cid = v.cid and x.d between p_from and p_to
              and (x.kind <> 'habit' or x.data <> '{}'::jsonb)), '{}'::date[]),
    case when v.sh then coalesce((select array_agg(distinct x.d order by x.d) from rec x where x.cid = v.cid and x.kind = 'habit'
              and x.d between p_from and p_to and x.data -> 'trained' = 'true'::jsonb), '{}'::date[]) end,
    coalesce((select jsonb_agg(jsonb_build_object('w', w.k, 'kg', w.kg) order by w.k)
              from (select (p_to - x.d) / 7 as k, round(avg(grasa.num_of(x.data, 'weight')), 2) as kg
                    from rec x where x.cid = v.cid and x.kind = 'entry' and grasa.num_of(x.data, 'weight') is not null
                      and x.d <= p_to and x.d > p_to - 42
                    group by 1) w), '[]'::jsonb),
    (select grasa.num_of(x.data, 'weight') from rec x where x.cid = v.cid and x.kind = 'entry' and grasa.num_of(x.data, 'weight') is not null and x.d <= p_to order by x.d asc limit 1),
    (select grasa.num_of(x.data, 'weight') from rec x where x.cid = v.cid and x.kind = 'entry' and grasa.num_of(x.data, 'weight') is not null and x.d <= p_to order by x.d desc limit 1),
    (select grasa.num_of(x.data, 'waist') from rec x where x.cid = v.cid and x.kind = 'entry' and grasa.num_of(x.data, 'waist') is not null and x.d <= p_to order by x.d asc limit 1),
    (select grasa.num_of(x.data, 'waist') from rec x where x.cid = v.cid and x.kind = 'entry' and grasa.num_of(x.data, 'waist') is not null and x.d <= p_to order by x.d desc limit 1)
  from v
  order by v.since_d, v.cid;
end $$;

-- ============ K5: días en que el coach abrió su panel (solo la fecha) ============
create table if not exists grasa.coach_panel_days (
  coach_id uuid not null references auth.users(id) on delete cascade,
  day      date not null,
  primary key (coach_id, day)
);
alter table grasa.coach_panel_days enable row level security;
revoke all on grasa.coach_panel_days from public, anon, authenticated, service_role;

create or replace function grasa.coach_panel_opened(p_day date) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); today date := grasa.today_bogota();
begin
  if not exists (select 1 from grasa.coaches c where c.user_id = uid) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_day is null or p_day not between today - 1 and today + 1 then raise exception 'invalid' using errcode = '22023'; end if;
  insert into grasa.coach_panel_days (coach_id, day) values (uid, p_day) on conflict do nothing;
  delete from grasa.coach_panel_days where coach_id = uid and day < today - 120;
end $$;

-- ============ K3: panel admin ============
create or replace function grasa.require_admin() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  if not core.has_role('grasa', 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  return uid;
end $$;

-- ¿Ese asesorado cuenta como ACTIVO del mes? MISMA regla que grasa.billing_active_clients: vínculo activo (con ese coach) y ≥ 1 registro
-- sincronizado en los 30 días previos al cierre del mes. INTERNA.
create or replace function grasa.client_active_in_month(p_coach uuid, p_client uuid, p_month date) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from grasa.coach_links l where l.coach_id = p_coach and l.client_id = p_client and l.status = 'active')
     and exists (select 1 from grasa.records r where r.user_id = p_client
                 and r.server_updated_at >= (date_trunc('month', p_month) + interval '1 month') - interval '30 days'
                 and r.server_updated_at < date_trunc('month', p_month) + interval '1 month');
$$;
create or replace function grasa.coach_active_clients(p_coach uuid, p_month date) returns int
language sql stable security definer set search_path = '' as $$
  select count(distinct l.client_id)::int from grasa.coach_links l
  where l.coach_id = p_coach and l.status = 'active' and grasa.client_active_in_month(p_coach, l.client_id, p_month);
$$;
-- Día de referencia de un mes: su último día, o hoy si el mes está en curso. INTERNA.
create or replace function grasa.month_ref(p_month date) returns date
language sql stable set search_path = '' as $$
  select least((date_trunc('month', p_month) + interval '1 month' - interval '1 day')::date, grasa.today_bogota());
$$;

-- Registro de suspensiones (motivo opcional que solo ve el admin).
create table if not exists grasa.coach_admin_events (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references auth.users(id) on delete cascade,
  active     boolean not null,
  reason     text null check (char_length(reason) <= 200),
  admin_id   uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table grasa.coach_admin_events enable row level security;
revoke all on grasa.coach_admin_events from public, anon, authenticated, service_role;

-- M7: coaches y cobro del mes. Solo identidad del COACH (negocio y nombre) y cantidades; nada de sus asesorados.
create or replace function grasa.admin_coaches(p_month date)
returns table (coach_id uuid, business_name text, coach_name text, active boolean, free_clients int,
               active_clients int, over_free int, linked_clients int, created_at timestamptz, last_reason text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform grasa.require_admin();
  if p_month is null then raise exception 'invalid' using errcode = '22023'; end if;
  return query
  select c.user_id, c.business_name, coalesce(pr.display_name, ''), c.active, c.free_clients,
         grasa.coach_active_clients(c.user_id, p_month),
         greatest(grasa.coach_active_clients(c.user_id, p_month) - c.free_clients, 0),
         (select count(*)::int from grasa.coach_links l where l.coach_id = c.user_id and l.status = 'active'),
         c.created_at,
         (select e.reason from grasa.coach_admin_events e where e.coach_id = c.user_id order by e.created_at desc limit 1)
  from grasa.coaches c left join core.profiles pr on pr.id = c.user_id
  order by c.active desc, c.business_name;
end $$;

create or replace function grasa.admin_set_coach_active(p_coach uuid, p_active boolean, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_admin(); r text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if p_active is null or char_length(coalesce(r, '')) > 200 then raise exception 'invalid' using errcode = '22023'; end if;
  update grasa.coaches set active = p_active where user_id = p_coach;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into grasa.coach_admin_events (coach_id, active, reason, admin_id) values (p_coach, p_active, r, uid);
  return jsonb_build_object('coach_id', p_coach, 'active', p_active);
end $$;

-- M8: uso general, solo totales.
create or replace function grasa.admin_usage(p_month date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ref date; m0 date; m1 date; out jsonb;
begin
  perform grasa.require_admin();
  if p_month is null then raise exception 'invalid' using errcode = '22023'; end if;
  ref := grasa.month_ref(p_month); m0 := date_trunc('month', p_month)::date; m1 := (m0 + interval '1 month')::date;
  with sizes as (select grasa.coach_active_clients(c.user_id, p_month) n from grasa.coaches c where c.active),
       cohort as (select l.status from grasa.coach_links l
                  where (l.created_at at time zone 'America/Bogota')::date >= ref - 60 and (l.created_at at time zone 'America/Bogota')::date < ref - 30)
  select jsonb_build_object(
    'coaches_active', (select count(*) from grasa.coaches c where c.active),
    'coaches_total', (select count(*) from grasa.coaches),
    'coaches_new', (select count(*) from grasa.coaches c where c.created_at >= m0 and c.created_at < m1),
    'clients_active', (select coalesce(sum(n), 0) from sizes),
    'signups', (select count(*) from grasa.coach_links l where l.created_at >= m0 and l.created_at < m1),
    'drops', (select count(*) from grasa.coach_links l where l.ended_at >= m0 and l.ended_at < m1),
    'retention30', jsonb_build_object('cohort', (select count(*) from cohort), 'kept', (select count(*) from cohort where status = 'active')),
    'sizes', jsonb_build_object('s1_5', (select count(*) from sizes where n between 1 and 5), 's6_10', (select count(*) from sizes where n between 6 and 10),
                                's11', (select count(*) from sizes where n >= 11)),
    'weeks', (select jsonb_agg(jsonb_build_object('start', ref - 7 * k - 6, 'records',
               (select count(*) from grasa.records r
                where r.kind in ('entry', 'food', 'habit') and r.deleted_at is null and r.date between ref - 7 * k - 6 and ref - 7 * k
                  and exists (select 1 from grasa.coach_links l where l.client_id = r.user_id and l.status = 'active'))) order by k desc)
              from generate_series(0, 7) k),
    'ref', ref) into out;
  return out;
end $$;

-- M9: uso de UN coach. Solo conteos; con menos de 3 asesorados activos, los porcentajes y los entrenos por semana salen null (no se puede
-- deducir a una persona). Nunca pesos, medidas, comidas, fotos ni salud.
create or replace function grasa.admin_coach_usage(p_coach uuid, p_month date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ref date; n int; out jsonb; c grasa.coaches;
begin
  perform grasa.require_admin();
  select * into c from grasa.coaches where user_id = p_coach;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_month is null then raise exception 'invalid' using errcode = '22023'; end if;
  ref := grasa.month_ref(p_month);
  n := grasa.coach_active_clients(p_coach, p_month);
  with lk as (select l.client_id, l.share_habits, (l.created_at at time zone 'America/Bogota')::date as since_d
              from grasa.coach_links l where l.coach_id = p_coach and l.status = 'active'),
       cohort as (select l.status from grasa.coach_links l where l.coach_id = p_coach
                  and (l.created_at at time zone 'America/Bogota')::date >= ref - 60 and (l.created_at at time zone 'America/Bogota')::date < ref - 30)
  select jsonb_build_object(
    'active_clients', n,
    'retention30', jsonb_build_object('cohort', (select count(*) from cohort), 'kept', (select count(*) from cohort where status = 'active')),
    'last_action_at', greatest(
        (select max(x.created_at) from grasa.comments x where x.coach_id = p_coach),
        (select max(l.paid_marked_at) from grasa.coach_links l where l.coach_id = p_coach),
        (select max(t.updated_at) from grasa.routine_templates t where t.coach_id = p_coach),
        (select max(t.updated_at) from grasa.routines t where t.coach_id = p_coach),
        (select max(t.created_at) from grasa.challenges t where t.coach_id = p_coach)),
    'last_panel_day', (select max(d.day) from grasa.coach_panel_days d where d.coach_id = p_coach),
    'panel_days', coalesce((select jsonb_agg(d.day order by d.day) from grasa.coach_panel_days d where d.coach_id = p_coach and d.day between ref - 6 and ref), '[]'::jsonb),
    'weeks', (select jsonb_agg(jsonb_build_object('start', ref - 7 * k - 6,
               'pct_logging', case when (select count(*) from lk where lk.since_d <= ref - 7 * k) >= 3 then
                  round(100.0 * (select count(*) from lk where lk.since_d <= ref - 7 * k and exists (
                      select 1 from grasa.records r where r.user_id = lk.client_id and r.deleted_at is null and not r.pause_private
                        and r.kind in ('entry', 'food', 'habit') and r.date between ref - 7 * k - 6 and ref - 7 * k))
                    / (select count(*) from lk where lk.since_d <= ref - 7 * k)) end,
               'trained', case when (select count(*) from lk where lk.share_habits) >= 3 then
                  (select count(*) from lk join grasa.records r on r.user_id = lk.client_id
                   where lk.share_habits and r.kind = 'habit' and r.deleted_at is null and not r.pause_private
                     and r.date between ref - 7 * k - 6 and ref - 7 * k and r.data -> 'trained' = 'true'::jsonb) end) order by k desc)
              from generate_series(0, 7) k),
    'ref', ref) into out;
  return out;
end $$;

-- «Coaches con mayor éxito» (concepto 5, punto 6): SOLO negocio y adherencia. Nunca kilos, centímetros ni cambios corporales.
--   habits_pct     % de sus asesorados que comparten hábitos y completaron alguno (agua ≥ 2 L, pasos ≥ 8000, sueño ≥ 7 h o entrenó) en ≥ 4 de los
--                  últimos 7 días (mismas reglas de «cumplido» que habitos.js). null con menos de 3 asesorados que comparten hábitos.
--   retention_90 / retention_180   % de los vínculos que empezaron hace 3 a 6 meses (o 6 a 12) que siguen activos. null sin cohorte.
--   on_time_pct    % de sus vínculos activos que están al día con el pago (paid_until ≥ hoy). null sin asesorados.
create or replace function grasa.admin_success(p_month date)
returns table (coach_id uuid, business_name text, habits_pct int, habits_group int, retention_90 int, cohort_90 int,
               retention_180 int, cohort_180 int, on_time_pct int, paying_group int)
language plpgsql stable security definer set search_path = '' as $$
declare ref date;
begin
  perform grasa.require_admin();
  if p_month is null then raise exception 'invalid' using errcode = '22023'; end if;
  ref := grasa.month_ref(p_month);
  return query
  with lk as (select l.coach_id, l.client_id, l.share_habits, l.paid_until from grasa.coach_links l where l.status = 'active'),
       hab as (select lk.coach_id, lk.client_id,
                 (select count(distinct r.date) from grasa.records r where r.user_id = lk.client_id and r.kind = 'habit' and r.deleted_at is null
                    and not r.pause_private and r.date between ref - 6 and ref
                    and (coalesce(grasa.num_of(r.data, 'water'), 0) >= 2 or coalesce(grasa.num_of(r.data, 'steps'), 0) >= 8000
                         or coalesce(grasa.num_of(r.data, 'sleep'), 0) >= 7 or r.data -> 'trained' = 'true'::jsonb)) as ok_days
               from lk where lk.share_habits),
       coh as (select l.coach_id,
                 count(*) filter (where l.created_at::date between ref - 180 and ref - 90) as c90,
                 count(*) filter (where l.created_at::date between ref - 180 and ref - 90 and l.status = 'active') as k90,
                 count(*) filter (where l.created_at::date between ref - 365 and ref - 181) as c180,
                 count(*) filter (where l.created_at::date between ref - 365 and ref - 181 and l.status = 'active') as k180
               from grasa.coach_links l group by l.coach_id)
  select c.user_id, c.business_name,
    case when (select count(*) from hab h where h.coach_id = c.user_id) >= 3 then
      round(100.0 * (select count(*) from hab h where h.coach_id = c.user_id and h.ok_days >= 4) / (select count(*) from hab h where h.coach_id = c.user_id))::int end,
    (select count(*)::int from hab h where h.coach_id = c.user_id),
    case when coalesce(co.c90, 0) > 0 then round(100.0 * co.k90 / co.c90)::int end, coalesce(co.c90, 0)::int,
    case when coalesce(co.c180, 0) > 0 then round(100.0 * co.k180 / co.c180)::int end, coalesce(co.c180, 0)::int,
    case when (select count(*) from lk where lk.coach_id = c.user_id) > 0 then
      round(100.0 * (select count(*) from lk where lk.coach_id = c.user_id and lk.paid_until >= grasa.today_bogota())
            / (select count(*) from lk where lk.coach_id = c.user_id))::int end,
    (select count(*)::int from lk where lk.coach_id = c.user_id)
  from grasa.coaches c left join coh co on co.coach_id = c.user_id
  order by c.business_name;
end $$;

-- ============ K6: avisos de la plataforma (solo comunicación operativa, técnica o de servicio) ============
create table if not exists grasa.platform_notices (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(title) between 3 and 80),
  body       text not null check (char_length(body) between 3 and 400),
  starts_on  date not null,
  ends_on    date not null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz null,
  check (starts_on <= ends_on and ends_on - starts_on <= 90)
);
alter table grasa.platform_notices enable row level security;
revoke all on grasa.platform_notices from public, anon, authenticated, service_role;

create or replace function grasa.admin_save_notice(p_id uuid, p_title text, p_body text, p_from date, p_to date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_admin(); t text := btrim(coalesce(p_title, '')); b text := btrim(coalesce(p_body, '')); n grasa.platform_notices;
begin
  if char_length(t) not between 3 and 80 or char_length(b) not between 3 and 400 or p_from is null or p_to is null or p_from > p_to
     or p_to - p_from > 90 or p_to < grasa.today_bogota() - 1 then
    raise exception 'invalid' using errcode = '22023';
  end if;
  if p_id is null then
    insert into grasa.platform_notices (title, body, starts_on, ends_on, created_by) values (t, b, p_from, p_to, uid) returning * into n;
  else
    update grasa.platform_notices set title = t, body = b, starts_on = p_from, ends_on = p_to where id = p_id and deleted_at is null returning * into n;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;
  return jsonb_build_object('id', n.id, 'title', n.title, 'body', n.body, 'starts_on', n.starts_on, 'ends_on', n.ends_on, 'created_at', n.created_at);
end $$;

create or replace function grasa.admin_list_notices()
returns table (id uuid, title text, body text, starts_on date, ends_on date, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform grasa.require_admin();
  return query select n.id, n.title, n.body, n.starts_on, n.ends_on, n.created_at from grasa.platform_notices n
    where n.deleted_at is null order by n.starts_on desc, n.created_at desc limit 50;
end $$;

create or replace function grasa.admin_delete_notice(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform grasa.require_admin();
  update grasa.platform_notices set deleted_at = now() where id = p_id and deleted_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end $$;

-- Coach ACTIVO: avisos vigentes en su día (el del teléfono; hoy ± 1 respecto de Bogotá).
create or replace function grasa.coach_notices(p_today date)
returns table (id uuid, title text, body text, starts_on date, ends_on date)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); today date := grasa.today_bogota();
begin
  if not exists (select 1 from grasa.coaches c where c.user_id = uid and c.active) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_today is null or p_today not between today - 1 and today + 1 then raise exception 'invalid' using errcode = '22023'; end if;
  return query select n.id, n.title, n.body, n.starts_on, n.ends_on from grasa.platform_notices n
    where n.deleted_at is null and p_today between n.starts_on and n.ends_on order by n.starts_on desc, n.created_at desc limit 3;
end $$;

-- ============ K4: un coach suspendido no deja a sus asesorados en pausa por pago ============
-- Mismo cuerpo que en r1_pagos_coach + «el coach del vínculo está activo».
create or replace function grasa.client_payment_blocked(p_client uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from grasa.coach_links l join grasa.coaches c on c.user_id = l.coach_id and c.active
                 where l.client_id = p_client and l.status = 'active'
                   and (l.paid_until is null or l.paid_until < grasa.today_bogota()));
$$;

-- ============ Permisos: nada por defecto; solo authenticated en las RPC (que comprueban el rol dentro). Nunca anon. ============
revoke execute on function grasa.goals_json(uuid), grasa.set_goals(uuid, jsonb), grasa.my_link(), grasa.coach_clients(),
  grasa.num_of(jsonb, text), grasa.coach_analytics(date, date), grasa.coach_panel_opened(date), grasa.require_admin(),
  grasa.client_active_in_month(uuid, uuid, date), grasa.coach_active_clients(uuid, date), grasa.month_ref(date),
  grasa.admin_coaches(date), grasa.admin_set_coach_active(uuid, boolean, text), grasa.admin_usage(date), grasa.admin_coach_usage(uuid, date),
  grasa.admin_success(date), grasa.admin_save_notice(uuid, text, text, date, date), grasa.admin_list_notices(), grasa.admin_delete_notice(uuid),
  grasa.coach_notices(date), grasa.client_payment_blocked(uuid)
  from public, anon, authenticated, service_role;
grant execute on function grasa.set_goals(uuid, jsonb), grasa.my_link(), grasa.coach_clients(), grasa.coach_analytics(date, date),
  grasa.coach_panel_opened(date), grasa.admin_coaches(date), grasa.admin_set_coach_active(uuid, boolean, text), grasa.admin_usage(date),
  grasa.admin_coach_usage(uuid, date), grasa.admin_success(date), grasa.admin_save_notice(uuid, text, text, date, date), grasa.admin_list_notices(),
  grasa.admin_delete_notice(uuid), grasa.coach_notices(date)
  to authenticated;
