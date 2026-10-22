# Lista "antes de abrir la app" a coaches y clientes (piloto)

Estado al 2026-10-23 (Sprint 8). La conexión de la app oficial a `plataforma` queda a la espera del abogado (`equipo/legal/paquete-abogado.md`). Marcar `[x]` al completar. Quién: **SH** = Stakeholder (José), **EQ** = equipo de agentes.

## 1. Legal (bloquea datos reales)
- [ ] **SH** Leer `equipo/legal/preasesoria-legal.md` (preasesoría de apoyo, no es asesoría legal) y llevarla a la reunión con el abogado.
- [ ] **SH** Revisión del abogado de `equipo/legal/*.md` con la lista `equipo/legal/preguntas-abogado.md` (P1–P5 bloquean el piloto; el art. 6 de la Ley 1581: no condicionar el servicio a datos sensibles).
- [x] **EQ** Respuestas P1–P18 registradas en `equipo/legal/respuestas-abogado.md` y borradores **v0.3** (T&C, Política, acuerdo del coach, autorizaciones, resumen). Valen como segunda preasesoría hasta que firme un abogado colombiano. *(Sprint 8)*
- [x] **EQ** Pantallas **A3 y A4** con la redacción aprobada (v0.3-A3 / v0.3-A4), sin premarcado. Edad 18 y `share_*` apagados ya estaban hechos. *(Sprint 8)*
- [ ] **SH** Archivar el **DPA de Supabase** y el **DPA estándar de Brevo** (aceptados, con fecha). Bloquea conectar.
- [ ] **SH** Firmar el **acuerdo del coach v0.3** con los **2 coaches** del piloto (por escrito o firma electrónica). El abogado valida antes la cláusula penal de 10 SMMLV. Bloquea conectar.
- [ ] **SH** Un **abogado colombiano** firma los borradores v0.3 (hasta entonces siguen vigentes los v0.1).
- [ ] **SH** Decidir el borrado de cuentas inactivas (365 días, avisos 335/358): `equipo/handoffs/diseno-borrado-inactivas.md`. No urgente hasta ~sept. de 2027.
- [ ] **SH** Datos pendientes en los textos: fecha de vigencia y dónde se guardan los archivos recibidos (ya no aplica WhatsApp: se actualiza con la versión con cuentas).
- [ ] **EQ** S3-5: textos legales y consentimiento de la **versión con cuentas** (Supabase en EE. UU., coach como encargado, registro de consentimientos) y subir la versión (0.1 → 1.0) cuando el abogado apruebe.
- [ ] **EQ** Actualizar `equipo/piloto-r0.md`: el cliente ya **no envía archivos por WhatsApp**; usa cuenta propia y el coach ve su panel. *(Sprint 7: el Stakeholder lo dejó fuera de alcance; sigue pendiente.)*
- [x] **EQ** Plan de incidentes de una página: `equipo/legal/plan-incidentes.md` (borrador; plazo y canal de la SIC «por confirmar con el abogado»). *(Sprint 7)*
- [x] **EQ** El **servidor** impone el acuerdo del coach (A7) y A3 + A4 del cliente (r1 v1.5, migración `20261023120000`), no solo la app. *(Sprint 7)*
- [ ] **SH** Pegar el `supabase/r1.sql` nuevo (r1 v1.5) en **`pruebas`** y en **`plataforma`** y ver `OK r1 v1`; después correr `scripts/qa-live-rls.js` y `scripts/qa-live-recheck.js`. *(Sprint 7)*

## 2. Supabase `plataforma` (replicar lo hecho en `pruebas`)
- [x] **SH** Pegar `supabase/r1.sql` (el más reciente) y ver `OK r1 v1`. Solo cuando `pruebas` esté validada de punta a punta.
- [x] **SH** *Project Settings → Data API → Exposed schemas*: `core` y `grasa`, **y pulsar Save**.
- [x] **SH** Consulta de comprobación (5 filas): `politicas_fotos=5`, `fotos_publicas=false`, `puede_borrar_cuentas=true`, `esquemas_creados=2`, `my_link=1`.
- [x] **SH** Auth → Email: *OTP Length* = **6**, *Expiration* = 600; plantillas **Confirm sign up** y **Magic link or OTP** con asunto `Tu código para entrar: {{ .Token }}` y cuerpo con `{{ .Token }}` (sin enlace).
- [x] **SH** SMTP propio (Brevo). *(Los «Rate Limits» de correo y el límite por hora siguen en la sección 3.)*
- [x] **SH** Duración de la sesión (JWT) en **3600 s o menos**. *(Confirmado: 3600 s, 2026-10-22.)*
- [x] **SH** Brevo → Seguridad: IP de `plataforma` (región **Virginia, East US**) **autorizada** (confirmado 2026-10-22). Queda mantener el bloqueo (A) o desactivarlo (B); decisión original: mantener el bloqueo (A) o desactivarlo para SMTP (B): si la IP cambia y no se autoriza, el código no llega y la app parece rota.
- [x] **EQ** `npm run smoke:remote` contra `plataforma` (con `NODE_USE_ENV_PROXY=1`) y repetir la matriz en vivo de QA (`scripts/qa-live-rls.js`, `scripts/qa-live-recheck.js`) con cuentas de prueba nuevas. **Hecho el 2026-10-22: 61/61 pruebas.**

## 3. Abuso del correo de códigos (también aplica en producción)
- [ ] **SH+EQ** **Captcha** en Auth (*Attack Protection*, Cloudflare Turnstile, gratis) y que la app lo soporte.
- [ ] **SH** Límite por hora de correos bajo (hoy 60).
- [ ] **SH** **Dominio propio** para el remitente (≈10–15 USD/año) autenticado en Brevo (SPF/DKIM); evita depender de un remitente @gmail.com.
- [ ] **SH** Decidir si el cliente solo puede registrarse **con código de coach** (invitación obligatoria).
- [ ] **SH** Decidir si pasar a un plan de pago de Brevo (más de 300 correos/día).

## 4. Datos y respaldo
- [ ] **SH** Ejecutar `supabase/tools/sweep-orphan-photos.js` cuando haya bajas por fuera de la app (con la clave `service_role`, en su computador, nunca en el repo) y la consulta H9 de huérfanos tras una baja.
- [ ] **SH** El plan gratis **no tiene copias de seguridad** y se pausa tras ~7 días sin uso. **P16:** para el piloto cerrado vale el plan gratis **si los T&C avisan que no hay copias y que el usuario puede exportar** (v0.3 lo dice); pasar a **Pro** (≈25 USD/mes) antes de abrir a público general.
- [ ] **SH** Borrar las cuentas de prueba de `pruebas` (coach, cliente A, `+otp1`, invitados) en *Authentication → Users*.

## 5. Publicación
- [ ] **SH** Probar en **iPhone/Safari real** (el entorno no tiene WebKit) con la guía `equipo/prueba-iphone.md` (instalación, código, sincronización offline→online, invitación por WhatsApp, QR, panel del coach). *(Guía escrita en el Sprint 7; falta hacer la prueba.)*
- [ ] **EQ** `config.js` de producción con la URL y la clave publicable de `plataforma` (nunca claves secretas) y PR a `main`; CI en verde (unitarias, E2E, BD). *(Procedimiento exacto, pruebas y reversa: `equipo/handoffs/conectar-plataforma.md`; revisión sin red: `npm run check:conexion`. Solo cuando el abogado apruebe.)*
- [ ] **SH** Proteger `main` exigiendo el check "CI" (Settings → Branches).
- [ ] **EQ** Decidir con el Stakeholder si se publica una **copia de pruebas** pública (riesgo de la sección 3) o solo se prueba con 2–3 personas de confianza.
- [ ] **SH** Piloto con los 2 coaches siguiendo `equipo/piloto-r0.md` (actualizado).

## Riesgos conocidos aceptados
- El JWT de una cuenta borrada sigue válido hasta caducar (sin fuga de datos).
- Los códigos OTP reales solo se verifican con correo real (primer envío OK en `pruebas`, 6 dígitos).
