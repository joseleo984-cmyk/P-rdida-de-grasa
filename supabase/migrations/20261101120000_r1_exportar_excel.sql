-- R1 v1.14 · M6 «Exportar a Excel» del coach (concepto jurídico 6, 25/10/2026). Aditiva e idempotente: se aplica encima de v1.13.
--   X1  grasa.coach_exports: registro de CADA exportación. Guarda quién (el coach), cuándo, CUÁNTOS asesorados (un número: nunca quiénes),
--       qué categorías (medidas, comidas, habitos, entrenos), el rango de fechas, que la casilla de custodia se marcó y con qué versión del
--       acuerdo. NUNCA el contenido de los datos. Nadie la lee por la API de tablas (RLS sin políticas y sin permisos).
--   X2  grasa.log_export(...): la llama la app ANTES de entregar el archivo. Exige coach ACTIVO, con el acuerdo vigente y, además, con la
--       versión del acuerdo que trae la cláusula 14 «Descarga y custodia local de datos de los asesorados» (0.5-A7-coach) como ÚLTIMA aceptación
--       registrada (si no: forbidden, detail 'export_agreement_required'); la casilla marcada (si no: invalid, 'custody_required'); al menos un
--       asesorado y no más de los que tiene vinculados y visibles; categorías conocidas (las fotos no existen como categoría); rango válido.
--       Límite: 60 exportaciones por coach y día.
--       Los DATOS del archivo salen de coach_pull (mismos permisos de siempre: vínculo activo, A3 + A4 del asesorado, comidas y hábitos solo si los
--       comparte, notas solo con share_notes, nunca pause_private, nunca fotos, salud L4 ni dolor): esta migración no abre ningún dato nuevo.
--   X3  grasa.my_exports(): el coach ve SU propio historial (las 50 últimas).
--   X4  Admin (M9): grasa.admin_coach_usage añade `exports` = CUÁNTAS exportaciones hizo ese coach en el mes. Solo la cantidad.
-- Fuera de alcance: las alertas L6, la tarjeta 106/192 y las cláusulas 7.3/7.4 (Etapa 3).

-- ============ X1: registro de exportaciones (sin contenido) ============
create table if not exists grasa.coach_exports (
  id                uuid primary key default gen_random_uuid(),
  coach_id          uuid not null references auth.users(id) on delete cascade,
  created_at        timestamptz not null default now(),
  clients_count     int not null check (clients_count between 1 and 1000),
  categories        text[] not null check (cardinality(categories) between 1 and 4
                      and categories <@ array['medidas', 'comidas', 'habitos', 'entrenos']::text[]),
  date_from         date not null,
  date_to           date not null,
  custody_ack       boolean not null check (custody_ack),
  agreement_version text not null check (char_length(agreement_version) between 1 and 20),
  check (date_from <= date_to)
);
create index if not exists coach_exports_coach on grasa.coach_exports (coach_id, created_at desc);
alter table grasa.coach_exports enable row level security;
revoke all on grasa.coach_exports from public, anon, authenticated, service_role;

-- Versiones del acuerdo del coach que traen la cláusula 14 (las mismas que CT.A7_EXPORT_VERSIONS en consent-texts-solo.js). INTERNA.
create or replace function grasa.export_agreement_versions() returns text[]
language sql immutable set search_path = '' as $$ select array['0.5-A7-coach']::text[] $$;

-- ¿La ÚLTIMA aceptación del acuerdo registrada por ese coach está vigente y trae la cláusula 14? Devuelve su versión o null. INTERNA.
create or replace function grasa.export_agreement_of(p_coach uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when x.granted and x.version = any (grasa.export_agreement_versions()) then x.version end
  from (select e.granted, e.version from core.consent_events e
        where e.user_id = p_coach and e.app_id = 'grasa' and e.kind = 'coach_agreement'
        order by e.created_at desc, e.client_at desc, e.id desc limit 1) x;
$$;

-- ============ X2: registrar una exportación ============
create or replace function grasa.log_export(p_clients int, p_categories text[], p_from date, p_to date, p_custody boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_active_coach(); today date := grasa.today_bogota(); ver text; cats text[]; n int; r grasa.coach_exports;
begin
  ver := grasa.export_agreement_of(uid);
  if ver is null then raise exception 'forbidden' using errcode = '42501', detail = 'export_agreement_required'; end if;
  if p_custody is distinct from true then raise exception 'invalid' using errcode = '22023', detail = 'custody_required'; end if;
  select array_agg(distinct c order by c) into cats from unnest(coalesce(p_categories, '{}'::text[])) c;
  if cats is null or cardinality(cats) > 4 or not cats <@ array['medidas', 'comidas', 'habitos', 'entrenos']::text[] then
    raise exception 'invalid' using errcode = '22023', detail = 'categoría no válida';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to > today + 1 or p_from < today - 3660 then
    raise exception 'invalid' using errcode = '22023', detail = 'rango de fechas no válido';
  end if;
  select count(*) into n from grasa.coach_links l
    where l.coach_id = uid and l.status = 'active' and grasa.coach_can_see(l.client_id, 'body');
  if p_clients is null or p_clients < 1 or p_clients > n then
    raise exception 'invalid' using errcode = '22023', detail = 'número de asesorados no válido';
  end if;
  if (select count(*) from grasa.coach_exports e where e.coach_id = uid and e.created_at > now() - interval '1 day') >= 60 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  insert into grasa.coach_exports (coach_id, clients_count, categories, date_from, date_to, custody_ack, agreement_version)
    values (uid, p_clients, cats, p_from, p_to, true, ver) returning * into r;
  return jsonb_build_object('id', r.id, 'created_at', r.created_at, 'clients', r.clients_count, 'categories', to_jsonb(r.categories),
                            'from', r.date_from, 'to', r.date_to);
end $$;

-- ============ X3: historial propio del coach ============
create or replace function grasa.my_exports()
returns table (id uuid, created_at timestamptz, clients int, categories text[], date_from date, date_to date)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  if not exists (select 1 from grasa.coaches c where c.user_id = uid) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select e.id, e.created_at, e.clients_count, e.categories, e.date_from, e.date_to
    from grasa.coach_exports e where e.coach_id = uid order by e.created_at desc limit 50;
end $$;

-- ============ X4: M9, solo la CANTIDAD de exportaciones del coach en el mes (mismo cuerpo que v1.13 + `exports`) ============
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
    -- v1.14 (M6): SOLO cuántas exportaciones a Excel hizo el coach en el mes. Nunca quién, qué asesorados ni qué datos.
    'exports', (select count(*) from grasa.coach_exports e where e.coach_id = p_coach
                and e.created_at >= date_trunc('month', p_month) and e.created_at < date_trunc('month', p_month) + interval '1 month'),
    'ref', ref) into out;
  return out;
end $$;

-- ============ Permisos: nada por defecto; solo authenticated en las RPC (que comprueban el rol dentro). Nunca anon. ============
revoke execute on function grasa.export_agreement_versions(), grasa.export_agreement_of(uuid), grasa.log_export(int, text[], date, date, boolean),
  grasa.my_exports(), grasa.admin_coach_usage(uuid, date)
  from public, anon, authenticated, service_role;
grant execute on function grasa.log_export(int, text[], date, date, boolean), grasa.my_exports(), grasa.admin_coach_usage(uuid, date) to authenticated;
