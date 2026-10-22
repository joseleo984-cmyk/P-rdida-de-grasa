// Cache simple para que la app funcione sin conexión.
// Cada entorno (raíz / pruebas) tiene su propia caché: config.js + ns.js deciden el nombre (ver ns.js).
self.window = self;
importScripts('config.js', 'ns.js');
const CACHE = PGNS.cacheName(21);
const ASSETS = ['./', 'index.html', 'styles.css', 'calc.js', 'schema.js', 'sync.js', 'coach.js', 'photos.js', 'app.js', 'config.js', 'ns.js', 'vendor/supabase-2.117.2.js', 'remote.js', 'account.js', 'coach-panel.js', 'manifest.webmanifest', 'icon.svg', 'legal/terminos.html', 'legal/privacidad.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PGNS.cachePrefix()) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Red primero (para recibir actualizaciones), cache como respaldo.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // R1: nunca cachear llamadas a otros orígenes (p. ej. *.supabase.co); solo los archivos de la propia app.
  if (new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // Solo respuestas correctas: un 404/500 no debe quedar en la caché y servirse sin conexión (QA S3-2 O2).
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
