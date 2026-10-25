// UX Etapa 2 (producto «coach», servidor FALSO): pregunta de salud (L4 y embarazo/lactancia/posparto), meta de proteína del coach (L5), retos del coach
// y modo autónomo en pausa (P1). Las reglas del servidor real están en supabase/tests/150_etapa2_coach.test.sql.
const { test, expect } = require('@playwright/test');
const H = require('./ux1-helpers');

const L4_HEAD = 'Información sobre tu salud (dato sensible y voluntario): Esta pregunta permite que tu coach sepa si requieres un aval médico antes de entrenar o cambiar tu alimentación. No estás obligado(a) a responder.';
const L4_YES = 'Al marcar "Sí", autorizas de forma expresa que compartamos con tu coach únicamente la existencia de una restricción para que ajuste tu plan o te solicite un certificado médico. La app no guarda detalles de diagnósticos ni ofrece servicios médicos. Te recomendamos consultar a tu médico antes de iniciar.';
const EMB_Q = '¿Estás en embarazo, en periodo de lactancia o en los primeros meses de posparto?';
const P1 = 'Registro personal en modo autónomo. Durante la pausa del servicio con tu coach, tus nuevos hábitos no serán supervisados ni revisados por él.';

// Lo que ve el coach Laura, preguntado al servidor falso de esta página (como lo haría su teléfono).
const asCoach = (p, fn) => p.evaluate(async (src) => {
  const be = window.__pgFakeBackend;
  const m = {}; const mem = { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
  const r = RemoteFake.createFake({ backend: be, storage: mem });
  await r.auth.sendCode('laura@coach.co');
  await r.auth.verifyCode('laura@coach.co', be.lastCode('laura@coach.co'));
  const ana = Object.values(be.users).find((u) => u.email === 'ana@c.co').id;
  return new Function('r', 'ana', 'be', `return (async () => { ${src} })()`)(r, ana, be);
}, fn);

test('L4: la pregunta de salud es voluntaria, con los textos aprobados; al coach solo le llega el indicador', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo);
  await expect(p.locator('#home-salud')).toBeVisible();
  await expect(p.locator('#home-dia')).toBeVisible();   // no bloquea: Mi día sigue ahí
  await p.locator('#btn-home-salud').click();
  await expect(p.locator('#salud')).toBeVisible();
  await expect(p.locator('#salud-step')).toHaveText('Paso 2 de 3 · Tu salud');
  await expect(p.locator('#salud-head')).toHaveText(L4_HEAD);
  await expect(p.locator('#salud-opts button')).toHaveText(['Sí', 'No', 'Prefiero no responder']);
  await expect(p.locator('#btn-salud-ok')).toBeDisabled();
  await expect(p.locator('#salud-yes')).toBeHidden();
  await p.getByRole('button', { name: 'Sí', exact: true }).click();
  await expect(p.locator('#salud-yes')).toHaveText(L4_YES);
  await expect(p.locator('#btn-salud-ok')).toHaveText('Entendido, continuar');
  await H.layout(p);
  await p.locator('#btn-salud-ok').click();
  await expect(p.locator('#salud-q')).toHaveText(EMB_Q);
  await p.getByRole('button', { name: 'Prefiero no responder' }).click();
  await expect(p.locator('#salud-yes')).toBeHidden();
  await p.locator('#btn-salud-ok').click();
  await expect(p.locator('#salud')).toBeHidden();
  await expect(p.locator('#home-salud')).toBeHidden();
  const be = await H.backend(p);
  const mine = Object.values(be.healthAnswers).map((h) => [h.question, h.answer, h.version, /^[0-9a-f]{64}$/.test(h.textHash)]).sort();
  expect(mine).toEqual([['condition', 'yes', '1.0-L4', true], ['pregnancy', 'skip', '1.0-L4E', true]]);
  const row = await asCoach(p, "return (await r.coach.clients()).find((c) => c.clientId === ana);");
  expect([row.healthRestriction, row.pregnancyState]).toEqual([true, false]);
  expect(JSON.stringify(row)).not.toMatch(/"yes"|skip|condition/);
  // Se puede cambiar después desde Más → Tu salud (con lo respondido marcado)
  await p.locator('#tab-mas').click();
  await p.locator('#row-salud').click();
  await expect(p.locator('#salud-step')).toHaveText('Tu salud');
  await expect(p.getByRole('button', { name: 'Sí', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await p.getByRole('button', { name: 'No', exact: true }).click();
  await p.locator('#btn-salud-ok').click();
  await p.locator('#btn-salud-ok').click();
  await expect(p.locator('#salud')).toBeHidden();
  expect((await asCoach(p, "return (await r.coach.clients()).find((c) => c.clientId === ana).healthRestriction;"))).toBe(false);
  expect(errors).toEqual([]);
});

test('L4 y L5 (coach): indicador sin detalle en la lista y la ficha; la meta de proteína la escribe el coach con vista previa', async ({ browser }, testInfo) => {
  const { p, errors } = await H.coachApp(browser, testInfo, [{ email: 'ana@c.co', name: 'Ana Martínez', habits: true, habitDays: [H.hab(-1)] }, { email: 'beto@c.co', name: 'Beto Ruiz', habitDays: [H.hab(-1)] }]);
  await p.evaluate(async () => {
    const be = window.__pgFakeBackend;
    const m = {}; const mem = { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
    const r = RemoteFake.createFake({ backend: be, storage: mem });
    await r.auth.sendCode('ana@c.co');
    await r.auth.verifyCode('ana@c.co', be.lastCode('ana@c.co'));
    await r.client.setHealthAnswer('condition', 'yes', { version: '1.0-L4', textHash: 'd'.repeat(64) });
  });
  await p.locator('#tab-coach').click();
  const ana = p.locator('#coach-clients .cli-pay-row', { hasText: 'Ana Martínez' });
  await expect(ana.locator('.cli-salud')).toHaveText('▲ Restricción de salud');
  await expect(p.locator('#coach-clients .cli-pay-row', { hasText: 'Beto Ruiz' }).locator('.cli-salud')).toHaveCount(0);
  await ana.locator('[data-client]').click();
  await expect(p.locator('#fc-salud')).toContainText('Tiene una restricción de salud');
  await expect(p.locator('#fc-salud')).toContainText('Sin detalle. Pide aval médico antes de planes exigentes.');
  await expect(p.locator('#fc-meta-val')).toHaveText('Sin meta ›');
  await p.locator('#fc-link-meta').click();
  await expect(p.locator('#view-meta')).toBeVisible();
  await expect(p.locator('#topbar-back')).toHaveText('‹ Ana Martínez');
  await expect(p.locator('#topbar-title')).toHaveText('Meta de proteína');
  await expect(p.locator('#meta-input')).toHaveValue('');   // la app no propone ningún número
  await expect(p.locator('#meta-plus')).toBeDisabled();
  await expect(p.locator('#mp-bar')).toBeHidden();
  await p.locator('#meta-input').fill('110');
  await expect(p.locator('#mp-note')).toHaveText('Meta orientativa propuesta exclusivamente por tu coach (~110 g). La plataforma no formula, valida ni prescribe requerimientos nutricionales.');
  await p.locator('#meta-plus').click();
  await expect(p.locator('#meta-input')).toHaveValue('115');
  await p.locator('#meta-minus').click();
  await H.layout(p);
  await p.locator('#btn-meta-save').click();
  await expect(p.locator('#toast')).toContainText('Meta guardada: ~110 g');
  await expect(p.locator('#coach-detail-view')).toBeVisible();
  await expect(p.locator('#topbar-title')).toHaveText('Ana Martínez');
  await expect(p.locator('#fc-meta-val')).toHaveText('~110 g ›');
  const be = await H.backend(p);
  expect(be.links.find((l) => l.status === 'active' && be.users['ana@c.co'].id === l.clientId).proteinGoal).toBe(110);
  expect(errors).toEqual([]);
});

test('retos: el coach lanza en 2 toques, el asesorado marca su avance en Inicio y el coach ve «N de M van en camino» sin ranking', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo);
  await expect(p.locator('#home-reto')).toBeHidden();
  await asCoach(p, "await r.coach.createChallenge({ title: '3 entrenos esta semana', habit: 'trained', target: 3, start: be.todayBogota(), end: new Date(Date.parse(be.todayBogota() + 'T12:00:00Z') + 6 * 864e5).toISOString().slice(0, 10), clients: [ana] });");
  await p.locator('#tab-mas').click();
  await p.locator('#tab-panel').click();
  await expect(p.locator('#home-reto')).toBeVisible();
  await expect(p.locator('#reto-label')).toHaveText('Reto de Laura Fit');
  await expect(p.locator('#reto-title')).toHaveText('3 entrenos esta semana');
  await expect(p.locator('#reto-dots')).toHaveText('○○○');
  await p.locator('#btn-reto-mark').click();
  await expect(p.locator('#btn-reto-mark')).toHaveText('Cumplido hoy ✓');
  await expect(p.locator('#reto-dots')).toHaveText('●○○');
  await expect(p.locator('#reto-line')).toContainText('1 de 3');
  await H.layout(p);
  const list = await asCoach(p, 'return r.coach.listChallenges();');
  expect(list[0].members.map((m) => m.done)).toEqual([1]);
  expect(await p.locator('#view-panel').innerText()).not.toMatch(/ranking|posición|puesto|kilos? menos/i);
  expect(errors).toEqual([]);
});

test('retos (coach): plantilla, a quién, fechas solas y la lista con el avance', async ({ browser }, testInfo) => {
  const { p, errors } = await H.coachApp(browser, testInfo, [{ email: 'ana@c.co', name: 'Ana Martínez', habitDays: [H.hab(-1)] }, { email: 'beto@c.co', name: 'Beto Ruiz', habitDays: [H.hab(-1)] }]);
  await p.locator('#tab-mas').click();
  await p.locator('#row-c-retos').click();
  await expect(p.locator('#topbar-title')).toHaveText('Retos');
  await expect(p.locator('#topbar-back')).toHaveText('‹ Más');
  await expect(p.locator('#retos-tpls .reto-tpl')).toHaveCount(4);
  await expect(p.locator('#retos-who [data-who="todos"]')).toHaveText('Todos · 2');
  await p.locator('#retos-tpls [data-tpl="agua"]').click();
  await expect(p.locator('#retos-range')).toHaveText(/^Del mié 21 al mar 27 oct · se cumple con 5 días$/);
  await p.locator('#retos-who [data-who="elegir"]').click();
  await p.locator('#retos-pick label', { hasText: 'Beto Ruiz' }).locator('input').check();
  await p.locator('#btn-reto-lanzar').click();
  await expect(p.locator('#toast')).toContainText('Reto lanzado a 1 asesorado');
  await expect(p.locator('#retos-list .reto-act')).toHaveCount(1);
  await expect(p.locator('#retos-list .reto-act h3')).toHaveText('Activo: 7 días de agua');
  await expect(p.locator('#retos-list .reto-act')).toContainText('0 de 1 van en camino');
  await H.layout(p);
  await p.locator('#retos-list [data-quitar]').click();
  await expect(p.locator('#retos-list .reto-act')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('P1: en pausa sigue anotando hábitos con el aviso aprobado; el SERVIDOR los guarda privados y el coach no los ve, ni después de reactivar', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo);
  await p.locator('#dia-agua').click();   // al día: esto sí lo ve el coach
  await expect.poll(async () => Object.values((await H.backend(p)).records).some((r) => r.kind === 'habit' && r.nkey === H.TODAY && !r.pausePrivate)).toBe(true);
  await H.setPaid(p, -3);
  await p.evaluate(() => PGAccount.refreshLink());
  await expect(p.locator('body')).toHaveClass(/paused/);
  await expect(p.locator('#dia-p1')).toHaveText(P1);
  await expect(p.locator('#dia-modo')).toHaveText('modo autónomo');
  await expect(p.locator('#pause-const')).toHaveText('congelada, no se pierde');
  await expect(p.locator('#dia-pasos')).toBeHidden();
  await H.layout(p);
  await p.locator('#dia-agua').click();
  await p.locator('#dia-agua').click();
  await expect(p.locator('#dia-agua-t')).toHaveText('Agua 3 / 8');
  // El hábito de hoy se editó en pausa: el servidor lo marca privado
  await expect.poll(async () => { const r = Object.values((await H.backend(p)).records).find((x) => x.kind === 'habit' && x.nkey === H.TODAY); return r && r.pausePrivate && r.data.water; }, { timeout: 10000 }).toBe(0.75);
  expect(await asCoach(p, "return (await r.coach.clientData(ana)).records.filter((x) => x.kind === 'habit').length;")).toBe(0);
  // El coach marca el pago: se reactiva y el coach SIGUE sin ver lo de la pausa
  await asCoach(p, "await r.coach.setPayment(ana, new Date(Date.parse(be.todayBogota() + 'T12:00:00Z') + 30 * 864e5).toISOString().slice(0, 10));");
  await p.evaluate(() => PGAccount.refreshLink());
  await expect(p.locator('body')).not.toHaveClass(/paused/);
  await p.locator('#dia-agua').click();
  await expect.poll(async () => Object.values((await H.backend(p)).records).find((x) => x.kind === 'habit' && x.nkey === H.TODAY).data.water, { timeout: 10000 }).toBe(1);
  expect(await asCoach(p, "return (await r.coach.clientData(ana)).records.filter((x) => x.kind === 'habit').length;")).toBe(0);
  expect(errors.filter((e) => !/40\d|403/.test(e))).toEqual([]);
});
