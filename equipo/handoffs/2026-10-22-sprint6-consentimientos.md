# Handoff: Sprint 6, autorizaciones A1–A8 y bloqueos de la preasesoría legal (DEV Full-stack, QA propio)

Decisiones del Stakeholder: `equipo/decisiones-negocio.md` (#15 a #21, 2026-10-22). Textos de origen: `equipo/legal/borradores/autorizaciones-en-app.md` (borrador v0.2, **no vigente, pendiente del abogado**). La app oficial **sigue sin conectarse a `plataforma`**: `config.js` está vacío y nada de lo nuevo se ve sin configuración de Supabase, salvo la edad mínima de 18, que aplica siempre.

## Qué cambió

### Base de datos (r1 v1.4, una sola migración: `supabase/migrations/20261022120000_r1_consentimientos_s6.sql`)
- `core.consent_events.kind` admite además `cloud_transfer` (A4), `photo_view_coach` (A6b) y `coach_agreement` (A7). **A6a se llama `photos_cloud`** (ya existía en el CHECK; no se creó `photo_cloud`).
- `grasa.coach_links.share_nutrition` y `share_habits` nacen en `false` (antes `true`). `join_coach` ya los fijaba en falso; solo se cierra el default.
- **`core.consent_archive`** (nueva): prueba mínima y seudonimizada del consentimiento. `user_pseudo_id` = SHA-256 de (sal del servidor + uuid), `coach_pseudo_id` igual, tipo, acción `grant`/`revoke`, versión, huella del texto, fechas y fecha de baja. **Sin FK a `auth.users`, sin correo ni nombre.** RLS activada sin políticas y `REVOKE ALL` a `anon`, `authenticated` y `service_role`: solo la lee el dueño de la base (SQL Editor). Solo inserción (UPDATE/DELETE/TRUNCATE bloqueados; solo se pueden borrar filas con `purge_after` vencido, 5 años por defecto, a mano cuando el abogado fije el plazo). `core.archive_secret` guarda la sal con los mismos permisos.
- **`core.delete_my_account()`** copia los consentimientos al archivo en la misma transacción que el borrado en cascada. Misma firma, mismos grants y `search_path`.
- Pruebas: `supabase/tests/80_consentimientos_s6.test.sql` (28 comprobaciones: tipos nuevos aceptados y uno inválido rechazado, archivo ilegible e inescribible por `anon`/`authenticated`/`service_role`, sin FK ni columnas personales, solo inserción, la baja deja el archivo sin uuid/correo/nombre) y `10_estructura` (13 tablas). `test:db` estricto (`PGOPTIONS='-c qa.strict=on'`) sigue en verde. Contrato: `equipo/r1-contrato.md` §13 (v1.4).

### Aplicación
- **Edad mínima 18** (`schema.js`: `AGE_MIN`, `AGE_UNDER_MSG`; `profileError`; formulario con `min=18`, aviso en pantalla y globo del navegador). Un perfil ya guardado con menos de 18 **no se borra**: se conserva como borrador (`rejected.profile`), la app avisa en Perfil ("Revisa tu perfil: Esta app es solo para personas de 18 años o más…") y pide corregir; los registros siguen intactos.
- **`consent-texts.js`** (nuevo, sin DOM): textos A1–A8 con id estable, versión (`0.2-A1` … `0.2-A7`, A5 = `compartir-2`) y tipos de consentimiento. La huella es el SHA-256 de `fullText(id, vars)`, la misma cadena que se pinta. También la lógica pura del estado local (`cloudAllowed`, `coachAgreementOK`, `shareMigrationNeeded`, cola de eventos sin conexión).
- **A1 + A2** (paso del correo, sin marcar): sin ambas no sale el código (el correo viaja a Brevo). Aviso de Brevo bajo el campo. Se registran `adult`, `terms`, `privacy` al entrar.
- **A3 + A4** (paso nuevo "¿Guardar una copia en la nube?", sin marcar, opcional): registran `sensitive_health` y `cloud_transfer`. **Sin las dos no se sincroniza nada** (`sync.js` devuelve estado `nocloud`; Perfil dice "La copia en la nube está apagada"). "Ahora no" deja la cuenta sin copia. Se puede activar después en Perfil → "Activar la copia en la nube". Conectarse con un coach exige tenerlas.
- **A5** por categoría, en la vinculación y en "Mis datos y permisos" / "Mi coach": **comidas y hábitos nacen apagados**, sube `SHARE_VERSION` a `compartir-2` (huella del texto con el nombre del coach). **Migración de vínculos existentes**: nada se apaga solo; el cliente ve un aviso ("Actualizamos los textos…") y al pulsar Guardar se registran `share_*` con `compartir-2` también para las categorías que no cambiaron (el servidor solo registra las que cambian). La casilla de Fotos queda desactivada (se pide aparte, A6).
- **A6a / A6b** (interruptores en "Mis datos y permisos", sin marcar, revocables, no condicionan nada): registran `photos_cloud` y `photo_view_coach`. **La subida de fotos sigue APAGADA** (`photosCloudAllowed: () => false`, con comentario y prueba que lo comprueba).
- **A7** (acuerdo del coach): casilla al registrarse como coach, **antes** de crear el código de invitación (el evento llega al servidor antes que `becomeCoach`); si no llega, no se crea nada. Coaches existentes: **Clientes e Invitar quedan bloqueados** (ni datos ni código en la página) hasta aceptar; su uso personal no se bloquea. Registra `coach_agreement`.
- **A8**: hoja de aviso (`#sheet-a8`) con "Exportar mis datos / Continuar / Cancelar" al retirar una autorización, quitar una categoría, terminar el vínculo o **borrar la cuenta** (botón nuevo "Borrar mi cuenta"). Al coach, texto de vínculo terminado en su lista de Clientes.
- `remote-fake.js`: tipos nuevos, comidas/hábitos apagados al vincular y archivo seudonimizado al borrar (espejo de la base real).
- Registro de módulos: `index.html`, `sw.js` (**caché v28**), `scripts/build-site.js`, `tests/site.test.js`, `tests/e2e/site-pruebas.spec.js`.

## Textos que NO son idénticos al borrador (el abogado debe confirmarlos)
1. «Perfil → Privacidad / Cuenta» se cambió por «Más → Mis datos y permisos» (así se llama la pantalla real).
2. **A4, última frase**: el borrador dice «La retiras en Perfil → Cuenta (se borra la copia)». Hoy **no existe** borrado de la copia sin borrar la cuenta, así que dice: «La retiras en Más → Mis datos y permisos: la copia deja de actualizarse y se borra al borrar tu cuenta.» Si el Stakeholder quiere el borrado inmediato, falta una función SQL nueva (`delete_my_cloud_data`) y su prueba.
3. **A2** muestra la versión **vigente** de los textos legales enlazados (hoy «0.1»), no «0.2», porque los enlaces siguen a `legal/*.html` v0.1.
4. Se quitaron los símbolos ☐ y las negritas (la casilla es la propia casilla). A5 y A7 se presentan como el borrador, con la introducción encima.
5. Los enlaces «Texto completo: Política §n» y «Leer acuerdo completo» llevan a `legal/privacidad.html` (sin ancla: el v0.1 no tiene esas secciones). El Acuerdo del coach no tiene página propia todavía.

## Qué debe hacer el Stakeholder
1. **Volver a pegar `supabase/r1.sql` en el SQL Editor de `pruebas` y, cuando toque, de `plataforma`** (idempotente; debe terminar con una fila "OK r1 v1"). Sin esto, la app de pruebas fallará al registrar los tipos nuevos (`cloud_transfer`, `photo_view_coach`, `coach_agreement`) y la baja de cuenta no guardará la prueba mínima.
2. Comprobar en `pruebas`: Table Editor → `core.consent_archive` existe (y la API REST no la devuelve; con la clave publicable debe dar permiso denegado).
3. Cuentas de `pruebas` anteriores a este sprint: al abrir la app se les ofrecerá una vez la copia en la nube (A3 + A4); **mientras no la acepten, no se sincroniza**. Los vínculos existentes verán el aviso de `compartir-2`.
4. Decidir: ¿borrado de la copia al retirar A4 sin borrar la cuenta? (ver textos, punto 2).

## Qué queda por el abogado (no hecho aquí)
- Aprobar o corregir los textos A1–A8 y el Acuerdo del coach; fijar plazos (retención de la prueba 3–5 años, inactividad 12 m aviso / 13–24 m borrado, 24–48 h de incidentes, 30 días de borrado del coach). Los de inactividad **no están automatizados**.
- **Antes de conectar `plataforma`: regenerar `legal/*.html` desde los textos v1.0 aprobados (`npm run legal`), subir `Schema.LEGAL_VERSIONS` y actualizar `tests/legal.test.js`.** Esta rama no tocó `legal/*.html` ni los `.md` v0.1.
- Crear la página del Acuerdo del coach y los anclas de la Política (§5, §6, §7, §7.1, §7.3) que citan los textos.

## Riesgos
- **El bloqueo del coach (A7) es del lado de la aplicación.** La base no exige `coach_agreement` para `coach_pull`/`coach_clients`: un coach con conocimiento técnico podría llamar a la API sin pasar por la pantalla. Cerrarlo en SQL exige tocar funciones de seguridad (otra migración); se deja decidido para el siguiente sprint.
- Lo mismo con A3/A4: el servidor no impide un `sync_push` hecho a mano; la barrera es la aplicación y la RLS por dueño.
- A6a/A6b solo registran la decisión; mientras la subida de fotos esté apagada no tienen efecto técnico.
- `consent_archive` guarda hash con sal: si se perdiera la sal, los seudónimos antiguos no se podrían volver a calcular (no afecta a la prueba).
- Los eventos de consentimiento se envían al recuperar la conexión; si la persona borra los datos del navegador antes, la cola se pierde (la decisión local también). Para A7 no hay cola: si no llega, no se acepta.
- Un `confirm()` nativo se sustituyó por la hoja A8 en "Dejar de compartir" y en quitar categorías: cualquier automatización externa que los aceptara solos debe pulsar `#a8-ok`.

## Pruebas
Ver el reporte final del Dev. Unitarias nuevas: `tests/consent-texts.test.js` (15) y 2 de edad en `tests/schema.test.js`. E2E nuevas: `tests/e2e/s6-consentimientos.spec.js` (letra ancha DejaVu Sans a 390 px, sin desborde, toques de 48 px; capturas con `CAPTURAS=1`).
