// Sincronización local-first de R1 (contrato equipo/r1-contrato.md §3.3 y §5). Script clásico UMD como schema.js.
// - Parte PURA (probada en Node): convertir estado ↔ registros de la frontera, planificar qué subir, aplicar lo
//   recibido con Schema.mergeState (LWW por registro, claves naturales, reloj acotado), fotos, reintentos.
// - ORQUESTADOR `createSync({ remote, store })`: un ciclo push → pull → saveMerged. No conoce app.js ni supabase-js:
//   recibe `remote` con la interfaz del contrato (remote.sync.push/pull/uploadPhoto) y un `store` que adapta la app.
(function (root) {
  'use strict';

  const Schema = typeof module !== 'undefined' && module.exports ? require('./schema.js') : root.Schema;
  const EPOCH = Schema.EPOCH;
  const CURSOR0 = '1970-01-01T00:00:00.000Z';
  const BATCH = 500;                                   // máx. por llamada a push (contrato §2.3)
  const BACKOFF_MS = [5000, 30000, 120000, 600000];    // §5.5: 5 s, 30 s, 2 min, 10 min (máx.)
  const MAX_PULL_PAGES = 50;

  const ms = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? t : 0; };
  const without = (o, keys) => { const out = {}; for (const k of Object.keys(o)) if (!keys.includes(k)) out[k] = o[k]; return out; };

  // ---------- Estado ↔ frontera ----------
  // Frontera (contrato §3.3): { id, kind, nkey, date, data, updatedAt, deletedAt }. `data` = el registro sin
  // id/updatedAt/deletedAt; las lápidas van con data = {}. El perfil no tiene id local: se usa el id del usuario
  // (estable); el servidor conserva el suyo por clave natural.
  function toWire(state, { userId } = {}) {
    const recs = Schema.toRecords(state);
    const out = [];
    const strip = (r) => without(r, ['id', 'updatedAt', 'deletedAt']);
    const one = (kind, nkey, date, r) => {
      const dead = r.deletedAt !== undefined && r.deletedAt !== null;
      out.push({ id: r.id, kind, nkey, date: date || null, data: dead ? {} : strip(r),
                 updatedAt: r.updatedAt || EPOCH, deletedAt: dead ? r.deletedAt : null });
    };
    for (const r of recs.entries) one('entry', r.date, r.date, r);
    for (const r of recs.foods) one('food', r.id, r.date, r);
    for (const r of recs.habits) one('habit', r.date, r.date, r);
    for (const r of recs.library) one('library', r.key, null, r);
    if (state.profile && userId) {
      out.push({ id: userId, kind: 'profile', nkey: 'profile', date: null, data: without(state.profile, ['updatedAt']),
                 updatedAt: state.profile.updatedAt || EPOCH, deletedAt: null });
    }
    return out;
  }

  // Registros de la frontera → listas de Schema.fromRecords + perfil. Lápidas → { id, date, deletedAt, updatedAt }.
  function fromWire(wire) {
    const recs = { entries: [], foods: [], habits: [], library: [] };
    let profile = null;
    for (const w of wire || []) {
      if (!w || typeof w !== 'object') continue;
      const dead = w.deletedAt !== undefined && w.deletedAt !== null;
      const data = w.data && typeof w.data === 'object' && !Array.isArray(w.data) ? w.data : {};
      const base = dead ? { id: w.id, date: w.date || w.nkey, deletedAt: w.deletedAt, updatedAt: w.updatedAt }
                        : { ...data, id: w.id, updatedAt: w.updatedAt };
      switch (w.kind) {
        case 'entry': recs.entries.push(dead ? base : { ...base, date: w.nkey }); break;
        case 'habit': recs.habits.push(dead ? base : { ...base, date: w.nkey }); break;
        case 'food': recs.foods.push(dead ? { ...base, date: w.date } : { ...base, date: w.date }); break;
        case 'library': if (!dead) recs.library.push({ ...base, key: w.nkey }); break;
        case 'profile': if (!dead) profile = { ...without(data, ['id']), updatedAt: w.updatedAt }; break;
        default: break;
      }
    }
    return { recs, profile };
  }

  // Una fila puede llegar repetida (solape de 30 s, `>= cursor` entre páginas, rejected + pull): se queda una por clave,
  // la de server_updated_at (o updated_at) mayor. Sin esto, normalize daría un id NUEVO a la copia duplicada.
  function dedupeWire(wire, keyOf = (w) => `${w.kind}|${w.nkey}`) {
    const out = new Map();
    const rank = (w) => [ms(w.serverUpdatedAt), ms(w.updatedAt)];
    for (const w of wire || []) {
      if (!w || typeof w !== 'object') continue;
      const k = keyOf(w), cur = out.get(k);
      if (!cur) { out.set(k, w); continue; }
      const [a1, a2] = rank(cur), [b1, b2] = rank(w);
      if (b1 > a1 || (b1 === a1 && b2 >= a2)) out.set(k, w);
    }
    return [...out.values()];
  }

  // Estado remoto como estado v4 NORMALIZADO (lo recibido es no confiable: tipos, rangos, ids, igual que un import).
  function remoteState(wire) {
    const { recs, profile } = fromWire(dedupeWire(wire));
    const raw = Schema.fromRecords({ ...Schema.emptyState(), profile }, recs);
    // Fechas como objetos por día (las espera normalize): fromRecords ya los da; se pasa por JSON para quitar prototipos.
    return Schema.normalize(JSON.parse(JSON.stringify({ ...raw, schemaVersion: Schema.CURRENT_VERSION }))).state;
  }

  // Fusión de lo recibido con lo local. Pura. El consentimiento local no se toca (mergeState no lo fusiona).
  function applyRemote(local, wire, { now = Date.now() } = {}) {
    if (!wire || !wire.length) return local;
    return Schema.mergeState(local, remoteState(wire), { now });
  }

  // Contrato v1.1 §10.6: lo que el servidor devuelve en `rejected` se ADOPTA tal cual (sin volver a decidir con newer()):
  // en un empate exacto BD (data::text) y cliente (JSON.stringify) podrían elegir distinto y no converger nunca.
  // Se reemplaza por clave natural: registro/hábito por fecha, comida por id, biblioteca por nombre, perfil entero.
  // `expect` (opcional): Map 'kind|nkey' → updatedAt que se subió. Si el registro local cambió desde entonces (el usuario
  // editó durante la red), NO se adopta: su edición es más nueva y se subirá en el siguiente ciclo.
  function adoptServer(local, wire, { userId, expect } = {}) {
    if (!wire || !wire.length) return local;
    if (expect) {
      const cur = new Map(toWire(local, { userId }).map((w) => [`${w.kind}|${w.nkey}`, w.updatedAt]));
      wire = wire.filter((w) => { const k = `${w.kind}|${w.nkey}`; return !expect.has(k) || !cur.has(k) || cur.get(k) === expect.get(k); });
      if (!wire.length) return local;
    }
    const srv = remoteState(wire);
    const a = Schema.toRecords(local), b = Schema.toRecords(srv);
    const replace = (la, lb, key) => { const ks = new Set(lb.map(key)); return [...la.filter((r) => !ks.has(key(r))), ...lb]; };
    const out = Schema.fromRecords(local, {
      entries: replace(a.entries, b.entries, (r) => r.date),
      foods: replace(a.foods, b.foods, (r) => r.id),
      habits: replace(a.habits, b.habits, (r) => r.date),
      library: replace(a.library, b.library, (r) => r.key),
    });
    if (wire.some((w) => w && w.kind === 'profile' && !w.deletedAt) && srv.profile) out.profile = srv.profile;
    return out;
  }

  // ---------- Qué subir ----------
  // `pushedUpTo`: mayor updatedAt ya confirmado por el servidor (null = nunca se subió nada → se sube todo).
  // `seen`: { 'kind|nkey' | 'photo|id': updatedAt } de lo que llegó del servidor y no se ha vuelto a tocar en local:
  // no se re-sube (evita un viaje inútil que acabaría en `rejected`).
  const seenKey = (w) => (w.kind ? `${w.kind}|${w.nkey}` : `photo|${w.id}`);
  function planPush(state, { userId, pushedUpTo = null, photos = [], seen = {} } = {}) {
    const after = (w) => (pushedUpTo === null || ms(w.updatedAt) > ms(pushedUpTo)) && seen[seenKey(w)] !== w.updatedAt;
    const records = toWire(state, { userId }).filter(after);
    const ph = photos.filter(after);
    const all = [...records, ...ph];
    const maxUpdatedAt = all.reduce((m, w) => (ms(w.updatedAt) > ms(m) ? w.updatedAt : m), pushedUpTo || EPOCH);
    return { records, photos: ph, maxUpdatedAt };
  }

  // Metadatos de fotos locales (IndexedDB) + lápidas de fotos → frontera de fotos del contrato.
  function photosToWire(localPhotos, deletedPhotos, { userId }) {
    const out = [];
    for (const p of localPhotos || []) {
      if (!p || !Schema.isUUID(p.id)) continue;
      out.push({ id: p.id, date: p.date, pose: p.pose, width: p.width || null, height: p.height || null,
                 storagePath: `${userId}/${p.id}.jpg`, sharedWithCoach: p.sharedWithCoach === true,
                 createdAt: new Date(Number.isFinite(p.createdAt) ? p.createdAt : 0).toISOString(),
                 updatedAt: p.updatedAt || EPOCH, deletedAt: null });
    }
    for (const t of deletedPhotos || []) {
      // La lápida necesita una pose válida para el CHECK del servidor: no se muestra nunca (está borrada).
      out.push({ id: t.id, date: t.date, pose: 'frente', width: null, height: null, storagePath: `${userId}/${t.id}.jpg`,
                 sharedWithCoach: false, createdAt: t.deletedAt, updatedAt: t.updatedAt, deletedAt: t.deletedAt });
    }
    return out;
  }

  // Fotos recibidas frente a las locales: qué metadatos guardar/actualizar y qué borrar (LWW por updatedAt).
  // `adopt: true` (fotos en `rejected`): se adopta la del servidor sin comparar (§10.6).
  function planPhotos(localPhotos, remotePhotos, { adopt = false } = {}) {
    const local = new Map((localPhotos || []).map((p) => [p.id, p]));
    const upserts = [], deletes = [];
    for (const r of remotePhotos || []) {
      const l = local.get(r.id);
      if (!adopt && l && ms(l.updatedAt) >= ms(r.updatedAt)) continue;
      if (r.deletedAt) { if (l) deletes.push({ id: r.id, date: r.date, deletedAt: r.deletedAt, updatedAt: r.updatedAt }); }
      else upserts.push(r);
    }
    return { upserts, deletes };
  }

  // ---------- Reintentos y dueño ----------
  const nextDelay = (failures) => BACKOFF_MS[Math.min(Math.max(failures, 1), BACKOFF_MS.length) - 1];

  // §5.6: ¿de quién son los datos locales? 'adopt' (primera vinculación: copia y adopta), 'ok', 'conflict' (otra cuenta).
  function ownerCheck(owner, userId, hasLocalData) {
    if (!owner) return hasLocalData ? 'adopt' : 'ok';
    return owner === userId ? 'ok' : 'conflict';
  }

  const isRetryable = (err) => !!(err && (err.retryable || err.code === 'offline' || err.code === 'server'));

  // ---------- Orquestador ----------
  // store: {
  //   getState(), saveMerged(state)        ← guarda SIN stampChanges (no re-sella updatedAt; §5.3 regla crítica)
  //   getMeta(), setMeta(meta)              ← { userId, deviceId, cursor, pushedUpTo, lastOkAt, lastError }
  //   cloudAllowed?()                       ← false si la persona no autorizó la copia en la nube (A3+A4): no se sincroniza
  //   healthAllowed()                       ← false si el bloqueo de salud (healthPart) impide escribir: no se sincroniza
  //   ownerId()                             ← userId dueño de los datos locales; si no coincide con la sesión, no se sincroniza
  //   photosCloudAllowed?()                 ← autorización "copia de fotos en la nube"
  //   photos?: { list(), getBlob(id), applyRemote({ upserts, deletes }) }
  //   saveComments?(comments)
  // }
  // remote: { sync: { push({records, photos}), pull(since), uploadPhoto(id, blob) } } (contrato §3.3)
  function createSync({ remote, store, now = () => Date.now(), onStatus = () => {} }) {
    let running = null;
    let failures = 0;
    let status = { state: 'idle', lastOkAt: (store.getMeta() || {}).lastOkAt || null, lastError: null, nextRetryAt: null };
    const setStatus = (s) => { status = { ...status, ...s }; onStatus(status); };

    async function cycle() {
      const meta0 = store.getMeta() || {};
      if (!meta0.userId) throw Object.assign(new Error('Sin sesión'), { code: 'auth' });
      // Sprint 6 (A3/A4): sin la autorización de la copia en la nube NO se sube ni se baja nada (modo local).
      if (typeof store.cloudAllowed === 'function' && !store.cloudAllowed()) return { nocloud: true };
      if (!store.healthAllowed()) return { blocked: true };
      // Dueño de los datos locales (QA S3-2 O1): NUNCA se suben datos que no sean de la cuenta en sesión. Sin dueño
      // confirmado ('unconfirmed') o con otro dueño ('conflict') no se sincroniza hasta que el usuario decida en la UI.
      const owner = typeof store.ownerId === 'function' ? store.ownerId() : null;
      if (owner !== meta0.userId) return { owner: owner ? 'conflict' : 'unconfirmed' };
      const meta = { cursor: CURSOR0, pushedUpTo: null, ...meta0 };
      const userId = meta.userId;
      const cloud = !!(store.photosCloudAllowed && store.photosCloudAllowed() && store.photos);

      // 1. Push (lotes de ≤ 500). Lo rechazado (el servidor tenía algo más nuevo) se fusiona como si viniera del pull.
      let state = store.getState();
      const localPhotos = cloud ? await store.photos.list() : [];
      const photoWire = cloud ? photosToWire(localPhotos, state.deleted && state.deleted.photos, { userId }) : [];
      const seen = { ...(meta.seen || {}) };
      const plan = planPush(state, { userId, pushedUpTo: meta.pushedUpTo, photos: photoWire, seen });
      const rejected = { records: [], photos: [] };
      for (const p of plan.photos) {
        if (!p.deletedAt && store.photos.getBlob) {
          const blob = await store.photos.getBlob(p.id);
          if (blob) await remote.sync.uploadPhoto(p.id, blob);   // fichero primero, metadatos después (idempotente)
        }
      }
      const items = [...plan.records.map((r) => ['r', r]), ...plan.photos.map((p) => ['p', p])];
      for (let i = 0; i < items.length; i += BATCH) {
        const chunk = items.slice(i, i + BATCH);
        const res = await remote.sync.push({
          records: chunk.filter(([t]) => t === 'r').map(([, x]) => x),
          photos: chunk.filter(([t]) => t === 'p').map(([, x]) => x),
        });
        if (res && res.rejected) {
          rejected.records.push(...(res.rejected.records || []));
          rejected.photos.push(...(res.rejected.photos || []));
        }
      }
      // pushedUpTo = mayor updatedAt ENVIADO (no "ahora": así no se salta ediciones hechas durante el envío). Se guarda
      // ya: si el pull falla, el siguiente ciclo no vuelve a subir lo mismo.
      if (items.length) { meta.pushedUpTo = plan.maxUpdatedAt; store.setMeta({ ...(store.getMeta() || {}), pushedUpTo: meta.pushedUpTo }); }

      // 1b. Rechazados: se adopta la versión del servidor tal cual (§10.6), antes del pull, salvo que el usuario haya
      // vuelto a editar ese registro durante la red.
      if (rejected.records.length) {
        const expect = new Map(plan.records.map((w) => [`${w.kind}|${w.nkey}`, w.updatedAt]));
        const s = store.getState();
        const adopted = adoptServer(s, dedupeWire(rejected.records), { userId, expect });
        if (adopted !== s) store.saveMerged(adopted);
      }
      if (cloud && rejected.photos.length) {
        const sent = new Map(plan.photos.map((p) => [p.id, p.updatedAt]));
        const nowLocal = new Map((await store.photos.list()).map((p) => [p.id, p.updatedAt]));
        const keep = dedupeWire(rejected.photos, (w) => w.id).filter((w) => !nowLocal.has(w.id) || nowLocal.get(w.id) === sent.get(w.id));
        const planR = planPhotos(await store.photos.list(), keep, { adopt: true });
        if (planR.upserts.length || planR.deletes.length) await store.photos.applyRemote(planR);
      }

      // 2. Pull desde el cursor del SERVIDOR (con solape de 30 s en el servidor: puede repetir filas, la fusión es idempotente).
      const pulled = { records: [], photos: [], comments: [] };
      let cursor = meta.cursor || CURSOR0;
      for (let page = 0; page < MAX_PULL_PAGES; page++) {
        // Solape de 30 s solo en la 1.ª página; las siguientes, sin solape (si no, la paginación no avanzaría).
        const res = await remote.sync.pull(cursor, { overlap: page === 0 });
        pulled.records.push(...(res.records || []));
        pulled.photos.push(...(res.photos || []));
        pulled.comments.push(...(res.comments || []));
        const next = res.cursor || cursor;
        const stuck = next === cursor;
        cursor = next;
        if (!res.hasMore || stuck) break;
      }

      // 3. Fusionar y guardar SIN re-sellar (saveMerged). Se relee el estado: el usuario pudo editar durante la red.
      state = store.getState();
      const merged = applyRemote(state, pulled.records, { now: now() });
      if (merged !== state) store.saveMerged(merged);
      if (cloud && pulled.photos.length) {
        const plan2 = planPhotos(await store.photos.list(), dedupeWire(pulled.photos, (w) => w.id));
        if (plan2.upserts.length || plan2.deletes.length) await store.photos.applyRemote(plan2);
      }
      if (store.saveComments && pulled.comments.length) store.saveComments(pulled.comments);

      // Recordar la marca de lo recibido (y de lo adoptado) para no re-subirlo; olvidar lo ya cubierto por pushedUpTo.
      for (const w of [...rejected.records, ...pulled.records, ...rejected.photos, ...pulled.photos]) if (w) seen[seenKey(w)] = w.updatedAt;
      for (const k of Object.keys(seen)) if (meta.pushedUpTo !== null && ms(seen[k]) <= ms(meta.pushedUpTo)) delete seen[k];
      meta.seen = seen;
      meta.cursor = cursor;
      meta.lastOkAt = new Date(now()).toISOString();
      meta.lastError = null;
      store.setMeta(meta);
      return { pushed: plan.records.length + plan.photos.length, pulled: pulled.records.length, rejected: rejected.records.length + rejected.photos.length };
    }

    // Una sola sincronización a la vez (en la app, además, navigator.locks entre pestañas).
    function run() {
      if (running) return running;
      setStatus({ state: 'syncing' });
      running = cycle().then((r) => {
        if (r.nocloud) { setStatus({ state: 'nocloud' }); return { status: 'nocloud' }; }
        if (r.blocked) { setStatus({ state: 'blocked' }); return { status: 'blocked' }; }
        if (r.owner) { setStatus({ state: 'owner', lastError: r.owner }); return { status: 'owner', reason: r.owner }; }
        failures = 0;
        setStatus({ state: 'ok', lastOkAt: new Date(now()).toISOString(), lastError: null, nextRetryAt: null });
        return { status: 'ok', ...r };
      }, (err) => {
        const code = (err && err.code) || 'server';
        // Sprint 7: el servidor dice que faltan A3/A4 vigentes (p. ej. la aceptación aún no había llegado o se retiró en otro
        // teléfono). No es un error técnico: es "falta aceptar". Sin reintentos automáticos; la app envía lo pendiente y reintenta una vez.
        if (code === 'consent_required') { setStatus({ state: 'consent', lastError: null, nextRetryAt: null }); return { status: 'consent' }; }
        const meta = store.getMeta() || {};
        store.setMeta({ ...meta, lastError: code });
        if (code === 'auth') { setStatus({ state: 'auth', lastError: code, nextRetryAt: null }); return { status: 'auth' }; }
        if (isRetryable(err)) {
          failures++;
          const delay = nextDelay(failures);
          setStatus({ state: code === 'offline' ? 'offline' : 'error', lastError: code, nextRetryAt: new Date(now() + delay).toISOString() });
          return { status: code === 'offline' ? 'offline' : 'error', retryInMs: delay };
        }
        setStatus({ state: 'error', lastError: code, nextRetryAt: null });
        return { status: 'error', code };
      }).finally(() => { running = null; });
      return running;
    }

    return { run, status: () => status, isRunning: () => !!running };
  }

  const api = { toWire, fromWire, dedupeWire, remoteState, applyRemote, adoptServer, planPush, photosToWire, planPhotos, nextDelay, ownerCheck,
    createSync, CURSOR0, BATCH, BACKOFF_MS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Sync = api;
})(typeof window !== 'undefined' ? window : globalThis);
