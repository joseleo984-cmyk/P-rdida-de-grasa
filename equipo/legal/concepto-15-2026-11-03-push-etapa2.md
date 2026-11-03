# Concepto jurídico 15 — Avisos push, etapa 2: recordatorio diario (v1.23) — 3 de noviembre de 2026
Fuente: dictamen de la Asesoría Jurídica pegado por José. Resumen de lo APROBADO TAL CUAL.

## Textos
- Título del interruptor: `Recordatorio diario`
- Selector: `Hora del recordatorio (Colombia)`
- Notificación push: `Recordatorio: Es hora de registrar tu día` (neutra, sin datos de salud, apta para pantalla bloqueada).

## Datos y ciclo de vida
- Token del dispositivo: se borra al apagar los avisos desde la app.
- Hora del recordatorio (`reminder_at`): puede conservarse como preferencia del perfil mientras la cuenta siga abierta, aunque los avisos se apaguen.
- Borrado en cascada al eliminar la cuenta.

## Interruptor «insignias y constancia»
Omitirlo es correcto y exigible: no se publica un control que no haga nada (veracidad, art. 4 lit. d, Ley 1581 de 2012; Ley 1480 de 2011). Solo se publicará cuando el servidor procese los hitos con la app cerrada. Controles vigentes: mensajes y notas del coach, actualizaciones de rutinas, recordatorio diario (con hora).

## Insignia numérica en el ícono
Sin riesgo legal ni consentimiento adicional; accesoria a la notificación autorizada.

## Despliegue
Aprobada la etapa 2 (v1.23) con `pg_cron` y el webhook `push-enviar`.
