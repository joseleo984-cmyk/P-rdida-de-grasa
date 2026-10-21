# Kit del piloto concierge R0 — "Pérdida de Grasa" con coaches

> Autor: Agente Analista de Producto · 2026-10-21 · Para: Stakeholder (quien dirige el piloto)
> Contexto: `vision-plataforma.md` (hipótesis H1, H2, H3, H4, H5, H7) y `decisiones-negocio.md`.
> **Sin servidor:** se usa la app **actual**. El cliente exporta sus datos y se los manda al coach por WhatsApp. El "panel del coach" lo arma a mano el Stakeholder en una hoja de cálculo.

---

## 1. Objetivo y métricas de éxito

**Objetivo:** confirmar, antes de construir el servidor, que (a) los clientes registran en la app cuando su coach se lo pide, (b) al coach le sirve un resumen semanal por cliente y (c) el coach pagaría **USD 5 por cliente activo al mes**.

| Métrica | Cómo se mide | ✅ Éxito | ⚠️ Revisar | ❌ Repensar |
|---|---|---|---|---|
| **M1 Adherencia del cliente** (H2) | Días con algún registro (peso, comida o hábito) por semana, según el CSV | ≥ 60 % de clientes con ≥ 3 días/semana **en la semana 4** | 40–59 % | < 40 % |
| **M2 Envío del exporte** (H2) | Clientes que mandan el CSV a tiempo cada semana | ≥ 80 % de envíos a tiempo en promedio | 60–79 % | < 60 % |
| **M3 Retención en el piloto** | Clientes que siguen enviando en la semana 4 / clientes que empezaron | ≥ 8 de 10 | 6–7 | ≤ 5 |
| **M4 Uso del resumen por el coach** (H3) | El coach abre el resumen y actúa (escribe a ≥ 1 cliente por lo que vio) | Los 2 coaches, ≥ 3 de 4 semanas | 1 coach o 2 semanas | Ninguno lo usa |
| **M5 Tiempo ahorrado** (H1/H3) | Horas por semana de seguimiento según el coach, antes vs. semana 4 | ≥ 1 h/semana menos en al menos 1 coach | Menos de 1 h | Más tiempo que antes |
| **M6 Disposición a pagar** (H4) | Entrevista final + oferta de "precio fundador" | **2 de 2 coaches** dicen que sí a USD 5/cliente activo/mes y al menos 1 se compromete (pago anticipado o carta) | Sí, pero a otro precio | No pagaría |
| **M7 Fotos** (H5) | Clientes que aceptan compartir fotos con su coach | Se registra el % (no hay umbral; orienta el diseño de HU-P09) | — | — |
| **M8 Satisfacción del cliente** | Encuesta final: "¿Seguirías usando la app con tu coach?" (1–5) | Media ≥ 4 | 3–3,9 | < 3 |

**Decisión al cierre:** si M1, M4 y M6 están en ✅, se inicia R1 (servidor). Con 1 o 2 en ⚠️, se ajusta y se repite 2 semanas. Con alguno en ❌, se vuelve a entrevistar antes de construir.

---

## 2. Duración y calendario (5 semanas: 1 de preparación y 4 de piloto)

| Semana | Stakeholder (concierge) | Coach | Cliente |
|---|---|---|---|
| **S0 · Preparación** | Revisión legal del consentimiento (si es posible). Entrevista inicial con cada coach (§4). Crea la hoja de resultados (§9). Envía las invitaciones (§6). | Elige 5 clientes (activos, con iPhone o Android, que ya hagan check-in). Les envía la invitación. | Firma el consentimiento (§8). Instala la app en la pantalla de inicio. Llena perfil y primer registro. |
| **S1 · Arranque** | Lunes: comprueba que los 10 clientes tienen la app instalada y perfil lleno; ayuda por WhatsApp a quien se trabe. Domingo: recibe los CSV y arma el 1.er resumen. | Recuerda en el chat: "pésate 3–4 mañanas esta semana y regístralo". | Registra peso (≥ 3 mañanas), comidas si su plan lo pide, pasos y sueño. Domingo: exporta y envía. |
| **S2 · Rutina** | Domingo/lunes: resumen semanal por coach (§9). Anota el tiempo que le toma armarlo. | Lunes: lee el resumen y escribe a quien esté en amarillo/rojo. Anota en la hoja a quién escribió. | Igual que S1. Medidas (cintura, cuello, cadera) 1 vez por semana. |
| **S3 · Rutina + fotos** | Igual que S2. Pide a los clientes que consintieron fotos el JSON quincenal. | Igual que S2. Revisa fotos de quien las compartió. | Igual + fotos frente/perfil/espalda (si consintió) y exporta JSON. |
| **S4 · Cierre** | Último resumen. Encuesta a clientes (§5). Entrevista final con cada coach (§4) y oferta de precio fundador. Llena la hoja de cierre (§9). | Entrevista final (30 min). | Último exporte + encuesta (3 min). |

**Día fijo de envío:** domingo antes de las 8 p. m. El coach recibe el resumen el lunes antes de las 9 a. m.

---

## 3. Qué hace cada uno con la app ACTUAL

**Enlace de la app:** `https://joseleo984-cmyk.github.io/P-rdida-de-grasa/` (confirmar que GitHub Pages esté activo antes de S0).

### Cliente
1. **Instalar (iPhone):** abrir el enlace en **Safari** → botón Compartir → "Agregar a pantalla de inicio". Usarla siempre desde ese ícono (así iOS no borra los datos tan fácil). En Android: Chrome → menú → "Instalar app".
2. **Perfil** (una vez): sexo, edad, estatura, peso, meta y ritmo → la app da calorías y macros. *Si el coach ya le da un plan de calorías, el cliente sigue el plan del coach; la app sirve para registrar.*
3. **Registro** (≥ 3 mañanas/semana, en ayunas, después de ir al baño): peso. 1 vez por semana: cintura, cuello y cadera.
4. **Comidas y hábitos** (lo que pida el coach): kcal/proteína por comida, pasos, agua, sueño, entrenamiento de fuerza.
5. **Fotos** (solo si consintió, cada 2 semanas): frente, perfil y espalda, con la misma luz y ropa.
6. **Enviar (domingo):** Perfil → Datos → **"Exportar CSV"** → compartir el archivo por WhatsApp **al coach** (o al Stakeholder si el coach lo prefiere). Cada 2 semanas, si consintió fotos: **"Exportar JSON"** (incluye las fotos; pesa más).
7. **Respaldo:** el JSON también es su copia de seguridad. No borrar la app ni los datos de Safari durante el piloto.

> El CSV trae por día: fecha, peso, cintura, cuello, cadera, % de grasa, kcal, proteína, pasos y nota. **No trae sueño, agua ni fuerza, ni fotos**; esos datos van en el JSON.

### Coach
1. Elegir 5 clientes y mandarles la invitación (§6).
2. Recordatorio corto los domingos en el chat: "¡Hoy toca mandar el archivo!".
3. Los lunes: leer el resumen que le llega (hoja con semáforo) y escribir a quien esté en amarillo o rojo.
4. Anotar cada semana, en 1 minuto: horas que dedicó al seguimiento y a quién escribió por el resumen.
5. **No** tiene que instalar nada ni aprender la app (puede probarla si quiere).

### Stakeholder (concierge = "el servidor a mano")
1. Recibe los archivos (directamente de los clientes o reenviados por el coach).
2. Pega el CSV de cada cliente en su pestaña de la hoja y actualiza el **resumen por coach** (§9).
3. Para quien comparte fotos: abre el JSON en la app de un dispositivo de prueba (Perfil → Importar) **solo para ese fin**, toma el comparador antes/después y lo manda al coach. Borra los datos importados después. *(No mezclar datos de clientes en un mismo dispositivo: importar reemplaza los datos.)*
4. Mide cuánto tarda en armar cada resumen: es el coste del trabajo manual que el servidor reemplazará.

---

## 4. Guion de entrevista para coaches

Duración: 30 min, por videollamada o en persona. Graba solo con permiso. Pregunta por **lo que hace hoy**, no por lo que haría. Deja hablar; repregunta con "¿me cuentas la última vez que pasó?".

### Entrevista inicial (S0) — 7 preguntas
1. Cuéntame cómo es una semana normal con tus clientes. ¿Cuántos tienes ahorita y cómo trabajas con ellos (online, presencial, mixto)?
2. ¿Cómo haces hoy el seguimiento de peso, medidas y fotos? ¿Por dónde te llegan (WhatsApp, formulario, Excel…) y dónde lo guardas?
3. ¿Cuánto tiempo a la semana se te va en ese seguimiento, más o menos? ¿Qué es lo más aburrido o lo que más te quita tiempo?
4. ¿Cómo te das cuenta de que un cliente se está desconectando? ¿Me cuentas la última vez que se te fue uno? ¿Qué pasó?
5. ¿Hoy pagas alguna app o herramienta para tu trabajo? ¿Cuál y cuánto?
6. ¿Cuánto les cobras al mes a tus clientes y qué incluye?
7. ¿Tienes grupo de WhatsApp o comunidad con tus clientes? ¿Qué tal funciona? ¿Has hecho retos?

### Entrevista final (S4) — 5 preguntas
8. De 1 a 5, ¿qué tan útil te fue el resumen de los lunes? ¿Qué miraste primero y qué te sobró o te faltó?
9. ¿Le escribiste a algún cliente por algo que viste en el resumen? ¿Qué pasó?
10. Comparado con antes, ¿te tomó más o menos tiempo el seguimiento? ¿Cuánto, más o menos?
11. Si esto fuera una app donde ves a todos tus clientes en un panel y les dejas comentarios, gratis hasta 5 clientes y luego **USD 5 (unos $20.000 COP) por cliente activo al mes**, ¿la usarías con tus clientes? ¿Ese precio te parece barato, justo o caro? *(Si dice caro: ¿cuánto sí pagarías?)*
12. Te ofrecemos un **precio de fundador** si te comprometes desde ya (p. ej. 3 meses con descuento, pagando por adelantado, o un compromiso escrito). ¿Te le mides? ¿Qué tendría que tener sí o sí para que la uses con todos tus clientes?

*La conversión de USD 5 a COP es aproximada; actualízala con la tasa del día.*

---

## 5. Encuesta corta para clientes (S4, 3 minutos, Google Forms)

1. ¿Cuántos días a la semana registraste algo en la app, más o menos? *(0–1 / 2–3 / 4–5 / 6–7)*
2. ¿Qué tan fácil fue registrar? *(1 muy difícil – 5 muy fácil)*
3. ¿Qué tan fácil fue exportar y mandar el archivo? *(1–5)* ¿Qué se te complicó? *(abierta)*
4. ¿Sentiste que tu coach te hacía mejor seguimiento? *(Sí / Igual / No)*
5. ¿Te sentiste cómodo/a compartiendo tus fotos con tu coach por este medio? *(Sí / No / No compartí fotos)*
6. ¿Seguirías usando la app con tu coach? *(1 nada probable – 5 muy probable)*
7. Si pudieras cambiar una sola cosa de la app, ¿cuál sería? *(abierta)*

---

## 6. Mensajes de invitación por WhatsApp

### Para coaches (lo envía el Stakeholder)
> ¡Hola, [Nombre]! ¿Cómo vas? Te escribo porque estoy creando una app para que los coaches puedan ver el progreso de sus clientes (peso, medidas, hábitos y fotos) sin tener que andar persiguiéndolos por WhatsApp 😅.
> Antes de terminarla quiero probarla con 2 coaches que admiro. Serían **4 semanas con 5 de tus clientes**: ellos registran en la app y cada lunes te llega un resumen de quién va bien y a quién escribirle. Para ti es **gratis** y no tienes que instalar nada.
> Solo te pido 2 charlas de 30 min (al inicio y al final) para que me digas con toda la sinceridad qué te sirve y qué no. ¿Te le mides? ¿Cuándo te queda bien hablar esta semana?

### Para clientes (lo envía el coach, con su voz)
> ¡Hola, [Nombre]! 💪 Este mes vamos a probar una app para llevar tu proceso más organizado: ahí registras tu peso, medidas, comidas y hábitos, y yo veo cada semana cómo vas para ajustarte el plan a tiempo.
> Es gratis y te toma 1 minuto al día. Así funciona:
> 1️⃣ Abre este enlace en **Safari**: [enlace] → botón Compartir → "Agregar a pantalla de inicio".
> 2️⃣ Llena tu perfil y pésate 3–4 mañanas a la semana.
> 3️⃣ Los domingos, en Perfil → Datos → "Exportar CSV", y me mandas el archivo por aquí.
> Antes de empezar te paso un documento corto para que autorices el uso de tus datos (son tuyos y puedes salirte cuando quieras). ¿Te animas? 🙌

---

## 7. Recordatorios (plantillas cortas)
- **Domingo (coach → clientes):** "¡Feliz domingo! 📲 Hoy toca exportar el CSV y mandármelo por aquí. ¡Gracias!"
- **Lunes sin archivo (coach → cliente):** "¡Hola! No me llegó tu archivo de la semana, ¿todo bien? Si se te complicó exportarlo, me dices y te ayudo."

---

## 8. Consentimiento informado (plantilla)

> ⚠️ **BORRADOR. REVISAR CON ABOGADO ANTES DE USAR.** Es un texto en lenguaje claro para el piloto y **no es asesoría legal**. La Ley 1581 de 2012 (y el Decreto 1377 de 2013, hoy en el Decreto 1074 de 2015) considera **datos sensibles** los relativos a la **salud** y los **datos biométricos/imágenes** que pueden afectar la intimidad. Para tratarlos se necesita **autorización previa, expresa e informada**, y la persona **no está obligada** a darla. Completa los [corchetes].

**AUTORIZACIÓN PARA EL TRATAMIENTO DE DATOS PERSONALES — Piloto "Pérdida de Grasa"**

Yo, **[nombre completo]**, con documento **[tipo y número]**, autorizo de forma **libre, previa, expresa e informada** a **[nombre del Stakeholder o empresa], identificado con [NIT/CC]**, con correo **[correo]** y teléfono **[teléfono]** (el "Responsable"), y a mi coach **[nombre del coach]** (el "Encargado"), a tratar mis datos personales según lo siguiente:

1. **Qué datos:** nombre, teléfono, edad, sexo, estatura, peso, medidas corporales (cintura, cuello, cadera), % de grasa estimado, comidas y calorías, pasos, sueño, agua, entrenamiento y notas que yo registre. **Opcional:** fotos corporales de progreso.
2. **Son datos sensibles:** la información de salud y las fotos corporales son **datos sensibles**. **No estoy obligado/a a autorizar su tratamiento**, y negarme no afecta mi relación con mi coach.
3. **Para qué:** (a) que mi coach haga seguimiento de mi proceso; (b) evaluar y mejorar la app durante este piloto de 4 semanas; (c) producir resultados **agregados y anónimos** (sin mi nombre). **No** se venderán ni se compartirán con terceros ni se usarán para publicidad.
4. **Cómo y dónde:** mis datos se guardan en mi propio teléfono. Yo decido cuándo exportarlos y enviarlos por WhatsApp a mi coach o al Responsable. Los archivos se guardan en **[lugar, p. ej. Google Drive con acceso restringido]**, solo los ven el Responsable y mi coach y se **eliminan a más tardar [fecha, p. ej. 30 días después del piloto]**.
5. **Fotos (marca una opción):**
   ☐ **SÍ** autorizo compartir mis fotos de progreso con mi coach y con el Responsable, solo para seguimiento. No se publicarán ni se usarán en redes sociales ni en publicidad sin una nueva autorización por escrito.
   ☐ **NO** autorizo compartir mis fotos.
6. **Mis derechos:** conocer, actualizar, rectificar y pedir que se borren mis datos; revocar esta autorización en cualquier momento; pedir prueba de ella; ser informado/a del uso de mis datos; y presentar quejas ante la **Superintendencia de Industria y Comercio (SIC)**. Para ejercerlos escribo a **[correo]** y me responderán en los plazos de ley.
7. **Salirme:** puedo retirarme del piloto cuando quiera con un mensaje a mi coach o a **[correo]**, y mis archivos se borran.
8. **No es consejo médico:** las cifras de la app son estimaciones orientativas. Si tengo una condición de salud, consulto a un profesional.

Política de tratamiento de datos: **[enlace o anexo]**.

Firma: ____________________ Fecha: ___/___/______
*(Válido también como aceptación por escrito por WhatsApp: "Leí y acepto la autorización de datos del piloto [con fotos / sin fotos]". Guardar captura. Confirmar con el abogado que esta forma sirve como prueba.)*

---

## 9. Cómo registrar los resultados

Una **hoja de cálculo (Google Sheets)** con acceso solo para el Stakeholder (y para cada coach, solo su pestaña de resumen).

| Pestaña | Contenido |
|---|---|
| **Clientes** | ID anónimo (C01–C10), coach (A/B), fecha de inicio, consentimiento (sí/no, con o sin fotos), dispositivo (iPhone/Android), estado (activo/retirado + motivo). **Sin nombres en las demás pestañas.** |
| **Datos_C01 … C10** | El CSV pegado tal cual cada semana (se añaden filas nuevas). |
| **Semanal** | Una fila por cliente y semana: `semana`, `cliente`, `envió a tiempo (S/N)`, `días con registro (0–7)`, `pesajes`, `media de peso 7 d`, `cambio vs. semana anterior (kg)`, `cintura (cm)`, `kcal media`, `proteína media`, `pasos medios`, `semáforo`. |
| **Resumen_Coach_A / B** | Lo que ve el coach el lunes: una fila por cliente con el semáforo, ordenada con los rojos primero, y 1 línea de comentario. |
| **Coach_log** | Por coach y semana: horas de seguimiento, ¿abrió el resumen? (S/N), ¿a quién escribió por el resumen?, comentarios. |
| **Concierge_log** | Minutos que tomó armar cada resumen semanal y problemas (archivos que no llegan, exportes fallidos en iPhone, etc.). |
| **Entrevistas** | Respuestas resumidas a las preguntas 1–12 por coach + citas textuales relevantes. |
| **Encuesta** | Respuestas de la encuesta de clientes (§5). |
| **Cierre** | Tabla M1–M8 con valor obtenido, umbral y resultado ✅/⚠️/❌ + decisión (iniciar R1 / ajustar / repensar). |

**Regla del semáforo** (la misma que tendrá HU-P05):
- 🟢 **Verde:** ≥ 4 días con registro en la semana y la media de peso va hacia la meta (o la cintura baja).
- 🟡 **Amarillo:** 2–3 días con registro, **o** peso estancado (± 0,2 kg) durante ≥ 2 semanas.
- 🔴 **Rojo:** 0–1 días con registro **o** no envió el archivo.

**Al cierre:** el Stakeholder comparte la pestaña *Cierre* con el equipo (Analista y Scrum Master) y actualizamos el estado de H1–H5 y H7 en `vision-plataforma.md`. Los datos personales se borran en la fecha indicada en el consentimiento.
