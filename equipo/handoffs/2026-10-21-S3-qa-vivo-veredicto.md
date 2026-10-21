# QA en vivo (proyecto `pruebas`) — veredicto

Fecha: 2026-10-21 · Autor: QA de seguridad · Script: `scripts/qa-live-rls.js` (sin credenciales; todo por variables de entorno)

## Veredicto: RECHAZADO (por falta de evidencia, NO por un defecto encontrado en el código)

La matriz RLS en vivo **no se pudo ejecutar**: el inicio de sesión del **cliente A** fue rechazado por Auth
(`HTTP 400 · invalid_credentials · "Invalid login credentials"`, 3 intentos, el mismo resultado). Sin A no existe vínculo
ni datos que comprobar, así que los apartados b–f y h quedan **sin ejecutar**. Coach y cliente B sí iniciaron sesión.
No se tocó ninguna cuenta (en particular **B no se borró**, para poder repetir la pasada). No hay ningún resultado inventado.

Causa probable (a confirmar por el Stakeholder): el usuario `…+qaclientea@…` no existe en `pruebas`, no tiene
contraseña asignada o la contraseña facilitada tiene un error de transcripción. Auth devuelve el mismo mensaje en los
tres casos (no revela cuál). Para repetir: comprobar/restablecer esa cuenta en el panel y ejecutar de nuevo (comando abajo).

## Matriz

| # | Prueba | Resultado |
|---|---|---|
| a | Login coach | OK |
| a | Login cliente B | OK |
| a | Login cliente A | FALLA (`invalid_credentials`) — bloquea el resto |
| a | join_app, become_coach, my_roles, consent_events A, join_coach solo peso/medidas | NO EJECUTADO |
| b | A sync_push/sync_pull; B no ve nada de A; A no escribe en B | NO EJECUTADO |
| c | Coach ve solo categorías consentidas, nunca `note` ni biblioteca; no escribe; no ve a B | NO EJECUTADO |
| d | Revocar (update_shares / leave_coach) → coach pierde acceso | NO EJECUTADO |
| e | consent_events: insertar OK, UPDATE/DELETE rechazados | NO EJECUTADO |
| f | Código inválido (máx. 3 intentos) | NO EJECUTADO |
| g | Errores reales de Auth (tabla siguiente) | EJECUTADO (con coach) |
| h | B `delete_my_account` | NO EJECUTADO (a propósito: no borrar B hasta poder probar A) |

Comprobaciones REST sin sesión (ejecutadas, parte de g): con solo la clave publicable, `rpc/my_roles` y
`grasa.records` devuelven HTTP 401 `42501 permission denied for schema …` → `anon` no puede ejecutar RPC ni leer tablas (§10.7 OK).
Con el coach: `coach_pull` de un cliente al que no está vinculado → HTTP 403 `42501` mensaje `forbidden` (OK);
`sync_push` con id no UUID → HTTP 400 `22P02`.

## Errores reales (Auth y REST) y cómo los mapea `remote.js` (`mapError`)

| Caso | HTTP | `error_code` / `code` | Mensaje real | Mapeo actual en remote.js | ¿Correcto? |
|---|---|---|---|---|---|
| Contraseña incorrecta | 400 | `invalid_credentials` | Invalid login credentials | `ctx 'verify'` → `invalid_code`; `ctx 'auth'` → `invalid` | Sí |
| Correo inexistente | 400 | `invalid_credentials` | Invalid login credentials (idéntico: no hay enumeración de usuarios) | igual que arriba | Sí |
| Correo mal formado (en login por contraseña) | 400 | `invalid_credentials` | Invalid login credentials | igual | Sí |
| `refresh_token` inexistente | 400 | `validation_failed` | Refresh token is not valid | `ctx 'auth'` → `invalid` | **No** (ver H2) |
| `/auth/v1/user` con token mal formado | 403 | `bad_jwt` | invalid JWT: … token is malformed … | regex `bad_jwt` → `auth` | Sí |
| `/auth/v1/user` con JWT de firma falsa/caducado | 403 | `bad_jwt` | invalid JWT: … signature is invalid | `auth` | Sí |
| REST con token mal formado | 401 | `PGRST301` | Expected 3 parts in JWT; got 2 | SQLSTATE map → `auth` | Sí |
| REST con JWT de firma falsa | 401 | `PGRST301` | No suitable key or wrong key type | `auth` | Sí |
| REST sin sesión (solo apikey) | 401 | `42501` | permission denied for schema core/grasa | `42501` → `forbidden` | Discutible (H3) |
| RPC lanzada por la BD (`coach_pull` sin vínculo) | 403 | `42501` | forbidden | mensaje exacto → `forbidden` | Sí |
| `sync_push` con UUID no válido | 400 | `22P02` | invalid input syntax for type uuid | → `invalid` | Sí |

No verificables aquí (requieren recibir correo): `otp_expired`, `over_email_send_rate_limit`, `over_request_rate_limit`
y el flujo `verifyOtp`; la app inicia sesión por código de correo (OTP), no por contraseña, así que las contraseñas de prueba
solo ejercitan la ruta REST/RLS, no el inicio de sesión real de la app. Sigue pendiente §10.8.5 para esos códigos.

## Repaso de seguridad estático (remote.js, sync.js, innerHTML)

- Claves: `remote.js`, `sync.js` y `config.js` no contienen `sb_secret_`, `service_role`, contraseñas ni JWT; `config.js` solo documenta que la clave secreta no va ahí. OK.
- Dueño de los datos: `sync.js` (≈ líneas 169-200) no hace ninguna llamada si `store.ownerId()` no coincide con `userId` de la sesión (estados `unconfirmed`/`conflict`); además `user_id` nunca viaja en el payload de `sync_push` (lo fija `auth.uid()` en la BD). OK.
- `innerHTML`: en `coach-panel.js` y `app.js` (panel del coach, notas, comentarios, nombre del cliente, fotos) todo valor dinámico pasa por `esc()` (escapa `& < > " '`, también en atributos). `account.js` y `coach.js` no usan `innerHTML`. No se encontró ningún dato de otro usuario sin escapar (revisión por muestreo de las 14 asignaciones, no exhaustiva línea a línea de `app.js`).
- `esc()` está duplicado en `app.js` y `coach-panel.js` (idéntico): riesgo de divergencia, bajo.

## Hallazgos

| ID | Sev. | Hallazgo | Corrección propuesta |
|---|---|---|---|
| H1 | Bloqueante (de la prueba) | Credenciales de cliente A rechazadas; matriz b–f,h sin ejecutar | Stakeholder: verificar/restablecer la cuenta A y repetir `scripts/qa-live-rls.js` |
| H2 | Media | Refresh token inválido llega como `400 validation_failed` y `mapError` (ctx `auth`) lo convierte en `invalid`, no en `auth`; la UI podría tratar una sesión perdida como "datos no válidos" | En `mapError`: `code === 'validation_failed' && /refresh token/i.test(msg)` → `auth` (junto a `refresh_token_not_found`) |
| H3 | Baja | HTTP 401 con `42501` sin sesión se mapea a `forbidden` (la regla SQLSTATE va antes que "HTTP 401 → auth" del contrato §10.4) | Si `status === 401` y no hay sesión → `auth`; o documentarlo. Normalmente `me()` lo corta antes |
| H4 | Informativa | Los mensajes de Auth/PostgREST contienen detalle técnico (p. ej. `bad_jwt: … token is malformed`) | Ya se guarda solo en `detail` y la UI usa textos propios: mantener |
| H5 | Informativa | Códigos OTP/límite de correos siguen sin verificar en vivo | Probarlos manualmente con una cuenta real de correo (Stakeholder) |

## Cómo repetir la pasada completa

```
NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt \
SUPABASE_URL=… SUPABASE_KEY=sb_publishable_… \
QA_COACH_EMAIL=… QA_COACH_PW=… QA_A_EMAIL=… QA_A_PW=… QA_B_EMAIL=… QA_B_PW=… \
node scripts/qa-live-rls.js
```
El script se niega a ejecutarse si falta una variable o la clave no es `sb_publishable_`; no imprime contraseñas, tokens ni el
código de invitación. **Al final borra la cuenta B** (`delete_my_account`): para una segunda pasada hay que recrear B.
Máx. 3 intentos de código inválido/válido en total (límite 20/h). Cuando se ejecute completo, este veredicto debe actualizarse con
los resultados reales de b–f y h.
