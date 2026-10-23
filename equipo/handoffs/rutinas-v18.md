# Etapa 2b: biblioteca de rutinas, asignar, mostrar/ocultar y «Rutina de hoy» (r1 v1.8)

Solo producto `coach`; la app OFICIAL no cambia (prueba E2E). Contrato: `equipo/r1-contrato.md` §17. Continúa `rutinas-etapa2.md`.

## Qué se creó
- **Servidor:** `supabase/migrations/20261026120000_r1_rutinas_biblioteca.sql` (aditiva e idempotente; regenera `supabase/r1.sql`). Plantillas, rutinas asignadas (varias por asesorado, con `visible`), rutina de hoy por coach, funciones SECURITY DEFINER, alias para la app vieja. Las rutinas existentes quedan como asignadas visibles.
- **App:** `rutinas.js`, `rutinas-view.js`, `remote.js`, `remote-fake.js`, `app.js` (fila y vista), `index.html`, `styles.css`, `sw.js` (caché v38). No hay archivos nuevos.
- **Coach:** Más → **Mis rutinas** (crear, editar, borrar; «Asignar a…» con casillas; «Publicar como rutina de hoy»; «Quitar la rutina de hoy»). En la ficha del asesorado: lista de sus rutinas con interruptor «Visible para el asesorado», «Entrar y modificar» (su copia), «Quitar», asignar otra de la biblioteca y crear una nueva.
- **Cliente:** Inicio muestra la tarjeta «Rutina de hoy» (solo el día publicado) y «Mi rutina»; Más → Mi rutina lista la de hoy arriba y luego sus rutinas visibles. Sigue: solo lectura, «Hoy entrené», GIF con URL firmada de 60 s al abrir cada ejercicio.

## Cómo aplicar r1 v1.8 (lo hace el dueño)
1. Supabase → SQL Editor → pegar **todo** `supabase/r1.sql` en el proyecto **`pruebas`**; debe terminar con una fila `OK r1 v1`. Se puede repetir. Después, igual en **`plataforma`**.
2. Publicar la app (merge a `main`): la copia `/pruebas/` trae la caché v38. El SQL va ANTES que la app; la app vieja sigue funcionando (alias de v1.7).

## Reglas definidas
- Asignar crea copias; editar la plantilla no cambia las copias; borrar la plantilla tampoco.
- Límites: 50 plantillas por coach, 20 rutinas por asesorado, 100 asesorados por asignación (todo o nada).
- Rutina de hoy: copia de la plantilla + día 'AAAA-MM-DD' del dispositivo del coach (el servidor acepta hoy ± 2 días en Bogotá). El cliente manda su fecha de hoy a `my_daily(p_today)` y solo la recibe si coincide; la app además la oculta sola pasada la medianoche. Pausa por pago: sigue viendo.

## Qué probar a mano en el iPad (`/pruebas/`)
- [ ] Coach: Más → Mis rutinas → Crear una rutina «Pecho» con GIF; guardar; aparece en la lista. La barra sigue siendo Asesorados · Invitar · Más.
- [ ] «Asignar a…»: sin marcar avisa; «Todos mis asesorados»; asignar a 2.
- [ ] Ficha de un asesorado: «Entrar y modificar» su copia; la del otro no cambia; editar la plantilla después tampoco cambia las copias.
- [ ] Interruptor «Visible para el asesorado»: apagar y, en el teléfono del cliente, la rutina desaparece (al volver a la pantalla); encender y vuelve.
- [ ] Publicar como rutina de hoy: ambos clientes la ven en Inicio con «Rutina de hoy», con su GIF. Cambiarla por otra, quitarla.
- [ ] Al día siguiente (o cambiando la fecha del teléfono del cliente) ya no aparece; el coach ve el aviso «ya no se muestra».
- [ ] Un cliente de OTRO coach no ve la de hoy.
- [ ] Cliente con «No pagó»: sigue viendo sus rutinas y la de hoy, sin «Hoy entrené».
- [ ] Letra grande del iPad y modo oscuro; botones fáciles de tocar; el interruptor se acciona tocando toda la fila.

## Pruebas (resultado de esta entrega)
`npm test` 302/302 · `PGOPTIONS='-c qa.strict=on' npm run test:db` 557 comprobaciones OK (antes 436; `120_rutinas_biblioteca.test.sql` nueva) · E2E 203 pasadas (1 intermitente ya conocido en s5-qr que pasó al reintentar) · `node equipo/qa/run-all.js` 9 suites en verde · `npm run build:site` OK.

## No verificado / límites
- Supabase real: solo probado en PostgreSQL 16 local con el stub (igual que v1.7).
- Un cliente activo puede leer cualquier GIF de la biblioteca de su coach si conociera el uuid (no se le entregan los de rutinas ocultas); no se endureció la política de Storage.
- Si un cliente se va y vuelve con el mismo coach, sus rutinas reaparecen.
- El «hoy» de cliente y coach en zonas horarias distintas puede no coincidir cerca de la medianoche (cada dispositivo compara con su fecha, como Hábitos y Medidas).
- Sin conexión no se ve la rutina (no se guarda copia local).
