// Sprint 11: hábitos diarios y avance semanal (habitos.js, puro).
const test = require('node:test');
const assert = require('node:assert');
const H = require('../habitos.js');

const T = '2026-10-23';
const S = (habits) => ({ habits });
test('un día: vasos de 250 ml, pasos, sueño y entrenó', () => {
  const d = H.day(S({ [T]: { water: 1.25, steps: 6200, sleep: 6.5, trained: true } }), T);
  assert.deepStrictEqual(d.items.map((i) => i.text), ['5 de 8 vasos', '6.200 de 8.000', '6,5 h', 'Sí']);
  assert.deepStrictEqual(d.items.map((i) => i.done), [false, false, false, true]);
  assert.strictEqual(d.logged, true);
  assert.strictEqual(H.day(S({}), T).logged, false);
  assert.strictEqual(H.day(S({}), T).items[0].text, '0 de 8 vasos');
});
test('semana: cuántos de los últimos 7 días cumplió cada hábito', () => {
  const habits = {
    '2026-10-17': { water: 2, steps: 9000, sleep: 7, trained: true },
    '2026-10-18': { water: 2.5, steps: 100, sleep: 8, trained: false },
    '2026-10-19': { water: 1.75, steps: 8000, sleep: 6.9, trained: true },
    '2026-10-23': { water: 2, trained: true },
    '2026-10-16': { water: 2, steps: 9000, sleep: 9, trained: true },   // fuera de la ventana de 7 días
  };
  const w = H.week(S(habits), T);
  assert.deepStrictEqual(w.items.map((i) => [i.key, i.days]), [['water', 3], ['steps', 2], ['sleep', 2], ['trained', 3]]);
  assert.strictEqual(w.items[0].text, '3 de 7 días');
  assert.strictEqual(w.total, 10); assert.strictEqual(w.max, 28); assert.strictEqual(w.pct, 36);
  assert.strictEqual(w.loggedDays, 4);
  assert.strictEqual(w.from, '2026-10-17');
  assert.match(w.line, /10 de 28 hábitos/);
});
test('lista del coach: porcentaje, sin registros y «no comparte»', () => {
  assert.strictEqual(H.listLine(S({ [T]: { water: 2, steps: 8000, sleep: 7, trained: true } }), T, true), 'Hábitos de la semana: 14 %');
  assert.strictEqual(H.listLine(S({}), T, true), 'Hábitos: aún sin registrar');
  assert.strictEqual(H.listLine(S({ [T]: { trained: true } }), T, false), 'No comparte sus hábitos');
  assert.strictEqual(H.notSharedText('Ana'), 'Ana todavía no comparte sus hábitos');
});
