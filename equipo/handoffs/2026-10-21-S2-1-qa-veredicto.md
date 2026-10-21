DE: QA / Revisor → PARA: Dev Frontend (cc: Scrum Master, Analista/PO, Dev Backend, Stakeholder)
HISTORIA: S2-1 = LEGAL-01 · Aceptar T&C y Política en la app actual (merge `76781fe`)
FECHA: 2026-10-21 · Entorno: `@playwright/test` 1.56.1, Chromium 1194, móvil 390x844, es-CO, America/Bogota

## VEREDICTO: **APROBADO CON CONDICIONES**

El mecanismo cumple los criterios de LEGAL-01: pantalla previa a todo, casillas separadas y sin marcar,
«Continuar» solo con las obligatorias, re-aceptación por versión, la importación no adopta el consentimiento ajeno,
Privacidad con retiro, textos legibles sin conexión y sin notas internas, migración v1/v2 → v3 sin pérdidas, y
pantalla accesible a 390 px y en modo oscuro.

Condiciones:
- **Para cerrar la historia:** corregir **D1**. Retirar la autorización de salud solo bloquea los `<form>`; hay
  acciones de botón que siguen escribiendo datos de salud.
- **Para empezar el piloto con datos reales:** resolver **D2**, que no es del Frontend: los textos legales aún tienen
  marcadores sin rellenar.

## Pruebas
| Suite | Resultado |
|---|---|
| `npm test` | 47/47 OK (incluye `tests/legal.test.js`) |
| `npm run test:e2e` | **56 passed**, con 3 `test.fail` que documentan defectos conocidos: S2-3 D1, S2-1 D1 y S2-1 D2 |
| `tests/e2e/s2-1.spec.js` (Frontend) | 8/8 |
| **`tests/e2e/s2-1-qa.spec.js` (nuevo, QA)** | 8/8: 6 en verde y 2 `test.fail` (D1, D2) |
| `tests/e2e/offline.spec.js` (ampliado) | `legal/terminos.html` y `legal/privacidad.html` en la caché del SW y legibles sin conexión |
| `node equipo/qa/run-all.js` | **8 suites en verde** |

Cobertura nueva de `s2-1-qa.spec.js`:
- importar no adopta el consentimiento, ni con más permisos ni sin consentimiento;
- migración v1 en localStorage → pantalla legal → todo intacto;
- los enlaces dentro de una casilla no la cambian;
- las 5 casillas tienen nombre accesible y el Tab no sale de la pantalla legal;
- modo oscuro con contraste ≥ 4,5:1 en el título, las casillas, el texto de ayuda y el iframe legal;
- con datos de una versión más nueva, aceptar no los sobrescribe;
- D1 y D2.

## Criterios (`backlog.md` §7)
| Criterio | Estado |
|---|---|
| Pantalla a pantalla completa antes de cualquier vista; usuarios existentes sin perder datos | ✅ (`main`, la barra de pestañas y la barra de copia están ocultas; migración v1/v2 → v3 probada) |
| 5 casillas separadas, ninguna marcada | ✅ |
| Enlaces a los textos «desde cada casilla», dentro de la app y sin conexión | ⚠️ Hay enlaces en T&C, Política y salud; **fotos y mayor de 18 no tienen enlace** (O2). Se abren en un `<dialog>`, no se pierde lo marcado y funcionan sin conexión ✅ |
| «Continuar» solo con las obligatorias | ✅ Cada obligatoria por separado; las facultativas solas no lo habilitan |
| Guardar `consent` (+ export + `schemaVersion` con migración) | ✅ `MIGRATIONS[3]`; `normalizeConsent` descarta las formas inválidas y nunca inventa un consentimiento |
| Re-aceptación por versión con «Actualizamos…» | ✅ Casillas sin marcar y datos intactos. `LEGAL_CHANGES` está vacío: hay que rellenar el resumen cuando cambie la versión |
| Retirar salud y fotos; retirar T&C → Borrar todo | ✅ en la interfaz; ❌ en la lógica para salud (D1). Al retirar fotos se ofrece borrarlas ✅ |
| Accesible + probado en Safari iOS | ✅ en Chromium (foco inicial en el título, `aria-live`, nombres). ⏳ **WebKit/iOS pendiente**: no está en `/opt/pw-browsers` |
| Importar no adopta el consentimiento ajeno | ✅ (`app.js:752`, probado en los dos sentidos) |

## Defectos
**D1 · Medio · Sin autorización de salud se siguen escribiendo datos de salud por vías que no son formularios**
- `app.js`: el guard de `submit` en fase de captura (`HEALTH_FORMS`, ~l. 1160) solo cubre los `<form>`. No pasan por él:
  - `repeatMeals` / `undoCopy` (botones «Copiar de ayer», «Repetir…», «Copiar este día a hoy»);
  - el borrado de un registro (`[data-del-entry]`) y de un alimento (`[data-del-food]`).
- Pasos (`s2-1-qa.spec.js:14`): consentimiento con `sensitiveHealth: false` → clic programático en esos botones,
  que están ocultos por CSS pero siguen en el DOM. Resultado: se copia «Avena» a hoy y se borran el registro de ayer
  y el café de hoy.
- Un usuario no llega a ellos con el ratón ni con el teclado (`display:none`). Sí puede hacerlo una extensión, un
  script o una regresión de CSS. Criterio: «bloquea el seguimiento de verdad, no solo la interfaz».
- Corrección propuesta:
  - un único punto de control en `save()` (o en un `canWriteHealth()` que se llame en `repeatMeals`, `undoCopy` y en
    los dos borrados) que rechace el cambio y muestre el toast de bloqueo;
  - opcional: no pintar los datos de salud en el DOM oculto (`renderPanel`/`renderEntries`/`renderFoods`) mientras
    no haya autorización.
- Se valida cuando `s2-1-qa.spec.js:14` deje de ser `test.fail`.

**D2 · Bloquea el PILOTO (no la historia; responsables: Stakeholder/abogado) · Marcadores sin rellenar en los textos legales**
- `legal/terminos.html` y `legal/privacidad.html` (generados desde `equipo/legal/*.md`) contienen todavía
  `[NOMBRE COMPLETO]`, `[CORREO]`, `[TELÉFONO]`, `[DIRECCIÓN]`, `[CIUDAD]`, `[NÚMERO]`, `[FECHA]`, `[PLAZO]`,
  `[REGIÓN…]`, `[USD 5 por cliente / X %]`…
- La Ley 1581 exige identificar al responsable y un canal de contacto para que la autorización sea válida.
- Además, la Política describe el servidor (Supabase, EE. UU.), los pagos y el panel de coach, pero en el piloto los
  datos están **solo en el dispositivo**. Que el abogado confirme si basta con un texto común o si hace falta una
  versión «piloto».
- El aviso «Borrador pendiente de revisión legal» se muestra bien. La comprobación automática es `s2-1-qa.spec.js:125`
  (`test.fail`); pasará cuando se rellenen los marcadores.

## Observaciones (no bloquean)
- **O1 · Datos de una versión más nueva:**
  - Aceptar no los sobrescribe ✅. Pero la única acción que ofrece la pantalla es **«Borrar los datos de este
    dispositivo»** (botón rojo).
  - Quien tenga la app antigua en caché (sin conexión, SW sin actualizar) puede borrar por error datos escritos por
    la versión nueva.
  - Propuesta:
    - botón principal «Recargar para actualizar» (`location.reload()`, o `registration.update()` y recarga);
    - el borrado como enlace secundario, con un texto que diga que se pierden los datos.
  - Antes de S2-1, la app arrancaba vacía pero navegable; ahora queda bloqueada en la pantalla legal. Es aceptable
    porque no se puede guardar nada.
- **O2:** las casillas de fotos y de mayor de 18 no tienen enlace al texto. El criterio dice «desde cada casilla»:
  basta con «Qué hacemos con tus fotos» → `privacidad.html#fotos`.
- **O3:** al re-aceptar, las facultativas vuelven sin marcar. Si el usuario solo marca las obligatorias, **pierde sin
  querer** la autorización de salud y se le bloquea el seguimiento. Es correcto legalmente (consentimiento expreso),
  pero conviene un texto junto a la casilla: «Antes la tenías autorizada».
- **O4:** con la autorización de fotos retirada (y sin borrarlas), `loadPhotos()` sigue decodificando las fotos y
  creando object URLs para la galería oculta. Esto entra en D1 (no tratar datos sin autorización).
- **O5:** el consentimiento viaja en el JSON exportado. Al abrir la copia de un cliente (S2-3) no se usa, lo cual es
  correcto. Cuando llegue HU-P10, conviene que el visor del coach muestre si la copia trae la autorización de salud
  del cliente.

## Respuesta a la pregunta del Frontend
- **«Modo mínimo» sin salud** (NOTA de la Política §4): lo decide el abogado. Desde QA, bloquear es lo más seguro y
  coherente, siempre que el bloqueo sea real (D1).
