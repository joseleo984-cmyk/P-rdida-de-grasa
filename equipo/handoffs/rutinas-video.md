# Etapa 2c: videos cortos como demostración de ejercicios (r1 v1.9)

Solo producto `coach`; la app OFICIAL no cambia (prueba E2E). Contrato: `equipo/r1-contrato.md` §18. Continúa `rutinas-etapa2.md` y `rutinas-v18.md`.

**Por qué:** un GIF real de gimnasio (720×1280, 157 cuadros) pesa ~16 MB y el tope era 3 MB. Decisión del dueño: admitir los **videos cortos que graba el celular del coach**, que se reproducen solos, en bucle y sin sonido, como un GIF. Los GIF/WebP de hasta 3 MB siguen igual.

## Qué se creó
- **Servidor:** `supabase/migrations/20261027120000_r1_rutinas_video.sql` (aditiva e idempotente; regenera `supabase/r1.sql`): tipos `video/mp4`, `video/quicktime`, `video/webm`; topes por tipo (GIF/WebP 3 MB, video 10 MB) en `register_gif` y en los checks de la tabla; firma de bytes de cada video en `gif_head_ok`; bucket `ejercicios` a 10 MB con los 5 tipos. Políticas, RLS, `my_gifs`, `delete_gif` (en uso), etc. sin cambios; los parámetros de las funciones no cambian.
- **App:** `rutinas.js` (`checkGif` con videos, `checkDuration`, `ACCEPT`, `isVideo`, límites), `rutinas-view.js` (revisión de duración con un `<video>` temporal, vista previa y «Mi rutina» con `<video muted loop playsinline autoplay>`, etiqueta «▶ Video» / «GIF» / «WebP» en la biblioteca, «(video)» en el selector de ejercicio), `index.html` (texto de ayuda y `accept`), `styles.css`, `remote.js` (solo comentarios) y `remote-fake.js` (sin cambios: ambos validan con `rutinas.js` y el falso ya guardaba los bytes, así que el contrato es el mismo), `sw.js` (caché v39), `tests/e2e/site-pruebas.spec.js`.
- **Coach:** «Mis animaciones» (dentro del editor de rutinas): «Sube un video corto (hasta 15 segundos y 10 MB) o un GIF liviano (hasta 3 MB)». Al elegir el archivo se revisa tipo, firma, peso y duración con mensajes en español; «Ver» muestra la vista previa (video en bucle o imagen).
- **Cliente:** «Mi rutina» y «Rutina de hoy»: al abrir un ejercicio con video se descarga con la URL firmada de 60 s como blob y se muestra en bucle, sin sonido; al cerrar se suelta el blob y se quita el `<video>`. Si el sistema impide arrancarlo solo (p. ej. ahorro de batería), aparecen los controles.
- El video **no se re-codifica ni se recorta**: se sube tal cual.

## Cómo aplicar r1 v1.9 (lo hace el dueño)
1. Supabase → SQL Editor → pegar **todo** `supabase/r1.sql` en el proyecto **`pruebas`**; debe terminar con una fila **`OK r1 v1`**. Es idempotente (se puede repetir). Después, igual en **`plataforma`**.
2. En Storage → bucket **`ejercicios`**: debe verse privado, **10 MB** y los 5 tipos (gif, webp, mp4, quicktime, webm). No hay que crear nada a mano.
3. Publicar la app (merge a `main`): la copia `/pruebas/` trae la caché v39.
Orden: el SQL va **antes** que la app. La app vieja sigue funcionando con el SQL nuevo (sigue subiendo GIF/WebP). La app nueva con el SQL viejo no puede subir videos (los rechaza `register_gif`).

## Reglas
- Tipos: GIF, WebP (≤ 3 MB) y MP4, MOV (QuickTime), WebM (≤ 10 MB). Duración ≤ 15 s (límite **blando**: solo la app lo comprueba).
- Firma de bytes (12 primeros): mp4 = «ftyp» en los bytes 4–7; mov = «ftyp» + marca `qt  `; webm = `1A45DFA3`. La app valida igual que la BD.
- Si el navegador no puede leer el video (códec no soportado) no se puede medir la duración y se rechaza con «No pudimos leer este video en tu navegador».

## Qué probar a mano en el iPad (`/pruebas/`) con un video REAL del celular del coach
- [ ] Coach: abrir un asesorado → «Crear una rutina nueva» → en «Mis animaciones» ver el texto «Sube un video corto (hasta 15 segundos y 10 MB) o un GIF liviano (hasta 3 MB)».
- [ ] Subir un video corto de la Fototeca del iPad (≤ 15 s, ≤ 10 MB; .mov del iPhone): debe aceptarse y quedar con la etiqueta «▶ Video». Tocar «Ver»: se mueve solo, en bucle y sin sonido.
- [ ] Subir uno de más de 15 s: «Ese video dura X s; el máximo son 15». Uno de más de 10 MB (p. ej. 4K de 10 s): «Ese video pesa X MB; el máximo es 10 MB».
- [ ] Subir un video grabado en **HEVC/4K o «Alta eficiencia»** y comprobar si se acepta, se ve y pesa menos de 10 MB (si la Fototeca lo convierte o no al elegirlo).
- [ ] Subir un PDF o una foto: «Ese tipo de archivo no sirve…». Subir un GIF de 4 MB: «pesa 4 MB; el máximo es 3 MB». Un GIF pequeño sigue funcionando y se ve como imagen.
- [ ] Asignar el video a un ejercicio (aparece «(video)» en la lista), guardar y reabrir.
- [ ] Cliente (otro teléfono/iPhone, Safari y la app instalada): Más → Mi rutina → abrir el ejercicio: el video arranca solo, en bucle, sin sonido y sin salir a pantalla completa; cerrar y reabrir funciona. Probar con el modo de **ahorro de batería** activado (deben aparecer controles) y sin conexión (mensaje y «Reintentar»).
- [ ] Un segundo cliente sin vínculo con ese coach no ve el video; el cliente en pausa por pago sí.
- [ ] Letra grande del iPad y modo oscuro: sin texto cortado ni desbordes; botones fáciles de tocar.
- [ ] Borrar un video en uso se niega; sin uso se borra.

## Pruebas (resultado de esta entrega)
`npm test` 309/309 (antes 302 en v1.8) · `PGOPTIONS='-c qa.strict=on' npm run test:db` 613 comprobaciones OK (antes 557; `130_rutinas_video.test.sql` nueva con 56) · E2E 206 pasadas (antes 203; 3 nuevas en `s12-rutinas.spec.js`) con 1 intermitente conocido en `s5-qr` que pasó al reintentar · `node equipo/qa/run-all.js` 9 suites en verde · `npm run build:site` OK.

## No verificado / límites
- **Supabase real:** SQL probado en PostgreSQL 16 local con el stub. No probado: Storage real (límite de 10 MB del bucket y lista de tipos), URL firmadas reales con video.
- **Reproducción:** solo se probó en Chromium (Playwright) con webm. **No** se probó en Safari iOS/iPadOS ni la reproducción de MP4/H.264, MOV o HEVC (Chromium de pruebas no los decodifica); las firmas mp4/mov se cubren con pruebas unitarias, del servidor falso y de la base. Un HEVC puede no reproducirse fuera de Safari/Apple.
- **Duración:** límite blando solo en la app; en la prueba E2E la duración de 20 s se simula (el webm de prueba dura menos de 1 s).
- Storage no mira bytes ni distingue tipos: el tope de 3 MB para GIF/WebP lo hace cumplir `register_gif` con el tamaño declarado. El nombre de archivo en Storage sigue terminando en `.gif` también para videos (para no tocar las políticas).
- Memoria: el video se baja entero a memoria como blob (hasta 10 MB) al abrir cada ejercicio; se suelta al cerrarlo.
