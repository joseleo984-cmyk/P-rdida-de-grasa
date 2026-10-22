> **BORRADOR v0.3 — NO VIGENTE — pendiente de revisión del abogado.** Una página para quien revise. No es asesoría legal. 2026-10-22.

# Resumen para el abogado: borradores v0.3

**Contenido:** `terminos-y-condiciones-v0.3-cuentas.md`, `politica-tratamiento-datos-v0.3-cuentas.md`, `acuerdo-coach.md`, `autorizaciones-en-app.md` (A1–A8). Los v0.1 vigentes no se tocaron. Base: `preasesoria-legal.md`, `paquete-abogado.md` y `respuestas-abogado.md` (respuestas a P1–P18 recibidas el 2026-10-22; **si no las firmó un abogado colombiano, valen como segunda preasesoría**).

**Qué cambió de v0.2 a v0.3:** retención de cuentas a 365 días con avisos los días 335 y 358; prueba del consentimiento 3 años y disociada; plataforma = portal de contacto (art. 53 Ley 1480) con límites del art. 43; nutrición clínica reservada a nutricionistas (Ley 73/1979); cláusula penal de 10 SMMLV en el acuerdo del coach; aviso de que el piloto NO tiene copias automáticas; incidentes 24 h (coach) y 15 días hábiles (SIC); quejas trasladadas en 2 días hábiles; coach destruye copias en 30 días; menores: borrado en 48 h; Brevo nombrado; textos A3 y A4 con redacción aprobada. Decisión del responsable: avanzar con los 4 bloqueos (textos con cuentas, rol del coach y acuerdo, transmisión internacional) y con autorización propia de fotos. La edad mínima 18 la implementa código.

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
| Cuenta inactiva | 365 días sin iniciar sesión; aviso día 335, recordatorio día 358, borrado día 365 (adoptado, P10) |
| Coach sin clientes | Misma regla de 365 días |
| Copias de seguridad | Piloto: sin copias automáticas (avisado en T&C); producción: plan Pro; borrado en copias 30–35 días (a validar) |
| Prueba del consentimiento tras la baja | 3 años, disociada (UUID anónimo, tipo, versión, huella, marcas de tiempo; P11) |
| Incidentes | Coach avisa en 24 h; SIC en 15 días hábiles desde la constatación y titulares afectados (**por confirmar** plazo y aplicación a persona natural; P12) |
| Cláusula penal del coach | 10 SMMLV por evento, exigible sin requerimiento (**a validar la cuantía**; P5) |
| Coach destruye tras fin del vínculo | 30 días; trasladar reclamos en 2 días hábiles |
| Menores | Suspender, rechazar sincronización y borrar en 48 h (P9) |
| Aviso de cierre del servicio | 30 días |
| RNBD | Hoy no se inscribe (persona natural); confirmar |

## Normas citadas (solo las de la preasesoría; por confirmar las marcadas)
Ley 1581 de 2012 (arts. 5, 6, 8, 14, 15 y las ya citadas); Decreto 1377 de 2013 / Decreto 1074 de 2015 (numeración **por confirmar**); Decreto 090 de 2018 (RNBD); Ley 1480 de 2011 (arts. por verificar). Lista de países adecuados de la SIC: **conflicto sin resolver** (la preasesoría halló a EE. UU. en la Circular 005/2017; la respuesta recibida el 2026-10-22 dice que no está); A4 + DPA cubren ambos casos. Además: Ley 527 de 1999, Ley 73 de 1979 y Decreto 2270 de 1980 (contenido por confirmar), art. 269F del Código Penal (por confirmar).

## Implicaciones técnicas para Dev (no hechas aquí)
Nuevos `kind` de consentimiento (`cloud_transfer`, `photo_view_coach`, `coach_agreement`); `share_nutrition` y `share_habits` hoy nacen en `true` (deben nacer apagadas si A5 va sin marcar); conservar la prueba mínima tras `delete_my_account` (hoy se borra todo); versión `compartir-2`; regenerar `legal/*.html` y subir `LEGAL_VERSIONS`.

## Pendiente fuera de los textos
DPA de Supabase y Brevo archivados y acuerdo firmado con los 2 coaches del piloto (tareas del Stakeholder); dominio y correo propios; plan de incidentes de una página; copias de seguridad (plan Pro).
