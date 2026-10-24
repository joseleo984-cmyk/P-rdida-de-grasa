# 02 · Coach de entrenamiento y nutrición deportiva — revisión de «Pérdida de Grasa» (Demo)

> Perspectiva experta **simulada** (coach de fuerza y recomposición, Colombia, online y presencial). **[validar]** = debe revisarlo un nutricionista dietista o un médico deportivo. Marco como *práctica de campo* lo que es experiencia y no evidencia; no cito estudios.
> Revisé las 32 capturas (00–30, oscuro y claro) y leí `medidas.js`, `habitos.js`, `platos.js`, `rutinas.js`, `schema.js`, `calc.js`, `coach.js`, `coach-panel.js` e `index.html`. No modifiqué nada.

## 1. Veredicto

1. Sirve para **acompañar**: hay registros, fotos, notas del coach y rutinas con demostración, y el cobro está resuelto. Ya reemplaza el Excel más WhatsApp de un coach pequeño.
2. Todavía no sirve para **decidir**. La ficha muestra «Inicio / Hoy / Cambio», pero no la tendencia de 2 a 4 semanas, la meta ni si la persona cumplió el entrenamiento.
3. Hallazgo clave: **el código ya calcula casi todo lo que falta**. Media de 7 días (`Calc.trend`), ritmo kg/sem (`Calc.weeklyRate`), semáforo con motivo (`Coach.semaforo`), adherencia a 1/2/4 semanas, proteína media y perfil (sexo, edad ≥18, estatura, peso meta). En el modo coach todo eso está oculto con la clase `home-legacy` (`index.html` l. 676, 711, 715).
4. Faltan tres datos semanales: **check-in subjetivo** (energía, hambre, sueño, estrés), **qué se entrenó** (y con qué carga) y **molestias o dolor**.
5. Con eso y la lista ordenada por prioridad, revisar a un asesorado pasaría de ~8–10 min a ~2–3 min (estimación de campo, no medida).

## 2. El ciclo semanal real del coach

El asesorado hace check-in el domingo o el lunes. El coach revisa entre lunes y martes y responde con una sola acción.

| Paso | Qué necesita |
|---|---|
| **Revisar** | ¿Registró? · promedio de peso de esta semana frente a la anterior · cintura frente a hace 2–4 semanas · entrenos hechos de los planeados · cómo se sintió · molestias · fotos cada 2–4 semanas |
| **Decidir** | Una de 4 decisiones: **mantener** · **ajustar comida** (cambios pequeños, p. ej. −150 a −250 kcal o más proteína; práctica de campo **[validar]**) · **ajustar entreno** (subir carga, cambiar un ejercicio por molestia, descargar) · **ajustar conducta** (sueño, pasos, fin de semana). Sin el dato de adherencia no se puede distinguir «el plan no funciona» de «no siguió el plan». |
| **Comunicar** | Un mensaje corto: un logro, un dato y una acción. «Comentarios» ya existe y el asesorado lo ve en Inicio («1 sin leer»). Faltan el botón «enviar por WhatsApp» y una plantilla. |

**La ficha de hoy (captura 13) frente a la necesidad:**

| Dato | ¿Sirve? | Por qué |
|---|---|---|
| Pago, vencimiento, «te muestra / no te muestra» | Sí | Bien resuelto |
| Tabla Inicio / Hoy / Cambio | A medias | «Hoy» es un solo día, y el peso diario varía ±1–2 kg por agua, sal o ciclo (práctica de campo constante). El cambio frente al inicio no dice qué pasó esta semana. Faltan las columnas **hace 2 sem / hace 4 sem**. |
| Cuello, brazos D/I, espalda, muslos D/I | Ruido semanal | Cambian milímetros con mucho error de medición y no cambian la decisión de la semana. Mejor plegarlos. Además, **pintar de verde toda bajada** es incorrecto en ganancia muscular (un brazo que baja no es un logro). |
| Hábitos de la semana | Sí | Pero son opcionales: Gina y Hugo «no comparten sus hábitos» |
| Comidas, 7 días con kcal | A medias | Ver la sección 4 |
| Rutinas asignadas | Sí | No hay ningún dato de lo que la persona **hizo** |
| Comentario «sobre el día» | Sí | Lo normal es comentar la semana |
| **Falta**: meta y fecha, ritmo/sem, semáforo, adherencia al entreno, check-in, molestias, última foto | Crítico | Sin esto, el coach decide «a ojo» |

## 3. Datos del asesorado

| Campo | Valor | Cómo y cuándo medirlo |
|---|---|---|
| **Peso** | ALTO como **promedio semanal**; bajo como dato diario | En ayunas, después de orinar, misma báscula. Ver la frecuencia en la sección 9. |
| **Cintura / abdomen** | ALTO | Es el mejor indicador de campo de pérdida de grasa. Hoy se exige «abdomen» y «cintura» es opcional, y casi nadie sabe la diferencia. Recomiendo **un solo** perímetro obligatorio con guía visual (altura del ombligo, al final de una espiración normal, sin apretar la cinta). |
| Cadera | MEDIO | Útil en mujeres y en la relación cintura-cadera. Cada 2 semanas, no en cada registro. |
| Cuello | BAJO | Solo alimenta la fórmula Navy de % de grasa, que tiene un error amplio **[validar]**. Mensual. |
| Brazos, muslos, espalda | BAJO–MEDIO | Relevantes en recomposición. Mensual y **un solo lado**: medir D e I duplica el esfuerzo y el error. La espalda es difícil de medirse uno mismo. |
| Pasos | ALTO | Es la palanca de gasto que más controla la persona (práctica de campo). La meta debe ser **por persona**. |
| Sueño | MEDIO–ALTO | Afecta el hambre, la recuperación y la adherencia |
| Agua | BAJO–MEDIO | Un toque. 8 vasos no es universal. |
| «Entrené» | MEDIO | **Duplicado**: está en Hábitos y en Mi rutina. Debe haber una sola fuente. |
| Fotos | ALTO cada 2–4 semanas | La guía de la app está bien |

**Diseño de lo obligatorio:** hoy medidas y comidas son obligatorias, y hábitos y fotos son opcionales. Para decidir, pasos y entrenos valen más que siete perímetros. Mínimo obligatorio que propongo: **peso + una cintura + entrenos**. El resto, opcional.

**Lo que falta** (A = lo captura el asesorado; C = lo calcula la app):

| Propuesta | Quién | Esfuerzo | Beneficio para el coach |
|---|---|---|---|
| Meta (bajar grasa / músculo / recomposición) + objetivo + fecha orientativa | Coach, y el asesorado confirma | 0–20 s, una vez | Muy alto: da contexto a toda la tendencia |
| Punto de partida: sexo, año de nacimiento, estatura, actividad (3 opciones), experiencia entrenando (3 opciones). El esquema ya existe. | A | ~40 s, una vez | Alto: IMC, control de edad, contexto |
| Pregunta tipo PAR-Q (cuestionario de aptitud física): «¿algún médico te ha dicho que tienes una condición que limite el ejercicio?» Sí/No, sin pedir cuál | A | 5 s, una vez | Seguridad, sin guardar datos clínicos |
| **Check-in semanal** 1–5 con caritas: energía, hambre, sueño, estrés, «¿qué tan bien seguiste el plan?» + texto libre opcional | A | 20–30 s | Muy alto: hoy esto se pregunta por WhatsApp |
| Molestias: Sí/No → zona + intensidad 0–10 | A | 5 s (15 s si responde «sí») | Alto: seguridad y cambio de ejercicios |
| Sesión: completa / parcial / no + «¿cómo te sentiste?» | A | 3–5 s | Alto. Reemplaza el «Entrené» suelto. |
| Carga y RIR por ejercicio (opcional) | A | 5–10 s por ejercicio | Alto en clientes de fuerza |
| Progresión de cargas, promedio semanal, ritmo %/sem, proteína/día desde el catálogo | C | 0 | Muy alto (ya hay base en el código) |
| Ciclo menstrual (opcional, privado, apagado por defecto) | A | 2 s | Medio: explica retención de líquidos y evita ajustes innecesarios |

## 4. Comidas

- **Como herramienta de conciencia y adherencia, el catálogo sirve**: es más realista que pedir gramos a quien come «corrientazo».
- **Como medida de ingesta real, es engañoso.** Las porciones colombianas varían muchísimo, el subregistro es la norma (aceite, bebidas, tinto con azúcar, «picaditas») y los valores son estimados por el equipo, como dice el propio código **[validar con nutricionista y la Tabla de Composición de Alimentos Colombianos del ICBF]**.
- El ejemplo de la demo, «238 kcal» en tipografía gigante con 2 comidas, induce a error en los dos lados: el coach puede leer «come poquísimo» y el asesorado se fija en la cifra.

**Al coach, mostrarle:**
- Comidas registradas frente a no registradas por franja (para distinguir «no registró» de «comió poco»).
- **Proteína aproximada/día** y promedio semanal (`proteinAvg` ya existe; hoy solo se ven kcal).
- kcal como **promedio o rango semanal**.
- Hora y patrones: ayunos largos, comer de noche, fin de semana.
- A futuro, la foto del plato.

**No mostrar:**
- Al asesorado, el total del día en grande por defecto.
- Semáforos de «te pasaste».
- La «meta de calorías» de `Calc.plan` sin una decisión explícita del coach. Prescribir dietas corresponde a nutrición **[validar marco legal colombiano]**.

**Riesgo:** contar calorías puede reforzar conductas alimentarias de riesgo en personas vulnerables. Mitigaciones: opción de ocultar calorías, detección de patrones (sección 6) y nunca premiar «comer menos».

## 5. Rutinas

**Funciona bien:**
- La estructura días → ejercicios (series × reps, nota, GIF o video de 15 s). El ▾ con la demostración es un acierto para la técnica.
- La plantilla que se copia al asignar (personalizar sin romper a otros), asignar a varios y ocultar o mostrar.
- La «rutina de hoy» para grupos o retos.

**Falta**, por prioridad:
1. **Registro de lo realizado**: completa / parcial / no; idealmente kg y reps de la última serie, o RIR.
2. **Progresión por semanas** (S1–S4 y descarga). Hoy el coach tiene que editar y reasignar.
3. **Intensidad** en un campo propio (RIR objetivo o carga sugerida). Hoy todo va en un texto de 30 caracteres y no se puede graficar.
4. **Descanso** entre series, con temporizador simple (útil para principiantes). El tempo puede ir en la nota.
5. **Ejercicio sustituto** por molestia, que avise al coach cuando se use.
6. Formato propio para **cardio y calentamiento** (minutos + «puedes hablar / te cuesta hablar»). Hoy el cardio usa series×reps.
7. **Qué día toca hoy** por persona, no solo la «rutina de hoy» general.
8. La «rutina de hoy» llega a **todos** los activos, incluso a quien tiene una lesión. Debe permitir exclusiones.

## 6. Banderas rojas y seguridad

La app no diagnostica ni prescribe, pero **detecta, avisa al coach y le dice al asesorado «consulta a un profesional de la salud»**. Los umbrales son orientativos **[todos a validar]**. La sección 9 da el detalle.

| Señal | Detección | Acción |
|---|---|---|
| Pérdida demasiado rápida | > ~1 % del peso/semana sostenido ≥3 semanas (excluir las 2 primeras, por el agua) | Aviso ámbar al coach. No se celebra. |
| IMC bajo | IMC < 18,5, o una meta que lleve por debajo | Rojo. Meta bloqueada sin confirmación del coach. |
| Restricción | Promedio semanal registrado < 1 200 (mujer) / 1 500 (hombre) en días con registro completo; < 1 000 kcal ≥3 días seguidos = rojo (el código ya usa los pisos 1 200/1 500) | Aviso al coach. El asesorado no ve la cifra. |
| Mareo, desmayo, dolor en el pecho, falta de aire anormal | Botón «me sentí mal entrenando» o check-in | Al asesorado: «suspende y consulta; si es grave, llama al 123». Rojo al coach. |
| Dolor ≥ 6/10, o el mismo dolor 2 semanas | Registro de molestias | Sustituir el ejercicio y sugerir valoración (fisioterapia) |
| Embarazo o posparto | Pregunta opcional en el registro | Aviso al coach: «requiere aval médico». La app no ajusta nada sola. |
| Menor de 18 | Año de nacimiento | Bloquear. `AGE_MIN = 18` existe en el código, pero el modo coach **no pide edad**. |
| Condición médica (PAR-Q = sí) | Registro | «Antes de empezar, consulta a tu médico» + aviso al coach. No guardar el diagnóstico. |
| Patrón alimentario de riesgo | Restricción + pesajes varias veces al día + bajada rápida | Aviso discreto al coach, con guía para hablarlo y derivar |

**La app nunca debe:** recomendar dietas, suplementos o medicamentos; fijar calorías al asesorado por su cuenta; mostrar mensajes de culpa; premiar déficits, kilos o centímetros; rankear cuerpos o pesos; aceptar metas por debajo de un IMC saludable; guardar diagnósticos; interpretar síntomas.

## 7. Métricas del coach (lista de asesorados)

Por tarjeta, de un vistazo:
1. **Semáforo con motivo**, como orden por defecto (`Coach.semaforo` ya existe).
2. Tendencia de peso a 2–4 semanas (kg/sem y %) y cintura a 4 semanas.
3. Entrenos hechos de los planeados esta semana.
4. Días desde el último registro y check-in pendiente.
5. **Alertas de seguridad**, siempre arriba.
6. Molestias reportadas.
7. Pago por vencer (≤3 días) o vencido.

Además, un contador «N check-ins por revisar» y una marca «revisado esta semana».

## 8. 15 mejoras priorizadas

| # | Mejora | Impacto | Esfuerzo |
|---|---|---|---|
| 1 | Mostrar en el modo coach lo ya calculado (tendencia 7 d, ritmo/sem, adherencia 1/2/4 sem, proteína, semáforo) | Muy alto | Bajo |
| 2 | Lista ordenada por semáforo/prioridad, con el motivo | Muy alto | Bajo |
| 3 | Columnas «hace 2 / 4 sem»; medidas secundarias plegadas; colores neutros (no verde en toda bajada) | Alto | Bajo |
| 4 | Check-in semanal de un toque | Muy alto | Medio |
| 5 | Registro de sesión (completa / parcial / no + cómo te sentiste), unificado con «Entrené» | Muy alto | Bajo–medio |
| 6 | Perfil mínimo + control ≥18 + PAR-Q | Alto | Bajo |
| 7 | Alertas de seguridad básicas con texto de derivación | Alto | Medio |
| 8 | Un solo perímetro obligatorio (cintura con guía); peso desacoplado de medidas; resto mensual y opcional | Alto | Bajo |
| 9 | Comidas al coach: proteína, comidas registradas o no, kcal como promedio semanal | Alto | Bajo |
| 10 | Opción del coach para ocultar calorías y báscula por asesorado | Medio–alto | Bajo |
| 11 | Carga + RIR opcionales y gráfica de progresión | Alto (fuerza) | Medio |
| 12 | Metas de pasos, agua y sueño por persona | Medio | Bajo |
| 13 | Rutinas: descanso, sustituto, semanas S1–S4, «toca hoy» por persona | Medio–alto | Medio–alto |
| 14 | «Rutina de hoy» con exclusiones | Medio | Bajo |
| 15 | Comentario → WhatsApp + plantilla de feedback semanal | Medio–alto | Bajo |

## 9. Respuestas a los otros expertos (03 neurociencia/PNL, 04 gamificación)

**Frecuencia de pesaje** (03) — *práctica de campo; la redacción para el asesorado la define 03*:
- Por defecto, **3 pesajes por semana** (por ejemplo, lunes, miércoles y viernes) en ayunas. Al asesorado se le muestra solo la **tendencia o promedio semanal**, y el número del día en pequeño. Coincido con 03: media móvil de 7 días y puntos tenues.
- El pesaje diario es opcional para quien lo lleva bien: da una tendencia más estable.
- Para perfiles ansiosos o con antecedentes, el coach configura **1 pesaje por semana** o **sin báscula** (solo cintura y fotos).
- **Nunca una racha de pesaje.**

**Frecuencia de medidas** (03 y 04):
- Cintura cada semana, el mismo día de un pesaje.
- Cadera cada 2 semanas.
- Cuello, brazos, muslos y espalda cada 4 semanas.
- Fotos cada 2–4 semanas.
- A la pregunta de 04 («¿obligar peso en cada registro de medidas favorece el sobre-registro?»): **sí**. Hay que desacoplar peso y perímetros, y no exigir los 3 obligatorios en cada registro. Basta el de su día.

**Sobre-registro**: coincido con 04. Señal ámbar si hay **más de 1 pesaje al día en varios días** o si mide perímetros ≥4 veces en 7 días.

**Umbrales de alerta** (03 y 04) **[validar con nutrición o medicina deportiva]**:
- **Ritmo de pérdida**: > ~1 % del peso por semana sostenido 3 semanas, sin contar las 2 primeras. En personas con IMC alto, un ritmo algo mayor al inicio puede ser esperable: lo decide el profesional.
- **kcal**: el aviso compara el **promedio semanal en días con registro completo**, no un día suelto (el subregistro da falsos positivos). Ámbar por debajo de 1 200 (mujer) / 1 500 (hombre), que son los pisos que ya usa `calc.js`. Rojo por debajo de ~1 000 kcal ≥3 días seguidos (coincide con 04).
- **IMC**: < 18,5.
- **Sueño**: < 5 h durante 5 días es ámbar (coincido con 04).
- **Entreno «compulsivo»**: entrenar 6–7 días/semana **no es peligroso por sí solo** en alguien con experiencia, y > 25 000 pasos es normal en mensajeros, meseros o trabajos de pie en Colombia. Solo dispararía aviso **en combinación** con restricción, pérdida rápida, dolor o sueño bajo. Por sí solos, como mucho, una nota informativa.
- **Desconexión**: ≥5 días sin registro (el semáforo ya usa 5). Mensaje sin culpa, como propone 03.

**¿Ocultar calorías?** (03) **Sí**, por asesorado y decidido por el coach, sin ocultárselas al coach. Casos: antecedentes o señales de conducta alimentaria de riesgo, ansiedad con los números o preferencia por el «método del plato o de la mano». Para todos, recomiendo que las kcal sean **discretas por defecto** (texto pequeño, no protagonista).

**Esfuerzo percibido** (03 y 04):
- Por sesión, un toque: «¿Cómo te sentiste? Fácil · Normal · Duro · No pude terminar». Es la propuesta de 03 con una 4.ª opción que sirve al coach.
- Por ejercicio (opcional, para intermedios): **kg + «¿cuántas reps te quedaban?» 0 / 1–2 / 3+** (RIR simplificado). Para principiantes, evitar la escala de Borg de 1–10: la interpretan mal (práctica de campo).

**Técnica medible** (04): ver el video **no** demuestra técnica. Lo que sirve:
- Un video corto del asesorado al coach, cada 2–4 semanas, para 1–2 ejercicios clave (es privado y debe pedir consentimiento).
- Una marca del coach: «técnica revisada».

No gamificaría la técnica.

**Metas de pasos y agua por persona** (04): sí.
- **Pasos**: partir de la línea base de la persona y subir ~1 000–2 000 por semana hasta la meta que fije el coach. Una meta fija de 8 000 desmotiva a quien hoy hace 3 000.
- **Agua**: la meta la fija el coach; no hay una cifra universal **[validar]**.

**Rachas, ranking e insignias** (03 y 04), desde lo que he visto con asesorados:
- Prefiero metas **semanales flexibles** («3 de 4 entrenos») a una racha diaria. La gente abandona tras romper una racha larga.
- Nada de rachas de pesaje ni de comidas «bajo X kcal».
- Ranking: solo por **proceso**, opt-in y en grupos pequeños del mismo coach. Los retos grupales funcionan mejor que las tablas, y coincido con la hipótesis de 04.
- El reconocimiento personal del coach mueve más que una insignia. Las insignias de proceso están bien como complemento, nunca por kilos o centímetros (coincido con 04).

**Meseta** (03): el coach no debería ajustar la comida antes de **2–3 semanas de peso estable con buena adherencia y sin bajada de cintura**. El mensaje de 03 sobre la meseta es correcto y lo respaldo.

### Preguntas que dejo abiertas
- **UX**: ¿dónde vive el check-in semanal sin otra pestaña (¿una tarjeta en Inicio el domingo?)? La ficha del coach mide más de 5 000 px: ¿resumen arriba y detalle plegado?
- **Neurociencia/PNL**: ¿cuál es la redacción más neutra para las preguntas de dolor o mareo, para no generar efecto nocebo?
- **Gamificación**: ¿cómo combinar la «rutina de hoy» grupal con retos sin comparar cuerpos?
- **Legal/negocio**: ¿quién responde ante una alerta de seguridad ignorada por el coach? ¿El texto de derivación debe incluir líneas de ayuda en Colombia?

*Todos los umbrales y cálculos de energía o proteína deben validarlos un nutricionista dietista y un médico deportivo antes de llevarlos a producción.*
