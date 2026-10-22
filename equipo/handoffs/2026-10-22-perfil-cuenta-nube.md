# Handoff: Perfil con cuenta y copia en la nube (DEV Frontend)

Feedback del Stakeholder: el texto de Perfil → Datos era anterior a las cuentas y confundía. Ahora dice la verdad según el estado real.

## Cambios
- `cloud-view.js` (nuevo, puro, con `tests/cloud-view.test.js`): texto de estado de sync (hora del último éxito) y `dataMode` (¿nube funcionando?, ¿se calla el aviso de copia?).
- Perfil: la tarjeta de cuenta pasa al inicio como "Cuenta y copia en la nube" (solo con config de Supabase). Estado en `#sync-status` (role=status, solo cambia si cambia el texto). Sin sesión: "Sin cuenta: estás usando la app solo en este dispositivo. Entra o crea una cuenta…".
- Datos: con sesión + sync OK + salud autorizada: "Tus datos se guardan en este dispositivo y, con tu cuenta, también en la nube. Las fotos se guardan solo en este dispositivo por ahora."; se ocultan la advertencia del navegador y "Aún no has exportado"; aparece el rótulo "Descargar copia (opcional)" (los botones conservan su nombre Exportar JSON/CSV para no romper accesibilidad ni pruebas). Con sync no OK: texto de siempre.
- El banner de copia cada 7 días calla si hubo sync exitoso en las últimas 24 h con salud autorizada.
- "Ver copia de un cliente" se oculta con servidor configurado; igual en modo solo-local.
- App oficial (sin config): sin cambios (prueba en `tests/e2e/profile-account.spec.js`). PGNS intacto. SW cache v22.
- Textos de sync cambiados (pruebas s3-3b / s3-2 actualizadas): "Sin conexión: se subirá al volver.", "Falta confirmar que estos datos son tuyos.", "No sincroniza: no autorizaste datos de salud."

## Pendiente / riesgos
- Las fotos no se suben a la nube: el texto lo dice; si se implementa, actualizar `DATA_CLOUD` en app.js.
- El motor solo guarda códigos de error: el texto de error es genérico ("se reintentará solo").
