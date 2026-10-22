> ⚠️ **Borrador de trabajo para la consulta legal; no es asesoría legal.**
> Rev. 3 · 2026-10-22 · Autor: Analista de Producto · Para: José Granados (llevar a la consulta con el abogado).
> Se lee junto con `paquete-abogado.md` (hechos reales: mapa de datos, proveedores, controles y lo que falta).
> Documentos a entregar: `paquete-abogado.md`, `terminos-y-condiciones.md` y `politica-tratamiento-datos.md` (esta carpeta; describen aún la fase sin cuentas).

**Qué cambió desde la rev. 2:** ya no hay piloto con WhatsApp. El servidor (Supabase, EE. UU.) está montado y probado, con cuentas por correo y código, copia en la nube, panel del coach con permisos por categoría y borrado de cuenta. **La aplicación oficial no se conectará a ese servidor hasta que el abogado responda lo que sigue.** Lo que antes bloqueaba el piloto ahora bloquea esa conexión.

**Prioridad:** 🔴 = bloquea conectar la app al servidor (datos reales) · 🟠 = debe resolverse antes de abrir a más de unos pocos usuarios · 🟡 = fase de pagos o posterior.

## Decisiones que necesitamos del abogado, en orden

| # | Decisión | Preguntas | Por qué primero |
|---|---|---|---|
| 1 | ¿Se puede pedir datos de salud sin «condicionar» el servicio (art. 6)? ¿Qué modo mínimo hace falta? | P1 | Define el diseño de las pantallas de consentimiento |
| 2 | Texto y forma del consentimiento de la versión con cuentas, incluida la «copia en la nube» | P2, P3 | Sin texto aprobado no se conecta la app |
| 3 | Papel del coach (encargado / responsable) y contenido del acuerdo con coaches | P4, P5 | Define quién responde ante el titular |
| 4 | Transmisión internacional a Supabase (EE. UU.) y a Brevo | P6, P7 | Condiciona la región y los contratos |
| 5 | Fotos corporales en la nube: ¿bastan las medidas actuales? | P8 | Hoy las fotos NO suben; se activan según esta respuesta |
| 6 | Menores de edad y verificación de mayoría de edad | P9 | Hoy solo hay una casilla |
| 7 | Conservación, retención y borrado (baja, vínculo terminado, cuentas inactivas, prueba de consentimiento) | P10, P11 | Cambia la base de datos si hay que conservar algo |
| 8 | Incidentes, RNBD y rol del coach como profesional de salud | P12, P13, P14 | Necesarios antes de crecer |

---

## 🔴 Bloquean conectar la app al servidor

### P1. Art. 6 de la Ley 1581: no condicionar el servicio a datos sensibles
**Riesgo:** la función central de la app es registrar peso, medidas y fotos. Si para usar la app hay que autorizar datos de salud, ¿se condiciona el servicio?
**Qué decidimos hoy:** el cliente puede crear cuenta sin autorizar datos de salud; el peso y las medidas solo se envían al coach con vínculo, y notas, comidas, hábitos y fotos son opcionales y separados (hecho en el servidor). La casilla de datos sensibles se guarda como consentimiento aparte.
**Propuestas a validar:** (A) modo mínimo útil sin datos de salud; (B) los datos nunca salen del teléfono sin autorización; (C) el dato sensible es el objeto del servicio que el titular pide; (D) autorizaciones separadas y revocables. Recomendación del equipo: A + B + D; validar si C es defendible.
**Qué necesito de ti:** cuál combinación es válida y qué debe poder hacer la app si el titular no autoriza.

### P2. Consentimiento de la versión con cuentas
**Hechos:** al crear la cuenta se registran, con fecha, versión y huella del texto exacto: términos, política, mayoría de edad, datos sensibles de salud y, aparte, cada permiso de compartir con el coach (`paquete-abogado.md` B y D).
**Qué decidimos hoy:** mantener casillas separadas y el registro solo-inserción.
**Qué necesito de ti:** (i) si la separación de casillas es correcta (T&C · política · datos de salud · mayoría de edad · cada categoría de compartir); (ii) si ese registro es prueba suficiente (Ley 527 de 1999; art. 2.2.2.25.2.4 del Decreto 1074); (iii) si el aviso de «volver a aceptar» al cambiar una versión es correcto.

### P3. Texto de «copia en la nube»
**Hechos:** los datos se guardan primero en el teléfono y, con cuenta, se copian a Supabase (EE. UU.). Las fotos aún no suben.
**Qué decidimos hoy:** la copia en la nube de datos de texto es parte de tener cuenta; **las fotos en la nube requieren una autorización propia** que aún no existe.
**Qué necesito de ti:** si la copia en la nube necesita autorización separada de la de «tener cuenta», y qué debe decir el aviso (dónde se guardan, quién los ve, cómo borrarlos, que están fuera de Colombia).

### P4. Rol del coach: ¿encargado, responsable o corresponsable?
**Propuesta del equipo:** José es el **único responsable**; cada coach es **encargado** y trata los datos del cliente por cuenta suya.
**Qué decidimos hoy:** nada firmado; el coach aceptaría sus propios términos al registrarse como coach.
**Qué necesito de ti:** si la figura es válida cuando el coach ya tiene relación previa con su cliente y puede hablar con él por otros medios; si no, qué implica «responsables independientes» o «corresponsables» (políticas, canal de reclamos, autorizaciones).

### P5. Acuerdo de encargado con los coaches
**Qué decidimos hoy:** el coach acepta dentro de la app; no hay contrato aparte.
**Qué necesito de ti:** forma (aceptación en la app o firma), contenido mínimo (finalidad, confidencialidad, seguridad, no copiar ni reenviar datos, borrado al terminar, no subencargar, auditoría), y qué pasa si el coach usa los datos para otra cosa.

### P6. Transmisión internacional a Supabase (EE. UU.)
**Hechos:** Supabase aloja la base de datos y las fotos (región East US).
**Qué necesito de ti:** si Supabase es encargado y hay **transmisión** (arts. 2.2.2.25.5.1–2); si su DPA estándar sirve como contrato; si EE. UU. sigue considerándose con nivel adecuado según la SIC (Circular Externa 005 de 2017) o basta la autorización expresa; si cambia algo con la región de São Paulo. *(El DPA y la sede exacta de Supabase están por confirmar.)*

### P7. Correo de códigos con Brevo
**Hechos:** Brevo recibe el correo de cada persona y el código de 6 dígitos para enviarlo; no recibe datos de salud. Dónde están sus servidores **no consta en el repositorio (por confirmar)**. Hoy el remitente es un correo personal; falta dominio propio.
**Qué necesito de ti:** si Brevo debe declararse como encargado o tercero en la política; si el correo que se envía exige algo (autorización para mensajes, identificación del remitente, opción de no recibir más); si necesitamos contrato o DPA aparte; y cómo informar el tratamiento del correo.

### P8. Fotos corporales en la nube y acceso del coach
**Hechos:** las fotos **hoy no se suben**. Cuando se active: bucket privado, solo JPEG de máx. 2 MB, enlaces de 60 segundos, solo las fotos marcadas una a una y con permiso de «fotos», registro de cada vista del coach visible para el cliente, sin descarga en lote.
**Qué necesito de ti:** si esas medidas bastan para datos sensibles e imagen; si hace falta una autorización específica de «fotos en la nube» y otra de «ver con el coach»; qué hacer si el coach captura pantalla.

### P9. Menores de edad
**Hechos:** hay casilla «soy mayor de 18»; el perfil acepta edades desde 14; no hay verificación.
**Qué necesito de ti:** si basta la declaración o hay que verificar; si conviene bloquear edades menores de 18 en el perfil; y qué pasa si un menor usa la app con autorización de sus padres (régimen especial de datos de menores).

---

## 🟠 Antes de abrir a más usuarios

### P10. Retención y borrado cuando termina la relación o la cuenta
**Hechos:** al terminar el vínculo el coach pierde el acceso y los datos siguen en la cuenta del cliente. Al borrar la cuenta se borra todo en cascada. No hay plazo para cuentas inactivas ni para cuentas de coaches sin clientes. La decisión del 2026-10-21 fijaba «mientras el cliente siga y máx. 30 días después» (pensada para archivos por WhatsApp).
**Qué decidimos hoy:** nada automático.
**Qué necesito de ti:** plazos recomendados para (a) cliente que deja al coach, (b) cuenta inactiva, (c) coach que deja de tener clientes o cierra cuenta, y (d) copias de seguridad cuando existan (hoy no hay).

### P11. Prueba del consentimiento tras la baja
**Hechos:** los consentimientos son solo-inserción pero se borran con la cuenta (cascada). Cambiarlo a «conservar sin identificar» es posible.
**Qué necesito de ti:** qué mínimo y por cuánto tiempo conviene conservar como prueba de la autorización y del borrado.

### P12. Incidentes de seguridad
**Qué necesito de ti:** a quién, en cuánto tiempo y con qué contenido avisar a la SIC y a los titulares; qué registro mantener. *(Hoy no hay plan escrito de respuesta.)*

### P13. Registro Nacional de Bases de Datos (RNBD)
Entendemos que una persona natural no está obligada (Decreto 090 de 2018). **Qué necesito de ti:** confirmar y señalar qué cambia con el crecimiento o con datos sensibles de muchas personas.

### P14. Coaches y profesiones de salud
Algunos coaches no son nutricionistas. **Qué necesito de ti:** riesgo para la plataforma si dan planes de alimentación (Ley 73 de 1979); qué advertir o exigir a los coaches; si conviene un documento aparte, «Términos para coaches».

### P15. Relación plataforma-coach-cliente y consumidor
**Qué necesito de ti:** si aplica el régimen de portales de contacto (art. 53 Ley 1480 de 2011); qué cláusulas de limitación de responsabilidad serían abusivas (arts. 42–43).

---

## 🟡 Pagos y posterior

### P16. Canal de invitación y de comunicación coach-cliente
**Hechos:** la invitación se comparte por enlace, QR o WhatsApp (solo el enlace, sin datos). Ningún dato de salud viaja por WhatsApp. Los coaches pueden hablar con sus clientes por cualquier canal fuera de la app; la app tiene comentarios del coach.
**Qué decidimos hoy:** WhatsApp solo para el enlace.
**Qué necesito de ti:** si hay que informar algo por usar WhatsApp para el enlace; si los recordatorios o mensajes del coach necesitan autorización aparte (Ley 2300 de 2023, mensajes comerciales).

### P17. Cobro al coach como persona natural (fase 1) y pagos dentro de la app (fase 2)
**Qué necesito de ti:** RUT, régimen, facturación electrónica y desde qué ingresos; si conviene fijar el precio en COP; para fase 2, la figura (mandato, recaudo, marketplace), retracto y reversión del pago (arts. 47 y 51 Ley 1480) y cuándo conviene constituir una SAS.

### P18. Comunidad, retos y premios
**Qué necesito de ti:** responsabilidad por contenido de usuarios, uso de imagen, y si los premios en retos requieren permisos de Coljuegos. *(No existe aún en la app.)*

---

## Qué necesitamos llevarnos de la consulta
1. Respuesta a **P1–P9**: sin esto no se conecta la app al servidor.
2. Los textos legales corregidos (versión con cuentas, copia en la nube, acuerdo con coaches): ver `borradores-pendientes.md`.
3. Plazos de **P10–P11** para ajustar la base de datos si hay que conservar algo.
4. Una opinión preliminar de **P17** para decidir si conviene constituir empresa antes de cobrar dentro de la app.
