// S3-2 · casos adversariales de QA: producción sin config (también con ?remote=fake), modo falso fuera de localhost,
// XSS en nombres que vienen del servidor, consentimientos que se envían al entrar, cerrar sesión y SW.
const { test, expect, state, CONSENT } = require('./helpers');
const { answerOwnerIfAsked, wipeOtherAndContinue } = require('./helpers');

const FAKE = 'index.html?remote=fake';
const acc = (page) => page.getByTestId('account-gate');
const lastCode = (page, email) => page.evaluate((e) => window.__pgFakeBackend.lastCode(e), email);
async function enterEmail(page, email) {
  await page.getByLabel('Tu correo').fill(email);
  await page.locator('#acc-a1').check();
  await page.locator('#acc-a2').check();
  await page.getByRole('button', { name: 'Enviarme el código' }).click();
  await expect(page.locator('#acc-step-code')).toBeVisible();
}
async function enterCode(page, email) {
  await page.getByLabel('Código', { exact: true }).fill(await lastCode(page, email.toLowerCase()));
  await answerOwnerIfAsked(page);
}
// Sirve la app local bajo otro origen (p. ej. el de GitHub Pages) para probar la lógica que depende del host.
async function serveAs(page, origin, prefix = '/') {
  const base = test.info().project.use.baseURL;
  await page.route(origin + '/**', async (route) => {
    const u = new URL(route.request().url());
    const res = await route.fetch({ url: base + u.pathname.slice(prefix.length) + u.search });
    await route.fulfill({ response: res });
  });
}

test('producción (github.io) con ?remote=fake: la app es la de siempre y NO se descarga remote-fake.js', async ({ app, page }) => {
  const requested = [];
  page.on('request', (r) => requested.push(r.url()));
  const PROD = 'https://joseleo984-cmyk.github.io';
  await serveAs(page, PROD, '/P-rdida-de-grasa/');
  await app.open({ path: `${PROD}/P-rdida-de-grasa/index.html?remote=fake`, state: state({ consent: CONSENT }) });
  expect(await page.evaluate(() => location.hostname)).toBe('joseleo984-cmyk.github.io');
  expect(await page.evaluate(() => Remote.config())).toBeNull();
  await expect(acc(page)).toBeHidden();
  await app.tab('perfil');
  await expect(page.locator('#account-card')).toBeHidden();
  expect(requested.filter((u) => /remote-fake\.js/.test(u))).toEqual([]);
  expect(requested.filter((u) => !u.startsWith(PROD))).toEqual([]); // ninguna petición a otros orígenes
  expect(await page.evaluate(() => localStorage.getItem('pg-fake-backend'))).toBeNull();
});

test('producción con config.js en mode "fake" (error al publicar): sigue sin cuentas', async ({ app, page }) => {
  const PROD = 'https://joseleo984-cmyk.github.io';
  await serveAs(page, PROD, '/P-rdida-de-grasa/');
  await page.route(`${PROD}/P-rdida-de-grasa/config.js`, (r) => r.fulfill({ contentType: 'text/javascript', body: "window.PG_CONFIG = { url: '', key: '', mode: 'fake' };" }));
  await app.open({ path: `${PROD}/P-rdida-de-grasa/index.html`, state: state({ consent: CONSENT }) });
  expect(await page.evaluate(() => Remote.config())).toBeNull();
  await expect(acc(page)).toBeHidden();
});

// S3-2 D2 (corregido: ahora es lista blanca de localhost). Antes: fakeAllowed era una LISTA NEGRA (solo excluía joseleo984-cmyk.github.io). En cualquier otro host
// (dominio propio, fork, vista previa) ?remote=fake activa el servidor falso. Debería ser lista blanca (localhost).
test('host distinto de localhost (dominio propio, fork) con ?remote=fake: el modo falso NO se activa', async ({ app, page }) => {
  const OTHER = 'https://perdida-grasa.example.org';
  await serveAs(page, OTHER);
  await app.open({ path: `${OTHER}/index.html?remote=fake`, state: state({ consent: CONSENT }) });
  expect(await page.evaluate(() => Remote.config())).toBeNull();
});

test('XSS: nombre comercial y correo con HTML se muestran como texto en todas las pantallas', async ({ app, page }) => {
  const XSS = '<img src=x onerror="window.__x=1">';
  await app.open({ path: FAKE, state: state({ consent: CONSENT }) });
  await enterEmail(page, '<svg/onload=window.__x=2>@x.co');
  await expect(page.locator('#acc-code-email')).toHaveText('<svg/onload=window.__x=2>@x.co');
  await enterCode(page, '<svg/onload=window.__x=2>@x.co');
  await page.getByLabel(/Soy coach/).check();
  await page.getByLabel('Nombre comercial').fill(XSS);
  await page.locator('#acc-a7').check(); // A7: acuerdo del coach
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.locator('#acc-done-text')).toContainText(XSS);
  const invite = (await page.locator('#acc-done-code').textContent()).trim();
  await page.getByRole('button', { name: 'Ir a la app' }).click();
  await app.tab('perfil');
  await expect(page.locator('#account-status')).toContainText('<svg/onload=window.__x=2>@x.co');
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.locator('#form-logout').getByRole('button', { name: 'Cerrar sesión' }).click(); // S3-4: "No borrar" por defecto
  await page.getByRole('button', { name: 'Entrar o crear cuenta' }).click();
  await enterEmail(page, 'cli@x.co');
  await enterCode(page, 'cli@x.co');
  await wipeOtherAndContinue(page); // S3-2 O1: otra cuenta en el mismo teléfono
  await page.getByLabel(/Soy cliente/).check();
  await page.getByLabel(/Código de mi coach/).fill(invite);
  await page.getByRole('button', { name: 'Comprobar código' }).click();
  await expect(page.locator('#acc-share-title')).toHaveText(`Te vas a conectar con «${XSS}».`);
  await page.getByRole('button', { name: 'Conectarme y continuar' }).click();
  await expect(page.locator('#acc-done-text')).toContainText(XSS);
  await page.getByRole('button', { name: 'Ir a la app' }).click();
  await app.tab('perfil');
  await expect(page.locator('#account-extra')).toContainText(XSS);
  expect(await page.evaluate(() => window.__x)).toBeUndefined();
});

// Espía de recordConsents: envuelve RemoteFake.createFake en cuanto remote-fake.js lo define.
const spyConsents = () => {
  let real;
  Object.defineProperty(window, 'RemoteFake', {
    configurable: true,
    get() { return real; },
    set(v) {
      const orig = v.createFake;
      v.createFake = (o) => {
        const r = orig(o);
        const rc = r.account.recordConsents.bind(r.account);
        r.account.recordConsents = (ev) => { (window.__consentCalls ||= []).push(JSON.parse(JSON.stringify(ev))); return rc(ev); };
        return r;
      };
      real = v;
    },
  });
};

test('al entrar se registran las autorizaciones UNA sola vez (sin duplicar al recargar)', async ({ app, page }) => {
  await page.addInitScript(spyConsents);
  await app.open({ path: FAKE, state: state({ consent: CONSENT }) });
  await enterEmail(page, 'ana@x.co');
  await enterCode(page, 'ana@x.co');
  await page.getByLabel(/Soy cliente/).check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Ir a la app' }).click();
  await app.reload();
  await app.reload();
  const calls = await page.evaluate(() => window.__consentCalls || []);
  const be = await page.evaluate(() => JSON.parse(localStorage.getItem('pg-fake-backend')));
  const uid = be.users['ana@x.co'].id;
  expect(be.consentEvents.filter((e) => e.userId === uid)).toHaveLength(5); // A1, A2 (terms + privacy), A3 y A4
  test.info().annotations.push({ type: 'eventos', description: JSON.stringify(calls[0] || []) });
});

// S3-2 D1 (corregido: textHash en cada evento, y el fake lo exige). El servidor real (S3-1) exige text_hash (SHA-256 del texto aceptado) en cada consent_event; account.js
// no lo envía y remote-fake.js no lo exige, así que con el servidor real el registro fallará siempre (en silencio).
test('los consentimientos enviados al entrar llevan textHash (contrato S3-1: text_hash obligatorio)', async ({ app, page }) => {
  await page.addInitScript(spyConsents);
  await app.open({ path: FAKE, state: state({ consent: CONSENT }) });
  await enterEmail(page, 'h@x.co');
  await enterCode(page, 'h@x.co');
  await expect(page.locator('#acc-step-role')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window.__consentCalls || []).length)).toBeGreaterThan(0);
  const events = (await page.evaluate(() => window.__consentCalls))[0];
  for (const ev of events) expect(ev.textHash, ev.kind).toMatch(/^[0-9a-f]{64}$/);
});

test('cerrar sesión sin conexión: se cierra igual y los datos siguen', async ({ app, page }) => {
  await app.open({ path: FAKE, state: state({ consent: CONSENT }) });
  await enterEmail(page, 'off@x.co');
  await enterCode(page, 'off@x.co');
  await page.getByLabel(/Soy cliente/).check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Ir a la app' }).click();
  await page.evaluate(() => window.__pgFakeBackend.setOnline(false));
  await app.tab('perfil');
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.locator('#form-logout').getByRole('button', { name: 'Cerrar sesión' }).click(); // S3-4: "No borrar" por defecto
  await expect(page.locator('#account-status')).toContainText('Sin cuenta');
  await app.reload();
  // Sin sesión vuelve a ofrecerse la pantalla de cuenta (comportamiento previsto); "Ahora no" lleva a la app.
  await expect(acc(page)).toBeVisible();
  await page.getByRole('button', { name: /Ahora no/ }).click();
  await app.tab('perfil');
  await expect(page.locator('#account-status')).toContainText('Sin cuenta');
  expect((await app.stored()).entries.length).toBe(1);
});

test.describe('service worker', () => {
  test.use({ serviceWorkers: 'allow' });
  test('no guarda en caché respuestas de otros orígenes (p. ej. *.supabase.co)', async ({ app, page }) => {
    await page.route('https://abc.supabase.co/**', (r) => r.fulfill({ contentType: 'application/json', body: '{"ok":true}', headers: { 'access-control-allow-origin': '*' } }));
    await app.open({ state: state({ consent: CONSENT }), time: null });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await app.reload(); // la página queda controlada por el SW
    expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await page.evaluate(() => fetch('https://abc.supabase.co/rest/v1/x').then((r) => r.text()));
    const cached = await page.evaluate(async () => {
      const out = [];
      for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(r.url);
      return out.filter((u) => !u.startsWith(location.origin));
    });
    expect(cached).toEqual([]);
    expect(await page.evaluate(async () => (await caches.keys()).some((k) => /^perdida-grasa-v(\d+)$/.test(k) && Number(k.split('-v')[1]) >= 17))).toBe(true);
  });
});
