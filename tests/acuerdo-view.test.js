// Sprint 10: «Mi acuerdo» (acuerdo-view.js, puro) y los textos por versión de consent-texts.js.
const test = require('node:test');
const assert = require('node:assert');
const CT = require('../consent-texts.js');
const AV = require('../acuerdo-view.js');
const Remote = require('../remote.js');

const TEXT = CT.fullText('A7');
const VER = CT.version('A7');
const metaWith = async (over = {}) => ({ email: 'coach@x.co', consents: { coach_agreement: { granted: true, version: VER, textHash: await Remote.textHash(TEXT), clientAt: '2026-10-22T15:30:00.000Z', ...over } } });

test('consent-texts: agreementTexts/agreementText devuelven el texto EXACTO de la versión vigente (el que se hashea al aceptar)', () => {
  assert.strictEqual(CT.agreementText(VER), CT.fullText('A7'));
  assert.deepStrictEqual(Object.keys(CT.agreementTexts()).includes(VER), true);
  assert.strictEqual(CT.agreementText('no-existe'), null);
  assert.strictEqual(CT.agreementText('__proto__'), null);
});

test('resolve: sin aceptar o retirado → none', async () => {
  assert.strictEqual((await AV.resolve({}, CT, Remote.textHash)).state, 'none');
  assert.strictEqual((await AV.resolve(await metaWith({ granted: false }), CT, Remote.textHash)).state, 'none');
  assert.strictEqual((await AV.resolve(null, CT, Remote.textHash)).state, 'none');
});

test('resolve: vigente con huella que coincide → ok con el texto exacto, versión, fecha y huella abreviada', async () => {
  const meta = await metaWith();
  const r = await AV.resolve(meta, CT, Remote.textHash);
  assert.strictEqual(r.state, 'ok');
  assert.strictEqual(r.text, TEXT);
  assert.strictEqual(r.version, VER);
  assert.strictEqual(r.hash, meta.consents.coach_agreement.textHash);
  assert.match(r.hashShort, /^[0-9a-f]{8}…[0-9a-f]{8}$/);
  assert.strictEqual(r.at, '2026-10-22T15:30:00.000Z');
});

test('resolve: huella distinta → mismatch sin texto; versión anterior desconocida → outdated sin texto', async () => {
  const bad = await AV.resolve(await metaWith({ textHash: 'a'.repeat(64) }), CT, Remote.textHash);
  assert.strictEqual(bad.state, 'mismatch');
  assert.strictEqual(bad.text, null);
  const old = await AV.resolve(await metaWith({ version: '0.1-A7' }), CT, Remote.textHash);
  assert.strictEqual(old.state, 'outdated');
  assert.strictEqual(old.text, null);
  assert.strictEqual(old.currentVersion, VER);
});

test('resolve: una versión anterior conservada con su huella se muestra tal cual y pide re-aceptar', async () => {
  const OLD = 'Texto viejo del acuerdo\nAcepto.';
  const ct = { ...CT, version: () => '0.4-A7', agreementText: (v) => (v === '0.3-A7' ? OLD : null) };
  const r = await AV.resolve({ consents: { coach_agreement: { granted: true, version: '0.3-A7', textHash: await Remote.textHash(OLD), clientAt: '2026-10-22T15:30:00.000Z' } } }, ct, Remote.textHash);
  assert.strictEqual(r.state, 'outdated');
  assert.strictEqual(r.text, OLD);
});

test('shortHash y when', () => {
  assert.strictEqual(AV.shortHash('0123456789abcdef'.repeat(4)), '01234567…89abcdef');
  assert.strictEqual(AV.shortHash(''), '');
  assert.match(AV.when('2026-10-22T15:30:00.000Z', 'America/Bogota'), /22 de octubre de 2026/);
  assert.match(AV.when('2026-10-22T15:30:00.000Z', 'America/Bogota'), /10:30/);
  assert.strictEqual(AV.when('nada'), 'No disponible');
});

test('copia descargable: texto y HTML llevan el texto exacto, versión, fecha y la huella COMPLETA; el HTML va escapado', async () => {
  const meta = await metaWith();
  const r = await AV.resolve(meta, CT, Remote.textHash);
  const t = AV.fileText(r, 'coach@x.co');
  assert.ok(t.includes(TEXT) && t.includes(VER) && t.includes(r.hash) && t.includes('coach@x.co'));
  const h = AV.fileHtml(r, 'coach@x.co');
  assert.ok(h.startsWith('<!doctype html>') && h.includes(r.hash) && h.includes('@media print'));
  assert.ok(!/<script/i.test(h) && !/https?:\/\//.test(h), 'sin scripts ni recursos externos');
  const evil = AV.fileHtml({ ...r, text: '<script>alert(1)</script>', version: '<b>x</b>' }, '"><img src=x>');
  assert.ok(!evil.includes('<script>alert') && !evil.includes('<img src=x>') && !evil.includes('<b>x</b>'));
  assert.strictEqual(AV.fileName(r), `acuerdo-del-coach-${VER}.html`);
  assert.strictEqual(AV.fileName({ version: 'a/b c' }, 'txt'), 'acuerdo-del-coach-a_b_c.txt');
});

test('mensajes del envío por correo: amables y sin términos técnicos; cualquier código raro es «unavailable»', () => {
  for (const k of ['sent', 'rate_limited', 'offline', 'auth', 'unavailable']) assert.ok(AV.COPY_TEXT[k] && !/error|500|404|función|edge|brevo/i.test(AV.COPY_TEXT[k]), k);
  assert.strictEqual(AV.copyKey('rate_limited'), 'rate_limited');
  assert.strictEqual(AV.copyKey('offline'), 'offline');
  assert.strictEqual(AV.copyKey('auth'), 'auth');
  assert.strictEqual(AV.copyKey('server'), 'unavailable');
  assert.strictEqual(AV.copyKey(undefined), 'unavailable');
});

test('M6: una versión anterior que SIGUE valiendo (A7_STILL_VALID, producto coach) → previous con su texto, no pide re-aceptar', async () => {
  const OLD = 'Texto 0.4 del acuerdo\nAcepto.';
  const ct = { ...CT, version: () => '0.5-A7-coach', A7_STILL_VALID: ['0.4-A7-coach', '0.5-A7-coach'], agreementText: (v) => (v === '0.4-A7-coach' ? OLD : null) };
  const meta = { consents: { coach_agreement: { granted: true, version: '0.4-A7-coach', textHash: await Remote.textHash(OLD), clientAt: '2026-10-24T15:30:00.000Z' } } };
  const r = await AV.resolve(meta, ct, Remote.textHash);
  assert.strictEqual(r.state, 'previous');
  assert.strictEqual(r.text, OLD);
  assert.strictEqual(r.currentVersion, '0.5-A7-coach');
  const gone = await AV.resolve({ consents: { coach_agreement: { ...meta.consents.coach_agreement, version: '0.3-A7' } } }, ct, Remote.textHash);
  assert.strictEqual(gone.state, 'outdated', 'una versión que ya no vale sigue pidiendo re-aceptar');
});
