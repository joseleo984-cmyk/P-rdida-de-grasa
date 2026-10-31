const test = require('node:test');
const assert = require('node:assert');
const P = require('../piloto.js');

test('recordatorio: viene apagado y sanea la hora', () => {
  assert.deepStrictEqual(P.recClean(null), { on: false, hour: 20 });
  assert.deepStrictEqual(P.recClean({ on: 'true', hour: 25 }), { on: false, hour: 20 });
  assert.deepStrictEqual(P.recClean({ on: true, hour: 7 }), { on: true, hour: 7 });
  assert.ok(P.REC_HOURS.includes(P.REC_DEFAULT_HOUR));
});

test('recordatorio: solo avisa activado, pasada la hora, sin registro y sin posponer', () => {
  const base = { hourNow: 21, hasRecord: false, today: '2026-11-10', dismissedDay: null };
  const cfg = { on: true, hour: 20 };
  assert.strictEqual(P.recDue(cfg, base), true);
  assert.strictEqual(P.recDue({ on: false, hour: 20 }, base), false);
  assert.strictEqual(P.recDue(cfg, { ...base, hourNow: 19 }), false);
  assert.strictEqual(P.recDue(cfg, { ...base, hasRecord: true }), false);
  assert.strictEqual(P.recDue(cfg, { ...base, dismissedDay: '2026-11-10' }), false);
  assert.strictEqual(P.recDue(cfg, { ...base, dismissedDay: '2026-11-09' }), true);
});

test('recordatorio: texto amable, sin presión ni cifras de salud', () => {
  assert.doesNotMatch(P.REC_TEXT, /perder|racha|fallaste|kg|kcal|peso/i);
});
