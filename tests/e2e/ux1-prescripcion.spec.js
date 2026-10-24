// UX Etapa 1, punto 1 (verificación legal): en el producto «coach» NUNCA se muestra nada que prescriba (concepto jurídico 2, L5: la plataforma no formula,
// valida ni prescribe requerimientos nutricionales). Se recorren TODAS las pantallas del asesorado y del coach (incluida la ficha) con datos que harían aparecer
// el plan heredado (perfil con peso meta, comidas, peso estable) y se falla si en cualquier parte del DOM (visible u oculto) aparece alguna de estas frases.
const { test, expect } = require('@playwright/test');
const H = require('./s11-helpers');

const PROHIBIDO = /Objetivo diario|kcal\s*\/\s*d[ií]a|reduce\b|sube ~|semanas para|d[eé]ficit|te pasaste|te quedan \d|meta en ~/i;
const todoElTexto = (page) => page.evaluate(() => {
  const c = document.body.cloneNode(true);
  c.querySelectorAll('script, style, template, noscript').forEach((n) => n.remove());
  return c.textContent.replace(/\s+/g, ' ');
});
async function sinPrescripcion(page, donde) {
  const t = await todoElTexto(page);
  const m = t.match(PROHIBIDO);
  expect(m && t.slice(Math.max(0, m.index - 60), m.index + 80), `texto prohibido en ${donde}`).toBeNull();
}
const PERFIL = { name: 'Ana', sex: 'female', age: 35, height: 165, startWeight: 78, goalWeight: 66, startDate: '2026-08-01', activity: 1.375, rate: 0.005 };
const iso = (n) => new Date(Date.UTC(2026, 9, 21 + n)).toISOString().slice(0, 10);

test('asesorado (producto coach): ninguna pantalla muestra plan, objetivo diario, consejos de calorías ni «semanas para la meta»', async ({ browser }, testInfo) => {
  const ph = await H.phone(browser, testInfo);
  const { p, errors } = ph;
  await p.goto('index.html');
  await H.acceptSolo(p, { habits: true });
  const code = await H.seedCoach(p, 'laura@coach.co', 'Laura Fit');
  await p.goto(`index.html?c=${code}`);
  await H.enterWithEmail(p, 'ana@c.co', 'Ana Martínez');
  await p.getByRole('button', { name: 'Conectarme y continuar' }).click();
  await p.getByRole('button', { name: 'Ir a la app' }).click();
  await p.evaluate(() => window.__pgFakeBackend.setPaidUntil('ana@c.co', new Date(window.__pgFakeBackend.clock.now() - 5 * 3600000 + 30 * 86400000).toISOString().slice(0, 10)));
  await p.evaluate(() => PGAccount.refreshLink());
  // Datos que, en la app heredada, harían aparecer el plan y los consejos: perfil con meta, pesos estables, comidas y pocas horas de sueño.
  await p.evaluate(({ perfil, dias }) => {
    const s = JSON.parse(localStorage.getItem('perdida-grasa:v1'));
    s.profile = { ...perfil, updatedAt: '2026-10-20T10:00:00.000Z' };
    s.entries = dias.map((d, i) => ({ id: `00000000-0000-4000-8000-0000000007${String(i).padStart(2, '0')}`, date: d, weight: 74.2, waist: 84, updatedAt: '2026-10-20T10:00:00.000Z' }));
    s.foods = { [dias[0]]: [{ id: '00000000-0000-4000-8000-000000000801', name: 'Almuerzo', meal: 'Almuerzo', kcal: 1900, protein: 40, carbs: 200, fat: 60, updatedAt: '2026-10-20T10:00:00.000Z' }] };
    s.habits = Object.fromEntries(dias.map((d, i) => [d, { id: `00000000-0000-4000-8000-0000000009${String(i).padStart(2, '0')}`, sleep: 5, water: 1, steps: 2000, trained: false, updatedAt: '2026-10-20T10:00:00.000Z' }]));
    localStorage.setItem('perdida-grasa:v1', JSON.stringify(s));
  }, { perfil: PERFIL, dias: [iso(-1), iso(-3), iso(-5), iso(-8), iso(-10), iso(-12), iso(-15)] });
  await p.reload(); await H.ready(p);
  const views = await p.evaluate(() => [...document.querySelectorAll('main .view')].map((v) => v.id.replace('view-', '')));
  expect(views.length).toBeGreaterThan(10);
  for (const v of views) {
    if (v === 'perfil') { for (const m of ['plan', 'all', 'datos', 'copia', 'coach']) { await p.evaluate(([a, b]) => PGNav.show(a, b), ['perfil', m]); await sinPrescripcion(p, `perfil:${m}`); } continue; }
    await p.evaluate((x) => PGNav.show(x), v);
    await sinPrescripcion(p, v);
  }
  // Y tras recorrer los botones de la barra
  for (const id of await p.locator('.tabbar button:visible').evaluateAll((bs) => bs.map((b) => b.id))) { await p.locator('#' + id).click(); await sinPrescripcion(p, id); }
  expect(errors).toEqual([]);
});

test('coach (producto coach): lista, ficha de un asesorado con perfil, Invitar y Más no muestran prescripciones', async ({ browser }, testInfo) => {
  const ph = await H.phone(browser, testInfo, { prefs: {} });
  const { p, errors } = ph;
  await p.goto('index.html');
  await H.acceptSolo(p);
  const code = await H.seedCoach(p, 'laura@coach.co', 'Laura Fit');
  await p.evaluate(async () => {
    const be = window.__pgFakeBackend;
    const r = RemoteFake.createFake({ backend: be, storage: localStorage });
    await r.auth.sendCode('laura@coach.co');
    const { user } = await r.auth.verifyCode('laura@coach.co', be.lastCode('laura@coach.co'));
    const c = await r.coach.myCoach();
    const cons = (v) => ({ granted: true, version: v, textHash: 'a'.repeat(64), clientAt: '2026-10-01T12:00:00.000Z' });
    localStorage.setItem('perdida-grasa:account', JSON.stringify({ userId: user.id, email: user.email, roles: ['client', 'coach'], onboarded: true, coach: c, cloudAsked: true,
      consents: { sensitive_health: cons('0.2-AU'), cloud_transfer: cons('0.2-AU'), coach_agreement: cons(ConsentTexts.version('A7')) } }));
    localStorage.setItem('perdida-grasa:owner', user.id);
  });
  await H.seedClient(p, 'ana@c.co', 'Ana Martínez', code, { paidDays: 20, habits: true, nutrition: true,
    measures: [{ date: iso(-14), data: { weight: 74.5, waist: 85 } }, { date: iso(-1), data: { weight: 74.2, waist: 84 } }],
    habitDays: [{ date: iso(-1), data: { water: 1, steps: 2000, sleep: 5, trained: false } }],
    foods: [{ date: iso(-1), data: { name: 'Almuerzo', meal: 'Almuerzo', kcal: 1900, protein: 40, carbs: 200, fat: 60 } }] });
  // El perfil (con meta de peso) del asesorado también llega al coach: con la app heredada produciría «Objetivo diario».
  await p.evaluate(async (perfil) => {
    const be = window.__pgFakeBackend;
    const m = {}; const mem = { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
    const r = RemoteFake.createFake({ backend: be, storage: mem });
    await r.auth.sendCode('ana@c.co');
    const { user } = await r.auth.verifyCode('ana@c.co', be.lastCode('ana@c.co'));
    await r.sync.push({ records: [{ id: user.id, kind: 'profile', nkey: 'profile', date: null, data: perfil, updatedAt: '2026-10-21T10:00:00.000Z' }] });
  }, PERFIL);
  await p.reload(); await H.ready(p);
  await p.locator('#tab-coach').click();
  await expect(p.locator('#coach-clients [data-client]').first()).toBeVisible();
  await sinPrescripcion(p, 'lista del coach');
  await p.locator('#coach-clients [data-client]').first().click();
  await expect(p.locator('#coach-detail-view')).toBeVisible();
  await expect(p.locator('#coach-detail-comidas')).toContainText('Almuerzo');
  await sinPrescripcion(p, 'ficha del asesorado');
  const views = await p.evaluate(() => [...document.querySelectorAll('main .view')].map((v) => v.id.replace('view-', '')));
  for (const v of views) { if (v === 'perfil') continue; await p.evaluate((x) => PGNav.show(x), v); await sinPrescripcion(p, v); }
  for (const id of await p.locator('.tabbar button:visible').evaluateAll((bs) => bs.map((b) => b.id))) { await p.locator('#' + id).click(); await sinPrescripcion(p, 'coach ' + id); }
  expect(errors).toEqual([]);
});

test('control: la app OFICIAL (sin producto coach) sí conserva su plan (la prueba mira el sitio correcto)', async ({ page }) => {
  await page.goto('index.html');
  expect(await page.evaluate(() => typeof Calc.plan)).toBe('function');
  await expect(page.locator('body.producto-coach')).toHaveCount(0);
});
