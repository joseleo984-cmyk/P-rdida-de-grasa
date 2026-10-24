// Sprint 11: cobros manuales (pagos.js, puro).
const test = require('node:test');
const assert = require('node:assert');
const P = require('../pagos.js');

test('todayBogota: UTC-5 fijo (a las 04:30 UTC todavía es el día anterior)', () => {
  assert.strictEqual(P.todayBogota(Date.parse('2026-10-24T04:30:00Z')), '2026-10-23');
  assert.strictEqual(P.todayBogota(Date.parse('2026-10-24T05:00:00Z')), '2026-10-24');
  assert.strictEqual(P.todayBogota(Date.parse('2026-10-23T23:59:00-05:00')), '2026-10-23');
});
test('status: al día hasta HOY inclusive; ayer = vencido; sin fecha o fecha rara = none', () => {
  const t = '2026-10-23';
  assert.deepStrictEqual(P.status({ paidUntil: '2026-10-23' }, t), { key: 'paid', paid: true, paidUntil: '2026-10-23', daysLeft: 0 });
  assert.strictEqual(P.status({ paidUntil: '2026-10-22' }, t).key, 'overdue');
  assert.strictEqual(P.status({ paidUntil: '2026-10-22' }, t).daysLeft, -1);
  assert.strictEqual(P.status({ paidUntil: null }, t).key, 'none');
  assert.strictEqual(P.status({ paidUntil: 'x' }, t).key, 'none');
  assert.strictEqual(P.status(null, t).key, 'none');
  assert.strictEqual(P.status({ paidUntil: '2026-11-22' }, t).daysLeft, 30);
});
test('blocked: solo con vínculo activo y sin estar al día', () => {
  const t = '2026-10-23';
  assert.strictEqual(P.blocked(null, t), false, 'sin coach nunca se bloquea');
  assert.strictEqual(P.blocked({ paidUntil: null }, t), true);
  assert.strictEqual(P.blocked({ paidUntil: '2026-10-22' }, t), true);
  assert.strictEqual(P.blocked({ paidUntil: '2026-10-23' }, t), false);
});
test('«Pagó» = hoy + 30; «No pagó» = ayer', () => {
  assert.strictEqual(P.defaultPaidUntil('2026-10-23'), '2026-11-22');
  assert.strictEqual(P.unpaidDate('2026-10-23'), '2026-10-22');
  assert.strictEqual(P.defaultPaidUntil('2026-12-15'), '2027-01-14');
});
test('textos del coach: pagó hasta, vence en N días, venció, sin pago', () => {
  const t = '2026-10-23';
  assert.match(P.coachLine(P.status({ paidUntil: '2026-11-15' }, t)), /^Pagó hasta el 15 nov · vence en 23 días$/);
  assert.match(P.coachLine(P.status({ paidUntil: '2026-10-23' }, t)), /vence hoy$/);
  assert.match(P.coachLine(P.status({ paidUntil: '2026-10-24' }, t)), /vence mañana$/);
  assert.strictEqual(P.coachLine(P.status({ paidUntil: '2026-10-10' }, t)), 'Venció el 10 oct');
  assert.strictEqual(P.coachLine(P.status({}, t)), 'Sin pago registrado');
  assert.strictEqual(P.chipText(P.status({ paidUntil: '2026-10-23' }, t)), 'Pagó');
  assert.strictEqual(P.chipText(P.status({}, t)), 'No pagó');
});
test('frase del cliente (UX Etapa 1): «Tu plan se renueva…», sin cuenta regresiva; solo se muestra en Inicio si N ≤ 7', () => {
  const t = '2026-10-23';
  assert.deepStrictEqual(P.clientCountdown(P.status({ paidUntil: '2026-11-04' }, t)), { text: 'Tu plan se renueva el 4 nov. Si tienes dudas, habla con tu coach.', soon: false });
  assert.deepStrictEqual(P.clientCountdown(P.status({ paidUntil: '2026-10-30' }, t)), { text: 'Tu plan se renueva el 30 oct. Si tienes dudas, habla con tu coach.', soon: true });
  assert.strictEqual(P.SOON_DAYS, 7);
  assert.strictEqual(P.clientCountdown(P.status({ paidUntil: '2026-10-31' }, t)).soon, false);
  assert.strictEqual(P.clientCountdown(P.status({ paidUntil: '2026-10-23' }, t)).text, 'Tu plan se renueva hoy. Si tienes dudas, habla con tu coach.');
  assert.strictEqual(P.clientCountdown(P.status({ paidUntil: '2026-10-24' }, t)).text, 'Tu plan se renueva mañana. Si tienes dudas, habla con tu coach.');
  assert.strictEqual(P.clientCountdown(P.status({}, t)).soon, true);
  assert.doesNotMatch(JSON.stringify([P.clientCountdown(P.status({ paidUntil: '2026-10-30' }, t))]), /Faltan|días para/);
});
test('summary y orden por vencimiento (sin fecha y vencidos primero)', () => {
  const t = '2026-10-23';
  const st = [{ paidUntil: '2026-11-15' }, { paidUntil: '2026-10-28' }, { paidUntil: null }, { paidUntil: '2026-10-10' }, { paidUntil: '2026-10-23' }].map((l) => P.status(l, t));
  assert.deepStrictEqual(P.summary(st), { paid: 3, unpaid: 2, total: 5 });
  assert.deepStrictEqual([...st].sort(P.byDue).map((x) => x.paidUntil), [null, '2026-10-10', '2026-10-23', '2026-10-28', '2026-11-15']);
});
