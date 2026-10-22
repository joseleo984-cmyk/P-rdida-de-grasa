> **BORRADOR v0.2 — NO VIGENTE — pendiente de revisión del abogado.**
> No es asesoría legal. Autor: Analista de Producto · 2026-10-22 · Parte de `equipo/legal/preasesoria-legal.md`. Reemplazaría a `politica-tratamiento-datos.md` (v0.1, piloto sin servidor), que no se modifica.
> **(a validar)** = propuesta del equipo que el abogado debe confirmar. **(por confirmar)** = hecho o norma que no pudo verificarse. Las notas "NOTA" son internas. `[FECHA DE VIGENCIA]` se completa al publicar.

# Política de Tratamiento de Datos Personales — "Pérdida de Grasa" (versión con cuentas)

**Versión:** 0.2 (borrador) · **Edición:** con cuentas y copia en la nube · **Vigente desde:** [FECHA DE VIGENCIA]

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

**Dos responsables distintos (a validar, P4):** nosotros somos responsables de la **plataforma** (cuenta, nube, panel y registro de autorizaciones). **Tu coach es responsable independiente** del uso que hace de los datos que tú le compartes, y se compromete por contrato con nosotros a límites mínimos (§7). Si tienes un reclamo sobre lo que hizo tu coach, también puedes presentárnoslo y lo trasladaremos.

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

**No vendemos tus datos**, no los usamos para publicidad y **no publicamos tus fotos**.

## 5. Datos sensibles: salud, medidas y fotos

Según los artículos 5 y 6 de la Ley 1581 de 2012, los datos de salud son **sensibles**; las imágenes corporales las tratamos con el mismo cuidado *(a validar si son sensibles por sí mismas; P8)*. Por eso:

- **No estás obligado/a** a autorizar su tratamiento ni a responder sobre ellos. Es **facultativo**.
- **Puedes usar la app sin cuenta, solo en tu teléfono**, sin entregarnos ningún dato de salud.
- Para una cuenta pedimos **casillas separadas, sin marcar**: datos de salud · copia en la nube y transmisión internacional · compartir con el coach (por categoría) · fotos (autorización propia).
- Puedes **retirar** cada autorización cuando quieras en Perfil → Privacidad. Retirar una no afecta a las demás.
- *NOTA: la frase "ninguna actividad podrá condicionarse a que el titular suministre datos sensibles" proviene del Decreto 1377 de 2013, art. 6 (por confirmar numeración en el Decreto 1074), no de la Ley 1581.*

## 6. Fotos y tratamiento de imágenes

- Las fotos son **opcionales** y se quedan en tu teléfono mientras no autorices otra cosa.
- **Autorización 1:** guardar mis fotos en la nube. **Autorización 2:** permitir que mi coach vea las fotos que yo marque, **una a una**.
- Finalidad única: tu seguimiento visual con tu coach. No las usamos para publicidad, estudios, reconocimiento facial ni las publicamos.
- Tu coach las abre con un **enlace que vence en 60 segundos**; **queda registro** de cada vista y tú lo ves.
- Al coach le **está prohibido** descargar, capturar, reenviar o publicar tus fotos. *Aviso honesto: técnicamente no se pueden impedir las capturas de pantalla; por eso existe el acuerdo del coach y la consecuencia de suspensión.*
- Si retiras la autorización, las fotos dejan de verse para el coach **de inmediato**. Si borras una foto, se borra del servidor.
- No condiciona el servicio: sin fotos, la app funciona igual. *(Mientras esta autorización y su pantalla no existan, las fotos permanecen solo en el teléfono.)*

## 7. ¿Con quién compartimos tus datos?

### 7.1 Tu coach
Solo ve lo que activaste por categoría. **Tu coach es responsable independiente del uso que hace** de esos datos (a validar, P4). Antes de ver datos acepta un **acuerdo** con nosotros: usar los datos solo para acompañarte, confidencialidad, no descargar ni compartir fotos, no dar planes de alimentación si no es profesional habilitado, borrar al terminar el vínculo, avisar incidentes. No ve tu correo. Pierde el acceso al instante cuando terminas el vínculo o retiras el permiso. Lo que el coach ya tenga por **fuera** de la app se rige por su propia política.

### 7.2 Supabase Inc. (nube) — transmisión internacional
Supabase guarda tu cuenta, tus datos y fotos en servidores en **Estados Unidos (región East US, Virginia)**. Actúa **por cuenta nuestra** (encargado). Es una **transmisión internacional**: la hacemos con un contrato con el proveedor *(DPA y anexo con el contenido mínimo del Decreto 1074: por confirmar y firmar)* **y con tu autorización expresa** (casilla propia), porque son datos sensibles. El nivel de protección en el exterior puede ser distinto al de Colombia. *(a validar: si EE. UU. sigue en la lista de países adecuados de la SIC; P6.)*

### 7.3 Brevo (correo)
Brevo envía el código de acceso. Recibe tu **correo y el código**, nada de salud. Su ubicación y subencargados están **por confirmar** (sede francesa; se presume UE). Actúa por cuenta nuestra *(DPA por guardar; P7)*. Es un correo de servicio, no publicidad.

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

La app es **solo para mayores de 18 años**. Declaras serlo al crear la cuenta y la app no acepta perfiles con edad menor. No tratamos datos de niños, niñas ni adolescentes. Si sabemos que una cuenta es de un menor, la **cerramos y borramos sus datos**. *(a validar, P9: si basta declaración + bloqueo.)*

## 10. Seguridad e incidentes

- **Controles:** cada persona solo accede a sus propios datos (seguridad por filas); el coach nunca consulta las tablas directamente, solo recibe lo que la plataforma entrega según el vínculo y las categorías; las notas se retiran si no hay permiso; fotos en almacenamiento privado con enlaces de 60 s; registro de autorizaciones que no se puede modificar; código de acceso de 6 dígitos que vence en 10 minutos; sesión de 1 hora.
- **Incidentes:** si ocurre una violación de seguridad que afecte tus datos, **te avisaremos** y, cuando la ley lo exija, la **reportaremos a la SIC** *(a validar: plazo y canal para una persona natural no inscrita en el RNBD; la preasesoría cita 15 días hábiles para inscritos, sin confirmar; P12)*. Llevamos un registro interno de cada incidente. Los coaches deben avisarnos de cualquier incidente en 24–48 horas *(a validar)*.
- **Copias de seguridad:** el plan actual del servidor no las incluye; si se activan, lo diremos aquí y los datos borrados desaparecerán de ellas dentro de su ciclo (p. ej., 30–35 días, a validar).

## 11. Conservación y borrado *(todos los plazos: a validar, P10–P11)*

| Qué | Cuánto se conserva |
|---|---|
| **Datos en tu teléfono** | Hasta que los borres |
| **Datos en la nube** | Mientras tengas la cuenta; se borran al borrarla |
| **Cuenta inactiva** | Aviso por correo a los **12 meses** sin entrar; borrado a los **13–24 meses** si no respondes |
| **Coach sin clientes** | Aviso y cierre a los **12 meses** |
| **Vínculo terminado** | El coach pierde el acceso al instante; debe borrar lo que tenga (máx. 30 días); tus datos siguen en tu cuenta |
| **Intentos de código de invitación** | 1 día |
| **Copias de seguridad (si existen)** | Hasta 30–35 días tras el borrado |
| **Prueba mínima de tus autorizaciones, después de la baja** | **3 a 5 años**, solo de forma **seudonimizada**: identificador irreversible (no tu correo ni nombre), tipo de autorización, versión, huella del texto y fechas de aceptación y de baja. Finalidad: demostrar que pediste permiso y defendernos ante reclamos. *(plazo por validar; el equipo se apoya en caducidad de 3 años de la facultad sancionatoria y 5 de prescripción civil, ambas por verificar)* |
| **Resultados agregados sin nombre** | Pueden conservarse (no te identifican) |

## 12. Registro Nacional de Bases de Datos (RNBD)

Según lo que pudo verificarse (Decreto 090 de 2018), la inscripción obliga a sociedades y entidades sin ánimo de lucro con activos superiores a 100.000 UVT, y a personas jurídicas públicas; **una persona natural no figura**. Hoy el responsable es persona natural y **no se inscribe** *(a validar por escrito; cambia si se constituye una sociedad)*. Eso **no** nos exime de esta política, de la autorización, los reclamos y la seguridad, que cumplimos igual.

## 13. Vigencia, versiones y cambios

Esta política rige desde [FECHA DE VIGENCIA] hasta que publiquemos una nueva. Si cambia de forma sustancial, la app **te pedirá aceptarla de nuevo**. La base de datos estará vigente mientras se preste el servicio y por los plazos de §11.

## Historial de versiones

| Versión | Fecha | Cambio |
|---|---|---|
| 0.2 (borrador) | 2026-10-22 | Primer borrador con cuentas, Supabase, Brevo, coach como responsable independiente, fotos con autorización propia, retención, prueba del consentimiento, incidentes, RNBD. No vigente. |
