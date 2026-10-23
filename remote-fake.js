// Implementación FALSA en memoria de la interfaz Remote (equipo/r1-contrato.md §3 y §4). Sin red ni Supabase.
// Sirve para unitarias en Node y E2E con Playwright. NUNCA se usa en producción: Remote.config() solo activa
// mode 'fake' en localhost/127.0.0.1 o con ?remote=fake fuera del dominio de producción.
// Script clásico: expone window.RemoteFake y module.exports.
(function (root) {
  'use strict';

  const APP = 'grasa';
  const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const CONSENT_KINDS = ['terms', 'privacy', 'adult', 'sensitive_health', 'cloud_transfer', 'photos_cloud', 'photo_view_coach', 'coach_agreement',
    'share_body', 'share_notes', 'share_nutrition', 'share_habits', 'share_photos'];
  const RECORD_KINDS = ['profile', 'entry', 'food', 'habit', 'library'];
  const SHARE_KEYS = ['body', 'notes', 'nutrition', 'habits', 'photos'];
  const RETRYABLE = { offline: true, server: true, rate_limited: true }; // consent_required y agreement_required: no se reintentan solos
  const MAX_SKEW_MS = 5 * 60 * 1000;
  const OTP_TTL_MS = 60 * 60 * 1000;
  const OTP_RESEND_MS = 60 * 1000;
  const OTP_MAX_TRIES = 5;
  const INVITE_MAX_PER_HOUR = 20;
  const PULL_OVERLAP_MS = 30 * 1000;
  const BATCH = 500;
  const SESSION_KEY = 'pg-fake-session';
  const DUMMY_CAPTCHA_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX'; // lo que devuelve Turnstile con las site keys de prueba de Cloudflare
  const HASH_RE = /^[0-9a-f]{64}$/;

  class RemoteError extends Error {
    constructor(code, message) {
      super(message || code);
      this.name = 'RemoteError';
      this.code = code;
      this.retryable = !!RETRYABLE[code];
    }
  }
  const fail = (code, msg) => { throw new RemoteError(code, msg); };

  // Reloj del "servidor". clock.set(iso) fija la hora (relojes desajustados); si no, usa la hora real.
  function FakeClock(iso) {
    let fixed = iso ? Date.parse(iso) : null;
    let offset = 0;
    return {
      now: () => (fixed !== null ? fixed : Date.now()) + offset,
      set: (v) => { fixed = Date.parse(v); offset = 0; },
      advance: (ms) => { offset += ms; },
      real: () => { fixed = null; offset = 0; },
    };
  }

  const randUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  };
  const randInt = (n) => {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) return crypto.getRandomValues(new Uint32Array(1))[0] % n;
    return Math.floor(Math.random() * n);
  };
  const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
  const normEmail = (e) => String(e || '').trim().toLowerCase();
  const iso = (ms) => new Date(ms).toISOString();
  // Seudónimo de 64 hex SOLO para el servidor falso (no es criptográfico: el real usa SHA-256 con sal del servidor).
  const pseudoHash = (str) => { let out = ''; let h = 2166136261; for (let i = 0; out.length < 64; i++) { h = Math.imul(h ^ (str.charCodeAt(i % str.length) + i), 16777619) >>> 0; out += h.toString(16).padStart(8, '0'); } return out.slice(0, 64); };
  const toB64 = (u8) => { let bin = ''; for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return (typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64')); };
  const fromB64 = (b64) => { const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary'); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; };
  const rutinas = () => root.Rutinas || (typeof require === 'function' ? require('./rutinas.js') : null);
  const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

  // ---------- Estado del servidor (compartido entre "dispositivos") ----------
  class FakeBackend {
    constructor({ clock } = {}) {
      this.clock = clock || FakeClock();
      this.users = {};          // email → { id, email, createdAt }
      this.otps = {};           // email → { code, sentAt, tries }
      this.sent = [];           // registro de correos enviados (solo pruebas)
      this.appAccess = [];      // { userId, appId, role, active }
      this.profiles = {};       // userId → { displayName }
      this.coaches = {};        // userId → { businessName, inviteCode, freeClients, active, codeRotatedAt }
      this.links = [];          // coach_links
      this.inviteAttempts = []; // { userId, at }
      this.records = {};        // `${userId}|${kind}|${nkey}` → fila
      this.photos = {};         // id → fila
      this.comments = {};       // id → fila
      this.consentEvents = [];
      this.consentArchive = []; // Sprint 6: prueba mínima seudonimizada que sobrevive a la baja (solo pruebas; el real es core.consent_archive)
      this.photoViews = [];
      this.agreementCopies = []; // Sprint 10: copias del acuerdo "enviadas" por correo (solo pruebas): { userId, to, version, textHash, at }
      this.copyMode = 'ok';       // Sprint 10: 'ok' | 'unavailable' (la función de borde no está desplegada/configurada) | 'rate_limited'
      this.blobs = {};          // path → Blob (no se persiste)
      this.gifs = {};           // Etapa 2 (r1 v1.7): id → { id, coachId, name, mime, size, createdAt, b64 } (los bytes SÍ se guardan en base64: los E2E pasan el «servidor» de un teléfono a otro)
      this.routines = {};       // Etapa 2: `${coachId}|${clientId}` → { id, coachId, clientId, title, days, createdAt, updatedAt }
      this.revoked = {};        // userId → ms desde el que las sesiones anteriores no valen
      this._online = true;
      // Sprint 9 (solo pruebas, no se persiste): simula Supabase Auth con CAPTCHA activado. account.js lo enciende cuando
      // config trae captchaSiteKey. Sin token → captcha_failed; el token es de un solo uso (el dummy de las claves de
      // prueba de Cloudflare se acepta siempre); captchaFail(n) hace que los próximos n intentos fallen.
      this.captchaRequired = false;
      this.captchaTokens = [];  // tokens recibidos (para las pruebas)
      this._captchaFail = 0;
      this._failNext = [];
      this._latency = 0;
      this._tick = 0;
      this.onPersist = null;
    }

    // --- Fallos inyectables ---
    setOnline(v) { this._online = !!v; }
    failNext(code, times = 1) { for (let i = 0; i < times; i++) this._failNext.push(code); }
    captchaFail(times = 1) { this._captchaFail = Math.max(0, Number(times) || 0); }
    _checkCaptcha(token) {
      if (!this.captchaRequired) return;
      const t = typeof token === 'string' ? token : '';
      if (!t) fail('captcha_failed', 'no captcha response (captcha_token) found in request');
      this.captchaTokens.push(t);
      if (this._captchaFail > 0) { this._captchaFail--; fail('captcha_failed', 'captcha verification process failed'); }
      if (t !== DUMMY_CAPTCHA_TOKEN) {
        if (this.captchaTokens.slice(0, -1).includes(t)) fail('captcha_failed', 'captcha verification process failed'); // ya usado
      }
    }
    latency(ms) { this._latency = Math.max(0, Number(ms) || 0); }
    lastCode(email) { const o = this.otps[normEmail(email)]; return o ? o.code : null; }
    // Revoca las sesiones de un usuario (refresh token caducado/revocado): la siguiente llamada con red da `auth`.
    revokeSessions(email) { const u = this.users[normEmail(email)]; if (u) this.revoked[u.id] = this.clock.now(); }

    async _call() {
      if (this._latency) await new Promise((r) => setTimeout(r, this._latency));
      if (!this._online) fail('offline', 'Sin conexión');
      if (this._failNext.length) { const c = this._failNext.shift(); fail(c, 'Fallo inyectado: ' + c); }
    }
    // Marca de servidor estrictamente creciente (clock_timestamp()).
    _serverStamp() {
      const t = Math.max(this.clock.now(), this._tick + 1);
      this._tick = t;
      return iso(t);
    }
    _persist() { if (this.onPersist) this.onPersist(this); }

    // Sprint 7 (r1 v1.5): ¿el ÚLTIMO evento de ese tipo de la persona tiene granted = true? (sin mirar la versión del texto)
    hasConsent(userId, kind) {
      for (let i = this.consentEvents.length - 1; i >= 0; i--) {
        const e = this.consentEvents[i];
        if (e.userId === userId && e.kind === kind) return e.granted === true;
      }
      return false;
    }
    // sync_push / sync_pull / join_coach: exigen A3 (sensitive_health) + A4 (cloud_transfer) vigentes → 'consent_required' (42501).
    requireCloudConsent(userId) {
      if (!(this.hasConsent(userId, 'sensitive_health') && this.hasConsent(userId, 'cloud_transfer'))) fail('consent_required', 'Falta aceptar una autorización');
    }
    // Funciones de coach: exigen el acuerdo (A7) vigente → forbidden con detail 'coach_agreement_required' (el cliente real lo
    // traduce a 'agreement_required').
    requireCoachAgreement(userId) {
      if (!this.hasConsent(userId, 'coach_agreement')) fail('agreement_required', 'Falta aceptar el Acuerdo del coach');
    }

    // Sprint 11 (r1 v1.6): cobros manuales. Hoy en Bogotá (UTC-5 fijo) y estado de pago de un vínculo, como grasa.today_bogota() y my_link().
    todayBogota() { return new Date(this.clock.now() - 5 * 3600000).toISOString().slice(0, 10); }
    payState(link) {
      const today = this.todayBogota();
      const left = link && link.paidUntil ? Math.round((Date.parse(link.paidUntil + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000) : null;
      return { paidUntil: (link && link.paidUntil) || null, paidMarkedAt: (link && link.paidMarkedAt) || null, paid: left != null && left >= 0, daysLeft: left };
    }
    // ¿Tiene vínculo ACTIVO y no está al día? (sin vínculo nunca se bloquea). Solo sync.push y la subida de fotos lo exigen.
    paymentBlocked(userId) { const l = this.activeLink(userId); return !!l && !this.payState(l).paid; }
    requirePayment(userId) { if (this.paymentBlocked(userId)) fail('payment_required', 'Tu acceso está en pausa: habla con tu coach'); }
    // Solo pruebas: deja el vínculo activo de ese correo pagado hasta esa fecha (como tests.paid en SQL).
    setPaidUntil(email, iso) { const u = this.users[normEmail(email)]; const l = u && this.activeLink(u.id); if (!l) throw new Error('Sin vínculo activo'); l.paidUntil = iso; l.paidMarkedAt = new Date(this.clock.now()).toISOString(); this._persist(); }

    userById(id) { return Object.values(this.users).find((u) => u.id === id) || null; }
    roles(userId, app = APP) {
      const r = this.appAccess.filter((a) => a.userId === userId && a.appId === app && a.active).map((a) => a.role);
      return ['client', 'coach', 'admin'].filter((x) => r.includes(x));
    }
    _grant(userId, role, app = APP) {
      if (!this.appAccess.some((a) => a.userId === userId && a.appId === app && a.role === role)) {
        this.appAccess.push({ userId, appId: app, role, active: true, createdAt: iso(this.clock.now()) });
      }
    }
    activeLink(clientId) { return this.links.find((l) => l.clientId === clientId && l.status === 'active') || null; }
    _newInviteCode() {
      for (let k = 0; k < 1000; k++) {
        let c = '';
        for (let i = 0; i < 6; i++) c += CODE_ALPHABET[randInt(CODE_ALPHABET.length)];
        if (!Object.values(this.coaches).some((x) => x.inviteCode === c)) return c;
      }
      fail('server', 'No se pudo generar un código');
    }
    _inviteAttempt(userId) {
      const now = this.clock.now();
      this.inviteAttempts = this.inviteAttempts.filter((a) => now - a.at < 3600 * 1000);
      if (this.inviteAttempts.filter((a) => a.userId === userId).length >= INVITE_MAX_PER_HOUR) fail('rate_limited', 'Demasiados intentos con códigos de coach');
      this.inviteAttempts.push({ userId, at: now });
    }

    // --- Serialización para E2E (los blobs no se guardan) ---
    toJSON() {
      const { users, otps, sent, appAccess, profiles, coaches, links, inviteAttempts, records, photos, comments, consentEvents, consentArchive, photoViews, agreementCopies, revoked, gifs, routines, _tick } = this;
      return { v: 1, users, otps, sent, appAccess, profiles, coaches, links, inviteAttempts, records, photos, comments, consentEvents, consentArchive, photoViews, agreementCopies, revoked, gifs, routines, tick: _tick };
    }
    static fromJSON(json, opts = {}) {
      const b = new FakeBackend(opts);
      if (json && json.v === 1) {
        for (const k of ['users', 'otps', 'sent', 'appAccess', 'profiles', 'coaches', 'links', 'inviteAttempts', 'records', 'photos', 'comments', 'consentEvents', 'consentArchive', 'photoViews', 'agreementCopies', 'revoked', 'gifs', 'routines']) {
          if (json[k] !== undefined) b[k] = clone(json[k]);
        }
        b._tick = Number(json.tick) || 0;
      }
      return b;
    }
  }

  // Almacén de sesión del "dispositivo" (como supabase-js en localStorage). En Node, un objeto en memoria.
  function memoryStorage() {
    const m = {};
    return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
  }

  // ---------- Remote falso (un "dispositivo") ----------
  function createFake({ backend, clock, app = APP, storage } = {}) {
    const be = backend || new FakeBackend({ clock });
    if (clock && !backend) be.clock = clock;
    const store = storage || memoryStorage();
    const listeners = new Set();
    const emit = (event, user) => { for (const cb of listeners) { try { cb({ event, user }); } catch { /* no rompe */ } } };

    function readSession() {
      try { const s = JSON.parse(store.getItem(SESSION_KEY) || 'null'); return s && s.user && s.user.id ? s : null; } catch { return null; }
    }
    // Llamada con red que necesita sesión válida.
    async function authed() {
      await be._call();
      const s = readSession();
      if (!s) fail('auth', 'Sin sesión');
      const u = be.userById(s.user.id);
      if (!u) fail('auth', 'La cuenta ya no existe');
      if (be.revoked[u.id] && be.revoked[u.id] >= s.issuedAt) fail('auth', 'La sesión caducó');
      return u;
    }
    const done = (x) => { be._persist(); return x; };
    const clampMs = (v) => Math.min(Date.parse(v), be.clock.now() + MAX_SKEW_MS);

    const auth = {
      async sendCode(email, { captchaToken } = {}) {
        await be._call();
        const e = normEmail(email);
        if (!EMAIL_RE.test(e)) fail('invalid', 'Correo no válido');
        be._checkCaptcha(captchaToken);
        const now = be.clock.now();
        const prev = be.otps[e];
        if (prev && now - prev.sentAt < OTP_RESEND_MS) fail('rate_limited', 'Espera un minuto para pedir otro código');
        const code = String(randInt(1000000)).padStart(6, '0');
        be.otps[e] = { code, sentAt: now, tries: 0 };
        be.sent.push({ email: e, at: iso(now) });
        return done(undefined);
      },
      async verifyCode(email, code) {
        await be._call();
        const e = normEmail(email);
        const c = String(code || '').trim();
        if (!/^\d{6,10}$/.test(c)) fail('invalid_code', 'El código tiene que ser de 6 a 10 dígitos');
        const o = be.otps[e];
        const now = be.clock.now();
        if (!o || now - o.sentAt > OTP_TTL_MS) fail('invalid_code', 'El código caducó: pide uno nuevo');
        if (o.tries >= OTP_MAX_TRIES) fail('rate_limited', 'Demasiados intentos: pide un código nuevo');
        if (o.code !== c) { o.tries++; be._persist(); fail('invalid_code', 'Código incorrecto'); }
        delete be.otps[e];
        let u = be.users[e];
        if (!u) {
          u = { id: randUUID(), email: e, createdAt: iso(now) };
          be.users[e] = u;
          be.profiles[u.id] = { displayName: '' };
        }
        const user = { id: u.id, email: u.email };
        store.setItem(SESSION_KEY, JSON.stringify({ user, issuedAt: now }));
        emit('signed_in', user);
        return done({ user });
      },
      // Sin red: lee la sesión guardada (sirve offline).
      async session() { const s = readSession(); return s ? { user: { ...s.user } } : null; },
      async signOut() {
        const s = readSession();
        store.removeItem(SESSION_KEY);
        emit('signed_out', s ? s.user : null);
      },
      onChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
    };

    const account = {
      async joinApp() { const u = await authed(); be._grant(u.id, 'client', app); return done(be.roles(u.id, app)); },
      async roles() { const u = await authed(); return be.roles(u.id, app); },
      async profile() { const u = await authed(); return { id: u.id, email: u.email, displayName: (be.profiles[u.id] || {}).displayName || '' }; },
      async setDisplayName(name) {
        const u = await authed();
        const n = String(name || '').trim();
        if (n.length > 60) fail('invalid', 'Nombre demasiado largo');
        be.profiles[u.id] = { displayName: n };
        return done(undefined);
      },
      async recordConsents(events) {
        const u = await authed();
        if (!Array.isArray(events) || !events.length) fail('invalid', 'Sin eventos');
        const rows = events.map((ev) => {
          if (!ev || !CONSENT_KINDS.includes(ev.kind) || typeof ev.granted !== 'boolean' || typeof ev.version !== 'string' || !ev.version || ev.version.length > 20 || Number.isNaN(Date.parse(ev.clientAt)) || !HASH_RE.test(ev.textHash || '')) {
            fail('invalid', 'Evento de consentimiento no válido');
          }
          // v1.1 §10.1: text_hash obligatorio; client_at acotado a +5 min.
          return { id: randUUID(), userId: u.id, appId: app, kind: ev.kind, granted: ev.granted, version: ev.version, textHash: ev.textHash, coachId: ev.coachId || null, clientAt: iso(clampMs(ev.clientAt)), createdAt: iso(be.clock.now()) };
        });
        be.consentEvents.push(...rows); // solo inserción
        return done(undefined);
      },
      async consents() {
        const u = await authed();
        const out = {};
        for (const ev of be.consentEvents.filter((x) => x.userId === u.id && x.appId === app)) {
          out[ev.kind] = { granted: ev.granted, version: ev.version, textHash: ev.textHash, clientAt: ev.clientAt };
        }
        return out;
      },
      // Sprint 10: doble de la función de borde `acuerdo-coach-copia`. Mismas reglas: solo con el último evento del acuerdo concedido,
      // 1 envío por persona y versión por hora, el correo es el de la sesión. `be.copyMode = 'unavailable'` simula que no está desplegada.
      async sendAgreementCopy() {
        const u = await authed();
        if (be.copyMode === 'unavailable') fail('unavailable', 'La copia por correo no está disponible');
        if (!be.hasConsent(u.id, 'coach_agreement')) fail('agreement_required', 'Falta aceptar el Acuerdo del coach');
        const ev = [...be.consentEvents].reverse().find((e) => e.userId === u.id && e.kind === 'coach_agreement');
        const now = be.clock.now();
        const recent = be.agreementCopies.find((c) => c.userId === u.id && c.version === ev.version && now - Date.parse(c.at) < 3600000 && now >= Date.parse(c.at));
        if (be.copyMode === 'rate_limited' || recent) fail('rate_limited', 'Demasiados envíos: espera un poco');
        be.agreementCopies.push({ userId: u.id, to: u.email, version: ev.version, textHash: ev.textHash, at: iso(now) });
        be._persist();
        return done({ sent: true });
      },
      async deleteAccount() {
        const u = await authed();
        for (const p of Object.keys(be.blobs)) if (p.startsWith(u.id + '/')) delete be.blobs[p];
        delete be.users[u.email];
        delete be.profiles[u.id];
        delete be.coaches[u.id];
        be.appAccess = be.appAccess.filter((a) => a.userId !== u.id);
        be.links = be.links.filter((l) => l.clientId !== u.id && l.coachId !== u.id);
        for (const k of Object.keys(be.records)) if (k.startsWith(u.id + '|')) delete be.records[k];
        for (const [id, p] of Object.entries(be.photos)) if (p.userId === u.id) delete be.photos[id];
        for (const [id, c] of Object.entries(be.comments)) if (c.clientId === u.id || c.coachId === u.id) delete be.comments[id];
        for (const [id, g] of Object.entries(be.gifs)) if (g.coachId === u.id) delete be.gifs[id];
        for (const [k, r] of Object.entries(be.routines)) if (r.coachId === u.id || r.clientId === u.id) delete be.routines[k];
        // Sprint 6: antes de borrar, copia mínima y seudonimizada (sin uuid, correo ni nombre), como core.delete_my_account().
        const pseudo = (id) => pseudoHash('fake-salt:' + id);
        for (const x of be.consentEvents.filter((e) => e.userId === u.id)) {
          be.consentArchive.push({ userPseudoId: pseudo(x.userId), coachPseudoId: x.coachId ? pseudo(x.coachId) : null, appId: x.appId, kind: x.kind,
            action: x.granted ? 'grant' : 'revoke', version: x.version, textHash: x.textHash, clientAt: x.clientAt, eventAt: x.createdAt, archivedAt: iso(be.clock.now()) });
        }
        be.consentEvents = be.consentEvents.filter((x) => x.userId !== u.id);
        be._persist();
        await auth.signOut();
      },
    };

    // ---------- Sincronización (dueño) ----------
    const newer = (a, b) => { // ¿gana la fila entrante a sobre la del servidor b? (desempate determinista)
      const ta = Date.parse(a.updatedAt), tb = Date.parse(b.updatedAt);
      return ta > tb || (ta === tb && JSON.stringify(a.data) > JSON.stringify(b.data));
    };
    const recOut = (r) => ({ id: r.id, kind: r.kind, nkey: r.nkey, date: r.date, data: clone(r.data), updatedAt: r.updatedAt, deletedAt: r.deletedAt, serverUpdatedAt: r.serverUpdatedAt });
    const photoOut = (p) => ({ id: p.id, date: p.date, pose: p.pose, width: p.width, height: p.height, storagePath: p.storagePath, sharedWithCoach: p.sharedWithCoach, createdAt: p.createdAt, updatedAt: p.updatedAt, deletedAt: p.deletedAt, serverUpdatedAt: p.serverUpdatedAt });
    const commentOut = (c) => ({ id: c.id, linkId: c.linkId, coachId: c.coachId, clientId: c.clientId, refDate: c.refDate, body: c.body, createdAt: c.createdAt, readAt: c.readAt, deletedAt: c.deletedAt, serverUpdatedAt: c.serverUpdatedAt });

    function validRecord(r) {
      return r && typeof r === 'object' && typeof r.id === 'string' && RECORD_KINDS.includes(r.kind) && typeof r.nkey === 'string' &&
        r.nkey.length >= 1 && r.nkey.length <= 80 && !Number.isNaN(Date.parse(r.updatedAt)) &&
        (r.data === undefined || (typeof r.data === 'object' && JSON.stringify(r.data).length <= 4096));
    }

    const sync = {
      async push({ records = [], photos = [] } = {}) {
        const u = await authed();
        be.requireCloudConsent(u.id);
        be.requirePayment(u.id);   // Sprint 11: con coach y vencido, no se sube nada (sí se puede bajar, descargar y borrar)
        if (!Array.isArray(records) || !Array.isArray(photos)) fail('invalid', 'Formato no válido');
        const rejected = { records: [], photos: [] };
        // En lotes de 500, como la implementación real.
        for (let i = 0; i < Math.max(records.length, photos.length); i += BATCH) {
          for (const r of records.slice(i, i + BATCH)) {
            if (!validRecord(r)) fail('invalid', 'Registro no válido');
            const key = `${u.id}|${r.kind}|${r.nkey}`;
            const incoming = { id: r.id, kind: r.kind, nkey: r.nkey, date: r.date || null, data: r.deletedAt ? {} : clone(r.data || {}),
              updatedAt: iso(clampMs(r.updatedAt)), deletedAt: r.deletedAt ? iso(clampMs(r.deletedAt)) : null };
            const cur = be.records[key];
            if (!cur) be.records[key] = { ...incoming, userId: u.id, serverUpdatedAt: be._serverStamp() };
            else if (newer(incoming, cur)) be.records[key] = { ...incoming, id: cur.id, userId: u.id, serverUpdatedAt: be._serverStamp() }; // clave natural: conserva id
            else rejected.records.push(recOut(cur));
          }
          for (const p of photos.slice(i, i + BATCH)) {
            if (!p || typeof p.id !== 'string' || Number.isNaN(Date.parse(p.updatedAt))) fail('invalid', 'Foto no válida');
            const cur = be.photos[p.id];
            if (cur && cur.userId !== u.id) fail('forbidden', 'Foto de otra cuenta');
            const incoming = { id: p.id, userId: u.id, date: p.date, pose: p.pose, width: p.width, height: p.height,
              storagePath: p.storagePath || `${u.id}/${p.id}.jpg`, sharedWithCoach: !!p.sharedWithCoach,
              createdAt: p.createdAt || p.updatedAt, updatedAt: iso(clampMs(p.updatedAt)), deletedAt: p.deletedAt ? iso(clampMs(p.deletedAt)) : null };
            if (!cur || Date.parse(incoming.updatedAt) > Date.parse(cur.updatedAt)) be.photos[p.id] = { ...incoming, serverUpdatedAt: be._serverStamp() };
            else rejected.photos.push(photoOut(cur));
          }
        }
        return done({ serverNow: iso(be.clock.now()), rejected });
      },
      async pull(since, opts) {
        // §11.8: pull(since, { overlap, limit }); también acepta el número `limit` de la firma anterior.
        const o = typeof opts === 'number' ? { limit: opts } : (opts || {});
        const limit = o.limit || 1000;
        const u = await authed();
        be.requireCloudConsent(u.id);
        const from = (Date.parse(since) || 0) - (o.overlap === false ? 0 : PULL_OVERLAP_MS);
        const after = (x) => Date.parse(x.serverUpdatedAt) > from;
        const rows = [
          ...Object.values(be.records).filter((r) => r.userId === u.id && after(r)).map((r) => ({ t: 'r', x: r })),
          ...Object.values(be.photos).filter((p) => p.userId === u.id && after(p)).map((p) => ({ t: 'p', x: p })),
          ...Object.values(be.comments).filter((c) => c.clientId === u.id && after(c)).map((c) => ({ t: 'c', x: c })),
        ].sort((a, b) => a.x.serverUpdatedAt.localeCompare(b.x.serverUpdatedAt));
        const page = rows.slice(0, limit);
        const cursor = page.length ? page[page.length - 1].x.serverUpdatedAt : (since || '1970-01-01T00:00:00.000Z');
        return {
          records: page.filter((r) => r.t === 'r').map((r) => recOut(r.x)),
          photos: page.filter((r) => r.t === 'p').map((r) => photoOut(r.x)),
          comments: page.filter((r) => r.t === 'c').map((r) => commentOut(r.x)),
          cursor, hasMore: rows.length > limit, serverNow: iso(be.clock.now()),
        };
      },
      async uploadPhoto(photoId, blob) {
        const u = await authed();
        be.requirePayment(u.id);   // Sprint 11: la política de Storage también exige estar al día para subir
        const path = `${u.id}/${photoId}.jpg`;
        be.blobs[path] = blob; // upsert
        return { path };
      },
      async downloadPhoto(path) {
        const u = await authed();
        if (!String(path).startsWith(u.id + '/')) fail('forbidden', 'Foto de otra cuenta');
        if (!be.blobs[path]) fail('not_found', 'Foto no encontrada');
        return be.blobs[path];
      },
      async deletePhotoFile(path) {
        const u = await authed();
        if (!String(path).startsWith(u.id + '/')) fail('forbidden', 'Foto de otra cuenta');
        delete be.blobs[path];
      },
    };

    // ---------- Cliente ↔ coach ----------
    const normShares = (s) => {
      const o = s && typeof s === 'object' ? s : {};
      // Sprint 6 (C2): comidas y hábitos nacen apagados, igual que en la base real.
      return { body: o.body === undefined ? true : o.body === true, notes: o.notes === true, nutrition: o.nutrition === true,
        habits: o.habits === true, photos: o.photos === true };
    };
    const linkOut = (l) => (l ? { id: l.id, coachId: l.coachId, businessName: (be.coaches[l.coachId] || {}).businessName || '', shares: { ...l.shares }, since: l.createdAt, ...be.payState(l) } : null);
    // v1.1 §10.1: `shares` lleva `version` y `textHash` del texto de la pantalla de compartir.
    const shareText = (s) => {
      if (!s || typeof s.version !== 'string' || !s.version || s.version.length > 20 || !HASH_RE.test(s.textHash || '')) fail('invalid', 'Falta la versión o el hash del texto de compartir');
      return { version: s.version, textHash: s.textHash };
    };
    const shareEvents = (u, l, t) => SHARE_KEYS.map((k) => ({ id: randUUID(), userId: u.id, appId: app, kind: 'share_' + k, granted: l.shares[k], version: t.version, textHash: t.textHash, coachId: l.coachId, clientAt: iso(be.clock.now()), createdAt: iso(be.clock.now()) }));
    // v1.1 §10.2: un código caducado o agotado responde como inexistente.
    const findCoachByCode = (code) => {
      const c = String(code || '').trim().toUpperCase().replace(/[\s-]/g, '');
      if (!/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(c)) return null;
      // Sprint 7: el código de un coach SIN acuerdo vigente no sirve (como uno caducado).
      const id = Object.keys(be.coaches).find((k) => be.coaches[k].inviteCode === c && be.coaches[k].active && be.hasConsent(k, 'coach_agreement'));
      if (!id) return null;
      const co = be.coaches[id];
      if (co.inviteExpiresAt && Date.parse(co.inviteExpiresAt) <= be.clock.now()) return null;
      if (co.inviteMaxUses && (co.inviteUses || 0) >= co.inviteMaxUses) return null;
      return { id, ...co };
    };

    const client = {
      async previewCode(code) {
        const u = await authed();
        be._inviteAttempt(u.id);
        be._persist();
        const c = findCoachByCode(code);
        if (!c || c.id === u.id) fail('invalid_code', 'Código de coach no válido');
        return { businessName: c.businessName };
      },
      async joinCoach(code, shares) {
        const u = await authed();
        be.requireCloudConsent(u.id);
        be._inviteAttempt(u.id);
        const c = findCoachByCode(code);
        if (!c || c.id === u.id) { be._persist(); fail('invalid_code', 'Código de coach no válido'); }
        const sh = normShares(shares);
        if (!sh.body) fail('invalid', 'Compartir tu progreso corporal es obligatorio para vincularte');
        const t = shareText(shares);
        const prev = be.activeLink(u.id);
        if (prev) { prev.status = 'ended'; prev.endedAt = iso(be.clock.now()); }
        const l = { id: randUUID(), coachId: c.id, clientId: u.id, status: 'active', shares: sh, createdAt: iso(be.clock.now()), endedAt: null, updatedAt: iso(be.clock.now()), paidUntil: null, paidMarkedAt: null };
        be.links.push(l);
        be.coaches[c.id].inviteUses = (be.coaches[c.id].inviteUses || 0) + 1;
        be._grant(u.id, 'client', app);
        be.consentEvents.push(...shareEvents(u, l, t));
        return done(linkOut(l));
      },
      async myLink() { const u = await authed(); return linkOut(be.activeLink(u.id)); },
      async updateShares(shares) {
        const u = await authed();
        const l = be.activeLink(u.id);
        if (!l) fail('not_found', 'No tienes coach');
        const sh = normShares({ ...l.shares, ...shares });
        if (!sh.body) fail('invalid', 'Compartir tu progreso corporal es obligatorio mientras tengas coach');
        const t = shareText(shares);
        l.shares = sh;
        l.updatedAt = iso(be.clock.now());
        be.consentEvents.push(...shareEvents(u, l, t));
        return done(linkOut(l));
      },
      async leaveCoach() {
        const u = await authed();
        const l = be.activeLink(u.id);
        if (l) { l.status = 'ended'; l.endedAt = iso(be.clock.now()); }
        return done(undefined);
      },
      async markCommentRead(commentId) {
        const u = await authed();
        const c = be.comments[commentId];
        if (!c || c.clientId !== u.id) fail('not_found', 'Comentario no encontrado');
        if (!c.readAt) { c.readAt = iso(be.clock.now()); c.serverUpdatedAt = be._serverStamp(); }
        return done(undefined);
      },
      // Etapa 2: la rutina de su coach (solo lectura; se ve aunque el acceso esté en pausa) y las animaciones de ese coach.
      async myRoutine() {
        const u = await authed();
        const l = be.activeLink(u.id);
        const r = l && be.coaches[l.coachId] && be.coaches[l.coachId].active ? be.routines[`${l.coachId}|${u.id}`] : null;
        return r ? { id: r.id, coachId: r.coachId, clientId: r.clientId, title: r.title, updatedAt: r.updatedAt, days: clone(r.days) } : null;
      },
      async gifBlob(coachId, gifId) {
        const u = await authed();
        const l = be.activeLink(u.id);
        const g = be.gifs[gifId];
        if (!l || l.coachId !== coachId || !be.coaches[coachId] || !be.coaches[coachId].active || !g || g.coachId !== coachId) fail('not_found', 'Animación no encontrada');
        return new Blob([fromB64(g.b64)], { type: g.mime });
      },
      async setPhotoShared(photoId, shared) {
        const u = await authed();
        const p = be.photos[photoId];
        if (!p || p.userId !== u.id) fail('not_found', 'Foto no encontrada');
        p.sharedWithCoach = !!shared;
        p.updatedAt = iso(be.clock.now());
        p.serverUpdatedAt = be._serverStamp();
        return done(undefined);
      },
    };

    // ---------- Coach ----------
    // `agreement: false` solo para lo que REDUCE acceso (terminar un vínculo, borrar un comentario propio).
    async function asCoach({ agreement = true } = {}) {
      const u = await authed();
      if (!be.coaches[u.id] || !be.roles(u.id, app).includes('coach')) fail('forbidden', 'No eres coach');
      if (agreement) be.requireCoachAgreement(u.id);
      return u;
    }
    // v1.1 §10.3 coach_can_see: vínculo activo + coach activo (+ categoría, que comprueba cada función).
    function activeLinkCoach(coachId, clientId) {
      if (!be.coaches[coachId] || !be.coaches[coachId].active) fail('forbidden', 'Coach desactivado');
      const l = be.links.find((x) => x.coachId === coachId && x.clientId === clientId && x.status === 'active');
      if (!l) fail('forbidden', 'Sin vínculo activo con ese cliente');
      // Sprint 7 (E3): si el cliente retira A3 o A4, el coach deja de ver sus datos (como coach_can_see en el servidor).
      if (!(be.hasConsent(clientId, 'sensitive_health') && be.hasConsent(clientId, 'cloud_transfer'))) fail('forbidden', 'El cliente no tiene vigentes las autorizaciones de la copia en la nube');
      return l;
    }
    const coach = {
      async becomeCoach(businessName) {
        const u = await authed();
        be.requireCoachAgreement(u.id);
        const name = String(businessName || '').trim();
        if (name.length < 2 || name.length > 60) fail('invalid', 'El nombre comercial debe tener entre 2 y 60 caracteres');
        if (!be.coaches[u.id]) be.coaches[u.id] = { businessName: name, inviteCode: be._newInviteCode(), freeClients: 5, active: true, codeRotatedAt: iso(be.clock.now()), createdAt: iso(be.clock.now()) };
        be._grant(u.id, 'coach', app);
        return done({ inviteCode: be.coaches[u.id].inviteCode });
      },
      async myCoach() {
        const u = await authed();
        const c = be.coaches[u.id];
        return c ? { businessName: c.businessName, inviteCode: c.inviteCode, freeClients: c.freeClients,
          expiresAt: c.inviteExpiresAt || null, maxUses: c.inviteMaxUses || null, uses: c.inviteUses || 0 } : null;
      },
      // v1.1 §10.2: rotateCode({ validDays, maxUses }); sin opciones = sin caducidad ni límite.
      async rotateCode({ validDays, maxUses } = {}) {
        const u = await asCoach();
        if (validDays != null && !(Number.isInteger(validDays) && validDays >= 1 && validDays <= 365)) fail('invalid', 'Validez no válida');
        if (maxUses != null && !(Number.isInteger(maxUses) && maxUses >= 1 && maxUses <= 500)) fail('invalid', 'Número de usos no válido');
        const c = be.coaches[u.id];
        c.inviteCode = be._newInviteCode();
        c.codeRotatedAt = iso(be.clock.now());
        c.inviteExpiresAt = validDays ? iso(be.clock.now() + validDays * 86400000) : null;
        c.inviteMaxUses = maxUses || null;
        c.inviteUses = 0;
        return done(c.inviteCode);
      },
      async clients() {
        const u = await asCoach();
        const act = be.links.filter((l) => l.coachId === u.id && l.status === 'active').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        return act.map((l, i) => {
          const stamps = Object.values(be.records).filter((r) => r.userId === l.clientId).map((r) => r.serverUpdatedAt).sort();
          return { clientId: l.clientId, displayName: (be.profiles[l.clientId] || {}).displayName || '', linkId: l.id, since: l.createdAt,
            shares: { ...l.shares }, lastActivity: stamps.length && be.hasConsent(l.clientId, 'sensitive_health') && be.hasConsent(l.clientId, 'cloud_transfer') ? stamps[stamps.length - 1] : null, overFreeLimit: i >= be.coaches[u.id].freeClients, ...be.payState(l) };
        });
      },
      async clientData(clientId, since) {
        const u = await asCoach();
        const l = activeLinkCoach(u.id, clientId);
        const from = since ? Date.parse(since) - PULL_OVERLAP_MS : -Infinity;
        const allowed = new Set([...(l.shares.body ? ['profile', 'entry'] : []), ...(l.shares.nutrition ? ['food'] : []), ...(l.shares.habits ? ['habit'] : [])]); // nunca 'library'
        const records = Object.values(be.records)
          .filter((r) => r.userId === clientId && allowed.has(r.kind) && Date.parse(r.serverUpdatedAt) > from)
          .map((r) => { const o = recOut(r); if (!l.shares.notes && o.data && 'note' in o.data) delete o.data.note; return o; });
        const photos = l.shares.photos ? Object.values(be.photos).filter((p) => p.userId === clientId && p.sharedWithCoach && !p.deletedAt && Date.parse(p.serverUpdatedAt) > from).map(photoOut) : [];
        const comments = Object.values(be.comments).filter((c) => c.linkId === l.id && Date.parse(c.serverUpdatedAt) > from).map(commentOut);
        const all = [...records, ...photos, ...comments].map((x) => x.serverUpdatedAt).sort();
        return { records, photos, comments, cursor: all.length ? all[all.length - 1] : (since || '1970-01-01T00:00:00.000Z') };
      },
      async photoBlob(clientId, photo) {
        const u = await asCoach();
        const l = activeLinkCoach(u.id, clientId);
        const p = be.photos[photo && photo.id];
        if (!l.shares.photos || !p || p.userId !== clientId || !p.sharedWithCoach || p.deletedAt) fail('forbidden', 'Foto no compartida');
        be.photoViews.push({ id: randUUID(), photoId: p.id, coachId: u.id, clientId, viewedAt: iso(be.clock.now()) });
        be._persist();
        if (!be.blobs[p.storagePath]) fail('not_found', 'Foto no encontrada');
        return be.blobs[p.storagePath];
      },
      async addComment(clientId, { id, refDate, body } = {}) {
        const u = await asCoach();
        const l = activeLinkCoach(u.id, clientId);
        const text = String(body || '').trim();
        if (!text || text.length > 1000) fail('invalid', 'El comentario debe tener entre 1 y 1000 caracteres');
        const cid = id || randUUID();
        be.comments[cid] = { id: cid, linkId: l.id, coachId: u.id, clientId, refDate: refDate || null, body: text, createdAt: iso(be.clock.now()), readAt: null, deletedAt: null, serverUpdatedAt: be._serverStamp() };
        return done(commentOut(be.comments[cid]));
      },
      // Sprint 11: el coach marca hasta cuándo pagó (null = sin pago registrado). Mismas reglas que grasa.set_client_payment.
      async setPayment(clientId, paidUntil) {
        const u = await asCoach();
        const l = be.links.find((x) => x.coachId === u.id && x.clientId === clientId && x.status === 'active');
        if (!l || !be.coaches[u.id].active) fail('forbidden', 'Sin vínculo activo con ese cliente');
        if (paidUntil != null) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(String(paidUntil)) || Number.isNaN(Date.parse(paidUntil + 'T00:00:00Z'))) fail('invalid', 'Fecha no válida');
          const diff = (Date.parse(paidUntil + 'T00:00:00Z') - Date.parse(be.todayBogota() + 'T00:00:00Z')) / 86400000;
          if (diff < -400 || diff > 400) fail('invalid', 'La fecha de pago está fuera de un rango razonable');
        }
        l.paidUntil = paidUntil == null ? null : String(paidUntil);
        l.paidMarkedAt = iso(be.clock.now());
        l.updatedAt = l.paidMarkedAt;
        return done(be.payState(l));
      },
      // Etapa 2: biblioteca de animaciones del coach y rutinas por cliente (mismas reglas que grasa.register_gif, save_routine, etc.).
      async listGifs() {
        const u = await asCoach();
        const uses = (id) => Object.values(be.routines).filter((r) => r.coachId === u.id && r.days.some((d) => d.exercises.some((e) => e.gif === id))).length;
        return Object.values(be.gifs).filter((g) => g.coachId === u.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((g) => ({ id: g.id, name: g.name, mime: g.mime, size: g.size, createdAt: g.createdAt, uses: uses(g.id) }));
      },
      async uploadGif(file, name) {
        const u = await asCoach();
        const R = rutinas();
        if (!file || typeof file.slice !== 'function') fail('invalid', 'Archivo no válido');
        const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
        const chk = R.checkGif({ type: file.type, size: file.size }, head);
        if (!chk.ok) { const e = new RemoteError('invalid', chk.message); e.detail = chk.message; throw e; }
        const nm = String(name || '').trim();
        if (!nm || nm.length > R.LIMITS.gifName) fail('invalid', 'El nombre debe tener entre 1 y 60 caracteres');
        if (Object.values(be.gifs).filter((g) => g.coachId === u.id).length >= R.LIMITS.gifs) fail('invalid', 'La biblioteca está llena');
        const id = randUUID();
        be.gifs[id] = { id, coachId: u.id, name: nm, mime: chk.mime, size: file.size, createdAt: iso(be.clock.now()), b64: toB64(new Uint8Array(await file.arrayBuffer())) };
        return done({ id, name: nm, mime: chk.mime, size: file.size, createdAt: be.gifs[id].createdAt, uses: 0 });
      },
      async deleteGif(gifId) {
        const u = await asCoach({ agreement: false });
        const g = be.gifs[gifId];
        if (!g || g.coachId !== u.id) fail('not_found', 'Animación no encontrada');
        if (Object.values(be.routines).some((r) => r.coachId === u.id && r.days.some((d) => d.exercises.some((e) => e.gif === gifId)))) { const e = new RemoteError('invalid', 'Datos no válidos'); e.detail = 'gif_in_use'; throw e; }
        delete be.gifs[gifId];
        return done(undefined);
      },
      async gifBlob(gifId) {
        const u = await asCoach({ agreement: false });
        const g = be.gifs[gifId];
        if (!g || g.coachId !== u.id) fail('not_found', 'Animación no encontrada');
        return new Blob([fromB64(g.b64)], { type: g.mime });
      },
      async getRoutine(clientId) {
        const u = await asCoach();
        if (!be.links.some((x) => x.coachId === u.id && x.clientId === clientId && x.status === 'active') || !be.coaches[u.id].active) fail('forbidden', 'Sin vínculo activo con ese cliente');
        const r = be.routines[`${u.id}|${clientId}`];
        return r ? { id: r.id, coachId: r.coachId, clientId: r.clientId, title: r.title, updatedAt: r.updatedAt, days: clone(r.days) } : null;
      },
      async saveRoutine(clientId, routine) {
        const u = await asCoach();
        const R = rutinas();
        if (!be.links.some((x) => x.coachId === u.id && x.clientId === clientId && x.status === 'active') || !be.coaches[u.id].active) fail('forbidden', 'Sin vínculo activo con ese cliente');
        const v = R.validate(routine);
        if (!v.ok) { const e = new RemoteError('invalid', v.errors[0].message); e.detail = v.errors[0].message; throw e; }
        const days = R.toContent(routine).days;
        for (const d of days) for (const e of d.exercises) if (e.gif && !(be.gifs[e.gif] && be.gifs[e.gif].coachId === u.id)) { const x = new RemoteError('invalid', 'Datos no válidos'); x.detail = 'gif_not_found'; throw x; }
        const key = `${u.id}|${clientId}`;
        const cur = be.routines[key];
        const now = iso(be.clock.now());
        be.routines[key] = { id: cur ? cur.id : randUUID(), coachId: u.id, clientId, title: String(routine.title).trim(), days, createdAt: cur ? cur.createdAt : now, updatedAt: now };
        const r = be.routines[key];
        return done({ id: r.id, coachId: r.coachId, clientId: r.clientId, title: r.title, updatedAt: r.updatedAt, days: clone(r.days) });
      },
      async deleteRoutine(clientId) {
        const u = await asCoach({ agreement: false });
        delete be.routines[`${u.id}|${clientId}`];
        return done(undefined);
      },
      async deleteComment(commentId) {
        const u = await asCoach({ agreement: false });
        const c = be.comments[commentId];
        if (!c || c.coachId !== u.id) fail('not_found', 'Comentario no encontrado');
        c.deletedAt = iso(be.clock.now());
        c.serverUpdatedAt = be._serverStamp();
        return done(undefined);
      },
      async endClient(clientId) {
        const u = await asCoach({ agreement: false });
        const l = activeLinkCoach(u.id, clientId);
        l.status = 'ended';
        l.endedAt = iso(be.clock.now());
        return done(undefined);
      },
    };

    return { kind: 'fake', backend: be, auth, account, sync, client, coach };
  }

  // Backend persistido en localStorage (solo E2E en el origen de pruebas): sobrevive recargas.
  const PERSIST_KEY = 'pg-fake-backend';
  function persistentBackend(ls) {
    let json = null;
    try { json = JSON.parse(ls.getItem(PERSIST_KEY) || 'null'); } catch { json = null; }
    const b = FakeBackend.fromJSON(json);
    b.onPersist = (x) => { try { ls.setItem(PERSIST_KEY, JSON.stringify(x)); } catch { /* sin espacio */ } };
    b._persist();
    return b;
  }

  const api = { FakeBackend, FakeClock, createFake, persistentBackend, RemoteError, PERSIST_KEY, SESSION_KEY, CODE_ALPHABET };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RemoteFake = api;
})(typeof window !== 'undefined' ? window : globalThis);
