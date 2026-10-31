# Insignias con diseño, puntos y ranking del team: propuesta

> **Aviso:** este informe lo escribe un **panel SIMULADO por IA** que actúa como experto en gamificación de apps de salud, hábitos y comunidades de entrenamiento. No es la opinión de una persona real ni un concepto legal. Lo marcado **[VALIDAR]** hay que probarlo con coaches y asesorados reales. Lo marcado **[ABOGADO]** no se construye sin su respuesta.
>
> **Solo es una propuesta.** No se tocó el código ni se hizo ningún commit.
>
> **Fuentes leídas.** La copia principal del repositorio está en otra rama y no tiene estos archivos. Por eso los leí del árbol de trabajo más reciente, `.claude/worktrees/xl` (rama `claude/exportar-excel`, 26-oct-2026):
> - `equipo/diseno/04-gamificacion.md` y `03-neurociencia-pnl.md`
> - `constancia.js` (8 insignias, constancia semanal y comodines)
> - `etapa2.js` (retos del coach) y `analitica.js` (ranking privado del coach)
> - los conceptos legales 2, 5 y 6

---

## 0. Resumen para José, en 10 líneas

1. **Insignias.** Hoy son 8 y se ven como una lista con un número en un círculo. Propongo **6 categorías**, cada una con su forma y su color. También propongo **3 niveles (bronce, plata y oro)** y un dibujo de medalla de verdad. Las insignias pasarían de 8 a **unas 20 familias**, siempre por proceso y nunca por kilos.
2. **Puntos.** Se llamarían «Puntos de constancia». Se ganan por **registrar y cumplir**, nunca por el resultado del cuerpo. Tendrían topes por día y por semana, y nunca se pierden.
3. **Descanso.** El descanso planificado **da puntos** y entrenar los 7 días **no da más**. Las calorías no dan puntos nunca.
4. **El ranking que ven los asesorados choca con el concepto 5.** El abogado aprobó el ranking del coach con una condición: los asesorados **nunca** ven su posición, ni se comparan, ni ven datos de otros. Un ranking visible entre asesorados rompe esa condición. Lo mismo pasa con la variante «solo tu posición relativa».
5. **Qué se puede hacer ya:**
   - las insignias nuevas;
   - los puntos personales y privados, con niveles y la comparación contigo mismo;
   - una **meta colectiva del team** (una barra común sin nombres ni aportes de cada persona);
   - agregar «puntos» como criterio al ranking privado del coach.
6. **Qué espera al abogado:** cualquier tabla, liga o posición que vea el asesorado. Al final va la consulta, lista para enviar.

---

## 1. Sistema de insignias mejorado

### 1.1 Qué hay hoy

`constancia.js` calcula 8 insignias:
- Arrancó el parche
- Primera semana
- Primer mes
- Hidratado/a
- Pata de perro
- Buen dormir
- Tres de tres
- Volviste

En pantalla (`app.js`, vista «Insignias») cada una es un renglón con **un número en un círculo** y un texto. Por eso se ven «planas»: no hay forma, ni color por tipo, ni nivel, ni dibujo. Además, cuando se gana una ya no hay nada más que conseguir.

### 1.2 Categorías: cada una con su forma y su color

La idea es que se reconozca el tipo de insignia **por la silueta**, antes de leer el nombre. Así funciona aunque la persona no distinga colores.

| Categoría | Silueta de la medalla | Color base | Qué premia |
|---|---|---|---|
| **Primeros pasos** | Círculo con cinta | Turquesa (el de la app) | Empezar y sostener el primer mes |
| **Constancia** | Escudo | Azul profundo | Semanas constantes (con comodines) |
| **Hábitos** | Gota, huella y luna dentro de un círculo | Agua: celeste. Pasos: verde. Sueño: violeta | Cumplir agua, pasos y sueño varios días de la semana |
| **Entreno y descanso** | Hexágono | Naranja | Entrenar según el plan **y descansar** según el plan |
| **Registro** | Cuadrado redondeado (libreta) | Gris cálido | Registrar comidas, medidas y sentirse escuchado |
| **Retos** | Banderín | Coral | Retos del coach cumplidos |

### 1.3 Niveles: bronce, plata y oro

- Casi todas las familias tienen **3 niveles**. Un aro metálico alrededor de la medalla cambia de bronce a plata y a oro.
- **El nivel no depende solo del color.** También se marca con estrellas bajo la medalla (★, ★★, ★★★) y con la palabra escrita («Plata»).
- **Algunas insignias son únicas y no tienen niveles,** por ejemplo «Arrancó el parche» o «Volviste». «Volviste» no tiene niveles a propósito: **no se debe premiar abandonar muchas veces**.
- Los niveles **piden más tiempo, no más intensidad**. La plata pide más semanas que el bronce, nunca más horas de entreno ni menos comida.

### 1.4 Cómo se ven: el diseño de la medalla

```
   Ganada (oro)            En progreso (plata)        Aún no
   ╭───────────╮           ╭───────────╮            ╭───────────╮
  ╱  ◆ dorado  ╲          ╱  ◔ arco 3/8 ╲          ╱  silueta    ╲
 │   🛡 escudo   │        │   🛡 escudo   │        │   gris, sin   │
 │   ícono 💧   │        │   ícono       │        │   ícono       │
  ╲  ★ ★ ★     ╱          ╲  ★ ★ ☆     ╱          ╲  ☆ ☆ ☆     ╱
   ╰───────────╯           ╰───────────╯            ╰───────────╯
   «Agua firme · Oro»      «Faltan 5 semanas        «Cumple el agua 5 días
   ganada el 12 nov         para Plata»               de una semana»
```

Elementos de la medalla:
- **El aro** es metálico, con un degradado suave. Bronce: #B07A4A → #E0A877. Plata: #9AA3AD → #E3E8ED. Oro: #C99A2E → #F5D77A. Estos colores son orientativos; diseño los ajusta para modo claro y oscuro.
- **El centro** lleva la silueta de la categoría y un **ícono dibujado (SVG)**, no un emoji. Así se ve igual en iPhone y en Android.
- **La cinta inferior** muestra las estrellas del nivel.

Estados:
- **Ganada:** a todo color, con la fecha.
- **En progreso:** el aro se llena como una barra circular («3 de 8 semanas»).
- **Aún no:** silueta gris con una pista amable. Nunca hay una cuenta regresiva urgente.

Al ganar una insignia:
- Hay un brillo que cruza la medalla durante unos 0,6 segundos.
- Si el teléfono pide «reducir movimiento», no hay animación, solo un cambio de color.
- Se puede tocar «Compartir con mi coach», pero **no** con otros asesorados (ver §4).

Detalles técnicos (solo para el equipo):
- Las medallas se dibujan con SVG dentro de la página, a partir de una plantilla por categoría más el nivel.
- No hacen falta imágenes pesadas y funciona sin conexión (es una PWA).
- Accesibilidad: cada medalla lleva un texto para lector de pantalla, por ejemplo «Agua firme, nivel Plata, ganada el 12 de noviembre».

Pantalla «Mis insignias»:
- Arriba, la **próxima insignia** que está más cerca.
- Debajo, una rejilla de 3 columnas agrupada por categoría.
- En un teléfono de 390 px caben 3 medallas de unos 96 px por fila.

### 1.5 Catálogo propuesto (solo de proceso)

Las que ya existen se mantienen, con el mismo identificador en el código. Las marcadas **NUEVA** se agregan.

| Categoría | Insignia | Bronce | Plata | Oro | Datos |
|---|---|---|---|---|---|
| Primeros pasos | **Arrancó el parche** (existe) | Primer registro | — | — | ya existen |
| Primeros pasos | **Primera semana** (existe) | 4 días con registro en los primeros 7 | — | — | ya existen |
| Primeros pasos | **Primer mes** (existe) | 30 días y al menos 12 con registro | — | — | ya existen |
| Constancia | **Semanas constantes** NUEVA | 4 semanas | 12 semanas | 26 semanas | `Constancia.summary` (los comodines y las pausas ya cuentan) |
| Constancia | **Volviste** (existe) | Retomaste tras 7 días o más | — | — | ya existen |
| Constancia | **Registro honesto** NUEVA | 8 días registrados aunque no llegaste a la meta | 25 días | 60 días | ya existen: premia ser sincero, no ser perfecto |
| Hábitos | **Hidratado/a** (existe, ahora con niveles) | 1 semana con agua 5 de 7 | 4 semanas | 12 semanas | ya existen |
| Hábitos | **Pata de perro** (existe, ahora con niveles) | 1 semana con pasos 5 de 7 | 4 semanas | 12 semanas | ya existen. Más pasos que la meta **no** cuentan doble |
| Hábitos | **Buen dormir** (existe, ahora con niveles) | 1 semana con 5 noches entre 7 y 10 h | 4 semanas | 12 semanas | ya existen. Sigue el tope de 10 h |
| Hábitos | **Semana redonda** NUEVA | 1 semana con los 4 hábitos al menos 4 días cada uno | 4 semanas | 12 semanas | ya existen |
| Entreno y descanso | **Tres de tres** (existe, ahora con niveles) | 1 semana con 3 entrenos | 4 semanas | 12 semanas | ya existen. **Más de 5 entrenos no cuentan más** |
| Entreno y descanso | **Entrenos acumulados** NUEVA | 12 | 50 | 150 | ya existen. Se cuentan como máximo 5 por semana |
| Entreno y descanso | **Descanso inteligente** NUEVA | 1 semana con el descanso del plan respetado | 4 semanas | 12 semanas | falta un toque «Hoy descansé (estaba en mi plan)» |
| Entreno y descanso | **Técnica primero** NUEVA | Viste la técnica de todos los ejercicios de una rutina | 5 rutinas | 15 rutinas | falta registrar «vio ejercicio» en `rutinas-view` |
| Registro | **Plato a plato** NUEVA | 10 días con al menos 2 comidas registradas | 40 días | 100 días | ya existen. **Las calorías no importan** |
| Registro | **Midiendo con cabeza** NUEVA | 4 registros de medidas separados por al menos 6 días | 12 | 26 | ya existen. Medirse más seguido **no** suma |
| Registro | **Te escucho** NUEVA | 4 semanas respondiendo «¿cómo te sentiste?» | 12 | 26 | falta un check-in semanal de 1 toque |
| Retos | **Reto cumplido** NUEVA | 1 reto del coach | 5 retos | 15 retos | ya existen los retos en `etapa2.js` |
| Retos | **Equipo** NUEVA (solo si hay meta colectiva) | Estuviste en 1 meta del team cumplida | 4 metas | 12 metas | meta colectiva (§3, variante C) |

**Reglas fijas para cualquier insignia, hoy o en el futuro:**
- Nunca dan insignias el peso, los kilos, los centímetros, el porcentaje de grasa, las calorías, el IMC ni las fotos.
- **Ninguna insignia pide 7 de 7.** Las metas son siempre «X de N»: 5 de 7, nunca 7 de 7.
- Nunca se premia «más» por encima de la meta sana: pasos de más, entrenos de más, dormir más de 10 h o comer menos.
- **Saco las insignias de fotos** que había propuesto antes («Mi espejo»). La foto corporal es un dato sensible y premiarla presiona a quien no quiere tomársela.
- Las insignias **nunca se pierden** y no tienen fecha de caducidad.

---

## 2. Sistema de puntos

### 2.1 Principios

1. **Se premia lo que la persona controla,** es decir, registrar y cumplir un hábito. **Nunca se premia lo que el cuerpo responde.**
2. Los puntos **informan, no controlan.** Sirven para subir de nivel y para la meta colectiva. **No se canjean por dinero ni por premios de la app** (ver los riesgos y la pregunta 9 al abogado).
3. **Nunca se pierden puntos** y nunca se baja de nivel.
4. Los puntos de un día **se recalculan desde lo registrado.** No se acumulan por cada clic. Si la persona edita el mismo día cinco veces, sigue sumando lo mismo.

### 2.2 Qué da puntos y cuántos

| Acción | Puntos | Tope | Por qué |
|---|---|---|---|
| **Registrar el día** (cualquier hábito, comida o medida) | 2 | 1 vez al día | El acto central es aparecer |
| **Agua cumplida** (8 vasos o la meta que fije el coach) | 1 | 1 al día | Tomar más agua no suma más |
| **Pasos cumplidos** (8.000 o la meta del coach) | 1 | 1 al día | 25.000 pasos valen lo mismo que 8.000 |
| **Sueño cumplido** (entre 7 y 10 h) | 1 | 1 al día | Dormir más de 10 h no suma |
| **Entreno hecho** | 3 | 1 al día y **como máximo los entrenos del plan por semana** (5 si el coach no fija un número) | Entrenar por encima del plan no suma |
| **Descanso planificado** («Hoy descansé, estaba en mi plan») | 2 | Los días de descanso del plan (al menos 1 y como máximo 3 por semana) | El descanso también es entrenamiento |
| **Registrar comidas** (al menos 2 en el día) | 1 | 1 al día | Cuenta registrar. **Las calorías no importan** |
| **Registrar medidas** | 3 | **1 vez por semana,** con al menos 6 días entre registros | Premia registrar, nunca el resultado. Desalienta pesarse a diario |
| **Check-in semanal «¿cómo te sentiste?»** (1 toque) | 2 | 1 por semana | Le da información al coach y no tiene que ver con el cuerpo |
| **Leer una nota nueva del coach** | 1 | 1 al día | Refuerza la relación con el coach |
| **Reto del coach cumplido** | 10 | Como máximo 2 retos con puntos por semana | Evita que se lancen retos solo para inflar puntos |
| **Semana constante** (bono del lunes) | 5 | 1 por semana | Premia la semana, no la racha diaria |
| **Volver tras 7 días o más sin registrar** | 5 | 1 vez al mes | Bienvenida sin culpa, sin premiar el abandono |

**Topes:**
- **Tope diario: 12 puntos,** sin contar los bonos semanales (reto y semana constante).
- **Tope semanal: 80 puntos.** Un día «perfecto» da unos 10 puntos (2 + 1 + 1 + 1 + 3 + 1 + 1). Una semana muy buena ronda 60 a 75. Nadie puede despegarse del resto con volumen. **[VALIDAR]** las cifras con 2 coaches del piloto.

**Fotos:** **sin puntos.** Es un cambio frente a mi informe anterior. El motivo es el mismo que con las insignias de fotos.

**Niveles personales** (los ve solo la persona y su coach). Los nombres son de proceso y no de cuerpo:

| Nivel | Puntos acumulados |
|---|---|
| Arranque | 0 |
| En marcha | 150 |
| Constante | 500 |
| Disciplinado/a | 1.200 |
| Ejemplo | 2.500 |
| Leyenda del parche | 4.500 |

Con unos 50 puntos por semana, Constante se alcanza en unas 10 semanas y Leyenda en más o menos un año y medio. **[VALIDAR]**

### 2.3 Topes y antitrampa

Los datos los anota la propia persona: no hay báscula conectada ni podómetro. **No existe un antitrampa perfecto, y no hay que perseguirlo.** La mejor defensa es que **hacer trampa no sirva para nada**: no hay premios en dinero, no hay posición pública (al menos en la fase 1) y los topes son bajos.

Medidas concretas:
1. **Topes diarios y semanales** como los de la tabla. Por mucho que alguien invente, la ganancia es como máximo 12 puntos al día.
2. **Puntos solo por hoy o ayer.** Un registro con más de 48 h de atraso se guarda, pero no da puntos. El mensaje no juzga: «Guardado. Los puntos cuentan para hoy y ayer». **[VALIDAR]** que no desanime a registrar tarde.
3. **Valores raros se guardan sin puntos y sin regaño.** Por ejemplo: más de 60.000 pasos, más de 8 L de agua o más de 14 h de sueño. El dato le llega al coach como «dato para revisar».
4. **Reto cumplido con datos de verdad.** En `etapa2.js` el asesorado marca él mismo los días del reto. Para dar puntos, el día marcado debe coincidir con el hábito registrado ese día; por ejemplo, para el reto de agua, que haya agua registrada. Si solo hay una marca sin registro, cuenta para el reto pero no da puntos.
5. **El coach ve el detalle de los puntos** de cada persona: de dónde salen y cuántos por día. Es una vigilancia social suave y con respeto, y encaja en el ranking privado ya aprobado.
6. **Los puntos no se transfieren, no se regalan y no se compran.**

### 2.4 Días de pausa

La pausa puede ser por pago (concepto 2, punto P1) o una pausa que marque el coach por vacaciones o enfermedad.

- **No se ganan ni se pierden puntos.** La pausa ya congela la constancia (`frozenDays` en `constancia.js`) y los puntos siguen la misma lógica.
- **Los registros que haga la persona en modo autónomo no generan puntos.** El concepto 2 (P1) dice que el coach **no** debe ver esos registros durante la pausa. Si dieran puntos y el coach viera los puntos al volver, el coach se enteraría indirectamente de lo que se registró en la pausa.
- **El nivel y las insignias se conservan.** El mensaje dice: «Tus puntos y tu nivel están guardados. Vuelven a sumar cuando se reactive tu plan».
- **Al volver:** si la pausa duró 7 días o más se aplica el bono «Volviste» (5 puntos, 1 vez al mes).
- **Meta colectiva y ligas:** quien está en pausa **no cuenta** para la meta del team esa semana, así que la meta baja proporcionalmente. Nadie ve que esa persona está en pausa.

### 2.5 Cómo evitar premiar la sobre-restricción y el sobre-entrenamiento

| Riesgo | Regla de puntos |
|---|---|
| Comer muy poco | **Ningún punto depende de las calorías.** Registrar comidas da lo mismo con 800 kcal que con 2.500. Tampoco hay puntos por «saltarse una comida» ni por ayunar |
| Registrar menos comidas para «verse mejor» | Se premia *registrar* al menos 2 comidas. Registrar más no resta |
| Entrenar todos los días | Los entrenos solo suman hasta el número del plan (5 por defecto). El séptimo día no da puntos de entreno, **y el descanso planificado sí da** |
| Entrenar lesionado o enfermo | Hay un botón «Hoy no entreno: me siento mal o tengo dolor» que **cuenta como descanso planificado** (2 puntos). Así, saltarse el entreno por salud no hace perder nada. Si la persona lo marca 3 o más veces en 14 días, el coach recibe un aviso discreto |
| Caminar sin parar | Los pasos por encima de la meta no suman. Más de 25.000 pasos varios días seguidos es una señal de riesgo para el coach (ver mi informe 04, §7) |
| Dormir poco para «rendir» | El sueño solo suma entre 7 y 10 h |
| Pesarse a diario | Las medidas suman 1 vez por semana |
| Persona con alerta de seguridad (concepto 2, L6) | **Los puntos no se tocan,** para no castigarla ni delatarla. Lo que se agrega es que el coach pueda activar en su ficha un **«modo tranquilo»**: la persona deja de ver puntos y niveles y solo ve sus insignias, con un texto neutro. El coach decide y lo conversa con la persona |

Además, en el perfil del asesorado habría un interruptor **«Ocultar mis puntos».** Algunas personas viven mejor sin números, y lo coherente es dejarles elegir (autonomía).

---

## 3. Ranking del team: 4 variantes

Lo que pide José es que los asesorados del mismo coach vean un **ranking de PUNTOS**, nunca de progreso corporal. Sobre eso, conviene tener presente desde el inicio el **concepto 5, punto 2**: el ranking está aprobado **solo para el coach**, con la condición de que «los clientes nunca deben ver su posición, compararse entre sí, ni ver datos de otros usuarios».

| | **A. Ranking completo del team** | **B. Ligas semanales por grupos pequeños** | **C. Meta colectiva del team** | **D. «Tu posición relativa»** |
|---|---|---|---|---|
| **Qué ve el asesorado** | Lista con todos los alias del team, sus puntos de la semana y su posición | Su liga de 5 a 8 alias con puntos y posiciones | Una barra común: «Entre todos: 1.840 de 2.400 puntos esta semana · 14 personas sumando». Su propio aporte solo lo ve él | Solo una frase: «Esta semana estás en el grupo de arriba». No ve a nadie más |
| **Reinicio** | Semanal (cada lunes). Nunca hay una tabla histórica | Semanal. Se recomienda **no** tener ascensos ni descensos, solo grupos nuevos por sorteo o por actividad parecida | Semanal, o mensual para metas grandes («300 entrenos en noviembre») | Semanal |
| **Opt-in** | Obligatorio: apagado por defecto, con autorización aparte y revocable | Obligatorio, igual que en A | Recomendado: activado para quien acepta los puntos y con opción de salir. **[ABOGADO: confirmar]** | Obligatorio |
| **Alias** | Sí. Alias y avatar elegidos de una lista, nunca el nombre ni la foto | Sí | No hace falta: no aparece nadie | No hace falta |
| **Cómo protege a quien va último** | Mal. Aunque se oculte el final de la tabla, la persona sabe que está abajo | Algo mejor: en grupos pequeños y con personas de actividad parecida, se pierde por poco. Pero en una liga de 5 alguien siempre es el 5.º | **Del todo: no hay último.** Cualquier aporte suma | Se puede suavizar con tercios en vez de números. Aun así, quien está en el tercio de abajo lo sabe |
| **Pros** | Simple de entender. Motiva mucho a los 3 primeros | Competencia más justa. El reinicio semanal da una nueva oportunidad. Probado en apps de idiomas | Coopera en vez de competir. Da pertenencia. No compara cuerpos ni personas. Es la más segura | No expone a nadie ante otros. Es fácil de construir |
| **Contras** | Comparación social directa. Desmotiva a la mitad de abajo. En teams de 6 a 15 personas **el alias se adivina fácil**. Invita a hacer trampa | Hacen falta al menos 10 a 12 personas con opt-in para armar 2 ligas. Sigue mostrando datos de otros. Es más complejo de construir | Motiva menos a quien quiere competir. En teams muy pequeños (menos de 5) el total podría revelar cuánto aportó cada uno | **Sigue siendo «ver su posición» y «compararse».** No es una salida legal, solo es más discreta |
| **Choque con el concepto 5** | **Choque total:** posición, comparación y datos de otros | **Choque total** | **Bajo:** no hay posiciones ni datos individuales de otros, solo una suma anónima | **Choque:** la persona ve su posición, aunque sea aproximada |
| **Mi nota** | No la recomiendo, ni con permiso del abogado | Es la mejor opción competitiva **si** el abogado la permite | **Recomendada para empezar** | No la recomiendo. Para los asesorados vale más compararse con su propia semana anterior |

### Reglas de la variante C (meta colectiva) para que sea segura

1. **Mínimo 5 participantes** en la semana. Con menos, la barra no aparece y el texto dice: «La meta del team se activa cuando sean 5 o más».
2. Se muestra **solo el total** y el número de personas que suman. **Nunca** se muestra quién aportó cuánto, ni quién no aportó, ni mensajes del tipo «Ana acaba de sumar 10».
3. La meta la fija el coach o se calcula sola: unos 45 puntos por cada participante activo. Quien está en pausa no cuenta.
4. Si la meta se cumple, todos los que aportaron algo ganan la insignia «Equipo» y el coach puede felicitar al grupo en un toque.
5. **Si no se cumple, no pasa nada malo:** «Esta semana llegamos al 82 %. El lunes empezamos de nuevo».
6. **Variante sin puntos:** la meta puede ser de entrenos o de días con registro («Entre todos: 120 entrenos este mes»). Algunos coaches la entenderán mejor.

### Alternativa segura a «tu posición»: compararse contigo mismo

Esta comparación **no** choca con el concepto 5 porque no involucra a nadie más:
- «Esta semana sumaste 58 puntos, 6 más que la semana pasada.»
- «Tu mejor semana fue de 71.»

Funciona muy bien para la motivación y no tiene costo legal.

---

## 4. Riesgos

### 4.1 Riesgos de motivación

| Riesgo | Qué es | Cómo se mitiga |
|---|---|---|
| **Efecto de sobrejustificación** | Si la persona empieza a entrenar «por los puntos», cuando los puntos dejan de emocionarla (pasa en semanas) puede dejar también el hábito. La motivación externa desplaza a la propia | Puntos pequeños y **informativos**, con mensajes del tipo «esto dice de ti», no «ganaste». Sin premios materiales. Las insignias se ganan por sorpresa, sin prometerlas por adelantado. El reconocimiento del coach pesa más que los puntos. Se pueden ocultar los puntos. Los mensajes hablan de identidad («Eres alguien que aparece»), como en el informe 03 |
| **Habituación** | Los mismos «+3» todos los días dejan de sentirse a las 2 o 3 semanas | La celebración grande queda para insignias y semanas. Los mensajes cambian, pero **sin azar tipo tragamonedas** |
| **Desmotivar a quien va abajo** | En cualquier tabla, la mitad de abajo tiende a abandonar | Meta colectiva y comparación contigo mismo. Nada de tablas en la fase 1 |
| **Jugar el sistema** | Registrar para sumar y no para cuidarse | Topes, ningún premio canjeable y ninguna posición pública |
| **Presión del coach** | Un coach podría usar los puntos para regañar («solo sumaste 20») | Guía para coaches: los puntos sirven para reconocer, nunca para reclamar. Plantillas de mensaje positivas |

### 4.2 Riesgos de salud

| Riesgo | Cómo podría aparecer | Mitigación |
|---|---|---|
| **Conducta alimentaria de riesgo** | Competir puede llevar a restringir comida «para rendir más». Si algún día se mostraran kilos, se compararían cuerpos | Ningún punto depende de calorías, peso ni medidas. Comidas: se premia registrar. Las alertas del concepto 2 (L6) siguen igual. Existe el «modo tranquilo». Las líneas de ayuda **106 y 192** se ponen a mano en la pantalla de puntos con el texto aprobado en L6c |
| **Lesiones y sobre-entrenamiento** | Querer subir en la tabla lleva a entrenar 7 de 7 o con dolor | Entrenos con tope según el plan. Puntos por descanso. El botón «me siento mal» cuenta como descanso. Si el entreno se marca 7 de 7 durante 2 semanas, avisa al coach |
| **Falta de sueño** | Madrugar o trasnochar para entrenar | El sueño solo suma entre 7 y 10 h |
| **Pesarse a diario** | Querer «puntos de medidas» | Las medidas suman 1 vez por semana. Ninguna insignia premia medirse más |
| **Ansiedad por la meta** | Notificaciones del tipo «te faltan 5 puntos» | **No** se notifica sobre puntos. Como máximo 1 recordatorio de registro al día, elegido por la persona |
| **Menores de edad** | Si hay asesorados menores, la competencia les pesa más | Excluirlos de cualquier variante social. **[ABOGADO]** |

### 4.3 Riesgos de privacidad (el más importante)

1. **Un ranking visible entre asesorados significa compartir datos personales entre personas.** Los puntos salen de hábitos de salud: entrenos, sueño y comidas registradas. Eso probablemente es **dato sensible** según la Ley 1581 de 2012. Mostrar «Zorro-27 · 64 puntos · 3.º» a otros asesorados es hacer circular ese dato fuera de la relación con el coach.
2. **Esto CHOCA con la condición del concepto 5, punto 2.** Ese punto aprobó el ranking privado del coach con una condición literal: «Debe ser estrictamente privado; los clientes nunca deben ver su posición, compararse entre sí, ni ver datos de otros usuarios». Choca así con las variantes:
   - **A** (ranking completo) y **B** (ligas): con las tres partes de la condición.
   - **D** (posición relativa): con «ver su posición» y «compararse».
   - Por eso **ninguna de las tres se puede construir sin una consulta nueva al abogado y su respuesta por escrito.**
3. **El alias no basta para anonimizar en un team pequeño.** Con 8 a 15 asesorados que muchas veces se conocen (el mismo gimnasio, el grupo de WhatsApp del coach), «Zorro-27» se adivina en días. El coach además sabe quién es quién.
4. **Capturas de pantalla.** Lo que se muestra a otros puede salir de la app sin control.
5. **Revocar y borrar.** Si alguien retira el permiso, su alias tiene que desaparecer al instante, incluso de las semanas pasadas.
6. **El punto 6 del concepto 5** prohíbe clasificar a los coaches por kilos o centímetros. La misma lógica aplica a los asesorados: **cualquier tabla debe ser de puntos de proceso.**
   - **Observación aparte:** el ranking privado que hoy ve el coach (`analitica.js`) tiene un criterio «Progreso a la meta» que ordena por kilos o cintura. Lo aprobó el punto 2, pero conviene preguntarle al abogado si el punto 6 también lo alcanza (pregunta 10).
7. **La meta colectiva** usa datos de otros, pero solo como una suma sin nombres y con un mínimo de 5 personas. El riesgo es bajo. Por prudencia la incluyo en la consulta como confirmación, pero **no bloquea** construirla ni probarla.

---

## 5. Recomendación final por fases

### Fase 1: ya, sin abogado (unas 2 a 3 semanas de trabajo)

1. **Insignias con diseño.** Medallas SVG por categoría, niveles bronce, plata y oro, estados (ganada, en progreso, aún no) y una celebración que respeta «reducir movimiento». Se reutilizan las 8 que existen y se agregan primero las que ya tienen datos: Semanas constantes, Registro honesto, Semana redonda, Entrenos acumulados, Plato a plato, Midiendo con cabeza y Reto cumplido.
2. **Puntos personales y privados.** Con la tabla de §2.2, topes, niveles, «Ocultar mis puntos» y «modo tranquilo». **Los ven solo la persona y su coach.**
3. **Comparación contigo mismo:** «6 más que la semana pasada» y «tu mejor semana».
4. **Descanso planificado y «me siento mal»** como acciones que suman.
5. **Criterio «Puntos de la semana» en el ranking privado del coach** (`analitica.js`). Encaja en lo que ya aprobó el punto 2 del concepto 5: el coach ya ve constancia y entrenos de su gente.
6. **Meta colectiva del team (variante C),** con mínimo 5 personas y sin aportes individuales visibles. Se puede construir y probar ya. Antes de abrirla en producción, se aprovecha la consulta para pedir la confirmación del abogado (pregunta 7), que es barata.
7. **Retos:** puntos solo cuando el día marcado coincide con el hábito registrado.

### Fase 2: espera al abogado

8. **Ligas semanales con alias (variante B),** opt-in y en grupos de 5 a 8. Solo si el abogado responde que sí, con los textos que él redacte: autorización, aviso y cláusula del coach.
9. **No construir nunca las variantes A ni D,** aunque el abogado las permitiera. El daño de motivación y de salud supera lo que ganan.

### Fase 3: después de medir

10. Revisar con datos del piloto:
    - cuántas personas ocultan los puntos;
    - si la constancia sube o baja frente a antes;
    - si aparecen más alertas de entreno 7 de 7 o de restricción.

    Si los puntos no mueven la constancia en 6 a 8 semanas, simplificarlos y dejar solo insignias y la meta colectiva. **[VALIDAR]**

---

## 6. Consulta al abogado (lista para enviar)

> **Asunto:** Consulta 7: ranking de puntos visible entre asesorados del mismo coach («Pérdida de Grasa»)
>
> Estimado doctor:
>
> En el concepto 5 del 25 de octubre de 2026, punto 2, usted aprobó el ranking privado del coach con esta condición: «Debe ser estrictamente privado; los clientes nunca deben ver su posición, compararse entre sí, ni ver datos de otros usuarios». Queremos evaluar una función nueva que **modificaría esa condición**, y le pedimos un concepto antes de construirla.
>
> **Lo que proponemos**
> - Los asesorados ganan «puntos de constancia» por registrar y cumplir hábitos (agua, pasos, sueño, entrenos según el plan, descanso planificado), por registrar comidas y medidas (sin importar el resultado) y por cumplir retos del coach.
> - Los puntos **nunca** dependen del peso, los centímetros, las calorías ni las fotos. No son canjeables por dinero.
> - **Opción 1 (la que preferimos):** «ligas» semanales de 5 a 8 asesorados del **mismo coach**. Cada uno ve el **alias** (elegido de una lista, sin nombre real ni foto), los **puntos de la semana** y la **posición** de los demás miembros de su liga. La tabla se reinicia cada lunes y no hay histórico.
> - **Opción 2:** que cada asesorado vea solo su posición aproximada dentro del team («estás en el grupo de arriba»), sin ver a nadie más.
> - **Opción 3:** una «meta colectiva» del team. Se muestra solo la suma total de puntos o de entrenos de la semana y cuántas personas participan, con un mínimo de 5. No se muestra ningún dato individual de otra persona.
> - La participación en las opciones 1 y 2 sería **voluntaria (opt-in)**: apagada por defecto, separada de las demás autorizaciones, revocable en cualquier momento y sin afectar el servicio.
>
> **Preguntas**
> 1. **Compatibilidad con el concepto 5:** ¿se pueden implementar las opciones 1 y 2 modificando la condición del punto 2? ¿O el riesgo es tal que nos recomienda no hacerlo? Si se pueden, ¿qué condiciones mínimas exige?
> 2. **Naturaleza del dato:** ¿los puntos de constancia, al calcularse a partir de hábitos de salud (entrenos, sueño, registro de comidas y medidas), son **datos sensibles** (Ley 1581 de 2012, art. 5)? ¿Mostrarlos a otros asesorados es una **circulación o transmisión** que requiere autorización previa, expresa y facultativa?
> 3. **Alias:** ¿basta un alias sin nombre ni foto para considerar que no se muestran «datos de otros usuarios»? En teams pequeños (6 a 15 personas que a veces se conocen) el alias puede adivinarse. ¿Exige un tamaño mínimo de grupo u otras medidas (alias aleatorio, cambio periódico, prohibir alias con el nombre)?
> 4. **Opt-in:** ¿nos redacta el **texto literal de la autorización** para participar en la liga? Debería decir qué se muestra, a quién, por cuánto tiempo, que es voluntaria y cómo se revoca. Al revocar, ¿basta con quitar el alias de inmediato de todas las tablas, también de las semanas pasadas?
> 5. **Política y versión:** ¿esta finalidad («gamificación social entre asesorados del mismo coach») exige una nueva versión de la Política de Tratamiento de Datos (v1.2) con aviso en pantalla? ¿Exige reaceptación? ¿Nos da el texto de la finalidad y del aviso?
> 6. **Posición relativa (opción 2):** ¿mostrar solo «estás en el grupo de arriba» sin ver a nadie más cuenta como «ver su posición» y «compararse», es decir, prohibido por la condición vigente?
> 7. **Meta colectiva (opción 3):** con una suma sin datos individuales y un mínimo de 5 participantes, ¿es compatible con la condición actual del punto 2 sin trámite adicional? ¿Basta con mencionarla en la política? ¿Debe ser opt-in u opt-out?
> 8. **Acuerdo del coach:** ¿hace falta una cláusula para que el coach no revele quién está detrás de cada alias, no use la liga para presionar o avergonzar y responda por capturas o divulgaciones? ¿Nos la redacta?
> 9. **Premios:** si un coach ofrece por su cuenta premios a los primeros de la liga (descuentos, ropa, una sesión gratis), ¿se convierte en un concurso o promoción con regulación especial? ¿Debemos prohibirlo en los términos?
> 10. **Ranking privado actual:** el punto 6 del concepto 5 prohíbe clasificar a los **coaches** por kilos o centímetros. ¿Alcanza ese criterio al ranking privado que el coach ve de **sus asesorados**, que hoy incluye «Progreso a la meta» (kilos o cintura)? ¿Debemos dejarlo solo en constancia, entrenos y puntos?
> 11. **Menores de edad:** si hubiera asesorados de 14 a 17 años, ¿deben quedar excluidos de cualquier liga o meta colectiva? ¿Basta con la edad declarada al registrarse?
> 12. **Responsabilidad:** si un asesorado se lesiona o restringe su alimentación por competir en la liga, ¿qué cláusula o aviso nos protege, además de las cláusulas 7.3 y 7.4 del acuerdo del coach? ¿Recomienda un texto de advertencia visible en la liga?
>
> Para que no haya dudas sobre el alcance: mientras no recibamos su concepto, **los asesorados no verán ninguna tabla, liga ni posición.** Solo construiremos insignias, puntos personales privados (visibles para el asesorado y su coach) y, si usted lo confirma, la meta colectiva.
>
> Quedamos atentos. Agradecemos que, como en conceptos anteriores, nos entregue los textos literales que debamos reproducir.
>
> Cordialmente,
> José Granados
> Responsable del tratamiento, «Pérdida de Grasa»

---

*Panel simulado por IA. No se modificó el repositorio ni se hizo ningún commit. Las cifras de puntos, niveles y topes son una propuesta inicial que hay que validar en el piloto.*
