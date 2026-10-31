// Implementación FALSA en memoria de la interfaz Remote (equipo/r1-contrato.md §3 y §4). Sin red ni Supabase.
// Sirve para unitarias en Node y E2E con Playwright. NUNCA se usa en producción: Remote.config() solo activa
// mode 'fake' en localhost/127.0.0.1 o con ?remote=fake fuera del dominio de producción.
// Script clásico: expone window.RemoteFake y module.exports.
(function (root) {
  'use strict';

  const APP = 'grasa';
  const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const CONSENT_KINDS = ['terms', 'privacy', 'adult', 'sensitive_health', 'cloud_transfer', 'photos_cloud', 'photo_view_coach', 'coach_agreement',
    'share_body', 'share_notes', 'share_nutrition', 'share_habits', 'share_photos', 'liga'];
  // r1 v1.16 (liga semanal): catálogo CERRADO de alias (mismo orden que grasa.liga_aliases) y versiones del acuerdo que traen la cláusula de ligas.
  const LIGA_ALIASES = ['Halcón', 'Titán', 'Roble', 'Fénix', 'Cóndor', 'Jaguar', 'Delfín', 'Lince', 'Pino', 'Cedro', 'Águila', 'Lobo',
    'Puma', 'Ceiba', 'Colibrí', 'Roca', 'Río', 'Volcán', 'Nevado', 'Ámbar', 'Trueno', 'Coral', 'Bosque', 'Montaña'];
  const LIGA_AGREEMENT_VERSIONS = ['0.6-A7-coach'];
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
  const puntos = () => root.Puntos || (typeof require === 'function' ? require('./puntos.js') : null);
  const addDay = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);

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
      this.routines = {};       // Etapa 2 (v1.8): rutinas ASIGNADAS, id → { id, coachId, clientId, title, days, visible, createdAt, updatedAt } (varias por cliente)
      this.templates = {};      // v1.8: «Mis rutinas» del coach, id → { id, coachId, title, days, createdAt, updatedAt }
      this.daily = {};          // v1.8: «Rutina de hoy», coachId → { coachId, templateId, title, days, day:'AAAA-MM-DD', publishedAt } (una copia por coach)
      this.revoked = {};        // userId → ms desde el que las sesiones anteriores no valen
      this.healthAnswers = {};  // UX Etapa 2 (r1 v1.11): `${userId}|${question}` → { userId, question, answer, version, textHash, answeredAt } (solo la dueña la lee y escribe)
      this.painReports = {};    // v1.12 (aviso de dolor): `${userId}|${day}` → { userId, day, pain, version, textHash, pausePrivate, reportedAt, reviewedAt } (nadie la lee: solo funciones)
      this.linkPauses = [];     // v1.11: pausas cerradas { linkId, from, to } (las registra setPayment al pasar de vencido a pagado)
      this.panelDays = {};      // v1.13: coachId → ['AAAA-MM-DD', …] días en que abrió su panel (solo la fecha)
      this.notices = {};        // v1.13: avisos de la plataforma, id → { id, title, body, startsOn, endsOn, createdAt, deletedAt }
      this.coachEvents = [];    // v1.13: suspensiones / reactivaciones { coachId, active, reason, at } (solo el admin)
      this.exports = [];        // v1.14 (M6): exportaciones a Excel { id, coachId, createdAt, clients, categories, from, to, custody, agreementVersion } (sin contenido)
      this.points = {};         // v1.15: puntos de constancia CALCULADOS por el «servidor» (puntos.js = grasa.points_refresh), userId → [{ day, source, points }]
      this.teamGoals = {};      // v1.15: meta colectiva, `${coachId}|${lunes}` → { coachId, weekStart, metric, target, createdAt }
      this.challenges = {};     // v1.11: retos del coach, id → { id, coachId, title, habit, target, start, end, createdAt, deletedAt, members: [clientId], marks: { clientId: { day: { private } } } }
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
    // v1.14: versión de la ÚLTIMA aceptación del acuerdo del coach si está vigente (null si no hay o se retiró).
    agreementVersion(userId) {
      for (let i = this.consentEvents.length - 1; i >= 0; i--) {
        const e = this.consentEvents[i];
        if (e.userId === userId && e.kind === 'coach_agreement') return e.granted === true ? e.version : null;
      }
      return null;
    }
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
    // v1.13: un asesorado de un coach SUSPENDIDO no queda en pausa (su coach no puede marcar pagos), como grasa.client_payment_blocked.
    paymentBlocked(userId) { const l = this.activeLink(userId); return !!l && !!this.coaches[l.coachId] && this.coaches[l.coachId].active !== false && !this.payState(l).paid; }
    requirePayment(userId) { if (this.paymentBlocked(userId)) fail('payment_required', 'Tu acceso está en pausa: habla con tu coach'); }
    // v1.11 (P1): ¿ese día cae en una pausa cerrada del vínculo activo? ¿La fila nace privada (en pausa ahora o con fecha dentro de una pausa)?
    dayInPause(userId, day) { const l = this.activeLink(userId); return !!l && !!day && this.linkPauses.some((x) => x.linkId === l.id && day >= x.from && day <= x.to); }
    pausePrivate(userId, day) { return this.paymentBlocked(userId) || this.dayInPause(userId, day); }
    // Pausas del vínculo: cerradas + la actual (to: null) si sigue vencido. Como grasa.link_pauses_json.
    pausesOf(link) {
      if (!link) return [];
      const out = this.linkPauses.filter((x) => x.linkId === link.id).sort((a, b) => a.from.localeCompare(b.from)).map((x) => ({ from: x.from, to: x.to }));
      if (link.status === 'active' && !this.payState(link).paid) out.push({ from: this.pauseStart(link), to: null });
      return out;
    }
    pauseStart(link) { return link.paidUntil ? addDay(link.paidUntil, 1) : new Date(Date.parse(link.paidMarkedAt || link.createdAt) - 5 * 3600000).toISOString().slice(0, 10); }
    // v1.12: día del último «Sí» sin revisar y fuera de la pausa (como grasa.pain_flag).
    painFlag(userId) { const d = Object.values(this.painReports).filter((x) => x.userId === userId && x.pain && !x.reviewedAt && !x.pausePrivate).map((x) => x.day).sort(); return d.length ? d[d.length - 1] : null; }
    healthFlag(userId, q) { const h = this.healthAnswers[`${userId}|${q}`]; return !!h && h.answer === 'yes'; }
    // Solo pruebas: deja el vínculo activo de ese correo pagado hasta esa fecha (como tests.paid en SQL).
    setPaidUntil(email, iso) { const u = this.users[normEmail(email)]; const l = u && this.activeLink(u.id); if (!l) throw new Error('Sin vínculo activo'); l.paidUntil = iso; l.paidMarkedAt = new Date(this.clock.now()).toISOString(); this._persist(); }

    // ---------- v1.15: puntos de constancia (como el disparador grasa.points_on_record → grasa.points_refresh) ----------
    // asOf: SOLO para sembrar la demo con historia (calcula el día «como si» se hubiera registrado a tiempo ese día).
    pointsRefresh(userId, day, { asOf = null } = {}) {
      const P = puntos();
      if (!P || !day) return;
      const today = asOf || this.todayBogota();
      const link = this.activeLink(userId);
      const openPause = link && link.status === 'active' && !this.payState(link).paid ? this.pauseStart(link) : null;
      const paused = (asOf ? !!(openPause && day >= openPause) : this.paymentBlocked(userId)) || this.dayInPause(userId, day);
      const recs = Object.values(this.records).filter((r) => r.userId === userId && !r.deletedAt && !r.pausePrivate && ['entry', 'food', 'habit'].includes(r.kind) && r.date);
      const habitOf = (d) => { const r = recs.find((x) => x.kind === 'habit' && x.date === d); return r ? r.data || {} : null; };
      const foodsOf = (d) => recs.filter((x) => x.kind === 'food' && x.date === d).length;
      const prev = recs.filter((x) => x.date < day).map((x) => x.date).sort().pop() || null;
      const challenges = link ? Object.values(this.challenges).filter((ch) => !ch.deletedAt && ch.coachId === link.coachId && ch.members.includes(userId))
        .map((ch) => ({ id: ch.id, habit: ch.habit, target: ch.target, start: ch.start, end: ch.end,
          marks: Object.entries(ch.marks[userId] || {}).filter(([, m]) => !m.private).map(([d]) => d) })) : [];
      const goals = (link && link.goals) || {};
      this.points[userId] = P.refreshDay({ userLog: this.points[userId] || [], day, today, paused, habit: habitOf(day), foods: foodsOf(day),
        entry: (recs.find((x) => x.kind === 'entry' && x.date === day) || {}).data || null, prevRecordDay: prev,
        plan: Number.isInteger(goals.trained_days) ? goals.trained_days : P.PLAN_DEFAULT, frozenDay: (d) => this.dayInPause(userId, d),
        challenges, habitOnDay: (d, habit) => P.habitOn(habit, habitOf(d), foodsOf(d)) });
    }
    // Meta colectiva de ESTA semana de un coach, agregada como grasa.team_goal_out: total y cuántos; con menos de 5, nada. Nunca ids ni aportes.
    teamGoalOut(coachId) {
      const P = puntos();
      const wk = P.monday(this.todayBogota());
      const g = this.teamGoals[`${coachId}|${wk}`];
      if (!g) return null;
      const coachOk = this.coaches[coachId] && this.coaches[coachId].active !== false;
      const part = coachOk ? this.links.filter((l) => l.coachId === coachId && l.status === 'active' && !l.teamOptOut && l.shares.habits && l.shares.nutrition
        && this.hasConsent(l.clientId, 'sensitive_health') && this.hasConsent(l.clientId, 'cloud_transfer') && !this.paymentBlocked(l.clientId)).map((l) => l.clientId) : [];
      const n = part.length, end = P.addDays(wk, 6);
      let total = null;
      if (n >= 5) {
        const rows = part.map((u) => (this.points[u] || []).filter((r) => r.day >= wk && r.day <= end));
        total = g.metric === 'entrenos' ? rows.reduce((s, rs) => s + rs.filter((r) => r.source === 'entreno').length, 0)
          : rows.reduce((s, rs) => s + Math.min(P.WEEK_CAP, rs.reduce((a, r) => a + r.points, 0)), 0);
      }
      return { metric: g.metric, target: g.target, weekStart: wk, weekEnd: end, min: 5, published: n >= 5, participants: n >= 5 ? n : null, total };
    }

    // r1 v1.16: ¿el coach habilitó la liga (acuerdo con la cláusula de ligas) y está activo? y ¿cuenta HOY esta persona? (grasa.liga_active)
    ligaCoachOk(coachId) { return !!(this.coaches[coachId] && this.coaches[coachId].active !== false && LIGA_AGREEMENT_VERSIONS.includes(this.agreementVersion(coachId))); }
    ligaActive(l) {
      return l.status === 'active' && !!l.ligaOptIn && !!l.ligaAlias && this.ligaCoachOk(l.coachId) && l.shares.habits && l.shares.nutrition
        && this.hasConsent(l.clientId, 'sensitive_health') && this.hasConsent(l.clientId, 'cloud_transfer') && this.hasConsent(l.clientId, 'adult')
        && this.hasConsent(l.clientId, 'liga') && !this.paymentBlocked(l.clientId);
    }
    // Como grasa.my_liga: la TABLA solo para quien participa y con 5 o más; solo alias y puntos (tope semanal). Nunca nombres ni ids.
    ligaOut(userId) {
      const P = puntos();
      const l = this.activeLink(userId);
      if (!l) return { enabled: false, opted_in: false, alias: null, min: 5, published: false, table: null };
      const wk = P.monday(this.todayBogota()), end = P.addDays(wk, 6);
      const ok = this.ligaCoachOk(l.coachId), mine = ok && this.ligaActive(l);
      const team = ok ? this.links.filter((k) => k.coachId === l.coachId && this.ligaActive(k)) : [];
      const n = team.length;
      const pts = (u) => Math.min(P.WEEK_CAP, (this.points[u] || []).filter((r) => r.day >= wk && r.day <= end).reduce((a, r) => a + r.points, 0));
      const table = mine && n >= 5 ? team.map((k) => ({ alias: k.ligaAlias, points: pts(k.clientId), me: k.clientId === userId }))
        .sort((a, b) => b.points - a.points || a.alias.localeCompare(b.alias, 'es')) : null;
      return { enabled: ok, opted_in: mine, alias: mine ? l.ligaAlias : null, week_start: wk, week_end: end, min: 5,
        participants: mine ? n : null, published: mine && n >= 5, table };
    }
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
      const { users, otps, sent, appAccess, profiles, coaches, links, inviteAttempts, records, photos, comments, consentEvents, consentArchive, photoViews, agreementCopies, revoked, gifs, routines, templates, daily, healthAnswers, painReports, linkPauses, challenges, panelDays, notices, coachEvents, exports, points, teamGoals, _tick } = this;
      return { v: 1, users, otps, sent, appAccess, profiles, coaches, links, inviteAttempts, records, photos, comments, consentEvents, consentArchive, photoViews, agreementCopies, revoked, gifs, routines, templates, daily, healthAnswers, painReports, linkPauses, challenges, panelDays, notices, coachEvents, exports, points, teamGoals, tick: _tick };
    }
    static fromJSON(json, opts = {}) {
      const b = new FakeBackend(opts);
      if (json && json.v === 1) {
        for (const k of ['users', 'otps', 'sent', 'appAccess', 'profiles', 'coaches', 'links', 'inviteAttempts', 'records', 'photos', 'comments', 'consentEvents', 'consentArchive', 'photoViews', 'agreementCopies', 'revoked', 'gifs', 'routines', 'templates', 'daily', 'healthAnswers', 'painReports', 'linkPauses', 'challenges', 'panelDays', 'notices', 'coachEvents', 'exports', 'points', 'teamGoals']) {
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
        be.photoViews = be.photoViews.filter((v) => v.clientId !== u.id && v.coachId !== u.id);   // FK en cascada, como grasa.photo_views
        for (const [id, g] of Object.entries(be.gifs)) if (g.coachId === u.id) delete be.gifs[id];
        for (const [k, r] of Object.entries(be.routines)) if (r.coachId === u.id || r.clientId === u.id) delete be.routines[k];
        for (const [k, t] of Object.entries(be.templates)) if (t.coachId === u.id) delete be.templates[k];
        delete be.daily[u.id];
        delete be.panelDays[u.id];
        for (const k of Object.keys(be.healthAnswers)) if (k.startsWith(u.id + '|')) delete be.healthAnswers[k];
        for (const k of Object.keys(be.painReports)) if (k.startsWith(u.id + '|')) delete be.painReports[k];
        for (const [k, ch] of Object.entries(be.challenges)) { if (ch.coachId === u.id) delete be.challenges[k]; else { ch.members = ch.members.filter((m) => m !== u.id); delete ch.marks[u.id]; } }
        be.linkPauses = be.linkPauses.filter((x) => be.links.some((l) => l.id === x.linkId));
        delete be.points[u.id];
        for (const k of Object.keys(be.teamGoals)) if (k.startsWith(u.id + '|')) delete be.teamGoals[k];
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
        if (!Array.isArray(records) || !Array.isArray(photos)) fail('invalid', 'Formato no válido');
        // Sprint 11: con coach y vencido no se sube nada (sí se puede bajar, descargar y borrar). v1.11 (P1): salvo un lote SOLO de hábitos (registro autónomo).
        if (be.paymentBlocked(u.id) && (photos.length || !records.length || records.some((r) => !r || r.kind !== 'habit'))) be.requirePayment(u.id);
        const rejected = { records: [], photos: [] };
        const touched = new Set();   // v1.15: días a recalcular (como el disparador de puntos)
        // En lotes de 500, como la implementación real.
        for (let i = 0; i < Math.max(records.length, photos.length); i += BATCH) {
          for (const r of records.slice(i, i + BATCH)) {
            if (!validRecord(r)) fail('invalid', 'Registro no válido');
            const key = `${u.id}|${r.kind}|${r.nkey}`;
            const incoming = { id: r.id, kind: r.kind, nkey: r.nkey, date: r.date || null, data: r.deletedAt ? {} : clone(r.data || {}),
              updatedAt: iso(clampMs(r.updatedAt)), deletedAt: r.deletedAt ? iso(clampMs(r.deletedAt)) : null };
            const cur = be.records[key];
            const priv = be.pausePrivate(u.id, incoming.date);   // v1.11: lo marca el «servidor» (como el disparador grasa.mark_pause_private)
            if (!cur) be.records[key] = { ...incoming, userId: u.id, pausePrivate: priv, serverUpdatedAt: be._serverStamp() };
            else if (newer(incoming, cur)) be.records[key] = { ...incoming, id: cur.id, userId: u.id, pausePrivate: !!cur.pausePrivate || priv, serverUpdatedAt: be._serverStamp() }; // clave natural: conserva id
            else { rejected.records.push(recOut(cur)); continue; }
            if (['entry', 'food', 'habit'].includes(r.kind)) { if (incoming.date) touched.add(incoming.date); if (cur && cur.date && cur.date !== incoming.date) touched.add(cur.date); }
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
        for (const d of [...touched].sort()) be.pointsRefresh(u.id, d);
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
    const linkOut = (l) => (l ? { id: l.id, coachId: l.coachId, businessName: (be.coaches[l.coachId] || {}).businessName || '', shares: { ...l.shares }, since: l.createdAt, ...be.payState(l),
      proteinGoal: l.proteinGoal == null ? null : l.proteinGoal, pauses: be.pausesOf(l), goals: goalsOf(l) } : null);
    // v1.13: metas del coach (la proteína es la MISMA proteinGoal de v1.11). Solo las fijadas.
    function goalsOf(l) {
      const g = { ...(l.goals || {}), protein_g: l.proteinGoal == null ? undefined : l.proteinGoal };
      return Object.fromEntries(Object.entries(g).filter(([, v]) => typeof v === 'number'));
    }
    // v1.11: retos. Para el asesorado (forClient = su id) solo SUS marcas; para el coach, los miembros con vínculo activo y sus días SIN las marcas de la pausa.
    const challengeOut = (ch, forClient) => ({ id: ch.id, coachId: ch.coachId, businessName: (be.coaches[ch.coachId] || {}).businessName || '', title: ch.title, habit: ch.habit,
      target: ch.target, start: ch.start, end: ch.end, createdAt: ch.createdAt,
      marks: forClient ? Object.keys(ch.marks[forClient] || {}).sort() : null,
      members: forClient ? null : ch.members.filter((m) => be.links.some((l) => l.coachId === ch.coachId && l.clientId === m && l.status === 'active'))
        .map((m) => ({ clientId: m, displayName: (be.profiles[m] || {}).displayName || '', done: Object.values(ch.marks[m] || {}).filter((x) => !x.private).length }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName) || a.clientId.localeCompare(b.clientId)) });
    const HABITS = ['water', 'steps', 'sleep', 'trained', 'foods'];
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

    // v1.8: salidas de rutinas (misma forma que remote.js) y ayudas comunes.
    const routineOut = (r) => ({ id: r.id, coachId: r.coachId, clientId: r.clientId || null, title: r.title, updatedAt: r.updatedAt, createdAt: r.createdAt, visible: r.visible !== false, days: clone(r.days) });
    const dailyOut = (d) => ({ id: null, coachId: d.coachId, clientId: null, templateId: d.templateId || null, title: d.title, days: clone(d.days), day: d.day, publishedAt: d.publishedAt, updatedAt: d.publishedAt, createdAt: d.publishedAt, visible: true });
    const routineList = (pred) => Object.values(be.routines).filter(pred).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).map(routineOut);
    const usesGif = (days, id) => days.some((d) => d.exercises.some((e) => e.gif === id));
    const gifUses = (coachId, id) => Object.values(be.templates).filter((t) => t.coachId === coachId && usesGif(t.days, id)).length
      + Object.values(be.routines).filter((r) => r.coachId === coachId && usesGif(r.days, id)).length
      + (be.daily[coachId] && usesGif(be.daily[coachId].days, id) ? 1 : 0);
    const clean = (routine) => {
      const R = rutinas();
      const v = R.validate(routine);
      if (!v.ok) { const e = new RemoteError('invalid', v.errors[0].message); e.detail = v.errors[0].message; throw e; }
      return { title: String(routine.title).trim(), days: R.toContent(routine).days };
    };
    const checkGifs = (coachId, days) => {
      for (const d of days) for (const e of d.exercises) if (e.gif && !(be.gifs[e.gif] && be.gifs[e.gif].coachId === coachId)) { const x = new RemoteError('invalid', 'Datos no válidos'); x.detail = 'gif_not_found'; throw x; }
    };
    const invalid = (detail) => { const e = new RemoteError('invalid', 'Datos no válidos'); e.detail = detail; throw e; };
    // Rutinas (v1.7/v1.8): vínculo activo con coach activo; NO depende de A3/A4 del cliente (no son datos de salud del cliente).
    const activeLinkCoachOnly = (coachId, clientId) => {
      if (!be.coaches[coachId] || !be.coaches[coachId].active || !be.links.some((x) => x.coachId === coachId && x.clientId === clientId && x.status === 'active')) fail('forbidden', 'Sin vínculo activo con ese cliente');
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
      async myRoutines() {
        const u = await authed();
        const l = be.activeLink(u.id);
        if (!l || !be.coaches[l.coachId] || !be.coaches[l.coachId].active) return [];
        return routineList((r) => r.coachId === l.coachId && r.clientId === u.id && r.visible !== false);
      },
      async myRoutine() { return (await client.myRoutines())[0] || null; },
      // La rutina de hoy de su coach: solo si el día publicado es EXACTAMENTE `today` (la fecha de su dispositivo), con vínculo activo y coach activo.
      async myDaily(today) {
        const u = await authed();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(today))) fail('invalid', 'Fecha no válida');
        const l = be.activeLink(u.id);
        const d = l && be.coaches[l.coachId] && be.coaches[l.coachId].active ? be.daily[l.coachId] : null;
        return d && d.day === String(today) ? dailyOut(d) : null;
      },
      async gifBlob(coachId, gifId) {
        const u = await authed();
        const l = be.activeLink(u.id);
        const g = be.gifs[gifId];
        if (!l || l.coachId !== coachId || !be.coaches[coachId] || !be.coaches[coachId].active || !g || g.coachId !== coachId) fail('not_found', 'Animación no encontrada');
        return new Blob([fromB64(g.b64)], { type: g.mime });
      },
      // Bitácora «Quién vio mis fotos» (r1 v1.10, grasa.my_photo_views): SOLO las aperturas de sus fotos, las 100 más recientes primero. Sin conexión falla como el resto.
      async photoViews() {
        const u = await authed();
        return be.photoViews.filter((v) => v.clientId === u.id)
          .sort((a, b) => Date.parse(b.viewedAt) - Date.parse(a.viewedAt) || (a.id < b.id ? 1 : -1)).slice(0, 100)
          .map((v) => { const p = be.photos[v.photoId], c = be.coaches[v.coachId]; return { id: v.id, viewedAt: v.viewedAt, photoId: v.photoId, photoDate: p ? p.date : null, pose: p ? p.pose : null, coachName: c ? c.businessName : '' }; });
      },
      // v1.11 (L4): respuestas de salud. Solo la dueña; exige A3 + A4 para guardar.
      async myHealth() {
        const u = await authed();
        const out = { condition: null, pregnancy: null };
        for (const q of Object.keys(out)) { const h = be.healthAnswers[`${u.id}|${q}`]; if (h) out[q] = h.answer; }
        return out;
      },
      async setHealthAnswer(question, answer, { version, textHash } = {}) {
        const u = await authed();
        be.requireCloudConsent(u.id);
        if (!['condition', 'pregnancy'].includes(question) || !['yes', 'no', 'skip'].includes(answer) || !version || String(version).length > 20 || !HASH_RE.test(textHash || '')) fail('invalid', 'Respuesta no válida');
        be.healthAnswers[`${u.id}|${question}`] = { userId: u.id, question, answer, version, textHash, answeredAt: iso(be.clock.now()) };
        return done({ question, answer });
      },
      // v1.12 (concepto jurídico 4): reporte cerrado No / Sí del día. Exige A3 + A4 y un coach activo vinculado; en pausa queda privado.
      async reportPain(day, pain, { version, textHash } = {}) {
        const u = await authed();
        be.requireCloudConsent(u.id);
        const today = be.todayBogota();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || '')) || day < addDay(today, -1) || day > addDay(today, 1) || typeof pain !== 'boolean' || !version || String(version).length > 20 || !HASH_RE.test(textHash || '')) fail('invalid', 'Respuesta no válida');
        const l = be.activeLink(u.id);
        if (!l || !be.coaches[l.coachId] || !be.coaches[l.coachId].active) fail('not_found', 'no_coach');
        const key = `${u.id}|${day}`, cur = be.painReports[key];
        const priv = !!(cur && cur.pausePrivate) || be.pausePrivate(u.id, day);
        be.painReports[key] = { userId: u.id, day, pain, version, textHash, pausePrivate: priv, reportedAt: iso(be.clock.now()), reviewedAt: pain ? null : (cur ? cur.reviewedAt : null) };
        return done({ day, pain, notified: pain && !priv });
      },
      async myChallenges() {
        const u = await authed();
        const l = be.activeLink(u.id);
        if (!l || !be.coaches[l.coachId] || !be.coaches[l.coachId].active) return [];
        const from = addDay(be.todayBogota(), -14);
        return Object.values(be.challenges).filter((ch) => ch.coachId === l.coachId && !ch.deletedAt && ch.end >= from && ch.members.includes(u.id))
          .sort((a, b) => b.start.localeCompare(a.start) || b.createdAt.localeCompare(a.createdAt)).map((ch) => challengeOut(ch, u.id));
      },
      async markChallenge(id, day, doneFlag) {
        const u = await authed();
        be.requireCloudConsent(u.id);
        const ch = be.challenges[id];
        const l = be.activeLink(u.id);
        if (!ch || ch.deletedAt || !ch.members.includes(u.id) || !l || l.coachId !== ch.coachId) fail('not_found', 'Reto no encontrado');
        const d = String(day);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d < ch.start || d > ch.end || d > addDay(be.todayBogota(), 1)) invalid('día fuera del reto');
        const mine = (ch.marks[u.id] ||= {});
        if (doneFlag) { mine[d] = { private: !!(mine[d] && mine[d].private) || be.pausePrivate(u.id, d) }; be.pointsRefresh(u.id, be.todayBogota()); }   // v1.15: bono del reto
        else delete mine[d];
        return done(challengeOut(ch, u.id));
      },
      // v1.15: mis puntos (solo los propios), la meta del team (agregada) y el opt-out.
      async myPoints() {
        const u = await authed();
        const l = be.activeLink(u.id), g = (l && l.goals) || {};
        return clone(puntos().summary(be.points[u.id] || [], be.todayBogota(), { plan: Number.isInteger(g.trained_days) ? g.trained_days : 5, paused: be.paymentBlocked(u.id), teamOptOut: l ? !!l.teamOptOut : null }));
      },
      async myTeamGoal() {
        const u = await authed();
        const l = be.activeLink(u.id);
        if (!l || !be.coaches[l.coachId] || be.coaches[l.coachId].active === false) return null;
        const g = be.teamGoalOut(l.coachId);
        return g ? { ...g, optedOut: !!l.teamOptOut } : { none: true, optedOut: !!l.teamOptOut };
      },
      // r1 v1.16: liga semanal (opt-in reforzado, alias de catálogo, mínimo 5, solo alias y puntos).
      async myLiga() { const u = await authed(); return clone(be.ligaOut(u.id)); },
      async joinLiga() {
        const u = await authed();
        const l = be.activeLink(u.id);
        const err = (code, detail) => { const e = new RemoteError(code, detail); e.detail = detail; throw e; };
        if (!l) fail('not_found', 'Sin coach');
        if (!be.ligaCoachOk(l.coachId)) err('forbidden', 'liga_not_enabled');
        if (!(be.hasConsent(u.id, 'sensitive_health') && be.hasConsent(u.id, 'cloud_transfer') && be.hasConsent(u.id, 'adult'))) err('forbidden', 'consent_required');
        if (!be.hasConsent(u.id, 'liga')) err('forbidden', 'liga_consent_required');
        if (!(l.shares.habits && l.shares.nutrition)) err('forbidden', 'liga_requires_habits');
        if (be.paymentBlocked(u.id)) err('forbidden', 'paused');
        if (!l.ligaAlias) {
          const used = be.links.filter((k) => k.coachId === l.coachId && k.status === 'active' && k.ligaAlias).map((k) => k.ligaAlias);
          let h = 0; for (const ch of u.id) h = (h * 31 + ch.charCodeAt(0)) % LIGA_ALIASES.length;
          let pick = null;
          for (let i = 0; i < LIGA_ALIASES.length && !pick; i++) { const c = LIGA_ALIASES[(h + i) % LIGA_ALIASES.length]; if (!used.includes(c)) pick = c; }
          if (!pick) invalid('liga_full');
          l.ligaAlias = pick;
        }
        l.ligaOptIn = true; l.updatedAt = iso(be.clock.now());
        be._persist();
        return clone(be.ligaOut(u.id));
      },
      async leaveLiga() {
        const u = await authed();
        const l = be.activeLink(u.id);
        if (l) { l.ligaOptIn = false; l.ligaAlias = null; l.updatedAt = iso(be.clock.now()); be._persist(); }
        return clone(be.ligaOut(u.id));
      },
      async setTeamOptOut(out) {
        const u = await authed();
        const l = be.activeLink(u.id);
        if (!l) fail('not_found', 'Sin coach');
        l.teamOptOut = !!out; l.updatedAt = iso(be.clock.now());
        be._persist();
        return this.myTeamGoal();
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
        return c ? { businessName: c.businessName, inviteCode: c.inviteCode, freeClients: c.freeClients, active: c.active !== false,
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
          const stamps = Object.values(be.records).filter((r) => r.userId === l.clientId && !r.pausePrivate).map((r) => r.serverUpdatedAt).sort();   // v1.11: nada de la pausa
          const cloud = be.hasConsent(l.clientId, 'sensitive_health') && be.hasConsent(l.clientId, 'cloud_transfer');
          return { clientId: l.clientId, displayName: (be.profiles[l.clientId] || {}).displayName || '', linkId: l.id, since: l.createdAt,
            shares: { ...l.shares }, lastActivity: stamps.length && cloud ? stamps[stamps.length - 1] : null, overFreeLimit: i >= be.coaches[u.id].freeClients, ...be.payState(l),
            proteinGoal: l.proteinGoal == null ? null : l.proteinGoal, healthRestriction: cloud && be.healthFlag(l.clientId, 'condition'), pregnancyState: cloud && be.healthFlag(l.clientId, 'pregnancy'),
            pauses: be.pausesOf(l), painReported: cloud && be.coaches[u.id].active !== false ? be.painFlag(l.clientId) : null, goals: goalsOf(l) };
        });
      },
      async clientData(clientId, since) {
        const u = await asCoach();
        const l = activeLinkCoach(u.id, clientId);
        const from = since ? Date.parse(since) - PULL_OVERLAP_MS : -Infinity;
        const allowed = new Set([...(l.shares.body ? ['profile', 'entry'] : []), ...(l.shares.nutrition ? ['food'] : []), ...(l.shares.habits ? ['habit'] : [])]); // nunca 'library'
        const records = Object.values(be.records)
          .filter((r) => r.userId === clientId && allowed.has(r.kind) && !r.pausePrivate && Date.parse(r.serverUpdatedAt) > from)   // v1.11 (P1): lo de la pausa nunca
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
        const today = be.todayBogota();
        if (!be.payState(l).paid && paidUntil != null && String(paidUntil) >= today) {   // v1.11: termina una pausa → se guarda (hasta ayer)
          const from = be.pauseStart(l), to = addDay(today, -1);
          if (from <= to) be.linkPauses.push({ linkId: l.id, from, to });
        }
        l.paidUntil = paidUntil == null ? null : String(paidUntil);
        l.paidMarkedAt = iso(be.clock.now());
        l.updatedAt = l.paidMarkedAt;
        return done(be.payState(l));
      },
      // Etapa 2: biblioteca de animaciones del coach y rutinas por cliente (mismas reglas que grasa.register_gif, save_routine, etc.).
      async listGifs() {
        const u = await asCoach();
        return Object.values(be.gifs).filter((g) => g.coachId === u.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((g) => ({ id: g.id, name: g.name, mime: g.mime, size: g.size, createdAt: g.createdAt, uses: gifUses(u.id, g.id) }));
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
        if (gifUses(u.id, gifId) > 0) invalid('gif_in_use');
        delete be.gifs[gifId];
        return done(undefined);
      },
      async gifBlob(gifId) {
        const u = await asCoach({ agreement: false });
        const g = be.gifs[gifId];
        if (!g || g.coachId !== u.id) fail('not_found', 'Animación no encontrada');
        return new Blob([fromB64(g.b64)], { type: g.mime });
      },
      // v1.7 (compatibilidad): actúan sobre la PRIMERA rutina del cliente.
      async getRoutine(clientId) {
        const u = await asCoach();
        activeLinkCoachOnly(u.id, clientId);
        return routineList((r) => r.coachId === u.id && r.clientId === clientId)[0] || null;
      },
      async saveRoutine(clientId, routine) {
        const first = await coach.getRoutine(clientId);
        return coach.saveClientRoutine(clientId, first ? first.id : null, routine);
      },
      async deleteRoutine(clientId) {
        const u = await asCoach({ agreement: false });
        const first = routineList((r) => r.coachId === u.id && r.clientId === clientId)[0];
        if (first) delete be.routines[first.id];
        return done(undefined);
      },
      // v1.8: «Mis rutinas» (plantillas), asignar (copias independientes), rutinas de un asesorado, mostrar/ocultar y «Rutina de hoy».
      async listTemplates() {
        const u = await asCoach();
        return Object.values(be.templates).filter((t) => t.coachId === u.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).map(routineOut);
      },
      async saveTemplate(id, routine) {
        const u = await asCoach();
        const c = clean(routine);
        checkGifs(u.id, c.days);
        const now = iso(be.clock.now());
        let t;
        if (!id) {
          if (Object.values(be.templates).filter((x) => x.coachId === u.id).length >= rutinas().LIMITS.templates) invalid('template_limit');
          const nid = randUUID();
          t = be.templates[nid] = { id: nid, coachId: u.id, ...c, createdAt: now, updatedAt: now };
        } else {
          t = be.templates[id];
          if (!t || t.coachId !== u.id) fail('not_found', 'Rutina no encontrada');
          Object.assign(t, c, { updatedAt: now });
        }
        return done(routineOut(t));
      },
      async deleteTemplate(id) {
        const u = await asCoach({ agreement: false });
        if (be.templates[id] && be.templates[id].coachId === u.id) delete be.templates[id];
        return done(undefined);
      },
      async assignTemplate(templateId, clientIds) {
        const u = await asCoach();
        const t = be.templates[templateId];
        if (!t || t.coachId !== u.id) fail('not_found', 'Rutina no encontrada');
        const ids = [...new Set(Array.isArray(clientIds) ? clientIds : [])].sort();
        if (!ids.length || ids.length > rutinas().LIMITS.assignAtOnce) invalid('elige entre 1 y 100 asesorados');
        for (const c of ids) {
          activeLinkCoachOnly(u.id, c);
          if (Object.values(be.routines).filter((r) => r.coachId === u.id && r.clientId === c).length >= rutinas().LIMITS.perClient) invalid('routine_limit');
        }
        const now = iso(be.clock.now());
        const out = ids.map((c) => { const id = randUUID(); be.routines[id] = { id, coachId: u.id, clientId: c, title: t.title, days: clone(t.days), visible: true, createdAt: now, updatedAt: now }; return routineOut(be.routines[id]); });
        return done(out);
      },
      async listClientRoutines(clientId) {
        const u = await asCoach();
        activeLinkCoachOnly(u.id, clientId);
        return routineList((r) => r.coachId === u.id && r.clientId === clientId);
      },
      async saveClientRoutine(clientId, id, routine) {
        const u = await asCoach();
        activeLinkCoachOnly(u.id, clientId);
        const c = clean(routine);
        checkGifs(u.id, c.days);
        const now = iso(be.clock.now());
        let r;
        if (!id) {
          if (Object.values(be.routines).filter((x) => x.coachId === u.id && x.clientId === clientId).length >= rutinas().LIMITS.perClient) invalid('routine_limit');
          const nid = randUUID();
          r = be.routines[nid] = { id: nid, coachId: u.id, clientId, ...c, visible: true, createdAt: now, updatedAt: now };
        } else {
          r = be.routines[id];
          if (!r || r.coachId !== u.id || r.clientId !== clientId) fail('not_found', 'Rutina no encontrada');
          Object.assign(r, c, { updatedAt: now });
        }
        return done(routineOut(r));
      },
      async deleteClientRoutine(id) {
        const u = await asCoach({ agreement: false });
        if (be.routines[id] && be.routines[id].coachId === u.id) delete be.routines[id];
        return done(undefined);
      },
      async setRoutineVisible(id, visible) {
        const u = await asCoach({ agreement: !!visible });   // ocultar reduce acceso: no exige acuerdo
        const r = be.routines[id];
        if (!r || r.coachId !== u.id) fail('not_found', 'Rutina no encontrada');
        if (visible) activeLinkCoachOnly(u.id, r.clientId);
        r.visible = !!visible;
        return done(routineOut(r));
      },
      async publishDaily(templateId, day) {
        const u = await asCoach();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day)) || Number.isNaN(Date.parse(day + 'T00:00:00Z'))) invalid('bad_day');
        const diff = (Date.parse(day + 'T00:00:00Z') - Date.parse(be.todayBogota() + 'T00:00:00Z')) / 86400000;
        if (diff < -2 || diff > 2) invalid('bad_day');
        const t = be.templates[templateId];
        if (!t || t.coachId !== u.id) fail('not_found', 'Rutina no encontrada');
        be.daily[u.id] = { coachId: u.id, templateId: t.id, title: t.title, days: clone(t.days), day: String(day), publishedAt: iso(be.clock.now()) };
        return done(dailyOut(be.daily[u.id]));
      },
      async getDaily() {
        const u = await asCoach();
        return be.daily[u.id] ? dailyOut(be.daily[u.id]) : null;
      },
      async clearDaily() {
        const u = await asCoach({ agreement: false });
        delete be.daily[u.id];
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
      // v1.12: marcar como revisado el aviso de dolor (solo su coach con vínculo activo).
      async reviewPain(clientId) {
        const u = await asCoach();
        activeLinkCoachOnly(u.id, clientId);
        const now = iso(be.clock.now());
        for (const x of Object.values(be.painReports)) if (x.userId === clientId && x.pain && !x.reviewedAt && !x.pausePrivate) x.reviewedAt = now;
        return done({ painReported: be.painFlag(clientId) });
      },
      // v1.11 (L5): la meta de proteína la escribe el coach (20–400 g; null la quita). La app nunca la calcula.
      async setProteinGoal(clientId, grams) {
        const u = await asCoach();
        activeLinkCoachOnly(u.id, clientId);
        const g = grams == null ? null : Number(grams);
        if (g != null && !(Number.isInteger(g) && g >= 20 && g <= 400)) invalid('la meta va de 20 a 400 g');
        const l = be.links.find((x) => x.coachId === u.id && x.clientId === clientId && x.status === 'active');
        l.proteinGoal = g;
        l.updatedAt = iso(be.clock.now());
        return done({ proteinGoal: g });
      },
      // v1.11: retos (mismas reglas que grasa.create_challenge, list_challenges y delete_challenge).
      async createChallenge({ id, title, habit, target, start, end, clients } = {}) {
        const u = await asCoach();
        const today = be.todayBogota();
        const t = String(title || '').trim(), n = Number(target), s = String(start || ''), e = String(end || '');
        const span = /^\d{4}-\d{2}-\d{2}$/.test(s) && /^\d{4}-\d{2}-\d{2}$/.test(e) ? Math.round((Date.parse(e + 'T00:00:00Z') - Date.parse(s + 'T00:00:00Z')) / 86400000) : -1;
        if (t.length < 3 || t.length > 60 || !HABITS.includes(habit) || !Number.isInteger(n) || span < 0 || span > 30 || n < 1 || n > span + 1 || s < addDay(today, -7) || s > addDay(today, 60)) invalid('reto no válido');
        const ids = [...new Set(Array.isArray(clients) ? clients : [])];
        if (!ids.length || ids.length > 100) invalid('elige entre 1 y 100 asesorados');
        if (Object.values(be.challenges).filter((c) => c.coachId === u.id && !c.deletedAt && c.end >= today).length >= 20) invalid('challenge_limit');
        for (const c of ids) if (!be.links.some((x) => x.coachId === u.id && x.clientId === c && x.status === 'active')) fail('forbidden', 'Sin vínculo activo con ese cliente');
        const cid = id || randUUID();
        if (be.challenges[cid]) invalid('reto repetido');
        be.challenges[cid] = { id: cid, coachId: u.id, title: t, habit, target: n, start: s, end: e, createdAt: iso(be.clock.now()), deletedAt: null, members: ids, marks: {} };
        return done(challengeOut(be.challenges[cid], null));
      },
      async listChallenges() {
        const u = await asCoach();
        const from = addDay(be.todayBogota(), -30);
        return Object.values(be.challenges).filter((ch) => ch.coachId === u.id && !ch.deletedAt && ch.end >= from)
          .sort((a, b) => b.start.localeCompare(a.start) || b.createdAt.localeCompare(a.createdAt)).map((ch) => challengeOut(ch, null));
      },
      async deleteChallenge(id) {
        const u = await asCoach({ agreement: false });
        const ch = be.challenges[id];
        if (!ch || ch.coachId !== u.id) fail('not_found', 'Reto no encontrado');
        ch.deletedAt = ch.deletedAt || iso(be.clock.now());
        return done(undefined);
      },
      async endClient(clientId) {
        const u = await asCoach({ agreement: false });
        const l = activeLinkCoach(u.id, clientId);
        l.status = 'ended';
        l.endedAt = iso(be.clock.now());
        return done(undefined);
      },
      // ---------- r1 v1.13 ----------
      async setGoals(clientId, goals) {
        const u = await asCoach();
        activeLinkCoachOnly(u.id, clientId);
        const g = goals && typeof goals === 'object' ? goals : {};
        const out = {};
        for (const [k, v] of Object.entries(g)) {
          const f = GOAL_RANGES[k];
          if (!f) invalid('meta desconocida: ' + k);
          if (v == null) continue;
          if (typeof v !== 'number' || !Number.isFinite(v)) invalid('la meta debe ser un número');
          const val = f.dec ? Math.round(v * 10) / 10 : Math.round(v);
          if (val < f.min || val > f.max) invalid('meta fuera de rango');
          out[k] = val;
        }
        const l = be.links.find((x) => x.coachId === u.id && x.clientId === clientId && x.status === 'active');
        l.proteinGoal = out.protein_g == null ? null : out.protein_g;
        delete out.protein_g;
        l.goals = out;
        l.updatedAt = iso(be.clock.now());
        return done({ goals: goalsOf(l) });
      },
      // Cifras por asesorado vinculado y activo (como grasa.coach_analytics): sin pause_private, respetando lo que comparte; hábitos null si no los comparte.
      async analytics(from, to) {
        const u = await asCoach();
        if (!be.coaches[u.id] || be.coaches[u.id].active === false) fail('forbidden', 'Coach suspendido');
        const today = be.todayBogota(), F = String(from), T = String(to);
        const span = Math.round((Date.parse(T) - Date.parse(F)) / 86400000);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(F) || !/^\d{4}-\d{2}-\d{2}$/.test(T) || span < 0 || span > 92 || T > addDay(today, 2) || F < addDay(today, -400)) invalid('rango de fechas no válido');
        const links = be.links.filter((l) => l.coachId === u.id && l.status === 'active' && be.hasConsent(l.clientId, 'sensitive_health') && be.hasConsent(l.clientId, 'cloud_transfer'))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        const numOf = (d, k) => (d && typeof d[k] === 'number' && Number.isFinite(d[k]) ? d[k] : null);
        return links.map((l) => {
          const rec = Object.values(be.records).filter((r) => r.userId === l.clientId && !r.pausePrivate && !r.deletedAt
            && (r.kind === 'entry' || (r.kind === 'food' && l.shares.nutrition) || (r.kind === 'habit' && l.shares.habits)))
            .map((r) => ({ kind: r.kind, d: r.date || (/^\d{4}-\d{2}-\d{2}$/.test(r.nkey) ? r.nkey : null), data: r.data || {} })).filter((x) => x.d);
          const uniq = (xs) => [...new Set(xs)].sort();
          const inR = (x) => x.d >= F && x.d <= T;
          const ws = rec.filter((x) => x.kind === 'entry' && numOf(x.data, 'weight') != null && x.d <= T).sort((a, b) => a.d.localeCompare(b.d));
          const wa = rec.filter((x) => x.kind === 'entry' && numOf(x.data, 'waist') != null && x.d <= T).sort((a, b) => a.d.localeCompare(b.d));
          const weeks = {};
          for (const x of ws) { const k = Math.floor(Math.round((Date.parse(T) - Date.parse(x.d)) / 86400000) / 7); if (k < 6) (weeks[k] ||= []).push(numOf(x.data, 'weight')); }
          return { clientId: l.clientId, sharesHabits: !!l.shares.habits, sharesNutrition: !!l.shares.nutrition, since: new Date(Date.parse(l.createdAt) - 5 * 3600000).toISOString().slice(0, 10),
            logDays: uniq(rec.filter((x) => inR(x) && (x.kind !== 'habit' || Object.keys(x.data).length)).map((x) => x.d)),
            trainedDays: l.shares.habits ? uniq(rec.filter((x) => inR(x) && x.kind === 'habit' && x.data.trained === true).map((x) => x.d)) : null,
            weightWeeks: Object.keys(weeks).map(Number).sort((a, b) => a - b).map((k) => ({ w: k, kg: Math.round((weeks[k].reduce((a, b) => a + b, 0) / weeks[k].length) * 100) / 100 })),
            weightFirst: ws.length ? numOf(ws[0].data, 'weight') : null, weightLast: ws.length ? numOf(ws[ws.length - 1].data, 'weight') : null,
            waistFirst: wa.length ? numOf(wa[0].data, 'waist') : null, waistLast: wa.length ? numOf(wa[wa.length - 1].data, 'waist') : null };
        });
      },
      async panelOpened(day) {
        const u = await authed();
        if (!be.coaches[u.id]) fail('forbidden', 'No eres coach');
        const today = be.todayBogota(), d = String(day);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d < addDay(today, -1) || d > addDay(today, 1)) invalid('día no válido');
        const list = new Set(be.panelDays[u.id] || []);
        list.add(d);
        be.panelDays[u.id] = [...list].filter((x) => x >= addDay(today, -120)).sort();
        return done(undefined);
      },
      async notices(day) {
        const u = await authed();
        if (!be.coaches[u.id] || be.coaches[u.id].active === false) fail('forbidden', 'Solo coaches activos');
        const today = be.todayBogota(), d = String(day);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d < addDay(today, -1) || d > addDay(today, 1)) invalid('día no válido');
        return Object.values(be.notices).filter((n) => !n.deletedAt && n.startsOn <= d && n.endsOn >= d)
          .sort((a, b) => b.startsOn.localeCompare(a.startsOn) || b.createdAt.localeCompare(a.createdAt)).slice(0, 3).map(noticeOut);
      },
      // r1 v1.14 (M6) como grasa.log_export: acuerdo con la cláusula 14 (0.5-A7-coach), casilla marcada, cuántos (≤ vinculados visibles), categorías y rango.
      async logExport({ clients, categories, from, to, custody } = {}) {
        const u = await asCoach();
        if (!be.coaches[u.id] || be.coaches[u.id].active === false) fail('forbidden', 'Coach suspendido');
        const ver = be.agreementVersion(u.id);
        if (!EXPORT_AGREEMENT_VERSIONS.includes(ver)) { const e = new RemoteError('export_agreement_required', 'Falta aceptar la versión del Acuerdo del coach con la cláusula de descarga'); e.detail = 'export_agreement_required'; throw e; }
        if (custody !== true) invalid('custody_required');
        const cats = [...new Set(Array.isArray(categories) ? categories.map(String) : [])].sort();
        if (!cats.length || cats.some((c) => !['medidas', 'comidas', 'habitos', 'entrenos'].includes(c))) invalid('categoría no válida');
        const today = be.todayBogota(), F = String(from), T = String(to);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(F) || !/^\d{4}-\d{2}-\d{2}$/.test(T) || F > T || T > addDay(today, 1) || F < addDay(today, -3660)) invalid('rango de fechas no válido');
        const n = be.links.filter((l) => l.coachId === u.id && l.status === 'active' && be.hasConsent(l.clientId, 'sensitive_health') && be.hasConsent(l.clientId, 'cloud_transfer')).length;
        const k = Number(clients);
        if (!Number.isInteger(k) || k < 1 || k > n) invalid('número de asesorados no válido');
        const nowMs = be.clock.now();
        if (be.exports.filter((x) => x.coachId === u.id && Date.parse(x.createdAt) > nowMs - 86400000).length >= 60) fail('rate_limited', 'Demasiadas exportaciones hoy');
        const x = { id: randUUID(), coachId: u.id, createdAt: iso(nowMs), clients: k, categories: cats, from: F, to: T, custody: true, agreementVersion: ver };
        be.exports.push(x);
        return done(exportOut(x));
      },
      async exports() {
        const u = await authed();
        if (!be.coaches[u.id]) fail('forbidden', 'No eres coach');
        return be.exports.filter((x) => x.coachId === u.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50).map(exportOut);
      },
      // v1.15 (como grasa.coach_points): puntos (si comparte hábitos Y comidas) y hábitos cumplidos (si comparte hábitos) de SUS asesorados; si no, null.
      async points(from, to) {
        const u = await asCoach();
        if (!be.coaches[u.id] || be.coaches[u.id].active === false) fail('forbidden', 'Coach suspendido');
        const today = be.todayBogota(), F = String(from), T = String(to);
        const span = Math.round((Date.parse(T) - Date.parse(F)) / 86400000);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(F) || !/^\d{4}-\d{2}-\d{2}$/.test(T) || span < 0 || span > 92 || T > addDay(today, 2) || F < addDay(today, -400)) invalid('rango de fechas no válido');
        const P = puntos();
        return be.links.filter((l) => l.coachId === u.id && l.status === 'active' && be.hasConsent(l.clientId, 'sensitive_health') && be.hasConsent(l.clientId, 'cloud_transfer'))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((l) => ({ clientId: l.clientId,
            points: l.shares.habits && l.shares.nutrition ? (be.points[l.clientId] || []).filter((r) => r.day >= F && r.day <= T).reduce((s, r) => s + r.points, 0) : null,
            habitsMet: l.shares.habits ? Object.values(be.records).filter((r) => r.userId === l.clientId && r.kind === 'habit' && !r.deletedAt && !r.pausePrivate && r.date >= F && r.date <= T && !P.habitRare(r.data || {}))
              .reduce((s, r) => { const h = r.data || {}; return s + ((h.water || 0) >= 2) + ((h.steps || 0) >= 8000) + ((h.sleep || 0) >= 7 && (h.sleep || 0) <= 10); }, 0) : null }));
      },
      // r1 v1.16: SOLO si la liga está habilitada para su team y cuántos participan (con menos de 5, ni el número). Nunca alias ni personas.
      async liga() {
        const u = await asCoach();
        if (be.coaches[u.id].active === false) fail('forbidden', 'Coach suspendido');
        const ok = be.ligaCoachOk(u.id), n = ok ? be.links.filter((k) => k.coachId === u.id && be.ligaActive(k)).length : 0;
        return { enabled: ok, min: 5, published: n >= 5, participants: n >= 5 ? n : null };
      },
      async teamGoal() {
        const u = await asCoach();
        if (be.coaches[u.id].active === false) fail('forbidden', 'Coach suspendido');
        return be.teamGoalOut(u.id);
      },
      async setTeamGoal(metric, target) {
        const u = await asCoach();
        if (be.coaches[u.id].active === false) fail('forbidden', 'Coach suspendido');
        const n = Number(target);
        if (!['entrenos', 'puntos'].includes(metric)) invalid('meta: entrenos o puntos');
        if (!Number.isInteger(n) || n < 1 || n > (metric === 'entrenos' ? 2000 : 20000)) invalid('número de la meta fuera de rango');
        const wk = puntos().monday(be.todayBogota());
        const k = `${u.id}|${wk}`;
        be.teamGoals[k] = { coachId: u.id, weekStart: wk, metric, target: n, createdAt: (be.teamGoals[k] || {}).createdAt || iso(be.clock.now()) };
        return done(be.teamGoalOut(u.id));
      },
      async deleteTeamGoal() {
        const u = await authed();
        if (!be.coaches[u.id]) fail('forbidden', 'No eres coach');
        delete be.teamGoals[`${u.id}|${puntos().monday(be.todayBogota())}`];
        return done(undefined);
      },
    };
    const EXPORT_AGREEMENT_VERSIONS = ['0.5-A7-coach', '0.6-A7-coach'];
    const exportOut = (x) => ({ id: x.id, createdAt: x.createdAt, clients: x.clients, categories: x.categories.slice(), from: x.from, to: x.to });
    const GOAL_RANGES = { weight_kg: { min: 30, max: 300, dec: 1 }, waist_cm: { min: 40, max: 200, dec: 1 }, protein_g: { min: 20, max: 400, dec: 0 },
      water_days: { min: 1, max: 7, dec: 0 }, steps_days: { min: 1, max: 7, dec: 0 }, sleep_days: { min: 1, max: 7, dec: 0 }, trained_days: { min: 1, max: 7, dec: 0 } };
    const noticeOut = (n) => ({ id: n.id, title: n.title, body: n.body, startsOn: n.startsOn, endsOn: n.endsOn, createdAt: n.createdAt });

    // ---------- r1 v1.13: panel admin (solo con el rol 'admin', que se da a mano). Solo cantidades: nunca salud ni asesorados. ----------
    async function asAdmin() {
      const u = await authed();
      if (!be.roles(u.id, app).includes('admin')) fail('forbidden', 'Solo el admin');
      return u;
    }
    const monthOf = (m) => { const s = String(m || ''); if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) invalid('mes no válido'); return s.slice(0, 7) + '-01'; };
    const nextMonth = (m0) => { let y = Number(m0.slice(0, 4)), mm = Number(m0.slice(5, 7)) + 1; if (mm === 13) { mm = 1; y++; } return `${y}-${String(mm).padStart(2, '0')}-01`; };
    const monthRef = (m0) => { const end = addDay(nextMonth(m0), -1), t = be.todayBogota(); return end < t ? end : t; };
    const bogDay = (isoTs) => new Date(Date.parse(isoTs) - 5 * 3600000).toISOString().slice(0, 10);
    // MISMA regla que grasa.billing_active_clients: vínculo activo y ≥ 1 registro sincronizado en los 30 días previos al cierre del mes.
    function clientActive(coachId, clientId, m0) {
      const end = Date.parse(nextMonth(m0) + 'T00:00:00Z'), start = end - 30 * 86400000;
      return be.links.some((l) => l.coachId === coachId && l.clientId === clientId && l.status === 'active')
        && Object.values(be.records).some((r) => r.userId === clientId && Date.parse(r.serverUpdatedAt) >= start && Date.parse(r.serverUpdatedAt) < end);
    }
    const activeCount = (coachId, m0) => new Set(be.links.filter((l) => l.coachId === coachId && l.status === 'active' && clientActive(coachId, l.clientId, m0)).map((l) => l.clientId)).size;
    const cohort30 = (links, ref) => { const c = links.filter((l) => { const d = bogDay(l.createdAt); return d >= addDay(ref, -60) && d < addDay(ref, -30); }); return { cohort: c.length, kept: c.filter((l) => l.status === 'active').length }; };
    const admin = {
      async coaches(month) {
        await asAdmin();
        const m0 = monthOf(month);
        return Object.entries(be.coaches).map(([id, c]) => {
          const act = activeCount(id, m0);
          const ev = be.coachEvents.filter((e) => e.coachId === id).pop();
          return { coachId: id, businessName: c.businessName, coachName: (be.profiles[id] || {}).displayName || '', active: c.active !== false, freeClients: c.freeClients,
            activeClients: act, overFree: Math.max(0, act - c.freeClients), linkedClients: be.links.filter((l) => l.coachId === id && l.status === 'active').length,
            createdAt: c.createdAt || null, lastReason: (ev && ev.reason) || '' };
        }).sort((a, b) => (b.active - a.active) || a.businessName.localeCompare(b.businessName));
      },
      async setCoachActive(coachId, active, reason) {
        await asAdmin();
        const c = be.coaches[coachId];
        if (!c) fail('not_found', 'Coach no encontrado');
        const r = String(reason || '').trim();
        if (r.length > 200) invalid('motivo demasiado largo');
        c.active = !!active;
        be.coachEvents.push({ coachId, active: !!active, reason: r || null, at: iso(be.clock.now()) });
        return done({ coachId, active: !!active });
      },
      async usage(month) {
        await asAdmin();
        const m0 = monthOf(month), m1 = nextMonth(m0), ref = monthRef(m0);
        const inMonth = (ts) => ts && bogDay(ts) >= m0 && bogDay(ts) < m1;
        const ids = Object.keys(be.coaches);
        const sizes = ids.filter((id) => be.coaches[id].active !== false).map((id) => activeCount(id, m0));
        const activeClients = new Set(be.links.filter((l) => l.status === 'active').map((l) => l.clientId));
        const weeks = [];
        for (let k = 7; k >= 0; k--) {
          const a = addDay(ref, -7 * k - 6), b = addDay(ref, -7 * k);
          weeks.push({ start: a, records: Object.values(be.records).filter((r) => ['entry', 'food', 'habit'].includes(r.kind) && !r.deletedAt && r.date && r.date >= a && r.date <= b && activeClients.has(r.userId)).length });
        }
        return { coachesActive: ids.filter((id) => be.coaches[id].active !== false).length, coachesTotal: ids.length, coachesNew: ids.filter((id) => inMonth(be.coaches[id].createdAt)).length,
          clientsActive: sizes.reduce((s, x) => s + x, 0), signups: be.links.filter((l) => inMonth(l.createdAt)).length, drops: be.links.filter((l) => inMonth(l.endedAt)).length,
          retention30: cohort30(be.links, ref), sizes: { s1_5: sizes.filter((n) => n >= 1 && n <= 5).length, s6_10: sizes.filter((n) => n >= 6 && n <= 10).length, s11: sizes.filter((n) => n >= 11).length },
          weeks, ref };
      },
      async coachUsage(coachId, month) {
        await asAdmin();
        if (!be.coaches[coachId]) fail('not_found', 'Coach no encontrado');
        const m0 = monthOf(month), ref = monthRef(m0);
        const lk = be.links.filter((l) => l.coachId === coachId && l.status === 'active');
        const weeks = [];
        for (let k = 7; k >= 0; k--) {
          const a = addDay(ref, -7 * k - 6), b = addDay(ref, -7 * k);
          const base = lk.filter((l) => bogDay(l.createdAt) <= b);
          const recs = (l, pred) => Object.values(be.records).some((r) => r.userId === l.clientId && !r.deletedAt && !r.pausePrivate && r.date && r.date >= a && r.date <= b && pred(r));
          const sh = lk.filter((l) => l.shares.habits);
          weeks.push({ start: a,
            pctLogging: base.length >= 3 ? Math.round((100 * base.filter((l) => recs(l, (r) => ['entry', 'food', 'habit'].includes(r.kind))).length) / base.length) : null,
            trained: sh.length >= 3 ? Object.values(be.records).filter((r) => r.kind === 'habit' && !r.deletedAt && !r.pausePrivate && r.date >= a && r.date <= b && r.data && r.data.trained === true && sh.some((l) => l.clientId === r.userId)).length : null });
        }
        const stamps = [...Object.values(be.comments).filter((c) => c.coachId === coachId).map((c) => c.createdAt), ...be.links.filter((l) => l.coachId === coachId).map((l) => l.paidMarkedAt),
          ...Object.values(be.templates).filter((t) => t.coachId === coachId).map((t) => t.updatedAt), ...Object.values(be.routines).filter((t) => t.coachId === coachId).map((t) => t.updatedAt),
          ...Object.values(be.challenges).filter((t) => t.coachId === coachId).map((t) => t.createdAt)].filter(Boolean).sort();
        const pd = (be.panelDays[coachId] || []).slice().sort();
        return { activeClients: activeCount(coachId, m0), retention30: cohort30(be.links.filter((l) => l.coachId === coachId), ref), lastActionAt: stamps.length ? stamps[stamps.length - 1] : null,
          lastPanelDay: pd.length ? pd[pd.length - 1] : null, panelDays: pd.filter((d) => d >= addDay(ref, -6) && d <= ref), weeks, ref,
          exports: be.exports.filter((x) => x.coachId === coachId && bogDay(x.createdAt) >= m0 && bogDay(x.createdAt) < nextMonth(m0)).length };   // v1.14: solo la cantidad
      },
      // «Coaches con mayor éxito»: solo negocio y adherencia (concepto 5, punto 6). Nunca kilos ni centímetros.
      async success(month) {
        await asAdmin();
        const ref = monthRef(monthOf(month)), today = be.todayBogota();
        const okDay = (d) => (Number(d.water) || 0) >= 2 || (Number(d.steps) || 0) >= 8000 || (Number(d.sleep) || 0) >= 7 || d.trained === true;
        return Object.entries(be.coaches).map(([id, c]) => {
          const lk = be.links.filter((l) => l.coachId === id && l.status === 'active');
          const hab = lk.filter((l) => l.shares.habits).map((l) => new Set(Object.values(be.records).filter((r) => r.userId === l.clientId && r.kind === 'habit' && !r.deletedAt && !r.pausePrivate
            && r.date >= addDay(ref, -6) && r.date <= ref && okDay(r.data || {})).map((r) => r.date)).size);
          const all = be.links.filter((l) => l.coachId === id);
          const coh = (a, b) => all.filter((l) => { const d = bogDay(l.createdAt); return d >= addDay(ref, -a) && d <= addDay(ref, -b); });
          const c90 = coh(180, 90), c180 = coh(365, 181);
          const pctOf = (k, n) => (n ? Math.round((100 * k) / n) : null);
          return { coachId: id, businessName: c.businessName, habitsPct: hab.length >= 3 ? pctOf(hab.filter((n) => n >= 4).length, hab.length) : null, habitsGroup: hab.length,
            retention90: pctOf(c90.filter((l) => l.status === 'active').length, c90.length), cohort90: c90.length, retention180: pctOf(c180.filter((l) => l.status === 'active').length, c180.length), cohort180: c180.length,
            onTimePct: pctOf(lk.filter((l) => l.paidUntil && l.paidUntil >= today).length, lk.length), payingGroup: lk.length };
        }).sort((a, b) => a.businessName.localeCompare(b.businessName));
      },
      async saveNotice({ id = null, title, body, from, to } = {}) {
        await asAdmin();
        const t = String(title || '').trim(), b = String(body || '').trim(), F = String(from || ''), T = String(to || '');
        const ok = /^\d{4}-\d{2}-\d{2}$/;
        if (t.length < 3 || t.length > 80 || b.length < 3 || b.length > 400 || !ok.test(F) || !ok.test(T) || F > T || (Date.parse(T) - Date.parse(F)) / 86400000 > 90 || T < addDay(be.todayBogota(), -1)) invalid('aviso no válido');
        let n;
        if (id) { n = be.notices[id]; if (!n || n.deletedAt) fail('not_found', 'Aviso no encontrado'); Object.assign(n, { title: t, body: b, startsOn: F, endsOn: T }); }
        else { n = { id: randUUID(), title: t, body: b, startsOn: F, endsOn: T, createdAt: iso(be.clock.now()), deletedAt: null }; be.notices[n.id] = n; }
        return done(noticeOut(n));
      },
      async listNotices() {
        await asAdmin();
        return Object.values(be.notices).filter((n) => !n.deletedAt).sort((a, b) => b.startsOn.localeCompare(a.startsOn) || b.createdAt.localeCompare(a.createdAt)).slice(0, 50).map(noticeOut);
      },
      async deleteNotice(id) {
        await asAdmin();
        const n = be.notices[id];
        if (!n || n.deletedAt) fail('not_found', 'Aviso no encontrado');
        n.deletedAt = iso(be.clock.now());
        return done(undefined);
      },
    };

    return { kind: 'fake', backend: be, auth, account, sync, client, coach, admin };
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

  const api = { LIGA_ALIASES, FakeBackend, FakeClock, createFake, persistentBackend, RemoteError, PERSIST_KEY, SESSION_KEY, CODE_ALPHABET };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RemoteFake = api;
})(typeof window !== 'undefined' ? window : globalThis);
