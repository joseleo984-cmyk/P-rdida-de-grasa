# Procedimiento: conectar la app oficial al proyecto Supabase `plataforma`

**Estado hoy (2026-10-23):** la app oficial NO está conectada: `config.js` está vacío (solo local). **No ejecutar nada de este documento hasta que el abogado apruebe los textos** (`equipo/legal/paquete-abogado.md`, `preasesoria-legal.md`: piloto cerrado de 2 coaches y ~10 adultos conocidos). Este procedimiento es para revisarlo ahora y ejecutarlo luego, en una sola PR.

Quién: **SH** = Stakeholder (José), **EQ** = equipo (Dev). Regla: nada de claves secretas en el repositorio; solo la URL y la clave **publicable** (`sb_publishable_…`).

## 0. Antes de tocar el código (SH)
0. **(Sprint 8, bloqueante P18) Documentos archivados y firmados ANTES de conectar:**
   - **DPA de Supabase** aceptado y archivado (copia con fecha).
   - **DPA estándar de Brevo** aceptado y archivado.
   - **Acuerdo del coach firmado** (por escrito o con firma electrónica) **con los 2 coaches del piloto**, en su versión v0.3 (con cláusula penal; el abogado valida antes la cuantía y la exigibilidad).
   - Ver `equipo/legal/respuestas-abogado.md`. Mientras falte uno, **no se conecta**.
1. El abogado aprobó por escrito: Términos y Condiciones, Política de Tratamiento de Datos, autorizaciones A1–A8 y Acuerdo del coach, y fijó los «por confirmar» de `legal/plan-incidentes.md` (canal de la SIC y confirmación de los 15 días hábiles). Quien firme debe ser un abogado colombiano: las respuestas del 2026-10-22 valen como segunda preasesoría hasta entonces.
2. En `plataforma`: aplicado el **`supabase/r1.sql` más reciente (r1 v1.5, migración `20261023120000`)** y visto `OK r1 v1`. Si `plataforma` ya tenía r1.sql anterior, se vuelve a pegar entero (es idempotente). Repetir la consulta de comprobación (5 filas) de `checklist-antes-de-abrir.md` §2.
3. SH da al EQ la **URL** (`https://<ref>.supabase.co`) y la **clave publicable** de `plataforma`. La clave secreta NO se comparte.
4. SH tiene a mano la URL de `pruebas` solo para NO confundirlas: `check:conexion` rechaza la de pruebas.

## 1. Archivos que se cambian (EQ, en una rama nueva)
| Archivo | Cambio |
|---|---|
| `config.js` | `url` y `key` de `plataforma` (`env: ''`, `mode: 'real'`). **Hoy NO se toca.** Sprint 9: si se usa captcha, añadir también `captchaSiteKey: '0x4…'` (clave PÚBLICA del widget `plataforma`; `check:conexion` valida su forma y rechaza claves secretas y las de prueba de Cloudflare). **Orden:** primero esta PR publicada, después encender el captcha en Supabase `plataforma` (`equipo/handoffs/captcha-turnstile.md`). La raíz nunca lleva la site key de `pruebas`. |
| `equipo/legal/terminos-y-condiciones.md` y `equipo/legal/politica-tratamiento-datos.md` | Texto aprobado v1.0: `**Versión:** 1.0`, rellenar fecha de vigencia y datos del responsable (`[FECHA DE VIGENCIA]`, `[NOMBRE COMPLETO DEL RESPONSABLE]`, `[CIUDAD]`, etc.), **quitar la palabra «borrador» de las 5 primeras líneas** (`scripts/build-legal.js → isDraft` mira ahí; si queda, la página sigue mostrando «Borrador pendiente de revisión legal»). Se parte de `equipo/legal/borradores/*-v0.3-cuentas.md` ajustados por el abogado. Los T&C deben seguir avisando que en el piloto **no hay copias de seguridad automáticas**. |
| `legal/terminos.html`, `legal/privacidad.html` | **No se editan a mano**: se regeneran con `npm run legal`. |
| `schema.js` | `LEGAL_VERSIONS = { terms: '1.0', privacy: '1.0' }` (obliga a todos a aceptar de nuevo). |
| `app.js` | `LEGAL_CHANGES` con el resumen del cambio de la versión 1.0 (lo que ve quien re-acepta). |
| `consent-texts.js` | Ajustar los textos A1–A8 con lo que diga el abogado y **subir la versión de cada texto que cambie** (`0.2-A1` → `1.0-A1`, `0.3-A3` → `1.0-A3`, etc.; A5 `compartir-2` → `compartir-3` si cambia). Las redacciones de A3 y A4 ya son las aprobadas el 2026-10-22 (v0.3). `AGREEMENT` hoy apunta a `legal/privacidad.html`: apuntarlo a la página del Acuerdo del coach cuando exista. Cambia la huella (SHA-256 del texto exacto): es lo esperado. |
| `sw.js` | Subir `CACHE` (`PGNS.cacheName(N)` → `N+1`) para que los teléfonos se actualicen. Si se crea una página legal nueva, añadirla a `ASSETS` y a `scripts/build-site.js` (`DIRS` ya copia `legal/`). |
| `tests/consent-texts.test.js` | La prueba «no se suben hasta que el abogado apruebe» (`assert.strictEqual(Schema.LEGAL_VERSIONS.terms, '0.1')`) y los `legalVersion: '0.1'` se actualizan a 1.0. |
| `tests/e2e/s2-1-qa.spec.js` | Quitar `test.fail(true, …)` de «textos legales sin marcadores por rellenar»: al estar los textos completos ese test pasa y Playwright lo reportaría como fallo. |
| `tests/e2e/site-pruebas.spec.js` | Subir la versión de caché esperada (`perdida-grasa-v…` en las 2 comprobaciones de caché que leen `sw.js`; `PGNS.cacheName(28)` de la línea de ns es un argumento propio y no cambia). |
| `equipo/checklist-antes-de-abrir.md`, `equipo/tablero.md` | Marcar lo hecho. |

**No se toca:** `config.pruebas.js` (la copia de `/pruebas/` sigue apuntando al proyecto `pruebas`), `supabase/*` (la BD ya se aplicó en el paso 0), `vendor/`.

## 2. Pruebas a correr (EQ), todas en verde antes de abrir la PR
```
npm run legal                                   # regenera legal/*.html desde los .md v1.0
npm run check:conexion                          # SIN RED: config.js bien formado y legal/*.html sin pendientes
npm test
PGOPTIONS='-c qa.strict=on' npm run test:db
CI=1 PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers E2E_PORT=4810 npm run test:e2e
node equipo/qa/run-all.js
npm run build:site
```
`check:conexion` (`scripts/check-conexion.js`) verifica: `url` = `https://<ref>.supabase.co` sin ruta; `key` empieza por `sb_publishable_`; no aparece `sb_secret_` ni `service_role` en `config.js`; `env` vacío y `mode` `real`; la URL no es la de `pruebas`; y en `legal/*.html` no queda ningún marcador `[MAYÚSCULAS]` ni el aviso de borrador. No imprime la clave completa. **Todavía no está en CI obligatorio** (con `config.js` vacío fallaría a propósito); se añade a CI cuando se conecte.

Además, a mano:
- `npm run build:site` y revisar con `grep -rE "sb_secret_|service_role" _site --exclude-dir=vendor` (sin resultados). **Regla:** la raíz del sitio (`_site/`) lleva la URL y clave de `plataforma` (es lo que se quiere), pero **nunca** la URL ni la clave de `pruebas` (`tests/site.test.js` lo comprueba) ni claves secretas; `/pruebas/` conserva `pruebas`. Si `tests/site.test.js` falla porque la raíz ahora tiene URL, la prueba «config.js sigue vacío» (`site.test.js` y `tests/` con «config.js sigue vacío en el repo») se **actualiza a propósito** en esta PR para exigir el formato de `check:conexion` en vez de vacío.
- `npm run smoke:remote` y `scripts/qa-live-rls.js` / `qa-live-recheck.js` contra `plataforma` con cuentas de prueba nuevas (variables de entorno, ver cabecera de cada script; el primero deja a la cuenta B borrada). Deben mostrar las comprobaciones del Sprint 7 (a2: consentimientos exigidos por el servidor).
- Prueba en iPhone real con `equipo/prueba-iphone.md` **sobre `/pruebas/`** antes de abrir la oficial, y otra vez sobre la oficial al final.

## 3. Orden de despliegue
1. PR a `main` con los cambios del §1 y CI en verde (el despliegue de GitHub Pages corre `npm test` y `npm run build:site` desde `main`: `.github/workflows/pages.yml`).
2. Merge. Esperar a que termine «Publicar en GitHub Pages».
3. Verificar en el teléfono de SH: abrir la app oficial (la primera vez puede pedir actualizar: cerrar y abrir), debe pedir aceptar los textos v1.0.
4. Prueba de humo con una cuenta nueva real (código por correo de Brevo): registrar, aceptar A1–A4, crear coach con A7, enlace de invitación, vincular cliente.
5. Solo entonces SH invita a los 2 coaches (y ellos a sus ~10 clientes).

## 4. Reversa (si algo sale mal)
Objetivo: la app vuelve a funcionar solo en cada teléfono, sin hablar con el servidor, en minutos y sin perder datos locales.
1. (Si el captcha estaba encendido: **primero** apagarlo en Supabase `plataforma`, Authentication → Attack Protection.) EQ: PR que deja `config.js` **vacío** otra vez: `url: ''`, `key: ''`, `captchaSiteKey` vacía (`env: ''`, `mode: 'real'`). Comprobar con `node scripts/check-conexion.js --vacio` (debe decir «todo en orden (reversa)»).
2. Subir `CACHE` de `sw.js` en esa misma PR para que los teléfonos descarguen la versión vacía.
3. Merge y esperar el despliegue. Los teléfonos con la cuenta guardada siguen con sus datos locales; la nube queda apagada.
4. Si el problema es de seguridad: seguir `equipo/legal/plan-incidentes.md` en paralelo (pausar registros, rotar claves).
5. Los consentimientos y datos ya en `plataforma` no se borran con la reversa; se tratan según el plan de incidentes y el abogado.

## 5. Riesgos y notas
- Subir `LEGAL_VERSIONS` hace que **todas** las personas vuelvan a aceptar; a quienes ya tenían cuenta de pruebas no les afecta (otro proyecto y otro almacenamiento).
- El servidor exige A3 + A4 (clientes) y A7 (coaches) **sin mirar la versión**; la app es la que pide aceptar de nuevo cuando cambia una versión. Un cliente que no re-acepta por versión puede seguir sincronizando en el servidor mientras la app no lo bloquee (la app sí lo bloquea localmente).
- El Acuerdo del coach aún no tiene página propia: hasta que exista, el enlace «Leer acuerdo completo» abre la política.
