DE: Dev Frontend + UX → PARA: QA (cc: Scrum Master, Dev Backend)
HISTORIA: S2-1 = LEGAL-01 · corrección de D1 y de las observaciones O1-O4 del veredicto de QA

HECHO:
- **D1 · control central de escritura en `persist()`**, la única puerta a localStorage: la usan `save()` y la
  importación.
  - **Regla:** sin autorización de salud vigente, `healthWriteBlocked(s)` rechaza todo cambio en perfil, registros,
    comidas, hábitos o biblioteca.
  - **Base de comparación:** `healthBaseline`, lo último guardado. Se permiten los cambios del consentimiento y dejarlo
    todo vacío (tras «Borrar todo»).
  - **Qué cubre:** copiar, repetir y deshacer comidas; borrar registros o alimentos; formularios; importar y cualquier
    ruta futura.
  - **Al rechazar:** se lanza `code: 'health-lock'`. `save()` muestra el aviso, revierte la memoria y devuelve false,
    así que el llamador no muestra éxito. La importación muestra «No se importó. Sin tu autorización…».
  - **Cambio en el código del Backend (mínimo):**
    - 1 línea `let healthBaseline`;
    - 2 líneas en `persist()`;
    - el mensaje en el catch de `save()` y en el de la importación.
    - La lógica vive en el bloque LEGAL-01 (`healthPart`, `healthWriteBlocked`).
  - El `test.fail` de D1 en `tests/e2e/s2-1-qa.spec.js` ahora es una prueba normal y pasa.
- **O1 (datos de una versión más nueva):** «Recargar para actualizar» es el botón principal. «Borrar los datos de
  este dispositivo (se pierden)» queda como enlace secundario, con una explicación.
- **O2 (enlaces):**
  - fotos y salud → `privacidad.html#s4`;
  - mayor de 18 → `privacidad.html#s7`.
  - `build-legal` añade anclas estables a los títulos numerados (`#s4`, `#s5-1`…). Una prueba comprueba que todas las
    anclas usadas en `index.html` existen.
- **O3 (re-aceptación):** las facultativas que ya estaban autorizadas vienen precargadas, con la nota «Antes la tenías
  autorizada: la mantenemos marcada; puedes desmarcarla». Las obligatorias siguen sin marcar.
- **O4 (fotos):** sin autorización, `loadPhotos()` no lee IndexedDB ni crea object URLs. Se cargan al autorizar
  (aceptación o Privacidad) y se descargan de memoria al retirar.
- **Textos legales:** además se quitan del HTML las secciones «Dudas para el abogado» (siguen en los .md).
- `sw.js`: CACHE `perdida-grasa-v13`, porque cambiaron los HTML legales.

NO HECHO: **D2** (marcadores por rellenar). Corresponde al responsable y al abogado; su `test.fail` sigue tal cual.

PRUEBAS:
- `npm test`: 48/48.
- `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npm run test:e2e`: 59 passed. Los ✘ que aparecen son los `test.fail`
  esperados de S2-1 D2 y S2-3 D1.
  - Casos nuevos en `s2-1.spec.js`:
    - importar bloqueado sin salud;
    - fotos no leídas sin autorización (0 llamadas a `Photos.all`) y cargadas al autorizar;
    - anclas #s4/#s7;
    - «Recargar» con datos más nuevos.
  - Re-aceptación actualizada: facultativas precargadas.
- `node equipo/qa/run-all.js`: 8 suites en verde. En `run-s2-1.js` se ajustó la expectativa de re-aceptación (O3).

RIESGOS:
- S2-4 (Backend, v4) puede tocar `persist()`/`save()`. Basta con mantener la llamada a `healthWriteBlocked(s)` antes
  de escribir y `healthBaseline = healthPart(s)` después.
- Si v4 añade campos de salud nuevos al estado, hay que incluirlos en `healthPart()`.
