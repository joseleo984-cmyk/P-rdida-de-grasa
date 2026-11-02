const test = require('node:test');
const assert = require('node:assert');
const T = require('../tour.js');

test('tour: dos recorridos de 5 y 6 pasos, cada uno con título, texto y un botón real al que apuntar', () => {
  assert.deepStrictEqual(Object.keys(T.TOURS).sort(), ['a', 'c']);
  for (const [role, steps] of Object.entries(T.TOURS)) {
    assert.ok(steps.length >= 4 && steps.length <= 6, role);
    for (const s of steps) {
      assert.ok(s.t && s.b && Array.isArray(s.sel) && s.sel.length, JSON.stringify(s));
      assert.ok(s.t.length <= 40 && s.b.length <= 130, 'frases cortas: ' + s.t);
    }
  }
});

test('tour: los textos no prometen resultados de salud ni hablan de peso, kg, cm o ranking', () => {
  const all = JSON.stringify(T.TOURS);
  assert.doesNotMatch(all, T.FORBIDDEN);
  assert.doesNotMatch(all, /próximamente|garantiz|seguro que/i);
});

test('tour: se recuerda por rol, solo en este teléfono, y un valor dañado no rompe nada', () => {
  const mem = {};
  global.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } };
  assert.deepStrictEqual(T.readSeen('k'), {});
  T.writeSeen('k', 'a');
  assert.deepStrictEqual(T.readSeen('k'), { a: 1 });
  T.writeSeen('k', 'c');
  assert.deepStrictEqual(T.readSeen('k'), { a: 1, c: 1 });
  mem.k = '{no es json';
  assert.deepStrictEqual(T.readSeen('k'), {});
  delete global.localStorage;
});
