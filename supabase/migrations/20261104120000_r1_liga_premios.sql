-- R1 v1.17 · Cláusula 16 (prohibición de pagos y responsabilidad sobre incentivos; concepto jurídico 8, 31/10/2026). Aditiva e idempotente, encima de v1.16.
--   · Versión del acuerdo del coach 0.7-A7-coach = la 0.6 + la «Cláusula 16». La liga ahora exige ESA versión (trae las cláusulas 15 y 16); un coach que solo
--     tenga la 0.6 debe aceptar la 0.7 para mantener su liga habilitada. Exportar sigue valiendo con 0.5, 0.6 y 0.7 (todas traen la cláusula 14).
-- Pruebas: supabase/tests/200_liga.test.sql.
create or replace function grasa.liga_agreement_versions() returns text[]
language sql immutable set search_path = '' as $$ select array['0.7-A7-coach']::text[] $$;

create or replace function grasa.export_agreement_versions() returns text[]
language sql immutable set search_path = '' as $$ select array['0.5-A7-coach', '0.6-A7-coach', '0.7-A7-coach']::text[] $$;
