# 01 · UX/UI móvil — revisión de «Pérdida de Grasa» (Demo)

Base: capturas 00–30 (claro y oscuro, 390×844), capturas extra en `scratchpad/expertos/ux-extra/` (x1 cobro, x2 invitar, x3 ficha de Fabio, x4–x5 agregar comida, x6–x7 texto al 200 %), medición de áreas de toque con Playwright y lectura de `styles.css`, `index.html`, `account.js`, `coach-panel.js` y `pagos.js`. Coincido con 03 (neurociencia) y 04 (gamificación) en tres puntos: Inicio sin jerarquía, kcal demasiado grandes y el pago puesto donde debería ir el progreso.

## 1. Veredicto (5 líneas)

1. **Funciona:** lenguaje claro y en español de Colombia. Barra inferior simple (3 pestañas para el coach y 5 para el asesorado). El catálogo de comidas tiene buena búsqueda y «Recientes» (x4/x5). La hoja de cobro es clara (x1). La pausa (30) es digna y deja ver los datos.
2. **Estorba:** las pantallas son largas formularios con todo visible. Medidas (23) mide más de 10.000 px, la ficha del coach (13) más de 5.000 px y Fotos (24) pone permisos y bitácora antes de la acción. Inicio (21) apila 7 tarjetas del mismo peso.
3. **Accesibilidad rota en modo oscuro:** todos los botones primarios y la barra superior llevan texto blanco sobre `#2dd4bf`, con un contraste de **1,9:1** (el mínimo es 4,5:1). La letra no sigue el «Tamaño del texto» de iOS. Con texto grande, la barra superior se corta y las pestañas quedan como «Hábi…» y «Med…» (x6/x7).
4. **El coach no puede revisar en 5 min:** la lista (10) muestra cobro y hábitos, pero no dice quién registró medidas, cuándo fue su última actividad ni quién necesita atención. La ficha es una tabla larga sin fecha de la última medida.
5. **Riesgo principal:** el primer uso desde WhatsApp tiene entre 6 y 8 pasos (consentimiento, correo, salir a buscar el código, nube, rol, compartir, instalar). En iPhone la PWA instalada **no comparte sesión con Safari**, así que hay que entrar dos veces. Si eso falla, el asesorado no llega a su primera medida.

## 2. Hallazgos por pantalla

### Transversales (aplican a todas)
| Problema | Por qué importa | Arreglo |
|---|---|---|
| `.btn` y `.topbar` usan `color:#fff` sobre `--accent:#2dd4bf` en oscuro (20, 22, 26, 27, x1). Contraste 1,9:1. | Usuarios de 40–55 años y uso al sol: el botón principal no se lee. Falla WCAG AA. | En oscuro, usar `color: var(--on-accent)` (#06201c, que ya existe en la línea 164 de styles.css) en `.btn`, `.seg .on` y la topbar. Contraste ≈ 9:1. Es un cambio de una línea. |
| La tipografía en `rem` sobre `system-ui` no responde a Dynamic Type de iOS. Al 200 % la topbar se corta («de Grasa», «De Octubre») y las etiquetas de pestaña se truncan (x6/x7). | Una parte grande del público usa letra grande. | `html{font: -apple-system-body}` con escala en `rem`. Topbar en una sola línea con `min-width:0` y elipsis. Pestañas con `font-size` fijo y tope (`min(.75rem, 14px)`), icono de 24 px y etiqueta debajo, sin truncar. |
| Barra morada DEMO + topbar «Pérdida de Grasa · Sábado, 24 De Octubre» ocupan unos 190 px (22 % de la pantalla). La fecha se repite en Inicio (20). La capitalización «De Octubre» está mal. | Pierdes el primer pantallazo en cada vista. | Producción: topbar de 44 px con solo el título de la sección. Quitar la fecha de la topbar (ya está en Inicio). Corregir a «24 de octubre». |
| Fecha en formato `10/24/2026` (mes/día) en Hábitos, Medidas, Fotos, Comidas, Cobro y Comentario (22, 23, 24, 27, x1). | En Colombia se lee día/mes, lo que lleva a registrar en una fecha equivocada. | Mostrar «Hoy, sáb 24 oct» como texto con enlace «Cambiar día». El selector nativo va solo detrás y con `lang="es-CO"`. Revisar en iPhone real: Safari usa el idioma del sistema. |
| El foco programático dibuja un recuadro amarillo/naranja sobre el título «Mis asesorados» (10/11). | Al usuario táctil le parece un error. | `:focus:not(:focus-visible){outline:none}` en los `h2[tabindex=-1]`. |
| La barra inferior fija tapa contenido. En 10/11 el botón «+ Invitar» cubre «No comparte sus hábitos». | Se pierde texto al final de las listas. | `padding-bottom: calc(var(--bar-h) + 24px + env(safe-area-inset-bottom))` en `main`. |
| Hay dos relojes de «hoy»: la topbar usa la hora del teléfono y el cobro y la ficha usan Bogotá fija (`pagos.js`). En la demo se ve «Sábado 24» arriba y «Hoy · 23 oct» en la ficha (13, x3). | Confunde y produce datos del día equivocado. | Una sola función `hoy()` para toda la interfaz. |
| La casilla «Hoy entrené» mide 18×18 px (22). «Marcar como leído» mide 32 px de alto (21). La × para borrar registros es pequeña (23). | Por debajo de 44 px se pulsa mal. | Interruptor de 44 px o botón tipo chip. `min-height:44px` en `.btn-link`. |
| Daltonismo: «Pagó/No pagó» y el verde/rojo de «Cambio» dependen solo del color (10, 13). | El 8 % de los hombres no distingue verde de rojo. | Añadir icono y forma (✓ / ⏸) y signo/flecha al cambio. Ya hay texto, así que solo falta reforzarlo. |

### COACH
**10/11 Lista de asesorados**
- El chip «Pagó» parece un estado, pero es un botón que abre el cobro. → Ponerle chevron o icono de lápiz y aria-label «Cambiar cobro». El texto puede quedarse.
- Los tiles «7 pagaron / 1 sin pagar» no filtran. → Hacerlos filtros (al tocar «1 sin pagar» queda solo Diego).
- No hay columna de **actividad**: falta «Última medida hace 9 días» y «Sin registrar desde el martes». → Añadir una línea de semáforo de seguimiento, separada del cobro: 🟢 al día / 🟡 3+ días sin registrar / 🔴 7+ días o medida vencida. El orden por defecto debe ser **«Necesitan atención»**, no «Quién vence primero».
- «Actualizar» es un botón grande para algo que debería pasar solo. → Gesto de arrastrar para actualizar y la línea «Actualizado 03:36» como texto.
- «Hábitos: aún sin registrar» y «No comparte sus hábitos» ocupan la misma línea con el mismo estilo. → Mostrar «No comparte» en gris con un candado. No es una alerta.

**12/13 Ficha (Diego, Fabio)**
- El título dice «Medidas (cm)» pero la primera fila es Peso, que va en kg. → «Medidas» y la unidad en cada fila.
- La columna «Hoy» en realidad es la última medida, sin fecha. → «Última (23 oct)». Si tiene más de 14 días, en ámbar.
- 10 filas de tabla y nada de tendencia. → Arriba, 3 tarjetas: Peso, Abdomen y Cadera con mini gráfica de 8 semanas. El resto, plegado en «Ver todas las medidas».
- Comidas lista los 7 días con cada plato (x3b, unos 1.500 px). → Resumen de 7 barras (kcal/día y días con registro). Al tocar un día se despliega.
- Rutinas: el desplegable «Asignar» junto a «Crear una rutina nueva» compite con la acción principal. → Mostrar primero la rutina asignada y si la hizo («Entrenó 5 de 7 días»), luego «Cambiar rutina».
- Comentarios: el campo «Sobre el día» con fecha mm/dd y el contador 0/1000 son ruido. → Quitar la fecha (por defecto hoy, editable desde un enlace) y añadir **respuestas rápidas** («¡Bien esta semana!», «Te falta registrar medidas», «Hablemos por WhatsApp»). Botón «Enviar» a todo el ancho.
- «Dejar de acompañar» está al final en rojo y bien separado (OK). El cobro de la ficha (chip arriba) está bien ubicado.
- Falta navegación **Anterior/Siguiente asesorado** para la revisión semanal.

**14 Más (coach)**: «Reiniciar demo» y «Cambiar de rol» son solo de la Demo (OK). En producción, **«Mis rutinas» no debería vivir en Más**: es herramienta diaria. Propuesta en §5.

**15 Mis rutinas**: cada tarjeta tiene 4 botones iguales («Asignar a…», «Publicar como rutina de hoy», «Editar», «Borrar»). «Borrar» tiene el mismo peso visual que «Editar». → Una acción principal («Asignar»), menú ⋯ para Editar/Duplicar/Borrar y Borrar en rojo con confirmación. El párrafo explicativo de las copias se muestra una sola vez (descartable). «Rutina de hoy» ocupa la cabecera completa: bien, pero mostrar a quién llega («llega a 7 asesorados activos»).

**x1 Cobro**: claro. Problema funcional: «Pagó» propone **hoy + 30**, no **pagado hasta actual + 30**. Si Fabio paga 2 días antes, pierde 2 días, o el coach tiene que calcular. → Proponer `max(hoy, pagadoHasta) + 30` y mostrar «Queda pagado hasta el 24 nov» en el botón. Falta deshacer: toast «Marcado: pagó · Deshacer».

**x2 Invitar**: bien resuelto. Sobra la explicación del código, que puede ir en «Opciones avanzadas» (duración, generar nuevo). El mensaje de WhatsApp debería decir qué va a pasar: «Te llegará un código a tu correo».

### ASESORADO
**20/21 Inicio**
- Hay 7 bloques del mismo peso: Rutina de hoy, Mi rutina, Pago, Hábitos, Medidas, Comidas y Notas. «Rutina de hoy» y «Mi rutina» son redundantes. Las notas del coach, que son lo más motivador (ver 03), quedan al final. → Orden propuesto en §5.
- «Faltan 21 días para tu próximo pago» en tarjeta destacada → mostrarlo **solo si faltan 7 días o menos**, como línea discreta. Ya existe `SOON_DAYS=7`; usarlo para ocultar y no solo para resaltar.
- «238 kcal» en 64 px sobre 2 comidas (21) → el dato principal debe ser «2 comidas anotadas hoy». Las kcal, en texto normal (coincide con 03 y 04).
- El saludo «Hola, Ana Demo» con nombre completo y fecha duplicada → «Hola, Ana».
- Hábitos en Inicio son de solo lectura y llevan a otra pantalla → controles de un toque aquí mismo (+1 vaso, Entrené ✓).

**22 Hábitos**: es un formulario con «Guardar». El selector de día, los pasos en un campo libre y el sueño con «7.5» (punto, cuando en Colombia se usa coma) suben la carga. → Guardado automático al tocar. Agua con +/– (ya existe). Pasos con chips «<4k / 4–8k / 8k+» o número. Sueño con stepper de 0,5 h. «Entrené» como interruptor grande. «Mi semana» está bien.

**23 Medidas**: 11 campos seguidos. El placeholder «Última: 72,8» parece un valor ya escrito. «Obligatorio» aparece como etiqueta suelta. El historial «Mis registros» tiene más de 40 tarjetas.
→ Paso 1: **Peso, Abdomen y Cadera** (obligatorios) visibles, con «la última fue 72,8» debajo del campo. Paso 2: «+ Más medidas (opcional)» plegado. Teclado `inputmode="decimal"` que acepte coma. Al guardar, mostrar el cambio frente a la medida anterior. «Mis registros» solo con los 5 últimos y «Ver todo». Cada 2 semanas, una guía visual de *dónde* medir (ombligo, parte más ancha de la cadera), porque sin ella los datos son ruido. La gráfica «Cómo voy» tiene 10 pestañas en 3 filas → 3 pestañas (Peso, Abdomen, Cadera) más «Otra ▾».
- El verde para toda bajada está mal en brazos y muslos si el objetivo es ganar músculo → el color depende del objetivo; si no se sabe, neutro.

**24 Fotos**: el orden está invertido: permisos y bitácora, luego un aviso amarillo, luego la acción. El input nativo muestra «Choose File / No file chosen» en inglés. El texto habla de «Tomar foto» pero el botón no se ve. Al final dice «Las fotos se guardan solo en este dispositivo y se incluyen en Exportar JSON», que contradice «Tu coach la ve» y usa jerga técnica. Hay una miniatura vacía (14 ago, Perfil).
→ Arriba: dos botones grandes, **«Tomar foto»** (`capture="environment"`) y «Elegir de la galería», con plantilla de silueta y la pose (Frente/Perfil/Espalda) como chips. Debajo, el comparador. Permisos y «Quién vio mis fotos» pasan a una fila «Privacidad de mis fotos ›». El aviso amarillo es un texto de consentimiento: si viene del abogado, **se mantiene** pero se puede mostrar una sola vez antes de la primera foto (**requiere aval legal** para moverlo). «Exportar JSON» → «Descargar una copia».

**25 Más**: «Mis comidas» y «Mi rutina» son diarias y están escondidas en Más → ver §5. «Mi coach», «Mis datos y permisos» y «Descargar una copia» están bien en Más.

**26 Mi rutina**: el triángulo ▼ aparece solo en algunos ejercicios, así que no se sabe qué se puede tocar. Se repite «Toca un día para ver…» en cada rutina. «Piernas» aparece dos veces (como de hoy y en la lista). → Vista **«Entrenar hoy»**: ejercicio por ejercicio, con checks por serie y un botón «Terminé» que marca el hábito «Entrené» (hoy van por separado: 22 y 26). Todos los ejercicios con «Cómo se hace ›». Botón «Hoy entrené» con contraste corregido.

**27 Mis comidas / x4–x5**: buen flujo. Mejoras: al escribir, ocultar los 10 chips de categoría (ocupan 1/3 de la pantalla y con el teclado no se ven resultados). Ofrecer «No está en la lista: escribir a mano». «Editar / Borrar» como texto suelto bajo cada plato → deslizar o menú ⋯. «Repetir la de ayer» está muy bien, conservarlo.

**30 Pausa**: digno, sin culpa. Faltan: botón **«Escribirle a mi coach por WhatsApp»** (es la acción real; «Ya pagué: volver a comprobar» va en segundo lugar). Debajo de la tarjeta de pausa sigue apareciendo «Rutina de hoy» y la barra de pestañas activa. Decidir: o se ve en solo lectura con la etiqueta «solo lectura», o se oculta. Hoy es ambiguo.

## 3. Flujos críticos

**A. Primer uso desde WhatsApp (meta: <2 min hasta la primera medida).** Pasos actuales según el código: enlace → consentimiento («Antes de empezar») → correo + nombre + A1/A2 + posible captcha → **salir al correo** a copiar un código de 6 dígitos → nube A3/A4 → rol con código del coach precargado → compartir → «Listo» → tarjeta «Instala la app» → Inicio vacío. Estimo entre 4 y 6 minutos, con dos abandonos probables: el correo (spam, otra app) y la instalación en iPhone (Safari → Compartir → Agregar a inicio). Además, **la PWA de iOS tiene su propio almacenamiento**: la sesión creada en Safari no pasa a la app instalada.
Arreglos: (1) con `?c=` en el enlace, **saltarse el paso de rol** («Te invitó Fit Demo» con su nombre y foto, sin radio coach/cliente). (2) Pedir la instalación **antes** de crear la cuenta en iPhone: «Primero ponla en tu pantalla de inicio (30 s)», con animación de 3 pasos, y crear la cuenta ya dentro de la PWA. (3) `autocomplete="one-time-code"` ya está; agregar un aviso de que el código **también llega por WhatsApp** (pregunta abierta). (4) Al terminar, llevar directo a **«Tu primera medida: peso, abdomen y cadera»** con la guía de medición, no a Inicio vacío. Los textos A1–A7 no se tocan; solo el orden de pantallas (**requiere aval legal** si cambia el momento en que se aceptan).

**B. Registro diario (<30 s).** Hoy son 3 pantallas (Hábitos con Guardar, Más → Mis comidas → Agregar, Más → Mi rutina → Hoy entrené), unos 12–15 toques. Propuesta: en Inicio, «Mi día» con +vaso, sueño, pasos y Entrené como toques directos con guardado automático, más «+ Comida» con Recientes. Objetivo: 5–6 toques.

**C. Revisión semanal del coach (8 asesorados en <5 min).** Hoy: abrir ficha, bajar más de 5.000 px, volver y repetir. Unos 60–90 s por persona, sin un resumen. Propuesta: (1) lista ordenada por «Necesitan atención» con semáforo de actividad; (2) ficha con un **resumen semanal arriba**: Δ peso/abdomen/cadera en la semana, hábitos %, días con comidas, entrenos y foto nueva sí/no; (3) respuestas rápidas al comentario; (4) «Siguiente asesorado ›». Así son unos 30 s por persona.

**D. Cobros.** La hoja es clara. Hay que corregir la fecha propuesta (`max(pagado, hoy)+30`) y añadir deshacer. Añadir un aviso a 3 días: en la lista, «Vence en 2 días» en ámbar, con un botón «Recordarle por WhatsApp» que abra un mensaje respetuoso prellenado. Del lado del asesorado, el contador de pago solo aparece si faltan 7 días o menos. Sin rojo y sin cuenta regresiva diaria (no son patrones oscuros, pero generan ansiedad).

**E. Rutina diaria.** El coach publica «Rutina de hoy», que dura solo hoy. El asesorado la ve en Inicio, abre Mi rutina, despliega el día y marca «Hoy entrené» al final de una página larga. Propuesta: «Empezar» → ejercicio a ejercicio → «Terminé», que marca el hábito y muestra un mensaje al coach. Aclarar qué pasa si el asesorado tiene su propia rutina asignada **y** hay rutina de hoy (hoy aparecen las dos sin decir cuál manda).

## 4. Qué sobra y qué falta

**Sobra / esconder**
| Pantalla | Elemento | Acción | Motivo |
|---|---|---|---|
| Todas | Fecha en la topbar | Quitar | Duplicada y ocupa espacio |
| 10 | Botón «Actualizar» grande | Esconder (arrastrar para actualizar) | Ruido |
| 10 | Selector «Ordenar por» | Mover a icono de filtros | Rara vez se cambia |
| 13 | 10 filas de medidas abiertas | Esconder (plegar 7) | Lo clave son peso, abdomen y cadera |
| 13 | Lista de comidas día por día | Esconder tras el resumen | Unos 1.500 px |
| 13 | «Sobre el día» + 0/1000 | Quitar | Carga sin valor |
| 15 | Párrafo de copias | Mostrar una vez | Se lee una vez |
| 15 | Editar/Borrar como botones | Mover a menú ⋯ | Evita borrar por error |
| 20/21 | Tarjeta «Mi rutina» | Fusionar con «Rutina de hoy» | Redundante |
| 21 | «Faltan 21 días…» | Esconder si faltan más de 7 días | Dinero antes que progreso |
| 21/27 | kcal en 64 px | Reducir | Riesgo de obsesión (03/04) |
| 22 | Selector de día visible | Esconder tras «Cambiar día» | 95 % registra hoy |
| 22 | Botón «Guardar» | Quitar (guardado automático) | Un paso menos |
| 23 | 8 medidas opcionales abiertas | Plegar | Carga cognitiva |
| 23 | Historial de más de 40 registros | Mostrar 5 + «Ver todo» | Más de 6.000 px |
| 23 | 10 pestañas de la gráfica | Dejar 3 + «Otra» | |
| 24 | Permisos + bitácora arriba | Mover a «Privacidad de mis fotos» | La acción va primero |
| 24 | «Exportar JSON» | Quitar la jerga | |
| 26 | «Toca un día…» repetido | Una vez | |
| x4 | Chips de categoría al buscar | Esconder mientras se escribe | El teclado tapa resultados |

**Falta**
| Pantalla | Qué falta | Quién | Prioridad |
|---|---|---|---|
| Transversal | Contraste en botones oscuros y Dynamic Type | Ambos | Alta |
| Onboarding | Salto del rol con invitación; instalar antes de la cuenta en iOS; ir directo a la primera medida | Asesorado | Alta |
| 10 | Semáforo de actividad y orden «Necesitan atención» | Coach | Alta |
| 13 | Resumen semanal arriba, fecha de la última medida y Anterior/Siguiente | Coach | Alta |
| 13 | Respuestas rápidas en comentarios | Coach | Media |
| 13 | Ver las fotos compartidas con el comparador (hay sección en el código; validar que llegue) | Coach | Media |
| 21 | «Mi día» de un toque y confirmación al guardar | Asesorado | Alta |
| 23 | Guía de cómo medir (ilustración) y recordatorio de medida semanal | Asesorado | Alta |
| 23 | Meta y dirección por objetivo (perder grasa / ganar músculo) | Ambos | Media |
| 24 | Botón cámara directo y plantilla de pose | Asesorado | Media |
| 26 | Modo «Entrenar» con check por serie que alimente «Entrené» | Asesorado | Media |
| x1 | Fecha propuesta desde «pagado hasta», deshacer y recordatorio por WhatsApp | Coach | Alta |
| 30 | «Escribirle a mi coach por WhatsApp» | Asesorado | Alta |
| Todas | Estados vacíos con una acción (coach sin asesorados: «Invita al primero»; asesorado sin medidas: «Haz tu primera medida») | Ambos | Media |
| Todas | Mensajes sin conexión («Guardado en el teléfono, se enviará al volver la señal») | Ambos | Media |
| Coach | Perfil público (nombre, foto y WhatsApp del coach) que el asesorado vea en Inicio y en la pausa | Ambos | Media |

## 5. Arquitectura de información

**Asesorado — barra (5):** Inicio · Hábitos→**«Mi día»** · **Entrenar** · Progreso (Medidas + Fotos en pestañas internas) · Más.
- Comidas sale de Más y queda como acceso de un toque desde Inicio, con «+ Comida» en «Mi día». Si 02 (nutrición) la considera central, puede reemplazar a Entrenar como pestaña.
- **Inicio**, en este orden: (1) nota nueva del coach si hay (con foto del coach); (2) **Mi día**: agua +1, Entrené ✓, sueño, pasos y + Comida, todo de un toque; (3) Rutina de hoy → «Empezar»; (4) tarjeta contextual: «Toca medirte (hace 7 días)» o «Foto de progreso pendiente»; (5) constancia de la semana; (6) aviso de pago solo si faltan 7 días o menos.
- **Más:** Mi coach · Mis datos y permisos · Quién vio mis fotos · Descargar una copia · Instalar · Ayuda.

**Coach — barra (4):** Asesorados · **Rutinas** · Invitar (+) · Más.
- **Inicio del coach = lista**, con encabezado «Esta semana»: 3 contadores que filtran (Necesitan atención · Vencen en 7 días · Sin pagar) y lista ordenada por atención.
- **Ficha:** cabecera (nombre, cobro, «último registro hace X») → Resumen de la semana → Mensaje rápido → Medidas clave → Hábitos → Comidas (resumen) → Rutina → Fotos → Historial. Con Anterior/Siguiente.
- **Más:** Mi perfil (foto, WhatsApp), Acuerdo, Datos y permisos, Descargar, Instalar.

**«Un toque» significa** que la acción se completa sin abrir otra pantalla ni pulsar Guardar, con confirmación visible y Deshacer durante 5 s. Aplica a +1 vaso, Entrené, marcar nota leída, Pagó (desde la lista, con fecha propuesta y deshacer), Repetir comida de ayer, respuesta rápida del coach y Publicar rutina de hoy.

## 6. 15 mejoras priorizadas (impacto × esfuerzo)

| # | Mejora | Impacto | Esfuerzo |
|---|---|---|---|
| 1 | Texto oscuro (`--on-accent`) en botones y topbar en modo oscuro | Alto | Bajo |
| 2 | Fecha propuesta de cobro `max(pagado, hoy)+30` + Deshacer | Alto | Bajo |
| 3 | Aviso de pago en Inicio solo si faltan 7 días o menos; kcal en tamaño normal | Alto | Bajo |
| 4 | Medidas: 3 obligatorias arriba, opcionales plegadas, «última» como ayuda (no placeholder), teclado decimal con coma | Alto | Bajo |
| 5 | Saltar el paso de rol cuando el enlace trae `?c=` y llevar a la primera medida al terminar | Alto | Bajo |
| 6 | Pausa: botón «Escribirle a mi coach por WhatsApp» y decidir si se ve o no el contenido de abajo | Alto | Bajo |
| 7 | Fotos: botones «Tomar foto»/«Galería» arriba, quitar el input en inglés y «Exportar JSON» | Medio | Bajo |
| 8 | Fecha legible «Hoy, sáb 24 oct» + «Cambiar día»; un solo reloj de «hoy» | Medio | Bajo |
| 9 | Áreas de toque ≥44 px (casilla «Entrené», «Marcar como leído», ×) y `padding-bottom` bajo la barra | Medio | Bajo |
| 10 | Lista del coach: semáforo de actividad y orden «Necesitan atención»; tiles que filtran | Alto | Medio |
| 11 | «Mi día» de un toque en Inicio con guardado automático (y quitar Guardar en Hábitos) | Alto | Medio |
| 12 | Ficha: resumen semanal arriba + secciones plegadas + Anterior/Siguiente + respuestas rápidas | Alto | Medio |
| 13 | Dynamic Type (`-apple-system-body`) y topbar/pestañas que no se rompan al 200 % | Medio | Medio |
| 14 | iPhone: instalar la PWA antes de crear la cuenta (evita doble login) | Alto | Medio |
| 15 | Modo «Entrenar» que marque «Entrené» y nueva barra (Entrenar, Progreso, Rutinas del coach) | Medio | Alto |

## 7. Preguntas abiertas para el panel

**Coach de entrenamiento y nutrición (02):**
1. ¿Qué frecuencia de medición recomiendan (semanal, quincenal) y a qué hora? Define el recordatorio y la tarjeta «Toca medirte».
2. ¿Deben verse las kcal al asesorado o solo «comidas anotadas» y la calidad (proteína, verduras)? ¿Comidas debe ser pestaña principal?
3. ¿Qué cambio en cada medida es «bueno» según el objetivo (perder grasa / ganar músculo / recomposición)? Lo necesito para el color de «Cambio».
4. En una rutina, ¿basta con «Entrené» o hace falta registrar series, peso y RPE? ¿Qué manda si hay rutina asignada y rutina de hoy al mismo tiempo?
5. ¿Qué 3 señales hacen que un asesorado «necesite atención» (días sin registro, subida de abdomen, hábitos <50 %)?

**Neurociencia/PNL (03):**
6. ¿Qué mensaje mostrar justo después de guardar medidas cuando el número sube? Necesito el texto exacto para la confirmación.
7. ¿La nota del coach debe ir siempre primera en Inicio o solo cuando no está leída?
8. ¿Mostrar el peso del día en Inicio o solo la tendencia de 4 semanas?

**Gamificación (04):**
9. ¿Dónde vive visualmente la constancia o los «Pasos de constancia»: en Inicio (bloque 5), en Progreso o en ambos? ¿Cuánto espacio en el primer pantallazo?
10. Si hay ranking opt-in, ¿va como pestaña o dentro de «Mi coach»? Prefiero que no ocupe barra.
11. ¿Las celebraciones son toasts, una animación a pantalla completa o un mensaje del coach? Hay que respetar «reducir movimiento» de iOS.

**Abogado / producto:**
12. ¿Se puede mostrar el aviso de visibilidad de fotos una sola vez (antes de la primera foto) en vez de siempre? (**requiere aval legal**)
13. ¿Se puede enviar el código de acceso también por WhatsApp/SMS y no solo por correo?
14. Compartir medidas y comidas es obligatorio: ¿exige la copia en la nube (A3/A4)? Si sí, el paso «¿Guardar una copia en la nube? Es opcional» confunde a quien viene invitado por un coach. Hay que redactarlo distinto para ese caso (**requiere aval legal**).
