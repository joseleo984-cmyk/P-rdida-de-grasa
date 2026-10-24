// UX Etapa 2: lógica pura (etapa2.js), constancia congelada en pausa, servidor falso (L4, L5, retos, P1) y sincronización en modo autónomo.
// Las mismas reglas del servidor real se prueban en supabase/tests/150_etapa2_coach.test.sql.
const test = require('node:test');
const assert = require('node:assert');
const E = require('../etapa2.js');
const Constancia = require('../constancia.js');
const Fake = require('../remote-fake.js');
const Schema = require('../schema.js');
const Sync = require('../sync.js');

// ---------------- etapa2.js (puro) ----------------
test('L5: sin meta del coach NO hay barra (la app nunca calcula ni sugiere la meta); con meta, barra hasta el 100 % y el texto aprobado con la cifra', () => {
  for (const g of [null, undefined, 0, 19, 401, 110.5, '110', NaN]) assert.strictEqual(E.proteinBar(78, g), null, String(g));
  const b = E.proteinBar(78, 110);
  assert.deepStrictEqual({ goal: b.goal, pct: b.pct, text: b.text }, { goal: 110, pct: 71, text: 'de ~110 g' });
  assert.strictEqual(b.note, 'Meta orientativa propuesta exclusivamente por tu coach (~110 g). La plataforma no formula, valida ni prescribe requerimientos nutricionales.');
  assert.strictEqual(E.proteinBar(200, 110).pct, 100, 'sin pasarse del 100 % (ni rojo ni «te pasaste»)');
  assert.strictEqual(E.proteinBar(0, 150).note.includes('(~150 g)'), true);
});

test('L4: el texto con huella incluye el micro-texto solo si la respuesta es «Sí»; al coach solo le llega el indicador', () => {
  assert.ok(!E.healthText('condition', 'no').includes(E.HEALTH.condition.yes));
  assert.ok(E.healthText('condition', 'yes').endsWith(E.HEALTH.condition.yes));
  assert.ok(E.healthText('pregnancy', 'skip').includes('Sí / No / Prefiero no responder'));
  assert.strictEqual(E.coachHealth({}), null);
  assert.deepStrictEqual(E.coachHealth({ healthRestriction: true }).parts.map((p) => p.title), ['Tiene una restricción de salud']);
  assert.strictEqual(E.coachHealth({ pregnancyState: true }).line, 'Embarazo, lactancia o posparto');
  assert.doesNotMatch(JSON.stringify(E.coachHealth({ healthRestriction: true, pregnancyState: true })), /diagn[oó]stic|medicament|enfermedad/i, 'sin detalle clínico');
});

test('retos: plantillas solo de proceso, validación, «X de N días» y resumen del coach sin clasificación entre asesorados', () => {
  assert.deepStrictEqual(E.TEMPLATES.map((t) => t.habit), ['water', 'trained', 'sleep', 'foods']);
  for (const t of E.TEMPLATES) assert.ok(t.target < t.days, `${t.key}: se cumple con X de N, nunca N de N`);
  const today = '2026-10-24';
  const f = E.fromTemplate(E.TEMPLATES[1], today);
  assert.deepStrictEqual(f, { title: '3 entrenos esta semana', habit: 'trained', target: 3, start: '2026-10-24', end: '2026-10-30' });
  assert.strictEqual(E.checkChallenge(f, today), '');
  assert.match(E.rangeLine(f), /^Del sáb 24 al vie 30 oct · se cumple con 3 entrenos$/);
  assert.notStrictEqual(E.checkChallenge({ ...f, habit: 'weight' }, today), '', 'no hay retos de kilos');
  assert.notStrictEqual(E.checkChallenge({ ...f, target: 8 }, today), '');
  assert.notStrictEqual(E.checkChallenge({ ...f, end: '2026-12-30' }, today), '');
  const c = { ...f, marks: ['2026-10-24', '2026-10-25'] };
  const p = E.progress(c, '2026-10-26');
  assert.deepStrictEqual([p.done, p.left, p.met, p.dots], [2, 5, false, [true, true, false]]);
  assert.strictEqual(E.progress({ ...c, marks: ['2026-10-24', '2026-10-25', '2026-10-26'] }, '2026-10-26').line, '¡Reto cumplido! 3 de 3');
  assert.strictEqual(E.progress(c, '2026-10-31').line, 'Lograste 2 de 3. ¿Lo intentamos la otra vez?');
  const s = E.coachSummary({ ...f, members: [{ clientId: 'a', displayName: 'Ana', done: 3 }, { clientId: 'b', displayName: 'Beto', done: 1 }, { clientId: 'c', displayName: 'Carla', done: 0 }] }, '2026-10-29');
  assert.deepStrictEqual(s.members.map((m) => m.status), ['cumplio', 'camino', 'no']);
  assert.strictEqual(s.line, '2 de 3 van en camino');
  assert.strictEqual(s.met.length, 1);
});

// ---------------- Constancia congelada en pausa ----------------
test('P1: la constancia se congela en los días de pausa (ni suma ni corta la cuenta)', () => {
  const s = { habits: {}, foods: {}, entries: [] };
  // Dos semanas constantes (lun 28-sep y lun 5-oct), pausa desde el lunes 12-oct, hoy sábado 24-oct.
  for (const d of ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08']) s.habits[d] = { water: 1 };
  s.habits['2026-10-20'] = { water: 1 };   // anotado en modo autónomo durante la pausa
  const sin = Constancia.summary(s, '2026-10-24');
  assert.strictEqual(sin.constantWeeks, 0, 'sin congelar, las semanas de la pausa cortan la cuenta');
  const con = Constancia.summary(s, '2026-10-24', { pauses: [{ from: '2026-10-12', to: null }] });
  assert.strictEqual(con.constantWeeks, 2, 'congelada: se conservan las 2 semanas');
  assert.strictEqual(con.frozenNow, true);
  assert.strictEqual(con.line, 'Tu constancia está congelada: no se pierde');
  assert.strictEqual(con.daysThisWeek, 0, 'lo de la pausa no suma');
  assert.ok(con.week.days.filter((d) => d.date <= '2026-10-24').every((d) => d.frozen));
  // Pausa cerrada: al volver, la cuenta sigue donde estaba y la semana nueva suma.
  for (const d of ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29']) s.habits[d] = { water: 1 };
  const despues = Constancia.summary(s, '2026-10-29', { pauses: [{ from: '2026-10-12', to: '2026-10-25' }] });
  assert.strictEqual(despues.constantWeeks, 3);
  assert.strictEqual(despues.frozenNow, false);
  assert.strictEqual(Constancia.frozenDays([{ from: '2026-10-20', to: null }], '2026-10-22').size, 3);
});

// ---------------- Servidor falso ----------------
const T0 = '2026-10-21T15:00:00.000Z';
const H = 'a'.repeat(64);
const ev = (kind, granted = true) => ({ kind, granted, version: 't', textHash: H, clientAt: T0 });
const rejects = (p, code) => assert.rejects(p, (e) => e instanceof Error && e.code === code);
async function world() {
  const clock = Fake.FakeClock(T0);
  const be = new Fake.FakeBackend({ clock });
  const dev = () => Fake.createFake({ backend: be });
  const login = async (r, email) => { await r.auth.sendCode(email); return (await r.auth.verifyCode(email, be.lastCode(email))).user; };
  const x = dev(); const xu = await login(x, 'x@c.co');
  await x.account.joinApp(); await x.account.recordConsents([ev('coach_agreement')]);
  const code = (await x.coach.becomeCoach('Coach X')).inviteCode;
  const y = dev(); await login(y, 'y@c.co'); await y.account.joinApp(); await y.account.recordConsents([ev('coach_agreement')]); await y.coach.becomeCoach('Coach Y');
  const mkClient = async (email) => {
    const r = dev(); const u = await login(r, email);
    await r.account.joinApp(); await r.account.recordConsents([ev('sensitive_health'), ev('cloud_transfer')]);
    await r.client.joinCoach(code, { body: true, nutrition: true, habits: true, version: 'c', textHash: H });
    be.setPaidUntil(email, be.todayBogota());
    return { r, u };
  };
  const ana = await mkClient('ana@c.co');
  const bea = await mkClient('bea@c.co');
  return { clock, be, x, xu, y, ana, bea };
}
const day = (be, n) => Fake.FakeBackend && new Date(Date.parse(be.todayBogota() + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);

test('L4 (fake): solo la persona escribe su respuesta; el coach vinculado solo ve el indicador y otro coach nada', async () => {
  const { x, y, ana, be } = await world();
  assert.deepStrictEqual(await ana.r.client.myHealth(), { condition: null, pregnancy: null });
  await rejects(ana.r.client.setHealthAnswer('condition', 'tal vez', { version: '1.0-L4', textHash: H }), 'invalid');
  await ana.r.client.setHealthAnswer('condition', 'yes', { version: '1.0-L4', textHash: H });
  await ana.r.client.setHealthAnswer('pregnancy', 'skip', { version: '1.0-L4E', textHash: H });
  const row = (await x.coach.clients()).find((c) => c.clientId === ana.u.id);
  assert.deepStrictEqual([row.healthRestriction, row.pregnancyState], [true, false]);
  assert.ok(!('condition' in row) && !JSON.stringify(row).includes('"yes"'), 'el coach no recibe la respuesta');
  assert.strictEqual((await y.coach.clients()).length, 0);
  await ana.r.account.recordConsents([ev('sensitive_health', false)]);
  assert.strictEqual((await x.coach.clients()).find((c) => c.clientId === ana.u.id).healthRestriction, false, 'sin A3 no hay indicador');
  await rejects(ana.r.client.setHealthAnswer('condition', 'no', { version: '1.0-L4', textHash: H }), 'consent_required');
  void be;
});

test('L5 (fake): la meta la pone SOLO el coach del vínculo; la asesorada la lee en myLink', async () => {
  const { x, y, ana, bea } = await world();
  await x.coach.setProteinGoal(ana.u.id, 110);
  assert.strictEqual((await ana.r.client.myLink()).proteinGoal, 110);
  assert.strictEqual((await bea.r.client.myLink()).proteinGoal, null);
  await rejects(x.coach.setProteinGoal(ana.u.id, 500), 'invalid');
  await rejects(y.coach.setProteinGoal(ana.u.id, 120), 'forbidden');
  await rejects(ana.r.coach.setProteinGoal(ana.u.id, 120), 'forbidden');
  await x.coach.setProteinGoal(ana.u.id, null);
  assert.strictEqual((await ana.r.client.myLink()).proteinGoal, null);
});

test('retos (fake): el coach lanza, la asesorada marca, el coach ve el avance; nadie ve a los demás miembros', async () => {
  const { be, x, y, ana, bea } = await world();
  const t = be.todayBogota();
  await rejects(x.coach.createChallenge({ title: 'Baja 2 kg', habit: 'weight', target: 3, start: t, end: day(be, 6), clients: [ana.u.id] }), 'invalid');
  await rejects(y.coach.createChallenge({ title: 'Agua', habit: 'water', target: 3, start: t, end: day(be, 6), clients: [ana.u.id] }), 'forbidden');
  const ch = await x.coach.createChallenge({ title: '3 entrenos', habit: 'trained', target: 3, start: day(be, -2), end: day(be, 4), clients: [ana.u.id, bea.u.id] });
  assert.strictEqual(ch.members.length, 2);
  const mine = await ana.r.client.myChallenges();
  assert.strictEqual(mine.length, 1);
  assert.strictEqual(mine[0].members, null, 'sin clasificación: la asesorada no ve a los demás');
  await ana.r.client.markChallenge(ch.id, t, true);
  await ana.r.client.markChallenge(ch.id, day(be, -1), true);
  await rejects(ana.r.client.markChallenge(ch.id, day(be, 9), true), 'invalid');
  const list = await x.coach.listChallenges();
  assert.deepStrictEqual(list[0].members.map((m) => m.done).sort(), [0, 2]);
  assert.strictEqual((await y.coach.listChallenges()).length, 0);
  await x.coach.deleteChallenge(ch.id);
  assert.strictEqual((await ana.r.client.myChallenges()).length, 0);
});

test('P1 (fake): en pausa solo suben hábitos, quedan privados y el coach no los ve ni después de reactivar (tampoco lo subido sin conexión)', async () => {
  const { be, x, ana } = await world();
  const hab = (d, w, id) => ({ id, kind: 'habit', nkey: d, date: d, data: { water: w }, updatedAt: new Date(be.clock.now()).toISOString(), deletedAt: null });
  await ana.r.sync.push({ records: [hab(day(be, -9), 2, '00000000-0000-4000-8000-000000000001')] });
  const sees = async (d) => (await x.coach.clientData(ana.u.id)).records.some((r) => r.kind === 'habit' && r.nkey === d);
  assert.strictEqual(await sees(day(be, -9)), true);
  be.setPaidUntil('ana@c.co', day(be, -5));   // en pausa desde hace 4 días
  assert.deepStrictEqual((await ana.r.client.myLink()).pauses, [{ from: day(be, -4), to: null }]);
  await rejects(ana.r.sync.push({ records: [{ ...hab(day(be, -1), 1, '00000000-0000-4000-8000-0000000000e1'), kind: 'entry', data: { weight: 70 } }] }), 'payment_required');
  await rejects(ana.r.sync.push({ records: [] }), 'payment_required');
  await ana.r.sync.push({ records: [hab(day(be, -1), 1.5, '00000000-0000-4000-8000-000000000002')] });
  be.clock.advance(1000);
  await ana.r.sync.push({ records: [hab(day(be, -9), 3, '00000000-0000-4000-8000-000000000001')] });   // edita en pausa un día anterior
  assert.strictEqual(await sees(day(be, -1)), false, 'lo de la pausa no llega al coach');
  assert.strictEqual(await sees(day(be, -9)), false, 'ni la edición en pausa de un día anterior');
  assert.ok((await ana.r.sync.pull(null)).records.some((r) => r.nkey === day(be, -1)), 'la asesorada sí ve lo suyo');
  const before = (await x.coach.clients()).find((c) => c.clientId === ana.u.id);
  assert.strictEqual(before.lastActivity, null, 'la última actividad no delata la pausa');
  await x.coach.setPayment(ana.u.id, day(be, 30));
  assert.deepStrictEqual((await ana.r.client.myLink()).pauses, [{ from: day(be, -4), to: day(be, -1) }]);
  be.clock.advance(1000);
  await ana.r.sync.push({ records: [hab(day(be, -2), 1, '00000000-0000-4000-8000-000000000003'), hab(t0(be), 2, '00000000-0000-4000-8000-000000000004')] });
  assert.strictEqual(await sees(day(be, -1)), false, 'REACTIVADA: sigue sin ver lo de la pausa');
  assert.strictEqual(await sees(day(be, -2)), false, 'lo anotado sin conexión en la pausa y subido después tampoco');
  assert.strictEqual(await sees(t0(be)), true, 'lo nuevo sí');
});
const t0 = (be) => be.todayBogota();

test('P1 (sync): en modo autónomo solo se suben los hábitos; lo demás espera y sube al volver el acceso', async () => {
  const { be, x, ana } = await world();
  let state = Schema.emptyState();
  let meta = { userId: ana.u.id, cursor: null, pushedUpTo: null };
  let autonomous = false;
  const store = { getState: () => state, saveMerged: (s) => { state = s; }, getMeta: () => meta, setMeta: (m) => { meta = m; }, healthAllowed: () => true,
    ownerId: () => ana.u.id, autonomous: () => autonomous };
  const sync = Sync.createSync({ remote: ana.r, store, now: () => be.clock.now() });
  const stamp = () => new Date(be.clock.now()).toISOString();
  state.habits[day(be, -3)] = { id: '00000000-0000-4000-8000-0000000000a1', water: 2, updatedAt: stamp() };
  assert.strictEqual((await sync.run()).status, 'ok');
  be.setPaidUntil('ana@c.co', day(be, -2));
  be.clock.advance(1000);
  state.entries.push({ id: '00000000-0000-4000-8000-0000000000b1', date: day(be, -1), weight: 70, updatedAt: stamp() });
  state.habits[day(be, -1)] = { id: '00000000-0000-4000-8000-0000000000a2', water: 1, updatedAt: stamp() };
  assert.strictEqual((await sync.run()).status, 'paused', 'sin saber que está en pausa, el envío completo recibe payment_required');
  autonomous = true;
  assert.strictEqual((await sync.run()).status, 'ok', 'en modo autónomo sincroniza (solo hábitos)');
  const srv = Object.values(be.records).filter((r) => r.userId === ana.u.id);
  assert.deepStrictEqual(srv.map((r) => r.kind).sort(), ['habit', 'habit']);
  assert.strictEqual(srv.find((r) => r.nkey === day(be, -1)).pausePrivate, true);
  await x.coach.setPayment(ana.u.id, day(be, 30));
  autonomous = false;
  assert.strictEqual((await sync.run()).status, 'ok');
  assert.ok(Object.values(be.records).some((r) => r.userId === ana.u.id && r.kind === 'entry'), 'al volver el acceso sube la medida que esperaba');
  const data = await x.coach.clientData(ana.u.id);
  assert.deepStrictEqual(data.records.filter((r) => r.kind === 'habit').map((r) => r.nkey), [day(be, -3)], 'el coach solo ve lo de antes de la pausa');
  assert.strictEqual(data.records.some((r) => r.kind === 'entry'), false, 'la medida es de un día en pausa: tampoco la ve');
});
