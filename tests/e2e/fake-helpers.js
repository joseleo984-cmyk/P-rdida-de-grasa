// Ayudantes compartidos de las pruebas con el servidor FALSO: coach ya registrado, otro "teléfono" (contexto) y entrada con correo.
const { expect, state, CONSENT, acceptLegalIfPresent, activateCloudIfAsked } = require('./helpers');

const EMPTY = () => state({ profile: null, entries: [], consent: CONSENT });
const INVITE_KEY = 'perdida-grasa:invite';
const CT = require('../../consent-texts.js');

// Sprint 6: autorizaciones ya dadas (como si la persona las hubiera aceptado antes) para sembrar cuentas sin pasar por las pantallas.
// Por defecto: A3 + A4 (copia en la nube) y A7 (acuerdo del coach, solo si es coach). Con `cloud:false` no hay copia en la nube.
function consentsSeed({ cloud = true, coach = false } = {}) {
  const ev = (id, kind) => ({ granted: true, version: CT.version(id), textHash: 'a'.repeat(64), clientAt: '2026-10-01T12:00:00.000Z' });
  const consents = {};
  if (cloud) { consents.sensitive_health = ev('A3'); consents.cloud_transfer = ev('A4'); }
  if (coach) consents.coach_agreement = ev('A7');
  return { consents, cloudAsked: true };
}
// Marca A1 y A2 en el paso del correo (la pantalla las deja sin marcar).
async function acceptTerms(p) {
  await p.locator('#acc-a1').check();
  await p.locator('#acc-a2').check();
}
// En el paso «¿Guardar una copia en la nube?»: activa la copia (A3 + A4) o la deja para después.
async function answerCloud(p, on = true) {
  await expect(p.locator('#acc-step-cloud')).toBeVisible();
  if (on) { await p.locator('#acc-a3').check(); await p.locator('#acc-a4').check(); await p.getByRole('button', { name: 'Activar la copia en la nube' }).click(); }
  else await p.getByRole('button', { name: /Ahora no: solo en mi teléfono/ }).click();
}

async function loginAsCoach(page, email, biz, { agreement = true, cloud = true } = {}) {
  const seed = consentsSeed({ cloud, coach: agreement });
  await page.evaluate(async ({ email, biz, seed }) => {
    const be = window.__pgFakeBackend;
    const r = RemoteFake.createFake({ backend: be, storage: localStorage });
    await r.auth.sendCode(email);
    const { user } = await r.auth.verifyCode(email, be.lastCode(email));
    await r.account.joinApp();
    // Sprint 7: el servidor exige las autorizaciones (A3 + A4, y A7 si es coach): quedan registradas ANTES de usar la cuenta.
    if (seed.consents && Object.keys(seed.consents).length) await r.account.recordConsents(Object.entries(seed.consents).map(([kind, v]) => ({ kind, granted: v.granted, version: v.version, textHash: v.textHash, clientAt: v.clientAt })));
    // Coach «de antes» (sin acuerdo): se da de alta con el acuerdo y se borra del servidor falso, como si existiera de antes de Sprint 7.
    const legacy = !seed.consents.coach_agreement;
    if (legacy) await r.account.recordConsents([{ kind: 'coach_agreement', granted: true, version: 'x', textHash: 'a'.repeat(64), clientAt: '2026-10-01T12:00:00.000Z' }]);
    await r.coach.becomeCoach(biz);
    if (legacy) { be.consentEvents = be.consentEvents.filter((e) => !(e.userId === user.id && e.kind === 'coach_agreement')); be._persist(); }
    const c = await r.coach.myCoach();
    localStorage.setItem('perdida-grasa:account', JSON.stringify({ userId: user.id, email: user.email, roles: await r.account.roles(), onboarded: true, coach: c, ...seed }));
    localStorage.setItem('perdida-grasa:owner', user.id);
  }, { email, biz, seed });
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
async function loginWithEmail(p, email, { cloud = true } = {}) {
  await p.getByLabel('Tu correo').fill(email);
  await acceptTerms(p);
  await p.getByRole('button', { name: /Enviarme el código/ }).click();
  await expect(p.locator('#acc-step-code')).toBeVisible();
  await p.getByLabel('Código', { exact: true }).fill(await p.evaluate((e) => window.__pgFakeBackend.lastCode(e), email));
  if (cloud) await activateCloudIfAsked(p); // Sprint 6: A3 + A4 (la copia en la nube se ofrece antes de elegir rol)
}

module.exports = { EMPTY, INVITE_KEY, loginAsCoach, newPhone, loginWithEmail, consentsSeed, acceptTerms, answerCloud };
