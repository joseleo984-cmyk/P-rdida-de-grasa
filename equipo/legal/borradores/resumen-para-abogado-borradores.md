> **BORRADOR v0.2 — NO VIGENTE — pendiente de revisión del abogado.** Una página para quien revise. No es asesoría legal. 2026-10-22.

# Resumen para el abogado: borradores v0.2

**Contenido:** `terminos-y-condiciones-v0.2-cuentas.md`, `politica-tratamiento-datos-v0.2-cuentas.md`, `acuerdo-coach.md`, `autorizaciones-en-app.md` (A1–A8). Los v0.1 vigentes no se tocaron. Base: `preasesoria-legal.md` y `paquete-abogado.md`. Decisión del responsable: avanzar con los 4 bloqueos (textos con cuentas, rol del coach y acuerdo, transmisión internacional) y con autorización propia de fotos. La edad mínima 18 la implementa código.

## Qué cambió respecto a v0.1
- Se eliminan las frases "sin servidor, sin cuentas, sin nube". Entran cuentas (correo + código), nube (Supabase, EE. UU., Virginia) y Brevo (correo).
- Modo local sin cuenta como alternativa siempre disponible (para no condicionar el servicio a datos sensibles).
- El coach pasa de "encargado" (v0.1) a **responsable independiente de su propio uso**, con acuerdo aceptado en la app.
- Ya no hay envío de datos por WhatsApp (solo enlace de invitación).
- Consentimientos separados y sin marcar: edad, T&C/Política, datos de salud, nube/transmisión internacional, compartir por categoría, fotos (guardar / mostrar al coach).
- Nuevo: retención explícita, prueba mínima del consentimiento tras la baja, incidentes, RNBD, menores (bloqueo 18+).
- No se publican cédula; sí se mantienen dirección, correo y teléfono que ya estaban en v0.1.

## Decisiones del equipo que el abogado debe validar
1. Modelo de roles: plataforma responsable + coach responsable independiente (P4), y quién responde ante el titular.
2. Que el modo local sin cuenta baste para no "condicionar" el servicio y que compartir peso y medidas sea el objeto del servicio de coaching (P1).
3. Transmisión a Supabase con contrato **y** autorización expresa; suficiencia del DPA de Supabase/Brevo frente al contenido mínimo del Decreto 1074 y si debe haber anexo (P6, P7).
4. Autorización de fotos en dos pasos y si las fotos son sensibles por sí mismas (P8).
5. Registro de las aceptaciones (huella SHA-256) como prueba suficiente (P2) y aceptación electrónica del acuerdo del coach, sin firma reforzada (P5).
6. Bloqueo de menores más declaración; qué hacer si se descubre un menor (P9).
7. La plataforma como portal de contacto, sin ser parte del contrato de coaching (P15); cláusulas de limitación de responsabilidad no abusivas.
8. Límites al coach no habilitado respecto a planes de alimentación (P14).

## Puntos "a validar" (propuestas con cifras)
| Tema | Propuesta |
|---|---|
| Cuenta inactiva | Aviso a 12 meses; borrado a 13–24 meses |
| Coach sin clientes | Aviso y cierre a 12 meses |
| Copias de seguridad (si se activan) | Borrado dentro de 30–35 días |
| Prueba del consentimiento tras la baja | 3 a 5 años, seudonimizada (identificador irreversible, tipo, versión, huella, fechas) |
| Incidentes | Coach avisa en 24–48 h; reporte a la SIC: plazo/canal para persona natural no inscrita |
| Coach borra tras fin del vínculo | 30 días; trasladar reclamos en 2 días hábiles |
| Aviso de cierre del servicio | 30 días |
| RNBD | Hoy no se inscribe (persona natural); confirmar |

## Normas citadas (solo las de la preasesoría; por confirmar las marcadas)
Ley 1581 de 2012 (arts. 5, 6, 8, 14, 15 y las ya citadas); Decreto 1377 de 2013 / Decreto 1074 de 2015 (numeración **por confirmar**); Decreto 090 de 2018 (RNBD); Ley 1480 de 2011 (arts. por verificar). Lista de países adecuados de la SIC: **no confirmada**.

## Implicaciones técnicas para Dev (no hechas aquí)
Nuevos `kind` de consentimiento (`cloud_transfer`, `photo_view_coach`, `coach_agreement`); `share_nutrition` y `share_habits` hoy nacen en `true` (deben nacer apagadas si A5 va sin marcar); conservar la prueba mínima tras `delete_my_account` (hoy se borra todo); versión `compartir-2`; regenerar `legal/*.html` y subir `LEGAL_VERSIONS`.

## Pendiente fuera de los textos
DPA de Supabase y Brevo firmados/guardados; dominio y correo propios; plan de incidentes de una página; copias de seguridad (plan Pro).
