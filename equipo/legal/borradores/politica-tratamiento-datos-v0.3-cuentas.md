> **BORRADOR v0.3 — NO VIGENTE — pendiente de revisión del abogado.**
> No es asesoría legal. Autor: Analista de Producto · 2026-10-22 · Parte de `equipo/legal/preasesoria-legal.md` y de `equipo/legal/respuestas-abogado.md` (decisiones P1–P18 del 2026-10-22). Reemplazaría a `politica-tratamiento-datos.md` (v0.1, piloto sin servidor), que no se modifica.
> **(a validar)** = propuesta del equipo que el abogado debe confirmar. **(por confirmar)** = hecho o norma que no pudo verificarse. Las notas "NOTA" son internas. `[FECHA DE VIGENCIA]` se completa al publicar.

# Política de Tratamiento de Datos Personales — "Pérdida de Grasa" (versión con cuentas)

**Versión:** 0.3 (borrador) · **Edición:** con cuentas y copia en la nube · **Vigente desde:** [FECHA DE VIGENCIA]

**Normas:** Ley Estatutaria 1581 de 2012 y Decreto 1377 de 2013, compilado en el Decreto Único 1074 de 2015 (Libro 2, Parte 2, Título 2, Capítulo 25), y demás normas que los modifiquen o complementen. *(numeración por confirmar por el abogado)*

## 1. ¿Quién es el responsable de tus datos?

| | |
|---|---|
| **Responsable del tratamiento (plataforma)** | José Granados, persona natural |
| **Domicilio y dirección** | Calle 18 # 16-27, Barranquilla, Colombia |
| **Correo para datos personales** | joseleo984@gmail.com |
| **Teléfono / WhatsApp** | +57 312 887 6135 |
| **Quién atiende consultas y reclamos** | El mismo responsable, en el correo anterior |

"Nosotros" es el responsable; "la app" es "Pérdida de Grasa"; "tú" o "titular" es la persona a la que se refieren los datos; "coach" es el profesional que te acompaña.

**Dos responsables distintos (P4):** nosotros somos responsables de la **plataforma** (infraestructura, cuentas, seguridad y registro de autorizaciones). **Tu coach es responsable independiente** de su relación de asesoría contigo y de los datos que tú le compartes, y se compromete por contrato con nosotros a límites mínimos (§7). Si tu reclamo es sobre lo que hizo tu coach, también puedes presentárnoslo: **lo trasladamos al coach en máximo 2 días hábiles** y te avisamos. Los reclamos sobre la plataforma los resolvemos nosotros.

## 2. Cómo funciona la app

- **Sin cuenta (modo local):** tus datos se guardan **solo en tu teléfono**. No recibimos nada. Este modo siempre está disponible y no te pedimos datos de salud.
- **Con cuenta:** entras con tu correo y un código de 6 dígitos. Si lo autorizas, tus datos se **copian a la nube** (Supabase, EE. UU.). Si te vinculas a un coach, él ve solo las categorías que tú actives.
- Nunca enviamos datos de salud por WhatsApp: WhatsApp solo se usa para compartir el **enlace de invitación** del coach.

## 3. ¿Qué datos tratamos?

| Tipo | Ejemplos | Dónde | ¿Obligatorio? |
|---|---|---|---|
| **Cuenta** | Correo, nombre para mostrar, rol (cliente/coach) | Supabase; el correo también pasa por Brevo al enviar el código | Solo si creas cuenta |
| **Datos de perfil** | Sexo, edad, estatura, peso inicial y meta, actividad, ritmo | Tu teléfono; la nube si la autorizas | Necesarios para calcular tu plan |
| **Datos sensibles de salud** | Peso, medidas, % de grasa estimado, comidas, calorías, hábitos, pasos, sueño, agua, entrenamiento, notas | Tu teléfono; la nube si la autorizas | **Facultativo** (§5) |
| **Fotos de progreso** (sensibles) | Imágenes corporales | Tu teléfono; la nube **solo con autorización propia** | **Facultativo**, aparte |
| **Vínculo con coach** | Quién es tu coach, qué categorías compartes, comentarios del coach | Supabase | Solo si te vinculas |
| **Tus autorizaciones** | Qué aceptaste, versión, fecha y huella del texto | Supabase y tu teléfono | Sí (prueba) |
| **Registro de vistas de fotos** | Qué coach abrió qué foto y cuándo | Supabase; tú lo ves | Solo si compartes fotos |
| **Datos técnicos de seguridad** | Intentos de códigos de invitación (se borran al día siguiente) | Supabase | Sí (seguridad) |
| **Datos del coach** | Correo, nombre comercial, clientes vinculados | Supabase | Solo coaches |

La app **no** recoge tu ubicación, **no** usa cookies de publicidad y **no** usa analítica de terceros. No tratamos datos de niños, niñas ni adolescentes (§9).

## 4. ¿Para qué usamos tus datos? (finalidades)

1. Crear y proteger tu cuenta, y enviarte el código de acceso.
2. Calcular tu plan y mostrar tu progreso.
3. Si lo autorizas: guardar una copia en la nube y sincronizar entre dispositivos.
4. Si te vinculas: permitir que tu coach vea **solo** lo que activaste, y mostrarte sus comentarios.
5. Guardar prueba de tus autorizaciones y atender consultas y reclamos.
6. Seguridad y prevención de abuso; cumplir obligaciones legales.
7. Mejorar la app con resultados **agregados y sin tu nombre**. *(a validar si se mantiene esta finalidad.)*

Finalidad 4.8 Desarrollar análisis y procesamientos automatizados sobre las variables, hábitos y métricas registrados voluntariamente por el Titular (tales como peso, ingesta nutricional reportada y horas de sueño) con el objetivo exclusivo de emitir señales operativas y alertas preventivas de seguridad dirigidas a su coach. Dichas alertas tienen naturaleza meramente orientativa, orientada a advertir posibles patrones de riesgo físico o alimentario y a facilitar la sugerencia oportuna de consulta con profesionales de la salud. La Plataforma no realiza diagnósticos clínicos, valoraciones médicas automatizadas ni prescripciones nutricionales o de entrenamiento a partir de estos análisis.

*NOTA v1.1 (25/10/2026): «[Finalidad X.X]» del anexo del concepto 2 es variable de formato y se reemplaza por la numeración correlativa; las alertas L6 descritas en esta finalidad siguen APAGADAS en la app (Etapa 3).*

Finalidad 4.9 Calcular indicadores de cumplimiento y adherencia deportiva ("puntos de constancia") a partir del reporte voluntario de hábitos, y facilitar la visualización comparativa de dichos puntajes entre miembros del mismo equipo deportivo bajo alias disociados, única y exclusivamente cuando el Titular haya otorgado su consentimiento expreso y voluntario para participar en dinámicas comunitarias o ligas semanales.

*NOTA v1.2 (26/10/2026): «[Finalidad X.X]» del concepto 7, punto 5, es variable de formato y se reemplaza por la numeración correlativa. Las ligas y la comparación entre asesorados bajo alias NO están construidas (exigen el consentimiento del punto 4 del concepto 7); lo que hay son puntos personales (los ven la persona y su coach) y la meta colectiva del team (solo una suma, con mínimo 5 participantes).*

**No vendemos tus datos**, no los usamos para publicidad y **no publicamos tus fotos**.

## 5. Datos sensibles: salud, medidas y fotos

Según los artículos 5 y 6 de la Ley 1581 de 2012, los datos de salud son **sensibles**; las **fotos corporales también son datos sensibles** (P8). Por eso:

- **No estás obligado/a** a autorizar su tratamiento ni a responder sobre ellos. Es **facultativo**.
- **Puedes usar la app sin cuenta, solo en tu teléfono** (calcular tu plan, estimar calorías y registrar tu progreso), sin entregarnos ningún dato de salud: así el servicio no se condiciona a datos sensibles (P1).
- Si te vinculas a un coach, el **peso y las medidas** son el dato mínimo del servicio que solicitas; el resto (notas, comidas, hábitos, fotos) es aparte y viene apagado.
- Nuestras pruebas de que autorizaste (usuario, tipo, versión, fecha y huella SHA-256 del texto exacto que viste) quedan en un registro que no se puede modificar (Ley 527 de 1999). *(P2)*
- Para una cuenta pedimos **casillas separadas, sin marcar**: datos de salud · copia en la nube y transmisión internacional · compartir con el coach (por categoría) · fotos (autorización propia).
- Puedes **retirar** cada autorización cuando quieras en Más → Mis datos y permisos. Retirar una no afecta a las demás.
- *NOTA: la frase "ninguna actividad podrá condicionarse a que el titular suministre datos sensibles" proviene del Decreto 1377 de 2013, art. 6 (por confirmar numeración en el Decreto 1074), no de la Ley 1581.*

## 6. Fotos y tratamiento de imágenes

- Las fotos son **opcionales** y se quedan en tu teléfono mientras no autorices otra cosa.
- **Autorización 1:** guardar mis fotos en la nube. **Autorización 2:** permitir que mi coach vea las fotos que yo marque, **una a una**.
- Finalidad única: tu seguimiento visual con tu coach. No las usamos para publicidad, estudios, reconocimiento facial ni las publicamos.
- Tu coach las abre con un **enlace que vence en 60 segundos**; **queda registro** de cada vista y tú lo ves.
- Al coach le **está prohibido** descargar, capturar, reenviar o publicar tus fotos. *Aviso honesto: técnicamente no se pueden impedir las capturas de pantalla; por eso existe el acuerdo del coach y la consecuencia de suspensión.*
- Si retiras la autorización, las fotos dejan de verse para el coach **de inmediato**; el coach tiene hasta **30 días para destruir** cualquier copia que hubiera hecho fuera de la app, sin usarla ni compartirla (P17). Si borras una foto, se borra del servidor.
- No condiciona el servicio: sin fotos, la app funciona igual. *(Mientras esta autorización y su pantalla no existan, las fotos permanecen solo en el teléfono.)*

## 7. ¿Con quién compartimos tus datos?

### 7.1 Tu coach
Solo ve lo que activaste por categoría. **Tu coach es responsable independiente del uso que hace** de esos datos (a validar, P4). Antes de ver datos acepta un **acuerdo** con nosotros: usar los datos solo para acompañarte, confidencialidad, no descargar ni compartir fotos, no dar planes de alimentación si no es profesional habilitado, borrar al terminar el vínculo, avisar incidentes. No ve tu correo. Pierde el acceso al instante (el panel deja de mostrar tus datos) cuando terminas el vínculo o retiras el permiso, y tiene hasta **30 días para destruir** lo que hubiera copiado por fuera de la app, sin usarlo ni compartirlo (P17). Lo que el coach ya tenga por **fuera** de la app se rige además por su propia política.

### 7.1.1 Copias de trabajo que descarga tu coach
Para facilitar el diseño de tu plan y el seguimiento de tu progreso, tu coach podrá generar y descargar copias locales de trabajo con tus registros de medidas, comidas, hábitos y entrenamientos. El coach asume la custodia legal y confidencialidad de este archivo, comprometiéndose a usarlo exclusivamente para tu asesoría. Tus fotografías corporales están excluidas de esta función y nunca se incluyen en dichas descargas.

### 7.2 Supabase Inc. (nube) — transmisión internacional
Supabase guarda tu cuenta, tus datos y fotos en servidores en **Estados Unidos (región East US, Virginia)**. Actúa **por cuenta nuestra** (encargado). Es una **transmisión internacional**: la hacemos con un contrato (**DPA**) archivado con el proveedor **y con tu autorización expresa** (casilla A4, propia), porque son datos sensibles. El nivel de protección en el exterior puede ser distinto al de Colombia. *(P6. Por confirmar: dos fuentes difieren sobre si EE. UU. figura en la lista de países adecuados de la SIC; la conducta de A4 + DPA cubre ambos casos.)*

### 7.3 Brevo (correo)
**Brevo** (sede en Francia, Unión Europea) envía el código de acceso. Recibe solo tu **correo y el código de un solo uso**, nada de salud. Actúa por cuenta nuestra con un **DPA estándar aceptado y archivado** (P7); subencargados **por confirmar**. Es un correo de servicio, no publicidad.

### 7.4 GitHub Pages y WhatsApp
La app se descarga desde GitHub Pages (EE. UU.); no recibe tus datos de salud. WhatsApp solo se usa para compartir el enlace de invitación, sin datos de salud.

### 7.5 Autoridades
Solo cuando la ley lo exija o una autoridad competente lo ordene.

## 8. Tus derechos como titular

Según el art. 8 de la Ley 1581 de 2012, puedes: **conocer, actualizar y rectificar** tus datos; **pedir prueba** de tu autorización; **ser informado/a** del uso que damos a tus datos; **presentar quejas ante la SIC** tras reclamar ante nosotros; **revocar** la autorización y **pedir la supresión**, salvo deber legal o contractual de conservarlos; y **acceder gratis** a tus datos. En la app: exportar, corregir, retirar autorizaciones y **borrar tu cuenta** (Perfil → Cuenta).

### Consultas y reclamos
**Canal:** correo a **joseleo984@gmail.com**, asunto "Datos personales", con tu nombre, el correo de tu cuenta, qué pides y cómo respondemos. Si actúas por otra persona, acredita que la representas.

| Trámite | Qué es | Plazo |
|---|---|---|
| **Consulta** (art. 14 Ley 1581) | Saber qué datos tenemos y cómo se usan | **10 días hábiles**; si no alcanzamos, avisamos el motivo y respondemos en máx. **5 días hábiles** más |
| **Reclamo** (art. 15 Ley 1581) | Corregir, actualizar, suprimir, revocar o denunciar incumplimiento | **15 días hábiles**; si no alcanzamos, avisamos el motivo y respondemos en máx. **8 días hábiles** más |

Si el reclamo está incompleto te pedimos completarlo dentro de 5 días; pasados 2 meses sin respuesta se entiende desistido. Si no somos competentes, lo trasladamos en máx. 2 días hábiles. En máx. 2 días hábiles marcamos el dato con "reclamo en trámite". *(plazos tal como en el v0.1; abogado confirma)*

## 9. Menores de edad

La app es **solo para mayores de 18 años** (edad mínima estricta). Declaras serlo al crear la cuenta y la app no acepta perfiles con edad menor. No tratamos datos de niños, niñas ni adolescentes. Si detectamos que una cuenta es de un menor: **suspendemos su acceso, rechazamos la sincronización y borramos todo lo que haya en la nube en un máximo de 48 horas**, avisando por correo. *(P9)*

## 10. Seguridad e incidentes

- **Controles:** cada persona solo accede a sus propios datos (seguridad por filas); el coach nunca consulta las tablas directamente, solo recibe lo que la plataforma entrega según el vínculo y las categorías; las notas se retiran si no hay permiso; fotos en almacenamiento privado con enlaces de 60 s; registro de autorizaciones que no se puede modificar; código de acceso de 6 dígitos que vence en 10 minutos; sesión de 1 hora.
- **Incidentes:** los coaches deben avisarnos de cualquier incidente en **máximo 24 horas**. Si ocurre una violación de seguridad que afecte tus datos, **informaremos a la SIC** (informe circunstanciado) en máximo **15 días hábiles desde que la constatemos**, y **a los titulares afectados**. *(P12. Por confirmar: el plazo exacto y si aplica a una persona natural no inscrita en el RNBD.)* Llevamos un registro interno de cada incidente.
- **Copias de seguridad:** **en la fase piloto el servidor NO hace copias de seguridad automáticas** y puedes exportar tus datos desde la app (P16). Al pasar a producción abierta usaremos un plan con copias y lo diremos aquí; los datos borrados desaparecerán de ellas dentro de su ciclo (p. ej., 30–35 días, a validar).

## 11. Conservación y borrado *(P10–P11; el abogado confirma)*

| Qué | Cuánto se conserva |
|---|---|
| **Datos en tu teléfono** | Hasta que los borres |
| **Datos en la nube** | Mientras tengas la cuenta; se borran al borrarla |
| **Cuenta inactiva** | Se borra a los **365 días sin iniciar sesión**. Aviso por correo el **día 335** (puedes reactivarla entrando o descargar tus métricas), recordatorio el **día 358**, borrado en cascada el **día 365** |
| **Coach sin clientes** | Misma regla de los 365 días sin iniciar sesión |
| **Vínculo terminado** | El coach pierde el acceso al instante; debe destruir lo que haya copiado fuera de la app (máx. 30 días); tus datos siguen en tu cuenta |
| **Intentos de código de invitación** | 1 día |
| **Copias de seguridad** | En el piloto no hay copias automáticas; si se activan, hasta 30–35 días tras el borrado (a validar) |
| **Prueba mínima de tus autorizaciones, después de la baja** | **3 años desde la cancelación**, **disociada**: un UUID anónimo (no tu correo ni tu nombre), tipo de autorización, versión, huella del texto y marcas de tiempo. Finalidad: demostrar que pediste permiso y defendernos ante reclamos. *(P11)* |
| **Resultados agregados sin nombre** | Pueden conservarse (no te identifican) |

## 12. Registro Nacional de Bases de Datos (RNBD)

Según el Decreto 090 de 2018, la inscripción obliga a personas jurídicas con activos superiores a 100.000 UVT, entre otras; **una persona natural no figura**. Hoy el responsable es persona natural y **no está obligado a inscribirse** (P13) *(cambia si se constituye una sociedad)*. Eso **no** nos exime de esta política, de la autorización, los reclamos y la seguridad, que cumplimos igual.

## 13. Vigencia, versiones y cambios

Esta política rige desde [FECHA DE VIGENCIA] hasta que publiquemos una nueva. Si cambia de forma sustancial, la app **te pedirá aceptarla de nuevo**. La base de datos estará vigente mientras se preste el servicio y por los plazos de §11.

## Adenda 24/10/2026

Esta adenda se **añade** a la política y no reemplaza ningún apartado anterior. Es el texto aprobado por la asesoría jurídica el 24 de octubre de 2026 para el producto con cuentas, comidas y medidas ampliadas.

§6. Categorías de Datos Sensibles Recolectados: Se recolectan y tratan medidas antropométricas corporales (incluyendo peso, cuello, brazos, espalda, cintura, abdomen, cadera y muslos) y registros descriptivos de ingestas alimentarias con estimación de aporte calórico aproximado provisto por catálogo de referencia.

§7.1. Finalidad y Alcance Técnico: Las estimaciones calóricas y los registros de comidas se procesan con fines exclusivos de autogestión y seguimiento de hábitos deportivos. La plataforma no ofrece asesoría nutricional, prescripción dietética ni diagnóstico clínico. Las cifras del catálogo son aproximaciones referenciales y no reemplazan la consulta con profesionales de la salud.

## Historial de versiones

| Versión | Fecha | Cambio |
|---|---|---|
| 0.3 (borrador, textos v1.2) | 2026-10-26 | Se añade, literal, la finalidad 4.9 de puntos de constancia (concepto 7, punto 5). La política publicada (legal/privacidad.html) es la 1.2. |
| 0.3 (borrador, textos v1.1) | 2026-10-25 | Se añaden, literales, la finalidad 4.8 de análisis automatizado (anexo del concepto 2, punto 4; alertas apagadas) y el párrafo §7.1.1 de copias de trabajo del coach (concepto 6). La política publicada (legal/privacidad.html) es la 1.1. |
| 0.3 (borrador, adenda) | 2026-10-24 | **Adenda 24/10/2026**: se añaden, literales, los párrafos §6 (categorías de datos sensibles recolectados) y §7.1 (finalidad y alcance técnico) del concepto jurídico del 24 de octubre de 2026. En este borrador el §6 y el §7.1 tratan otros temas (fotos y coach), por eso van como adenda y no reemplazan nada. |
| 0.3 (borrador) | 2026-10-23 | Adopta las respuestas P1–P18: roles, retención de 365 días con avisos a los días 335 y 358, prueba del consentimiento 3 años disociada, Brevo nombrado, incidentes 24 h / 15 días hábiles, menores con borrado en 48 h, sin copias automáticas en el piloto, destrucción por el coach en 30 días. No vigente. |
| 0.2 (borrador) | 2026-10-22 | Primer borrador con cuentas, Supabase, Brevo, coach como responsable independiente, fotos con autorización propia, retención, prueba del consentimiento, incidentes, RNBD. No vigente. |
