# Comidas por la hora y tendencia de peso con clic — producto «coach» (rama `claude/comidas-tendencia`)

Dos cambios pequeños aprobados por el usuario. **Sin SQL nuevo.** `config.js` no cambia. Caché del SW **v52**.

## 1. Comidas: «Tipo de comida» visible y elegido por la hora

- En la hoja de agregar/editar (`#sheet-comida`), el tipo pasa **arriba del paso 2, justo debajo del título del plato**, como 4 botones (Desayuno · Almuerzo · Cena · Snack). Son radios nativos dentro de `<fieldset id="sc-meals">` con `<legend>Tipo de comida</legend>`: el activo va relleno de turquesa (`--on-accent`), las flechas cambian de opción y el foco se ve. Cada botón mide 48 px o más.
- **Si no caben en una fila** (letra al 200 %, fuente ancha como la de CI), `app.js` (`scFitMeals`) mide las etiquetas y pone `.two`: quedan en **2 × 2**. Vuelve a medir con un `ResizeObserver` cuando cambian el ancho, la letra o la fuente.
- Regla: `Platos.defaultMeal({ day, today, time, nowHour })` en `platos.js`, con pruebas en `tests/platos.test.js`:
  - antes de las 10 → Desayuno; de 10 a 15 → Almuerzo; de 15 a 18 → Snack; desde las 18 → Cena;
  - si hay hora escrita, se usa esa hora (sea hoy u otro día);
  - si no hay hora, se usa la hora actual cuando el día es hoy, y Almuerzo en otros días.
- **Al agregar** se aplica SIEMPRE, tanto a platos del catálogo como a comidas escritas a mano: ya no se usa la categoría del plato. Si se cambia la hora o el día, el tipo se recalcula **solo si la persona no lo tocó a mano** (ni con el dedo ni con el teclado).
- **Al editar** se respeta el tipo guardado, y cambiar la hora no lo toca. **«Mis platos»** también respeta su tipo guardado.
- «Repetir el desayuno de ayer», «Repetir <bloque> de ayer» y «Repetir la de ayer» no usan la hoja y copian el tipo guardado: no cambian, y sus E2E siguen en verde.
- E2E: `s13-comidas` tiene dos pruebas nuevas. La primera cubre: a las 20:00 «Arroz con pollo» queda en Cena, el tipo se recalcula al cambiar la hora y el día, lo elegido a mano no se pisa, editar respeta el tipo, «Mis platos» también, y el teclado con foco visible. La segunda prueba 390 px con letra al 200 % y fuente DejaVu (2 × 2 sin cortes), con contraste AA en oscuro y claro. Las pruebas que usaban el `select` (`s13-comidas`, `ux1-registro`) ahora tocan los botones. No se desactivó ninguna.

## 2. Analítica del coach: «Tendencia de peso» con clic

- En Analítica → Resumen, la barra de color (cada tramo mide 48 px de alto para el dedo y la franja de color 22 px) y cada leyenda («4 van bajando», «2 estancados 3+ sem.», …) se pueden tocar. Las leyendas son botones de 48 px. Los tramos de la barra repiten lo mismo, así que quedan fuera del orden del teclado y del lector de pantalla.
- Al tocar se abre `<dialog id="sheet-tend">` con el título «Estancados 3+ sem. · 2» y, por persona: iniciales, nombre, el cambio del promedio semanal («−0,5 kg/sem», «estable 3 sem.», «+0,3 kg/sem» o «sin pesajes suficientes») y «Último pesaje: 21 oct» (o «Sin pesajes»). Abajo va la misma regla de la tarjeta (0,3 kg y 3 semanas). La lista va ordenada por nombre y usa lenguaje neutro.
- Cada fila cierra la hoja y abre la ficha (`PGCoachPanel.open`): Anterior/Siguiente siguen funcionando. La hoja se cierra con «Cerrar», con Esc o tocando el fondo, y el foco vuelve a la leyenda de esa categoría.
- **Datos:** la categoría y el cambio salen de `grasa.coach_analytics` con la misma `Analitica.trend` de la tarjeta. Ahora devuelve también `rate` = cambio por semana entre el promedio más reciente y el más antiguo de la ventana, solo para mostrarlo; la clasificación no cambia. La fecha del último pesaje sale de lo que la lista del coach ya descargó con `coach_pull`. Ninguna de las dos fuentes trae nada de `pause_private`, y una E2E lo comprueba con pesajes en pausa privada que no aparecen. Lógica pura y probada: `trendChange`, `trendPeople` y `lastWeigh` en `analitica.js`.
- «Sin datos» muestra el motivo neutro «No hay pesajes suficientes…», sin decir si la persona comparte o no.
- **Demo** (`?rol=coach`): funciona sin tocar `remote-fake.js`. Por ejemplo, «estancados» muestra a Beto y Gina (E2E en `s15-demo`).
- E2E en `v3-analitica-admin`: tocar «estancados» muestra exactamente a esos asesorados y una fila abre la ficha con Anterior/Siguiente; además prueba la barra, «Cerrar», Esc, «sin datos» con pausa privada, y 390 px al 200 % con contraste AA en oscuro y claro.

## Lo que no se probó

- iPhone real: letra grande de iOS en la hoja de comida (2 × 2), VoiceOver en el grupo de radios y en la hoja de tendencia.
- La caché v52 reemplazando a la v51 en una PWA instalada.
- Con datos reales de Supabase: la regla es la misma y no hay SQL nuevo, pero no se abrió la Analítica contra el servidor de pruebas.
