DE: QA / Revisor → PARA: Dev (S1-3) (cc: Scrum Master, Analista/PO, Dev Frontend)
HISTORIA: S1-3 = HU-02 Repetir comidas (merge `c277574`, diff `5c96270..26afe78^`)
FECHA: 2026-10-21 · Entorno: Playwright 1.56 / Chromium 1194, 390x844 móvil (touch), es-CO, America/Bogota, `page.clock`

## VEREDICTO: **APROBADO CON CONDICIONES**
La lógica es sólida y segura. Pasa por `copyMeals` (función pura), con saneado, ids nuevos que no chocan con ningún
otro, sin mutar la entrada y con escape correcto. Se cumplen 2 de los 3 criterios de aceptación; el primero
(«Repetir este bloque») solo en parte, por la interpretación elegida.

Condición de cierre: el PO decide sobre D1. Si lo acepta como está, basta con corregir D2-D4, que son menores. Si
pide el flujo desde hoy, es un cambio pequeño en `app.js` y `index.html` que reutiliza `repeatMeals`.

## Pruebas
| Suite | Resultado |
|---|---|
| `npm test` | 28/28 OK (incluye 8 nuevos en `tests/meals.test.js`) |
| `equipo/qa/run-s1-3.js` (Dev) | 23/23 OK |
| Regresión `run-s1-1.js` / `run-s1-2.js` / `qa-s1-2.js` | 20/20 · TODO OK · TODO OK |
| `equipo/qa/qa-s1-3.js` §HU-02 (**nuevo**, QA) | 8/14: los fallos son D1 (C1, C2), D2 (C3), D3 (C5), L2 (C4c) y L3 (C10) |

## Criterios de HU-02 (`equipo/backlog.md:63-67`)
| Criterio | Estado |
|---|---|
| «Copiar de ayer» en el diario | ✅ (`index.html` card-head, `app.js:266`). Con otro día elegido se llama «Copiar del día anterior» y copia d-1 → d. |
| «Repetir este bloque» por cada bloque | ⚠️ **Parcial** (D1). Solo aparece al mirar un día pasado y lleva ese bloque a hoy. Desde hoy no se puede. |
| Ids nuevos y se suman, sin sustituir | ✅ Ids únicos frente a todos los días, origen intacto, el destino se concatena. Se probaron el doble toque (el 2.º pide confirmación) y la cancelación. |
| Toast con el número; origen vacío → aviso y nada | ✅ «Se copiaron N alimentos…» / «No hay comidas registradas…» (errata en D4). |
| (Historia) «…o de un día elegido al día actual» | ⚠️ Solo bloque a bloque (D1). |

Seguridad: ✅ `m` sale de `Schema.MEALS` y lleva `esc()`. Un nombre XSS se copia y se muestra como texto. `copyMeals`
descarta lo que no es objeto, lo que no es un array y las claves peligrosas, porque `out` es `dict()`.
Datos: ✅ la forma de `state` no cambia, así que no hace falta `MIGRATIONS[3]`. `CACHE` sube a `v4`.

## Defectos
**D1 · Medio (funcional/UX, decide el PO) · El caso principal «repetir el desayuno de ayer en hoy» exige navegar a ayer, y copiar un día elegido completo cuesta 5 toques y 3 `confirm()`**
- Archivo: `app.js:333` (`rep = isToday ? '' : …`) y `app.js:251-264`.
- Medido (C1/C2): en hoy hay 0 botones de bloque. Para copiar el 17-oct entero a hoy hay que cambiar la fecha y
  pulsar «Repetir hoy» 4 veces, con 3 confirmaciones porque hoy ya no está vacío. Son 8 interacciones, lejos de la
  métrica del sprint («1–2 toques»).
- Propuesta (pequeña):
  1. Al mirar un día pasado, añadir «Copiar este día a hoy», que llama a `repeatMeals(d, today())`.
  2. En hoy, por cada bloque **vacío** de hoy que ayer sí tenía, mostrar «Repetir <bloque> de ayer». Es el «Repetir
     este bloque» que el usuario espera.
  3. No pedir `confirm()` en la repetición de un bloque: es explícita y aditiva. Mejor un toast con «Deshacer» (D3).

**D2 · Menor (a11y) · El foco se pierde tras «Repetir hoy»**
- `app.js:272` → `render()` regenera `#food-list` y destruye el botón: `document.activeElement` pasa a ser `<body>`
  (C3). Es el mismo tipo de defecto que el D1 de S1-2. Hay que devolver el foco al botón equivalente regenerado o al
  encabezado del bloque.

**D3 · Menor (UX) · No hay «deshacer» y la copia en un día vacío no pide confirmación**
- Pasos: elegir un día vacío y tocar «Copiar del día anterior» por error. Se añaden N alimentos sin preguntar (C5) y
  revertirlo cuesta N toques en ✕, uno por alimento (de 29x28 px).
- No incumple ningún criterio, pero con un botón de 188x41 px justo encima de la lista el toque accidental es
  probable. Propuesta barata: guardar `prevFoods` y poner un botón «Deshacer» en el toast durante 5 s. Evitaría
  también los `confirm()` (ver más abajo). Si no se hace ahora, que entre en HU-03.

**D4 · Trivial · Errata en el toast: «Se copiaron 4 alimentos a el 18 oct 26»**
- `app.js:255`: `dest = 'el ' + fmtDate(to)` y luego `a ${dest}`. Debe decir «al 18 oct».

## `confirm()` nativo en iOS
- No se pudo probar en iOS (no hay Safari en el entorno). Queda una prueba manual pendiente en el iPhone del
  stakeholder.
- Por lo que se sabe de la plataforma: `confirm()` funciona en Safari y en la PWA instalada. Bloquea el hilo, muestra
  el origen en el encabezado y, si el usuario marca «no permitir más diálogos», devuelve `false`. En ese caso no se
  copia nada, que es lo seguro.
- La app ya lo usa en 4 sitios (borrar registro, importar, borrar todo y borrar foto), así que es coherente. **Se
  acepta para S1-3.** La recomendación es sustituirlo aquí por «Deshacer» (D3), y en HU-03 crear un componente de
  confirmación propio para toda la app.

## Observaciones
- **L1** El texto del `confirm()` cuenta los alimentos del origen tal como están. Coincide con lo copiado porque S1-1
  ya descarta al cargar lo que no es válido (C6 OK).
- **L2** «Copiar de ayer» mide 41 px de alto (por encima de los 24 px de WCAG 2.5.8 y por debajo de los 44 px de Apple
  HIG). «Repetir hoy» mide 104x35, así que se cumple el mínimo de 32 px pedido.
- **L3** Comportamiento anterior a esta historia: con la app abierta al pasar la medianoche, `#food-date` sigue en el
  día anterior (`app.js:224`). El botón pasa a decir «Copiar del día anterior» sobre lo que el usuario cree que es hoy,
  y lo que añada a las 00:10 se guarda en el día anterior. El `visibilitychange` de S1-2 no lo corrige. Propuesta: en
  `visibilitychange`, si `foodDate.value` era el «hoy» anterior, moverlo al nuevo `today()`.
- Sin scroll horizontal a 390 px (`scrollWidth` 390) y sin errores de consola.
