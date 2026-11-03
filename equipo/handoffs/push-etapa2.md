# Avisos push, etapa 2: recordatorio diario (v1.23)

Más → Avisos en tu teléfono → «Recordatorio diario» (apagado de entrada) con la hora (Colombia). A esa hora llega «Recordatorio: Es hora de registrar tu día» (fijo, sin datos).

## Cómo funciona
- `push_prefs` guarda `reminder` y `reminder_at`. Un programador (pg_cron) llama cada 5 minutos a `grasa.push_daily_tick()`, que mete un aviso `reminder` en la cola una vez al día, dentro de las 2 horas siguientes a la hora elegida. De ahí en adelante es el camino de siempre (webhook → `push-enviar`).
- Hay que **volver a pegar `push-enviar`** (ahora conoce el tipo `reminder`) y **activar pg_cron** (SQL aparte, ver mensaje de José).
- Apagar los avisos borra el dispositivo; el horario se borra con la cuenta (cascada).

## Pendiente de confirmar con el abogado (lo redacté yo)
- Etiquetas «Recordatorio diario» y «Hora del recordatorio (Colombia)»; frase del aviso «Es hora de registrar tu día».

## No construido
- Interruptor «insignias y constancia» (el abogado pidió 4 interruptores; faltan este). Las insignias se calculan en el teléfono; avisarlas con la app cerrada requiere calcular hitos en el servidor. No se pone un interruptor que no haga nada.
- Insignia numérica en el ícono de la app.
