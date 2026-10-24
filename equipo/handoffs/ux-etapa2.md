# UX Etapa 2 — producto «coach» (rama `claude/ux-etapa2`)

Sigue a `equipo/handoffs/ux-etapa1.md`. Implementa L4 (pregunta de salud y de embarazo, lactancia o posparto), L5 (meta de proteína del coach), retos del coach y P1 (modo autónomo en pausa), con los textos literales de `equipo/legal/concepto-2-2026-10-24.md` (anexo 2, L5, P1) y `equipo/legal/concepto-3-2026-10-24.md` (nuevo, aprobado: embarazo, lactancia o posparto).
La app oficial (config.js sin `producto`) no cambia: todo cuelga de `Producto.coach`. `config.js` no se tocó.

## SQL que hay que pegar: `supabase/r1.sql` = r1 v1.11

Migración nueva `supabase/migrations/20261029120000_r1_etapa2_coach.sql` (aditiva e idempotente, encima de v1.10). Contrato: `equipo/r1-contrato.md` §20. Pruebas: `supabase/tests/150_etapa2_coach.test.sql` (nueva), conteo de tablas en `10_estructura` (22) y lista blanca de `60_qa_seguridad`.
Pegar primero en **pruebas** (debe terminar con `OK r1 v1`) y, validado, en **plataforma**. Con la app nueva y el SQL viejo: la pregunta de salud y los retos dan un error amable y la meta no aparece.

## Hecho

1. **L4 · Pregunta de salud** (imágenes A03 y A03b). Pantalla propia con el bloque literal del anexo 2 (encabezado, pregunta, «Sí / No / Prefiero no responder» y el micro-texto que aparece solo con «Sí»; el botón pasa a «Entendido, continuar»). Después, la de **embarazo, lactancia o posparto con el texto literal del concepto 3** (aprobado por el abogado; ya no está pendiente). Se guarda en `grasa.health_answers` con la versión (`1.0-L4`, `1.0-L4E`) y el SHA-256 del texto que vio. RLS: solo la persona la lee y la escribe; el coach no tiene ninguna política sobre la tabla.
   - **Cuándo aparece:** no bloquea la app. Mientras falte alguna respuesta, Inicio muestra la tarjeta «Una pregunta antes de empezar · Responder», que abre la pantalla («Paso 2 de 3 · Tu salud», como la imagen). Se puede cambiar cuando quiera en **Más → Tu salud** (ahí la cabecera dice solo «Tu salud» y sale lo ya respondido marcado).
   - **Coach:** solo ve el indicador, sin detalle. Lista (C01): línea «▲ Restricción de salud» o «▲ Embarazo, lactancia o posparto». Ficha (C02): aviso «Tiene una restricción de salud · Sin detalle. Pide aval médico antes de planes exigentes.» (y su par para embarazo/posparto). Si la persona retira A3 o A4, el indicador desaparece.
2. **L5 · Meta de proteína.** El coach la escribe por asesorado en la ficha → «Meta de proteína» (C05): campo vacío si no hay meta (los botones − / + no proponen ningún número hasta que el coach escriba uno), vista previa «Así la verá … en Comidas» con el texto literal y «Guardar meta» / «Quitar la meta». El asesorado la ve en Comidas (A06): «Proteína de hoy ~78 g de ~110 g», barra que se llena hasta el 100 % (sin rojo ni «te faltan») y el texto literal L5 con la cifra del coach. **Sin meta del coach no hay barra ni texto de meta.** La app no calcula nada (ni con perfil y peso).
3. **Retos del coach** (C04 y 04-gamificación §4). Más → Retos: Toque 1, cuatro plantillas de proceso (7 días de agua · 3 entrenos esta semana · Dormir 7 h · Registra tus comidas); Toque 2, «Todos · N» o «Elegir»; las fechas se ponen solas (hoy + 6 días) y «Cambiar título, meta o fechas» deja ajustarlas (máx. 31 días; la meta no pasa de los días del reto). La lista muestra cada reto con «N de M van en camino», «quedan N días», barra, «Ver cómo va cada uno» (solo el coach), «Felicitar a los que cumplieron» (manda una nota del coach a cada uno) y «Quitar este reto». El asesorado ve en Inicio «Reto de Coach…», el título, puntos ●●○ y «2 de 3 · quedan 3 días», y marca su avance con «Hoy lo cumplí». Sin premios, sin ranking ni comparación: el asesorado nunca ve a los demás miembros. No hay retos de kilos (el servidor solo acepta water/steps/sleep/trained/foods).
4. **P1 · Modo autónomo en pausa** (A12). Inicio en pausa: «Tu plan con … está en pausa», «Desde el 17 oct. Tu progreso está guardado…», «Escribirle a mi coach» (abre WhatsApp con un mensaje listo; la app no tiene el teléfono del coach, la persona elige el chat) y «Ya pagué: volver a comprobar»; «Mi día · modo autónomo» con el **aviso literal P1** y Agua y Sueño de un toque; «Tu constancia — congelada, no se pierde», «Rutina y notas — solo lectura ›» (abre Entrenar) y «Tus datos siguen siendo tuyos: Ver · Descargar · Borrar mi cuenta».
   - **Constancia congelada** (C06: «La constancia se congela en pausa»): los días de pausa (de `my_link.pauses` / `coach_clients.pauses`) no suman ni restan; una semana con días en pausa que no llega a constante se salta sin cortar la cuenta. Igual para el asesorado y para el coach (ficha → Constancia, las semanas con pausa van con borde punteado).
5. **Pendientes de la Etapa 1 cerrados:** barra de proteína en Comidas (con meta del coach), fila del indicador en la lista (C01) y aviso en la ficha (C02).
6. **Demo** (`demo-data.js`): Ana con «Sí» en la pregunta de salud y meta de 110 g; Elena con «Sí» en la de embarazo, lactancia o posparto; Beto con meta de 150 g; el resto con «No»/«Prefiero no responder» (Hugo sin responder); reto «7 días de agua» para todos menos Diego (con avances distintos); Diego en pausa con 3 días de hábitos anotados en modo autónomo que el coach no ve (los ve él).
7. **Infra:** `sw.js` → caché **v49** con `etapa2.js` y `etapa2-view.js`; `scripts/build-site.js`, `tests/site.test.js` y `tests/e2e/site-pruebas.spec.js` al día.

## Cómo se garantiza EN EL SERVIDOR que el coach no ve lo de la pausa

- `grasa.records.pause_private` lo pone un **disparador** (`grasa.mark_pause_private`, SECURITY DEFINER) en cada INSERT/UPDATE: es `true` si la dueña tiene el vínculo activo vencido en ese momento **o** si la fecha del registro cae dentro de una pausa ya cerrada de su vínculo (lo anotado sin conexión durante la pausa y subido después de reactivar). En UPDATE es `old OR nuevo`: **una vez privado, privado para siempre** (aunque se edite después de reactivar o se intente poner `false` por la API de tablas; hay prueba).
- `grasa.coach_pull` filtra `and not r.pause_private` siempre; `grasa.coach_clients` calcula la «última actividad» sin filas privadas (no se delata que registró en la pausa).
- `grasa.sync_push` en pausa acepta SOLO un lote con ≥ 1 registro y todos `kind = 'habit'` (sin fotos); lo demás sigue con `payment_required`. Las marcas de retos hechas en pausa quedan con `pause_private` y `list_challenges` no las cuenta.
- Los periodos de pausa se guardan en `grasa.link_pauses` cuando el coach marca el pago (de `paid_until + 1` a ayer).
- Pruebas: `supabase/tests/150_etapa2_coach.test.sql` (en pausa / reactivada / desmarcar por la API / subido sin conexión / última actividad / retos), `tests/etapa2.test.js` (servidor falso + sincronización en modo autónomo) y la E2E `ux2-etapa2.spec.js`.
- En el teléfono, `sync.js` en modo autónomo (`store.autonomous()`) sube solo los hábitos y no avanza `pushedUpTo`: medidas y comidas esperan a que vuelva el acceso (y si son de días de la pausa, también quedan privadas).

## Decisiones que conviene conocer

- **La pregunta de salud no bloquea.** La imagen la pone como «Paso 2 de 3» del primer uso, pero el primer uso de 3 pasos (A01) aún no existe; bloquear la app al entrar habría cortado a todos los asesorados actuales. Queda como tarjeta en Inicio + Más → Tu salud. Cuando se construya A01, conviene meterla como paso 2 real.
- **La pregunta de embarazo se muestra a todas las personas** (el producto coach no pide sexo); quien no aplica responde «No». El texto aprobado dice «No estás obligada a responder».
- **Al coach llegan dos indicadores separados** (restricción de salud; embarazo, lactancia o posparto): el concepto 3 dice que se comparte «únicamente este estado» para adecuar la intensidad.
- **Evidencia del «Sí»:** queda en `health_answers` (versión + hash + fecha). No se añadieron tipos nuevos a `core.consent_events` porque la migración de v1.4 redefine ese CHECK y dejaría de ser idempotente con filas nuevas. Consecuencia: al borrar la cuenta no queda copia seudonimizada de esa autorización (sí del resto). Preguntar al abogado si basta.
- **Retos:** el asesorado marca su avance a mano («Hoy lo cumplí»), no se calcula de sus hábitos. Sin «Grupo» (no hay grupos en el modelo de datos) y sin «Unirme al próximo». En pausa la tarjeta sigue visible (modo autónomo) con la nota «este avance es solo tuyo y tu coach no lo verá». Diego no está en el reto de la demo para que su Inicio quede como A12.
- **En pausa, Mi día solo trae Agua y Sueño** (como A12): Pasos, Entrené, «+ Comida», «Igual que ayer» y «Corregir otro día» no se muestran. El servidor aceptaría cualquier hábito.
- «Escribirle a mi coach» abre `wa.me/?text=…` sin número.
- La barra de proteína pasa de gris a turquesa (como A06).

## Fuera de alcance (Etapa 3, sin activar)

Alertas de seguridad L6 (y la fila «Alerta de seguridad sin revisar» de C01), tarjeta de ayuda 106/192 (A14), cláusulas 7.3/7.4 del acuerdo del coach, política v1.1 con banner (A13) y finalidad L6d.

## Lo que no se probó

- SQL contra un Supabase real (solo PostgreSQL 16 local con el stub de `test:db`). Hay que pegar r1 v1.11 en pruebas y repetir a mano: pausa → registrar agua → el coach no lo ve → marcar pago → sigue sin verlo.
- iPhone real: la pantalla de salud a pantalla completa con letra grande, el enlace de WhatsApp de la pausa y el teclado numérico de la meta.
- La caché v49 reemplazando a la v48 en una PWA instalada.
- Lectores de pantalla con los botones de respuesta (`aria-pressed`) y la barra de proteína.
- Retos con muchos asesorados (más de 20) y retos que cruzan un cambio de mes en el texto de fechas.
