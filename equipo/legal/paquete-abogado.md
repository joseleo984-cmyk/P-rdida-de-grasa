> **Documento de trabajo para la consulta con el abogado. No es asesoría legal: son hechos y preguntas.**
> Revisión 1 · 2026-10-22 · Autor: Analista de Producto · Para: José Granados (responsable), a llevar al abogado.
> Todo lo que dice "hecho" se verificó en el código o en la base de datos del repositorio; el archivo que lo respalda está al lado. Lo que no se pudo verificar está marcado **«por confirmar»**.

# Paquete para la consulta con el abogado

## A. Resumen en 10 líneas

1. **Pérdida de Grasa** es una aplicación web (se instala en el celular) para registrar peso, medidas, comidas, hábitos y fotos de progreso.
2. **Responsable del tratamiento:** José Granados, persona natural, Barranquilla (Colombia). Solo Colombia.
3. **Tres papeles:** la **plataforma** (José) pone la aplicación y el servidor; el **coach** acompaña a sus clientes; el **cliente** registra sus datos.
4. Cada persona tiene su **propia cuenta**: correo y un código de 6 dígitos que llega al correo. No hay contraseñas.
5. Los datos se guardan primero **en el celular del cliente**. Si tiene cuenta, se sincronizan con un servidor en **Supabase (EE. UU.)**: una «copia en la nube».
6. El **cliente decide qué ve su coach**: peso y medidas (obligatorio mientras haya vínculo), y aparte notas, comidas, hábitos y fotos. Cada una se puede quitar cuando quiera.
7. El coach se vincula con un **código, enlace o QR** de invitación. Ya **no se usa WhatsApp para enviar datos**; solo para compartir el enlace de invitación.
8. **Modelo de ingreso:** gratis para el coach hasta 5 clientes; luego USD 5 por cliente activo al mes, cobrado **fuera de la app**. En una fase 2, el cliente pagaría dentro de la app (no existe todavía).
9. El servidor está montado y se probó con 61 pruebas de seguridad en vivo (2026-10-22), pero la **aplicación oficial aún no está conectada a él**: se conectará solo cuando el abogado dé su visto bueno.
10. **Lo que se pide al abogado:** que diga qué debe estar resuelto (textos, contratos, plazos) antes de conectar la app y recibir datos reales de salud.

---

## B. Mapa de datos

| Dato | Dónde se guarda | Quién lo ve | Cuándo se borra | Base de autorización |
|---|---|---|---|---|
| **Correo electrónico** | Supabase (sistema de cuentas) y el proveedor de correo (Brevo) al enviar el código | El titular. **El coach NO ve el correo del cliente** (solo el nombre que el cliente escribió) | Al borrar la cuenta | Aceptación de T&C y Política al crear la cuenta |
| **Nombre para mostrar** | Supabase (`core.profiles`) | El titular y su coach vinculado | Al borrar la cuenta | Igual |
| **Perfil de salud** (sexo, edad, estatura, peso inicial y meta, actividad, ritmo) | Teléfono y Supabase (`grasa.records`) | El titular y su coach (categoría «peso y medidas», obligatoria mientras haya vínculo) | Al borrar la cuenta; el titular puede borrar registros | Autorización expresa de **datos sensibles de salud** (casilla separada) |
| **Peso y medidas** diarias | Teléfono y Supabase | Titular y coach (obligatoria con vínculo) | Igual | Igual + consentimiento de compartir |
| **Comidas** y **hábitos** | Teléfono y Supabase | Titular; coach solo si el cliente lo permite (por categoría) | Igual | Igual + consentimiento de compartir por categoría |
| **Notas personales** (campo `note`) | Teléfono y Supabase | Titular; **el coach NO las ve salvo permiso expreso** («notas»). El servidor las elimina antes de entregarlas | Igual | Consentimiento aparte («notas») |
| **Fotos de progreso** | **Hoy solo en el teléfono (IndexedDB).** La subida a la nube existe en el código pero está **apagada**: `photosCloudAllowed: () => false` en `app.js` línea 1512, porque aún no existe la autorización «copia de fotos en la nube» | Hoy: solo el titular. Cuando se active: titular y coach, solo las fotos marcadas una a una, si el cliente permitió «fotos» | Al borrar la foto o la cuenta (la app borra los archivos y luego la cuenta) | Consentimiento propio de fotos (aún por redactar) |
| **Comentarios del coach** al cliente | Supabase (`grasa.comments`) | Coach y cliente de ese vínculo | Al borrar la cuenta de cualquiera de los dos | Parte del servicio aceptado |
| **Registro de consentimientos** (qué texto, versión, fecha, huella del texto) | Supabase (`core.consent_events`), solo inserción | El titular lee los suyos. El coach no | **Hoy se borra junto con la cuenta.** Si el abogado quiere conservarlo como prueba, se cambia (pregunta P8) | Prueba de la autorización |
| **Registro de vistas de fotos por el coach** | Supabase (`grasa.photo_views`) | El cliente ve quién abrió sus fotos y cuándo | Al borrar la cuenta | Transparencia hacia el titular |
| **Intentos de código de invitación** | Supabase (`grasa.invite_attempts`) | Nadie (control interno) | Se purga a 1 día | Seguridad |
| **Datos del coach** (correo, nombre comercial, clientes vinculados) | Supabase | El coach y la plataforma; cada cliente ve el nombre comercial de su coach | Al borrar la cuenta | T&C del coach |

Notas de hecho: el cliente solo puede declarar que es **mayor de 18 años** con una casilla; el formulario del perfil acepta edades desde 14 (`schema.js`, función `profileError`), así que **hoy no hay verificación de edad**. Cuando un vínculo termina (por el cliente o por el coach), el coach **pierde el acceso**; los datos siguen en la cuenta del cliente. El panel del coach guarda lo que ve **solo en memoria**, no en el almacenamiento del teléfono del coach (`coach-panel.js`).

---

## C. Subencargados y terceros

| Tercero | Para qué | Qué recibe | Ubicación | Estado |
|---|---|---|---|---|
| **Supabase** (proyecto `plataforma`) | Base de datos, cuentas, almacenamiento de fotos | Todos los datos de la tabla B marcados «Supabase» | **EE. UU.** (región East US, Virginia, según `guia-supabase-stakeholder.md`). Plan gratuito. **DPA y país exacto de la empresa: por confirmar** | Montado y probado |
| **Brevo** (correo de códigos) | Enviar el código de 6 dígitos | Correo del usuario y el código | **No consta en el repositorio dónde están sus servidores** (se asume UE por su sede; **por confirmar**). Plan gratuito, 300 correos al día. El remitente hoy es una dirección genérica de Brevo (brevosend.com), sin dominio propio | Montado |
| **GitHub Pages** | Alojar la aplicación (archivos estáticos) | Ninguno de los datos de salud; solo recibe la visita como cualquier sitio web | EE. UU. (por confirmar) | En uso |
| **WhatsApp (Meta)** | Solo para que el coach **comparta el enlace de invitación** | **Ningún dato de salud**: el código dice que solo va el enlace | Meta, fuera de Colombia | Ya no se usa para datos |
| Google Drive u otras carpetas | Ya **no se usan** para archivos de clientes (eran del piloto con WhatsApp) | — | — | Descartado |

---

## D. Controles técnicos ya implementados

| Control | Qué hace, en palabras sencillas | Dónde está |
|---|---|---|
| **Seguridad por filas (RLS)** | Cada persona solo puede leer y escribir sus propios datos; ninguna tabla es pública. | `supabase/migrations/20261021120000_r1_core.sql`, `…120100_r1_grasa.sql` |
| **El coach nunca lee las tablas de salud** | Solo recibe lo que entrega una función del servidor que revisa que el vínculo esté activo y filtra por categoría. | `…120100_r1_grasa.sql` (`coach_pull`) |
| **Consentimiento granular** | Peso y medidas obligatorios con vínculo; notas, comidas, hábitos y fotos opcionales y revocables, cada cambio queda registrado. | `…120100_r1_grasa.sql` (`join_coach`, `update_shares`) |
| **Minimización: el coach no ve notas sin permiso** | El campo `note` se quita de todo lo que recibe el coach mientras no haya permiso. | `…150000_r1_notas_todos_kinds.sql` |
| **Registro de consentimientos solo-inserción** | Nadie (ni el dueño del sistema) puede modificarlos o borrarlos; solo desaparecen con la baja de la cuenta. El servidor fija la hora y guarda la huella (SHA-256) del texto exacto aceptado. | `…120000_r1_core.sql` (`consent_events`) |
| **Fotos privadas con enlaces de 60 segundos** | El almacenamiento no es público; el coach solo abre fotos compartidas, con enlace que vence en 60 s, y queda registro de cada vista. | `…120200_r1_storage.sql`, `remote.js` (`SIGNED_URL_S = 60`), `…120100_r1_grasa.sql` (`photo_views`) |
| **Borrado de cuenta** | Borra la cuenta y, en cascada, todos sus datos. Antes la app borra las fotos; la baja se niega si quedan archivos. | `…120000_r1_core.sql` (`delete_my_account`), `…130000_r1_fix_seguridad.sql`, `remote.js` |
| **Límite de intentos de códigos de invitación** | Máximo 20 intentos por hora y usuario; el código puede caducar o tener un máximo de usos. | `…120100_r1_grasa.sql` (`count_attempt`) |
| **Códigos de acceso por correo** | 6 dígitos, vencen en 10 minutos, 1 por minuto; sesión de 1 hora o menos. | `account.js`; ajustes de Supabase en `checklist-antes-de-abrir.md` |
| **Pruebas** | 61 pruebas de seguridad contra el servidor real el 2026-10-22, más pruebas SQL en `supabase/tests/`. | `supabase/tests/`, `equipo/r1-contrato.md` §12 |

---

## E. Lo que NO está hecho todavía

- **Copias de seguridad:** el plan gratuito de Supabase no tiene; se pausa tras ~7 días sin uso. Mitigación actual: cada celular conserva su copia y se puede exportar. Pasar a plan Pro está **pendiente de decisión**.
- **Dominio propio para el remitente** del correo (hoy un correo personal), y autenticación de ese dominio en Brevo.
- **Captcha** en el inicio de sesión (protege contra abuso del envío de códigos).
- **Texto de consentimiento de la versión con cuentas** y el de «copia en la nube»: los textos vigentes (`terminos-y-condiciones.md`, `politica-tratamiento-datos.md`) describen aún la fase sin cuentas.
- **Autorización «copia de fotos en la nube»:** no existe; por eso las fotos no suben.
- **Retención de cuentas inactivas:** no hay plazo ni proceso automático.
- **Verificación de edad:** solo una casilla.
- **Acuerdo de encargado con los coaches:** no existe un texto firmado.
- **Barrido de fotos huérfanas** tras bajas por fuera de la app: es una herramienta manual (`supabase/tools/sweep-orphan-photos.js`).
- **Prueba en iPhone/Safari real** y conexión de la app oficial a `plataforma`.
- Riesgo aceptado: tras borrar una cuenta, el permiso de sesión antiguo sigue válido hasta que caduca (≤ 1 h); no da acceso a datos.

---

## F. Documentos a adjuntar

1. `equipo/legal/preguntas-abogado.md` (rev. 3): las preguntas y la tabla de decisiones.
2. `equipo/legal/terminos-y-condiciones.md` y `equipo/legal/politica-tratamiento-datos.md` (vigentes, de la fase sin cuentas).
3. Este documento.
4. `equipo/r1-contrato.md` §2 y §11–12 (diseño de la base de datos y correcciones de seguridad), solo si el abogado quiere el detalle.
5. `equipo/decisiones-negocio.md` (modelo de negocio y decisiones del responsable).
6. Capturas de las pantallas de consentimiento y de compartir con el coach (por generar).
