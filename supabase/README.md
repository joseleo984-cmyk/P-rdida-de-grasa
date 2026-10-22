# Base de datos de R1 (Supabase)

Contrato: [`equipo/r1-contrato.md`](../equipo/r1-contrato.md) §2. Proyecto compartido con dos esquemas:
`core` (común a todas las apps) y `grasa` (esta app).

## Archivos

| Archivo | Qué es |
|---|---|
| `migrations/20261021120000_r1_core.sql` | `core`: `apps`, `profiles` (1:1 con `auth.users`), `app_access`, `consent_events` (solo inserción) y RPC de cuenta. |
| `migrations/20261021120100_r1_grasa.sql` | `grasa`: `coaches`, `coach_links` (5 categorías), `invite_attempts`, `records`, `photos`, `comments`, `photo_views`, `coach_can_see()` y todas las RPC. |
| `migrations/20261021120200_r1_storage.sql` | Bucket privado `grasa-photos` y sus políticas. |
| `migrations/20261021130000_r1_fix_seguridad.sql` | Correcciones de la revisión de QA: intentos de código, baja sin fotos huérfanas, FK, permisos exactos (contrato §11). |
| `tools/sweep-orphan-photos.js` | Barrido de fotos huérfanas con `service_role` (ver abajo). |
| `r1.sql` | **Generado** (`npm run build:db`) uniendo las migraciones: archivo único e idempotente para pegar en el SQL Editor. No editar a mano. |
| `tests/00_supabase_stub.sql` | Solo pruebas: simula `auth.users`, `auth.uid()`, `storage` y los roles `anon`/`authenticated`/`service_role`. |
| `tests/01_helpers.sql` | Solo pruebas: usuarios de la matriz y `tests.login()`, `tests.ok()`, `tests.throws()`. |
| `tests/*.test.sql` | Matriz de RLS, RPC, Storage y sincronización (contrato §2.5). |

Las migraciones son la fuente de verdad. Tienen el formato de Supabase CLI (`supabase db push` las aplicaría en
orden) y son **idempotentes**: `if not exists`, `create or replace` y `drop policy if exists`.

## Cómo probarlo en local (sin Docker ni Supabase)

```bash
npm run build:db   # regenera supabase/r1.sql tras cambiar una migración
npm run test:db    # PostgreSQL temporal: stub + r1.sql dos veces + matriz de pruebas
```

Requisitos: PostgreSQL 16 instalado (`/usr/lib/postgresql/16/bin`; con otra ruta, `PG_BIN=/ruta/bin npm run test:db`).
El script hace:
1. Comprueba que `r1.sql` está al día.
2. Crea un cluster con `initdb` en un directorio temporal y un puerto libre. Si se ejecuta como root, usa el
   usuario `postgres`.
3. Aplica el stub, `r1.sql` **dos veces** (idempotencia), las ayudas y cada `*.test.sql` en su propia transacción
   (con `rollback` al final).
4. Ejecuta una prueba de **concurrencia** de `sync_pull` con dos sesiones `psql` reales.
5. Para y borra el cluster.

Opciones: `VERBOSE=1` lista cada comprobación y `KEEP_DB=1` conserva el directorio.
`PGOPTIONS='-c qa.strict=on' npm run test:db` es el modo estricto de QA: falla si queda algún «AGUJERO CONOCIDO» en
`60_qa_seguridad.test.sql`. Hoy no queda ninguno. Para escribir una prueba:

```sql
begin;
select tests.login('ana');                     -- 'ana', 'bea', 'x', 'y', 'admin' o 'anon'
select tests.ok((select count(*) from grasa.records) = 0, 'mensaje');
select tests.throws($$select grasa.coach_pull(tests.uid('bea'), null)$$, 'forbidden', 'mensaje');
reset role;                                    -- vuelve a superusuario antes de cambiar de usuario
rollback;
```

## Cómo aplicarlo en Supabase (Stakeholder, guía `equipo/guia-supabase-stakeholder.md`)

1. Primero en el proyecto de **pruebas**: SQL Editor → pegar `supabase/r1.sql` entero → Run. Debe mostrar `OK r1 v1`.
2. API → **Exposed schemas**: añadir `core` y `grasa`.
3. Repetir en el proyecto real solo cuando la matriz haya pasado contra `pruebas`.

**A verificar en el proyecto real (S3-3):**
- Que el rol `postgres` del SQL Editor puede crear políticas en `storage.objects` y borrar en `auth.users`, que es lo
  que necesita `core.delete_my_account()`.
- Que no hace falta `grant` adicional para `authenticator`.
- Que la clave *publishable* funciona con los esquemas expuestos.

## Barrido de fotos huérfanas (semanal)

La baja desde la app (`core.delete_my_account`) se niega mientras queden fotos del usuario en Storage. Si una cuenta
se borra por otra vía (por ejemplo, desde el panel de Supabase), su carpeta `grasa-photos/{user_id}/` queda sin dueño.
Para borrarla:

```bash
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_KEY=<clave service_role> node supabase/tools/sweep-orphan-photos.js          # simulación: solo lista
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_KEY=<clave service_role> node supabase/tools/sweep-orphan-photos.js --apply  # borra
```

- La clave `service_role` es secreta: se usa solo en el ordenador del Stakeholder o en un secreto de una tarea
  programada, **nunca** en el repositorio ni en la app.
- El script llama a `grasa.orphan_photo_folders()` (solo `service_role`) y borra los archivos con la API de Storage.

## Errores que devuelven las RPC

El mensaje del error es el `code` de `RemoteError` (contrato §3), para que `remote.js` lo traduzca directamente:
`auth`, `forbidden`, `not_found`, `invalid`, `invalid_code`, `rate_limited`. El motivo concreto va en `DETAIL`.
Excepción: `grasa.join_coach` con un código que no sirve devuelve `null` (sin error), para que el intento cuente;
`remote.js` lo convierte en `invalid_code` (contrato §11.1).

## Comprobación rápida del proyecto real (`npm run smoke:remote`)

Comprobaciones **sin iniciar sesión e inofensivas** (no escriben nada ni crean usuarios) contra un proyecto ya creado.
Necesitan red; la URL y la clave se pasan **solo por variables de entorno**, nunca se guardan en el repo:

```bash
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_KEY=sb_publishable_... npm run smoke:remote
```

Solo acepta la clave **publicable** (se niega con una `sb_secret_…` / `service_role`) y no la imprime. Comprueba:
Auth responde y acepta la clave, el inicio con correo está activado, `core` y `grasa` están en *Exposed schemas*
(si no, PostgREST da `PGRST106`), el rol anónimo **no** ejecuta RPC ni lee tablas (401/403 con `42501`) y el bucket
`grasa-photos` no es público. Sale con código 1 si algo falla (cada línea dice qué y el estado HTTP).
Las comprobaciones con sesión (login con código, push/pull, permisos del coach) quedan para
`tests/remote-contract.test.js` contra el proyecto `pruebas` (contrato §4, §10.8).

## Funciones de borde (Edge Functions)
- `functions/acuerdo-coach-copia` (Sprint 10): manda por Brevo al coach la copia del Acuerdo (A7) que aceptó. Opcional; sin ella la app funciona igual. Lógica pura en `functions/_shared/*.mjs` (se prueba con `node --test`, sin Deno). `functions/_shared/textos-acuerdo.mjs` y `functions/acuerdo-coach-copia/pegar-en-el-panel.ts` están GENERADOS desde `consent-texts.js`: `npm run build:funcion` (las pruebas fallan si están desactualizados). Secretos (solo en el panel de Supabase, nunca en el repo): `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`. Verify JWT activado. Guía para el Stakeholder: `equipo/handoffs/acuerdo-coach-correo.md`.
