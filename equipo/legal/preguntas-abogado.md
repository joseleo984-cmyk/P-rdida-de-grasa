> ⚠️ **Borrador de trabajo para la consulta legal; no es asesoría legal.**
> Autor: Agente Analista de Producto · 2026-10-21 · Para: Stakeholder (llevar a la consulta con el abogado).
> Documentos a entregar al abogado: `terminos-y-condiciones.md`, `politica-tratamiento-datos.md` (en esta carpeta) y el §8 de `../piloto-r0.md` (condiciones del piloto).

# Preguntas para el abogado — consolidadas y priorizadas

**Contexto en 5 líneas:** app web (PWA) de seguimiento de pérdida de grasa. **Responsable: persona natural en Colombia.** Los coaches la usan gratis con hasta 5 clientes y luego pagan USD 5 por cliente activo al mes, fuera de la app. En una fase 2, los clientes pagarán al coach dentro de la app. Trata **datos de salud, medidas y fotos corporales** (datos sensibles). **Piloto:** 2 coaches × 5 clientes; los datos viven en el teléfono y el cliente envía archivos al coach por WhatsApp. **R1:** servidor en **Supabase (EE. UU.)**, y el coach ve en un panel los datos que el cliente comparte (fotos incluidas).

**Prioridad:** 🔴 = bloquea el piloto · 🟠 = bloquea R1 (servidor) · 🟡 = bloquea R2 (pagos) o es posterior.

---

## 🔴 Bloquean el piloto

### P1. Art. 6 de la Ley 1581: no condicionar el servicio a datos sensibles
**Riesgo:** el art. 6 (y el art. 2.2.2.25.2.3 del Decreto 1074) dice que ninguna actividad puede condicionarse a que el titular entregue datos sensibles. Pero la **función central** de la app es registrar peso, medidas, comidas y fotos. Si para usar la app hay que autorizar datos de salud, ¿estamos condicionando el servicio?
**Propuestas (¿cuál es válida o mejor?):**
- **A. Modo mínimo sin datos sensibles:** si el titular no autoriza los datos de salud, igual puede usar algo útil (p. ej. la calculadora del plan o contenidos generales) sin que se guarde ni comparta nada de salud. Fotos y compartir con el coach son siempre opcionales y por separado.
- **B. Los datos de salud nunca salen del dispositivo sin autorización:** en el piloto la app funciona sin enviar nada; compartir con el coach es un acto voluntario del titular (enviar el archivo) y requiere autorización. Argumento: el tratamiento por el responsable solo ocurre si el titular decide compartir.
- **C. El dato sensible es el objeto del servicio pedido por el titular:** argumentar que el titular contrata precisamente el seguimiento de su salud (como en una app de ejercicio) y que la autorización expresa e informada, más la facultad de retirarla, es suficiente.
- **D. Granularidad:** autorizaciones separadas por categoría (peso/medidas, comidas/hábitos, fotos, compartir con el coach), cada una revocable, y el servicio se adapta a lo autorizado.
*Recomendación del equipo:* **A + B + D** en el piloto; validar si C es defendible para R1.

### P2. Rol del coach: ¿encargado, responsable o corresponsable?
**Propuesta del equipo (la más simple):** la plataforma (persona natural) es la **única responsable** y cada coach es **encargado** que trata los datos por cuenta de ella, con un acuerdo de encargado firmado.
- ¿Es válido si el coach ya tiene una relación previa con su cliente y además recibe datos por WhatsApp, fuera de la app?
- Si no, ¿qué implica "responsables independientes" o "corresponsables" (políticas, canales de reclamos, autorizaciones)?
- ¿Qué debe contener el **acuerdo de encargado** (finalidad, confidencialidad, seguridad, borrado, no subencargar)?

### P3. Forma y prueba de la autorización
- En el piloto: casillas en la app (guardadas en el teléfono, con versión y fecha, incluidas en el archivo exportado) + confirmación por WhatsApp. ¿Es prueba suficiente (Ley 527 de 1999; art. 2.2.2.25.2.4 del Decreto 1074)?
- ¿Es correcto separar las casillas así: T&C · Política · datos sensibles de salud · fotos (aparte) · mayoría de edad?
- ¿Basta la **declaración de mayoría de edad** o hay que verificarla?

### P4. WhatsApp como canal de envío en el piloto
Los archivos con datos de salud y fotos pasan por WhatsApp (Meta). ¿Hay que informarlo como transmisión a un tercero o en el exterior? ¿Es aceptable si es el **titular** quien envía el archivo? ¿Recomiendas otro canal?

### P5. Revisión general de los textos
Revisar y ajustar `terminos-y-condiciones.md`, `politica-tratamiento-datos.md` y el §8 del piloto: estructura exigida (art. 2.2.2.25.3.1 del Decreto 1074: identificación, tratamiento y finalidad, derechos, área de atención, procedimiento, vigencia), plazos de consultas y reclamos, y lenguaje claro.

---

## 🟠 Bloquean R1 (servidor)

### P6. Transmisión internacional a Supabase (EE. UU.)
- Supabase actúa como encargado → ¿**transmisión** (arts. 2.2.2.25.5.1–2)? ¿Sirve su **DPA estándar** como contrato de transmisión, o hay que añadir cláusulas?
- ¿Sigue vigente que EE. UU. tenga nivel adecuado según la SIC (Circular Externa 005 de 2017)? ¿Hace falta una **declaración de conformidad** ante la SIC o basta con la autorización expresa del titular?
- ¿Cambia algo si elegimos la región de **São Paulo** en vez de Virginia?

### P7. Fotos corporales en el servidor y acceso del coach
¿Qué medidas mínimas exige o recomienda la ley para fotos corporales (datos sensibles e imagen)? Hoy proponemos: almacenamiento privado, enlaces temporales, opt-in por pose, registro de cada vista del coach y prohibición de descarga en lote. ¿Es suficiente?

### P8. Registro de consentimientos y borrado
- Registro de consentimientos de **solo inserción** (sin modificar ni borrar). Al eliminar la cuenta, ¿cuánto tiempo y qué mínimo podemos conservar como prueba de la autorización y del borrado?
- Plazos de conservación de cuentas inactivas.

### P9. Incidentes de seguridad
Plazo y forma de reportar incidentes a la SIC y a los titulares.

### P10. Registro Nacional de Bases de Datos (RNBD)
Entendemos que una **persona natural** no está obligada a inscribir bases en el RNBD (Decreto 090 de 2018). ¿Es así? ¿Cambia al crecer los ingresos o al tratar datos sensibles a gran escala?

### P11. Coaches y profesiones de salud
Algunos coaches no son nutricionistas. ¿Hay riesgo para la plataforma si dan planes de alimentación (Ley 73 de 1979)? ¿Qué debemos exigirles o advertir en los T&C? ¿Conviene un documento aparte, "Términos para coaches"?

### P12. Relación plataforma-coach-cliente y consumidor
- ¿Aplica el régimen de **portales de contacto** (art. 53 Ley 1480 de 2011) y sus obligaciones?
- ¿Qué cláusulas de **limitación de responsabilidad** pueden ser **abusivas** (arts. 42–43) y quedar sin efecto?

---

## 🟡 Bloquean R2 (pagos) o posteriores

### P13. Cobro al coach como persona natural (fase 1)
RUT, régimen tributario, ¿obligación de **facturación electrónica** (DIAN) y desde qué ingresos? ¿Conviene fijar el precio en **COP** en lugar de USD 5?

### P14. Pagos de clientes dentro de la app con reparto al coach (fase 2)
¿Qué figura usar (mandato, recaudo a terceros, marketplace)? Implicaciones tributarias y cambiarias, **derecho de retracto** (art. 47 Ley 1480, 5 días hábiles) y **reversión del pago** (art. 51). ¿En qué momento conviene **constituir una SAS**?

### P15. Comunidad y retos
Responsabilidad por el contenido de los usuarios, moderación, uso de imagen, y **premios** en retos (¿requieren permisos de Coljuegos?).

### P16. Mensajes de recordatorio y comerciales
Canales y horarios permitidos (Ley 2300 de 2023) y autorización aparte para mensajes comerciales.

---

## Qué necesitamos llevarnos de la consulta
1. Respuesta a **P1–P5** (sin esto no arranca el piloto) y textos corregidos con versión 1.0.
2. Recomendación sobre **P6–P8** para que el Arquitecto diseñe R1 sin retrabajo.
3. Una opinión preliminar sobre **P13–P14** para decidir si conviene constituir empresa antes de R2.
