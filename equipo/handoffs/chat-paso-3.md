# Chat asesorado ⇄ coach (paso 3, v1.22)

Construido el 2 de noviembre de 2026 según el concepto jurídico 14 (`equipo/legal/concepto-14-2026-11-02-chat.md`). Estado: **en rama `claude/chat`, pendiente de revisión de José**.

## Qué hace
- **Asesorado:** Más → «Chat con tu coach». La primera vez sale el aviso literal del abogado (solo botón «Entendido», sin casilla). Escribe texto (1 a 1000 caracteres) y ve la respuesta; se actualiza solo cada 8 segundos mientras está abierto. En Más se ve «n mensajes sin leer».
- **Coach:** en la ficha del asesorado, tarjeta «Chat» con «n sin leer». Antes de leer o responder debe aceptar el **Acuerdo del Coach 1.0** (cláusula 18, literal). El asesorado NO vuelve a aceptar nada.
- **Avisos push neutros, sin contenido:** al coach «Tienes un aviso de un asesorado» (tipo `client_alert`, lo apaga con «Avisos de asesorados»); al asesorado «Tienes un mensaje nuevo de tu coach» (tipo `coach_msg`).

## Reglas en el servidor (`supabase/migrations/20261109120000_r1_chat.sql`)
- Solo con vínculo activo. Al desvincularse, el coach pierde el acceso al instante; un coach nuevo no ve lo del anterior (cada mensaje guarda con qué coach se escribió).
- Máximo 30 mensajes por hora por persona (`rate_limited`). Reenviar el mismo id no duplica.
- Se borra con la cuenta (cascada). Sin contenido en ninguna cola de avisos.
- El coach necesita el Acuerdo 1.0 (`chat_agreement_versions`); las listas de versiones válidas de liga, exportar y restricciones incluyen la 1.0.
- Funciones: `chat_send`, `chat_list`, `chat_mark_read`, `chat_unread` (todas SECURITY DEFINER; sin acceso directo a la tabla).

## Pendiente de confirmar con el abogado (lo redacté yo)
1. Numeración «Cláusula **18**» (el abogado no dio número; es la siguiente tras la 17).
2. La casilla del Acuerdo conserva el texto «(versión 0.8)» que dio el abogado; con las versiones nuevas dice 0.8 aunque se acepte la 1.0. ¿Quiere que diga la versión vigente?
3. Texto de la hoja que le pide al coach aceptar: «Para leer y responder el chat con tus asesorados, acepta la versión actualizada del Acuerdo del Coach. Esta es la cláusula nueva:».
4. Mensajes de error del chat (límite por hora, sin vínculo, sin conexión).
5. Conservación: **la eliminación a los 365 días de inactividad NO está programada todavía** (solo se borra con la cuenta). Falta el trabajo programado en Supabase (igual que el resto de la inactividad de cuentas).

## Lo que no se hizo (a propósito)
- Sin adjuntos, fotos ni voz: solo texto (concepto 14).
- Sin «escribiendo…» ni confirmación de lectura visible para la otra parte.
- Sin insignia numérica en el ícono de la app (etapa 2 de push).
