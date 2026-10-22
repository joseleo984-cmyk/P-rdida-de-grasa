-- R1 v1.4 · Sprint 6: autorizaciones A1–A8 (equipo/legal/borradores/autorizaciones-en-app.md) y bloqueos de la
-- preasesoría legal. Idempotente. UNA sola migración en vuelo (regla del equipo).
--   C1  Nuevos tipos de consentimiento: cloud_transfer (A4), photo_view_coach (A6b), coach_agreement (A7).
--       A6a sigue siendo `photos_cloud` (ya existía en el CHECK; no se duplica con otro nombre).
--   C2  Compartir con el coach nace APAGADO por categoría (A5 sin casillas premarcadas): defaults a false.
--   C3  core.consent_archive: prueba MÍNIMA y seudonimizada del consentimiento, que sobrevive a la baja de la cuenta
--       (preasesoría P11/P2). Solo inserción, sin FK a auth.users, sin correo ni nombre, ilegible con los roles de la API.
--   C4  core.delete_my_account copia los consentimientos al archivo ANTES de borrar en cascada.
-- Todo lo demás de seguridad queda igual: RLS, SECURITY DEFINER con search_path fijo, lista blanca de privilegios.

-- ============ C1: tipos de consentimiento ============
alter table core.consent_events drop constraint if exists consent_events_kind_check;
alter table core.consent_events add constraint consent_events_kind_check check (kind in (
  'terms', 'privacy', 'adult', 'sensitive_health', 'cloud_transfer', 'photos_cloud', 'photo_view_coach', 'coach_agreement',
  'share_body', 'share_notes', 'share_nutrition', 'share_habits', 'share_photos'));

-- ============ C2: compartir apagado por defecto ============
alter table grasa.coach_links alter column share_nutrition set default false;
alter table grasa.coach_links alter column share_habits set default false;

-- ============ C3: archivo mínimo seudonimizado de la prueba del consentimiento ============
-- Sal del servidor: una sola fila, la crea esta migración y nunca sale de la base (nadie la lee por la API).
create table if not exists core.archive_secret (
  singleton boolean primary key default true check (singleton),
  salt      text not null
);
insert into core.archive_secret (singleton, salt)
values (true, encode(sha256(convert_to(gen_random_uuid()::text || clock_timestamp()::text || gen_random_uuid()::text, 'UTF8')), 'hex'))
on conflict (singleton) do nothing;

create table if not exists core.consent_archive (
  id               uuid primary key default gen_random_uuid(),
  user_pseudo_id   text not null check (user_pseudo_id ~ '^[0-9a-f]{64}$'),   -- sha256(sal || ':' || user_id): no es el uuid
  coach_pseudo_id  text null check (coach_pseudo_id ~ '^[0-9a-f]{64}$'),
  app_id           text not null,
  kind             text not null check (kind in (
    'terms', 'privacy', 'adult', 'sensitive_health', 'cloud_transfer', 'photos_cloud', 'photo_view_coach', 'coach_agreement',
    'share_body', 'share_notes', 'share_nutrition', 'share_habits', 'share_photos')),
  action           text not null check (action in ('grant', 'revoke')),
  version          text not null check (char_length(version) between 1 and 20),
  text_hash        text not null check (text_hash ~ '^[0-9a-f]{64}$'),
  client_at        timestamptz not null,
  event_at         timestamptz not null,                       -- cuándo llegó al servidor el evento original
  archived_at      timestamptz not null default now(),         -- fecha de baja de la cuenta
  -- Plazo máximo propuesto (borrador: 3 a 5 años; lo fija el abogado). NO se borra solo: el borrado queda para el
  -- dueño de la base cuando se decida el plazo (el disparador permite borrar solo filas vencidas).
  purge_after      timestamptz not null default now() + interval '5 years'
);
create index if not exists consent_archive_user on core.consent_archive (user_pseudo_id, app_id, kind, event_at);

create or replace function core.consent_archive_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and old.purge_after < now() then return old; end if;
  raise exception 'consent_archive es solo-inserción (% no permitido)', tg_op using errcode = '42501';
end $$;
drop trigger if exists consent_archive_no_update on core.consent_archive;
create trigger consent_archive_no_update before update or delete on core.consent_archive
  for each row execute function core.consent_archive_guard();
drop trigger if exists consent_archive_no_truncate on core.consent_archive;
create trigger consent_archive_no_truncate before truncate on core.consent_archive
  for each statement execute function core.consent_archive_guard();

-- RLS activada y SIN políticas: ni authenticated ni service_role la leen. Solo el dueño de la base (SQL Editor).
alter table core.archive_secret enable row level security;
alter table core.consent_archive enable row level security;
revoke all on core.archive_secret, core.consent_archive from public, anon, authenticated, service_role;
revoke execute on function core.consent_archive_guard() from public, anon, authenticated, service_role;

-- ============ C4: la baja conserva solo la prueba mínima ============
create or replace function core.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_salt text;
begin
  if v_uid is null then raise exception 'auth' using errcode = '28000'; end if;
  if exists (select 1 from storage.objects o
             where o.bucket_id = 'grasa-photos' and (storage.foldername(o.name))[1] = v_uid::text) then
    raise exception 'invalid' using errcode = '22023', detail = 'borra primero tus fotos de Storage';
  end if;
  select s.salt into v_salt from core.archive_secret s where s.singleton;
  -- Misma transacción que el borrado: o se archiva y se borra, o no pasa nada.
  insert into core.consent_archive (user_pseudo_id, coach_pseudo_id, app_id, kind, action, version, text_hash, client_at, event_at)
  select encode(sha256(convert_to(v_salt || ':' || e.user_id::text, 'UTF8')), 'hex'),
         case when e.coach_id is null then null else encode(sha256(convert_to(v_salt || ':' || e.coach_id::text, 'UTF8')), 'hex') end,
         e.app_id, e.kind, case when e.granted then 'grant' else 'revoke' end, e.version, e.text_hash, e.client_at, e.created_at
  from core.consent_events e where e.user_id = v_uid
  order by e.created_at, e.id;
  delete from auth.users where id = v_uid;
end $$;

revoke execute on function core.delete_my_account() from public, anon;
grant execute on function core.delete_my_account() to authenticated;
