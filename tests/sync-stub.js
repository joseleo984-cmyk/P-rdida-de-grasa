// Stub MÍNIMO para probar sync.js en Node (no es el remote-fake.js del Frontend, S3-2).
// - StubServer: reproduce la semántica de grasa.sync_push / sync_pull de supabase/migrations (LWW por registro con
//   desempate por data, recorte +5 min, clave natural que conserva el id del servidor, cursor con reloj del servidor,
//   solape de 30 s, paginación) y fotos con LWW estricto.
// - makeDevice: un "móvil" con el mismo save() que app.js (stampChanges frente a lo guardado) y saveMerged() (sin re-sellar).
const Schema = require('../schema.js');

const iso = (ms) => new Date(ms).toISOString();
const ms = (s) => Date.parse(s);
// Texto canónico del jsonb (claves ordenadas), como compara la BD `data::text`.
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.keys(x).sort().reduce((o, kk) => { o[kk] = x[kk]; return o; }, {}) : x));

class StubServer {
  constructor({ clock }) {
    this.clock = clock;           // () => ms (reloj del SERVIDOR)
    this.rows = new Map();        // user|kind|nkey → fila
    this.photos = new Map();      // id → fila
    this.blobs = new Map();
    this.online = true;
    this.pageLimit = 1000;
    this.last = 0;
    this.calls = [];
    this.onPush = null;
  }
  stamp() { const t = Math.max(this.clock(), this.last + 1); this.last = t; return t; }
  check() { if (!this.online) throw Object.assign(new Error('offline'), { code: 'offline', retryable: true }); }
  clamp(s) { return iso(Math.min(ms(s), this.clock() + 5 * 60000)); }
  out(r) { const { user, ...w } = r; return { ...w, serverUpdatedAt: iso(r.sut) }; }

  remoteFor(user) {
    const srv = this;
    return {
      sync: {
        async push({ records = [], photos = [] }) {
          srv.check(); srv.calls.push({ user, op: 'push', records: records.length, photos: photos.length });
          if (records.length + photos.length > 500) throw Object.assign(new Error('invalid'), { code: 'invalid' });
          const rejected = { records: [], photos: [] };
          for (const r of records) {
            const key = `${user}|${r.kind}|${r.nkey}`;
            const inc = { user, id: r.id, kind: r.kind, nkey: r.nkey, date: r.date || null, data: r.data || {},
                          updatedAt: srv.clamp(r.updatedAt), deletedAt: r.deletedAt ? srv.clamp(r.deletedAt) : null };
            const cur = srv.rows.get(key);
            if (!cur) { srv.rows.set(key, { ...inc, sut: srv.stamp() }); continue; }
            const wins = ms(inc.updatedAt) > ms(cur.updatedAt) || (ms(inc.updatedAt) === ms(cur.updatedAt) && canon(inc.data) > canon(cur.data));
            if (wins) srv.rows.set(key, { ...inc, id: cur.id, sut: srv.stamp() });   // clave natural: id del servidor
            else rejected.records.push(srv.out(cur));
          }
          for (const p of photos) {
            const cur = srv.photos.get(p.id);
            const inc = { ...p, user, updatedAt: srv.clamp(p.updatedAt) };
            if (cur && cur.user !== user) throw Object.assign(new Error('forbidden'), { code: 'forbidden' });
            if (!cur || ms(inc.updatedAt) > ms(cur.updatedAt)) srv.photos.set(p.id, { ...inc, sut: srv.stamp() });
            else rejected.photos.push(srv.out(cur));
          }
          if (srv.onPush) await srv.onPush();   // gancho de prueba: algo ocurre "mientras viaja la respuesta"
          return { serverNow: iso(srv.clock()), rejected };
        },
        async pull(since, { overlap = true } = {}) {
          srv.check(); srv.calls.push({ user, op: 'pull', since, overlap });
          const from = ms(since || '1970-01-01T00:00:00Z') - (overlap ? 30000 : 0);
          const pick = (rows) => rows.filter((r) => r.user === user && r.sut >= from).sort((a, b) => a.sut - b.sut).slice(0, srv.pageLimit);
          const recs = pick([...srv.rows.values()]);
          const phs = pick([...srv.photos.values()]);
          const more = recs.length === srv.pageLimit || phs.length === srv.pageLimit;
          const maxes = [recs, phs].filter((l) => l.length).map((l) => l[l.length - 1].sut);
          const full = [recs, phs].filter((l) => l.length === srv.pageLimit).map((l) => l[l.length - 1].sut);
          const cur = more ? Math.min(...full) : maxes.length ? Math.max(...maxes) : null;
          return { records: recs.map((r) => srv.out(r)), photos: phs.map((r) => srv.out(r)), comments: [],
                   cursor: cur === null ? since : iso(cur), hasMore: more, serverNow: iso(srv.clock()) };
        },
        async uploadPhoto(id, blob) { srv.check(); srv.blobs.set(`${user}/${id}.jpg`, blob); return { path: `${user}/${id}.jpg` }; },
      },
    };
  }
  row(user, kind, nkey) { return this.rows.get(`${user}|${kind}|${nkey}`); }
}

// Un dispositivo: estado local como app.js (savedJSON + stampChanges en save(), saveMerged sin re-sellar).
function makeDevice({ userId, clock, health = true, cloud = false }) {
  const consent = Schema.buildConsent({ terms: true, privacy: true, adult: true, sensitiveHealth: true, photos: true }, '2026-10-01T00:00:00.000Z');
  let savedJSON = JSON.stringify({ ...Schema.emptyState(), consent });
  let meta = { userId, cursor: '1970-01-01T00:00:00.000Z', pushedUpTo: null };
  const photos = new Map();
  const blobs = new Map();
  const comments = [];
  const read = () => Schema.normalize(JSON.parse(savedJSON)).state;
  const dev = {
    flags: { health, cloud },
    saves: { save: 0, merged: 0 },
    getState: read,
    save(next) {   // = app.js save(): marca lo nuevo o cambiado con el reloj del dispositivo
      dev.saves.save++;
      savedJSON = JSON.stringify(Schema.stampChanges(JSON.parse(savedJSON), next, iso(clock())));
    },
    saveMerged(next) { dev.saves.merged++; savedJSON = JSON.stringify(next); },   // lo recibido, tal cual
    edit(fn) { const s = read(); fn(s); dev.save(s); return read(); },
    getMeta: () => ({ ...meta }),
    setMeta: (m) => { meta = { ...m }; },
    healthAllowed: () => dev.flags.health,
    photosCloudAllowed: () => dev.flags.cloud,
    photos: {
      async list() { return [...photos.values()]; },
      async getBlob(id) { return blobs.get(id) || null; },
      async applyRemote({ upserts, deletes }) {
        for (const p of upserts) photos.set(p.id, { id: p.id, date: p.date, pose: p.pose, updatedAt: p.updatedAt, createdAt: ms(p.createdAt), remote: true });
        for (const d of deletes) photos.delete(d.id);
      },
      add(p, blob) { photos.set(p.id, p); blobs.set(p.id, blob); },
      map: photos,
    },
    saveComments(list) { comments.push(...list); },
    comments,
  };
  return dev;
}

module.exports = { StubServer, makeDevice, iso, ms };
