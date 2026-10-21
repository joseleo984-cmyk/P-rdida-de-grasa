DE: Dev Frontend + UX → PARA: QA (cc: Scrum Master, Dev Backend, Arquitecto, Analista)
HISTORIA: S3-4 (R1) · Panel del coach (HU-P05/P06/P07/P09) y control del cliente, contra remote-fake.js

HECHO:
- **`coach.js`** (funciones puras con tests en `tests/coach-panel.test.js`):
  - `semaforo(state, { today })`. Las reglas se muestran también en el panel (desplegable «Cómo se calcula»):
    - **rojo**: ningún registro (peso, medidas, comidas o hábitos) en ≥ 5 días, o sin datos;
    - **verde**: ≥ 4 de los últimos 7 días con registro, peso bajando ≥ 0,05 kg/sem (regresión de 21 d) y sin
      estancarse en 14 d;
    - **amarillo**: el resto, con el motivo («Registró N de 7 días», «Peso estancado», «Faltan pesajes…»).
  - `byLight` ordena con los rojos primero.
  - `stateFromWire(records)` reconstruye el estado del cliente desde `coach_pull`:
    - descarta lápidas, `note` y `library`;
    - pasa por `Schema.normalize` como dato no confiable.
- **`coach-panel.js`** (nuevo, solo con servidor configurado).
  - **Pestaña «Clientes»**, solo para el rol coach:
    - lista con semáforo (texto + color, no solo color), peso, ritmo, días 7/7, último registro y motivo;
    - aviso si pasa del límite gratuito.
  - **Código de invitación**: validez (sin caducidad / 7 / 30 días) y usos (sin límite / 1 / 5 / 20) con
    `rotateCode({ validDays, maxUses })`; muestra «Válido hasta… · usado N de M».
  - **Ficha**:
    - peso, inicio→meta, cambio, tendencia 7 d, ritmo, % grasa y objetivo (este último solo con `nutrition`);
    - adherencia de 1, 2 y 4 semanas con columnas **solo de las categorías compartidas**;
    - «Comparte / No comparte»;
    - **nunca notas ni biblioteca**.
  - **Fotos** (solo si `shares.photos` y la foto está compartida): «Ver foto» pide un blob nuevo en **cada** apertura
    (`coach.photoBlob` = URL firmada + `photo_views`). No guarda la URL ni el blob; el object URL se libera al cambiar.
  - **Comentarios**: escribir (1000 car., día de referencia), ver «Leído/No leído», borrar, «Terminar el vínculo».
  - **Cliente**: tarjeta «Notas de tu coach» en el Panel con «N sin leer» y «Marcar como leído».
    - **Puente temporal:** mientras no exista `sync.js` (S3-3), los comentarios se piden con `remote.sync.pull` y se
      guardan solo en `perdida-grasa:comments` (contrato §5.3). Si existe `window.PGSync`, no se piden.
  - Los datos de clientes solo viven en memoria. Nada en el `localStorage` del coach salvo sus metadatos.
- **`account.js`**:
  - Perfil → Cuenta del cliente: «Tu coach: «X»». Puede cambiar qué comparte (comidas, hábitos, notas, fotos; lo
    corporal es obligatorio) con `updateShares`, y «Terminar el vínculo» (`leaveCoach`).
  - «Vincularme con un coach» abre el paso del rol con «cliente» marcado.
  - «Ver mis clientes» para el coach.
  - **Cerrar sesión** (decisión del SM): «¿Borrar también los datos de este teléfono?» con **«No» marcado y enfocado por
    defecto**. «Sí» cierra sesión y lanza «Borrar todo».
  - Puente `window.PGAccount` y eventos `pg:account-ready` / `pg:account-changed`.
  - **v1.1 §10.1**:
    - consentimientos con `textHash` (SHA-256 de las páginas legales y del texto de cada casilla);
    - `joinCoach`/`updateShares` con `version: 'compartir-1'` + `textHash` del texto de la pantalla de compartir;
    - `Remote.textHash()` normaliza los saltos de línea.
- **`remote-fake.js`, al día con v1.1**:
  - `textHash` obligatorio, también en `shares`;
  - `rotateCode` con caducidad (reloj del fake) y límite de usos; un código caducado o agotado da `invalid_code`;
  - `myCoach` devuelve `expiresAt/maxUses/uses`;
  - un coach desactivado pierde el acceso; `client_at` acotado a +5 min.
- **Seguridad:** todo lo que escribe otra persona se escapa con `esc()` (panel del coach) o se pone con `textContent`:
  `display_name`, `business_name`, nombre del perfil y comentarios.
- `index.html`: vista `#view-coach`, pestaña `#tab-coach` oculta, tarjeta de notas y formularios de compartir y de
  cerrar sesión.
- `styles.css`: la barra de pestañas usa columnas automáticas (5 o 6 pestañas).
- `sw.js`: CACHE **`perdida-grasa-v19`** + `coach-panel.js` (junto a `sync.js` y el vendor del Backend). `pages.yml` publica `coach-panel.js`.

PRUEBAS:
- `npm test`: 120/120 (tras el merge del sprint).
  - `coach-panel.test.js`: semáforo, orden, `stateFromWire` con XSS y datos inválidos.
  - `remote-fake.test.js` (+2): rotación con caducidad y usos, coach inactivo, hash.
- `E2E_PORT=4871 … npm run test:e2e`: 102 passed, sin `test.fail`.
  - **`tests/e2e/s3-4.spec.js`**, con **dos usuarios en contextos separados** (coach y cliente):
    - invitación y vínculo eligiendo qué se comparte;
    - semáforo verde;
    - ficha sin notas ni biblioteca y sin columnas no compartidas;
    - **XSS** en `display_name`, `business_name`, nombre del perfil y comentario: no se ejecuta y se ve como texto;
    - comentario → el cliente lo lee → el coach ve «Leído»;
    - fotos: dos aperturas = dos URL distintas y 2 `photo_views`;
    - dejar de compartir comidas;
    - rotar el código;
    - terminar el vínculo.
  - Más un caso de cerrar sesión con «No» por defecto.
  - `s3-2.spec.js` ajustado al nuevo paso de cerrar sesión.
- `node equipo/qa/run-all.js`: 8 suites en verde.

NOTAS / RIESGOS:
- Las E2E con dos usuarios copian `pg-fake-backend` entre contextos (`transfer`). Los blobs de fotos no se serializan
  y se colocan en el «Storage» del teléfono del coach.
- El cliente aún no sube datos (S3-3). La E2E los empuja con `remote.sync.push`, como lo hará `sync.js`.
- El nombre del cliente es `display_name` o, si no hay, el `name` de su perfil. Aún no hay pantalla para fijar el
  `display_name`.
- El marcado por foto (`setPhotoShared`) llega con las fotos en la nube (Sprint 4); hoy solo existe la categoría.

CORRECCIONES S3-2 (veredicto de QA) E INTEGRACIÓN S3-3b:
- D1: `textHash` en cada consentimiento; el fake valida los mismos campos obligatorios que la BD. D2: el modo falso solo
  en localhost/127.0.0.1/[::1] (lista blanca). Ambos `test.fail` son ahora pruebas normales.
- O1: los datos locales tienen dueño (`perdida-grasa:owner`). Sin dueño: «¿Estos datos son tuyos?» (Sí / Empezar de cero).
  De otra cuenta: nunca se mezclan (Cerrar sesión o Borrar datos del teléfono). El consentimiento solo se sube con la
  aceptación de quien entró. Tres casos E2E nuevos en `s3-2.spec.js`.
- «Sí, son míos» llama a `PGSync.confirmOwner()`; tras el login se emite `pg:signed-in`;
  `remote-fake.sync.pull(since, { overlap, limit })` (también acepta el número); se quitó el adaptador de `Remote.createFake`.
- Conflictos del merge (remote.js, sw.js, pages.yml) resueltos conservando ambos lados.
- Riesgo: con el fake, `PGSync` y account.js comparten `window.__pgFakeBackend`.

DoD: [x] npm test  [x] E2E  [x] run-all (8 suites)  [x] sin config.js la app es idéntica  [x] CACHE v19  [x] sin push, sin tocar sync.js ni migraciones.
