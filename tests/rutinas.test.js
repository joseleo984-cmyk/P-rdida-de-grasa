// Etapa 2: rutinas.js (lógica pura): firma de bytes, tipo y tamaño del GIF, forma y límites de la rutina, textos.
const test = require('node:test');
const assert = require('node:assert');
const R = require('../rutinas.js');

const bytes = (s, pad = 12) => Uint8Array.from([...Buffer.from(s, 'latin1'), ...new Array(Math.max(0, pad - s.length)).fill(0)]);
const GIF89 = bytes('GIF89a');
const GIF87 = bytes('GIF87a');
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

test('sniff: GIF87a, GIF89a y WebP (RIFF…WEBP) se reconocen; PNG, texto y poco contenido, no', () => {
  assert.strictEqual(R.sniff(GIF89), 'image/gif');
  assert.strictEqual(R.sniff(GIF87), 'image/gif');
  assert.strictEqual(R.sniff(WEBP), 'image/webp');
  assert.strictEqual(R.sniff(PNG), null);
  assert.strictEqual(R.sniff(bytes('<html>hola')), null);
  assert.strictEqual(R.sniff(Uint8Array.from([0x47, 0x49, 0x46])), null);
  assert.strictEqual(R.sniff(null), null);
  assert.strictEqual(R.sniff(bytes('RIFF....WAVE')), null);
});
test('toHex da los bytes en minúsculas (lo que valida register_gif en el servidor)', () => {
  assert.strictEqual(R.toHex(GIF89), '474946383961000000000000');
  assert.strictEqual(R.toHex(WEBP), '524946462400000057454250');
});
test('checkGif: tipo, tamaño y firma de bytes; cada rechazo trae un mensaje claro', () => {
  assert.deepStrictEqual(R.checkGif({ type: 'image/gif', size: 1000 }, GIF89), { ok: true, mime: 'image/gif' });
  assert.deepStrictEqual(R.checkGif({ type: 'image/webp', size: 1000 }, WEBP), { ok: true, mime: 'image/webp' });
  assert.deepStrictEqual(R.checkGif({ type: '', size: 1000 }, GIF89), { ok: true, mime: 'image/gif' }, 'algunos teléfonos no informan el tipo: valen los bytes');
  assert.strictEqual(R.checkGif({ type: 'image/gif', size: R.LIMITS.gifBytes }, GIF89).ok, true, 'exactamente 3 MB sí');
  const big = R.checkGif({ type: 'image/gif', size: R.LIMITS.gifBytes + 1 }, GIF89);
  assert.strictEqual(big.ok, false); assert.match(big.message, /3 MB/);
  assert.match(R.checkGif({ type: 'image/gif', size: 0 }, GIF89).message, /vacío/);
  assert.match(R.checkGif({ type: 'image/png', size: 10 }, PNG).message, /GIF o WebP/);
  assert.match(R.checkGif({ type: 'video/mp4', size: 10 }, GIF89).message, /GIF o WebP/);
  assert.match(R.checkGif({ type: 'image/gif', size: 10 }, PNG).message, /de verdad/, 'un PNG con extensión .gif se rechaza por sus bytes');
  assert.match(R.checkGif({ type: 'image/webp', size: 10 }, GIF89).message, /de verdad/, 'el tipo declarado no coincide con los bytes');
  assert.strictEqual(R.checkGif(null, GIF89).ok, false);
});
test('suggestName: nombre del archivo sin extensión ni guiones', () => {
  assert.strictEqual(R.suggestName('press-banca_plano.gif'), 'press banca plano');
  assert.strictEqual(R.suggestName('  Sentadilla.WEBP '), 'Sentadilla');
  assert.strictEqual(R.suggestName('x'.repeat(100) + '.gif').length, 60);
  assert.strictEqual(R.suggestName(null), '');
});

const ok = () => ({ title: 'Fuerza', days: [{ title: 'Día 1 – Pecho', exercises: [{ name: 'Press', sets: '4 × 12', note: '', gif: '' }] }] });
test('validate: una rutina completa es válida; los textos de los errores son claros y dicen dónde', () => {
  assert.deepStrictEqual(R.validate(ok()), { ok: true, errors: [] });
  const r = ok(); r.title = '  ';
  assert.match(R.validate(r).errors[0].message, /título/);
  const d = ok(); d.days[0].title = '';
  assert.deepStrictEqual([R.validate(d).errors[0].day, R.validate(d).errors[0].field], [0, 'title']);
  assert.match(R.validate(d).errors[0].message, /día 1/);
  const e = ok(); e.days[0].exercises[0].name = '';
  assert.match(R.validate(e).errors[0].message, /día 1, ejercicio 1: escribe el nombre/);
  const s = ok(); s.days[0].exercises[0].sets = '';
  assert.match(R.validate(s).errors[0].message, /«Press»\): escribe las series y repeticiones, por ejemplo «4 × 12»/);
  assert.strictEqual(R.validate({ title: 'T', days: [] }).ok, false);
  assert.strictEqual(R.validate(null).ok, false);
});
test('validate: máx. 7 días y 12 ejercicios por día; título 60, nombre 60, series 30, nota 200; gif = uuid', () => {
  const days = (n) => ({ title: 'T', days: Array.from({ length: n }, (_, i) => ({ title: `Día ${i + 1}`, exercises: [] })) });
  assert.strictEqual(R.validate(days(7)).ok, true, 'un día sin ejercicios es de descanso');
  assert.strictEqual(R.validate(days(8)).ok, false);
  const ex = (n) => ({ title: 'T', days: [{ title: 'D', exercises: Array.from({ length: n }, (_, i) => ({ name: 'E' + i, sets: '3 × 10' })) }] });
  assert.strictEqual(R.validate(ex(12)).ok, true);
  assert.match(R.validate(ex(13)).errors[0].message, /hasta 12 ejercicios/);
  const lim = (f, n, v) => { const r = ok(); if (f === 'title') r.title = 'x'.repeat(n); else r.days[0].exercises[0][f] = v || 'x'.repeat(n); return R.validate(r).ok; };
  assert.deepStrictEqual([lim('title', 60), lim('title', 61), lim('name', 60), lim('name', 61), lim('sets', 30), lim('sets', 31), lim('note', 200), lim('note', 201)],
    [true, false, true, false, true, false, true, false]);
  assert.strictEqual(lim('gif', 0, 'a0000000-0000-4000-8000-000000000001'), true);
  assert.strictEqual(lim('gif', 0, 'no-es-uuid'), false);
});
test('toContent: sin ejercicios vacíos ni claves de más; note y gif solo si existen; el gif va en minúsculas', () => {
  const r = { title: 'T', days: [{ title: ' Día 1 ', exercises: [
    { name: ' Press ', sets: ' 4 × 12 ', note: '', gif: '' },
    { name: '', sets: '', note: '', gif: '' },
    { name: 'Remo', sets: '3 × 8', note: ' lento ', gif: 'A0000000-0000-4000-8000-000000000001' }] }] };
  assert.deepStrictEqual(R.toContent(r), { days: [{ title: 'Día 1', exercises: [{ name: 'Press', sets: '4 × 12' }, { name: 'Remo', sets: '3 × 8', note: 'lento', gif: 'a0000000-0000-4000-8000-000000000001' }] }] });
  assert.deepStrictEqual(R.toContent(null), { days: [] });
});
test('fromServer: contenido del servidor → forma de la app con todos los textos; null si no hay fila', () => {
  assert.strictEqual(R.fromServer(null), null);
  const r = R.fromServer({ id: 'i', coach_id: 'c', client_id: 'k', title: ' T ', updated_at: 'U', content: { days: [{ title: 'D', exercises: [{ name: 'E', sets: '3 × 10', gif: 'g' }] }] } });
  assert.deepStrictEqual(r, { id: 'i', coachId: 'c', clientId: 'k', title: 'T', updatedAt: 'U', days: [{ title: 'D', exercises: [{ name: 'E', sets: '3 × 10', note: '', gif: 'g' }] }] });
});
test('summary, dayLine, gifIds y fmtSize', () => {
  assert.strictEqual(R.summary({ days: [{ exercises: [1, 2] }, { exercises: [] }, { exercises: [3] }] }), '3 días · 3 ejercicios');
  assert.strictEqual(R.summary({ days: [{ exercises: [1] }] }), '1 día · 1 ejercicio');
  assert.strictEqual(R.dayLine({ exercises: [] }), 'Día de descanso');
  assert.strictEqual(R.dayLine({ exercises: [1, 2] }), '2 ejercicios');
  assert.deepStrictEqual(R.gifIds({ days: [{ exercises: [{ gif: 'a' }, {}] }, { exercises: [{ gif: 'b' }] }] }), ['a', 'b']);
  assert.strictEqual(R.fmtSize(120000), '117 KB');
  assert.match(R.fmtSize(3 * 1048576), /^3 MB$/);
});
test('blankRoutine: un día con un ejercicio vacío listo para escribir', () => {
  assert.deepStrictEqual(R.blankRoutine(), { title: '', days: [{ title: 'Día 1', exercises: [{ name: '', sets: '', note: '', gif: '' }] }] });
});
