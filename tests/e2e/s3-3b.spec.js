// S3-3b (R1): sincronización integrada en la app contra el servidor FALSO (?remote=fake, solo localhost, sin red).
// Dos "dispositivos" = dos contextos del navegador con una copia del backend simulado (pg-fake-backend) y la misma
// sesión. Cubre: sin config.js todo igual, dueño de los datos, subida tras guardar, bajada en otro dispositivo sin
// re-sellar, bloqueo de salud, sin conexión y el indicador accesible.
const { test, expect, state, CONSENT, D, KEY } = require('./helpers');
const Schema = require('../../schema.js');
const { consentsSeed } = require('./fake-helpers');

const FAKE = 'index.html?remote=fake';
const SKIP = { 'perdida-grasa:account-skip': '1' }; // sin pantalla de cuenta al abrir: se entra por código abajo
const EMAIL = 'ana@ejemplo.com';
const status = (page) => page.locator('#sync-status');
const backend = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('pg-fake-backend')));
const ready = (page) => page.waitForFunction(() => window.__pgFakeBackend && window.PGSync);
// Entra con el código del servidor simulado (lo mismo que hace la pantalla de cuenta de S3-2).
async function login(page, email = EMAIL) {
  await ready(page);
  return page.evaluate(async ({ e, seed }) => {
    const r = Remote.createFake({ backend: window.__pgFakeBackend, storage: localStorage });
    await r.auth.sendCode(e);
    const { user } = await r.auth.verifyCode(e, window.__pgFakeBackend.lastCode(e));
    await r.account.joinApp();
    // Sprint 6: la copia en la nube exige A3 + A4; aquí ya están aceptadas (la pantalla de cuenta las guarda en esta clave).
    const prev = JSON.parse(localStorage.getItem('perdida-grasa:account') || 'null') || {};
    localStorage.setItem('perdida-grasa:account', JSON.stringify({ ...prev, ...seed }));
    return user.id;
  }, { e: email, seed: consentsSeed() });
}
const records = (be, uid) => Object.values(be.records || {}).filter((r) => r.userId === uid);

test('sin servidor configurado: ni indicador ni sincronización ni peticiones a otros orígenes', async ({ app, page }) => {
  const external = [];
  page.on('request', (r) => { if (!r.url().startsWith('http://127.0.0.1') && !r.url().startsWith('http://localhost')) external.push(r.url()); });
  await app.open({ state: state({ consent: CONSENT }) });
  await app.tab('registro');
  const f = page.locator('#form-entry');
  await f.locator('[name=date]').fill(D(0));
  await f.locator('[name=weight]').fill('68.4');
  await f.locator('button[type=submit]').click();
  await expect(app.toast()).toHaveText('Registro guardado');
  await app.tab('perfil');
  await expect(status(page)).toBeHidden();
  expect(await page.evaluate(() => typeof window.PGSync)).toBe('undefined');
  expect(await page.evaluate(() => typeof window.supabase.createClient)).toBe('function'); // vendorizado, sin CDN
  expect(await app.pref('perdida-grasa:sync')).toBeNull();
  expect(external).toEqual([]);
});

test('dos dispositivos: confirmar dueño → sube; guardar sube a los 2 s; el otro baja sin re-sellar', async ({ app, page, browser }) => {
  await app.open({ path: FAKE, state: state({ consent: CONSENT }), prefs: SKIP });
  const uid = await login(page);
  // Hay datos locales y aún no hay dueño: NO se sube nada hasta que el usuario lo confirme (§5.6 / §11.10).
  await page.evaluate(() => PGSync.run());
  await app.tab('perfil');
  await expect(status(page)).toHaveText(/Falta que confirmes que estos datos son tuyos/);
  await expect(status(page)).toHaveAttribute('role', 'status');
  expect(records(await backend(page), uid)).toHaveLength(0);
  await page.evaluate(() => PGSync.confirmOwner());
  await expect(status(page)).toHaveText(/^Se guardó en tu cuenta/);
  expect(JSON.parse(await app.pref('perdida-grasa:backup-pre-sync')).entries).toHaveLength(1); // copia previa
  expect(records(await backend(page), uid).map((r) => r.kind).sort()).toEqual(['entry', 'profile']);

  // Guardar un pesaje: se sube solo, 2 s después (debounce), sin pulsar nada.
  await app.tab('registro');
  const f = page.locator('#form-entry');
  await f.locator('[name=date]').fill(D(0));
  await f.locator('[name=weight]').fill('68.4');
  await f.locator('button[type=submit]').click();
  await expect(app.toast()).toHaveText('Registro guardado');
  await expect.poll(async () => records(await backend(page), uid).filter((r) => r.kind === 'entry').length, { timeout: 8000 }).toBe(2);
  const beA = await backend(page);
  const stampsA = Object.fromEntries(records(beA, uid).map((r) => [r.id, r.serverUpdatedAt]));
  const local = await app.stored();

  // Dispositivo B: misma cuenta, sin datos locales → adopta la cuenta sola y baja todo.
  const ctxB = await browser.newContext({ baseURL: test.info().project.use.baseURL, serviceWorkers: 'block', timezoneId: 'America/Bogota', viewport: { width: 390, height: 844 } });
  const b = await ctxB.newPage();
  const session = await app.pref('pg-fake-session');
  await b.addInitScript(({ be, session, consent, key, seed }) => {
    if (sessionStorage.getItem('__seed')) return;
    sessionStorage.setItem('__seed', '1');
    localStorage.setItem('pg-fake-backend', be);
    localStorage.setItem('pg-fake-session', session);
    localStorage.setItem('perdida-grasa:account-skip', '1');
    localStorage.setItem('perdida-grasa:account', JSON.stringify(seed)); // A3 + A4 de la cuenta (Sprint 6)
    localStorage.setItem(key, JSON.stringify({ schemaVersion: 4, profile: null, entries: [], foods: {}, habits: {}, library: {}, consent }));
  }, { be: JSON.stringify(beA), session, consent: CONSENT, key: KEY, seed: consentsSeed() });
  await b.goto(FAKE);
  await ready(b);
  await expect.poll(() => b.evaluate((k) => (JSON.parse(localStorage.getItem(k)).entries || []).length, KEY), { timeout: 8000 }).toBe(2);
  const sB = await b.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
  const byDate = (s) => Object.fromEntries(s.entries.map((e) => [e.date, { id: e.id, weight: e.weight, updatedAt: e.updatedAt }]));
  expect(byDate(sB)).toEqual(byDate(local));            // mismos ids, datos y updatedAt: no se re-sellaron
  expect(sB.profile.name).toBe('Ana');
  expect(await b.evaluate(() => localStorage.getItem('perdida-grasa:owner'))).toBe(uid);
  // B no re-sube lo que acaba de bajar: el servidor no cambia ninguna marca.
  await b.evaluate(() => PGSync.run());
  const beB = await b.evaluate(() => JSON.parse(localStorage.getItem('pg-fake-backend')));
  expect(Object.fromEntries(records(beB, uid).map((r) => [r.id, r.serverUpdatedAt]))).toEqual(stampsA);
  await ctxB.close();
});

test('bloqueo de salud: sin autorización de datos de salud no se sube ni se baja nada', async ({ app, page }) => {
  const noHealth = Schema.buildConsent({ terms: true, privacy: true, adult: true, sensitiveHealth: false, photos: false }, '2026-10-01T12:00:00.000Z');
  await app.open({ path: FAKE, state: state({ consent: noHealth }), prefs: SKIP });
  const uid = await login(page);
  await page.evaluate(() => PGSync.confirmOwner());
  await page.evaluate(() => PGSync.run());
  await app.tab('perfil');
  await expect(status(page)).toHaveText(/no autorizaste los datos de salud/);
  expect(records(await backend(page), uid)).toHaveLength(0);
});

test('sin conexión: "se subirá luego"; al volver la conexión se sube solo', async ({ app, page }) => {
  await app.open({ path: FAKE, state: state({ consent: CONSENT }), prefs: SKIP });
  const uid = await login(page);
  await page.evaluate(() => window.__pgFakeBackend.setOnline(false));
  await page.evaluate(() => PGSync.confirmOwner());
  await app.tab('perfil');
  await expect(status(page)).toHaveText('Sin internet: se guardará en tu cuenta cuando vuelva.');
  await expect(page.locator('#btn-sync-now')).toBeVisible();
  expect(records(await backend(page), uid)).toHaveLength(0);
  await page.evaluate(() => { window.__pgFakeBackend.setOnline(true); window.dispatchEvent(new Event('online')); });
  await expect(status(page)).toHaveText(/^Se guardó en tu cuenta/);
  expect(records(await backend(page), uid).length).toBeGreaterThan(0);
  expect(await app.scrollWidth()).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'equipo/qa-capturas/s3-3b-sincronizado.png' });
});
