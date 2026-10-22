# Handoff: Sprint 4, Inicio del cliente y panel del coach (DEV Frontend)

Alcance cerrado por el Stakeholder: solo 2 historias, mejora de apariencia. No cambian los datos ni la sincronización.

## Qué cambió
**1) Inicio del cliente** (`#view-panel`, orden de arriba a abajo)
- Saludo "Hola, <nombre>" (sin nombre: "Hola") y la fecha ("Miércoles 21 de octubre"). Aviso de instalación, perfil por completar y banner de copia siguen arriba como antes.
- Tarjeta **Hoy llevas**: kcal de hoy contra la meta del plan, barra, "Te quedan N kcal" (o "Te pasaste N kcal"), proteína "X de Y g" y agua "X de 8 vasos", cada una con barra (`role="progressbar"` con `aria-valuetext`). Sin perfil no hay meta y se avisa "Sin meta: completa tu perfil".
- Botón **Repetir el desayuno de ayer**: aparece solo si ayer hay un desayuno (y hoy aún no tiene uno, para no duplicar con un toque). Usa la función existente `repeatMeals(ayer, hoy, 'Desayuno')`: ids nuevos, toast con "Deshacer", sin confirmación (es un bloque explícito y aditivo).
- Tarjeta **Tu peso**: último peso, diferencia contra la semana pasada en palabras ("0,6 kg menos que la semana pasada", "Igual…", o "Aún no hay un peso de la semana pasada para comparar") y mini línea de tendencia SVG (últimos 30 días, hasta 12 pesos) con `role="img"` y `aria-label` ("Tu peso viene bajando / subiendo / se mantiene estable"). Sin 2 pesos en 30 días no hay línea.
- Debajo, bajo el título "Más detalle", sigue TODO lo anterior sin quitar nada: notas del coach, las 4 estadísticas, progreso hacia la meta, gráfico, "Hoy" con macros y "Registrar comida", recomendaciones.
- Código: `inicio-view.js` (puro, global `HomeView`) y `renderHome()` en `app.js` (todo con `textContent`).

**2) Panel del coach** (`#view-coach`)
- "Mis clientes", subtítulo "N clientes · M necesitan un mensaje hoy" (o "todos al día" / "Aún no tienes clientes"), filas con avatar de iniciales (6 colores fijos por nombre), nombre, línea de actividad y chip con texto.
- **Umbrales** (días desde el último registro de cualquier tipo): 0 o 1 = **Al día**; 2 a 4 = **Se atrasa**; 5 o más, o nunca = **Sin registrar**. "Necesita un mensaje" = cualquiera que no esté al día. Constantes `AL_DIA_MAX = 1` y `SE_ATRASA_MAX = 4`.
- Línea: "Hoy registró · 68,4 kg (−0,6)" / "Ayer registró · …" / "Último registro: hace N días" / "Aún no ha registrado nada". La diferencia es contra el peso anterior del cliente.
- **Consentimiento**: el peso solo se muestra si `shares.body !== false`; el estado ya viene filtrado por lo que coach_pull entrega. Sin permiso de cuerpo la línea queda en "Hoy registró" sin números. Orden: más urgentes primero (Sin registrar, Se atrasa, Al día), luego más días sin registrar y por nombre.
- La ficha del cliente muestra el mismo chip y la misma línea (antes: Verde/Amarillo/Rojo). La explicación "Cómo se decide el estado" se actualizó.
- Código: `estado-cliente.js` (puro, global `ClientStatus`, reutiliza `Coach.semaforo` solo para hallar el último registro) y `renderList()`/`renderDetail()` en `coach-panel.js`. `Coach.semaforo` se conserva en `coach.js` (con sus pruebas), pero la interfaz ya no lo usa.

**Estilos** (`styles.css`, al final): tarjetas blancas de radio 20 px, texto ≥ 13 px, toques ≥ 48 px (repetir, filas, Actualizar), variables nuevas para claro y oscuro (chips, avatares, barras). **SW**: caché v26 y los dos archivos nuevos en `ASSETS`, `build-site.js` y `index.html`.

## Pruebas
- `npm test`: 152 (había 139; +13 nuevas en `tests/estado-cliente.test.js` e `inicio-view.test.js`: umbrales 0/1/2/4/5/30 días y nunca, textos, permiso de cuerpo, orden, subtítulo, iniciales, kcal/proteína/vasos, desayuno de ayer, diferencia semanal, línea de tendencia, saludo).
- E2E (`CI=1`, Chromium 390 px): 145 en verde, incluidas 6 nuevas en `tests/e2e/s4-inicio-panel.spec.js` con fuente ancha (DejaVu Sans + espaciado): sin desborde horizontal, tarjetas y chips dentro de la pantalla, texto ≥ 13 px, toques ≥ 48 px, nombre largo con letra de 20 px, Inicio vacío, repetir el desayuno (copia solo el desayuno, se oculta, foco, "Deshacer"), orden de las tarjetas y lo antiguo todavía presente, panel con 6 clientes simulados en la frontera (`PGAccount.remote.coach`; incluye un nombre con HTML que no se ejecuta y un cliente sin permiso de cuerpo). `s3-4.spec.js` y `site-pruebas.spec.js` se ajustaron (chip "Al día"; caché v26).
- `node equipo/qa/run-all.js`: 8 suites en verde (sin cambios en los scripts; ninguno dependía de lo modificado).
- `npm run build:site`: la raíz de `_site` sigue sin URL ni clave (`config.js` vacío; `tests/site.test.js` lo verifica).
- Capturas (claro y oscuro): `equipo/qa-capturas/inicio-claro.png`, `inicio-oscuro.png`, `panel-claro.png`, `panel-oscuro.png` (se regeneran con `CAPTURAS=1`).

## Riesgos y decisiones a confirmar
- **Vaso de agua**: el hábito guarda litros; 1 vaso = 250 ml y la meta es 8 vasos (2 L), fija. No hay meta de agua en el perfil; si el Stakeholder quiere otra, es una constante (`GLASSES_GOAL`).
- **"Semana pasada"** = un peso de 5 a 10 días antes del último registro (el más cercano a 7). Si no hay, se dice con claridad que falta.
- El botón de repetir el desayuno se oculta si hoy ya hay desayuno (decisión mía para evitar duplicados); si se prefiere mostrarlo siempre que ayer haya, es quitar una condición en `desayunoAyer`.
- El semáforo viejo (verde con peso bajando) ya no se muestra: un cliente que registra todos los días pero no baja de peso sale "Al día". Es lo pedido (estado = constancia), pero conviene decírselo a los coaches.
- La maqueta pone el chip "Guardado" y el mensaje del coach en Inicio: no se hicieron (fuera de las 2 historias); las notas del coach siguen en su tarjeta de siempre, ahora bajo las tarjetas.
- Los miles se muestran con punto también en 4 cifras ("1.480") sin importar la configuración del teléfono.
- Archivos prohibidos intactos: `supabase/`, `sync.js`, `remote.js`, `ns.js`, `schema.js`, `equipo/legal`, `legal/`.
