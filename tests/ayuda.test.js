const test = require('node:test');
const assert = require('node:assert');
const A = require('../ayuda.js');

test('ayuda: preguntas por rol, sin datos de salud ni «[HORARIO]» ni promesas de lo que no existe', () => {
  assert.ok(A.FAQ.coach.length >= 12 && A.FAQ.client.length >= 12);
  for (const x of [...A.FAQ.coach, ...A.FAQ.client]) {
    assert.ok(x.q && x.a);
    assert.doesNotMatch(x.q + x.a, /\[HORARIO\]|próximamente|perdiste|fallaste/i);
  }
  assert.ok(A.FAQ.coach.some((x) => /deshacer/i.test(x.q)), 'el coach encuentra lo de deshacer el pago');
  assert.ok(A.FAQ.client.some((x) => /liga semanal/i.test(x.q)) && A.FAQ.client.some((x) => /recordatorio/i.test(x.q)));
});

test('ayuda: buscador sin acentos ni mayúsculas; todas las palabras; sin texto devuelve todo; sin resultados queda vacío', () => {
  assert.strictEqual(A.search('client', '').length, A.FAQ.client.length);
  assert.strictEqual(A.search('client', '   ').length, A.FAQ.client.length);
  assert.ok(A.search('client', 'CODIGO').some((x) => /código/.test(x.q)));
  assert.ok(A.search('coach', 'pagó deshacer').some((x) => /Pagó/.test(x.q)));
  assert.ok(A.search('client', 'camara permiso').length >= 1);
  assert.deepStrictEqual(A.search('client', 'zzzxyz'), []);
  assert.ok(A.search('client', 'pago').every((x) => A.norm(x.q + x.a).includes('pago')));
});

test('ayuda: soporte por WhatsApp con mensaje fijo, sin datos de salud', () => {
  assert.strictEqual(A.SUPPORT_PHONE, '573128876125');
  assert.strictEqual(A.supportUrl(), 'https://wa.me/573128876125?text=' + encodeURIComponent('Hola, necesito ayuda con la app Pérdida de Grasa.'));
  assert.doesNotMatch(A.SUPPORT_MESSAGE, /peso|kg|kcal|salud|dolor/i);
});
