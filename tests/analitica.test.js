// r1 v1.13 · Analítica del coach (M3), ranking privado (M5), gráficas (M4), metas (M1/M2) y el servidor falso de todo eso.
// Las mismas reglas del servidor real se prueban en supabase/tests/170_analitica_admin.test.sql.
const test = require('node:test');
const assert = require('node:assert');
const A = require('../analitica.js');
const Fake = require('../remote-fake.js');

const TODAY = '2026-10-25';
const days = (...offs) => offs.map((n) => A.addDays(TODAY, n));

// ---------------- Periodos ----------------
test('periodos: semana = 7 días hasta hoy contra los 7 anteriores; mes = del 1 a hoy contra el mes anterior completo', () => {
  const s = A.period(TODAY, 'semana');
  assert.deepStrictEqual([s.from, s.to, s.days, s.prevFrom, s.prevTo, s.label], ['2026-10-19', TODAY, 7, '2026-10-12', '2026-10-18', '19–25 oct']);
  const m = A.period(TODAY, 'mes');
  assert.deepStrictEqual([m.from, m.days, m.prevFrom, m.prevTo, m.prevDays], ['2026-10-01', 25, '2026-09-01', '2026-09-30', 30]);
  assert.strictEqual(A.period('2026-01-03', 'mes').prevFrom, '2025-12-01', 'cruza de año');
});

// ---------------- Tendencia y «estancado» ----------------
test('tendencia de peso: bajando, subiendo, estancado solo con 3+ semanas, y «sin datos»', () => {
  assert.strictEqual(A.trend([{ w: 0, kg: 72.6 }, { w: 1, kg: 73.0 }, { w: 2, kg: 73.4 }, { w: 3, kg: 74 }]).kind, 'bajando');
  assert.strictEqual(A.trend([{ w: 0, kg: 75 }, { w: 2, kg: 74.4 }]).kind, 'subiendo');
  const st = A.trend([{ w: 0, kg: 80.1 }, { w: 1, kg: 80.2 }, { w: 2, kg: 79.9 }, { w: 3, kg: 80.0 }, { w: 4, kg: 80.1 }, { w: 5, kg: 81 }]);
  assert.deepStrictEqual([st.kind, st.weeks], ['estancado', 5], 'estable 5 semanas seguidas (la 6.ª ya difiere)');
  assert.strictEqual(A.trend([{ w: 0, kg: 80 }, { w: 1, kg: 80.1 }]).kind, 'sin_datos', 'estable pero con menos de 3 semanas: aún no se dice «estancado»');
  assert.strictEqual(A.trend([{ w: 0, kg: 80 }]).kind, 'sin_datos');
  assert.strictEqual(A.trend([{ w: 2, kg: 80 }, { w: 3, kg: 81 }]).kind, 'sin_datos', 'sin pesajes en las 2 últimas semanas');
  assert.strictEqual(A.trend(null).kind, 'sin_datos');
  assert.strictEqual(A.STALL_KG, 0.3);
});

// ---------------- Resumen (M3) ----------------
const rows = [
  { clientId: 'ana', logDays: days(0, -1, -2, -3, -4, -5, -6, -8, -9), trainedDays: null, weightWeeks: [{ w: 0, kg: 72.6 }, { w: 3, kg: 74 }] },
  { clientId: 'beto', logDays: days(0, -2, -10), trainedDays: days(0, -2, -10), weightWeeks: [{ w: 0, kg: 90 }, { w: 1, kg: 90.1 }, { w: 2, kg: 90.2 }] },
  { clientId: 'carla', logDays: days(-1), trainedDays: days(-1), weightWeeks: [{ w: 0, kg: 70 }, { w: 2, kg: 69.5 }] },
  { clientId: 'hugo', logDays: [], trainedDays: [], weightWeeks: [] },
];
test('constancia promedio, comparación con la semana pasada, registraron hoy / en la semana y entrenos', () => {
  const p = A.period(TODAY, 'semana');
  const s = A.summary(rows, p, TODAY);
  // ana 7/7, beto 2/7, carla 1/7, hugo 0/7 → (1 + .2857 + .1429 + 0) / 4 = 35,7 % → 36
  assert.strictEqual(s.constancia.pct, 36);
  // semana pasada: ana 2/7, beto 1/7 → 10,7 % → 11
  assert.deepStrictEqual([s.constancia.prev, s.constancia.delta], [11, 25]);
  assert.strictEqual(A.deltaText(s, p), '▲ 25 puntos vs. semana pasada');
  assert.deepStrictEqual(s.today, { count: 2, of: 4 });
  assert.deepStrictEqual([s.period.count, s.period.of], [3, 4]);
  assert.deepStrictEqual(s.trained, { people: 2, total: 3, of: 3, notSharing: 1 }, 'Ana no comparte hábitos: no cuenta como 0, va aparte');
  assert.deepStrictEqual(s.trend, { bajando: 1, estancado: 1, subiendo: 1, sin_datos: 1 });
});
test('sin asesorados no se inventan cifras', () => {
  const s = A.summary([], A.period(TODAY, 'semana'), TODAY);
  assert.deepStrictEqual([s.n, s.constancia.pct, s.constancia.delta], [0, null, null]);
});

// ---------------- Ranking (M5) ----------------
test('ranking por constancia y por entrenos (quien no comparte hábitos queda aparte, sin puesto)', () => {
  const p = A.period(TODAY, 'semana');
  const names = { ana: 'Ana', beto: 'Beto', carla: 'Carla', hugo: 'Hugo' };
  const c = A.ranking(rows, 'constancia', { period: p, names });
  assert.deepStrictEqual(c.ranked.map((x) => [x.rank, x.name, x.value]), [[1, 'Ana', 7], [2, 'Beto', 2], [3, 'Carla', 1], [4, 'Hugo', 0]]);
  assert.strictEqual(c.ranked[0].sub, '7 de 7 días con registro');
  const e = A.ranking(rows, 'entrenos', { period: p, names });
  assert.deepStrictEqual(e.ranked.map((x) => x.name), ['Beto', 'Carla', 'Hugo']);
  assert.deepStrictEqual(e.apart.map((x) => [x.name, x.why]), [['Ana', 'no comparte sus hábitos']]);
  assert.strictEqual(e.ranked[0].pct, 100);
});
test('ranking por progreso a la meta: solo con meta del coach; quien no tiene meta queda aparte', () => {
  const p = A.period(TODAY, 'semana');
  const rs = [
    { clientId: 'ana', weightFirst: 78.4, weightLast: 72.9, weightWeeks: [{ w: 0, kg: 72.9 }, { w: 3, kg: 74 }] },
    { clientId: 'beto', weightFirst: 96, weightLast: 94.8, weightWeeks: [{ w: 0, kg: 94.8 }, { w: 1, kg: 94.9 }, { w: 2, kg: 94.8 }, { w: 3, kg: 94.9 }] },
    { clientId: 'diego', weightFirst: 88, weightLast: 88.8, weightWeeks: [{ w: 0, kg: 88.8 }] },
    { clientId: 'carla', waistFirst: 82, waistLast: 79, weightWeeks: [] },
    { clientId: 'hugo', weightFirst: 91, weightLast: 91, weightWeeks: [] },
  ];
  const goals = { ana: { weight_kg: 69.7 }, beto: { weight_kg: 86 }, diego: { weight_kg: 80 }, carla: { waist_cm: 76 } };
  const r = A.ranking(rs, 'meta', { period: p, names: { ana: 'Ana', beto: 'Beto', diego: 'Diego', carla: 'Carla', hugo: 'Hugo' }, goals });
  assert.deepStrictEqual(r.ranked.map((x) => [x.name, x.pct]), [['Ana', 63], ['Carla', 50], ['Beto', 12], ['Diego', 0]]);
  assert.strictEqual(r.ranked[0].sub, 'Faltan 3,2 kg para su meta');
  assert.strictEqual(r.ranked[1].sub, 'Faltan 3 cm de cintura');
  assert.strictEqual(r.ranked[2].sub, 'Estancado hace 4 semanas');
  assert.strictEqual(r.ranked[3].sub, 'Subió 0,8 kg desde el inicio');
  assert.deepStrictEqual(r.apart.map((x) => [x.name, x.why]), [['Hugo', 'sin meta']]);
  assert.strictEqual(A.RANKING_LABEL, 'Solo tú lo ves. Tus asesorados nunca ven un ranking.');
});
test('progreso hacia la meta (bajar o subir), metas alcanzadas y valores que faltan', () => {
  assert.deepStrictEqual(A.progress(70, 80, 75), { pct: 50, left: 5, reached: false, away: false, moved: -5 });
  assert.strictEqual(A.progress(70, 80, 69.5).reached, true);
  assert.strictEqual(A.progress(65, 60, 62).pct, 40, 'meta de subir');
  assert.strictEqual(A.progress(70, 80, 81).away, true);
  assert.strictEqual(A.progress(null, 80, 75), null, 'sin meta no hay progreso');
});

// ---------------- Gráficas (M4) ----------------
const state = {
  entries: [{ date: '2026-10-13', weight: 73.6, waist: 78.5 }, { date: '2026-10-16', weight: 73.4 }, { date: '2026-10-20', weight: 73.0, waist: 77.5 }, { date: '2026-10-24', weight: 72.8 }],
  foods: { '2026-10-24': [{ name: 'Pollo', protein: 40, dish: 'pollo-asado' }, { name: 'Arepa', protein: 20 }], '2026-10-17': [{ name: 'Huevos', protein: 58 }] },
  habits: { '2026-10-24': { trained: true }, '2026-10-22': { trained: true }, '2026-10-15': { trained: true }, '2026-10-14': { trained: false, water: 2 } },
};
test('series por semanas y por meses; lo que no comparte sale como «no comparte»', () => {
  const s = A.series(state, 'peso', 'semanas', TODAY, { body: true });
  assert.strictEqual(s.points.length, 12);
  assert.deepStrictEqual(s.points.slice(-2).map((x) => x.value), [73.5, 72.9]);
  assert.strictEqual(A.series(state, 'entrenos', 'semanas', TODAY, { habits: true }).points.slice(-1)[0].value, 2);
  assert.strictEqual(A.series(state, 'proteina', 'semanas', TODAY, { nutrition: false }).notShared, true);
  const m = A.series(state, 'constancia', 'meses', TODAY, { body: true });
  assert.deepStrictEqual([m.points.length, m.points[5].label, m.points[5].value], [6, 'oct', 8]);
});
test('tabla «Comparar semanas»: colores solo si hay meta del coach (hacia la meta = up), sin meta neutro', () => {
  const c = A.compare(state, 'semanas', TODAY, { body: true, nutrition: true, habits: true }, { weight_kg: 69.7, trained_days: 3 });
  assert.strictEqual(c.title, '12 oct vs. 19 oct');
  const row = Object.fromEntries(c.rows.map((r) => [r.key, r]));
  assert.deepStrictEqual([row.peso.a, row.peso.b, row.peso.change, row.peso.color], ['73,5 kg', '72,9 kg', '−0,6', 'up']);
  assert.deepStrictEqual([row.cintura.change, row.cintura.color], ['−1', ''], 'sin meta de cintura: neutro');
  assert.deepStrictEqual([row.proteina.a, row.proteina.b, row.proteina.change], ['~58 g', '~60 g', '+2']);
  assert.deepStrictEqual([row.entrenos.a, row.entrenos.b, row.entrenos.color], ['1', '2', 'up']);
  assert.strictEqual(row.constancia.b, '3 de 7');
  const sin = A.compare(state, 'semanas', TODAY, { body: true }, {});
  assert.ok(sin.rows.every((r) => r.color === ''), 'sin metas no se colorea nada');
  assert.strictEqual(Object.fromEntries(sin.rows.map((r) => [r.key, r])).entrenos.a, 'no comparte');
});

// ---------------- Metas (M1 / M2) ----------------
test('metas del asesorado: sin meta del coach no hay NADA; con metas, faltan X, promedio de proteína y anillos de hábitos', () => {
  assert.deepStrictEqual(A.metas(state, {}, TODAY), { any: false, cards: [] });
  assert.deepStrictEqual(A.metas(state, null, TODAY).cards, []);
  const m = A.metas(state, { weight_kg: 69.7, protein_g: 110, trained_days: 3 }, TODAY);
  assert.deepStrictEqual(m.cards.map((c) => c.key), ['peso', 'proteina', 'habitos']);
  assert.deepStrictEqual([m.cards[0].now, m.cards[0].progress.left], [72.9, 3.2]);
  assert.strictEqual(m.cards[1].now, 60);
  assert.deepStrictEqual(m.cards[2].rings.map((r) => [r.key, r.done, r.goal]), [['trained', 2, 3]]);
  assert.match(A.GOALS_FOOTER, /^Metas orientativas fijadas exclusivamente por tu coach\. La plataforma no formula, valida ni prescribe/);
});
test('«Fijar metas»: todo opcional, vacío = sin meta, nunca rellena ni sugiere; rangos y enteros', () => {
  assert.deepStrictEqual(A.parseGoals({}), { ok: true, goals: {}, errors: {} });
  assert.deepStrictEqual(A.parseGoals({ weight_kg: '69,7', water_days: '5', waist_cm: '' }).goals, { weight_kg: 69.7, water_days: 5 });
  const bad = A.parseGoals({ weight_kg: '10', water_days: '8', protein_g: '110.5', steps_days: 'abc' });
  assert.strictEqual(bad.ok, false);
  assert.deepStrictEqual(Object.keys(bad.errors).sort(), ['protein_g', 'steps_days', 'water_days', 'weight_kg']);
});

// ---------------- Servidor falso (mismas reglas que grasa.coach_analytics / set_goals) ----------------
const T0 = '2026-10-21T15:00:00.000Z';
const H = 'a'.repeat(64);
const ev = (kind, granted = true) => ({ kind, granted, version: 't', textHash: H, clientAt: T0 });
const rejects = (p, code) => assert.rejects(p, (e) => e instanceof Error && e.code === code);
async function world() {
  const be = new Fake.FakeBackend({ clock: Fake.FakeClock(T0) });
  const dev = () => Fake.createFake({ backend: be });
  const login = async (r, email) => { await r.auth.sendCode(email); return (await r.auth.verifyCode(email, be.lastCode(email))).user; };
  const x = dev(); await login(x, 'x@c.co'); await x.account.joinApp(); await x.account.recordConsents([ev('coach_agreement')]);
  const code = (await x.coach.becomeCoach('Coach X')).inviteCode;
  const y = dev(); await login(y, 'y@c.co'); await y.account.joinApp(); await y.account.recordConsents([ev('coach_agreement')]); await y.coach.becomeCoach('Coach Y');
  const mk = async (email, habits) => {
    const r = dev(); const u = await login(r, email);
    await r.account.joinApp(); await r.account.recordConsents([ev('sensitive_health'), ev('cloud_transfer')]);
    await r.client.joinCoach(code, { body: true, nutrition: true, habits, version: 'c', textHash: H });
    be.setPaidUntil(email, '2026-11-30');
    return { r, u };
  };
  return { be, x, y, ana: await mk('ana@c.co', false), bea: await mk('bea@c.co', true), dev, login };
}
const rec = (kind, date, data, id) => ({ id: id || `00000000-0000-4000-8000-${String(Math.floor(Math.random() * 1e12)).padStart(12, '0')}`, kind, nkey: kind === 'food' ? id : date, date, data, updatedAt: '2026-10-21T10:00:00.000Z' });

test('fake: metas — solo el coach del vínculo; la proteína es la misma meta de v1.11; el asesorado las lee en myLink', async () => {
  const { x, y, ana } = await world();
  assert.deepStrictEqual((await ana.r.client.myLink()).goals, {});
  await x.coach.setGoals(ana.u.id, { weight_kg: 69.7, protein_g: 110, water_days: 5 });
  assert.deepStrictEqual((await ana.r.client.myLink()).goals, { weight_kg: 69.7, water_days: 5, protein_g: 110 });
  assert.strictEqual((await ana.r.client.myLink()).proteinGoal, 110);
  assert.deepStrictEqual((await x.coach.clients()).find((c) => c.clientId === ana.u.id).goals, { weight_kg: 69.7, water_days: 5, protein_g: 110 });
  await rejects(x.coach.setGoals(ana.u.id, { kcal: 1800 }), 'invalid');
  await rejects(x.coach.setGoals(ana.u.id, { water_days: 9 }), 'invalid');
  await rejects(y.coach.setGoals(ana.u.id, { weight_kg: 60 }), 'forbidden');
  await rejects(ana.r.coach.setGoals(ana.u.id, { weight_kg: 60 }), 'forbidden');
  await x.coach.setGoals(ana.u.id, {});
  assert.deepStrictEqual((await ana.r.client.myLink()).goals, {});
});

test('fake: analítica — solo vinculados activos, hábitos null si no los comparte, nada de lo escrito en pausa', async () => {
  const { be, x, y, ana, bea } = await world();
  await ana.r.sync.push({ records: [rec('entry', '2026-10-20', { weight: 73 }), rec('habit', '2026-10-21', { trained: true })] });
  await bea.r.sync.push({ records: [rec('habit', '2026-10-21', { trained: true }), rec('habit', '2026-10-19', { water: 1 })] });
  be.setPaidUntil('bea@c.co', '2026-10-01');   // en pausa: lo que suba queda privado
  await bea.r.sync.push({ records: [rec('habit', '2026-10-20', { trained: true })] });
  const out = await x.coach.analytics('2026-10-15', '2026-10-21');
  const a = out.find((r) => r.clientId === ana.u.id), b = out.find((r) => r.clientId === bea.u.id);
  assert.deepStrictEqual([a.logDays, a.trainedDays, a.weightLast], [['2026-10-20'], null, 73]);
  assert.deepStrictEqual([b.logDays, b.trainedDays], [['2026-10-19', '2026-10-21'], ['2026-10-21']], 'el entreno del 20 (en pausa) no llega');
  assert.strictEqual((await y.coach.analytics('2026-10-15', '2026-10-21')).length, 0);
  await rejects(ana.r.coach.analytics('2026-10-15', '2026-10-21'), 'forbidden');
  await rejects(x.coach.analytics('2026-10-21', '2026-10-15'), 'invalid');
});

test('fake: un coach suspendido no ve analítica ni avisos; sus asesorados no quedan en pausa por pago', async () => {
  const { be, x, ana, dev, login } = await world();
  const adm = dev(); const au = await login(adm, 'jose@c.co'); be._grant(au.id, 'admin');
  const xid = Object.keys(be.coaches).find((k) => be.coaches[k].businessName === 'Coach X');
  await adm.admin.saveNotice({ title: 'Mantenimiento', body: 'La app puede ir lenta.', from: '2026-10-20', to: '2026-10-25' });
  assert.strictEqual((await x.coach.notices('2026-10-21')).length, 1);
  await rejects(ana.r.coach.notices('2026-10-21'), 'forbidden');
  be.setPaidUntil('ana@c.co', '2026-10-01');
  assert.strictEqual(be.paymentBlocked(ana.u.id), true);
  await adm.admin.setCoachActive(xid, false, 'prueba');
  assert.strictEqual(be.paymentBlocked(ana.u.id), false, 'su coach no puede marcar pagos: no se la deja en pausa');
  await rejects(x.coach.analytics('2026-10-15', '2026-10-21'), 'forbidden');
  await rejects(x.coach.notices('2026-10-21'), 'forbidden');
  assert.ok(await ana.r.client.myLink(), 'la asesorada conserva su vínculo');
  await adm.admin.setCoachActive(xid, true);
  assert.strictEqual(be.paymentBlocked(ana.u.id), true);
});
