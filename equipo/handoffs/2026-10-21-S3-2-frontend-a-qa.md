DE: Dev Frontend + UX → PARA: QA, Dev Backend (cc: Scrum Master, Arquitecto, Analista)
HISTORIA: S3-2 (R1) · Crear cuenta / entrar con código, sesión y rol, contra el servidor falso

HECHO:
- **`remote-fake.js`**: implementación en memoria de la interfaz `Remote` (contrato §3-§4).
  - **Estado y API:**
    - `FakeBackend` (usuarios, OTP, app_access, coaches, links, records, photos, comments, consent_events, photo_views, blobs);
    - `FakeClock` (`set` / `advance` / `real`);
    - `createFake({ backend, clock, storage })` con `auth`, `account`, `sync`, `client` y `coach`, y los mismos `code`
      de `RemoteError`.
  - **Reglas reproducidas:**
    - OTP de 6 dígitos que caduca en 1 h; 1 código por minuto; 5 intentos por código;
    - códigos de coach con el alfabeto del contrato; 20 intentos/h;
    - un solo vínculo activo; `body` obligatorio;
    - el coach no ve `library`, ni `note` sin `notes`, ni fotos no compartidas;
    - LWW con recorte de +5 min y desempate determinista; la clave natural conserva el id;
    - pull con solape de 30 s; lotes de 500; `consent_events` solo inserción.
  - **Utilidades de prueba:**
    - `backend.lastCode(email)`;
    - varios dispositivos sobre un mismo `backend`;
    - fallos inyectables: `setOnline`, `failNext`, `latency`, `revokeSessions`;
    - `persistentBackend(localStorage)` para E2E (`pg-fake-backend`).
  - Los blobs no se persisten entre recargas.
- **`remote.js`:**
  - `Remote.config()`: sin `PG_CONFIG` válido devuelve `null` y la app es la de siempre. Solo acepta claves `sb_publishable_…`.
  - El modo `fake` solo funciona en localhost/127.0.0.1 o con `?remote=fake`, y **nunca** en `joseleo984-cmyk.github.io`
    (hay prueba unitaria).
  - `Remote.createFake` delega en `remote-fake.js`.
  - `Remote.create` (real) es un **esqueleto con TODO S3-3**: misma forma, `session()` = null y el resto lanza `server`.
- **`config.js`** vacío por defecto: `{ url: '', key: '', mode: 'real' }`.
- **`account.js`** (UI). Si no hay configuración no hace nada; no carga `remote-fake.js` ni muestra nada.
  - **Pantalla «Crear cuenta o entrar»** (`data-testid="account-gate"`):
    - aparece **después** de la pantalla legal (evento `pg:legal-accepted` desde `app.js`, o al abrir si ya hay
      consentimiento);
    - flujo correo → código de 6 a 10 dígitos (`autocomplete="one-time-code"`), con reenvío bloqueado 60 s y cuenta atrás,
      y «Usar otro correo»;
    - errores en `role="alert"` para cada código: offline, invalid_code, rate_limited, invalid, auth y server;
    - foco en cada paso; sin scroll a 390 px.
  - **Rol:**
    - «Soy cliente», con código opcional de su coach: «Comprobar código» → «Te vas a vincular con «X»» → categorías a
      compartir → `joinCoach`;
    - «Soy coach», con nombre comercial (2 a 60): `becomeCoach` → muestra el código de invitación.
  - Tras `verifyCode` llama a `joinApp()`. Quien ya es coach no repite el paso del rol.
  - **Sesión persistente:** `session()` sin red. Con la sesión guardada la app funciona sin conexión. Al volver la red se
    refrescan los roles; un error `auth` muestra «Tu sesión caducó…» sin bloquear.
  - **Perfil → Cuenta:** estado, rol y código del coach o nombre del coach vinculado. Botones «Entrar o crear cuenta» y
    «Cerrar sesión»; al cerrar sesión los datos del dispositivo se conservan.
  - «Ahora no: usar solo en este dispositivo» guarda `perdida-grasa:account-skip`.
  - **Punto de integración legal (S3-5)** en `sendConsents()`: al iniciar sesión, la aceptación local (S2-1) se registra
    en `consent_events` (terms, privacy, adult, sensitive_health) una vez por usuario y versión.
    - Cuando el Analista publique los textos «con cuentas» basta con subir `Schema.LEGAL_VERSIONS`.
    - Pendiente para S3-5: usar `account.consents()` para no volver a pedir la aceptación en un dispositivo nuevo.
- `app.js`: solo una línea, `document.dispatchEvent(new CustomEvent('pg:legal-accepted'))` al aceptar.
- `index.html`: la pantalla y la tarjeta Cuenta, más los scripts `config.js`, `remote.js` y `account.js` tras `app.js`.
- `styles.css`: bloque S3-2.
- `sw.js`:
  - ASSETS + `config.js`, `remote.js`, `account.js`;
  - **no cachea otros orígenes** (contrato §6.4);
  - CACHE **`perdida-grasa-v17`**: la rama ya estaba en v16 (subida con S2-4), así que se usa el siguiente número.
- `pages.yml`: publica `config.js`, `remote.js` y `account.js`. **`remote-fake.js` no se publica** ni se precachea.
- `tests/e2e/helpers.js`:
  - `app.open({ path })` para abrir `index.html?remote=fake`;
  - `appReady` acepta también la pantalla de cuenta.

DECISIONES / DESVÍOS DEL CONTRATO:
- **Categorías a compartir:** el contrato (§1) marca por defecto «comidas» y «hábitos». Las dejé **sin marcar**, salvo
  `body`, que es obligatoria, por coherencia con la decisión del SM para S2-1 (autorización expresa, Ley 1581).
  → @Arquitecto/@Analista: confirmad y actualizad el contrato o pedid el cambio.
- **Supabase-js NO se vendoriza** en S3-2: queda para S3-3 (Back), con la implementación real de `remote.js`
  (contrato §6). Por eso no hay `vendor/` ni devDependency nueva.
- Cerrar sesión no pregunta si borrar los datos: el texto de §5.6 lo define el Analista.
- Sin sincronización (S3-3) ni panel del coach (S3-4).

PRUEBAS:
- `npm test`: 71/71. Nuevo `tests/remote-fake.test.js` con 10 casos:
  - config y modo fake nunca en producción;
  - OTP (formato, reenvío, intentos, caducidad) y sesión sin red;
  - roles y coach;
  - consent_events;
  - filtros del coach y fin del vínculo;
  - límite de 20 intentos/h;
  - LWW, recorte, id y solape;
  - fallos inyectables y serialización;
  - esqueleto real.
- `E2E_PORT=4801 PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npm run test:e2e`: 85 passed. El ✘ es el `test.fail` esperado
  de S2-1 D2. Nuevo `tests/e2e/s3-2.spec.js` con 6 casos:
  - sin config = como hoy (no se pide `remote-fake.js`);
  - legal → cuenta → cliente, con errores, consent_events, sesión tras recargar y uso sin conexión;
  - reenvío con cuenta atrás;
  - coach con código e invitación → cliente vinculado con categorías elegidas;
  - «Ahora no»;
  - sin conexión al pedir el código.
- `node equipo/qa/run-all.js`: 8 suites en verde (file://, sin config → sin cambios).
- Capturas: `equipo/qa-capturas/s3-2-cuenta-correo.png` y `s3-2-cuenta-vincular.png`.

PENDIENTE / RIESGOS:
- La interfaz del fake es la del contrato, pero el Back debe validar que `remote.js` real devuelve exactamente lo
  mismo. Conviene pasar `tests/remote-fake.test.js` a `runContract(makeRemote)` (contrato §4).
- iPhone real: `autocomplete="one-time-code"` y sesión en la PWA instalada, por probar cuando exista el servidor real.
- Si cambia la longitud del OTP del proyecto (6 u 8), la UI ya acepta de 6 a 10.
