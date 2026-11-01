-- R1 v1.18 · Autorización de datos del coach (concepto jurídico, pantalla de entrada del coach, casilla 2). Aditiva e idempotente, encima de v1.17.
--   · Tipo de consentimiento nuevo `coach_data`: «Autorizo a José Granados a tratar mis datos personales de registro y gestión conforme a la Política …
--     y consiento su transmisión internacional …». Es un evento DISTINTO e independiente del acuerdo (`coach_agreement`), cada uno con su versión,
--     fecha y huella SHA-256 (el abogado exige dos registros aunque se marquen en la misma pantalla).
--   · NO se exige todavía en el servidor: hoy no hay coaches reales. El «muro de re-consentimiento» se hará al cambiar versiones.
-- Pruebas: supabase/tests/210_coach_datos.test.sql.
alter table core.consent_events drop constraint if exists consent_events_kind_check;
alter table core.consent_events add constraint consent_events_kind_check check (kind in (
  'terms', 'privacy', 'adult', 'sensitive_health', 'cloud_transfer', 'photos_cloud', 'photo_view_coach', 'coach_agreement',
  'share_body', 'share_notes', 'share_nutrition', 'share_habits', 'share_photos', 'liga', 'coach_data'));

-- Versión 0.8-A7-coach del acuerdo (mismas cláusulas que la 0.7; cambia solo el texto de la casilla): vale igual para la liga (trae las cláusulas 15 y 16) y para exportar.
create or replace function grasa.liga_agreement_versions() returns text[]
language sql immutable set search_path = '' as $$ select array['0.7-A7-coach', '0.8-A7-coach']::text[] $$;

create or replace function grasa.export_agreement_versions() returns text[]
language sql immutable set search_path = '' as $$ select array['0.5-A7-coach', '0.6-A7-coach', '0.7-A7-coach', '0.8-A7-coach']::text[] $$;
