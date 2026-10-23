-- R1 v1.5 · Sprint 7: el servidor IMPONE los consentimientos (antes solo la app los exigía: quien llamara directo a la
-- API se los saltaba). Idempotente. UNA sola migración en vuelo (regla del equipo).
--   E1  Coach: become_coach, rotate_invite_code, coach_clients, coach_pull, add_comment y coach_photo_opened fallan con
--       42501 'forbidden' (detail 'coach_agreement_required') si el coach NO tiene vigente el acuerdo (A7).
--       Un código de invitación solo sirve si su coach tiene el acuerdo vigente (valid_coach_for): preview_invite_code
--       lo trata como inexistente y join_coach devuelve null (invalid_code), igual que un código caducado.
--   E3  Lectura del coach: coach_can_see (que usan coach_pull y las fotos) exige además que el CLIENTE tenga vigentes
--       sensitive_health y cloud_transfer. Si retira A3 o A4, el coach deja de ver sus datos en la siguiente consulta (A8).
--   E2  Cliente: sync_push, sync_pull y join_coach fallan con 42501 'consent_required' si NO tiene vigentes
--       sensitive_health (A3) y cloud_transfer (A4).
-- "Vigente" = el ÚLTIMO evento de ese tipo de la persona tiene granted = true. No se mira la versión del texto: la app
-- gestiona la re-aceptación por versión. Retirar la autorización (granted = false) bloquea de nuevo al instante.
-- Sin cambios en RLS ni en los permisos de tablas. Todas las funciones nuevas: SECURITY DEFINER con search_path fijo.
-- Las auxiliares internas no se conceden a ningún rol de la API; solo la comprobación del propio usuario va a authenticated.

-- ============ Auxiliares ============
-- ¿El último evento de ese tipo de p_user tiene granted = true? (INTERNA: no se concede a la API; con un uuid libre
-- permitiría sondear los consentimientos de otras personas.)
create or replace function core.consent_is_granted(p_user uuid, p_app text, p_kind text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select e.granted from core.consent_events e
                   where e.user_id = p_user and e.app_id = p_app and e.kind = p_kind
                   order by e.created_at desc, e.client_at desc, e.id desc limit 1), false);
$$;

-- Exige A3 (sensitive_health) y A4 (cloud_transfer) vigentes de la persona en sesión. Se llama desde las funciones de
-- sincronización (SECURITY INVOKER), por eso se concede a authenticated: solo informa del propio estado.
create or replace function core.require_cloud_consent(p_app text default 'grasa') returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'auth' using errcode = '28000'; end if;
  if not (core.consent_is_granted(auth.uid(), p_app, 'sensitive_health')
          and core.consent_is_granted(auth.uid(), p_app, 'cloud_transfer')) then
    raise exception 'consent_required' using errcode = '42501',
      detail = 'faltan las autorizaciones de datos de salud (A3) y copia en la nube (A4)';
  end if;
end $$;

-- ¿Ese coach tiene vigente el acuerdo del coach (A7)? (INTERNA)
create or replace function grasa.coach_has_agreement(p_coach uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select core.consent_is_granted(p_coach, 'grasa', 'coach_agreement');
$$;

-- Exige el acuerdo vigente de la persona en sesión (INTERNA: la llaman las funciones de coach, que son SECURITY DEFINER).
create or replace function grasa.require_coach_agreement() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'auth' using errcode = '28000'; end if;
  if not core.consent_is_granted(auth.uid(), 'grasa', 'coach_agreement') then
    raise exception 'forbidden' using errcode = '42501', detail = 'coach_agreement_required';
  end if;
end $$;

-- ============ E3: el coach solo ve a clientes que mantienen A3 + A4 ============
-- Misma firma y mismos permisos que en r1_grasa; se añade la condición sobre el consentimiento del cliente.
create or replace function grasa.coach_can_see(p_client uuid, p_scope text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from grasa.coach_links l
    join grasa.coaches c on c.user_id = l.coach_id and c.active
    where l.client_id = p_client and l.coach_id = auth.uid() and l.status = 'active'
      and core.consent_is_granted(p_client, 'grasa', 'sensitive_health')
      and core.consent_is_granted(p_client, 'grasa', 'cloud_transfer')
      and case p_scope when 'body' then l.share_body when 'notes' then l.share_notes
                       when 'nutrition' then l.share_nutrition when 'habits' then l.share_habits
                       when 'photos' then l.share_photos else false end);
$$;

-- ============ E1: coach ============
-- Un código solo sirve si su coach tiene el acuerdo vigente (además de activo, no caducado y con usos).
create or replace function grasa.valid_coach_for(p_code text) returns uuid
language sql stable security definer set search_path = '' as $$
  select c.user_id from grasa.coaches c
  where c.invite_code = upper(trim(p_code)) and c.active
    and (c.invite_expires_at is null or c.invite_expires_at > now())
    and (c.invite_max_uses is null or c.invite_uses < c.invite_max_uses)
    and grasa.coach_has_agreement(c.user_id);
$$;

create or replace function grasa.become_coach(p_business_name text) returns table (invite_code text)
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); code text;
begin
  perform grasa.require_coach_agreement();
  if p_business_name is null or char_length(trim(p_business_name)) not between 2 and 60 then
    raise exception 'invalid' using errcode = '22023';
  end if;
  if not exists (select 1 from grasa.coaches where user_id = uid) then
    loop
      code := grasa.new_invite_code();
      exit when not exists (select 1 from grasa.coaches c where c.invite_code = code);
    end loop;
    insert into grasa.coaches (user_id, business_name, invite_code) values (uid, trim(p_business_name), code);
  end if;
  insert into core.app_access (user_id, app_id, role) values (uid, 'grasa', 'coach'), (uid, 'grasa', 'client')
    on conflict do nothing;
  return query select c.invite_code from grasa.coaches c where c.user_id = uid;
end $$;

create or replace function grasa.rotate_invite_code(p_valid_days int default null, p_max_uses int default null) returns text
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); code text;
begin
  if not exists (select 1 from grasa.coaches where user_id = uid) then raise exception 'forbidden' using errcode = '42501'; end if;
  perform grasa.require_coach_agreement();
  if p_valid_days is not null and p_valid_days not between 1 and 365 then raise exception 'invalid' using errcode = '22023'; end if;
  loop
    code := grasa.new_invite_code();
    exit when not exists (select 1 from grasa.coaches c where c.invite_code = code);
  end loop;
  update grasa.coaches set invite_code = code, code_rotated_at = now(), invite_uses = 0,
    invite_expires_at = case when p_valid_days is null then null else now() + make_interval(days => p_valid_days) end,
    invite_max_uses = p_max_uses
  where user_id = uid;
  return code;
end $$;

-- Pasa de SQL a plpgsql para poder exigir el acuerdo. Mismas columnas y mismo resultado que en r1_fix_seguridad (O4).
-- v1.6: el tipo de salida cambió en 20261024120000_r1_pagos_coach.sql; se borra antes para que r1.sql siga siendo idempotente (se vuelve a conceder al final).
drop function if exists grasa.coach_clients();
create function grasa.coach_clients()
returns table (client_id uuid, display_name text, link_id uuid, since timestamptz, shares jsonb,
               last_activity timestamptz, over_free_limit boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform grasa.require_coach_agreement();
  return query
  select l.client_id, p.display_name, l.id, l.created_at,
         jsonb_build_object('body', l.share_body, 'notes', l.share_notes, 'nutrition', l.share_nutrition,
                            'habits', l.share_habits, 'photos', l.share_photos),
         (select max(r.server_updated_at) from grasa.records r
          where r.user_id = l.client_id
            and core.consent_is_granted(l.client_id, 'grasa', 'sensitive_health')
            and core.consent_is_granted(l.client_id, 'grasa', 'cloud_transfer')
            and (r.kind in ('profile','entry') or (r.kind = 'food' and l.share_nutrition) or (r.kind = 'habit' and l.share_habits))),
         row_number() over (order by l.created_at, l.id) > c.free_clients
  from grasa.coach_links l
  join grasa.coaches c on c.user_id = l.coach_id
  left join core.profiles p on p.id = l.client_id
  where l.coach_id = auth.uid() and l.status = 'active'
  order by l.created_at;
end $$;

create or replace function grasa.coach_pull(p_client uuid, p_since timestamptz default '1970-01-01T00:00:00Z')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare l grasa.coach_links; since timestamptz := coalesce(p_since, '1970-01-01T00:00:00Z') - interval '30 seconds';
  recs jsonb; phs jsonb; cms jsonb; cur timestamptz;
begin
  perform grasa.require_uid();
  perform grasa.require_coach_agreement();
  select * into l from grasa.coach_links
    where coach_id = auth.uid() and client_id = p_client and status = 'active';
  if not found or not grasa.coach_can_see(p_client, 'body') then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'nkey', r.nkey, 'date', r.date,
           'data', case when r.deleted_at is not null then '{}'::jsonb
                        when not l.share_notes then r.data - 'note' else r.data end,   -- H6: en TODO kind
           'updated_at', r.updated_at, 'deleted_at', r.deleted_at, 'server_updated_at', r.server_updated_at)
           order by r.server_updated_at), '[]'::jsonb), max(r.server_updated_at)
    into recs, cur
    from grasa.records r
    where r.user_id = p_client and r.server_updated_at > since
      and (r.kind in ('profile','entry')
           or (r.kind = 'food' and l.share_nutrition)
           or (r.kind = 'habit' and l.share_habits));              -- 'library' nunca
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'date', p.date, 'pose', p.pose, 'width', p.width,
           'height', p.height, 'storage_path', p.storage_path, 'created_at', p.created_at, 'updated_at', p.updated_at,
           'server_updated_at', p.server_updated_at) order by p.server_updated_at), '[]'::jsonb)
    into phs
    from grasa.photos p
    where l.share_photos and p.user_id = p_client and p.shared_with_coach and p.deleted_at is null
      and p.server_updated_at > since;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.server_updated_at), '[]'::jsonb) into cms
    from grasa.comments c where c.link_id = l.id and c.server_updated_at > since;
  return jsonb_build_object('records', recs, 'photos', phs, 'comments', cms,
                            'cursor', coalesce(cur, p_since), 'server_now', now());
end $$;

create or replace function grasa.add_comment(p_id uuid, p_client uuid, p_ref_date date, p_body text) returns grasa.comments
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); l grasa.coach_links; c grasa.comments;
begin
  perform grasa.require_coach_agreement();
  select * into l from grasa.coach_links where coach_id = uid and client_id = p_client and status = 'active';
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into grasa.comments (id, link_id, coach_id, client_id, ref_date, body)
  values (p_id, l.id, uid, p_client, p_ref_date, p_body)
  on conflict (id) do nothing returning * into c;
  if c.id is null then select * into c from grasa.comments where id = p_id and coach_id = uid; end if;
  if c.id is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return c;
end $$;

create or replace function grasa.coach_photo_opened(p_photo uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); owner uuid;
begin
  perform grasa.require_coach_agreement();
  select p.user_id into owner from grasa.photos p where p.id = p_photo;
  if owner is null or not grasa.coach_can_see_photo(owner, p_photo) then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into grasa.photo_views (photo_id, coach_id, client_id) values (p_photo, uid, owner);
end $$;

-- ============ E2: cliente ============
-- join_coach (cuerpo de r1_fix_seguridad D1 + la comprobación de consentimiento, antes de contar el intento).
create or replace function grasa.join_coach(p_code text, p_shares jsonb) returns grasa.coach_links
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); coach uuid; link grasa.coach_links;
begin
  if coalesce((p_shares ->> 'body')::boolean, false) is not true then
    raise exception 'invalid' using errcode = '22023', detail = 'compartir peso y medidas es obligatorio';
  end if;
  if coalesce(p_shares ->> 'text_hash', '') !~ '^[0-9a-f]{64}$' or coalesce(p_shares ->> 'version', '') = '' then
    raise exception 'invalid' using errcode = '22023', detail = 'p_shares necesita version y text_hash';
  end if;
  perform core.require_cloud_consent('grasa');
  if not grasa.count_attempt(uid) then raise exception 'rate_limited' using errcode = '54000'; end if;
  coach := grasa.valid_coach_for(p_code);
  if coach is null then return null; end if;
  perform 1 from grasa.coaches where user_id = coach for update;   -- serializa el conteo de usos
  if grasa.valid_coach_for(p_code) is null then return null; end if;
  if coach = uid then raise exception 'invalid' using errcode = '22023', detail = 'no puedes ser tu propio coach'; end if;
  update grasa.coach_links set status = 'ended', ended_at = now(), updated_at = now()
    where client_id = uid and status = 'active';
  insert into grasa.coach_links (coach_id, client_id, share_body, share_notes, share_nutrition, share_habits, share_photos)
  values (coach, uid, true, coalesce((p_shares ->> 'notes')::boolean, false),
          coalesce((p_shares ->> 'nutrition')::boolean, false), coalesce((p_shares ->> 'habits')::boolean, false),
          coalesce((p_shares ->> 'photos')::boolean, false))
  returning * into link;
  perform grasa.log_shares(uid, coach, p_shares, null);
  update grasa.coaches set invite_uses = invite_uses + 1 where user_id = coach;
  insert into core.app_access (user_id, app_id, role) values (uid, 'grasa', 'client') on conflict do nothing;
  return link;
end $$;

-- sync_push y sync_pull: SECURITY INVOKER (la RLS sigue mandando); solo se añade la comprobación del consentimiento.
create or replace function grasa.sync_push(p_records jsonb default '[]', p_photos jsonb default '[]') returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare uid uuid := grasa.require_uid(); r jsonb; got uuid; rejected_r jsonb := '[]'; rejected_p jsonb := '[]';
begin
  perform core.require_cloud_consent('grasa');
  if jsonb_typeof(coalesce(p_records, '[]')) <> 'array' or jsonb_typeof(coalesce(p_photos, '[]')) <> 'array' then
    raise exception 'invalid' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p_records, '[]')) + jsonb_array_length(coalesce(p_photos, '[]')) > 500 then
    raise exception 'invalid' using errcode = '22023', detail = 'máximo 500 elementos por llamada';
  end if;
  for r in select * from jsonb_array_elements(coalesce(p_records, '[]')) loop
    got := null;
    insert into grasa.records as t (id, user_id, kind, nkey, date, data, updated_at, deleted_at)
    values ((r ->> 'id')::uuid, uid, r ->> 'kind', r ->> 'nkey', (r ->> 'date')::date,
            coalesce(r -> 'data', '{}'::jsonb), (r ->> 'updated_at')::timestamptz, (r ->> 'deleted_at')::timestamptz)
    on conflict (user_id, kind, nkey) do update
      set data = excluded.data, date = excluded.date, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at
      where excluded.updated_at > t.updated_at
         or (excluded.updated_at = t.updated_at and excluded.data::text > t.data::text)
    returning t.id into got;
    if got is null then   -- ganó la fila del servidor: se devuelve para que el cliente la fusione
      rejected_r := rejected_r || (select to_jsonb(t) - 'user_id' from grasa.records t
                                   where t.user_id = uid and t.kind = r ->> 'kind' and t.nkey = r ->> 'nkey');
    end if;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(p_photos, '[]')) loop
    got := null;
    insert into grasa.photos as t (id, user_id, date, pose, width, height, storage_path, shared_with_coach,
                                   created_at, updated_at, deleted_at)
    values ((r ->> 'id')::uuid, uid, (r ->> 'date')::date, r ->> 'pose', (r ->> 'width')::int, (r ->> 'height')::int,
            r ->> 'storage_path', coalesce((r ->> 'shared_with_coach')::boolean, false),
            (r ->> 'created_at')::timestamptz, (r ->> 'updated_at')::timestamptz, (r ->> 'deleted_at')::timestamptz)
    on conflict (id) do update
      set date = excluded.date, pose = excluded.pose, width = excluded.width, height = excluded.height,
          shared_with_coach = excluded.shared_with_coach, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at
      where excluded.updated_at > t.updated_at
    returning t.id into got;
    if got is null then
      rejected_p := rejected_p || (select to_jsonb(t) - 'user_id' from grasa.photos t where t.id = (r ->> 'id')::uuid);
    end if;
  end loop;
  return jsonb_build_object('server_now', now(), 'rejected', jsonb_build_object('records', rejected_r, 'photos', rejected_p));
end $$;

create or replace function grasa.sync_pull(p_since timestamptz default '1970-01-01T00:00:00Z', p_limit int default 1000,
  p_overlap boolean default true)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare uid uuid := grasa.require_uid();
  since timestamptz := coalesce(p_since, '1970-01-01T00:00:00Z') - case when coalesce(p_overlap, true) then interval '30 seconds' else interval '0' end;
  lim int := least(greatest(coalesce(p_limit, 1000), 1), 5000);
  recs jsonb; phs jsonb; cms jsonb; nr int; np int; nc int; mr timestamptz; mp timestamptz; mc timestamptz;
  more boolean; cur timestamptz;
begin
  perform core.require_cloud_consent('grasa');
  select coalesce(jsonb_agg(to_jsonb(x) - 'user_id' order by x.server_updated_at), '[]'), count(*), max(x.server_updated_at)
    into recs, nr, mr
    from (select * from grasa.records r where r.user_id = uid and r.server_updated_at >= since
          order by r.server_updated_at limit lim) x;
  select coalesce(jsonb_agg(to_jsonb(x) - 'user_id' order by x.server_updated_at), '[]'), count(*), max(x.server_updated_at)
    into phs, np, mp
    from (select * from grasa.photos p where p.user_id = uid and p.server_updated_at >= since
          order by p.server_updated_at limit lim) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.server_updated_at), '[]'), count(*), max(x.server_updated_at)
    into cms, nc, mc
    from (select * from grasa.comments c where c.client_id = uid and c.server_updated_at >= since
          order by c.server_updated_at limit lim) x;
  more := nr = lim or np = lim or nc = lim;
  cur := case when more then least(case when nr = lim then mr end, case when np = lim then mp end, case when nc = lim then mc end)
              else greatest(mr, mp, mc) end;
  return jsonb_build_object('records', recs, 'photos', phs, 'comments', cms,
                            'cursor', coalesce(cur, p_since), 'has_more', more, 'server_now', now());
end $$;

-- ============ Permisos ============
-- create or replace conserva los permisos de las funciones que ya existían. Las nuevas nacen sin ellos (se cierran las
-- internas y se concede solo la comprobación del propio usuario).
revoke execute on function core.consent_is_granted(uuid, text, text), grasa.coach_has_agreement(uuid),
  grasa.require_coach_agreement() from public, anon, authenticated, service_role;
revoke execute on function core.require_cloud_consent(text) from public, anon, authenticated, service_role;
grant execute on function core.require_cloud_consent(text) to authenticated;
