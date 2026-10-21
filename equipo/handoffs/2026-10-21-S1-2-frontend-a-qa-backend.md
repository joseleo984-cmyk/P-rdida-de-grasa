DE: Dev Frontend + UX → PARA: QA, Dev Backend (cc: Scrum Master, Arquitecto)
HISTORIA: S1-2 = HU-01 Proteger mis datos (persistencia + recordatorio de copia)

HECHO:
- `calc.js`: funciones puras `backupDue(lastBackupISO, snoozeUntilISO, todayISO, hasData, everyDays = 7)` y `addDays(iso, n)`.
  Fechas inválidas = "nunca"; acepta ISO con hora (usa los 10 primeros caracteres).
- `tests/calc.test.js`: casos nunca, 6 días, 7 días, con hora, pospuesto, fin del aplazamiento, sin datos,
  fechas basura, cambio de año, `addDays` (fin de año y bisiesto). `npm test`: 9/9 en verde.
- `app.js` (bloque nuevo "Respaldo y almacenamiento (HU-01)", antes de Render):
  - Al arrancar, `navigator.storage.persisted()` y, si no, `persist()`; sin API = no protegido.
    Perfil → Datos muestra "Almacenamiento protegido…" o "El navegador puede borrar tus datos: haz copias…" + espacio usado (`estimate()`).
  - Perfil → Datos muestra "Última copia exportada: <fecha> (hace N días)" o "Aún no has exportado ninguna copia".
  - Banner en el Panel (`role="status"`, `aria-live="polite"`) si hay ≥ 1 registro corporal y toca copia:
    "Hacer copia ahora" (dispara `#btn-export`) y "Recordar más tarde" (pospone 3 días, toast de confirmación).
  - `render()` llama a `renderBackup()` (única línea añadida a código existente).
  - La fecha se graba con un **segundo listener** de clic sobre `#btn-export`; no se tocó el handler de exportación
    ni `load()/save()`/importación/`photos.js`/`sw.js`.
- `index.html`: banner al inicio del Panel; lista de estado en la tarjeta Datos. `styles.css`: estilos del banner,
  `:focus-visible` en `.btn` y foco en el botón de importar.
- E2E en navegador real: `equipo/qa/run-s1-2.js` (Chromium, 390x844, file://, zona America/Bogota): 18/18 OK,
  sin errores ni avisos de consola. Capturas: `equipo/qa-capturas/s1-2-banner-panel.png`, `s1-2-datos-estado.png`.

CLAVES NUEVAS DE localStorage (fuera de `state`, no van en el JSON exportado):
- `perdida-grasa:lastBackup` → ISO completo (`new Date().toISOString()`) del último "Exportar JSON".
- `perdida-grasa:backupSnooze` → día local `AAAA-MM-DD` hasta el que se pospone el aviso.

PENDIENTE:
- Backend: decidir si integra estas claves en el esquema (p. ej. `state.meta.lastBackup`) con migración; si lo hace,
  basta cambiar `getPref/setPref` del bloque HU-01. "Borrar todo" e importar **no** las limpian (decisión a confirmar).
- Backend (criterio de HU-01): mensaje de `save()` cuando falla por cuota sugiriendo exportar — no está en mi alcance (toca `save()`).
- `sw.js`: no se añadieron assets, no hace falta cambiar `ASSETS`; la versión de `CACHE` la sube el Backend en S1-1.
- QA: probar en iOS Safari real (persist() suele devolver false) y en modo oscuro; revisar contraste del borde naranja.

PREGUNTAS:
- @Analista / PO: el backlog dice ">14 días, ≥7 registros, posponer 7 días"; el sprint (tablero) pidió "≥7 días, ≥1 registro,
  posponer 3 días". Implementé lo del sprint; el umbral es el parámetro `everyDays` de `backupDue` y `SNOOZE_DAYS` en app.js.
- @Dev Backend: ¿la exportación de S1-1 sigue siendo el clic en `#btn-export`? Si se mueve a otra función, llamad ahí
  a la marca de copia (o conservad el id del botón).
- @QA: "hay datos" = `state.entries.length > 0` (no cuenta solo comidas/hábitos). ¿Suficiente?
