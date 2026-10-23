// Sprint 11: medidas de cuerpo (medidas.js, puro) y su validación en Schema v5.
const test = require('node:test');
const assert = require('node:assert');
const M = require('../medidas.js');
const Schema = require('../schema.js');

const E = [
  { id: 'a', date: '2026-09-01', neck: 34, armR: 29, waist: 84, thighL: 58 },
  { id: 'b', date: '2026-10-01', neck: 33.5, armR: 28, waist: 80 },
  { id: 'c', date: '2026-10-20', weight: 70 },
];
test('las 7 medidas de la maqueta, en su orden', () => {
  assert.deepStrictEqual(M.MEASURES.map((m) => m.label), ['Cuello', 'Brazo der.', 'Brazo izq.', 'Espalda', 'Cintura', 'Muslo der.', 'Muslo izq.']);
  assert.deepStrictEqual(M.KEYS, ['neck', 'armR', 'armL', 'back', 'waist', 'thighR', 'thighL']);
});
test('series: ordenada y sin registros que no la traen', () => {
  assert.deepStrictEqual(M.series([...E].reverse(), 'neck'), [{ date: '2026-09-01', value: 34 }, { date: '2026-10-01', value: 33.5 }]);
  assert.deepStrictEqual(M.series(E, 'back'), []);
});
test('summary: Inicio / Hoy / Cambio; baja = down, una sola medida = sin cambio', () => {
  const s = Object.fromEntries(M.summary(E).map((r) => [r.key, r]));
  assert.deepStrictEqual([s.neck.startText, s.neck.todayText, s.neck.changeText, s.neck.dir], ['34', '33,5', '−0,5', 'down']);
  assert.deepStrictEqual([s.waist.startText, s.waist.todayText, s.waist.changeText], ['84', '80', '−4']);
  assert.deepStrictEqual([s.thighL.changeText, s.thighL.dir, s.thighL.todayText], ['—', 'none', '58']);
  assert.deepStrictEqual([s.back.startText, s.back.count], ['—', 0]);
  assert.strictEqual(M.fmtChange(1), '+1'); assert.strictEqual(M.fmtChange(0), '0'); assert.strictEqual(M.fmtChange(-1.5), '−1,5');
});
test('chart: línea dentro del lienzo; un punto = punto centrado; sin datos = null', () => {
  const c = M.chart(M.series(E, 'neck'), { w: 300, h: 100 });
  assert.match(c.d, /^M\d/);
  assert.ok(c.pts.every((p) => p.x >= 0 && p.x <= 300 && p.y >= 0 && p.y <= 100));
  assert.ok(c.pts[0].y < c.pts[1].y, 'el valor menor queda más abajo (y mayor)');
  assert.strictEqual(c.dir, 'down');
  const one = M.chart([{ date: '2026-10-01', value: 80 }]);
  assert.strictEqual(one.d, ''); assert.strictEqual(one.pts.length, 1);
  assert.strictEqual(M.chart([]), null);
  assert.match(M.chartLabel('Cuello', c), /de 34 cm a 33,5 cm/);
});
test('Schema v5: guarda las medidas nuevas, el peso no es obligatorio y los rangos se respetan', () => {
  const { state, warnings } = Schema.normalize({ schemaVersion: 5, entries: [
    { id: '11111111-1111-4111-8111-111111111111', date: '2026-10-01', armR: 29.5, armL: 28, back: 38, thighR: 58, thighL: 57.5 },
    { id: '22222222-2222-4222-8222-222222222222', date: '2026-10-02', armR: 500 },
    { id: '33333333-3333-4333-8333-333333333333', date: '2026-10-03', note: 'solo nota' },
  ], foods: {}, habits: {}, library: {} });
  assert.strictEqual(state.entries.length, 1);
  assert.deepStrictEqual([state.entries[0].armR, state.entries[0].armL, state.entries[0].back, state.entries[0].thighR, state.entries[0].thighL], [29.5, 28, 38, 58, 57.5]);
  assert.strictEqual(state.entries[0].weight, undefined);
  assert.ok(warnings.some((w) => /armR/.test(w)) && warnings.some((w) => /sin medidas/.test(w)));
});
test('Schema v5: un respaldo v4 se migra sin cambiar ningún dato y un v6 se rechaza', () => {
  const v4 = { schemaVersion: 4, profile: null, entries: [{ id: '11111111-1111-4111-8111-111111111111', date: '2026-10-01', weight: 70, waist: 80, updatedAt: '2026-10-01T10:00:00.000Z' }], foods: {}, habits: {}, library: {}, deleted: { entries: [], foods: [], habits: [], photos: [] } };
  const m = Schema.migrate(v4);
  assert.strictEqual(m.schemaVersion, 5);
  assert.deepStrictEqual(m.entries, v4.entries);
  const { state } = Schema.normalize(m);
  assert.deepStrictEqual(state.entries[0], v4.entries[0]);
  assert.throws(() => Schema.migrate({ ...v4, schemaVersion: 6 }), /más nueva/);
});
test('las medidas nuevas viajan por la frontera de sincronización (data del entry)', () => {
  const Sync = require('../sync.js');
  const st = Schema.normalize({ schemaVersion: 5, entries: [{ id: '11111111-1111-4111-8111-111111111111', date: '2026-10-01', armR: 29.5, updatedAt: '2026-10-01T10:00:00.000Z' }], foods: {}, habits: {}, library: {} }).state;
  const wire = Sync.toWire(st, {});
  assert.deepStrictEqual(wire[0].data, { date: '2026-10-01', armR: 29.5 });
  const back = Sync.remoteState(wire);
  assert.strictEqual(back.entries[0].armR, 29.5);
});
