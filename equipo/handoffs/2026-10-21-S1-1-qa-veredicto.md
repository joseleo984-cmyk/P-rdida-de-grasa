DE: QA / Revisor → PARA: Dev Backend (cc: Scrum Master, Arquitecto, Dev Frontend)
HISTORIA: S1-1 Esquema versionado + importación segura (merge `8d8a1ad`)
FECHA: 2026-10-21 · Las líneas `archivo:línea` se refieren al commit `8d8a1ad` (durante la revisión, `schema.js` cambió en disco y esos cambios no se revisaron) · Entorno: Playwright 1.56 / Chromium 1194, 390x844, es-CO, America/Bogota, file://

## VEREDICTO: **RECHAZADO** (devolver al Dev Backend; correcciones acotadas, re-revisión rápida)

El núcleo está bien: BUG-01, BUG-02, BUG-03 (kcal "100200") y BUG-04 quedan resueltos, un respaldo v1 **real** (generado
con la app anterior `8d8a1ad^1` desde la UI, con 2 fotos) se importa **sin pérdida**, y la importación es atómica
también ante un fallo real de IndexedDB a mitad de transacción. Se rechaza por dos defectos **altos** de pérdida de
datos (D1, D2) que entran en el alcance de la historia (riesgo R1 del propio Dev y criterio de cuota de HU-01), y por
dos medios (D3, D4) baratos de corregir ahora.

## Pruebas ejecutadas

| Suite | Resultado |
|---|---|
| `npm test` (calc 9 + schema 11) | 20/20 OK |
| `node equipo/qa/run-s1-1.js` (E2E del Dev) | 20/20 OK |
| `node equipo/qa/run-s1-2.js` (HU-01) | TODO OK (sin regresión) |
| `node equipo/qa/qa-s1-1.js` (**nuevo**, adversarial QA) | 42/50 OK: los 8 fallos son D1-D4 y L1-L2 |

`qa-s1-1.js` extrae la app anterior con `git archive 8d8a1ad^1` (o usa la carpeta pasada como argumento). Cubre:
un respaldo v1 real y una actualización in situ del localStorage v1; perfil heredado con BUG-04; `__proto__`/`constructor`
en todos los niveles; atomicidad con `IDBObjectStore.put` fallando en la 2.ª foto; cuota llena; Borrar todo; fotos
heredadas en IndexedDB; un payload XSS en **todos** los campos (también tras recargar); casos límite de
`migrate`/`normalize`/`normalizePhotos` en Node (ReDoS 8 MB: 80 ms); y despliegue (pages.yml, sw.js, index.html).

## Checklist DoD (§5 del informe del Sprint 0)

| # | Criterio | Estado |
|---|---|---|
| 1 | Criterios de aceptación (A2, A3, M1, M4, BUG-01/02/03/04/09/13/14) | ⚠️ Parcial: BUG-13 solo para fotos importadas, no para las fotos heredadas (D4) |
| 2 | `npm test` en verde, con tests de casos límite | ✅ 20/20 (el CI usa el glob `tests/*.test.js`) |
| 3 | E2E en 390x844 | ✅ Los del Dev, más los de QA |
| 4 | Sin errores de consola | ⚠️ OK en los flujos nuevos, pero falla con fotos heredadas sin fecha (D4) |
| 5 | Seguridad: nada llega a `innerHTML` sin `esc()`; se valida antes de persistir | ✅ Revisión exhaustiva abajo |
| 6 | Migración versionada y compatible con respaldos anteriores | ⚠️ Respaldo v1 OK; el perfil heredado inválido se pierde (D1) |
| 7 | Fechas en día local, 2 zonas horarias | n/a (no cambia) |
| 8 | Sin scroll horizontal a 390 px | ✅ `scrollWidth = 390` |
| 9 | PWA: `ASSETS` y `CACHE` actualizados | ✅ `schema.js` está en `ASSETS`, `CACHE` es `perdida-grasa-v3` y `pages.yml` copia `schema.js` |
| 10 | Revisión de otro agente | ✅ Esta revisión |

## Verificaciones pedidas

- **BUG-01**: ✅ Un JSON con `habits:null`, `foods:[]` o registros sin fecha no rompe la app tras recargar.
- **BUG-02 / M1 (XSS)**: ✅ Se buscaron las 13 asignaciones a `innerHTML` de `app.js` (`photos.js` no tiene ninguna).
  Todo valor de datos pasa por `esc()` o es un número normalizado o calculado (`Calc`, `Math.round`, `fmt`), una
  constante o `fmtDate()`. `fmtDate()` siempre devuelve una fecha con formato o "Invalid Date", nunca la entrada.
  Ejemplos: `app.js:207-216` (registros), `301-305` (comidas), `423-431` (galería), `437-442` (selects) y `461-465`
  (comparador). También se comprobó en navegador un payload en los 16 campos (perfil, registros, comidas, hábitos,
  biblioteca y fotos) y en fotos maliciosas escritas directamente en IndexedDB: no se ejecutó nada, ni antes ni
  después de recargar. CSP (M1.3) queda pendiente, como se acordó.
- **kcal "100200"**: ✅ Ahora suma 300.
- **Perfil inválido (BUG-04/M4)**: ✅ en el formulario (`app.js:124-127`). El caso heredado falla (D1).
- **Respaldo v1 real**: ✅ Perfil, registros (ids, medidas y nota con `<b>`, `&`, comillas, ñ y emoji), comidas,
  hábitos, biblioteca y 2 fotos idénticos byte a byte. La ida y vuelta v2 (export → import) tampoco pierde nada.
  La actualización in situ del localStorage v1 tampoco muestra avisos.
- **Atomicidad**: ✅ Si `put()` lanza en la 2.ª foto, se aborta la transacción, se revierte el `clear()` y se restaura
  el localStorage. ✅ JSON roto o irreconocible, o `photos` que no es una lista: no cambia nada.
- **`__proto__` / `constructor` / `prototype`**: ✅ `Object.prototype` intacto, y `foods`, `habits` y `library` solo
  guardan claves seguras. Efecto colateral: L1.
- **Migrate / normalize**: ✅ Rechaza `schemaVersion` `"2"`, `2.5`, `0`, `null` y `3`. No muta la entrada y es
  idempotente. ✅ Fechas: acepta 2024-02-29; rechaza 2026-02-29, fechas con espacio y fechas con hora. ✅ Rangos,
  `Infinity`, booleanos y arrays. ✅ Ids duplicados. ✅ Fotos: solo png, jpeg o webp en base64.
- **Borrar todo**: ✅ Limpia `lastBackup` y `backupSnooze`. ❌ No limpia `:backup` ni `:corrupto` (D3).
- **Toast de cuota**: ✅ En la importación. ❌ En el guardado normal el usuario no llega a verlo (D2).
- **Pages / SW**: ✅ (`pages.yml:32`, `sw.js:2-3`, `index.html:287`).

## Defectos

### D1 — ALTO — Un perfil heredado inválido se descarta y su única copia se acaba sobrescribiendo (pérdida de datos real, no solo percibida)
- Archivos: `schema.js:101-102` (`normalizeProfile` → `null`), `app.js:40-42` (`BACKUP_KEY` se sobrescribe en **cada**
  carga con avisos) y `app.js:137` (`fillProfileForm` no tiene nada con qué rellenar el formulario).
- Pasos (`qa-s1-1.js` §2):
  1. En la app anterior, perfil 70 → 80 kg (BUG-04), y después un registro y un alimento. El perfil queda persistido.
  2. Se abre la app nueva. Toast: «Se corrigieron 1 datos dañados». El usuario ve la vista Perfil **vacía** (nombre,
     edad, estatura, pesos, actividad y ritmo) y el onboarding.
  3. Se añade un registro: `perdida-grasa:v1` queda con `profile:null`. La copia `:backup` todavía tiene el perfil.
  4. Basta con otra carga que genere cualquier aviso. Por ejemplo, un alimento de solo espacios, que el formulario
     sigue aceptando (BUG-07). Al recargar, `:backup` se sobrescribe con el estado sin perfil y el perfil original
     desaparece **para siempre**.
- Impacto: para el usuario es pérdida de datos. Tiene que volver a escribir los 9 campos sin saber qué había. El
  mensaje habla de «datos dañados» y menciona una clave interna que el usuario no puede usar.
- **Comportamiento correcto propuesto**:
  1. `normalize` no debe tirar el perfil. Debe devolverlo aparte, p. ej. `{ state, warnings, rejected: { profile: p } }`,
     con los campos ya convertidos y solo los inválidos vacíos.
  2. Al cargar, `state.profile = null` (el cálculo no usa un perfil incoherente), pero el formulario se **rellena con el
     perfil rechazado**, se abre la vista Perfil y se muestra el motivo exacto, persistente, junto al formulario (no en
     un toast de 2,2 s): «Revisa tu perfil: la meta (80 kg) debe ser menor que el peso inicial (70 kg)».
  3. Hasta que el usuario guarde un perfil válido, el perfil rechazado se mantiene en el almacenamiento (p. ej.
     `profileDraft` dentro del estado, o la clave `perdida-grasa:perfilPendiente`) para que no se pierda con el
     siguiente `save()`.
  4. `BACKUP_KEY`: no sobrescribirla en cada carga. Basta con una copia por versión de origen escrita solo si no
     existe (`perdida-grasa:backup:v1`), o con no pisar una copia que ya tenga más datos.
  5. Test con el fixture v1 modificado (meta ≥ inicio) y E2E: el formulario aparece relleno tras recargar dos veces.

### D2 — ALTO — El aviso «Almacenamiento lleno» queda tapado por el de éxito: el usuario cree que guardó
- Archivo: `app.js:66-68` (`save()` no informa del fallo a quien lo llama) y quien llama a `save()` muestra el toast de
  éxito justo después: `132-133` («Perfil guardado»), `187-190` («Registro guardado»), `241-245` («Alimento agregado»)
  y `265-266` («Hábitos guardados»).
- Pasos: con `setItem` lanzando `QuotaExceededError`, ir a Registro y guardar un pesaje. El toast final es «Registro
  guardado». El dato solo está en memoria y se pierde al cerrar.
- Pasa lo mismo con `saveBlocked` (datos de una versión más nueva): el aviso queda tapado. Y con «Borrar todo», que
  muestra «Datos borrados» sin haber borrado nada (`app.js:688-696`).
- Esperado (criterio de HU-01): `save()` devuelve `true`/`false`, y si falla no se muestra el toast de éxito. Mejor
  aún: avisar con `role="alert"` y más duración.

### D3 — MEDIO — «Borrar todo» deja copias completas de los datos personales en `perdida-grasa:backup` y `:corrupto`
- Archivo: `app.js:685-697`. Pasos: importar un respaldo y recargar, de modo que exista `:backup`, y después Perfil →
  Borrar todo. `:backup` y `:corrupto` siguen en localStorage.
- El diálogo promete «Borrar todos los datos de este dispositivo». Es un problema de privacidad en un dispositivo
  compartido. Corregir con `setPref(BACKUP_KEY, null)` y `setPref(CORRUPT_KEY, null)`.

### D4 — MEDIO — Fotos heredadas en IndexedDB sin `date` rompen la galería (`pageerror`)
- Archivo: `app.js:329` (`a.date.localeCompare`). `loadPhotos()` (`app.js:331-336`) no normaliza lo que lee de IndexedDB.
- Origen: la importación anterior (BUG-13) guardaba fotos con cualquier forma. Pasos: `Photos.put({id:'x', pose:'frente', blob})`
  sin fecha, después recargar y abrir Fotos: «Cannot read properties of undefined (reading 'localeCompare')».
- Corregir: filtrar o normalizar al cargar, reutilizando las reglas de `Schema.normalizePhotos` sobre los metadatos, sin `data`.

### Bajos / observaciones (no bloquean)
- **L1** `schema.js:170`: un alimento legítimo llamado «Constructor» o «Prototype», escrito desde el formulario, se
  descarta de la biblioteca al recargar y dispara «Se corrigieron 1 datos dañados». Sugerencia: usar como clave un
  prefijo o `Map`, o aceptar el nombre si la clave real es segura (`dict()` ya no tiene prototipo).
- **L2** `app.js:653-668`: un respaldo con `photos` en el que **todas** las fotos son inválidas **vacía la galería
  actual**. El `confirm` dice «0 fotos», pero es fácil no verlo. Sugerencia: si `photos.length > 0` y todas se
  descartan, rechazar el archivo o conservar las fotos actuales.
- **L3** `schema.js:48`: `Number()` acepta `"0x10"` (16), `"1e2"` (100) e `"Infinity"` (rechazado por rango). Conviene
  exigir `/^-?\d+(\.\d+)?$/`. En cambio `"80,5"` (coma decimal, típica en es-CO) **descarta** el registro: sería mejor
  aceptar la coma.
- **L4** `schema.js:119`: una nota de más de 140 caracteres se trunca sin aviso, y no cuenta en «N datos descartados».
- **L5** `app.js:105`: el toast dura 2,2 s, poco para «No se importó. Las fotos del respaldo no tienen un formato válido».
  Propuesta para @Frontend: `role="alert"` + `max(2200, 60 ms × caracteres)`.
- **L6** BUG-07 (nombre de solo espacios) sigue sin corregir, y ahora tiene un efecto nuevo: el alimento se guarda,
  pero **desaparece al recargar** con el aviso de «datos dañados». Conviene adelantarlo a S1-3.
- **L7** El resumen de la importación no dice **qué** se descarta: si es el perfil, debería nombrarse («el perfil no
  es válido: …»).

## Respuestas a las preguntas del Dev
- **«Descartar el elemento y avisar»**: de acuerdo para registros, comidas y hábitos, **salvo el perfil** (D1: se
  conserva como borrador) y las fotos cuando se descartan todas (L2). El aviso tiene que decir qué se descarta (L7).
- **`RANGES`**: coinciden con los límites del formulario o los amplían (se comprobó en las 5 versiones de
  `index.html` del historial), así que ningún dato creado desde la UI queda fuera de rango. Solo L3 (la coma decimal).
- **iOS Safari**: no está disponible en este entorno. Queda como prueba manual pendiente (`atob` con fotos de 2-5 MB y
  `clear` + `put` en una sola transacción).

## Para cerrar S1-1
Corregir D1-D4, añadir sus casos a `tests/schema.test.js` / `run-s1-1.js` y volver a pasar `node equipo/qa/qa-s1-1.js`.
Se espera que todo salga OK, salvo los casos L1 y L2 si se dejan para después: en ese caso, marcarlos como conocidos.
