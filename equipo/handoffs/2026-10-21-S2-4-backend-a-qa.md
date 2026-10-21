DE: Dev Backend + Datos → PARA: QA (cc: Scrum Master, Arquitecto, Dev Frontend)
HISTORIA: S2-4 Esquema v4 preparado para sincronizar (spike-servidor.md §4 y §11: Supabase, local-first, LWW por registro)
BASE: `claude/agent-team-app-org-nnunot` (S2-1 con schema v3 + `consent`), integrada por fast-forward en `04b8704`.

HECHO (sin red ni Supabase: solo modelo de datos y funciones puras):
- **`schema.js` v4** (`CURRENT_VERSION = 4`, `EPOCH = '1970-01-01T00:00:00.000Z'`):
  - `uuid()`: usa `crypto.randomUUID`; si no existe, `getRandomValues`; en último caso, `Math.random`. Siempre
    formato v4. `isUUID()` valida.
  - **Migración v3→v4** (`MIGRATIONS[4]`, pura):
    - Los registros, alimentos, hábitos y biblioteca con id no UUID reciben uno nuevo.
    - Los registros y el perfil sin marca reciben `updatedAt = EPOCH`, así cualquier edición real posterior gana (§4.1).
    - Se crea `deleted` vacío. Solo toca las claves que existen: `{foo:1}` sigue siendo irreconocible. Este fallo lo
      detectó `import.spec`.
    - **Referencias**: no hay referencias cruzadas por id. Las fotos se asocian al pesaje por **fecha**
      (`weightNear`), así que reasignar ids no rompe nada y no hace falta tabla de equivalencias.
  - **Borrado lógico**: `state.deleted = { entries, foods, habits, photos }` con lápidas
    `{ id, date, deletedAt, updatedAt }`.
    - Viven **aparte** de los datos vivos: la UI, los cálculos (`Calc`), el CSV (`Coach.toCSV`), el visor del
      coach y el panel no las ven sin tocar su código.
    - `normalize` las valida: UUID, fecha y marca ISO; las inválidas o duplicadas se descartan con aviso.
  - **Claves naturales**: registro corporal y hábitos, por **fecha**; biblioteca, por nombre en minúsculas; comidas
    y fotos, por id.
  - `stampChanges(prev, next, nowISO)` (pura): compara lo guardado con lo nuevo.
    - Marca `updatedAt` solo en lo nuevo o cambiado, comparando con claves ordenadas.
    - Conserva el id de la fecha (hábitos) o del nombre (biblioteca).
    - Crea lápidas de lo que desaparece, y retira las que reviven por id o por fecha.
  - `mergeRecords(local, remote, { key })`: LWW por registro.
    - Gana el `updatedAt` mayor. En empate, el JSON mayor: determinista y conmutativo, en lugar del `deviceId` de
      §4.2, que aún no existe.
    - Con clave natural se queda el id remoto (el servidor manda, §4.2).
    - Una lápida más nueva gana a una edición, y una edición posterior revive.
  - `toRecords` / `fromRecords`: estado ↔ listas planas para push/pull, con lápidas con `deletedAt`.
  - `mergeState(local, remote)`: fusión completa. El **consentimiento no se fusiona**: es de este dispositivo
    (regla de S2-1).
  - `purgeDeleted(state, nowISO, days = 90)`: **opcional, no se llama hoy**. En R1 solo debe usarse cuando el servidor
    haya confirmado el borrado; si se purga antes, otro dispositivo podría "resucitar" el dato.
  - `normalizePhotos`: las fotos de un respaldo pasan a UUID y llevan `updatedAt`.
- **`app.js`**:
  - `uid()` pasa a ser `Schema.uuid()`.
  - **`save()` aplica `stampChanges`** frente al último JSON guardado. No hubo que tocar ningún formulario: perfil,
    registro, comidas, hábitos, biblioteca, repetir y deshacer comidas (S1-3) y borrados quedan marcados en un solo sitio.
  - `load()`: si el dato venía de otra versión, guarda una copia en `perdida-grasa:backup-v<N>` (solo si no existe;
    la de `:backup` se mantiene igual) y **guarda ya migrado**. Así los UUID son estables entre cargas y lo migrado
    conserva `EPOCH`.
  - Foto nueva: lleva `updatedAt`. Foto borrada: lápida en `deleted.photos`.
  - «Borrar todo» también elimina las copias `:backup-v*`.
  - Exportar incluye `updatedAt`, UUID y `deleted`. Importar conserva el consentimiento del dispositivo (sin cambios).
- **`photos.js`**: `Photos.migrateIds({ isValid, uid, epoch })`. Pasa a UUID las fotos de IndexedDB de versiones
  anteriores y les pone `updatedAt`, en **una** transacción (borrar la clave vieja y escribir la nueva van juntas).
  Se llama en `loadPhotos()`.
- `sw.js`: `CACHE = 'perdida-grasa-v14'` (tras integrar la v13 de la rama). No toqué la pantalla legal ni la lógica
  de consentimiento.
- **Control de salud (D1 del Frontend, integrado con `git merge`)**: se conserva tal cual.
  - `healthPart()` incluye ahora también las lápidas de salud (`deleted.entries/foods/habits`). Los ids y el
    `updatedAt` ya iban dentro de cada registro. Sin autorización, borrar tampoco se guarda.
  - La migración v3→v4 al cargar escribe en `load()` directamente: no es una escritura del usuario, así que no pasa
    por `persist()`, y `healthBaseline` se toma después.
  - `stampChanges` no altera los registros sin cambios, así que guardar solo el consentimiento no cambia `healthPart`.
  - Test E2E nuevo: datos v3 con `sensitiveHealth: false` → migran a v4 al cargar.

PRUEBAS NUEVAS:
- `tests/sync.test.js` (11 pruebas) y el fixture nuevo `tests/fixtures/backup-v3.json`, que no se debe modificar.
  Cubren:
  - `uuid` con y sin `randomUUID`.
  - Migración v1/v2/v3 → v4: UUID, EPOCH, sin mutar la entrada y sin perder datos.
  - Idempotencia y estabilidad, y que `{foo:1}` se sigue rechazando.
  - Lápidas inválidas.
  - `stampChanges`: crear, editar, sin cambios, hábito que conserva su id, biblioteca con otro orden de claves,
    borrar → lápidas, reaparición por fecha y paso por `normalize`.
  - `purgeDeleted`.
  - `mergeRecords`: LWW, empate conmutativo, lápida frente a edición, clave natural con el id remoto.
  - `mergeState` y la ida y vuelta de `toRecords`/`fromRecords`.
- `tests/e2e/s2-4.spec.js` (5 tests, 390x844):
  - Carga de datos v3: v4, UUID estables tras recargar, EPOCH, `:backup-v3` idéntico al crudo y consentimiento conservado.
  - Sin autorización de salud, la migración al cargar no se bloquea.
  - Fotos antiguas de IndexedDB → UUID y galería igual.
  - Editar, crear, borrar y volver a registrar desde la UI. Comprueba `updatedAt`, lápidas, tabla y CSV sin el día
    borrado, y el id del hábito conservado.
  - Borrar foto → lápida; exportar con `deleted` y `updatedAt`; ida y vuelta del respaldo; un import v3 no adopta
    su consentimiento.

PRUEBAS EXISTENTES AJUSTADAS (cambio legítimo de formato, no de comportamiento):
- `tests/schema.test.js` y `tests/legal.test.js`: versión 4. El contenido se compara sin `id`/`updatedAt` y se exige UUID.
- `tests/e2e/import.spec.js` y `tests/e2e/s2-1-qa.spec.js` («migración v1 → v3… conserva todo»): igual que la anterior.
- **`tests/e2e/helpers.js` `importJSON`: vacía `#toast` antes de importar.** Antes, un «Datos importados» anterior
  satisfacía la espera y la prueba leía un resultado viejo. Sin esto, «archivos rechazados» podía pasar sin probar nada.
- `equipo/qa/qa-s1-1.js`:
  - Las 6 comprobaciones de «idéntico» comparan el contenido sin `id`/`updatedAt` y exigen UUID.
  - Las fotos se emparejan por `createdAt`.
  - El `migrate` idempotente incluye `deleted`.
- `equipo/qa/run-s1-3.js` «Origen intacto»: compara con los ids guardados antes de copiar, en lugar de `'f1,f2,f3'`.

DEFINICIÓN DE HECHO:
- [x] Criterios: UUID con respaldo; migración v3→v4 (y v1/v2); `updatedAt` automático; `deletedAt` en lápidas
      ignoradas por UI, cálculos, CSV y visor; purga opcional documentada; hábitos y pesaje por fecha;
      `mergeRecords` LWW puro; respaldos v1/v2/v3 importan; exportar lleva los campos nuevos; importar no adopta
      un consentimiento ajeno.
- [x] `npm test` en verde: **59/59**.
- [x] `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npm run test:e2e` en verde: **64 passed**, con la nueva `s2-4.spec.js`.
      El `test.fail` de S2-1 D2 (marcadores legales) sigue fallando como se espera.
- [x] `node equipo/qa/run-all.js` en verde: **8 suites en verde**, tras el merge.
- [x] Sin errores de consola: el fixture de la E2E falla si hay alguno.
- [x] Seguridad: lápidas y UUID validados en `normalize`; nada nuevo se interpola en `innerHTML`.
- [x] PWA: `CACHE` v14 (no hay assets nuevos).
- [x] Handoff escrito. El tablero lo actualiza el SM.

AVISO DE ENTORNO (importante para QA/CI local):
- `reuseExistingServer` de Playwright reutiliza **cualquier** servidor en el puerto 4173. Había uno del worktree del
  Frontend (`agent-af1625…`) sirviendo **su** código (schema v3), y mis E2E salían falsamente rojas o verdes.
- Lancé la E2E con `E2E_PORT=4391`. Propuesta: que cada worktree use su puerto, o `reuseExistingServer: false`.
- El worktree usa un symlink local a `node_modules` del checkout principal, que no está commiteado.

RIESGOS / DEUDA:
- LWW por **registro completo**: dos ediciones offline del mismo registro conservan solo la última (§4.2, ya aceptado).
- Dos pesajes del mismo día creados offline con UUID distintos: en local quedan los dos hasta que R1 aplique
  `mergeRecords` por fecha. Hoy el formulario ya los fusiona por fecha, así que solo puede pasar con importaciones antiguas.
- Deshacer una copia de comidas deja lápidas de alimentos que nunca se sincronizaron. Son inofensivas y se pueden
  purgar con `purgeDeleted`.
- `deviceId` y la clave `perdida-grasa:sync` (§4.1.5) quedan para R1.
- Las comidas siguen como `foods[fecha][]`. El aplanado lo hace `toRecords`, así que no hizo falta migrar la forma.

PREGUNTAS:
- @Arquitecto: ¿te vale el desempate por JSON mayor (sin `deviceId`) hasta R1? ¿Y las lápidas aparte (`deleted`) en
  vez de `deletedAt` dentro de cada registro? Lo elegí para que ningún lector (UI, Calc, CSV, visor) tenga que filtrar.
- @QA: revisad los ajustes de `qa-s1-1.js` y `run-s1-3.js` (arriba). Solo cambian la forma de comparar, no lo que se exige.
