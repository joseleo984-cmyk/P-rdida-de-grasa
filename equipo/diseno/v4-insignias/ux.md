# Insignias con diseño de verdad, puntos y ranking del team: propuesta UX/UI

> **Aviso:** esta es la opinión SIMULADA, generada por IA, de una especialista en UX/UI de apps móviles de salud y hábitos. Es una propuesta: no se tocó el código ni se hizo ningún commit. Lo marcado con **[VALIDAR]** hay que probarlo con coaches y asesorados reales, y lo marcado con **[ABOGADO]** necesita concepto jurídico antes de construirse.

Leí estos archivos: `01-ux-ui.md` (mi informe anterior), `04-gamificacion.md`, `v2-estilo/README.md` y `estilo.html` (tokens: fondo `#07100f`, superficies `#0f1918` y `#16221f`, turquesa `#2dd4bf` / `#5eead4`, brillo `rgba(45,212,191,.55)` y Bricolage Grotesque en títulos). También leí `constancia.js` (las 8 insignias), `concepto-5-2026-10-25.md` y el código actual de Progreso → Insignias (`app.js` `renderInsignias`, `index.html` `#view-insignias`, `styles.css` `.insig*`) y del ranking privado del coach (`analitica-view.js`).

---

## 0. Lo primero que José debe saber (antes de leer lo demás)

**El punto 2 del pedido choca con el concepto jurídico 5.** El abogado aprobó el ranking **solo para el coach**, con esta condición literal: *«los clientes nunca deben ver su posición, compararse entre sí, ni ver datos de otros usuarios»*. Un ranking de puntos que ven los asesorados del team incumple las tres partes de esa condición, aunque solo muestre puntos y no datos del cuerpo.

Además, hoy la app promete lo contrario en dos textos:
- Pantalla Insignias (`index.html`): *«…y no hay ranking entre asesorados.»*
- Ranking del coach (`analitica-view.js`): *«Solo tú lo ves. Tus asesorados nunca ven un ranking.»*

**Mi recomendación de UX:**
1. **Ya se puede hacer:** insignias con diseño de verdad, puntos personales y una columna «Puntos» en el ranking **privado** del coach.
2. **Hacer solo si el abogado responde «sí» a una consulta nueva (concepto 6):** el ranking visible para el team. En la sección 3 dejo el diseño completo para que esté listo si lo aprueba.
3. **Mientras tanto,** como alternativa sin comparación individual: una **meta colectiva del team** (todos suman a una barra común y nadie ve cuánto puso cada uno). También hay que preguntarla al abogado, pero el riesgo es mucho menor **[ABOGADO]**.

---

## 1. Diagnóstico de las insignias actuales

| Hoy | Por qué no funciona |
|---|---|
| 8 círculos turquesa iguales, con un número del 1 al 8 | El número no dice nada: «5» no significa «agua». Todas se ven iguales, así que ganar una no se siente distinto de ganar otra. |
| Ganada y pendiente se distinguen casi solo por el color | Falla para daltónicos y con el sol en la pantalla. |
| Sin niveles | Cuando se gana «Hidratado/a», ya no queda nada que perseguir en ese hábito. |
| Sin detalle | No se puede tocar para ver qué es, cuándo se ganó ni qué falta. |
| Celebración: un círculo con número en el diálogo «Mi día» | Es plana y no aprovecha el brillo del estilo v2. |

Lo que sí funciona y hay que conservar: los nombres con sabor local, la pista en positivo («agua: 3 de 5 días»), el `sr-only` con la descripción y la regla de que nunca se gana nada por peso, kcal ni centímetros.

### Base común para las 3 propuestas

**Categorías.** Reorganizo las 8 insignias actuales y dejo espacio para las que vienen de 04:

| Categoría | Insignias actuales | Glifo (dibujo propio en SVG) | Futuras (04) |
|---|---|---|---|
| **Mi camino** (hitos de una sola vez) | Arrancó el parche, Primera semana, Primer mes | bandera, calendario 7, calendario 30 | Constancia 4 semanas |
| **Hábitos** | Hidratado/a, Pata de perro, Buen dormir | gota, huella, luna | Semana redonda, Plato a plato |
| **Entreno** | Tres de tres | pesa | Doce entrenos, Descanso inteligente, Técnica primero |
| **Actitud** | Volviste | flecha que regresa | Registro honesto, Midiendo con cabeza |
| **Retos del coach** | (no hay todavía) | estrella con banderín | Reto cumplido |

**Niveles bronce, plata y oro.** Solo aplican a las insignias que se repiten (Hábitos y Entreno). Siempre suben por **cuántas semanas** se repite el logro, nunca por hacer más:

| Insignia | Bronce | Plata | Oro |
|---|---|---|---|
| Hidratado/a, Pata de perro, Buen dormir | 1 semana con 5 de 7 días | 4 semanas (no tienen que ser seguidas) | 12 semanas |
| Tres de tres | 1 semana con 3 entrenos | 4 semanas | 12 semanas |

- Pata de perro **no** sube por caminar más: 20.000 pasos valen lo mismo que 8.000. Tres de tres **no** sube por entrenar 6 o 7 días.
- Mi camino, Actitud y Retos son de **una sola vez**, sin nivel. «Volviste» nunca tiene niveles, porque premiar volver muchas veces sería premiar irse.
- **Nunca se pierde un nivel.**
- Se calcula con datos que ya existen (`per[semana]` en `constancia.js`). No hace falta SQL. **[VALIDAR]** las curvas 1/4/12.

**Colores de metal sobre `#07100f`** (contraste aproximado, calculado con la fórmula WCAG):

| Nivel | Oscuro | Contraste | Claro (sobre blanco) | Marca que no depende del color |
|---|---|---|---|---|
| Bronce | `#cd8b57` | ≈ 6,8:1 | `#8a5a2b` | 1 punto bajo la insignia `●○○` y la palabra «Bronce» |
| Plata | `#c7d2d4` | ≈ 12:1 | `#5b6b70` | `●●○` y «Plata» |
| Oro | `#f2c14e` | ≈ 11:1 | `#8a6500` | `●●●` y «Oro» |
| Sin nivel (hito) | turquesa `#2dd4bf` | ≈ 10:1 | `#0f766e` | sin puntos |
| Bloqueada | contorno `#5d706c` | ≈ 3,6:1 (mínimo para gráficos: 3:1) | `#8a9a97` | contorno punteado y candado pequeño |

**Reglas técnicas para las tres propuestas:**
- Todo va en **SVG inline o CSS**. Los glifos se dibujan a mano con `<path>` simples. No hay imágenes externas, emojis como gráfico, librerías de íconos ni licencias.
- Un solo `<svg>` oculto con `<defs>` (degradados de metal y `<symbol>` por marco y por glifo). Cada insignia es `<svg><use href="#marco-…"/><use href="#g-agua"/></svg>`, así los 8 a 20 dibujos pesan pocos KB.
- El brillo se hace con `filter: drop-shadow(0 0 10px var(--glow))` **solo en las ganadas** y sin animación permanente, para no gastar batería en Android de gama baja.
- Funciona en modo claro: sin brillo, con sombra suave y los metales oscuros de la tabla.

**Accesibilidad común:**
- Cada insignia es un `<button>` (≥ 44 × 44 px) dentro de una lista, con el SVG en `aria-hidden="true"`. El nombre accesible es una frase completa. Ejemplos: «Hidratado/a. Nivel plata. Ganada el 12 de octubre. Para oro: 6 de 12 semanas.» y «Pata de perro. Aún no la tienes. Pasos: 3 de 5 días esta semana.»
- El texto (nombre, fecha, pista) va **debajo**, en HTML, nunca dentro del SVG. Así sigue el tamaño de letra del sistema y no se corta al 200 %: el nombre baja a dos líneas sin elipsis.
- Hay tres señales para saber si una insignia está ganada, y ninguna es solo el color: **forma** (relleno o contorno punteado), **ícono** (candado) y **texto** («Aún no» o la fecha).
- Al ganar una insignia, se anuncia con `aria-live="polite"`: «Nueva insignia: Hidratado/a, nivel bronce».

---

## 2. Tres propuestas de diseño de insignias

### Propuesta A: «Medalla con relieve» (la que recomiendo)

**Forma y material.** Es una medalla redonda de 72 px en la colección y 160 px en el detalle, con tres capas en SVG:
1. un aro exterior con degradado lineal de metal (bronce, plata u oro; turquesa en los hitos), que da sensación de bisel;
2. un disco interior oscuro (`#0c1d1b`, el mismo de `.medal` en `estilo.html`), con un degradado radial que lo hace ver hundido;
3. el glifo en relieve: el mismo trazo dos veces, una sombra 1 px abajo y el color 1 px arriba.

Debajo lleva una cinta corta en V con el color de la categoría y los puntos de nivel `●●○`. Se parece a la medalla de «Entreno completo» (E4) del boceto v2, así que todo el sistema se ve coherente.

```
   ╭─────╮        ganada (plata)        ╭┄┄┄┄┄╮   bloqueada
  │ ╭───╮ │       aro metálico          ┆  🔒 ┆   contorno punteado
  │ │ 💧│ │       glifo en relieve      ┆  ·  ┆   glifo al 25 %
  │ ╰───╯ │       brillo suave           ╰┄┄┄┄┄╯
   ╰──┬──╯        cinta V + ●●○        «Aún no»
     ╲╱
  Hidratado/a                          Pata de perro
  Plata · 12 oct                       3 de 5 días
```

**Bloqueada.** Se ve solo el contorno punteado del aro (`#5d706c`), el glifo en gris al 25 % y un candado de 14 px en la esquina. Debajo va el nombre (que se ve siempre, para que la persona sepa qué puede ganar) y la pista en positivo. Nunca aparece una cuenta regresiva.

**En progreso.** Es el mismo contorno, pero un **arco turquesa** recorre el aro según lo avanzado (3 de 5 = 60 %), y debajo dice «3 de 5 días». Si ya tiene bronce y va por plata, la medalla se ve en bronce completa y un arco fino exterior muestra el avance hacia plata.

**Animación al ganarla** (≤ 1,2 s, una sola vez):
1. La medalla entra desde el centro y pasa de escala 0,6 a 1,05 y luego a 1.
2. El arco de progreso termina de cerrarse.
3. Un **destello** diagonal cruza el metal (un `linearGradient` animado con `<animate>` o un pseudo-elemento CSS con `mask`).
4. Salen hasta 10 chispas turquesa.

Con **«Reducir movimiento»** (`@media (prefers-reduced-motion: reduce)`): sin escala, sin destello y sin chispas. La medalla aparece con un fundido de 150 ms y el brillo queda fijo. El texto y el anuncio para lector de pantalla son los mismos. La animación no se repite en cada visita: solo la primera vez que se ve la insignia nueva.

**Pantalla de detalle** (hoja que sube desde abajo, se cierra arrastrando o con «Listo»):
```
┌──────────────────────────────────┐
│              ──                  │
│          ( medalla 160 )         │
│           HIDRATADO/A            │  ← Bricolage, mayúsculas
│        Plata · desde el 12 oct   │
│                                  │
│  Qué es                          │
│  Cumplir el agua 5 días de una   │
│  semana.                         │
│                                  │
│  Tus niveles                     │
│  ● Bronce  ✓ 28 sep              │
│  ● Plata   ✓ 12 oct              │
│  ○ Oro     6 de 12 semanas  ▓▓░░ │
│                                  │
│  Cuenta tu constancia, no la     │
│  cantidad: 8 vasos o 12 valen    │
│  lo mismo.                       │
│                                  │
│        [      Listo      ]       │
└──────────────────────────────────┘
```
- El título usa `<h2>`, y el foco va a él al abrir. La hoja es un `<dialog>` (patrón que ya usa la app con `dlgDia`) y el foco vuelve a la insignia al cerrar.
- Si la insignia está bloqueada: «Cómo se gana» y el progreso actual, sin fechas límite.
- No lleva botón de compartir en esta etapa (ver riesgos).

**Colección por categorías:**
```
Insignias                 5 de 8
┌──────────────────────────────────┐
│ MI CAMINO                  3 de 3│
│  (🏁)     (7)     (30)           │
│ Arrancó  Primera  Primer         │
│ el parche semana  mes            │
├──────────────────────────────────┤
│ HÁBITOS                    1 de 3│
│  (💧)     ┆👣┆     ┆🌙┆           │
│ Hidratado Pata de  Buen          │
│ Plata    3 de 5    1 de 5        │
├──────────────────────────────────┤
│ ENTRENO …  ACTITUD …  RETOS …    │
└──────────────────────────────────┘
```
- Cuadrícula de **3 columnas** (con letra al 200 %, pasa sola a 2 columnas con `grid-template-columns: repeat(auto-fill, minmax(96px, 1fr))`).
- Cada categoría es un `<section>` con `<h3>` y su contador. Dentro, el orden es **fijo**: las insignias no se reordenan al ganarse, para que la persona no las pierda de vista.
- Una categoría sin ninguna insignia disponible (por ejemplo Retos, si el coach no usa retos) no se muestra.
- La frase de pie actual se conserva, sin la parte del ranking si este llega a aprobarse.

**Esfuerzo: MEDIO.** Unos 2 a 3 días de frontend: 5 marcos SVG, 8 glifos, hoja de detalle y animación. Hay que sumar 1 día para los niveles en `constancia.js` y sus pruebas. No requiere SQL.

---

### Propuesta B: «Escudo por categoría» (forma = categoría)

**Forma y material.** Cada categoría tiene su **silueta**, y así se reconoce la categoría sin depender del color:
- Mi camino: **círculo**, como un sello de hito.
- Hábitos: **hexágono**, como una gota de panal.
- Entreno: **escudo** con la punta abajo.
- Actitud: **rombo**.
- Retos: **estrella de 6 puntas** recortada.

El material es mate oscuro con borde metálico grueso (2,5 px) y un **bisel de dos tonos**: la mitad superior del borde más clara y la inferior más oscura. Da relieve sin degradados complicados. El nivel se ve en el borde (bronce, plata u oro) y en 1 a 3 **galones** (chevrones) bajo el glifo, como en un uniforme.

**Bloqueada.** Solo la silueta en línea punteada, el glifo al 25 % y el candado. Como la silueta ya dice la categoría, se entiende «esto es un hábito que aún no tengo».

**En progreso.** Dentro del escudo, el glifo se va **llenando de abajo hacia arriba** como un vaso (un `clipPath` a la altura del %), y abajo dice «3 de 5». Es muy claro para el agua y funciona igual para las demás.

**Animación al ganarla:** el relleno sube hasta el 100 %, el borde metálico se «enciende» de izquierda a derecha (`stroke-dashoffset`) y aparece un pulso de brillo (≤ 1 s). Con **«Reducir movimiento»** se ve el estado final sin transición y un fundido de 150 ms.

**Detalle:** igual que en A, pero el encabezado de la hoja lleva una franja con la silueta de la categoría y la línea «Hábitos · 1 de 3 ganadas», para invitar a completar la familia.

**Colección:** por filas de categoría. En cada fila, a la izquierda, va la silueta grande en contorno como «etiqueta» de la familia. Es la que mejor escala cuando lleguen las 18 insignias de 04.

**Accesibilidad extra:** es la mejor de las tres para daltonismo, porque forma, galones y texto dicen lo mismo que el color. El riesgo es que el escudo y el rombo pequeños (64 px) recortan espacio al glifo. Hay que probarlos al 200 % y en pantallas de 360 px de ancho.

**Esfuerzo: MEDIO-ALTO.** Unos 4 a 5 días, porque son 5 siluetas, cada una con su `clipPath` de relleno y ajuste óptico del glifo. Tampoco requiere SQL.

---

### Propuesta C: «Sello de neón» (rápida, solo CSS)

**Forma y material.** Es la evolución directa del círculo actual: un anillo de neón turquesa de 64 px hecho con `box-shadow` (el mismo truco de `.timer` y `.medal` en `estilo.html`), con un glifo SVG simple en el centro **en lugar del número**. El nivel se marca con un **segundo y tercer anillo** concéntricos finos (1 anillo = bronce, 2 = plata, 3 = oro) y la palabra debajo. No usa metales: todo queda en la paleta v2.

**Bloqueada.** Anillo gris punteado (`border: 2px dashed`), glifo atenuado y «Aún no».

**En progreso.** Un `conic-gradient` turquesa recorre el anillo según el % (la técnica de los anillos de agua, pasos y sueño de E1).

**Animación:** el anillo se completa y el brillo hace un solo pulso (`@keyframes`, 600 ms). Con **«Reducir movimiento»**: sin pulso y con el brillo fijo.

**Detalle y colección:** la misma hoja y las mismas secciones por categoría que en A, pero con menos riqueza visual.

**Por qué la incluyo:** José pidió que «no sean planas». Esta propuesta las saca de lo plano con brillo e ícono, pero no se siente «medalla». La propongo como **plan B**, si el sprint no da para A, o como paso 1 de A, porque el glifo y la hoja de detalle se reutilizan.

**Esfuerzo: BAJO.** Unos 1 a 1,5 días.

---

### Comparación rápida

| | A · Medalla | B · Escudo | C · Neón |
|---|---|---|---|
| ¿Se siente «de verdad»? | Sí, coherente con E4 | Sí, la más coleccionable | A medias |
| Niveles bronce/plata/oro | Aro metálico + `●●○` | Borde metálico + galones | Anillos concéntricos (sin metal) |
| No depende del color | Bien | **Muy bien** (forma por categoría) | Bien |
| Escala a 18+ insignias | Bien | **Muy bien** | Regular (todas iguales) |
| Rendimiento en teléfono modesto | Bien (brillo estático) | Bien | **Muy bien** |
| Esfuerzo | Medio | Medio-alto | Bajo |

---

## 3. Puntos y ranking del team: diseño UX

### 3.1 Puntos (se pueden hacer ya)

Uso como base la economía «Pasos de constancia» de 04, con un nombre más simple: **«Puntos»**.
- **Dan puntos:** cumplir hábitos, registrar medidas (**máximo 1 vez por semana** y nunca por el valor), registrar comidas (por anotar, no por kcal), entrenar (máximo 5 veces por semana), cumplir retos del coach (+10) y volver tras una pausa (+5).
- **Tope de 12 puntos al día.** Nunca se pierden puntos.
- **Nunca dan puntos** el peso, las kcal, los centímetros perdidos ni las fotos.

**Dónde vive:**
- **Inicio:** una línea discreta bajo la tira de días: «**34 puntos esta semana** · +8 hoy». Al tocarla se abre Logros. No va como tarjeta grande ni le quita espacio a la rutina de hoy.
- **Progreso → «Insignias» pasa a llamarse «Logros»**, con dos segmentos: **Insignias · Puntos**. La pestaña Puntos muestra:
  - total de la semana y anillo hacia la meta personal (por ejemplo 50 por semana);
  - barras de las últimas 8 semanas **comparadas solo contigo mismo**: «Tu mejor semana: 61»;
  - desglose del día («Agua +1 · Medidas +3 · Reto +10»), para que se entienda de dónde salen.
- **Celebración al guardar:** el diálogo «Mi día» añade «+7 puntos» junto a la insignia nueva, si la hay.

**Qué ve el coach (ya permitido por el concepto 5):** en Analítica → Ranking privado, un **chip nuevo «Puntos»** junto a «Constancia» y «Entrenos». Conserva el rótulo literal «Solo tú lo ves».

### 3.2 Ranking del team: SOLO si el abogado lo aprueba **[ABOGADO]**

Este es el diseño, listo para cuando haya concepto. No debe construirse antes.

**Dónde vive:** Progreso → Logros → tercer segmento **«Team»**. No va en la barra inferior ni en Inicio. Tampoco va junto a Medidas o Fotos: Logros es una pantalla aparte, para que nadie asocie el puesto con el cuerpo. El segmento solo aparece si **el coach activó el team** y **la persona aceptó participar**.

**Cómo se ve.** La tabla es semanal, se reinicia cada lunes y no guarda historial de «los mejores de siempre».

```
┌──────────────────────────────────┐
│ Team de Fit Demo · esta semana   │
│ Se reinicia el lunes             │
├──────────────────────────────────┤
│ 🦜 Guacamaya Turquesa      58    │
│ 🐆 Jaguar Veloz            55    │
│ 🐢 Tortuga Constante       55    │  ← empate: mismo nivel
│ 🦉 Búho Tranquilo          52    │
│ 🐟 Bocachico Firme         49    │
├──────────────────────────────────┤
│ Tú · 🐸 Rana Dorada        34    │
│ +8 frente a tu semana pasada  ↑  │
├──────────────────────────────────┤
│ Entre todos: 612 puntos          │
│ ▓▓▓▓▓▓▓░░░ meta del team 800     │
└──────────────────────────────────┘
```

**Cómo se evita la vergüenza del último lugar.** Comparé las opciones:

| Opción | Ventaja | Problema | ¿La uso? |
|---|---|---|---|
| Tabla completa con puestos 1 a N | Simple | Siempre hay un último visible | **No** |
| Solo top N + tu fila **sin número de puesto** | Nadie ve quién va abajo; tú solo ves tus puntos y tu avance contra ti mismo | Quien nunca entra al top puede desanimarse | **Sí (base)** |
| Rango cercano (2 arriba, tú, 2 abajo) | Metas alcanzables | Expone a quien está justo debajo de ti, y en un team de 8 se adivina quién es | No |
| Ligas que suben y bajan | Motiva a quien compite | El «descenso» es castigo; mucha complejidad para teams pequeños | No |
| Solo percentil («estás en la mitad de arriba») | Suave | Igual es una posición; poco claro para José y para el público | No |
| Meta colectiva del team | Pertenencia sin comparación | No satisface a quien quiere competir | **Sí (siempre debajo)** |

**Reglas que acompañan la tabla:**
- **Top 5** visible. Si el team tiene menos de 10 participantes, **top 3**.
- Los puntos tienen tope diario, así que la gente constante **empata arriba**. Los empates se muestran sin número y en orden alfabético del alias. Esto le quita filo a la competencia y premia la constancia, no la exageración.
- **Mínimo 5 participantes** para que se muestre la tabla. Con menos, solo se ve la meta colectiva, porque en un grupo de 3 un alias se adivina fácil.
- Quien tiene 0 puntos esta semana, quien está en pausa por pago y quien acaba de entrar **no aparecen** en la tabla. A esas personas se les muestra «Esta semana vas sumando: 12 puntos 👏».
- **Nunca se muestra el número de puesto** de la persona si está fuera del top. Su fila compara solo contra su propia semana pasada.
- No hay notificaciones del tipo «Te pasaron» ni «Vas perdiendo». Como mucho, una el lunes: «Nueva semana, la tabla arranca en cero».

**Participar o no (opt-in):**
- Hay **dos llaves**:
  1. **El coach** activa «Ranking del team» para su grupo. Viene apagado.
  2. **Cada asesorado** acepta por separado.
- La pantalla de invitación muestra **«Así te verán los demás»**: alias, animal y puntos de la semana. Debajo dice, en grande, lo que **nunca** se ve: nombre, foto, peso, medidas, comidas ni fotos.
- Botones: «Participar» y «Ahora no». Los dos tienen el mismo peso visual, para que no sea un patrón oscuro.
- La persona puede salir cuando quiera desde Logros → Team → «Dejar de participar». El alias desaparece **de inmediato**, sin aviso a nadie.
- No participar **no cambia nada**: sigue con puntos, insignias y retos.
- Si el abogado lo pide, el texto de aceptación sería un consentimiento separado y revocable, distinto de «compartir datos con el coach» **[ABOGADO]**.

**Alias en vez del nombre real:**
- Se genera de una **lista cerrada**: animal colombiano + adjetivo amable (Guacamaya Turquesa, Jaguar Veloz, Tortuga Constante, Bocachico Firme…). Tiene un botón «Otro» para cambiarlo, hasta 3 veces por semana.
- **No hay texto libre**, así nadie pone su nombre, un apodo reconocible ni algo ofensivo, y el coach no tiene que moderar.
- El avatar es el glifo SVG del animal, dibujado en casa, sin imágenes externas. **Nunca** se usa la foto de perfil.
- **[VALIDAR]** que los animales y adjetivos suenen bien en todas las regiones y no se presten a burla.

**Qué ve el coach:**
- Un interruptor «Ranking del team» en Más → Retos (o en Analítica) y una vista previa de la tabla tal como la ven sus asesorados.
- **Cuántas personas** participan («6 de 9»). **No ve quiénes**, para que no pueda presionar a nadie a entrar **[VALIDAR con coaches]**.
- En su ranking privado sigue viendo nombres reales y puntos de todos. Eso ya está aprobado.
- No puede dar ni quitar puntos a mano. Sí puede lanzar retos que dan puntos y felicitar a todo el top en un toque.

**Detalle técnico que afecta la UX:**
- La tabla **no** se puede calcular en el teléfono, porque el teléfono no debe recibir datos de otras personas.
- Hace falta una función en el servidor que devuelva solo `alias`, `animal` y `puntos` del top N y los puntos propios, protegida con RLS.
- Eso sí es **SQL nuevo** y una revisión de seguridad.
- Esfuerzo del ranking del team: **ALTO**. Puntos personales más la columna del coach: **MEDIO**.

---

## 4. Riesgos de UX

| Riesgo | Qué puede pasar | Cómo lo mitigo |
|---|---|---|
| **Legal** | El ranking del team incumple la condición del concepto 5 y contradice dos textos que la app ya muestra | No construirlo sin concepto 6. Cambiar los textos solo si el abogado lo aprueba |
| **Inflar registros** | Los hábitos son autodeclarados: con ranking, sale a cuenta anotar «8 vasos» sin tomarlos | Tope diario y empates arriba. Los registros con más de 2 días de atraso no dan puntos (regla de 04). No hay premio por cantidad extra |
| **Vergüenza o abandono** | Quien va abajo se siente expuesto y deja la app | Top N sin puestos propios, comparación contra uno mismo, mínimo 5 participantes y opt-in |
| **Sobreentrenamiento** | Perseguir puntos lleva a entrenar 7 de 7 o medirse a diario | Máximo 5 entrenos por semana con puntos, medidas 1 vez por semana. Las señales de riesgo de 04 le avisan al coach |
| **Motivación prestada** | La persona entrena «por los puntos» y, cuando se aburre, se va | Las insignias y los puntos acompañan; el centro sigue siendo la nota del coach. Los puntos se reinician cada semana, sin «carrera eterna» |
| **Reidentificación** | En un team pequeño, «Jaguar Veloz» se adivina por WhatsApp | Mínimo 5 participantes, alias de lista cerrada y sin datos de horario ni de actividad |
| **Presión del coach** | «¿Por qué no estás en el ranking?» | El coach ve solo el número de participantes, no los nombres |
| **Saturación visual** | Insignias, puntos, retos, constancia y comodines compiten en Inicio | En Inicio, solo una línea de puntos. Todo lo demás vive en Logros |
| **Rendimiento** | Brillos y SVG animados calientan teléfonos de gama baja | Brillo estático, animación una sola vez y nada animado en la colección |
| **Compartir hacia afuera** | Una captura de la insignia o del ranking termina en grupos de WhatsApp | Sin botón de compartir por ahora. Si se pide después, que comparta solo la medalla y el nombre del logro, sin datos |

---

## 5. Recomendación final

1. **Insignias: Propuesta A, «Medalla con relieve»,** con los niveles bronce/plata/oro por semanas repetidas, la hoja de detalle y la colección por categorías. Esfuerzo medio, sin SQL. Si el sprint está justo, empezar por C (glifos y detalle, esfuerzo bajo) y pasar a A en el siguiente, reutilizando lo ya hecho. Tomar de B una sola idea: la forma por categoría, para cuando haya más de 15 insignias.
2. **Puntos: construirlos ya,** como puntos personales con topes, la pestaña «Puntos» en Logros y el chip «Puntos» en el ranking **privado** del coach. Esto está dentro de lo aprobado.
3. **Ranking del team: no construirlo todavía.** Enviar al abogado una consulta concreta (concepto 6): «¿Se permite una tabla semanal, opt-in, con alias de lista cerrada, que muestre solo el top 5 de puntos de proceso (sin datos corporales), sin el puesto de quien no está en el top y con mínimo 5 participantes?». Si dice que sí, el diseño de 3.2 está listo. Si dice que no, queda la **meta colectiva del team**, que también hay que consultarle.
4. **Validar con 3 a 5 asesorados reales** antes de abrir el ranking: si lo quieren, si les da pena y si entienden los alias. 04 y 02 apuestan a que la mayoría prefiere retos grupales a tablas **[VALIDAR]**.
