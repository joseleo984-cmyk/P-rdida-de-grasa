# Analítica del coach, metas, ranking privado y panel admin — producto «coach» (rama `claude/analitica-admin`)

Construye los bocetos aprobados de `equipo/diseno/v3-analitica-admin/` (M1–M5 y M7–M10) con el **concepto jurídico 5** (`equipo/legal/concepto-5-2026-10-25.md`).
Queda FUERA **M6 (exportar a Excel)**: falta que el abogado redacte la cláusula del acuerdo del coach y el párrafo de la política. Nada de la Etapa 3.
La app oficial (`config.js` sin `producto`) no cambia; `config.js` no se tocó. Todo cuelga de `body.producto-coach`.

## SQL que hay que pegar: `supabase/r1.sql` = r1 v1.13

Migración nueva `supabase/migrations/20261031120000_r1_analitica_admin.sql`, aditiva e idempotente encima de v1.12. Contrato: `equipo/r1-contrato.md` §22.
Pruebas: `supabase/tests/170_analitica_admin.test.sql` (nueva, 80 comprobaciones), conteo de tablas de `10_estructura` (26) y lista blanca de `60_qa_seguridad`.
Pegar primero en **pruebas** (debe terminar con `OK r1 v1`) y, validado, en **plataforma**.

### Darse el rol de admin (José, a mano en el SQL Editor; nunca por la API)

```sql
insert into core.app_access (user_id, app_id, role, active)
select u.id, 'grasa', 'admin', true
from auth.users u
where lower(u.email) = lower('<TU_CORREO>')
on conflict (user_id, app_id, role) do update set active = true;
-- Comprobar: debe salir una fila con role = 'admin'
select a.user_id, a.role, a.active from core.app_access a join auth.users u on u.id = a.user_id
where lower(u.email) = lower('<TU_CORREO>') and a.app_id = 'grasa';
```
La cuenta tiene que existir antes (haber entrado una vez en la app con ese correo). Para quitarlo: `update core.app_access set active = false where role = 'admin' and user_id = (select id from auth.users where lower(email) = lower('<TU_CORREO>'));`.
Después de darse el rol, en la app: Más → «Panel admin» (aparece al volver a abrir la app o al refrescar la cuenta).

## Hecho

1. **M3 · Analítica (pestaña nueva del coach: Asesorados · Analítica · Rutinas · Invitar · Más).** Resumen con Semana/Mes: constancia promedio (días con registro de todos sobre los días del periodo) y la diferencia en puntos con el periodo anterior; registraron hoy / en el periodo; entrenaron y cuántos entrenos (solo quienes comparten hábitos; los que no, aparte: «N no comparten sus hábitos», nunca 0); tendencia de peso (bajando · estancados 3+ sem. · subiendo · sin datos, con la regla escrita en pantalla); «Necesitan atención» con el semáforo de la Etapa 1 (`Coach.atencion`) más el aviso de dolor sin revisar; «Ver todos ›» lleva a la lista; tocar una persona abre su ficha.
2. **M5 · Ranking privado** con el rótulo literal «**Solo tú lo ves.** Tus asesorados nunca ven un ranking.». Ordena por Progreso a la meta · Constancia · Entrenos. Sin metas de peso o cintura, «Progreso a la meta» sale desactivado con «Disponible cuando fijes metas». Quien no tiene meta (o no comparte hábitos, al ordenar por entrenos) queda aparte, sin puesto («Sin meta fijada: … · Fijar meta ›»).
3. **M4 · Ficha con pestañas Resumen · Gráficas · Metas · Comidas.** Resumen = todo lo de siempre (no se quitó nada). Gráficas: Peso · Cintura · Proteína · Entrenos · Constancia por Semanas (12) o Meses (6), **línea punteada de la meta** cuando el coach la fijó, tabla «Comparar semanas/meses» (elegir cuál contra la anterior) y mini gráficas de entrenos por semana (con la meta) y días con registro. Lo que no comparte sale «no comparte».
4. **M2 · Fijar metas** (hoja desde la pestaña Metas): peso, cintura, proteína (la MISMA `protein_goal_g` de la v1.11, no se duplicó) y hábitos por semana (agua, pasos, sueño, entreno). Todos opcionales, **vacíos al abrir** y sin marcadores con cifras; muestra «Hoy 72,9 kg» como dato del asesorado, nunca como sugerencia. Validación con mensajes («Agua: va de 1 a 7 días.»).
5. **M1 · Progreso → Metas del asesorado** (solo si su coach fijó alguna; si no, Progreso sigue como antes y no aparece nada de metas): peso (tendencia de 7 días, línea punteada, «faltan X kg», % del camino), cintura («faltan X»), proteína promedio de la semana contra la meta, hábitos en anillos. **Un solo pie literal** al final (concepto 5): «Metas orientativas fijadas exclusivamente por tu coach. La plataforma no formula, valida ni prescribe objetivos corporales, medidas antropométricas, requerimientos nutricionales ni pautas de entrenamiento.» No va «Meta orientativa propuesta por tu coach» en cada tarjeta. En `tests/legal-literal.test.js`.
6. **Panel admin (M7–M10)**, solo con el rol y solo en el producto coach: Más → «Panel admin» abre su barra Coaches · Uso · Por coach · Avisos · Más (en Más, «Salir del panel admin»).
   - **M7 Coaches y cobro** con filtro por mes: negocio, nombre del coach, estado, asesorados activos del mes, cupo (`free_clients`), sobre el cupo y monto estimado; totales arriba. **Precio en un solo lugar:** `admin.js` → `PRICE_USD_PER_ACTIVE_CLIENT = 5` (fase 1 de los términos). Suspender/Reactivar con hoja de confirmación y motivo opcional (solo lo ve el admin). Debajo, **«Coaches con mayor éxito»** (concepto 5, punto 6): % que completa hábitos, retención a 3 y 6 meses, pagos al día. Nunca kilos ni centímetros.
   - **M8 Uso general**: coaches activos (+ nuevos del mes), asesorados activos (+ altas − bajas), registros por semana (8), altas, bajas, retención a 30 días y coaches por tamaño; las definiciones van escritas.
   - **M9 Por coach**: selector, asesorados activos, retención, última actividad, % que registra cada semana, entrenos anotados por semana, días en que abrió el panel y su éxito (negocio y adherencia).
   - **M10 Avisos**: título, texto, desde, hasta; ayuda «Solo comunicación operativa, técnica o de servicio…»; vista previa; publicados con estado (Activo / Terminó / Programado) y «Quitar». El coach activo ve la tarjeta «Aviso de la plataforma» arriba de su lista y la cierra con ×; el cierre se recuerda en ese teléfono (`localStorage`).
7. **Demo:** metas para 7 de 8 asesorados (Hugo sin meta), tendencias variadas (4 bajando, 2 estancados, 1 subiendo, 1 sin datos como el boceto), cupo de 5 en Fit Demo, días de panel, dos avisos; **`/demo/?rol=admin`** (y botón «Ver como admin») con coaches ficticios Fuerza Studio (Andrés R., 12), Laura Entrena (6), Vida Activa (4) y Pablo Coach (suspendido): 4 / 5 activos, 11 sobre el cupo, USD 55, como M7.
8. **Infra:** `sw.js` → caché **v51** con `analitica.js`, `admin.js`, `analitica-view.js` y `admin-view.js`; `scripts/build-site.js`, `tests/site.test.js` y `tests/e2e/site-pruebas.spec.js` al día.
9. Arreglo de paso: con letra al 200 % el nombre en la barra de la ficha («‹ Anterior · Nombre · Siguiente ›») se partía letra por letra y tapaba la pantalla; ahora parte entre palabras.

## Decisiones

- **Cálculo en el servidor (M3/M5):** `grasa.coach_analytics(p_from, p_to)` devuelve por asesorado solo días con registro, días con entreno, promedios semanales de peso y primera/última medida (peso y cintura). Así la analítica no baja registros, aplica en un único sitio los permisos de compartir y `pause_private`, y la prueba de BD lo garantiza. Las cuentas finales (promedios, tendencia, ranking) las hace `analitica.js` (puro y probado). «Necesitan atención» reusa el semáforo de la Etapa 1, que ya se calcula con los datos de la lista (no hay descarga nueva si la lista estaba cargada).
- **M4 (gráficas de UN asesorado) se calcula en el teléfono** con el estado que la ficha ya descargó con `coach_pull` (mismos permisos, sin pausa privada): no hace falta otra función.
- **Tendencia:** promedios de 7 días hacia atrás desde hoy; «bajando/subiendo» si el más reciente difiere ≥ 0,3 kg del de hasta 3 semanas antes; «estancado» si difiere menos y los datos cubren 3 semanas o más; si no, «sin datos» (estable en 1–2 semanas aún no se llama estancado).
- **Colores:** tendencia (turquesa baja, violeta estancado, naranja sube, gris sin datos). En «Comparar» el cambio solo lleva color si el coach fijó meta para ese dato (turquesa: hacia SU meta; naranja: se aleja); sin meta, sin color. Sin consejos ni juicios.
- **«Abrió el panel»** no se registraba: se registra **solo la fecha** (`grasa.coach_panel_days`), una vez al día al abrir Asesorados, y se borra a los 120 días. Es un dato del coach (no de salud) y es lo mínimo para M9. La «última actividad» también usa sus acciones con hora (notas, pagos, rutinas, retos).
- **Privacidad del panel admin:** solo cantidades por coach o totales; con **menos de 3 asesorados** los porcentajes semanales, los entrenos por semana y el «% que completa hábitos» de ese coach salen «—» (con 1 o 2 se podría deducir a una persona). Se ven el nombre del negocio y el nombre del coach (identidad del coach, no de asesorados).
- **Asesorado activo** = exactamente la regla de `grasa.billing_active_clients` (vínculo activo y ≥ 1 registro sincronizado en los 30 días previos al cierre del mes; con el mes en curso, hasta hoy). Prueba de BD que compara ambos.
- **Efecto de suspender a un coach** (`grasa.coaches.active = false`, ya existía): no ve datos de sus asesorados (`coach_can_see`), no escribe rutinas, metas, notas ni pagos, no lee avisos, su código de invitación deja de servir y su lista muestra «Tu cuenta de coach está suspendida…». Sus asesorados **siguen usando la app y conservan sus datos** (sincronizan, ven sus datos). **Cambio nuevo:** antes, si el pago del asesorado vencía mientras su coach estaba suspendido, quedaba en pausa sin que nadie pudiera marcar el pago; ahora `client_payment_blocked` exige coach activo. Mientras dura la suspensión el asesorado no ve las rutinas de ese coach ni puede enviar el aviso de dolor (ya era así: exigen coach activo). Al reactivar, todo vuelve.
- **Metas:** `set_goals` reemplaza todas de una vez (lo que no viene queda vacío) y comparte la proteína con la pantalla «Meta de proteína» de la Etapa 2 (las dos escriben el mismo dato). Progreso del asesorado abre en «Metas» solo si hay alguna meta; «Medidas» sigue a un toque.
- **Ranking por progreso:** se usa la meta de peso; si no hay, la de cintura. El avance se mide desde la primera medida visible al coach.
- El panel admin solo existe en el producto coach (la app oficial no cambia).

## Pendientes

- **M6 Excel:** fuera hasta tener la cláusula del acuerdo del coach y el párrafo de la política (el texto de la casilla del concepto 5 ya es literal, no se construyó nada).
- Los avisos no se editan desde la app (solo publicar y quitar); `admin_save_notice` ya acepta `p_id` para editar.
- «Fijar meta ›» del ranking abre la ficha del primero sin meta (no de cada uno).
- Retención a 3 y 6 meses: con la plataforma recién lanzada saldrá «—» hasta que haya cohortes de esa edad.

## Lo que no se probó

- SQL contra un Supabase real (solo PostgreSQL 16 local con el stub de `test:db`). Repetir en pruebas: darse el rol, abrir el panel, suspender y reactivar un coach de prueba, publicar un aviso y verlo desde un coach.
- iPhone real: Analítica, gráficas y panel con letra grande de iOS, la hoja «Fijar metas» con el teclado decimal y el selector de mes.
- La caché v51 reemplazando a la v50 en una PWA instalada.
- Lectores de pantalla en las gráficas SVG (tienen `aria-label` y `<title>` con los valores) y en el ranking.
- Rendimiento de `coach_analytics` y de las funciones admin con muchos datos (no hay índice por `records.date`; con cientos de asesorados conviene medirlo).
