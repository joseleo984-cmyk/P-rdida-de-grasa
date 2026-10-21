# SPIKE-01 — Servidor, plataforma coach → clientes y sincronización

Autor: Agente Arquitecto / Tech Lead · Fecha: 2026-10-21 · Estado: propuesta para revisión del Stakeholder
Timebox: 1 spike (solo documento, sin código). Base: `equipo/arquitectura.md` (Sprint 0), `equipo/tablero.md`,
`app.js`, `photos.js`, `calc.js`, y alineado con `equipo/vision-plataforma.md` del Analista (MVP = HU-P01…HU-P08,
R0 de descubrimiento antes de construir E1/E2). Las respuestas a sus preguntas están en la **§10**.

> **Cambio de rumbo respecto al Sprint 0.** En `arquitectura.md §4` recomendé "sin servidor (YAGNI)". Con la nueva
> visión B2B2C (el coach ve el progreso de sus clientes), el servidor pasa a ser **necesario**. Se mantiene el
> principio *local-first*: la app sigue funcionando sin conexión y el servidor es una réplica más, no la fuente
> que bloquea la interfaz.

**Convención:** los precios, la disponibilidad de pasarelas y las reglas de terceros que no he podido
confirmar en una fuente oficial van marcados **(a verificar)**. Los costes son estimaciones de orden de magnitud
en USD/mes, sin impuestos.

---

## 0. Resumen ejecutivo

| Tema | Recomendación |
|---|---|
| Backend | **Supabase gestionado** (Postgres + RLS + Storage + Auth), región São Paulo (a verificar latencia y legal), con disciplina anti-lock-in: SQL en el repo, lógica de sync en el cliente detrás de una interfaz. |
| Sync | Local-first con **last-write-wins por registro**, `id` UUID, `updatedAt`, borrado lógico (`deletedAt`). Sin cola explícita: "subir todo lo que cambió desde la última sincronización". |
| Auth en iPhone | **Código OTP de 6 dígitos por email** (no enlace mágico: en una PWA instalada en iOS el enlace abre Safari, que tiene otro almacenamiento). Google/Apple después. |
| Plataforma | **PWA en R1–R3**; evaluar envoltorio nativo (Capacitor) en R4+ con datos de uso. |
| Cobros | **Fuera de la app en R1** (modelo B+C del Analista: gratis hasta 5 clientes, luego tarifa fija por cliente activo/mes, con link de pago o transferencia). R2: suscripción del coach automatizada; comisión % (split) solo si se valida. Stripe no opera para empresas colombianas (a verificar). |
| Legal | Datos de salud y fotos = **datos sensibles** (Ley 1581/2012): autorización explícita, por categoría, revocable. Fotos **nunca** compartidas por defecto. |
| R1 | HU-P01…HU-P08: auth + sync + código de invitación + consentimiento + panel con semáforo + ficha + comentarios + exportar/borrar. ~3 sprints de 2 semanas, **después** de R0 (entrevistas + piloto concierge, que no necesita servidor). |

---

## 1. Requisitos técnicos derivados

### 1.1 Multi-tenant (coach → clientes)
- **Tenant = organización del coach.** Hoy cada coach es una organización de una persona; modelarlo como
  organización (y no como "usuario coach") permite a futuro gimnasios con varios coaches sin migrar datos.
- Un **cliente** es un usuario normal que tiene una **relación** con un coach (`coach_clients`). Los datos del cliente
  **pertenecen al cliente**, no al coach: si cambia de coach, se lleva su historial y el coach anterior pierde el acceso.
- Un cliente tiene como máximo **un coach activo** en R1 (simplifica consentimiento y panel). Varios coaches = futuro.
- El aislamiento entre tenants se aplica **en la base de datos** (RLS), no solo en la interfaz.

### 1.2 Roles
| Rol | Puede | No puede |
|---|---|---|
| **Cliente** | CRUD de sus datos; gestionar consentimientos; aceptar/rechazar invitación; terminar relación; exportar y borrar su cuenta. | Ver datos de otros. |
| **Coach** | Invitar clientes; ver **solo** las categorías que cada cliente activo le compartió; comentar. | Editar datos del cliente; ver clientes de otro coach; ver datos tras terminar la relación. |
| **Admin (plataforma)** | Gestionar organizaciones, planes, soporte de cuentas, moderación (R4). | **Ver datos de salud o fotos desde la app.** El acceso técnico (clave `service_role`) queda restringido a operaciones, con registro de auditoría. Privacidad por diseño. |

### 1.3 Invitaciones (HU-P02 / HU-P03)
- El coach tiene un **código corto reutilizable** (6 caracteres, alfabeto sin ambigüedades tipo `0/O`, `1/I`) y un enlace
  `https://<dominio>/unirse#<código>` para pegar en WhatsApp. Puede **regenerarlo**: el anterior deja de servir para nuevos
  vínculos. Con 6 caracteres de 31 símbolos hay ~887 millones de combinaciones: suficiente si se limita el número de
  intentos por usuario/IP (rate limiting en la función) para evitar adivinarlos.
- El cliente ve el **nombre del coach antes de confirmar** (`preview_invite_code(code)` devuelve solo nombre comercial).
- Flujo: código o enlace → si no hay sesión, login OTP → **consentimiento por categoría** (peso y medidas obligatorio,
  fotos desmarcado) → `accept_invite_code(code, consentimientos)` (función SQL atómica) → relación `active`.
- En el plan gratis, superar 5 clientes **no bloquea** durante el piloto: solo marca la organización para el aviso.
- Si el cliente ya usaba la app sin cuenta, al aceptar se ofrece subir sus datos locales (ver §4).
- iOS: el enlace abre Safari, no la PWA instalada. Por eso la invitación debe poder completarse en Safari **y**
  después iniciar sesión en la PWA con el mismo email (OTP). El token no depende de cookies.

### 1.4 Autenticación (ojo iPhone)
- **Primario: código OTP por email** (6 dígitos, se teclea dentro de la app). Motivo: en una PWA instalada en iOS el
  contexto de almacenamiento es **distinto** al de Safari; un enlace mágico abierto desde Mail inicia sesión en Safari,
  no en la app instalada. El OTP evita el problema. Supabase Auth soporta OTP por email.
- **Google / Apple:** añadir después de validar el flujo OAuth en una PWA *standalone* de iOS (redirecciones que
  terminan en Safari; a verificar con pruebas reales). "Sign in with Apple" solo es **obligatorio** si hay app nativa en
  App Store que ofrezca otros logins sociales (guía 4.8), no para la PWA.
- Email transaccional propio (SMTP de Resend/Postmark/SES): el SMTP por defecto de Supabase tiene límites muy bajos
  (a verificar). Configurar SPF/DKIM del dominio.
- Sesión persistente (refresh token en almacenamiento local). Sesión de coach en escritorio con caducidad más corta.
- MFA opcional para coaches y obligatorio para admin (R2).

### 1.5 Sincronización local-first / offline
- La UI lee y escribe **solo en local** (como hoy). La sincronización corre al abrir la app, al volver a primer plano
  (`visibilitychange`), al recuperar red (`online`) y tras cada guardado (con *debounce*). iOS **no** tiene Background
  Sync API: no se promete sincronización en segundo plano.
- Varios dispositivos por usuario; resolución **last-write-wins por registro** (detalle en §4).
- Indicador visible: "Sincronizado hace 2 min" / "Sin conexión, se subirá luego" / "Error: reintentar".
- Una PWA instalada en iOS no sufre el borrado de 7 días de ITP, pero el servidor pasa a ser la **copia de seguridad
  real** (resuelve el riesgo A1 de `arquitectura.md` para usuarios con cuenta).

### 1.6 Fotos privadas
- Bucket **privado**; ruta `photos/{user_id}/{photo_id}.jpg`; lectura solo con **URL firmada de corta duración**
  (≤ 5 min). Nunca URLs públicas.
- **Doble opt-in independiente:** (a) "Guardar mis fotos en la nube" (copia de seguridad) y (b) "Compartir fotos con
  mi coach". Por defecto ambos **desactivados**. (b) exige (a).
- La compresión actual por canvas (`photos.js`) ya elimina EXIF/GPS: mantenerlo como requisito y probarlo.
- Registro de auditoría cuando el coach abre una foto (el cliente puede verlo: "Tu coach vio tus fotos el 3 nov").
- Subida diferida y reanudable; opción "solo con Wi-Fi" (a futuro).

### 1.7 Retos y feed de comunidad (futuro, R3–R4)
- Retos: entidad por organización (reto del coach) o global; métricas **derivadas** (días con registro, pasos, % de
  cambio), nunca peso absoluto ni fotos sin opt-in explícito por publicación.
- Feed: publicaciones, reacciones, comentarios, **denuncias y moderación** (coste operativo real), bloqueo de usuarios,
  ámbito por organización antes que global. Requiere política de contenido y términos de uso.
- Diseñar ya los ids (UUID) y el `org_id` en todas las tablas para que esto no obligue a migrar.

### 1.8 Notificaciones push en iOS
- Web Push funciona en iOS/iPadOS **16.4+ solo si la PWA está añadida a la pantalla de inicio** y el usuario concede
  permiso tras un gesto (botón). No hay aviso de instalación automático en iOS: hace falta una pantalla guiada
  "Compartir → Añadir a pantalla de inicio".
- Servidor: claves VAPID, tabla `push_subscriptions`, envío desde una función (Supabase Edge Function o worker).
- Casos: "Tu coach comentó", recordatorio de pesaje, nuevo reto. **R2** (no bloquea el MVP; en R1 basta email).
- Riesgo: tasa de opt-in baja en iOS por la fricción de instalación → medirlo; es uno de los disparadores de §5.

### 1.9 Cobros
- Ver §6. Requisitos técnicos mínimos: webhook firmado del proveedor → tabla `subscriptions`; el acceso del coach
  (número de clientes activos permitidos) depende del estado de la suscripción. Nunca guardar datos de tarjeta.

### 1.10 Requisitos no funcionales
- Latencia aceptable desde Colombia (región cercana: São Paulo o us-east; a verificar).
- Copias de seguridad diarias de la base con retención ≥ 7 días; prueba de restauración trimestral.
- Entornos `staging` y `prod` separados; migraciones SQL versionadas en el repo.
- Observabilidad mínima: errores de cliente (p. ej., Sentry plan gratuito, sin datos de salud en los eventos).

---

## 2. Comparación de opciones

Escenarios: **A** = 10 coaches / 300 clientes; **B** = 100 coaches / 5.000 clientes.
Supuestos de volumen: ~1 KB por registro diario; fotos ~200 KB, 3 por semana por cliente que las sube (~40 % de los
clientes) → A ≈ 4 GB/año de fotos, B ≈ 60–70 GB/año.

| Criterio | **Supabase** (gestionado) | **PocketBase** autoalojado | **API propia** (Node + Postgres) |
|---|---|---|---|
| Tiempo hasta MVP (R1) | **~5–6 semanas.** Auth OTP, RLS, Storage con URLs firmadas y SDK ya existen. | ~6–8 semanas. Auth, reglas y ficheros incluidos; hay que montar servidor, TLS, copias y monitorización. | ~10–14 semanas. Auth, sesiones, invitaciones, almacenamiento firmado, rate limiting, migraciones, panel admin: todo a mano. |
| Coste A | **~USD 25–35** (plan Pro USD 25 con crédito de cómputo para 1 instancia Micro; a verificar) + email ~0–20. | **~USD 6–15** (VPS pequeño + almacenamiento de objetos para copias). | ~USD 20–50 (Postgres gestionado + hosting Node + S3/R2). |
| Coste B | **~USD 60–150** (Pro + cómputo Small/Medium + exceso de storage/egreso; MAU muy por debajo de los 100k incluidos; a verificar). | ~USD 25–60 (VPS mayor + objetos). **Límite:** un solo nodo SQLite; escalar en horizontal no es posible. | ~USD 100–250 (BD con réplica, 2 instancias, objetos, logs). |
| Seguridad / aislamiento | **RLS de Postgres:** la regla vive en la BD y se aplica a toda consulta, incluida la API autogenerada. Probada y auditable con SQL. Riesgo: una tabla sin RLS queda expuesta (mitigable con test de CI que lo detecte). | "API rules" por colección (filtros tipo `@request.auth.id = user`). Suficientes, pero menos expresivas para "coach con consentimiento activo por categoría" y no aplican a nivel de BD. | Depende del código: cada endpoint debe filtrar bien; un olvido = fuga. Se puede usar RLS de Postgres también, pero hay que montarlo. |
| Vendor lock-in | **Medio-bajo.** Es Postgres estándar + SQL propio; Supabase es open source y autoalojable. Lo que más ata: Auth (usuarios en `auth.users`) y Storage (API propia). | **Bajo.** Open source (Go, licencia MIT), un binario. Pero el proyecto aún no tiene versión 1.0 y ha tenido cambios incompatibles (a verificar estado actual); depende de un mantenedor principal. | **Ninguno**, a cambio de mantenerlo todo. |
| Operaciones | **Mínimas:** parches, copias, TLS y escalado los gestiona el proveedor. | **Altas para un equipo sin SRE:** actualizaciones del SO y de PocketBase, copias a S3, restauraciones, monitorización, incidencias de madrugada. Datos sensibles en un VPS propio = toda la responsabilidad de seguridad. | **Las más altas:** todo lo de PocketBase + dependencias de Node + diseño de API. |
| Encaje con equipo de agentes | **Alto.** Todo es código revisable en el repo: migraciones SQL, políticas RLS, tests SQL; CLI de Supabase para entorno local (Docker). Documentación abundante. | Medio. Configuración en el panel admin (exportable a migraciones JS); menos ejemplos; el agente no puede "operar" un servidor 24/7. | Medio-bajo. Mucho código a generar y mantener = más superficie para errores de seguridad. |
| Realtime (comentarios, feed) | Incluido. | Incluido (SSE). | A construir. |
| Push / funciones | Edge Functions (Deno) o webhooks de BD. | Hooks en JS/Go dentro del binario. | Libre. |

### Recomendación: **Supabase gestionado**, con salvaguardas anti-lock-in

Criterio Lean:
1. **Minimizar tiempo hasta aprender.** La hipótesis a validar es "los coaches usan el panel y sus clientes registran
   más". Supabase llega a un piloto con coaches reales en la mitad de tiempo que una API propia.
2. **Evitar desperdicio operativo.** Ni el Stakeholder ni el equipo de agentes pueden operar un servidor con datos de
   salud 24/7. PocketBase ahorra ~USD 20/mes y cuesta horas humanas y riesgo de seguridad: mal intercambio.
3. **Seguridad donde vive el dato.** La regla "el coach solo ve lo consentido" es exactamente el caso de uso de RLS.
4. **Decisión reversible.** Salvaguardas:
   - Todo el esquema y las políticas en `supabase/migrations/*.sql` (nunca cambios a mano en el panel).
   - El cliente habla con el servidor solo a través de `js/data/remote.js` (interfaz `pull(since)`, `push(changes)`,
     `uploadPhoto`, `signedUrl`). Cambiar de backend = reescribir ese módulo.
   - Lógica de negocio en SQL estándar o en el cliente; Edge Functions solo para lo inevitable (push, webhooks).
   - Ruta de salida documentada: Supabase autoalojado o Postgres + API propia con las mismas tablas.
5. **Coste predecible**: activar el *spend cap* y alertas de uso. No usar el plan gratuito en producción (se pausa por
   inactividad y no tiene copias; a verificar condiciones actuales).

Revisar la decisión si: el coste supera ~USD 300/mes, o aparece un requisito legal de residencia de datos en Colombia.

---

## 3. Modelo de datos propuesto (Postgres)

Convenciones: todas las tablas de datos de usuario llevan `id uuid` (generado en el cliente con `crypto.randomUUID()`),
`user_id`, `updated_at` (reloj del cliente, para LWW), `server_updated_at` (lo pone un trigger, cursor de *pull*) y
`deleted_at` (borrado lógico). Fechas de calendario como `date` local (`YYYY-MM-DD`), como hoy.

### 3.1 Identidad, tenants y relación
```
profiles        (id = auth.users.id, display_name, locale, is_platform_admin bool, created_at)
organizations   (id, name, owner_id → profiles, plan, created_at)                 -- el "tenant" del coach
org_members     (org_id, user_id, role: 'owner'|'coach', PK(org_id,user_id))
coach_clients   (id, org_id, coach_id, client_id, status: 'invited'|'active'|'ended',
                 started_at, ended_at, UNIQUE parcial (client_id) WHERE status='active')  -- 1 coach activo
invite_codes    (org_id, coach_id, code UNIQUE, active bool, created_at, revoked_at)   -- 1 activo por coach
invite_attempts (user_id, ip_hash, created_at)                                        -- rate limiting
share_consents  (coach_client_id PK/FK, body bool, nutrition bool, habits bool, notes bool, photos bool,
                 updated_at)                                         -- estado actual por categoría
consent_events  (id, user_id, coach_client_id NULL, kind: 'terms'|'privacy'|'sensitive_data'|'share_<cat>'|
                 'photos_cloud', granted bool, policy_version, created_at)   -- historial inmutable (prueba de autorización)
```

### 3.2 Datos del cliente (espejo del estado local actual)
| Tabla | Clave natural | Origen en `app.js` |
|---|---|---|
| `health_profile` (user_id PK, sex, birth_year/age, height, start_weight, goal_weight, start_date, activity, rate, updated_at…) | `user_id` | `state.profile` |
| `body_entries` (id, user_id, date, weight, waist, neck, hip, body_fat, note…) | **UNIQUE(user_id, date)** (hoy 1 por fecha) | `state.entries` |
| `food_items` (id, user_id, date, meal, name, kcal, protein, carbs, fat…) | `id` | `state.foods[date][]` |
| `habits` (id, user_id, date, steps, water, sleep, trained…) | **UNIQUE(user_id, date)** | `state.habits[date]` |
| `food_library` (id, user_id, name_key, name, kcal, protein, carbs, fat…) | **UNIQUE(user_id, name_key)** | `state.library` |
| `photos` (id, user_id, date, pose, storage_path, width, height, created_at, updated_at, deleted_at) | `id` | IndexedDB `photos` |

### 3.3 Coach y futuro
```
coach_comments     (id, coach_client_id, author_id, target: 'day'|'entry'|'photo'|'general', target_date, target_id,
                    body, created_at, read_at, deleted_at)
photo_access_log   (id, photo_id, viewer_id, viewed_at)
push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent, created_at)            -- R2
subscriptions      (id, org_id, provider, external_id, status, seats, current_period_end)   -- R2
challenges, challenge_participants, posts, post_reactions, reports, blocks                  -- R3/R4
```

### 3.4 Políticas de acceso (RLS)

Función auxiliar (`SECURITY DEFINER`, `search_path` fijo, solo lectura):
```sql
create function coach_can_see(p_client uuid, p_scope text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from coach_clients cc
    join share_consents sc on sc.coach_client_id = cc.id
    where cc.client_id = p_client
      and cc.coach_id  = auth.uid()
      and cc.status    = 'active'
      and case p_scope when 'body' then sc.body when 'nutrition' then sc.nutrition
                       when 'habits' then sc.habits when 'notes' then sc.notes
                       when 'photos' then sc.photos else false end
  );
$$;
```

| Tabla | SELECT | INSERT / UPDATE / DELETE |
|---|---|---|
| `body_entries` | `user_id = auth.uid() OR coach_can_see(user_id,'body')` | solo `user_id = auth.uid()` |
| `food_items`, `food_library` | dueño `OR coach_can_see(user_id,'nutrition')` | solo dueño |
| `habits` | dueño `OR coach_can_see(user_id,'habits')` | solo dueño |
| `health_profile` | dueño `OR coach_can_see(user_id,'body')` (objetivo y altura son necesarios para interpretar) | solo dueño |
| `photos` + `storage.objects` (bucket `photos`) | dueño `OR coach_can_see(owner,'photos')` | solo dueño; ruta debe empezar por `auth.uid()` |
| `share_consents` | cliente y coach de la relación | **solo el cliente** (UPDATE); se crea en `accept_invite_code` |
| `coach_comments` | cliente y coach de la relación | INSERT solo coach con relación `active`; UPDATE `read_at` solo cliente |
| `coach_clients` | cliente y coach | el cliente puede pasar a `ended`; el coach puede pasar a `ended`; alta solo vía `accept_invite_code` |
| `invite_codes` | coach de la org | gestión solo por el coach dueño; los clientes nunca leen la tabla (usan `preview_invite_code`) |
| `consent_events` | dueño | INSERT solo dueño; **sin UPDATE/DELETE** |

Notas:
- La columna `note` de `body_entries` es texto libre y puede contener datos muy personales: se expone al coach solo con
  `notes = true` (implementado con una vista `coach_body_entries` que pone `note = null` si no hay consentimiento, o
  separando las notas en su propia tabla — decidir en el refinamiento; la vista es lo más simple).
- Al terminar la relación (`ended`) o revocar una categoría, el acceso se corta **inmediatamente** porque la función se
  evalúa en cada consulta. Los datos no se copian al coach nunca.
- El rol admin no tiene política de lectura sobre tablas de salud. Soporte excepcional = `service_role` + registro.
- **Test de CI obligatorio:** consulta a `pg_tables` que falla si alguna tabla de `public` no tiene RLS activado, y
  suite de pruebas con 4 usuarios (cliente A, cliente B, coach de A, coach X) que verifica cada fila de la tabla.

---

## 4. Estrategia de migración desde la app local

### 4.1 Paso previo en local (sin servidor) — encaja con S1-1 del Dev Backend
Una migración de esquema (`schemaVersion` N → N+1, en `schema.js`) que deja los datos listos para sincronizar:
1. **ids:** todo registro sin UUID recibe `crypto.randomUUID()`. Los ids antiguos de 8 caracteres solo se usan para
   borrar/editar en la propia sesión, no hay referencias cruzadas: se pueden reemplazar sin tabla de equivalencias
   (verificar en el refinamiento que nadie más los referencia). Las fotos ya tienen `id` propio: convertir igual.
2. **`updatedAt`** (epoch ms) en cada registro: valor inicial = `0` para datos antiguos (así cualquier edición real
   posterior, de cualquier dispositivo, gana).
3. **Borrado lógico:** borrar = poner `deletedAt` y `updatedAt`; la UI filtra `deletedAt`. Sin esto un borrado en el
   móvil "resucita" desde el portátil. Purga de tombstones locales tras confirmación del servidor + 90 días.
4. **Normalizar a colecciones con clave natural:** `foods[date][]` → lista de items con `date`; `habits[date]` y
   `library[name]` conservan su clave natural (fecha / nombre en minúsculas) además del `id`.
5. Metadatos de sync en una clave aparte: `perdida-grasa:sync = { userId, deviceId, lastPulledAt, lastPushedAt }`.
6. Test con fixtures v1 en `tests/fixtures/` (regla de `arquitectura.md §5.3`).

Recomendación: aprovechar el permiso de módulos ES para mover el estado a **IndexedDB** en el mismo release R1
(localStorage tiene ~5 MB y es síncrono; con metadatos de sync y años de comidas se acerca al límite). Hacerlo como
migración aparte, con copia `backup-v<N>`.

### 4.2 Protocolo de sincronización (simple, sin cola explícita)
- **Push:** enviar todos los registros con `updatedAt > lastPushedAt` (incluye tombstones) en lotes de ≤ 500, vía una
  función SQL `sync_push(table, rows jsonb)` que hace `INSERT … ON CONFLICT (clave natural) DO UPDATE … WHERE
  excluded.updated_at > tabla.updated_at`. Devuelve las filas que **perdieron** (el servidor tenía una más nueva).
- **Pull:** `select … where user_id = me and server_updated_at > lastPulledAt order by server_updated_at`. El cursor usa
  el reloj del **servidor** (evita perder cambios por relojes desajustados).
- **Merge local:** por registro, gana el `updatedAt` mayor; empate → gana el `deviceId` mayor (determinista). Función
  pura `merge(local, remote)` en `js/core/sync.js` con tests de Node (mismo patrón que `calc.js`).
- **Conflicto en claves naturales** (dos dispositivos crean el pesaje del mismo día offline con UUID distintos): el
  servidor resuelve por `(user_id, date)` y conserva el `id` existente; el cliente, al hacer pull, sustituye su UUID
  local por el del servidor.
- **Granularidad:** LWW por **registro completo**, no por campo. Aceptable para un usuario con 1–2 dispositivos; documentar
  que editar el mismo registro en dos móviles offline conserva solo la última edición.
- **Riesgo de reloj:** un dispositivo con la hora muy adelantada "gana" siempre. Mitigación: el servidor rechaza
  `updated_at` > ahora + 5 min y lo recorta.
- **Fotos:** cola propia: subir el blob a Storage (ruta determinista por `id`, idempotente) → después upsert de la fila.
  Solo si el usuario activó "Guardar fotos en la nube". En otro dispositivo se descargan bajo demanda (miniatura primero).

### 4.3 Primera vinculación ("adopción" de datos locales)
1. El usuario inicia sesión por primera vez en un dispositivo con datos → **export JSON automático** a la copia local
   (`backup-pre-sync`) y aviso: "Vamos a guardar tus datos en tu cuenta".
2. Si la cuenta está vacía: push de todo. Si la cuenta ya tiene datos (segundo dispositivo): pull + merge LWW + push.
3. Si el dispositivo tenía datos de **otra** cuenta (cambio de usuario): no mezclar; preguntar "¿Borrar los datos de este
   dispositivo o cancelar?".
4. **Modo sin cuenta se mantiene**: quien no tiene coach puede seguir usando la app 100 % local (recomendado, decisión §9).
5. Cerrar sesión: ofrecer "mantener datos en este dispositivo" o "borrarlos" (importante en móviles compartidos).

Nada de esto bloquea el uso offline: la UI nunca espera al servidor; si la sync falla, se reintenta con *backoff*.

---

## 5. ¿PWA o app nativa?

| Aspecto | PWA (hoy) | Nativa / envoltorio (Capacitor) |
|---|---|---|
| Push en iPhone | Sí desde iOS 16.4, **solo instalada** en pantalla de inicio; fricción de instalación sin aviso automático. | Push nativo (APNs), fiable, sin instalación manual. |
| Distribución | Enlace del coach → abrir → "Añadir a inicio". Sin revisión de Apple; despliegue inmediato. | App Store: descubrimiento y confianza; revisiones de días; cuenta de desarrollador USD 99/año (a verificar). |
| Pagos | Libres (cualquier pasarela). | Guía 3.1.1: suscripciones a **contenido/funciones digitales** vendidas dentro de la app deben usar In-App Purchase (comisión 15–30 %). Excepciones posibles: 3.1.3(d) *servicios persona a persona en tiempo real* (el coaching 1:1 podría encajar; **a verificar** caso a caso) y 3.1.3(a/b) apps "multiplataforma" donde se compra fuera y se usa dentro, **sin** enlazar al pago externo (en EE.UU. las reglas sobre enlaces externos cambiaron en 2025; en Colombia aplica la regla general; a verificar). |
| Integraciones | Sin HealthKit (peso/pasos de Apple Salud), cámara vía `<input capture>`. | HealthKit, widgets, recordatorios locales fiables. |
| Rechazo de tienda | — | Guía 4.2: una web envuelta sin funciones nativas puede ser rechazada. |
| Coste | Ya existe. | Envoltorio Capacitor: ~2–4 semanas + mantenimiento continuo de builds y revisiones; nativo Swift: un equipo aparte. |

**Recomendación por fases:**
- **R1–R3: PWA.** El panel del coach es web de escritorio de todas formas. Invertir en una pantalla de instalación guiada
  para iPhone y medir: % de clientes que instalan, % que aceptan push.
- **Punto de decisión (tras R2):** pasar a envoltorio **Capacitor** (reutiliza el 95 % del código) si se cumple alguna:
  instalación < 50 % de clientes activos en iPhone, opt-in de push bajo, o demanda fuerte de sincronizar con Apple Salud.
- **Cobro fuera de la app** en cualquier caso: el coach (o la plataforma) cobra por web/link de pago; la app nativa no
  vende nada dentro. Revisar con alguien experto en las guías de Apple antes de publicar.
- Nativo puro (Swift/Kotlin): no se justifica en el horizonte visible.

---

## 6. Cobros

### 6.1 Opciones (Colombia como supuesto)
| Proveedor | Disponibilidad para empresa colombiana | Split coach / plataforma | Suscripciones recurrentes | Notas |
|---|---|---|---|---|
| **Stripe / Stripe Connect** | Según fuentes de terceros, **no** admite cuentas de empresas en Colombia (**a verificar** en la lista oficial). Vía alternativa: LLC en EE.UU. (Stripe Atlas) → complejidad fiscal y cambiaria. | Connect es el mejor producto de split, pero exige plataforma en país soportado y cuentas conectadas en países soportados (a verificar si coaches en Colombia pueden recibir). | Excelente (Billing). | Solo si la empresa se constituye fuera o si el mercado principal deja de ser Colombia. |
| **Mercado Pago** | Sí, opera en Colombia. | **Split de pagos 1:1 (marketplace)**: su documentación lista Colombia. | Suscripciones (preapproval) disponibles en algunos países (a verificar en Colombia y su compatibilidad con split). | Cada coach necesita cuenta de Mercado Pago y vincularla (OAuth). Opción más directa para split en Colombia. |
| **Wompi** (Bancolombia) | Sí, colombiana. PSE, tarjetas, Nequi, Bancolombia. | No encontré split de marketplace documentado; tiene "pagos a terceros" (dispersión/pay-outs) por API (a verificar). | Cobro recurrente con tarjeta tokenizada (a verificar). | Muy buena aceptación local (PSE/Nequi). Split se podría emular cobrando todo y dispersando, pero entonces la plataforma recauda dinero de terceros (implicaciones fiscales/regulatorias). |
| **PayU Latam** | Sí, opera en Colombia. | Tiene productos de marketplace/split en algunos países (**a verificar** en Colombia). | Sí (a verificar). | Integración más pesada; comisiones a verificar. |
| (otros) ePayco, Bold | Colombianos. | A verificar. | A verificar. | Evaluar solo si los anteriores fallan. |

Comisiones actuales de todos: **a verificar** en el momento de decidir.

### 6.2 Modelos de negocio (alineado con `vision-plataforma.md §2`)
1. **SaaS al coach = modelo B+C del Analista** (recomendado para validar primero): la app es gratis para el coach hasta N clientes y luego paga una tarifa
   mensual por cliente activo (o tramos). El coach sigue cobrando a sus clientes como hoy (transferencia, Nequi, etc.).
   La plataforma no toca el dinero de los clientes. Implementación: link de pago / suscripción de Wompi o Mercado Pago
   al coach + webhook → `subscriptions`. Facturación electrónica DIAN a coaches (a verificar con contador).
2. **Marketplace con split**: el cliente paga dentro de la plataforma y el pago se reparte (coach X %, plataforma Y %).
   Mayor valor para el coach (cobro automatizado), pero: onboarding/KYC de cada coach, reembolsos, contracargos,
   impuestos y facturación por dos partes, soporte. Solo con Mercado Pago split (u otro validado).
3. **Freemium al cliente final**: descartado a corto plazo (contradice "la app se regala vía el coach").

### 6.3 Fuera del MVP (R1)
Todo cobro **dentro** de la app. En R1 se cobra al coach **por fuera** (link de pago de Wompi/Mercado Pago o
transferencia) y el estado se marca a mano en `organizations.plan` (+ fecha de pago). Lo único que construye R1 es el
**conteo de clientes activos por coach** (definición de "activo" = registró ≥ 1 vez en los últimos 30 días, a confirmar
con el Analista) para poder facturar. R2: suscripción automatizada con webhook. Modelo 2 (comisión/split) solo si los
coaches lo piden y hay ≥ 20 coaches pagando.

---

## 7. Privacidad y legal (alto nivel — **no es asesoría legal**; validar con abogado en Colombia)

- **Datos sensibles.** Peso, % de grasa, medidas, alimentación y sobre todo **fotos corporales** son datos relativos a la
  salud → **datos sensibles** (Ley 1581 de 2012, art. 5). Su tratamiento exige **autorización previa, expresa e
  informada** (art. 6), indicando que es facultativo responder; no se puede condicionar el servicio a datos sensibles
  más allá de lo necesario. Reglamentación en el Decreto 1377 de 2013 (compilado en el Decreto 1074 de 2015).
- **Consentimiento en la app:** pantalla explícita (no casillas premarcadas), por categoría y revocable; registro
  inmutable en `consent_events` con versión de la política (prueba de la autorización).
- **Roles legales:** definir quién es Responsable del tratamiento (¿la plataforma, el coach o ambos?) y quién Encargado.
  Afecta a contratos con coaches (acuerdo de tratamiento de datos) y a la política de privacidad. **Decisión legal.**
- **Política de tratamiento de datos** publicada, canal para consultas y reclamos (plazos legales de respuesta), y
  revisar obligación de inscripción en el Registro Nacional de Bases de Datos de la SIC (depende del tamaño de la
  empresa; a verificar).
- **Transferencia internacional:** alojar en Brasil o EE.UU. es transferencia internacional de datos (art. 26); requiere
  país con nivel adecuado según la SIC, o consentimiento expreso / contrato (a verificar la lista vigente). Firmar el
  DPA del proveedor (Supabase lo ofrece; a verificar).
- **Menores de edad:** excluir < 18 años en R1 (términos + fecha de nacimiento); los datos de menores tienen régimen especial.
- **GDPR** (si hay usuarios en la UE): datos de salud = categoría especial (art. 9) → consentimiento explícito,
  evaluación de impacto (DPIA), posible representante en la UE (art. 27), DPA con encargados. Recomendación: **no**
  dirigirse a la UE en R1–R2.
- **Derechos del titular, ya en R1:**
  - **Exportación:** reutilizar el export JSON/CSV actual, ahora desde el servidor (incluye fotos).
  - **Borrado de cuenta** dentro de la app: borra filas, fotos de Storage y usuario de Auth (función SQL + job de Storage);
    copias de seguridad caducan en ≤ 30 días (documentarlo). Apple lo exige también para apps nativas con cuentas.
  - **Revocar** acceso del coach con un toque; efecto inmediato.
- **Seguridad mínima:** TLS, cifrado en reposo del proveedor, URLs firmadas, MFA para admin, registro de accesos a fotos,
  ningún dato de salud en logs/analítica, plan de respuesta a incidentes (aviso a la SIC y a titulares).
- No hay cifrado de extremo a extremo (el coach necesita ver los datos): decirlo con claridad en la política.

---

## 8. Plan técnico por releases

Estimaciones en sprints de 2 semanas, a revisar en el refinamiento.

### R0 — Descubrimiento (sin servidor; en paralelo con Sprint 1–2)
Regla Lean del Analista: **no se construye E1/E2 hasta validar H1 y tener el piloto concierge (H2/H3) en marcha.**
Trabajo técnico que sí se hace en R0 porque sirve con o sin plataforma:
- Terminar S1-1 (`schemaVersion`) e incluir ya la migración de §4.1 (UUID, `updatedAt`, `deletedAt`): es barata y evita
  una segunda migración.
- HU-06 / HU-07 como **funciones puras** (`js/domain/summary.js`, `js/domain/semaforo.js`) con tests: sirven al piloto
  concierge (resumen manual del coach a partir del export) y después al panel.
- Kit del piloto: export CSV/JSON con `schemaVersion` y resumen semanal listo para pegar en un Sheet.
- Proyecto Supabase de `staging` + borrador del SQL de §3 (solo prototipo, sin usuarios reales) para reducir el riesgo
  técnico de RLS mientras se valida el negocio. Timebox: 1 semana.

### R1 — MVP coach (≈ 3 sprints) = HU-P01…HU-P08
**Objetivo y métrica (del Analista):** ≥ 5 coaches activos con ≥ 5 clientes cada uno que registran ≥ 3 días/semana
durante 4 semanas.

| HU | Pieza técnica principal |
|---|---|
| HU-P01 Cuenta de coach | Auth OTP email, `organizations` + `org_members`, aceptación de términos (`consent_events`). |
| HU-P02 Código de invitación | `invite_codes`, regenerar, contador de clientes vs. límite gratis. |
| HU-P03 Vínculo + consentimiento | `accept_invite_code`, `share_consents`, desvincular, cambio de consentimiento con efecto inmediato (RLS). |
| HU-P04 Nube y varios dispositivos | Migración local §4.1, `sync.js` + `remote.js`, adopción de datos locales (§4.3); también usuario **sin coach** (solo copia). |
| HU-P05 Panel con semáforo | Vista SQL/consulta agregada por cliente + `semaforo.js` puro compartido; móvil y escritorio. |
| HU-P06 Ficha del cliente | Reutiliza gráficos y `calc.js`/`summary.js`; solo lectura. |
| HU-P07 Comentarios | `coach_comments` con `read_at`; aviso por email (push en R2). |
| HU-P08 Exportar / borrar | Export desde servidor; función de borrado de cuenta + Storage. |
| Fotos en panel | **Opcional (R1.1)** según H5: el modelo y las políticas ya las soportan; solo se activa la UI. La copia de fotos en la nube del propio cliente sí puede ir en R1 si hay capacidad. |

| Agente | Trabajo en R1 |
|---|---|
| **Arquitecto** | Contrato de `remote.js` y de `sync.js`; revisión de cada migración SQL y política RLS; checklist de seguridad; ADR "Supabase". |
| **Dev Backend** | Terminar S1-1 (`schemaVersion`) y añadir la migración local §4.1 (UUID, `updatedAt`, `deletedAt`). Proyecto Supabase `staging`/`prod` + CLI local. Migraciones SQL del §3, función `coach_can_see`, políticas RLS, `sync_push`, `accept_invite_code` + `preview_invite_code` con rate limiting, conteo de clientes activos, borrado de cuenta. Bucket `photos` privado + políticas. SMTP propio y plantillas OTP/invitación. Módulos cliente `js/core/sync.js` (puro, con tests) y `js/data/remote.js`. Test de CI "ninguna tabla sin RLS". |
| **Dev Frontend** | Paso a módulos ES y división incremental de `app.js` (M2). Pantallas: login OTP, introducir código / abrir enlace + consentimiento por categoría, ajustes de privacidad (compartir, fotos en la nube, revocar, exportar, borrar cuenta), indicador de sincronización. Guía de instalación en iPhone. **Panel del coach** (`coach.html`, usable en móvil y escritorio): lista con semáforo (rojos primero), peso, cambio de tendencia 7 d, cintura, días con registro en 7, último registro; detalle de cliente de solo lectura reutilizando gráficos/`calc.js`; hilo de comentarios. |
| **QA** | Matriz RLS automatizada (4 usuarios × cada tabla × cada operación; revocar consentimiento; terminar relación; coach de otra org). E2E Playwright: offline → online, dos "dispositivos" con conflicto LWW, borrado que no resucita, adopción de datos locales, cambio de cuenta. Pruebas manuales en iPhone real (iOS 16.4+ y la última): PWA instalada vs Safari, OTP, fotos, tras 8 días sin abrir. Fixtures de migración v1 → vN. Comprobar que las fotos subidas no tienen EXIF y que las URLs firmadas caducan y no funcionan sin sesión. |

Fuera de R1: push, cobros dentro de la app, fotos en el panel (salvo H5 → R1.1), edición por parte del coach, planes/pautas asignadas por el coach, chat en tiempo real,
Google/Apple login, varios coaches por cliente.

### R2 — Cobros y retención (≈ 2 sprints)
Suscripción del coach dentro de la app (tramos B+C) con pasarela local + webhook + límites por plan; comisión/split
(modelo A) solo si los coaches lo piden. Web Push (iOS instalada) para
comentarios y recordatorios. Login con Google (y Apple si se valida en PWA). MFA para coaches/admin. Panel admin mínimo
(organizaciones, plan, estado). **Punto de decisión PWA vs Capacitor (§5).**

### R3 — Retos (≈ 2 sprints)
Retos por organización con métricas derivadas y opt-in de participación; ranking por constancia, no por kilos.
Notificaciones de reto.

### R4 — Comunidad (≈ 3+ sprints)
Feed por organización, reacciones, denuncias, bloqueo y moderación (herramientas para coach y admin), términos de
contenido. Evaluar envoltorio nativo si las métricas de push/instalación lo justifican.

---

## 9. Riesgos principales

| # | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| R-1 | **Fuga de datos sensibles** por una política RLS mal escrita o tabla sin RLS. | Muy alto (legal y reputacional). | RLS por defecto, test de CI que lo verifica, matriz de QA, revisión del Arquitecto en cada migración, fotos solo con URL firmada. |
| R-2 | **Particularidades de iOS** (contexto de almacenamiento PWA ≠ Safari, OAuth, push solo instalada, sin sync en segundo plano). | Alto: login roto o usuarios que no reciben nada. | OTP en lugar de enlace mágico, guía de instalación, pruebas en iPhone real como criterio de Hecho. |
| R-3 | **Pérdida o duplicación de datos en la sync** (relojes, borrados, claves naturales). | Alto. | Tombstones, cursor por reloj del servidor, `merge` puro con tests, export automático antes de la primera sync. |
| R-4 | **Cumplimiento legal** (autorización de datos sensibles, transferencia internacional, rol del coach). | Alto. | Revisión por abogado antes del piloto con usuarios reales; consentimiento granular desde R1. |
| R-5 | **Cobros no disponibles o caros** en Colombia (Stripe) / complejidad del split. | Medio. | Empezar con SaaS al coach y pasarela local; split solo con demanda validada. |
| R-6 | **Alcance que crece** (comunidad, chat, planes) antes de validar que los coaches usan el panel. | Medio-alto (desperdicio). | R1 estricto; métricas de uso del piloto deciden R2–R4. |
| R-7 | Lock-in con Supabase. | Bajo-medio. | Salvaguardas de §2. |

### Decisiones que necesitan al Stakeholder (máx. 5)
1. **Modelo de ingresos:** confirmar B+C del Analista (gratis hasta 5 clientes, luego tarifa fija por cliente activo/mes,
   cobrada por fuera en R1) y aceptar que la comisión % (split) sea hipótesis de R2, no del MVP.
2. **País y entidad legal:** confirmar Colombia como mercado y si la empresa es (o será) una SAS colombiana. Determina
   pasarela (Stripe sí/no), facturación DIAN y obligaciones de datos. ¿Hay usuarios en la UE previstos? (Recomendado: no en R1–R2.)
3. **Aprobar Supabase gestionado** (~USD 25–35/mes al inicio + email) con datos alojados fuera de Colombia (São Paulo o
   EE.UU.), y presupuesto para una **revisión legal** (política de privacidad, autorización de datos sensibles, contrato
   con coaches) antes del piloto.
4. **¿Se mantiene el modo sin cuenta** (100 % local) para usuarios sin coach? Recomendado sí: conserva la propuesta de
   privacidad actual y no rompe a los usuarios existentes.
5. **Fotos en el MVP:** ¿el coach necesita ver fotos corporales en R1, o basta con peso/medidas/adherencia y las fotos
   quedan para R1.1 según el piloto (H5)? Recomendado: R1.1 (menos riesgo legal). Por defecto siempre opt-in del cliente.

---

## 10. Respuestas a @Analista (preguntas de `vision-plataforma.md §9`)

### 10.1 Backend multi-rol, permisos por fila, fotos y coste con 50 coaches × 20 clientes
- **Elección: Supabase gestionado** (§2). Roles cliente / coach / admin (§1.2); tenant = organización del coach.
- **El coach solo lee lo compartido:** RLS en Postgres con `coach_can_see(cliente, categoría)`, que exige relación
  `active` y consentimiento de esa categoría (§3.4). Revocar o desvincular corta el acceso en la siguiente consulta.
  El coach nunca escribe datos del cliente (HU-P06 "solo lectura" garantizado por la BD, no solo por la UI).
- **Fotos:** bucket privado, ruta por usuario, URL firmada ≤ 5 min, política de Storage con la misma función y
  registro de accesos (§1.6). Por defecto desactivadas.
- **Coste con 50 coaches × 20 clientes (1.000 clientes):** BD < 1 GB, fotos ~13 GB/año (supuesto: 40 % sube 3 fotos/semana
  de 200 KB), MAU muy por debajo de lo incluido → **~USD 30–50/mes** (plan Pro USD 25 + cómputo Micro/Small + algo de
  egreso) + email transaccional USD 0–20. *(a verificar en supabase.com/pricing)*. Comparación: PocketBase ~USD 10–20,
  API propia ~USD 40–100 más mucho más tiempo de desarrollo y operación.

### 10.2 Local-first sin romper el uso offline; conflictos
- La UI sigue leyendo/escribiendo solo en local; el servidor es una réplica (§1.5).
- Prerrequisito en la migración de S1-1/§4.1: `id` = `crypto.randomUUID()`, `updatedAt`, `deletedAt` (borrado lógico),
  metadatos de sync aparte. Fotos de IndexedDB con la misma convención.
- **Regla de conflictos: last-write-wins por registro completo** (no por campo), desempate por `deviceId`. Para registros
  de "uno por día" (pesaje, hábitos) la clave es `(usuario, fecha)`, así dos dispositivos que crean el pesaje del mismo
  día no lo duplican. Respuesta a HU-P04 "no se pierde el resto": solo se pierde la edición más antigua **del mismo
  registro**; el resto de registros se fusiona.
- Por qué no por campo: duplica la complejidad (marca de tiempo por campo) para un caso raro (mismo registro editado en
  dos móviles sin conexión). Revisable si QA o el piloto lo encuentran.
- Primera vinculación: export automático de seguridad y subida sin duplicar (§4.3).

### 10.3 Límites de iOS / PWA y App Store
- **Almacenamiento:** Safari puede borrar datos de un sitio **no instalado** tras ~7 días sin uso; instalado en pantalla
  de inicio no aplica esa regla. Con cuenta, el servidor es la copia real (resuelve HU-01 a largo plazo).
- **Push:** solo iOS 16.4+ y solo con la PWA instalada, permiso pedido tras un toque. No hay aviso de instalación
  automático: hace falta pantalla guiada. Sin sincronización en segundo plano: se sincroniza al abrir.
- **Enlace mágico:** abre Safari, cuyo almacenamiento es distinto al de la PWA instalada → la sesión no llega a la app.
  **Por eso HU-P01 debe usar código OTP de 6 dígitos**, no enlace mágico (propongo ajustar el criterio de aceptación).
  El enlace de invitación del coach sí funciona, porque el código viaja en la URL y se puede teclear.
- **¿Nativa / Capacitor antes de R4?** No por defecto. Punto de decisión tras R2 con métricas de instalación y opt-in de
  push (§5). Capacitor reutiliza casi todo el código.
- **App Store y E3:** en una app nativa, vender suscripciones digitales dentro de la app exige In-App Purchase (15–30 %).
  Posibles excepciones (servicios persona a persona; apps multiplataforma que no venden dentro) **a verificar**. Como el
  modelo B+C cobra **al coach por fuera** y el cliente no compra nada en la app, el riesgo es bajo; en la PWA no aplica.

### 10.4 Datos de salud (región, cifrado, consentimiento, borrado, Ley 1581)
- **Región:** São Paulo o EE.UU. (no hay región de Supabase en Colombia, a verificar) → **transferencia internacional**
  (art. 26 Ley 1581): país con nivel adecuado según la SIC o autorización expresa/contrato; firmar el DPA del proveedor.
- **Cifrado:** TLS en tránsito y cifrado en reposo del proveedor; URLs firmadas para fotos; sin cifrado de extremo a extremo
  (el coach tiene que ver los datos; decirlo en la política).
- **Consentimiento:** datos sensibles → autorización previa, expresa, informada y facultativa; por categoría; historial
  inmutable `consent_events` con versión de la política (cubre HU-P03 "fecha y versión").
- **Borrado completo (HU-P08):** filas + fotos de Storage + usuario de Auth en una función; copias de seguridad caducan
  ≤ 30 días; desvinculación automática del coach.
- Detalle y límites en §7. **Requiere revisión de un abogado antes del piloto con datos reales en el servidor** (H8).

### 10.5 Reutilizar `calc.js` en app del cliente y panel del coach
- **Sí, y es requisito:** ambas pantallas deben dar las mismas cifras. El panel calcula **en el navegador del coach** con
  los mismos módulos puros (`calc.js`, y nuevos `summary.js` para el resumen semanal de HU-06 y `semaforo.js` para
  HU-P05), servidos desde el mismo despliegue. No se duplica la lógica en SQL.
- Con módulos ES aprobados, `calc.js` pasa a exportar con `export` manteniendo compatibilidad con los tests de Node.
- Para que el panel con 20–60 clientes sea rápido, el servidor entrega solo los datos de las últimas ~5 semanas por
  cliente en una consulta; la ficha (HU-P06) pide el histórico completo de un cliente.
- Si en el futuro hiciera falta calcular en servidor (p. ej. ranking de retos o alertas push), se reutiliza el mismo
  módulo en una Edge Function (Deno ejecuta módulos ES), no se reescribe.
- Regla: las reglas del semáforo llevan tests con casos frontera (4/7 días, 14 días estancado, 5 días sin registro).

---

### Fuentes consultadas para los datos "a verificar"
- Stripe — disponibilidad por país: [support.stripe.com](https://support.stripe.com/questions/stripe-feature-availability-by-country); terceros que indican que no está disponible para empresas colombianas: [Global66](https://global66.com/blog/stripe-colombia/), [IncorpUK](https://incorpuk.com/blog/how-to-open-stripe-account-in-colombia/).
- Mercado Pago — Split de pagos 1:1 (Colombia): [mercadopago.com.co/developers](https://www.mercadopago.com.co/developers/es/docs/split-payments/split-1-1/overview).
- Wompi — pagos a terceros: [La República](https://www.larepublica.co/finanzas/wompi-lanza-un-servicio-que-facilitara-a-los-comercios-la-gestion-de-pagos-a-terceros-3928650), [Valora Analitik](https://www.valoraanalitik.com/wompi-lanza-servicio-que-permite-a-los-comercios-la-gestion-de-pagos-a-terceros/).
- Supabase — precios 2026 (fuentes secundarias; confirmar en supabase.com/pricing): [MakerKit](https://makerkit.dev/blog/saas/supabase-pricing), [JetAdmin](https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/).

---

## 11. SPIKE-02 (adenda) — Plataforma para varias apps

Fecha: 2026-10-21 · Base: `equipo/decisiones-negocio.md`. **Las secciones 0–10 no se reescriben.** Esta adenda las
corrige donde choca con las nuevas decisiones (se indica en 11.6).

### 11.1 Requisitos nuevos que cambian la evaluación
1. **Varias apps (2–5)** del mismo Stakeholder, alojadas de forma económica y, si conviene, **con cuentas compartidas**.
2. **Toda persona tiene cuenta** (cliente y coach). Se elimina el "modo sin cuenta", pero la app sigue siendo local-first.
3. **El coach ve fotos desde R1**, con consentimiento explícito del cliente.
4. **Solo Colombia**, USD 5 por cliente activo al mes. Fase 2: el cliente paga dentro de la app (reparto coach/plataforma).

Dos conceptos que conviene separar:
- **Cuenta compartida**: el mismo email/usuario sirve en todas las apps (una sola tabla de identidades). Es barato.
- **SSO de verdad**: si ya iniciaste sesión en la app A, entras en la app B sin volver a autenticarte. En dominios
  distintos exige un proveedor de identidad central con redirecciones (OIDC). Con login por código OTP, iniciar sesión en
  cada app cuesta 20 segundos: **la cuenta compartida basta para R1–R2**; el SSO real queda para cuando haya demanda.

### 11.2 Opciones evaluadas

**1a. Supabase, un proyecto por app.** Plan Pro por organización (USD 25/mes) que incluye USD 10 de crédito de cómputo:
cubre **un** proyecto Micro; cada proyecto adicional suma su propio cómputo (~USD 10/mes Micro). El ejemplo oficial da
USD 35/mes con dos proyectos Micro (a verificar en supabase.com/pricing). Aislamiento total entre apps, pero **cada
proyecto tiene su propio Auth**: no hay cuentas compartidas sin trabajo adicional (Supabase acepta JWT de proveedores
externos y ha anunciado funciones de proveedor OAuth/OIDC; si un proyecto puede servir de identidad a los demás está
a verificar).

**1b. Supabase, un proyecto compartido con un esquema por app.** Un solo `auth.users` → **cuentas compartidas de serie**.
Esquema `core` (perfiles, organizaciones, membresías y acceso por app, consentimientos, facturación) y un esquema por
app (`grasa`, `app2`…), expuestos en la API de datos. Un solo bucket por app o prefijo `app/{user}/…` en Storage. Coste:
el de un proyecto (escala el cómputo cuando haga falta). Contras: las apps comparten cuotas, copias de seguridad,
ventanas de mantenimiento y **radio de impacto** (una tabla sin RLS en cualquier app expone datos de todas);
migraciones de varias apps en un mismo repositorio de SQL.

**2. Render** (web services + Render Postgres + auth propia o librería). Varias apps en un mismo *workspace* y una base
Postgres puede alojar varias bases/esquemas. Precios aproximados (fuentes secundarias, **a verificar** en render.com/pricing):
web service Starter ~USD 7/mes (siempre encendido), Postgres de pago desde ~USD 6/mes (planes con más memoria
~USD 19+), plan de workspace Hobby USD 0 o Pro/Professional ~USD 19–25 por usuario. Plan gratuito: los servicios se
**duermen tras 15 min** sin tráfico y tardan ~1 min en despertar; el Postgres gratuito **caduca** (30 o 90 días según la
fuente): no sirve para producción. **Render no ofrece almacenamiento de objetos** con URLs firmadas: las fotos irían a
Cloudflare R2 o AWS S3 (R2: 10 GB gratis y sin coste de salida, a verificar). Auth, RLS (o filtros en la API), invitaciones,
sync y URLs firmadas hay que construirlos (Better Auth / Auth.js, o un servicio como Clerk/WorkOS, que añade coste y
otro proveedor). Regiones: Oregon, Ohio, Virginia, Frankfurt, Singapur; **ninguna en Sudamérica**.

**3. Combinación: Supabase (Auth + Postgres + Storage) + Render u otro hosting para frontends/APIs.** El frontend es
estático (PWA) y se puede servir gratis en Render Static Sites, Cloudflare Pages o el GitHub Pages actual. Render solo
añade valor si una app necesita un servidor de larga duración (procesos pesados, colas, websockets propios) que no encaje
en Supabase Edge Functions. Para estas apps hoy **no** es necesario: webhooks de pago y push caben en Edge Functions.

**4. Alternativa: Firebase (Auth + Firestore + Cloud Storage).** Un proyecto de Firebase admite varias apps con **Auth
compartido de serie**, el SDK de Firestore trae **caché offline y sincronización** (encaja con local-first), Storage con
reglas de seguridad. Precio por uso (plan Blaze): con ~1.000 usuarios suele quedar en USD 0–25/mes (a verificar).
Contras: base NoSQL (el panel del coach con agregados y la migración del esquema actual se complican), reglas de
seguridad menos expresivas que SQL+RLS para "coach con consentimiento por categoría", lock-in **alto** con Google.
Otra alternativa más barata y artesanal es Cloudflare (Workers + D1 + R2), pero exige construir auth y sync: misma
carga que Render.

### 11.3 Comparación

Supuestos: piloto = 2 coaches × 5 clientes por app; "~1.000 usuarios" = total entre todas las apps; fotos en R2/Storage
< 20 GB. Importes en USD/mes, sin email transaccional (USD 0–20) ni dominio. **Todos los precios: a verificar.**

| Criterio | 1a Supabase proyecto por app | 1b Supabase proyecto compartido | 2 Render + R2 + auth propia | 3 Supabase compartido + hosting estático | 4 Firebase |
|---|---|---|---|---|---|
| Coste piloto, 2 apps | ~35 | **~25** | ~20–60 (2×7 API + Postgres 6–19 + workspace 0–25) | **~25** (frontends gratis) | ~0–5 |
| Coste piloto, 5 apps | ~65 | **~25–40** | ~45–90 | **~25–40** | ~0–10 |
| Coste ~1.000 usuarios (5 apps) | ~75–110 | **~40–70** (subir a cómputo Small) | ~70–130 | **~40–70** | ~10–40 |
| Cuentas compartidas / SSO | No de serie (a verificar con OIDC) | **Sí** (un solo Auth); SSO real a futuro | Sí si se construye un servicio de auth central | **Sí** | **Sí** |
| Fotos privadas + URL firmada | Sí | Sí | Sí vía R2/S3 (a integrar) | Sí | Sí (reglas de Storage) |
| RLS / seguridad | RLS; aislamiento total entre apps | RLS; **radio de impacto compartido** (mitigable con test de CI en todos los esquemas) | A mano en cada endpoint | Como 1b | Reglas de seguridad (sin SQL) |
| Región / latencia desde Colombia | São Paulo o us-east (Virginia) | Igual | Solo EE.UU./UE/Asia: **Virginia** | Igual que 1b | southamerica-east1 o us-east1 |
| Ley 1581 (transferencia internacional) | Fuera de Colombia en todos los casos → requisito igual para todas las opciones; EE.UU. figura en la lista de países adecuados de la SIC (a verificar vigencia; Brasil a verificar) | | | | |
| Operación para equipo de agentes | Baja, pero N proyectos que mantener alineados | **Baja**: un proyecto, SQL en el repo | **Alta**: auth, sync, storage, parches de dependencias | **Baja** | Baja; reglas y datos NoSQL menos revisables |
| Lock-in | Medio-bajo (Postgres) | Medio-bajo | Bajo | Medio-bajo | **Alto** |
| Cold starts en planes baratos | Pro no se pausa; Edge Functions con arranque en frío corto (a verificar) | Igual | Gratis: duerme 15 min, ~1 min en despertar; Starter no duerme | Igual que 1b | Firestore sin arranque en frío; Cloud Functions sí |
| Tiempo hasta R1 | ~5–6 semanas (+ coste por app) | **~5–6 semanas** | ~10–14 semanas | **~5–6 semanas** | ~6–8 semanas (rehacer modelo de datos) |

**Latencia:** desde Bogotá suele haber menos latencia hacia la costa este de EE.UU. (Miami/Virginia) que hacia São
Paulo (a verificar con una medición: `ping`/`curl` desde Colombia a ambas regiones durante el piloto). Propuesta:
**us-east-1 (Virginia)** salvo que la medición o la revisión legal digan lo contrario. La región no se puede cambiar
después sin migrar datos: se decide antes de cargar datos reales.

### 11.4 Recomendación (una)

**Opción 3: un solo proyecto Supabase Pro compartido ("plataforma") con un esquema por app, en us-east-1, y frontends
estáticos gratuitos (GitHub Pages / Cloudflare Pages / Render Static Sites).**

Justificación Lean:
- Es la opción **más barata que cumple todo** (cuentas compartidas, fotos con URL firmada, RLS) con 2–5 apps: ~USD 25–40
  en piloto frente a ~65 de un proyecto por app, y sin construir auth/sync/storage como en Render.
- Render no aporta nada que estas apps necesiten hoy y añade semanas de trabajo; queda como opción para un servicio
  concreto que no quepa en Edge Functions (decisión por app, no de plataforma).
- Firebase sería más barato y trae offline, pero su lock-in y el modelo NoSQL encajan peor con el panel del coach y con
  el código actual; no compensa la diferencia de ~USD 20–30/mes.

Reglas para que el proyecto compartido no se vuelva un problema:
1. **Regla de graduación:** una app pasa a su propio proyecto si supera ~5.000 usuarios activos, tiene requisitos de datos
   distintos (p. ej. otra ley o datos de menores) o su carga afecta a las demás. Las cuentas compartidas se mantendrían
   entonces con la función de proveedor OIDC o un proveedor externo (a verificar en ese momento).
2. **Test de CI que recorre todos los esquemas** y falla si una tabla no tiene RLS; la matriz de QA se ejecuta por app.
3. Tabla `core.app_access(user_id, app_id, role)`: tener cuenta no da acceso a todas las apps; cada política de una app
   comprueba también el acceso a esa app. Consentimientos con `app_id` (se consiente por app y finalidad, Ley 1581).
4. Migraciones SQL por carpeta de app (`supabase/migrations/` con prefijo de app) y revisión del Arquitecto en cada una.
5. Spend cap activado y alerta de uso.

### 11.5 Riesgo añadido
- **R-8 Radio de impacto compartido:** un fallo de seguridad o de carga en una app afecta a todas. Mitigación: reglas
  11.4 (2–4) y graduación (1). Probabilidad baja mientras haya pocas apps y un solo equipo que revisa todo el SQL.

### 11.6 Qué cambia en el plan de R1 (y en las secciones anteriores)
1. **Infraestructura:** organización Supabase Pro + **un** proyecto `plataforma` (us-east-1, a confirmar tras medir latencia
   y revisión legal) con esquemas `core` y `grasa`; `staging` como segundo proyecto o rama (a verificar coste de ramas).
   Frontend sigue en GitHub Pages por ahora (o Cloudflare Pages si se necesita dominio propio por app con cabeceras CSP).
2. **Modelo de datos (§3):** `profiles`, `organizations`, `org_members`, `consent_events`, `subscriptions` pasan a `core`
   con `app_id`; las tablas de salud a `grasa`. Nueva `core.app_access`. `coach_can_see()` vive en `grasa`.
3. **Sin modo sin cuenta (§4.3 punto 4, decisión 4 del §9 y nota de HU-P04 quedan anuladas):** la primera apertura pide
   iniciar sesión (requiere red una vez); después la app funciona offline con la sesión en caché y el refresh token se
   renueva al volver la red. Los usuarios actuales con datos locales pasan por la "adopción" de §4.3 al crear cuenta.
4. **Fotos en el panel desde R1 (cambia §8 "R1.1"):** se activa la UI de fotos en la ficha del coach. Consentimiento por
   categoría "fotos" (desmarcado por defecto) **más** opción de ocultar fotos concretas (`photos.shared_with_coach`,
   por defecto = valor de la categoría). `photo_access_log` y aviso al cliente pasan a ser obligatorios en R1. QA añade
   pruebas de URL firmada caducada, foto oculta y consentimiento revocado. La subida de fotos a la nube entra en R1.
5. **Precio:** USD 5 por cliente activo/mes, cobrado fuera de la app; R1 solo construye el conteo de clientes activos por
   coach (definición de "activo" a cerrar con el Analista).
6. **R2 (cliente paga en la app):** pasarela con reparto en Colombia → **Mercado Pago split** como primera candidata
   (§6.1), webhooks en Edge Function; Wompi/PayU a verificar. Requiere saber si el Stakeholder opera como empresa o
   persona natural (pendiente en `decisiones-negocio.md`).
7. **Sin cambios:** auth por código OTP, sync last-write-wins por registro, reparto de trabajo entre agentes de §8 (el Dev
   Backend añade `core.app_access` y el test de RLS multi-esquema).

Fuentes de esta adenda (precios a verificar en las páginas oficiales): [Supabase pricing](https://supabase.com/pricing.md),
[JetAdmin – Supabase 2026](https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/),
[CloudZero – Supabase](https://www.cloudzero.com/blog/supabase-pricing/), [Render regions](https://render.com/docs/regions),
[Render – coste de hosting](https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses),
[Temps – Render 2026](https://temps.sh/blog/render-pricing-2026), [Kuberns – Render 2026](https://kuberns.com/blogs/render-pricing/).
