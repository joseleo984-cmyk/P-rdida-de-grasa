DE: Dev Backend + Datos → PARA: QA (cc: Scrum Master, Analista, Dev Frontend)
HISTORIA: S2-3 Kit piloto en la app (resuelve 3 problemas de `piloto-r0.md`: el CSV no traía hábitos, faltaban fotos para el coach e importar JSON reemplazaba los datos del coach)
BASE: `claude/agent-team-app-org-nnunot` en `ff00d86`, integrada por fast-forward.

HECHO:
- **`coach.js`** (nuevo, UMD y puro como `calc.js`, global `Coach`; en Node hace `require('./calc.js')`):
  - `toCSV(state)`: una fila por fecha con cualquier dato. Columnas: Fecha, Peso (kg), Cintura, Cuello y Cadera (cm),
    % grasa (manual o Navy), Calorías (kcal), Proteína, Carbohidratos y Grasas (g), Alimentos registrados, Pasos,
    Agua (L), Sueño (h), Entrenó fuerza (Sí/No) y Nota.
    - Se deja **vacío** cuando no hay registro de ese tipo: un día sin comidas no sale con 0 kcal.
    - Formato elegido: **`;` + coma decimal + BOM UTF-8 + CRLF**. Excel en es-CO usa `;` como separador de listas y
      `,` como decimal, así que lo abre en columnas con doble clic y con las tildes bien. Google Sheets detecta `;`
      al importar; con configuración regional Colombia, `68,8` se lee como número.
    - Las notas van entre comillas, con `""` para las comillas internas, y se les antepone `'` si empiezan por
      `= + - @` (BUG-12: inyección de fórmulas).
  - `summarize(state, { today })`: resumen de solo lectura de un cliente:
    - Nombre y rango de fechas.
    - Peso inicial (perfil o primer pesaje), actual, meta, cambio, tendencia de 7 días (`Calc.trend`), y ritmo semanal
      en kg y % (`Calc.weeklyRate`).
    - % de grasa (primero y último) y objetivo de kcal y proteína (`Calc.plan`).
    - Adherencia en ventanas de 7, 14 y 28 días que **terminan el día de referencia**: días con algo, con comidas, con
      hábitos, pesajes y media de proteína y kcal en los días con comidas.
    - Las últimas 5 notas.
    - Un día con hábitos guardados cuenta aunque solo diga "no entrené".
- **`app.js`**:
  - «Exportar CSV» usa `Coach.toCSV`.
  - Nuevo bloque «Copia de un cliente» en la zona de Datos. No toca las de comidas, `visibilitychange` ni la barra de
    confirmación de copia.
    - Lee el archivo → `Schema.migrate` → `Schema.normalize` → `Schema.normalizePhotos` → `Coach.summarize`, todo en
      memoria. **Nunca** asigna `state`, ni llama a `save`/`persist` ni a escrituras de `Photos`.
    - Día de referencia: la fecha local de `exportedAt` si el archivo la trae; si no, hoy.
    - Las fotos se decodifican con `Photos.decode`, nuevo alias exportado de `dataURLToBlob`, y se muestran con
      object URLs. Esas URLs se liberan al cerrar y al abrir otra copia.
    - Todo lo interpolado pasa por `esc()`.
    - Si el archivo es un JSON roto o irreconocible, avisa con un toast de error y no abre el visor. Si la copia está
      dañada, se abre indicando cuántos datos se ignoraron, el perfil inválido y si las fotos tienen un formato inválido.
- **`index.html`**: tarjeta «Ver copia de un cliente» en Perfil, bajo «Datos», y `<dialog id="coach-viewer">` con
  «Abrir otra» y «Cerrar». También `<script src="coach.js">` tras `schema.js`.
  **`styles.css`**: bloque `.coach-*` al final.
- `photos.js` (solo una línea: el export de `decode`), **`sw.js`** (`coach.js` en `ASSETS`, `CACHE = 'perdida-grasa-v7'`) y
  **`pages.yml`** (copia `coach.js`).
- `README.md` y `equipo/piloto-r0.md`:
  - Nota del CSV actualizada.
  - El Stakeholder ya no usa «Importar JSON» con copias de clientes.
  - Nueva sección «Ver la copia de un cliente en la app».

PRUEBAS:
- `npm test`: 37/37, de las que 6 son nuevas en `tests/coach.test.js`. Cubren:
  - En el CSV: BOM, `;`, CRLF y cabeceras; valores por columna con coma decimal; día solo con hábitos; día sin
    comidas → vacío; Navy calculado; notas con `;`, comillas, salto de línea y fórmula.
  - En el resumen: pesos, tendencia, ritmo, grasa y notas; ventanas de 7/14/28 días respecto a la referencia (datos
    posteriores fuera); copia vacía o sin perfil.
- `node equipo/qa/run-s2-3.js` (nuevo, 390x844, file://): 18/18. Comprueba:
  - CSV descargado con BOM, cabeceras de hábitos y una fila `2026-10-15;68,8;…;9000;2,5;7,5;Sí;…`.
  - Copia 1 con nombre XSS escapado, resumen, adherencia y 2 miniaturas, sin scroll horizontal.
  - Copia 2 abierta desde el visor: reemplaza a la 1 y libera sus URLs (espía de `revokeObjectURL`).
  - Nota `<script>` mostrada como texto; «Cerrar» vacía el visor y libera las URLs.
  - JSON roto o irreconocible → no se abre; copia dañada (BUG-01, `photos` no lista) → se abre con avisos.
  - **Datos propios intactos**: todas las claves de localStorage byte a byte, IndexedDB con las mismas 2 fotos
    (id + tamaño), galería y panel propios, también tras recargar. Sin errores de consola.
  - Captura: `equipo/qa-capturas/s2-3-copia-cliente.png`.
- Regresión (sobre una copia, para no pisar capturas): `run-s1-1` 23/23, `run-s1-2` TODO OK, `run-s1-3` TODO OK,
  `qa-s1-2` TODO OK, `qa-s1-1` 49/50 (el mismo caso `CACHE v3` ya justificado: ahora es v7), `qa-s1-3` 14/22.
  Los **8 fallos de `qa-s1-3` son idénticos en la base `ff00d86`** sin mis cambios: son los defectos de S1-3 que
  está corrigiendo el Frontend (C1-C5, C10, R1b, R2).

DECISIONES:
- **`;` y coma decimal**, en lugar de `,` y punto. El destino real son Excel o Sheets en Colombia. Un sistema que
  necesite `,` puede usar el JSON.
- La referencia de las semanas es la **fecha de exportación**. El coach abre el lunes un archivo del domingo; si se
  contara desde hoy, la semana actual saldría con un día vacío. Las copias v1 no traen `exportedAt` → se cuenta desde hoy.
- **Sin semáforo automático** por ahora: la regla del §9 de `piloto-r0.md` necesita la semana anterior y el envío a
  tiempo, que la app no conoce. El resumen ya da los datos para aplicarla a mano. Candidato a HU-P05.
- El visor es un `<dialog>` modal, no una sexta pestaña. No cambia la navegación ni el estado.

PREGUNTAS:
- @QA: ¿probáis el CSV en Excel real (Windows y Mac es-CO) y en Google Sheets con configuración regional EE. UU.? En
  EE. UU., la coma decimal se leería como texto. Si los coaches usan Sheets en inglés, se podría añadir un selector.
- @Analista: ¿la ventana de proteína basta con 1/2/4 semanas, o el coach quiere también kcal media en la tabla? Ya
  está calculada (`kcalAvg`), pero no se muestra para no desbordar a 390 px.
- @Frontend: el visor reutiliza `.stats`, `.thumbs` y `.btn`. Si cambiáis esos estilos, revisad `#coach-viewer`. El
  foco al abrir lo pone `showModal()` en el primer control («Abrir otra»).
