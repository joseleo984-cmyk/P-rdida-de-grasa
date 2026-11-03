const test = require('node:test');
const assert = require('node:assert');
const B = require('../rutinas-base.js');
const R = require('../rutinas.js');

test('rutinas de ejemplo: todas pasan la misma validación que una rutina del coach', () => {
  assert.ok(B.STARTERS.length >= 5); assert.ok(B.PENDING.length <= R.LIMITS.sets);
  for (const s of B.STARTERS) { const v = R.validate(s); assert.ok(v.ok, s.title + ': ' + JSON.stringify(v.errors)); }
  const titles = B.STARTERS.map((s) => s.title); assert.strictEqual(new Set(titles).size, titles.length, 'sin títulos repetidos');
});

test('rutinas de ejemplo: la plataforma NO prescribe (sin series, repeticiones, peso, descanso ni notas) y sin kg/kcal/promesas', () => {
  for (const s of B.STARTERS) for (const d of s.days) for (const e of d.exercises) {
    assert.deepStrictEqual([e.sets, e.note, e.gif], [B.PENDING, '', ''], e.name);   // el único texto en «series y repeticiones» es el aviso «por definir»
    assert.ok(!('series' in e || 'reps' in e || 'weight' in e || 'rest' in e));
  }
  assert.doesNotMatch(JSON.stringify(B), /\bkg\b|kcal|\bcm\b|peso corporal|grasa|adelgaz|quema|resultado/i);
});

test('catálogo de ejercicios: nombres únicos, dentro del límite y todos los de las rutinas de ejemplo están en el catálogo', () => {
  const all = B.names();
  assert.strictEqual(new Set(all.map((n) => n.toLowerCase())).size, all.length);
  for (const n of all) assert.ok(n.length >= 2 && n.length <= R.LIMITS.name, n);
  for (const s of B.STARTERS) for (const d of s.days) for (const e of d.exercises) assert.ok(all.includes(e.name), 'falta en el catálogo: ' + e.name);
  assert.ok(B.STARTERS.length <= R.LIMITS.templates);
});
