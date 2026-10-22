DE: QA / Revisor → PARA: Dev Frontend (cc: Scrum Master, Dev Backend, Arquitecto, Analista)
HISTORIA: S3-2 (R1) · Crear cuenta / entrar con código de 6 dígitos, sesión y rol (merge `0630a2b`)
FECHA: 2026-10-21 · Entorno: `@playwright/test` 1.56.1, Chromium 1194, móvil 390x844, `E2E_PORT=4810`

## VEREDICTO: **APROBADO CON CONDICIONES**
**Sin configuración, la app publicada se comporta exactamente como antes.** Se probó sirviéndola bajo el origen real
`joseleo984-cmyk.github.io/P-rdida-de-grasa/`, también con `?remote=fake` y con un `config.js` publicado por error en
`mode: 'fake'`:
- no hay pantalla ni tarjeta de cuenta;
- **no se pide `remote-fake.js`**;
- no hay ninguna petición a otros orígenes;
- no se crea `pg-fake-backend`.

El flujo OTP, la sesión sin conexión, cerrar sesión, la accesibilidad a 390 px y el XSS en nombres están bien.

Condiciones:
- **D1** (bloquea S3-3): los consentimientos se envían sin `textHash`, así que con el servidor real fallarán siempre.
- **D2**: el modo falso usa una lista negra de hosts; debe ser una lista blanca.

## Pruebas
| Suite | Resultado |
|---|---|
| `npm test` | 71/71 OK (incluye `tests/remote-fake.test.js`) |
| `npm run test:e2e` | **93 passed**. Hay 3 `test.fail` esperados: S2-1 D2 y los nuevos S3-2 D1 y D2 |
| `tests/e2e/s3-2.spec.js` (Frontend) | 6/6 |
| **`tests/e2e/s3-2-qa.spec.js` (nuevo, QA)** | 8 casos: 6 en verde y 2 `test.fail` (D1, D2) |

Qué cubre `s3-2-qa.spec.js`:
1. **Producción simulada** con `page.route`, sirviendo la app bajo `https://joseleo984-cmyk.github.io/P-rdida-de-grasa/`
   y `?remote=fake`. `Remote.config()` es `null` y no hay pantalla ni tarjeta de cuenta. No se descarga
   `remote-fake.js`, no hay peticiones a otros orígenes y no se crea `pg-fake-backend`.
2. **`config.js` con `mode: 'fake'` en producción** (error humano al publicar): sigue sin cuentas.
3. **Otro host** (dominio propio o fork) con `?remote=fake` → D2.
4. **XSS**:
   - correo `<svg/onload=…>@x.co`, que la validación acepta porque no tiene espacios;
   - nombre comercial `<img onerror>`.
   Se muestran como texto en el paso del código, en «Listo», en Perfil → Cuenta, en la vista previa del cliente
   («Te vas a vincular con «…»») y en «Coach: …». No se ejecuta nada (todo va por `textContent`).
5. **Consentimientos al entrar**: se registran 4 eventos (`terms`, `privacy`, `adult`, `sensitive_health`) una sola
   vez; tras dos recargas no hay duplicados.
6. **`textHash` en los eventos** → D1.
7. **Cerrar sesión sin conexión**:
   - funciona;
   - los datos siguen;
   - al reabrir se vuelve a ofrecer la cuenta y «Ahora no» lleva a la app.
8. **SW v17** (con `serviceWorkers: 'allow'`): después de un `fetch` a `https://abc.supabase.co/...` con la página
   controlada por el SW, **ninguna caché** contiene URLs de otros orígenes. `CACHE` está en v17 o superior.

Revisado en el código y ya cubierto por `s3-2.spec.js`:
- orden pantalla legal → cuenta;
- foco en cada paso;
- errores con `role="alert"` asociados por `aria-describedby`;
- `autocomplete="one-time-code"` + `inputmode="numeric"`;
- reenvío bloqueado 60 s con cuenta atrás;
- «Usar otro correo»;
- sin conexión al pedir el código;
- sesión persistente tras recargar;
- coach → código → cliente vinculado con categorías **sin marcar** salvo `body`.

## Defectos
**D1 · Alto para S3-3 (no afecta hoy) · `sendConsents()` envía los eventos sin `textHash`**
- Archivos: `account.js` (`sendConsents`, eventos `{ kind, granted, version, clientAt }`) y `remote-fake.js`
  (`recordConsents` no lo exige).
- El servidor de S3-1 tiene `core.consent_events.text_hash not null` + `CHECK ^[0-9a-f]{64}$` (desvío 1 aceptado en
  el handoff de S3-1). Con `remote.js` real, **cada** `recordConsents` fallará con `invalid`. El `catch {}` lo
  silencia y reintenta en cada apertura: **nunca quedará prueba de la autorización en el servidor**.
- Corrección:
  1. Calcular el SHA-256 (`crypto.subtle.digest`) del texto exacto mostrado. Para `terms`/`privacy`, el HTML legal
     de la versión aceptada; para `adult`/`sensitive_health`, el texto de la casilla. Enviarlo como `textHash`.
  2. **El fake debe rechazar** eventos sin `textHash` válido, como el servidor. Así la divergencia sale en las
     pruebas. Encaja con el `runContract(makeRemote)` que propone el propio handoff.
- Validación: `s3-2-qa.spec.js:130` dejará de ser `test.fail`.

**D2 · Medio · `fakeAllowed` es una lista NEGRA: el modo falso se activa en cualquier host que no sea el de producción**
- Archivo: `remote.js` (`PRODUCTION_HOSTS` + `param`). Con `?remote=fake`, el servidor falso se activa en un dominio
  propio futuro, en un fork en `otro-usuario.github.io`, en una vista previa, etc. (probado con
  `perdida-grasa.example.org`).
- Hoy el impacto es bajo, porque `pages.yml` no publica `remote-fake.js` y la carga falla. Pero basta con que alguien
  lo publique, o con un cambio de dominio, para que un enlace con `?remote=fake` lleve a un usuario a crear una
  «cuenta» que no existe y a creer que sus datos están respaldados.
- Corrección: lista **blanca**. `fakeAllowed = LOCAL_HOSTS.includes(host)` (más `file:` si hace falta para
  `run-all.js`), sin excepción por parámetro fuera de localhost.
- Validación: `s3-2-qa.spec.js:54`.

## Observaciones (no bloquean S3-2; importantes para S3-3)
- **O1 · Cambio de usuario en el mismo dispositivo (riesgo ALTO para S3-3):**
  - «Cerrar sesión» conserva los datos (correcto por ahora) y borra `perdida-grasa:account`.
  - Si **otra persona** entra en ese dispositivo:
    - `sendConsents()` registra **a su nombre** la aceptación que hizo la persona anterior (`state.consent` es del
      dispositivo), con la fecha de esta;
    - en S3-3, la sincronización subiría **los datos de salud de la persona anterior** a la cuenta nueva.
  - Propuesta:
    - ligar los datos locales a `userId` (`state.ownerId`) al entrar por primera vez;
    - si entra un usuario distinto, preguntar «¿Estos datos son tuyos?» (subirlos, o empezar vacío tras exportar);
    - volver a pedir la aceptación legal antes de registrar consentimientos de una cuenta nueva.
  - Lo decide el Analista (contrato §5.6).
- **O2 · SW cachea respuestas de error del propio origen** (OBS-01 del Sprint 0, sigue abierto): un 404 o 500 de
  `remote-fake.js` o de cualquier archivo queda en la caché y se sirve sin conexión. Propuesta: `if (res.ok) put(...)`.
- **O3 · Fake ≠ servidor:**
  - además de D1, el fake no valida `text_hash` en `p_shares` de `joinCoach`/`updateShares` (el servidor lo exige,
    S3-1 desvío 1);
  - el fake cuenta igual los intentos de `joinCoach` fallidos, pero el servidor **no** (S3-1 D1).
  - Propuesta: pasar `tests/remote-fake.test.js` a la batería de contrato y ejecutarla también contra `test:db`/RPC
    cuando exista `remote.js` real.
- **O4 · Tras cerrar sesión, la pantalla de cuenta se ofrece en cada apertura** hasta pulsar «Ahora no», que es
  permanente. Es coherente, pero conviene que «Ahora no» caduque (p. ej. 30 días) o que haya un aviso suave en Perfil.
- **O5 · Validación del correo** muy laxa (acepta `<svg/onload=…>@x.co`). No es un riesgo (todo es `textContent` y
  Supabase valida), pero cuando el coach vea correos en S3-4 tienen que pasar por `esc()`.
- **O6 · iPhone real** pendiente: `one-time-code` desde Mail, PWA instalada con sesión persistente y teclado numérico.

## Respuestas
- **Categorías a compartir sin marcar** salvo `body`: QA está de acuerdo (autorización expresa, coherente con S2-1).
  Hay que actualizar el contrato §1.
- **Puertos E2E:** gracias a `reuseExistingServer: false`, con `E2E_PORT` propio no hubo interferencias.
