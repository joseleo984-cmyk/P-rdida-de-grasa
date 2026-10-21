# Arquitectura — Pérdida de Grasa (Sprint 0, diagnóstico)

Autor: Agente Arquitecto / Tech Lead · Fecha: 2026-10-21 · Estado: borrador para revisión del Stakeholder
Alcance: lectura completa de `index.html`, `app.js`, `calc.js`, `photos.js`, `sw.js`, `styles.css`,
`manifest.webmanifest`, `package.json`, `.github/workflows/pages.yml`, `tests/calc.test.js`.

---

## 1. Mapa de la arquitectura actual

PWA estática, sin build ni dependencias de ejecución. Tres scripts clásicos (no módulos ES), cargados
en orden desde `index.html:272-274`. Se comunican mediante globales `window.Calc` y `window.Photos`.

| Archivo | Líneas | Responsabilidad |
|---|---|---|
| `index.html` | 276 | Marcado de las 5 vistas (Panel, Registro, Comidas, Fotos, Perfil), tabbar, toast y `<dialog>` del visor de fotos. Todo el HTML estático vive aquí. |
| `calc.js` | 101 | **Dominio puro** (sin DOM), UMD: `bmr`, `tdee`, `navyBodyFat`, `plan`, `bmi`, `trend`, `weeklyRate`, `weeksToGoal`, `toDay`, `round`. Único módulo con pruebas. |
| `photos.js` | 90 | Adaptador de **IndexedDB** para fotos + compresión a JPEG (máx. 1280 px, calidad 0,82) + export/import como data URLs. |
| `app.js` | 665 | Todo lo demás en una IIFE: estado y persistencia en localStorage, navegación, formularios, render de las 5 vistas, gráfico canvas, recomendaciones, export JSON/CSV, import, borrado y registro del SW. |
| `styles.css` | 188 | Tokens CSS en `:root`, modo oscuro por `prefers-color-scheme`, layout móvil primero. |
| `sw.js` | 29 | Service worker: precache en `install`, limpia cachés viejas en `activate`, **red primero** con respaldo de caché en `fetch`. |
| `manifest.webmanifest` | 14 | PWA instalable (solo icono SVG). |
| `.github/workflows/pages.yml` | 36 | Push a `main` → `npm test` → copia lista fija de archivos a `_site` → GitHub Pages. |
| `tests/calc.test.js` | 60 | 7 pruebas `node:test` de `calc.js`. |

### Secciones internas de `app.js`

| Líneas | Sección |
|---|---|
| 1-20 | Utilidades (`$`, `$$`, `fmt`, `today`, `uid`, `toISO`, `fmtDate`, `esc`) |
| 22-53 | Estado: `emptyState`, `load`, `save`, derivados (`latestWeight`, `latestBodyFat`, `bodyFatOf`) |
| 55-75 | Navegación por pestañas y `toast` |
| 77-137 | Perfil y plan |
| 139-189 | Registro corporal + historial |
| 191-287 | Comidas, biblioteca de alimentos, hábitos, barras de macros |
| 289-436 | Fotos: carga, visor, galería, comparador |
| 438-506 | Panel y recomendaciones (`renderTips`, lógica de negocio mezclada con DOM) |
| 508-584 | Gráfico canvas |
| 586-643 | Exportar JSON/CSV, importar, borrar todo |
| 645-665 | `render()` global y arranque |

### Flujo de datos

Patrón "estado global + re-render completo": cada evento muta `state`, llama a `save()` y luego a
`render()`, que repinta **las 5 vistas** (`app.js:646-653`) con `innerHTML`/`textContent`.

```
          ┌──────────────── index.html (5 <section class="view">) ────────────────┐
 usuario →│ formularios / clicks (delegación de eventos en document y contenedores)│
          └───────────────┬────────────────────────────────────────▲───────────────┘
                          │ submit / click                          │ innerHTML / textContent / canvas
                          ▼                                         │
                 ┌──────────────────── app.js (IIFE) ───────────────┴──────┐
                 │  handlers → muta `state` → save() → render()            │
                 │  render(): Panel · Registro · Comidas · Plan · Fotos    │
                 └───┬──────────────┬──────────────────────┬───────────────┘
                     │ JSON         │ funciones puras      │ async
                     ▼              ▼                      ▼
        localStorage            calc.js (Calc)        photos.js (Photos)
   'perdida-grasa:v1'        BMR/TDEE/Navy/plan/        IndexedDB 'perdida-grasa'
   (perfil, registros,       tendencia/ritmo             store 'photos' (Blobs)
    comidas, hábitos,
    biblioteca)                                     sw.js: caché 'perdida-grasa-v2'
                                                    (red primero, offline de respaldo)
```

### Modelo de datos persistido

**localStorage**, clave `perdida-grasa:v1` (`app.js:4`), un único JSON:

```js
{
  profile: null | {                 // app.js:82-92
    name: string, sex: 'male'|'female', age: number, height: number /*cm*/,
    startWeight: number /*kg*/, goalWeight: number, startDate: 'YYYY-MM-DD',
    activity: 1.2|1.375|1.55|1.725|1.9, rate: 0.0025|0.005|0.0075|0.01
  },
  entries: [ {                      // app.js:145-155 — 1 por fecha (se fusiona si se repite)
    id: string(8, Math.random), date: 'YYYY-MM-DD',
    weight?, waist?, neck?, hip?, bodyFat? /*% manual*/, note?: string(≤140)
  } ],
  foods: { 'YYYY-MM-DD': [ {        // app.js:206-208
    id, name, meal: 'Desayuno'|'Almuerzo'|'Cena'|'Snack', kcal, protein, carbs, fat
  } ] },
  habits: { 'YYYY-MM-DD': {         // app.js:233
    steps?, water? /*L*/, sleep? /*h*/, trained: boolean
  } },
  library: { '<nombre en minúsculas>': { name, kcal, protein, carbs, fat } }  // app.js:209
}
```
No hay campo `schemaVersion`; el "v1" solo vive en el nombre de la clave. El % de grasa Navy y la
masa magra **no se guardan**: se derivan al renderizar (`bodyFatOf`, `app.js:49-53`).

**IndexedDB** `perdida-grasa`, versión 1, object store `photos` con `keyPath: 'id'` (`photos.js:5-14`):
`{ id, date: 'YYYY-MM-DD', pose: 'frente'|'perfil'|'espalda', blob: Blob(JPEG), width, height, createdAt: epoch ms }`.

**Respaldo JSON** (`app.js:598`): `{ ...state, photos: [ { ...foto sin blob, data: 'data:image/jpeg;base64,…' } ] }`.
**CSV** (`app.js:601-609`): una fila por fecha con peso, medidas, % grasa, kcal, proteína, pasos y nota.

---

## 2. Fortalezas a conservar (Lean: no reescribir lo que funciona)

1. **Cero dependencias y cero build.** El sitio desplegado es exactamente lo que está en el repo; nada de
   `node_modules` en producción ni cadena de herramientas que mantener.
2. **Dominio puro separado** (`calc.js`), en formato UMD, testeable con `node --test` y con pruebas útiles.
   Es el patrón a imitar con el resto de la lógica.
3. **Local-first y privado**: no hay servidor ni datos sensibles (salud, fotos corporales) saliendo del
   dispositivo. Es un argumento de producto, no solo técnico.
4. **Persistencia adecuada a cada dato**: JSON pequeño en localStorage y Blobs comprimidos en IndexedDB.
5. **Escapado aplicado al texto libre del usuario** (`esc` en `app.js:18-20`, usado en notas, nombres de
   alimentos, datalist y consejos).
6. **Service worker de red primero**: los usuarios reciben las actualizaciones sin pasos manuales y la app
   sigue funcionando sin conexión.
7. **Exportar/importar completo** (incluye fotos) como mecanismo de respaldo y de cambio de dispositivo.
8. **CSS con tokens y modo oscuro**, formularios con `<label>` envolvente, `inputmode` y límites `min/max`.
9. **CI mínima que bloquea el despliegue si fallan las pruebas** (`pages.yml:28`).
10. Gestión cuidadosa de `ObjectURL` de fotos (se revocan al recargar o eliminar).

---

## 3. Deuda técnica y riesgos (priorizados)

### Alto

| # | Riesgo | Dónde | Detalle / propuesta |
|---|---|---|---|
| A1 | **Pérdida de datos por desalojo del almacenamiento** | `app.js:27-38`, `photos.js:11-19` | No se llama a `navigator.storage.persist()`. Safari/iOS puede borrar localStorage e IndexedDB de sitios no instalados tras ~7 días sin uso, y cualquier navegador puede hacerlo bajo presión de espacio. El único respaldo es manual. Propuesta: pedir almacenamiento persistente, mostrar el estado y recordar exportar (p. ej., "último respaldo hace N días"). |
| A2 | **Sin versionado de esquema ni migraciones** | `app.js:4, 23, 30, 619` | `load()` e import hacen `{...emptyState(), ...JSON}`: cualquier cambio de forma (renombrar campo, pasar a `updatedAt`, cambiar unidades) dejará datos viejos incoherentes sin aviso. Los respaldos exportados tampoco llevan versión. Propuesta: `schemaVersion` + cadena de migraciones (sección 5.3) **antes** de la primera historia que toque el modelo. |
| A3 | **Importación con validación mínima y no atómica** | `app.js:615-622`, `photos.js:81-87` | Solo se valida que `entries` sea array. Un `foods: null` o tipos erróneos rompen `render()` y, como ya se hizo `save()`, la app queda rota tras recargar. `Photos.importAll` hace `clear()` y luego inserta una a una: si falla a mitad, se pierden fotos. Propuesta: validar/normalizar (y migrar) en memoria, guardar copia del estado anterior, y escribir fotos en una sola transacción. |

### Medio

| # | Riesgo | Dónde | Detalle / propuesta |
|---|---|---|---|
| M1 | **XSS vía archivo JSON importado** (campos no escapados en `innerHTML`) | `app.js:185` (`e.id`), `275` (`x.id`, `x.kcal`), `397, 409, 431` (`p.id` de fotos) | El texto libre que escribe el usuario sí se escapa, pero los `id` y los números se interpolan sin `esc()`. Como el import acepta cualquier JSON, un respaldo manipulado (p. ej., compartido por un "coach") puede ejecutar script con acceso a todos los datos y fotos. Propuesta: (1) escapar **todo** valor interpolado, también números e ids; (2) normalizar tipos en el import (`Number()`, ids alfanuméricos); (3) añadir CSP con `<meta http-equiv="Content-Security-Policy">` (`default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'` — este último lo exige `style="width:…"` en `app.js:259`). |
| M2 | **`app.js` monolítico (665 líneas, 29 KB)** | `app.js` completo | Aún es legible, pero mezcla estado, reglas de negocio y DOM. `renderTips` (`479-506`), `dayTotals`, `weightNear` y la construcción del CSV son lógica pura sin pruebas por estar dentro de la IIFE. Dos devs trabajando en paralelo chocarán en el mismo archivo. Propuesta: dividir **de forma incremental** cuando una historia toque una sección (sección 5), empezando por extraer lógica pura testeable. No es urgente reescribirlo. |
| M3 | **Versionado/caché del SW manual y duplicado** | `sw.js:2-3`, `pages.yml:32`, `index.html:272-274` | `CACHE = 'perdida-grasa-v2'` se sube a mano. La lista de archivos está en 3 sitios: si se añade un JS y se olvida uno, falla offline o no se despliega. El `fetch` guarda en caché cualquier respuesta, también 404/500 (`sw.js:22-24`, no comprueba `res.ok`). Red primero sin timeout: con red lenta ("lie-fi") la app tarda mucho en abrir. Offline se pueden mezclar versiones de archivos. Propuesta mínima: el workflow inyecta el SHA del commit en `CACHE` (`sed`), cachear solo `res.ok`, timeout de ~3 s antes de caer a caché, y una prueba que verifique que las 3 listas coinciden (o copiar al `_site` por exclusión en vez de por lista). |
| M4 | **Validación de perfil muta el estado antes de validar** | `app.js:82-96` | Si la meta ≥ peso inicial se muestra el error, pero `state.profile` ya quedó sobrescrito en memoria; el siguiente `save()` de cualquier otro formulario lo persiste. Corregir: construir el objeto, validar y después asignar. |
| M5 | **Accesibilidad de navegación y gráfico** | `index.html:251-257`, `21,72,103,151,195`, `53`, `47-51, 174-178` | La tabbar declara `role="tablist"`/`role="tab"` pero sin `aria-selected`, `aria-controls`, `role="tabpanel"` ni navegación con flechas (rol a medias es peor que ninguno). El canvas no tiene `role="img"` ni alternativa textual de los datos. Los segmentados (`.seg`) no exponen `aria-pressed`. Los botones "✕" dicen solo "Eliminar" sin contexto (`app.js:185, 275`). Los errores solo se anuncian por un toast de 2,2 s (`app.js:69-75`). Tras cambiar de pestaña no se mueve el foco. |
| M6 | **Cobertura de pruebas y CI** | `package.json:7`, `pages.yml:3-6` | Solo se prueba `calc.js`. El workflow corre solo en push a `main`: los PR no se validan antes del merge. `npm test` apunta a un archivo concreto (los tests nuevos no se ejecutan si no se edita el script). Propuesta: `node --test tests/` y un job de CI en `pull_request`. |

### Bajo

| # | Riesgo | Dónde | Detalle |
|---|---|---|---|
| B1 | Tarjeta "Perdido" queda con datos viejos tras "Borrar todo" o import sin perfil | `app.js:448-452` | Falta rama `else` que limpie `#st-lost`/`#st-lost-sub`. |
| B2 | Formulario de perfil conserva valores anteriores al importar un respaldo sin perfil | `app.js:106-115` | `fillProfileForm` sin perfil solo rellena fecha y ritmo. |
| B3 | Alimento llamado `__proto__`/`constructor` se pierde o altera la biblioteca | `app.js:198, 209` | Usar `Object.create(null)` o `Map`, o prefijar la clave. |
| B4 | `uid()` con `Math.random` de 8 caracteres | `app.js:9` | Usar `crypto.randomUUID()` (necesario si algún día hay sincronización). |
| B5 | Re-render completo de las 5 vistas en cada cambio; `trend` es O(n²) | `app.js:646-653`, `calc.js:60-68` | Irrelevante con cientos de registros; vigilar solo si hay años de datos. No optimizar aún. |
| B6 | No se pueden editar comidas ni borrar un campo de un registro (la fusión ignora vacíos) | `app.js:150-152, 218-226` | Limitación funcional; decisión del Analista. |
| B7 | Manifest solo con SVG y `purpose: "any maskable"` combinado | `manifest.webmanifest:9-11` | iOS necesita `apple-touch-icon` PNG; algunos Android piden PNG 192/512. Separar `any` y `maskable`. |
| B8 | Sin `prefers-reduced-motion`; contraste de `--muted` sobre `--bg` en el límite (~4,5:1) | `styles.css:5, 81, 164` | Revisar con auditoría de QA. |
| B9 | Acciones de GitHub fijadas por etiqueta mayor, no por SHA | `pages.yml:23-35` | Riesgo de cadena de suministro bajo para este proyecto. |
| B10 | `npm start` descarga `http-server` con `npx --yes` en cada uso | `package.json:6` | Aceptable; alternativa sin red: `python3 -m http.server`. |
| B11 | Datos de salud y fotos sin cifrar en el dispositivo y en el JSON exportado | `app.js:598` | Coherente con local-first; basta con avisarlo en la UI al exportar. |

---

## 4. Recomendación de stack

**Seguir sin framework, sin bundler y sin dependencias de ejecución.** Justificación Lean:

- **El problema no lo pide.** 5 pantallas, un usuario, datos locales, interacciones de formulario. El
  patrón "estado + render" actual escala bien hasta varias veces el tamaño presente.
- **Evitar desperdicio (muda).** Migrar a React/Vue/Svelte supone reescribir lo que funciona, añadir build,
  `node_modules`, actualizaciones de seguridad y un paso más en el despliegue, sin valor visible para el
  usuario.
- **Los problemas reales no los resuelve un framework**: desalojo de almacenamiento, migraciones,
  validación de importación y accesibilidad se resuelven igual con o sin él.
- **Coste de cambio bajo después.** Si se separa la lógica pura (como `calc.js`), adoptar un framework en
  el futuro sería cambiar solo la capa de vistas.

Herramientas que sí acepto como **dependencias solo de desarrollo** (no se despliegan), si el
Stakeholder lo aprueba: ESLint (detectar errores) y Playwright (E2E y capturas para QA). Sin ellas
también se puede trabajar; no bloquean nada.

**Módulos ES (`<script type="module">`)**: serían la forma natural de dividir `app.js`, pero rompen la
apertura con doble clic (`file://`) que el README ofrece (`README.md:26`). Recomiendo seguir con
scripts clásicos y un espacio de nombres (`window.PG`) hasta que el Stakeholder decida (ver sección 6).

**Si algún día hiciera falta backend o sincronización** (no implementar ahora; YAGNI):

1. **Primer escalón, sin servidor:** mejorar el respaldo actual: recordatorio periódico, botón
   "Compartir respaldo" con Web Share API (guardarlo en Drive/iCloud/WhatsApp del propio usuario) y
   restauración guiada. Cubre el caso "cambio de móvil" con cero infraestructura.
2. **Si hace falta sincronización real entre dispositivos o un coach que vea los datos:** un BaaS
   gestionado con autenticación y reglas por usuario, **Supabase** (Postgres + Row Level Security +
   Storage para fotos), manteniendo el enfoque local-first: la app sigue escribiendo en local y una cola
   sube los cambios. Alternativa autoalojada en un solo binario: **PocketBase**. Para sincronización
   offline nativa: CouchDB + PouchDB (más pesado).
3. **Preparación barata que sí conviene hacer ya**, porque facilita lo anterior: ids robustos
   (`crypto.randomUUID`) y `updatedAt` en cada registro, dentro de la primera migración de esquema.
4. Al subir datos de salud y fotos a un servidor aparecen obligaciones legales de protección de datos
   (p. ej., Ley 1581 de 2012 en Colombia o el RGPD en Europa, según dónde estén los usuarios),
   consentimiento explícito y cifrado. Ese coste debe pesar en la decisión.

---

## 5. Contrato y convenciones para los Devs

### 5.1 Estructura de carpetas propuesta (destino; se llega de forma incremental)

```
/                      index.html, styles.css, sw.js, manifest.webmanifest, icon.svg (se quedan en raíz:
                       GitHub Pages y el scope del SW dependen de ello)
/js/core/
   util.js             $, $$, fmt, esc, toISO, fmtDate, uid           (hoy: app.js:5-20)
   store.js            SCHEMA_VERSION, load/save, migrate(), validate()  ← PURO salvo load/save
   ui.js               toast, navegación show(), helpers de accesibilidad
/js/domain/
   calc.js             (el actual, sin cambios)
   tips.js             reglas de recomendaciones como función pura (state, hoy) → string[]
   totals.js           dayTotals, weightNear, filas CSV
/js/data/
   photos.js           (el actual)
/js/views/
   panel.js  registro.js  comidas.js  fotos.js  perfil.js  datos.js  chart.js
/js/app.js             arranque: load → migrate → registrar vistas → render
/tests/                *.test.js, uno por módulo puro (node --test tests/)
/equipo/               documentación del equipo (no se despliega)
```
Reglas:
- Todo módulo de `core/` (salvo E/S), `domain/` sigue el **patrón UMD de `calc.js`** para poder
  probarlo en Node sin DOM. Los de `views/` pueden usar DOM y se registran en `window.PG`.
- **Mover antes de cambiar**: un PR que mueve código no cambia comportamiento; los cambios van en
  otro commit. Así QA puede revisar los diffs.
- Al añadir o mover un archivo desplegable: actualizar `index.html`, `ASSETS` de `sw.js` y el paso
  "Preparar sitio" de `pages.yml` en el **mismo commit** (hasta que exista la prueba de M3).
- **Seguridad en render**: todo valor interpolado en `innerHTML` pasa por `esc()`, incluidos ids y
  números. Si no hace falta HTML, usar `textContent`.
- Cualquier cambio de recursos estáticos sube la versión de caché del SW (hasta automatizarlo).

### 5.2 Cómo añadir una pantalla nueva

1. **HTML**: añadir `<section id="view-<nombre>" class="view" role="tabpanel" aria-labelledby="tab-<nombre>">`
   en `index.html` y su botón en la `nav.tabbar` (`data-view="<nombre>"`, `id="tab-<nombre>"`).
   La tabbar tiene 5 columnas fijas (`styles.css:150`): una sexta pestaña requiere decisión de UX
   (¿menú "Más"?), no solo CSS.
2. **Vista**: crear `js/views/<nombre>.js` que exponga `PG.views.<nombre> = { init(), render(state) }`.
   `init()` engancha eventos una sola vez (preferir delegación en el contenedor de la sección);
   `render()` es idempotente y solo toca su sección.
3. **Lógica**: cálculos en `js/domain/*.js` (puros) con su test en `tests/`.
4. **Estado**: si guarda datos nuevos, añadir el campo en `emptyState()` y una **migración** (5.3).
5. **Registro**: incluir el `<script>` en `index.html` antes de `app.js`, añadirlo a `ASSETS` en `sw.js`
   y a `pages.yml`.
6. **Accesibilidad**: encabezado `<h2>` por tarjeta, labels en todos los campos, foco visible, operable
   con teclado, probado a 390 px de ancho y en modo oscuro.
7. **Hecho** según la Definición de Hecho de `equipo/README.md`.

Mientras `app.js` no esté dividido, una pantalla nueva puede vivir en su propio archivo
`js/views/<nombre>.js` desde el principio, aunque el resto siga en `app.js`. No hace falta dividir
todo antes.

### 5.3 Cómo versionar el esquema de datos

- **Clave estable**: se mantiene `localStorage['perdida-grasa:v1']` (cambiar la clave exige copiar
  y borrar, más riesgo). La versión pasa a estar **dentro** del dato: `state.schemaVersion`.
  Ausente = versión 1 (el formato actual descrito en la sección 1).
- **Migraciones puras y secuenciales** en `js/core/store.js`:
  ```js
  const SCHEMA_VERSION = 2;
  const MIGRATIONS = {
    // de 1 a 2: ejemplo
    2: (s) => ({ ...s, entries: s.entries.map((e) => ({ updatedAt: 0, ...e })) }),
  };
  function migrate(raw) {
    let s = { ...raw, schemaVersion: raw.schemaVersion ?? 1 };
    if (s.schemaVersion > SCHEMA_VERSION) throw new Error('Datos de una versión más nueva de la app');
    while (s.schemaVersion < SCHEMA_VERSION) {
      s = MIGRATIONS[s.schemaVersion + 1](s);
      s.schemaVersion += 1;
    }
    return validate(s);   // normaliza tipos, descarta basura, rellena con emptyState()
  }
  ```
- Se aplica **siempre** en dos puntos: `load()` y el import de JSON (un respaldo viejo es solo otra
  versión anterior).
- Antes de guardar el resultado de una migración, se hace copia del dato crudo en
  `perdida-grasa:backup-v<N>` (una sola copia, se sobrescribe), para poder deshacer.
- El JSON exportado incluye `schemaVersion` y `exportedAt`.
- Nunca se borran ni reutilizan campos con otro significado; se añaden nuevos y se migran los viejos.
- **IndexedDB**: subir el número de versión en `indexedDB.open(DB_NAME, N)` y en `onupgradeneeded`
  aplicar `switch (event.oldVersion)` con cada paso, sin `break`, para pasar por todos.
- **Toda migración lleva test** en `tests/store.test.js` con un fixture del formato anterior (los
  fixtures se guardan en `tests/fixtures/` y no se modifican nunca).

---

## 6. Preguntas y decisiones

### Preguntas para @Analista
1. ¿Usuario único por dispositivo o hay un caso "coach / varios clientes"? Define si algún día hace
   falta backend.
2. ¿Hace falta usar la app en varios dispositivos a la vez, o basta con migrar de móvil de vez en cuando?
3. Unidades y formato: ¿solo kg/cm, o también lb/in? ¿Formato numérico de Colombia (`es-CO`) o el genérico `es`?
4. ¿Editar comidas y registros (hoy solo se borran; los campos vacíos no se pueden "limpiar") entra en el backlog?
5. ¿Base de datos de alimentos externa o solo la biblioteca personal actual? (Una API externa rompería el "sin servidor".)
6. ¿Una sexta pestaña o nuevas pantallas en el roadmap? Afecta a la navegación (5 columnas fijas).
7. ¿Recordatorios (pesarse, hacer respaldo)? Las notificaciones push requieren servidor; las locales no son fiables en iOS.

### Preguntas para @QA
1. Matriz de navegadores objetivo: ¿iOS Safari (versión mínima), Chrome Android, escritorio? iOS es el que más condiciona (A1).
2. ¿Prefieres E2E con Playwright (dependencia de desarrollo) o pruebas manuales guiadas con capturas en `equipo/qa-capturas/`?
3. ¿Puedes preparar fixtures de import: respaldo v1 real, respaldo malicioso (para M1), respaldo corrupto (para A3) y respaldo grande con fotos?
4. ¿Herramienta de auditoría de accesibilidad acordada (Lighthouse/axe) y nivel objetivo (WCAG 2.1 AA)?
5. ¿Incluyes en la Definición de Hecho "probado offline tras una actualización del SW" y "probado en modo oscuro"?
6. Confirma o descarta los bugs B1, B2 y M4 en navegador para que entren en el backlog.

### Decisiones que necesitan al Stakeholder
1. **Mantener o no la apertura con doble clic (`file://`).** Si no hace falta, se pueden usar módulos ES nativos para dividir `app.js` (más limpio). Si hace falta, se siguen usando scripts clásicos.
2. **Dependencias solo de desarrollo** (ESLint, Playwright): ¿aprobadas? No se despliegan.
3. **Backend / sincronización**: confirmar que queda fuera del alcance (recomendado) y que la estrategia es local-first con respaldo mejorado.
4. **Política de respaldo**: ¿recordatorio activo de exportar? ¿Pedir almacenamiento persistente al usuario?
5. **CSP y endurecimiento del import** (M1) como historia técnica del próximo sprint: ¿se prioriza frente a funcionalidades?
6. **Orden de la deuda técnica**: propuesta de primer sprint técnico = A2 (esquema + migraciones) → A3 + M1 (import seguro) → M4 + B1 (bugs) → M3 (SW). La división de `app.js` (M2) se hace de forma incremental, no como historia aparte.
7. **Datos sensibles**: ¿se añade un aviso de privacidad en la UI al exportar (las fotos van en el JSON sin cifrar)?
