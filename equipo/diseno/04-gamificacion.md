# 04 · Gamificación ética: «Pérdida de Grasa» (Demo)

*Esta es la perspectiva simulada de una diseñadora de gamificación ética. Lo marcado con **[VALIDAR]** hay que probarlo con coaches y asesorados reales antes de construirlo.*

Revisé las 32 capturas (oscuro y claro) y leí `habitos.js`, `medidas.js`, `rutinas.js`, `pagos.js`, `schema.js`, `app.js` y `rutinas-view.js`.

---

## 1. Veredicto (5 líneas)

1. **Hoy, lo que haría volver mañana** son las notas del coach (la etiqueta «1 sin leer» es el único gancho social que existe), la «Rutina de hoy» y la satisfacción de llenar las barras de hábitos.
2. **El feedback es casi nulo.** Guardar hábitos no celebra nada. «Hoy entrené» solo dice «Anotado. ¡Buen trabajo!». Las metas son fijas para todos (8 vasos, 8.000 pasos, 7 h) y un día sin registro cuenta como «no cumplido».
3. **Lo que más se destaca son números de riesgo.** En Inicio, «238 kcal» aparece en tipografía gigante. La tabla de Medidas pinta de verde *toda* bajada, incluso brazos y muslos, que en ganancia muscular no es deseable. El peso es el primer campo y es obligatorio.
4. **El Inicio habla de dinero** («Faltan 21 días para tu próximo pago») y no del progreso. Al coach, la lista le dice quién debe plata, pero no quién necesita ánimo.
5. **Le falta** cerrar el ciclo hábito → reconocimiento: celebración micro, constancia con perdón, hitos de proceso, retos del coach y un canal para que el coach reconozca en 1 toque.

---

## 2. Sistema propuesto por capas

| Capa | Mecánica concreta | Qué ve el asesorado | Qué ve el coach | Datos | Esfuerzo |
|---|---|---|---|---|---|
| **1. Feedback inmediato** | Al guardar hábitos o marcar «Hoy entrené», una animación corta (≤1 s, que respeta `prefers-reduced-motion`) y un mensaje que cambia según lo logrado. Si cumple los 4 hábitos del día, «Día completo» con un aro que se cierra. | «¡Agua lista! 8 de 8 vasos 💧». Si registra menos: «Registrado. Mañana sumamos». Nunca «fallaste». | Nada en tiempo real, para no saturar. | Ya existen: `state.habits[fecha]` y `Habitos.day()`. | **S** |
| **2. Constancia con perdón** | La «semana constante» es una semana con ≥4 días con algún registro. Hay 2 «días comodín» por semana que se aplican solos, y un «congelar» automático mientras el acceso está en pausa o el coach marca vacaciones/enfermedad. Cuando alguien vuelve se muestra «¡Volviste!» y no un contador en cero. | Se cuentan semanas, no días: «Llevas 3 semanas constantes». Los comodines usados aparecen como ☁️, no como huecos rojos. | En la lista: «3 sem. constantes» o «sin registrar hace 5 días · enviar ánimo». | La base existe (`habits`). Hay que agregar `freezes[]` (fechas de pausa o comodín) y reutilizar `paidUntil` de pagos. | **M** |
| **3. Metas e hitos del programa** | Metas de hábito personalizables por el coach (rango seguro). Hitos de proceso en días 7, 30, 60 y 90, más hitos de fuerza y de cintura con tope saludable (ver §6). | Una tarjeta «Tu camino» en Inicio con el próximo hito: «Faltan 2 entrenos para tu hito de 12». | En la ficha, una línea de hitos logrados y un botón «Felicitar». | `habits` y `entries` existen. Faltan `goals` por asesorado (agua, pasos, sueño, entrenos/sem.) y `milestones[]` logrados. | **M** |
| **4. Social opt-in** | Retos de grupo con progreso colectivo, una liga pequeña opcional (alias, solo proceso) y un muro de logros sin cifras corporales. | Un interruptor «Participar en la comunidad», apagado por defecto, con explicación de qué se comparte. | El coach ve quién aceptó y modera el muro. | Hay que agregar `community_optin`, `alias`, `avatar`, `group_id` y `feed[]`. | **L** |
| **5. El coach como guía** | Reacciones en 1 toque (👏 💪 🔥 «Orgullo») sobre un hito o un día, notas plantilla, «Rutina de hoy» con un mensaje del día y la bandeja «Para reconocer hoy». | Notas y reacciones en Inicio, que ya existe como «Notas de tu coach». | Bandeja diaria «3 asesorados lograron algo · 2 llevan 5 días sin registrar». | Las notas ya existen («Comentarios», «Sobre el día», leído/no leído). Faltan `reactions[]` y la vista de bandeja. | **S–M** |

**Correcciones de base que pido antes de gamificar (S):**
- Quitar el color «bueno = verde = bajar» de la tabla de Medidas. Usar un color neutro y que el coach elija la dirección deseada por medida (brazo ↑ en ganancia muscular).
- En Inicio, bajar el protagonismo de las kcal: tamaño normal o plegado. La línea de pago debe ir más abajo y en tono neutro.
- Cambiar «Sin datos de un día = no cumplido» por «sin registro» en gris, distinto de «registrado y no alcanzado».

---

## 3. Puntos, niveles e insignias

### Economía mínima: «Pasos de constancia» (PC)

Son puntos de **proceso**, no canjeables por dinero. Sirven para subir de nivel y para la liga opt-in. **Nunca** dan puntos el peso, las kcal, las medidas como valor ni los centímetros perdidos.

| Acción | PC | Tope |
|---|---|---|
| Registrar hábitos del día (cualquiera) | 2 | 1 vez al día |
| Cada hábito cumplido (agua, pasos, sueño) | 1 c/u | 3 al día |
| «Hoy entrené» | 3 | 1 al día y **máx. 5 al semana** (no premia entrenar 7/7) |
| Registrar medidas | 3 | **1 vez por semana** (desalienta pesarse a diario) |
| Fotos de progreso | 3 | 1 cada 14 días |
| Registrar comidas (≥2 comidas del día) | 1 | 1 al día. Cuenta *registrar*, no las kcal |
| Leer una nota del coach | 1 | 1 al día |
| Completar un reto del coach | 10 | por reto |
| Volver tras ≥5 días sin registro | 5 | 1 vez al mes |

- **Tope diario: 12 PC.** No hay bonificación por «pasos extra» por encima de la meta: 20.000 pasos vale lo mismo que 8.000.
- **Niveles** con nombres de proceso: Arranque (0) → En marcha (60) → Constante (200) → Disciplinado/a (450) → Ejemplo (800) → Leyenda del parche (1.300). Para ir de Arranque a Constante se necesitan ~4 semanas normales. **[VALIDAR]** las curvas.
- Nunca se pierden PC ni se baja de nivel.
- **Registro honesto:** los registros con más de 2 días de atraso se guardan pero no dan PC (es un anti-trampa suave). Se muestra sin juicio: «Guardado. Los puntos cuentan para registros de hoy o ayer». **[VALIDAR]** que no desincentive registrar tarde.

### 18 insignias

| # | Nombre | Descripción | Criterio medible (con datos actuales o a agregar) |
|---|---|---|---|
| 1 | **Arrancó el parche** | Primer día registrado | Primer `habits[fecha]` existente |
| 2 | **Primera semana** | 7 días desde que empezó, con ≥4 registros | `habits` en 4 de los primeros 7 días |
| 3 | **Primer mes** | Un mes acompañado y activo | 30 días desde el vínculo y ≥12 días con registro |
| 4 | **Constancia 4 semanas** | 4 semanas constantes seguidas (con comodines) | 4 semanas con ≥4 días registrados (los comodines cuentan) |
| 5 | **Hidratado/a** | Cumplió el agua 5 días de una semana | `water ≥ meta` en 5 de 7 días |
| 6 | **Pata de perro** | Metas de pasos 5 días en una semana | `steps ≥ meta` 5 de 7 |
| 7 | **Buen dormir** | 7 h o más en 5 noches de la semana | `sleep ≥ 7` 5 de 7. **Tope superior: no premia más de 10 h** |
| 8 | **Semana redonda** | Los 4 hábitos al menos 4 días cada uno | `week().items` todos ≥4 |
| 9 | **Tres de tres** | 3 entrenos en una semana | `trained` 3 de 7 |
| 10 | **Doce entrenos** | 12 entrenos acumulados | conteo de `trained` |
| 11 | **Técnica primero** | Vio el GIF o video de cada ejercicio de una rutina | Hay que agregar un evento «vio ejercicio» en `rutinas-view` (hoy ya se abre el ejercicio con ▾) |
| 12 | **Descanso inteligente** | Respetó un día de descanso activo de su rutina | El «Día 2 – Descanso activo» existe. Hay que agregar un marcado «hice el descanso activo» |
| 13 | **Volviste** | Retomó tras una pausa o ≥7 días sin registro | Primer registro tras un hueco ≥7 días o tras salir de pausa (`pagos.blocked` pasa a false) |
| 14 | **Registro honesto** | Registró 4 semanas incluyendo días «no cumplidos» | ≥8 días registrados con algún hábito no alcanzado (premia ser sincero, no ser perfecto) |
| 15 | **Mi espejo** | Primeras fotos «antes» de frente y perfil | 2 fotos de vistas distintas el mismo día |
| 16 | **Midiendo con cabeza** | 4 registros de medidas espaciados ≥6 días | `entries` con separación ≥6 días. **No hay insignia por medirse más seguido** |
| 17 | **Plato a plato** | Registró comidas 10 días (sin importar kcal) | `foods[fecha]` con ≥2 comidas en 10 días |
| 18 | **Reto cumplido** | Completó su primer reto del coach | Hay que agregar `challenges` |

Las insignias se ven en «Mi camino» (Más → Mi camino). Las no logradas aparecen en gris con una pista positiva, nunca con una cuenta regresiva urgente. **No hay insignias por peso perdido ni por cm de cintura.** Los hitos corporales se tratan aparte, en §6, como celebraciones privadas.

---

## 4. Retos del coach

**Flujo en 2 toques:** Más → «Retos» → elegir plantilla → «Lanzar a: Todos / Grupo / Elegir». Las fechas se rellenan solas (desde hoy, 7 días).

**Plantillas listas:**

| Plantilla | Duración | Criterio | Dato |
|---|---|---|---|
| 💧 7 días de agua | 7 d | agua ≥ meta 5 de 7 días | `water` |
| 🚶 10.000 pasos × 5 | 7 d | ≥10.000 pasos 5 días | `steps` |
| 🏋️ 3 entrenos esta semana | 7 d | `trained` 3 días (no 7) | `trained` |
| 😴 Dormir 7 h | 7 d | `sleep ≥7` 5 noches | `sleep` |
| 📸 Foto del mes | 30 d | 1 sesión de fotos frente y perfil | fotos |
| 🍽️ Registra tus comidas 5 días | 7 d | ≥2 comidas registradas 5 días | `foods` |
| 🔁 Semana redonda | 7 d | los 4 hábitos ≥4 días | `habits` |
| 🌱 Mes constante | 30 d | 4 semanas constantes | `habits` |

**Reglas:**
- Todos los retos se cumplen con «X de N días», nunca con «N de N».
- Solo hay retos de proceso. El sistema no ofrece plantillas tipo «baja 2 kg».
- Si el coach escribe un reto personalizado, el campo de criterio solo permite elegir métricas de proceso.

**Asesorado:** una tarjeta en Inicio con «Reto de Fit Demo: 3 entrenos esta semana · 2 de 3 ●●○ · quedan 3 días». Al cumplirlo ve una celebración, gana la insignia y el coach recibe un aviso. Si no lo cumple: «Lograste 2 de 3. ¿Lo intentamos la otra semana?», con el botón «Unirme al próximo».

**Coach:** una tarjeta con el progreso agregado («5 de 8 van en camino») y la lista con ✓ / en camino / sin empezar. Puede felicitar a todos los que cumplieron en un toque.

**Grupal opcional:** «Entre todos: 40 entrenos esta semana». La meta es colectiva, cada uno suma y no hay comparación individual. Es la forma más segura de introducir lo social.

---

## 5. Ranking y comunidad (opt-in)

**Reglas de seguridad:**
1. Está **apagado por defecto**. Se activa con un consentimiento separado, revocable y que no afecta el servicio. Este interruptor es independiente de «compartir datos con el coach», que es obligatorio.
2. Se participa con **alias y avatar** (iniciales sustituidas por un ícono o animal elegido). Nunca aparecen nombre real, foto, correo ni ciudad.
3. **Métricas SÍ:** semanas constantes, días con registro, retos completados, entrenos de la semana (con tope de 5), PC de la semana (con tope).
4. **Métricas NO:** peso, kcal, medidas, fotos, IMC, porcentaje de grasa, cambio de peso y cualquier «antes/después».
5. **Ligas pequeñas** de 5–12 personas por grupo del coach. El ranking es **semanal y se reinicia el lunes**: no hay tablas históricas de «los mejores de siempre».
6. **Solo se muestran los primeros 3 y tu posición.** No hay «último lugar» visible y quien está abajo ve «Esta semana sumaste 34 PC 👏».
7. Al darse de baja, el alias desaparece del ranking de inmediato.

**Muro de logros:** muestra eventos automáticos de insignias y retos, por ejemplo «🦊 Zorro-27 completó *Tres de tres*». Las reacciones son predefinidas (👏 💪 🔥) y no hay comentarios libres entre asesorados en el MVP, lo que reduce la moderación casi a cero.

**Historias de vida y consejos del coach:**
- **Formato:** una tarjeta con título, texto de hasta 800 caracteres, foto opcional del coach y etiqueta (Hábitos / Entreno / Mentalidad / Historia real).
- **Historias de asesorados:** solo con consentimiento escrito de quien la protagoniza, con alias o nombre según elija, y **sin fotos antes/después en el muro**.
- **Moderación mínima:** solo el coach publica. Hay un botón «Reportar» que llega al coach y al administrador. Un filtro de palabras de riesgo («ayuno de 3 días», «no comer», «purgar», cifras de kcal < 1.000) avisa al coach antes de publicar.

---

## 6. Hitos y celebraciones de progreso

Los hitos corporales son **privados**: solo los ven el asesorado y el coach. Se celebran con **topes saludables**, y el sistema deja de celebrar bajadas rápidas.

| Hito | Criterio | Mensaje al lograr |
|---|---|---|
| Cintura −2 cm / −5 cm | `waist` respecto al inicio, con ≥3 semanas entre el primer y el último registro | «Tu cintura bajó 2 cm desde que empezaste. Eso es salud, no solo talla.» |
| Fuerza | Hay que agregar «subí peso/reps» por ejercicio, opcional | «Hiciste 4×12 en sentadilla. Hace un mes eran 3×10. ¡Más fuerte!» |
| Constancia | 4, 8, 12 semanas constantes | «12 semanas apareciendo por ti. Eso no te lo quita nadie.» |
| Energía o sueño | Hay que agregar un check-in semanal opcional de 1–5 en energía y ánimo | «Tu energía promedio subió de 2 a 4. ¿Lo notas en el día?» |
| Ganancia muscular | Brazo o muslo ↑ con cintura estable, si el coach marcó objetivo «ganar músculo» | «Brazo +1 cm con la cintura estable: músculo en camino.» |

**Si no se logra**, se cuenta el proceso, no el resultado:
- «Esta semana la cintura no cambió. Cumpliste el agua 6 de 7 días y entrenaste 3 veces; el cuerpo a veces tarda en mostrarlo. Tu coach ya lo vio.»
- Nunca se usan las palabras «fallaste», «retrocediste», «subiste» en rojo ni «perdiste tu racha».

**Bajadas rápidas** (más de ~1 % del peso por semana durante 2–3 semanas, umbral **[VALIDAR con nutrición]**): **no se celebra**. Se avisa al coach (§7) y el asesorado ve un mensaje neutro: «Registrado».

---

## 7. Antipatrones a evitar en ESTE producto y salvaguardas

| Antipatrón | Dónde podría aparecer | Salvaguarda |
|---|---|---|
| Racha diaria que se rompe | Hábitos (hoy «sin datos = no cumplido») | Contar semanas, usar comodines y congelar durante la pausa |
| Peso o kcal como marcador | Inicio muestra «238 kcal» en grande y Medidas pinta de verde todo lo que baja | Bajar el protagonismo de las kcal y usar colores neutros en medidas. Peso y kcal nunca dan puntos |
| Premiar pocas kcal | Mis comidas | Se premia *registrar* comidas, nunca un total bajo. No hay metas de kcal «más bajo = mejor» |
| Premiar sobreentrenamiento | «Hoy entrené» | Tope de 5 entrenos por semana, insignia de «Descanso inteligente» |
| Pesarse a diario | El historial demo muestra un registro cada 2 días | Puntos de medidas 1 vez por semana. Sugerir «mídete 1 vez por semana, misma hora» |
| Culpa por pago | La pausa por pago y «Faltan N días» en Inicio | La pausa no rompe la constancia, al volver se celebra con «Volviste» y el pago no aparece en tarjetas de progreso |
| Comparación corporal | Comunidad | Nunca hay fotos, peso ni medidas en contextos sociales |
| Notificaciones manipuladoras | Recordatorios futuros | Máximo 1 al día, elegido por el usuario, con texto amable y sin «¡Vas a perder…!» |
| Fotos como trofeo | Comparador antes/después | Solo privadas. No hay insignias por «gran cambio» en fotos |

**Señales de riesgo para que el coach intervenga** (aviso privado en la ficha, nunca visible para otros asesorados):
- **Sobre-registro:** medidas ≥4 veces en 7 días, o editar varias veces el mismo día.
- **Restricción extrema:** kcal registradas < ~1.000–1.200 durante ≥3 días seguidos **[VALIDAR umbral con nutrición]**, o comidas omitidas repetidas.
- **Bajada rápida:** más de ~1 % de peso por semana sostenido.
- **Ejercicio compulsivo:** `trained` 7 de 7 durante 2 semanas, o pasos > 25.000 varios días seguidos.
- **Sueño insuficiente sostenido:** menos de 5 h durante 5 días.
- **Desconexión:** 7 o más días sin registro estando activo y al día en el pago. Esto pide un mensaje de ánimo, no de alarma.

El aviso al coach debe sugerir una acción, por ejemplo «Escríbele sin juicio. Guía: *¿Cómo te has sentido con la comida esta semana?*», y un enlace a «cuándo derivar a un profesional de salud». **[VALIDAR con psicología y nutrición clínica]**

---

## Mini-wireframes

**A. Inicio del asesorado (rediseño de prioridad)**
```
┌──────────────────────────────────┐
│ Hola, Ana         Nivel Constante│
│ ◔ 3 semanas constantes · ☁️ 1    │
├──────────────────────────────────┤
│ Hoy  ●●●○  3 de 4 hábitos        │
│ 💧 8/8  🚶 3.150/8.000  😴 7,5h  │
│ [ + Anotar hábitos ]             │
├──────────────────────────────────┤
│ 🏆 Reto de Fit Demo              │
│ 3 entrenos esta semana  ●●○      │
│ Quedan 3 días                    │
├──────────────────────────────────┤
│ Rutina de hoy: Piernas  [Ver]    │
├──────────────────────────────────┤
│ 💬 Fit Demo  👏 «¡Qué semana!»   │
├──────────────────────────────────┤
│ Próximo hito: Doce entrenos 10/12│
└──────────────────────────────────┘
  (kcal y pago más abajo, en tamaño normal)
```

**B. Celebración al guardar**
```
┌──────────────────────────────────┐
│          ◯→◉  Día completo       │
│   Agua, pasos, sueño y entreno.  │
│        +7 pasos de constancia    │
│  🏅 Nueva: «Tres de tres»        │
│   [ Ver mi camino ]  [ Listo ]   │
└──────────────────────────────────┘
```

**C. Bandeja del coach «Para reconocer hoy»**
```
┌──────────────────────────────────┐
│ Para reconocer hoy (3)           │
│ AD Ana · completó «Tres de tres» │
│    [👏] [💪] [Nota]              │
│ FD Fabio · 4 semanas constantes  │
│    [👏] [💪] [Nota]              │
├──────────────────────────────────┤
│ Necesitan ánimo (2)              │
│ DD Diego · 9 días sin registrar  │
│ ⚠ Beto · revisar: medidas 5×/sem │
├──────────────────────────────────┤
│ Reto activo: Agua 7 días  5/8 ✓  │
│ [ + Lanzar reto ]                │
└──────────────────────────────────┘
```

---

## 8. Plan por fases

**Sprint 1 (MVP, ~2 semanas):**
- Las correcciones de base: colores de medidas, protagonismo de kcal y pago, y «sin registro» distinto de «no cumplido».
- Celebración micro (capa 1).
- Semanas constantes con comodines y congelado por pausa (capa 2, versión simple).
- Reacciones del coach sobre notas (capa 5).
- Insignias 1, 2, 3, 5, 6, 7, 9, 13, que se calculan con datos que ya existen y sin backend nuevo, como funciones puras al estilo de `habitos.js`.

**Fase 2 (~1 mes):**
- Retos del coach con plantillas.
- Metas personalizables.
- Bandeja «Para reconocer hoy» y señales de riesgo.
- Puntos y niveles, y el resto de insignias.

**Fase 3:**
- Comunidad opt-in: alias, ligas semanales, muro.
- Historias y consejos del coach.
- Check-in de energía y registro de fuerza por ejercicio.

### 15 mejoras priorizadas (impacto × esfuerzo)

| # | Mejora | Impacto | Esfuerzo |
|---|---|---|---|
| 1 | Medidas con color neutro y dirección por objetivo | Alto | S |
| 2 | Kcal y pago con menos protagonismo en Inicio | Alto | S |
| 3 | Celebración al guardar hábitos y al marcar «Hoy entrené» | Alto | S |
| 4 | «Sin registro» distinto de «no cumplido» | Medio | S |
| 5 | Semanas constantes con comodines y congelado por pausa | Alto | M |
| 6 | Reacciones del coach en 1 toque | Alto | S |
| 7 | Insignia «Volviste» y mensaje de regreso tras la pausa | Alto | S |
| 8 | Bandeja del coach «Para reconocer / Necesitan ánimo» | Alto | M |
| 9 | Retos del coach con 8 plantillas | Alto | M |
| 10 | Metas de hábito personalizables por el coach | Medio | S |
| 11 | Señales de riesgo privadas para el coach | Alto | M |
| 12 | Tarjeta «Mi camino» con hitos e insignias | Medio | M |
| 13 | Puntos de constancia con topes y niveles | Medio | M |
| 14 | Registro de fuerza por ejercicio y hito de fuerza | Medio | M |
| 15 | Comunidad opt-in (alias, liga semanal, muro) | Medio | L |

### Preguntas abiertas para el panel

- **UX:**
  - ¿Cabe la tarjeta de reto en Inicio sin empujar la rutina de hoy?
  - ¿Pasamos «Mis comidas» y «Mi rutina» a la barra inferior en lugar de Medidas o Fotos? Hoy están escondidas en «Más».
  - ¿Las celebraciones deben ser pantalla completa o un *toast*?
- **Coach de entrenamiento y nutrición:**
  - ¿Cuáles son los umbrales seguros (kcal mínimas, % de pérdida semanal, días de entreno máximos)?
  - ¿Qué cuenta como «técnica» medible: ver el video, una nota de RPE o un video enviado al coach?
  - ¿La meta de pasos y agua debe ajustarse por persona (8 vasos no es universal)?
  - ¿Obligar peso en cada registro de medidas favorece el sobre-registro?
- **Neurociencia y PNL:**
  - ¿Cuánta variabilidad poner en los mensajes de celebración para que no se habitúen sin volverse una «tragamonedas»?
  - ¿Qué lenguaje de identidad usamos («eres alguien que entrena») y qué evitamos?
  - ¿Cómo enmarcamos el mensaje de semana sin cambio corporal?
- **Para validar con usuarios:**
  - ¿Los asesorados colombianos quieren ranking o les incomoda? Hipótesis: la mayoría prefiere retos grupales a tablas.
  - ¿Los nombres de las insignias suenan naturales («parche», «pata de perro») en todas las regiones?
  - ¿Los coaches tendrán tiempo para la bandeja diaria (objetivo: menos de 3 min)?
