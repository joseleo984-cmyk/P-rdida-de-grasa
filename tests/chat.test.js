const test = require('node:test');
const assert = require('node:assert');
const C = require('../chat.js');

test('chat: clean() acepta 1 a 1000 caracteres recortados y rechaza vacío o largo', () => {
  assert.strictEqual(C.clean('  hola  '), 'hola');
  assert.strictEqual(C.clean('   '), null);
  assert.strictEqual(C.clean(null), null);
  assert.strictEqual(C.clean('a'.repeat(1000)).length, 1000);
  assert.strictEqual(C.clean('a'.repeat(1001)), null);
});

test('chat: stamp() muestra «hoy HH:MM» o día y hora', () => {
  const now = new Date(2026, 10, 3, 15, 0).toISOString();
  assert.match(C.stamp(new Date(2026, 10, 3, 9, 5).toISOString(), now), /^hoy \d{2}:\d{2}$/);
  assert.match(C.stamp(new Date(2026, 10, 1, 9, 5).toISOString(), now), /^1 (de )?nov\.? \d{2}:\d{2}$/);
  assert.strictEqual(C.stamp('no-fecha'), '');
});

test('chat: el aviso no menciona palabras vetadas en avisos push y el texto completo se arma con título + cuerpo', () => {
  assert.strictEqual(C.fullText(), C.TEXTS.aviso.title + '\n' + C.TEXTS.aviso.body);
  assert.strictEqual(C.MAX, 1000);
});
