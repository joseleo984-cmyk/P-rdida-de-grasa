// Implementación FALSA en memoria de la interfaz Remote (equipo/r1-contrato.md §3 y §4). Sin red ni Supabase.
// Sirve para unitarias en Node y E2E con Playwright. NUNCA se usa en producción: Remote.config() solo activa
// mode 'fake' en localhost/127.0.0.1 o con ?remote=fake fuera del dominio de producción.
// Script clásico: expone window.RemoteFake y module.exports.
(function (root) {
  'use strict';

  const APP = 'grasa';
  const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const CONSENT_KINDS = ['terms', 'privacy', 'adult', 'sensitive_health', 'photos_cloud',
    'share_body', 'share_notes', 'share_nutrition', 'share_habits', 'share_photos'];
  const RECORD_KINDS = ['profile', 'entry', 'food', 'habit', 'library'];
  const SHARE_KEYS = ['body', 'notes', 'nutrition', 'habits', 'photos'];
  const RETRYABLE = { offline: true, server: true, rate_limited: true };
  const MAX_SKEW_MS = 5 * 60 * 1000;
  const OTP_TTL_MS = 60 * 60 * 1000;
  const OTP_RESEND_MS = 60 * 1000;
  const OTP_MAX_TRIES = 5;
  const INVITE_MAX_PER_HOUR = 20;
  const PULL_OVERLAP_MS = 30 * 1000;
  const BATCH = 500;
  const SESSION_KEY = 'pg-fake-session';

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
      this.photoViews = [];
      this.blobs = {};          // path → Blob (no se persiste)
      this.revoked = {};        // userId → ms desde el que las sesiones anteriores no valen
      this._online = true;
      this._failNext = [];
      this._latency = 0;
      this._tick = 0;
      this.onPersist = null;
    }

    // --- Fallos inyectables ---
    setOnline(v) { this._online = !!v; }
    failNext(code, times = 1) { for (let i = 0; i < times; i++) this._failNext.push(code); }
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
      const { users, otps, sent, appAccess, profiles, coaches, links, inviteAttempts, records, photos, comments, consentEvents, photoViews, revoked, _tick } = this;
      return { v: 1, users, otps, sent, appAccess, profiles, coaches, links, inviteAttempts, records, photos, comments, consentEvents, photoViews, revoked, tick: _tick };
    }
    static fromJSON(json, opts = {}) {
      const b = new FakeBackend(opts);
      if (json && json.v === 1) {
        for (const k of ['users', 'otps', 'sent', 'appAccess', 'profiles', 'coaches', 'links', 'inviteAttempts', 'records', 'photos', 'comments', 'consentEvents', 'photoViews', 'revoked']) {
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

    const auth = {
      async sendCode(email) {
        await be._call();
        const e = normEmail(email);
        if (!EMAIL_RE.test(e)) fail('invalid', 'Correo no válido');
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
          if (!ev || !CONSENT_KINDS.includes(ev.kind) || typeof ev.granted !== 'boolean' || typeof ev.version !== 'string' || !ev.version || ev.version.length > 20 || Number.isNaN(Date.parse(ev.clientAt))) {
            fail('invalid', 'Evento de consentimiento no válido');
          }
          return { id: randUUID(), userId: u.id, appId: app, kind: ev.kind, granted: ev.granted, version: ev.version, coachId: ev.coachId || null, clientAt: ev.clientAt, createdAt: iso(be.clock.now()) };
        });
        be.consentEvents.push(...rows); // solo inserción
        return done(undefined);
      },
      async consents() {
        const u = await authed();
        const out = {};
        for (const ev of be.consentEvents.filter((x) => x.userId === u.id && x.appId === app)) {
          out[ev.kind] = { granted: ev.granted, version: ev.version, clientAt: ev.clientAt };
        }
        return out;
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
        be.consentEvents = be.consentEvents.filter((x) => x.userId !== u.id);
        be._persist();
        await auth.signOut();
      },
    };

    // ---------- Sincronización (dueño) ----------
    const clampMs = (v) => Math.min(Date.parse(v), be.clock.now() + MAX_SKEW_MS);
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
      async pull(since, limit = 1000) {
        const u = await authed();
        const from = (Date.parse(since) || 0) - PULL_OVERLAP_MS;
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
      return { body: o.body === undefined ? true : o.body === true, notes: o.notes === true, nutrition: o.nutrition === undefined ? true : o.nutrition === true,
        habits: o.habits === undefined ? true : o.habits === true, photos: o.photos === true };
    };
    const linkOut = (l) => (l ? { id: l.id, coachId: l.coachId, businessName: (be.coaches[l.coachId] || {}).businessName || '', shares: { ...l.shares }, since: l.createdAt } : null);
    const shareEvents = (u, l) => SHARE_KEYS.map((k) => ({ id: randUUID(), userId: u.id, appId: app, kind: 'share_' + k, granted: l.shares[k], version: 'link', coachId: l.coachId, clientAt: iso(be.clock.now()), createdAt: iso(be.clock.now()) }));
    const findCoachByCode = (code) => {
      const c = String(code || '').trim().toUpperCase().replace(/[\s-]/g, '');
      if (!/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(c)) return null;
      const id = Object.keys(be.coaches).find((k) => be.coaches[k].inviteCode === c && be.coaches[k].active);
      return id ? { id, ...be.coaches[id] } : null;
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
        be._inviteAttempt(u.id);
        const c = findCoachByCode(code);
        if (!c || c.id === u.id) { be._persist(); fail('invalid_code', 'Código de coach no válido'); }
        const sh = normShares(shares);
        if (!sh.body) fail('invalid', 'Compartir tu progreso corporal es obligatorio para vincularte');
        const prev = be.activeLink(u.id);
        if (prev) { prev.status = 'ended'; prev.endedAt = iso(be.clock.now()); }
        const l = { id: randUUID(), coachId: c.id, clientId: u.id, status: 'active', shares: sh, createdAt: iso(be.clock.now()), endedAt: null, updatedAt: iso(be.clock.now()) };
        be.links.push(l);
        be._grant(u.id, 'client', app);
        be.consentEvents.push(...shareEvents(u, l));
        return done(linkOut(l));
      },
      async myLink() { const u = await authed(); return linkOut(be.activeLink(u.id)); },
      async updateShares(shares) {
        const u = await authed();
        const l = be.activeLink(u.id);
        if (!l) fail('not_found', 'No tienes coach');
        const sh = normShares({ ...l.shares, ...shares });
        if (!sh.body) fail('invalid', 'Compartir tu progreso corporal es obligatorio mientras tengas coach');
        l.shares = sh;
        l.updatedAt = iso(be.clock.now());
        be.consentEvents.push(...shareEvents(u, l));
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
    async function asCoach() {
      const u = await authed();
      if (!be.coaches[u.id] || !be.roles(u.id, app).includes('coach')) fail('forbidden', 'No eres coach');
      return u;
    }
    function activeLinkCoach(coachId, clientId) {
      const l = be.links.find((x) => x.coachId === coachId && x.clientId === clientId && x.status === 'active');
      if (!l) fail('forbidden', 'Sin vínculo activo con ese cliente');
      return l;
    }
    const coach = {
      async becomeCoach(businessName) {
        const u = await authed();
        const name = String(businessName || '').trim();
        if (name.length < 2 || name.length > 60) fail('invalid', 'El nombre comercial debe tener entre 2 y 60 caracteres');
        if (!be.coaches[u.id]) be.coaches[u.id] = { businessName: name, inviteCode: be._newInviteCode(), freeClients: 5, active: true, codeRotatedAt: iso(be.clock.now()), createdAt: iso(be.clock.now()) };
        be._grant(u.id, 'coach', app);
        return done({ inviteCode: be.coaches[u.id].inviteCode });
      },
      async myCoach() {
        const u = await authed();
        const c = be.coaches[u.id];
        return c ? { businessName: c.businessName, inviteCode: c.inviteCode, freeClients: c.freeClients } : null;
      },
      async rotateCode() {
        const u = await asCoach();
        be.coaches[u.id].inviteCode = be._newInviteCode();
        be.coaches[u.id].codeRotatedAt = iso(be.clock.now());
        return done(be.coaches[u.id].inviteCode);
      },
      async clients() {
        const u = await asCoach();
        const act = be.links.filter((l) => l.coachId === u.id && l.status === 'active').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        return act.map((l, i) => {
          const stamps = Object.values(be.records).filter((r) => r.userId === l.clientId).map((r) => r.serverUpdatedAt).sort();
          return { clientId: l.clientId, displayName: (be.profiles[l.clientId] || {}).displayName || '', linkId: l.id, since: l.createdAt,
            shares: { ...l.shares }, lastActivity: stamps.length ? stamps[stamps.length - 1] : null, overFreeLimit: i >= be.coaches[u.id].freeClients };
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
      async deleteComment(commentId) {
        const u = await asCoach();
        const c = be.comments[commentId];
        if (!c || c.coachId !== u.id) fail('not_found', 'Comentario no encontrado');
        c.deletedAt = iso(be.clock.now());
        c.serverUpdatedAt = be._serverStamp();
        return done(undefined);
      },
      async endClient(clientId) {
        const u = await asCoach();
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
