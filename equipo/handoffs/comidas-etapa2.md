# Etapa 2: comidas con catálogo de platos colombianos (solo producto `coach`)

La app OFICIAL no cambia (prueba E2E). No hay migración SQL: **el dueño NO debe pegar r1.sql esta vez**.

## Qué se hizo
- **`platos.js`** (nuevo, puro, con `tests/platos.test.js`): 115 platos de Colombia y el Caribe colombiano en 9 categorías (desayunos, almuerzos, sopas, cenas ligeras, snacks, fritos, frutas, bebidas, postres). Cada uno: id estable, nombre, categoría, descripción de la porción normal, kcal, proteína, carbohidratos y grasa (alcohol aparte en cerveza, aguardiente y vino, a 7 kcal/g). Búsqueda sin tildes ni mayúsculas (palabras en cualquier orden, también por otro nombre: «perico», «pandebono»), filtro por categoría y «Recientes». Porciones: media (×0,5), normal, grande (×1,5) y doble (×2).
- **Catálogo = ESTIMACIÓN A REVISAR POR EL DUEÑO.** Los valores salen de conocimiento general sobre porciones típicas, redondeados. NO son la tabla del ICBF ni de ninguna fuente citada, y no se inventan referencias. Se calculó kcal ≈ 4P + 4C + 9G (+7 por g de alcohol) redondeada a 5; un test unitario exige coherencia dentro de ~10 %. La app dice «Calorías aproximadas» en cada pantalla. Para cambiar un valor se edita `platos.js` (no cambiar nunca un `id`: los registros del cliente lo guardan).
- **Cliente:** tarjeta «Mis comidas de hoy» en Inicio (total y «Agregar comida») y fila «Mis comidas» en Más → pantalla con navegación de días, total, lista por tipo de comida, editar, borrar con «Deshacer» y «Repetir la de ayer». Agregar: hoja con buscador, categorías, recientes, porción, tipo de comida, día (hoy por defecto, no futuro) y hora opcional; o «Escribir otra comida» (nombre + kcal). La barra sigue Inicio · Hábitos · Medidas · Fotos · Más.
- **Registro:** el mismo `state.foods` y su sync. Campos opcionales nuevos en la comida: `dish`, `portion`, `time` (`schema.js` los conserva y valida; no hay cambio de versión de esquema). «Repetir la de ayer» copia plato y porción pero no la hora.
- **Coach:** en la ficha, tarjeta «Comidas» con los últimos 7 días (hoy Bogotá incluido): total de kcal aprox. por día y por cada comida plato · porción · tipo · hora. `SHARE_NAMES` del producto coach ahora incluye comidas.
- **Compartir comidas es obligatorio:** `A5c` pasa a `compartir-c2` y `AU` a `0.2-AU`, con la redacción LITERAL aprobada por el abogado del dueño (pegada tal cual, sin tocar palabras; AU no menciona al coach). Peso y medidas y comidas son «requeridos» (casilla marcada y fija, sin interruptor); **hábitos** se muestra con un interruptor Activar/Desactivar (`role="switch"` con la etiqueta «Activado/Desactivado» fuera del texto): el marcador «[Opción: Activar/Desactivar]» del abogado se interpretó como el control y NO se escribe como texto; fotos aparte (A6a/A6b intactos). Quien ya había aceptado `0.1-AU-prueba` queda sin la autorización vigente y debe volver a aceptar (producto solo de pruebas). Vínculos con `compartir-c1` (o con comidas apagadas): `shareMigrationNeeded` ya los marca; en Inicio y Mis comidas aparece «Revisar lo que comparto» que lleva a Más → Mi coach con el aviso y la casilla fija; hasta guardar no se agrega nada. Al guardar se registran los `share_*` con el texto nuevo.
- **Servidor (revisado, sin cambios):** `coach_pull` ya entrega `food` solo si `share_nutrition` y `coach_can_see('body')` (exige sensitive_health + cloud_transfer vigentes) más el acuerdo del coach; `join_coach`/`update_shares` aceptan `nutrition`. La obligatoriedad es regla de la app (el SQL es compartido con la app oficial, donde es opcional). En pausa por pago: se ven y no se suben (igual que medidas y hábitos; el servidor rechaza `sync_push`).
- SW caché 45 (`platos.js` en ASSETS), `scripts/build-site.js`, `tests/site.test.js`.

## Qué probar a mano en el iPad (`/pruebas/`)
- [ ] Inicio: tarjeta «Mis comidas de hoy»; «Agregar comida»; buscar «fríjoles» y «arepa»; categorías; porción grande y total.
- [ ] Comida libre; editar; borrar y Deshacer; repetir la de ayer.
- [ ] Letra grande y modo oscuro sin textos cortados; teclado del iPad en el buscador.
- [ ] Cliente con vínculo anterior: ve «Revisar lo que comparto» y, tras guardar, ya puede agregar.
- [ ] Coach: ficha del asesorado → «Comidas» con 7 días.
- [ ] Cliente en pausa: ve sus comidas, no agrega.
- [ ] Revisar los valores de `platos.js` (el dueño).

## Límites / riesgos
- Supabase real y Safari iOS no probados (servidor falso + Chromium).
- Una versión vieja de la app en otro dispositivo normaliza la comida sin `dish/portion/time` y, si la re-guarda, perdería esos campos (conserva nombre y kcal).
- Un cliente con una app antigua podría desmarcar comidas; el servidor no lo impide (decisión: regla de la app).
- Los textos de consentimiento siguen siendo borrador de prueba, pendiente del abogado.
