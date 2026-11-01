# Estado del proyecto (traspaso, 31-oct-2026)

Leer esto primero en una conversación nueva. Hablar con José (contador, no técnico, usa iPhone) en español sencillo y breve. Ahorrar tokens: leer por partes, no re-explorar el repo.

## Publicado (main, SQL v1.15 aplicado en Pruebas)
PRs #32–#38: etapas 1-2, estilo v2, aviso de dolor, metas, analítica coach, panel admin, Excel + política v1.2, puntos + meta del team + estados sin kg.

## En curso: insignias diseño B (esta rama)
- Commit 903d2be (17 logros en 6 categorías) + «WIP pruebas insignias» (pruebas e2e ajustadas, SIN verificar).
- Faltan 2 de las 19 del diseño (ver equipo/diseno/v4-insignias/gamificacion.md): averiguar cuáles y por qué.
- Pendiente: terminar, correr pruebas, PR, y juntar solo con aprobación de José.
- Pruebas: `npm test`; `PGOPTIONS='-c qa.strict=on' npm run test:db`; `CI=1 PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers E2E_PORT=4517 npm run test:e2e`; `npm run build:site`. s2-1-qa ✘ es esperado; s5-qr, s11-fotos, s13-comidas a veces fallan por carga. Luego: `git checkout -- equipo/qa-capturas; git clean -fdq equipo/qa-capturas; rm -rf test-results`.
- SQL: migración en supabase/migrations/ + `npm run build:db` → supabase/r1.sql. José lo pega en Supabase y confirma «OK r1 v1» antes de juntar.

## Frenado / pendiente de terceros
- Ligas: construidas en la rama claude/piloto-funciones (equipo/handoffs/liga-semanal.md); abogado aprobó todo (concepto 8, cláusula 16 incluida); falta que José pegue la migración v1.17 (20261104120000_r1_liga_premios.sql) y probar en iPhone.
- Alertas L6 apagadas (`ALERTS_FILTER = false`) hasta que nutricionista/médico valide umbrales.
- Abogado: frase de la meta del team en la política. José: fecha de vigencia de la política.

## Reglas que no se rompen
- Juntar a main solo con aprobación explícita de José, CI verde y SQL confirmado.
- Nada de ranking ni orden por kg/cm; puntos e insignias nunca por peso, cm, kcal ni fotos.
- Textos legales literales (equipo/legal/, tests/legal-literal.test.js). La app no prescribe.
- No cambiar config.js. No pedir claves ni cargar datos de salud reales.

## 2026-11-01 · Conexión a `plataforma` (rama `claude/conectar-plataforma`, sin juntar)
- Hecho: SQL v1.17 aplicado en plataforma («OK r1 v1»); Brevo por SMTP probado (código de 6 dígitos llegó); DPA de Supabase y Brevo aceptados; textos legales definitivos del abogado (Política 1.2, Términos 1.0); URL y clave publicable en `config.js`; pruebas en verde.
- Falta: aprobación explícita de José para el merge; prueba en iPhone real (`equipo/prueba-iphone.md`) y prueba de humo con cuenta nueva; captcha (Turnstile) al final, en el orden de `equipo/handoffs/captcha-turnstile.md`; actualizar `[ENLACE DE LA APP]` en los instructivos.
