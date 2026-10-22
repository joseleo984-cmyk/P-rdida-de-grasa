// Espacio de nombres por entorno (copia de pruebas). Único punto que decide los nombres de localStorage, IndexedDB
// y Cache Storage, porque la raíz del sitio y /pruebas/ comparten origen (y por tanto almacenamiento).
// - env vacío/ausente (producción): los nombres son EXACTAMENTE los de siempre (sin migraciones).
// - env = 'pruebas' (window.PG_CONFIG.env, ver config.pruebas.js): todo lleva el sufijo "-pruebas".
// Script clásico: expone window.PGNS (y self.PGNS en el service worker) y module.exports (pruebas en Node).
(function (root) {
  'use strict';
  const BASE = 'perdida-grasa';

  function envOf(cfg) {
    const e = cfg && typeof cfg.env === 'string' ? cfg.env.trim().toLowerCase() : '';
    return /^[a-z0-9]{1,20}$/.test(e) ? e : '';
  }

  function create(cfg) {
    const env = envOf(cfg);
    const base = env ? BASE + '-' + env : BASE;
    return {
      env,
      isTest: env === 'pruebas',
      // Clave de localStorage: key('v1') → 'perdida-grasa:v1' (producción) / 'perdida-grasa-pruebas:v1'.
      key: (suffix) => base + ':' + suffix,
      // Nombre de la base IndexedDB de fotos.
      dbName: () => base,
      // Nombre de caché del service worker: cacheName(19) → 'perdida-grasa-v19' / 'perdida-grasa-pruebas-v19'.
      cacheName: (v) => base + '-v' + v,
      // Prefijo propio de las cachés de este entorno (el activate solo borra las suyas, nunca las del otro).
      cachePrefix: () => base + '-v',
    };
  }

  const api = create(root && root.PG_CONFIG);
  api.create = create;
  if (root) root.PGNS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : globalThis));
