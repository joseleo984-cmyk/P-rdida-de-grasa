// Ayudantes compartidos de las pruebas con el servidor FALSO: coach ya registrado, otro "teléfono" (contexto) y entrada con correo.
const { expect, state, CONSENT, acceptLegalIfPresent } = require('./helpers');

const EMPTY = () => state({ profile: null, entries: [], consent: CONSENT });
const INVITE_KEY = 'perdida-grasa:invite';

async function loginAsCoach(page, email, biz) {
  await page.evaluate(async ({ email, biz }) => {
    const be = window.__pgFakeBackend;
    const r = RemoteFake.createFake({ backend: be, storage: localStorage });
    await r.auth.sendCode(email);
    const { user } = await r.auth.verifyCode(email, be.lastCode(email));
    await r.account.joinApp();
    await r.coach.becomeCoach(biz);
    const c = await r.coach.myCoach();
    localStorage.setItem('perdida-grasa:account', JSON.stringify({ userId: user.id, email: user.email, roles: await r.account.roles(), onboarded: true, coach: c }));
    localStorage.setItem('perdida-grasa:owner', user.id);
  }, { email, biz });
  await page.reload();
  await acceptLegalIfPresent(page);
}
async function newPhone(browser, testInfo, { backend, path, prefs = {} }) {
  const ctx = await browser.newContext({ ...testInfo.project.use, baseURL: testInfo.project.use.baseURL, permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage();
  p.on('dialog', (d) => d.accept());
  await p.clock.install({ time: new Date('2026-10-21T12:00:00-05:00') });
  await p.addInitScript(({ s, prefs, backend }) => {
    if (sessionStorage.getItem('__seed')) return;
    sessionStorage.setItem('__seed', '1');
    localStorage.setItem('perdida-grasa:v1', JSON.stringify(s));
    if (backend) localStorage.setItem('pg-fake-backend', backend);
    for (const [k, v] of Object.entries(prefs)) localStorage.setItem(k, v);
  }, { s: EMPTY(), prefs, backend });
  await p.goto(path);
  await acceptLegalIfPresent(p);
  return { ctx, p };
}
async function loginWithEmail(p, email) {
  await p.getByLabel('Tu correo').fill(email);
  await p.getByRole('button', { name: /Enviarme el código/ }).click();
  await expect(p.locator('#acc-step-code')).toBeVisible();
  await p.getByLabel('Código', { exact: true }).fill(await p.evaluate((e) => window.__pgFakeBackend.lastCode(e), email));
}

module.exports = { EMPTY, INVITE_KEY, loginAsCoach, newPhone, loginWithEmail };
