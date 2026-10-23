// Interfaz Remote (equipo/r1-contrato.md §3, v1.1 §10 y v1.2 §11). Único punto de contacto con el servidor: ningún
// otro archivo llama a supabase-js. Script clásico: expone window.Remote y module.exports (pruebas en Node).
// - Remote.config(): lee window.PG_CONFIG (config.js) → { url, key, mode } o null si no hay servidor configurado
//   (la app sigue solo local, como antes de R1).
// - Remote.createFake(...): implementación en memoria de remote-fake.js (solo pruebas).
// - Remote.create(...): implementación real con supabase-js vendorizado (vendor/supabase-2.117.2.js, global
//   `supabase`). Misma interfaz y mismos códigos de error que remote-fake.js.
(function (root) {
  'use strict';

  const PRODUCTION_HOSTS = ['joseleo984-cmyk.github.io'];
  const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
  const BUCKET = 'grasa-photos';
  const GIF_BUCKET = 'ejercicios';   // Etapa 2 (r1 v1.7): animaciones de los ejercicios, privado, '{coach_id}/{gif_id}.gif' (v1.9: también guarda videos mp4/mov/webm con ese mismo nombre; el tipo real va en el contentType)
  const CURSOR0 = '1970-01-01T00:00:00.000Z';
  const BATCH = 500;              // máx. elementos (registros + fotos) por llamada a sync_push (§2.3)
  const TIMEOUT_MS = 15000;       // §3: timeout 15 s → offline
  const SIGNED_URL_S = 60;        // §11.6: URL firmadas de 60 s, nunca se guardan

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

  // Forma de una site key PÚBLICA de Turnstile (0x4…) o de las claves de prueba oficiales de Cloudflare (1x…, 2x…, 3x…).
  // Mismo patrón que scripts/check-conexion.js (una prueba comprueba que no se separen).
  const CAPTCHA_SITEKEY_RE = /^(0x4[A-Za-z0-9_-]{17,27}|[123]x[0-9A-Za-z]{22})$/;
  const captchaKey = (v) => (typeof v === 'string' && CAPTCHA_SITEKEY_RE.test(v.trim()) ? v.trim() : '');

  // Devuelve la configuración efectiva o null (sin servidor). `env` permite probarlo en Node.
  function config(env) {
    const w = env || (typeof window !== 'undefined' ? window : {});
    const loc = w.location;
    const cfg = w.PG_CONFIG || {};
    const wantsFake = cfg.mode === 'fake' || /[?&]remote=fake(&|$)/.test(String((loc && loc.search) || ''));
    // Sprint 9: `captchaSiteKey` (clave PÚBLICA de Cloudflare Turnstile) es opcional; vacía o con otra forma = sin captcha.
    const captchaSiteKey = captchaKey(cfg.captchaSiteKey);
    const withCaptcha = (c) => (captchaSiteKey ? { ...c, captchaSiteKey } : c);
    if (wantsFake) return fakeAllowed(loc) ? withCaptcha({ url: '', key: '', mode: 'fake' }) : null;
    const url = typeof cfg.url === 'string' ? cfg.url.trim() : '';
    const key = typeof cfg.key === 'string' ? cfg.key.trim() : '';
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) || !/^sb_publishable_/.test(key)) return null;
    return withCaptcha({ url, key, mode: 'real' });
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
    const r = F.createFake(opts);
    return r;
  }

  // ---------- Errores (§10.4) ----------
  // 1.º por el TEXTO del mensaje (las RPC lanzan `raise exception '<código>'`; P0002 vale para not_found e invalid_code),
  // 2.º por SQLSTATE / código de PostgREST, 3.º red, HTTP y códigos de Auth. La UI nunca muestra el mensaje crudo:
  // va en `detail` solo para depurar.
  // Sprint 7 (r1 v1.5): el servidor impone los consentimientos. `consent_required` (42501) = al cliente le faltan A3/A4 vigentes;
  // `agreement_required` = forbidden con detail 'coach_agreement_required' (al coach le falta el acuerdo A7 vigente).
  // Sprint 11 (r1 v1.6): `payment_required` (42501, detail 'payment_required') = el cliente con coach no está al día: la app lo trata como «acceso en pausa», no como error técnico.
  const DB_CODES = ['auth', 'forbidden', 'not_found', 'invalid', 'invalid_code', 'rate_limited', 'consent_required', 'payment_required'];
  const SQLSTATE = {
    42501: 'forbidden',
    23514: 'invalid', 22023: 'invalid', '22P02': 'invalid', 23502: 'invalid', 22001: 'invalid', 23505: 'invalid',
    28000: 'auth', PGRST301: 'auth', PGRST302: 'auth', PGRST303: 'auth',
    54000: 'rate_limited',
  };
  const MESSAGES = {
    offline: 'Sin conexión', auth: 'Sesión no iniciada o caducada', invalid_code: 'Código incorrecto o caducado',
    rate_limited: 'Demasiados intentos: espera un poco', forbidden: 'Sin permiso', not_found: 'No encontrado',
    invalid: 'Datos no válidos', server: 'Error del servidor',
    captcha_failed: 'No pudimos verificar que eres una persona',
    consent_required: 'Falta aceptar una autorización', agreement_required: 'Falta aceptar el Acuerdo del coach',
    payment_required: 'Tu acceso está en pausa: habla con tu coach',
  };
  const NET_NAMES = ['TypeError', 'AbortError', 'TimeoutError', 'AuthRetryableFetchError', 'StorageUnknownError', 'FunctionsFetchError'];
  const NET_TEXT = /^(TypeError|AbortError|TimeoutError)\b|failed to fetch|networkerror|load failed|fetch failed|network request failed|aborted/i;

  function mapError(err, { status, ctx = 'db', nav } = {}) {
    if (err instanceof RemoteError) return err;
    const e = err || {};
    const msg = String(e.message || '').trim();
    const st = Number(status || e.status || e.statusCode) || 0;
    const code = String(e.code || e.error_code || '');
    const mk = (c) => {
      const r = new RemoteError(c, MESSAGES[c]);
      const detail = e.details || e.detail || msg;
      if (detail) r.detail = String(detail).slice(0, 500);
      if (st) r.status = st;
      return r;
    };
    if (/coach_agreement_required/.test(String(e.details || e.detail || ''))) return mk('agreement_required');
    if (/payment_required/.test(String(e.details || e.detail || ''))) return mk('payment_required');
    if (DB_CODES.includes(msg)) return mk(msg);
    // Sprint 9: el servidor (Supabase Auth con CAPTCHA activado) rechazó o no recibió el token: código `captcha_failed`
    // ("captcha verification process failed", "no captcha response (captcha_token) found in request").
    if (code === 'captcha_failed' || msg === 'captcha_failed' || /captcha/i.test(msg)) return mk('captcha_failed');
    // H3 (QA vivo): 42501 con HTTP 401 = petición sin sesión (rol anon) → `auth`; con sesión (403) sigue `forbidden`.
    if (code === '42501' && st === 401) return mk('auth');
    if (code && Object.prototype.hasOwnProperty.call(SQLSTATE, code)) return mk(SQLSTATE[code]);
    if (/^PGRST/.test(code)) return mk(st === 401 ? 'auth' : 'server');
    const offlineNav = nav && nav.onLine === false;
    if (st < 500 && (offlineNav || (!st || st === 0) && (NET_NAMES.includes(e.name) || NET_TEXT.test(msg)))) return mk('offline');
    if (st === 429 || /rate_limit/.test(code)) return mk('rate_limited');
    if (ctx === 'verify' && (code === 'otp_expired' || code === 'invalid_credentials' || (st >= 400 && st < 500))) return mk('invalid_code');
    if (st === 401 || e.name === 'AuthSessionMissingError' || /^(bad_jwt|session_not_found|session_expired|refresh_token_not_found|refresh_token_already_used|no_authorization)$/.test(code) || /jwt expired/i.test(msg)
        || (code === 'validation_failed' && /refresh.?token/i.test(msg))) return mk('auth'); // H2: refresh_token inválido
    if (ctx === 'storage') {
      if (st === 404 || /not.?found/i.test(msg)) return mk('not_found');
      if (st === 403 || /row-level security|unauthorized|permission/i.test(msg)) return mk('forbidden');
      if (st === 400 || st === 413 || st === 415 || /mime|too large|exceeded|invalid/i.test(msg)) return mk('invalid');
    }
    if (ctx === 'auth' && (st === 400 || st === 422 || /^(email_address_invalid|validation_failed|email_address_not_authorized)$/.test(code))) return mk('invalid');
    if (st === 403) return mk('forbidden');
    if (st === 404) return mk('not_found');
    return mk('server');
  }

  // Sprint 10: errores de la función de borde `acuerdo-coach-copia` → códigos de la app. `unavailable` = no desplegada (404),
  // sin secretos (503), con fallos del servidor o del correo (5xx): nada de eso debe asustar a nadie.
  const AGREEMENT_FN = 'acuerdo-coach-copia';
  function copyError(e, status, code) {
    const st = Number(status || (e && e.status)) || 0;
    const name = e && e.name;
    if (name === 'FunctionsFetchError' || (!st && (NET_TEXT.test(String((e && e.message) || '')) || NET_NAMES.includes(name)))) return new RemoteError('offline', MESSAGES.offline);
    if (st === 429 || code === 'rate_limited') return new RemoteError('rate_limited', MESSAGES.rate_limited);
    if (st === 401 || code === 'unauthorized') return new RemoteError('auth', MESSAGES.auth);
    if (code === 'agreement_not_granted') return new RemoteError('agreement_required', MESSAGES.agreement_required);
    return new RemoteError('unavailable', 'La copia por correo no está disponible');
  }

  // ---------- Implementación real ----------
  const clients = new Map(); // un solo cliente supabase-js por (url, key): account.js y la sincronización lo comparten

  // Opciones: createClient / fetch / navigator / timeoutMs se inyectan en las pruebas (cliente supabase-js simulado).
  function create({ url, key, app = 'grasa', storage, createClient, fetch: fetchImpl, navigator: nav, timeoutMs = TIMEOUT_MS } = {}) {
    const sbLib = root.supabase;
    const make = createClient || (sbLib && sbLib.createClient);
    if (typeof make !== 'function') throw new RemoteError('server', 'supabase-js no está cargado');
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    const navi = nav || (typeof navigator !== 'undefined' ? navigator : null);
    const baseFetch = fetchImpl || ((...a) => root.fetch(...a));
    const ref = (String(url).match(/^https:\/\/([a-z0-9-]+)\./i) || [])[1] || 'local';
    const storageKey = `sb-${ref}-auth-token`;

    // fetch con timeout de 15 s (se aborta → offline). También para las descargas con URL firmada.
    const timedFetch = (input, init = {}) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      if (init.signal) {
        if (init.signal.aborted) ctrl.abort();
        else init.signal.addEventListener('abort', () => ctrl.abort(), { once: true });
      }
      return Promise.resolve(baseFetch(input, { ...init, signal: ctrl.signal })).finally(() => clearTimeout(timer));
    };

    const cacheKey = `${url}|${key}`;
    let sb = !createClient && clients.get(cacheKey);
    if (!sb) {
      sb = make(url, key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storage: store || undefined, storageKey },
        global: { fetch: timedFetch },
      });
      if (!createClient) clients.set(cacheKey, sb);
    }

    const offlineNow = () => navi && navi.onLine === false;
    // Ejecuta una llamada de supabase-js ({ data, error, status }) y traduce el error a RemoteError.
    async function call(fn, ctx = 'db') {
      if (offlineNow()) throw new RemoteError('offline', MESSAGES.offline);
      let res;
      try { res = await fn(); }
      catch (err) { throw mapError(err, { ctx, nav: navi }); }
      if (res && res.error) throw mapError(res.error, { status: res.status, ctx, nav: navi });
      return res ? res.data : undefined;
    }
    const rpc = (schema, fn, args) => call(() => sb.schema(schema).rpc(fn, args || {}));
    const table = (schema, name) => sb.schema(schema).from(name);
    const bucket = () => sb.storage.from(BUCKET);
    const gifBucket = () => sb.storage.from(GIF_BUCKET);
    const rows = (d) => (Array.isArray(d) ? d : d == null ? [] : [d]);

    // Sesión guardada por supabase-js (§5.7): se lee SIN red, sirve offline aunque el token haya caducado.
    function readSession() {
      if (!store) return null;
      let s = null;
      try { s = JSON.parse(store.getItem(storageKey) || 'null'); } catch { s = null; }
      if (s && s.currentSession) s = s.currentSession; // formato antiguo
      if (!s || typeof s !== 'object' || !s.refresh_token) return null;
      let user = s.user;
      if (!user) { try { user = (JSON.parse(store.getItem(storageKey + '-user') || 'null') || {}).user; } catch { user = null; } }
      if (!user || typeof user.id !== 'string') return null;
      return { user: { id: user.id, email: user.email || '' } };
    }
    async function me() {
      const s = readSession();
      if (!s) throw new RemoteError('auth', MESSAGES.auth);
      return s.user;
    }

    // ---------- Frontera camelCase ↔ snake_case ----------
    const isoOrNull = (v) => { if (v == null) return null; const t = Date.parse(v); return Number.isFinite(t) ? new Date(t).toISOString() : null; };
    const recIn = (r) => ({ id: r.id, kind: r.kind, nkey: r.nkey, date: r.date || null, data: r.deletedAt ? {} : (r.data || {}),
      updated_at: r.updatedAt, deleted_at: r.deletedAt || null });
    const recOut = (r) => ({ id: r.id, kind: r.kind, nkey: r.nkey, date: r.date || null, data: r.data || {},
      updatedAt: isoOrNull(r.updated_at), deletedAt: isoOrNull(r.deleted_at), serverUpdatedAt: r.server_updated_at || null });
    const photoIn = (p, uid) => ({ id: p.id, date: p.date, pose: p.pose, width: p.width == null ? null : p.width, height: p.height == null ? null : p.height,
      storage_path: p.storagePath || `${uid}/${p.id}.jpg`, shared_with_coach: !!p.sharedWithCoach,
      created_at: p.createdAt || p.updatedAt, updated_at: p.updatedAt, deleted_at: p.deletedAt || null });
    const photoOut = (p) => ({ id: p.id, date: p.date, pose: p.pose, width: p.width == null ? null : p.width, height: p.height == null ? null : p.height,
      storagePath: p.storage_path, sharedWithCoach: !!p.shared_with_coach, createdAt: isoOrNull(p.created_at),
      updatedAt: isoOrNull(p.updated_at), deletedAt: isoOrNull(p.deleted_at), serverUpdatedAt: p.server_updated_at || null });
    const commentOut = (c) => ({ id: c.id, linkId: c.link_id, coachId: c.coach_id, clientId: c.client_id, refDate: c.ref_date || null,
      body: c.body, createdAt: isoOrNull(c.created_at), readAt: isoOrNull(c.read_at), deletedAt: isoOrNull(c.deleted_at),
      serverUpdatedAt: c.server_updated_at || null });
    const sharesOut = (s) => ({ body: !!s.body, notes: !!s.notes, nutrition: !!s.nutrition, habits: !!s.habits, photos: !!s.photos });
    // Mismos valores por defecto que el fake: body, nutrition y habits sí; notes y photos no. Lleva version y
    // text_hash del texto de la pantalla de compartir (§10.1): la BD rechaza con `invalid` si faltan.
    const sharesIn = (s = {}) => ({
      body: s.body === undefined ? true : s.body === true, notes: s.notes === true,
      nutrition: s.nutrition === undefined ? true : s.nutrition === true, habits: s.habits === undefined ? true : s.habits === true,
      photos: s.photos === true, version: s.version, text_hash: s.textHash || s.text_hash,
    });
    const linkOut = (l) => (l && l.id ? { id: l.id, coachId: l.coach_id, businessName: l.business_name || '',
      shares: sharesOut({ body: l.share_body, notes: l.share_notes, nutrition: l.share_nutrition, habits: l.share_habits, photos: l.share_photos }),
      since: l.since || l.created_at,
      paidUntil: l.paid_until || null, paidMarkedAt: isoOrNull(l.paid_marked_at), paid: l.paid === true, daysLeft: l.days_left == null ? null : Number(l.days_left) } : null);
    // Etapa 2 (r1 v1.7): rutinas y animaciones. snake_case del servidor → camelCase de la app (forma de la rutina: rutinas.js).
    const gifOut = (g) => ({ id: g.id, name: g.name, mime: g.mime, size: Number(g.size_bytes) || 0, createdAt: isoOrNull(g.created_at), uses: Number(g.uses) || 0 });
    const routineOut = (r) => {
      if (!r || !r.id) return null;
      const R = root.Rutinas;
      return R ? R.fromServer(r) : { id: r.id, coachId: r.coach_id, clientId: r.client_id, title: r.title, days: (r.content && r.content.days) || [], updatedAt: r.updated_at };
    };
    // v1.8: la rutina de hoy llega sin id propio; las listas llegan como un solo jsonb (arreglo).
    const dailyOut = (d) => (d && d.day && root.Rutinas ? root.Rutinas.dailyFromServer(d) : null);
    const routinesOut = (d) => rows(d).map(routineOut).filter(Boolean);
    const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
    const checkRoutine = (routine) => {
      const R = root.Rutinas;
      if (!R) throw new RemoteError('server', 'rutinas.js no está cargado');
      const v = R.validate(routine);
      if (!v.ok) { const e = new RemoteError('invalid', v.errors[0].message); e.detail = v.errors[0].message; throw e; }
      return R;
    };
    const uuid = () => (root.crypto && root.crypto.randomUUID ? root.crypto.randomUUID() : root.Schema.uuid());

    // Descarga con URL firmada de 60 s (§2.4, §11.6). La URL no se guarda ni se cachea (el SW no toca otros orígenes).
    async function signedBlob(path, bkt = bucket()) {
      const d = await call(() => bkt.createSignedUrl(path, SIGNED_URL_S), 'storage');
      if (!d || !d.signedUrl) throw new RemoteError('not_found', MESSAGES.not_found);
      let res;
      try { res = await timedFetch(d.signedUrl, { cache: 'no-store' }); }
      catch (err) { throw mapError(err, { ctx: 'storage', nav: navi }); }
      if (!res.ok) throw mapError({ message: 'HTTP ' + res.status }, { status: res.status, ctx: 'storage' });
      return res.blob();
    }

    // ---------- auth ----------
    const AUTH_EVENTS = { SIGNED_IN: 'signed_in', SIGNED_OUT: 'signed_out', TOKEN_REFRESHED: 'refreshed' };
    const auth = {
      // `captchaToken` (Turnstile, de un solo uso) solo se manda si existe: sin captcha la llamada es la de siempre.
      async sendCode(email, { captchaToken } = {}) {
        const e = String(email || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 254) throw new RemoteError('invalid', 'Correo no válido');
        const options = { shouldCreateUser: true };
        if (captchaToken) options.captchaToken = String(captchaToken);
        await call(() => sb.auth.signInWithOtp({ email: e, options }), 'auth');
      },
      async verifyCode(email, code) {
        const e = String(email || '').trim().toLowerCase();
        const c = String(code || '').replace(/\s/g, '');
        if (!/^\d{6,10}$/.test(c)) throw new RemoteError('invalid_code', MESSAGES.invalid_code);
        const d = await call(() => sb.auth.verifyOtp({ email: e, token: c, type: 'email' }), 'verify');
        const u = (d && (d.user || (d.session && d.session.user))) || null;
        if (!u) throw new RemoteError('invalid_code', MESSAGES.invalid_code);
        return { user: { id: u.id, email: u.email || e } };
      },
      async session() { return readSession(); },
      async signOut({ local = true } = {}) {
        try { await sb.auth.signOut({ scope: local ? 'local' : 'global' }); }
        catch { /* sin red: se borra la sesión local igualmente */ }
        if (store) { try { store.removeItem(storageKey); store.removeItem(storageKey + '-user'); } catch { /* nada */ } }
      },
      onChange(cb) {
        const { data } = sb.auth.onAuthStateChange((event, session) => {
          const ev = AUTH_EVENTS[event];
          if (!ev) return;
          const u = session && session.user;
          try { cb({ event: ev, user: u ? { id: u.id, email: u.email || '' } : null }); } catch { /* el oyente no rompe la sesión */ }
        });
        return () => { try { data.subscription.unsubscribe(); } catch { /* nada */ } };
      },
    };

    // ---------- account ----------
    async function removeAllPhotos(uid, bkt = bucket()) {
      for (let i = 0; i < 100; i++) {
        const list = await call(() => bkt.list(uid, { limit: 1000 }), 'storage');
        const names = rows(list).map((f) => f && f.name).filter(Boolean);
        if (!names.length) return;
        await call(() => bkt.remove(names.map((n) => `${uid}/${n}`)), 'storage');
      }
    }
    // Etapa 2: la baja también borra las animaciones del coach (la BD se niega si quedan archivos en 'ejercicios').
    const removeEverything = async (uid) => { await removeAllPhotos(uid); await removeAllPhotos(uid, gifBucket()); };
    const account = {
      async joinApp() { await me(); return rows(await rpc('core', 'join_app', { p_app: app })).flat(); },
      async roles() { await me(); return rows(await rpc('core', 'my_roles', { p_app: app })).flat(); },
      async profile() {
        const u = await me();
        const d = await call(() => table('core', 'profiles').select('display_name').eq('id', u.id).maybeSingle());
        return { id: u.id, email: u.email, displayName: (d && d.display_name) || '' };
      },
      async setDisplayName(name) {
        const u = await me();
        const n = String(name || '').trim();
        if (n.length > 60) throw new RemoteError('invalid', 'Nombre demasiado largo');
        await call(() => table('core', 'profiles').update({ display_name: n }).eq('id', u.id));
      },
      async recordConsents(events) {
        const u = await me();
        if (!Array.isArray(events) || !events.length) throw new RemoteError('invalid', 'Sin eventos');
        const list = events.map((ev) => {
          if (!ev || typeof ev.kind !== 'string' || typeof ev.granted !== 'boolean' || typeof ev.version !== 'string' ||
              !/^[0-9a-f]{64}$/.test(String(ev.textHash || '')) || Number.isNaN(Date.parse(ev.clientAt))) {
            throw new RemoteError('invalid', 'Evento de consentimiento no válido');
          }
          return { user_id: u.id, app_id: app, kind: ev.kind, granted: ev.granted, version: ev.version, text_hash: ev.textHash,
            coach_id: ev.coachId || null, client_at: ev.clientAt };
        });
        await call(() => table('core', 'consent_events').insert(list));
      },
      async consents() {
        await me();
        const out = {};
        for (const r of rows(await rpc('core', 'my_consents', { p_app: app }))) {
          out[r.kind] = { granted: r.granted, version: r.version, clientAt: isoOrNull(r.client_at), textHash: r.text_hash };
        }
        return out;
      },
      // Sprint 10: pide a la función de borde `acuerdo-coach-copia` que mande al correo de la persona la copia del acuerdo aceptado.
      // No manda nada de datos: el servidor lee el último evento, resuelve el texto y toma el correo del JWT. Es COMPLEMENTARIO: si la
      // función no está desplegada/configurada responde `unavailable` y la app sigue como si nada (el acuerdo ya quedó registrado).
      async sendAgreementCopy() {
        await me();
        if (offlineNow()) throw new RemoteError('offline', MESSAGES.offline);
        let res;
        try { res = await sb.functions.invoke(AGREEMENT_FN, { body: {} }); }
        catch (e) { throw copyError(e, null); }
        if (res && res.error) {
          let code = '';
          const c = res.error.context;
          try { if (c && typeof c.json === 'function') code = String((await c.json()).error || ''); } catch { /* sin cuerpo */ }
          throw copyError(res.error, c && c.status, code);
        }
        return { sent: true };
      },
      // §11.2: primero las fotos de Storage; si la BD aún ve archivos (`invalid`), se reintenta el borrado una vez.
      async deleteAccount() {
        const u = await me();
        await removeEverything(u.id);
        try { await rpc('core', 'delete_my_account'); }
        catch (err) {
          if (err.code !== 'invalid') throw err;
          await removeEverything(u.id);
          await rpc('core', 'delete_my_account');
        }
        await auth.signOut({ local: true });
      },
    };

    // ---------- sync (lo usa sync.js) ----------
    const sync = {
      async push({ records = [], photos = [] } = {}) {
        const u = await me();
        if (!Array.isArray(records) || !Array.isArray(photos)) throw new RemoteError('invalid', 'Formato no válido');
        const items = [...records.map((r) => ['r', r]), ...photos.map((p) => ['p', p])];
        const rejected = { records: [], photos: [] };
        let serverNow = null;
        for (let i = 0; i < items.length; i += BATCH) {
          const part = items.slice(i, i + BATCH);
          const d = await rpc('grasa', 'sync_push', {
            p_records: part.filter((x) => x[0] === 'r').map((x) => recIn(x[1])),
            p_photos: part.filter((x) => x[0] === 'p').map((x) => photoIn(x[1], u.id)),
          });
          const rj = (d && d.rejected) || {};
          rejected.records.push(...rows(rj.records).map(recOut));
          rejected.photos.push(...rows(rj.photos).map(photoOut));
          serverNow = (d && d.server_now) || serverNow;
        }
        return { serverNow, rejected };
      },
      // §11.8: solape de 30 s solo con overlap = true (1.ª página). El cursor se devuelve TAL CUAL lo da el servidor
      // (microsegundos incluidos) para no perder ni repetir filas al paginar.
      async pull(since, { overlap = true, limit = 1000 } = {}) {
        await me();
        const d = (await rpc('grasa', 'sync_pull', { p_since: since || CURSOR0, p_limit: limit, p_overlap: overlap !== false })) || {};
        return {
          records: rows(d.records).map(recOut), photos: rows(d.photos).map(photoOut), comments: rows(d.comments).map(commentOut),
          cursor: d.cursor || since || CURSOR0, hasMore: d.has_more === true, serverNow: d.server_now || null,
        };
      },
      async uploadPhoto(photoId, blob) {
        const u = await me();
        const path = `${u.id}/${photoId}.jpg`;
        try { await call(() => bucket().upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '0' }), 'storage'); }
        catch (err) {
          // Sprint 11: la política de Storage rechaza la subida con 403 si el cliente no está al día: se traduce a payment_required.
          if (err && err.code === 'forbidden') {
            let l = null;
            try { l = await myLink(); } catch { /* sin conexión: se deja el error original */ }
            if (l && l.paid === false) throw new RemoteError('payment_required', MESSAGES.payment_required);
          }
          throw err;
        }
        return { path };
      },
      async downloadPhoto(path) {
        const u = await me();
        if (!String(path).startsWith(u.id + '/')) throw new RemoteError('forbidden', 'Foto de otra cuenta');
        return signedBlob(path);
      },
      async deletePhotoFile(path) {
        const u = await me();
        if (!String(path).startsWith(u.id + '/')) throw new RemoteError('forbidden', 'Foto de otra cuenta');
        await call(() => bucket().remove([path]), 'storage');
      },
    };

    // ---------- cliente ↔ coach ----------
    const myLink = async () => { await me(); return linkOut(rows(await rpc('grasa', 'my_link'))[0]); };
    const client = {
      // §10.5: 0 filas = código inexistente (el intento queda contado) → invalid_code.
      async previewCode(code) {
        await me();
        const r = rows(await rpc('grasa', 'preview_invite_code', { p_code: String(code || '') }))[0];
        if (!r || !r.business_name) throw new RemoteError('invalid_code', 'Código de coach no válido');
        return { businessName: r.business_name };
      },
      // §11.1: código inválido, caducado o agotado → la BD devuelve null (intento contado) → invalid_code.
      async joinCoach(code, shares) {
        await me();
        const r = rows(await rpc('grasa', 'join_coach', { p_code: String(code || ''), p_shares: sharesIn(shares) }))[0];
        if (!r || !r.id) throw new RemoteError('invalid_code', 'Código de coach no válido');
        return (await myLink()) || linkOut(r);
      },
      myLink,
      async updateShares(shares) {
        const cur = await myLink();
        if (!cur) throw new RemoteError('not_found', 'No tienes coach');
        await rpc('grasa', 'update_shares', { p_shares: sharesIn({ ...cur.shares, ...shares }) });
        return myLink();
      },
      async leaveCoach() { await me(); await rpc('grasa', 'leave_coach'); },
      async markCommentRead(commentId) { await me(); await rpc('grasa', 'mark_comment_read', { p_id: commentId }); },
      // Etapa 2: la rutina que armó su coach (null si no hay o no tiene coach). Es solo lectura y se ve aunque el acceso esté en pausa.
      async myRoutine() { await me(); return routineOut(await rpc('grasa', 'my_routine')); },
      // v1.8: SUS rutinas visibles (varias) y la «Rutina de hoy» de su coach (solo si el día publicado es `today`, 'AAAA-MM-DD' de su dispositivo).
      async myRoutines() { await me(); return routinesOut(await rpc('grasa', 'my_routines')); },
      async myDaily(today) {
        await me();
        if (!DAY_RE.test(String(today))) throw new RemoteError('invalid', 'Fecha no válida');
        return dailyOut(await rpc('grasa', 'my_daily', { p_today: String(today) }));
      },
      // La animación de un ejercicio, con URL firmada de 60 s nueva en cada llamada (la política de Storage solo la deja leer si es de SU coach).
      async gifBlob(coachId, gifId) {
        await me();
        const R = root.Rutinas;
        if (!R || !R.UUID_RE.test(String(coachId)) || !R.UUID_RE.test(String(gifId))) throw new RemoteError('invalid', 'Animación no válida');
        return signedBlob(`${coachId}/${gifId}.gif`, gifBucket());
      },
      async setPhotoShared(photoId, shared) {
        const u = await me();
        const d = await call(() => table('grasa', 'photos').update({ shared_with_coach: !!shared, updated_at: new Date().toISOString() })
          .eq('id', photoId).eq('user_id', u.id).select('id'));
        if (!rows(d).length) throw new RemoteError('not_found', 'Foto no encontrada');
      },
    };

    // ---------- coach ----------
    const coach = {
      async becomeCoach(businessName) {
        await me();
        const name = String(businessName || '').trim();
        if (name.length < 2 || name.length > 60) throw new RemoteError('invalid', 'El nombre comercial debe tener entre 2 y 60 caracteres');
        const r = rows(await rpc('grasa', 'become_coach', { p_business_name: name }))[0];
        return { inviteCode: r && (r.invite_code || r) };
      },
      async myCoach() {
        const u = await me();
        const c = await call(() => table('grasa', 'coaches')
          .select('business_name, invite_code, free_clients, invite_expires_at, invite_max_uses, invite_uses').eq('user_id', u.id).maybeSingle());
        return c ? { businessName: c.business_name, inviteCode: c.invite_code, freeClients: c.free_clients,
          expiresAt: isoOrNull(c.invite_expires_at), maxUses: c.invite_max_uses == null ? null : c.invite_max_uses, uses: c.invite_uses || 0 } : null;
      },
      async rotateCode({ validDays = null, maxUses = null } = {}) {
        await me();
        return rpc('grasa', 'rotate_invite_code', { p_valid_days: validDays, p_max_uses: maxUses });
      },
      async clients() {
        await me();
        return rows(await rpc('grasa', 'coach_clients')).map((c) => ({ clientId: c.client_id, displayName: c.display_name || '',
          linkId: c.link_id, since: c.since, shares: sharesOut(c.shares || {}), lastActivity: c.last_activity || null, overFreeLimit: !!c.over_free_limit,
          paidUntil: c.paid_until || null, paidMarkedAt: isoOrNull(c.paid_marked_at), paid: c.paid === true, daysLeft: c.days_left == null ? null : Number(c.days_left) }));
      },
      async clientData(clientId, since) {
        await me();
        const d = (await rpc('grasa', 'coach_pull', { p_client: clientId, p_since: since || CURSOR0 })) || {};
        return { records: rows(d.records).map(recOut), photos: rows(d.photos).map(photoOut), comments: rows(d.comments).map(commentOut),
          cursor: d.cursor || since || CURSOR0 };
      },
      // Registro de acceso (coach_photo_opened) ANTES de firmar la URL; la autorización la impone la política de Storage.
      async photoBlob(clientId, photo) {
        await me();
        const path = photo && photo.storagePath;
        if (!photo || !photo.id || !String(path || '').startsWith(clientId + '/')) throw new RemoteError('forbidden', 'Foto no compartida');
        await rpc('grasa', 'coach_photo_opened', { p_photo: photo.id });
        return signedBlob(path);
      },
      async addComment(clientId, { id, refDate, body } = {}) {
        await me();
        const text = String(body || '').trim();
        if (!text || text.length > 1000) throw new RemoteError('invalid', 'El comentario debe tener entre 1 y 1000 caracteres');
        const r = rows(await rpc('grasa', 'add_comment', { p_id: id || uuid(), p_client: clientId, p_ref_date: refDate || null, p_body: text }))[0];
        return r ? commentOut(r) : null;
      },
      // Sprint 11: el coach marca hasta cuándo pagó el cliente (null = sin pago registrado). Devuelve el estado resultante.
      async setPayment(clientId, paidUntil) {
        await me();
        if (paidUntil != null && !/^\d{4}-\d{2}-\d{2}$/.test(String(paidUntil))) throw new RemoteError('invalid', 'Fecha no válida');
        const d = await rpc('grasa', 'set_client_payment', { p_client: clientId, p_paid_until: paidUntil == null ? null : paidUntil });
        const r = rows(d)[0] || {};
        return { paidUntil: r.paid_until || null, paidMarkedAt: isoOrNull(r.paid_marked_at), paid: r.paid === true, daysLeft: r.days_left == null ? null : Number(r.days_left) };
      },
      // Etapa 2: biblioteca de animaciones del coach y rutinas por cliente.
      async listGifs() { await me(); return rows(await rpc('grasa', 'my_gifs')).map(gifOut); },
      // Valida tipo, tamaño (GIF/WebP 3 MB, video 10 MB) y FIRMA de bytes (no se re-codifica: se sube tal cual), la registra y la sube.
      // La duración (15 s) la comprueba la pantalla antes de llamar aquí: es un límite blando, el servidor no ve el video.
      // Si la subida falla, deshace el registro para no dejar animaciones fantasma en la biblioteca.
      async uploadGif(file, name) {
        const u = await me();
        const R = root.Rutinas;
        if (!R) throw new RemoteError('server', 'rutinas.js no está cargado');
        if (!file || typeof file.slice !== 'function') throw new RemoteError('invalid', 'Archivo no válido');
        const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
        const chk = R.checkGif({ type: file.type, size: file.size }, head);
        if (!chk.ok) { const e = new RemoteError('invalid', chk.message); e.detail = chk.message; throw e; }
        const id = uuid();
        const g = await rpc('grasa', 'register_gif', { p_id: id, p_name: String(name || '').trim(), p_mime: chk.mime, p_size: file.size, p_head: R.toHex(head) });
        try { await call(() => gifBucket().upload(`${u.id}/${id}.gif`, file, { upsert: true, contentType: chk.mime, cacheControl: '0' }), 'storage'); }
        catch (err) { try { await rpc('grasa', 'delete_gif', { p_id: id }); } catch { /* queda registrado sin archivo: se borra desde la biblioteca */ } throw err; }
        return gifOut(g);
      },
      // Borra el registro (la BD se niega con detail 'gif_in_use' si alguna rutina lo usa) y después el archivo.
      async deleteGif(gifId) {
        const u = await me();
        await rpc('grasa', 'delete_gif', { p_id: gifId });
        try { await call(() => gifBucket().remove([`${u.id}/${gifId}.gif`]), 'storage'); } catch { /* sin archivo ya no se puede ver: la baja de cuenta lo vuelve a intentar */ }
      },
      async gifBlob(gifId) {
        const u = await me();
        if (!root.Rutinas || !root.Rutinas.UUID_RE.test(String(gifId))) throw new RemoteError('invalid', 'Animación no válida');
        return signedBlob(`${u.id}/${gifId}.gif`, gifBucket());
      },
      async getRoutine(clientId) { await me(); return routineOut(await rpc('grasa', 'get_routine', { p_client: clientId })); },
      async saveRoutine(clientId, routine) {
        await me();
        const R = root.Rutinas;
        if (!R) throw new RemoteError('server', 'rutinas.js no está cargado');
        const v = R.validate(routine);
        if (!v.ok) { const e = new RemoteError('invalid', v.errors[0].message); e.detail = v.errors[0].message; throw e; }
        return routineOut(await rpc('grasa', 'save_routine', { p_client: clientId, p_title: String(routine.title).trim(), p_content: R.toContent(routine) }));
      },
      async deleteRoutine(clientId) { await me(); await rpc('grasa', 'delete_routine', { p_client: clientId }); },
      // v1.8: «Mis rutinas» (plantillas del coach), asignar (copias), rutinas de un asesorado, mostrar/ocultar y la «Rutina de hoy».
      async listTemplates() { await me(); return routinesOut(await rpc('grasa', 'list_templates')); },
      async saveTemplate(id, routine) {
        await me();
        const R = checkRoutine(routine);
        return routineOut(await rpc('grasa', 'save_template', { p_id: id || null, p_title: String(routine.title).trim(), p_content: R.toContent(routine) }));
      },
      async deleteTemplate(id) { await me(); await rpc('grasa', 'delete_template', { p_id: id }); },
      async assignTemplate(templateId, clientIds) {
        await me();
        const ids = Array.isArray(clientIds) ? [...new Set(clientIds)] : [];
        if (!ids.length || ids.length > 100) throw new RemoteError('invalid', 'Elige entre 1 y 100 asesorados');
        return routinesOut(await rpc('grasa', 'assign_template', { p_template: templateId, p_clients: ids }));
      },
      async listClientRoutines(clientId) { await me(); return routinesOut(await rpc('grasa', 'list_client_routines', { p_client: clientId })); },
      async saveClientRoutine(clientId, id, routine) {
        await me();
        const R = checkRoutine(routine);
        return routineOut(await rpc('grasa', 'save_client_routine', { p_client: clientId, p_id: id || null, p_title: String(routine.title).trim(), p_content: R.toContent(routine) }));
      },
      async deleteClientRoutine(id) { await me(); await rpc('grasa', 'delete_client_routine', { p_id: id }); },
      async setRoutineVisible(id, visible) { await me(); return routineOut(await rpc('grasa', 'set_routine_visible', { p_id: id, p_visible: !!visible })); },
      async publishDaily(templateId, day) {
        await me();
        if (!DAY_RE.test(String(day))) throw new RemoteError('invalid', 'Fecha no válida');
        return dailyOut(await rpc('grasa', 'publish_daily', { p_template: templateId, p_day: String(day) }));
      },
      async getDaily() { await me(); return dailyOut(await rpc('grasa', 'get_daily')); },
      async clearDaily() { await me(); await rpc('grasa', 'clear_daily'); },
      async deleteComment(commentId) { await me(); await rpc('grasa', 'delete_comment', { p_id: commentId }); },
      async endClient(clientId) { await me(); await rpc('grasa', 'end_client', { p_client: clientId }); },
    };

    return { kind: 'real', auth, account, sync, client, coach };
  }

  const api = { config, create, createFake, fakeAllowed, CAPTCHA_SITEKEY_RE, textHash, mapError, RemoteError, PRODUCTION_HOSTS, BUCKET, GIF_BUCKET };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Remote = api;
})(typeof window !== 'undefined' ? window : globalThis);
