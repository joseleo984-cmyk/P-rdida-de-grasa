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
test('las 7 medidas de la maqueta siguen en su orden, ahora con peso al inicio y abdomen y cadera junto a la cintura', () => {
  assert.deepStrictEqual(M.MEASURES.map((m) => m.label), ['Peso', 'Cuello', 'Brazo der.', 'Brazo izq.', 'Espalda', 'Cintura', 'Abdomen', 'Cadera', 'Muslo der.', 'Muslo izq.']);
  assert.deepStrictEqual(M.KEYS, ['weight', 'neck', 'armR', 'armL', 'back', 'waist', 'abdomen', 'hip', 'thighR', 'thighL']);
  assert.deepStrictEqual(M.KEYS.filter((k) => !['weight', 'abdomen', 'hip'].includes(k)), ['neck', 'armR', 'armL', 'back', 'waist', 'thighR', 'thighL'], 'las otras siete, como estaban');
  assert.deepStrictEqual(M.REQUIRED, ['weight', 'abdomen', 'hip']);
  assert.deepStrictEqual([M.unitOf('weight'), M.unitOf('abdomen'), M.unitOf('hip'), M.unitOf('neck')], ['kg', 'cm', 'cm', 'cm']);
});
test('missing / missingText: solo peso, abdomen y cadera son obligatorios; lo que ya tiene el registro de ese día no se vuelve a exigir', () => {
  assert.deepStrictEqual(M.missing({ neck: 34 }).map((m) => m.key), ['weight', 'abdomen', 'hip']);
  assert.deepStrictEqual(M.missing({ weight: 70, abdomen: 90 }).map((m) => m.key), ['hip']);
  assert.deepStrictEqual(M.missing({ weight: 70, abdomen: 90, hip: 100 }), []);
  assert.deepStrictEqual(M.missing({ hip: 100 }, { weight: 70, abdomen: 90 }), [], 'el registro del día ya los tiene');
  assert.deepStrictEqual(M.missing({}, { date: '2026-10-01', weight: 70 }).map((m) => m.key), ['abdomen', 'hip']);
  assert.strictEqual(M.missingText(M.missing({ weight: 70, hip: 100 })), 'Falta «Abdomen» (cm): es obligatoria.');
  assert.strictEqual(M.missingText(M.missing({})), 'Faltan «Peso» (kg), «Abdomen» (cm) y «Cadera» (cm): son obligatorias.');
  assert.strictEqual(M.missingText([]), '');
});
test('el historial importado y los registros viejos (sin peso, abdomen ni cadera) siguen siendo válidos en el esquema', () => {
  const { state, warnings } = Schema.normalize({ schemaVersion: 5, entries: [
    { id: '11111111-1111-4111-8111-111111111111', date: '2026-09-01', neck: 34 },
    { id: '22222222-2222-4222-8222-222222222222', date: '2026-09-02', abdomen: 91.5 },
    { id: '33333333-3333-4333-8333-333333333333', date: '2026-09-03', weight: 70, abdomen: 5 },
  ], foods: {}, habits: {}, library: {} });
  assert.deepStrictEqual(state.entries.map((e) => [e.date, e.weight, e.abdomen]), [['2026-09-01', undefined, undefined], ['2026-09-02', undefined, 91.5], ['2026-09-03', 70, undefined]]);
  assert.ok(warnings.some((w) => /abdomen/.test(w)), 'un abdomen fuera de rango (5 cm) se descarta con aviso');
  assert.deepStrictEqual(Schema.RANGES.abdomen, [30, 250]);
});
test('summary con peso (kg), abdomen y cadera: inicio, hoy y cambio con su unidad', () => {
  const rows = M.summary([{ id: 'a', date: '2026-09-01', weight: 80, abdomen: 100, hip: 105 }, { id: 'b', date: '2026-10-01', weight: 78.5, abdomen: 96, hip: 104 }]);
  const r = Object.fromEntries(rows.map((x) => [x.key, x]));
  assert.deepStrictEqual([r.weight.unit, r.weight.startText, r.weight.todayText, r.weight.changeText], ['kg', '80', '78,5', '−1,5']);
  assert.deepStrictEqual([r.abdomen.changeText, r.hip.changeText, r.abdomen.unit], ['−4', '−1', 'cm']);
  assert.match(M.chartLabel('Peso', M.chart(M.series([{ date: '2026-09-01', weight: 80 }, { date: '2026-10-01', weight: 78.5 }], 'weight')), 'kg'), /^Peso: de 80 kg a 78,5 kg en 2 registros$/);
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
test('Schema v5: guarda las medidas nuevas, el peso no es obligatorio en el esquema y los rangos se respetan', () => {
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
test('Schema v6: un respaldo v4 se migra sin cambiar ningún dato y un v7 se rechaza', () => {
  const v4 = { schemaVersion: 4, profile: null, entries: [{ id: '11111111-1111-4111-8111-111111111111', date: '2026-10-01', weight: 70, waist: 80, updatedAt: '2026-10-01T10:00:00.000Z' }], foods: {}, habits: {}, library: {}, deleted: { entries: [], foods: [], habits: [], photos: [] } };
  const m = Schema.migrate(v4);
  assert.strictEqual(m.schemaVersion, 6);
  assert.deepStrictEqual(m.entries, v4.entries);
  const { state } = Schema.normalize(m);
  assert.deepStrictEqual(state.entries[0], v4.entries[0]);
  assert.throws(() => Schema.migrate({ ...v4, schemaVersion: 7 }), /más nueva/);
});
test('las medidas nuevas viajan por la frontera de sincronización (data del entry)', () => {
  const Sync = require('../sync.js');
  const st = Schema.normalize({ schemaVersion: 5, entries: [{ id: '11111111-1111-4111-8111-111111111111', date: '2026-10-01', armR: 29.5, updatedAt: '2026-10-01T10:00:00.000Z' }], foods: {}, habits: {}, library: {} }).state;
  const wire = Sync.toWire(st, {});
  assert.deepStrictEqual(wire[0].data, { date: '2026-10-01', armR: 29.5 });
  const back = Sync.remoteState(wire);
  assert.strictEqual(back.entries[0].armR, 29.5);
});

test('Schema v6: esfuerzo y cierre del día son opcionales, se validan y viajan por la frontera de sincronización; un respaldo v5 los deja sin valor', () => {
  const H = (h) => Schema.normalize({ schemaVersion: 6, entries: [], foods: {}, habits: { '2026-10-20': { id: '11111111-1111-4111-8111-111111111111', trained: true, updatedAt: '2026-10-20T10:00:00.000Z', ...h } }, library: {} }).state.habits['2026-10-20'];
  assert.strictEqual(H({ effort: 'duro', close: 'casi' }).effort, 'duro');
  assert.strictEqual(H({ effort: 'duro', close: 'casi' }).close, 'casi');
  for (const e of ['facil', 'normal', 'duro', 'no_termine']) assert.strictEqual(H({ effort: e }).effort, e);
  for (const c of ['si', 'casi', 'no']) assert.strictEqual(H({ close: c }).close, c);
  assert.ok(!('effort' in H({ effort: 'extremo' })) && !('close' in H({ close: 'tal vez' })), 'los valores desconocidos se descartan');
  assert.ok(!('effort' in H({})) && !('close' in H({})));
  const v5 = Schema.migrate({ schemaVersion: 5, entries: [], foods: {}, habits: { '2026-10-20': { id: '11111111-1111-4111-8111-111111111111', trained: true, water: 2, updatedAt: '2026-10-20T10:00:00.000Z' } }, library: {} });
  assert.strictEqual(v5.schemaVersion, 6);
  assert.deepStrictEqual(v5.habits['2026-10-20'], { id: '11111111-1111-4111-8111-111111111111', trained: true, water: 2, updatedAt: '2026-10-20T10:00:00.000Z' });
  const Sync = require('../sync.js');
  const st = Schema.normalize({ schemaVersion: 6, entries: [], foods: {}, habits: { '2026-10-20': { id: '11111111-1111-4111-8111-111111111111', trained: true, effort: 'normal', close: 'si', updatedAt: '2026-10-20T10:00:00.000Z' } }, library: {} }).state;
  const wire = Sync.toWire(st, {});
  assert.deepStrictEqual(wire[0].data, { trained: true, effort: 'normal', close: 'si', date: '2026-10-20' });
  const back = Sync.remoteState(wire);
  assert.strictEqual(back.habits['2026-10-20'].effort, 'normal');
  assert.strictEqual(back.habits['2026-10-20'].close, 'si');
});
