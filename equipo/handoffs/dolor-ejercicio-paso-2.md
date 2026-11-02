# Dolor por ejercicio, «ejercicios a evitar» y Acuerdo del Coach 0.9 — paso 2 (concepto 13)
Estado: construido y probado en servidor falso y en base de datos; **NO probado en iPhone real**. Textos: `equipo/legal/concepto-13-2026-11-02-lesiones.md`.

## Qué hace
- **Asesorado:** en cada ejercicio del paso a paso, botón «Reportar molestia o dolor». La primera vez sale el modal literal («Reporte de molestia física») con «Confirmar reporte» / «Cancelar»: confirmar registra la autorización contextual (`pain_report`, versión `0.1-A13-dolor`, con huella) y guarda el ejercicio y la fecha. Después reporta directo. Solo con coach activo.
- **Coach:** en la ficha, «Restricciones de entrenamiento»: lista «ejercicios a evitar» (agregar/quitar) y las molestias reportadas (con «Agregar a evitar»). Si el asesorado retira la autorización, el coach deja de ver el historial de dolor (su lista sigue siendo suya).
- **Advertencias al asignar** (rutina asignada desde la ficha o «Asignar a…», rutina de hoy para todos y al guardar la rutina de un asesorado): si un ejercicio está en «a evitar» sale «⚠️ Ejercicio restringido…» con «Asignar de todos modos» / «Cancelar»; si hay dolor reportado sale «⚠️ Historial de molestia: … el [fecha]…» (registro fáctico). No bloquea: decide el coach. Comparación por nombre sin mayúsculas ni tildes.
- **Aviso push al coach** neutral («Tienes un aviso de un asesorado») al reportar dolor.
- **Acuerdo del Coach 0.9-A7-coach** = 0.8 + cláusula 17 «Uso de listas de exclusión y adaptaciones» (literal del abogado; la numeración 17 es nuestra). La primera vez que el coach programa (o abre la sección) se le pide aceptar el acuerdo actualizado; sin él el servidor no le da el historial de dolor ni la lista. Vale también para la liga y exportar. La 0.8 queda exacta en el historial.

## SQL (v1.21)
`supabase/migrations/20261108120000_r1_dolor_ejercicio.sql` (también en `supabase/r1.sql`): pegar en `plataforma` ANTES de publicar. Requiere el SQL v1.20 (lesiones) ya pegado.

## Pendiente
- Paso 3: chat en los dos sentidos (concepto 14).
- Confirmar con el abogado: la numeración «Cláusula 17» y que para el aviso de dolor al coach se use el mismo botón «Asignar de todos modos / Cancelar» (el abogado dio esos botones para la restricción; para el historial de molestia puse los mismos).
- El texto del «Anotado. Tu coach podrá verlo.» (confirmación tras reportar) es mío.
