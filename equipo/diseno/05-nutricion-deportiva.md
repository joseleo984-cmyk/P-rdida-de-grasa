# 05 · Nutrición deportiva: revisión de «Mis comidas», ficha del coach y catálogo de 115 platos

> **Aviso de honestidad.** Esta es una perspectiva experta **simulada por IA**. No soy un nutricionista habilitado. Todo umbral, rango y valor de este informe es **orientativo** y lo debe validar un nutricionista dietista con tarjeta profesional en Colombia antes de usarlo en el producto. Los valores del catálogo son estimaciones de porciones caseras típicas, hechas con conocimiento general: **hay que contrastarlos con la TCAC/ICBF** u otra fuente oficial. No cito estudios concretos. Cuando hablo de «práctica deportiva común» me refiero a rangos que circulan mucho en el ámbito deportivo, pero **a validar**.
>
> **Límite legal que respeto:** «La plataforma no ofrece asesoría nutricional, prescripción dietética ni diagnóstico clínico. Las cifras del catálogo son aproximaciones referenciales». Todo lo que propongo **registra, resume o avisa al coach**. Nada calcula metas ni le dice a nadie cuánto comer.

Qué revisé: `platos.js` (los 115 platos completos), las capturas 12/13, 20/21, 22, 23 y 27, el código de `coach-panel.js` y `app.js`, y los informes 03 (neurociencia/PNL) y 04 (gamificación).

---

## 1. Veredicto (5 líneas)

1. Registrar desde un catálogo colombiano con porciones caseras es la decisión correcta. Baja la fricción y da al coach una foto **cualitativa** útil: qué come, a qué hora y cuántas veces al día.
2. Hoy el producto **solo enseña kcal** (en grande en Inicio y en Mis comidas, y por día en la ficha). Eso es lo menos fiable del registro y lo que más empuja a la obsesión. La **proteína**, que es lo más accionable para conservar o ganar músculo, no se ve, aunque el catálogo ya la tiene.
3. El coach no puede distinguir «comió poco» de «registró poco». Sin esa señal, los totales bajos engañan y una alerta de kcal daría falsos positivos.
4. Los macros del catálogo son coherentes por dentro (4/4/9/7 cuadra en los 115). Los errores están en las **porciones ambiguas** y en algunos platos subestimados, sobre todo comida callejera, costeña y alcohol (ver anexo).
5. Con 5 cambios (proteína visible, «¿registraste todo hoy?», resumen semanal, kcal con menos protagonismo y alertas privadas al coach), sirve para asesorar sin cruzar a la prescripción.

---

## 2. Qué medir de la alimentación

| Dato | Pérdida de grasa | Ganancia muscular | Nivel | Quién lo pone |
|---|---|---|---|---|
| **Comidas registradas por día** (y si el día está completo) | Imprescindible | Imprescindible | Imprescindible: sin esto, ninguna cifra se puede interpretar | Asesorado: 1 toque al cerrar el día |
| **Proteína total del día** | Imprescindible | Imprescindible | Imprescindible | La app la calcula del catálogo |
| **Proteína por comida** (¿hubo fuente proteica?) | Muy útil | Muy útil | Útil: mejor como «sí/no» que como gramos | La app la calcula |
| **Kcal totales del día** | Útil como **promedio semanal** y tendencia, nunca como cifra diaria «buena/mala» | Útil: confirma que come lo suficiente | Útil, con poca precisión (±20–30 % es realista en registros caseros, a validar) | La app la calcula |
| **Número de comidas y horario** | Útil (detecta saltos de comida y ayunos largos) | Útil (repartir proteína) | Útil | La hora es opcional |
| **Alcohol** (tragos por semana) | Muy útil: aporta energía y empeora el sueño y la adherencia | Útil | Útil | La app lo calcula de las bebidas |
| **Hidratación** | Ya está en Hábitos (vasos) | Igual | Útil, sin duplicarla | Hábitos |
| **Verduras/fibra** | Muy útil para la saciedad | Útil | Útil como **conteo de porciones de verdura/fruta** («¿comiste verdura hoy?»), no como gramos de fibra | Asesorado (1 toque) o lo infiere el catálogo |
| **Ultraprocesados / fritos / azúcar líquida** | Útil como **patrón semanal** («3 días con gaseosa») | Menor | Útil para el coach, **nunca como etiqueta moral** para el asesorado | Lo infiere la categoría del catálogo |
| Carbohidratos y grasa en gramos | Ruido para la mayoría | Ruido salvo atletas avanzados | Ruido: guardarlos, no mostrarlos por defecto | La app |
| Micronutrientes, IG, sodio | Ruido (y se acerca a lo clínico) | Ruido | Fuera de alcance | — |
| Peso de cada alimento en gramos | Ruido para el asesorado típico (fricción alta) | Ídem | Opcional | — |

**Meta de esfuerzo: ≤30 s por comida.** Hoy son unos 4 toques: buscar, plato, porción y tipo. Propongo:
- **Recientes y frecuentes primero.** Ya existe `recents`; falta usarlo como pantalla por defecto.
- **«Mis platos guardados»:** combinaciones que se repiten, por ejemplo «mi desayuno: 2 huevos pericos + arepa + tinto», en 1 toque.
- **«Repetir la de ayer»:** ya existe. Muy bien.
- **El tipo de comida se deduce de la hora.** El usuario solo lo corrige si hace falta.
- **Cierre del día en 1 toque:** «¿Registraste todo lo de hoy? Sí / Casi todo / No». Es **el dato más valioso que falta**, porque convierte las kcal en algo interpretable.
- **Porción con apoyo visual** (puño, palma o mano ahuecada) además de ½/1/1,5/2.

---

## 3. Qué ve el coach en la ficha

**Hoy** (captura 13 y `coach-panel.js:398-416`) ve 7 días con el total de kcal y la lista de platos. No ve proteína, ni promedio, ni días completos, ni relación con el peso o las medidas.

**Resumen semanal propuesto** (arriba de la lista diaria):

1. **Días con registro: 5/7 · completos: 3/7.** Va primero, porque dice cuánto confiar en lo que sigue.
2. **Proteína promedio de los días completos: 92 g/día**, frente a la meta que puso el coach (si la puso). Una barra sin colores rojos.
3. **Comidas con fuente proteica: 11 de 15.**
4. **Kcal promedio de los días completos: ~1.650 aprox.** Se muestra como rango o con «aprox.» y **nunca** compara contra una meta que haya calculado la app.
5. **Tendencia junto al cuerpo:** una línea con «peso: −0,4 kg/sem · cintura/abdomen: −0,8 cm/sem · kcal promedio ~1.650». Así el coach ve juntos la entrada y el resultado. En ganancia muscular: «peso: +0,2 kg/sem».
6. **Patrones** (texto neutro): «Desayuno ausente 4 de 7 días», «Alcohol: 9 tragos esta semana», «Bebidas azucaradas: 5 días».
7. La lista día a día queda **plegada** debajo.

**Qué NO mostrar, o mostrar con cuidado:**
- Ningún semáforo rojo/verde de kcal diarias. Tampoco «se pasó» ni «cumplió».
- Ningún objetivo de kcal calculado por la app. **Hallazgo:** en el código heredado aún existen `Calc.plan` → «Objetivo diario X kcal · Y g de proteína» (`coach-panel.js:436`) y consejos que prescriben («reduce ~150 kcal/día», «sube ~100–150 kcal», `app.js:977-985`). En las capturas del producto coach no aparecen, pero **hay que verificar que sigan apagados** en este producto, porque chocan con el texto legal aprobado.
- Ningún ranking ni comparación entre asesorados por kcal o peso.
- Ningún macro en gramos por defecto (C/G). Pueden quedar en un «ver detalle».

**Alertas privadas al coach.** Nunca las ve el asesorado ni otros asesorados. Siempre con texto de acción («Escríbele sin juicio…») y un enlace «Cuándo derivar a un profesional de la salud». **Ninguna alerta diagnostica.** Todos los umbrales están **a validar por un profesional**:

| Señal | Umbral sugerido (a validar) | Comentario |
|---|---|---|
| **Ingesta registrada muy baja y sostenida** | Kcal **< ~1.000** en **días marcados como completos**, **3 o más días de 7**. Aviso más fuerte si un día completo queda **< ~800** | **Corrijo el 04:** su «< 1.000–1.200 kcal durante ≥3 días seguidos» sin condición de día completo daría muchos falsos positivos, porque la gente registra a medias. Con el filtro «completo», el umbral bajo (~1.000) es más prudente que 1.200. 1.200 sirve como «nota» informativa en adultos grandes o muy activos, no como alerta. Si un nutricionista valida umbrales distintos por sexo o tamaño corporal, la app solo aplicaría el que configure el coach |
| **Bajada de peso rápida** | > ~1 % del peso por semana durante 2–3 semanas (coincide con el 04) | En semanas 1–2 es normal que baje más por agua y glucógeno: no avisar antes de la semana 3 |
| **Saltos de comida / ayunos largos** | ≤1 comida registrada en **días completos**, 3 o más días por semana. O > ~16–18 h entre la última y la primera comida registrada, de forma repetida | Solo con «día completo». El ayuno intermitente puede ser una estrategia acordada con el coach, así que debe poder **silenciarse por asesorado** |
| **Alcohol alto** | Una ocasión con ≥4–5 tragos estándar, o más de ~10–14 tragos por semana | Son referencias de salud pública frecuentes, **a validar** con la norma colombiana vigente |
| **Posible conducta de riesgo** | Combinación de señales: muy baja ingesta + medidas/peso registrados ≥4 veces por semana (sobre-registro, como en el 04) + entrenó 7/7, o borrar y editar comidas repetidamente el mismo día, o textos libres con palabras de riesgo («purgar», «vomitar», «no comer», «laxante») | El aviso dice: «Hay señales que conviene conversar con calma y, si se confirman, derivar a un profesional de salud». **Nunca** dice «posible TCA» |
| **Ganancia muscular sin comer** | Objetivo de ganancia + peso bajando 2 o más semanas + kcal promedio baja | Nota informativa, no alerta |

---

## 4. Proteína

- **La meta la pone el COACH, no la app.** Un campo opcional en la ficha: «Meta orientativa de proteína (g/día)». Al lado, una ayuda de solo lectura: «Referencia de práctica deportiva común: aprox. **1,6–2,2 g por kg** de peso al día; en personas con mucho exceso de peso se suele usar el peso objetivo o la talla, no el peso actual. *A validar con un nutricionista.*» La app puede **ayudar a hacer la cuenta** (peso × factor que escoge el coach), pero **el número lo guarda el coach**.
- **Por comida:** muchos coaches buscan una fuente proteica en cada comida principal (del orden de 20–40 g, a validar). Para el asesorado es mejor un **ícono «tuvo proteína»** por comida (por ejemplo, ≥15–20 g en el plato) que gramos exactos.
- **Cómo mostrarla al asesorado sin presión:**
  - En Mis comidas, **debajo** del total: «Proteína de hoy: ~78 g». Si hay meta del coach: «Tu coach te propuso ~110 g». Barra neutra que se llena, **sin rojo** y sin «te faltan 32 g».
  - Una sugerencia **genérica e informativa**, no prescriptiva: «Opciones con más proteína del catálogo: huevos, pollo, carne, pescado, atún, queso, lentejas, fríjoles, yogur griego». Es una lista, no un plan.
  - En Inicio, la proteína (no las kcal) es la línea principal de «Mis comidas de hoy». Coincido con el 04 en bajar el tamaño de «238 kcal».
- **Para el coach:** proteína promedio semanal y «comidas con proteína X/Y».

---

## 5. Catálogo: revisión crítica

**Lo bueno:** 115 platos reconocibles, con muchas porciones caseras («1 plato», «1 arepa mediana», «1 tazón»), alias útiles (perico, guineo, pandebono), el alcohol separado en gramos y macros consistentes. Ya incluye varios básicos costeños: arepa de huevo, butifarra, bollo limpio, patacón, arroz con coco, mote de queso, mojarra frita, carimañola, queso costeño y enyucado.

**Problemas de estructura:**
1. **Porciones ambiguas.** «1 porción» (yuca frita, arroz con leche, flan, natilla), «1 plato» sin referencia y «1 arepa mediana», cuando una arepa paisa delgada y una boyacense o costeña pueden diferir 2–3 veces en energía. Propongo agregar siempre un **equivalente visual o en gramos aproximados** («1 plato llano ≈ 1½ tazas de arroz + 1 presa»).
2. **Categorías que mezclan dos ideas.** Momento (desayuno/almuerzo/cena) y tipo (fritos/frutas) se cruzan. Por ejemplo, *mojarra frita* está en «Fritos» con comida por defecto «Snack», y *yogur con granola* está en «Cenas ligeras». Sugiero que las categorías sean **por tipo de alimento** (Arepas y panes, Huevos, Carnes/pollo/pescado, Granos, Arroces, Sopas, Platos completos, Acompañantes, Fritos, Frutas, Lácteos, Bebidas, Alcohol, Dulces) y que el momento salga de la hora.
3. **«Plato armado» vs «ingredientes».** Hacen falta los dos. Los **platos armados** son rápidos (bandeja, corrientazo, arroz con pollo). Los **componentes** son más exactos para quien come «arroz + pechuga + ensalada». Hay solapamientos que confunden: «pescado frito con patacón y arroz con coco» (805) suma **menos** que sus partes (mojarra 390 + patacón 280 + arroz con coco 235 = 905).
4. **«Mi plato» guardado.** Es la mejora de mayor impacto para la adherencia (ver §2).
5. **Faltan modificadores frecuentes:** aceite o aderezo de la ensalada, azúcar del café o del jugo, mantequilla de la arepa, salsas (rosada, BBQ, piña) de la comida rápida. En Colombia son calorías «invisibles» importantes.
6. **Comida callejera y de corrientazo subrepresentada:** falta el almuerzo ejecutivo (sopa + seco + jugo), el arroz chino, el pollo apanado/broaster y el «patacón con todo».
7. **Faltan fuentes de proteína simples** que un coach recomienda mucho: atún en lata, queso campesino, yogur griego, kumis y pollo desmechado como componente.
8. **Sobra poco.** «Gaseosa» y «Gaseosa en lata» se pueden unir con la porción. «Jugo de naranja» y «Jugo de fruta en agua» también, si se agrega «sin azúcar / con azúcar».
9. **Alias que conviene agregar:** «huevo de arepa / arepa e' huevo», «patacón pisao», «bistec», «guandolo» (agua de panela), «colada» (avena), «mecato» (snacks), «corrientazo», «ejecutivo», «pola» (cerveza), «guaro» (aguardiente), «chocolo», «bastimento» (yuca/ñame/plátano), «tinto», «pericos», «salchipapas», «pinchos».

---

## 6. Riesgos y qué evitar

- **Obsesión por las calorías.** El número grande de kcal en Inicio y Mis comidas premia «menos es mejor». Mejor mostrar kcal en tamaño normal, con «aprox.» y redondeadas (a 10 o a 50), y dejar como principal «comidas registradas» y «proteína».
- **Culpa.** No usar «te pasaste», «excediste», «comida chatarra», «pecado», «trampa» ni rojo para comidas. Los fritos y dulces se registran igual que cualquier plato. Coincido con el 04: se premia **registrar**, nunca un total bajo.
- **Comparación.** Nunca kcal, peso o comidas en ligas ni en contenido compartido.
- **TCA.** La app no debe pedir ni mostrar déficit calórico, «calorías restantes» ni contador regresivo. Debe permitir **pausar el registro de comidas** con acuerdo del coach. Hoy es obligatorio compartirlo, y eso está bien, pero tiene que existir una salida cuando el registro hace daño. Un texto fijo en Mis comidas, discreto: «Si registrar tus comidas te genera ansiedad o culpa, háblalo con tu coach o con un profesional de la salud».
- **Cuándo sugerir un profesional** (texto estándar, sin diagnóstico): enfermedades como diabetes, enfermedad renal o cardiovascular, embarazo o lactancia, menores de 18 años, antecedentes de trastorno alimentario, uso de medicamentos que afectan apetito o peso, y cualquier alerta de §3. Lo ideal es pedirlo en el **onboarding**: «¿Tienes alguna condición de salud que requiera seguimiento médico o nutricional? Sí / No / Prefiero no decir». Si responde «sí», la app recomienda acompañamiento profesional, **sin guardar el detalle**.
- **Medicamentos para bajar de peso (p. ej., agonistas GLP-1).** La app **no pide ni guarda** esa información. Lo que el coach debe saber en general, sin consejo clínico:
  - Estos fármacos suelen reducir mucho el apetito. Ingestas registradas muy bajas pueden ser frecuentes y **las alertas de §3 aparecerán**. El coach no debe celebrarlas ni «ajustarlas», sino recordar que el seguimiento es del médico tratante.
  - Con ingesta muy baja aumenta la preocupación por **perder masa muscular**. Por eso el énfasis que el coach sí puede dar (entrenamiento de fuerza, revisar que la proteína registrada no sea mínima) y la conversación «¿esto lo sabe tu médico?» son lo pertinente.
  - Síntomas digestivos, mareo, desmayos o deshidratación son motivo para remitir al médico, no para cambiar la rutina por cuenta del coach.
  - **A validar por un profesional médico/nutricional.**

---

## 7. 12 mejoras priorizadas (impacto × esfuerzo)

| # | Mejora | Impacto | Esfuerzo |
|---|---|---|---|
| 1 | **Proteína visible** (asesorado: total del día; coach: promedio semanal y «comidas con proteína»). Los datos ya existen | Alto | S |
| 2 | **Cierre del día «¿Registraste todo?»** (Sí / Casi / No) y «días completos» en la ficha | Alto | S |
| 3 | **Bajar el protagonismo de las kcal** en Inicio y Mis comidas: tamaño normal y redondeo | Alto | S |
| 4 | **Resumen semanal en la ficha** (días, completos, proteína y kcal promedio, tendencia junto a peso/cintura) | Alto | M |
| 5 | **Alertas privadas al coach** con umbrales de §3 (a validar), texto de acción y enlace a derivación | Alto | M |
| 6 | **Corregir platos del anexo** (los ~25 marcados) tras validación con la TCAC/ICBF | Medio-alto | S |
| 7 | **«Mis platos guardados»** y recientes como vista por defecto | Alto | M |
| 8 | **Agregar ~25 platos** (costa Caribe, corrientazo, proteínas simples, alcohol) | Medio | S |
| 9 | **Modificadores** (aceite/aderezo, azúcar, mantequilla, salsas) como «+ extra» en 1 toque | Medio | M |
| 10 | **Meta de proteína opcional que pone el coach** (con ayuda de cálculo y aviso «a validar») | Medio | S |
| 11 | **Verificar que el código prescriptivo heredado** (`Calc.plan`, «Objetivo diario», consejos «reduce/sube kcal») esté apagado en el producto coach | Alto (legal) | S |
| 12 | **Pausa del registro de comidas** acordada con el coach, más el texto fijo de ayuda | Medio | S |

**Preguntas abiertas para el panel**
- **UX:** ¿«Mis comidas» pasa a la barra inferior? (hoy está en «Más»). ¿El cierre del día va en Hábitos (junto a «entrenó») para no añadir otra pantalla?
- **Coach de entrenamiento:** ¿la meta de proteína y el objetivo (pérdida/ganancia) se definen en el mismo lugar que la rutina? ¿Quiere ver la proteína de los días de entreno frente a los de descanso?
- **Neurociencia/PNL:** ¿qué redacción del cierre del día evita que «No registré todo» se viva como fallo? ¿Cómo formular la barra de proteína como logro y no como deuda?
- **Gamificación:** confirmo que **registrar ≥2 comidas** da puntos y que kcal y peso nunca den puntos. Propongo que un **día completo** valga lo mismo que uno incompleto, para no incentivar registros inventados. ¿Una insignia por «comida con proteína» fomenta un hábito sano o vuelve a contar gramos?
- **Para todos:** ¿quién del equipo real (nutricionista con tarjeta profesional) valida los umbrales y el catálogo, y con qué frecuencia?

---

## ANEXO A · Platos del catálogo a revisar

Solo los que me parecen fuera de rango o mal planteados. Formato: valor actual kcal/P/C/G (g). **Todos los valores sugeridos son aproximados, a validar con la TCAC/ICBF.** La coherencia interna de macros (4/4/9/7) se verificó por script en los 115 platos: no hay errores aritméticos. Los problemas son de porción y de estimación.

| id | Nombre | Actual kcal/P/C/G | Sugerido (rango) | Motivo |
|---|---|---|---|---|
| arepa-simple | Arepa de maíz | 135/3/28/1 | 130–220 · P 3–5 | «Mediana» es ambiguo (la paisa delgada y la boyacense o de chócolo varían mucho). Añadir ≈ g o diámetro y separar tipos |
| arepa-de-huevo | Arepa de huevo (costeña) | 280/8/22/18 | 350–450 · P 10–13 · G 20–28 | La costeña de carretera es grande y frita dos veces. Parece subestimada |
| bollo-limpio | Bollo limpio de maíz | 180/3/40/1 | 220–330 · P 4–6 · C 45–70 | Un bollo típico es más pesado que lo que implica 40 g de carbohidrato. Indicar tamaño |
| tamal | Tamal | 495/18/50/25 | 450–750 | Alias «tolimense», pero el tolimense suele ser más grande que el santafereño. Separar tipos o dar tamaño |
| yuca-frita | Yuca frita | 315/2/45/14 | Definir «porción ≈ 150 g» | Porción ambigua; el valor es plausible para ~150 g |
| pescado-patacon | Pescado frito con patacón y arroz con coco | 805/38/85/35 | 900–1.100 · P 40–45 | Suma menos que sus componentes del propio catálogo (905 sin ensalada) |
| arroz-coco | Arroz con coco | 235/3/40/7 | 270–350 · G 8–13 | Con leche de coco o titoté lleva más grasa (y a veces azúcar). Considerar «arroz con coco dulce (titoté)» aparte |
| arroz-blanco | Arroz blanco | 205/4/45/1 | 210–250 · G 3–6 | En casa colombiana suele llevar aceite al cocinarlo |
| frijoles | Fríjoles guisados | 300/15/42/8 | 300–450 · G 8–18 | Si llevan pezuña o tocino, sube mucho. Separar «con garra/tocino» |
| pechuga-plancha | Pechuga a la plancha | 205/40/0/5 | 230–260 · P 44–48 | Si los 150 g son de pechuga **cocida**, el valor está bajo; si son crudos, está bien. Indicar «cocida» |
| hamburguesa | Hamburguesa | 540/28/40/30 | Casera 450–600 · comida rápida/callejera 700–1.000 | La versión callejera colombiana (doble salsa, papitas, tocineta) es muy común: separar |
| perro-caliente | Perro caliente | 375/14/30/22 | 450–700 | El perro colombiano (papita triturada, salsas, queso) supera claramente 375 |
| salchipapa | Salchipapa | 730/22/70/40 | 700–1.100 | Plausible en la versión pequeña. Indicar tamaño (personal/mediana) |
| ensalada-mixta | Ensalada mixta | 30/1/6/0 | 30 sin aderezo; +45–120 por cda de aceite/aderezo | Falta el aderezo: es donde están las calorías. Añadir modificador |
| chicharron | Chicharrón | 270/14/0/24 | Valor ok para 50 g; porción típica 100–150 g (≈550–800) | La porción de 50 g es menor a la habitual (la de bandeja). Añadir porción realista |
| mojarra-frita | Mojarra frita | 390/40/8/22 | 350–500 | Valor plausible, pero está en «Fritos» con comida por defecto «Snack»: es un almuerzo |
| aguacate | Aguacate | 180/2/9/15 | Hass ½ ≈ 110–160; criollo/papelillo ½ ≈ 200–350 | El tamaño del aguacate colombiano varía muchísimo. Separar tipo o usar «¼ / ½» |
| salpicon | Salpicón de frutas | 115/1/28/0 | 150–250 | Suele llevar gaseosa o jugo azucarado (y en la costa, leche condensada) |
| jugo-agua | Jugo de fruta en agua con azúcar | 115/1/28/0 | Ok para 250 ml; vaso típico de restaurante 350–400 ml ≈ 160–200 | Añadir «vaso grande» o advertir la porción |
| jugo-leche | Jugo de fruta en leche | 175/5/30/4 | 200–260 con azúcar | Asume poco o ningún azúcar. Separar «con/sin azúcar» |
| cafe-con-leche | Café con leche | 95/5/8/5 | 95 sin azúcar; +20–40 con azúcar | La mayoría lo toma con azúcar. Modificador |
| aguardiente | Aguardiente | 100/0/0/0/alc 14 | ≈ 70–95 kcal · alcohol ≈ 8–11 g | 14 g de alcohol en 45 ml equivale a ~40 % vol. El aguardiente colombiano suele estar entre ~24 y 29 % vol. Además, «1 trago» suele ser una copa de ~30 ml. Revisar |
| cerveza | Cerveza | 140/1/11/0/alc 13 | Alcohol ≈ 10–12 g | Con ~4–4,5 % vol en 330 ml salen ~10–12 g. Diferencia menor |
| yogur-granola | Yogur con granola | 225/8/35/6 | 250–350 | La granola comercial es densa en energía. Además está en «Cenas ligeras»: recategorizar |
| oblea | Oblea con arequipe | 225/3/40/6 | 225 solo arequipe; 350–500 «con todo» (crema, queso, mermelada) | La versión callejera más común lleva varios toppings |
| empanada | Empanada de carne | 210/6/20/12 | 150–300 | Muy variable por tamaño (cóctel vs grande). Dar tamaño |
| papas-fritas | Papas fritas | 360/4/45/18 | Ok; definir «mediana ≈ 120–130 g» | Porción ambigua |
| arroz-leche, flan, natilla | Postres «1 porción» | — | Valores plausibles | Porción ambigua: indicar «1 vaso/1 cuadro ≈ g» |

**Si no estoy seguro:** los rangos amplios (tamal, bollo, aguacate, comida callejera) reflejan **variabilidad real**, no precisión. La salida correcta es separar tipos o tamaños, no afinar un único número.

## ANEXO B · Platos nuevos sugeridos

**Todos son aproximados, a validar** con la TCAC/ICBF y por un nutricionista. Valores kcal · P/C/G (g) para la porción indicada.

| # | Plato | Categoría | Porción | kcal (rango) | P/C/G aprox. |
|---|---|---|---|---|---|
| 1 | Suero costeño | Lácteos (Caribe) | 2 cucharadas (~30 g) | 60–80 | 1/1/6 |
| 2 | Arepa asada con mantequilla y queso costeño | Desayuno (Caribe) | 1 arepa | 300–380 | 10/35/15 |
| 3 | Bollo de yuca | Acompañante (Caribe) | 1 bollo | 220–290 | 1/55/1 |
| 4 | Bollo de mazorca | Acompañante (Caribe) | 1 bollo | 200–280 | 5/45/4 |
| 5 | Cayeye (guineo verde con queso y hogao) | Desayuno (Caribe) | 1 plato | 350–450 | 8/55/14 |
| 6 | Arroz con camarón | Almuerzo (Caribe) | 1 plato | 500–620 | 25/70/14 |
| 7 | Arroz de lisa | Almuerzo (Caribe) | 1 plato | 500–620 | 22/75/16 |
| 8 | Sancocho de bocachico / pescado costeño con bastimento | Sopa (Caribe) | 1 plato | 450–600 | 30/55/15 |
| 9 | Kibbe (quibbe) frito | Fritos (Caribe) | 1 unidad | 220–300 | 10/20/14 |
| 10 | Patacón con todo (pisao) | Comida rápida | 1 unidad | 700–1.000 | 30/70/45 |
| 11 | Raspao con leche condensada | Dulces | 1 vaso | 200–300 | 3/50/4 |
| 12 | Agua de coco | Bebidas | 1 vaso (250 ml) | 45–60 | 0/11/0 |
| 13 | Limonada de coco | Bebidas | 1 vaso (300 ml) | 250–380 | 2/40/14 |
| 14 | Almuerzo ejecutivo / corrientazo (sopa + seco + jugo) | Platos completos | 1 menú | 900–1.200 | 40/130/30 |
| 15 | Arroz chino | Comida rápida | 1 plato personal | 700–900 | 25/100/25 |
| 16 | Pollo apanado / broaster | Carnes | 1 presa | 300–450 | 25/12/22 |
| 17 | Arepa boyacense | Arepas y panes | 1 unidad | 280–380 | 8/45/10 |
| 18 | Almojábana | Arepas y panes | 1 unidad | 180–230 | 7/22/8 |
| 19 | Pandeyuca | Arepas y panes | 1 unidad | 150–200 | 4/20/8 |
| 20 | Pan tajado blanco | Arepas y panes | 2 tajadas | 140–160 | 5/27/2 |
| 21 | Queso campesino / blanco | Lácteos | 1 tajada (~40 g) | 100–130 | 7/1/8 |
| 22 | Atún en lata en agua | Proteínas | 1 lata escurrida | 100–130 | 24/0/1 |
| 23 | Yogur griego natural sin azúcar | Lácteos | 1 vaso (~150 g) | 90–150 | 12–15/6/0–6 |
| 24 | Kumis | Lácteos | 1 vaso (200 ml) | 150–190 | 6/24/4 |
| 25 | Malta | Bebidas | 1 botella (~330 ml) | 150–190 | 1/40/0 |
| 26 | Papa criolla | Acompañante | 1 porción (~150 g) | 110–140 cocida; 250–330 frita | 3/27/0 (cocida) |
| 27 | Plátano maduro asado o cocido | Acompañante | ½ plátano grande | 150–200 | 1/40/0 |
| 28 | Hígado encebollado | Carnes | 1 porción (~120 g) | 220–260 | 28/8/9 |
| 29 | Crema de ahuyama / sopa de verduras | Sopas | 1 plato | 100–200 | 3/18/5 |
| 30 | Ron o whisky | Alcohol | 1 trago (45 ml, ~40 % vol) | 95–105 | alcohol ≈ 14 g |
| 31 | Refajo / michelada | Alcohol | 1 vaso (~400 ml) | 180–250 | alcohol ≈ 6–10 g |
| 32 | Aceite o aderezo (modificador) | Extras | 1 cucharada | 45–120 | 0/0–3/5–13 |

Notas: el n.º 14 funciona mejor como **combo** que suma sopa + seco + jugo con componentes del catálogo. El n.º 32 (y el azúcar o la mantequilla) conviene como **«+ extra»** sobre cualquier plato, no como plato suelto.
