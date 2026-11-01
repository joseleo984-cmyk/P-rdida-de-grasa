// Liga semanal (función 5): textos y vista (liga.js) y servidor falso (opt-in reforzado, alias de catálogo, mínimo 5, solo alias y puntos, salir).
// El servidor real lo prueba supabase/tests/200_liga.test.sql con las mismas reglas.
const test = require('node:test');
const assert = require('node:assert');
const L = require('../liga.js');
const RF = require('../remote-fake.js');

test('view: apagada si el coach no la habilita; invitación si no participa; espera con el mensaje literal; tabla con 5 o más', () => {
  assert.strictEqual(L.view(null).state, 'off');
  assert.strictEqual(L.view({ enabled: false }).state, 'off');
  assert.strictEqual(L.view({ enabled: true, opted_in: false }).state, 'invite');
  const w = L.view({ enabled: true, opted_in: true, alias: 'Roble', published: false, table: null, participants: 3 });
  assert.deepStrictEqual([w.state, w.message, w.rows.length, w.alias], ['waiting', 'Se requieren al menos 5 participantes para habilitar la liga del grupo', 0, 'Roble']);
  const t = L.view({ enabled: true, opted_in: true, alias: 'Roble', published: true, participants: 5, table: [{ alias: 'Halcón', points: 30, me: false }, { alias: 'Roble', points: 12, me: true }] });
  assert.deepStrictEqual(t.rows, [{ rank: 1, alias: 'Halcón', points: 30, me: false }, { rank: 2, alias: 'Roble', points: 12, me: true }]);
  assert.ok(!('name' in t.rows[0]));
});

const start = async () => {
  const be = new RF.FakeBackend();
  const mk = async (email) => { const r = RF.createFake({ backend: be }); await r.auth.sendCode(email); await r.auth.verifyCode(email, be.lastCode(email)); await r.account.joinApp(); return r; };
  const ev = (kind, granted = true, version = 't') => ({ kind, granted, version, textHash: 'a'.repeat(64), clientAt: new Date(be.clock.now()).toISOString() });
  const coach = await mk('coach@x.co');
  await coach.account.recordConsents([ev('coach_agreement', true, '0.5-A7-coach')]);
  const { inviteCode } = await coach.coach.becomeCoach('Fit X');
  const people = [];
  for (const n of ['a', 'b', 'c', 'd', 'e']) {
    const r = await mk(`${n}@x.co`);
    await r.account.recordConsents([ev('sensitive_health'), ev('cloud_transfer'), ev('adult')]);
    await r.client.joinCoach(inviteCode, { body: true, nutrition: true, habits: true, version: 'compartir-c2', textHash: 'c'.repeat(64) });
    people.push(r);
  }
  for (const u of Object.values(be.users)) { const l = be.activeLink(u.id); if (l) l.paidUntil = '2099-01-01'; }
  return { be, coach, people, ev };
};
const joinAll = async (people, ev, k) => { for (const r of people.slice(0, k)) { await r.account.recordConsents([ev('liga')]); await r.client.joinLiga(); } };

test('servidor falso: sin la cláusula del acuerdo no hay liga; con ella, apagada por defecto; unirse exige la casilla', async () => {
  const { coach, people, ev } = await start();
  const [a] = people;
  assert.strictEqual((await a.client.myLiga()).enabled, false);
  await assert.rejects(a.client.joinLiga(), (e) => e.detail === 'liga_not_enabled');
  assert.strictEqual((await coach.coach.liga()).enabled, false);
  await coach.account.recordConsents([ev('coach_agreement', true, '0.7-A7-coach')]);
  const m = await a.client.myLiga();
  assert.deepStrictEqual([m.enabled, m.opted_in, m.alias], [true, false, null], 'habilitada pero apagada por defecto');
  await assert.rejects(a.client.joinLiga(), (e) => e.detail === 'liga_consent_required', 'sin la casilla no se une');
  await a.account.recordConsents([ev('liga')]);
  const j = await a.client.joinLiga();
  assert.strictEqual(j.opted_in, true);
  assert.ok(RF.LIGA_ALIASES.includes(j.alias), 'alias del catálogo cerrado');
  assert.strictEqual(j.published, false);
  assert.strictEqual(j.table, null, 'con 1 participante no hay tabla');
});

test('servidor falso: con 4 no se publica nada; con 5, tabla solo con alias y puntos; el coach solo ve cuántos; salir lo quita al instante', async () => {
  const { be, coach, people, ev } = await start();
  await coach.account.recordConsents([ev('coach_agreement', true, '0.7-A7-coach')]);
  await joinAll(people, ev, 4);
  assert.deepStrictEqual([(await people[0].client.myLiga()).published, (await people[0].client.myLiga()).table], [false, null], 'con 4: ni tabla ni puntajes');
  assert.deepStrictEqual(await coach.coach.liga(), { enabled: true, min: 5, published: false, participants: null }, 'el coach no ve ni el número con menos de 5');
  const [a, b, c, d, e5] = people;
  // puntos sembrados esta semana
  const ids = people.map((_, i) => Object.values(be.users).find((u) => u.email === `${'abcde'[i]}@x.co`).id);
  const wk = require('../puntos.js').monday(be.todayBogota());
  be.points[ids[0]] = [{ day: wk, source: 'registro', points: 10 }];
  be.points[ids[1]] = [{ day: wk, source: 'registro', points: 12 }, { day: wk, source: 'agua', points: 3 }];
  await e5.account.recordConsents([ev('liga')]);
  await e5.client.joinLiga();
  const mine = await a.client.myLiga();
  assert.strictEqual(mine.published, true);
  assert.strictEqual(mine.table.length, 5);
  assert.ok(mine.table.every((r) => Object.keys(r).sort().join() === 'alias,me,points'), 'solo alias, puntos y «yo»');
  assert.deepStrictEqual(mine.table.slice(0, 2).map((r) => r.points), [15, 10], 'ordenada por puntos de constancia');
  assert.strictEqual(new Set(mine.table.map((r) => r.alias)).size, 5, 'alias únicos');
  assert.strictEqual(mine.table.filter((r) => r.me).length, 1);
  assert.ok(!JSON.stringify(mine).match(/@x\.co|email|weight|kg/), 'sin identidades ni cifras corporales');
  assert.deepStrictEqual(await coach.coach.liga(), { enabled: true, min: 5, published: true, participants: 5 });
  assert.ok(!JSON.stringify(await coach.coach.liga()).includes('alias'), 'el coach no recibe alias');
  const left = await e5.client.leaveLiga();
  assert.deepStrictEqual([left.opted_in, left.alias], [false, null], 'salir apaga y borra el alias');
  assert.strictEqual((await a.client.myLiga()).published, false, 'quedan 4: deja de publicarse');
  await e5.client.joinLiga();
  await e5.account.recordConsents([ev('liga', false)]);
  assert.strictEqual((await a.client.myLiga()).participants, 4, 'revocar el consentimiento lo saca aunque el interruptor siguiera encendido');
  be.activeLink(ids[3]).paidUntil = '2000-01-01';
  assert.strictEqual((await a.client.myLiga()).participants, 3, 'en pausa por pago deja de contar');
});
