DE: QA / Revisor → PARA: Dev Frontend (cc: Scrum Master, Dev Backend, Analista/PO)
HISTORIA: S2-1 = LEGAL-01 · re-verificación de D1 y O1-O4 (merge `b594d08`) + textos legales de la fase piloto (`c48a0e7`)
FECHA: 2026-10-21 · Entorno: `@playwright/test` 1.56.1, Chromium 1194, móvil 390x844, es-CO, America/Bogota

## VEREDICTO: **APROBADO CON CONDICIONES**
- D1 está cerrado y O1-O4 también.
- Los textos de la fase piloto se ven bien en la app.
- Queda una condición para cerrar la historia: **D3**, la misma clase de fallo que D1 pero con las fotos. Es pequeño.
- D2 (los marcadores legales) sigue bloqueando el **piloto**, no la historia.

## Pruebas
| Suite | Resultado |
|---|---|
| `npm test` | 48/48 OK |
| `npm run test:e2e` | **62 passed**. Hay 3 `test.fail` esperados: S2-3 D1, S2-1 D2 y el nuevo S2-1 D3 |
| `tests/e2e/s2-1-qa.spec.js` | 11 casos: 3 nuevos en esta re-verificación; el de D1 ya es una prueba normal y pasa |

## Correcciones
| Id | Estado | Comprobación |
|---|---|---|
| **D1** escritura de salud fuera de formularios | ✅ Cerrado | Control central en `persist()` (`healthWriteBlocked`, `app.js:71`). Clics programáticos en copiar, repetir, borrar registro y borrar alimento: el estado guardado no cambia. **Nuevo caso**: «Deshacer» de una copia **después** de retirar la autorización de salud tampoco escribe. Importar sin salud se rechaza (spec del Frontend). |
| O1 versión más nueva | ✅ | «Recargar para actualizar» es el botón principal; borrar queda como enlace secundario con la advertencia. |
| O2 enlaces por casilla | ✅ | Salud y fotos → `privacidad.html#s5` («Datos sensibles: salud, medidas corporales y fotos»); mayor de 18 → `#s7` («Menores de edad»). Se comprobó que cada ancla existe, tiene ese título y **queda visible** al abrir. |
| O3 re-aceptación | ✅ con una reserva (R1) | |
| O4 fotos sin autorización | ✅ | No se lee IndexedDB ni se crean object URLs (spec del Frontend). |

## Defecto nuevo
**D3 · Medio · Importar un respaldo guarda sus fotos aunque las fotos no estén autorizadas**
- Archivo: `app.js`, manejador de `#file-import`. `persist()` ya controla la salud, pero `Photos.importAll(ph.photos)`
  no comprueba `photosAllowed()`.
- Pasos (`s2-1-qa.spec.js:134`): consentimiento con `photos: false` → importar `tests/fixtures/backup-v1.json`, que
  trae 2 fotos. Resultado: IndexedDB `perdida-grasa` queda con **2 fotos**. No se ven, porque la galería no las lee
  (O4), pero sí están guardadas.
- Impacto: es tratamiento de un dato sensible sin autorización. Además, si un coach usa «Importar» por error con el
  respaldo de un cliente, guarda las fotos de un tercero.
- Arreglo: si `!photosAllowed()`, no tocar IndexedDB (`hasPhotos = false`, que conserva las fotos actuales) y que el
  `confirm` lo diga: «Las fotos del respaldo no se importan porque no has autorizado fotos».
- Se valida cuando el `test.fail` de `s2-1-qa.spec.js:134` deje de serlo.

## Textos legales de la fase piloto (revisados en la app)
- ✅ La Política (13 secciones) y los T&C (15) se abren en el visor dentro de la app.
  - Dicen «edición: piloto, sin servidor»; R1 aparece como cambio previsto (§13).
  - No muestran «Dudas para el abogado» ni las notas internas.
  - No hay scroll horizontal a 390 px: la tabla de datos va en un contenedor con desplazamiento propio.
  - El contraste en modo oscuro es correcto (caso de la revisión anterior).
- ✅ Funcionan sin conexión: están en `ASSETS` del SW, `CACHE` v13, y lo prueba `offline.spec`.
- ❌ **D2** sigue igual (responsable y abogado). La Política tiene `[NOMBRE COMPLETO DEL RESPONSABLE]`,
  `[NÚMERO DE CÉDULA]`, `[DIRECCIÓN]`, `[CIUDAD]`, `[CORREO DE DATOS PERSONALES]`×2, `[TELÉFONO / WHATSAPP]`,
  `[FECHA DE VIGENCIA]`×2 y `[FECHA DE BORRADO DEL PILOTO]`×2. Los T&C tienen equivalentes. No se puede empezar el
  piloto con datos reales hasta rellenarlos.

## Reservas y observaciones
- **R1 · decide el abogado/PO · Facultativas precargadas al re-aceptar (O3)**
  - En la primera aceptación ninguna casilla viene marcada ✅.
  - Al re-aceptar, salud y fotos vienen **marcadas** si ya estaban autorizadas, con la nota «Antes la tenías
    autorizada».
  - Si la nueva versión cambia lo que se hace con los datos sensibles (§5), una casilla premarcada puede no valer como
    autorización expresa (Ley 1581, art. 6: dato sensible).
  - Lo más seguro: dejarlas sin marcar con la misma nota. Mi propuesta en O3 era solo la nota.
  - Si el abogado acepta el premarcado, se mantiene.
- **O5 · baja**: al cargar datos v1/v2 **antes** de que el usuario acepte, `keepCopy` escribe una copia cruda en
  `perdida-grasa:backup` (S1-1). Son datos que ya estaban en el dispositivo y la copia sirve de protección, así que lo
  considero aceptable. Que conste para el abogado, por si pide no duplicar datos de salud antes de la autorización.
- **Para S2-4 (Backend, v4)**:
  - mantener `healthWriteBlocked(s)` antes de escribir y `healthBaseline = healthPart(s)` después, en `persist()`;
  - todo campo nuevo de salud debe entrar en `healthPart()`;
  - la fila de `s2-1-qa.spec.js:14` sirve de prueba de regresión.
