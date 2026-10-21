DE: Dev Frontend + UX → PARA: QA (cc: Scrum Master, Dev Backend, Analista/PO)
HISTORIA: S2-1 = LEGAL-01 Aceptar T&C y Política en la app actual (piloto)

HECHO:
- **Pantalla de consentimiento** (`#consent`, a pantalla completa). Aparece al primer uso y a quien ya tiene datos al
  actualizar (sus datos no se borran). Mientras está abierta se ocultan las vistas, la barra de pestañas y la barra de copia.
  - 5 casillas separadas y sin marcar:
    - obligatorias: T&C, Política y mayor de 18;
    - facultativas: datos de salud y fotos (aparte).
  - «Continuar» solo se habilita con las obligatorias. Un texto en `aria-live` indica qué falta.
  - Al abrirse, el foco va al título.
- **Textos legales:**
  - `scripts/build-legal.js` (`npm run legal`, sin dependencias) genera `legal/terminos.html` y `legal/privacidad.html`
    desde `equipo/legal/*.md`.
  - Mientras el .md diga «Borrador», la página muestra el aviso «Borrador pendiente de revisión legal».
  - Se abren en un `<dialog>` con iframe dentro de la app: no se pierde lo marcado, Escape cierra y el foco vuelve al enlace.
  - Están en `ASSETS` de `sw.js` (CACHE `perdida-grasa-v8`) y en `pages.yml` (`cp -r legal _site/`). Probado sin conexión.
- **Esquema v3** (`schema.js`):
  - `MIGRATIONS[3]` añade `consent: null`.
  - Funciones nuevas:
    - `LEGAL_VERSIONS` `{terms:'0.1', privacy:'0.1'}`;
    - `normalizeConsent` (descarta formas inválidas);
    - `consentStatus` (missing / outdated / ok);
    - `buildConsent` (lanza sin las obligatorias);
    - `setConsentFlag`.
  - Forma guardada: `consent = { termsVersion, privacyVersion, sensitiveHealth, photos, adult: true, acceptedAt,
    updatedAt, sensitiveHealthAt, photosAt }`.
- **Re-aceptación:** si cambia la versión, la pantalla vuelve a salir con «Actualizamos … (versión X → Y)» y las casillas
  sin marcar. `LEGAL_CHANGES` en `app.js` sirve para añadir un resumen por versión.
- **Sin datos de salud:**
  - Panel, Registro, Comidas y Fotos muestran «Seguimiento desactivado» con tres botones: Autorizar, Exportar JSON y
    Borrar todo.
  - En Perfil se ocultan el perfil y el plan; Privacidad y Datos siguen visibles.
  - Un guard en fase de captura bloquea el envío de los formularios de salud y de fotos aunque se fuercen.
- **Sin fotos:** la pestaña Fotos queda bloqueada, con su explicación y el botón «Autorizar fotos».
- **Perfil → Privacidad:**
  - Muestra las versiones y fechas, y el estado de cada autorización.
  - Botones para autorizar o retirar los datos de salud (explica que no se podrá usar el seguimiento y ofrece exportar o
    borrar) y las fotos (al retirar, ofrece borrar las fotos del dispositivo).
  - «Retirar aceptación y borrar todo» lleva a «Borrar todo» con confirmación.
  - Autorizar más tarde pide confirmación con el texto de la autorización.
- **Exportar JSON** incluye `consent`, porque exporta `...state`.

DECISIÓN DOCUMENTADA: el consentimiento es de quien usa ESTE dispositivo. Al importar un respaldo se conserva el
consentimiento actual y nunca se adopta el del archivo (puede ser de otra persona, p. ej. el respaldo de un cliente).
Es una línea en el handler de importación (`next.consent = state.consent`). «Borrar todo» sí lo borra y vuelve a pedirlo.

PRUEBAS:
- `npm test`: 40/40.
  - Nuevo `tests/legal.test.js`: HTML al día con los .md; versiones = `LEGAL_VERSIONS`; aviso de borrador; ASSETS y
    pages.yml; conversor (escapa HTML); migración v2→v3; build/status/normalize/setConsentFlag.
  - `tests/schema.test.js`: la versión esperada pasa de 2 a 3.
- `node equipo/qa/run-all.js` (nuevo: ejecuta todas las E2E): 7 suites en verde.
  - qa-s1-1 50/50, qa-s1-2, qa-s1-3 24/24, run-s1-1 24/24, run-s1-2, run-s1-3 y **run-s2-1** (nuevo) en verde.
  - run-s2-1 cubre: primer uso, foco, casillas, visor, borrador, aceptar, bloqueos, autorizar/retirar, export/import,
    re-aceptación, retirar T&C y modo sin conexión con un servidor http local.
- Capturas: `equipo/qa-capturas/s2-1-{consentimiento,texto-legal,sin-salud,privacidad,reaceptar}.png`.

AJUSTES A LAS E2E EXISTENTES (sin debilitar lo que comprueban):
- **Helper común `equipo/qa/legal-helper.js`** (`conConsentimiento(ctx)`). Simula a quien ya aceptó: al LEER
  `perdida-grasa:v1` añade un consentimiento vigente si falta (o devuelve un estado vacío con consentimiento). No escribe:
  las semillas, los datos corruptos o futuros y las comprobaciones siguen iguales.
- En qa-s1-1 el helper no se aplica a la app ANTERIOR.
- Por el cambio de esquema:
  - «schemaVersion 2» pasa a `CURRENT_VERSION`;
  - «migrate lanza con 3» pasa a `CURRENT_VERSION+1`;
  - «idempotente» espera `consent: null`;
  - las comparaciones de la copia cruda `:backup` ignoran solo la clave `consent` que añade el helper.
- run-s1-1 «versión más nueva»: ahora sale la pantalla legal. Se acepta y se comprueba que los datos v99 NO se
  sobrescriben (antes se probaba con el formulario de comidas, hoy inaccesible).
- qa-s1-1 «CACHE v3»: ya fallaba antes de esta historia (CACHE iba en v5). Ahora comprueba «≥ v3».

PENDIENTE / RIESGOS:
- Prueba en Safari iOS (WebKit) pendiente: Playwright WebKit no está en /opt/pw-browsers.
- Las notas internas «NOTA» de los .md se muestran tal cual mientras sean borrador; habrá que quitarlas antes de publicar.
- Si los datos son de una versión más nueva (guardado bloqueado), la aceptación no se puede guardar y la pantalla sigue
  ahí con el aviso «recarga para actualizar». Es intencionado.
- Conflicto posible con S2-3 (Backend): toqué una sola línea del import y añadí la tarjeta Privacidad antes de Datos en
  `index.html`. No toqué CSV, «Ver copia de un cliente» ni `coach.js`.

PREGUNTAS:
- @Analista/abogado: sin autorización de salud, ¿basta con bloquear el seguimiento, o hace falta el «modo mínimo» de la
  NOTA de la Política §4?
- @Backend: al integrar S2-3, mantened `next.consent = state.consent` en la importación y `consent` en la exportación.

## ADENDA (merge con S2-2 y S2-3)
- Conflictos resueltos conservando ambos lados:
  - `package.json`: `legal` junto a `test:e2e`/`test:all`.
  - `sw.js`: coach.js y legal/, CACHE **v11** (indicación del SM).
  - `pages.yml`: coach.js y `cp -r legal`.
  - README: con las dos secciones.
  - `index.html`: visor legal y visor de copia de cliente.
- `#consent` lleva `data-testid="legal-gate"`.
- Cambios en `tests/e2e/helpers.js`:
  - espera a la barra de pestañas o a la pantalla legal;
  - exporta `CONSENT`.
- Spec nueva `tests/e2e/s2-1.spec.js` con 8 casos. Ajustes en otras specs:
  - `legal-helper.spec.js` siembra un consentimiento para que la pantalla real no se interponga;
  - `schemaVersion` 2 → `CURRENT_VERSION`;
  - smoke: el perfil inválido no cambia el estado guardado (antes se esperaba `null`);
  - import «versión más nueva»: aceptar no sobrescribe.
- El HTML legal ya no muestra las notas internas (`*NOTA…*`, `*(Alternativas…)*`, `*[A confirmar…]*`) ni la
  cabecera de trabajo. Siguen en los .md. Lo comprueba `tests/legal.test.js`.
- Con datos de una versión más nueva, la pantalla legal muestra el aviso y «Borrar los datos de este dispositivo»
  (antes «Borrar todo» quedaba inaccesible).
- Al aceptar se repite el aviso de carga pendiente (p. ej. «Se corrigieron…»), que había quedado detrás de la pantalla legal.
- Obs. QA S1-1, que ya fallaba en la rama del sprint (61/62): el motivo del perfil a revisar ya no se anuncia dos veces;
  queda solo `#profile-issue` (role=alert). Es un cambio en el arranque, no en `load()`.
- `equipo/qa/legal-helper.js`: el estado vacío con consentimiento solo se inyecta en la primera lectura; así «Borrar
  todo» se ve como `null`.
- DoD:
  - `npm test`: 47/47.
  - `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npm run test:e2e`: 48 passed. Incluye el `test.fail` documentado de
    S2-3 D1.
  - `node equipo/qa/run-all.js`: 8 suites en verde.
