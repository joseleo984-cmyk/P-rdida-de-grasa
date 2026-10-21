-- R1 · Correcciones de la revisión de seguridad de QA (equipo/handoffs/2026-10-21-S3-1-qa-veredicto.md). Idempotente.
--   D1  join_coach: un código inválido ya NO lanza error (devuelve null) para que el intento quede contado; los intentos
--       se serializan por usuario (pg_advisory_xact_lock) y se purgan a los 1 día.
--   D2  FK con borrado en cascada en photo_views e invite_attempts (la baja no deja metadatos huérfanos).
--   D3  delete_my_account se niega si quedan fotos del usuario en Storage; función de barrido para service_role.
--   O1  Permisos: se revoca TODO lo concedido directamente a authenticated/service_role y se vuelve a conceder
--       exactamente la lista blanca (por si el proyecto real tiene privilegios por defecto en esquemas nuevos).
--   O4  coach_clients.last_activity solo con categorías compartidas.   O7  coach_pull no devuelve datos de lápidas.

-- ============ D1: límite de intentos que no se puede eludir ============
create or replace function grasa.count_attempt(p_uid uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  -- Serializa por usuario: N llamadas simultáneas no pueden pasar todas con < 20.
  perform pg_advisory_xact_lock(hashtext('grasa:invite:' || p_uid::text));
  delete from grasa.invite_attempts a where a.user_id = p_uid and a.created_at < now() - interval '1 day';
  if (select count(*) from grasa.invite_attempts a where a.user_id = p_uid and a.created_at > now() - interval '1 hour') >= 20 then
    return false;
  end if;
  insert into grasa.invite_attempts (user_id) values (p_uid);
  return true;
end $$;

-- Código inválido, caducado o agotado → devuelve NULL (remote.js lo convierte en RemoteError('invalid_code')).
-- No se lanza error para que la transacción confirme el intento. Las comprobaciones que no dependen del código
-- (categorías, versión, hash) van ANTES: así un error no revela si el código existe.
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

-- ============ D2: sin metadatos huérfanos tras la baja ============
delete from grasa.photo_views v where not exists (select 1 from auth.users u where u.id = v.client_id)
  or not exists (select 1 from auth.users u where u.id = v.coach_id)
  or not exists (select 1 from grasa.photos p where p.id = v.photo_id);
delete from grasa.invite_attempts a where not exists (select 1 from auth.users u where u.id = a.user_id);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'photo_views_client_fk') then
    alter table grasa.photo_views add constraint photo_views_client_fk foreign key (client_id) references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'photo_views_coach_fk') then
    alter table grasa.photo_views add constraint photo_views_coach_fk foreign key (coach_id) references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'photo_views_photo_fk') then
    alter table grasa.photo_views add constraint photo_views_photo_fk foreign key (photo_id) references grasa.photos(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'invite_attempts_user_fk') then
    alter table grasa.invite_attempts add constraint invite_attempts_user_fk foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
end $$;

-- ============ D3: la baja no puede dejar fotos en Storage ============
-- En Supabase los archivos no se pueden borrar por SQL (hay que usar la API de Storage): la app borra primero
-- '{uid}/*' de 'grasa-photos' y después llama aquí. Si quedan archivos, se niega y la app reintenta.
create or replace function core.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'auth' using errcode = '28000'; end if;
  if exists (select 1 from storage.objects o
             where o.bucket_id = 'grasa-photos' and (storage.foldername(o.name))[1] = auth.uid()::text) then
    raise exception 'invalid' using errcode = '22023', detail = 'borra primero tus fotos de Storage';
  end if;
  delete from auth.users where id = auth.uid();
end $$;

-- Red de seguridad (bajas hechas desde el panel de Supabase, fallos a mitad): carpetas del bucket sin usuario.
-- Solo service_role. La usa supabase/tools/sweep-orphan-photos.js, que borra los archivos con la API de Storage.
create or replace function grasa.orphan_photo_folders() returns table (folder text, files bigint)
language sql stable security definer set search_path = '' as $$
  select (storage.foldername(o.name))[1], count(*)
  from storage.objects o
  where o.bucket_id = 'grasa-photos'
    and not exists (select 1 from auth.users u where u.id::text = (storage.foldername(o.name))[1])
  group by 1;
$$;

-- ============ O7: coach_pull sin datos en las lápidas ============
create or replace function grasa.coach_pull(p_client uuid, p_since timestamptz default '1970-01-01T00:00:00Z')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare l grasa.coach_links; since timestamptz := coalesce(p_since, '1970-01-01T00:00:00Z') - interval '30 seconds';
  recs jsonb; phs jsonb; cms jsonb; cur timestamptz;
begin
  perform grasa.require_uid();
  select * into l from grasa.coach_links
    where coach_id = auth.uid() and client_id = p_client and status = 'active';
  if not found or not grasa.coach_can_see(p_client, 'body') then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'nkey', r.nkey, 'date', r.date,
           'data', case when r.deleted_at is not null then '{}'::jsonb
                        when r.kind = 'entry' and not l.share_notes then r.data - 'note' else r.data end,
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

-- ============ O4: última actividad solo de lo que el cliente comparte ============
create or replace function grasa.coach_clients()
returns table (client_id uuid, display_name text, link_id uuid, since timestamptz, shares jsonb,
               last_activity timestamptz, over_free_limit boolean)
language sql stable security definer set search_path = '' as $$
  select l.client_id, p.display_name, l.id, l.created_at,
         jsonb_build_object('body', l.share_body, 'notes', l.share_notes, 'nutrition', l.share_nutrition,
                            'habits', l.share_habits, 'photos', l.share_photos),
         (select max(r.server_updated_at) from grasa.records r
          where r.user_id = l.client_id
            and (r.kind in ('profile','entry') or (r.kind = 'food' and l.share_nutrition) or (r.kind = 'habit' and l.share_habits))),
         row_number() over (order by l.created_at, l.id) > c.free_clients
  from grasa.coach_links l
  join grasa.coaches c on c.user_id = l.coach_id
  left join core.profiles p on p.id = l.client_id
  where l.coach_id = auth.uid() and l.status = 'active'
  order by l.created_at;
$$;

-- ============ O1: permisos exactos (lista blanca) ============
revoke all on all tables in schema core, grasa from public, anon, authenticated, service_role;
revoke all on all sequences in schema core, grasa from public, anon, authenticated, service_role;
revoke execute on all functions in schema core, grasa from public, anon, authenticated, service_role;
revoke all on schema core, grasa from public, anon;
grant usage on schema core, grasa to authenticated, service_role;

grant select on core.apps, core.profiles, core.app_access, core.consent_events to authenticated;
grant update (display_name) on core.profiles to authenticated;
grant insert on core.consent_events to authenticated;
grant select on grasa.coaches, grasa.coach_links, grasa.comments, grasa.photo_views to authenticated;
grant select, insert, update on grasa.records, grasa.photos to authenticated;

grant execute on function
  core.my_roles(text), core.join_app(text), core.my_consents(text), core.delete_my_account(), core.has_role(text, text),
  core.record_consent(text, text, boolean, text, text, timestamptz, uuid),
  grasa.coach_can_see(uuid, text), grasa.coach_can_see_photo(uuid, uuid), grasa.try_uuid(text), grasa.require_uid(),
  grasa.become_coach(text), grasa.rotate_invite_code(int, int), grasa.preview_invite_code(text),
  grasa.join_coach(text, jsonb), grasa.update_shares(jsonb), grasa.leave_coach(), grasa.end_client(uuid),
  grasa.coach_clients(), grasa.coach_pull(uuid, timestamptz), grasa.sync_push(jsonb, jsonb),
  grasa.sync_pull(timestamptz, int, boolean), grasa.add_comment(uuid, uuid, date, text), grasa.delete_comment(uuid),
  grasa.mark_comment_read(uuid), grasa.coach_photo_opened(uuid), grasa.billing_active_clients(date)
to authenticated;
grant execute on function grasa.orphan_photo_folders() to service_role;
