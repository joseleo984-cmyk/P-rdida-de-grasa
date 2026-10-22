// Sprint 7 (r1 v1.5): el servidor exige A3 + A4 para sincronizar. Si la app cree que están dadas pero el servidor no las
// tiene (p. ej. se retiraron en otro teléfono), no hay error técnico: dice que falta aceptar y no rompe el modo local.
const { test, expect, state, CONSENT } = require('./helpers');
const { consentsSeed } = require('./fake-helpers');

const FAKE = 'index.html?remote=fake';
const SKIP = { 'perdida-grasa:account-skip': '1' };
const EMAIL = 'ana@ejemplo.com';
const ready = (page) => page.waitForFunction(() => window.__pgFakeBackend && window.PGSync);

test('sin A3/A4 en el servidor: "Falta aceptar…", sin error técnico y el modo local sigue', async ({ app, page }) => {
  await app.open({ path: FAKE, state: state({ consent: CONSENT }), prefs: SKIP });
  await ready(page);
  await page.evaluate(async ({ e, seed }) => {
    const r = Remote.createFake({ backend: window.__pgFakeBackend, storage: localStorage });
    await r.auth.sendCode(e);
    await r.auth.verifyCode(e, window.__pgFakeBackend.lastCode(e));
    await r.account.joinApp();
    const { user } = await r.auth.session();
    // Solo LOCAL: la app cree que A3 + A4 están dadas; el servidor no tiene ningún evento.
    PGAccount.setMeta({ userId: user.id, roles: ['client'], ...seed });
    document.dispatchEvent(new Event('pg:signed-in'));
  }, { e: EMAIL, seed: consentsSeed() });
  await page.evaluate(() => PGSync.confirmOwner());
  await app.tab('perfil');
  const st = page.locator('#sync-status');
  await expect(st).toContainText('Falta aceptar las autorizaciones de la copia en la nube');
  await expect(st).not.toContainText(/error|servidor|42501|consent_required/i);
  expect(await page.evaluate(() => window.__pgFakeBackend.consentEvents.length)).toBe(0);
  await expect(page.locator('#btn-sync-now')).toBeHidden();
  // El modo local sigue: se puede registrar un peso.
  await app.tab('panel');
  await expect(page.locator('#view-panel')).toBeVisible();
});

test('con la cola de autorizaciones pendiente: se envía sola y la sincronización sigue', async ({ app, page }) => {
  await app.open({ path: FAKE, state: state({ consent: CONSENT }), prefs: SKIP });
  await ready(page);
  await page.evaluate(async ({ e, seed }) => {
    const r = Remote.createFake({ backend: window.__pgFakeBackend, storage: localStorage });
    await r.auth.sendCode(e);
    await r.auth.verifyCode(e, window.__pgFakeBackend.lastCode(e));
    await r.account.joinApp();
    const { user } = await r.auth.session();
    const queue = Object.entries(seed.consents).map(([kind, v]) => ({ kind, granted: v.granted, version: v.version, textHash: v.textHash, clientAt: v.clientAt }));
    PGAccount.setMeta({ userId: user.id, roles: ['client'], ...seed, consentQueue: queue }); // aceptadas sin conexión: aún no llegaron
    document.dispatchEvent(new Event('pg:signed-in'));
  }, { e: EMAIL, seed: consentsSeed() });
  await page.evaluate(() => PGSync.confirmOwner());
  await app.tab('perfil');
  await expect(page.locator('#sync-status')).toHaveText(/^Se guardó en tu cuenta/, { timeout: 10000 });
  const kinds = await page.evaluate(() => window.__pgFakeBackend.consentEvents.map((e) => e.kind).sort());
  expect(kinds).toEqual(['cloud_transfer', 'sensitive_health']);
});
