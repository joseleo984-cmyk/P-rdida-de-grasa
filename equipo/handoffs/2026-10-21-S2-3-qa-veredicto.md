DE: QA / Revisor → PARA: Dev Backend (cc: Scrum Master, Analista, Dev Frontend)
HISTORIA: S2-3 · Kit piloto: CSV completo (Excel es-CO) y «Ver copia de un cliente» en solo lectura (merge `166dbb8`)
FECHA: 2026-10-21 · Entorno: Playwright 1.56.1 (`@playwright/test`), Chromium 1194, móvil 390x844, es-CO, America/Bogota

## VEREDICTO: **APROBADO** (1 defecto menor y 4 observaciones; nada bloquea el piloto)
Lo crítico está garantizado y probado:
- Abrir copias **no escribe nada** propio.
- No hay XSS por el JSON abierto.
- El CSV neutraliza las fórmulas (BUG-12).
- Las object URLs se liberan.
- Las ventanas de adherencia terminan en la fecha de exportación.

## Pruebas
| Suite | Resultado |
|---|---|
| `npm test` | 37/37 OK (6 nuevas en `tests/coach.test.js`) |
| `equipo/qa/run-s2-3.js` (Dev) | 18/18 OK |
| `npm run test:e2e` (con la nueva **`tests/e2e/s2-3.spec.js`**, 9 tests) | **38 OK**; 1 de ellos es un `test.fail` esperado que documenta D1 |

`s2-3.spec.js` cubre:
1. **Aislamiento.** Se espían `Storage.setItem`, `removeItem` y `clear`, y `IDBObjectStore.put`, `add`, `delete` y
   `clear`. Al abrir, abrir otra y cerrar hay **0 llamadas**. La instantánea de todo el localStorage y de las fotos en
   IndexedDB (id, tamaño, fecha, pose) es idéntica antes, después y tras recargar, y la galería propia sigue con 2 fotos.
2. **XSS.** Hay payloads en el nombre, las notas, los alimentos, los ids, la pose y el nombre del archivo. No se
   ejecuta ninguno y no hay ningún `<img>` que no sea `blob:`.
3. **Resumen y ventanas.**
   - Exportada el 18-oct a las 22:30 en Bogotá (03:30Z del 19): la referencia es el 18-oct.
   - Las ventanas dan 1 sem 7/7 (comidas 7, hábitos 3, pesajes 3, proteína 40 g), 2 sem 8/14 y 4 sem 9/28.
   - El 19-oct queda fuera.
   - Una copia sin `exportedAt` usa hoy y lo dice.
4. **Object URLs.** Se crean 2. Al abrir otra se revocan las anteriores, y con Escape se revocan todas: creadas = revocadas.
5. **Copias rotas.** Un JSON roto no abre el visor. Una copia dañada se abre con los avisos «se ignoraron» y «fotos
   no válidas».
6. **Accesibilidad del modal.** Tiene `aria-labelledby` y el foco queda dentro (6 × Tab). Escape cierra y devuelve el
   foco a `#file-coach`. No hay scroll horizontal en el visor a 390 px.
7. **CSV.**
   - Formato: BOM, 16 columnas, `;`, CRLF, coma decimal. Un día solo con hábitos y un día con «No» no rellenan las
     columnas de comidas con 0. Navy en 31,9.
   - Notas: `=`, `+`, `-` y `@` reciben la `'` delante. Una nota con `;`, comillas y salto de línea va bien entrecomillada.
   - Un tabulador inicial ya llega recortado por `Schema.normalize`.

## Defecto
**D1 · Menor (UX) · Con el visor abierto, el error de «Abrir otra» queda tapado por el modal**
- Archivos: `app.js` `openCopy…` → `toast(…, true)`. El `#toast` está fuera del `<dialog>`, y el `showModal()` del
  visor (capa superior, a pantalla completa) lo tapa.
- Pasos: abrir la copia de A → «Abrir otra» → elegir un JSON roto. No se ve ningún aviso y el visor sigue mostrando A.
- Riesgo: el coach cree que abrió la copia de B. Lo mitigan el título («Copia de A») y el nombre de archivo, ambos
  visibles.
- Arreglo propuesto: mostrar el error dentro del visor (p. ej. un `<p class="warn" role="alert">` en `.coach-bar`),
  o mover `#toast` dentro del `<dialog>` mientras esté abierto.
- Vigilado por el `test.fail` de `s2-3.spec.js:141`: cuando se corrija, Playwright avisará para quitar la marca.

## Observaciones
- **O1 · a11y**: al abrirse, el foco cae en el `<input type=file>` invisible de «Abrir otra» (lo pone `showModal()`).
  VoiceOver anuncia «Elegir archivo» antes del título. Propuesta: poner `autofocus` en «Cerrar», o
  `tabindex="-1"` + foco en `#coach-title`.
- **O2 · Fecha de referencia**:
  - Si `exportedAt` es **futura** (reloj del cliente mal puesto), la referencia queda en el futuro y la tabla sale
    vacía (probado: 25-oct → «1 sem 0/7»).
  - Sin `exportedAt` (copias v1), se cuenta desde hoy y la semana actual sale con días vacíos.
  - Propuesta: `ref = min(fecha de exportación || hoy, hoy)`. En las v1, usar la última fecha con datos y decirlo.
  - `toISO(exportedAt)` usa la zona horaria **del coach**. Si un coach en otra zona abre la copia, la referencia
    puede moverse un día. Es aceptable en el piloto, que es todo en Colombia.
- **O3 · CSV en programas reales**: aquí no hay Excel ni Sheets. Queda una **prueba manual pendiente** para el
  Stakeholder o el Analista:
  1. Excel es-CO en Windows y Mac: abrir con doble clic, ver columnas, coma decimal y tildes.
  2. Google Sheets en es-CO y en-US.
  - En Sheets con configuración regional EE. UU., «68,8» se leerá como texto. Si algún coach la usa, conviene el
    selector que propone el Dev (o exportar también con `,` y punto decimal).
  - `round(…, 1)` redondea el sueño 7,25 → 7,3. Es suficiente, porque el formulario usa pasos de 0,1.
- **O4 · Rendimiento**: las fotos de la copia se decodifican todas con `atob` en el hilo principal. Con copias de
  muchas fotos (más de 20 MB) la UI puede congelarse unos segundos. Pendiente de probar en un iPhone real; se podría
  decodificar de forma diferida al hacer scroll.

## Respuestas
- @Dev (Excel / Sheets): ver O3. No se puede probar en este entorno; queda como prueba manual del Stakeholder antes
  del piloto.
- @SM: `s2-3.spec.js` ya forma parte de la E2E del CI. Al integrar S2-1 (pantalla legal), el helper
  `acceptLegalIfPresent` la acepta antes de cada spec.
