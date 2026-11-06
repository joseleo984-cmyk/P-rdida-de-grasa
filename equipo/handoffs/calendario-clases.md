# Calendario de clases (v1.24)

Pedido de los profes (6/11/2026): programar las clases del mes de cada asesorado, pero que al asesorado solo le aparezca la clase de cada día.

## Cómo funciona
- **Coach:** ficha del asesorado → tarjeta «Calendario de clases». Navega por mes, elige días (toque en cada día o el atajo «todos los lunes/martes…»), escoge una clase de «Mis rutinas» y toca «Programar en los días elegidos». «Quitar de los días elegidos» borra lo programado. Antes de programar sale el mismo aviso de «ejercicio a evitar» / historial de dolor que al asignar.
- **Asesorado:** no ve calendario. La clase de HOY aparece en su «Rutina de hoy» (Entrenar). Un día sin clase programada ve la «Rutina de hoy» publicada para todos, si existe.
- **Servidor** (`supabase/migrations/20261111120000_r1_calendario.sql`): tabla `class_schedule` (copia de la plantilla al programar, como al asignar), funciones `schedule_set`, `schedule_clear`, `coach_schedule` y `my_daily` ampliada. Se programa de ayer a 120 días adelante (hasta 62 por llamada). Se borra con la cuenta; al desvincularse el asesorado no ve nada y el coach pierde el acceso.
- Sin avisos push por clase programada (no se avisa de lo futuro).

## Pendiente de confirmar con el abogado (textos míos)
«Calendario de clases», «Programa las clases del mes. Tu asesorado solo ve la clase de cada día, cuando llega ese día.», botones y mensajes de la tarjeta.

## No construido
- Recordatorio push de «tienes clase hoy» (se puede sumar al recordatorio diario).
- Copiar el mes anterior / repetir semana completa (hoy: «todos los lunes…» y toques).
