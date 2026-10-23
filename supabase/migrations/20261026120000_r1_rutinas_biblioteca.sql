-- R1 v1.8 · «App para coaches», Etapa 2b: biblioteca de rutinas del coach, asignación (copias), mostrar/ocultar y «Rutina de hoy». Aditiva e idempotente.
--   V1  grasa.routine_templates: «Mis rutinas», plantillas reutilizables del coach (no pertenecen a ningún cliente). Máx. 50 por coach.
--   V2  grasa.routines (la tabla de v1.7) pasa a ser «rutinas ASIGNADAS»: se quita el único (coach, cliente) para que un asesorado tenga VARIAS
--       (máx. 20 por coach+cliente) y se añade `visible` (por defecto true). Las filas que ya existían quedan como asignadas VISIBLES: no se pierde nada.
--       Asignar una plantilla CREA UNA COPIA independiente (título y contenido copiados): editar la plantilla después no cambia las copias.
--   V3  grasa.daily_routines: la «Rutina de hoy» del coach (una por coach): copia del contenido de una plantilla + el día 'AAAA-MM-DD' que manda el
--       coach desde su dispositivo. El cliente la pide con my_daily(su fecha de hoy) y solo la recibe si COINCIDE con el día publicado.
--   V4  Borrar un GIF en uso se niega si lo usa una plantilla, una rutina asignada o la del día (my_gifs cuenta las tres).
--   V5  Compatibilidad con la app vieja (el SQL se aplica ANTES que la app): save_routine / get_routine / delete_routine / my_routine siguen
--       existiendo y actúan sobre la PRIMERA rutina (la más antigua) del cliente; my_routine devuelve la primera VISIBLE.
-- RLS activada en las dos tablas nuevas SIN políticas ni permisos directos: solo se tocan por funciones SECURITY DEFINER (coach: acuerdo A7 vigente
-- y, para tocar a un cliente, vínculo ACTIVO con él; cliente: solo lo suyo, solo lo visible, solo con vínculo activo con coach activo).
-- core.delete_my_account no cambia: las tres tablas cuelgan de auth.users con on delete cascade (cliente → sus rutinas; coach → plantillas, rutinas y el día).

-- ============ V1/V3: tablas nuevas ============
create table if not exists grasa.routine_templates (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references auth.users(id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 60),
  content    jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists routine_templates_coach_idx on grasa.routine_templates (coach_id, created_at);

create table if not exists grasa.daily_routines (
  coach_id     uuid primary key references auth.users(id) on delete cascade,
  template_id  uuid references grasa.routine_templates(id) on delete set null,
  title        text not null check (char_length(title) between 1 and 60),
  content      jsonb not null,
  day          date not null,
  published_at timestamptz not null default now()
);

alter table grasa.routine_templates enable row level security;
alter table grasa.daily_routines enable row level security;
revoke all on grasa.routine_templates, grasa.daily_routines from public, anon, authenticated, service_role;

-- ============ V2: las rutinas existentes pasan a ser «asignadas» ============
alter table grasa.routines add column if not exists visible boolean not null default true;
-- Fuera el único (coach, cliente) de v1.7 (cualquier restricción UNIQUE de esa tabla; la clave primaria no se toca).
do $$ declare c text;
begin
  for c in select con.conname from pg_constraint con where con.conrelid = 'grasa.routines'::regclass and con.contype = 'u' loop
    execute format('alter table grasa.routines drop constraint %I', c);
  end loop;
end $$;
create index if not exists routines_coach_client_idx on grasa.routines (coach_id, client_id, created_at);

-- ============ Salidas y validaciones (INTERNAS) ============
create or replace function grasa.routine_out(r grasa.routines) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('id', r.id, 'coach_id', r.coach_id, 'client_id', r.client_id, 'title', r.title, 'content', r.content,
                            'visible', r.visible, 'created_at', r.created_at, 'updated_at', r.updated_at);
$$;
create or replace function grasa.template_out(t grasa.routine_templates) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('id', t.id, 'coach_id', t.coach_id, 'title', t.title, 'content', t.content, 'created_at', t.created_at, 'updated_at', t.updated_at);
$$;
create or replace function grasa.daily_out(d grasa.daily_routines) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('coach_id', d.coach_id, 'template_id', d.template_id, 'title', d.title, 'content', d.content, 'day', d.day, 'published_at', d.published_at);
$$;

-- Título y contenido válidos, y todos los GIF citados son del coach. Lanza invalid (con detail) si no.
create or replace function grasa.check_routine_input(p_coach uuid, p_title text, p_content jsonb) returns text
language plpgsql stable security definer set search_path = '' as $$
declare t text := btrim(coalesce(p_title, ''));
begin
  if char_length(t) not between 1 and 60 then raise exception 'invalid' using errcode = '22023', detail = 'el título debe tener entre 1 y 60 caracteres'; end if;
  if not grasa.routine_content_ok(p_content) then raise exception 'invalid' using errcode = '22023', detail = 'la rutina no es válida (máximo 7 días y 12 ejercicios por día)'; end if;
  if exists (select 1 from jsonb_path_query(p_content, '$.days[*].exercises[*].gif') g(v)
             where not exists (select 1 from grasa.exercise_gifs x where x.coach_id = p_coach and x.id::text = lower(g.v #>> '{}'))) then
    raise exception 'invalid' using errcode = '22023', detail = 'gif_not_found';
  end if;
  return t;
end $$;

-- ¿Soy coach ACTIVO con acuerdo vigente y con vínculo ACTIVO con ese cliente? Si no, forbidden.
create or replace function grasa.require_coach_of(p_client uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  perform grasa.require_coach_agreement();
  if p_client is null or not exists (select 1 from grasa.coach_links l join grasa.coaches c on c.user_id = l.coach_id and c.active
                                     where l.coach_id = uid and l.client_id = p_client and l.status = 'active') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return uid;
end $$;

-- ¿Soy coach activo con acuerdo vigente? Devuelve mi id.
create or replace function grasa.require_active_coach() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  perform grasa.require_coach_agreement();
  if not exists (select 1 from grasa.coaches c where c.user_id = uid and c.active) then raise exception 'forbidden' using errcode = '42501'; end if;
  return uid;
end $$;

-- En cuántas rutinas (plantillas + asignadas + la del día) de ese coach se usa un GIF.
create or replace function grasa.gif_uses(p_coach uuid, p_gif uuid) returns int
language sql stable security definer set search_path = '' as $$
  select ((select count(*) from grasa.routine_templates t where t.coach_id = p_coach
             and jsonb_path_exists(t.content, '$.days[*].exercises[*] ? (@.gif == $id)', jsonb_build_object('id', p_gif::text)))
        + (select count(*) from grasa.routines r where r.coach_id = p_coach
             and jsonb_path_exists(r.content, '$.days[*].exercises[*] ? (@.gif == $id)', jsonb_build_object('id', p_gif::text)))
        + (select count(*) from grasa.daily_routines d where d.coach_id = p_coach
             and jsonb_path_exists(d.content, '$.days[*].exercises[*] ? (@.gif == $id)', jsonb_build_object('id', p_gif::text))))::int;
$$;

-- ============ V4: biblioteca de GIFs (misma firma; ahora cuenta plantillas, asignadas y la del día) ============
create or replace function grasa.my_gifs()
returns table (id uuid, name text, mime text, size_bytes int, created_at timestamptz, uses int)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  perform grasa.require_coach_agreement();
  return query
  select g.id, g.name, g.mime, g.size_bytes, g.created_at, grasa.gif_uses(uid, g.id)
  from grasa.exercise_gifs g where g.coach_id = uid order by g.created_at desc, g.id;
end $$;

create or replace function grasa.delete_gif(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  if not exists (select 1 from grasa.exercise_gifs g where g.id = p_id and g.coach_id = uid) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if grasa.gif_uses(uid, p_id) > 0 then raise exception 'invalid' using errcode = '22023', detail = 'gif_in_use'; end if;
  delete from grasa.exercise_gifs where id = p_id and coach_id = uid;
end $$;

-- ============ V1: «Mis rutinas» (plantillas del coach) ============
-- p_id null = crear (máx. 50 por coach); con id = reemplazar esa plantilla (solo si es mía).
create or replace function grasa.save_template(p_id uuid, p_title text, p_content jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_active_coach(); t grasa.routine_templates; ti text;
begin
  ti := grasa.check_routine_input(uid, p_title, p_content);
  if p_id is null then
    perform pg_advisory_xact_lock(hashtextextended('rtpl:' || uid::text, 0));
    if (select count(*) from grasa.routine_templates x where x.coach_id = uid) >= 50 then
      raise exception 'invalid' using errcode = '22023', detail = 'template_limit';
    end if;
    insert into grasa.routine_templates (coach_id, title, content) values (uid, ti, p_content) returning * into t;
  else
    update grasa.routine_templates x set title = ti, content = p_content, updated_at = now() where x.id = p_id and x.coach_id = uid returning * into t;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;
  return grasa.template_out(t);
end $$;

create or replace function grasa.list_templates() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_active_coach();
begin
  return coalesce((select jsonb_agg(grasa.template_out(t) order by t.created_at, t.id) from grasa.routine_templates t where t.coach_id = uid), '[]'::jsonb);
end $$;

-- Borra la plantilla. Las copias ya asignadas y la del día NO cambian (son independientes). Reduce acceso: no exige acuerdo.
create or replace function grasa.delete_template(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  delete from grasa.routine_templates where id = p_id and coach_id = uid;
end $$;

-- ============ V2: asignar (copias), rutinas de un asesorado, mostrar/ocultar ============
-- Crea UNA COPIA independiente de la plantilla para cada asesorado de la lista (1 a 100, todos con vínculo ACTIVO; visible por defecto).
-- Todo o nada: si alguno no es tuyo (forbidden) o ya tiene 20 rutinas (invalid, detail routine_limit), no se crea ninguna.
create or replace function grasa.assign_template(p_template uuid, p_clients uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_active_coach(); t grasa.routine_templates; c uuid; r grasa.routines; res jsonb := '[]'::jsonb;
begin
  select x.* into t from grasa.routine_templates x where x.id = p_template and x.coach_id = uid;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_clients is null or cardinality(p_clients) not between 1 and 100 or array_position(p_clients, null) is not null then
    raise exception 'invalid' using errcode = '22023', detail = 'elige entre 1 y 100 asesorados';
  end if;
  foreach c in array (select array_agg(distinct u.v order by u.v) from unnest(p_clients) as u(v)) loop
    if not exists (select 1 from grasa.coach_links l where l.coach_id = uid and l.client_id = c and l.status = 'active') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('rrut:' || uid::text || c::text, 0));
    if (select count(*) from grasa.routines x where x.coach_id = uid and x.client_id = c) >= 20 then
      raise exception 'invalid' using errcode = '22023', detail = 'routine_limit';
    end if;
    insert into grasa.routines (coach_id, client_id, title, content, visible) values (uid, c, t.title, t.content, true) returning * into r;
    res := res || jsonb_build_array(grasa.routine_out(r));
  end loop;
  return res;
end $$;

-- Las rutinas que ese coach asignó a ese cliente (visibles u ocultas), de la más antigua a la más nueva.
create or replace function grasa.list_client_routines(p_client uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_coach_of(p_client);
begin
  return coalesce((select jsonb_agg(grasa.routine_out(r) order by r.created_at, r.id) from grasa.routines r where r.coach_id = uid and r.client_id = p_client), '[]'::jsonb);
end $$;

-- p_id null = crear una rutina nueva para ese cliente (máx. 20); con id = modificar ESA copia (la visibilidad no cambia).
create or replace function grasa.save_client_routine(p_client uuid, p_id uuid, p_title text, p_content jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_coach_of(p_client); r grasa.routines; ti text;
begin
  ti := grasa.check_routine_input(uid, p_title, p_content);
  if p_id is null then
    perform pg_advisory_xact_lock(hashtextextended('rrut:' || uid::text || p_client::text, 0));
    if (select count(*) from grasa.routines x where x.coach_id = uid and x.client_id = p_client) >= 20 then
      raise exception 'invalid' using errcode = '22023', detail = 'routine_limit';
    end if;
    insert into grasa.routines (coach_id, client_id, title, content) values (uid, p_client, ti, p_content) returning * into r;
  else
    update grasa.routines x set title = ti, content = p_content, updated_at = now()
      where x.id = p_id and x.coach_id = uid and x.client_id = p_client returning * into r;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;
  return grasa.routine_out(r);
end $$;

-- Quita la copia de ese asesorado (solo la propia del coach). Reduce acceso: no exige acuerdo ni vínculo activo.
create or replace function grasa.delete_client_routine(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  delete from grasa.routines where id = p_id and coach_id = uid;
end $$;

-- «Visible para el asesorado». Ocultar reduce acceso (no exige acuerdo ni vínculo); mostrar sí exige acuerdo y vínculo activo.
create or replace function grasa.set_routine_visible(p_id uuid, p_visible boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); r grasa.routines;
begin
  if p_visible is null then raise exception 'invalid' using errcode = '22023'; end if;
  select x.* into r from grasa.routines x where x.id = p_id and x.coach_id = uid;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_visible then perform grasa.require_coach_of(r.client_id); end if;
  update grasa.routines x set visible = p_visible where x.id = p_id returning * into r;
  return grasa.routine_out(r);
end $$;

-- ============ V3: «Rutina de hoy» ============
-- Publica (copia) una plantilla para TODOS los asesorados activos. p_day = el día 'AAAA-MM-DD' del dispositivo del coach; el servidor solo
-- acepta de hoy-2 a hoy+2 en Bogotá (cualquier zona horaria del mundo cae dentro). Reemplaza la anterior (una por coach).
create or replace function grasa.publish_daily(p_template uuid, p_day date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_active_coach(); t grasa.routine_templates; d grasa.daily_routines;
begin
  if p_day is null or p_day not between grasa.today_bogota() - 2 and grasa.today_bogota() + 2 then
    raise exception 'invalid' using errcode = '22023', detail = 'bad_day';
  end if;
  select x.* into t from grasa.routine_templates x where x.id = p_template and x.coach_id = uid;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into grasa.daily_routines as y (coach_id, template_id, title, content, day, published_at) values (uid, t.id, t.title, t.content, p_day, now())
    on conflict (coach_id) do update set template_id = excluded.template_id, title = excluded.title, content = excluded.content, day = excluded.day, published_at = now()
    returning * into d;
  return grasa.daily_out(d);
end $$;

-- La del día de ESTE coach (null si no hay), tal como está publicada (aunque su día ya pasó).
create or replace function grasa.get_daily() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_active_coach(); d grasa.daily_routines;
begin
  select x.* into d from grasa.daily_routines x where x.coach_id = uid;
  if not found then return null; end if;
  return grasa.daily_out(d);
end $$;

-- Quita la «Rutina de hoy». Reduce acceso: no exige acuerdo.
create or replace function grasa.clear_daily() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  delete from grasa.daily_routines where coach_id = uid;
end $$;

-- ============ Lo que ve el cliente ============
-- Sus rutinas VISIBLES (solo las de su coach con vínculo activo y coach activo), de la más antigua a la más nueva. También con el acceso en pausa por pago.
create or replace function grasa.my_routines() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  return coalesce((select jsonb_agg(grasa.routine_out(x) order by x.created_at, x.id)
                   from grasa.routines x
                   join grasa.coach_links l on l.coach_id = x.coach_id and l.client_id = x.client_id and l.status = 'active'
                   join grasa.coaches c on c.user_id = x.coach_id and c.active
                   where x.client_id = uid and x.visible), '[]'::jsonb);
end $$;

-- La «Rutina de hoy» de SU coach, solo si el día publicado es EXACTAMENTE p_today (la fecha de hoy de su dispositivo, 'AAAA-MM-DD'; así «hoy» es hoy
-- donde esté la persona, igual que Hábitos y Medidas). Sin vínculo activo, con coach inactivo o de otro día: null.
create or replace function grasa.my_daily(p_today date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); d grasa.daily_routines;
begin
  if p_today is null then return null; end if;
  select x.* into d from grasa.daily_routines x
    join grasa.coach_links l on l.coach_id = x.coach_id and l.client_id = uid and l.status = 'active'
    join grasa.coaches c on c.user_id = x.coach_id and c.active
    where x.day = p_today;
  if not found then return null; end if;
  return grasa.daily_out(d);
end $$;

-- ============ V5: funciones de v1.7 (misma firma) sobre «la primera rutina» ============
create or replace function grasa.save_routine(p_client uuid, p_title text, p_content jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_coach_of(p_client); r grasa.routines; ti text; first_id uuid;
begin
  ti := grasa.check_routine_input(uid, p_title, p_content);
  perform pg_advisory_xact_lock(hashtextextended('rrut:' || uid::text || p_client::text, 0));
  select x.id into first_id from grasa.routines x where x.coach_id = uid and x.client_id = p_client order by x.created_at, x.id limit 1;
  if first_id is null then
    insert into grasa.routines (coach_id, client_id, title, content) values (uid, p_client, ti, p_content) returning * into r;
  else
    update grasa.routines x set title = ti, content = p_content, updated_at = now() where x.id = first_id returning * into r;
  end if;
  return grasa.routine_out(r);
end $$;

create or replace function grasa.get_routine(p_client uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_coach_of(p_client); r grasa.routines;
begin
  select x.* into r from grasa.routines x where x.coach_id = uid and x.client_id = p_client order by x.created_at, x.id limit 1;
  if not found then return null; end if;
  return grasa.routine_out(r);
end $$;

create or replace function grasa.delete_routine(p_client uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  delete from grasa.routines where id = (select x.id from grasa.routines x where x.coach_id = uid and x.client_id = p_client order by x.created_at, x.id limit 1);
end $$;

create or replace function grasa.my_routine() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); r grasa.routines;
begin
  select x.* into r from grasa.routines x
    join grasa.coach_links l on l.coach_id = x.coach_id and l.client_id = x.client_id and l.status = 'active'
    join grasa.coaches c on c.user_id = x.coach_id and c.active
    where x.client_id = uid and x.visible order by x.created_at, x.id limit 1;
  if not found then return null; end if;
  return grasa.routine_out(r);
end $$;

-- ============ Permisos ============
revoke execute on function grasa.template_out(grasa.routine_templates), grasa.daily_out(grasa.daily_routines),
  grasa.check_routine_input(uuid, text, jsonb), grasa.require_coach_of(uuid), grasa.require_active_coach(), grasa.gif_uses(uuid, uuid),
  grasa.save_template(uuid, text, jsonb), grasa.list_templates(), grasa.delete_template(uuid), grasa.assign_template(uuid, uuid[]),
  grasa.list_client_routines(uuid), grasa.save_client_routine(uuid, uuid, text, jsonb), grasa.delete_client_routine(uuid),
  grasa.set_routine_visible(uuid, boolean), grasa.publish_daily(uuid, date), grasa.get_daily(), grasa.clear_daily(),
  grasa.my_routines(), grasa.my_daily(date)
  from public, anon, authenticated, service_role;
revoke execute on function grasa.routine_out(grasa.routines) from public, anon, authenticated, service_role;
grant execute on function grasa.save_template(uuid, text, jsonb), grasa.list_templates(), grasa.delete_template(uuid), grasa.assign_template(uuid, uuid[]),
  grasa.list_client_routines(uuid), grasa.save_client_routine(uuid, uuid, text, jsonb), grasa.delete_client_routine(uuid),
  grasa.set_routine_visible(uuid, boolean), grasa.publish_daily(uuid, date), grasa.get_daily(), grasa.clear_daily(),
  grasa.my_routines(), grasa.my_daily(date)
  to authenticated;
