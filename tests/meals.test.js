// HU-02 (S1-3): repetir comidas. Lógica pura en schema.js.
const test = require('node:test');
const assert = require('node:assert');
const Schema = require('../schema.js');

let n = 0;
const uid = () => 'c' + ++n;
const base = () => ({
  '2026-10-20': [
    { id: 'a1', name: 'Avena', meal: 'Desayuno', kcal: 300, protein: 10, carbs: 50, fat: 6 },
    { id: 'a2', name: 'Pollo', meal: 'Almuerzo', kcal: 450, protein: 40, carbs: 0, fat: 10 },
  ],
  '2026-10-21': [{ id: 'b1', name: 'Café', meal: 'Desayuno', kcal: 5, protein: 0, carbs: 0, fat: 0 }],
});

test('addDays: aritmética de calendario sin zona horaria, con cambios de mes, año y bisiesto', () => {
  assert.strictEqual(Schema.addDays('2026-10-21', -1), '2026-10-20');
  assert.strictEqual(Schema.addDays('2026-03-01', -1), '2026-02-28');
  assert.strictEqual(Schema.addDays('2028-03-01', -1), '2028-02-29');
  assert.strictEqual(Schema.addDays('2027-01-01', -1), '2026-12-31');
  assert.strictEqual(Schema.addDays('2026-12-31', 1), '2027-01-01');
  for (const bad of ['2026-02-30', '21/10/2026', '', null]) assert.throws(() => Schema.addDays(bad, -1));
  assert.throws(() => Schema.addDays('2026-10-21', 0.5));
});

test('copyMeals: copia todo el día, suma sin reemplazar y no muta la entrada', () => {
  const foods = base();
  const before = JSON.stringify(foods);
  const r = Schema.copyMeals(foods, '2026-10-20', '2026-10-21', { uid });
  assert.strictEqual(r.copied, 2);
  assert.strictEqual(r.skipped, 0);
  assert.deepStrictEqual(r.foods['2026-10-21'].map((x) => x.name), ['Café', 'Avena', 'Pollo']);
  assert.strictEqual(JSON.stringify(foods), before);
  assert.notStrictEqual(r.foods['2026-10-20'], foods['2026-10-20']);
  assert.deepStrictEqual(r.foods['2026-10-20'], foods['2026-10-20']);
});

test('copyMeals: ids nuevos, únicos y distintos de los existentes aunque el generador repita', () => {
  const seq = ['a1', 'b1', 'x', '<bad>', 'x', 'y'];
  let i = 0;
  const r = Schema.copyMeals(base(), '2026-10-20', '2026-10-21', { uid: () => seq[i++] });
  const ids = r.foods['2026-10-21'].map((x) => x.id);
  assert.deepStrictEqual(ids, ['b1', 'x', 'y']);
  const all = Object.values(r.foods).flat().map((x) => x.id);
  assert.strictEqual(new Set(all).size, all.length);
  assert.throws(() => Schema.copyMeals(base(), '2026-10-20', '2026-10-21', { uid: () => 'a1' }), /id único/);
});

test('copyMeals: día vacío crea el destino; origen vacío no cambia nada', () => {
  const r = Schema.copyMeals(base(), '2026-10-20', '2026-10-25', { uid });
  assert.strictEqual(r.foods['2026-10-25'].length, 2);
  const e = Schema.copyMeals(base(), '2026-10-10', '2026-10-21', { uid });
  assert.strictEqual(e.copied, 0);
  assert.deepStrictEqual({ ...e.foods }, base());
  assert.ok(!('2026-10-10' in e.foods));
  const none = Schema.copyMeals(undefined, '2026-10-10', '2026-10-11', { uid });
  assert.strictEqual(none.copied, 0);
  assert.strictEqual(Object.keys(none.foods).length, 0);
});

test('copyMeals: copiar un solo bloque de comida', () => {
  const r = Schema.copyMeals(base(), '2026-10-20', '2026-10-21', { uid, meal: 'Almuerzo' });
  assert.strictEqual(r.copied, 1);
  assert.deepStrictEqual(r.foods['2026-10-21'].map((x) => x.name), ['Café', 'Pollo']);
  assert.strictEqual(Schema.copyMeals(base(), '2026-10-20', '2026-10-21', { uid, meal: 'Cena' }).copied, 0);
  assert.throws(() => Schema.copyMeals(base(), '2026-10-20', '2026-10-21', { uid, meal: '__proto__' }), /Comida/);
});

test('copyMeals: las copias pasan el saneado del esquema (datos dañados o maliciosos)', () => {
  const foods = {
    '2026-10-20': [
      { id: 'z1', name: '  Arepa  ', meal: 'Merienda', kcal: '200', protein: 'mucho', carbs: 30, fat: -5, extra: '<script>' },
      { id: 'z2', name: '', meal: 'Cena', kcal: 100 },
      { id: 'z3', name: 'Malo', meal: 'Cena', kcal: '<img src=x onerror=alert(1)>' },
      null,
      'texto',
    ],
  };
  const r = Schema.copyMeals(foods, '2026-10-20', '2026-10-21', { uid });
  assert.strictEqual(r.copied, 1);
  assert.strictEqual(r.skipped, 4);
  const [c] = r.foods['2026-10-21'];
  assert.deepStrictEqual(Object.keys(c).sort(), ['carbs', 'fat', 'id', 'kcal', 'meal', 'name', 'protein']);
  assert.strictEqual(c.name, 'Arepa');
  assert.strictEqual(c.meal, 'Snack');
  assert.strictEqual(c.kcal, 200);
  assert.strictEqual(c.protein, 0);
  assert.strictEqual(c.fat, 0);
  assert.notStrictEqual(c.id, 'z1');
});

test('copyMeals: rechaza fechas inválidas y mismo día', () => {
  assert.throws(() => Schema.copyMeals(base(), '2026-10-20', '2026-10-20', { uid }), /mismo/);
  assert.throws(() => Schema.copyMeals(base(), '2026-02-30', '2026-10-21', { uid }), /Fecha/);
  assert.throws(() => Schema.copyMeals(base(), '2026-10-20', '__proto__', { uid }), /Fecha/);
});

test('copyMeals: resultado compatible con normalize (round-trip sin avisos)', () => {
  const r = Schema.copyMeals(base(), '2026-10-20', '2026-10-21', { uid });
  const { state, warnings } = Schema.normalize({ foods: JSON.parse(JSON.stringify(r.foods)) }, { uid });
  assert.deepStrictEqual(warnings, []);
  assert.strictEqual(state.foods['2026-10-21'].length, 3);
});

// Etapa 2 (comidas del producto coach): plato, porción y hora son campos opcionales del registro de comida.
const Coach = require('../coach.js');
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const raw = (food) => ({ schemaVersion: Schema.CURRENT_VERSION, profile: null, entries: [], habits: {}, library: {}, foods: { '2026-10-24': [food] } });
test('normalize conserva plato, porción y hora válidos y descarta los que no lo son', () => {
  const ok = Schema.normalize(raw({ id: U(1), name: 'Tamal', meal: 'Desayuno', kcal: 250, protein: 9, carbs: 25, fat: 12, dish: 'tamal', portion: 'half', time: '08:30' })).state.foods['2026-10-24'][0];
  assert.deepStrictEqual([ok.dish, ok.portion, ok.time], ['tamal', 'half', '08:30']);
  const bad = Schema.normalize(raw({ id: U(2), name: 'X', meal: 'Cena', kcal: 100, dish: '<b>x</b>', portion: 'enorme', time: '25:99' })).state.foods['2026-10-24'][0];
  assert.deepStrictEqual(['dish' in bad, 'portion' in bad, 'time' in bad], [false, false, false]);
  const legacy = Schema.normalize(raw({ id: U(3), name: 'Avena', meal: 'Desayuno', kcal: 300, protein: 10, carbs: 50, fat: 6 })).state.foods['2026-10-24'][0];
  assert.deepStrictEqual(Object.keys(legacy).sort(), ['carbs', 'fat', 'id', 'kcal', 'meal', 'name', 'protein', 'updatedAt'], 'una comida de siempre no gana campos');
});
test('las comidas con plato viajan por los registros de sincronización y por la vista del coach', () => {
  const st = Schema.normalize(raw({ id: U(4), name: 'Ajiaco santafereño', meal: 'Almuerzo', kcal: 475, protein: 30, carbs: 50, fat: 17, dish: 'ajiaco', portion: 'large', time: '13:05' })).state;
  const recs = Schema.toRecords(st);
  assert.strictEqual(recs.foods[0].dish, 'ajiaco');
  const back = Schema.fromRecords(Schema.emptyState(), recs).foods['2026-10-24'][0];
  assert.deepStrictEqual([back.dish, back.portion, back.time], ['ajiaco', 'large', '13:05']);
  const wire = [{ id: U(4), kind: 'food', nkey: U(4), date: '2026-10-24', data: { name: 'Ajiaco santafereño', meal: 'Almuerzo', kcal: 475, protein: 30, carbs: 50, fat: 17, dish: 'ajiaco', portion: 'large', time: '13:05' }, updatedAt: '2026-10-24T18:05:00Z', deletedAt: null }];
  const seen = Coach.stateFromWire(wire).foods['2026-10-24'][0];
  assert.deepStrictEqual([seen.dish, seen.portion, seen.time, seen.kcal], ['ajiaco', 'large', '13:05', 475]);
});
test('copyMeals (repetir la de ayer) conserva plato y porción pero no la hora de ayer', () => {
  const foods = { '2026-10-23': [{ id: 'a1', name: 'Changua', meal: 'Desayuno', kcal: 180, protein: 12, carbs: 14, fat: 12, dish: 'changua', portion: 'normal', time: '07:40' }] };
  const r = Schema.copyMeals(foods, '2026-10-23', '2026-10-24', { uid: () => U(9) });
  const c = r.foods['2026-10-24'][0];
  assert.deepStrictEqual([c.dish, c.portion, 'time' in c, c.id], ['changua', 'normal', false, U(9)]);
});
