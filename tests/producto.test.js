// Sprint 11: modo producto coach / solo con cuenta (producto.js) y textos de la autorización única (consent-texts-solo.js).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const Producto = require('../producto.js');
const CT = require('../consent-texts.js');
require('../consent-texts-solo.js');

test('la app oficial (config.js) NO trae producto ni soloNube; la de pruebas sí', () => {
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  assert.ok(!/producto|soloNube/.test(read('config.js')), 'config.js no se toca');
  assert.match(read('config.pruebas.js'), /soloNube:\s*true/);
  assert.match(read('config.pruebas.js'), /producto:\s*'coach'/);
  const load = (f) => { const w = {}; new Function('window', read(f))(w); return w.PG_CONFIG; };
  assert.deepStrictEqual(Producto.read(load('config.js')), { coach: false, soloNube: false });
  assert.deepStrictEqual(Producto.read(load('config.pruebas.js')), { coach: true, soloNube: true });
});
test('read: solo producto exactamente «coach» y soloNube exactamente true', () => {
  assert.deepStrictEqual(Producto.read({}), { coach: false, soloNube: false });
  assert.deepStrictEqual(Producto.read(null), { coach: false, soloNube: false });
  assert.deepStrictEqual(Producto.read({ producto: 'Coach', soloNube: 'true' }), { coach: false, soloNube: false });
  assert.deepStrictEqual(Producto.read({ producto: 'coach' }), { coach: true, soloNube: false });
});
test('AU: registra los dos consentimientos que exige el servidor con la misma versión y valida la copia en la nube', () => {
  assert.deepStrictEqual(CT.kinds('AU'), ['sensitive_health', 'cloud_transfer']);
  assert.match(CT.fullText('AU'), /^Autorizo a José Granados a tratar mis medidas de cuerpo y mis hábitos/);
  assert.match(CT.fullText('AU'), /Supabase, servidores en EE\. UU\.[\s\S]*Brevo[\s\S]*retirarla borrando mi cuenta/);
  const v = CT.version('AU');
  const ev = (kind) => ({ granted: true, version: v, textHash: 'a'.repeat(64), clientAt: '2026-10-01T00:00:00.000Z' });
  assert.strictEqual(CT.cloudAllowed({}), false);
  assert.strictEqual(CT.cloudAllowed({ consents: { sensitive_health: ev(), cloud_transfer: ev() } }), true);
  assert.strictEqual(CT.cloudAllowed({ consents: { sensitive_health: ev() } }), false, 'con una sola mitad no basta');
  assert.strictEqual(CT.cloudAllowed({ consents: { sensitive_health: { ...ev(), version: 'otra' }, cloud_transfer: ev() } }), false);
});
test('los textos v0.3 de siempre no cambian (A3, A4 y A5 intactos)', () => {
  assert.strictEqual(CT.version('A3'), '0.3-A3'); assert.strictEqual(CT.version('A4'), '0.3-A4'); assert.strictEqual(CT.version('A5'), 'compartir-2');
  assert.match(CT.fullText('A5', { coach: 'Laura' }), /- Comidas\n- Hábitos/);
});
test('A5c: solo medidas, hábitos y fotos; sin comidas ni notas', () => {
  const t = CT.fullText('A5c', { coach: 'Laura' });
  assert.match(t, /^Compartir con Laura/);
  assert.match(t, /- Medidas de cuerpo[\s\S]*- Hábitos[\s\S]*- Fotos/);
  assert.ok(!/Comidas|Notas/.test(t));
  assert.strictEqual(CT.shareId(true), 'A5c'); assert.strictEqual(CT.shareId(false), 'A5');
  assert.strictEqual(CT.shareMigrationNeeded({ link: {}, shareVersion: CT.version('A5c') }), false);
  assert.strictEqual(CT.shareMigrationNeeded({ link: {}, shareVersion: CT.version('A5') }), false);
  assert.strictEqual(CT.shareMigrationNeeded({ link: {}, shareVersion: 'compartir-1' }), true);
});
