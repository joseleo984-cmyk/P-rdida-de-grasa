// S3-3: motor de sincronización (sync.js) con un servidor stub que reproduce sync_push/sync_pull de la BD.
const test = require('node:test');
const assert = require('node:assert');
const Schema = require('../schema.js');
const Sync = require('../sync.js');
const { StubServer, makeDevice, iso } = require('./sync-stub.js');

const U1 = '11111111-1111-4111-8111-111111111111';
const plain = (o) => JSON.parse(JSON.stringify(o));
const PROFILE = { name: 'Ana', sex: 'female', age: 35, height: 165, startWeight: 70, goalWeight: 62, startDate: '2026-10-01', activity: 1.375, rate: 0.005 };

// Un mundo de prueba: reloj controlable (servidor y dispositivos comparten hora salvo que se indique), servidor y móviles.
function world() {
  let t = Date.parse('2026-10-21T12:00:00.000Z');
  const clock = () => t;
  const server = new StubServer({ clock });
  const mk = (opts = {}) => {
    const dev = makeDevice({ userId: U1, clock: opts.clock || clock, ...opts });
    dev.sync = Sync.createSync({ remote: server.remoteFor(U1), store: dev, now: opts.clock || clock });
    return dev;
  };
  return { server, mk, tick: (n = 1000) => { t += n; }, clock };
}
const weigh = (dev, date, weight, note) => dev.edit((s) => {
  const e = s.entries.find((x) => x.date === date);
  if (e) { e.weight = weight; if (note !== undefined) e.note = note; }
  else s.entries.push({ id: Schema.uuid(), date, weight, ...(note ? { note } : {}) });
});
const weightOn = (dev, date) => { const e = dev.getState().entries.find((x) => x.date === date); return e ? e.weight : undefined; };

test('frontera: toWire/fromWire conservan el estado (registros, comidas, hábitos, biblioteca, perfil y lápidas)', () => {
  const raw = Schema.normalize(Schema.migrate(require('./fixtures/backup-v3.json'))).state;
  raw.deleted.entries.push({ id: Schema.uuid(), date: '2026-09-30', deletedAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z' });
  const wire = Sync.toWire(raw, { userId: U1 });
  assert.ok(wire.every((w) => ['entry', 'food', 'habit', 'library', 'profile'].includes(w.kind) && w.updatedAt));
  assert.deepStrictEqual(wire.find((w) => w.deletedAt), { id: raw.deleted.entries[0].id, kind: 'entry', nkey: '2026-09-30', date: '2026-09-30',
    data: {}, updatedAt: '2026-10-02T00:00:00.000Z', deletedAt: '2026-10-02T00:00:00.000Z' });
  assert.strictEqual(wire.find((w) => w.kind === 'food').nkey, wire.find((w) => w.kind === 'food').id, 'food: nkey = id');
  const back = Sync.remoteState(plain(wire));
  for (const k of ['entries', 'foods', 'habits', 'library', 'deleted']) assert.deepStrictEqual(plain(back[k]), plain({ ...raw, deleted: { ...raw.deleted, photos: [] } }[k]), k);
  assert.deepStrictEqual(plain(back.profile), plain(raw.profile));
  assert.strictEqual(back.consent, null, 'el consentimiento nunca viaja como registro');
});

test('lo recibido es no confiable: remoteState normaliza tipos, rangos e ids como un import', () => {
  const s = Sync.remoteState([
    { id: 'mal', kind: 'entry', nkey: '2026-10-20', date: '2026-10-20', data: { weight: '80', note: '<script>', hack: 1 }, updatedAt: '2026-10-20T00:00:00Z' },
    { id: Schema.uuid(), kind: 'entry', nkey: '2026-10-21', date: '2026-10-21', data: { weight: 9999 }, updatedAt: '2026-10-20T00:00:00Z' },
    { id: Schema.uuid(), kind: 'library', nkey: '__proto__', data: { name: '__proto__', kcal: 1 }, updatedAt: '2026-10-20T00:00:00Z' },
  ]);
  assert.strictEqual(s.entries.length, 1);
  assert.strictEqual(s.entries[0].weight, 80);
  assert.ok(Schema.isUUID(s.entries[0].id) && !('hack' in s.entries[0]));
  assert.deepStrictEqual(Object.keys(s.library), []);
});

test('planPush: la primera vez sube todo (también lo migrado con EPOCH); después solo lo cambiado', () => {
  const s = Schema.normalize(Schema.migrate(require('./fixtures/backup-v3.json'))).state;
  const first = Sync.planPush(s, { userId: U1 });
  assert.strictEqual(first.records.length, 3 + 2 + 2 + 2 + 1);
  const next = Sync.planPush(s, { userId: U1, pushedUpTo: first.maxUpdatedAt });
  assert.strictEqual(next.records.length, 0);
});

test('dos dispositivos: A sube, B baja; B edita; A recibe la edición; ambos convergen', async () => {
  const w = world();
  const A = w.mk(), B = w.mk();
  A.edit((s) => { s.profile = { ...PROFILE }; });
  weigh(A, '2026-10-20', 80);
  assert.strictEqual((await A.sync.run()).status, 'ok');
  w.tick(); await B.sync.run();
  assert.strictEqual(weightOn(B, '2026-10-20'), 80, 'B recibe el pesaje de A');
  assert.strictEqual(B.getState().profile.name, 'Ana');
  w.tick(60000); weigh(B, '2026-10-20', 79.5);
  await B.sync.run();
  w.tick(); await A.sync.run();
  assert.strictEqual(weightOn(A, '2026-10-20'), 79.5, 'A recibe la edición más nueva de B');
  assert.deepStrictEqual(plain(A.getState().entries), plain(B.getState().entries), 'mismo id, mismos datos y mismo updatedAt');
});

test('mismo registro editado en los dos offline: gana la edición más reciente en ambos', async () => {
  const w = world();
  const A = w.mk(), B = w.mk();
  weigh(A, '2026-10-20', 80); await A.sync.run(); await B.sync.run();
  w.server.online = false;
  w.tick(10000); weigh(A, '2026-10-20', 81);           // A edita primero
  w.tick(10000); weigh(B, '2026-10-20', 82);           // B edita después
  assert.strictEqual((await A.sync.run()).status, 'offline');
  w.server.online = true;
  w.tick(); await A.sync.run(); await B.sync.run(); await A.sync.run();
  assert.strictEqual(weightOn(A, '2026-10-20'), 82);
  assert.strictEqual(weightOn(B, '2026-10-20'), 82);
});

test('dos pesajes del mismo día creados offline con ids distintos → uno solo, con el id del servidor, en ambos', async () => {
  const w = world();
  const A = w.mk(), B = w.mk();
  weigh(A, '2026-10-20', 80);
  w.tick(5000); weigh(B, '2026-10-20', 79);
  await A.sync.run(); w.tick(); await B.sync.run(); w.tick(); await A.sync.run();
  const ea = A.getState().entries, eb = B.getState().entries;
  assert.strictEqual(ea.length, 1); assert.strictEqual(eb.length, 1);
  assert.strictEqual(ea[0].id, w.server.row(U1, 'entry', '2026-10-20').id, 'A usa el id del servidor');
  assert.strictEqual(eb[0].id, ea[0].id, 'B también');
  assert.strictEqual(ea[0].weight, 79, 'gana el más reciente (B)');
});

test('rejected: el cliente ADOPTA la versión del servidor tal cual (contrato v1.1 §10.6), también en empate exacto', async () => {
  const w = world();
  const A = w.mk(), B = w.mk();
  weigh(A, '2026-10-20', 80); await A.sync.run();
  // B crea el mismo día con EXACTAMENTE el mismo updatedAt que el servidor pero datos que la BD considera "menores".
  const srvRow = w.server.row(U1, 'entry', '2026-10-20');
  B.saveMerged({ ...B.getState(), entries: [{ id: Schema.uuid(), date: '2026-10-20', weight: 100, updatedAt: srvRow.updatedAt }] });
  B.setMeta({ ...B.getMeta(), cursor: iso(w.clock() + 3600000) });   // el pull no traería nada: solo cuenta `rejected`
  const r = await B.sync.run();
  assert.strictEqual(r.rejected, 1);
  const e = B.getState().entries[0];
  assert.strictEqual(e.weight, 80, 'en empate la BD conserva su fila y B la adopta');
  assert.strictEqual(e.id, srvRow.id);
  // Un segundo ciclo no vuelve a subir nada (convergencia).
  const before = w.server.calls.filter((c) => c.op === 'push').length;
  await B.sync.run();
  assert.strictEqual(w.server.calls.filter((c) => c.op === 'push').length, before, 'nada pendiente de subir');
});

test('CRÍTICO saveMerged: lo recibido NO se re-sella; con save() normal ganaría a una edición más nueva', async () => {
  const w = world();
  const A = w.mk(), B = w.mk();
  weigh(A, '2026-10-20', 80); await A.sync.run();
  w.tick(); await B.sync.run();
  const srvStamp = w.server.row(U1, 'entry', '2026-10-20').updatedAt;
  assert.strictEqual(B.getState().entries[0].updatedAt, srvStamp, 'B guarda el updatedAt de A, no "ahora"');
  assert.ok(B.saves.merged >= 1 && B.saves.save === 0, 'lo recibido se guardó con saveMerged');
  // B edita OTRA cosa después: stampChanges solo marca eso
  w.tick(60000); B.edit((s) => { s.habits['2026-10-20'] = { trained: true }; });
  assert.strictEqual(B.getState().entries[0].updatedAt, srvStamp, 'el registro recibido sigue con su marca original');
  const plan = Sync.planPush(B.getState(), { userId: U1, pushedUpTo: B.getMeta().pushedUpTo, seen: B.getMeta().seen });
  assert.deepStrictEqual(plan.records.map((x) => x.kind), ['habit'], 'solo se sube lo que el usuario cambió (lo recibido no se re-sube)');
  // Mientras tanto A edita el pesaje (más nuevo que la recepción de B) y sube
  w.tick(1000); weigh(A, '2026-10-20', 78); await A.sync.run();
  w.tick(); await B.sync.run();
  assert.strictEqual(weightOn(B, '2026-10-20'), 78, 'la edición más nueva de A llega a B');

  // Control negativo: si B hubiera guardado lo recibido con save(), el registro quedaría re-sellado con "ahora".
  const C = w.mk();
  const recibido = Sync.applyRemote(C.getState(), (await w.server.remoteFor(U1).sync.pull(null)).records);
  w.tick(120000);
  C.save(recibido);      // ¡mal! (lo que §5.3 prohíbe)
  assert.ok(C.getState().entries[0].updatedAt > w.server.row(U1, 'entry', '2026-10-20').updatedAt,
    'con save() el dato recibido parecería una edición nueva de C y pisaría ediciones más recientes de otros');
});

test('offline largo: se acumulan ediciones, reintentos con backoff, nada se pierde y al volver se sube todo', async () => {
  const w = world();
  const A = w.mk(), B = w.mk();
  w.server.online = false;
  const results = [];
  for (let d = 1; d <= 20; d++) {
    weigh(A, `2026-10-${String(d).padStart(2, '0')}`, 80 - d / 10);
    w.tick(3600000);
    results.push(await A.sync.run());
  }
  assert.ok(results.every((r) => r.status === 'offline'));
  assert.deepStrictEqual(results.slice(0, 5).map((r) => r.retryInMs), [5000, 30000, 120000, 600000, 600000], 'backoff 5 s, 30 s, 2 min, 10 min (máx.)');
  assert.strictEqual(A.sync.status().state, 'offline');
  assert.strictEqual(A.getState().entries.length, 20, 'los datos locales siguen ahí');
  w.server.online = true;
  assert.strictEqual((await A.sync.run()).status, 'ok');
  assert.strictEqual(A.sync.status().nextRetryAt, null);
  await B.sync.run();
  assert.strictEqual(B.getState().entries.length, 20, 'B recibe los 20 pesajes');
});

test('lápidas: un borrado se propaga; una edición posterior en otro dispositivo revive el registro', async () => {
  const w = world();
  const A = w.mk(), B = w.mk();
  weigh(A, '2026-10-19', 81); weigh(A, '2026-10-20', 80);
  await A.sync.run(); await B.sync.run();
  w.tick(10000); A.edit((s) => { s.entries = s.entries.filter((e) => e.date !== '2026-10-19'); });
  await A.sync.run(); w.tick(); await B.sync.run();
  assert.deepStrictEqual(B.getState().entries.map((e) => e.date), ['2026-10-20'], 'el borrado de A llega a B');
  assert.strictEqual(B.getState().deleted.entries.length, 1, 'B guarda la lápida');
  assert.ok(w.server.row(U1, 'entry', '2026-10-19').deletedAt, 'el servidor guarda la lápida');
  w.tick(10000); weigh(B, '2026-10-19', 79.9);   // B vuelve a pesar ese día, después del borrado
  await B.sync.run(); w.tick(); await A.sync.run();
  assert.strictEqual(weightOn(A, '2026-10-19'), 79.9, 'la edición posterior revive el registro en A');
  assert.strictEqual(A.getState().deleted.entries.length, 0);
  // Comidas: borrar en A se propaga a B
  A.edit((s) => { s.foods['2026-10-20'] = [{ id: Schema.uuid(), name: 'Pan', meal: 'Desayuno', kcal: 200, protein: 6, carbs: 38, fat: 2 }]; });
  await A.sync.run(); w.tick(); await B.sync.run();
  assert.strictEqual(B.getState().foods['2026-10-20'].length, 1);
  w.tick(5000); B.edit((s) => { delete s.foods['2026-10-20']; });
  await B.sync.run(); w.tick(); await A.sync.run();
  assert.strictEqual(A.getState().foods['2026-10-20'], undefined, 'el borrado de la comida en B llega a A');
});

test('fotos: con "copia en la nube" se sube primero el archivo y luego los metadatos; otro móvil los recibe', async () => {
  const w = world();
  const A = w.mk({ cloud: true }), B = w.mk({ cloud: true }), C = w.mk({ cloud: false });
  const id = Schema.uuid();
  A.photos.add({ id, date: '2026-10-20', pose: 'frente', width: 10, height: 10, createdAt: Date.parse('2026-10-20T08:00:00Z'), updatedAt: '2026-10-20T08:00:00.000Z' }, 'BLOB');
  await A.sync.run();
  assert.strictEqual(w.server.blobs.get(`${U1}/${id}.jpg`), 'BLOB', 'archivo subido a {uid}/{id}.jpg');
  assert.strictEqual(w.server.photos.get(id).storagePath, `${U1}/${id}.jpg`);
  w.tick(); await B.sync.run();
  assert.ok(B.photos.map.get(id) && B.photos.map.get(id).remote, 'B recibe los metadatos (la descarga del blob es aparte)');
  await C.sync.run();
  assert.strictEqual(C.photos.map.size, 0, 'sin autorización de copia en la nube no se tocan fotos');
  // Borrar en A → lápida de foto → B la borra
  w.tick(10000);
  A.photos.map.delete(id);
  A.edit((s) => { s.deleted.photos.push({ id, date: '2026-10-20', deletedAt: iso(w.clock()), updatedAt: iso(w.clock()) }); });
  await A.sync.run(); w.tick(); await B.sync.run();
  assert.strictEqual(B.photos.map.has(id), false, 'el borrado de la foto llega a B');
  // Sin autorización, A no sube fotos nuevas
  const D = w.mk({ cloud: false });
  D.photos.add({ id: Schema.uuid(), date: '2026-10-21', pose: 'perfil', createdAt: 0, updatedAt: '2026-10-21T08:00:00.000Z' }, 'X');
  await D.sync.run();
  assert.strictEqual(w.server.blobs.size, 1, 'sin autorización no se sube ningún archivo');
});

test('bloqueo de salud (healthPart): sin autorización no se sube ni se baja nada', async () => {
  const w = world();
  const A = w.mk({ health: false });
  weigh(A, '2026-10-20', 80);
  const r = await A.sync.run();
  assert.strictEqual(r.status, 'blocked');
  assert.strictEqual(A.sync.status().state, 'blocked');
  assert.strictEqual(w.server.calls.length, 0, 'ninguna llamada al servidor');
});

test('cursor del servidor y solape: re-recibir filas no cambia nada (idempotente); paginación con hasMore', async () => {
  const w = world();
  const A = w.mk(), B = w.mk();
  for (let d = 1; d <= 9; d++) weigh(A, `2026-10-0${d}`, 80 + d);
  await A.sync.run();
  w.server.pageLimit = 4;
  await B.sync.run();
  assert.strictEqual(B.getState().entries.length, 9, 'pagina hasta has_more = false');
  const pulls = w.server.calls.filter((c) => c.op === 'pull' && c.user === U1).slice(-3);
  assert.ok(pulls.length >= 3, 'hizo varias páginas');
  const snap = JSON.stringify(B.getState());
  await B.sync.run();                       // el solape de 30 s vuelve a traer filas ya vistas
  assert.strictEqual(JSON.stringify(B.getState()), snap, 'la fusión repetida no cambia el estado');
  assert.ok(B.getMeta().cursor > '2026-10-21T00:00:00.000Z', 'el cursor es del reloj del servidor');
});

test('reloj del móvil adelantado: el servidor recorta y el otro dispositivo puede seguir editando', async () => {
  const w = world();
  let skew = 0;
  const A = w.mk({ clock: () => w.clock() + skew }), B = w.mk();
  skew = 365 * 86400000;                    // A cree que es dentro de un año
  weigh(A, '2026-10-20', 80); await A.sync.run();
  assert.ok(w.server.row(U1, 'entry', '2026-10-20').updatedAt <= iso(w.clock() + 5 * 60000), 'el servidor recorta la marca');
  w.tick(10 * 60000); await B.sync.run(); weigh(B, '2026-10-20', 77); await B.sync.run();
  assert.strictEqual(w.server.row(U1, 'entry', '2026-10-20').data.weight, 77, 'una edición real posterior gana');
});

test('una sola sincronización a la vez; error de sesión → estado auth sin reintento automático', async () => {
  const w = world();
  const A = w.mk();
  const p1 = A.sync.run(), p2 = A.sync.run();
  assert.strictEqual(p1, p2, 'la segunda llamada reutiliza la que está en curso');
  await p1;
  const noUser = makeDevice({ userId: null, clock: w.clock });
  const s = Sync.createSync({ remote: w.server.remoteFor(U1), store: noUser, now: w.clock });
  const r = await s.run();
  assert.strictEqual(r.status, 'auth');
  assert.strictEqual(s.status().nextRetryAt, null);
});

test('ownerCheck y nextDelay', () => {
  assert.strictEqual(Sync.ownerCheck(null, 'u', true), 'adopt');
  assert.strictEqual(Sync.ownerCheck(null, 'u', false), 'ok');
  assert.strictEqual(Sync.ownerCheck('u', 'u', true), 'ok');
  assert.strictEqual(Sync.ownerCheck('otro', 'u', true), 'conflict');
  assert.deepStrictEqual([1, 2, 3, 4, 9].map(Sync.nextDelay), [5000, 30000, 120000, 600000, 600000]);
});

test('rejected + edición del usuario durante la red: NO se pisa la edición; gana en el siguiente ciclo', async () => {
  const w = world();
  const A = w.mk(), B = w.mk();
  weigh(A, '2026-10-20', 80); await A.sync.run(); await B.sync.run();
  w.tick(60000); weigh(B, '2026-10-20', 81); await B.sync.run();          // el servidor tiene 81 (más nuevo)
  w.tick(1000);
  // A tiene una versión vieja pendiente de subir (más antigua que la de B)
  A.saveMerged({ ...A.getState(), entries: A.getState().entries.map((e) => ({ ...e, weight: 79, updatedAt: iso(w.clock() - 30000) })) });
  w.server.onPush = async () => { w.server.onPush = null; w.tick(1000); weigh(A, '2026-10-20', 77); };   // A edita mientras sube
  const r = await A.sync.run();
  assert.strictEqual(r.rejected, 1, 'el servidor rechaza la versión vieja de A');
  assert.strictEqual(weightOn(A, '2026-10-20'), 77, 'la edición hecha durante la red se conserva (no se adopta encima)');
  w.tick(); await A.sync.run(); w.tick(); await B.sync.run();
  assert.strictEqual(weightOn(B, '2026-10-20'), 77, 'y gana en el siguiente ciclo');
});

test('si el pull falla tras un push correcto, pushedUpTo queda guardado (no se re-sube lo mismo)', async () => {
  const w = world();
  const A = w.mk();
  weigh(A, '2026-10-20', 80);
  w.server.onPush = async () => { w.server.onPush = null; w.server.online = false; };
  assert.strictEqual((await A.sync.run()).status, 'offline');
  assert.ok(A.getMeta().pushedUpTo, 'pushedUpTo guardado');
  w.server.online = true;
  const pushes = () => w.server.calls.filter((c) => c.op === 'push').length;
  const before = pushes();
  await A.sync.run();
  assert.strictEqual(pushes(), before, 'el siguiente ciclo no vuelve a subir el pesaje');
});

test('dueño de los datos (QA S3-2 O1): sin dueño confirmado o con otro dueño NO se sube ni se baja nada', async () => {
  const w = world();
  const A = w.mk();
  weigh(A, '2026-10-20', 80);
  A.owner = null;
  assert.deepStrictEqual(await A.sync.run(), { status: 'owner', reason: 'unconfirmed' });
  A.owner = '22222222-2222-4222-8222-222222222222';
  assert.deepStrictEqual(await A.sync.run(), { status: 'owner', reason: 'conflict' });
  assert.strictEqual(A.sync.status().state, 'owner');
  assert.strictEqual(w.server.calls.length, 0, 'ninguna llamada: los datos de otra persona nunca se suben');
  A.owner = U1;
  assert.strictEqual((await A.sync.run()).status, 'ok', 'al confirmar el dueño, sincroniza');
});
