# Captcha del código por correo (Cloudflare Turnstile): guía paso a paso

Para: José (Stakeholder), que trabaja desde un iPad · De: Dev Frontend · Sprint 9 · Coste: **USD 0** · Tiempo: unos 30 minutos en total

## Para qué sirve (en una frase)
Cuando alguien pide el código por correo, la app comprueba antes que es una persona y no un programa que pide miles de códigos para llenar su cuota de Brevo (300 correos al día) o molestar a otras personas. Casi siempre la persona **no ve nada**: la verificación pasa sola. Solo si Cloudflare duda, aparece una casilla para tocar.

## Qué ya está hecho en la app (no tiene que hacer nada aquí)
- La app tiene un campo nuevo, `captchaSiteKey`. **Vacío = todo funciona como hasta ahora** y no se descarga nada de Cloudflare.
- Con la clave puesta, en la pantalla «Crear cuenta o entrar» la app verifica y manda el resultado a Supabase junto con el pedido del código. También lo hace al «Reenviar código».
- Si Cloudflare no carga (sin internet, bloqueador de anuncios) la app dice: *«No pudimos verificar que eres una persona. Revisa tu conexión e intenta de nuevo»* y sigue funcionando; también se puede usar la app sin cuenta.
- La clave **secreta** nunca está en el repositorio. Las pruebas automáticas fallan si alguien la pone por error.

## Las dos claves (no las confunda)
| | Dónde va | ¿Es secreta? |
|---|---|---|
| **Site key** (clave del sitio) | En la app (`config.pruebas.js`), por una PR que preparo yo | **Pública.** Me la puede pasar por el chat. |
| **Secret key** (clave secreta) | **Solo** en el panel de Supabase | **Secreta.** No me la pase a mí, ni al chat, ni a nadie. |

Las dos empiezan por `0x4…`. La **secret key es más larga** (unos 35 caracteres o más); la site key tiene unos 24. Cloudflare las rotula «Site Key» y «Secret Key».

---

## ORDEN SEGURO (léalo antes de empezar)
> **Peligro:** si activa el captcha en Supabase y la app **todavía no manda** la verificación, **nadie puede pedir un código** y el acceso queda roto.

Por eso el orden es siempre este:
1. Crear la clave en Cloudflare.
2. **Primero la app:** yo preparo la PR con la site key, usted la aprueba y espera a que se publique.
3. Comprobar que la app sigue funcionando (el código sigue llegando).
4. **Después** encender el captcha en Supabase pegando la secret key.
5. Probar.

Se hace primero en **`pruebas`** y solo cuando eso funcione, en **`plataforma`**.
*(Si por error enciende Supabase antes de que la app esté publicada, solo se rompe `/pruebas/` unos minutos; en `plataforma` hoy no hay nadie conectado. Aun así, siga el orden.)*

---

## Paso A. Crear la cuenta de Cloudflare y los widgets (hágalo en Safari del iPad)
1. Entre a **https://dash.cloudflare.com/sign-up**. Escriba su correo y una contraseña (guárdela en su gestor de contraseñas). Confirme el correo que le llega. **No** le pide tarjeta ni dominio.
   - *Debe ver:* el panel de Cloudflare (a veces le pide «Add a domain»: ignórelo, no hace falta).
2. En el menú de la izquierda busque **Turnstile**. (En iPad puede estar detrás del icono de las tres rayas ☰.) *(a verificar: el nombre exacto del menú cambia; si no lo encuentra, escriba «Turnstile» en el buscador del panel.)*
3. Pulse **Add widget** (Agregar widget).
4. Rellene:
   - **Widget name:** `perdida-de-grasa-pruebas`
   - **Hostname:** agregue `joseleo984-cmyk.github.io` (solo el dominio, **sin** `https://` y **sin** `/P-rdida-de-grasa/`).
   - **Widget Mode:** **Managed** (el recomendado).
   - **Pre-clearance:** No.
5. Pulse **Create**.
   - *Debe ver:* una pantalla con **Site Key** y **Secret Key**.
6. Copie la **Site Key** y guárdela en sus notas. Copie la **Secret Key** y guárdela **solo** en su gestor de contraseñas (o papel).
7. Repita los pasos 3–6 para un segundo widget `perdida-de-grasa-plataforma` (mismo dominio, Managed). Así cada servidor tiene su propia clave y se pueden cambiar por separado. Haga este segundo widget ahora o cuando conectemos `plataforma`.

## Paso B. Pásenos la site key y esperamos la PR (solo `pruebas`)
1. Escríbame en el chat la **Site Key de `pruebas`** (la que dice «Site Key», NO la secreta).
2. Yo preparo una PR que la pone en `config.pruebas.js` (`captchaSiteKey: '0x4…'`). La PR no toca `config.js` ni la raíz.
3. Usted la revisa y la aprueba (Merge). *Debe ver:* en GitHub, «Publicar en GitHub Pages» con una marca verde, unos 2 minutos después.
4. Cierre la app de `/pruebas/` del todo y ábrala de nuevo (la primera vez puede pedir actualizar).

## Paso C. Comprobar que la app sigue funcionando (el captcha todavía está APAGADO en Supabase)
1. Abra `https://joseleo984-cmyk.github.io/P-rdida-de-grasa/pruebas/`.
2. Pulse **Crear cuenta** (o «Entrar»).
   - *Debe ver:* debajo del correo, un texto gris pequeño: «Verificando que eres una persona…» y en uno o dos segundos «Verificación lista.».
3. Escriba su correo, marque las dos casillas y pulse **Enviarme el código**. *Debe llegar el correo con el código.* Si llega, la app está lista.
   - Si ve «No pudimos verificar que eres una persona…»: revise la conexión o desactive el bloqueador de anuncios para esa página y avise al equipo.

## Paso D. Encender el captcha en Supabase `pruebas`
1. Entre a **https://supabase.com/dashboard** y abra el proyecto **`pruebas`**.
2. Menú izquierdo → **Authentication** → **Attack Protection** (en algunas versiones: **Authentication → Settings → Bot and Abuse Protection**) *(a verificar el nombre)*.
3. Active **Enable CAPTCHA protection**.
4. **Provider:** elija **Turnstile by Cloudflare**.
5. **Captcha secret:** pegue la **Secret Key** de Cloudflare. Pulse **Save**.
   - *Debe ver:* el interruptor activado y un aviso de guardado.

## Paso E. Probar la entrada con código en `/pruebas/`
1. Cierre y abra `/pruebas/`. Pulse **Crear cuenta**, espere «Verificación lista.», escriba su correo, marque las casillas y pulse **Enviarme el código**.
   - *Debe ver:* la pantalla «Escribe el código» y el correo en su bandeja.
2. Escriba el código. *Debe entrar.*
3. Pruebe **Reenviar código** (espere los 60 segundos de la cuenta atrás). *Debe llegar un código nuevo.*
4. Prueba del mensaje de error (opcional): desactive el bloqueador/VPN, o ponga el iPad en **Modo avión** un momento y pulse «Enviarme el código»; *debe verse* «No pudimos verificar…» y la app no se rompe. Quite el modo avión y pulse de nuevo: *debe funcionar*.
5. Avíseme cómo salió (con captura si algo falla).

## Paso F. Repetir en `plataforma` (solo cuando se conecte)
Nada de esto se hace hasta que el abogado apruebe y se decida conectar (`equipo/handoffs/conectar-plataforma.md`). Cuando llegue el momento, **en la misma PR** que pone la URL y la clave en `config.js`, yo añado la site key del widget `plataforma` en `config.js`. Después de publicar y comprobar (Paso C sobre la app oficial), usted enciende el captcha en Supabase `plataforma` (Paso D con la **Secret Key de `plataforma`**) y prueba (Paso E).
`npm run check:conexion` revisa que la site key tenga la forma correcta y que no haya una clave secreta en `config.js`.

---

## Plan de reversa (si algo falla)
**Si la gente no puede pedir códigos tras activar el captcha:**
1. **Primero**, en Supabase (`pruebas` o `plataforma`): Authentication → Attack Protection → **apague** *Enable CAPTCHA protection* → Save. *Esto arregla el acceso al instante*, aunque la app siga mandando la verificación (Supabase la ignora cuando el captcha está apagado *(a verificar)*).
2. Después, si queremos quitar el captcha de la app: me avisa y preparo una PR que deja `captchaSiteKey: ''` (vacía). La app vuelve a ser la de siempre y no carga nada de Cloudflare. Compruebo con `node scripts/check-conexion.js --vacio`.
3. **Nunca** al revés: vaciar la clave en la app mientras Supabase sigue con el captcha encendido deja a todos sin acceso.
4. Si sospecha que la **Secret Key** se filtró: en Cloudflare → Turnstile → su widget → *Rotate secret key*, y pegue la nueva en Supabase.

---

## Límite de correos por hora (Supabase) y por IP
Dónde: Supabase → **Authentication → Rate Limits** *(a verificar el nombre exacto; está en «Authentication → Rate Limits»)*. Cada vez que alguien pide un código se envía **1 correo**, y quien pulsa «Reenviar» manda otro.

| Ajuste en Supabase *(nombres a verificar)* | Hoy | **Piloto (~12 personas)** | **Al abrir al público** |
|---|---|---|---|
| Rate limit for sending emails (correos por **hora**, todo el proyecto) | 60 | **30** | **60 a 100** y vigilar Brevo (su plan gratis tiene un tope de **300 al día** en total) |
| Rate limit for sign-ups and sign-ins (por **IP**, cada 5 minutos) | 30 | **30** (déjelo así: en un gimnasio o una casa todos comparten la misma IP) | **30**; bájelo a 20 solo si ve abusos |
| Rate limit for token verifications (intentos de escribir el código, por **IP**, cada 5 minutos) | 30 | **30** | **30** |
| Intervalo mínimo entre correos al mismo usuario | 60 s | **60 s** (la app ya espera 60 s para «Reenviar») | **60 s** |

Por qué esos números: en el piloto, 12 personas entrando por primera vez y alguna que reenvía son unos 15–20 correos en el peor momento; 30 por hora deja margen y corta un abuso rápido. Con el captcha activo el abuso ya cuesta mucho más; el límite es la **segunda barrera**. Si un día un grupo grande entra a la vez (una clase) y recibe «Demasiados intentos», suba temporalmente el límite por hora y vuelva a bajarlo.
**Importante:** el tope diario de Brevo (300) manda: con el límite por hora en 100 alguien podría gastarlo en 3 horas. Si abre al público, evalúe pasar a un plan de pago de Brevo (`equipo/checklist-antes-de-abrir.md` §3).

## Cómo ver en Brevo los correos enviados
1. Entre a **https://app.brevo.com**.
2. Menú → **Transactional** → **Email** → pestaña **Logs** *(a verificar el nombre: «Transactional → Logs»)*. Ahí se ve cada correo: destinatario, hora y estado (enviado, entregado, rebotado, spam).
3. Para el consumo del día: **Transactional → Statistics** (o, en la parte superior de su cuenta, el contador del plan «Free: 300 correos/día»).
4. Señales de abuso: muchos envíos seguidos a correos distintos que no conoce, o el contador diario llegando al tope sin que haya clases/altas. Si lo ve: baje el límite por hora en Supabase y avíseme.

## Qué NO pude comprobar (lo comprueba usted en el paso E)
- El comportamiento con **Cloudflare real** (el equipo trabaja sin acceso a Internet abierto): las pruebas automáticas usan un doble del script de Cloudflare y las claves de prueba oficiales (`1x00000000000000000000AA` siempre pasa y `2x00000000000000000000AB` siempre bloquea; solo en pruebas y documentación, nunca en la app) *(a verificar contra la documentación actual de Cloudflare)*.
- Que el **servidor de Supabase** rechaza el pedido sin verificación y lo acepta con ella (la app manda `options.captchaToken` como pide supabase-js 2.117.2; el nombre del error se traduce a «No pudimos verificar…»).
- Que Supabase **ignora** la verificación mientras el captcha está apagado (por eso el orden seguro lo pone antes).
- iPhone/iPad Safari real: no hay WebKit en el entorno de pruebas. El widget de Cloudflare y esta pantalla usan solo funciones que Safari ya tiene.
- Nombres exactos de menús de Cloudflare, Supabase y Brevo (cambian con el tiempo).

## Aviso legal pendiente
Cloudflare Turnstile es un **tercero nuevo**: al cargarse el widget, Cloudflare recibe señales del navegador y la **dirección IP**. Está anotado como pendiente para el abogado en `equipo/legal/borradores-pendientes.md`, `equipo/legal/paquete-abogado.md` y el checklist. **No** se tocaron los textos v0.3 ni `legal/*.html`. Con `captchaSiteKey` vacía esto no ocurre.
