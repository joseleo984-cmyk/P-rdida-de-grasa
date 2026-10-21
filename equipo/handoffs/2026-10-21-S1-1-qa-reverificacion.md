DE: QA / Revisor → PARA: Dev Backend (cc: Scrum Master, Dev Frontend, Arquitecto)
HISTORIA: S1-1 · re-verificación de las correcciones (commit `c1c95a9`, merge `2243916`) frente a `2026-10-21-S1-1-qa-veredicto.md`
FECHA: 2026-10-21 · Entorno: Playwright 1.56 / Chromium 1194, 390x844, es-CO, America/Bogota, file://

## VEREDICTO: **APROBADO**
D1-D4 están cerrados y comprobados en navegador, también en los casos límite: cuota llena, versión futura e
importación del borrador. De las observaciones, L1, L2, L5, L6 y L7 están cerradas. L3 y L4 se aceptan como deuda
para el Sprint 2. Quedan 2 observaciones menores nuevas que no bloquean (O1, O2).

## Pruebas
| Suite | Resultado |
|---|---|
| `npm test` | 31/31 OK |
| `equipo/qa/run-s1-1.js` (Dev) | 23/23 OK |
| `equipo/qa/qa-s1-1.js` (QA, ampliado con §11 «Re-verificación») | **61/62**: el único fallo es la observación O1, a propósito |
| Regresión: `run-s1-2.js`, `qa-s1-2.js`, `run-s1-3.js` | TODO OK |

Cambio en la suite pedido por el Backend: el chequeo de `sw.js` ya no exige el literal `perdida-grasa-v3`. Ahora lee
`CACHE = 'perdida-grasa-vN'` y exige **N ≥ 3** (`qa-s1-1.js` §10). Hoy N = 5, y sigue valiendo si el Frontend lo sube a v6.

## Defectos del veredicto anterior
| Id | Estado | Comprobación |
|---|---|---|
| **D1** perfil heredado | ✅ Cerrado | El perfil 70 → 80 kg de la app anterior se conserva como borrador en `profile`. El formulario sale precargado y el aviso es persistente y concreto: «meta 80 kg, inicial 70 kg». Sobrevive a acciones y recargas, y viaja en la exportación. Al corregirlo, el aviso desaparece tras recargar. `:backup` ya no se sobrescribe (`keepCopy`). |
| **D2** el éxito tapaba el error | ✅ Cerrado | Con la cuota llena, el registro y el alimento: toast de error (`.toast.error`, 6 s), sin fila fantasma y con el valor aún en el formulario. `save()` devuelve `false` y deshace el cambio en memoria. Ningún llamador muestra éxito. |
| **D3** Borrar todo dejaba copias | ✅ Cerrado | Borra las 5 claves con `removeItem`. Funciona **también con la cuota llena** y con datos de una versión más nueva (antes no borraba nada en esos casos). |
| **D4** fotos heredadas sin fecha | ✅ Cerrado | `normalizeStoredPhoto` las oculta y deja aviso en consola. No hay `pageerror` ni XSS. |

## Observaciones
| Id | Estado |
|---|---|
| L1 nombres reservados | ✅ «__proto__» o «Constructor» se guardan en el diario, no en la biblioteca, y ya no salta el aviso de «datos dañados» al recargar. |
| L2 todas las fotos inválidas | ✅ Se conserva la galería y el `confirm` lo dice. |
| L3 `Number()` laxo / coma decimal | ⏸ **Deuda aceptada (Sprint 2).** Hoy solo afecta a JSON editados a mano o de terceros, porque los formularios son `type=number`. Ojo: si el piloto concierge (R0) hace que coaches editen respaldos en una hoja de cálculo, la coma decimal descarta el registro, así que conviene priorizarlo. Cuando se cambie, actualizo las «Obs» de `qa-s1-1.js` §8/§9 (hoy fijan el comportamiento actual). |
| L4 truncado de notas sin aviso | ⏸ Deuda aceptada. No hace daño: el formulario limita a 140 caracteres. |
| L5 duración del toast | ✅ `max(2,2 s, 60 ms × caracteres)`; los errores duran al menos 6 s. |
| L6 nombre de solo espacios | ✅ Se rechaza con «Escribe el nombre del alimento». |
| L7 el `confirm` nombra el perfil | ✅ |

## Cambios del Backend en la zona del Frontend
- `index.html` `#profile-issue` (`<p class="warn small hidden" role="alert">` en la tarjeta Perfil): ✅ **Se acepta.**
  Está en el sitio correcto, porque con un borrador la app abre en Perfil (`app.js:953`). Solo se escribe si cambia,
  así que no se repite el anuncio en cada `render()`. Sin scroll horizontal a 390 px.
- `styles.css` `.toast.error` (`#b3261e` sobre blanco, contraste 6,5:1, AA): ✅ **Se acepta.** Usa colores fijos y
  se ve igual en tema oscuro. Que el Frontend decida si lo pasa a un token. El `#toast` sigue con `role="status"`
  (polite): pasar los errores a `role="alert"` queda para el Frontend, como dice el handoff.

## Observaciones nuevas (no bloquean)
- **O1 · Menor (a11y)**: al cargar con un borrador, el mismo motivo se anuncia dos veces: el toast `loadNotice`
  (`app.js:954`, `role=status`) y `#profile-issue` (`role=alert`). Propuesta: no lanzar el toast si hay `pending`,
  porque el aviso fijo ya está visible en la vista que se abre.
- **O2 · Trivial**: el `confirm` de la importación con un perfil inválido cuenta el perfil también en «Se descartarán
  o corregirán 1 datos». Además anida paréntesis: «(La meta… (meta 80 kg, inicial 70 kg))». Conviene restar el perfil
  de `discarded` y usar dos puntos en lugar del paréntesis exterior.

## Respuesta a la pregunta del Backend
- **Guardar el borrador en el propio campo `profile`**: ✅ de acuerdo. Viaja con el respaldo, no añade otra clave que
  limpiar y es idempotente: `normalize` lo vuelve a rechazar en cada carga y nunca llega a `Calc`.
- Riesgo residual, aceptado: un respaldo con borrador importado en una versión **anterior** a S1-1 volvería a tener
  BUG-04. No hay usuarios en esas versiones una vez que el SW se actualiza.

## Pendiente fuera de esta historia
- Prueba manual en iOS Safari: `atob` con fotos de 2-5 MB, la transacción única y los `confirm()`.
