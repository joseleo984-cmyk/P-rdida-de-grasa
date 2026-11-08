# Nombre visible «En forma» (v1.28)

**Qué cambió.** El nombre que ve la persona pasa de «Pérdida de Grasa» a «En forma»: título de la pestaña, encabezado, nombre bajo el ícono del iPhone (`manifest.webmanifest` y `apple-mobile-web-app-title`), mensaje de invitación del coach, texto del QR, mensaje de ayuda por WhatsApp y metadatos del Excel exportado. Los sitios de pruebas y demo se llaman «En forma (pruebas)» y «En forma (demo)». Caché v83.

**Qué NO cambió (a propósito).**
- **Textos legales** (`legal/terminos.html`, `legal/privacidad.html`, `scripts/build-legal.js`): siguen diciendo «Pérdida de Grasa». Cambiar el nombre de la plataforma en documentos aceptados es decisión del abogado (puede requerir versión nueva y nueva aceptación).
- **Base de datos** (`core.apps.name = 'Pérdida de Grasa'`) y migraciones ya aplicadas: es un nombre interno; si se quiere cambiar, va en una migración nueva.
- **Claves internas** (`perdida-grasa:v1`, nombres de IndexedDB y caché): cambiarlas haría perder los datos guardados en los teléfonos.
- **Dirección de la app** (`/P-rdida-de-grasa/`, viene del nombre del repositorio): renombrar el repositorio cambia el enlace y quienes la instalaron tendrían que volver a agregarla.

**Pendiente de marca.** «En forma» no está verificado como marca registrable (SIC), dominio ni en tiendas de apps; ver `equipo/comercial/nombres-candidatos.md`.

**Para quien ya la instaló.** iOS guarda el nombre al agregar la app: hay que quitarla de la pantalla de inicio y volver a agregarla para ver «En forma» bajo el ícono.
