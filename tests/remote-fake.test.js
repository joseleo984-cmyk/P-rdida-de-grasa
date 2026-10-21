// S3-2: implementación falsa de Remote (remote-fake.js) y Remote.config() (equipo/r1-contrato.md §3-§4).
const test = require('node:test');
const assert = require('node:assert');
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
  assert.strictEqual(Remote.config({ location: { hostname: 'staging.example.org', search: '?remote=fake' } }).mode, 'fake');
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
  await rejects(a.coach.becomeCoach('X'), 'invalid');
  const { inviteCode } = await a.coach.becomeCoach('Coach Ana');
  assert.match(inviteCode, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  assert.deepStrictEqual((await a.coach.becomeCoach('Otro nombre')).inviteCode, inviteCode, 'idempotente');
  assert.deepStrictEqual(await a.account.roles(), ['client', 'coach']);
  await rejects(a.account.recordConsents([{ kind: 'inventado', granted: true, version: '1', textHash: H, clientAt: T0 }]), 'invalid');
  await rejects(a.account.recordConsents([{ kind: 'terms', granted: true, version: '0.2', clientAt: T0 }]), 'invalid'); // v1.1: sin textHash
  await a.account.recordConsents([{ kind: 'terms', granted: true, version: '0.2', textHash: H, clientAt: T0 }, { kind: 'terms', granted: false, version: '0.2', textHash: H, clientAt: T0 }]);
  assert.deepStrictEqual((await a.account.consents()).terms, { granted: false, version: '0.2', textHash: H, clientAt: T0 });
  assert.strictEqual(backend.consentEvents.length, 2);
});

test('cliente ↔ coach: código, vínculo único, filtros del coach (sin note, sin library) y fin del vínculo', async () => {
  const { backend, dev } = setup();
  const coach = dev(), cli = dev(), otro = dev();
  await login(coach, backend, 'coach@x.co'); await coach.account.joinApp();
  const { inviteCode } = await coach.coach.becomeCoach('Fit Ana');
  await login(cli, backend, 'cli@x.co'); await cli.account.joinApp();
  await login(otro, backend, 'otro@x.co'); await otro.account.joinApp(); await otro.coach.becomeCoach('Otro');
  await rejects(cli.client.previewCode('ZZZZZZ'), 'invalid_code');
  assert.deepStrictEqual(await cli.client.previewCode(inviteCode.toLowerCase()), { businessName: 'Fit Ana' });
  await rejects(cli.client.joinCoach(inviteCode, { body: false, ...SH }), 'invalid');
  await rejects(cli.client.joinCoach(inviteCode, { body: true }), 'invalid'); // v1.1: sin version/textHash
  const link = await cli.client.joinCoach(inviteCode, { body: true, notes: false, nutrition: true, habits: false, photos: false, ...SH });
  assert.strictEqual(link.businessName, 'Fit Ana');
  assert.strictEqual(backend.consentEvents.filter((e) => e.kind.startsWith('share_')).length, 5);
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
  await login(m1, backend, 'd@x.co');
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

test('Remote.create (real) aún no implementado: errores claros, session() null', async () => {
  const r = Remote.create({ url: 'https://abc.supabase.co', key: 'sb_publishable_x' });
  assert.strictEqual(await r.auth.session(), null);
  await assert.rejects(r.auth.sendCode('a@b.co'), (e) => e.code === 'server');
});

test('v1.1: rotateCode con caducidad y usos; código caducado o agotado = invalid_code; coach inactivo pierde acceso', async () => {
  const { backend, clock, dev } = setup();
  const coach = dev(), c1 = dev(), c2 = dev();
  await login(coach, backend, 'k@x.co'); await coach.account.joinApp(); await coach.coach.becomeCoach('Coach K');
  await rejects(coach.coach.rotateCode({ validDays: 0 }), 'invalid');
  const code = await coach.coach.rotateCode({ validDays: 7, maxUses: 1 });
  const me = await coach.coach.myCoach();
  assert.strictEqual(me.inviteCode, code);
  assert.strictEqual(me.maxUses, 1);
  assert.strictEqual(me.uses, 0);
  assert.strictEqual(Date.parse(me.expiresAt), clock.now() + 7 * 86400000);
  await login(c1, backend, 'c1@x.co'); await c1.account.joinApp();
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
