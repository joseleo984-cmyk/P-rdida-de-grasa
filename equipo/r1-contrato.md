# Contrato técnico de R1 — Cuentas, sincronización y panel del coach

Autor: Agente Arquitecto / Tech Lead · Fecha: 2026-10-21 · Historia: **S3-0** · Estado: **v1.4 (Sprint 6), vinculante**
Base: `spike-servidor.md` (§3, §4, §11 SPIKE-02), `decisiones-negocio.md` (#6, #7, #10, #14), código en `main`
(`schema.js` v4 con `stampChanges`/`mergeRecords`/`mergeState`/`toRecords`/`fromRecords`, `coach.js` con `summarize`,
`photos.js`, consentimiento local de S2-1).

> **Cómo se usa este documento.** Front (S3-2, S3-4) programa contra la interfaz `Remote` de §3 usando la
> implementación **falsa** (§4) desde el primer día. Back (S3-1, S3-3) implementa el SQL de §2 y la implementación
> real de `Remote` con supabase-js. Ambos se encuentran en la interfaz, no en el código del otro.
> Cambiar algo de este contrato = PR que edita este archivo + aviso al Arquitecto. Lo marcado **(a verificar)** lo
> confirma Back contra la documentación/proyecto real en S3-1.

---

## 0. Decisiones de diseño (resumen)

| # | Decisión | Motivo |
|---|---|---|
| D1 | **Un proyecto Supabase compartido**, esquemas `core` (común a todas las apps) y `grasa` (esta app). | SPIKE-02 §11.4; plan gratis permite 2 proyectos → el 2.º se usa como **pruebas/staging**. |
| D2 | Los datos de salud se guardan en **una tabla genérica `grasa.records`** (`kind` + clave natural + `data jsonb`), no una tabla por tipo. | Encaja 1:1 con `Schema.toRecords/fromRecords` y `mergeRecords` ya probados; un solo push/pull; el panel del coach reconstruye el estado y usa **los mismos** `Coach.summarize` y `calc.js` → mismas cifras en ambas pantallas. Coste: sin analítica SQL por columna (no se necesita en R1). |
| D3 | El dueño accede a sus filas con **RLS directa**; el coach **nunca** lee tablas de salud directamente: solo mediante funciones `SECURITY DEFINER` que comprueban vínculo activo + consentimiento por categoría y **filtran campos** (p. ej. quitan `note`). | RLS no puede ocultar columnas dentro de un JSON; una función es más fácil de probar (matriz de QA). |
| D4 | **Sin Edge Functions en R1.** Todo con SQL (tablas, RLS, RPC) + Storage + Auth. | El Stakeholder aplica el SQL pegándolo en el editor del panel; no hace falta CLI ni compartir credenciales (guía §6). |
| D5 | Login **solo con código OTP por correo** (sin enlace mágico, sin contraseña). | iPhone: el enlace abre Safari, no la PWA instalada (spike §1.4). |
| D6 | Conflictos: **LWW por registro** con `updatedAt` del cliente acotado a +5 min (ya en `schema.js`); **cursor de pull con reloj del servidor** y ventana de solape. | Spike §4.2; reutiliza `mergeState`. |
| D7 | supabase-js **vendorizado** como UMD con versión exacta, servido desde el propio sitio y precacheado por el SW. | Sin build, funciona offline, sin CDN en producción. |
| D8 | Simplificación R1: la "organización" del coach es **el propio coach** (`grasa.coaches`). `core.organizations` llega cuando haya gimnasios con varios coaches. | YAGNI; la migración futura es añadir `org_id` nullable. |

---

## 1. Identificadores, tiempos y categorías

- **Ids**: UUID v4 generados en el cliente (`Schema.uuid()`), también en filas creadas por el coach (comentarios).
- **`updated_at`**: ISO del **cliente** (el `updatedAt` del registro), usado para LWW. El servidor lo **recorta** a
  `now() + 5 min` al recibirlo (igual que `Schema.clampStamp`).
- **`server_updated_at`**: lo pone un trigger con `clock_timestamp()` en cada INSERT/UPDATE. Solo sirve de **cursor de pull**.
- **`deleted_at`**: no nulo = lápida. Las lápidas se sincronizan como cualquier fila.
- **Fechas de calendario** (`date`): `YYYY-MM-DD` local del usuario, como hoy.
- **Categorías de consentimiento para compartir con el coach** (se muestran tal cual en la pantalla de vínculo, HU-P03):

| Categoría | Qué incluye | Por defecto | Obligatoria para vincularse |
|---|---|---|---|
| `body` | perfil (sexo, edad, estatura, peso inicial/meta, fecha inicio, actividad, ritmo) + registros corporales **sin nota** | ✔ | **Sí** |
| `notes` | campo `note` de los registros corporales | ✗ | No |
| `nutrition` | comidas del diario (no la biblioteca de alimentos) | ✔ | No |
| `habits` | pasos, agua, sueño, entrenó | ✔ | No |
| `photos` | fotos de progreso **marcadas como compartidas** | ✗ | No |

La biblioteca de alimentos (`kind = 'library'`) **nunca** se comparte con el coach.

---

## 2. Base de datos (Postgres / Supabase)

Archivo único e idempotente que mantiene Back: `supabase/r1.sql` (más `supabase/tests/*.sql` para la matriz RLS).
Convenciones: `create ... if not exists`, `create or replace function`, `drop policy if exists` antes de `create policy`.
**Importante (a verificar):** en proyectos nuevos de 2026 la API de datos exige `GRANT` explícitos; el script incluye
`grant usage on schema core, grasa to authenticated` y los `grant` mínimos por tabla/función. Nunca `grant` a `anon`
salvo lo indicado. Los esquemas `core` y `grasa` se añaden a **"Exposed schemas"** de la API (paso de la guía).

### 2.1 Esquema `core` (compartido por todas las apps)

```sql
create schema if not exists core;

create table if not exists core.apps (id text primary key);                    -- semilla: 'grasa'

create table if not exists core.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 60),
  created_at   timestamptz not null default now()
);
-- Trigger AFTER INSERT ON auth.users → inserta core.profiles(id). (SECURITY DEFINER, search_path fijo)

create table if not exists core.app_access (
  user_id    uuid not null references auth.users(id) on delete cascade,
  app_id     text not null references core.apps(id),
  role       text not null check (role in ('client','coach','admin')),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, app_id, role)
);

create table if not exists core.consent_events (               -- SOLO INSERCIÓN (prueba de autorización, Ley 1581)
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  app_id      text not null references core.apps(id),
  kind        text not null check (kind in ('terms','privacy','adult','sensitive_health','photos_cloud',
                                            'share_body','share_notes','share_nutrition','share_habits','share_photos')),
  granted     boolean not null,
  version     text not null check (char_length(version) <= 20),   -- versión del texto legal vigente
  coach_id    uuid null,                                          -- para share_*: con qué coach
  client_at   timestamptz not null,                               -- cuándo lo marcó el usuario (puede ser offline)
  created_at  timestamptz not null default now()                  -- cuándo llegó al servidor
);
```

| Tabla | SELECT | INSERT | UPDATE / DELETE |
|---|---|---|---|
| `core.apps` | `authenticated` (todas) | — | — |
| `core.profiles` | propio (`id = auth.uid()`); el coach lee `display_name` de sus clientes **vía RPC** | trigger | UPDATE propio (`display_name`) |
| `core.app_access` | propio | solo vía RPC `core.join_app` (rol `client`) y `grasa.become_coach` (rol `coach`); `admin` a mano en SQL | — (admin en SQL) |
| `core.consent_events` | propio | propio (`user_id = auth.uid()`, `app_id` existente) | **ninguna política + `revoke update, delete`** |

Funciones:
- `core.join_app(p_app text) returns text[]` — da rol `client` si no lo tiene; devuelve mis roles en esa app.
- `core.my_roles(p_app text) returns text[]`.
- `core.my_consents(p_app text) returns table(kind, granted, version, client_at)` — último evento por `kind`
  (para no volver a pedir la aceptación legal en un dispositivo nuevo si las versiones coinciden).
- `core.delete_my_account() returns void` — `SECURITY DEFINER`: borra `auth.users` del usuario actual (cascada a todo).
  **Antes** el cliente borra sus fotos del Storage (§2.4). Comprobar en S3-1 que el propietario de la función puede
  borrar en `auth.users` (a verificar). Los `consent_events` se borran en cascada: si el abogado pide conservarlos como
  prueba tras la baja, se cambia a `on delete set null` + seudonimización (pregunta abierta, `preguntas-abogado.md`).

### 2.2 Esquema `grasa`: coach, invitación y vínculo

```sql
create schema if not exists grasa;

create table if not exists grasa.coaches (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  business_name  text not null check (char_length(business_name) between 2 and 60),
  invite_code    text not null unique check (invite_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$'),
  free_clients   int  not null default 5,
  active         boolean not null default true,
  code_rotated_at timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

create table if not exists grasa.coach_links (
  id              uuid primary key default gen_random_uuid(),
  coach_id        uuid not null references grasa.coaches(user_id) on delete cascade,
  client_id       uuid not null references auth.users(id) on delete cascade,
  status          text not null default 'active' check (status in ('active','ended')),
  share_body      boolean not null default true check (share_body),     -- obligatoria mientras esté activo
  share_notes     boolean not null default false,
  share_nutrition boolean not null default true,
  share_habits    boolean not null default true,
  share_photos    boolean not null default false,
  created_at      timestamptz not null default now(),
  ended_at        timestamptz null,
  updated_at      timestamptz not null default now(),
  check (coach_id <> client_id)
);
create unique index if not exists one_active_coach on grasa.coach_links(client_id) where status = 'active';

create table if not exists grasa.invite_attempts (             -- limitación de intentos de código
  user_id uuid not null, created_at timestamptz not null default now()
);
```

Alfabeto del código: 31 símbolos sin `0 O 1 I L` → ~887 M combinaciones; máx. **20 intentos/hora por usuario**.

| Tabla | SELECT | INSERT / UPDATE / DELETE |
|---|---|---|
| `grasa.coaches` | propio (`user_id = auth.uid()`) | solo vía RPC |
| `grasa.coach_links` | `client_id = auth.uid() or coach_id = auth.uid()` | solo vía RPC (crear, cambiar categorías, terminar) |
| `grasa.invite_attempts` | nadie | solo desde RPC |

RPC (todas `SECURITY DEFINER`, `set search_path = ''`, nombres calificados, validan `auth.uid() is not null`):

| Función | Quién | Qué hace |
|---|---|---|
| `grasa.become_coach(p_business_name text) returns table(invite_code text)` | cualquiera con cuenta | crea fila en `coaches` con código aleatorio único + `core.app_access(role 'coach')`. Idempotente. |
| `grasa.rotate_invite_code() returns text` | coach | nuevo código; el anterior deja de servir para **nuevos** vínculos. |
| `grasa.preview_invite_code(p_code text) returns table(business_name text)` | cliente | registra intento; error `rate_limited` si > 20/h; devuelve solo el nombre comercial (o vacío). |
| `grasa.join_coach(p_code text, p_shares jsonb) returns grasa.coach_links` | cliente | registra intento; valida código y coach activo; termina vínculo activo previo; crea vínculo con las categorías (`body` debe ser `true`); inserta `consent_events share_*` en la misma transacción. |
| `grasa.update_shares(p_shares jsonb) returns grasa.coach_links` | cliente | cambia categorías del vínculo activo + `consent_events`. Efecto inmediato. |
| `grasa.leave_coach() returns void` | cliente | `status = 'ended'`, `ended_at = now()`. |
| `grasa.end_client(p_client uuid) returns void` | coach | termina el vínculo con ese cliente. |
| `grasa.coach_clients() returns table(client_id, display_name, link_id, since, shares jsonb, last_activity timestamptz)` | coach | clientes activos; `last_activity` = máx. `server_updated_at` de sus `records`. |
| `grasa.coach_pull(p_client uuid, p_since timestamptz) returns jsonb` | coach | ver §2.3. |

Límite gratis (HU-P02): `join_coach` **no bloquea** al pasar de `free_clients`; `coach_clients()` devuelve también
`over_free_limit` para que el panel muestre el aviso "plan fundador". Conteo de **clientes activos para cobrar
USD 5** (decisión #2): cliente con vínculo activo y ≥ 1 `records.server_updated_at` en los últimos 30 días
(definición a confirmar con el Analista); función `grasa.billing_active_clients(p_month date)` solo para admin.

### 2.3 Esquema `grasa`: datos sincronizados, fotos y comentarios

```sql
create table if not exists grasa.records (
  id                uuid not null,
  user_id           uuid not null references auth.users(id) on delete cascade,
  kind              text not null check (kind in ('profile','entry','food','habit','library')),
  nkey              text not null check (char_length(nkey) between 1 and 80),
     -- clave natural: profile → 'profile'; entry/habit → fecha 'YYYY-MM-DD'; food → id; library → nombre en minúsculas
  date              date null,                          -- entry/food/habit (para filtrar por rango en el panel)
  data              jsonb not null default '{}'::jsonb check (pg_column_size(data) <= 4096),
  updated_at        timestamptz not null,
  deleted_at        timestamptz null,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, kind, nkey)
);
create index if not exists records_pull on grasa.records(user_id, server_updated_at);

create table if not exists grasa.photos (
  id                uuid primary key,
  user_id           uuid not null references auth.users(id) on delete cascade,
  date              date not null,
  pose              text not null check (pose in ('frente','perfil','espalda')),
  width int, height int,
  storage_path      text not null,                      -- '{user_id}/{id}.jpg'
  shared_with_coach boolean not null default false,     -- opt-in por foto (decisión #7)
  created_at        timestamptz not null,
  updated_at        timestamptz not null,
  deleted_at        timestamptz null,
  server_updated_at timestamptz not null default clock_timestamp()
);

create table if not exists grasa.comments (
  id                uuid primary key,                   -- generado por el cliente del coach
  link_id           uuid not null references grasa.coach_links(id) on delete cascade,
  coach_id          uuid not null, client_id uuid not null,
  ref_date          date null,                          -- día/semana a la que se refiere
  body              text not null check (char_length(body) between 1 and 1000),
  created_at        timestamptz not null default now(),
  read_at           timestamptz null,
  deleted_at        timestamptz null,
  server_updated_at timestamptz not null default clock_timestamp()
);

create table if not exists grasa.photo_views (            -- registro de accesos del coach a fotos
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null, coach_id uuid not null, client_id uuid not null,
  viewed_at timestamptz not null default now()
);
```
Triggers: `BEFORE INSERT OR UPDATE` en `records`, `photos`, `comments` → `server_updated_at = clock_timestamp()` y
`updated_at = least(updated_at, now() + interval '5 minutes')`.

Correspondencia con `schema.js` (`toRecords`): `entries[]` → `kind 'entry'`, `nkey = date`; `foods[date][]` →
`kind 'food'`, `nkey = id`, `date`; `habits[date]` → `kind 'habit'`, `nkey = date`; `library[key]` → `kind 'library'`,
`nkey = key`; `profile` → `kind 'profile'`, `nkey 'profile'`. **`data`** = el registro tal como lo devuelve
`toRecords` **sin** `id`, `updatedAt`, `deletedAt` (van en columnas). Lápidas: `data = {}`, `deleted_at` no nulo.
El consentimiento local (`state.consent`) **no** se sube como registro: va a `core.consent_events`.

| Tabla | Dueño (RLS directa) | Coach | Otros |
|---|---|---|---|
| `grasa.records` | SELECT/INSERT/UPDATE `user_id = auth.uid()`; **sin DELETE** (se borra con lápida o con la baja de cuenta) | **sin acceso directo**: solo `coach_pull` | nada |
| `grasa.photos` | SELECT/INSERT/UPDATE propio | **sin acceso directo**: metadatos vía `coach_pull`; fichero vía Storage (§2.4) | nada |
| `grasa.comments` | cliente: SELECT donde `client_id = me`; UPDATE solo `read_at` (vía RPC `mark_comment_read`) | SELECT donde `coach_id = me`; INSERT vía RPC `add_comment` (exige vínculo activo); "borrar" = `deleted_at` vía RPC | nada |
| `grasa.photo_views` | cliente: SELECT de las suyas | INSERT solo vía `coach_photo_opened` | nada |

RPC de sincronización (dueño, `SECURITY INVOKER`: la RLS aplica):

- **`grasa.sync_push(p_records jsonb, p_photos jsonb) returns jsonb`**
  Entrada: arrays de `{id, kind, nkey, date, data, updated_at, deleted_at}` / `{id, date, pose, width, height,
  storage_path, shared_with_coach, created_at, updated_at, deleted_at}`. Máx. **500** elementos por llamada.
  Por fila: `insert … on conflict (user_id, kind, nkey) do update … where excluded.updated_at > records.updated_at
  or (excluded.updated_at = records.updated_at and excluded.data::text > records.data::text)` (desempate determinista
  como `newer()` de `schema.js`). Con clave natural se **conserva el `id` del servidor**.
  Salida: `{ server_now, rejected: [filas del servidor que ganaron] }`. Las rechazadas el cliente las fusiona con
  `mergeRecords` (resultado = la del servidor, con su id).
- **`grasa.sync_pull(p_since timestamptz, p_limit int default 1000) returns jsonb`**
  Devuelve `{ records, photos, comments, cursor, has_more, server_now }` del usuario actual con
  `server_updated_at > p_since - interval '30 seconds'` (ventana de solape, §5.3), ordenado por `server_updated_at`.
  `cursor` = mayor `server_updated_at` devuelto (o `p_since` si no hay filas). `comments` = los del vínculo donde soy
  cliente (incluye los de vínculos terminados: siguen siendo del cliente).
- **`grasa.coach_pull(p_client uuid, p_since timestamptz) returns jsonb`** (`SECURITY DEFINER`)
  Comprueba vínculo **activo** coach→cliente. Devuelve solo `records` de `kind` permitidos (`profile`+`entry` si
  `share_body`; `food` si `share_nutrition`; `habit` si `share_habits`; **nunca** `library`), con `data - 'note'` si
  `share_notes = false`; `photos` (metadatos) solo si `share_photos` **y** `shared_with_coach` **y** `deleted_at is null`;
  y los `comments` del vínculo. Sin vínculo activo → error `forbidden`.
- `grasa.add_comment(p_id uuid, p_client uuid, p_ref_date date, p_body text)`, `grasa.delete_comment(p_id uuid)`,
  `grasa.mark_comment_read(p_id uuid)`, `grasa.coach_photo_opened(p_photo uuid)` (inserta en `photo_views`).

Función auxiliar usada por Storage y `coach_pull`:
```sql
create or replace function grasa.coach_can_see_photo(p_owner uuid, p_photo uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from grasa.coach_links l join grasa.photos p on p.user_id = l.client_id
    where l.client_id = p_owner and l.coach_id = auth.uid() and l.status = 'active' and l.share_photos
      and p.id = p_photo and p.shared_with_coach and p.deleted_at is null);
$$;
```

### 2.4 Storage (fotos)

- Bucket **`grasa-photos`**, **privado**, límite 2 MB por archivo, tipos `image/jpeg` (las fotos ya se comprimen a
  JPEG ≤ 1280 px y sin EXIF en `photos.js`).
- Ruta: **`{user_id}/{photo_id}.jpg`**. Idempotente: volver a subir la misma foto = `upsert: true`.
- Políticas sobre `storage.objects` (`bucket_id = 'grasa-photos'`):
  - dueño: SELECT / INSERT / UPDATE / DELETE si `(storage.foldername(name))[1] = auth.uid()::text`;
  - coach: **SELECT** si `grasa.coach_can_see_photo((storage.foldername(name))[1]::uuid,
    split_part(storage.filename(name), '.', 1)::uuid)`.
- Lectura **solo con URL firmada de 60 s** (`createSignedUrl(path, 60)`, v1.2 §11), nunca URL pública. La app descarga el blob y lo
  muestra con `URL.createObjectURL` (no se guarda la URL firmada).
- Registro de accesos: `Remote.coach.photoUrl()` llama antes a `coach_photo_opened`. **Limitación conocida:** un coach
  que llame a Storage directamente podría saltarse el registro; para hacerlo inevitable hace falta una Edge Function
  que firme la URL (R2). La **autorización** sí es inevitable (política de Storage).
- Baja de cuenta: el cliente borra primero `grasa-photos/{user_id}/*` con la API de Storage y después llama a
  `core.delete_my_account()`. Nunca borrar filas de `storage.objects` con SQL (deja archivos huérfanos; a verificar).

### 2.5 Pruebas obligatorias de la base (S3-1)
1. Consulta que falla si alguna tabla de `core` o `grasa` no tiene RLS activado.
2. Matriz con 5 usuarios: cliente A (vinculado a coach X), cliente B (sin coach), coach X, coach Y, anónimo.
   Para cada tabla y RPC: quién lee/escribe qué. Casos clave: Y no ve a A; X no ve `library` ni `note` sin `notes`;
   X no ve fotos con `share_photos = false` ni fotos con `shared_with_coach = false`; al revocar o terminar, X pierde
   acceso en la siguiente llamada; nadie puede UPDATE/DELETE en `consent_events`; anónimo no ve nada.
3. `sync_push`: gana el `updated_at` mayor, empate determinista, marca futura recortada, clave natural conserva id.
4. `sync_pull`: con dos transacciones concurrentes, ninguna fila queda fuera gracias al solape.

---

## 3. Interfaz `Remote` (`remote.js`)

Script clásico (como `schema.js`), expone `window.Remote` y `module.exports` para pruebas en Node.
**Ningún otro archivo llama a supabase-js.** Todas las funciones son `async` y lanzan `RemoteError`.

```js
// Fábricas
Remote.create({ url, key, app: 'grasa', storage })   // implementación real (supabase-js)
Remote.createFake({ backend, clock, app: 'grasa' })   // implementación en memoria (§4)
Remote.config()                                       // lee window.PG_CONFIG (config.js): { url, key, mode: 'real'|'fake' }

class RemoteError extends Error { code /* ver tabla */; retryable /* bool */ }
```

| `code` | Significado | ¿Reintentar? |
|---|---|---|
| `offline` | sin red / `fetch` falló / timeout 15 s | sí |
| `auth` | sin sesión o sesión caducada (pedir login) | no |
| `invalid_code` | OTP o código de coach incorrecto/caducado | no |
| `rate_limited` | demasiados intentos (OTP o códigos) o límite de correos | más tarde |
| `forbidden` | RLS / vínculo inexistente | no |
| `not_found` | recurso no existe | no |
| `invalid` | datos rechazados por validación | no |
| `server` | error 5xx u otro | sí (backoff) |

### 3.1 `remote.auth`
```js
sendCode(email)                 // signInWithOtp({ email, options: { shouldCreateUser: true } }) → void
verifyCode(email, code)         // verifyOtp({ email, token: code, type: 'email' }) → { user: { id, email } }
session()                       // → { user: { id, email } } | null. NO usa red: lee la sesión guardada (sirve offline)
signOut({ local: true })        // borra la sesión del dispositivo (no los datos: eso lo decide la app)
onChange(cb)                    // cb({ event: 'signed_in'|'signed_out'|'refreshed', user }) → unsubscribe()
```
- El campo de código acepta **6 a 10 dígitos** (`/^\d{6,10}$/`): la longitud la fija el proyecto (guía: 6) y no se
  debe codificar a fuego (hay proyectos que envían 8; a verificar en el nuestro).
- Reenvío: botón deshabilitado 60 s (límite del servidor: 1 código por minuto por correo).
- Tras `verifyCode`, la app llama a `remote.account.joinApp()`.

### 3.2 `remote.account`
```js
joinApp()                       // core.join_app('grasa') → ['client'] | ['client','coach']
roles()                         // core.my_roles('grasa')
profile() / setDisplayName(name)
recordConsents(events)          // [{ kind, granted, version, clientAt, coachId? }] → insert en core.consent_events
consents()                      // core.my_consents('grasa') → { kind: { granted, version, clientAt } }
deleteAccount()                 // borra fotos de Storage y luego core.delete_my_account(); después signOut
```

### 3.3 `remote.sync` (lo usa `sync.js`, nunca la UI directamente)
```js
push({ records, photos })       // → { serverNow, rejected: { records, photos } }; parte en lotes de 500
pull(since)                     // → { records, photos, comments, cursor, hasMore, serverNow }
uploadPhoto(photoId, blob)      // Storage upsert '{uid}/{id}.jpg' → { path }
downloadPhoto(path)             // URL firmada 60 s + fetch → Blob   (fotos propias en otro dispositivo)
deletePhotoFile(path)
```
Formato de `records` en la frontera (camelCase en JS, snake_case en SQL lo traduce `remote.js`):
`{ id, kind, nkey, date, data, updatedAt, deletedAt }`. `sync.js` convierte desde/hacia `Schema.toRecords`.

### 3.4 `remote.client` (cliente ↔ coach)
```js
previewCode(code)               // → { businessName } | throws invalid_code / rate_limited
joinCoach(code, shares)         // shares: { body: true, notes, nutrition, habits, photos } → link
myLink()                        // → { id, coachId, businessName, shares, since } | null
updateShares(shares)            // → link
leaveCoach()
markCommentRead(commentId)
setPhotoShared(photoId, bool)   // = cambio local + push (la foto es un registro más); helper para la UI
```

### 3.5 `remote.coach`
```js
becomeCoach(businessName)       // → { inviteCode }
myCoach()                       // → { businessName, inviteCode, freeClients } | null
rotateCode()                    // → inviteCode
clients()                       // → [{ clientId, displayName, linkId, since, shares, lastActivity, overFreeLimit }]
clientData(clientId, since?)    // coach_pull → { records, photos, comments, cursor }
photoBlob(clientId, photo)      // coach_photo_opened + URL firmada + fetch → Blob
addComment(clientId, { id, refDate, body })
deleteComment(commentId)
endClient(clientId)
```
El panel reconstruye el estado del cliente con `Schema.fromRecords(Schema.emptyState(), recs)` → `Schema.normalize`
(trata los datos como **no confiables**: escapado y tipos, igual que un import) → `Coach.summarize` + `semaforo()`
(nueva función pura en `coach.js`, reglas de HU-P05, con tests). Caché del panel en memoria; no se guardan datos de
clientes en el `localStorage` del coach (R1).

---

## 4. Implementación falsa en memoria (`remote-fake.js`)

Objetivo: Front y QA prueban **todo R1 sin red ni Supabase** (unitarias en Node y E2E Playwright), y la misma batería
corre después contra el proyecto de pruebas cambiando solo la configuración.

- `FakeBackend` (estado en memoria: usuarios, `app_access`, `coaches`, `coach_links`, `records`, `photos`,
  `comments`, `consent_events`, `photo_views`, blobs) y `createFake({ backend, clock })` que devuelve un `Remote` con
  **la misma interfaz y los mismos códigos de error**.
- **Reglas reproducidas**: las de §2 (quién ve qué, filtrado de `note`/`library`/fotos, vínculo único activo, LWW con
  recorte +5 min, clave natural conserva id, ventana de solape del cursor, 20 intentos/h, 1 OTP/min). La fuente de
  verdad de la seguridad es la BD; el fake existe para que la UI se comporte igual, no para sustituir la matriz RLS.
- **OTP**: `backend.lastCode(email)` devuelve el último código enviado (solo existe en el fake).
- **Varios dispositivos**: dos `createFake({ backend })` sobre el mismo `backend` = dos móviles del mismo usuario o
  coach + cliente.
- **Fallos inyectables**: `backend.setOnline(false)`, `backend.failNext(code)`, `backend.latency(ms)`,
  `clock.set(iso)` (reloj del servidor), para probar reintentos, offline y relojes desajustados.
- **Persistencia en E2E**: si `PG_CONFIG.mode === 'fake'`, el backend se guarda en `localStorage['pg-fake-backend']`
  del **origen de pruebas** para sobrevivir recargas; Playwright lo puede sembrar con `page.addInitScript`.
- **Nunca en producción**: `config.js` solo permite `mode: 'fake'` si `location.hostname` es `localhost`/`127.0.0.1`
  o hay `?remote=fake` **y** no es el dominio de producción. Prueba unitaria que lo verifica.
- Pruebas de contrato: `tests/remote-contract.test.js` define los casos (login, push/pull, LWW, permisos del coach…)
  como función `runContract(makeRemote)`; se ejecuta en CI contra el fake y, manualmente en S3-3, contra el proyecto
  de pruebas (`PG_TEST_URL`, `PG_TEST_KEY`, usuarios de prueba).

---

## 5. Estrategia de sincronización (`sync.js`)

Módulo con una parte **pura** (planificar qué subir, aplicar lo recibido; probado en Node) y un orquestador pequeño.

### 5.1 Cuándo
Al abrir la app con sesión · 2 s después del último `save()` (debounce) · evento `online` · `visibilitychange` a
visible · cada 5 min mientras está visible · botón "Sincronizar ahora". **Una sola sincronización a la vez**:
`navigator.locks.request('pg-sync', …)` (Safari ≥ 15.4) con respaldo de un flag en memoria; así dos pestañas no
sincronizan a la vez. iOS no tiene sincronización en segundo plano: no se promete.

### 5.2 Metadatos locales (por usuario)
`localStorage['perdida-grasa:sync']` = `{ userId, deviceId, cursor, pushedUpTo, lastOkAt, lastError }`.
- `cursor`: ISO del **servidor** (último `cursor` de `pull`). Inicial: `'1970-01-01T00:00:00Z'`.
- `pushedUpTo`: mayor `updatedAt` local ya confirmado por el servidor.
- `perdida-grasa:owner` = `userId` dueño de los datos locales (ver 5.6).

### 5.3 Un ciclo
1. **Push.** `Schema.toRecords(state)` → filtrar los que tienen `updatedAt > pushedUpTo` (incluye lápidas de
   `state.deleted`) → `remote.sync.push`. Fotos: las de IndexedDB con `updatedAt > pushedUpTo` (metadatos) y, si el
   usuario autorizó la copia en la nube (`photos_cloud` / `consent.photos`), primero `uploadPhoto` del blob. Al
   confirmar: `pushedUpTo = max(updatedAt enviados)` (**no** `now`, para no saltarse ediciones hechas durante el envío).
   Las filas `rejected` se fusionan como si vinieran del pull.
2. **Pull.** `pull(cursor)` en bucle mientras `hasMore` → convertir a registros de `schema.js` →
   `Schema.mergeState(local, remoto)` (LWW por registro, claves naturales, reloj acotado) → guardar → `cursor = cursor`
   devuelto. La **ventana de solape de 30 s** puede devolver filas ya vistas: no importa porque la fusión es idempotente.
3. **Comentarios**: se guardan aparte (`perdida-grasa:comments`), sin LWW (los escribe solo el coach; `read_at` solo
   el cliente).
4. **Purga**: `Schema.purgeDeleted(state, now, 90)` solo para lápidas **ya confirmadas** (`updatedAt <= pushedUpTo`).

**Regla crítica para Back/Front:** lo que llega del servidor se guarda **sin pasar por `stampChanges` como edición
nueva**. Si se guardara con el `save()` normal, `stampChanges` compararía con el estado anterior y pondría
`updatedAt = ahora` a todo lo recibido, que se volvería a subir como edición propia y ganaría a ediciones más nuevas de
otros dispositivos. Implementación: `saveMerged(merged)` escribe el JSON y fija `prev = merged` (`savedJSON`), de modo
que el siguiente `stampChanges` solo marque lo que el usuario cambie después. Test obligatorio.

### 5.4 Conflictos
- Mismo registro editado en dos dispositivos: gana el `updatedAt` mayor (registro completo, no por campo).
- Dos pesajes/hábitos del mismo día creados offline: se fusionan por fecha; queda el `id` del servidor.
- Borrado en A y edición en B: gana lo más reciente (la lápida también tiene `updatedAt`).
- Reloj del móvil adelantado: marcas > ahora + 5 min se recortan en cliente (`clampStamp`) y en servidor (trigger).
- Perfil: LWW del objeto completo. Consentimiento legal: no se fusiona (va a `consent_events`, §3.2).

### 5.5 Errores y reintentos
`offline`/`server` → backoff 5 s, 30 s, 2 min, 10 min (máx.), se reintenta en el siguiente disparador. `auth` → la app
muestra "Vuelve a entrar con tu correo" **sin bloquear** el registro local. Indicador en Perfil y cabecera:
"Sincronizado hace N min" / "Sin conexión: se subirá luego" / "No se pudo sincronizar: reintentar".

### 5.6 Primera vinculación y cambio de cuenta
- `owner` vacío y hay datos locales → copia `perdida-grasa:backup-pre-sync` (JSON completo, como el export) →
  `owner = userId` → ciclo normal (push de todo; si la cuenta ya tenía datos, el pull los fusiona).
- `owner` distinto del usuario que entra → **no mezclar**: pantalla "Este dispositivo tiene datos de otra cuenta:
  exportar y borrar / cancelar".
- Cerrar sesión: "¿Borrar tus datos de este dispositivo?" (por defecto **sí** si hay datos de salud y el móvil puede
  ser compartido; texto a definir por el Analista).

### 5.7 Sesión sin conexión
- supabase-js guarda la sesión en `localStorage` (clave `sb-<ref>-auth-token`). `remote.auth.session()` la lee sin red:
  con sesión guardada la app **funciona offline** aunque el token de acceso haya caducado; al volver la red,
  supabase-js lo renueva con el refresh token (`autoRefreshToken: true`, `persistSession: true`,
  `detectSessionInUrl: false`).
- El **primer** inicio de sesión en un dispositivo exige conexión (enviar y verificar el código).
- Si el refresh token caduca o se revoca → error `auth` en la siguiente sincronización → pedir código de nuevo; los
  datos locales se conservan y se suben después.

---

## 6. Cómo se carga supabase-js en la PWA sin build

1. **Dependencia de desarrollo con versión exacta**: `npm i -D -E @supabase/supabase-js@2.X.Y` (la última 2.x estable
   publicada hace ≥ 2 semanas en el momento de S3-2; Back la fija y la anota). El `package-lock.json` da la integridad.
2. **Vendorizado**: `scripts/vendor.js` copia `node_modules/@supabase/supabase-js/dist/umd/supabase.js` a
   `vendor/supabase-2.X.Y.js` (versión en el nombre del archivo) y escribe su SHA-256 en `vendor/VERSIONS.json`.
   El archivo vendorizado **se commitea** (GitHub Pages no ejecuta npm). CI comprueba que el hash coincide con
   `node_modules` (nadie edita el archivo a mano). Ruta UMD a verificar en el paquete de esa versión.
3. **Carga**: en `index.html`, antes de `remote.js`: `<script src="vendor/supabase-2.X.Y.js"></script>` →
   global `supabase.createClient`. Sin CDN en producción.
4. **Offline**: añadir el archivo, `config.js`, `remote.js`, `sync.js` a `ASSETS` de `sw.js` y a `pages.yml` en el
   mismo commit, y subir `CACHE`. El SW **no** debe cachear llamadas a `*.supabase.co` (solo GET del propio origen):
   añadir `if (new URL(e.request.url).origin !== location.origin) return;` en `fetch`.
5. **Configuración pública** en `config.js`: `window.PG_CONFIG = { url: 'https://<ref>.supabase.co', key:
   'sb_publishable_…', mode: 'real' }`. La clave *publishable* es pública por diseño (RLS protege los datos).
   La clave *secret*/`service_role` **no existe en el repo ni en el navegador, nunca**.
6. **CSP** (cuando se active la meta CSP de M1): `connect-src 'self' https://<ref>.supabase.co wss://<ref>.supabase.co;
   img-src 'self' blob: data:`.
7. Tamaño: el UMD pesa del orden de 100–200 KB (a verificar); se precachea una vez. Si molesta, R2 puede cargar
   solo `@supabase/auth-js` + `postgrest-js` + `storage-js`.

---

## 7. Archivos nuevos y propietarios

| Archivo | Responsable | Notas |
|---|---|---|
| `supabase/r1.sql`, `supabase/tests/*.sql` | Back (S3-1) | Idempotente; el Stakeholder lo pega en el SQL Editor (guía §6). |
| `config.js` | Back | URL + clave publishable + `mode`. |
| `remote.js` | Back (S3-3) | Implementación real. |
| `remote-fake.js` | Back (S3-1, **primero**) | Desbloquea a Front. |
| `sync.js` | Back (S3-3) | Parte pura con tests + orquestador. |
| `vendor/supabase-2.X.Y.js`, `vendor/VERSIONS.json`, `scripts/vendor.js` | Back | §6. |
| Pantallas de login, vínculo, consentimiento de compartir, indicador de sync | Front (S3-2) | Contra el fake. |
| Panel del coach (`coach.html` o vista en `index.html`) + `semaforo()` en `coach.js` | Front (S3-4) | Reutiliza `Coach.summarize`. |
| `tests/remote-contract.test.js`, `tests/sync-engine.test.js`, E2E | Back + QA | §4, §5.3. |

## 8. Fuera de R1 (no construir)
Push, cobros en la app, Google/Apple login, varios coaches por cliente, edición por el coach, chat, organizaciones,
Edge Functions, cifrado extremo a extremo, datos de clientes en caché en el dispositivo del coach.

## 9. Riesgos y orden de construcción (Sprint 3 / Sprint 4)

### 9.1 Orden
**Sprint 3**
1. **S3-0** (este contrato) → aviso a todos.
2. En paralelo, día 1: **Back** `remote-fake.js` + `tests/remote-contract.test.js` (desbloquea a Front) ·
   **Stakeholder** crea la cuenta y los 2 proyectos con la guía (`plataforma` y `pruebas`) y configura SMTP ·
   **Analista** textos legales v-cuentas (S3-5).
3. **Back S3-1**: `supabase/r1.sql` + matriz RLS en Postgres local (o en el proyecto `pruebas`).
4. **Front S3-2**: login con código + `joinApp` + aceptación legal → `consent_events` + sesión offline (contra el fake).
5. **Back S3-3**: `sync.js` (puro primero, con el test de `saveMerged`) + `remote.js` real + vendorizado.
6. **Front S3-4 (parte 1)**: coach: `becomeCoach`, código, lista con semáforo y ficha (sin fotos).
7. Integración en el proyecto **pruebas**: contrato contra Supabase real; QA en iPhone real (PWA instalada + Safari).

**Sprint 4**
8. Fotos: subida a la nube con autorización, `shared_with_coach` por foto, ficha del coach con fotos + registro de
   accesos; comentarios (HU-P07); baja de cuenta y exportación (HU-P08).
9. Endurecimiento: CSP, SW (no cachear Supabase), mensajes de error, accesibilidad del panel.
10. Ensayo general con 1 coach + 2 clientes de prueba en `plataforma` → aplicar SQL final → **inicio del piloto**
    (tras la revisión legal).

### 9.2 Riesgos
| # | Riesgo | Mitigación |
|---|---|---|
| 1 | **Los códigos OTP no llegan** (SMTP por defecto de Supabase limitado a pocos correos/hora y, según fuentes, solo a miembros del equipo; Gmail como remitente cae en spam). | SMTP propio configurado **antes** de S3-2 en `pruebas`; prueba con Gmail, Hotmail/Outlook e iCloud; plan B: dominio propio barato. |
| 2 | **Re-sellado de datos recibidos** por `stampChanges` (§5.3) → ediciones viejas ganan a nuevas. | `saveMerged` + test obligatorio + E2E con dos dispositivos. |
| 3 | **Error en RLS/RPC** expone datos de salud o fotos. | D3 (coach solo por RPC), §2.5, revisión del Arquitecto de cada cambio en `r1.sql`. |
| 4 | **Plan gratis**: pausa tras ~7 días sin actividad y **sin copias de seguridad**. | Local-first: cada dispositivo conserva sus datos y el export; el panel de Supabase permite reactivar; pasar a Pro antes de ampliar el piloto (guía §8). |
| 5 | **Aplicación manual del SQL** por el Stakeholder (pegado incompleto, script en el proyecto equivocado). | Script único idempotente con comprobación final (`select 'OK r1 vN'`), primero en `pruebas`, instrucciones paso a paso. |
| 6 | Cambio de 2026 en los permisos de la API de datos (GRANT explícitos) o en las claves (`anon` → `publishable`). | `GRANT` en el script; usar la clave `sb_publishable_…` desde el inicio (a verificar en S3-1). |
| 7 | iOS: sesión en Safari ≠ PWA instalada; refresh token; almacenamiento. | Código OTP (no enlace), pruebas en iPhone real como criterio de Hecho. |
| 8 | Revisión legal pendiente (datos sensibles, transferencia a EE.UU., conservación de `consent_events` tras la baja). | No cargar datos reales de clientes hasta tener el visto bueno; preguntas en `equipo/legal/preguntas-abogado.md`. |
| 9 | El registro de accesos a fotos se puede saltar llamando a Storage directamente. | Aceptado en R1 (la autorización sí es obligatoria); Edge Function firmante en R2. |

---

## 10. Cambios v1.1 (tras S3-1)

Fecha: 2026-10-21 · Revisado por el Arquitecto contra `supabase/migrations/*.sql` y
`equipo/handoffs/2026-10-21-S3-1-backend-a-qa.md` (137 comprobaciones de BD en verde). **Lo de esta sección manda
sobre lo anterior** donde haya diferencia. Se aceptan los desvíos 1–7 del Backend con las precisiones de abajo.

### 10.1 `core.consent_events.text_hash` obligatorio (acepta desvío 1)
- Nueva columna `text_hash text not null` = SHA-256 hex (64 caracteres) del **texto exacto mostrado** al usuario.
  Prueba qué texto aceptó, además de la versión.
- `remote.account.recordConsents(events)`: cada evento lleva `{ kind, granted, version, textHash, clientAt, coachId? }`.
  El cliente calcula el hash con `crypto.subtle.digest('SHA-256', utf8(texto))` (hay que normalizar saltos de línea a
  `\n` antes de calcularlo). Así se evita enviar el texto legal entero en cada evento. `core.record_consent(p_app,
  p_kind, p_granted, p_version, p_text, p_client_at, p_coach)` (calcula el hash en el servidor) queda para
  herramientas y pruebas. **Front y Back deben dar el mismo hash para el mismo texto**: test con un texto fijo en los
  dos lados.
- `joinCoach(code, shares)` y `updateShares(shares)`: `shares` lleva también `version` y `textHash` del texto de la
  pantalla de compartir. La BD rechaza con `invalid` si faltan.
- `core.my_consents()` devuelve también `text_hash`.
- `client_at` se acota a +5 min. La tabla rechaza `UPDATE`/`DELETE`/`TRUNCATE` para todos los roles (trigger). La
  única excepción es la cascada de la baja de cuenta (sigue pendiente de lo que diga el abogado, §2.1).

### 10.2 Caducidad y límite de usos del código del coach (acepta desvío 2)
- `grasa.coaches` añade `invite_expires_at`, `invite_max_uses` (1–500) e `invite_uses`. Por defecto no tienen límite
  (comportamiento v1).
- `grasa.rotate_invite_code(p_valid_days int default null, p_max_uses int default null) returns text`. Un código
  caducado o agotado responde como uno inexistente (`invalid_code`).
- Interfaz: `remote.coach.rotateCode({ validDays, maxUses } = {})`. `myCoach()` devuelve también `expiresAt`, `maxUses`
  y `uses`, para que el panel muestre "válido hasta … / quedan N usos".
- El fake (§4) reproduce caducidad (con su reloj) y usos.

### 10.3 `grasa.coach_can_see(p_client, p_scope)` (acepta desvío 3)
- Es la única fuente de la regla "vínculo activo + coach activo + categoría consentida" (`body`, `notes`, `nutrition`,
  `habits`, `photos`). La usan `coach_pull`, `coach_can_see_photo` y la política de Storage del coach.
- `coach_pull` exige `coach_can_see(cliente, 'body')`: sin vínculo activo devuelve `forbidden`. Además, un coach
  desactivado (`coaches.active = false`) pierde el acceso a todos sus clientes.
- También se aceptan `core.has_role(p_app, p_role)` y `core.record_consent` (desvío 4).

### 10.4 Errores: mensajes de la BD = códigos de `RemoteError` (acepta desvío 5)
Las RPC lanzan `raise exception '<código>'` con el motivo en `DETAIL`. **Regla de mapeo en `remote.js`, en este orden:**
1. Si `error.message` es exactamente uno de `auth | forbidden | not_found | invalid | invalid_code | rate_limited`
   → ese código. **Se mapea por el mensaje, no por SQLSTATE**: la BD usa `P0002` tanto para `not_found` como para
   `invalid_code`.
2. Si no, por SQLSTATE (errores que genera Postgres, no nuestras funciones):

| SQLSTATE / origen | `RemoteError.code` |
|---|---|
| `42501` (RLS / permiso denegado) | `forbidden` |
| `23514` (CHECK), `22023` (parámetro inválido), `22P02` (formato), `23502` (NOT NULL), `22001` (texto largo) | `invalid` |
| `23505` (único duplicado) | `invalid` |
| `28000`, PostgREST `PGRST301` / JWT caducado, HTTP 401 | `auth` |
| `54000` | `rate_limited` |
| HTTP 429 / error de Auth `over_email_send_rate_limit` u `over_request_rate_limit` | `rate_limited` |
| Auth `otp_expired` / token inválido en `verifyOtp` | `invalid_code` |
| `TypeError` de `fetch`, timeout, `navigator.onLine === false` | `offline` (`retryable: true`) |
| HTTP 5xx, `PGRST*` restantes, cualquier otro | `server` (`retryable: true`) |

- `RemoteError.detail` lleva el `DETAIL` de la BD **solo para registro/depuración**. La UI muestra textos propios por
  código: nunca muestra el mensaje crudo del servidor (podría contener datos o confundir al usuario).
- Los nombres de los códigos de error de Auth están a verificar con la versión de supabase-js vendorizada (S3-3).
  Test de `remote.js` con respuestas simuladas para cada fila de la tabla.
- El fake lanza exactamente los mismos códigos.

### 10.5 `preview_invite_code` sin coincidencia devuelve 0 filas (acepta desvío 6)
Con 0 filas el intento queda contado (límite 20/h). `remote.client.previewCode()` convierte "0 filas" en
`RemoteError('invalid_code')`, así que la interfaz de §3.4 no cambia.

### 10.6 Fotos: LWW estricto en `sync_push` (acepta desvío 7) y regla común para `rejected`
- En `photos`, la fila entrante solo gana si su `updated_at` es **estrictamente mayor**. En empate se queda la del
  servidor.
- **Regla nueva para todo `rejected`** (records y fotos): el cliente **adopta la versión del servidor tal cual**
  (reemplaza la local con `saveMerged`), sin volver a decidir con `newer()`. Motivo: el desempate de `records` en la BD
  compara `data::text`, y en el cliente `newer()` compara `JSON.stringify` del registro completo. En un empate exacto,
  los dos lados podrían elegir distinto y no converger nunca. Con la regla "en `rejected` manda el servidor" convergen
  siempre. El pull normal sigue usando `mergeState`.

### 10.7 Otros ajustes aceptados de la implementación
- `records`: `CHECK` de coherencia entre `kind`, `nkey` y `date`; ni el dueño ni el `id` se pueden cambiar. La ruta
  de la foto se comprueba por `CHECK` (`{uid}/{id}.jpg`). Hay `grasa.try_uuid` para rutas manipuladas en Storage.
- `anon` no puede ejecutar ninguna función (`revoke execute … from public`) ni leer ninguna tabla.
- Archivo para pegar: `supabase/r1.sql`, **generado** con `npm run build:db` a partir de `supabase/migrations/`. No se
  edita a mano. Debe terminar en `OK r1 v1`. Pruebas: `npm run test:db`.

### 10.8 A verificar en el proyecto real (bloquea el cierre de S3-3, no el desarrollo)
1. Que el rol `postgres` del SQL Editor puede crear las políticas en `storage.objects` y borrar en `auth.users`
   (`core.delete_my_account`).
2. Que `core` y `grasa` están en **Exposed schemas** y que la clave *publishable* llama a las RPC.
3. Si hacen falta `GRANT` adicionales (cambio de 2026 en la API de datos; rol `authenticator`).
4. Que `storage.foldername` / `storage.filename` se comportan igual que en el stub de pruebas.
5. Los códigos de error de Auth (OTP caducado, límite de correos) de la versión de supabase-js elegida.

Las comprobaciones 1–2 las hace el Stakeholder con la consulta de la guía (§6, paso 6). Las 3–5, Back con
`tests/remote-contract.test.js` contra `pruebas`.

---

## 11. Cambios v1.2 (corrección de seguridad de S3-1 y S3-3)

Fecha: 2026-10-21 · Autor: Dev Backend (a revisar por el Arquitecto) · Origen: `2026-10-21-S3-1-qa-veredicto.md`
(D1–D3, O1, O3, O4, O7), decisión del SM sobre las URL firmadas y defectos que encontró S3-3.
Migración: `supabase/migrations/20261021130000_r1_fix_seguridad.sql`. **Lo de esta sección manda.**

| # | Cambio | Efecto en `Remote` / app |
|---|---|---|
| 11.1 | `grasa.join_coach` con un código inválido, caducado o agotado **devuelve `null`** (no lanza error), para que el intento quede contado (20/h). Los intentos se serializan por usuario (`pg_advisory_xact_lock`) y se purgan a 1 día. Valida `body`, `version` y `text_hash` **antes** de contar el intento y de mirar el código. | `remote.client.joinCoach()`: `null` → `RemoteError('invalid_code')`. Interfaz sin cambios. |
| 11.2 | `core.delete_my_account()` se **niega** (`invalid`, DETAIL «borra primero tus fotos de Storage») si quedan archivos en `grasa-photos/{uid}/`. | `remote.account.deleteAccount()`: borrar fotos → llamar. Si da `invalid`, reintentar el borrado de Storage. |
| 11.3 | Red de seguridad: `grasa.orphan_photo_folders()` (**solo `service_role`**) + `supabase/tools/sweep-orphan-photos.js`. Borra con la API de Storage las carpetas sin usuario; recomendado semanal. | Lo ejecuta el Stakeholder (guía) o una tarea programada. La clave `service_role` nunca va al repo. |
| 11.4 | FK con `on delete cascade` en `photo_views` (`client_id`, `coach_id`, `photo_id`) e `invite_attempts.user_id`. | Ninguno. |
| 11.5 | Permisos: se revoca **todo** lo concedido directamente a `authenticated`/`service_role` en `core`/`grasa` y se concede la lista blanca exacta (por si el proyecto tiene privilegios por defecto). | Ninguno. |
| 11.6 | URL firmadas de **60 s** (antes 300 s); no se cachean ni se guardan. | `downloadPhoto` / `photoBlob`: `createSignedUrl(path, 60)`. |
| 11.7 | `coach_pull` devuelve `data = {}` en las lápidas, y `coach_clients().last_activity` solo cuenta las categorías compartidas. | Ninguno. |
| 11.8 | **Paginación de `sync_pull`** (defecto encontrado en S3-3): con más de `p_limit` filas dentro de la ventana de 30 s no avanzaba. Nueva firma `grasa.sync_pull(p_since, p_limit, p_overlap boolean default true)`: el solape solo se aplica con `p_overlap = true` y la comparación es `>=`. | `remote.sync.pull(since, { overlap = true })`. `sync.js` pide la 1.ª página con solape y el resto sin él. El fake debe hacer lo mismo. |
| 11.9 | `rejected` (§10.6) **no se adopta** si el usuario volvió a editar ese registro mientras viajaba la petición: su edición es más nueva y gana en el siguiente ciclo. | Solo `sync.js`. |
| 11.10 | Dueño de los datos locales (QA S3-2 O1): `sync.js` no hace **ninguna** llamada si `store.ownerId()` no coincide con la sesión (estado `owner`: `unconfirmed` / `conflict`). | La app guarda el dueño al confirmar «¿estos datos son tuyos?». |

## 12. Cambios v1.3 (QA en vivo contra `pruebas`, S3)

| # | Cambio | Efecto en el cliente |
|---|---|---|
| 12.1 | **H6**: `coach_pull` quita `note` de `data` en **todos** los kinds compartidos (`profile`, `entry`, `food`, `habit`) mientras `share_notes = false` (antes solo en `entry`). Migración `20261021150000_r1_notas_todos_kinds.sql`; prueba `supabase/tests/70_notas_todos_kinds.test.sql`. `note` es el único campo marcado como no compartible (§1); `library` sigue sin llegar nunca. | Ninguno. |
| 12.2 | **H7**: `join_coach` con código inválido/caducado/agotado devuelve por PostgREST un objeto `grasa.coach_links` **con todas las columnas a `null`** (HTTP 200), no `null` JSON. Se **mantiene** (cambiar el tipo de retorno exigiría `drop function` y reescribir grants/pruebas con más riesgo). Matiza §11.1: «devuelve `null`» = «sin vínculo (`id` nulo)». | `remote.client.joinCoach()` ya trata `!r \|\| !r.id` como `RemoteError('invalid_code')`. Sin cambios. |
| 12.3 | **H2**: error de Auth `400 validation_failed` cuyo mensaje contiene «refresh token» → `auth` (no `invalid`). | `mapError`, regla añadida antes de la de `ctx 'auth'`. |
| 12.4 | **H3**: SQLSTATE `42501` con **HTTP 401** (sin sesión, rol `anon`) → `auth`; `42501` con sesión (HTTP 403, RLS o permiso) sigue siendo `forbidden`. Precede a la fila `42501` de la tabla de §10.4. | `mapError`. |
| 12.5 | **H8 (riesgo aceptado)**: tras `core.delete_my_account()` el JWT antiguo sigue aceptado hasta que caduca. No hay fuga: el usuario ya no tiene datos ni vínculos y las RPC devuelven vacío. Mitigación: el cliente cierra la sesión local al borrar, y la **duración del JWT se fija en ≤ 1 h** (guía del Stakeholder §7.1). | Ninguno. |

---

## 13. Cambios v1.4 (Sprint 6: autorizaciones A1–A8 y archivo mínimo del consentimiento)

Una sola migración: `supabase/migrations/20261022120000_r1_consentimientos_s6.sql` (regenera `supabase/r1.sql`). Pruebas: `supabase/tests/80_consentimientos_s6.test.sql` (28 comprobaciones) y `10_estructura` (13 tablas).

| # | Cambio | Efecto en el cliente |
|---|---|---|
| 13.1 | `core.consent_events.kind` admite además `cloud_transfer` (A4), `photo_view_coach` (A6b) y `coach_agreement` (A7). **A6a se llama `photos_cloud`** (ya existía; no se crea `photo_cloud`). Un tipo con otro nombre falla por CHECK. | `remote-fake.js` y `account.js` usan los mismos nombres. `photo_view_coach` lleva `coach_id`. |
| 13.2 | `grasa.coach_links.share_nutrition` y `share_habits` nacen en `false` (antes `true`). `join_coach` ya los fijaba con `coalesce(..., false)`: el cambio solo cierra el default de la tabla. | Ninguno. La app ya manda cada categoría explícita. |
| 13.3 | **`core.consent_archive`** (nueva): prueba mínima y seudonimizada. Columnas: `user_pseudo_id` (SHA-256 de sal del servidor + uuid), `coach_pseudo_id`, `app_id`, `kind`, `action` (`grant`/`revoke`), `version`, `text_hash`, `client_at`, `event_at`, `archived_at` (fecha de baja), `purge_after` (+5 años por defecto). **Sin FK a `auth.users`, sin correo ni nombre.** RLS activada **sin políticas** y `REVOKE ALL` a `anon`, `authenticated` y `service_role`: solo la lee el dueño de la base (SQL Editor). Solo inserción (UPDATE/DELETE/TRUNCATE bloqueados; DELETE solo de filas con `purge_after` vencido, para cuando el abogado fije el plazo). `core.archive_secret` guarda la sal (una fila, mismos permisos). | Ninguno: ninguna llamada de la API la toca. |
| 13.4 | `core.delete_my_account()` copia todos los `consent_events` del usuario al archivo, **en la misma transacción** que el borrado en cascada. Misma firma, mismos grants, mismo `search_path`. | `remote.account.deleteAccount()` igual. El aviso A8 de borrado ya dice que se guarda una prueba mínima sin nombre. |

**Riesgos y decisiones abiertas**
- El plazo de la prueba (3 a 5 años) lo fija el abogado; `purge_after` usa 5 años y **no se borra solo** (la depuración es manual hasta decidirlo).
- Un usuario que vuelva a registrarse con el mismo correo recibe otro uuid: el archivo no se enlaza con la cuenta nueva (es lo buscado).
- La sal se genera al aplicar la migración. Si alguien borra `core.archive_secret` y se vuelve a generar, los seudónimos antiguos y nuevos de una misma persona dejan de coincidir (no afecta a la prueba, solo a agruparlos).
- Los plazos de inactividad (aviso a los 12 meses, borrado a los 13–24) **no están automatizados**; quedan documentados en la decisión del Stakeholder (2026-10-22).
- Hay que volver a pegar `supabase/r1.sql` en `pruebas` y en `plataforma` (es idempotente).

