# Puntos de constancia, meta colectiva del team, ranking sin kilos y Política v1.2 — producto «coach» (rama `claude/puntos-meta`)

Aplica el **concepto jurídico 7** (`equipo/legal/concepto-7-2026-10-26.md`, copia literal) y la parte aprobada de las propuestas de gamificación y UX (puntos personales y meta colectiva). `config.js` no cambia. Caché del SW **v54**.
**No se construyó** (concepto 7, opciones 1 y 2): ligas, posición relativa, alias, su opt-in, el aviso de cabecera de la liga, la cláusula 7.6, el rediseño de insignias ni nada de la Etapa 3. Una prueba (`tests/legal-literal.test.js`) comprueba que esos textos no están en la app.

## SQL que hay que pegar: `supabase/r1.sql` = r1 v1.15

Migración nueva `supabase/migrations/20261102120000_r1_puntos_meta.sql`, aditiva e idempotente encima de v1.14. Contrato: `equipo/r1-contrato.md` §24.
Pruebas: `supabase/tests/190_puntos_meta.test.sql` (nueva), conteo de tablas de `10_estructura` (29) y lista blanca de `60_qa_seguridad`.
Pegar primero en **pruebas** (debe terminar con `OK r1 v1`) y, validado, en **plataforma**. Con la app nueva y el SQL viejo no se rompe nada: los puntos y la meta no aparecen y el ranking muestra Hábitos y Puntos desactivados.
Los puntos empiezan a contar cuando se pega el SQL: no hay historia hacia atrás (la regla es «solo hoy y ayer»).

- `grasa.points_log` (persona, día, fuente, puntos) y dos disparadores: `records_points` (cada registro que llega por `sync_push`) y `challenge_marks_points` (cada marca de reto) → `grasa.points_refresh`. **El teléfono nunca envía puntos.**
- `grasa.my_points()`, `grasa.coach_points(from, to)`, `grasa.team_goals` + `set_team_goal`, `delete_team_goal`, `coach_team_goal`, `my_team_goal`, `set_team_opt_out`, y `coach_links.team_opt_out`.
- Todas las funciones nuevas: SECURITY DEFINER con `search_path = ''`, `revoke` de `public, anon, authenticated, service_role` y `grant execute` solo a `authenticated` en las 7 RPC. Las internas (`points_refresh`, `team_goal_out`, `points_sum`, `points_plan`, `pts_*`, `week_monday`) no se llaman por la API. Nada para `anon` (prueba de BD).

## Hecho

1. **Ajuste mandatorio (concepto 7, punto 10).** El ranking privado del coach ordena solo por **Constancia · Hábitos · Entrenos · Puntos**. Se quitó «Progreso a la meta» (kilos o cintura) de la lógica (`analitica.js` → `ranking`, `RANK_BY`) y de la vista; cualquier criterio desconocido cae en constancia. Peso y cintura siguen solo en la ficha y sus gráficas. La lista de tendencia de Analítica ya era por categoría y en orden alfabético (`trendPeople`); no ordena por kilos. «Necesitan atención» ordena por el semáforo, nunca por peso.
   - **Guía aprobada (ampliación del punto 1):** la lista «Asesorados» suma filtros por **estado operativo**: «Requieren revisión» (estancados 3+ semanas, la MISMA regla de la tarjeta de tendencia, con promedios semanales calculados como `coach_analytics` sobre lo que el coach ya ve), «Al día con registros» (semáforo al día) y «Sin pesaje reciente» (más de 10 días). Cada tarjeta muestra el **dato neutro** «Peso 71,8 kg · 20 oct · Cintura 79 cm · 6 oct» (último registro de cada uno con su fecha; sin flechas, colores de juicio ni posición; nunca `pause_private`, porque sale de `coach_pull`). La lista sigue ordenada por atención o por nombre.
   - **Punto de enganche apagado:** «Alertas activas (pérdidas atípicas/rápidas)» NO existe en la pantalla (`coach-panel.js` → `ALERTS_FILTER = false`). Depende de las alertas L6, que siguen apagadas hasta que un profesional valide los umbrales (Etapa 3). Para encenderlo: poner `true` y definir `inFilter(r, 'alertas')` con la señal L6 del servidor.
2. **Puntos de constancia personales** (reglas de la propuesta aprobada; `puntos.js` = referencia ejecutable que usa el servidor falso, y la migración = el cálculo real):
   - registrar el día 2 · agua 1 (≥ 8 vasos) · pasos 1 (≥ 8.000; más no suma) · sueño 1 (7 a 10 h) · 2 comidas registradas 1 (las kcal no importan) · entreno 3 hasta los entrenos del plan por semana (la meta de días de entreno que fijó el coach; 5 si no hay) · **descanso planificado o «me siento mal» 2** (hasta 7 − plan días, entre 1 y 3) · **medidas 3 por registrar**, una vez por semana y con 6 días o más entre registros, **nunca por el valor** · volver tras más de 7 días 5 (una vez cada 30 días) · bonos: semana constante 5 (el lunes, misma regla de comodines que `constancia.js`) y reto cumplido 10 (máx. 2 por semana).
   - **Topes:** 12 al día (sin los bonos) y 80 a la semana; se recorta por el final de la lista.
   - **Solo hoy y ayer** (y mañana, por el desfase de zona horaria del teléfono): lo que llega después se guarda, no da puntos, y los puntos de un día pasado quedan fijos. Hoy y ayer se **recalculan** desde lo registrado (editar no suma doble).
   - **Valores raros** sin puntos (> 60.000 pasos, > 8 L de agua, > 14 h de sueño, peso fuera de 30–300 kg, cintura fuera de 40–200 cm).
   - **Retos:** un día marcado del reto cuenta para el bono SOLO si ese día hay registro real a tiempo del hábito del reto.
   - **Pausa:** no se gana ni se pierde nada; lo `pause_private` nunca suma (ni después de la pausa).
   - **Nunca** por peso, centímetros, kcal ni fotos (las fotos ni se leen).
   - **Dónde se ven:** línea en Inicio («34 puntos esta semana · +8 hoy ›», abre Puntos); **Progreso → Puntos** (semana, hoy con desglose, 8 semanas comparadas SOLO consigo misma —«6 más que la semana pasada», «Tu mejor semana»—, nivel por puntos acumulados, «Cómo se ganan»); criterio «Puntos» en el ranking privado del coach. En **Mi día** hay dos botones nuevos: «Hoy es mi día de descanso» y «Hoy no entreno: me siento mal» (campo `rest` del hábito, validado en `schema.js`; excluye «Entrené» ese día).
   - **Ocultar mis puntos:** Más → «Puntos y meta del team». Se recuerda en el teléfono (por cuenta), como el aviso de la política: los puntos se siguen guardando y el coach los sigue viendo.
   - **Por qué en el servidor:** los hábitos los anota la persona; si el teléfono calculara los puntos, bastaría con editar el almacenamiento local o llamar la API para inventarlos. Con el disparador, el servidor decide con sus propias reglas, su reloj (hoy y ayer de Bogotá) y sus datos (`grasa.records`, marcas de retos, pausas), y la tabla no se escribe por la API.
3. **Meta colectiva del team (concepto 7, punto 7).** El coach la crea en Más → Retos → «Meta del team · esta semana»: Entrenos o Puntos y un número que él escribe (la app no sugiere ninguno). Asesorados: barra común en Inicio y en Puntos con «N de M entrenos · K personas sumando» y «nadie ve cuánto suma cada persona». **Mínimo 5:** con menos, no se publica nada (ni el total ni el número de personas) y se dice «La meta del team se activa cuando sean 5 o más.». Opt-out en Más («No sumar mis hábitos a la meta del team»). El coach ve el mismo agregado, sin desglose.
   - **Quién suma:** vínculo activo, coach activo, A3 + A4 vigentes, **comparte hábitos y comidas con su coach**, sin pausa y sin opt-out. Lo de compartir es a propósito: si sumara alguien que no le comparte hábitos, el coach podría restar del total lo que sí ve de los demás y deducir lo de esa persona.
   - **Menores de 18 (punto 11):** pueden participar en la meta colectiva; no hace falta lógica de edad aquí (además la app hoy exige 18 años: `Schema.AGE_MIN`). **Para excluirlos de ligas en el futuro:** guardar la fecha de nacimiento declarada en el servidor (hoy solo vive en el perfil del teléfono), una función interna `grasa.league_eligible(user)` que exija ≥ 18 años a la fecha de Bogotá, usarla en el opt-in de la liga (servidor) y ocultar el interruptor en la app cuando dé falso.
4. **Política v1.2 (concepto 7, punto 5).** Finalidad literal como **4.6** en `equipo/legal/politica-tratamiento-datos.md` (y **4.9** en el borrador con cuentas), `legal/privacidad.html` regenerado (`npm run legal`), `legal/VERSIONS.json` 1.2 con `acceptedStillValid: ["0.1", "1.1"]` y aviso `politica-1.2`; `Schema.LEGAL_VERSIONS.privacy = '1.2'`, `LEGAL_COMPAT.privacy = ['0.1', '1.1']` (sin re-aceptación). Aviso literal v1.2 con «Entendido» (`aviso-politica.js` → `TEXT`; el de la v1.1 queda en `TEXT_V11`): sale una vez por cuenta y dispositivo, también a quien ya cerró el de la v1.1. «Exportar a Excel» sigue habilitado (exige ≥ 1.1).
5. **Demo** (`?rol=asesorado` y `?rol=coach`): 8 semanas de puntos por asesorado (cada día calculado «como si» se hubiera registrado a tiempo; solo para sembrar) y «Entre todos: 20 entrenos» en curso con 5 personas sumando (Ana, Beto, Elena, Fabio y Hugo; Hugo ahora comparte hábitos para llegar a 5). El ranking de la demo por constancia ya no deja a Hugo «sin meta».
6. **Infra:** `sw.js` → caché **v54** con `puntos.js` y `puntos-view.js`; `scripts/build-site.js`, `tests/site.test.js` y `tests/e2e/site-pruebas.spec.js` al día.

## Pruebas

- BD `190_puntos_meta` (cada regla, topes, pausa, retos, semana constante, quién ve qué, meta con menos de 5, opt-out, pausa, sin ids; fechas con `tests.today()`).
- Unitarias: `tests/puntos.test.js` (reglas y servidor falso), `tests/analitica.test.js` (ranking sin kilos, filtros y dato neutro), `tests/legal*.test.js` (v1.2 y concepto 7).
- E2E: `pm-puntos-meta` (8 pruebas: puntos en Inicio y Progreso, medir sin resultado, tope de 12, ocultar, descanso y «me siento mal», pausa, meta del asesorado sin datos ajenos, opt-out, menos de 5, coach, ranking, filtros y dato neutro, aviso v1.2 una vez, 390 px al 200 % con DejaVu en oscuro y claro con AA), y al día `v3-analitica-admin`, `ux1-prescripcion`, `s15-demo`, `m6-exportar`, `s11-cobros`, `ux1-coach`.

## Pendientes

- El concepto 7 dice que la meta colectiva debe «incluirse de forma informativa en la Política v1.2», pero el abogado solo entregó el texto de la finalidad (que habla de puntos y ligas). **No se inventó un texto**: pedirle una frase literal sobre la meta colectiva (y el opt-out) o confirmar que la finalidad 4.6 basta.
- Consulta abierta con el usuario: si «ocultar mis puntos» debería ocultarlos también al coach (hoy no; la propuesta lo pensó solo para la persona).
- Partes de la tabla de la propuesta que **no** se construyeron porque no existen las acciones: check-in semanal «¿cómo te sentiste?», leer una nota del coach, «modo tranquilo» del coach, aviso al coach por 3 «me siento mal» en 14 días o 7 de 7 entrenos, y el detalle de puntos por persona para el coach (hoy ve un número por persona en el ranking).
- Los puntos de la persona se recalculan solo cuando su teléfono sincroniza. Si estuvo sin conexión más de un día, lo de esos días no da puntos (regla «hoy y ayer»).
- Los textos de la política publicada siguen con «Borrador pendiente de revisión legal» y `[FECHA DE VIGENCIA]`.

## Lo que no se probó

- SQL contra un Supabase real (solo PostgreSQL 16 local con el stub de `test:db`), en particular el rendimiento del disparador dentro de `sync_push` con lotes de 500 registros.
- iPhone real: letra grande de iOS y VoiceOver en Puntos, en la barra del team y en los filtros nuevos.
- La caché v54 reemplazando a la v53 en una PWA instalada.
- Un cambio de semana real (lunes) con la app abierta: el bono «semana constante» y la meta nueva de la semana se probaron con fechas sembradas, no esperando al lunes.
