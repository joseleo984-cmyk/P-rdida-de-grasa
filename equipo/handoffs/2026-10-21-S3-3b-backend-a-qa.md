DE: Dev Backend + Datos → PARA: QA, Arquitecto, Dev Frontend (cc: Scrum Master)
HISTORIA: S3-3b `remote.js` real con supabase-js vendorizado + sincronización integrada en la app
CONTRATO: `equipo/r1-contrato.md` §3, §5, §6, v1.1 §10 y v1.2 §11.

## Hecho

### 1. `remote.js` real (`Remote.create`)
- **Cliente.** supabase-js con estas opciones:
  - `auth`: `persistSession`, `autoRefreshToken`, `detectSessionInUrl: false`, `storage` y `storageKey = sb-<ref>-auth-token`.
  - `global.fetch`: con **timeout de 15 s**. Si se agota, se aborta y el error es `offline`.
  - **Un solo cliente por (url, key)**: `account.js` y la sincronización lo comparten, así no hay dos GoTrueClient.
  - `createClient`, `fetch` y `navigator` se pueden inyectar (lo usan las pruebas).
- **auth**:
  - `signInWithOtp` con `shouldCreateUser`.
  - `verifyOtp` (`type: 'email'`, `/^\d{6,10}$/`; si el formato no vale, no se llama al servidor).
  - `session()` **sin red**: lee la sesión guardada, así que sirve offline.
  - `signOut({ scope: 'local' })`.
  - `onChange`: traduce `SIGNED_IN`, `TOKEN_REFRESHED` y `SIGNED_OUT`.
- **sync**:
  - `sync_push` en lotes de **≤ 500 elementos** (registros y fotos juntos), con camelCase ↔ snake_case. Lo `rejected`
    vuelve en camelCase.
  - `sync_pull(p_since, p_limit, p_overlap)`. El cursor del servidor se devuelve **tal cual**, con microsegundos, para
    que la paginación no pierda filas.
- **Storage**:
  - Subida a `{uid}/{id}.jpg` con `upsert`.
  - Descarga y `photoBlob` con `createSignedUrl(path, 60)` + `fetch`. La URL no se guarda en ningún sitio.
  - Una ruta de otra cuenta da `forbidden` sin llegar a llamar.
  - `coach.photoBlob` llama a `coach_photo_opened` **antes** de firmar la URL.
- **client, coach y account**: todas las funciones del contrato.
  - `previewCode` con 0 filas y `join_coach` con `null` dan `invalid_code`.
  - `shares` lleva `version` y `text_hash`.
  - `recordConsents` inserta con `text_hash`.
  - `deleteAccount`: primero vacía Storage; si la BD responde `invalid` (§11.2), vuelve a borrar una vez y después cierra
    la sesión.
- **Errores (§10.4)**, en este orden:
  1. Por el **texto del mensaje** (`auth | forbidden | not_found | invalid | invalid_code | rate_limited`).
  2. Por **SQLSTATE / PGRST**.
  3. Red: `TypeError`/`AbortError`/`AuthRetryableFetchError`/`StorageUnknownError`, estado 0 o
     `navigator.onLine === false` → `offline`.
  4. HTTP 401 → `auth`; 429 o `over_*_rate_limit` → `rate_limited`; `otp_expired` → `invalid_code`; 5xx → `server`.
  - `detail` lleva el motivo **solo para depurar**. El `message` es un texto propio, nunca el del servidor.
- **`Remote.createFake`**: adapta `pull(since, { overlap })` a la firma del fake, que es `pull(since, limit)`. Sin esto,
  el fake recibía un objeto como `limit` y devolvía páginas vacías.

### 2. supabase-js vendorizado
- `@supabase/supabase-js` **2.117.2** como devDependency exacta (`-E`), publicada el 25-09-2026: más de 2 semanas.
  - 2.117.3 (07-10) quedaba justo en el límite y 2.118.0 es del 15-10.
- `npm run vendor` (`scripts/vendor.js`):
  - Copia `dist/umd/supabase.js` a `vendor/supabase-2.117.2.js` (218 KB, global `supabase`).
  - Escribe el SHA-256 en `vendor/VERSIONS.json`.
- `tests/vendor.test.js` comprueba:
  - El hash del archivo commiteado.
  - La versión exacta de `package.json`.
  - Que es idéntico a `node_modules` cuando está instalado. `pages.yml` ejecuta `npm test` sin `npm ci` y entonces
    basta el hash.
  - Que se carga en `index.html` antes de `remote.js` y sin ningún script de CDN.
  - Que está en `ASSETS` de `sw.js` y que `pages.yml` lo publica.
  - Que el fake nunca se publica.
  - Que `config.js` sigue vacío.
- `sw.js`: `CACHE` **v18**. Se añaden `sync.js` y `vendor/supabase-2.117.2.js` a `ASSETS`.
- `pages.yml`: copia `sync.js` y `vendor/`.

### 3. Sincronización integrada en la app (`app.js` + 4 líneas de `index.html`)
- **Sin servidor** (`config.js` vacío) **no hace nada**: no aparece el indicador, no existe `window.PGSync` y no hay
  peticiones a otros orígenes (prueba E2E). La configuración se lee en `DOMContentLoaded`, porque `config.js` y
  `remote.js` se cargan después de `app.js`.
- **`store`** para `Sync.createSync`:
  - `saveMerged` escribe el JSON y fija `savedJSON` y `healthBaseline` **sin `stampChanges`**. Después re-renderiza y
    rellena el formulario del perfil si no se está editando.
  - Metadatos en `perdida-grasa:sync`. Si cambia la cuenta, el cursor y `pushedUpTo` empiezan de cero.
  - `healthAllowed` = autorización de salud vigente y sin guardado bloqueado.
  - `ownerId` = `perdida-grasa:owner`.
  - Comentarios en `perdida-grasa:comments`, fusionados por id.
  - **`photosCloudAllowed()` = false**: todavía no existe la autorización «copia de fotos en la nube» (S3-5). Las fotos
    siguen solo en el dispositivo.
- **Disparadores**:
  - Al abrir.
  - Al volver a la app (`visibilitychange`).
  - 2 s después de cualquier escritura (`persist()`, que también cubre importar).
  - Evento `online`.
  - Cada 5 min con la app visible.
  - Reintento en `nextRetryAt` (backoff de `sync.js`).
  - Evento `signed_in` de `remote.auth.onChange` y evento DOM `pg:signed-in`.
  - Botón «Sincronizar ahora».
  - Una sola sincronización a la vez: `navigator.locks` con `ifAvailable`, y si no, el flag de `sync.js`.
- **Indicador** `#sync-status` (`role="status"`, `aria-live="polite"`) en la tarjeta Cuenta de Perfil. Textos:
  - «Sincronizando…».
  - «Sincronizado (hh:mm)».
  - «Sin conexión: se subirá luego».
  - «No se pudo sincronizar: se reintentará».
  - Sesión caducada.
  - «en pausa: falta tu autorización de datos de salud».
  - «en pausa: confirma que los datos de este dispositivo son tuyos».
- **Dueño de los datos (§5.6, §11.10)**:
  - Sin dueño y **sin datos locales**: se adopta la cuenta automáticamente, que es seguro.
  - **Con datos**: no se sincroniza hasta que se llame a `PGSync.confirmOwner()`. Esa llamada guarda antes
    `perdida-grasa:backup-pre-sync`.

### 4. BD: `grasa.my_link()` (migración `20261021140000_r1_my_link.sql`, `r1.sql` regenerado)
- **Motivo**: el cliente no puede leer `grasa.coaches` (RLS), así que `myLink()` y `joinCoach()` no podían devolver el
  `businessName` que la UI muestra.
- Es SECURITY DEFINER y solo devuelve el vínculo activo del propio cliente con el nombre comercial. No expone el código
  ni el resto de la tabla.
- `revoke` de public/anon y `grant` a `authenticated`.
- Pruebas:
  - 4 nuevas en `30_coach_invitacion`.
  - **Añadida a la lista blanca** de `60_qa_seguridad` (QA: revisadlo).

### 5. `npm run smoke:remote` (`scripts/smoke-remote.js`, documentado en `supabase/README.md`)
- Sin iniciar sesión y sin escribir nada.
- Lee `SUPABASE_URL` y `SUPABASE_KEY` **solo de variables de entorno**. Rechaza claves secretas y no imprime la clave.
- Comprueba:
  - Auth health y settings, y que el inicio con correo está activado.
  - Que `core` y `grasa` están expuestos (si no, PGRST106).
  - Que anon no ejecuta RPC ni lee tablas (401/403).
  - Que el bucket no es público.
- **No se ha ejecutado contra el servidor real**: en este entorno no hay red hacia Supabase (verificado: ENOTFOUND).

## DoD
- [x] `npm test` **114/114**: 18 nuevas de `remote.test.js`, 4 de `vendor.test.js` y 1 ajustada.
- [x] `PGOPTIONS='-c qa.strict=on' npm run test:db` **209 comprobaciones OK** (205 + 4).
- [x] `E2E_PORT=4517 PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npm run test:e2e` **97 passed**. Hay 4 nuevas en
      `s3-3b.spec.js`. Los 3 `✘` son los `test.fail` esperados de S2-1 D2 y S3-2 D1/D2, ya existentes.
- [x] `node equipo/qa/run-all.js` **8 suites en verde**.
- [x] `CACHE` v18. `config.js` sigue vacío. Ninguna clave ni URL de proyecto en el repo.
- [ ] Contra el proyecto real: `npm run smoke:remote` y `tests/remote-contract.test.js` contra `pruebas`, cuando haya
      red y proyecto. Pendiente de verificar (§10.8.5): los códigos de Auth reales (`otp_expired`,
      `over_email_send_rate_limit`). El UMD no contiene esos textos y los manda el servidor.

## Para el Dev Frontend (no he tocado `account.js` ni `remote-fake.js`)
1. **Confirmar el dueño de los datos**: en la pantalla «¿estos datos son tuyos?» hay que llamar a
   `await window.PGSync.confirmOwner()`. Hace la copia previa, fija el dueño y sincroniza.
2. Tras un login correcto, emitir `document.dispatchEvent(new Event('pg:signed-in'))` para sincronizar al momento.
   - En real ya lo dispara `onChange`, porque el cliente es compartido.
   - Con el fake, cada instancia tiene sus propios oyentes, así que hace falta el evento.
3. `remote-fake.js`:
   - `sync.pull(since, limit)` debería aceptar `(since, { overlap, limit })` como el real (§11.8). Hoy lo adapta
     `Remote.createFake`.
   - Opcional: que `session()` del fake no dependa de nada más que el almacenamiento, como hasta ahora.
4. **Modo fake de la sincronización**: reutiliza `window.__pgFakeBackend`, el backend que crea `account.js`. Si se
   renombra, hay que avisar.
5. `tests/remote-fake.test.js`: he sustituido el caso «Remote.create aún no implementado» por «sin supabase-js →
   `server`». Puede chocar con lo que tengas sin commitear en ese archivo.
6. Cerrar sesión no borra los metadatos de sync (`perdida-grasa:sync` / `owner`). Si se decide borrar los datos
   (§5.6, texto del Analista), hay que borrar también `perdida-grasa:sync`, `perdida-grasa:owner` y
   `perdida-grasa:comments`.

## Riesgos / observaciones
- **R1.** El fake no reproduce el solape opcional: en E2E, la paginación con más de 1000 filas en 30 s no se prueba.
  Sí está probada en BD y en `sync-engine`.
- **R2.** Fotos y comentarios: sin la autorización «nube» (S3-5) no se suben fotos. Los comentarios se guardan pero aún
  no se muestran (S3-4).
- **R3.** `saveMerged` re-renderiza. Si llega una sincronización mientras se escribe en un formulario de registro, ese
  formulario no se toca: `render()` no rellena formularios y el del perfil se protege con el foco.
- **R4.** El UMD se carga siempre (218 KB, precacheado), también sin `config.js`. No hace nada hasta `createClient`.
  Si molesta, se puede cargar bajo demanda.
- **R5.** `my_link()` cambia la lista blanca de SECURITY DEFINER: necesita revisión de seguridad de QA y nota del
  Arquitecto en el contrato (§11 o v1.3).
