DE: QA / Revisor → PARA: Dev Backend (cc: Scrum Master, Arquitecto, Dev Frontend, Analista/abogado)
HISTORIA: S3-1 · Base de datos R1 (core + grasa, RLS, Storage) · revisión de SEGURIDAD adversarial (merge `62464dd`)
FECHA: 2026-10-21 · Entorno: PostgreSQL 16 local + stub de Supabase (`npm run test:db`)

## VEREDICTO: **APROBADO CON CONDICIONES**

**No encontré ninguna fuga de datos de salud ni de fotos entre usuarios.** Ni B lee o escribe datos de A, ni el
coach lee notas, biblioteca, hábitos o fotos no compartidas, ni escribe datos del cliente.

Hay tres agujeros:
- **D1** (límite de intentos de invitación eludible);
- **D3** (fotos que quedan en Storage tras la baja);
- **D2** (metadatos huérfanos tras la baja).

**D1 y D3 deben corregirse antes de usar R1 con datos reales**; D2 es una corrección barata. Ninguno exige
reescribir la RLS. No toqué las migraciones.

## Pruebas
| Suite | Resultado |
|---|---|
| `npm run test:db` | **193 comprobaciones OK** (137 del Backend + **56 nuevas de QA**) |
| `PGOPTIONS='-c qa.strict=on' npm run test:db` | **Falla a propósito** en el primer agujero presente (QA-S3-1-D1) |
| `npm test` | sin cambios |

**Nuevo `supabase/tests/60_qa_seguridad.test.sql`:**
- `tests.ok`/`tests.throws` comprueban **protecciones que deben existir**. Si alguna falla, hay un agujero nuevo.
- `tests.hole(presente, id, msg)` registra los **agujeros conocidos**:
  - mientras exista el agujero, avisa con «AGUJERO CONOCIDO» sin romper la suite (como `test.fail`);
  - en **modo estricto** (`qa.strict=on`) falla;
  - **cuando se corrija, falla** con «ya está corregido: cambia tests.hole por tests.ok», para que no quede una
    comprobación muerta.

**Lo que se prueba (todo en verde):**
1. **Estructura**
   - `anon` no ejecuta **ninguna** función de core/grasa y no tiene `USAGE`.
   - Todas las `SECURITY DEFINER` fijan `search_path`.
   - Las funciones internas (`count_attempt`, `valid_coach_for`, `log_shares`, `handle_new_user`) **no** son
     ejecutables por `authenticated`, y hay una **lista blanca** exacta de las que sí.
   - No hay vistas que salten la RLS; `authenticated` no tiene `CREATE` en esos esquemas ni
     DELETE/TRUNCATE/REFERENCES/TRIGGER en ninguna tabla; la RLS está activa en todas.
2. **Cliente B contra A**
   - Datos: no sobrescribe la foto de A reutilizando su id en `sync_push`, aunque use `updated_at` de 2030. No
     inserta registros a nombre de A, y `UPDATE` sobre registros o fotos de A afecta a 0 filas.
   - Storage: no sube archivos a la carpeta de A ni renombra o borra los suyos.
   - Consentimientos: no los registra a nombre de A.
   - Como coach (`become_coach`): `coach_pull`/`add_comment`/`end_client`/`coach_photo_opened` sobre A dan
     `forbidden` o `not_found`. Tampoco marca ni borra comentarios ajenos, ni reutiliza el id de un comentario
     ajeno para leerlo.
   - **Escalada**: no se da `admin` (insertando o actualizando `core.app_access`), no cambia el `id` de su perfil ni
     el `display_name` de A, `become_coach` no da `admin` y no ve la facturación.
   - Lectura: no lee `invite_attempts`, ni el vínculo, los comentarios, las vistas de fotos o los consentimientos de A.
   - Al final, **los datos de A están intactos** byte a byte.
3. **Coach X**
   - No escribe ni borra nada de A: registros, fotos, archivos ni `deleted_at`.
   - En Storage solo ve el archivo de la foto compartida; la foto no marcada da `forbidden`.
   - `coach_pull` no trae `library` ni `note`, y el texto de la nota no aparece en ningún campo del JSON.
   - Tras `end_client` no ve nada: ni pull, ni Storage, ni comentarios, ni `coach_clients`.
4. **Consentimientos**
   - El titular no los modifica ni los borra, y el superusuario tampoco mientras el usuario exista.
   - `created_at` lo fija el servidor aunque el cliente lo envíe.
5. **Baja**
   - La del cliente borra sus registros, fotos (metadatos), vínculos, comentarios, consentimientos y perfil.
   - La del coach borra su ficha, sus vínculos y sus comentarios, y **no** los datos de sus clientes.

## Defectos
**D1 · Medio · El límite de 20 intentos/hora del código de invitación se elude con `join_coach`**
- Archivo: `supabase/migrations/20261021120100_r1_grasa.sql`, `grasa.join_coach`. `count_attempt(uid)` inserta el
  intento, pero con un código malo la función lanza `invalid_code`.
  - Por la API, cada RPC es **una transacción**: el error **revierte también el `insert` en `invite_attempts`**.
  - Los intentos fallidos por `join_coach` **no cuentan nunca**: 25 códigos inventados dan `invalid_code` y el 26.º,
    con el código bueno, se acepta.
  - `preview_invite_code` sí cuenta, porque devuelve 0 filas en vez de lanzar un error.
- Impacto (sin lectura de datos):
  - fuerza bruta sin límite del espacio de códigos (31⁶);
  - vincularse como «cliente» a coaches ajenos (spam, plazas gratis ocupadas);
  - **agotar** un código con `invite_max_uses`, de modo que el cliente real no pueda unirse.
- Además hay una **condición de carrera**: `count_attempt` cuenta y luego inserta sin bloqueo, así que N llamadas
  simultáneas pasan todas con menos de 20.
- Corrección propuesta:
  1. `join_coach` no lanza ante un código malo: devuelve `null` (o `{error:'invalid_code'}`) para que el intento se
     confirme. `remote.js` mapea `null` → `invalid_code`.
  2. En `count_attempt`: `perform pg_advisory_xact_lock(hashtext('invite:' || p_uid));` antes de contar, y purgar los
     intentos de más de 1 día (`delete … where created_at < now() - interval '1 day'`) para que la tabla no crezca.
- Prueba: `60_qa_seguridad.test.sql` §4 (`tests.hole … QA-S3-1-D1`).

**D2 · Bajo-Medio (privacidad) · Quedan filas huérfanas tras la baja: `grasa.photo_views` y `grasa.invite_attempts`**
- No tienen FK. Tras `delete_my_account` del cliente (o del coach) quedan `client_id`/`photo_id`/`coach_id` y
  fechas: quién vio sus fotos y cuándo. Con la baja la Ley 1581 exige suprimir.
- Corrección:
  - `photo_views.client_id` y `coach_id` → `references auth.users(id) on delete cascade` (o
    `photo_id references grasa.photos(id) on delete cascade` + `coach_id … on delete cascade`);
  - `invite_attempts.user_id → references auth.users(id) on delete cascade`.
- Prueba: §6 (`QA-S3-1-D2`, 3 comprobaciones).

**D3 · Alto (privacidad, datos sensibles) · `delete_my_account` deja las FOTOS en Storage**
- `core.delete_my_account` borra `auth.users` y todo cae en cascada, **salvo los archivos** de `storage.objects`,
  que no tienen FK.
  - El contrato confía en que el cliente los borre antes (§2.4). Si la app falla a mitad (red, cierre, error), las
    fotos corporales **quedan en el bucket sin dueño**.
  - Después nadie puede borrarlas desde la app: la política del dueño exige `auth.uid()` = carpeta.
- En Supabase no se pueden borrar por SQL: `storage.objects` está protegido y hay que usar la API de Storage.
- Corrección propuesta (dos capas):
  1. `delete_my_account` **se niega** si quedan archivos: `if exists (select 1 from storage.objects where bucket_id =
     'grasa-photos' and (storage.foldername(name))[1] = auth.uid()::text) then raise exception 'invalid' using
     errcode = '22023', detail = 'borra primero tus fotos';`. Así el cliente debe completar el `remove()` y
     reintentar.
  2. Como red de seguridad, una Edge Function o cron con `service_role` que borre las carpetas sin usuario en
     `auth.users`.
- Prueba: §6 (`QA-S3-1-D3`).

## Observaciones (no bloquean)
- **O1 · Privilegios por defecto de Supabase (verificar en el proyecto real):**
  - Las pruebas corren en un stub sin `ALTER DEFAULT PRIVILEGES`.
  - Si el proyecto real concede EXECUTE o ALL a `authenticated` por defecto en esquemas nuevos, el
    `revoke … from public, anon` **no** lo quita, porque el permiso estaría concedido directamente a `authenticated`.
  - Propuesta: añadir `revoke execute on all functions in schema core, grasa from authenticated, service_role;` y
    `revoke all on all tables … from authenticated;` **antes** de los `grant` explícitos.
  - Después de aplicar `r1.sql`, ejecutar en el SQL Editor la comprobación de la «lista blanca» de §1 (está en el
    test y se puede copiar tal cual).
- **O2 · `client_at` se puede antedatar** (p. ej. 2020) en `consent_events` y en `p_shares.client_at`: solo se acota
  el futuro. No afecta a la prueba de autorización porque manda `created_at` del servidor, pero el panel de
  Privacidad o los informes deben mostrar `created_at`.
- **O3 · URLs firmadas:** una vez emitida, la URL sigue valiendo hasta que caduca aunque el cliente revoque fotos o
  termine el vínculo. Propuesta para S3-3/S3-4: `createSignedUrl(path, 60)` (60 s), no cachearlas ni guardarlas en
  el dispositivo del coach.
- **O4 · `coach_clients.last_activity`** usa `max(server_updated_at)` de **todos** los registros, también los de
  categorías no compartidas (biblioteca, hábitos). Revela cuándo hubo actividad, no su contenido. Mejor calcularlo
  solo con las categorías compartidas (o solo `entry`).
- **O5 · Texto libre que ve otro usuario:** `display_name` (de los metadatos de registro), `business_name` (en la
  vista previa del código) y `comments.body` llegan a la UI de otra persona. En S3-3/S3-4, **siempre con `esc()`**:
  es el vector XSS entre usuarios de R1.
- **O6 · Comentarios tras terminar el vínculo:** el coach sigue pudiendo hacer `SELECT` de **sus** comentarios
  (política sin `status = 'active'`), incluido `read_at` del cliente. Es aceptable, pero si el contrato dice «corta
  todo», añadir el vínculo activo a la política.
- **O7 · Lápidas con datos:** `coach_pull` devuelve `data` también para los registros con `deleted_at`. El cliente
  de S2-4 sube lápidas sin datos, pero para defensa en profundidad conviene devolver `'{}'` si `deleted_at` no es nulo.
- **O8 · Sin cuota por usuario** en `records`/`photos`: 4 KB × filas sin límite. Hay que fijar un límite (p. ej.
  20 000 filas por usuario) antes de abrir el registro.
- **O9 · Pregunta legal (del Backend):** QA recomienda **no** borrar en cascada los `consent_events` en la baja, sino
  `on delete set null` + seudonimizar (hash del `user_id`). Son la prueba de autorización (Ley 1581, art. 9). Que lo
  decida el abogado.

## CI
- `.github/workflows/ci.yml`: nuevo job **`db`** (independiente del de E2E).
  - Hace `checkout` + Node 22, localiza `PG_BIN` (`/usr/lib/postgresql/<versión>/bin`) y ejecuta `npm run test:db`.
  - `ubuntu-latest` (24.04) trae PostgreSQL 16 **instalado y parado**, y el script crea su propio cluster con
    `initdb` en un directorio temporal, así que no hace falta arrancar el servicio. Si una imagen futura no lo trae,
    el paso instala `postgresql-16` con apt.
  - No necesita `npm ci`: el script solo usa Node.
- ⏳ No lo pude ejecutar en el runner real (sin acceso a GitHub Actions desde aquí). Se verá en el primer push. En
  local el job equivale a `PG_BIN=/usr/lib/postgresql/16/bin npm run test:db` → 193 OK.
