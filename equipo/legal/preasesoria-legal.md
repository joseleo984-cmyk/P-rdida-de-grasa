> **Advertencia.** Este informe es una **preasesoría de apoyo** para que José Granados llegue preparado a la consulta con su abogado. **No es asesoría legal formal ni reemplaza a un abogado colombiano**; lo que aquí dice "recomendación" es una posición de trabajo, no un concepto jurídico. Está pensado para Colombia (Ley 1581 de 2012 y sus decretos).
> Rev. 1 · 2026-10-22 · Para: José Granados (responsable del tratamiento) · Se lee con `preguntas-abogado.md` (rev. 3) y `paquete-abogado.md`.
> **Cómo se verificó:** se leyeron los documentos y el código del repositorio (hechos marcados «verificado en el repo») y se hizo búsqueda web. Desde este entorno **no se pudieron abrir** los sitios oficiales (Senado, Función Pública, SIC): las fuentes se leyeron a través de resúmenes de búsqueda y de copias en normogramas de entidades públicas. Por eso cada norma lleva su nivel de certeza, y los números de artículo que no se pudieron confirmar están marcados **(verificar)**. No se inventó ninguna cita.

# Preasesoría legal: conectar `plataforma` con datos reales de salud

## 1. Resumen ejecutivo

1. **Veredicto:** hoy **no** es prudente conectar `plataforma` a datos reales de salud de público abierto. Sí es **viable un piloto cerrado** (2 coaches, ~10 adultos que usted conoce) si se cierran antes los cuatro puntos de abajo. El servidor está técnicamente listo (61/61 pruebas, región Virginia, sesión de 3600 s, IP de Brevo autorizada, consulta SQL OK el 2026-10-22).
2. **Bloqueo 1: los textos legales publicados dicen lo contrario de lo que hará la app.** T&C y Política (v0.1) afirman "sin servidor, sin cuentas, sin nube". Con cuentas, un titular aceptaría un texto falso. Hay que publicar la versión con cuentas (v1.0) antes de conectar.
3. **Bloqueo 2: edad.** La casilla dice "mayor de 18" pero el perfil acepta desde 14 años (`schema.js`, línea 126). Si un menor completa el perfil, queda constancia de que usted pudo saberlo. Se arregla con un cambio pequeño de producto.
4. **Bloqueo 3: papel del coach y contrato.** La idea "coach = encargado" es frágil: el coach decide cómo usa los datos. Hace falta definir el modelo y tener un acuerdo aceptado por cada coach antes de que vea datos reales.
5. **Bloqueo 4: transmisión internacional (Supabase en EE. UU., Brevo).** Hace falta un contrato de transmisión con el contenido mínimo del Decreto 1074 y, por ser datos sensibles, una autorización/aviso explícito. El DPA de Supabase y la ubicación de Brevo siguen por confirmar.
6. **No bloquean, pero deben estar escritos:** plan de incidentes (una página), plazos de retención, conservar una prueba mínima del consentimiento tras la baja.
7. **Las fotos** deben seguir apagadas (`photosCloudAllowed: () => false`) hasta tener su autorización propia.
8. **RNBD:** una persona natural, según lo que se pudo verificar, no está obligada a inscribirse hoy; esto cambia si constituye una sociedad con activos altos.
9. **Camino mínimo:** (a) edad 18+ en el perfil; (b) textos v1.0 revisados por el abogado; (c) acuerdo con coaches aceptado en la app; (d) DPA/contrato de transmisión con Supabase y Brevo guardado; (e) plan de incidentes y retención; (f) fotos apagadas. Con eso, piloto cerrado.
10. **Lo más incierto** (decida con el abogado): si EE. UU. sigue en la lista de países adecuados de la SIC, el modelo de roles del coach y el régimen aplicable a pagos de la fase 2.

---

## 2. Las 18 preguntas

Formato: **Posición** · **Fundamento** · **Riesgo** (si se hace mal) · **Certeza** mía · **Debe confirmar el abogado**.
Fuentes clave (primarias o copias en normogramas públicos; ver lista de URL al final, sección 7).

### Bloquean conectar (P1–P9)

**P1. No condicionar el servicio a datos sensibles.**
- **Posición:** la combinación del equipo A+B+D es correcta, y C es defendible solo si hay un modo útil que no exige entregar nada. El «modo local» (sin cuenta, datos solo en el teléfono) es la pieza clave: ahí usted no trata nada. La cuenta y la nube son un servicio **adicional y opcional**; compartir peso y medidas con un coach es el objeto del servicio de coaching que el cliente pide, y debe quedar así explicado.
- **Fundamento:** Ley 1581, arts. 5 (datos sensibles) y 6 (tratamiento de sensibles: autorización explícita y aviso de que responder es facultativo). La frase «ninguna actividad podrá condicionarse a que el Titular suministre datos personales sensibles» aparece en el **Decreto 1377 de 2013, art. 6** (compilado en el Decreto 1074 de 2015, art. 2.2.2.25.2.3 según la numeración de los normogramas, **verificar**), **no en la Ley 1581**: conviene corregir esa atribución en `preguntas-abogado.md`.
- **Riesgo:** alto. **Certeza:** media. **Abogado:** si «el dato sensible es el objeto del servicio» la SIC lo acepta, y que el modo local sin cuenta basta como alternativa.

**P2. Consentimiento con cuentas (casillas, prueba, re-aceptación).**
- **Posición:** sí, mantener casillas separadas y sin marcar (T&C · política · mayoría de edad · datos de salud · cada categoría de compartir). Registro solo-inserción con huella del texto: buen estándar. Re-aceptar al cambiar versión: correcto y recomendable. Falta añadir al aviso el contenido mínimo de «aviso de privacidad»/autorización (quién es responsable, finalidades, que es facultativo, derechos, canal).
- **Fundamento:** Ley 1581, art. 9 (autorización previa, expresa e informada) y art. 6; Decreto 1377/2013 arts. 7 (modo de obtener la autorización) y 8 (prueba de la autorización); Ley 527 de 1999 (valor probatorio de mensajes de datos; arts. 5, 10, 11, **verificar**). Nota: `preguntas-abogado.md` cita «art. 2.2.2.25.2.4» para la prueba; por la correspondencia de numeración (art. N del Decreto 1377 ↔ 2.2.2.25.2.(N−3), confirmada con los arts. 7 y 12), la prueba sería **2.2.2.25.2.5** y el 2.2.2.25.2.4 sería el modo de obtener la autorización. **Verificar.**
- **Riesgo:** medio. **Certeza:** media-alta. **Abogado:** suficiencia probatoria del registro y de la huella SHA-256.

**P3. «Copia en la nube».**
- **Posición:** sí, un paso propio, claro y no premarcado: «¿Guardar una copia en la nube (Supabase, EE. UU.)?», con la opción de seguir solo en el teléfono. Debe decir dónde se guarda (fuera de Colombia), quién la ve, cómo borrar. Para datos sensibles es mejor sobre-informar que apoyarse solo en «es parte de tener cuenta».
- **Fundamento:** Ley 1581 arts. 9, 12 (deber de informar) y 6; Decreto 1074, Cap. 25 (transmisión: sección 5). **Riesgo:** medio. **Certeza:** media. **Abogado:** si la separación es obligatoria o solo prudente.

**P4. Rol del coach.**
- **Posición (distinta a la del equipo):** el modelo «José único responsable, coach encargado» es **débil**. Quien decide para qué usa el dato (armar el plan, ajustar la dieta, hablar con el cliente por otros canales) actúa como **responsable** de lo que hace con él. Alternativa más realista: **José responsable de la plataforma (cuenta, nube, panel, registro); cada coach responsable independiente de su propio uso**, con compromisos contractuales mínimos y autorización del cliente al vincularse que nombre al coach. El modelo final lo decide el abogado.
- **Fundamento:** Ley 1581, art. 3 (definiciones de responsable y encargado: quien «decide sobre la base de datos y/o el Tratamiento» es responsable) y art. 18 (deberes del encargado). **Riesgo:** medio-alto (si el cliente reclama, la SIC mirará quién decidió el fin). **Certeza:** media. **Abogado:** modelo de roles y quién responde ante el titular.

**P5. Acuerdo con coaches.**
- **Posición:** aceptación electrónica dentro de la app, con registro (misma tabla de consentimientos, otro `kind`), es válida en principio; el contenido es lo importante: finalidad, confidencialidad, seguridad (clave, equipo propio), no copiar/reenviar/capturar y compartir, no subencargar, atención de reclamos, borrado y devolución al terminar, aviso de incidentes en 24–48 h, consecuencias del incumplimiento (suspensión, indemnización).
- **Fundamento:** Ley 527 de 1999; Decreto 2364 de 2012 sobre firma electrónica (**verificar** que siga vigente/compilado); Ley 1581 art. 18. **Riesgo:** medio. **Certeza:** media. **Abogado:** forma (¿firma reforzada para coaches?) y cláusulas penales.

**P6. Transmisión internacional a Supabase (EE. UU.).**
- **Posición:** Supabase aloja datos por su cuenta: es **encargado** y esto es una **transmisión** (no transferencia). El régimen: la transmisión a un encargado en otro país **no exige informar ni pedir consentimiento adicional si hay un contrato de transmisión** con el contenido mínimo del Decreto 1074. Con datos sensibles, recomiendo **hacer las dos cosas**: contrato/DPA **y** aviso/autorización explícita en la pantalla. El DPA estándar de Supabase está redactado para el GDPR y puede no tener los elementos del contrato colombiano: pedir al abogado un **anexo corto** (alcance, actividades, obligaciones frente a titular y responsable, seguridad, confidencialidad, subencargados, borrado).
- **Estados Unidos «país adecuado»:** la **Circular Externa 005 de 2017** de la SIC incluyó a EE. UU. en la lista de países con nivel adecuado (según Holland & Knight y las circulares 005/008 de 2017). **No pude confirmar que siga en el texto vigente del numeral 3.2 del Título V de la Circular Única**; además la SIC tiene en consulta (2025–2026) un proyecto que actualiza la lista y un proyecto/circular sobre **cláusulas contractuales modelo** para transferencias y transmisiones, de uso opcional. **Verificar en el sitio de la SIC antes de firmar nada.** No dependa solo de la lista: el art. 26 de la Ley 1581 tiene excepciones (p. ej., autorización expresa e inequívoca del titular).
- **Región:** confirmado hoy: Virginia (East US). Con las reglas anteriores, São Paulo no cambia la lógica (Brasil aparece como candidato a la lista en el proyecto 2026, **no confirmado**).
- **Fundamento:** Ley 1581, art. 26; Decreto 1074 de 2015, arts. 2.2.2.25.5.1 (num. 2: transmisión con contrato) y 2.2.2.25.5.2 (contenido del contrato); Circular Única SIC, Título V. **Riesgo:** alto. **Certeza:** media (baja sobre la lista de países hoy). **Abogado:** lista vigente, suficiencia del DPA de Supabase, **si existe un Decreto 1074 «de 2025» o reforma que cambie la numeración** (aparece mencionado en un proyecto de la SIC; no pude confirmarlo).

**P7. Correo de códigos (Brevo).**
- **Posición:** Brevo recibe correo y código: es encargado (transmisión). Declararlo en la política como proveedor, con su ubicación real. El correo del código es transaccional (no publicidad): no exige «darse de baja», pero debe identificar claramente al remitente; hoy sale de un correo personal/brevosend.com: usar dominio propio. Guardar el DPA de Brevo. Sus servidores y subencargados **por confirmar** (Brevo es de origen francés: probable UE, no verificado).
- **Fundamento:** Decreto 1074, arts. 2.2.2.25.5.1–2; Ley 1581 art. 12. **Riesgo:** bajo-medio. **Certeza:** media. **Abogado:** si basta nombrar a Brevo o hay que anexar contrato.

**P8. Fotos corporales en la nube.**
- **Posición:** las medidas técnicas son buenas (bucket privado, enlaces de 60 s, solo fotos marcadas, registro de vistas). Aun así, **dos autorizaciones separadas**: (1) guardar mis fotos en la nube; (2) permitir que mi coach vea fotos marcadas. Capturas de pantalla no se pueden impedir técnicamente: se cubren con el acuerdo del coach y con la advertencia en pantalla; una marca de agua con el nombre del coach disuade.
- **Fundamento:** Ley 1581 arts. 5 y 6 (imagen corporal ligada a salud = sensible, criterio prudente); Decreto 1377 art. 6. **Riesgo:** alto. **Certeza:** media. **Abogado:** si las fotos son sensibles por sí mismas aquí y la cláusula contra capturas.

**P9. Menores.**
- **Posición:** **bloquear 14–17 en el producto** (mínimo 18 en el perfil) y mantener la declaración. Una app de pérdida de peso con adolescentes añade riesgo de trastornos de la conducta alimentaria. La autorización de padres es posible en teoría pero cambia todo el diseño: no para el piloto.
- **Fundamento:** Ley 1581 art. 7 (prohíbe tratar datos de niños, niñas y adolescentes salvo los públicos; la Corte lo matizó: tratamiento posible si respeta el interés superior y sus derechos prevalentes); Decreto 1377 art. 12 (compilado en 2.2.2.25.2.9); Ley 1098 de 2006. Concepto de la SIC Rad. 18-267888 (no leído completo). Si exige la opinión del menor, no se pudo verificar. **Riesgo:** alto. **Certeza:** alta en bloquear; media en el resto. **Abogado:** si basta la declaración + bloqueo o hay que verificar (documento, tarjeta de crédito, etc.) y qué hacer si descubre un menor (borrar).

### Antes de abrir a más usuarios (P10–P15)

**P10. Retención y borrado.**
- **Posición (cifras sugeridas, las fija el abogado):** (a) cliente que deja al coach: el coach pierde acceso al instante (ya ocurre); los datos siguen en la cuenta del cliente; (b) cuenta inactiva: aviso a los 12 meses y borrado a los 13–24 meses si no responde; (c) coach sin clientes: aviso y cierre a los 12 meses; (d) copias de seguridad futuras: borrar dentro del ciclo de la copia (p. ej., 30–35 días) y decirlo en la política.
- **Fundamento:** principio de finalidad (Ley 1581 art. 4, lit. b) y derecho a la supresión (art. 8, lit. e); Decreto 1377 art. 9 (revocatoria, compilado 2.2.2.25.2.6). **Riesgo:** medio. **Certeza:** media. **Abogado:** plazos.

**P11. Prueba del consentimiento tras la baja.**
- **Posición:** conservar **solo un mínimo seudonimizado** (identificador irreversible, tipo de autorización, versión, huella del texto, fechas de aceptación y de baja) durante el plazo de defensa de reclamos. Hoy se borra todo: la pregunta del titular «pruebe que le pedí permiso» quedaría sin respuesta. Plazo de partida sugerido: 3 a 5 años (la facultad sancionatoria de la SIC caduca a los 3 años, art. 52 del CPACA, y la prescripción ordinaria de acciones civiles es de 5; **ambas por verificar**).
- **Fundamento:** Decreto 1377 art. 8 (conservar prueba). **Riesgo:** medio. **Certeza:** media. **Abogado:** mínimo y plazo; cómo informarlo en la política.

**P12. Incidentes.**
- **Posición:** tener un plan de una página. Quien trata datos debe **informar a la SIC** las violaciones de los códigos de seguridad con riesgo para los titulares (Ley 1581, art. 17, lit. n y art. 18, lit. k, **verificar el literal**). Para quienes están en el RNBD, la SIC fija **15 días hábiles** desde que se detecta el incidente (según firmas de consultoría; texto original de la Circular Única no leído). Avisar también a los titulares afectados es la práctica recomendada. Registro interno: qué pasó, cuándo se supo, a quién se avisó, qué se hizo.
- **Fundamento:** Ley 1581 arts. 17 y 18; Circular Única SIC, Título V. **Riesgo:** medio. **Certeza:** media. **Abogado:** si como persona natural no inscrita aplica el plazo de 15 días hábiles o debe avisar «de inmediato», y el canal.

**P13. RNBD.**
- **Posición:** según lo verificable, están obligados a inscribir sus bases de datos las **sociedades y entidades sin ánimo de lucro con activos totales superiores a 100.000 UVT** y las personas jurídicas públicas; **la persona natural no figura**. Lo confirmo con certeza media. Si en el futuro constituye una SAS, vuelve a mirar el umbral (≈ COP 4.980 millones en 2025; la UVT 2026 no la verifiqué). **No inscribirse no lo exime** de política, autorización, reclamos y seguridad: persisten.
- **Fundamento:** Ley 1581, art. 25; Decreto 090 de 2018 (modifica el art. 2.2.2.26.1.2 del Decreto 1074); Circular Externa 003 de 2018 SIC. Una consultoría afirma que también las personas naturales deben registrar: **contradice el decreto**; pedir al abogado cerrar la duda. **Riesgo:** bajo. **Certeza:** media. **Abogado:** confirmar.

**P14. Coaches y profesiones de salud.**
- **Posición:** crear «Términos para coaches»: declaran su formación, no prestan consulta médica, no formulan planes clínicos de nutrición ni tratan enfermedades si no son profesionales habilitados; la app no ofrece diagnósticos. Mensajes de la app que lo recuerden. **No pude verificar el contenido de la Ley 73 de 1979 ni de normas actuales de nutrición (p. ej., Ley 949 de 2005, Ley 1164 de 2007): el abogado debe confirmar qué actos están reservados a nutricionistas-dietistas.**
- **Riesgo:** medio-alto (daño a un cliente con enfermedad de base). **Certeza:** baja-media. **Abogado:** actos reservados y advertencias.

**P15. Consumidor (Ley 1480).**
- **Posición:** mientras solo conecte coaches y clientes sin cobrar al cliente, su papel se parece al de un **portal de contacto**: debe identificar a los coaches (nombre, contacto) y la plataforma no es parte del contrato de coaching. Si cobra al cliente (fase 2) o fija precios, se acerca a ser proveedor y la responsabilidad crece. Evite en los T&C cláusulas que excluyan toda responsabilidad: la Ley declara ineficaces y prohíbe las cláusulas abusivas.
- **Fundamento:** Ley 1480 de 2011, art. 53 (portales de contacto; confirmado por la Guía de comercio electrónico de la SIC), arts. 42–43 (cláusulas abusivas; **verificar numeración**). **Riesgo:** medio. **Certeza:** media. **Abogado:** si la plataforma es portal de contacto o proveedor.

### Pagos y posterior (P16–P18)

**P16. Invitación y mensajes.**
- **Posición:** el enlace por WhatsApp sin datos de salud es bajo riesgo; informarlo en la política. Los recordatorios o mensajes de servicio (necesarios para el servicio) no requieren autorización aparte, pero conviene un interruptor para apagarlos. La **Ley 2300 de 2023** regula canales, horarios y frecuencia de contacto con consumidores (sobre todo cobranza y publicidad); si algún día se envía publicidad, aplican sus reglas y el registro de exclusión. **Certeza:** media-baja (no se leyó el articulado). **Riesgo:** bajo. **Abogado:** si los mensajes del coach caen en esa ley.

**P17. Cobro, impuestos y pagos en la app.**
- **Posición:** esta pregunta es más de **contador/tributarista** que de abogado de datos. Para fase 1 (cobro al coach, fuera de la app): precio en COP fijo evita discusiones por tasa; RUT, responsabilidad de IVA y facturación electrónica según ingresos. Para fase 2: usar una pasarela con **división de pagos** (marketplace) en vez de recibir usted el dinero; el retracto y la reversión del pago son derechos del consumidor en ventas a distancia (Ley 1480, arts. 47 y 51; **no verificados en esta búsqueda**). Constituir una **SAS** (Ley 1258 de 2008) antes de la fase 2 separa su patrimonio del riesgo del negocio. **Certeza:** baja. **Riesgo:** medio. **Abogado/contador:** umbrales, régimen y figura de recaudo.

**P18. Comunidad, retos, premios.**
- **Posición:** no existe aún; no gastar tiempo de consulta hoy. Cuando exista: reglas de contenido y mecanismo de retiro, autorización de imagen, y revisar si los premios entran en el régimen de juegos de suerte y azar (Ley 643 de 2001; un reto de pérdida de peso es de habilidad, pero los sorteos o rifas sí requieren autorización de Coljuegos; **no verificado**). Cuidado de salud: no premiar pérdidas extremas. **Certeza:** baja. **Riesgo:** bajo hoy.

---

## 3. Riesgos que el equipo puede reducir YA con cambios de producto

No se implementa nada en este informe. Esfuerzo: S (≤ 1 día) · M (2–4 días) · L (más de una semana).

| # | Cambio | Esfuerzo | Pregunta que ayuda a resolver |
|---|---|---|---|
| 1 | **Edad mínima 18 en el perfil** (hoy 14–100 en `schema.js`) y mensaje claro si alguien pone menos | S | P9 |
| 2 | **No borrar `consent_events` por completo en la baja:** conservar un mínimo seudonimizado, o diferir su borrado al plazo que fije el abogado | M | P11, P2 |
| 3 | **Consentimiento separado de «copia en la nube»** (paso propio, sin marcar, con alternativa de uso local) | M | P3, P1 |
| 4 | **Consentimientos separados de fotos:** guardar en la nube / ver con el coach; mantener `photosCloudAllowed` en `false` hasta que existan | M | P8 |
| 5 | **Mensajes en la app:** «no es consulta médica», «tus datos se guardan fuera de Colombia», «el coach no debe capturar ni reenviar tus fotos», aviso antes de compartir | S | P1, P3, P8, P14 |
| 6 | **Retención de cuentas inactivas:** aviso por correo y borrado automático según el plazo del abogado | M | P10 |
| 7 | **Aceptación del acuerdo de coach** dentro de la app, registrada como evento de consentimiento, antes de ver datos de clientes | S-M | P4, P5 |
| 8 | **Botón «ejercer mis derechos»** (consultar, corregir, borrar, revocar) que lleve al canal de reclamos con los plazos de la política | S | P12, derechos del titular |
| 9 | **Dominio propio y correo de datos propio** (hoy correo personal en la política y como remitente) | S (Stakeholder) | P7 |
| 10 | **Plan de incidentes** de una página y registro interno | S | P12 |
| 11 | **Pasar a plan Pro** (copias de seguridad) y declarar la retención de copias en la política | S (costo) | P10 |
| 12 | **Marca de agua** con el nombre del coach en las fotos que ve | M | P8 |
| 13 | **Modo local sin cuenta** claramente disponible y explicado (verificar que funciona al negar la nube) | S (verificar) | P1 |
| 14 | **Si algún día se usa IA** en recomendaciones: evaluación de impacto según la Circular Externa 002 de 2024 (hoy son fórmulas fijas; probable que no aplique) | L si llega | Marco general |

---

## 4. Cláusulas y textos sugeridos (puntos clave, no redacción final)

**A. Autorización de datos sensibles (salud)**
- Quién es el responsable y cómo contactarlo (sin publicar cédula).
- Qué datos: perfil de salud, peso, medidas, comidas, hábitos, notas, y que son **datos sensibles**.
- Para qué: calcular el plan, mostrar el progreso y, si hay vínculo, compartir con el coach lo que usted elija.
- **Es facultativo**: puede usar la app sin cuenta, solo en el teléfono.
- Casilla propia, sin marcar; revocable cuando quiera; qué pasa al revocar.
- Derechos (conocer, rectificar, suprimir, revocar, reclamar ante la SIC) y canal de reclamos.
- No se venden ni se usan para publicidad.

**B. Copia en la nube**
- Qué se copia (datos de texto; las fotos aparte).
- Dónde: servidores de Supabase en Estados Unidos (Virginia); es un tercero que actúa por cuenta nuestra.
- Quién la ve: usted, y el coach solo lo que usted comparta; el responsable no mira su contenido salvo por soporte o por orden de autoridad.
- Cómo desactivar y borrar; qué plazos de conservación y copias de seguridad.
- Aviso de que el nivel de protección en el exterior puede ser distinto y que usted autoriza la transmisión.

**C. Fotos**
- Autorización 1: guardar mis fotos en la nube. Autorización 2: permitir que mi coach vea las que yo marque.
- Solo las fotos marcadas una a una; enlace que vence en 60 s; registro de vistas visible para el cliente.
- Prohibido al coach descargar, capturar, reenviar o publicar; consecuencias.
- Revocar la autorización oculta las fotos al coach de inmediato; borrar una foto la borra del servidor.

**D. Acuerdo de encargado / de coaches** (o acuerdo de responsables, según modelo que decida el abogado)
- Objeto y duración; finalidad única (acompañar al cliente que lo vinculó).
- Confidencialidad; seguridad mínima (clave, dispositivo propio, sin compartir cuenta).
- No copiar, exportar, reenviar, publicar ni usar para otros fines (incluida publicidad propia).
- Sin subencargados; atender reclamos del titular y trasladarlos en 2 días hábiles.
- Aviso a la plataforma de cualquier incidente en 24–48 horas.
- Borrado o devolución al terminar el vínculo; auditoría o verificación.
- Declaración de formación profesional y límites (sin diagnóstico ni tratamientos clínicos).
- Consecuencias: suspensión inmediata e indemnización.

**E. Aviso de transmisión internacional**
- Quién trata fuera de Colombia (Supabase, y Brevo para el correo del código), para qué, en qué país.
- Que actúan por cuenta del responsable y bajo contrato; medidas de seguridad.
- Que se trata de datos sensibles y que la autorización se pide de forma expresa.
- Derechos del titular frente a esos terceros y cómo ejercerlos ante el responsable.

---

## 5. Lo que sí o sí debe validar el abogado humano

1. **Lista vigente de países adecuados de la SIC** (¿sigue EE. UU.?) y si basta contrato más autorización para Supabase.
2. **Suficiencia del DPA de Supabase y de Brevo** frente al contenido mínimo del Decreto 1074 (art. 2.2.2.25.5.2), y la numeración vigente tras posibles reformas.
3. **Modelo de roles con el coach** (encargado vs. responsable independiente) y quién responde ante el titular.
4. **Casillas y texto del consentimiento** (sensibles, nube, fotos, coach): que no «condicionan» el servicio y que cumplen aviso de privacidad.
5. **Menores:** si basta bloquear y declarar, o hay que verificar; qué hacer si se descubre un menor.
6. **Plazos:** retención de inactivas, conservación mínima del consentimiento tras la baja y copias de seguridad.
7. **Incidentes:** plazo y canal reales para una persona natural **no inscrita** en el RNBD, y contenido del aviso al titular.
8. **RNBD:** confirmar por escrito que, hoy, no está obligado, y qué cambiaría con una SAS.
9. **Actos reservados a nutricionistas-dietistas** y cláusulas para coaches no habilitados.
10. **Pagos de la fase 2 y régimen del consumidor:** portal de contacto vs. proveedor, retracto, y cuándo constituir sociedad (con apoyo de un contador).

### Orden del día de reunión de 45 minutos
| Min | Tema | Resultado esperado |
|---|---|---|
| 0–5 | Contexto y hechos: app local-first, Supabase Virginia, Brevo, fotos apagadas, piloto cerrado (2 coaches, ~10 adultos) | El abogado entiende el flujo de datos |
| 5–15 | **Bloqueos P1–P3 y P9:** modelo de consentimiento y edad | Texto y diseño de casillas aprobados |
| 15–25 | **P4–P5:** rol del coach y acuerdo | Modelo elegido y lista de cláusulas |
| 25–32 | **P6–P7:** Supabase, Brevo, lista de países | Qué contrato/anexo se firma o acepta |
| 32–38 | **P8, P10–P12:** fotos, retención, prueba, incidentes | Plazos y plan de incidentes |
| 38–43 | **P13–P15:** RNBD, coaches de salud, consumidor | Sí/No y advertencias |
| 43–45 | Cierre: P16–P18 y honorarios para redactar textos v1.0 | Cronograma y responsables |

---

## 6. Qué no pude verificar
- Texto actual de la Circular Única SIC (Título V) y si EE. UU. sigue en la lista de países adecuados; estado de los proyectos de 2025–2026 de la SIC.
- Si existe un Decreto 1074 «de 2025» que modifique el régimen de transferencias/transmisiones (aparece solo mencionado en un proyecto).
- Texto literal de los arts. de la Ley 1581 (17 lit. n, 18 lit. k, 26), del Decreto 1377 (opinión del menor) y de los arts. 42–43, 47 y 51 de la Ley 1480.
- Contenido de la Ley 73 de 1979 y de las normas de nutrición vigentes.
- Servidores y subencargados de Brevo; DPA vigente de Supabase para el plan gratuito.
- Plazo exacto (15 días hábiles) del reporte de incidentes en la Circular Única, y su aplicación a no inscritos.
- Umbrales tributarios y UVT 2026.

## 7. Fuentes consultadas (por búsqueda; verifique en el original)
- Decreto 1377 de 2013 (copia en normograma): https://normas.cra.gov.co/gestor/docs/decreto_1377_2013.htm
- Decreto 1074 de 2015: https://cancilleria.gov.co/sites/default/files/Normograma/docs/pdf/decreto_1074_2015_pr026.pdf
- Transmisiones y transferencias (arts. 2.2.2.25.5.1–2): https://encolombia.com/derecho/decretos/decreto-mincit/transferencias-datos-personales/
- Circular Externa 005 de 2017 (SIC): https://operaciones.colombiacompra.gov.co/sites/cce_public/files/cce_informe_seguimiento/superindustria-circularexterna-2017-n0000005_20170810_1.pdf · Circular 008 de 2017: https://ambitojuridico.com/sites/default/files/BancoMedios/Archivos/circexterna-008-17%28sic%29.pdf
- Circular Única SIC: https://www.cancilleria.gov.co/sites/default/files/Normograma/docs/pdf/circular_superindustria_unica_pr004.pdf
- Decreto 090 de 2018: https://www.saludcapital.gov.co/Normo/tic/decreto_0090_de_2018.pdf
- Circular Externa 002 de 2024 (IA): https://www.cerlatam.com/normatividad/sic-circular-externa-002-de-2024/
- SIC, cláusulas contractuales modelo (proyecto): https://sedeelectronica.sic.gov.co/transparencia/normativa/proyecto-de-circular-externa-instrucciones-sobre-las-clausulas-contractuales-modelo-para-la-transferencia-y-transmision · listado de circulares: https://sedeelectronica.sic.gov.co/transparencia/normativa/circular-externa
- Concepto SIC sobre menores (no leído completo): https://sedeelectronica.sic.gov.co/sites/default/files/normatividad/022019/Rad18_18267888PDG.PDF
- Texto de las leyes (URL habituales de la Secretaría del Senado, **no abiertas desde este entorno**): http://www.secretariasenado.gov.co/senado/basedoc/ley_1581_2012.html · …/ley_1480_2011.html · …/ley_0527_1999.html · …/ley_1098_2006.html · …/ley_2300_2023.html
