# QA en vivo (proyecto `pruebas`) — veredicto

Fecha: 2026-10-21 · Autor: QA de seguridad · Script: `scripts/qa-live-rls.js` (sin credenciales; todo por variables de entorno)

## Veredicto: APROBADO CON CONDICIONES

Segunda ronda (cuenta A recreada por el Stakeholder): corrida completa a–h contra `pruebas`, **61/61 comprobaciones OK**
en la última pasada. La primera ronda (login de A rechazado) quedó superada. Condiciones: corregir H6 (media) y H2 (media)
antes de abrir a usuarios reales; el resto son bajas/informativas. Pendiente fuera de alcance: códigos OTP reales.
Durante la ronda hubo 3 pasadas parciales: los FALLA de las dos primeras eran errores míos del script (restricción
`records_check` exige `nkey = id` en food; `my_consents` no lista `share_*` por diseño; `join_coach` inválido devuelve fila
de nulos; el trigger conserva el `user_id`), corregidos en el script, salvo uno que SÍ era hallazgo real (H6).
La cuenta B se borró solo en la pasada final limpia. Para repetir hay que recrear B.

## Matriz (resultados reales de la pasada final)

| # | Prueba | Resultado |
|---|---|---|
| a | Login coach, A, B; join_app A y B; become_coach (código de 6 símbolos); my_roles coach/client; consent_events A; join_coach solo peso/medidas (vínculo activo, comidas/hábitos/notas = false); my_consents | OK |
| b | A sync_push de 5 registros (profile, entry con note, food, habit, library) y sync_pull los recupera (incluida la note) | OK |
| b | B: sync_pull ve solo lo suyo; 0 filas de A por `user_id`, por ids adivinados y sin filtro; no ve coach_links, consent_events ni profiles de A; `coach_pull(A)` → 403 forbidden | OK |
| b | B inserta con `user_id` de A y A con `user_id` de B → 403 (RLS); A PATCH/DELETE sobre B → 0 filas / 403; datos de B intactos | OK |
| b | A no puede DELETE físico ni de lo suyo (403, solo lápida); PATCH del `user_id` devuelve 200 pero el trigger conserva el dueño | OK |
| c | `coach_clients` lista a A y no a B; `coach_pull(A)` = solo `entry`+`profile`; sin `note`, comidas ni biblioteca; `coach_pull(B)` → 403 | OK |
| c | Coach: lectura directa de `records` de A = 0 filas; INSERT → 403; PATCH → 0 filas; DELETE → 403; datos de A intactos; no lee consent_events de A; solo ve sus vínculos | OK |
| c | Con comidas concedidas el coach ve `food` (y sigue sin hábitos/biblioteca/note de entry); con notas concedidas la note de entry aparece; biblioteca nunca | OK |
| d | `update_shares` retirando comidas/notas → el coach las pierde en la siguiente consulta; `leave_coach` → `coach_pull` 403 forbidden, `coach_clients` ya no lista a A, `add_comment` rechazado | OK |
| e | consent_events: INSERT OK; UPDATE y DELETE → 403 `permission denied`; filas intactas (23 → 23); no se puede insertar a nombre de otro usuario | OK |
| f | `preview_invite_code` inválido → 0 filas; `join_coach` inválido → HTTP 200 con **fila de nulos** (no `null` JSON); A sigue sin vínculo. Sin `rate_limited` (≈6 intentos acumulados). Que cada intento cuente no es observable por RLS | OK (ver H7) |
| g | Errores de Auth y REST | ver tabla |
| h | B `delete_my_account` OK; B ya no inicia sesión (400 `invalid_credentials`); con su token antiguo `my_roles` → `[]` y `sync_pull` → 0 registros; A no ve nada de B. **Huérfanos en tablas internas / Storage no comprobables con la clave publicable** (requiere SQL del Stakeholder) | OK (parcial) |

Comprobaciones REST sin sesión (apartado g): con solo la clave publicable, `rpc/my_roles` y `grasa.records` devuelven
HTTP 401 `42501 permission denied for schema …` → `anon` no puede ejecutar RPC ni leer tablas (§10.7 OK).

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
| H1 | Cerrado | Credenciales de A rechazadas en la ronda 1 | Cuenta recreada; ronda 2 completa |
| H2 | Media | Refresh token inválido llega como `400 validation_failed` y `mapError` (ctx `auth`) lo convierte en `invalid`, no en `auth` | En `mapError`: `code === 'validation_failed' && /refresh token/i.test(msg)` → `auth` |
| H3 | Baja | HTTP 401 con `42501` sin sesión se mapea a `forbidden` (la regla SQLSTATE va antes que "HTTP 401 → auth" de §10.4) | Si `status === 401` → `auth`; o documentarlo. Normalmente `me()` lo corta antes |
| H4 | Informativa | Mensajes de Auth/PostgREST con detalle técnico | Ya van solo a `detail`; mantener |
| H5 | Informativa | Códigos OTP / límite de correos sin verificar en vivo | Probar a mano con correo real |
| H6 | Media | `coach_pull` solo quita `note` de las filas `kind='entry'` (migraciones `…120100` L401 y `…130000` L114). Si una fila `food` o `habit` trae `note` en `data`, el coach la ve con `share_notes = false` (observado en vivo: food con note visible tras conceder solo comidas). La app actual solo genera `note` en `entry` (schema.js L185), pero un cliente modificado o una versión futura la filtraría | Nueva migración: quitar `note` en todo kind: `r.data - 'note'` si `not l.share_notes` (sin restringir a `entry`), o mejor lista blanca de claves por `kind` |
| H7 | Baja | `join_coach` con código inválido devuelve HTTP 200 con un objeto de columnas nulas (composite), no `null` | `remote.js` ya lo trata (`linkOut` exige `l.id`), pero documentar en el contrato (§11.1) o devolver `setof` |
| H8 | Baja | Tras `delete_my_account` el JWT del usuario sigue aceptado hasta caducar (devuelve datos vacíos, sin fuga) | Aceptable; el cliente debe cerrar sesión local al borrar |
| H9 | Informativa | Huérfanos tras la baja en tablas internas y Storage no verificables sin SQL | Stakeholder: `select count(*)` de `grasa.records/photos/coach_links/photo_views/invite_attempts` y `core.*` por el id de B |

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
