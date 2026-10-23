-- R1 v1.6 · Sprint 11 («App para coaches», Etapa 1): cobros manuales y bloqueo por pago. Idempotente. UNA sola migración en vuelo.
-- El cliente le paga a su coach POR FUERA de la app; el coach lo marca. La plataforma no cobra nada.
--   P1  grasa.coach_links.paid_until (date, «pagado hasta») y paid_marked_at (cuándo lo marcó el coach). Solo el coach del vínculo
--       los cambia, con grasa.set_client_payment (SECURITY DEFINER). El cliente NO puede modificarlos (solo tiene SELECT).
--       Los vínculos que ya existían al aplicar esta migración reciben 30 días desde hoy (periodo de gracia, una sola vez).
--   P2  «Al día» = paid_until >= hoy en America/Bogota (Colombia no tiene horario de verano). Sin fecha o con fecha pasada = vencido.
--   P3  coach_clients() y my_link() devuelven paid_until, paid_marked_at, paid y days_left (para que el coach y el cliente lo vean).
--   P4  Cliente CON vínculo activo y vencido: sync_push y la subida de fotos fallan con 42501 'payment_required' (detail 'payment_required').
--       sync_pull, update_shares, leave_coach, borrar fotos y borrar la cuenta SIGUEN permitidos (derecho del titular: ver, descargar, borrar).
--       Cliente sin vínculo activo: nunca se bloquea.
-- Sin cambios en RLS ni en los permisos de tablas. Funciones nuevas: SECURITY DEFINER con search_path fijo; las internas, cerradas a la API.

-- ============ P1: columnas (y gracia única para los vínculos existentes) ============
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'grasa' and table_name = 'coach_links' and column_name = 'paid_until') then
    alter table grasa.coach_links add column paid_until date null, add column paid_marked_at timestamptz null;
    update grasa.coach_links set paid_until = (now() at time zone 'America/Bogota')::date + 30, paid_marked_at = now()
      where status = 'active';
  end if;
end $$;

-- ============ Auxiliares ============
-- Hoy en Bogotá (la fecha de corte de los pagos). INTERNA.
create or replace function grasa.today_bogota() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Bogota')::date;
$$;

-- ¿Ese cliente tiene un vínculo activo vencido (sin fecha o paid_until < hoy)? INTERNA: con un uuid libre permitiría sondear el pago de otros.
create or replace function grasa.client_payment_blocked(p_client uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from grasa.coach_links l
                 where l.client_id = p_client and l.status = 'active'
                   and (l.paid_until is null or l.paid_until < grasa.today_bogota()));
$$;

-- Lo mismo para la persona en sesión, sin parámetros (lo usa la política de Storage; no se puede sondear a otros).
create or replace function grasa.payment_blocked_me() returns boolean
language sql stable security definer set search_path = '' as $$
  select grasa.client_payment_blocked(auth.uid());
$$;

-- Exige estar al día (o no tener coach). La llaman sync_push (SECURITY INVOKER) y las funciones de subida.
create or replace function grasa.require_payment() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'auth' using errcode = '28000'; end if;
  if grasa.client_payment_blocked(auth.uid()) then
    raise exception 'payment_required' using errcode = '42501', detail = 'payment_required';
  end if;
end $$;

-- ============ P1: el coach marca el pago ============
-- p_paid_until: «pagado hasta» (null = sin pago registrado). Fecha razonable: de hoy − 400 a hoy + 400 días.
-- Solo el coach ACTIVO con el acuerdo vigente de ese vínculo ACTIVO. Devuelve el estado resultante.
create or replace function grasa.set_client_payment(p_client uuid, p_paid_until date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); l grasa.coach_links; today date := grasa.today_bogota();
begin
  perform grasa.require_coach_agreement();
  if p_client is null then raise exception 'invalid' using errcode = '22023'; end if;
  select x.* into l from grasa.coach_links x
    join grasa.coaches c on c.user_id = x.coach_id and c.active
    where x.coach_id = uid and x.client_id = p_client and x.status = 'active'
    for update of x;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_paid_until is not null and (p_paid_until < today - 400 or p_paid_until > today + 400) then
    raise exception 'invalid' using errcode = '22023', detail = 'la fecha de pago está fuera de un rango razonable';
  end if;
  update grasa.coach_links set paid_until = p_paid_until, paid_marked_at = now(), updated_at = now() where id = l.id;
  return jsonb_build_object('client_id', p_client, 'paid_until', p_paid_until, 'paid_marked_at', now(),
    'paid', p_paid_until is not null and p_paid_until >= today,
    'days_left', case when p_paid_until is null then null else p_paid_until - today end);
end $$;

-- ============ P3: coach_clients y my_link con el estado del pago ============
-- Cambian las columnas de salida: hay que borrar y volver a crear (y volver a conceder el permiso).
drop function if exists grasa.coach_clients();
create function grasa.coach_clients()
returns table (client_id uuid, display_name text, link_id uuid, since timestamptz, shares jsonb,
               last_activity timestamptz, over_free_limit boolean,
               paid_until date, paid_marked_at timestamptz, paid boolean, days_left int)
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
         row_number() over (order by l.created_at, l.id) > c.free_clients,
         l.paid_until, l.paid_marked_at,
         (l.paid_until is not null and l.paid_until >= grasa.today_bogota()),
         case when l.paid_until is null then null else l.paid_until - grasa.today_bogota() end
  from grasa.coach_links l
  join grasa.coaches c on c.user_id = l.coach_id
  left join core.profiles p on p.id = l.client_id
  where l.coach_id = auth.uid() and l.status = 'active'
  order by l.created_at;
end $$;
revoke execute on function grasa.coach_clients() from public, anon;
grant execute on function grasa.coach_clients() to authenticated;

drop function if exists grasa.my_link();
create function grasa.my_link()
returns table (id uuid, coach_id uuid, business_name text, share_body boolean, share_notes boolean,
               share_nutrition boolean, share_habits boolean, share_photos boolean, since timestamptz,
               paid_until date, paid_marked_at timestamptz, paid boolean, days_left int)
language sql stable security definer set search_path = '' as $$
  select l.id, l.coach_id, c.business_name, l.share_body, l.share_notes, l.share_nutrition, l.share_habits,
         l.share_photos, l.created_at, l.paid_until, l.paid_marked_at,
         (l.paid_until is not null and l.paid_until >= grasa.today_bogota()),
         case when l.paid_until is null then null else l.paid_until - grasa.today_bogota() end
  from grasa.coach_links l
  join grasa.coaches c on c.user_id = l.coach_id
  where l.client_id = auth.uid() and l.status = 'active'
  limit 1;
$$;
revoke execute on function grasa.my_link() from public, anon;
grant execute on function grasa.my_link() to authenticated;

-- ============ P4: sync_push exige estar al día ============
-- Mismo cuerpo que en r1_consentimientos_servidor; solo se añade require_payment() (después de los consentimientos).
create or replace function grasa.sync_push(p_records jsonb default '[]', p_photos jsonb default '[]') returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare uid uuid := grasa.require_uid(); r jsonb; got uuid; rejected_r jsonb := '[]'; rejected_p jsonb := '[]';
begin
  perform core.require_cloud_consent('grasa');
  perform grasa.require_payment();
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

-- ============ P4: la subida de fotos (Storage) también exige estar al día ============
-- Solo INSERT y UPDATE (subir o reemplazar). Leer y BORRAR siguen permitidos con el acceso en pausa.
drop policy if exists grasa_photos_owner_insert on storage.objects;
create policy grasa_photos_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'grasa-photos' and (storage.foldername(name))[1] = auth.uid()::text
              and not grasa.payment_blocked_me());
drop policy if exists grasa_photos_owner_update on storage.objects;
create policy grasa_photos_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'grasa-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'grasa-photos' and (storage.foldername(name))[1] = auth.uid()::text
              and not grasa.payment_blocked_me());

-- ============ Permisos ============
-- Las funciones nuevas nacen sin permisos: se cierran las internas y se conceden solo las que usa el propio usuario.
revoke execute on function grasa.today_bogota(), grasa.client_payment_blocked(uuid), grasa.payment_blocked_me(),
  grasa.require_payment(), grasa.set_client_payment(uuid, date) from public, anon, authenticated, service_role;
-- Solo informan del estado de la persona en sesión (sin parámetros de usuario).
grant execute on function grasa.payment_blocked_me(), grasa.require_payment() to authenticated;
-- El coach marca el pago (la propia función exige ser coach activo con acuerdo y vínculo activo con ese cliente).
grant execute on function grasa.set_client_payment(uuid, date) to authenticated;
