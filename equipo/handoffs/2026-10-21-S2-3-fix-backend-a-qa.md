DE: Dev Backend + Datos → PARA: QA (cc: Scrum Master, Dev Frontend)
HISTORIA: S2-3 — ajustes del veredicto `2026-10-21-S2-3-qa-veredicto.md` (D1, O1, O2, O4)
BASE: `claude/agent-team-app-org-nnunot`, integrada con `git merge` (fast-forward, incluye la E2E con Playwright).

HECHO:
- **D1**: un error al abrir una copia con el visor abierto («Abrir otra» con un JSON roto o irreconocible) se muestra
  **dentro del visor**, en el nuevo `<p id="coach-error" class="warn" role="alert">`, así:
  «No se pudo abrir «roto.json». El archivo no es un JSON válido. Sigues viendo la copia anterior.».
  - Se borra al abrir otra copia válida y al cerrar.
  - Con el visor cerrado se sigue usando el toast de error.
  - En `tests/e2e/s2-3.spec.js`, el `test.fail` pasa a ser un test normal: comprueba que el error es visible y está
    encima de todo (`elementFromPoint`), que tiene `role=alert`, que el título sigue en la copia anterior y que el
    error desaparece al abrir una copia válida.
- **O1**: `#coach-title` tiene `tabindex="-1"` y recibe el foco tras `showModal()`. El lector anuncia primero de quién
  es la copia. Al cerrar, el foco sigue volviendo al control que lo abrió (lo cubre el test de accesibilidad existente).
  Hay un test nuevo para O1.
- **O2**: el día de referencia es `min(día local de exportedAt, hoy)`.
  - Si la fecha de exportación es posterior a hoy, el visor lo indica: «(hoy; la fecha de exportación es posterior)».
  - Copias v1 sin `exportedAt`: siguen usando hoy, como se acordó. Usar la última fecha con datos queda como mejora
    opcional para el Analista.
  - Hay un test nuevo para O2: `exportedAt` el 25-oct → referencia el 21-oct y la tabla «1 sem 5/7».
- **O4 (era trivial, hecho)**: las miniaturas se decodifican **de una en una**, cediendo el hilo entre fotos
  (`setTimeout`). El visor se abre sin esperar a las fotos.
  - Un contador de generación corta la decodificación si se abre otra copia o se cierra el visor, así que no quedan
    URLs huérfanas.
  - Sigue pendiente medir en un iPhone real con copias de más de 20 MB: el `JSON.parse` del archivo entero sigue
    siendo síncrono.
- `sw.js`: `CACHE = 'perdida-grasa-v9'`. No se tocaron la pantalla legal (S2-1) ni las migraciones de `schema.js`.

DEFINICIÓN DE HECHO (checklist):
- [x] Criterios cumplidos: D1, O1, O2 y O4.
- [x] `npm test` en verde: 37/37.
- [x] `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npm run test:e2e` en verde: **40 passed** (390x844). Incluye el test de
      D1, que ya no es `test.fail`, y los nuevos de O1 y O2.
- [x] Sin errores de consola en los flujos afectados: `equipo/qa/run-s2-3.js` 18/18.
- [x] Seguridad: el mensaje de error se pinta con `textContent`, y las miniaturas se siguen escapando con `esc()`.
- [x] PWA: `CACHE` subido (no hay assets nuevos).
- [x] Handoff escrito. El tablero lo actualiza el SM.
- [ ] Prueba manual en iPhone real (O4) y del CSV en Excel y Sheets (O3): pendientes del Stakeholder, igual que antes.

NOTA DE ENTORNO: el worktree no tenía `node_modules`. Para la E2E se enlazó el del checkout principal con un symlink
local que **no** se ha commiteado.
