# M6 «Exportar a Excel» del coach + Política v1.1 con su aviso — producto «coach» (rama `claude/exportar-excel`)

Construye el boceto aprobado `equipo/diseno/v3-analitica-admin/M6-exportar-excel.png` con los textos LITERALES del **concepto jurídico 6** (`equipo/legal/concepto-6-2026-10-25.md`: cláusula del acuerdo, párrafo de la política, casilla y respuesta del abogado) y, porque el abogado lo exige para habilitar la descarga, la **Política v1.1 con su aviso en pantalla** (concepto 2, anexo puntos 1 y 4).
`config.js` no cambia. La pantalla solo existe en el producto coach (copia de pruebas y demo). Caché del SW **v53**.

## SQL que hay que pegar: `supabase/r1.sql` = r1 v1.14

Migración nueva `supabase/migrations/20261101120000_r1_exportar_excel.sql`, aditiva e idempotente encima de v1.13. Contrato: `equipo/r1-contrato.md` §23.
Pruebas: `supabase/tests/180_exportar_excel.test.sql` (nueva, 37 comprobaciones), conteo de tablas de `10_estructura` (27), lista blanca de `60_qa_seguridad` y claves de `admin_coach_usage` en `170`.
Pegar primero en **pruebas** (debe terminar con `OK r1 v1`) y, validado, en **plataforma**. **Antes de publicar la app**: con la app nueva y el SQL viejo, «Descargar Excel» da un error amable y no descarga nada.

- `grasa.coach_exports`: una fila por exportación con quién (coach), cuándo, **cuántos** asesorados (un número, nunca quiénes), categorías (`medidas`, `comidas`, `habitos`, `entrenos`), rango de fechas, `custody_ack` (CHECK: siempre true) y la versión del acuerdo. **Nunca contenido.** RLS sin políticas y `revoke all`: nadie la lee ni escribe por la API de tablas.
- `grasa.log_export(p_clients, p_categories, p_from, p_to, p_custody)`: coach ACTIVO, con acuerdo y cuya **última** aceptación del acuerdo es una versión con la cláusula 14 (`0.5-A7-coach`; si no, `forbidden` con detail `export_agreement_required`); casilla marcada (si no, `invalid`/`custody_required`); 1 ≤ asesorados ≤ vinculados visibles; categorías conocidas (las fotos no existen como categoría); rango válido; máximo 60 por coach y día.
- `grasa.my_exports()`: el historial del propio coach (50 últimas). Un asesorado o un admin que no es coach: `forbidden`.
- `grasa.admin_coach_usage` (M9) añade `exports` = **cuántas** exportaciones hizo ese coach en el mes. Solo la cantidad; la pantalla M9 la muestra en una tarjeta «Exportaciones a Excel».
- Todas SECURITY DEFINER con `search_path = ''`, `revoke` de `public, anon, authenticated, service_role` y `grant execute` solo a `authenticated` en las dos RPC (y `admin_coach_usage`). Las internas (`export_agreement_of`, `export_agreement_versions`) no se ejecutan por la API. Nada para `anon` (prueba de BD).

## Hecho

1. **Pantalla Más → «Exportar a Excel»** (solo coach), tal cual el boceto: 1 · Asesorados (avatares de iniciales que se eligen uno a uno, «Todos (N)», resumen «6 elegidos · Ana, Beto…»); 2 · Fechas (Este mes · Últimos 3 meses · Todo, y Desde/Hasta); 3 · Qué datos (Medidas, Comidas, Hábitos, Entrenos; **Fotos desactivada con «no se exportan»**); la casilla; «⬇ Descargar Excel»; debajo, **«Tus exportaciones»** (historial propio: fecha y hora, cuántos asesorados, qué datos y qué fechas).
2. **Casilla LITERAL antes de CADA descarga** (concepto 5 punto 3 / concepto 6): «Asumo la custodia y confidencialidad de estos datos conforme a la Ley 1581 de 2012 como responsable independiente.» Sin marcarla el botón está desactivado (y se dice «Marca la casilla de custodia para descargar.»); después de cada descarga se desmarca sola.
3. **Cláusula 14 del acuerdo del coach** (LITERAL; «[Número]» = 14, la siguiente libre tras la 13): «Cláusula 14. Descarga y custodia local de datos de los asesorados» + el párrafo aprobado. Está en el A7 de la app (`consent-texts-solo.js` → `TEXTS.A7.clauseExport`, se ve en la entrada del coach, en la puerta de Asesorados/Invitar y en la hoja de la primera exportación), en `equipo/legal/borradores/acuerdo-coach.md` (§14) y en la función de correo (`npm run build:funcion` regeneró `textos-acuerdo.mjs` y `pegar-en-el-panel.ts`: **hay que volver a desplegar la función `acuerdo-coach-copia`** para que la copia por correo conozca la 0.5).
   - **Versión del acuerdo: 0.5-A7-coach.** La 0.4-A7-coach queda EXACTA en `A7_PAST` (para «Mi acuerdo» y la copia por correo).
   - **Sin re-aceptación forzada para el resto de la app:** `coachAgreementOK` acepta 0.4 y 0.5 (`CT.A7_STILL_VALID`); `exportAgreementOK` solo 0.5 (`CT.A7_EXPORT_VERSIONS`). El servidor no miraba la versión del acuerdo para el resto de funciones (no cambia).
   - **La PRIMERA vez que exporta** con la 0.4: hoja «Antes de tu primera descarga» con la cláusula 14 completa, el resto del acuerdo desplegable y la casilla «Acepto el Acuerdo del coach.». Al aceptar se registra en el servidor como cualquier consentimiento (`core.consent_events`: `coach_agreement`, versión, SHA-256 del texto completo mostrado, fecha del teléfono y del servidor; `account.js → acceptCoachAgreement`, que además pide la copia por correo) y sigue la descarga. Cancelar no descarga ni registra nada.
   - «Mi acuerdo» con la 0.4: muestra el texto aceptado y explica que la versión nueva se pedirá solo la primera vez que exporte (sin botón de re-aceptar). Quien venía de la 0.3 sí debe aceptar (la 0.5) como antes.
4. **Registro de cada exportación** (`grasa.log_export`) ANTES de entregar el archivo: si no se puede registrar (sin conexión, SQL viejo, acuerdo, límite), **no se descarga nada** y se dice por qué.
5. **Política v1.1** (`legal/privacidad.html`, generada de `equipo/legal/politica-tratamiento-datos.md` con `npm run legal`):
   - Versión **1.1** (antes 0.1) con fila en el historial. Ya traía la adenda §6 y §7.1 del concepto 1 (se conserva; la prueba exige que aparezca una sola vez).
   - **Finalidad 4.5** (L6d, anexo 4 del concepto 2, literal; «[Finalidad X.X]» → 4.5, la siguiente de §4).
   - **§6.5 «Copias de trabajo que descarga tu coach»** con el párrafo literal del concepto 6, en la sección «¿Con quién compartimos tus datos?».
   - El borrador con cuentas (`borradores/politica-tratamiento-datos-v0.3-cuentas.md`) recibe los mismos textos (Finalidad 4.8 y §7.1.1).
   - No hay otra copia de la política dentro de la app: todos los enlaces abren `legal/privacidad.html`.
6. **`legal/VERSIONS.json` (nuevo, fuente única de las versiones PUBLICADAS)**: términos 0.1; política 1.1, publicada el 25/10/2026, `acceptedStillValid: ["0.1"]` y `notice: { id: "politica-1.1", active: true }`. El SW lo precachea. `tests/legal.test.js` exige que coincida con los `.md`, con `Schema.LEGAL_VERSIONS` y con `Schema.LEGAL_COMPAT`.
   - `Schema.LEGAL_VERSIONS.privacy` = '1.1' y **`LEGAL_COMPAT.privacy = ['0.1']`**: quien aceptó la 0.1 sigue vigente (el abogado: sin re-aceptación forzada si no cambian finalidades sustanciales). Las aceptaciones nuevas guardan 1.1. Efecto visible: la casilla A2 dice ahora «(versión 0.1 / 1.1)» (términos / política), con la fórmula de siempre.
7. **Aviso v1.1** (`aviso-politica.js`): texto y botón LITERALES del anexo 1 del concepto 2 («… Conócela aquí» con **«aquí» enlazado a `legal/privacidad.html`** en lugar del marcador «[enlace]»; botón «Entendido»). Sale una vez al iniciar sesión, para asesorados y coaches; va en el flujo de la página (arriba del contenido, no flota ni tapa nada) y no pide re-aceptar.
   - **Dónde se recuerda: en el dispositivo** (`localStorage`, por cuenta y por id del aviso). No hay en el servidor un patrón de «avisos vistos»: `core.consent_events` es para autorizaciones, su tipo está cerrado por un CHECK y registrar ahí «visto» sería anotar un consentimiento que el abogado dijo que no hace falta. Consecuencia aceptada: en otro teléfono la persona lo ve una vez más.
8. **Habilitación del botón ligada a `VERSIONS.json`**: `Exportar.policyGate(versions)` exige política ≥ 1.1 **y** aviso activo; si no, el botón queda desactivado con el motivo («La descarga se habilita cuando esté publicada la Política de Tratamiento de Datos v1.1 y su aviso a los asesorados esté activo. Hoy está publicada la v1.0.»). Prueba unitaria y E2E (con 1.0, con el aviso apagado y con el archivo real).
9. **Archivo .xlsx** (`exportar.js`, sin dependencias ni CDN): generador mínimo propio (ZIP sin compresión con CRC-32 + SpreadsheetML con tabla de cadenas compartidas). Hojas **Leame** (rango, fecha de generación, cuántos asesorados, qué datos, «Fotos: No se exportan.», la frase de custodia, qué no incluye y quién no comparte hábitos o comidas) · **Medidas** · **Comidas** · **Hábitos** · **Entrenos** (solo las elegidas), cada fila con **Asesorado** y **Fecha** (fecha real con formato aaaa-mm-dd), encabezado en negrita y fijo. Nombre `exportacion-AAAA-MM-DD.xlsx`.
   - **Fórmulas:** todo texto va como cadena (nunca `<f>`); además lo que empieza con `=`, `+`, `-`, `@`, tab o retorno lleva estilo texto (`@`) con `quotePrefix` (el apóstrofo de Excel).
   - **Descarga:** Blob + `a[download]`; si falla, o en la PWA instalada de iPhone (donde `a[download]` no siempre guarda), la hoja de compartir (`navigator.share` con `files`). Tras descargar aparece «Compartir el archivo» si el sistema lo permite.
   - Validado además con **openpyxl** y **LibreOffice** (abre y convierte; tipos, fechas y `quotePrefix` correctos).
10. **Demo** (`?rol=coach`): funciona con los datos ficticios (servidor falso: `logExport`, `exports`, `admin.coachUsage().exports`); trae sembrada una exportación anterior en el historial. E2E en `s15-demo`.
11. **Infra:** `sw.js` → caché **v53** con `exportar.js`, `exportar-view.js`, `aviso-politica.js` y `legal/VERSIONS.json`; `scripts/build-site.js`, `tests/site.test.js` y `tests/e2e/site-pruebas.spec.js` al día.

## Cómo se garantiza que no se exporta nada que el coach no pueda ver

1. **Los datos salen de `coach_pull`** (la misma RPC de la ficha), uno por asesorado elegido, en el momento de exportar: vínculo activo, coach activo con acuerdo, A3 + A4 del asesorado, comidas solo con `share_nutrition`, hábitos (y entrenos, que viven en el hábito del día) solo con `share_habits`, nota solo con `share_notes`, **nunca filas `pause_private`**, nunca biblioteca. Las fotos no se piden (y aunque viajaran, no se leen). Las respuestas de salud L4 y los avisos de dolor viven en tablas que `coach_pull` no toca. Si alguien dejó de compartir entre medias, `forbidden` → se omite.
2. **Filtro en el teléfono** (`Exportar.visibleRecords`, defensa en profundidad y probado): descarta lápidas, `pausePrivate`/`pause_private`, perfil, biblioteca, comidas sin `shares.nutrition` y hábitos sin `shares.habits`; y cada hoja copia solo una **lista blanca** de campos (peso y perímetros; nombre, tipo, hora, porción y macros de la comida; agua, pasos, sueño y cierre del día; entrenó y esfuerzo). Cualquier campo nuevo o desconocido no sale.
3. **El servidor no recibe ni guarda contenido**: solo cuántos, categorías, rango y la casilla.
4. Pruebas: BD (`180`: hábitos de quien no comparte, nota sin `share_notes`, pausa privada y fotos con `coach_pull`), unitarias (`tests/exportar.test.js`) y E2E (`m6-exportar`: el .xlsx descargado se abre y no trae los hábitos de Beto, ni el pesaje y el entreno de la pausa de Carla, ni fotos).

## Decisiones

- **Generador propio en vez de librería**: un XLSX mínimo son ~200 líneas sin dependencias; así no hay CDN, ni licencia que revisar, ni 1 MB de código. ZIP sin compresión (válido en el estándar; los archivos son pequeños).
- **Entrenos** = los días con «Entrené» del hábito del día (y su esfuerzo). El boceto decía «rutina, esfuerzo», pero la rutina no se guarda en el registro del asesorado: el subtítulo dice «días, esfuerzo» para no prometer lo que no está.
- **«Todo»** = desde el primer día de vínculo del asesorado más antiguo (como máximo 5 años).
- **Admin**: solo la cantidad de exportaciones del mes por coach (M9). Nunca quién, qué asesorados ni qué datos.
- **Límite** de 60 exportaciones por coach y día (evita abusos sin estorbar el uso normal).
- El acuerdo se compara por versión en el servidor (`export_agreement_versions()`), no por huella: la huella se guarda en el evento y la prueba de BD y la E2E la comprueban.

## Pendientes

- **Desplegar de nuevo la función de borde `acuerdo-coach-copia`** (`pegar-en-el-panel.ts` o `supabase functions deploy`) para que la copia por correo de la 0.5 funcione; sin eso, aceptar la 0.5 queda registrado igual y «Mi acuerdo» permite descargar la copia.
- La política publicada sigue con el aviso «Borrador pendiente de revisión legal» y el marcador `[FECHA DE VIGENCIA]` (lo pone el responsable). Si la v1.1 ya es definitiva, quitar la cabecera de borrador del `.md` y poner la fecha.
- Sigue apagado (Etapa 3): las alertas L6, la tarjeta 106/192 y las cláusulas 7.3/7.4. La política solo describe la finalidad L6d (prueba que ninguna vista muestra alertas ni la tarjeta).
- El aviso v1.1 se recuerda por dispositivo (ver arriba). Si se quiere «una vez por cuenta en todos los teléfonos», hace falta una tabla de avisos vistos (SQL nuevo).
- No hay retención/borrado automático de `grasa.coach_exports` (se borra con la cuenta del coach). Decidir si se purga a los N meses.

## Lo que no se probó

- **iPhone real**: abrir el .xlsx en Excel de iPhone y en Numbers; la descarga desde Safari y desde la PWA instalada (la hoja de compartir con `files`); letra grande de iOS y VoiceOver en la pantalla y en la hoja de la cláusula. Se validó con openpyxl y LibreOffice, no con Excel ni Numbers ni Google Sheets reales.
- SQL contra un Supabase real (solo PostgreSQL 16 local con el stub de `test:db`). Repetir en pruebas: aceptar la 0.5 la primera vez, exportar, ver el historial y el conteo en M9.
- La caché v53 reemplazando a la v52 en una PWA instalada.
- La copia del acuerdo 0.5 por correo (requiere desplegar la función).
