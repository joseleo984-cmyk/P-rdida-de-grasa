// v1.15 · Puntos de constancia (concepto jurídico 7): reglas (puntos.js = referencia del servidor) y servidor falso (cálculo en el «servidor»,
// meta colectiva agregada con mínimo 5, opt-out). Las MISMAS reglas del servidor real: supabase/tests/190_puntos_meta.test.sql.
const test = require('node:test');
const assert = require('node:assert');
const P = require('../puntos.js');
const Fake = require('../remote-fake.js');

// Miércoles 21-oct-2026 (semana: lunes 19 a domingo 25).
const TODAY = '2026-10-21', WK = '2026-10-19';
const day = (n) => P.addDays(TODAY, n);
const base = (over = {}) => ({ userLog: [], day: TODAY, today: TODAY, paused: false, habit: null, foods: 0, entry: null, prevRecordDay: null, plan: 5, ...over });
const sum = (log, d) => log.filter((r) => !d || r.day === d).reduce((s, r) => s + r.points, 0);
const src = (log, d, s) => log.filter((r) => r.day === d && r.source === s).reduce((a, r) => a + r.points, 0);

test('un día normal: registrar 2 + agua 1 + pasos 1 + sueño 1 + entreno 3; recalcular el mismo día no suma doble', () => {
  const ctx = base({ habit: { water: 2, steps: 8000, sleep: 8, trained: true } });
  const a = P.refreshDay(ctx);
  assert.strictEqual(sum(a), 8);
  assert.strictEqual(sum(P.refreshDay({ ...ctx, userLog: a })), 8, 'editar el mismo día recalcula desde lo registrado');
  const b = P.refreshDay({ ...ctx, userLog: a, habit: { water: 1.75, steps: 25000, sleep: 11, trained: true } });
  assert.deepStrictEqual([src(b, TODAY, 'agua'), src(b, TODAY, 'pasos'), src(b, TODAY, 'sueno')], [0, 1, 0], 'agua bajo la meta 0; 25.000 pasos = 8.000; > 10 h de sueño 0');
});

test('comidas por registrar (≥ 2) y nunca por las kcal; medidas 3 una vez por semana y nunca por el resultado; fotos: no existen en las reglas', () => {
  assert.strictEqual(src(P.refreshDay(base({ foods: 1 })), TODAY, 'comidas'), 0);
  assert.strictEqual(src(P.refreshDay(base({ foods: 2 })), TODAY, 'comidas'), 1);
  const m1 = P.refreshDay(base({ entry: { weight: 70 } }));
  const m2 = P.refreshDay({ ...base({ entry: { weight: 95, waist: 110 } }), userLog: m1 });
  assert.strictEqual(src(m1, TODAY, 'medidas'), 3);
  assert.strictEqual(sum(m2), sum(m1), 'cambiar el valor no cambia los puntos');
  const y = P.refreshDay({ ...base({ day: day(-1), entry: { weight: 70 } }), userLog: m1 });
  assert.strictEqual(src(y, day(-1), 'medidas'), 0, 'otra medida a menos de 6 días: 0');
  assert.strictEqual(src(y, day(-1), 'registro'), 2);
  assert.ok(!JSON.stringify(P.POINTS).match(/foto|kg|kcal|peso|cintura/i), 'ninguna fuente de puntos es foto, peso, cm o kcal');
});

test('solo hoy y ayer; valores raros sin puntos', () => {
  assert.strictEqual(sum(P.refreshDay(base({ day: day(-3), habit: { water: 2, trained: true } }))), 0, 'hace 3 días: 0');
  assert.strictEqual(sum(P.refreshDay(base({ day: day(-1), habit: { water: 2 } }))), 3, 'ayer sí');
  assert.strictEqual(sum(P.refreshDay(base({ habit: { water: 9, steps: 70000, sleep: 15 } }))), 0, 'raros: nada, ni registrar');
  assert.strictEqual(sum(P.refreshDay(base({ entry: { weight: 900 } }))), 0, 'peso imposible: nada');
});

test('topes: 12 al día (se recorta por el final: volviste) y 80 a la semana', () => {
  const full = base({ habit: { water: 2, steps: 8000, sleep: 8, trained: true }, foods: 2, entry: { weight: 80 }, prevRecordDay: day(-20) });
  const a = P.refreshDay(full);
  assert.strictEqual(sum(a), 12);
  assert.strictEqual(src(a, TODAY, 'volviste'), 0);
  const seeded = Array.from({ length: 7 }, (_, i) => P.addDays(WK, i)).filter((d) => d !== TODAY).map((d) => ({ day: d, source: 'registro', points: 12 }));
  seeded.push({ day: P.addDays(WK, 6), source: 'agua', points: 3 });   // 6 × 12 + 3 = 75
  const b = P.refreshDay({ ...base({ habit: { water: 2, steps: 8000, sleep: 8, trained: true } }), userLog: seeded });
  assert.strictEqual(src(b, TODAY, 'registro') + src(b, TODAY, 'entreno') + src(b, TODAY, 'agua'), 5, 'con 75, el día suma 5');
  assert.strictEqual(b.filter((r) => r.day >= WK && r.day <= P.addDays(WK, 6)).reduce((s, r) => s + r.points, 0), 80);
});

test('entrenos hasta el plan; descanso del plan y «me siento mal» suman 2 hasta los descansos del plan', () => {
  const log = [{ day: WK, source: 'entreno', points: 3 }, { day: day(-1), source: 'entreno', points: 3 }];
  assert.strictEqual(src(P.refreshDay({ ...base({ habit: { trained: true }, plan: 2 }), userLog: log }), TODAY, 'entreno'), 0, 'plan de 2 cumplido');
  assert.strictEqual(src(P.refreshDay({ ...base({ habit: { trained: true }, plan: 3 }), userLog: log }), TODAY, 'entreno'), 3);
  assert.strictEqual(src(P.refreshDay(base({ habit: { rest: 'plan' } })), TODAY, 'descanso'), 2);
  assert.strictEqual(src(P.refreshDay(base({ habit: { rest: 'sick' } })), TODAY, 'descanso'), 2);
  const rest = [{ day: WK, source: 'descanso', points: 2 }, { day: day(-1), source: 'descanso', points: 2 }];
  assert.strictEqual(src(P.refreshDay({ ...base({ habit: { rest: 'plan' } }), userLog: rest }), TODAY, 'descanso'), 0, 'plan de 5: 2 descansos con puntos');
  assert.deepStrictEqual([1, 4, 5, 6, 7].map(P.restCap), [3, 3, 2, 1, 1]);
});

test('pausa: ni se gana ni se pierde', () => {
  const prev = [{ day: day(-1), source: 'registro', points: 2 }];
  assert.deepStrictEqual(P.refreshDay({ ...base({ habit: { water: 2 }, paused: true }), userLog: prev }), prev);
});

test('retos: un día de reto suma solo si hay registro real ese día; el bono es de 10 una sola vez y máximo 2 por semana', () => {
  const ch = { id: 'r1', habit: 'water', target: 1, start: day(-1), end: day(5), marks: [TODAY] };
  const noRec = P.refreshDay({ ...base({ foods: 1 }), challenges: [ch], habitOnDay: () => false });
  assert.strictEqual(src(noRec, TODAY, 'reto:r1'), 0, 'marca sin registro del hábito: no da puntos');
  const ok = P.refreshDay({ ...base({ habit: { water: 1 } }), challenges: [ch], habitOnDay: (d, h) => h === 'water' && d === TODAY });
  assert.strictEqual(src(ok, TODAY, 'reto:r1'), 10);
  const again = P.refreshDay({ ...base({ habit: { water: 1.25 } }), userLog: ok, challenges: [ch], habitOnDay: () => true });
  assert.strictEqual(again.filter((r) => r.source.startsWith('reto:')).length, 1, 'una sola vez');
  const three = ['a', 'b', 'c'].map((id) => ({ ...ch, id }));
  const many = P.refreshDay({ ...base({ habit: { water: 1 } }), challenges: three, habitOnDay: () => true });
  assert.strictEqual(many.filter((r) => r.source.startsWith('reto:')).length, 2, 'máximo 2 retos con puntos por semana');
});

test('semana constante: bono de 5 el lunes por la semana anterior (≥ 4 días, o ≥ 2 con comodines)', () => {
  const prevWk = P.addDays(WK, -7);
  const four = [0, 1, 2, 3].map((i) => ({ day: P.addDays(prevWk, i), source: 'registro', points: 2 }));
  assert.strictEqual(src(P.refreshDay({ ...base({ habit: { water: 1 } }), userLog: four }), WK, 'semana'), 5);
  const two = four.slice(0, 2);
  assert.strictEqual(src(P.refreshDay({ ...base({ habit: { water: 1 } }), userLog: two }), WK, 'semana'), 5, 'con 2 días y 2 comodines');
  assert.strictEqual(src(P.refreshDay({ ...base({ habit: { water: 1 } }), userLog: four.slice(0, 1) }), WK, 'semana'), 0);
});

test('presentación: línea de Inicio, nivel, desglose del día, comparación SOLO consigo misma y la barra común del team', () => {
  const log = P.refreshDay(base({ habit: { water: 2, steps: 8000, sleep: 8, trained: true } }));
  const s = P.summary([...log, { day: P.addDays(WK, -7), source: 'registro', points: 2 }], TODAY);
  assert.strictEqual(P.homeLine(s), '8 puntos esta semana · +8 hoy');
  assert.strictEqual(s.weeks.length, 8);
  assert.strictEqual(s.best, 2);
  assert.strictEqual(P.selfCompare(s), '6 más que la semana pasada');
  assert.deepStrictEqual(P.dayDetail(s, TODAY).map((x) => x.kind), ['registro', 'entreno', 'agua', 'pasos', 'sueno']);
  assert.deepStrictEqual(P.level(0), { name: 'Arranque', next: 'En marcha', toNext: 150, pct: 0 });
  assert.strictEqual(P.level(600).name, 'Constante');
  assert.strictEqual(P.teamLine({ metric: 'entrenos', target: 60, published: false, min: 5 }).text, 'La meta del team se activa cuando sean 5 o más.');
  assert.match(P.teamLine({ metric: 'entrenos', target: 60, published: true, total: 34, participants: 7 }).text, /^34 de 60 entrenos · 7 personas sumando$/);
  assert.strictEqual(P.teamLine({ none: true }), null);
});

// ---------------- Servidor falso: el cálculo vive en el «servidor» ----------------
const T0 = '2026-10-21T15:00:00.000Z';
const H = 'a'.repeat(64);
const ev = (kind, granted = true) => ({ kind, granted, version: 't', textHash: H, clientAt: T0 });
const rejects = (p, code) => assert.rejects(p, (e) => e instanceof Error && e.code === code);
let seq = 0;
const rec = (kind, date, data) => { const id = `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`; return { id, kind, nkey: kind === 'food' ? id : date, date, data, updatedAt: new Date(Date.parse(T0) - 60000 + seq).toISOString() }; };
async function world(n = 6) {
  const be = new Fake.FakeBackend({ clock: Fake.FakeClock(T0) });
  const dev = () => Fake.createFake({ backend: be });
  const login = async (r, email) => { await r.auth.sendCode(email); return (await r.auth.verifyCode(email, be.lastCode(email))).user; };
  const x = dev(); await login(x, 'x@c.co'); await x.account.joinApp(); await x.account.recordConsents([ev('coach_agreement')]);
  const code = (await x.coach.becomeCoach('Coach X')).inviteCode;
  const admin = dev(); const au = await login(admin, 'admin@c.co'); be._grant(au.id, 'admin');
  const cs = [];
  for (let i = 0; i < n; i++) {
    const r = dev(); const email = `c${i}@c.co`; const u = await login(r, email);
    await r.account.joinApp(); await r.account.recordConsents([ev('sensitive_health'), ev('cloud_transfer')]);
    await r.client.joinCoach(code, { body: true, nutrition: true, habits: true, version: 'c', textHash: H });
    be.setPaidUntil(email, '2026-11-30');
    cs.push({ r, u, email });
  }
  return { be, x, admin, cs };
}

test('fake: el teléfono sube registros y el «servidor» calcula; un registro tardío no da puntos; medir no da por el resultado', async () => {
  const { cs } = await world(1);
  const [a] = cs;
  await a.r.sync.push({ records: [rec('habit', TODAY, { water: 2, steps: 8000, sleep: 8, trained: true }), rec('habit', day(-3), { water: 2 })] });
  let p = await a.r.client.myPoints();
  assert.deepStrictEqual([p.todayPoints, p.week], [8, 8]);
  const m = rec('entry', TODAY, { weight: 70 });
  await a.r.sync.push({ records: [m] });
  assert.strictEqual((await a.r.client.myPoints()).todayPoints, 11);
  await a.r.sync.push({ records: [{ ...m, data: { weight: 95 }, updatedAt: new Date(Date.parse(T0) + 1000).toISOString() }] });
  p = await a.r.client.myPoints();
  assert.strictEqual(p.todayPoints, 11, 'cambiar el peso no cambia los puntos');
  assert.ok(!p.log.some((r) => r.day === day(-3)), 'lo de hace 3 días no dio puntos');
});

test('fake: meta colectiva agregada; con menos de 5 no se publica; opt-out y pausa excluyen; nadie recibe aportes individuales', async () => {
  const { be, x, admin, cs } = await world(6);
  for (const c of cs.slice(0, 5)) await c.r.sync.push({ records: [rec('habit', TODAY, { trained: true })] });
  let g = await x.coach.setTeamGoal('entrenos', 60);
  assert.deepStrictEqual([g.published, g.participants, g.total], [true, 6, 5]);
  assert.deepStrictEqual(Object.keys(g).sort(), ['metric', 'min', 'participants', 'published', 'target', 'total', 'weekEnd', 'weekStart']);
  const mine = await cs[5].r.client.myTeamGoal();
  assert.deepStrictEqual([mine.total, mine.participants, mine.optedOut], [5, 6, false]);
  assert.ok(!JSON.stringify(mine).match(/[0-9a-f]{8}-[0-9a-f]{4}-/), 'sin ids');
  await cs[0].r.client.setTeamOptOut(true);
  g = await x.coach.teamGoal();
  assert.deepStrictEqual([g.participants, g.total], [5, 4], 'quien se retira no cuenta, ni su entreno');
  be.setPaidUntil(cs[1].email, '2026-10-01');   // en pausa
  g = await x.coach.teamGoal();
  assert.deepStrictEqual([g.published, g.participants, g.total], [false, null, null], 'con 4: no se publica');
  assert.strictEqual((await cs[2].r.client.myTeamGoal()).total, null);
  await rejects(cs[2].r.coach.teamGoal(), 'forbidden');
  await rejects(cs[2].r.coach.points('2026-10-15', TODAY), 'forbidden');
  await rejects(admin.coach.points('2026-10-15', TODAY), 'forbidden');
  const pts = await x.coach.points('2026-10-15', TODAY);
  assert.strictEqual(pts.length, 6);
  assert.strictEqual(pts.find((r) => r.clientId === cs[3].u.id).points, 5);
  assert.ok(!('log' in pts[0]), 'el coach recibe un número por persona, no el detalle');
});
