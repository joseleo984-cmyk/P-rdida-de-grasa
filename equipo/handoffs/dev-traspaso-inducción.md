# Traspaso del experto de inducción → Dev (`equipo/handoffs/instructivos-a-dev.md`): qué se hizo

Rama `claude/dev-traspaso`. José eligió construir ahora solo la **ayuda dentro de la app** (B2).

| Punto | Estado |
|---|---|
| A. Conectar la base de datos | Pendiente de José: URL y clave publicable, DPA de Supabase y Brevo, fecha de vigencia, OTP/Brevo activo, aprobación. |
| B1. Nombre del coach en la invitación | **Ya estaba hecho**: `invite.js` usa el nombre comercial del coach (limpio y escapado); sin nombre dice «tu coach». Probado en `tests/invite.test.js`. |
| B2. Ayuda dentro de la app | **Hecho.** Más → Ayuda: 13 y 14 preguntas con respuesta fija (coach / asesorado), buscador sin acentos, botón «Escribir a soporte» (WhatsApp 3128876125, mensaje fijo sin datos de salud). Sin IA ni consentimientos nuevos. Incluye recordatorio y liga. `ayuda.js`; en la app oficial se conserva la ayuda vieja. Caché del SW v58. |
| B3. Aviso «pasas del límite gratuito de 5» en el piloto | No construido: decisión de José. |
| B4. Palabra «ranking» (Analítica) | El ranking del coach es solo de constancia (concepto 7, punto 10). Pero el rótulo literal «Tus asesorados **nunca** ven un ranking» choca ahora con la liga opcional (los que se unen ven alias y puntaje). Es texto aprobado por el abogado: **no lo cambié**; hay que pedirle una redacción. Sí corregí el pie de Puntos («…salvo que te unas a la liga semanal»). |
| B5. Demo para videos | Depende de B3. |
| B6. Recordatorio | Sin push; la FAQ lo dice así. |
| B7. Deshacer pago / reacción | No construido (el pago puede ir sin SQL; la reacción pide SQL). |
| B8. Verificar nombres de botones | Al escribir la FAQ revisé: «Mis datos y permisos» (no «Mi plan y perfil») es donde está «Borrar mi cuenta»; «Actualizar» (no «Sincronizar ahora») en la lista del coach. Los instructivos en `equipo/instructivos/` conviene corregirlos igual. |
| Instructivo coach P12 | Las FAQ de coach decían «avisos próximamente»: ya existen el semáforo y la tarjeta «Reenganche»; la FAQ de la app ya lo dice. |

Pruebas: `tests/ayuda.test.js`, `tests/e2e/ayuda.spec.js`.
