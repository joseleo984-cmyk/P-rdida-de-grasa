> **BORRADOR v0.2 — NO VIGENTE — pendiente de revisión del abogado.**
> No es asesoría legal. Analista de Producto · 2026-10-22. Textos cortos de pantalla (máx. 6 líneas + enlace). Cada texto tiene **ID estable** y **versión**; la versión sube cuando cambia una sola palabra (el servidor guarda la huella SHA-256 del texto exacto mostrado).
> **Regla general:** ninguna casilla viene marcada. Quien no autoriza A3–A6 **sigue pudiendo usar el modo local sin cuenta** (cálculo de plan, registro de peso, medidas, comidas, hábitos, notas y fotos en su teléfono, y exportar): no se condiciona el servicio a entregar datos sensibles (P1).

## Cómo encaja con el flujo actual (verificado en el repo)
- Hoy `core.consent_events.kind` solo admite: `terms`, `privacy`, `adult`, `sensitive_health`, `photos_cloud`, `share_body|notes|nutrition|habits|photos`. `account.js → sendConsents()` envía terms, privacy, adult y sensitive_health con `textHash` (SHA-256 del texto mostrado) y `version`; las categorías de compartir usan `SHARE_VERSION = 'compartir-1'`.
- **Faltan tipos nuevos** (cambio de código/migración para el equipo de Dev, no hecho aquí): `cloud_transfer` (A4), `photo_view_coach` (A6b), `coach_agreement` (A7) y `withdrawal_notice` si se quiere registrar A8. Mapa: A1→`adult`, A2→`terms`+`privacy`, A3→`sensitive_health`, A4→`cloud_transfer` (nuevo), A5→`share_*` (nota: en BD `share_nutrition` y `share_habits` hoy nacen en `true`; deben nacer **desactivadas** para que A5 sea no premarcada y A5 pida confirmación explícita), A6a→`photos_cloud`, A6b→`photo_view_coach` (nuevo), A7→`coach_agreement` (nuevo).
- Subir `Schema.LEGAL_VERSIONS` a 0.2/1.0 obliga a re-aceptar (A1–A3).

---

## Tabla resumen

| ID | Nombre | Lo ve | Cuándo | ¿Bloquea? |
|---|---|---|---|---|
| A1 | Mayoría de edad | Cliente y coach | Al crear la cuenta | Sí, para **crear cuenta**; no para modo local* |
| A2 | Términos y Política | Cliente y coach | Al crear la cuenta; de nuevo al cambiar versión | Sí, para **crear cuenta**; no para modo local |
| A3 | Datos sensibles de salud | Cliente | Al crear la cuenta | No: sin A3 queda en modo local |
| A4 | Nube y transmisión internacional | Cliente (y coach para sus propios datos) | Al activar "copia en la nube" | No: sin A4 no hay nube, sí modo local |
| A5 | Compartir con el coach por categoría | Cliente | Al vincularse y luego en Perfil → Privacidad | No: sin vínculo, la app sigue; peso/medidas son necesarios solo para el vínculo |
| A6a/A6b | Fotos y tratamiento de imágenes | Cliente | Al intentar subir/compartir una foto | No: las fotos siguen en el teléfono |
| A7 | Acuerdo del coach | Coach | Al registrarse como coach, antes de ver datos | Sí, para **ver datos de clientes** |
| A8 | Aviso de retiro/borrado | Cliente y coach | Al retirar una autorización, terminar vínculo o borrar cuenta | No (informativo) |

\* La declaración de mayoría de edad tampoco puede faltar en el modo local (ya existe hoy la casilla `adult` en la pantalla legal); no es dato sensible.

---

## A1 — Mayoría de edad · v0.2-A1
**Texto exacto (casilla):**
> ☐ Declaro que soy **mayor de 18 años**. Esta app no es para menores de edad.

**Quién:** cliente y coach. **Cuándo:** primera pantalla legal / crear cuenta. **Bloquea:** sí, el uso de la app y la cuenta (no trata datos sensibles; edad mínima 18 la implementa Dev en el perfil). Si se descubre un menor, se cierra la cuenta y se borran sus datos. Registro: `adult`.

## A2 — Términos y Política · v0.2-A2
**Texto exacto (casilla):**
> ☐ Leí y acepto los **Términos y Condiciones** y la **Política de Tratamiento de Datos** (versión 0.2). [Ver Términos] [Ver Política]

**Quién:** cliente y coach. **Cuándo:** al crear cuenta y cada vez que cambie la versión. **Bloquea:** crear cuenta; en modo local sigue vigente la aceptación mínima actual. Registro: `terms` y `privacy` con huella de las páginas legales.

## A3 — Autorización de datos sensibles de salud · v0.2-A3
**Texto exacto (casilla):**
> ☐ **Autorizo** a José Granados (responsable) a tratar mis **datos de salud** (peso, medidas, comidas, hábitos, notas) para calcular mi plan y mostrar mi progreso. Son **datos sensibles**; autorizar es **voluntario**: puedes usar la app sin cuenta, solo en tu teléfono. Puedes retirarla cuando quieras en Perfil → Privacidad. [Texto completo: Política §5]

**Quién:** cliente. **Cuándo:** al crear la cuenta (paso propio). **Bloquea:** no. Si no marca, se ofrece "Seguir sin cuenta (solo en mi teléfono)". Registro: `sensitive_health`.

## A4 — Copia en la nube y transmisión internacional · v0.2-A4
**Texto exacto (casilla):**
> ☐ **Autorizo** guardar una **copia de mis datos de salud en la nube** (Supabase, servidores en **EE. UU.**) y que mi correo se envíe a **Brevo** para el código de acceso. Es una **transmisión internacional** a proveedores que trabajan por cuenta del responsable, donde la protección puede ser distinta a la de Colombia. Es opcional: sin ella, tus datos quedan solo en tu teléfono. La retiras en Perfil → Cuenta (se borra la copia). [Texto completo: Política §7]

**Quién:** cliente (el coach la ve para su cuenta de coach). **Cuándo:** al activar la copia en la nube, antes de la primera sincronización. **Bloquea:** no; sin A4 no se sincroniza nada (modo local). Nota: Brevo recibe el correo para poder iniciar sesión; el aviso del envío del código se muestra al pedirlo ("Te enviaremos un código con Brevo; ver Política §7.3"), pues sin él no hay cuenta. Registro: `cloud_transfer` (tipo nuevo).

## A5 — Compartir con el coach, por categoría · v0.2-A5
**Texto exacto (una casilla por categoría, sin marcar, cada una con su mini-explicación):**
> **Compartir con [Nombre comercial del coach]** (él es responsable de cómo usa lo que ves):
> ☐ **Peso y medidas** (necesario mientras estés vinculado/a)
> ☐ **Notas personales** · ☐ **Comidas** · ☐ **Hábitos** · ☐ **Fotos** (se piden aparte, ver A6)
> Tu coach no ve tu correo. Puedes quitar cada categoría o terminar el vínculo cuando quieras; deja de verla al instante. [Texto completo: Política §7.1]

**Quién:** cliente. **Cuándo:** al unirse con el código de invitación, y en Perfil → Privacidad. **Bloquea:** no la app. "Peso y medidas" es necesario solo para mantener el vínculo; si no la acepta, no se vincula y sigue en modo local o con nube sin coach. Registro: `share_body|notes|nutrition|habits|photos` con `coach_id`, versión `compartir-2` (subir de `compartir-1`).

## A6 — Autorización de fotos y tratamiento de imágenes · v0.2-A6
Dos pasos separados, nunca premarcados.

**A6a — Guardar mis fotos en la nube · v0.2-A6a**
> ☐ **Autorizo** guardar mis **fotos de progreso** en la nube (Supabase, EE. UU.), en almacenamiento privado, **solo para mi seguimiento**. Son datos sensibles y es **opcional**: sin esto tus fotos quedan solo en tu teléfono y la app funciona igual. Puedes retirarla y borrar tus fotos cuando quieras. [Texto completo: Política §6]

**A6b — Que mi coach vea fotos · v0.2-A6b** (aparece al marcar una foto para compartir)
> ☐ **Autorizo** que **[coach]** vea la foto que marqué, **una a una**. La abre con un enlace que vence en 60 segundos y **queda registro de cada vista**, que tú ves. No puede descargarla, capturarla ni compartirla (lo prohíbe su acuerdo; no podemos bloquear técnicamente las capturas). Retirar el permiso la oculta al instante. No condiciona nada. [Texto completo: Política §6]

**Quién:** cliente. **Cuándo:** A6a, la primera vez que intenta subir una foto; A6b, al marcar una foto como compartida. **Bloquea:** no; mientras `photosCloudAllowed` esté apagado las fotos no salen del teléfono. Registro: `photos_cloud`; `photo_view_coach` (tipo nuevo) con `coach_id`. **Cómo borrar:** Fotos → Borrar foto (se borra del servidor) o Perfil → Cuenta → Borrar todas mis fotos. **Registro de vistas:** Fotos → "Quién la vio".

## A7 — Acuerdo del coach · v0.2-A7
**Texto exacto (casilla + resumen):**
> Para ver datos de clientes, acepta el **Acuerdo del coach**. En resumen: usas los datos **solo** para acompañar a ese cliente; **no descargas, capturas ni compartes fotos**; guardas confidencialidad; **no das planes de alimentación terapéuticos si no eres profesional habilitado**; avisas incidentes en 24–48 h; **borras al terminar el vínculo**; y respondes por tu propio uso.
> ☐ **Acepto** el Acuerdo del coach. [Leer acuerdo completo]

**Quién:** coach. **Cuándo:** al registrarse como coach, antes de vincular o ver cualquier cliente; se vuelve a pedir si cambia. **Bloquea:** sí, el panel de clientes (no el uso personal de la app). Registro: `coach_agreement` (tipo nuevo).

## A8 — Aviso de retiro o borrado · v0.2-A8
**Al retirar una autorización (cliente):**
> Retirarás [la copia en la nube / compartir X / las fotos]. Tu coach **deja de verlo ya**. Lo ya guardado en la nube [se borrará / se queda en tu cuenta hasta que lo borres]. Guardaremos solo una **prueba mínima** de tu autorización anterior, sin tu nombre. ¿Exportar antes?  [Retirar] [Cancelar]

**Al borrar la cuenta:**
> Se borrarán tu cuenta, tus datos, fotos y vínculos de la nube; **no se puede deshacer**. Tu teléfono conserva su copia hasta que la borres. Guardamos 3 a 5 años una **prueba mínima y sin tu nombre** de lo que autorizaste. [Exportar] [Borrar] [Cancelar]

**Al coach (vínculo terminado):**
> Perdiste el acceso a los datos de [cliente]. Borra cualquier copia que tengas **en un máximo de 30 días**.

**Quién:** cliente y coach. **Cuándo:** al retirar, desvincular o borrar. **Bloquea:** no (informativo; confirmar la acción). Plazos **(a validar)**.
