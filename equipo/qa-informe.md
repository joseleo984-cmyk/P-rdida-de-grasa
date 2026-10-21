# Informe QA — Sprint 0 (diagnóstico)

**Agente:** QA / Revisor · **Fecha:** 2026-10-21 · **Alcance:** PWA vanilla JS (`index.html`, `app.js`, `calc.js`, `photos.js`, `sw.js`)
**Entorno:** `python3 -m http.server` + Playwright 1.56 / Chromium 1194 (headless), viewport móvil 390x844, `locale es-CO`, `timezoneId America/Bogota` (más pruebas con reloj simulado en Bogotá y Madrid). No se modificó código de la app.

---

## 1. Resultado de pruebas automáticas (`npm test`)

`node --test tests/calc.test.js` → **7/7 OK** (≈150 ms).

| Test | Qué cubre |
|---|---|
| BMR Mifflin-St Jeor | `bmr()` hombre y mujer |
| plan: déficit y macros | `plan()` caso nominal: mantenimiento, ritmo, proteína, macros ≈ kcal |
| plan: mínimo de calorías | piso de 1200 kcal (mujer) y `floored` |
| % grasa Navy | hombre, mujer sin cadera (null), mujer con cadera |
| ritmo semanal | `weeklyRate()` lineal y con 1 punto |
| tendencia 7 días | `trend()` con huecos de fechas |
| semanas a la meta | `weeksToGoal()` nominal, meta superada, ritmo 0 |

Solo se prueba `calc.js`. **`app.js` (665 líneas, toda la lógica de estado, formularios, importación, render) y `photos.js` tienen 0 % de cobertura.** El workflow de Pages (`.github/workflows/pages.yml`) ejecuta `npm test` antes de publicar, así que hoy publica aunque la UI esté rota.

---

## 2. Flujos probados en navegador (móvil 390x844)

| # | Flujo | Resultado | Nota |
|---|---|---|---|
| 1 | Primer arranque sin perfil abre la vista Perfil | OK | captura 01 |
| 2 | Perfil con meta ≥ peso inicial → aviso | OK (aviso) / **FALLO** (efecto lateral) | ver BUG-04 |
| 3 | Guardar perfil válido y ver plan calculado | OK | BMR 1395, objetivo 1530 kcal (captura 02) |
| 4 | Campo cadera visible solo para mujer | OK | |
| 5 | Registro vacío rechazado | OK | |
| 6 | Registrar 4 pesajes + medidas, % grasa Navy y masa magra | OK | 31,9 % · nota con HTML se muestra escapada (captura 03) |
| 7 | Peso fuera de rango (5 kg) bloqueado por validación HTML | OK | |
| 8 | Añadir alimentos, nombre con `<img onerror>` escapado | OK | |
| 9 | Autocompletar macros desde la biblioteca | OK | |
| 10 | Alimento con nombre solo de espacios | **FALLO** | se guarda con nombre vacío (BUG-07) |
| 11 | Eliminar alimento | OK | |
| 12 | Hábitos (pasos, agua, sueño, entreno) persisten tras recargar | OK | captura 04 |
| 13 | Panel: peso, ritmo, progreso, macros, gráfica, consejos | OK | captura 05 |
| 14 | Sin scroll horizontal a 390 px | OK | `scrollWidth = 390` |
| 15 | Exportar JSON / CSV | OK | |
| 16 | Borrar todo | OK | |
| 17 | Importar JSON exportado (ida y vuelta) | OK | |
| 18 | Importar JSON sintácticamente roto | OK | aviso «Archivo no válido» sin perder datos |
| 19 | Importar JSON con forma válida y contenido inválido | **FALLO** | la app queda rota y persiste (BUG-01) |
| 20 | XSS mediante JSON importado | **FALLO** | se ejecuta JS (BUG-02) |
| 21 | Importar `kcal` como texto | **FALLO** | suma «100200» (BUG-03) |
| 22 | Fecha por defecto a las 23:30 en Bogotá | OK | usa el día local (`toISO`) |
| 23 | «Últimos 7 días» en el cambio de hora (Madrid, 30-mar) | OK | 7 días distintos |
| 24 | Errores de consola en el flujo principal | OK | 0 errores y 0 avisos |

No se probó la subida real de fotos (se necesita un archivo de imagen y un diálogo nativo). Su ruta de importación se revisó en el código (ver BUG-02).

Capturas en `equipo/qa-capturas/`: `01-inicio-sin-perfil`, `02-perfil-plan`, `03-registro`, `04-comidas-habitos`, `05-panel-movil`, `06-import-corrupto-app-rota`. En las capturas de página completa la barra de pestañas fija aparece a media página. Es un efecto de la captura, no un bug.

---

## 3. Bugs encontrados (priorizados)

### Crítico

**BUG-01 — Un JSON importado con estructura inválida se guarda antes de validarse y deja la app rota de forma permanente**
- Archivo: `app.js:616-620` (solo comprueba `Array.isArray(data.entries)`, luego `save()` y `render()`). Puntos de fallo: `app.js:281` (`state.habits[d]` con `habits: null`), `app.js:40` (`a.date.localeCompare` con entradas sin `date`) y `app.js:208/240` (`foods` que no es un objeto).
- Pasos: Perfil → Importar JSON → archivo `{"entries":[{"weight":80}],"foods":[],"habits":null}`.
- Resultado: aparece «Archivo no válido», pero el estado ya se guardó en `localStorage`. Al recargar salen los errores `pageerror: Cannot read properties of null (reading '2026-10-20')` y el render queda a medias. El usuario no lo arregla recargando; solo con «Borrar todo», si llega a ese botón, o limpiando el almacenamiento.
- Esperado: validar el esquema completo (tipos y fechas `YYYY-MM-DD`) **antes** de `save()`, y si falla no tocar el estado.

**BUG-02 — XSS almacenado mediante importación de JSON (los campos no se escapan en `innerHTML`)**
- Archivo: `app.js:185` (`data-del-entry="${e.id}"`), `app.js:275` (`${x.kcal}` y `data-del-food="${x.id}"`), `app.js:397`, `409` y `431` (`p.id` de fotos importadas).
- Pasos: importar `{"entries":[{"id":"\"><img src=x onerror=\"window.__xss1=1\">","date":"<hoy>","weight":90}]}`. También `foods[<hoy>][0].kcal = "<img src=x onerror=...>"`.
- Resultado: **se ejecutó JS en ambos casos** (comprobado en Chromium). Como el estado se guarda, se vuelve a ejecutar en cada carga. El vector real es que alguien comparta un «respaldo» malicioso.
- Esperado: escapar con `esc()` todo lo que se interpola, o mejor usar `textContent`/`createElement`, y normalizar los tipos al importar (`Number()` e ids `[a-z0-9]`).

### Alto

**BUG-03 — Los valores numéricos importados no se normalizan: los totales se concatenan como texto**
- Archivo: `app.js:240-242` (`t.kcal + x.kcal`), con origen en `app.js:619`.
- Pasos: importar dos alimentos del mismo día con `"kcal":"100"` y `"kcal":"200"` → Comidas.
- Resultado: «Calorías **100200** kcal». Lo mismo ocurre con `weight` como texto en `trend()`/`weeklyRate()` (`calc.js:65`, suma de cadenas).

**BUG-04 — Un perfil inválido queda en memoria y se persiste con la siguiente acción**
- Archivo: `app.js:82-96`: `state.profile` se asigna **antes** de validar `goalWeight < startWeight`.
- Pasos: perfil nuevo con peso inicial 70 y meta 80 → «Guardar» (aparece el aviso) → Comidas → añadir un alimento.
- Resultado: `localStorage.profile = {startWeight:70, goalWeight:80, name:"", ...}`, el onboarding desaparece y el panel muestra «¡Meta alcanzada!». También pisa un perfil válido anterior si se edita mal.
- Esperado: validar sobre un objeto temporal y asignarlo solo si es válido.

### Medio

**BUG-05 — Se aceptan fechas futuras en el registro corporal (y en fotos y comidas)**
- Archivo: `index.html:76` (sin `max`) y `app.js:141-161`.
- Pasos: Registro → fecha 2030-01-01, peso 80 → «Registro guardado».
- Impacto: «Peso actual», ritmo y gráfica usan el último registro por fecha (`app.js:41-43`), así que un error de fecha distorsiona todo el panel.

**BUG-06 — Editar el perfil (fecha de inicio o peso inicial) deja un registro huérfano o desactualizado**
- Archivo: `app.js:98-100`.
- Pasos: perfil 90 kg el 01-oct → editar a 88 kg el 02-oct.
- Resultado: quedan dos entradas (`[2026-10-01, 90]`, `[2026-10-02, 88]`). Si solo cambia el peso inicial, el registro existente conserva el valor viejo.

**BUG-07 — Se acepta un alimento con nombre vacío (solo espacios)**
- Archivo: `app.js:206` (`trim()` sin comprobar que quede texto). `required` no detecta los espacios.
- Pasos: Comidas → nombre «   », 50 kcal → Agregar → fila sin nombre y entrada `""` en la biblioteca (`app.js:209`).

**BUG-08 — Al editar un registro existente no se puede borrar un campo**
- Archivo: `app.js:150-152` (solo copia los valores `!== undefined`).
- Pasos: registro con cintura 90 → guardar la misma fecha con cintura vacía → la cintura sigue en 90. No hay forma de corregir una medida mal introducida salvo borrar el registro entero.

### Bajo

**BUG-09 — Importar `entries` sin `id` hace imposible borrarlas:** `data-del-entry="undefined"` no coincide con nada (`app.js:167/185`).
**BUG-10 — Borrar un alimento con el selector de fecha vacío no hace nada:** el render usa `foodDate.value || today()` (`app.js:266`), pero el borrado usa `foodDate.value` (`app.js:221`).
**BUG-11 — La tarjeta «% Grasa» dice «Agrega medidas» aunque ya haya una medida:** pasa cuando hay un solo valor (`app.js:455`; se ve en la captura 05).
**BUG-12 — Inyección de fórmulas en el CSV:** una nota que empieza por `=`, `+`, `-` o `@` se exporta tal cual y Excel/Sheets la interpreta (`app.js:607`).
**BUG-13 — La importación no valida `photos[].pose` ni `date`:** `POSES[undefined]` muestra «undefined» en la galería (`photos.js:112-115`, `app.js:397`).
**BUG-14 — Las fotos se borran antes de importar las nuevas:** `importAll` hace `clear()` primero (`photos.js:111`). Si una foto falla a mitad, se pierden las anteriores y la importación queda parcial.
**OBS-01 — El service worker cachea cualquier GET, incluidas respuestas de error y de otros orígenes** (`sw.js:21-25`, no comprueba `res.ok`). Además, `CACHE` se versiona a mano.

### Revisado sin incidencias
- `toISO()` (`app.js:11`) da el día local correcto cerca de medianoche (Bogotá).
- `last7` (`app.js:493`) funciona en el cambio de horario de Madrid. Restar 24 h exactas podría saltarse un día en zonas con cambios de 30 min o más a medianoche; riesgo teórico.
- `calc.js`: fórmulas Mifflin y Navy correctas. `toDay` usa UTC de forma consistente.
- Las notas, los nombres de alimento y los consejos sí pasan por `esc()`.

---

## 4. Huecos de cobertura de tests

1. **`app.js` sin ninguna prueba:** importación y exportación, validación de formularios, fusión de registros, `bodyFatOf`, `latestWeight` y `dayTotals`.
2. **Validación de importación:** JSON roto, tipos incorrectos, campos ausentes, payloads XSS, `habits`/`foods` con `null` o arrays.
3. **`calc.js`, casos límite sin probar:**
   - `plan()` con `activity`/`rate` vacíos y el piso masculino (1500).
   - Carbohidratos que se quedan en 0 por el piso.
   - `bmi` con altura 0.
   - `navyBodyFat` con cintura ≤ cuello y con valores fuera de rango (>70 %).
   - `trend`/`weeklyRate` con fechas desordenadas, duplicadas o pesos como texto.
   - `weeksToGoal` con ritmo negativo.
4. **Fechas y zonas horarias:** `toISO`, `today` y `last7` con reloj simulado en varias zonas y en los cambios de hora.
5. **E2E/UI:** no hay pruebas de navegador. El script de Playwright de este sprint (`/tmp/claude-0/qa/run.js`) puede servir de base para `tests/e2e/`.
6. **CI:** el workflow solo ejecuta `calc.test.js`. No hay lint, ni E2E, ni comprobación de que `index.html` cargue sin errores de consola.

---

## 5. Propuesta de «Definición de Hecho» (DoD)

Una historia está **Hecha** cuando:
1. Cumple los criterios de aceptación acordados con @Analista, y el PO o el Scrum Master la revisa.
2. `npm test` pasa en verde en CI, y la lógica nueva o cambiada tiene **pruebas unitarias** que incluyen casos límite y entradas inválidas.
3. Los flujos de usuario afectados tienen al menos una **prueba E2E** (Playwright) en verde, en viewport móvil 390x844.
4. No hay **errores ni avisos de consola** en el flujo afectado.
5. **Seguridad:** ningún dato del usuario o importado se interpola en `innerHTML` sin `esc()`; los datos importados se validan con un esquema antes de persistirse.
6. **Datos:** cualquier cambio en la forma de `state` incluye una migración versionada (`perdida-grasa:vN`) y es compatible con los respaldos JSON anteriores.
7. **Fechas:** se usa el día local (`toISO`), con prueba en al menos dos zonas horarias.
8. **Accesibilidad básica:** controles con etiqueta, foco visible y sin scroll horizontal a 390 px.
9. **PWA:** si se añaden o cambian assets, se actualizan `ASSETS` y `CACHE` en `sw.js`, y se comprueba que funciona sin conexión.
10. Otro agente revisó el código (QA o Arquitecto) y README/CHANGELOG están actualizados si cambia el comportamiento visible.

---

## 6. Preguntas para otros agentes

**@Analista**
1. ¿Deben permitirse registros con **fecha futura**? Si no, ¿bloqueamos o solo avisamos? (BUG-05)
2. Al **editar el perfil** (fecha de inicio o peso inicial), ¿se actualiza el registro original, se crea uno nuevo o se pregunta al usuario? (BUG-06)
3. ¿Se necesita poder **vaciar un campo** de un registro existente, o basta con editar o borrar el registro completo? (BUG-08)
4. ¿La importación debe **reemplazar** todo, como ahora, o también **fusionar** con los datos existentes? ¿Qué hacemos con las fotos si la importación falla a medias? (BUG-14)
5. ¿Qué mensaje y qué recuperación esperamos si el almacenamiento queda corrupto: botón de «restablecer» visible incluso con error de render?

**@Arquitecto**
1. Propongo una capa `validateState()` / esquema (sin dependencias) usada en `load()` y en la importación, con normalización de tipos. ¿Te parece bien, y dónde la ubicamos (`calc.js` o un nuevo `store.js` testeable en Node)?
2. ¿Migramos el render de `innerHTML` + plantillas a helpers con `textContent`/`createElement`, o mantenemos las plantillas con escape obligatorio y una regla de lint?
3. `app.js` es un IIFE de 665 líneas que no se puede importar en Node. ¿Lo extraemos en módulos (estado, import/export, fechas) para poder probarlo, manteniendo «sin build»?
4. ¿Añadimos Playwright como `devDependency` y un job de E2E en `pages.yml` antes del deploy? (Chromium está disponible en el entorno.)
5. Service worker: ¿generamos `CACHE` a partir de un hash o una versión de `package.json`, y filtramos `res.ok` y el mismo origen? (OBS-01)
