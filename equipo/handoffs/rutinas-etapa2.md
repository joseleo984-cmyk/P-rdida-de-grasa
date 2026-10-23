# Etapa 2: Rutinas de ejercicios con GIFs (r1 v1.7)

Solo el producto `coach` (`config.pruebas.js`). `config.js` oficial no se toca; en la app oficial las pantallas nuevas existen en el HTML pero escondidas y `rutinas-view.js` no se activa (prueba E2E «la app OFICIAL no cambia»). Contrato: `equipo/r1-contrato.md` §16.

## Qué se creó
- **Servidor:** `supabase/migrations/20261025120000_r1_rutinas.sql` (regenera `supabase/r1.sql`): tablas `grasa.exercise_gifs` y `grasa.routines` (RLS, solo por funciones), bucket privado `ejercicios`, políticas de Storage, y `delete_my_account` que no deja GIFs. Pruebas: `supabase/tests/110_rutinas.test.sql`.
- **App:** `rutinas.js` (reglas puras), `rutinas-view.js` (pantallas), cambios pequeños en `remote.js`, `remote-fake.js`, `app.js`, `coach-panel.js`, `index.html`, `styles.css`, `sw.js` (caché v36), `scripts/build-site.js`, `tests/site.test.js`.
- **Coach:** ficha del asesorado → «Rutina de ejercicios» → «Armar rutina»: título, hasta 7 días, hasta 12 ejercicios por día (nombre, series × repeticiones, nota, animación), subir/bajar, quitar; «Mis animaciones» (subir una vez y reutilizar; ver; borrar, que se niega si una rutina la usa).
- **Cliente:** «Mi rutina» en Más y tarjeta en Inicio (solo si tiene coach). Días plegables; la animación se pide al abrir cada ejercicio con una URL firmada de 60 s nueva y se suelta al cerrarlo. Botón «Hoy entrené» marca el hábito «Entrenó» de hoy (oculto en pausa).
- El GIF/WebP no se re-codifica: se valida (tipo, tamaño ≤ 3 MB, firma de bytes) y se sube tal cual.

## Cómo aplicar r1 v1.7 (lo hace el dueño)
1. Supabase → SQL Editor → pegar **todo** `supabase/r1.sql` en el proyecto **`pruebas`**; debe terminar con una fila `OK r1 v1`. Es idempotente (se puede repetir). Después, igual en **`plataforma`**.
2. Comprobar en Storage que aparece el bucket **`ejercicios`** (privado, 3 MB, gif/webp). No hay que crear nada a mano.
3. Publicar la app (merge a `main`): la copia de `/pruebas/` trae la caché v36.
Orden: pegar el SQL **antes** de usar la app nueva; la app vieja no se rompe con el SQL nuevo.

## Qué probar a mano en el iPad (`/pruebas/`)
- [ ] Coach: abrir un asesorado → «Armar rutina»; subir un GIF real del iPad (de Fotos/Archivos) de menos de 3 MB; ver la vista previa; que un PNG o un video se rechacen con mensaje claro; uno de más de 3 MB también.
- [ ] Armar 2 días con varios ejercicios, una nota y una animación; guardar; reabrir y editar; probar los máximos (7 días, 12 ejercicios).
- [ ] Cliente (otro teléfono): Más → Mi rutina y la tarjeta de Inicio; abrir un día y un ejercicio con animación (debe moverse); cerrar y reabrir.
- [ ] Un segundo cliente del mismo coach NO ve la rutina del primero.
- [ ] Coach marca «No pagó»: el cliente sigue viendo su rutina y la animación, pero no ve «Hoy entrené».
- [ ] «Hoy entrené» aparece luego en Hábitos como «Entrené».
- [ ] Letra grande del iPad y modo oscuro: sin texto cortado; los botones se tocan bien.
- [ ] Borrar una animación en uso: se niega con un mensaje; borrar la rutina y luego la animación: funciona.

## Pruebas (resultado de esta entrega)
`npm test` 291/291 · `PGOPTIONS='-c qa.strict=on' npm run test:db` 436 comprobaciones OK (antes 342; `110_rutinas.test.sql` nueva) · E2E 201 pasadas (antes 195; `s12-rutinas.spec.js` 6 nuevas) · `node equipo/qa/run-all.js` 9 suites en verde · `npm run build:site` OK.

## No verificado / límites
- **Supabase real:** SQL probado en PostgreSQL 16 local con el stub; las políticas de Storage reales, las URL firmadas reales y el rechazo de tipo/tamaño del bucket no se probaron en Supabase. Storage **no mira los bytes** del archivo: la firma de bytes la comprueba la app y la BD recibe los 12 primeros bytes (`register_gif`), pero un cliente malicioso podría mentir en ese dato; el bucket sí impone tipo MIME declarado y 3 MB.
- Sin conexión no se ve la rutina (no se guarda copia en el teléfono). Posible mejora: guardar el texto de la rutina localmente.
- `supabase/tools/sweep-orphan-photos.js` solo barre `grasa-photos`; carpetas huérfanas de `ejercicios` (baja hecha desde el panel de Supabase) no se barren.
- `scripts/qa-live-rls.js` no se amplió (no hay acceso a Supabase).
- Un GIF registrado y no usado sigue siendo legible por todos los clientes activos de ese coach (por diseño: contenido del coach, no del cliente).
- Si el cliente se va y vuelve con el mismo coach, su rutina reaparece (la fila se conserva).
