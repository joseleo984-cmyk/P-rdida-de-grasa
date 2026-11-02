# Lesiones y condiciones médicas — paso 1 (concepto 13)
Estado: construido y probado en servidor falso y en base de datos; **NO probado en iPhone real**. Especificación completa: `lesiones-y-mensajes-spec.md`. Textos: `equipo/legal/concepto-13-2026-11-02-lesiones.md`.

## Qué hace
- **Asesorado:** Más → «Mis lesiones y condiciones». Registra una lesión o una condición médica (zona/condición, descripción con sus palabras, desde cuándo). Textos literales del abogado según el tipo y la autorización (casilla SIN marcar, solo la primera vez) para registrar y compartir con su coach. Lesión: estados activa → en recuperación → superada (historial). Condición médica: siempre activa. Una lesión pasa a condición médica con el modal literal. Ve las notas de seguimiento de su coach. Puede borrar.
- **Coach:** en la ficha, «Lesiones y condiciones» con estado, descripción, antecedentes (superadas) y notas de seguimiento, con el aviso del abogado («este registro es un reporte del usuario…»). Si la persona retira la autorización o se desvincula, el coach no ve nada.
- **Aviso push al coach** (neutral, «Tienes un aviso de un asesorado»): al registrar, cambiar de estado o reclasificar. El coach activa los avisos en Más → Avisos (toggle «Avisos de asesorados»).
- **Política v1.4 (informativa):** §3 (reportes de molestia y restricciones auto-declaradas) y §11; aviso en pantalla una vez; las v1.0–1.3 siguen vigentes.

## SQL (v1.20)
`supabase/migrations/20261107120000_r1_lesiones.sql` (también en `supabase/r1.sql`). Se pega en el proyecto `plataforma` ANTES de publicar la app.

## Pendiente (pasos 2 y 3)
- Paso 2: «Reportar molestia o dolor» por ejercicio en el paso a paso, lista «ejercicios a evitar», advertencias al asignar (textos del abogado en el concepto 13) y la **cláusula del Acuerdo del Coach** sobre listas de exclusión y no uso terapéutico (Acuerdo nueva versión; el coach re-acepta al programar).
- Paso 3: chat en los dos sentidos (concepto 14: aviso previo, cláusula de confidencialidad en el Acuerdo, re-aceptación del coach).
- **Advertencia:** el Acuerdo del Coach vigente (0.8) aún no trae las obligaciones nuevas sobre estos datos (no usarlos con fines terapéuticos, remitir a consulta médica). Conviene publicar el paso 2 (que las incluye) antes de abrir esto a coaches reales.
- Decisiones mías para confirmar con el abogado: la fila de §3 («Restricciones de Salud y Molestias», ubicación «Base de datos de la plataforma», carácter «Facultativo (autorización contextual)»), la fila de §11, el aviso informativo «…(v1.4) para incluir el registro voluntario de lesiones y condiciones físicas…» y la fecha «Vigente desde 2 de noviembre de 2026».
