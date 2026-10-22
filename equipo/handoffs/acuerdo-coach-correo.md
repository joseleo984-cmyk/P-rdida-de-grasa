# Copia del acuerdo del coach por correo: guía paso a paso

Para: José (Stakeholder), que trabaja desde un iPad · De: Dev Full-stack · Sprint 10 · Coste: **USD 0** (entra en el plan gratuito de Brevo y de Supabase) · Tiempo: unos 40 minutos

## Para qué sirve (en una frase)
Cuando un coach acepta el Acuerdo del coach dentro de la app, recibe en su correo **una copia del texto exacto que aceptó**, con la fecha, la versión y su «huella» digital. Es una prueba más de que aceptó. **Es opcional:** si no activa nada de esto, la app funciona igual (el acuerdo queda registrado en la plataforma y el coach puede verlo y descargarlo en **Más → Mi acuerdo**).

## Qué ya está hecho en la app (no tiene que hacer nada aquí)
- **Más → Mi acuerdo** (solo coaches): muestra el texto aceptado, la fecha y hora, la versión y la huella, y tiene dos botones: **Descargar copia** y **Reenviarme la copia**.
- Al aceptar el acuerdo, la app pide la copia sola. Si sale bien, el coach ve *«Te enviamos una copia a tu correo»*. Si no está activada o falla, **no ve ningún error**: el acuerdo ya quedó registrado.
- La decisión de que el acuerdo sea **solo digital** (sin firma en papel) está anotada en `equipo/legal/respuestas-abogado.md` (P5) y en `equipo/decisiones-negocio.md` (#16b). Queda **para que el abogado la valide**.

## Cómo funciona por dentro (para que sepa qué protege cada cosa)
- El **correo del coach** lo toma la función de su sesión; **nunca** de lo que mande la app. Nadie puede pedir que se mande el acuerdo a otro correo.
- El **texto** no lo manda la app: la función lo busca por versión y comprueba que su huella coincide con la que quedó registrada al aceptar. Si no coincide, **no envía nada**.
- Solo se envía si el **último** registro del coach dice «aceptó». Si lo retiró, no se envía.
- **Límite:** 1 envío por coach y versión **cada hora** (evita gastar su cuota diaria de 300 correos de Brevo).
- La función **no guarda ni escribe en los registros** el contenido del correo. Para recordar el límite, anota en la cuenta del coach **solo cuándo envió** (una marca de tiempo por versión), sin migración de base de datos.

## Las claves (no las confunda)
| | Dónde va | ¿Es secreta? |
|---|---|---|
| **Clave de API de Brevo** (empieza por `xkeysib-`) | **Solo** en los secretos de Supabase | **Secreta.** No me la pase a mí, ni al chat, ni a nadie. |
| Correo y nombre del remitente | También en los secretos de Supabase | No es secreto, pero va ahí para no tocar el código |

> **Importante:** esta clave **no es la clave SMTP** que ya usa Supabase para mandar los códigos. Es otra, de la sección «Claves API». No toque la clave SMTP.

---

## ORDEN SEGURO (léalo antes de empezar)
1. **Primero la app:** este cambio (Sprint 10) debe estar aprobado, publicado y funcionando en `/pruebas/`. Compruebe que **Más → Mi acuerdo** existe con un coach de prueba.
2. Crear la clave de API en Brevo (Paso A) y confirmar el remitente (Paso B).
3. Desplegar la función en **`pruebas`** (Paso C) y poner los secretos (Paso D).
4. Probar en `pruebas` (Paso E).
5. Solo si todo salió bien, repetir los pasos C y D en **`plataforma`**.

*(Si la función no está desplegada, la app no se rompe: solo no sale la copia por correo. Por eso el orden no es peligroso, pero siga siempre este.)*

---

## Paso A. Crear la clave de API en Brevo (Safari del iPad)
1. Entre a **https://app.brevo.com** con su cuenta.
2. Toque su nombre o el icono de su cuenta (arriba a la derecha) y elija **SMTP y API** *(nombre del menú a verificar: puede decir «SMTP & API»)*.
3. Toque la pestaña **Claves API** *(a verificar: «API Keys»)*. **No** la pestaña SMTP.
4. Toque **Generar una nueva clave API** *(a verificar)*. En el nombre escriba: `acuerdo-coach-copia`.
5. Toque **Generar**. Brevo muestra la clave **una sola vez**: empieza por `xkeysib-`. Cópiela (mantenga pulsado → Copiar). **No la pegue en el chat.**
   - **Qué debe ver:** una lista de claves donde aparece `acuerdo-coach-copia`.
6. Déjela copiada en el portapapeles para el Paso D. Si la pierde, no pasa nada: genera otra y borra la anterior.

## Paso B. Verificar el remitente en Brevo
1. En Brevo: **Remitentes, dominios e IPs dedicadas** *(a verificar: puede estar en el menú de su cuenta → «Senders, Domains & Dedicated IPs»)* → **Remitentes**.
2. Busque el remitente que **ya usa** para los códigos y que ya está autorizado. **Use ese mismo**: anote su correo y su nombre.
   - **Qué debe ver:** al lado del correo, un estado «Verificado» o una marca verde.
3. Si no aparece verificado, toque **Verificar** y siga el correo que Brevo le envía. Sin remitente verificado, Brevo rechaza los envíos.
4. *(Tal como indica `paquete-abogado.md`, hoy el remitente es una dirección genérica de Brevo o un correo personal; está bien para el piloto, pero a futuro conviene un dominio propio.)*

## Paso C. Desplegar la función en Supabase (sin terminal)
Hágalo primero en el proyecto **`pruebas`**. Abra **https://supabase.com/dashboard** y elija el proyecto.

**Opción 1: pegar el código en el editor del panel (la que le recomiendo desde el iPad)**
1. En el menú de la izquierda toque **Edge Functions** *(a verificar el nombre exacto)*.
2. Toque **Deploy a new function** → **Via Editor** *(a verificar: puede llamarse «Open Editor» / «Create a new function»)*.
3. Si el editor ofrece una plantilla, elija **Empezar en blanco** *(a verificar)*. Si no, borre el contenido de ejemplo.
4. En el campo del **nombre de la función** escriba exactamente: `acuerdo-coach-copia` (con guiones, sin espacios).
5. Para obtener el código: abra en GitHub el archivo **`supabase/functions/acuerdo-coach-copia/pegar-en-el-panel.ts`** (del repositorio, rama principal). Toque el botón de **copiar** del archivo *(el icono de dos hojas; si no aparece, toque «Raw», mantenga pulsado, «Seleccionar todo» y «Copiar»)*.
6. Pegue todo el código en el editor del panel, **reemplazando** lo que hubiera.
7. Busque la opción **Verify JWT** *(a verificar el nombre; en algunas versiones está en los ajustes de la función)* y déjela **ACTIVADA**. Es lo que impide que gente sin cuenta use la función.
8. Toque **Deploy** *(a verificar: «Deploy function»)*.
   - **Qué debe ver:** la función `acuerdo-coach-copia` en la lista de Edge Functions, con estado verde y una URL que termina en `/functions/v1/acuerdo-coach-copia`.
9. *Si el editor protesta por un `import` o por «Deno»:* es normal que use Deno; no cambie nada. Si muestra un error rojo, **haga una captura y mándemela** (la captura no lleva secretos).

**Opción 2: con terminal (solo si algún día alguien técnico lo hace por usted)**
`supabase functions deploy acuerdo-coach-copia --project-ref <referencia-del-proyecto>` desde la carpeta del repositorio. Aquí se usa `supabase/functions/acuerdo-coach-copia/index.ts`, que importa la lógica de `supabase/functions/_shared/`.

> **Si cambia el texto del acuerdo en el futuro:** el equipo ejecuta `npm run build:funcion` y le pasa el archivo `pegar-en-el-panel.ts` nuevo para que lo pegue otra vez (Paso C). Las pruebas automáticas avisan si falta.

## Paso D. Poner los secretos en el panel de Supabase (nunca en el chat)
1. En el proyecto: **Edge Functions → Secrets** *(a verificar: también puede estar en «Project Settings → Edge Functions → Secrets»)*.
2. Toque **Add new secret** *(a verificar)* y cree estos **tres**, uno por uno. El **nombre** va en mayúsculas, exacto:

| Nombre | Valor |
|---|---|
| `BREVO_API_KEY` | la clave `xkeysib-…` del Paso A |
| `BREVO_SENDER_EMAIL` | el correo del remitente verificado del Paso B |
| `BREVO_SENDER_NAME` | el nombre que verá el coach como remitente (por ejemplo `José Granados`) |

3. Toque **Save** / **Guardar** *(a verificar)* tras cada uno.
   - **Qué debe ver:** los tres nombres en la lista. Supabase **oculta los valores** (es normal).
4. Algunas versiones piden **volver a desplegar** la función para que lea los secretos nuevos. Si la prueba del Paso E dice «no está disponible», toque **Deploy** otra vez.
5. *(No hace falta crear nada más: `SUPABASE_URL` y las llaves internas las pone Supabase sola. Si el panel avisa que falta alguna, mándeme la captura.)*

## Paso E. Probar en `pruebas`
1. Abra la app de pruebas (`…/P-rdida-de-grasa/pruebas/`) en el iPad.
2. Entre con **un correo de prueba suyo** (que pueda leer) y elija **Soy coach**. Marque el acuerdo y continúe.
   - **Qué debe ver:** el aviso *«Te enviamos una copia a tu correo»* (puede tardar unos segundos).
3. Abra el correo (revise también **correo no deseado**). **Qué debe ver:** un correo «Copia de tu Acuerdo del coach (versión 0.3-A7)» con el texto, la fecha, la versión y la huella.
4. En la app: **Más → Mi acuerdo**. **Qué debe ver:** el mismo texto, la fecha, la versión y la huella abreviada (8 primeros y 8 últimos caracteres).
5. Toque **Descargar copia**. **Qué debe ver:** se guarda un archivo `acuerdo-del-coach-0.3-A7.html` (en el iPad aparece en Descargas del navegador); al abrirlo, el texto completo y la huella completa. Se puede imprimir desde ahí.
6. Toque **Reenviarme la copia** de inmediato. **Qué debe ver:** *«Ya te enviamos una copia hace poco…»*: es el límite de 1 por hora y es lo correcto. Pasada una hora, enviaría otra.
7. Si algo falla, vaya a «Cómo ver errores».

## Cómo ver errores (Logs)
1. En Supabase: **Edge Functions →** toque `acuerdo-coach-copia` **→ Logs** *(a verificar: también «Invocations»)*.
2. Cada intento deja una línea con un **código**, nunca el correo ni el texto:

| Lo que ve | Qué significa | Qué hacer |
|---|---|---|
| `not_configured` / respuesta 503 | Faltan los secretos | Revise el Paso D (nombres exactos) y vuelva a desplegar |
| `brevo_failed 401` | La clave de API es incorrecta o está desactivada | Genere otra clave (Paso A) y cámbiela en el Paso D |
| `brevo_failed 400` | Brevo rechaza el remitente | Verifique el remitente (Paso B) |
| `hash_mismatch` o `unknown_version` | El texto de la función no coincide con el que aceptó el coach | Mándeme la captura: hay que pegar la función actualizada (Paso C) |
| 401 en las invocaciones | Sesión caducada | El coach debe entrar de nuevo |
| 404 en la app | La función no está desplegada | Paso C |

3. En Brevo también puede ver cada envío: **Transaccional → Registros** *(a verificar: «Transactional → Logs»)*.

## Cómo apagarla (la app sigue funcionando)
Elija una (todas son reversibles y **ninguna rompe la app**):
- **Más rápida:** Supabase → **Edge Functions → Secrets** → borre `BREVO_API_KEY`. La función responde «no configurada» y la app no manda nada ni muestra error.
- **O** en Edge Functions → `acuerdo-coach-copia` → **Delete** *(a verificar)*. La app lo trata como «no disponible».
- **O** en Brevo, desactive o borre la clave `acuerdo-coach-copia`.
Para volver a encenderla, repita el paso correspondiente. Los acuerdos ya aceptados **no se pierden**: están registrados en la plataforma.

## Qué NO debe hacer
- No pegue la clave `xkeysib-…` en el chat, en un archivo del repositorio ni en una captura.
- No use la **clave SMTP** de Brevo en lugar de la clave de API: no funciona para esto.
- No suba el límite de envíos «para probar»: la función ya lo controla sola.

---

## Nota legal para el abogado (también anotada en `paquete-abogado.md` y `borradores-pendientes.md` #11)
- **Brevo ya es un tercero** (envía los códigos de acceso). Este correo añade un **segundo tratamiento con el mismo proveedor**: Brevo recibe **el correo del coach y el texto del acuerdo que aceptó**, con la versión, la fecha y la huella. No contiene datos de salud.
- La función corre en Supabase (EE. UU.) y llama a la API de Brevo. La clave vive solo en secretos de la función.
- **Decisión del Stakeholder (2026-10-23), a validar por el abogado:** el acuerdo con los coaches es **solo digital** (aceptación click-wrap con SHA-256), sin firma en papel ni firma electrónica certificada; reforzado con esta copia y la descarga en la app.
- **No se editaron** los textos v0.3 ni `legal/*.html`. Si el abogado quiere mencionar este envío en la política, es un cambio de texto posterior.

## Qué no pudo verificar el equipo
Con Brevo y Supabase reales no se probó nada (no hay acceso desde aquí): la función se probó con dobles en Node (correo, límite, huella, seguridad) y la app con el servidor falso. Los nombres de menús marcados «a verificar» pueden variar. La **primera prueba real** es el Paso E.
