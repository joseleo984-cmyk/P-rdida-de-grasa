# Kit del piloto concierge R0 — "Pérdida de Grasa" con coaches

> Autor: Agente Analista de Producto · 2026-10-21 · Para: Stakeholder (quien dirige el piloto)
> Contexto: `vision-plataforma.md` (hipótesis H1, H2, H3, H4, H5, H7) y `decisiones-negocio.md`.
> **Sin servidor:** se usa la app **actual**. El cliente exporta sus datos y se los manda al coach por WhatsApp. El "panel del coach" lo arma a mano el Stakeholder en una hoja de cálculo.
> Actualizado 2026-10-21: el piloto usa la app con la **pantalla de aceptación (LEGAL-01)**, los textos legales revisados por un abogado y el kit de S2-3 (**CSV completo** + **"Ver copia de un cliente"**).

---

## ✅ Antes de empezar el piloto (checklist)

No arrancar S0 con clientes hasta tener todo marcado.

- [ ] **Abogado:** revisó `legal/terminos-y-condiciones.md`, `legal/politica-tratamiento-datos.md` y la autorización del §8, y respondió las dudas críticas de `legal/preguntas-abogado.md` (sobre todo P1 del art. 6 y P2 del rol del coach).
- [ ] **Campos completos:** no queda ningún `[CAMPO]` (nombre, cédula, correo, ciudad, teléfono, fechas, plazos) en los textos ni en el §8, y se quitaron las notas internas ("NOTA…").
- [ ] **Versión de los textos** fijada (p. ej. T&C 1.0 y Política 1.0) y la misma en la app (`LEGAL_VERSIONS`).
- [ ] **GitHub Pages activo** con la versión del **Sprint 2**, publicada desde `main` por el Stakeholder. Abrir el enlace en un iPhone y comprobar que carga la versión nueva (si no, cerrar y reabrir la app).
- [ ] **LEGAL-01 publicada:** al primer uso aparece la pantalla de aceptación con casillas separadas y enlaces a los textos, y en Perfil → Privacidad se ven y se pueden retirar las autorizaciones.
- [ ] **S2-3 publicada:** "Exportar CSV" trae todos los datos del día y "Ver copia de un cliente" abre el archivo de un cliente **sin reemplazar** los datos propios.
- [ ] **Dispositivo del coach:** cada coach tiene un teléfono o computador con navegador actualizado (Safari o Chrome) donde probó "Ver copia de un cliente" con un archivo de ejemplo. Si un coach no puede, el Stakeholder hace esa parte (concierge).
- [ ] **Hoja de resultados** creada (§9) con acceso solo para el Stakeholder y los coaches en su pestaña.
- [ ] **Acuerdo con cada coach** (rol de encargado, a validar con el abogado): uso de los datos solo para el seguimiento, confidencialidad, no reenviar archivos ni fotos y borrarlos cuando el cliente deje el servicio (máx. 30 días después).
- [ ] Prueba de punta a punta con 1 cliente de prueba: aceptar → registrar → exportar → enviar por WhatsApp → el coach lo ve → aparece en la hoja.

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
| **S0 · Preparación** | Checklist "Antes de empezar" completa. Entrevista inicial con cada coach (§4). Crea la hoja de resultados (§9). Envía las invitaciones (§6). | Elige 5 clientes (activos, con iPhone o Android, que ya hagan check-in). Les envía la invitación. | Instala la app en la pantalla de inicio. Al abrirla **acepta los T&C y la Política en la pantalla de LEGAL-01** (y, si quiere, autoriza fotos). Confirma por WhatsApp la autorización del piloto (§8). Llena perfil y primer registro. |
| **S1 · Arranque** | Lunes: comprueba que los 10 clientes tienen la app instalada y perfil lleno; ayuda por WhatsApp a quien se trabe. Domingo: recibe los CSV y arma el 1.er resumen. | Recuerda en el chat: "pésate 3–4 mañanas esta semana y regístralo". | Registra peso (≥ 3 mañanas), comidas si su plan lo pide, pasos y sueño. Domingo: exporta y envía. |
| **S2 · Rutina** | Domingo/lunes: resumen semanal por coach (§9). Anota el tiempo que le toma armarlo. | Lunes: lee el resumen y escribe a quien esté en amarillo/rojo. Anota en la hoja a quién escribió. | Igual que S1. Medidas (cintura, cuello, cadera) 1 vez por semana. |
| **S3 · Rutina + fotos** | Igual que S2. Pide a los clientes que consintieron fotos el JSON quincenal. | Igual que S2. Revisa fotos de quien las compartió. | Igual + fotos frente/perfil/espalda (si consintió) y exporta JSON. |
| **S4 · Cierre** | Último resumen. Encuesta a clientes (§5). Entrevista final con cada coach (§4) y oferta de precio fundador. Llena la hoja de cierre (§9). | Entrevista final (30 min). | Último exporte + encuesta (3 min). |

**Día fijo de envío:** domingo antes de las 8 p. m. El coach recibe el resumen el lunes antes de las 9 a. m.

---

## 3. Qué hace cada uno con la app ACTUAL

**Enlace de la app:** `https://joseleo984-cmyk.github.io/P-rdida-de-grasa/` (confirmar que GitHub Pages esté activo antes de S0).

### Cliente
0. **Aceptar (primer uso):** la app muestra la pantalla de aceptación: Términos, Política de Datos, autorización de datos sensibles, fotos (opcional y aparte) y mayoría de edad. Puede leer los textos desde los enlaces. Lo aceptado queda guardado con fecha y versión en su teléfono y viaja en sus exportes. Puede retirar autorizaciones en Perfil → Privacidad.
1. **Instalar (iPhone):** abrir el enlace en **Safari** → botón Compartir → "Agregar a pantalla de inicio". Usarla siempre desde ese ícono (así iOS no borra los datos tan fácil). En Android: Chrome → menú → "Instalar app".
2. **Perfil** (una vez): sexo, edad, estatura, peso, meta y ritmo → la app da calorías y macros. *Si el coach ya le da un plan de calorías, el cliente sigue el plan del coach; la app sirve para registrar.*
3. **Registro** (≥ 3 mañanas/semana, en ayunas, después de ir al baño): peso. 1 vez por semana: cintura, cuello y cadera.
4. **Comidas y hábitos** (lo que pida el coach): kcal/proteína por comida, pasos, agua, sueño, entrenamiento de fuerza.
5. **Fotos** (solo si consintió, cada 2 semanas): frente, perfil y espalda, con la misma luz y ropa.
6. **Enviar (domingo):** Perfil → Datos → **"Exportar CSV"** → compartir el archivo por WhatsApp **al coach** (o al Stakeholder si el coach lo prefiere). Cada 2 semanas, si consintió fotos: **"Exportar JSON"** (incluye las fotos; pesa más).
7. **Respaldo:** el JSON también es su copia de seguridad. No borrar la app ni los datos de Safari durante el piloto.

> El CSV trae por día: fecha, peso, cintura, cuello, cadera, % de grasa, kcal, proteína, carbohidratos, grasas, n.º de alimentos, pasos, agua, sueño, entrenó fuerza (Sí/No) y nota *(desde S2-3)*. Lo único que no trae son las **fotos**, que van en el JSON. Se abre directamente en Excel en español; en Google Sheets se usa Archivo → Importar.
> Si un cliente aún tiene la app vieja en caché, el CSV llega con el formato anterior (separado por comas y sin hábitos): basta con que cierre y vuelva a abrir la app con conexión.
> **Las fotos solo van en el JSON**, y solo si el cliente autorizó fotos.

### Coach
1. Elegir 5 clientes y mandarles la invitación (§6).
2. Recordatorio corto los domingos en el chat: "¡Hoy toca mandar el archivo!".
3. Los lunes: leer el resumen que le llega (hoja con semáforo) y escribir a quien esté en amarillo o rojo.
3b. Si quiere ver el detalle o las fotos de un cliente: en su app, **"Ver copia de un cliente"** → elegir el archivo que le llegó por WhatsApp. Lo ve en modo lectura y **no reemplaza** sus datos. Al terminar, cerrar la copia.
4. Anotar cada semana, en 1 minuto: horas que dedicó al seguimiento y a quién escribió por el resumen.
5. **No** tiene que instalar nada ni aprender la app (puede probarla si quiere).

### Stakeholder (concierge = "el servidor a mano")
1. Recibe los archivos (directamente de los clientes o reenviados por el coach).
2. Pega el CSV de cada cliente en su pestaña de la hoja y actualiza el **resumen por coach** (§9).
3. Para quien comparte fotos o manda el JSON: usa **"Ver copia de un cliente"** (abajo). Ya **no** hace falta "Importar JSON" ni un dispositivo de prueba: importar **reemplaza** los datos del dispositivo, y no se debe usar con copias de clientes.
3b. Comprobar en cada archivo que el cliente aceptó la versión vigente de los textos (va dentro del JSON). Si no, pedirle que abra la app y acepte.
3c. Si un coach no puede usar "Ver copia de un cliente", el Stakeholder abre el archivo con esa función y le pasa el resumen o el comparador antes/después de las fotos **solo de quien autorizó fotos**. **Nunca usar "Importar"** con archivos de clientes (reemplaza los datos del dispositivo).
4. Mide cuánto tarda en armar cada resumen: es el coste del trabajo manual que el servidor reemplazará.

### Ver la copia de un cliente en la app (coach o Stakeholder, desde S2-3)
1. Guardar el JSON que mandó el cliente (WhatsApp → descargar o "Guardar en Archivos").
2. En la app: **Perfil → Datos → "Abrir copia de cliente"** y elegir el archivo.
3. Se abre una ventana de **solo lectura** con: nombre, rango de fechas, peso inicial, actual y tendencia de 7 días,
   ritmo semanal (kg y % por semana), % de grasa, **adherencia de las últimas 1, 2 y 4 semanas** (días con algún
   registro, con comidas, con hábitos, pesajes y proteína media frente al objetivo), las últimas 5 notas y las fotos.
   Las semanas se cuentan hasta el **día en que el cliente exportó** (si el archivo lo indica) o hasta hoy.
4. **"Abrir otra"** pasa al siguiente cliente, y **"Cerrar"** vuelve a los datos propios. No se guarda nada: los datos
   del dispositivo (incluidas las fotos) quedan intactos, y al cerrar se liberan las fotos de la memoria.
5. Privacidad: el archivo del cliente sigue en la carpeta de descargas o en WhatsApp. Hay que borrarlo según lo
   indicado en el consentimiento (§8).

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
> Al abrirla por primera vez te pide aceptar los Términos y la Política de Datos (las fotos son opcionales). Tus datos se quedan en tu celular y solo me llegan cuando tú me mandas el archivo. Te paso también un mensajito con los detalles del piloto. Son tuyos y puedes salirte cuando quieras. ¿Te animas? 🙌

---

## 7. Recordatorios (plantillas cortas)
- **Domingo (coach → clientes):** "¡Feliz domingo! 📲 Hoy toca exportar el CSV y mandármelo por aquí. ¡Gracias!"
- **Lunes sin archivo (coach → cliente):** "¡Hola! No me llegó tu archivo de la semana, ¿todo bien? Si se te complicó exportarlo, me dices y te ayudo."

---

## 8. Consentimiento del piloto (complemento a LEGAL-01)

> ⚠️ **BORRADOR. REVISAR CON ABOGADO ANTES DE USAR.** No es asesoría legal.
> **Cómo encaja:** la autorización formal se da **en la app**, en la pantalla de LEGAL-01, con los **Términos y Condiciones** (`legal/terminos-y-condiciones.md`) y la **Política de Tratamiento de Datos** (`legal/politica-tratamiento-datos.md`) ya revisados por el abogado. Este texto **no la reemplaza**: explica en lenguaje claro lo específico del piloto (datos en el teléfono, envío por WhatsApp, rol del coach). Se envía por WhatsApp antes de empezar y el cliente lo confirma por escrito. Completa los [CAMPOS] igual que en la Política.

**Piloto "Pérdida de Grasa" — Lo que debes saber antes de empezar**

Hola, [nombre]. Gracias por participar en el piloto de 4 semanas con tu coach [nombre del coach]. Al abrir la app te pediremos aceptar los **Términos y Condiciones** y la **Política de Tratamiento de Datos** de [NOMBRE DEL RESPONSABLE], persona natural, cédula [NÚMERO], [CIUDAD], correo [CORREO]. Aquí te resumimos cómo funciona en el piloto:

1. **Tus datos viven en tu teléfono.** Lo que registras (peso, medidas, comidas, hábitos, fotos) se guarda **solo en tu dispositivo**. En el piloto no hay servidor ni nube.
2. **Tú decides cuándo enviarlos.** Cada domingo exportas un archivo desde la app y **tú mismo/a** se lo mandas por WhatsApp a tu coach [y/o a [NOMBRE DEL RESPONSABLE]]. Si no lo envías, nadie más ve tus datos.
3. **Son datos sensibles.** Tu peso, medidas, comidas, hábitos y fotos son datos de salud. **Autorizarlos es voluntario**, y negarte no afecta tu relación con tu coach. En la app hay una casilla aparte para los datos de salud y otra, **también aparte y opcional, para las fotos**.
4. **Fotos:** solo se envían si las autorizaste en la app y exportas el archivo completo (JSON). Las verán tu coach y, si hace falta para armar tu resumen, [NOMBRE DEL RESPONSABLE]. No se publicarán ni se usarán en redes ni en publicidad.
5. **El papel de tu coach:** tu coach usa tus archivos **solo para hacerte seguimiento**, por cuenta del responsable (como **encargado** del tratamiento; *rol a validar con el abogado*). Se comprometió a no reenviarlos, a no publicarlos y a borrarlos al final del piloto.
6. **WhatsApp:** los archivos pasan por WhatsApp, un servicio de un tercero (Meta) con sus propias condiciones. Si prefieres otro medio (p. ej. correo), dínoslo.
7. **Para qué:** tu seguimiento y saber si la app sirve. Los resultados del piloto se usarán solo **agregados y sin tu nombre**.
8. **Cuánto tiempo:** tu coach y José Granados guardan los archivos recibidos mientras sigas en seguimiento y los borran **a más tardar 30 días después de que dejes el servicio**, o antes si lo pides. Lo que está en tu teléfono es tuyo: puedes borrarlo cuando quieras (Perfil → Datos → Borrar todo).
9. **Tus derechos:** conocer, corregir y pedir el borrado de tus datos, retirar tu autorización (también en la app, Perfil → Privacidad) y quejarte ante la **Superintendencia de Industria y Comercio**. Escríbenos a [CORREO]; los plazos de respuesta están en la Política.
10. **No es consejo médico:** las cifras son estimaciones. Si tienes una condición de salud, consulta a un profesional.

**Para confirmar, responde por WhatsApp:**
> "Leí y acepto las condiciones del piloto. En la app acepté los Términos y la Política [y autoricé / no autoricé] mis fotos."

*(Guardar la captura en la pestaña Clientes de la hoja. Validar con el abogado que esta confirmación más la aceptación en la app son prueba suficiente.)*

---

## 9. Cómo registrar los resultados

Una **hoja de cálculo (Google Sheets)** con acceso solo para el Stakeholder (y para cada coach, solo su pestaña de resumen).

| Pestaña | Contenido |
|---|---|
| **Clientes** | ID anónimo (C01–C10), coach (A/B), fecha de inicio, versión de T&C/Política aceptada en la app, autorización de datos sensibles (S/N), fotos (S/N), confirmación del piloto por WhatsApp (fecha + captura), dispositivo (iPhone/Android), estado (activo/retirado + motivo). **Sin nombres en las demás pestañas.** |
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
