// Interfaz Remote (equipo/r1-contrato.md §3). Único punto de contacto con el servidor: ningún otro archivo llama a
// supabase-js. Script clásico: expone window.Remote y module.exports (pruebas en Node).
// - Remote.config(): lee window.PG_CONFIG (config.js) → { url, key, mode } o null si no hay servidor configurado
//   (la app sigue solo local, como antes de R1).
// - Remote.createFake(...): implementación en memoria de remote-fake.js (solo pruebas).
// - Remote.create(...): implementación real con supabase-js → TODO S3-3 (Backend).
(function (root) {
  'use strict';

  const PRODUCTION_HOSTS = ['joseleo984-cmyk.github.io'];
  const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

  class RemoteError extends Error {
    constructor(code, message) {
      super(message || code);
      this.name = 'RemoteError';
      this.code = code;
      this.retryable = code === 'offline' || code === 'server' || code === 'rate_limited';
    }
  }

  // ¿Se permite el modo falso en esta página? LISTA BLANCA (QA S3-2 D2): solo localhost / 127.0.0.1 / [::1].
  // Nunca en producción, en un dominio propio, en un fork ni en vistas previas, aunque lleven ?remote=fake.
  function fakeAllowed(loc) {
    if (!loc) return false;
    const host = String(loc.hostname || '');
    return !PRODUCTION_HOSTS.includes(host) && LOCAL_HOSTS.includes(host);
  }

  // Devuelve la configuración efectiva o null (sin servidor). `env` permite probarlo en Node.
  function config(env) {
    const w = env || (typeof window !== 'undefined' ? window : {});
    const loc = w.location;
    const cfg = w.PG_CONFIG || {};
    const wantsFake = cfg.mode === 'fake' || /[?&]remote=fake(&|$)/.test(String((loc && loc.search) || ''));
    if (wantsFake) return fakeAllowed(loc) ? { url: '', key: '', mode: 'fake' } : null;
    const url = typeof cfg.url === 'string' ? cfg.url.trim() : '';
    const key = typeof cfg.key === 'string' ? cfg.key.trim() : '';
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) || !/^sb_publishable_/.test(key)) return null;
    return { url, key, mode: 'real' };
  }

  // v1.1 §10.1: SHA-256 hex del texto EXACTO mostrado (saltos de línea normalizados a \n). Mismo resultado que el
  // servidor (core.record_consent) para el mismo texto.
  async function textHash(text) {
    const norm = String(text == null ? '' : text).replace(/\r\n?/g, '\n');
    const c = (typeof crypto !== 'undefined' && crypto.subtle) ? crypto : (typeof require === 'function' ? require('node:crypto').webcrypto : null);
    if (!c || !c.subtle) throw new RemoteError('server', 'Este navegador no puede calcular el hash del texto');
    const buf = await c.subtle.digest('SHA-256', new TextEncoder().encode(norm));
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  function createFake(opts = {}) {
    const F = root.RemoteFake;
    if (!F) throw new RemoteError('server', 'remote-fake.js no está cargado');
    return F.createFake(opts);
  }

  // Implementación real (S3-3, Backend): supabase-js vendorizado (vendor/supabase-2.X.Y.js) con
  // { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storage } }.
  // Misma interfaz y mismos códigos de error que remote-fake.js. Hasta entonces, lanza un error claro.
  function create({ url, key, app = 'grasa', storage } = {}) {
    void url; void key; void app; void storage;
    const todo = async () => { throw new RemoteError('server', 'Conexión con el servidor aún no disponible (S3-3)'); };
    const group = (names) => Object.fromEntries(names.map((n) => [n, todo]));
    return {
      kind: 'real',
      auth: { ...group(['sendCode', 'verifyCode', 'signOut']), session: async () => null, onChange: () => () => {} },
      account: group(['joinApp', 'roles', 'profile', 'setDisplayName', 'recordConsents', 'consents', 'deleteAccount']),
      sync: group(['push', 'pull', 'uploadPhoto', 'downloadPhoto', 'deletePhotoFile']),
      client: group(['previewCode', 'joinCoach', 'myLink', 'updateShares', 'leaveCoach', 'markCommentRead', 'setPhotoShared']),
      coach: group(['becomeCoach', 'myCoach', 'rotateCode', 'clients', 'clientData', 'photoBlob', 'addComment', 'deleteComment', 'endClient']),
    };
  }

  const api = { config, create, createFake, fakeAllowed, textHash, RemoteError, PRODUCTION_HOSTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Remote = api;
})(typeof window !== 'undefined' ? window : globalThis);
