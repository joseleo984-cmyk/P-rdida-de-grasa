# Copia de pruebas (/pruebas/) — Dev a QA — 2026-10-22

## Qué cambió
- **`ns.js` (nuevo, `window.PGNS`)**: único punto de nombres de almacenamiento por entorno. `config.js` ahora admite `env` (`''` por defecto).
  Con `env` vacío todo queda IGUAL que antes (`perdida-grasa:v1`, `:backup`, `:owner`, `:lastBackup`, `:backupSnooze`, `:sync`, `:comments`,
  `:account`, IndexedDB `perdida-grasa`, caché del SW `perdida-grasa-vN`): sin migraciones. Con `env='pruebas'`: `perdida-grasa-pruebas:*`,
  IndexedDB `perdida-grasa-pruebas`, caché `perdida-grasa-pruebas-vN`.
- `index.html` carga ahora `config.js` y `ns.js` PRIMERO (antes `config.js` iba al final). `app.js`, `photos.js`, `account.js`, `coach-panel.js` usan `PGNS`.
- **`sw.js`**: `importScripts('config.js','ns.js')`; `CACHE = PGNS.cacheName(20)` (subido de v19 a v20); `activate` solo borra cachés de SU prefijo
  (la raíz no borra las de pruebas ni al revés). Registrado con ruta relativa: scope propio (`/…/pruebas/`).
- **Banner fijo** "VERSIÓN DE PRUEBAS — no uses datos reales" (`#env-banner`, `role="note"`) solo con `env='pruebas'`.
- **`scripts/build-site.js`** (`npm run build:site`, opción `--out dir`): arma `_site/` (raíz) y `_site/pruebas/` (config desde `config.pruebas.js`,
  `noindex,nofollow` en su index.html, manifest propio, `robots.txt` con `Disallow: /P-rdida-de-grasa/pruebas/`). Se niega si la clave no empieza
  por `sb_publishable_` o si hay `sb_secret_`/`service_role`; comprueba que existan todos los archivos que cargan index.html y precachea sw.js.
- `.github/workflows/pages.yml` usa `npm run build:site` (conserva `npm test` previo). `ci.yml` no necesita cambios. `_site/` en `.gitignore`.
- Tests ajustados (justificado): `tests/legal.test.js`, `tests/vendor.test.js` y `equipo/qa/qa-s1-1.js` comprobaban el `cp` dentro de pages.yml o el literal
  `CACHE='perdida-grasa-vN'`; ahora comprueban `build-site.js` y `PGNS.cacheName(N)`.
- Tests nuevos: `tests/site.test.js` (raíz sin URL/clave de pruebas, pruebas con URL correcta, sin claves secretas, PGNS) y
  `tests/e2e/site-pruebas.spec.js` (claves de producción intactas + respaldo v1, aislamiento raíz/pruebas en el mismo contexto, banner solo en pruebas,
  dos SW conviven sin borrarse cachés).

## Construir y servir en local
```
npm run build:site
npx --yes http-server -c-1 -p 8081 _site      # raíz: http://127.0.0.1:8081/   pruebas: http://127.0.0.1:8081/pruebas/
```
(Local no tiene el prefijo `/P-rdida-de-grasa/`; solo importa en `robots.txt`.) Para el teléfono: abrir
https://joseleo984-cmyk.github.io/P-rdida-de-grasa/pruebas/ tras el despliegue de main (o servir `_site` en la red local; el login por correo
necesita HTTPS/URL permitida en Supabase). Se puede "Añadir a pantalla de inicio": instala "Pérdida de Grasa (pruebas)", aparte de la oficial.

## Resultados
`npm test` 125 verdes + nuevos; E2E completa en verde (la prueba de legal `s2-1-qa:127` falló una vez en paralelo y pasó sola, también en el código
anterior: intermitente ajena); `node equipo/qa/run-all.js` 8/8. `test:db` no se tocó (sin cambios de SQL).

## Riesgo residual
- Registro abierto en la copia de pruebas: cualquiera con la URL puede pedir códigos de acceso por correo → posible abuso del envío de códigos
  (límite de correos de Supabase). Mitigado solo con `noindex`/`robots.txt` (no es control de acceso). El Stakeholder lo conoce.
- Raíz y pruebas comparten origen: otro código en ese origen vería ambos almacenamientos; los datos NO se mezclan por nombres, no por aislamiento duro.
- El sufijo de caché sube con `CACHE` en sw.js: al subirlo hay que cambiar solo `PGNS.cacheName(N)`.
