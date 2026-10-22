// Perfil → "Cuenta y copia en la nube" y tarjeta "Datos": dicen la verdad según la sesión y el estado real de la sincronización.
// Servidor FALSO (?remote=fake). La app OFICIAL (sin config) no cambia en nada.
const { test, expect, state, CONSENT } = require('./helpers');
const Schema = require('../../schema.js');
const { consentsSeed } = require('./fake-helpers');

const FAKE = 'index.html?remote=fake';
const SKIP = { 'perdida-grasa:account-skip': '1' };
const EMAIL = 'ana@ejemplo.com';
const LOCAL = 'Todo se guarda solo en este dispositivo. Exporta una copia para respaldarla o pasarla a otro dispositivo.';
const CLOUD = 'Tus datos se guardan en este teléfono y también en tu cuenta. Las fotos, por ahora, solo se guardan en este teléfono.';
const ready = (page) => page.waitForFunction(() => window.__pgFakeBackend && window.PGSync);
async function login(page) {
  await ready(page);
  await page.evaluate(async ({ e, seed }) => {
    const r = Remote.createFake({ backend: window.__pgFakeBackend, storage: localStorage });
    await r.auth.sendCode(e);
    await r.auth.verifyCode(e, window.__pgFakeBackend.lastCode(e));
    await r.account.joinApp();
    const { user } = await r.auth.session();
    PGAccount.setMeta({ userId: user.id, roles: ['client'], ...seed }); // lo que deja la pantalla de cuenta al entrar (con A3 + A4)
    document.dispatchEvent(new Event('pg:signed-in'));
  }, { e: EMAIL, seed: consentsSeed() });
  await page.evaluate(() => PGAccount.refresh());
}
const sync = (page) => page.locator('#sync-status');
const noHealth = Schema.buildConsent({ terms: true, privacy: true, adult: true, sensitiveHealth: false, photos: false }, '2026-10-01T12:00:00.000Z');
const WIDE = '*{font-family:"DejaVu Sans",Verdana,sans-serif !important; letter-spacing:.02em}';

test('app oficial (sin servidor): ni tarjeta de cuenta ni cambios en Datos; "Ver copia de un cliente" sigue', async ({ app, page }) => {
  await app.open({ state: state({ consent: CONSENT }) });
  await app.tab('perfil');
  await expect(page.locator('#account-card')).toBeHidden();
  await expect(sync(page)).toBeHidden();
  await expect(page.locator('#data-intro')).toHaveText(LOCAL);
  await expect(page.locator('#data-optional')).toBeHidden();
  await expect(page.locator('#storage-status')).toBeVisible();
  await expect(page.locator('#backup-status')).toHaveText('Aún no has exportado ninguna copia.');
  await expect(page.locator('#coach-copy-card')).toBeVisible();
  await expect(page.locator('#coach-copy-card')).toContainText('Para coaches: abre el respaldo JSON de un cliente');
  await app.tab('panel');
  await expect(page.locator('#backup-banner-body')).toBeVisible(); // aviso de copia, como siempre
  expect(await page.evaluate(() => typeof window.PGSync)).toBe('undefined');
});

test('con sesión y sync correcto: tarjeta al inicio, estado con hora, Datos habla de la nube y el aviso de copia calla', async ({ app, page }) => {
  await app.open({ path: FAKE, state: state({ consent: CONSENT }), prefs: SKIP });
  await login(page);
  await page.evaluate(() => PGSync.confirmOwner());
  await app.tab('perfil');
  await expect(sync(page)).toHaveText(/^Se guardó en tu cuenta (hoy|ayer) \d{1,2}:\d{2}/);
  await expect(sync(page)).toHaveAttribute('role', 'status');
  expect(await page.locator('[role=status]:visible, [aria-live]:visible').evaluateAll((els) => els.filter((e) => e.closest('#view-perfil')).length)).toBe(1); // sin anuncios duplicados
  await expect(page.locator('#account-status')).toContainText(`Entraste con ${EMAIL}.`);
  await expect(page.locator('#view-perfil > .card').first()).toHaveAttribute('id', 'account-card');
  await expect(page.locator('#account-card h2')).toHaveText('Tu cuenta');
  await expect(page.locator('#btn-sync-now')).toBeVisible();
  await expect(page.locator('#data-intro')).toHaveText(CLOUD);
  await expect(page.locator('#data-optional')).toBeVisible();
  await expect(page.locator('#storage-status')).toBeHidden();
  await expect(page.locator('#backup-status')).toBeHidden();
  const seen = await page.locator('#view-perfil').innerText(); // solo lo visible
  expect(seen).not.toContain('El navegador puede borrar');
  expect(seen).not.toContain('Aún no has exportado');
  expect(seen).not.toContain('Para coaches');
  await expect(page.locator('#coach-copy-card')).toBeHidden();
  await app.tab('panel');
  await expect(page.locator('#backup-banner-body')).toBeHidden();
  expect(await app.scrollWidth()).toBeLessThanOrEqual(390);
});

test('sin sesión (con servidor): invita a crear cuenta y Datos conserva el texto actual', async ({ app, page }) => {
  await app.open({ path: FAKE, state: state({ consent: CONSENT }), prefs: SKIP });
  await ready(page);
  await app.tab('perfil');
  await expect(page.locator('#account-status')).toContainText('tus datos están solo en este teléfono. Crea una cuenta o entra para que queden guardados también en tu cuenta');
  await expect(page.locator('#btn-account-login')).toBeVisible();
  await expect(sync(page)).toBeHidden();
  await expect(page.locator('#data-intro')).toHaveText(LOCAL);
  await expect(page.locator('#backup-status')).toBeVisible();
  await expect(page.locator('#coach-copy-card')).toBeHidden();
  await app.tab('panel');
  await expect(page.locator('#backup-banner-body')).toBeVisible();
});

test('sin conexión: "se subirá al volver", Datos no promete la nube y el aviso de copia sigue', async ({ app, page }) => {
  await app.open({ path: FAKE, state: state({ consent: CONSENT }), prefs: SKIP });
  await login(page);
  await page.evaluate(() => window.__pgFakeBackend.setOnline(false));
  await page.evaluate(() => PGSync.confirmOwner());
  await app.tab('perfil');
  await expect(sync(page)).toHaveText('Sin internet: se guardará en tu cuenta cuando vuelva.');
  await expect(page.locator('#data-intro')).toHaveText(LOCAL);
  await app.tab('panel');
  await expect(page.locator('#backup-banner-body')).toBeVisible();
});

test('error del servidor: "No se pudo sincronizar" y Datos conserva el texto actual', async ({ app, page }) => {
  await app.open({ path: FAKE, state: state({ consent: CONSENT }), prefs: SKIP });
  await login(page);
  await page.evaluate(() => { window.__pgFakeBackend.failNext('server', 10); });
  await page.evaluate(() => PGSync.confirmOwner());
  await app.tab('perfil');
  await expect(sync(page)).toHaveText(/^No se pudo guardar en tu cuenta/);
  await expect(page.locator('#data-intro')).toHaveText(LOCAL);
  await expect(page.locator('#btn-sync-now')).toBeVisible();
});

test('salud no autorizada: "No sincroniza" y Datos no habla de la nube', async ({ app, page }) => {
  await app.open({ path: FAKE, state: state({ consent: noHealth }), prefs: SKIP });
  await login(page);
  await page.evaluate(() => PGSync.confirmOwner());
  await page.evaluate(() => PGSync.run());
  await app.tab('perfil');
  await expect(sync(page)).toHaveText('No se guarda en tu cuenta porque no autorizaste los datos de salud.');
  await expect(page.locator('#data-intro')).toHaveText(LOCAL);
});

test('falta confirmar dueño: mensaje claro y Datos no habla de la nube', async ({ app, page }) => {
  await app.open({ path: FAKE, state: state({ consent: CONSENT }), prefs: SKIP });
  await login(page);
  await page.evaluate(() => PGSync.run());
  await app.tab('perfil');
  await expect(sync(page)).toHaveText('Falta que confirmes que estos datos son tuyos.');
  await expect(page.locator('#data-intro')).toHaveText(LOCAL);
});

test('maquetación: Perfil con cuenta, fuente ancha, 390 px, sin desbordes', async ({ app, page }) => {
  await app.open({ path: FAKE, state: state({ consent: CONSENT }), prefs: SKIP });
  await login(page);
  await page.evaluate(() => PGSync.confirmOwner());
  await app.tab('perfil');
  await page.addStyleTag({ content: WIDE });
  await expect(sync(page)).toHaveText(/^Se guardó en tu cuenta/);
  expect(await app.scrollWidth()).toBeLessThanOrEqual(390);
  const over = await page.evaluate(() => [...document.querySelectorAll('#view-perfil .card')].filter((c) => c.scrollWidth > c.clientWidth + 1).map((c) => c.id || c.querySelector('h2').textContent));
  expect(over).toEqual([]);
});

test('modo oscuro: la tarjeta de cuenta es legible', async ({ app, page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await app.open({ path: FAKE, state: state({ consent: CONSENT }), prefs: SKIP });
  await login(page);
  await page.evaluate(() => PGSync.confirmOwner());
  await app.tab('perfil');
  await expect(sync(page)).toHaveText(/^Se guardó en tu cuenta/);
  const [fg, bg] = await page.evaluate(() => { const c = getComputedStyle(document.querySelector('#account-status')); return [c.color, getComputedStyle(document.querySelector('#account-card')).backgroundColor]; });
  expect(fg).not.toBe(bg);
});
