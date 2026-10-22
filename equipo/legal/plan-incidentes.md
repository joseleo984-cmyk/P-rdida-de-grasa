# Plan de incidentes de seguridad (una página)

> **Para quién:** José Granados, persona natural responsable del tratamiento. **No es asesoría legal.** Lo que no se pudo verificar en el repositorio está marcado **«por confirmar»**; el plazo exacto y el canal con la SIC los confirma el abogado (`preguntas-abogado.md`, P12). Versión 0.2 · 2026-10-23 (ajustada a `respuestas-abogado.md`: coach 24 h; SIC 15 días hábiles, **por confirmar**).

## 1. Qué cuenta como incidente
Cualquier hecho que **pueda** haber dejado ver, cambiar, perder o borrar datos de personas sin autorización. Ejemplos: una clave secreta (`sb_secret_…`, `service_role`, clave SMTP de Brevo) publicada o enviada por error; un teléfono o computador de un coach o del responsable perdido o robado con la sesión abierta; un coach que reenvía o publica datos o fotos de un cliente; alguien que ve datos que no le corresponden (error de permisos); un correo de códigos que llega a otra persona; un aviso de Supabase o Brevo sobre acceso indebido. **En duda, se trata como incidente** y se descarta después.

## 2. Quién decide
**José Granados** decide todo (contener, avisar, cerrar). Si no está localizable, no hay suplente definido: **por confirmar** (conviene nombrar uno). Cualquier coach, cliente o persona del equipo que detecte algo avisa a **joseleo984@gmail.com** o al **+57 312 887 6135** (datos ya públicos en la política). El Acuerdo del coach (borrador v0.3) obliga a los coaches a avisar **en máximo 24 horas** desde que lo sepan (P12).

## 3. Primeras 2 horas: contener
Anota la hora a la que te enteraste (la necesitarás en el registro, sección 7). Haz solo lo que aplique.

1. **Pausar registros nuevos.** Supabase → *Authentication → Sign In / Providers → Email* → desactiva **Allow new users to sign up** → Save (es el mismo interruptor que `guia-supabase-stakeholder.md` §7.1 pide tener activado; para volver, se activa de nuevo).
2. **Rotar claves** (`guia-supabase-stakeholder.md` §«No nos envíe nunca», regla de rotación):
   - Clave secreta / `service_role` expuesta: en Supabase, pantalla de claves de API del proyecto, **crear una nueva y eliminar la vieja** (la vieja deja de servir). Ruta exacta del menú: **por confirmar** (cambia con el tiempo).
   - Clave SMTP de Brevo expuesta: Brevo → *SMTP & API → SMTP → Generate a new SMTP key*; pega la nueva en Supabase → *Authentication → Emails → SMTP Settings → Password* y desactiva/borra la anterior en Brevo (opción de borrar: **por confirmar**).
   - La clave **publicable** (`sb_publishable_…`) es pública por diseño: no hace falta rotarla por haberse visto.
3. **Cortar el acceso de una persona o un coach** (SQL Editor de Supabase, como dueño de la base; sustituye el uuid):
   - Coach: `update grasa.coaches set active = false where user_id = '<uuid>';` (`coach_can_see` exige `active`: pierde el acceso a todos sus clientes al instante y su código deja de servir).
   - Cualquier persona: `update core.app_access set active = false where user_id = '<uuid>';` y, si hay que echarla del todo, borrar el usuario en *Authentication → Users*.
4. **Cerrar sesiones abiertas.** La sesión dura como máximo 3600 s (ajuste del checklist). Para forzar el cierre antes: *Authentication → Users* y eliminar o bloquear al usuario (opción de «cerrar todas las sesiones» del panel: **por confirmar**). Una cuenta borrada sigue con el token válido hasta caducar, sin ver datos (riesgo ya aceptado en `checklist-antes-de-abrir.md`).
5. **Último recurso: pausar o apagar.** Supabase → *Project Settings → General → Pause project* (**por confirmar**). Para que la app deje de hablar con el servidor sin tocar Supabase: `equipo/handoffs/conectar-plataforma.md`, sección «Reversa» (config.js vacío): la app sigue funcionando en cada teléfono, solo local.
6. **No borres pruebas.** No elimines registros, logs ni correos relacionados hasta documentar el incidente (sección 7). Los consentimientos no se pueden borrar ni modificar (solo inserción).
7. **Guarda evidencia:** capturas de pantalla, hora, a quién escribió o qué mensaje llegó.

## 4. Evaluar qué datos se vieron
En el SQL Editor (solo lectura): ¿qué cuentas están involucradas? `select user_id, kind, granted, version, created_at from core.consent_events where user_id = '<uuid>' order by created_at;` y los vínculos `select * from grasa.coach_links where coach_id = '<uuid>' or client_id = '<uuid>';`. Lo que cada coach pudo ver depende de las categorías que el cliente compartió (peso y medidas siempre; notas, comidas, hábitos solo si las activó; **fotos: apagadas en esta versión**, no se suben a la nube). Datos de salud = **sensibles**: trátalo como más grave. Anota: cuántas personas, qué categorías, desde cuándo, si hubo copia fuera de la app. Registros de acceso a fotos: `grasa.photo_views` (hoy sin fotos en la nube). Los logs de acceso de Supabase y Brevo disponibles en el plan gratuito: **por confirmar**.

## 5. A quién avisar
| A quién | Cuándo | Cómo |
|---|---|---|
| **Titulares afectados** (clientes) | En cuanto sepas qué datos y de quién (P12: la plataforma informa a los titulares afectados) | Mensaje por el medio que ya usas con ellos (WhatsApp o correo); **sin datos de salud en el mensaje**. Plantilla en la sección 6. |
| **Coaches** involucrados | De inmediato, para que dejen de usar y destruyan copias; ellos te avisan a ti en **máx. 24 h** si el incidente nace de su lado | Mensaje directo; recuérdales el Acuerdo del coach. |
| **SIC** (Superintendencia de Industria y Comercio) | **Informe circunstanciado en máximo 15 días hábiles desde que constatas el incidente** (P12). **Por confirmar con el abogado:** que ese sea el plazo exacto y si aplica a una persona natural no inscrita en el RNBD. **Cuenta el plazo desde la hora anotada en la sección 7.** | **Canal: por confirmar con el abogado.** |
| **Supabase / Brevo** | Si el incidente viene de su plataforma o necesitas sus registros | Soporte de cada proveedor (canal: por confirmar). |
| **Abogado** | Desde el primer día, antes de avisar a la SIC | Llámalo con el registro de la sección 7 en la mano. |

## 6. Plantilla de mensaje a los afectados
> Asunto: Aviso de seguridad sobre tus datos en Pérdida de Grasa
>
> Hola [nombre]. Te escribo porque el [fecha] detectamos que [qué pasó, en una frase simple y sin tecnicismos]. Los datos que pudieron verse son: [categorías: peso y medidas, comidas, etc.]. **No** se vieron: [lo que no, p. ej. fotos, que hoy no se suben a la nube].
> Ya hicimos esto: [contención: cambiamos las claves, desactivamos el acceso de…].
> Te recomendamos: [por ejemplo, revisar tu correo por mensajes extraños; no compartir códigos].
> Puedes pedirnos que borremos tu cuenta o ejercer tus derechos en cualquier momento, y presentar una queja ante la Superintendencia de Industria y Comercio si lo prefieres.
> Contacto: José Granados · joseleo984@gmail.com · +57 312 887 6135.

El abogado revisa el texto antes del primer uso real.

## 7. Registro del incidente (copia esta plantilla por cada caso)
| Campo | Valor |
|---|---|
| N.º y fecha de apertura | |
| Quién lo detectó, cómo y a qué hora | |
| Cuándo ocurrió (estimado) y cuándo se supo | |
| Qué pasó (hechos, sin suposiciones) | |
| Datos y personas afectadas (cuántas, categorías) | |
| Medidas de contención y hora de cada una | |
| A quién se avisó, cuándo y por qué canal (titulares, coaches, SIC, proveedores) | |
| Decisiones y quién las tomó | |
| Cierre: fecha y estado final | |
Guárdalo fuera del repositorio (nunca con datos de salud ni claves dentro).

## 8. Revisión posterior (en los 7 días siguientes)
Causa raíz; qué falló y qué funcionó; qué cambia (código, ajuste en Supabase/Brevo, texto del Acuerdo, capacitación); si hay que subir la versión de los textos legales; actualizar este plan y los «por confirmar» que el abogado resolvió. Anótalo en el mismo registro.
