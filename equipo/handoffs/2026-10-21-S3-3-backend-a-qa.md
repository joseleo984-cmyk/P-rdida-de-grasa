DE: Dev Backend + Datos → PARA: QA, Arquitecto, Dev Frontend (cc: Scrum Master)
HISTORIA: S3-3 Sincronización local-first (contrato `equipo/r1-contrato.md` §3.3, §5 y v1.1 §10)
ALCANCE ACORDADO CON EL SM: lógica en un módulo nuevo `sync.js`, probada con un stub propio. **Sin tocar `app.js`**
ni el `remote-fake.js` del Frontend: la integración (cuándo sincronizar, indicador y `store` real) va al integrar S3-2.

HECHO:
- **`sync.js`** (UMD como `schema.js`, `window.Sync` / `module.exports`).
  - Parte **pura**:
    - `toWire(state, {userId})` / `fromWire` / `remoteState`: estado ↔ frontera `{id, kind, nkey, date, data,
      updatedAt, deletedAt}`. Las lápidas llevan `data = {}`.
    - El perfil usa el id del usuario (estable) y el consentimiento nunca viaja.
    - Lo recibido pasa por `Schema.normalize`, porque **no es confiable** (tipos, rangos, ids, `__proto__`).
    - `dedupeWire`: una fila por clave aunque llegue repetida. Sin esto, `normalize` daba un id nuevo a la copia y
      el id local cambiaba; lo detectó la prueba de paginación.
    - `applyRemote` = `Schema.mergeState`, para el pull normal: LWW por registro, claves naturales y reloj acotado.
    - `adoptServer` (v1.1 §10.6): lo que llega en `rejected` se adopta tal cual, reemplazando por clave natural.
      **Excepción** (protección nueva): no se adopta si el usuario volvió a editar ese registro durante la red; su
      edición es más nueva y gana en el siguiente ciclo.
    - `planPush`: lo que tiene `updatedAt > pushedUpTo`, con lápidas. La primera vez (`pushedUpTo = null`) se sube
      todo, incluido lo migrado con EPOCH.
    - `meta.seen`: no se re-sube lo que acaba de llegar del servidor.
    - `photosToWire` / `planPhotos` (metadatos y lápidas de fotos), `nextDelay` (5 s, 30 s, 2 min, 10 min) y
      `ownerCheck` (§5.6: `adopt` / `ok` / `conflict`).
  - **Orquestador** `createSync({ remote, store, now, onStatus })`. Un ciclo:
    1. Push en lotes de ≤ 500. Fotos: primero `uploadPhoto` y luego los metadatos, **solo** con
       `store.photosCloudAllowed()`. `pushedUpTo` = mayor `updatedAt` enviado, **guardado al momento**.
    2. Se adoptan los `rejected`.
    3. Pull desde el cursor del **servidor**: la 1.ª página con solape de 30 s y las siguientes sin solape, hasta
       `hasMore = false`.
    4. `store.saveMerged(merged)`: **sin re-sellar**.
    5. Fotos y comentarios recibidos se entregan al `store`.
  - Una sola ejecución a la vez. Estados `ok | offline | error | auth | blocked` con `nextRetryAt`.
  - **Bloqueo de salud**: si `store.healthAllowed()` es false (lo que hoy controla `healthPart`), no se sube ni se
    baja nada: estado `blocked`, sin llamadas.
- **Interfaz `store`** que la app debe implementar al integrar (documentada en `sync.js`):
  - `getState()`.
  - `saveMerged(state)`: escribe el JSON y fija `savedJSON = state`. **No** pasa por `stampChanges`.
  - `getMeta()` / `setMeta()` sobre `perdida-grasa:sync`.
  - `healthAllowed()` y `photosCloudAllowed()`.
  - `photos.list()` / `getBlob(id)` / `applyRemote({upserts, deletes})`, y `saveComments()`.
- **BD (corrección de un defecto de protocolo de S3-1)**: si había más de `p_limit` filas dentro de la ventana de
  30 s, cada página volvía a empezar 30 s atrás y **la paginación no avanzaba nunca**. `grasa.sync_pull(p_since,
  p_limit, p_overlap boolean default true)`:
  - Solape solo con `p_overlap = true`.
  - Comparación `>=` (como mucho repite una fila; la fusión es idempotente).
  - Prueba SQL nueva en `50_sync` (7 filas en la ventana, páginas de 3). `r1.sql` regenerado.

PRUEBAS: `tests/sync-engine.test.js`, **18 pruebas**, con `tests/sync-stub.js`: un servidor en memoria con la misma
semántica que la BD y un «móvil» con el mismo `save()` (`stampChanges`) y `saveMerged()` que `app.js`.
- Frontera: ida y vuelta sin pérdidas, y lo recibido se trata como no confiable.
- **Dos dispositivos**:
  - Suben y bajan, y convergen en id, datos y `updatedAt`.
  - Misma edición offline en los dos: gana la más reciente.
  - Dos pesajes del mismo día con ids distintos: queda uno, con el id del servidor.
- `rejected`: se adopta la versión del servidor, también en **empate exacto**, y luego no queda nada pendiente.
  **Edición durante la red**: no se pisa. Verificado que sin la protección la prueba falla.
- **CRÍTICO `saveMerged`**:
  - Lo recibido conserva su `updatedAt`, y luego solo se sube lo que el usuario cambió.
  - Una edición más nueva del otro dispositivo llega y gana.
  - **Control negativo**: con `save()` normal, el dato recibido quedaría re-sellado como edición nueva.
- **Offline largo**: 20 días sin red. Backoff exacto (5 s, 30 s, 2 min, 10 min, 10 min); no se pierde nada y al
  volver se sube todo.
- Si el pull falla tras el push, `pushedUpTo` queda guardado.
- **Lápidas**: el borrado se propaga, una edición posterior lo revive y el borrado de comidas también se propaga.
- **Fotos**:
  - Con autorización: archivo en `{uid}/{id}.jpg` y luego metadatos; otro móvil recibe los metadatos y se propaga
    el borrado.
  - Sin autorización no se toca ninguna foto.
- Bloqueo de salud: sin llamadas al servidor.
- Cursor del servidor, paginación, y solape idempotente (repetir no cambia el estado).
- Móvil con la hora adelantada un año: el servidor recorta y la edición real posterior gana.
- Una sola ejecución a la vez; sin sesión → `auth`, sin reintento; `ownerCheck`.

DoD:
- [x] `npm test` **79/79**.
- [x] `npm run test:db` **139** comprobaciones OK.
- [x] `E2E_PORT=4391 PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npm run test:e2e` **79 passed**.
- [x] `node equipo/qa/run-all.js` **8 suites en verde**.
- [x] Sin cambios en `app.js`, `index.html` ni `sw.js`: `sync.js` aún no se carga en la app. Al integrarlo hay que
      añadirlo a `index.html`, `ASSETS` (con `CACHE` subido) y `pages.yml`.

ADENDA (aviso del SM tras la revisión de S3-2, O1):
- **Dueño de los datos locales**: `store.ownerId()` debe devolver el `userId` dueño de los datos del dispositivo
  (lo guarda el Frontend al confirmar «¿estos datos son tuyos?»).
  - Si no hay dueño → estado `owner` con motivo `unconfirmed`; si es otra cuenta → `owner` / `conflict`.
  - En ambos casos **no se hace ninguna llamada**: nunca se suben datos de otra persona.
  - Test nuevo en `tests/sync-engine.test.js` (19 pruebas en total).

CAMBIOS DE INTERFAZ PARA EL CONTRATO (@Arquitecto, @Frontend):
1. `remote.sync.pull(since, { overlap = true } = {})` → RPC `grasa.sync_pull(p_since, p_limit, p_overlap)`. El fake
   debe hacer lo mismo: `>= since - (overlap ? 30 s : 0)`.
2. La frontera de fotos en JS: `{ id, date, pose, width, height, storagePath, sharedWithCoach, createdAt (ISO),
   updatedAt, deletedAt }`. Las lápidas de foto viajan con `pose: 'frente'` de relleno (CHECK del servidor).
3. `meta` de `perdida-grasa:sync` añade `seen` (mapa pequeño `kind|nkey` → `updatedAt` de lo recibido y no tocado).

PENDIENTE PARA LA INTEGRACIÓN (S3-2 + S3-3):
- `store` real en `app.js`: `saveMerged` debe actualizar `savedJSON` y `healthBaseline`, y conservar `pending`.
- Disparadores (§5.1), `navigator.locks` entre pestañas, indicador «Sincronizado hace N min».
- Descarga de blobs de fotos de otro dispositivo (`downloadPhoto`, interfaz lista).
- `remote.js` real con el mapeo de errores de §10.4.
- Purga de lápidas confirmadas (`purgeDeleted`, §5.3.4).

PREGUNTAS:
- @QA: ¿queréis una E2E de dos dispositivos cuando exista el fake del Frontend? El stub de Node ya cubre la lógica.
- @Arquitecto: ¿de acuerdo con no adoptar un `rejected` cuando el usuario editó durante la red? Es una excepción a
  §10.6, pero sin ella se pierde la edición, y la siguiente subida converge igualmente.
