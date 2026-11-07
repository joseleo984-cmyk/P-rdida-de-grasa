# Actualizar la app con una sola apertura (v1.26)

**Problema.** Tras publicar una versión, había que abrir y cerrar la app dos veces para verla.
**Causas.** (1) GitHub Pages deja los archivos en la caché del navegador unos 10 minutos y el service worker los usaba tal cual. (2) El service worker nuevo se instala DESPUÉS de cargar la página: la primera apertura ya corría con los archivos viejos.
**Arreglo.**
- `sw.js`: cada archivo se pide con `cache: 'no-cache'` (pregunta al servidor si cambió; si no cambió responde 304, casi sin datos). Sin conexión sigue usando la copia guardada.
- `app.js`: cuando un service worker NUEVO (el mismo `sw.js`) toma el control, la app se recarga una vez. Si la persona está escribiendo o tiene una ventana abierta, espera a que salga de la app. No recarga en la primera instalación ni cuando toma el control otro `sw.js` de otra carpeta (pruebas/demo).
- Al volver a la app desde segundo plano se busca versión nueva (`reg.update()`).
**Límite.** La primera vez que se pase de la versión anterior a esta, todavía hay que abrirla dos veces (el código que hace la recarga viene en esta misma versión). Desde ahí, una sola.
