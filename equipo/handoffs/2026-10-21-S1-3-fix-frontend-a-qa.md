DE: Dev Frontend + UX → PARA: QA (cc: Scrum Master, Dev Backend, Analista/PO)
HISTORIA: S1-3 = HU-02 · corrección de las condiciones del veredicto de QA (D1-D4) + S1-2 N1 + Escape

HECHO:
- **D1 (decisión del SM):**
  - En hoy, cada bloque vacío que ayer sí tenía muestra la cabecera «Repetir <bloque> de ayer» con «Ayer: N kcal».
    Se oculta en cuanto el bloque de hoy tiene algo, lo que evita duplicar con un doble toque.
  - Al mirar un día pasado se mantiene «Repetir hoy» por bloque y se añade **«Copiar este día a hoy»**
    (`#btn-copy-to-today`): son 2 toques.
- **D2:** tras repetir un bloque, el foco va al botón equivalente regenerado. Si ya no existe, va al título del bloque
  (`[data-meal-title]`, `tabindex=-1`) o, como último recurso, a `#food-list-title`.
- **D3:** `toast(msg, {label, run})` admite un botón de acción. Toda copia muestra «Deshacer» durante 6 s, y deshacer
  quita **solo los ids añadidos** en esa copia (respeta lo registrado después).
- **D3, decisión sobre `confirm()`:**
  - Se eliminó en las copias de bloque.
  - **Se mantiene** solo en la copia de un día entero («Copiar de ayer», «Copiar del día anterior», «Copiar este día
    a hoy») cuando el destino ya tiene comidas. Motivo: un doble toque duplicaría el día entero y «Deshacer» solo
    revierte la última copia, así que el confirm es la red barata (C7 de QA sigue en verde).
  - Sobre un día vacío no se pregunta nada.
- **D4:** «a el 18 oct» → «al 18 oct».
- **L2:** «Copiar de ayer» y «Copiar este día a hoy» miden 44 px de alto (`.btn-tall`).
- **S1-2 N1 + L3:** `visibilitychange` solo re-renderiza si cambió el día. Ya no se pierden los hábitos sin guardar.
  Al cambiar de día, las fechas de diario, registro y fotos que seguían en el «hoy» anterior pasan al nuevo día.
- **Escape** en la barra «¿Se guardó el archivo?» equivale a «No».
- Se usa `Schema.copyMeals` / `Schema.addDays`. No toqué `normalize`/`migrate`/`load`/`save`, la importación,
  `photos.js` ni `sw.js` (no hay assets nuevos, así que `CACHE` no cambia).

PRUEBAS:
- `npm test`: 28/28 en verde.
- `run-s1-1`: 20/20 · `run-s1-2`: TODO OK · `run-s1-3`: TODO OK · `qa-s1-2`: TODO OK · `qa-s1-3`: 24/24 OK.
- Captura: `equipo/qa-capturas/s1-3-fix-repetir-de-ayer.png` (390 px, sin scroll horizontal).

AJUSTES A LAS PRUEBAS (solo donde la decisión cambia lo esperado):
- `run-s1-3.js` §1: antes «en hoy no hay botones de bloque»; ahora se esperan 3 «Repetir <bloque> de ayer» (D1).
- `qa-s1-3.js` C2: copia el día 17 con «Copiar este día a hoy» (2 toques) en lugar de 4 × «Repetir hoy».
  Se añadieron C2b/C2c, que comprueban «Deshacer».
- `qa-s1-3.js` R1: como Escape ya cierra la barra, se vuelve a abrir antes de R1c-R1e.

PENDIENTE / RIESGOS:
- «Deshacer» está en el toast (role=status), al final del DOM. Con teclado o lector se llega tarde: no se le pasa el
  foco a propósito para no robarlo. Si QA lo considera insuficiente, en HU-03 se puede usar un componente de
  confirmación propio.
- Si se cambia de día con el diario en una fecha distinta de «hoy», la fecha no se mueve, porque fue elegida.
