-- R1 v1.24 · Calendario de clases: el coach programa por adelantado los días del mes de cada asesorado; al asesorado solo le aparece la clase DE HOY
-- (en su «Rutina de hoy», sin ver los otros días). Cada día guarda una COPIA de la plantilla en el momento de programarla (si el coach cambia la
-- plantilla después, lo ya programado no cambia, igual que al asignar). Se borra con la cuenta (cascada) y al quitar el día.
-- Solo funciones SECURITY DEFINER (RLS sin políticas). Coach: acuerdo vigente y vínculo ACTIVO con ese asesorado. Asesorado: solo su clase de hoy.

create table if not exists grasa.class_schedule (
  coach_id    uuid not null references auth.users(id) on delete cascade,
  client_id   uuid not null references auth.users(id) on delete cascade,
  day         date not null,
  template_id uuid null references grasa.routine_templates(id) on delete set null,
  title       text not null check (char_length(title) between 1 and 60),
  content     jsonb not null,
  created_at  timestamptz not null default now(),
  primary key (coach_id, client_id, day)
);
create index if not exists class_schedule_client_day on grasa.class_schedule (client_id, day);
alter table grasa.class_schedule enable row level security;
revoke all on grasa.class_schedule from public, anon, authenticated, service_role;

-- Programa la plantilla en esos días (hasta 62 por llamada, de ayer a 120 días adelante en hora de Bogotá). Reemplaza lo que hubiera en esos días.
create or replace function grasa.schedule_set(p_client uuid, p_days date[], p_template uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_coach_of(p_client); t grasa.routine_templates; d date; n integer := 0; today date := grasa.today_bogota();
begin
  if p_days is null or coalesce(array_length(p_days, 1), 0) not between 1 and 62 then raise exception 'invalid' using errcode = '22023', detail = 'bad_days'; end if;
  select x.* into t from grasa.routine_templates x where x.id = p_template and x.coach_id = uid;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  for d in select distinct x from unnest(p_days) x loop
    if d is null or d not between today - 1 and today + 120 then raise exception 'invalid' using errcode = '22023', detail = 'bad_day'; end if;
    insert into grasa.class_schedule as s (coach_id, client_id, day, template_id, title, content) values (uid, p_client, d, t.id, t.title, t.content)
      on conflict (coach_id, client_id, day) do update set template_id = excluded.template_id, title = excluded.title, content = excluded.content, created_at = now();
    n := n + 1;
  end loop;
  return jsonb_build_object('days', n);
end $$;

-- Quita la clase de esos días. Reduce lo programado: no exige acuerdo (solo toca lo propio).
create or replace function grasa.schedule_clear(p_client uuid, p_days date[]) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  if p_days is null or coalesce(array_length(p_days, 1), 0) not between 1 and 62 then raise exception 'invalid' using errcode = '22023', detail = 'bad_days'; end if;
  delete from grasa.class_schedule s where s.coach_id = uid and s.client_id = p_client and s.day = any (p_days);
end $$;

-- Lo programado a ese asesorado entre dos fechas (máximo 62 días): día, título y plantilla. Sin el contenido de la rutina.
create or replace function grasa.coach_schedule(p_client uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_coach_of(p_client);
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then raise exception 'invalid' using errcode = '22023'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('day', s.day, 'title', s.title, 'template_id', s.template_id) order by s.day)
                   from grasa.class_schedule s where s.coach_id = uid and s.client_id = p_client and s.day between p_from and p_to), '[]'::jsonb);
end $$;

-- «Rutina de hoy» del asesorado: primero la clase programada para él EXACTAMENTE ese día; si no hay, la de siempre (la publicada para todos).
create or replace function grasa.my_daily(p_today date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); d grasa.daily_routines; s grasa.class_schedule;
begin
  if p_today is null then return null; end if;
  select x.* into s from grasa.class_schedule x
    join grasa.coach_links l on l.coach_id = x.coach_id and l.client_id = uid and l.status = 'active'
    join grasa.coaches c on c.user_id = x.coach_id and c.active
    where x.client_id = uid and x.day = p_today;
  if found then
    return jsonb_build_object('coach_id', s.coach_id, 'template_id', s.template_id, 'title', s.title, 'content', s.content, 'day', s.day, 'published_at', s.created_at);
  end if;
  select x.* into d from grasa.daily_routines x
    join grasa.coach_links l on l.coach_id = x.coach_id and l.client_id = uid and l.status = 'active'
    join grasa.coaches c on c.user_id = x.coach_id and c.active
    where x.day = p_today;
  if not found then return null; end if;
  return grasa.daily_out(d);
end $$;

revoke execute on function grasa.schedule_set(uuid, date[], uuid), grasa.schedule_clear(uuid, date[]), grasa.coach_schedule(uuid, date, date), grasa.my_daily(date)
  from public, anon, authenticated, service_role;
grant execute on function grasa.schedule_set(uuid, date[], uuid), grasa.schedule_clear(uuid, date[]), grasa.coach_schedule(uuid, date, date), grasa.my_daily(date) to authenticated;
