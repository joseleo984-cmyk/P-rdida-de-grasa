DE: Dev Backend + Datos → PARA: QA, Dev Frontend (cc: Scrum Master, Arquitecto)
HISTORIA: S1-1 Esquema versionado + importación segura (A2, A3, M1, M4 · BUG-01, 02, 03, 04, 09, 13, 14)

HECHO:
- `schema.js` (nuevo, UMD como `calc.js`, global `Schema`, sin DOM):
  - `CURRENT_VERSION = 2`; `migrate(raw)` encadena `MIGRATIONS[n]` (puras, no mutan la entrada). Sin
    `schemaVersion` = v1. Lanza si no es un objeto, si la versión no es un entero ≥ 1 o si es más nueva.
    v1→v2 no cambia la forma: solo añade `schemaVersion`, y desde v2 los datos se garantizan normalizados.
  - `normalize(raw, {uid})` → `{ state, warnings[] }`. Lanza si no es un objeto o no tiene ninguna clave conocida.
    Números: acepta `"80.5"` → 80.5 y descarta NaN, Infinity o valores fuera de rango (`RANGES`). Fechas ISO reales
    (1900-2100, sin 2023-02-30). Ids: `/^[a-z0-9-]{1,40}$/i` y únicos (si no, se regeneran). `foods`/`habits`/`library`
    son diccionarios `Object.create(null)` y se descartan las claves que no son fecha o son `__proto__`/`constructor`/`prototype`.
    Se descartan: registros sin fecha o sin ninguna medida, alimentos sin nombre o sin kcal válidas (`meal`
    desconocido → "Snack"; macros inválidas → 0) y hábitos que no son objeto. Notas ≤ 140 y nombres ≤ 80/40.
  - `profileError(p)`: devuelve el motivo o `null`. Lo usan el formulario y `normalize` (un perfil inválido → `null`).
    Actividad o ritmo desconocidos se corrigen a 1.2 y 0.005, con aviso.
  - `normalizePhotos(list)`: id, fecha, pose (desconocida → "frente") y `data` que cumpla
    `data:image/(jpeg|png|webp);base64,…`. Si no es una lista, lanza. `isISODate`, `emptyState`.
- `app.js`:
  - `load()` = parse → migrate → normalize. Si se migró o corrigió algo, guarda una copia cruda en
    `perdida-grasa:backup` (una sola copia que se sobrescribe) y muestra un toast al arrancar. Si el dato es ilegible,
    lo copia a `perdida-grasa:corrupto` y la app arranca vacía, sin romperse. Si los datos vienen de una versión más
    nueva, bloquea `save()` para no pisarlos.
  - `save()` escribe `schemaVersion`. Si falla por cuota: "Almacenamiento lleno: exporta una copia y borra fotos
    antiguas" (criterio de HU-01).
  - Importación **atómica**: JSON → migrate → normalize → normalizePhotos, todo en memoria. Después se pide
    `confirm()` con un resumen (registros, días de comidas, fotos y datos descartados). Primero se escribe
    localStorage y luego las fotos; si fallan las fotos, se restaura el localStorage anterior. Cualquier error →
    toast "No se importó. <motivo>" y no cambia nada. Sin clave `photos` → se conservan las fotos actuales (como antes).
  - Exportar JSON añade `schemaVersion` y `exportedAt`.
  - Perfil: se construye y valida con `Schema.profileError` **antes** de asignar `state.profile` (BUG-04).
  - `esc()` en `e.id` y en `x.id`/`x.kcal` (comidas), y en `p.id`, `POSES[...]` y `photoUrl` (galería, selects y comparador).
    Lo demás que se interpola son números calculados (`Calc`, `Math.round`, `fmt`) o constantes.
  - "Borrar todo" también elimina `perdida-grasa:lastBackup` y `perdida-grasa:backupSnooze` (pedido del SM/Frontend).
- `photos.js`: `importAll` decodifica todas las fotos en memoria (`atob`, sin `fetch`) y hace `clear()` + `put()` en
  **una** transacción, así que un fallo la revierte (BUG-14). `tx()` aborta si el callback lanza.
- `index.html` (`<script src="schema.js">` antes de `photos.js`/`app.js`), `sw.js` (`ASSETS` + `CACHE = 'perdida-grasa-v3'`)
  y `.github/workflows/pages.yml` (copia `schema.js` a `_site`; sin esto el despliegue se rompía).
- `package.json`: `"test": "node --test tests/*.test.js"`. Con `node --test tests/`, Node 22 trata la carpeta como
  un archivo y falla. El glob lo expande el shell de npm.
- Se integró `claude/agent-team-app-org-nnunot` (S1-2) sin conflictos; los dos listeners de `#btn-export` y `renderBackup()` se conservan.

CÓMO PROBARLO:
- `npm test` → 20/20 (calc 9 + schema 11): migración v1→v2, fixture `tests/fixtures/backup-v1.json` (no modificar nunca),
  BUG-01, XSS en ids/kcal/fotos, kcal como texto, `__proto__`, ids duplicados, perfil e `isISODate`.
- E2E: `node equipo/qa/run-s1-1.js` (file:// por defecto) o `node equipo/qa/run-s1-1.js http://127.0.0.1:8080/` → 20/20 OK en
  ambos, 390x844, Bogotá. Cubre: respaldo v1 con 2 fotos; JSON irreconocible, roto o con `photos` no lista → sin
  cambios; fallo simulado de IndexedDB → localStorage revertido y galería intacta; BUG-01 tras recargar; XSS sin
  ejecución (también tras recargar); kcal "100"+"200" = 300; localStorage dañado, ilegible y de una versión futura;
  perfil inválido. `run-s1-2.js` sigue 100 % OK. Por http, el SW instala `perdida-grasa-v3` con `schema.js`.
- Capturas: `equipo/qa-capturas/s1-1-import-v1-fotos.png`, `s1-1-import-rechazado.png`, `s1-1-xss-kcal.png`.

DECISIONES:
- Se mantiene la clave `perdida-grasa:v1` (arquitectura §5.3: cambiarla obliga a copiar y borrar, con más riesgo).
  La versión va dentro del dato. Claves auxiliares: `perdida-grasa:backup` y `perdida-grasa:corrupto`.
- `lastBackup`/`backupSnooze` siguen fuera del esquema (son preferencias del dispositivo y no van en el respaldo).
- Ante datos dudosos se **descarta el elemento**, no el archivo entero. Solo se rechaza un archivo irreconocible.
  El usuario ve cuántos datos se descartarán antes de confirmar, y el detalle sale en `console.warn`.
- No hice CSP (M1.3), ni `crypto.randomUUID` en `uid()` de la app, ni tampoco fechas futuras (BUG-05) ni fusión de
  duplicados por fecha: quedan fuera de S1-1.

PENDIENTE / RIESGOS:
- Rangos de `normalize` algo más amplios que los del formulario. Un perfil antiguo guardado con meta ≥ peso inicial
  (BUG-04 ya ocurrido) se descarta al cargar: reaparece el onboarding (queda copia en `perdida-grasa:backup`).
- Toasts largos con solo 2,2 s de duración (los de importación rechazada).
- Respaldos muy grandes: las fotos se decodifican todas en memoria antes de escribir (es el precio de la atomicidad).

PREGUNTAS:
- @QA: ¿el criterio "descartar el elemento y avisar" te vale, o prefieres rechazar el archivo si hay cualquier dato
  inválido? Revisa también los rangos de `RANGES` en `schema.js` y prueba en iOS Safari (atob y transacción única).
- @Frontend: el toast dura 2,2 s y los mensajes de importación son más largos. ¿Alargamos la duración según el
  texto o usamos `role="alert"`? Si en S1-3 añades campos al estado (p. ej. comidas repetidas), hace falta una
  migración `MIGRATIONS[3]` + test con el fixture v1. Avísame y la hago yo.
- @Arquitecto: ¿subo ya `uid()` a `crypto.randomUUID` (el patrón de ids ya admite 36 caracteres)?
