-- R1 v1.12 · Estilo v2: aviso de dolor al terminar (o al salir de) el entreno guiado. Concepto jurídico 4 (equipo/legal/concepto-4-2026-10-25.md).
-- Aditiva e idempotente: se aplica encima de v1.11. Mismo patrón que health_answers / health_flag (v1.11).
--   D1  grasa.pain_reports: UNA fila por (persona, día) con la respuesta cerrada a «¿Sentiste dolor que te impidiera entrenar con normalidad?»
--       (pain = true/false), la versión y el hash del texto que vio. Nunca se guarda qué duele ni ningún detalle (no hay campo de texto).
--       RLS activada SIN políticas ni permisos: nadie la lee ni la escribe por la API de tablas. Solo se escribe con grasa.report_pain
--       (SECURITY DEFINER, con auth.uid(): cada persona solo escribe la suya). Exige A3 + A4 vigentes y un vínculo activo con un coach activo
--       (si no hay a quién avisar, se rechaza y la app no dice «Tu coach ha sido notificado»).
--   D2  El coach NO lee la tabla. En grasa.coach_clients() recibe `pain_reported` (date): el día del último «Sí» que aún no marcó como revisado,
--       solo de su asesorado con vínculo activo y con A3 + A4 vigentes. NO depende de los permisos opcionales (hábitos, cuerpo, etc.): el aviso
--       llega siempre que la persona tenga el vínculo activo. grasa.review_pain(cliente) lo marca revisado (solo su coach).
--   D3  P1: lo reportado mientras la persona está en pausa (vínculo activo vencido) o con fecha dentro de una pausa cerrada queda
--       pause_private = true (lo decide el servidor, igual que grasa.mark_pause_private) y no llega al coach, ni después de reactivar.
--       La app no hace la pregunta en pausa (el entreno guiado no se ofrece), así que «Tu coach ha sido notificado» nunca se muestra en pausa.

create table if not exists grasa.pain_reports (
  user_id       uuid not null references auth.users(id) on delete cascade,
  day           date not null,
  pain          boolean not null,
  version       text not null check (char_length(version) between 1 and 20),
  text_hash     text not null check (text_hash ~ '^[0-9a-f]{64}$'),
  pause_private boolean not null default false,
  reported_at   timestamptz not null default now(),
  reviewed_at   timestamptz null,
  primary key (user_id, day)
);
alter table grasa.pain_reports enable row level security;
revoke all on grasa.pain_reports from public, anon, authenticated, service_role;

-- El asesorado responde (No / Sí) para un día (el del teléfono: hoy, ayer o mañana respecto de Bogotá). Un nuevo «Sí» vuelve a quedar sin revisar.
create or replace function grasa.report_pain(p_day date, p_pain boolean, p_version text, p_text_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); today date := grasa.today_bogota(); priv boolean; r grasa.pain_reports;
begin
  perform core.require_cloud_consent('grasa');
  if p_day is null or p_pain is null or p_day not between today - 1 and today + 1
     or coalesce(p_version, '') = '' or char_length(p_version) > 20 or coalesce(p_text_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid' using errcode = '22023';
  end if;
  if not exists (select 1 from grasa.coach_links l join grasa.coaches c on c.user_id = l.coach_id and c.active
                 where l.client_id = uid and l.status = 'active') then
    raise exception 'not_found' using errcode = 'P0002', detail = 'no_coach';
  end if;
  priv := grasa.client_payment_blocked(uid) or grasa.day_in_pause(uid, p_day);
  insert into grasa.pain_reports as t (user_id, day, pain, version, text_hash, pause_private, reported_at, reviewed_at)
  values (uid, p_day, p_pain, p_version, p_text_hash, priv, now(), null)
  on conflict (user_id, day) do update
    set pain = excluded.pain, version = excluded.version, text_hash = excluded.text_hash, reported_at = excluded.reported_at,
        pause_private = t.pause_private or excluded.pause_private,
        reviewed_at = case when excluded.pain then null else t.reviewed_at end
  returning * into r;
  return jsonb_build_object('day', r.day, 'pain', r.pain, 'notified', r.pain and not r.pause_private);
end $$;

-- Día del último «Sí» sin revisar y fuera de la pausa (null si no hay). INTERNA: con un uuid libre permitiría sondear a otros.
create or replace function grasa.pain_flag(p_client uuid) returns date
language sql stable security definer set search_path = '' as $$
  select max(x.day) from grasa.pain_reports x
  where x.user_id = p_client and x.pain and x.reviewed_at is null and not x.pause_private;
$$;

-- El coach (activo, con acuerdo y vínculo activo con esa persona) marca como revisado lo que ella reportó. Devuelve el indicador que queda.
create or replace function grasa.review_pain(p_client uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_coach_of(p_client);
begin
  update grasa.pain_reports set reviewed_at = now()
    where user_id = p_client and pain and reviewed_at is null and not pause_private;
  return jsonb_build_object('client_id', p_client, 'pain_reported', grasa.pain_flag(p_client));
end $$;

-- ============ coach_clients con el indicador «Reportó dolor» (cambian las columnas: borrar y volver a crear; mismo cuerpo que v1.11) ============
drop function if exists grasa.coach_clients();
create function grasa.coach_clients()
returns table (client_id uuid, display_name text, link_id uuid, since timestamptz, shares jsonb,
               last_activity timestamptz, over_free_limit boolean,
               paid_until date, paid_marked_at timestamptz, paid boolean, days_left int,
               protein_goal_g int, health_restriction boolean, pregnancy_state boolean, pauses jsonb, pain_reported date)
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
              then grasa.pain_flag(l.client_id) end
  from grasa.coach_links l
  join grasa.coaches c on c.user_id = l.coach_id
  left join core.profiles p on p.id = l.client_id
  where l.coach_id = auth.uid() and l.status = 'active'
  order by l.created_at;
end $$;

-- ============ Permisos ============
revoke execute on function grasa.report_pain(date, boolean, text, text), grasa.pain_flag(uuid), grasa.review_pain(uuid), grasa.coach_clients()
  from public, anon, authenticated, service_role;
grant execute on function grasa.report_pain(date, boolean, text, text), grasa.review_pain(uuid), grasa.coach_clients() to authenticated;
