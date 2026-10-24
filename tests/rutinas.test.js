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
  assert.match(R.checkGif({ type: 'video/mp4', size: 10 }, GIF89).message, /de verdad/, 'bytes de GIF con tipo video/mp4 se rechazan');
  assert.match(R.checkGif({ type: 'image/gif', size: 10 }, PNG).message, /de verdad/, 'un PNG con extensión .gif se rechaza por sus bytes');
  assert.match(R.checkGif({ type: 'image/webp', size: 10 }, GIF89).message, /de verdad/, 'el tipo declarado no coincide con los bytes');
  assert.strictEqual(R.checkGif(null, GIF89).ok, false);
});
// ---- v1.9: videos cortos ----
const MP4 = Uint8Array.from([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);   // ....ftypisom
const MP42 = Uint8Array.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]);  // ....ftypmp42
const MOV = Uint8Array.from([0, 0, 0, 0x14, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20]);   // ....ftypqt  
const WEBM = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81]);
const MB = 1024 * 1024;
test('sniff: mp4 (ftyp, cualquier marca ISO), mov (marca «qt  ») y webm (EBML)', () => {
  assert.strictEqual(R.sniff(MP4), 'video/mp4');
  assert.strictEqual(R.sniff(MP42), 'video/mp4');
  assert.strictEqual(R.sniff(MOV), 'video/quicktime');
  assert.strictEqual(R.sniff(WEBM), 'video/webm');
  assert.strictEqual(R.sniff(Uint8Array.from([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x71, 0x69, 0x73, 0x6f, 0x6d])), null, 'ftyq no es ftyp');
  assert.strictEqual(R.sniff(Uint8Array.from([0x1a, 0x45, 0xdf, 0xa4, 0, 0, 0, 0, 0, 0, 0, 0])), null, 'EBML con un byte distinto');
});
test('checkGif con videos: tipos, 10 MB, firma, y el GIF sigue en 3 MB', () => {
  assert.deepStrictEqual(R.checkGif({ type: 'video/mp4', size: 5 * MB }, MP4), { ok: true, mime: 'video/mp4' });
  assert.deepStrictEqual(R.checkGif({ type: 'video/quicktime', size: 5 * MB }, MOV), { ok: true, mime: 'video/quicktime' });
  assert.deepStrictEqual(R.checkGif({ type: 'video/webm', size: 5 * MB }, WEBM), { ok: true, mime: 'video/webm' });
  assert.deepStrictEqual(R.checkGif({ type: '', size: 1000 }, MOV), { ok: true, mime: 'video/quicktime' }, 'un .mov sin tipo declarado vale por sus bytes');
  assert.deepStrictEqual(R.checkGif({ type: 'video/mp4', size: 1000 }, MOV), { ok: true, mime: 'video/quicktime' }, 'mov declarado como mp4: se registra como dicen los bytes');
  assert.deepStrictEqual(R.checkGif({ type: 'video/quicktime', size: 1000 }, MP42), { ok: true, mime: 'video/mp4' });
  assert.strictEqual(R.checkGif({ type: 'video/mp4', size: R.LIMITS.videoBytes }, MP4).ok, true, 'exactamente 10 MB sí');
  const big = R.checkGif({ type: 'video/mp4', size: 10 * MB + 1 }, MP4);
  assert.strictEqual(big.ok, false); assert.match(big.message, /pesa 10 MB; el máximo es 10 MB/);
  const v16 = R.checkGif({ type: 'video/webm', size: 16 * MB }, WEBM);
  assert.match(v16.message, /pesa 16 MB; el máximo es 10 MB/);
  assert.match(R.checkGif({ type: 'image/gif', size: 4 * MB }, GIF89).message, /pesa 4 MB; el máximo es 3 MB/, 'un GIF de 4 MB sigue sin pasar');
  assert.strictEqual(R.checkGif({ type: 'image/gif', size: 3 * MB }, GIF89).ok, true);
  assert.match(R.checkGif({ type: 'video/webm', size: 10 }, MP4).message, /de verdad/, 'webm declarado con bytes de mp4');
  assert.match(R.checkGif({ type: 'video/mp4', size: 10 }, WEBM).message, /de verdad/);
  assert.match(R.checkGif({ type: 'video/mp4', size: 10 }, PNG).message, /de verdad/, 'un PNG renombrado a .mp4');
  assert.match(R.checkGif({ type: 'video/avi', size: 10 }, MP4).message, /tipo de archivo no sirve/);
  assert.match(R.checkGif({ type: 'application/pdf', size: 10 }, MP4).message, /tipo de archivo no sirve/);
  assert.match(R.checkGif({ type: 'video/mp4', size: 0 }, MP4).message, /vacío/);
});
test('isVideo, maxBytes y accept', () => {
  assert.strictEqual(R.isVideo('video/webm'), true); assert.strictEqual(R.isVideo('image/gif'), false);
  assert.strictEqual(R.maxBytes('video/mp4'), 10 * MB); assert.strictEqual(R.maxBytes('image/webp'), 3 * MB);
  // «video/*» deja que el teléfono ofrezca grabar con la cámara; la validación de verdad sigue en checkGif (otros tipos se rechazan con mensaje claro).
  assert.strictEqual(R.ACCEPT, 'image/gif,image/webp,video/*');
  assert.strictEqual(R.checkGif({ type: 'video/x-matroska', size: 1000, name: 'a.mkv' }, '1a45dfa3010000000000000a').ok, false);
});
test('el selector de archivo de index.html acepta exactamente R.ACCEPT (GIF/WebP y video)', () => {
  const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(html.includes(`id="gif-file" accept="${R.ACCEPT}"`));
  assert.ok(html.includes('Sube un video corto (hasta 15 segundos y 10 MB) o un GIF liviano (hasta 3 MB)'));
});
test('checkDuration: hasta 15 s; más, o ilegible, se rechaza con mensaje', () => {
  assert.strictEqual(R.checkDuration(15).ok, true);
  assert.strictEqual(R.checkDuration(15.04).ok, true, 'redondeo de contenedor');
  assert.strictEqual(R.checkDuration(0.5).ok, true);
  const long = R.checkDuration(20);
  assert.strictEqual(long.ok, false); assert.match(long.message, /dura 20 s; el máximo son 15/);
  assert.match(R.checkDuration(15.5).message, /dura 15,5 s; el máximo son 15/);
  for (const bad of [0, -1, NaN, Infinity, undefined, null]) assert.match(R.checkDuration(bad).message, /No pudimos leer este video/);
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
  assert.deepStrictEqual(r, { id: 'i', coachId: 'c', clientId: 'k', title: 'T', updatedAt: 'U', createdAt: null, visible: true, days: [{ title: 'D', exercises: [{ name: 'E', sets: '3 × 10', note: '', gif: 'g' }] }] });
  assert.strictEqual(R.fromServer({ id: 'i', title: 'T', visible: false, content: { days: [] } }).visible, false, 'visible false se respeta');
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

// ---------- v1.8: biblioteca, asignación y rutina de hoy ----------
test('límites v1.8: 50 plantillas, 20 rutinas por asesorado, 100 asesorados por asignación', () => {
  assert.deepStrictEqual([R.LIMITS.templates, R.LIMITS.perClient, R.LIMITS.assignAtOnce], [50, 20, 100]);
});
test('dailyFromServer: la rutina de hoy llega con su día y sin id propio; sin día no hay rutina', () => {
  assert.strictEqual(R.dailyFromServer(null), null);
  assert.strictEqual(R.dailyFromServer({ title: 'x', content: { days: [] } }), null);
  const d = R.dailyFromServer({ coach_id: 'c', template_id: 't', title: ' Pecho ', day: '2026-10-21', published_at: 'P', content: { days: [{ title: 'D', exercises: [{ name: 'E', sets: '3', gif: 'g' }] }] } });
  assert.deepStrictEqual([d.coachId, d.templateId, d.title, d.day, d.publishedAt, d.id, d.days[0].exercises[0].gif], ['c', 't', 'Pecho', '2026-10-21', 'P', null, 'g']);
});
test('dailyActive: solo el MISMO día calendario; ayer y mañana no', () => {
  const d = { day: '2026-10-21' };
  assert.strictEqual(R.dailyActive(d, '2026-10-21'), true);
  assert.strictEqual(R.dailyActive(d, '2026-10-22'), false);
  assert.strictEqual(R.dailyActive(d, '2026-10-20'), false);
  assert.strictEqual(R.dailyActive(null, '2026-10-21'), false);
  assert.strictEqual(R.dailyActive(d, ''), false);
});
test('localDay: el día del dispositivo en su propia zona (no el UTC)', () => {
  const x = new Date(2026, 9, 21, 23, 30);   // 21 oct, 23:30 hora local
  assert.strictEqual(R.localDay(x), '2026-10-21');
  assert.strictEqual(R.localDay(new Date(2026, 0, 1, 0, 5)), '2026-01-01');
});
test('homeLine: una rutina → título y resumen; varias → «Tienes N rutinas: …»', () => {
  const r = (t) => ({ title: t, days: [{ exercises: [1] }] });
  assert.strictEqual(R.homeLine([]), '');
  assert.strictEqual(R.homeLine([r('Pecho')]), 'Pecho · 1 día · 1 ejercicio');
  assert.strictEqual(R.homeLine([r('A'), r('B')]), 'Tienes 2 rutinas: A y B.');
  assert.strictEqual(R.homeLine([r('A'), r('B'), r('C')]), 'Tienes 3 rutinas: A, B y C.');
  assert.strictEqual(R.homeLine([r('A'), r('B'), r('C'), r('D'), r('E')]), 'Tienes 5 rutinas: A, B, C y 2 más.');
});
