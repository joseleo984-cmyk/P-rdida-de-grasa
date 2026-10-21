DE: QA / Revisor → PARA: Dev Frontend (cc: Scrum Master, Dev Backend, Analista/PO)
HISTORIA: S1-3 = HU-02 · re-verificación de D1-D4 (merge `4f3aaa9`, con el conflicto de `toast()` resuelto por el SM)
FECHA: 2026-10-21 · Entorno: Playwright 1.56 / Chromium 1194, 390x844 móvil (touch), es-CO, America/Bogota, `page.clock`

## VEREDICTO: **APROBADO**

## Pruebas
| Suite | Resultado |
|---|---|
| `npm test` | 31/31 OK |
| `run-s1-1` / `run-s1-2` / `qa-s1-2` / `run-s1-3` | 23/23 · TODO OK · TODO OK · TODO OK |
| `qa-s1-1` | 61/62 (el único fallo es O1 de S1-1, una observación ya conocida) |
| `qa-s1-3` (ampliado con «Re-verificación»: U1-U8) | **34/34 OK** |

## Condiciones del veredicto anterior
| Id | Estado | Comprobación |
|---|---|---|
| D1 flujo desde hoy / día elegido | ✅ | En hoy aparece «Repetir <bloque> de ayer» en los bloques vacíos. En un día pasado, «Copiar este día a hoy» lo hace en 2 toques. |
| D2 foco | ✅ | Tras repetir un bloque, el foco pasa al título del bloque (`data-meal-title`), no a `<body>` (U7). |
| D3 deshacer / `confirm()` | ✅ | «Deshacer» durante 6 s, que quita solo los ids de esa copia (U4). Con un toque en pantalla táctil funciona. Ya no hay `confirm()` en las copias de bloque. Se mantiene en la copia de un día entero sobre un destino con comidas, y me parece adecuado. |
| D4 errata | ✅ | Ahora dice «al 18 oct» o «a hoy». |
| L2 / L3 | ✅ | Los botones miden 44 px. Al cruzar la medianoche, las fechas que estaban en «hoy» pasan al nuevo día. |
| S1-2 N1 | ✅ | Volver a la app ya no borra los hábitos sin guardar (R2). Escape cierra la barra «¿Se guardó?» como «No». |

## Integración `toast(msg, opt)` + `save()` (conflicto resuelto por el SM)
| Caso | Resultado |
|---|---|
| U1 Cuota llena + «Copiar de ayer» | ✅ Toast de **error**, sin éxito, sin «Deshacer» y la lista no cambia |
| U1b Cuota llena + «Repetir desayuno de ayer» | ✅ Lo mismo |
| U2 Copia correcta | ✅ «Se copiaron 2 alimentos a hoy · Deshacer» |
| U2b Cuota llena + «Deshacer» | ✅ Toast de error, no dice «Copia deshecha», y la pantalla coincide con lo guardado (la copia sigue) |
| U4 «Deshacer» con un toque | ✅ El día queda vacío y aparece «Copia deshecha» |
| U5 / U6 | ✅ El toast con acción cabe en 390 px. A los 6 s se oculta y el botón deja de ser alcanzable (`visibility:hidden`) |
| U8 | ✅ Sin errores de consola |

## Observaciones (no bloquean)
- **O1 · a11y**: «Deshacer» vive en `#toast` (`role=status`), al final del DOM, y desaparece a los 6 s. Con teclado o
  lector de pantalla cuesta llegar a tiempo. Lo acepto porque deshacer no es imprescindible: cada alimento se puede
  borrar con ✕. Propuesta para HU-03: un atajo, o que el aviso no se oculte mientras tenga el foco
  (WCAG 2.2.1, tiempo ajustable).
- **O2**: cualquier toast posterior, por ejemplo «Alimento agregado», reemplaza al de «Deshacer», y la copia ya no se
  puede deshacer (U3). Es el patrón habitual de las *snackbars*, así que no es un defecto.
- **O3**: `undoCopy` muestra «Copia deshecha» aunque los ids ya no existan (por ejemplo, tras un «Borrar todo» en los
  6 s). Es trivial.
