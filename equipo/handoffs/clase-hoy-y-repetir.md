# «Tienes clase hoy» y «Repetir las 4 semanas anteriores» (v1.25)

## 1. Aviso «Tienes clase hoy»
- **Sin interruptor nuevo.** Lo recibe quien ya activó el **Recordatorio diario**, a la hora que eligió. Si ese día su coach le programó una clase (calendario v1.24) y el vínculo sigue activo,
  el aviso de esa hora dice «Tienes clase hoy» en lugar de «Es hora de registrar tu día». Es uno solo, nunca dos.
- El aviso no lleva contenido (ni el nombre de la clase): la frase vive en `sw.js` (`class_today`). Sin datos de salud.
- Tipo nuevo `class_today` en la cola (`grasa.push_outbox`), en `push_enqueue` y en `push_daily_tick` (migración `20261112120000_r1_clase_hoy.sql`, pruebas `280_clase_hoy.test.sql`).
- **Hay que volver a pegar la Edge Function `push-enviar`** (`supabase/functions/push-enviar/pegar-en-el-panel.ts`): ahora conoce el tipo `class_today`. Sin eso, ese aviso se queda en la cola sin enviarse.
- Texto en el diálogo de avisos (bajo la hora): «Si ese día tu coach programó una clase, el aviso dice «Tienes clase hoy».»

## 2. Repetir las 4 semanas anteriores (calendario del coach)
- Botón en la tarjeta «Calendario de clases»: cada día del mes que se ve copia la clase que había 28 días antes (mismo día de la semana). Solo a días permitidos (desde ayer hasta 120 días).
- Avisa cuántas clases programa y cuántas **reemplaza** (confirmación). Las clases cuya rutina ya se borró no se pueden copiar y se cuentan aparte.
- Usa las funciones que ya existen (`coach_schedule`, `schedule_set`): sin cambios de base de datos.

## Para el abogado
Textos míos: «Tienes clase hoy», «Clase de hoy», la frase del diálogo de avisos y los mensajes del botón de repetir.
