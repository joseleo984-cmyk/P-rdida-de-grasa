# Insignias v4, diseño B «Escudo por categoría» — producto «coach» (rama `claude/insignias-b`, sobre `claude/puntos-meta` / PR #38)

Construye el diseño elegido de `equipo/diseno/v4-insignias/` (B1 colección, B2 detalle y momento de ganarla; catálogo de `gamificacion.md`, estados, accesibilidad y animación de `ux.md`).
**Sin SQL nuevo.** Todo se calcula en el teléfono con los datos propios, como `constancia.js`; «Equipo» usa lo que ya devuelven `grasa.my_team_goal` y `grasa.my_points`. `config.js` no cambia. Caché del SW **v55**.

## Qué se hizo

1. **Catálogo: 17 insignias en 6 categorías**, cada una con su silueta (`logros.js`, lógica pura y probada):
   - Primeros pasos (círculo): Arrancó el parche, Primera semana, Primer mes (hitos).
   - Constancia (rombo): Semanas constantes, Volviste (hito), Registro honesto.
   - Hábitos (hexágono): Hidratado/a, Pata de perro, Buen dormir, Semana redonda.
   - Entreno (escudo): Tres de tres, Entrenos acumulados, Descanso inteligente.
   - Registro (libreta): Plato a plato, Midiendo con cabeza.
   - Retos (estrella): Reto cumplido, Equipo. La fila solo aparece si la persona tiene coach.
2. **Niveles bronce, plata y oro por semanas repetidas: 1, 4 y 12** (no tienen que ser seguidas). Nunca suben por hacer más: 20.000 pasos valen lo mismo que 8.000, entrenar 7 días no suma, dormir más de 10 h no cuenta, ninguna pide 7 de 7. Los hitos y «Volviste» no tienen nivel. El nivel se ve en el borde de metal con bisel, en 1 a 3 galones y en ●●○ + la palabra; el galón punteado turquesa marca avance hacia el siguiente.
3. **Migración sin perder nada:** las 8 insignias de antes conservan su id y su fecha (su regla de siempre es el bronce o el hito de la nueva; hay prueba que lo compara con `Constancia.badges`). Además, lo ganado se recuerda por cuenta en el teléfono (`PGNS 'logros'`): **nunca se pierde un nivel** aunque luego se borre un registro.
4. **Progreso → Logros** (la pestaña «Insignias» pasa a «Logros», como en B1, con título «Progreso» y «Medirme ›»): «Te falta poco» (lo más avanzado de esta semana, con lo que falta) y el contador «14 de 17»; una fila por categoría con su silueta y «N de M»; estados ganada (metal + nivel o ✓ fecha), **en progreso** (el glifo se llena desde abajo y «3 de 5») y **bloqueada** (silueta punteada, candado y «Aún no»). El pie literal se conserva.
5. **Hoja de detalle** (`<dialog id="dlg-logro">`): franja con la silueta y «Hábitos · 2 de 4 ganadas», insignia grande, nombre, nivel y fecha, «Qué es» con «Llevas N semanas así», «Tus niveles» con fechas y la barra hacia el siguiente («4 de 12 semanas»), y la nota «Cuenta tu constancia, no la cantidad… Nunca pierdes un nivel.». Se cierra con «Listo», Esc o tocando el fondo; el foco vuelve a la insignia.
6. **Momento de ganarla:** la hoja se abre sola con «Nuevo nivel» / «Nueva insignia», el borde de metal que se enciende, un destello, pulso de brillo y 10 chispas, **≤ 1 s** y una sola vez (se anuncia por `aria-live`). Con **«Reducir movimiento»**: solo un fundido de 150 ms. **No salta a mitad de un registro:** queda pendiente y sale al cerrar «Mi día», al volver a Inicio o al terminar una acción de un toque (Entrené, descanso, sueño, pasos); los toques del agua nunca la abren. Lo que ya estaba ganado al abrir la app, o con fecha de hace más de un día, se da por visto sin fiesta. La línea «Nueva insignia» del diálogo «Mi día» ahora lleva el dibujo nuevo.
7. **Equipo:** se gana la semana en que el team cumple su meta colectiva (5 o más personas) **y** la persona sumó: no se retiró, comparte hábitos y comidas, no está en pausa y tiene algo propio esa semana en `my_points` (un entreno si la meta es de entrenos; puntos si es de puntos). Solo se usa el agregado; nadie ve el aporte de nadie. Como `my_team_goal` solo trae la semana en curso, las semanas ganadas se recuerdan en el teléfono.
8. **Reto cumplido:** retos del coach (`my_challenges`, lo que ya guarda etapa2-view) con las marcas de la persona dentro del reto; se recuerdan porque la API solo trae los de las 2 últimas semanas.
9. **Coach:** la ficha («Constancia e insignias») usa el mismo diseño (siluetas, niveles, estados y la hoja de detalle con «Sus niveles»), solo con los registros de esa persona. **Sin Retos ni Equipo** (viven en el teléfono de la persona) y sin ranking.
10. **Accesibilidad:** cada insignia es un `<button>` de 44 px o más con el nombre completo («Hidratado/a, nivel plata, ganada el 16 oct. Para oro: 4 de 12 semanas»), el SVG va oculto; foco visible; AA en oscuro y claro (metales de `ux.md`); a 390 px con letra al 200 % y fuente ancha la etiqueta de la fila pasa arriba y las insignias se acomodan en menos columnas (container query), sin cortar palabras.
11. **Rendimiento:** un solo `<svg>` oculto con los degradados, las 6 siluetas y 19 glifos (~5 KB); cada insignia es un `<svg>` pequeño con `<use>` (las 17 ≈ 13 KB). Sin imágenes externas ni fuentes nuevas. Nada animado en la colección; el brillo es fijo y solo en oscuro. Calcular las 17 cuesta ~1 ms con 15 semanas de datos.
12. **Demo:** Ana tiene oro (Hidratado/a, Semanas constantes, Registro honesto), plata (Pata de perro, Tres de tres, Entrenos acumulados, Midiendo con cabeza), bronce (Descanso inteligente, Semana redonda, Plato a plato), en progreso (Buen dormir, Reto cumplido 4 de 5) y bloqueada (Equipo): 14 de 17, igual cualquier día de la semana. **Para ver el momento de ganarla:** en Inicio, «Hoy es mi día de descanso» → «Descanso inteligente» sube a plata. Para eso su historia de hábitos pasó a 15 semanas (empieza con 5 días, una pausa de 8 y «Volviste») y sus comidas a 2 semanas.
13. **Infra:** `logros.js` y `logros-view.js` en `index.html`, `sw.js` (v55) y `scripts/build-site.js`; `tests/site.test.js` comprueba que se publican y precachean en los tres sitios.

## Decisiones que conviene conocer

- **Niveles por semanas también en las que el catálogo contaba de otra forma** (la regla del encargo: 1, 4 y 12 semanas, nunca por hacer más):
  - Semanas constantes: semanas con 4 o más días con registro (comodines incluidos), no tienen que ser seguidas (el catálogo decía 4, 12 y 26).
  - Registro honesto: semanas con 3 días anotados en que algún hábito anotado no llegó a la meta (el catálogo decía 8, 25 y 60 días).
  - Entrenos acumulados: semanas con al menos un entreno (el catálogo decía 12, 50 y 150 entrenos).
  - Plato a plato: semanas con 4 días de 2 comidas o más (el catálogo decía 10, 40 y 100 días).
  - Midiendo con cabeza: semanas con un registro de medidas a 6 días o más del anterior (el catálogo decía 4, 12 y 26 registros).
  - Reto cumplido: semanas con un reto cumplido (el catálogo decía 1, 5 y 15 retos).
  - Equipo: semanas con la meta del team cumplida (el catálogo decía 1, 4 y 12 metas).
- **Semana redonda** = agua, pasos, sueño y 2 comidas registradas, cada uno al menos 4 días (no el entreno: 4 entrenos podrían pasar del plan del coach).
- **Descanso inteligente** = semana con al menos un «Hoy es mi día de descanso» (el `rest: 'plan'` de PR #38). «Me siento mal» no cuenta: no se premia estar enfermo.
- **Midiendo con cabeza** premia registrar, nunca el valor (hay prueba de que cambiar el peso o la cintura no cambia nada), igual que los puntos de PR #38. Si el abogado lee el concepto 7 («nunca sobre variables antropométricas») como «tampoco por registrarlas», se quita del catálogo y no cambia nada más.
- **«Puntos» sigue como quinta pestaña** de Progreso (B1 muestra 4 porque es anterior a PR #38). En 390 px las cinco píldoras ocupan dos renglones.
- «Te falta poco» elige lo más avanzado de **esta** semana (en la demo suele ser «Reto cumplido · 4 de 5 días»; en B1 era Buen dormir).
- La memoria (niveles, retos y semanas de Equipo ya ganados, y qué se celebró) vive en este teléfono, por cuenta. En otro teléfono se recalcula todo lo que sale de los registros; Reto cumplido y Equipo de semanas viejas no (la API ya no los trae).

## Insignias que quedaron fuera (faltan datos)

- **Técnica primero** (Entreno): no se registra que la persona vio la técnica de cada ejercicio; haría falta guardar «vio el ejercicio» en Entrenar (local o servidor).
- **Te escucho** (Registro): no existe el check-in semanal «¿cómo te sentiste?» (PR #38 tampoco lo construyó).

Por eso son 17 de las 19 del catálogo. Las dos están en `Logros.FUERA` con el motivo.

## Pruebas

- Unitarias: `tests/logros.test.js` (13): catálogo, migración de las 8, niveles 1/4/12 con sus fechas, «nunca por hacer más», cada regla de proceso, hitos, estados y «Te falta poco», memoria, celebración una sola vez, Equipo (cumplida, menos de 5, opt-out, sin compartir, en pausa, sin aporte propio, meta de puntos), Reto cumplido, textos y dibujos (peso y sin imágenes externas). `tests/demo-data.test.js`: la colección de Ana cualquier día y el momento del descanso.
- E2E: `tests/e2e/ib-logros.spec.js` (8): colección con estados y lector de pantalla, detalle, momento de ganarla (≤ 1 s, una sola vez), que no salte a mitad de los toques del agua, «Reducir movimiento», 390 px al 200 % con DejaVu en oscuro y claro con AA, un asesorado no ve insignias de otros y Equipo, y la ficha del coach. Al día: `ux1-inicio` (pestaña «Logros», la hoja tras «Día completo»), `ux1-coach` (la ficha), `s15-demo`, `site-pruebas` (v55).

## Lo que no se probó

- iPhone real: VoiceOver con los botones de las insignias, la letra grande de iOS en la colección y la hoja, y «Reducir movimiento» del sistema.
- Un Android modesto de verdad (solo se midió el cálculo en Node y el peso del SVG).
- La caché v55 reemplazando a la v54 en una PWA instalada.
- Equipo con el servidor real (solo con el servidor falso; usa `my_team_goal` y `my_points` tal como ya los devuelve la migración de PR #38).
