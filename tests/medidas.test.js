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
test('las medidas siguen en su orden (peso al inicio y abdomen y cadera junto a la cintura) y el formulario nuevo usa cintura, no abdomen', () => {
  assert.deepStrictEqual(M.MEASURES.map((m) => m.label), ['Peso', 'Cuello', 'Brazo der.', 'Brazo izq.', 'Espalda', 'Cintura', 'Abdomen', 'Cadera', 'Muslo der.', 'Muslo izq.']);
  assert.deepStrictEqual(M.KEYS, ['weight', 'neck', 'armR', 'armL', 'back', 'waist', 'abdomen', 'hip', 'thighR', 'thighL']);
  assert.ok(!M.FORM_KEYS.includes('abdomen') && M.FORM_KEYS.includes('waist'));
  assert.deepStrictEqual([M.unitOf('weight'), M.unitOf('abdomen'), M.unitOf('hip'), M.unitOf('neck')], ['kg', 'cm', 'cm', 'cm']);
  assert.strictEqual(M.REQUIRED, undefined, 'la regla fija «peso, abdomen y cadera obligatorios» ya no existe (decisión D2)');
});
// Calendario por defecto (D2): 2026-10-19 lunes, 20 martes, 21 miércoles, 23 viernes, 24 sábado.
const dueKeys = (entries, day, scale) => M.dueToday(entries, day, { scale }).dueKeys;
const reqKeys = (entries, day, scale) => M.dueToday(entries, day, { scale }).requiredKeys;
test('«toca hoy»: peso lun·mié·vie, cintura cada semana, cadera cada 2 semanas y el resto cada 4 semanas (opcional)', () => {
  const none = [];
  assert.ok(dueKeys(none, '2026-10-19').includes('weight') && dueKeys(none, '2026-10-21').includes('weight') && dueKeys(none, '2026-10-23').includes('weight'));
  for (const d of ['2026-10-20', '2026-10-22', '2026-10-24', '2026-10-25']) assert.ok(!dueKeys(none, d).includes('weight'), `el peso no toca el ${d}`);
  // día 1 sin nada medido: cintura y cadera tocan siempre; el resto también pero es opcional
  assert.deepStrictEqual(reqKeys(none, '2026-10-20', 'si'), ['waist', 'hip']);
  assert.deepStrictEqual(reqKeys(none, '2026-10-21', 'si'), ['weight', 'waist', 'hip']);
  const e = [{ date: '2026-10-14', weight: 72, waist: 85, hip: 100, neck: 34 }];
  // cintura: 7 días después de la última; cadera: 14; cuello: 28
  assert.ok(!dueKeys(e, '2026-10-20').includes('waist') && dueKeys(e, '2026-10-21').includes('waist'));
  assert.ok(!dueKeys(e, '2026-10-27').includes('hip') && dueKeys(e, '2026-10-28').includes('hip'));
  assert.ok(!dueKeys(e, '2026-11-10').includes('neck') && dueKeys(e, '2026-11-11').includes('neck'));
  // lo ya medido hoy no toca otra vez
  assert.ok(!dueKeys([...e, { date: '2026-10-21', weight: 71.5 }], '2026-10-21').includes('weight'));
  // monthly/otros nunca son obligatorios
  const all = M.dueToday(none, '2026-10-21', { scale: 'si' }).items;
  for (const k of ['neck', 'armR', 'armL', 'back', 'thighR', 'thighL']) assert.strictEqual(all.find((i) => i.key === k).required, false);
});
test('el peso solo es obligatorio si la persona dijo que tiene báscula (sin báscula configurada es opcional)', () => {
  assert.ok(!reqKeys([], '2026-10-21', undefined).includes('weight'));
  assert.ok(!reqKeys([], '2026-10-21', null).includes('weight'));
  assert.ok(!reqKeys([], '2026-10-21', 'no').includes('weight'));
  assert.ok(reqKeys([], '2026-10-21', 'si').includes('weight'));
  assert.ok(!reqKeys([], '2026-10-20', 'si').includes('weight'), 'un martes no toca');
});
test('missing / missingText: solo falta lo OBLIGATORIO de hoy; lo que ya tiene el registro de ese día no se vuelve a exigir', () => {
  const due = M.dueToday([], '2026-10-21', { scale: 'si' });
  assert.deepStrictEqual(M.missing({ neck: 34 }, null, due).map((m) => m.key), ['weight', 'waist', 'hip']);
  assert.deepStrictEqual(M.missing({ weight: 70, waist: 90 }, null, due).map((m) => m.key), ['hip']);
  assert.deepStrictEqual(M.missing({ weight: 70, waist: 90, hip: 100 }, null, due), []);
  assert.deepStrictEqual(M.missing({ hip: 100 }, { weight: 70, waist: 90 }, due), [], 'el registro del día ya los tiene');
  assert.strictEqual(M.missingText(M.missing({ weight: 70, hip: 100 }, null, due)), 'Hoy toca: falta «Cintura» (cm).');
  assert.strictEqual(M.missingText(M.missing({}, null, due)), 'Hoy toca: faltan «Peso» (kg), «Cintura» (cm) y «Cadera» (cm).');
  assert.strictEqual(M.missingText([]), '');
  assert.deepStrictEqual(M.missing({}, null, M.dueToday([{ date: '2026-10-20', waist: 80, hip: 100 }], '2026-10-21', { scale: 'no' })), [], 'martes sin báscula y todo al día: no se exige nada');
});
test('«cuándo toca»: mañana, en N días, en N semanas; la última medida y la guía de dónde medir', () => {
  const it = (e, k, day = '2026-10-21') => M.dueToday(e, day, { scale: 'si' }).items.find((i) => i.key === k);
  const e = [{ date: '2026-10-19', weight: 72, waist: 85, hip: 100 }];
  assert.strictEqual(it(e, 'hip').when, 'en 2 semanas');
  assert.strictEqual(it(e, 'waist').when, 'en 5 días');
  assert.strictEqual(it([{ date: '2026-10-14', waist: 85 }], 'waist').due, true);
  assert.strictEqual(it([{ date: '2026-10-15', waist: 85 }], 'hip').due, true);
  assert.strictEqual(it([{ date: '2026-10-16', waist: 85 }], 'waist', '2026-10-22').when, 'mañana');
  assert.deepStrictEqual(it(e, 'waist').last, { date: '2026-10-19', value: 85 });
  assert.match(it(e, 'waist').guide, /ombligo/);
  assert.strictEqual(M.inText(7), 'en 1 semana');
});
test('cambios en lenguaje NEUTRO (sin bueno ni malo) y tendencia de 7 días del peso con pesajes detrás', () => {
  assert.strictEqual(M.neutralChange(-1.6, 'kg'), '1,6 kg menos');
  assert.strictEqual(M.neutralChange(2.1, 'cm'), '2,1 cm más');
  assert.strictEqual(M.neutralChange(0, 'cm'), 'sin cambio');
  assert.strictEqual(M.neutralChange(null, 'cm'), '');
  const days = Array.from({ length: 12 }, (_, i) => ({ date: new Date(Date.UTC(2026, 9, 10 + i)).toISOString().slice(0, 10), weight: 74 - i * 0.2 + (i % 2 ? 0.4 : -0.3) }));
  const t = M.weightTrend(days, '2026-10-24');
  assert.strictEqual(t.raw.length, 12);
  assert.strictEqual(t.trend.length, 12);
  assert.ok(t.d.startsWith('M'));
  assert.ok(t.last.trend < t.first.trend && t.change < 0);
  assert.ok(t.trend.every((p) => p.x >= 0 && p.x <= t.w && p.y >= 0 && p.y <= t.h));
  assert.strictEqual(M.weightTrend([], '2026-10-24'), null);
  assert.strictEqual(M.weightTrend([{ date: '2026-01-01', weight: 70 }], '2026-10-24'), null, 'fuera de los últimos 90 días no se muestra');
  assert.strictEqual(M.weightTrend([{ date: '2026-10-20', weight: 70 }], '2026-10-24').d, '', 'un solo pesaje: solo un punto');
});
test('mensajes que normalizan el ruido: el peso sube y baja, y la meseta es común', () => {
  assert.strictEqual(M.rose([{ date: '2026-10-20', weight: 71 }, { date: '2026-10-22', weight: 71.6 }], '2026-10-22'), true);
  assert.strictEqual(M.rose([{ date: '2026-10-20', weight: 71 }, { date: '2026-10-22', weight: 70.6 }], '2026-10-22'), false);
  const flat = [0, 4, 8, 12, 16].map((i) => ({ date: new Date(Date.UTC(2026, 9, 5 + i)).toISOString().slice(0, 10), weight: 72 + (i % 8 ? 0.2 : -0.1) }));
  assert.strictEqual(M.plateau(flat, '2026-10-21'), true);
  assert.strictEqual(M.plateau([{ date: '2026-10-20', weight: 72 }], '2026-10-21'), false);
  assert.strictEqual(M.plateau(flat.map((e, i) => ({ ...e, weight: 80 - i })), '2026-10-21'), false);
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
