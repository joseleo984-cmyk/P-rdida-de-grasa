# Avisos push — parte 1 (mensaje del coach y rutina nueva)
Estado: construido y probado en servidor falso; **NO probado con un aviso real** (necesita iPhone con la app instalada y los pasos de abajo).
Texto legal: `equipo/legal/concepto-12-2026-11-01-push.md` (literal del abogado, con el complemento del 2 nov: consentimiento por capas, filas de §3 y §11 y fecha aprobadas). Política v1.3 (informativa; la 1.2 sigue vigente).

## Qué hace
- Más → **«Avisos en tu teléfono»** (solo asesorados con coach). Al tocar sale el resumen literal A11 (por capas, con enlace a la Política); «Activar notificaciones» registra el consentimiento `push` (versión `0.1-A11-push`, con huella) y recién ahí el teléfono pide permiso. «Ahora no» no guarda nada.
- Dos interruptores: mensajes y notas del coach; actualizaciones de rutinas. «Desactivar avisos» borra el identificador del dispositivo y deja el consentimiento en «no».
- El servidor guarda solo el identificador técnico (endpoint + 2 claves públicas del navegador) y 2 preferencias. Se borran al apagar y al eliminar la cuenta.
- El aviso lleva solo el TIPO; las frases viven en `sw.js`: «Tienes un mensaje nuevo de tu coach» y «Tu coach actualizó tu rutina». Sin datos de salud, sin vista previa, sin cobros.
- Un aviso por tipo pendiente (sin ráfagas). Las notas y rutinas ponen una fila en `grasa.push_outbox` (disparadores); la función `push-enviar` la envía.

## Pasos de José (en el proyecto `plataforma`)
1. **SQL:** pegar `supabase/migrations/20261106120000_r1_push.sql` en SQL Editor (también va dentro de `supabase/r1.sql`). Debe terminar sin error.
2. **Función:** Edge Functions → crear `push-enviar` → pegar `supabase/functions/push-enviar/pegar-en-el-panel.ts` → dejar «Verify JWT» **activado** → Deploy. No pide secretos: crea sus propias claves VAPID la primera vez (quedan en una tabla que solo ella puede leer).
3. **Webhook:** Database → Webhooks → crear: tabla `grasa.push_outbox`, evento **Insert**, tipo **Supabase Edge Functions**, función `push-enviar`, método POST.
4. Publicar la app (PR) y probar en el iPhone con la app **instalada** (iOS 16.4 o más): Más → Avisos → Continuar y permitir; pedirle al coach que escriba una nota.

## Pendiente (etapa 2)
- Recordatorio diario (requiere guardar la hora en el servidor y un programador) e insignias (hoy se calculan en el teléfono). El texto legal ya los cubre; faltan los interruptores correspondientes (el abogado pidió 4).
- **Aprobado por el abogado (2 nov):** texto corto por capas en el modal (versión `0.2-A11-push`), filas de §3 y §11, fecha «Vigente desde 2 de noviembre de 2026» y la micro-nota sobre el nombre de la app en la pantalla bloqueada (ya está en la pantalla de avisos). Pendiente solo: el aviso informativo en pantalla «…(v1.3) para incluir los avisos opcionales en tu teléfono. Conócela aquí.» (redacción mía, informativa).
- La función `push-enviar` nunca se ejecutó contra Supabase ni contra Apple: si no llega el aviso, revisar los logs de la función y que el Webhook exista.
