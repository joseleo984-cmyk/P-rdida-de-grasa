# Copia «Demo» de la app

## Qué es
Una tercera copia de la app, en `https://<usuario>.github.io/P-rdida-de-grasa/demo/`, para ver la app **llena**, mostrarla a un coach interesado y sacar capturas.
No se conecta a ningún servidor: corre con el servidor falso en memoria del navegador (`remote-fake.js`) y con datos 100 % ficticios
(coach «Coach Demo» / negocio «Fit Demo», 8 asesorados «Ana Demo»…«Hugo Demo», correos `…demo@example.com`). Un banner morado fijo dice
«DEMO — datos ficticios; nada se guarda en ningún servidor». Es el producto «coach» (igual que /pruebas/), sin login por correo, sin captcha y sin pantallas legales
(no registra consentimientos reales).

## Cómo se abre
- Pantalla de entrada con dos botones: **Ver como coach** y **Ver como asesorado** (Ana Demo). Debajo, un enlace para ver a un asesorado que no pagó (pantalla de pausa).
- Enlaces directos: `/demo/?rol=coach`, `/demo/?rol=asesorado`, `/demo/?rol=pausa`.
- Dentro, **Más → Cambiar de rol** vuelve a la entrada y **Más → Reiniciar demo** borra los cambios y vuelve a sembrar.
- Las fechas son relativas a hoy: al cambiar el día se vuelve a sembrar sola (mismos valores, fechas corridas).

## Qué hay
- 6 asesorados al día en pagos con vencimientos distintos, 1 «no pagó» (Diego) y 1 recién llegado casi sin datos (Hugo).
- Ana, Beto y Carla: ~10 semanas de peso/abdomen/cadera semanales y cuello, brazos, espalda, cintura y muslos cada 2 semanas (altibajos), hábitos de 4 semanas,
  comidas de 7 días del catálogo (platos.js, kcal = las del plato por su porción), fotos de progreso (siluetas dibujadas en canvas, nunca fotos reales).
- Coach: 3 plantillas («Pecho y tríceps», «Piernas», «Espalda y bíceps») con 4 animaciones GIF **generadas por código** (figuras de palitos), asignadas a algunos
  asesorados (una oculta), «Rutina de hoy» publicada, mensajes del coach, bitácora «Quién vio mis fotos», código de invitación `FTDM72` y su QR.

## Cómo está hecho
- `config.demo.js` → `/demo/config.js` (`env:'demo'`, `demo:true`, `producto:'coach'`, `soloNube:true`, sin url ni clave ni captcha). `scripts/build-site.js` valida que no lleve ninguna.
- `demo-data.js` (puro, probado en Node): plan de datos, GIF, siembra del servidor falso por la MISMA API de la app (`seed`, `localFor`).
- `demo.js` (navegador): solo actúa con `PG_CONFIG.demo === true`. Reemplaza `Remote.config()` (siempre modo falso, sin red), mete el servidor falso y su sesión
  en el almacenamiento `perdida-grasa-demo:*` (PGNS) y dibuja las fotos. Se inyecta en `/demo/index.html` justo antes de `account.js`. No se tocó `app.js`, `account.js` ni `remote.js`.
- `demo.css`: banner, pantalla de entrada, oculta «Cerrar sesión» / «Borrar cuenta».
- Solo `/demo/` lleva `remote-fake.js`, `demo-*.js` y `demo.css`; su `sw.js` los precachea (caché `perdida-grasa-demo-v47`). Raíz y /pruebas/ no tienen nada de esto (`tests/site.test.js`).
- localStorage, IndexedDB y caché del SW tienen otro nombre que la raíz y /pruebas/: no se mezclan.

## Cómo regenerar / cambiar los datos
Editar `demo-data.js` (PEOPLE, TEMPLATES, COACH_COMMENTS…) y `npm run build:site`. Probar: `node --test tests/demo-data.test.js`, `npx playwright test -c tests/e2e/playwright.config.js s15-demo`.
Para capturas: abrir `/demo/?rol=coach`. Si cambia `sw.js`/archivos, subir el número de caché en `sw.js`.

## Límites
- Todo vive en el navegador de quien mira; no hay nada compartido ni persistente entre dispositivos. Borrar datos del sitio la reinicia.
- El día «hoy» sigue la zona horaria del dispositivo; el panel del coach cuenta el día en hora de Bogotá, así que fuera de Colombia puede haber un día de diferencia en «Hoy».
- Las fotos son siluetas abstractas; los GIF son figuras de palitos (no demuestran técnica real).
- No probado en Safari iOS (solo Chromium móvil con Playwright). El SW de la demo no se probó offline.
- La demo es pública si se publica el sitio: no contiene datos reales, pero tampoco se enlaza desde la app oficial; robots.txt la excluye.
