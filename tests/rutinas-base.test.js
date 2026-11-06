const test = require('node:test');
const assert = require('node:assert');
const B = require('../rutinas-base.js');
const R = require('../rutinas.js');

test('rutinas de ejemplo: todas pasan la misma validación que una rutina del coach', () => {
  assert.ok(B.STARTERS.length >= 5);
  for (const s of B.STARTERS) { const v = R.validate(s); assert.ok(v.ok, s.title + ': ' + JSON.stringify(v.errors)); }
  const titles = B.STARTERS.map((s) => s.title); assert.strictEqual(new Set(titles).size, titles.length, 'sin títulos repetidos');
});

test('rutinas de ejemplo: series y repeticiones de REFERENCIA (sin peso, descanso ni notas) y sin kg/kcal/promesas', () => {
  for (const s of B.STARTERS) for (const d of s.days) for (const e of d.exercises) {
    assert.deepStrictEqual([e.note, e.gif], ['', ''], e.name);
    const p = R.parseSets(e.sets); assert.ok(p && p.series >= 1 && p.reps && !p.weight && !p.rest, `${e.name}: ${e.sets} debe ser series×repeticiones sin peso ni descanso`);
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

test('fotos de referencia: cada nombre mapeado tiene sus dos fotos y es del catálogo', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const RB = require('../rutinas-base.js');
  const all = new Set(RB.names());
  for (const [name, slug] of Object.entries(RB.PHOTOS)) {
    assert.ok(all.has(name), 'no está en el catálogo: ' + name);
    for (const n of [0, 1]) assert.ok(fs.existsSync(path.join(__dirname, '..', 'ejercicios', `${slug}-${n}.jpg`)), `falta ${slug}-${n}.jpg`);
  }
  assert.equal(RB.photoOf('  sentadilla '), RB.PHOTOS['Sentadilla']);
  assert.equal(RB.photoOf('Elevacion de talones'), RB.PHOTOS['Elevación de talones']);
  assert.equal(RB.photoOf('Ejercicio inventado'), '');
});
