DE: Dev Backend + Datos → PARA: QA, Arquitecto (cc: Scrum Master, Dev Frontend)
HISTORIA: S3-1 Base de datos R1: esquema `core` + `grasa`, RLS, Storage y pruebas en PostgreSQL local
BASE: `claude/agent-team-app-org-nnunot` (con `equipo/r1-contrato.md` commiteado). **No toqué la app.**

HECHO:
- **Migraciones** (formato Supabase CLI, idempotentes) en `supabase/migrations/`:
  - `…120000_r1_core.sql`:
    - `core.apps` (con 'grasa'), `core.profiles` (trigger desde `auth.users`), `core.app_access` y `core.consent_events`.
    - `consent_events` es **solo inserción**: sin `UPDATE`/`DELETE`/`TRUNCATE` para nadie, ni siquiera el superusuario
      (trigger). La única excepción es el borrado en cascada de la baja. `created_at` lo fija el servidor y `client_at`
      se acota a +5 min.
    - RPC `join_app`, `my_roles`, `my_consents`, `record_consent` (calcula el SHA-256 en el servidor) y `delete_my_account`.
  - `…120100_r1_grasa.sql`:
    - Tablas `coaches`, `coach_links` (5 categorías; `body` obligatoria; un solo vínculo activo), `invite_attempts`,
      `records` (genérica con clave natural coherente por `CHECK`), `photos` (ruta `{uid}/{id}.jpg` por `CHECK`),
      `comments` y `photo_views`.
    - Trigger de `server_updated_at` (`clock_timestamp`) y recorte de `updated_at` a +5 min. El dueño y el id no se
      pueden cambiar.
    - `coach_can_see(cliente, categoría)` y `coach_can_see_photo`.
    - RPC del contrato: `become_coach`, `rotate_invite_code`, `preview_invite_code`, `join_coach`, `update_shares`,
      `leave_coach`, `end_client`, `coach_clients`, `coach_pull`, `sync_push`, `sync_pull`, `add_comment`,
      `delete_comment`, `mark_comment_read`, `coach_photo_opened` y `billing_active_clients` (solo admin).
  - `…120200_r1_storage.sql`: bucket **privado** `grasa-photos` (2 MB, `image/jpeg`).
    - El dueño puede todo en su carpeta.
    - El coach solo puede LEER, y solo si el vínculo está activo, comparte fotos y esa foto está marcada como compartida.
    - `try_uuid` evita errores con rutas manipuladas.
- **RLS en TODO** (11 tablas):
  - El cliente solo ve y escribe lo suyo.
  - El coach **nunca** lee tablas de salud: solo vía `coach_pull`, que filtra `note` sin `share_notes`, nunca devuelve
    `library`, y solo devuelve fotos compartidas y no borradas.
  - Nadie escribe datos de otro.
  - El admin solo ve el conteo de cobro, sin datos de salud.
  - `anon` no tiene acceso a nada: `revoke execute … from public` en todas las funciones.
- `supabase/r1.sql` **generado** (`npm run build:db`, `scripts/build-r1.js`): es el archivo único del contrato para
  pegar en el SQL Editor y termina en `OK r1 v1`.
- **Pruebas** `npm run test:db` (`scripts/test-db.js`), en PostgreSQL 16 local sin Docker:
  - Cluster temporal en un puerto libre (como root usa `postgres`).
  - Stub de Supabase (`auth.users`, `auth.uid()` desde `request.jwt.claim.sub`, roles y `storage`).
  - `r1.sql` aplicado **2 veces** (idempotente) y la matriz de pruebas.
- `supabase/README.md`: cómo correrlo, cómo escribir pruebas, cómo aplicarlo en Supabase y qué queda por verificar.

PRUEBAS: **`npm run test:db` → 137 comprobaciones OK** · `npm test` → 61/61.
- `10_estructura` (14):
  - RLS en todas las tablas; `search_path` fijo en todas las `SECURITY DEFINER`.
  - `anon` no ejecuta funciones ni lee tablas; sin `UPDATE`/`DELETE` en `consent_events` ni `DELETE` en `records`.
  - Perfil creado por trigger; bucket privado.
- `20_cuentas_consentimientos` (24):
  - Roles, perfil propio, nadie se da rol coach ni admin.
  - Consentimientos: el hash se calcula en el servidor; el último evento gana; no se registra a nombre de otro.
  - **`UPDATE`/`DELETE`/`TRUNCATE` fallan para el usuario, el superusuario y `service_role`**; no se puede antedatar.
  - La baja borra en cascada.
- `30_coach_invitacion` (31):
  - Formato del código; idempotencia; `body` obligatoria; los `share_*` quedan en `consent_events` con hash.
  - Código de **1 uso** (el 2.º cliente falla), código **caducado** (`invalid_code`) y rotación que invalida el anterior.
  - Un solo coach activo; el coach no es su propio cliente; `coach_clients` con `over_free_limit`.
  - `leave_coach`/`end_client`; **20 intentos/hora** por usuario.
- `40_matriz_datos_coach` (47), con la matriz del contrato (A con coach X, B, X, Y y admin):
  - **B no ve ni modifica nada de A**.
  - **X no lee las tablas directamente**; con `body`+`nutrition` ve `profile`, `entry` y `food`, **sin `note`, sin
    `habit`, sin `library`**.
  - Sin `share_photos`: ni metadatos ni archivos.
  - **Y no ve a A**.
  - Al compartir más: nota, hábito y **solo** la foto marcada.
  - Storage: X lee solo ese archivo y no puede borrar.
  - `photo_views`, comentarios (quién crea, lee, marca y borra).
  - **Revocar** `nutrition`/`notes`/`photos` corta en la siguiente llamada. **Terminar el vínculo** corta todo
    (pull, Storage, comentarios).
  - El admin no ve salud.
- `50_sync` (20):
  - LWW: una versión vieja no pisa y va en `rejected`; una nueva gana; empate determinista.
  - 2030 se recorta; misma fecha con otro id → **se conserva el id del servidor**; lápidas.
  - Validaciones: `nkey` frente a fecha, `kind`, 4 KB, 500 por llamada y ruta de foto.
  - Cursor, solape de 30 s y paginación.
- **Concurrencia** (1, contrato §2.5.4), con dos sesiones `psql` reales:
  - T1 escribe primero y confirma 2 s después de T2. El pull intermedio no ve T1, y el siguiente pull con ese cursor
    **sí** lo trae.
  - Verificado que **sin** la ventana de solape esta prueba falla.
- Pruebas de mutación hechas a mano: si `coach_pull` deja de quitar `note`, o si se elimina la ventana de solape, la
  suite sale roja.

DESVÍOS / AMPLIACIONES SOBRE EL CONTRATO (@Arquitecto: incorpóralos o dime y los cambio):
1. `core.consent_events.text_hash` (**obligatorio**, SHA-256 hex del texto mostrado), pedido por el SM. El
   `recordConsents(events)` de §3.2 debe enviar `textHash` (o usar la RPC `core.record_consent`, que lo calcula).
   `join_coach`/`update_shares` exigen `version` y `text_hash` dentro de `p_shares`.
2. Caducidad y límite de usos opcionales del código (pedidos por el SM): columnas `invite_expires_at`,
   `invite_max_uses` e `invite_uses` en `grasa.coaches`, y `rotate_invite_code(p_valid_days, p_max_uses)`. Por
   defecto no tienen límite, como en el contrato.
3. `grasa.coach_can_see(p_client, p_scope)` (pedida por el SM), que también usan `coach_can_see_photo` y `coach_pull`.
4. Extras: `core.has_role` y `core.record_consent`.
5. Errores: el **mensaje** es el código de `RemoteError` (`auth`, `forbidden`, `not_found`, `invalid`,
   `invalid_code`, `rate_limited`) y el motivo va en `DETAIL`. Para RLS y `CHECK`, `remote.js` debe mapear por
   SQLSTATE: `42501` → `forbidden` y `23514` / `22023` → `invalid`.
6. `preview_invite_code` con un código que no sirve devuelve 0 filas (no error), para que el intento quede contado.
7. Fotos en `sync_push`: LWW por `updated_at` estricto (sin desempate por JSON, a diferencia de `records`).

NOTA PARA S3-3 (hallazgo del SM/Arquitecto): lo que llega de `sync_pull`/`rejected` se guardará con `saveMerged()`,
**no** con `save()`. Si no, `stampChanges` le pondría `updatedAt = ahora` y se volvería a subir ganando a cambios más
nuevos. Lo cubro con un test en S3-3.

A VERIFICAR EN EL PROYECTO REAL (en `supabase/README.md`):
- Permisos de `postgres` en `storage.objects` y `auth.users` (para `delete_my_account`).
- Esquemas expuestos.
- GRANT de 2026.
- `storage.foldername`/`filename` con el mismo comportamiento que en el stub.

PREGUNTAS:
- @Arquitecto: ¿aceptas los desvíos 1-3 y 7 en `r1-contrato.md`?
- @QA: ¿añadís casos a la matriz? Basta con un `supabase/tests/NN_*.test.sql` con `tests.login`/`ok`/`throws`.
- @Analista/abogado: los `consent_events` se borran con la baja (cascada, como dice el contrato). Si hay que
  conservarlos como prueba, se cambia a `on delete set null` con seudonimización.
