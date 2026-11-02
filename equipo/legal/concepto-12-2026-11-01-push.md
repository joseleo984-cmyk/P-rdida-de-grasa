# Concepto jurídico 12 — Notificaciones push y tratamiento de tokens técnicos — 1 de noviembre de 2026
Fuente: respuesta de la Asesoría Jurídica a la consulta sobre avisos push, pegada por José. Texto literal; lo que sigue es el resumen operativo.

1. La autorización de entrada vigente NO cubre push (habla de comunicaciones «a través de Brevo», solo correo). No se añade casilla en el registro (minimización): consentimiento contextual o «justo a tiempo», al activar la función dentro de la app.
2. El consentimiento va en el momento de la activación voluntaria: botón «Activar avisos» → pantalla/modal breve con el aviso → «Aceptar» → diálogo nativo «Permitir notificaciones».
3. Texto literal aprobado del modal previo al diálogo del sistema:

Avisos y recordatorios en tu teléfono
Autorizo a José Granados a registrar el identificador técnico de mi dispositivo en la nube (Supabase) para enviarme notificaciones push operativas sobre mensajes de mi coach, rutinas asignadas, insignias y recordatorios diarios en el horario configurado.
- Comprendo que estos avisos no contienen datos de salud.
- Puedo modificar mis preferencias o desactivar los avisos en cualquier momento desde esta pantalla o desde los ajustes de mi teléfono.
[ Continuar y permitir ]   [ Ahora no ]

4. Política (PTI): es obligatorio incluirlo. §3 categoría: «Identificador técnico del dispositivo (token de notificación push) y preferencias horarias de recordatorio local». §4 finalidad: «Enviar alertas operativas y notificaciones push relacionadas exclusivamente con el servicio (mensajes del coach, actualizaciones de planes de entrenamiento, hitos de constancia y recordatorios programados por el usuario)». §11 conservación: «El token push y el horario se conservan única y exclusivamente mientras la función permanezca habilitada. Si el usuario apaga las notificaciones desde la app, el token debe desvincularse o borrarse del registro activo; si se elimina la cuenta, se destruye de inmediato junto con los demás datos de perfil.»
5. Un único consentimiento para el canal push (el texto del punto 3) más un panel con interruptores independientes: mensajes y notas del coach; actualizaciones de rutinas; recordatorio diario (con hora); insignias y constancia. (Mensajes del coach y rutinas son inherentes al acompañamiento; recordatorio e insignias son accesorios.)
6. Pantalla bloqueada: jamás peso, kilos, medidas, calorías, comidas ni % de grasa; cero previsualización de mensajes («Tienes un mensaje nuevo de tu coach»); sin términos médicos o peyorativos («obesidad», «déficit», «grasa», «dieta», «ansiedad»); tono neutral y de proceso, sin culpa ni coerción; sin cobros ni mensualidades.
7. Re-consentimiento modular: la actualización de la Política es informativa (no altera finalidades de quien no use push); la autorización se pide solo cuando la persona activa los avisos por primera vez; quien no los quiera sigue sin interrupciones.

---
# Complemento (2 de noviembre de 2026): información por capas y respuestas a las dudas de redacción
1. **Consentimiento por capas — SÍ es legal** (SIC y guías de Responsabilidad Demostrada). Capa 1: texto corto y claro en el modal. Capa 2: enlace a la Política completa. Texto del modal previo al permiso del sistema (reemplaza el del punto 3 anterior):

Avisos de tu coach y recordatorios
Activa las notificaciones para saber cuándo tu coach te escribe o actualiza tu rutina, y recibir tus recordatorios diarios. No enviamos datos de salud ni fotos. Puedes apagarlas cuando quieras. Consulta nuestra [Política de Datos].
[ Activar notificaciones ]   [ Ahora no ]

2. **§3 (Categorías de Datos Tratados)** — fila nueva:
| Notificaciones y Dispositivo | Identificador técnico del dispositivo (token de notificación push) y hora programada de recordatorios. | Alojado en la base de datos (Supabase) bajo tu cuenta. | Facultativo (solo si activas los avisos) |

3. **§11 (Conservación, Supresión y Retención)** — fila nueva:
| Token de notificaciones y horario de avisos | Mientras la función permanezca activa en la app. | Se elimina de inmediato de la base de datos al desactivar los avisos en los ajustes o al cancelar la cuenta. |

4. **Fecha «Vigente desde 2 de noviembre de 2026»:** APROBADA (Política v1.3).
5. **Nombre de la app («…Grasa») en la pantalla bloqueada:** no vulnera la ley (lo antepone el sistema operativo; la SIC no lo considera revelación de datos sensibles mientras el contenido no revele diagnósticos, kilos, medidas ni notas). Buenas prácticas: mensajes asépticos («Tienes un mensaje nuevo», «Tienes una nueva rutina disponible») y, en los ajustes de notificaciones de la app, esta micro-nota: «Nota: El nombre de la app siempre se mostrará en las alertas de tu teléfono. Si prefieres total privacidad en tu pantalla bloqueada, puedes ocultar las previsualizaciones de notificaciones desde los ajustes de tu sistema operativo.»
