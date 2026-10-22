# Diseño (sin implementar): borrado automático de cuentas inactivas

Origen: respuesta P10 (`equipo/legal/respuestas-abogado.md`). Regla: **365 días sin iniciar sesión → se borra la cuenta.** Aviso por correo el **día 335** (con opción de reactivar o descargar métricas), recordatorio el **día 358**, borrado en cascada el **día 365**. Este documento **no cambia código ni base de datos**; deja decidido el cómo para que el Sprint 9 lo construya. **Marca ⚠ SH = decisión o tarea del Stakeholder.**

## 0. Dos hechos que cambian el plan
1. **Calendario real.** La plataforma aún no está conectada y los primeros usuarios llegarían a fines de 2026. **Nadie puede cumplir 365 días de inactividad antes de ~noviembre de 2027** (los avisos del día 335, antes: ~octubre de 2027). Hay tiempo; no hay que construir esto para abrir el piloto. Sí debe estar listo (o el borrado desactivado) antes de esa fecha, porque los textos legales ya lo prometen.
2. **«Última actividad» no es tan simple** (§1): quien deja la app instalada y la usa todos los días **no «inicia sesión» de nuevo**. Medir solo por inicio de sesión borraría cuentas activas.

## 1. Cómo se mide «última actividad» (verificado en el repo y por confirmar en vivo)
Lo que existe hoy en el repositorio (migraciones `20261021120000` a `20261023120000`):

| Dato | Dónde | ¿Sirve? |
|---|---|---|
| `auth.users.last_sign_in_at` | Tabla propia de Supabase Auth. **No está en el repo**: el simulador local de pruebas (`supabase/tests/00_supabase_stub.sql`) solo crea `id`, `email`, `raw_user_meta_data`, `created_at`. | Es la medida literal de P10 («iniciar sesión»), pero solo cambia al **verificar un código OTP**, no al renovar la sesión. **Por confirmar en el panel de Supabase** que la columna existe y se actualiza como se espera. |
| `auth.sessions.refreshed_at` / `auth.refresh_tokens.updated_at` | Tablas internas de Auth | Reflejan la renovación automática de la sesión. **Por confirmar** que existen y su nombre exacto en la versión actual de Supabase; no depender de ellas sin comprobarlo. |
| `grasa.records.server_updated_at` (máximo por `user_id`) | Repo: `grasa.records` | **Sí, verificado.** Cada sincronización de un cliente con copia en la nube deja aquí la hora del servidor. Sirve para clientes que usan la nube. Un coach no escribe `records`. |
| `grasa.coach_links.updated_at`, `grasa.comments.created_at` | Repo | Actividad del coach (comentar, vincular). |
| `core.consent_events.created_at` | Repo | Última autorización o retiro. |
| `core.profiles.created_at` | Repo | Solo alta; sirve como último recurso (cuenta que nunca volvió). |

**Propuesta (⚠ SH decide si acepta ser más prudente que la letra de P10):**
`ultima_actividad = greatest( last_sign_in_at, max(auth.sessions.refreshed_at), max(grasa.records.server_updated_at), max(grasa.comments.created_at del coach), profiles.created_at )`, ignorando los nulos.
La letra de P10 dice «sin iniciar sesión»; usar el máximo de varias señales **solo puede retrasar** un borrado, nunca adelantarlo, así que no contradice la regla y evita borrar a quien usa la app a diario. Si el Stakeholder prefiere la medida literal (solo `last_sign_in_at`), hay que **forzar el cierre de sesión a los 300 días** o la gente activa se perdería; no se recomienda.

## 2. Función SQL que purgaría (migración futura; hoy no se escribe)
Reutiliza el cuerpo de `core.delete_my_account()` (versión Sprint 6 en `20261022120000_r1_consentimientos_s6.sql`: archiva los consentimientos seudonimizados y borra `auth.users` en cascada). Esa función usa `auth.uid()`, así que no sirve tal cual para un proceso del servidor. Variante:

1. **Refactor** de `core.delete_my_account()` a un cuerpo común `core._delete_account(p_uid uuid)` (interno, sin permiso para ningún rol de la API) que hace exactamente lo de hoy: negarse si quedan fotos en Storage; insertar en `core.consent_archive` (UUID seudonimizado con sal, tipo, versión, huella, marcas de tiempo; **sin correo ni nombre**) y `delete from auth.users`. `delete_my_account()` pasa a llamar `_delete_account(auth.uid())`. Sus pruebas actuales (`80_consentimientos_s6.test.sql`) deben seguir verdes.
2. **`core.purge_inactive_account(p_uid uuid)`**, `security definer`, `search_path` fijo, permiso **solo `service_role`**. Antes de llamar a `_delete_account` comprueba, en una sola transacción: (a) la cuenta existe (si no, devuelve `false`: idempotente); (b) `ultima_actividad` sigue siendo ≥ 365 días atrás **en este instante** (si la persona volvió entre el aviso y el borrado, no se borra); (c) existe el aviso del **día 358** enviado hace al menos 7 días (§4; sin aviso previo, no se borra jamás).
3. **Prueba mínima del consentimiento:** ya la cubre `_delete_account` (la misma de la baja voluntaria). Para el caso «inactiva» conviene además que el archivo diga por qué se archivó (`reason`: `self` / `inactive` / `minor`); eso requiere **una columna nueva en `core.consent_archive`** (migración).
4. **Plazo del archivo:** hoy `core.consent_archive.purge_after` vale `now() + 5 years` (migración S6). P11 fija **3 años**: la migración futura cambia el valor por defecto a 3 años (y ajusta las filas existentes, hoy ninguna con datos reales). Además hace falta un barrido que **borre las filas vencidas** (el disparador ya permite borrarlas solo cuando `purge_after < now()`). No se tocó la base en este sprint.
5. **Menores (P9, 48 h):** el mismo `_delete_account` sirve (`reason = 'minor'`); falta definir quién lo dispara (⚠ SH: hoy sería manual desde el SQL Editor).
6. **Fotos:** `delete_my_account` se niega si quedan archivos en Storage, y Supabase no deja borrarlos por SQL. El proceso debe **borrar primero `grasa-photos/{uid}/*` con la API de Storage** (como ya hace `supabase/tools/sweep-orphan-photos.js`) y luego llamar a la función. Si falla a mitad, el barrido semanal de huérfanas limpia el resto.

Prueba mínima de la migración (cuando exista): cuenta con consentimientos y sin fotos → `purge_inactive_account` borra `auth.users` y deja filas en `consent_archive` sin correo ni nombre; cuenta activa → devuelve `false` y no borra nada; cuenta inactiva sin aviso 358 → se niega; segunda llamada → `false`; un rol `authenticated` no puede ejecutarla.

## 3. Función de lista (también para el modo simulación)
`core.inactive_accounts(p_today date default current_date)`, solo `service_role`, devuelve `user_id`, `email`, `ultima_actividad`, `dias_inactiva`, `etapa` (`'335'`, `'358'`, `'365'` o nada) y `ya_avisada` (sí/no, según §4). Es de **solo lectura** y es lo que usan el modo simulación y los envíos. El correo solo sale de la base hacia el proceso del servidor que envía el aviso; nunca por la API pública.

## 4. Idempotencia: tabla de avisos
Tabla nueva `core.inactive_notices (user_id uuid references auth.users on delete cascade, stage smallint check (stage in (335,358)), sent_at timestamptz, primary key (user_id, stage))`. Solo `service_role`. Reglas:
- **Enviar** el aviso de una etapa solo si no hay fila; insertar la fila **antes** de llamar a Brevo y borrarla si Brevo responde error (así un reintento no manda dos correos y un fallo no se da por enviado).
- Ventana en vez de día exacto: etapa 335 si `dias_inactiva ≥ 335`, etapa 358 si `≥ 358`; si el proceso falló unos días, el aviso sale al siguiente turno (el borrado exige el 358 enviado hace ≥ 7 días, así que nunca se salta un aviso; solo se retrasa).
- Si la persona vuelve (su `ultima_actividad` pasa a ser reciente), el proceso **borra sus filas** de `inactive_notices`: empieza de cero.
- Correr dos veces el mismo día no duplica nada; correr el borrado dos veces devuelve `false` la segunda.

## 5. Modo «simulación»
Mismo patrón que `supabase/tools/sweep-orphan-photos.js`: **sin `--apply` solo lista**, con `--apply` actúa. La simulación imprime por etapa: cuántas cuentas, correos **enmascarados** (`a***@gm***.com`), días de inactividad, qué correo mandaría y a quién **borraría** el día de hoy, y termina con «Simulación: no se envió ni se borró nada». Debe poder correrse con una fecha simulada (`--hoy 2027-10-20`) para probar el calendario sin esperar un año, sobre el proyecto `pruebas`. Primera norma de seguridad: el modo por defecto es simulación.

## 6. Cómo enviar los avisos (opciones)
Contenido de cada correo (texto por aprobar con el abogado, mismo remitente de Brevo del código OTP): «llevas casi un año sin usar tu cuenta; **entra a la app para mantenerla** o **descarga tus métricas** (la app ya exporta); si no haces nada, se borrará el [fecha]». Sin datos de salud en el correo. «Descargar métricas» hoy requiere entrar a la app, que a su vez cuenta como actividad; está bien.

| | **A. Supabase Edge Function + `pg_cron`** | **B. GitHub Actions programado** |
|---|---|---|
| Qué es | Función en Supabase que corre `inactive_accounts`, llama a Brevo y a `purge_inactive_account`; `pg_cron` + `pg_net` la dispara a diario. | Workflow `schedule` diario del repo que ejecuta un script Node (como `sweep-orphan-photos.js`) contra el proyecto. |
| Dónde viven los secretos | Todo dentro de Supabase: la clave de Brevo como *secret* de la función; Supabase ya inyecta la clave de servicio. | La clave de Brevo **y la `service_role` de Supabase** quedan como *secrets* de GitHub. La `service_role` salta todos los permisos: si el repo o la cuenta de GitHub se compromete, se compromete la base. |
| Pros | Menos piezas y menos secretos fuera de Supabase; corre aunque el repo esté inactivo; el SQL queda junto a los datos. | Más simple de escribir y de probar en el CI existente; se ve en la pestaña Actions; la simulación se puede lanzar a mano (*workflow_dispatch*) con botón; no hace falta la CLI de Supabase. |
| Contras | Requiere instalar y desplegar con la CLI de Supabase (nuevo para el equipo), habilitar `pg_cron`/`pg_net` (migración y revisar disponibilidad en el plan gratis: **por confirmar**), y es más difícil de probar localmente. | Un cron de GitHub se pausa si el repo pasa 60 días sin actividad (**por confirmar** la regla actual); la `service_role` fuera de Supabase; los tiempos son «aproximados». |
| Costo | Edge Functions e invocaciones del plan gratis sobran para este volumen (una al día); `pg_cron` sin costo adicional. **Por confirmar** límites vigentes. | Minutos de Actions: minutos al día, dentro del uso gratuito (**por confirmar** según repo público o privado). |
| Brevo | API transaccional `POST /v3/smtp/email` con la cabecera `api-key`, o reutilizar el SMTP ya configurado. Plan gratis: 300 correos/día (ver checklist), de sobra. | Igual. |

**Recomendación del analista (el Stakeholder decide):** para el piloto, **B en modo simulación solamente** (un botón, cero riesgo, sin `service_role` automatizada) hasta ~septiembre de 2027; para producción abierta, **A**, porque deja las claves dentro de Supabase. Alternativa mínima aceptable para 10 usuarios: correr el script **a mano una vez al mes** con `--apply` desde el computador de José, igual que hoy el barrido de fotos.

## 7. Qué debe hacer el Stakeholder
1. ⚠ **Decidir la medida de actividad** (§1): máximo de varias señales (recomendado) o solo `last_sign_in_at`.
2. ⚠ **Elegir A, B o «a mano mensual»** (§6) y, si es B, crear los secretos en GitHub; si es A, instalar la CLI de Supabase.
3. ⚠ **Aprobar con el abogado el texto de los dos correos** (días 335 y 358) y el del borrado final, y confirmar que un aviso por correo basta.
4. ⚠ **Confirmar en el panel de Supabase** que `auth.users.last_sign_in_at` y `auth.sessions` existen como se supone, y los límites del plan para `pg_cron` / Edge Functions.
5. ⚠ **Autorizar la migración** (Sprint 9): `_delete_account`, `purge_inactive_account`, `inactive_accounts`, `inactive_notices`, `reason` y `purge_after = 3 años` en el archivo.
6. ⚠ **Menores (P9):** decidir quién los detecta y ejecuta el borrado de 48 h mientras no sea automático.
7. Mantener el **plan de pago** (Pro) cuando haya clientes reales: sin copias de seguridad, un borrado erróneo no se puede recuperar. Con esa política de borrado, lo recomendado es **no activar `--apply` automático** hasta tener copias.

## 8. Riesgos
- Borrar a quien sí usa la app (medida de actividad equivocada): por eso la simulación primero y el máximo de señales.
- Correo de aviso a spam: pedir a los coaches que avisen a sus clientes y usar dominio propio (pendiente del checklist §3).
- Borrado sin copias de seguridad en el plan gratis: irreversible.
- Datos que el coach ya copió fuera de la app: no los alcanza este borrado (P17: él los destruye en 30 días).
