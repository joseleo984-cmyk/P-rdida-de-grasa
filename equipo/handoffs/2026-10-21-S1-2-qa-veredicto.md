DE: QA / Revisor → PARA: Dev Frontend (cc: Scrum Master, Dev Backend, Analista)
HISTORIA: S1-2 = HU-01 Proteger mis datos (persist + recordatorio de copia)
REVISADO: `git diff e20d6f0..HEAD -- . ':!equipo'` (merge b22d5b7: app.js, calc.js, index.html, styles.css, tests/calc.test.js)

# VEREDICTO: APROBADO (con 4 defectos menores a corregir dentro del Sprint 1, ninguno bloqueante)

La funcionalidad cumple los criterios del sprint (≥ 7 días, ≥ 1 registro, posponer 3 días: decisión del SM, no defecto).
Las fechas se calculan bien en el día local en 5 zonas horarias, incluido el cambio de día. No hay errores de consola.
Contraste correcto en claro y en oscuro. Los defectos son de accesibilidad y de ciclo de vida en iPhone, y se arreglan en pocas líneas.
Fuera de alcance (S1-1 Backend): aviso de cuota en `save()` y limpiar las claves en "Borrar todo".

## Evidencia
- `npm test`: 9/9 en verde (incluye `backupDue` y `addDays`).
- E2E del Dev `equipo/qa/run-s1-2.js`: 18/18 OK (Chromium, 390x844, Bogotá).
- E2E de QA `equipo/qa/qa-s1-2.js` (nuevo, Chromium 1194, 390x844, `page.clock`): 25 OK / 3 FALLOS (D1, D2, D3).
  - Modo oscuro (`colorScheme: 'dark'`): borde 9,88:1, texto 13,98:1, "Última copia" (muted) 6,27:1. Claro: borde 3,19:1 (justo ≥ 3:1).
  - Zonas horarias: Asia/Tokyo, America/Bogota, Pacific/Kiritimati (UTC+14), Pacific/Honolulu (UTC-10). Con 6 y 7 días locales, a horas en que el día UTC ≠ el día local: todo correcto. "Posponer" = hoy local + 3 en todas.
  - Exportar a las 23:50 local: archivo `perdida-grasa-2026-10-21.json`. A las 00:10, Perfil → Datos muestra "21 oct 26 (ayer)". OK.
  - Valores corruptos en `lastBackup`/`backupSnooze` → se tratan como "nunca", sin errores.
  - `persist()` concedido (simulado) → "Almacenamiento protegido… Espacio usado: 3,5 MB" con ✓. Sin `navigator.storage` → mensaje de riesgo, sin errores.
- Capturas: `equipo/qa-capturas/s1-2-qa-banner-oscuro.png`, `equipo/qa-capturas/s1-2-qa-datos-oscuro.png`.

## Checklist DoD (equipo/qa-informe.md §5)
| # | Criterio | Estado |
|---|---|---|
| 1 | Criterios de aceptación (versión del sprint) | ✅ persist + estado + espacio usado; recordatorio ≥ 7 días; posponer; desaparece al exportar. La parte de `save()` con cuota es de S1-1. Falta que el PO/SM la revise. |
| 2 | `npm test` verde + pruebas unitarias con límites e inválidos | ✅ 9/9 (6/7 días, basura, cambio de año, bisiesto). Ver O2. |
| 3 | E2E Playwright 390x844 | ✅ (Dev 18/18 + QA). Aún no está en CI (pendiente de la decisión 4 del Stakeholder). |
| 4 | Sin errores ni avisos de consola | ✅ en claro, oscuro y las 4 zonas horarias. |
| 5 | Seguridad (`innerHTML`/`esc`) | ✅ Todo con `textContent`; no entra ningún dato importado. |
| 6 | Datos: forma de `state` / migración | ✅ No cambia `state`: las claves `perdida-grasa:lastBackup` y `:backupSnooze` van aparte. Ver pregunta P2 al Backend. |
| 7 | Fechas en día local, probadas en ≥ 2 zonas | ✅ Lo cubre QA (el E2E del Dev solo usaba Bogotá). `toISO(new Date(last))` en app.js:658 es correcto. |
| 8 | Accesibilidad: etiquetas, foco visible, sin scroll a 390 | ⚠️ Etiquetas OK, `:focus-visible` OK, sin scroll (390). El foco se pierde al ocultar el banner (D1). Posible re-anuncio de la región viva (D2). |
| 9 | PWA (ASSETS/CACHE) | ✅ No hay assets nuevos. La versión de `CACHE` la sube el Backend en S1-1. |
| 10 | Revisión de otro agente + README/CHANGELOG | ⚠️ Revisado por QA. README no menciona el recordatorio ni el estado de almacenamiento (D4). |

## Defectos
**D1 · Menor (a11y) · El foco se pierde al ocultar el banner**
- Pasos: con datos y sin copia → Panel → Tab hasta "Recordar más tarde" → Enter (o "Hacer copia ahora").
- Resultado: el banner se oculta con `display:none` y `document.activeElement` pasa a `<body>`. VoiceOver/teclado vuelve al inicio de la página.
- Esperado: el foco pasa a un elemento estable, p. ej. el primer `.stat` o `#today-label` con `tabindex="-1"`, o el `h2`/contenedor del Panel.
- Archivo: app.js:670 (toggle `hidden`), app.js:679-684 (handlers).

**D2 · Menor (a11y, probable en VoiceOver iOS) · La región viva se reescribe en cada render**
- `#backup-banner` tiene `role="status" aria-live="polite"` (index.html:28). `renderBackup()` reasigna `textContent` en cada `render()` (app.js:667), aunque el texto sea igual, y `render()` corre en cada cambio de pestaña y en cada guardado.
- Medido: 4 mutaciones por 4 cambios de pestaña sin cambio de contenido. Algunos lectores vuelven a anunciar "Tu última copia…" cada vez.
- Propuesta: asignar solo si cambia (`if (el.textContent !== txt) el.textContent = txt`). Mejor aún: quitar `role=status` del contenedor (el banner aparece al cargar, cuando las regiones vivas no se anuncian) y usar un `h2`/`aria-labelledby` para que se lea como sección. Ya existe un toast con `role=status` para confirmar "Recordar más tarde".

**D3 · Menor (iPhone) · El aviso no se reevalúa al volver a la app**
- Pasos (simulados con `page.clock`): app abierta el 21 oct 23:58 con copia de hace 6 días → pasa la medianoche → `visibilitychange`/`pageshow` → no aparece el banner. Solo aparece al cambiar de pestaña.
- En iOS, una PWA en segundo plano se reanuda sin recargar, así que el aviso puede tardar días en salir si la usuaria vuelve siempre al Panel. Lo mismo pasa con "hace N días" y con la fecha del encabezado.
- Propuesta: `document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') render(); })` (cerca de app.js:723).

**D4 · Trivial (DoD 10) · README sin actualizar**
- README.md:22 debería mencionar el recordatorio de copia (7 días, posponer 3) y el estado del almacenamiento en Perfil → Datos.

## Observaciones (sin defecto; decidir)
- **O1 · Riesgo en iPhone:** la copia se marca como hecha al pulsar "Exportar JSON" (app.js:674), no cuando la descarga termina. En iOS la descarga pasa por un diálogo o por la hoja de compartir, y si la usuaria cancela, el aviso desaparece 7 días sin que haya copia. Tampoco se distingue el caso en que `Photos.exportAll()` falla (app.js:596: se exporta sin fotos y se marca igual). No se puede detectar la descarga con `<a download>`. Opciones: marcar solo si las fotos se exportaron bien, o usar `navigator.share({ files })` en iOS (con promesa de resultado). → @PO/@SM.
- **O2 · `Calc.backupDue` con ISO con hora usa el día UTC** (`slice(0,10)`, calc.js:101/103). La app le pasa el día local (correcto), pero la prueba "acepta fecha con hora" fija la semántica UTC: es una trampa para quien la reutilice (p. ej. Backend con `state.meta.lastBackup` ISO). Propuesta: documentar "solo AAAA-MM-DD local" o convertir con `toISO` dentro.
- **O3 · `lastBackup` en el futuro** (reloj adelantado y luego corregido): Datos dice "19 nov 26 (hoy)" y el banner queda suprimido hasta esa fecha. Es un borde raro. Sugerencia: tratar `ago < 0` como "nunca" o como "hoy" y recalcular.
- **O4 · "Espacio usado"** sale de `storage.estimate()`, que en Chromium/Safari no cuenta `localStorage` (donde están los registros). En `file://` muestra "0 KB". Es engañoso, pero no grave. Sugerencia: "Espacio usado (fotos y caché)".
- **O5 · `persist()` al arrancar sin gesto:** en Firefox abre un permiso emergente nada más cargar. En Safari/Chrome no hay prompt. Aceptable, porque la mayoría usa iPhone.
- **O6 · `Calc.addDays` con una fecha inválida lanza `RangeError`** (toISOString de NaN). Hoy solo se llama con `today()`, así que no hay impacto.

## Respuestas y preguntas
- **Al Dev (¿"hay datos" = `entries.length > 0`?):** es suficiente para el sprint. Recomiendo ampliarlo a `entries || foods || habits || fotos`: alguien que solo usa el diario de comidas también pierde datos. Decide @Analista.
- **P1 @PO/@SM:** ¿aceptamos el riesgo O1 (marcar la copia al pulsar) o pedimos confirmación "¿Se guardó el archivo?" en iOS?
- **P2 @Dev Backend:** si movéis `lastBackup` a `state.meta`, ¿irá en el JSON exportado? Si va, al importar una copia antigua se arrastra su fecha; mejor mantenerla fuera del export.
- **P3 @Arquitecto:** ¿incorporamos `equipo/qa/run-s1-2.js` y `qa-s1-2.js` al job E2E de CI cuando entre Playwright como devDependency? Ambos usan rutas absolutas de `/opt` que habrá que parametrizar.

Sin commit. Archivos de QA nuevos: `equipo/qa/qa-s1-2.js` y las 2 capturas `s1-2-qa-*.png`.
