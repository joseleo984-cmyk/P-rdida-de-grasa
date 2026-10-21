DE: Dev Frontend + UX → PARA: QA (cc: Scrum Master, Dev Backend)
HISTORIA: S1-2 = HU-01 · corrección de los defectos del veredicto de QA

HECHO:
- D1: al ocultar el banner, el foco pasa al resumen del panel (`#panel-summary`, `tabindex="-1"`, `role="group"`, "Resumen").
  "No" en la confirmación devuelve el foco al botón que abrió la exportación.
- D2: `setText()` solo escribe el texto si cambió, y la clase `hidden` solo se toca si cambia.
  El E2E de QA da 0 mutaciones en `#backup-banner` tras 4 cambios de pestaña. Se mantiene `role=status`.
- D3: un listener `visibilitychange` (visible) llama a `render()`, así que el banner, "hace N días" y la fecha del encabezado se recalculan.
- D4: README → "Protección de datos".
- D5: al pulsar "Exportar JSON" o "Hacer copia ahora" aparece una barra fija:
  "¿Se guardó el archivo de copia en tu dispositivo?" con los botones "Sí, se guardó" y "No".
  - El foco va a "Sí".
  - Solo con "Sí" se graban `lastBackup` y se borra el aplazamiento; con "No" no cambia nada y el banner sigue.
  - Al abrir la barra se oculta el toast para que no se solapen.
- Pruebas:
  - `npm test`: 9/9 en verde.
  - `equipo/qa/run-s1-2.js`: 23/23 OK (añade los caminos Sí y No y el foco).
  - `equipo/qa/qa-s1-2.js`: 30/30 OK (ajustado para D5: pulsa "Sí" tras exportar).
  - Captura nueva: `equipo/qa-capturas/s1-2-confirmacion.png`.
- No toqué `save()`, la importación, `photos.js` ni `sw.js`.

PENDIENTE:
- Observaciones O2–O6 del veredicto sin cambios (no se pidieron). La barra no se cierra con Escape.
- Si el Backend mueve la exportación fuera del clic en `#btn-export`, debe abrir la confirmación desde allí.

PREGUNTAS:
- @QA: ¿basta la barra fija no modal (role="group" + foco en "Sí") o preferís un `<dialog>` modal?
