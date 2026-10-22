// Sprint 4: números y textos de la pantalla Inicio del cliente.
const test = require('node:test');
const assert = require('node:assert');
const H = require('../inicio-view.js');
const S = require('../schema.js');

const day = (n) => new Date(Date.UTC(2026, 9, 22 - n)).toISOString().slice(0, 10);
const PROFILE = { name: 'Ana', sex: 'female', age: 35, height: 165, startWeight: 70, goalWeight: 62, startDate: day(20), activity: 1.375, rate: 0.005 };
const mk = (over = {}) => S.normalize(S.migrate({ schemaVersion: S.CURRENT_VERSION, profile: PROFILE, entries: [], foods: {}, habits: {}, library: {}, ...over })).state;
const e = (n, weight) => ({ id: 'e' + n, date: day(n), weight });
const food = (meal, kcal, protein = 0) => ({ id: meal + kcal, name: 'x', meal, kcal, protein, carbs: 0, fat: 0 });
const Calc = require('../calc.js');

test('hoy: kcal, meta, "Te quedan", proteína y vasos de agua', () => {
  const goal = Calc.plan(PROFILE, 70);
  const st = mk({ entries: [e(0, 70)], foods: { [day(0)]: [food('Desayuno', 400, 20), food('Almuerzo', 600, 40.4)] }, habits: { [day(0)]: { water: 1.25, trained: false } } });
  const h = H.hoy(st, day(0));
  assert.strictEqual(h.kcal, 1000);
  assert.strictEqual(h.kcalGoal, goal.kcal);
  assert.strictEqual(h.leftText, `Te quedan ${(goal.kcal - 1000).toLocaleString('es', { useGrouping: 'always' })} kcal`);
  assert.strictEqual(h.over, false);
  assert.strictEqual(h.protein, 60);
  assert.strictEqual(h.proteinText, `60 de ${goal.protein} g`);
  assert.strictEqual(h.glasses, 5);
  assert.strictEqual(h.glassesText, '5 de 8 vasos');
  assert.strictEqual(h.glassesPct, 62.5);
  assert.ok(h.kcalPct > 0 && h.kcalPct < 100);
});

test('hoy: pasarse de la meta, barras topadas en 100 % y sin perfil', () => {
  const goal = Calc.plan(PROFILE, 70).kcal;
  const st = mk({ entries: [e(0, 70)], foods: { [day(0)]: [food('Cena', goal + 250)] }, habits: { [day(0)]: { water: 5 } } });
  const h = H.hoy(st, day(0));
  assert.strictEqual(h.leftText, 'Te pasaste 250 kcal');
  assert.strictEqual(h.over, true);
  assert.strictEqual(h.kcalPct, 100);
  assert.strictEqual(h.glassesPct, 100);
  const none = H.hoy(mk({ profile: null, foods: { [day(0)]: [food('Cena', 300, 10)] } }), day(0));
  assert.strictEqual(none.kcalGoal, null);
  assert.strictEqual(none.leftText, '');
  assert.strictEqual(none.proteinText, '10 g');
  assert.strictEqual(none.kcalPct, 0);
  assert.strictEqual(H.hoy(mk(), day(0)).glassesText, '0 de 8 vasos');
});

test('desayuno de ayer: solo si ayer hubo desayuno y hoy aún no', () => {
  const st = (foods) => mk({ foods });
  assert.strictEqual(H.desayunoAyer(st({}), day(0)).show, false);
  assert.strictEqual(H.desayunoAyer(st({ [day(1)]: [food('Cena', 500)] }), day(0)).show, false, 'ayer sin desayuno');
  const b = H.desayunoAyer(st({ [day(1)]: [food('Desayuno', 300), food('Desayuno', 120), food('Cena', 500)] }), day(0));
  assert.deepStrictEqual([b.show, b.count, b.kcal, b.from], [true, 2, 420, day(1)]);
  assert.strictEqual(H.desayunoAyer(st({ [day(1)]: [food('Desayuno', 300)], [day(0)]: [food('Desayuno', 200)] }), day(0)).show, false, 'hoy ya tiene desayuno');
  assert.strictEqual(H.desayunoAyer(st({ [day(2)]: [food('Desayuno', 300)] }), day(0)).show, false, 'anteayer no cuenta');
});

test('peso: último valor y diferencia con la semana pasada dicha con palabras', () => {
  const baja = H.peso(mk({ entries: [e(7, 69), e(3, 68.8), e(0, 68.4)] }), day(0));
  assert.strictEqual(baja.valueText, '68,4');
  assert.strictEqual(baja.diff, -0.6);
  assert.strictEqual(baja.diffText, '0,6 kg menos que la semana pasada');
  assert.strictEqual(baja.dir, 'down');
  assert.strictEqual(H.peso(mk({ entries: [e(7, 68), e(0, 68.5)] }), day(0)).diffText, '0,5 kg más que la semana pasada');
  assert.strictEqual(H.peso(mk({ entries: [e(7, 68), e(0, 68)] }), day(0)).diffText, 'Igual que la semana pasada');
  assert.strictEqual(H.peso(mk({ entries: [e(2, 68), e(0, 68.5)] }), day(0)).diffText, 'Aún no hay un peso de la semana pasada para comparar');
  assert.strictEqual(H.peso(mk({ entries: [e(0, 68.5)] }), day(0)).spark, null);
  const vacio = H.peso(mk(), day(0));
  assert.deepStrictEqual([vacio.has, vacio.valueText, vacio.diffText], [false, '—', 'Aún no registras tu peso']);
});

test('tendencia: línea SVG con el peso más alto arriba y descripción clara', () => {
  const s = H.spark(mk({ entries: [e(14, 70), e(7, 69), e(0, 68)] }), day(0));
  assert.strictEqual(s.trend, 'baja');
  assert.strictEqual(s.label, 'Tu peso viene bajando');
  assert.match(s.d, /^M[\d. ]+( L[\d. ]+){2}$/);
  const ys = s.d.slice(1).split(' L').map((p) => Number(p.split(' ')[1]));
  assert.ok(ys[0] < ys[1] && ys[1] < ys[2], 'baja: la línea desciende (y crece)');
  assert.strictEqual(H.spark(mk({ entries: [e(14, 68), e(0, 70)] }), day(0)).label, 'Tu peso viene subiendo');
  assert.strictEqual(H.spark(mk({ entries: [e(14, 70), e(0, 70.1)] }), day(0)).label, 'Tu peso se mantiene estable');
  assert.strictEqual(H.spark(mk({ entries: [e(60, 80), e(0, 70)] }), day(0)), null, 'un solo peso en 30 días: no hay línea');
  assert.strictEqual(H.spark(mk({ entries: [e(14, 70), e(0, 70)] }), day(0)).d.includes('NaN'), false);
});

test('saludo y fecha', () => {
  assert.strictEqual(H.saludo(mk()), 'Hola, Ana');
  assert.strictEqual(H.saludo(mk({ profile: null })), 'Hola');
  assert.strictEqual(H.fecha(new Date(2026, 9, 22, 12)), 'Jueves 22 de octubre');
});
