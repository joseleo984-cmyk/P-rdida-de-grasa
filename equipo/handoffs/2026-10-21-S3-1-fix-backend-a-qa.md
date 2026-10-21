DE: Dev Backend + Datos → PARA: QA (cc: Scrum Master, Arquitecto, Dev Frontend, Stakeholder)
HISTORIA: S3-1 — correcciones del veredicto `2026-10-21-S3-1-qa-veredicto.md` (D1, D2, D3, O1, O3, O4, O7)
MIGRACIÓN NUEVA (no se editan las anteriores): `supabase/migrations/20261021130000_r1_fix_seguridad.sql`, idempotente.
`supabase/r1.sql` regenerado con `npm run build:db`.

HECHO:
- **D1 (medio): límite de 20 intentos/h que ya no se puede eludir.**
  - `grasa.join_coach` con un código inválido, caducado o agotado **devuelve `null`** (no lanza error): la transacción
    se confirma y el intento cuenta. `remote.js` convierte `null` en `invalid_code` (contrato §11.1).
  - Las validaciones que no dependen del código (`body`, `version` y `text_hash`) van **antes** de contar el intento
    y de mirar el código, así que un error no revela si el código existe.
  - `count_attempt` serializa por usuario con `pg_advisory_xact_lock(hashtext('grasa:invite:' || uid))` y purga los
    intentos de más de 1 día.
  - **Carrera** probada con 25 sesiones `psql` reales a la vez: exactamente 20 registrados y 5 `rate_limited`. Sin el
    bloqueo salen **21**: lo verifiqué quitándolo y la prueba falla.
- **D3 (alto): la baja no deja fotos en Storage.**
  - `core.delete_my_account()` se **niega** (`invalid`, DETAIL «borra primero tus fotos de Storage») si quedan
    archivos en `grasa-photos/{uid}/`. La app los borra con la API de Storage y reintenta.
  - Red de seguridad: `grasa.orphan_photo_folders()` (**solo `service_role`**) lista las carpetas sin usuario, y
    **`supabase/tools/sweep-orphan-photos.js`** las borra con la API de Storage.
    - Por defecto es una simulación; borra con `--apply`. Sin dependencias.
    - Variables: `SUPABASE_URL` y `SUPABASE_SERVICE_KEY` (la clave nunca va al repo).
    - Recomendado semanal. Está documentado en `supabase/README.md`.
    - Pruebas: `tests/sweep-orphan-photos.test.js` (fetch simulado: sin `--apply` no hay DELETE; con `--apply` borra
      exactamente los archivos huérfanos y salta carpetas que no son UUID).
- **D2: FK con `on delete cascade`.**
  - `photo_views.client_id`, `coach_id` → `auth.users`, y `photo_id` → `grasa.photos`.
  - `invite_attempts.user_id` → `auth.users`.
  - Antes de crear las FK se limpian los huérfanos que ya existan.
- **O1: privilegios por defecto.** Se revoca TODO lo concedido directamente a `public`/`anon`/`authenticated`/
  `service_role` en tablas, secuencias y funciones de `core`/`grasa`. Después se concede la **lista blanca** exacta
  (la misma que comprueba la §1 de QA) y `orphan_photo_folders` solo a `service_role`.
- **O3:** URL firmadas de **60 s** (decisión del SM). Contrato actualizado: §2.4, §3.3 y §11.6.
- **O4:** `coach_clients().last_activity` solo cuenta las categorías que el cliente comparte.
- **O7:** `coach_pull` devuelve `data = {}` en las lápidas.
- **Pruebas actualizadas:**
  - `60_qa_seguridad.test.sql`: los 6 `tests.hole` (D1 ×2, D2 ×3, D3) pasan a `tests.ok`/`tests.throws`.
    - El bloque de fuerza bruta espera 20 `null` y 5 `rate_limited`.
    - La baja comprueba que se niega con fotos y funciona tras borrarlas.
    - Caso nuevo: baja «por fuera» → `orphan_photo_folders` la detecta y solo la ejecuta `service_role`.
  - `30_coach_invitacion.test.sql`: código de 1 uso, caducado y rotado → `null`.
- **Contrato** `equipo/r1-contrato.md` §11 (v1.2), con todos los cambios de interfaz:
  - URL de 60 s;
  - `join_coach` → `null`;
  - baja con fotos;
  - `sync_pull(…, p_overlap)` (de S3-3);
  - excepción de `rejected` cuando el usuario editó durante la red;
  - dueño de los datos en `sync.js`.

PRUEBAS:
- `PGOPTIONS='-c qa.strict=on' npm run test:db` → **205 comprobaciones OK** (sin agujeros conocidos). Sin modo
  estricto, también 205.
- `npm test` → 92/92 (incluye `sync-engine` 19 y `sweep-orphan-photos` 2).
- `E2E_PORT=4391 PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npm run test:e2e` → **93 passed**.
- `node equipo/qa/run-all.js` → **8 suites en verde**.

NO HECHO (observaciones que quedan abiertas, por decisión o falta de datos):
- **O2** `client_at` se puede antedatar: la prueba de autorización es `created_at` (servidor). La UI de Privacidad
  debe mostrar `created_at` (@Frontend).
- **O5** texto libre de otros usuarios (`display_name`, `business_name`, `comments.body`): siempre con `esc()` en la
  UI (@Frontend, S3-4).
- **O6** el coach sigue leyendo **sus** comentarios tras terminar el vínculo. Lo dejo así: son contenido suyo. Si el
  Analista quiere cortarlo, basta añadir `status = 'active'` a la política.
- **O8** cuota de filas por usuario: propuesta, un trigger que limite a 20 000 `records` por usuario antes de abrir el
  registro (S4).
- **O9** conservar los `consent_events` tras la baja (`on delete set null` + seudonimización): pendiente del abogado.

A VERIFICAR EN EL PROYECTO REAL (contrato §10.8, sin cambios):
- Permisos de `postgres` en `storage.objects` y `auth.users`.
- Que `service_role` puede ejecutar la RPC con `Content-Profile: grasa`.
- Rutas de la API de Storage usadas por el script de barrido: `object/list` y `DELETE object/{bucket}` con `prefixes`.
