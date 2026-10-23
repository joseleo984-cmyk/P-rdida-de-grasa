// S3-2: implementación falsa de Remote (remote-fake.js) y Remote.config() (equipo/r1-contrato.md §3-§4).
const test = require('node:test');
const assert = require('node:assert');
const Pagos = require('../pagos.js');
const Fake = require('../remote-fake.js');
const Remote = require('../remote.js');

const T0 = '2026-10-21T15:00:00.000Z';
const setup = () => {
  const clock = Fake.FakeClock(T0);
  const backend = new Fake.FakeBackend({ clock });
  return { clock, backend, dev: () => Fake.createFake({ backend }) };
};
async function login(remote, backend, email) {
  await remote.auth.sendCode(email);
  return remote.auth.verifyCode(email, backend.lastCode(email));
}
const H = 'a'.repeat(64);
const SH = { version: 'compartir-1', textHash: H };
const ev = (kind, granted = true) => ({ kind, granted, version: 't', textHash: H, clientAt: T0 });
const agree = (r) => r.account.recordConsents([ev('coach_agreement')]);   // Sprint 7: A7 vigente
const cloud = (r) => r.account.recordConsents([ev('sensitive_health'), ev('cloud_transfer')]);   // Sprint 7: A3 + A4 vigentes
const rejects = (p, code) => assert.rejects(p, (e) => e instanceof Error && e.code === code);

test('config: sin PG_CONFIG o vacío → null (la app sigue solo local)', () => {
  assert.strictEqual(Remote.config({ location: { hostname: 'x.org', search: '' } }), null);
  assert.strictEqual(Remote.config({ location: { hostname: 'x.org', search: '' }, PG_CONFIG: { url: '', key: '', mode: 'real' } }), null);
  assert.strictEqual(Remote.config({ location: { hostname: 'x.org', search: '' }, PG_CONFIG: { url: 'https://abc.supabase.co', key: 'service_role_xxx' } }), null, 'solo clave publicable');
  assert.deepStrictEqual(Remote.config({ location: { hostname: 'x.org', search: '' }, PG_CONFIG: { url: 'https://abc.supabase.co', key: 'sb_publishable_123' } }),
    { url: 'https://abc.supabase.co', key: 'sb_publishable_123', mode: 'real' });
});

test('config: el modo falso NUNCA se activa en el dominio de producción', () => {
  const prod = { hostname: 'joseleo984-cmyk.github.io', search: '?remote=fake', protocol: 'https:' };
  assert.strictEqual(Remote.config({ location: prod }), null);
  assert.strictEqual(Remote.config({ location: prod, PG_CONFIG: { mode: 'fake' } }), null);
  assert.strictEqual(Remote.config({ location: { hostname: 'localhost', search: '?remote=fake' } }).mode, 'fake');
  assert.strictEqual(Remote.config({ location: { hostname: '127.0.0.1', search: '' }, PG_CONFIG: { mode: 'fake' } }).mode, 'fake');
  assert.strictEqual(Remote.config({ location: { hostname: 'staging.example.org', search: '?remote=fake' } }), null, 'lista blanca: solo localhost');
  assert.strictEqual(Remote.config({ location: { hostname: 'otro-usuario.github.io', search: '?remote=fake' } }), null);
  assert.strictEqual(Remote.config({ location: { hostname: 'staging.example.org', search: '' }, PG_CONFIG: { mode: 'fake' } }), null);
});

test('auth: OTP de 6 dígitos, reenvío 1/min, código incorrecto, sesión persistente sin red', async () => {
  const { backend, clock, dev } = setup();
  const a = dev();
  await rejects(a.auth.sendCode('no-es-correo'), 'invalid');
  await a.auth.sendCode('Ana@Ejemplo.com ');
  assert.match(backend.lastCode('ana@ejemplo.com'), /^\d{6}$/);
  await rejects(a.auth.sendCode('ana@ejemplo.com'), 'rate_limited');
  clock.advance(61 * 1000);
  await a.auth.sendCode('ana@ejemplo.com');
  await rejects(a.auth.verifyCode('ana@ejemplo.com', '12'), 'invalid_code');
  const wrong = backend.lastCode('ana@ejemplo.com') === '000000' ? '000001' : '000000';
  await rejects(a.auth.verifyCode('ana@ejemplo.com', wrong), 'invalid_code');
  const events = [];
  a.auth.onChange((e) => events.push(e.event));
  const { user } = await a.auth.verifyCode('ana@ejemplo.com', backend.lastCode('ana@ejemplo.com'));
  assert.strictEqual(user.email, 'ana@ejemplo.com');
  assert.deepStrictEqual(events, ['signed_in']);
  backend.setOnline(false);
  assert.deepStrictEqual((await a.auth.session()).user, user, 'session() no usa red');
  await rejects(a.account.roles(), 'offline');
  backend.setOnline(true);
  await a.auth.signOut();
  assert.strictEqual(await a.auth.session(), null);
  await rejects(a.account.roles(), 'auth');
});

test('auth: 5 intentos fallidos bloquean el código; caduca a la hora', async () => {
  const { backend, clock, dev } = setup();
  const a = dev();
  await a.auth.sendCode('b@x.co');
  const bad = backend.lastCode('b@x.co') === '999999' ? '999998' : '999999';
  for (let i = 0; i < 5; i++) await rejects(a.auth.verifyCode('b@x.co', bad), 'invalid_code');
  await rejects(a.auth.verifyCode('b@x.co', backend.lastCode('b@x.co')), 'rate_limited');
  clock.advance(61 * 1000);
  await a.auth.sendCode('b@x.co');
  clock.advance(61 * 60 * 1000);
  await rejects(a.auth.verifyCode('b@x.co', backend.lastCode('b@x.co')), 'invalid_code');
});

test('account: joinApp da rol client; becomeCoach añade coach; consent_events solo inserción', async () => {
  const { backend, dev } = setup();
  const a = dev();
  await login(a, backend, 'c@x.co');
  assert.deepStrictEqual(await a.account.joinApp(), ['client']);
  await rejects(a.coach.becomeCoach('Coach Ana'), 'agreement_required');   // Sprint 7: sin acuerdo no hay coach
  await agree(a);
  await rejects(a.coach.becomeCoach('X'), 'invalid');
  const { inviteCode } = await a.coach.becomeCoach('Coach Ana');
  assert.match(inviteCode, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  assert.deepStrictEqual((await a.coach.becomeCoach('Otro nombre')).inviteCode, inviteCode, 'idempotente');
  assert.deepStrictEqual(await a.account.roles(), ['client', 'coach']);
  await rejects(a.account.recordConsents([{ kind: 'inventado', granted: true, version: '1', textHash: H, clientAt: T0 }]), 'invalid');
  await rejects(a.account.recordConsents([{ kind: 'terms', granted: true, version: '0.2', clientAt: T0 }]), 'invalid'); // v1.1: sin textHash
  await a.account.recordConsents([{ kind: 'terms', granted: true, version: '0.2', textHash: H, clientAt: T0 }, { kind: 'terms', granted: false, version: '0.2', textHash: H, clientAt: T0 }]);
  assert.deepStrictEqual((await a.account.consents()).terms, { granted: false, version: '0.2', textHash: H, clientAt: T0 });
  assert.strictEqual(backend.consentEvents.length, 3);
});

test('cliente ↔ coach: código, vínculo único, filtros del coach (sin note, sin library) y fin del vínculo', async () => {
  const { backend, dev } = setup();
  const coach = dev(), cli = dev(), otro = dev();
  await login(coach, backend, 'coach@x.co'); await coach.account.joinApp(); await agree(coach);
  const { inviteCode } = await coach.coach.becomeCoach('Fit Ana');
  await login(cli, backend, 'cli@x.co'); await cli.account.joinApp();
  await login(otro, backend, 'otro@x.co'); await otro.account.joinApp(); await agree(otro); await otro.coach.becomeCoach('Otro');
  await rejects(cli.client.joinCoach(inviteCode, { body: true, ...SH }), 'consent_required');   // Sprint 7: sin A3 + A4
  await rejects(cli.sync.push({ records: [] }), 'consent_required');
  await rejects(cli.sync.pull('1970-01-01T00:00:00Z'), 'consent_required');
  await cloud(cli);
  await rejects(cli.client.previewCode('ZZZZZZ'), 'invalid_code');
  assert.deepStrictEqual(await cli.client.previewCode(inviteCode.toLowerCase()), { businessName: 'Fit Ana' });
  await rejects(cli.client.joinCoach(inviteCode, { body: false, ...SH }), 'invalid');
  await rejects(cli.client.joinCoach(inviteCode, { body: true }), 'invalid'); // v1.1: sin version/textHash
  const link = await cli.client.joinCoach(inviteCode, { body: true, notes: false, nutrition: true, habits: false, photos: false, ...SH });
  assert.strictEqual(link.businessName, 'Fit Ana');
  assert.strictEqual(backend.consentEvents.filter((e) => e.kind.startsWith('share_')).length, 5);
  await rejects(cli.sync.push({ records: [] }), 'payment_required');   // Sprint 11: vinculado y sin fecha de pago = en pausa
  await coach.coach.setPayment((await cli.auth.session()).user.id, backend.todayBogota());
  await cli.sync.push({ records: [
    { id: 'r1', kind: 'entry', nkey: '2026-10-20', date: '2026-10-20', data: { weight: 70, note: 'privada' }, updatedAt: T0 },
    { id: 'r2', kind: 'library', nkey: 'pan', data: { name: 'Pan', kcal: 100 }, updatedAt: T0 },
    { id: 'r3', kind: 'habit', nkey: '2026-10-20', date: '2026-10-20', data: { steps: 5000 }, updatedAt: T0 },
  ] });
  const seen = await coach.coach.clientData((await cli.auth.session()).user.id);
  assert.deepStrictEqual(seen.records.map((r) => r.kind), ['entry'], 'sin library ni hábitos (no compartidos)');
  assert.ok(!('note' in seen.records[0].data));
  await rejects(otro.coach.clientData((await cli.auth.session()).user.id), 'forbidden');
  const list = await coach.coach.clients();
  assert.strictEqual(list.length, 1);
  await cli.client.leaveCoach();
  await rejects(coach.coach.clientData((await cli.auth.session()).user.id), 'forbidden');
  assert.strictEqual(await cli.client.myLink(), null);
});

test('códigos de coach: máximo 20 intentos por hora', async () => {
  const { backend, clock, dev } = setup();
  const a = dev();
  await login(a, backend, 'r@x.co');
  for (let i = 0; i < 20; i++) await rejects(a.client.previewCode('AAAAAA'), 'invalid_code');
  await rejects(a.client.previewCode('AAAAAA'), 'rate_limited');
  clock.advance(3601 * 1000);
  await rejects(a.client.previewCode('AAAAAA'), 'invalid_code');
});

test('sync: LWW con recorte +5 min, clave natural conserva id, pull con solape y dos dispositivos', async () => {
  const { backend, clock, dev } = setup();
  const m1 = dev(), m2 = dev();
  await login(m1, backend, 'd@x.co'); await cloud(m1);
  await m2.auth.sendCode('d@x.co').catch(() => {}); // mismo usuario en otro móvil (1 código/min)
  clock.advance(61 * 1000);
  await login(m2, backend, 'd@x.co');
  const r = (id, upd, w) => ({ id, kind: 'entry', nkey: '2026-10-20', date: '2026-10-20', data: { weight: w }, updatedAt: upd });
  await m1.sync.push({ records: [r('a', '2026-10-21T15:00:00.000Z', 70)] });
  const out = await m2.sync.push({ records: [r('b', '2026-10-21T14:00:00.000Z', 71)] });
  assert.strictEqual(out.rejected.records.length, 1, 'gana el más reciente');
  assert.strictEqual(out.rejected.records[0].data.weight, 70);
  await m2.sync.push({ records: [r('b', '2099-01-01T00:00:00.000Z', 72)] });
  const p = await m1.sync.pull('1970-01-01T00:00:00Z');
  assert.strictEqual(p.records[0].id, 'a', 'conserva el id del servidor');
  assert.strictEqual(p.records[0].data.weight, 72);
  assert.ok(Date.parse(p.records[0].updatedAt) <= clock.now() + 5 * 60 * 1000, 'marca futura recortada');
  const again = await m1.sync.pull(p.cursor);
  assert.strictEqual(again.records.length, 1, 'ventana de solape de 30 s: idempotente');
  const later = new Date(Date.parse(p.cursor) + 31 * 1000).toISOString();
  assert.strictEqual((await m1.sync.pull(later)).records.length, 0, 'fuera de la ventana no se repite');
});

test('fallos inyectables: failNext, latencia y serialización del backend', async () => {
  const { backend, dev } = setup();
  const a = dev();
  backend.failNext('server');
  await assert.rejects(a.auth.sendCode('f@x.co'), (e) => e.code === 'server' && e.retryable === true);
  backend.latency(5);
  await a.auth.sendCode('f@x.co');
  backend.latency(0);
  const copy = Fake.FakeBackend.fromJSON(JSON.parse(JSON.stringify(backend)));
  assert.strictEqual(copy.lastCode('f@x.co'), backend.lastCode('f@x.co'));
});

// S3-3b: la implementación real se prueba en tests/remote.test.js (cliente supabase-js simulado).
test('Remote.create (real) sin supabase-js cargado: error claro (server)', () => {
  assert.throws(() => Remote.create({ url: 'https://abc.supabase.co', key: 'sb_publishable_x' }), (e) => e.code === 'server');
});

test('v1.1: rotateCode con caducidad y usos; código caducado o agotado = invalid_code; coach inactivo pierde acceso', async () => {
  const { backend, clock, dev } = setup();
  const coach = dev(), c1 = dev(), c2 = dev();
  await login(coach, backend, 'k@x.co'); await coach.account.joinApp(); await agree(coach); await coach.coach.becomeCoach('Coach K');
  await rejects(coach.coach.rotateCode({ validDays: 0 }), 'invalid');
  const code = await coach.coach.rotateCode({ validDays: 7, maxUses: 1 });
  const me = await coach.coach.myCoach();
  assert.strictEqual(me.inviteCode, code);
  assert.strictEqual(me.maxUses, 1);
  assert.strictEqual(me.uses, 0);
  assert.strictEqual(Date.parse(me.expiresAt), clock.now() + 7 * 86400000);
  await login(c1, backend, 'c1@x.co'); await c1.account.joinApp(); await cloud(c1);
  await c1.client.joinCoach(code, { body: true, ...SH });
  assert.strictEqual((await coach.coach.myCoach()).uses, 1);
  await login(c2, backend, 'c2@x.co'); await c2.account.joinApp();
  await rejects(c2.client.previewCode(code), 'invalid_code'); // agotado
  const code2 = await coach.coach.rotateCode({ validDays: 1 });
  clock.advance(86400000 + 1);
  await rejects(c2.client.previewCode(code2), 'invalid_code'); // caducado
  const uid1 = (await c1.auth.session()).user.id;
  assert.ok(await coach.coach.clientData(uid1));
  backend.coaches[(await coach.auth.session()).user.id].active = false;
  await rejects(coach.coach.clientData(uid1), 'forbidden');
});

test('v1.1: textHash = SHA-256 hex con saltos de línea normalizados (mismo valor que el servidor)', async () => {
  // sha256("Acepto\n") calculado aparte; \r\n y \r dan lo mismo.
  const h = await Remote.textHash('Acepto\n');
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.strictEqual(await Remote.textHash('Acepto\r\n'), h);
  assert.strictEqual(await Remote.textHash('Acepto\r'), h);
  assert.strictEqual(await Remote.textHash('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('Sprint 7: el acuerdo del coach manda (revocarlo bloquea), el código de un coach sin acuerdo no sirve y retirar A3/A4 corta la sincronización', async () => {
  const { backend, dev } = setup();
  const coach = dev(), cli = dev();
  await login(coach, backend, 'ca@x.co'); await coach.account.joinApp(); await agree(coach);
  const { inviteCode } = await coach.coach.becomeCoach('Coach A');
  await login(cli, backend, 'cl@x.co'); await cli.account.joinApp(); await cloud(cli);
  const uid = (await cli.auth.session()).user.id;
  await cli.client.joinCoach(inviteCode, { body: true, ...SH });
  backend.setPaidUntil('cl@x.co', backend.todayBogota());   // Sprint 11: al día (el día límite cuenta)
  await cli.sync.push({ records: [{ id: 'r1', kind: 'entry', nkey: '2026-10-20', date: '2026-10-20', data: { weight: 70 }, updatedAt: T0 }] });
  assert.strictEqual((await coach.coach.clientData(uid)).records.length, 1);
  await coach.account.recordConsents([ev('coach_agreement', false)]);   // revoca
  await rejects(coach.coach.clients(), 'agreement_required');
  await rejects(coach.coach.clientData(uid), 'agreement_required');
  await rejects(coach.coach.addComment(uid, { body: 'hola' }), 'agreement_required');
  await rejects(coach.coach.rotateCode(), 'agreement_required');
  await rejects(coach.coach.becomeCoach('Coach A'), 'agreement_required');
  await agree(coach);
  await cli.account.recordConsents([ev('sensitive_health', false)]);   // E3: el cliente retira A3 → el coach deja de ver
  await rejects(coach.coach.clientData(uid), 'forbidden');
  assert.strictEqual((await coach.coach.clients())[0].lastActivity, null);
  await cli.account.recordConsents([ev('sensitive_health')]);
  assert.strictEqual((await coach.coach.clientData(uid)).records.length, 1);
  await coach.account.recordConsents([ev('coach_agreement', false)]);
  await coach.coach.endClient(uid);   // reducir acceso sigue permitido
  const nuevo = dev();
  await login(nuevo, backend, 'nu@x.co'); await nuevo.account.joinApp(); await cloud(nuevo);
  await rejects(nuevo.client.previewCode(inviteCode), 'invalid_code');   // el código de un coach sin acuerdo no sirve
  await rejects(nuevo.client.joinCoach(inviteCode, { body: true, ...SH }), 'invalid_code');
  await agree(coach);
  assert.deepStrictEqual(await nuevo.client.previewCode(inviteCode), { businessName: 'Coach A' });
  await cli.account.recordConsents([ev('cloud_transfer', false)]);   // el último evento manda
  await rejects(cli.sync.push({ records: [] }), 'consent_required');
  await cli.account.recordConsents([ev('cloud_transfer')]);
  await cli.sync.pull('1970-01-01T00:00:00Z');
});

// ---------- Sprint 10: doble de la función de borde «acuerdo-coach-copia» ----------
test('sendAgreementCopy (doble): solo con el acuerdo vigente, 1 por versión y hora, correo de la sesión, modo no disponible', async () => {
  const be = new Fake.FakeBackend({ clock: Fake.FakeClock(T0) });
  const r = Fake.createFake({ backend: be, storage: undefined });
  await r.auth.sendCode('coach@x.co');
  await r.auth.verifyCode('coach@x.co', be.lastCode('coach@x.co'));
  await r.account.joinApp();
  await rejects(r.account.sendAgreementCopy(), 'agreement_required');
  await agree(r);
  assert.deepStrictEqual(await r.account.sendAgreementCopy(), { sent: true });
  assert.strictEqual(be.agreementCopies.length, 1);
  assert.strictEqual(be.agreementCopies[0].to, 'coach@x.co');
  await rejects(r.account.sendAgreementCopy(), 'rate_limited');
  be.clock.advance(61 * 60000);
  await r.account.sendAgreementCopy();
  assert.strictEqual(be.agreementCopies.length, 2);
  be.copyMode = 'unavailable';
  await rejects(r.account.sendAgreementCopy(), 'unavailable');
  assert.strictEqual(Fake.FakeBackend.fromJSON(JSON.parse(JSON.stringify(be))).agreementCopies.length, 2);
});

// ---------- Sprint 11: cobros manuales y bloqueo por pago (mismas reglas que supabase/tests/100_pagos_coach.test.sql) ----------
test('Sprint 11 (fake): el coach marca el pago, otro coach y el cliente no; vencido bloquea push y foto pero no pull ni borrar la cuenta', async () => {
  const { backend, dev } = setup();
  const coach = dev(), otro = dev(), cli = dev(), solo = dev();
  await login(coach, backend, 'pc@x.co'); await coach.account.joinApp(); await agree(coach);
  const { inviteCode } = await coach.coach.becomeCoach('Coach P');
  await login(otro, backend, 'po@x.co'); await otro.account.joinApp(); await agree(otro); await otro.coach.becomeCoach('Otro P');
  await login(cli, backend, 'pcl@x.co'); await cli.account.joinApp(); await cloud(cli);
  await login(solo, backend, 'ps@x.co'); await solo.account.joinApp(); await cloud(solo);
  const uid = (await cli.auth.session()).user.id;
  await solo.sync.push({ records: [] });   // sin vínculo nunca se bloquea
  await cli.client.joinCoach(inviteCode, { body: true, ...SH });
  let l = await cli.client.myLink();
  assert.deepStrictEqual([l.paidUntil, l.paid, l.daysLeft], [null, false, null]);
  await rejects(cli.sync.push({ records: [] }), 'payment_required');
  await rejects(cli.sync.uploadPhoto('p1', new Blob(['x'])), 'payment_required');
  await cli.sync.pull('1970-01-01T00:00:00Z');                       // bajar sigue permitido
  await rejects(otro.coach.setPayment(uid, backend.todayBogota()), 'forbidden');
  assert.strictEqual(typeof cli.coach.setPayment, 'function');
  await rejects(cli.coach.setPayment(uid, backend.todayBogota()), 'forbidden');
  const t = backend.todayBogota();
  await rejects(coach.coach.setPayment(uid, '2999-01-01'), 'invalid');
  await rejects(coach.coach.setPayment(uid, 'mañana'), 'invalid');
  const r = await coach.coach.setPayment(uid, Pagos.addDays(t, 30));
  assert.deepStrictEqual([r.paid, r.daysLeft], [true, 30]);
  const [row] = await coach.coach.clients();
  assert.deepStrictEqual([row.paid, row.daysLeft, row.paidUntil], [true, 30, Pagos.addDays(t, 30)]);
  l = await cli.client.myLink();
  assert.deepStrictEqual([l.paid, l.daysLeft], [true, 30]);
  await cli.sync.push({ records: [{ id: 'r1', kind: 'entry', nkey: '2026-10-20', date: '2026-10-20', data: { neck: 34.5 }, updatedAt: T0 }] });
  await coach.coach.setPayment(uid, t);                               // día límite: sigue al día
  await cli.sync.push({ records: [] });
  await coach.coach.setPayment(uid, Pagos.unpaidDate(t));            // «No pagó»: vencido desde ayer
  l = await cli.client.myLink();
  assert.deepStrictEqual([l.paid, l.daysLeft], [false, -1]);
  await rejects(cli.sync.push({ records: [{ id: 'r2', kind: 'entry', nkey: '2026-10-21', date: '2026-10-21', data: { neck: 35 }, updatedAt: T0 }] }), 'payment_required');
  assert.ok(!Object.values(backend.records).some((x) => x.nkey === '2026-10-21'), 'no se guardó nada');
  assert.strictEqual((await cli.sync.pull('1970-01-01T00:00:00Z')).records.length, 1);
  await coach.coach.setPayment(uid, null);
  assert.strictEqual((await coach.coach.clients())[0].paidUntil, null);
  await cli.account.deleteAccount();                                  // borrar la cuenta siempre se puede
  assert.strictEqual(Object.values(backend.users).some((u) => u.id === uid), false);
});
