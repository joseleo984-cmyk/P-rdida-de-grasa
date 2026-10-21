DE: QA / Revisor → PARA: Dev Frontend (cc: Scrum Master, Dev Backend)
HISTORIA: S1-2 = HU-01 · re-verificación de D1-D5 (merge `5c96270`, revisado sobre `f168206`)
FECHA: 2026-10-21 · Entorno: Playwright 1.56 / Chromium 1194, 390x844 móvil, es-CO, America/Bogota, `page.clock`

## VEREDICTO: **APROBADO**. D1-D5 cerrados; queda 1 defecto menor nuevo (N1), que se corrige en S1-3 o en la siguiente pasada

## Pruebas
| Suite | Resultado |
|---|---|
| `npm test` (calc + schema + meals) | 28/28 OK |
| `equipo/qa/run-s1-2.js` (Dev) | TODO OK (23) |
| `equipo/qa/qa-s1-2.js` (QA, ajustado a D5) | TODO OK (30) |
| `equipo/qa/run-s1-1.js` (regresión) | 20/20 OK |
| `equipo/qa/qa-s1-3.js` §Re-verificación S1-2 (**nuevo**) | 6/8: los fallos son R1b (Escape, aceptado como observación) y R2 (N1) |

## Defectos anteriores
| Id | Estado | Comprobación |
|---|---|---|
| D1 foco | ✅ Cerrado | Al ocultar el banner, el foco va a `#panel-summary`. Con «No», el foco vuelve al botón de origen. |
| D2 región viva | ✅ Cerrado | `setText()` escribe solo si cambia. 0 mutaciones en `#backup-banner` tras 4 cambios de pestaña. |
| D3 reanudar en iPhone | ✅ Cerrado | `visibilitychange` → `render()` recalcula el banner y «hace N días» (pero ver N1). |
| D4 README | ✅ Cerrado | Nueva sección «Protección de datos». |
| D5 «¿Se guardó?» | ✅ Cerrado | Solo «Sí» graba `lastBackup` y borra el aplazamiento; «No» no cambia nada. El foco empieza en «Sí» y el toast se oculta. |

## Dictamen sobre el riesgo abierto: barra no modal y sin Escape → **SE ACEPTA**
- Una barra no modal es el patrón adecuado: la descarga ya ocurrió y la pregunta solo afina un recordatorio. Un
  `<dialog>` modal bloquearía la app por algo que no es crítico. En iOS, el modal además compite con la hoja nativa
  de «Descargar/Compartir».
- WCAG no exige cerrar con Escape un componente no modal. El foco se mueve a «Sí», el grupo tiene nombre accesible
  (`aria-labelledby`), la barra no tapa la barra de pestañas (bottom 768 < 785 px) y no captura el foco.
- **Recomendación (no bloquea):** que Escape equivalga a «No» (un `keydown` en `#backup-confirm`). Es una línea y
  hace coherente el teclado con el visor de fotos, que es un `<dialog>` y sí se cierra con Escape.

## Defecto nuevo
**N1 · Menor (regresión de D3) · Al volver a la app se borran los hábitos escritos y no guardados**
- Archivo: `app.js:801` (`visibilitychange` → `render()`) y `app.js:343` (`renderFoods` reescribe
  `steps`/`water`/`sleep`/`trained` desde `state.habits`).
- Pasos: Comidas → escribir Pasos = 12345 sin pulsar «Guardar» → cambiar de app (p. ej., ir a Salud para ver el sueño)
  → volver. El campo queda vacío. El alimento que se estaba escribiendo **sí** se conserva.
- Esperado: no pisar campos sin guardar. Lo más simple es rellenar el formulario de hábitos solo cuando cambia la
  fecha del diario o tras guardar, no en cada `render()`.

## Observaciones (sin cambios desde el veredicto anterior)
- O2-O6 del veredicto anterior siguen abiertas, como se acordó.
- El diario no cambia de fecha al cruzar la medianoche con la app abierta, ni siquiera con el nuevo
  `visibilitychange` (ver S1-3, L3).
