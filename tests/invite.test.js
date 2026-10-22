const test = require('node:test');
const assert = require('node:assert');
const I = require('../invite.js');

test('código: mismo formato que el servidor', () => {
  assert.equal(I.isValidCode('abc-234'), true);
  assert.equal(I.isValidCode(' k7m 2pq '), true);
  for (const bad of ['', 'ABC12', 'ABC2345', 'ABC0O1', 'ILIL23', null, undefined, 'ÁBC234']) assert.equal(I.isValidCode(bad), false, String(bad));
  assert.equal(I.normalizeCode('abc-234'), 'ABC234');
});

test('enlace: parte del origen y la ruta actuales (raíz y /pruebas/)', () => {
  assert.equal(I.inviteLink({ origin: 'https://x.github.io', pathname: '/P-rdida-de-grasa/' }, 'abc234'), 'https://x.github.io/P-rdida-de-grasa/?c=ABC234');
  assert.equal(I.inviteLink({ origin: 'https://x.github.io', pathname: '/P-rdida-de-grasa/pruebas/' }, 'ABC234'), 'https://x.github.io/P-rdida-de-grasa/pruebas/?c=ABC234');
  assert.equal(I.inviteLink({ origin: 'https://x.io', pathname: '/' }, 'mal'), '');
});

test('mensaje: con y sin nombre; limpia saltos de línea y límites', () => {
  const link = 'https://x.io/?c=ABC234';
  assert.equal(I.inviteMessage({ clientName: 'Ana', businessName: 'Fit Pro', link }),
    'Hola Ana, soy Fit Pro. Te invito a seguir tu progreso conmigo en Pérdida de Grasa. Toca este enlace y listo: https://x.io/?c=ABC234');
  assert.match(I.inviteMessage({ clientName: '  ', businessName: 'Fit Pro', link }), /^Hola, soy Fit Pro\./);
  assert.match(I.inviteMessage({ clientName: 'Ana\nLópez\t', businessName: 'Fit', link }), /^Hola Ana López, soy Fit\./);
  assert.equal(I.cleanName('x'.repeat(100)).length, 40);
});

test('WhatsApp: el mensaje va codificado (nada de HTML ni & sueltos)', () => {
  const m = I.inviteMessage({ clientName: '<b>Ana</b> & "Co"', businessName: "Fit's #1", link: 'https://x.io/?c=ABC234' });
  const u = I.whatsappUrl(m);
  assert.ok(u.startsWith('https://wa.me/?text='));
  assert.doesNotMatch(u.slice('https://wa.me/?text='.length), /[<>" &#]/);
  assert.equal(decodeURIComponent(u.slice('https://wa.me/?text='.length)), m);
});

test('URL de entrada: lee ?c= y la quita sin tocar lo demás', () => {
  assert.deepEqual(I.codeFromSearch('?c=abc-234'), { code: 'ABC234' });
  assert.deepEqual(I.codeFromSearch('?remote=fake&c=zz'), { code: 'ZZ' });
  assert.equal(I.codeFromSearch('?remote=fake'), null);
  assert.equal(I.codeFromSearch(''), null);
  assert.equal(I.codeFromSearch('?c=' + 'a'.repeat(50)).code.length, 12);
  assert.equal(I.withoutCode('?remote=fake&c=ABC234', '#x'), '?remote=fake#x');
  assert.equal(I.withoutCode('?c=ABC234', ''), '');
});

test('invitación pendiente: caduca a los 7 días', () => {
  const t0 = Date.parse('2026-10-22T10:00:00Z');
  const p = I.makePending('abc 234', t0);
  assert.equal(p.code, 'ABC234');
  assert.equal(I.pendingState(p, t0 + 6.9 * 86400000), 'ok');
  assert.equal(I.pendingState(p, t0 + 7.1 * 86400000), 'expired');
  assert.equal(I.pendingState(null), 'none');
  assert.equal(I.pendingState({ code: 'A', at: 'basura' }), 'expired');
});
