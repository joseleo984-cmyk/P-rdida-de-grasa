// r1 v1.13 · Panel admin (M7–M10): cobro, uso, éxito de los coaches y avisos. Lógica pura (admin.js) y servidor falso.
// Regla de oro (Ley 1581, concepto 5): el admin nunca recibe datos de salud ni nombres, iniciales o ids de asesorados.
const test = require('node:test');
const assert = require('node:assert');
const Adm = require('../admin.js');
const Fake = require('../remote-fake.js');

test('cobro: precio en UN solo lugar (USD 5 por asesorado activo sobre el cupo) y totales', () => {
  assert.strictEqual(Adm.PRICE_USD_PER_ACTIVE_CLIENT, 5);
  assert.deepStrictEqual(Adm.billing({ activeClients: 12, freeClients: 5, active: true }), { active: 12, free: 5, over: 7, amount: 35, text: 'USD 35' });
  assert.strictEqual(Adm.billing({ activeClients: 4, freeClients: 5, active: true }).text, 'USD 0');
  assert.strictEqual(Adm.billing({ activeClients: 0, freeClients: 5, active: false }).text, '—', 'suspendido y sin cobro: «—»');
  const t = Adm.totals([{ activeClients: 8, freeClients: 5, active: true }, { activeClients: 12, freeClients: 5, active: true }, { activeClients: 6, freeClients: 5, active: true },
    { activeClients: 4, freeClients: 5, active: true }, { activeClients: 0, freeClients: 5, active: false }]);
  assert.deepStrictEqual([t.coachesActive, t.coaches, t.over, t.amountText], [4, 5, 11, 'USD 55'], 'los números del boceto M7');
});

test('meses, barras, tamaños, retención, última actividad y días de panel', () => {
  assert.deepStrictEqual(Adm.months('2026-10-25', 3).map((m) => m.label), ['Octubre 2026', 'Septiembre 2026', 'Agosto 2026']);
  assert.strictEqual(Adm.months('2026-01-10', 2)[1].value, '2025-12-01');
  assert.deepStrictEqual(Adm.bars([50, 100, null], 100).map((b) => b.h), [50, 100, 0]);
  assert.deepStrictEqual(Adm.sizes({ s1_5: 1, s6_10: 2, s11: 1 }).map((x) => [x.label, x.n, x.pct]), [['1 a 5', 1, 25], ['6 a 10', 2, 50], ['11 o más', 1, 25]]);
  assert.deepStrictEqual([Adm.pct(7, 9), Adm.pct(0, 0), Adm.pctText(null)], [78, null, '—']);
  assert.deepStrictEqual(Adm.lastActivity({ lastActionAt: '2026-10-25T19:16:00.000Z', lastPanelDay: '2026-10-25' }, '2026-10-25'), { big: 'Hoy', sub: 'última actividad 14:16' });
  assert.deepStrictEqual(Adm.lastActivity({ lastActionAt: null, lastPanelDay: '2026-10-23' }, '2026-10-25'), { big: 'Hace 2 días', sub: 'última actividad' });
  const w = Adm.panelWeek('2026-10-25', ['2026-10-19', '2026-10-20', '2026-10-22', '2026-10-23', '2026-10-25']);
  assert.deepStrictEqual([w.count, w.days[0].dow, w.days[0].n, w.days[2].on], [5, 'Lun', 19, false]);
  assert.deepStrictEqual(Adm.weekLabels([{ start: '2026-09-07' }, { start: '2026-09-14' }, { start: '2026-09-21' }]), ['7 sept', '', 'hoy']);
});

test('avisos: validación y estado (activo, terminó, programado)', () => {
  assert.strictEqual(Adm.validNotice({ title: 'Mantenimiento el domingo', body: 'La app puede ir lenta.', from: '2026-10-27', to: '2026-11-01' }, '2026-10-25').ok, true);
  assert.ok(Adm.validNotice({ title: 'X', body: 'Hola', from: '2026-10-27', to: '2026-10-26' }, '2026-10-25').errors.dates);
  assert.ok(Adm.validNotice({ title: 'Hola', body: '', from: '2026-10-27', to: '2026-10-28' }, '2026-10-25').errors.body);
  assert.deepStrictEqual(['2026-10-20', '2026-10-31', '2026-11-05'].map((d) => Adm.noticeState({ startsOn: '2026-10-20', endsOn: '2026-10-31' }, d === '2026-11-05' ? d : d)), ['Activo', 'Activo', 'Terminó']);
  assert.strictEqual(Adm.noticeState({ startsOn: '2026-10-27', endsOn: '2026-11-01' }, '2026-10-25'), 'Programado');
});

// ---------------- Servidor falso ----------------
const T0 = '2026-10-21T15:00:00.000Z';
const H = 'a'.repeat(64);
const ev = (kind) => ({ kind, granted: true, version: 't', textHash: H, clientAt: T0 });
const rejects = (p, code) => assert.rejects(p, (e) => e instanceof Error && e.code === code);
async function world() {
  const be = new Fake.FakeBackend({ clock: Fake.FakeClock(T0) });
  const dev = () => Fake.createFake({ backend: be });
  const login = async (r, email) => { await r.auth.sendCode(email); return (await r.auth.verifyCode(email, be.lastCode(email))).user; };
  const x = dev(); const xu = await login(x, 'x@c.co'); await x.account.joinApp(); await x.account.recordConsents([ev('coach_agreement')]);
  be.profiles[xu.id] = { displayName: 'Xavi R.' };
  const code = (await x.coach.becomeCoach('Fuerza Studio')).inviteCode;
  const clients = [];
  for (const n of ['ana', 'bea', 'cami', 'dani']) {
    const r = dev(); const u = await login(r, `${n}@c.co`); be.profiles[u.id] = { displayName: `${n} Secreta` };
    await r.account.joinApp(); await r.account.recordConsents([ev('sensitive_health'), ev('cloud_transfer')]);
    await r.client.joinCoach(code, { body: true, nutrition: true, habits: true, version: 'c', textHash: H });
    be.setPaidUntil(`${n}@c.co`, '2026-11-20');
    await r.sync.push({ records: [{ id: `00000000-0000-4000-8000-00000000000${clients.length}`, kind: 'entry', nkey: '2026-10-20', date: '2026-10-20', data: { weight: 80, waist: 90 }, updatedAt: T0 },
      { id: `00000000-0000-4000-8000-00000000010${clients.length}`, kind: 'habit', nkey: '2026-10-21', date: '2026-10-21', data: { trained: true, water: 2 }, updatedAt: T0 }] });
    clients.push(u);
  }
  const adm = dev(); const au = await login(adm, 'jose@c.co');
  return { be, x, xu, adm, au, clients, dev, login };
}

test('fake admin: sin el rol nadie entra; con el rol solo cantidades (nada de salud ni de asesorados)', async () => {
  const { be, x, adm, au, clients, xu } = await world();
  await rejects(adm.admin.coaches('2026-10-01'), 'forbidden');
  await rejects(x.admin.usage('2026-10-01'), 'forbidden');
  be._grant(au.id, 'admin');
  const cs = await adm.admin.coaches('2026-10-01');
  assert.deepStrictEqual(cs.map((c) => [c.businessName, c.coachName, c.activeClients, c.overFree]), [['Fuerza Studio', 'Xavi R.', 4, 0]]);
  const all = JSON.stringify([cs, await adm.admin.usage('2026-10-01'), await adm.admin.coachUsage(xu.id, '2026-10-01'), await adm.admin.success('2026-10-01')]);
  for (const c of clients) assert.ok(!all.includes(c.id), 'ningún id de asesorado');
  assert.doesNotMatch(all, /Secreta|weight|waist|peso|cintura|"kg"|water|steps|sleep|kcal|protein|photo|health|pain/i, 'ni nombres de asesorados ni claves de salud o medidas');
  const u = await adm.admin.coachUsage(xu.id, '2026-10-01');
  assert.deepStrictEqual([u.weeks.length, u.weeks[7].pctLogging, u.weeks[7].trained], [8, 100, 4]);
  const s = (await adm.admin.success('2026-10-01'))[0];
  assert.deepStrictEqual([s.habitsGroup, s.onTimePct], [4, 100]);
});

test('fake admin: suspender y reactivar con motivo; los avisos solo los escribe el admin y los leen los coaches activos', async () => {
  const { be, x, adm, au, xu, dev, login } = await world();
  be._grant(au.id, 'admin');
  await adm.admin.setCoachActive(xu.id, false, 'No pagó la plataforma');
  assert.deepStrictEqual((await adm.admin.coaches('2026-10-01')).map((c) => [c.active, c.lastReason]), [[false, 'No pagó la plataforma']]);
  await rejects(x.coach.notices('2026-10-21'), 'forbidden');
  await adm.admin.setCoachActive(xu.id, true);
  const n = await adm.admin.saveNotice({ title: 'Mantenimiento', body: 'Puede ir lenta.', from: '2026-10-21', to: '2026-10-25' });
  await adm.admin.saveNotice({ title: 'Cobro de septiembre', body: 'Terminó.', from: '2026-10-20', to: '2026-10-20' });
  assert.deepStrictEqual((await x.coach.notices('2026-10-21')).map((z) => z.title), ['Mantenimiento']);
  await rejects(x.admin.saveNotice({ title: 'Hola', body: 'Hola', from: '2026-10-21', to: '2026-10-22' }), 'forbidden');
  await rejects(adm.admin.saveNotice({ title: 'X', body: 'Hola', from: '2026-10-21', to: '2026-10-22' }), 'invalid');
  const cli = dev(); await login(cli, 'otra@c.co');
  await rejects(cli.coach.notices('2026-10-21'), 'forbidden');
  await adm.admin.deleteNotice(n.id);
  assert.strictEqual((await x.coach.notices('2026-10-21')).length, 0);
  await x.coach.panelOpened('2026-10-21');
  assert.deepStrictEqual((await adm.admin.coachUsage(xu.id, '2026-10-01')).panelDays, ['2026-10-21']);
  await rejects(x.coach.panelOpened('2026-09-01'), 'invalid');
});
