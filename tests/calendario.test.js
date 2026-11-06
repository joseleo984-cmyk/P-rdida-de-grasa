const test = require('node:test');
const assert = require('node:assert');
const C = require('../calendario.js');

test('calendario: la cuadrícula del mes empieza en lunes, tiene semanas de 7 y todos los días del mes una sola vez', () => {
  const w = C.monthGrid(2026, 10);   // noviembre de 2026: empieza en domingo
  assert.ok(w.every((s) => s.length === 7));
  assert.deepStrictEqual(w[0], [null, null, null, null, null, null, '2026-11-01']);
  const days = w.flat().filter(Boolean); assert.strictEqual(days.length, 30); assert.strictEqual(days[29], '2026-11-30');
  assert.strictEqual(C.weekday('2026-11-02'), 0);   // lunes
  assert.strictEqual(C.weekday('2026-11-01'), 6);   // domingo
});

test('calendario: sumar días y meses cruza meses y años; los lunes de un mes; solo se programa de ayer a 120 días', () => {
  assert.strictEqual(C.addDays('2026-12-31', 1), '2027-01-01');
  assert.strictEqual(C.addDays('2026-03-01', -1), '2026-02-28');
  assert.deepStrictEqual(C.addMonths(2026, 11, 1), { y: 2027, m0: 0 });
  assert.deepStrictEqual(C.addMonths(2026, 0, -1), { y: 2025, m0: 11 });
  assert.deepStrictEqual(C.daysOfWeekday(2026, 10, 0), ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']);
  const today = '2026-11-10';
  assert.deepStrictEqual(C.daysOfWeekday(2026, 10, 0, (k) => C.canSchedule(k, today)), ['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']);   // ayer sí se permite
  assert.ok(C.canSchedule('2026-11-09', today) && !C.canSchedule('2026-11-08', today));
  assert.ok(C.canSchedule(C.addDays(today, 120), today) && !C.canSchedule(C.addDays(today, 121), today));
});

test('calendario: rango del mes, trozos de 62 y etiqueta corta', () => {
  assert.deepStrictEqual(C.monthRange(2028, 1), { from: '2028-02-01', to: '2028-02-29' });
  assert.deepStrictEqual(C.chunk(Array.from({ length: 130 }, (_, i) => i)).map((c) => c.length), [62, 62, 6]);
  assert.strictEqual(C.short('Cuerpo completo – 3 días'), 'Cuerpo c…');
  assert.strictEqual(C.short('Pierna'), 'Pierna');
  assert.strictEqual(C.monthLabel(2026, 10), 'noviembre de 2026');
});
