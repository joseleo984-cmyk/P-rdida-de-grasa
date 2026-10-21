# Guía para crear el servidor (Supabase), paso a paso

Para: José (Stakeholder) · De: Arquitecto · Fecha: 2026-10-21 · Tiempo estimado: **45–60 minutos** · Coste: **USD 0** (plan gratis)

Supabase es el servicio donde van a vivir las cuentas y los datos de la app cuando estén en la nube. Usted crea la
cuenta y los proyectos a su nombre. El equipo **no** necesita entrar en su cuenta: solo le pediremos **dos datos
públicos** (paso 5). Lo que dice "(a verificar)" es algo que no hemos podido confirmar del todo. Si la pantalla que ve
no coincide con lo que dice esta guía, haga una captura y nos la pasa.

> ### 🔒 Las 3 reglas de oro
> 1. La **contraseña de la base de datos** la guarda **solo usted** (en un gestor de contraseñas o en papel en un lugar
>    seguro). **No se la pase a nadie**, tampoco al equipo, ni por WhatsApp ni por correo.
> 2. La **clave secreta** (se llama `secret`, empieza por `sb_secret_…`, o `service_role` en pantallas antiguas)
>    **no se comparte nunca**. Con ella se pueden leer todos los datos de todos los usuarios.
> 3. Lo único que nos pasa es la **dirección del proyecto** (Project URL) y la **clave pública** (`publishable`, que
>    empieza por `sb_publishable_…`, o `anon` en pantallas antiguas). Esas dos sí son públicas: van dentro de la app.

---

## 1. Qué necesita antes de empezar
- Un computador (es más cómodo que el celular para esta configuración).
- Su correo `joseleo984@gmail.com` (o el que vaya a usar para administrar la app).
- Un lugar seguro donde anotar contraseñas (gestor de contraseñas recomendado: el de Google, Apple, Bitwarden…).
- 15 minutos más para el paso 7 (correo para enviar los códigos de acceso).

## 2. Crear la cuenta
1. Entre en **https://supabase.com** y pulse **Start your project** (o **Sign up**).
2. Regístrese con su correo (o con su cuenta de GitHub, si ya tiene una). Confirme el correo que le llega.
3. **Active la verificación en dos pasos** de su cuenta de Supabase (menú de su usuario → *Account* → *Security* /
   *Multi-factor authentication*; a verificar el nombre exacto). Es la llave de todo el servidor: que no dependa solo de una contraseña.
4. Si le pide crear una **organización**, póngale de nombre `José Granados` (o el nombre de su marca) y elija el plan
   **Free** (gratis).

## 3. Crear el proyecto principal: `plataforma`
1. Pulse **New project**.
2. Rellene:
   - **Name (nombre):** `plataforma`. Es un solo proyecto para esta y sus próximas apps, como acordamos.
   - **Database password (contraseña de la base de datos):** pulse **Generate a password** y **guárdela usted** en su
     gestor de contraseñas con el nombre "Supabase plataforma – base de datos". Regla de oro 1: no se la pase a nadie.
   - **Region (región):** **East US (North Virginia)**, también llamada `us-east-1`.
   - **Plan:** Free.
3. Pulse **Create new project** y espere 1–2 minutos a que termine de prepararse.

**¿Por qué Virginia (EE. UU.) y no São Paulo (Brasil)?** Desde Barranquilla, el tráfico de internet sale casi todo
por los cables submarinos del Caribe hacia Miami. Desde ahí, Virginia queda cerca. Para llegar a São Paulo, muchas
veces la conexión también sube primero a Miami y luego baja hasta Brasil. Tiempos de respuesta aproximados desde la
costa colombiana: unos **60–90 ms a Virginia** y unos **120–180 ms a São Paulo** (a verificar). La app guarda primero
en el celular, así que el usuario casi no lo notará, pero el panel del coach carga más rápido con Virginia. Además, la
región **no se puede cambiar después** sin mudar los datos.
*Si quiere comprobarlo antes de crear el proyecto:* desde su casa en Barranquilla, abra la web **https://www.cloudping.info**
(mide el tiempo hasta cada región de Amazon, que es donde está Supabase; a verificar que siga funcionando), pulse
**HTTP Ping** y anótenos los números de **US East (N. Virginia)** y **South America (São Paulo)**. Si São Paulo saliera
claramente más rápido, elija esa región.
*Nota legal:* en los dos casos los datos quedan fuera de Colombia (transferencia internacional, Ley 1581). Por eso está
en la lista de preguntas para el abogado (`equipo/legal/preguntas-abogado.md`).

## 4. Crear el segundo proyecto: `pruebas`
El plan gratis permite **2 proyectos**. El segundo lo usaremos para probar sin tocar los datos reales del piloto.
Repita el paso 3 con:
- **Name:** `pruebas`
- **Database password:** otra contraseña generada, que también guarda usted ("Supabase pruebas – base de datos").
- **Region:** la misma que eligió para `plataforma`.

## 5. Qué datos debe pasarnos (y cuáles no)
En **cada** proyecto (`plataforma` y `pruebas`):
1. Pulse el botón **Connect** (arriba), o vaya a **Project Settings → API Keys** / **Data API** (el nombre del menú
   puede variar; a verificar).
2. Copie estos **dos** datos:
   - **Project URL**: se parece a `https://abcdefghijklmnop.supabase.co`.
   - **Publishable key**: empieza por `sb_publishable_…`. En pantallas antiguas se llama **anon public**.
3. Envíelos al Scrum Master así (por el canal que use con el equipo):
   ```
   Proyecto pruebas:     URL = https://….supabase.co   ·  publishable = sb_publishable_…
   Proyecto plataforma:  URL = https://….supabase.co   ·  publishable = sb_publishable_…
   Región elegida: ……
   ```

**No nos envíe nunca:** la contraseña de la base de datos, la **secret key** (`sb_secret_…`) ni la **service_role**,
la "connection string" (la dirección que empieza por `postgresql://` y lleva la contraseña dentro), los códigos de su
verificación en dos pasos ni la contraseña de Brevo (paso 7). Si alguna vez la comparte por error, avísenos: se puede
**rotar** (cambiar por una nueva) desde la misma pantalla y la vieja deja de servir.

## 6. Aplicar los cambios de la base de datos (cuando el equipo se lo pida)
El equipo le entregará **un archivo**, por ejemplo `supabase/r1.sql`, que crea las tablas y las reglas de seguridad.
Usted lo aplica así, **primero en `pruebas`** y, solo cuando le digamos, en `plataforma`:
1. Abra el proyecto correcto. Mire el nombre arriba a la izquierda: tiene que decir `pruebas` o `plataforma`.
2. Menú izquierdo → **SQL Editor** → **New query**.
3. Abra el archivo que le pasamos, seleccione **todo** el texto (Ctrl+A), cópielo y péguelo en el editor.
4. Pulse **Run**. Al final debe aparecer una fila con un texto como **`OK r1 v1`**. Si sale un error en rojo, **no
   haga nada más**: mándenos una captura.
5. Solo la primera vez: vaya a **Project Settings → Data API** (o **Integrations → Data API**; a verificar) y en
   **Exposed schemas** añada `core` y `grasa` (junto a `public`). Guarde.

Ejecutarlo dos veces no hace daño: el archivo está preparado para eso.

## 7. Activar el acceso con código de 6 dígitos por correo
Así entran coaches y clientes: escriben su correo, les llega un código de 6 dígitos y lo copian en la app. No hay
contraseñas. **Hágalo en los dos proyectos.**

### 7.1 Ajustes de acceso
1. Menú → **Authentication** → **Sign In / Providers** (o **Providers**) → **Email**:
   - **Enable Email provider:** activado.
   - **Allow new users to sign up / Enable sign ups:** activado.
   - **Email OTP Length:** `6` (a verificar el nombre: hay proyectos que vienen con 8).
   - **Email OTP Expiration:** `600` segundos (10 minutos).
   - Guarde.
2. **Authentication → Emails → Templates.** Cambie las plantillas **"Magic Link"** y **"Confirm signup"** para que el
   correo muestre el código y no un enlace (a verificar cuál usa Supabase con un usuario nuevo; por eso cambiamos las dos):
   - **Subject (asunto):** `Tu código para entrar: {{ .Token }}`
   - **Body (cuerpo), pegue:**
     ```html
     <h2>Tu código de acceso</h2>
     <p>Escribe este código en la app para entrar:</p>
     <p style="font-size:28px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
     <p>Caduca en 10 minutos. Si no lo pediste, ignora este correo.</p>
     ```
   Lo importante es que aparezca `{{ .Token }}` y que **no** aparezca `{{ .ConfirmationURL }}`.

### 7.2 Por qué hace falta un servicio de correo propio
El correo que trae Supabase "de fábrica" sirve solo para probar: según su documentación, envía unos **3 correos por
hora para todo el proyecto**, y según varias guías **solo a los correos del equipo** de su organización de Supabase
(a verificar). Con 2 coaches y 10 clientes no alcanzaría ni para el primer día. Hay que conectar un servicio de envío
de correo (SMTP).

**Recomendación para una persona natural sin dominio propio: Brevo (gratis, 300 correos al día).**
1. Cree una cuenta en **https://www.brevo.com** (plan **Free**).
2. En Brevo → **Senders, Domains & Dedicated IPs → Senders** → **Add a sender**: nombre `Pérdida de Grasa`, correo el
   suyo (`joseleo984@gmail.com`). Confirme el correo de verificación que le llega.
3. En Brevo → **SMTP & API** → pestaña **SMTP** → **Generate a new SMTP key**. Copie el **login SMTP** y la **clave
   SMTP**. Esa clave es secreta (regla 2: no se comparte).
4. En Supabase → **Authentication → Emails → SMTP Settings** (o **Project Settings → Authentication → SMTP**) →
   **Enable custom SMTP**:
   - **Sender email:** `joseleo984@gmail.com` (el mismo que verificó en Brevo)
   - **Sender name:** `Pérdida de Grasa`
   - **Host:** `smtp-relay.brevo.com` · **Port:** `587`
   - **Username:** el login SMTP de Brevo · **Password:** la clave SMTP de Brevo
   - Guarde.
5. **Authentication → Rate Limits:** con SMTP propio suele permitir unos 30 correos por hora. Póngalo en `60` por hora
   (a verificar el valor por defecto).
6. **Prueba:** pídanos que le enviemos un código desde la versión de prueba de la app, o use **Authentication → Users
   → Add user → Send invitation**. Compruebe que llega a **Gmail, Hotmail/Outlook e iCloud** y mire también la carpeta
   de **spam**.

**Aviso sobre Gmail como remitente:** enviar "desde" una dirección @gmail.com a través de otro servicio hace que
algunos buzones marquen el correo como sospechoso. Puede acabar en spam o, en el peor caso, no llegar (a verificar
con la prueba del punto 6). Para el piloto puede bastar. Si los códigos caen en spam:
- **Plan B (recomendado antes de crecer):** comprar un dominio propio (unos USD 10–15 al año, a verificar), por
  ejemplo `perdidadegrasa.co`, y autenticarlo en Brevo. Con dominio propio también vale **Resend** (gratis hasta
  3.000 correos al mes y 100 al día; sin dominio propio solo sirve para pruebas).

## 8. Límites del plan gratis y cuándo pasar a Pro
| Límite del plan gratis (a verificar en supabase.com/pricing) | Qué significa para nosotros |
|---|---|
| **Se pausa si pasa ~1 semana sin uso.** | Mientras el piloto esté activo no pasa, porque los clientes registran a diario. Si se pausa: entre en el panel → proyecto → **Restore**. Los celulares conservan sus datos y los subirán cuando vuelva. |
| **Sin copias de seguridad automáticas.** | Es el riesgo más importante. Lo compensa que cada celular guarda su copia (local-first) y que la app permite exportar. Para datos que no se pueden perder, hay que pasar a Pro. |
| Base de datos de **500 MB**, archivos (fotos) **1 GB**, **5 GB** de descarga al mes, **50.000** usuarios activos al mes. | El piloto (2 coaches × 5 clientes, 4 semanas) usa del orden de **25–50 MB** de fotos y menos de 10 MB de datos. Sobra. |
| **2 proyectos** gratis. | `plataforma` y `pruebas`. Una tercera app necesitaría Pro o compartir `plataforma` (eso es lo previsto). |

**Pase a Pro (USD 25 al mes, a verificar) cuando ocurra lo primero de esto:**
1. Termina el piloto y siguen usuarios reales (los datos ya no se pueden perder: hacen falta copias de seguridad).
2. Más de **3 coaches o 20 clientes** activos.
3. La base pase de **400 MB** o las fotos de **800 MB** (lo vigilamos nosotros y le avisamos).
4. Lance una segunda app con usuarios reales.
5. El proyecto se pause una vez durante el piloto, o el panel de Supabase le avise de que se acerca a un límite.

Con Pro: **Organization → Billing → Upgrade** (tarjeta en dólares). Active el **Spend cap** (tope de gasto) para que
nunca cobre más que la cuota.

## 9. Lista final para responder al equipo
- [ ] Cuenta de Supabase creada, con verificación en dos pasos.
- [ ] Proyecto `plataforma` y proyecto `pruebas` creados, en la **misma región** (diga cuál).
- [ ] Contraseñas de base de datos guardadas **solo por usted**.
- [ ] Enviados al Scrum Master: Project URL + publishable key de cada proyecto.
- [ ] Código de 6 dígitos activado y plantillas cambiadas (en los dos proyectos).
- [ ] Brevo conectado como SMTP y prueba de correo hecha (diga si llegó a Gmail, Outlook e iCloud o cayó en spam).
- [ ] (Cuando se lo pidamos) SQL aplicado en `pruebas` con resultado `OK`, y los esquemas `core` y `grasa` expuestos.

¿Dudas? Mande una captura de la pantalla donde se quedó y le decimos el siguiente clic.

---
Fuentes consultadas (para el equipo): límites de correo de Supabase ([rate limits](https://supabase.com/docs/guides/auth/rate-limits));
código por correo ([email OTP](https://supabase.com/docs/guides/auth/passwordless-login/auth-email-otp));
claves publishable/secret ([API keys](https://supabase.com/docs/guides/api/api-keys)); Brevo + Supabase
([guía Brevo](https://developers.brevo.com/docs/supabase-smtp-integration), [plan gratis](https://www.brevo.com/free-smtp-server/));
límites del plan gratis (fuentes secundarias: [JetAdmin](https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/),
[Automation Atlas](https://automationatlas.io/answers/supabase-free-tier-limits-2026/)); Resend gratis ([review](https://wpmailsmtp.com/resend-review/)).
