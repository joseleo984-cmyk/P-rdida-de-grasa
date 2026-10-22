// Sprint 9: CAPTCHA (Cloudflare Turnstile) en la entrada con código por correo, contra el servidor FALSO y SIN red real:
// el script de Cloudflare se intercepta (page.route) y se sustituye por un doble que imita turnstile.render/reset/remove.
// Claves de prueba OFICIALES de Cloudflare (solo aquí y en la documentación): 1x…AA siempre pasa, 2x…AB siempre bloquea.
// Con el doble no se prueba a Cloudflare real (eso lo comprueba el Stakeholder en /pruebas/, ver equipo/handoffs/captcha-turnstile.md).
const { test, expect, state, CONSENT } = require('./helpers');

const FAKE = 'index.html?remote=fake';
const PASS = '1x00000000000000000000AA';
const BLOCK = '2x00000000000000000000AB';
const WIDE = '*{font-family:"DejaVu Sans",Verdana,sans-serif !important; letter-spacing:.02em}';
const MSG = /No pudimos verificar que eres una persona\. Revisa tu conexión e intenta de nuevo/;

// Doble de https://challenges.cloudflare.com/turnstile/v0/api.js
const STUB = `
(function () {
  var n = 0, widgets = {};
  window.__ts = { renders: [], resets: 0, removes: 0, tokens: [] };
  var held = [];
  function solve(id) {
    var w = widgets[id]; if (!w) return;
    if (window.__tsHold) { held.push(id); return; }
    setTimeout(function () {
      if (!widgets[id]) return;
      if (w.o.sitekey.charAt(0) === '2') { w.o['error-callback'] && w.o['error-callback']('600010'); return; }
      var t = 'TOKEN-' + (++n); window.__ts.tokens.push(t); w.o.callback(t);
    }, 40);
  }
  window.__ts.release = function () { window.__tsHold = false; held.splice(0).forEach(solve); };
  window.turnstile = {
    render: function (el, o) {
      var id = 'w' + (Object.keys(widgets).length + 1 + window.__ts.renders.length);
      widgets[id] = { el: el, o: o }; window.__ts.renders.push({ sitekey: o.sitekey, size: o.size, appearance: o.appearance, theme: o.theme, id: id });
      var f = document.createElement('iframe'); f.title = 'Widget de desafío'; f.style.cssText = 'width:' + (o.size === 'compact' ? '150px' : '100%') + ';height:65px;border:0;';
      el.appendChild(f); solve(id); return id;
    },
    reset: function (id) { window.__ts.resets++; solve(id); },
    remove: function (id) { window.__ts.removes++; var w = widgets[id]; if (w) { w.el.replaceChildren(); delete widgets[id]; } },
  };
})();`;

async function setup(page, app, { siteKey, cloudflare = 'stub', path = FAKE } = {}) {
  const seen = [];
  const mode = { cloudflare };
  page.on('request', (r) => seen.push(r.url()));
  if (siteKey !== undefined) {
    await page.route('**/config.js', (r) => r.fulfill({ contentType: 'text/javascript',
      body: `window.PG_CONFIG = { env: '', url: '', key: '', mode: 'real'${siteKey ? `, captchaSiteKey: '${siteKey}'` : ''} };` }));
  }
  await page.route('https://challenges.cloudflare.com/**', (r) => {
    if (mode.cloudflare === 'blocked') return r.abort('blockedbyclient');
    return r.fulfill({ contentType: 'text/javascript', body: STUB });
  });
  await app.open({ path, state: state({ consent: CONSENT }) });
  return { seen, mode, cf: () => seen.filter((u) => u.includes('challenges.cloudflare.com')) };
}
async function fillAndSend(page, email) {
  await page.getByLabel('Tu correo').fill(email);
  await page.locator('#acc-a1').check();
  await page.locator('#acc-a2').check();
  await page.getByRole('button', { name: 'Enviarme el código' }).click();
}
const be = (page) => page.evaluate(() => ({ tokens: window.__pgFakeBackend.captchaTokens, sent: window.__pgFakeBackend.sent.map((s) => s.email) }));

test('con site key de prueba (siempre pasa): el widget se verifica solo y el código se pide con token', async ({ app, page }) => {
  const s = await setup(page, app, { siteKey: PASS });
  await expect(page.locator('#account')).toBeVisible();
  await expect(page.locator('#acc-captcha-email')).toBeVisible();
  await expect(page.locator('#acc-captcha-email .acc-captcha-status')).toHaveText('Verificación lista.');
  expect(s.cf().length).toBe(1);
  expect(s.cf()[0]).toContain('/turnstile/v0/api.js');
  const r = await page.evaluate(() => window.__ts.renders[0]);
  expect(r).toMatchObject({ sitekey: PASS, appearance: 'interaction-only', theme: 'auto', size: 'flexible' });
  await fillAndSend(page, 'ana@ejemplo.com');
  await expect(page.locator('#acc-step-code')).toBeVisible();
  const b = await be(page);
  expect(b.sent).toEqual(['ana@ejemplo.com']);
  expect(b.tokens).toHaveLength(1);
  expect(b.tokens[0]).toMatch(/^TOKEN-/);
  // En el paso del código hay un widget NUEVO (el token anterior ya se gastó) para poder reenviar
  await expect(page.locator('#acc-captcha-code')).toBeVisible();
  await expect(page.locator('#acc-captcha-email')).toBeHidden();
  await expect(page.locator('#acc-captcha-code .acc-captcha-status')).toHaveText('Verificación lista.');
  expect(await page.evaluate(() => window.__ts.renders.length)).toBe(2);
  await page.clock.runFor('01:01');
  await page.getByRole('button', { name: 'Reenviar código' }).click();
  await expect(page.locator('#acc-resend-hint')).toContainText('código nuevo');
  const b2 = await be(page);
  expect(b2.tokens).toHaveLength(2);
  expect(new Set(b2.tokens).size, 'cada envío usa un token distinto (un solo uso)').toBe(2);
  await expect(page.locator('#acc-captcha-code .acc-captcha-status')).toHaveText('Verificación lista.'); // el widget se reinició y volvió a verificar
  // Entrar sigue funcionando
  await page.getByLabel('Código', { exact: true }).fill(await page.evaluate(() => window.__pgFakeBackend.lastCode('ana@ejemplo.com')));
  await expect(page.locator('#acc-step-code')).toBeHidden();
});

test('con site key de prueba (siempre bloquea): mensaje claro y no se pide el código', async ({ app, page }) => {
  await setup(page, app, { siteKey: BLOCK });
  await expect(page.locator('#acc-captcha-email .acc-captcha-status')).toHaveText(MSG);
  await fillAndSend(page, 'ana@ejemplo.com');
  await expect(page.locator('#acc-email-error')).toHaveText(MSG);
  await expect(page.locator('#acc-step-code')).toBeHidden();
  const b = await be(page);
  expect(b.sent).toEqual([]);
  expect(b.tokens).toEqual([]);
  expect(await page.evaluate(() => window.__ts.resets), 'tras el rechazo se reinicia el widget').toBeGreaterThan(0);
  // Sin términos de uso sigue mandando primero el aviso de las casillas (el captcha no tapa otros mensajes)
  await expect(page.getByRole('button', { name: 'Enviarme el código' })).toBeEnabled();
  expect(await app.scrollWidth()).toBeLessThanOrEqual(390);
});

test('el servidor rechaza el token (captcha_failed): mensaje, widget reiniciado y el reintento funciona', async ({ app, page }) => {
  await setup(page, app, { siteKey: PASS });
  await expect(page.locator('#acc-captcha-email .acc-captcha-status')).toHaveText('Verificación lista.');
  await page.evaluate(() => window.__pgFakeBackend.captchaFail(1));
  await fillAndSend(page, 'ana@ejemplo.com');
  await expect(page.locator('#acc-email-error')).toHaveText(MSG);
  await expect(page.locator('#acc-step-code')).toBeHidden();
  await expect(page.locator('#acc-email-error')).not.toContainText(/captcha_failed|verification process/i); // sin errores técnicos
  expect(await page.evaluate(() => window.__ts.resets)).toBe(1);
  await expect(page.locator('#acc-captcha-email .acc-captcha-status')).toHaveText('Verificación lista.');
  await page.getByRole('button', { name: 'Enviarme el código' }).click();
  await expect(page.locator('#acc-step-code')).toBeVisible();
  const b = await be(page);
  expect(b.tokens).toHaveLength(2);
  expect(b.tokens[0]).not.toBe(b.tokens[1]);
  expect(b.sent).toEqual(['ana@ejemplo.com']);
});

test('si el widget aún no terminó, se pide esperar un momento y no se llama al servidor sin token', async ({ app, page }) => {
  await page.addInitScript(() => { window.__tsHold = true; });
  await setup(page, app, { siteKey: PASS });
  await expect(page.locator('#acc-captcha-email .acc-captcha-status')).toHaveText('Verificando que eres una persona…');
  await fillAndSend(page, 'ana@ejemplo.com');
  await expect(page.locator('#acc-email-error')).toContainText('Espera un momento');
  await expect(page.locator('#acc-step-code')).toBeHidden();
  expect(await be(page)).toEqual({ tokens: [], sent: [] });
  await page.evaluate(() => window.__ts.release());
  await expect(page.locator('#acc-captcha-email .acc-captcha-status')).toHaveText('Verificación lista.');
  await page.getByRole('button', { name: 'Enviarme el código' }).click();
  await expect(page.locator('#acc-step-code')).toBeVisible();
  expect((await be(page)).tokens).toHaveLength(1);
});

test('script de Cloudflare bloqueado: mensaje amable, no se pide el código y al volver la red se reintenta la carga', async ({ app, page }) => {
  app.allowConsoleErrors(); // el navegador anota en consola la carga bloqueada
  const s = await setup(page, app, { siteKey: PASS, cloudflare: 'blocked' });
  await expect(page.locator('#acc-captcha-email .acc-captcha-status')).toHaveText(MSG);
  await fillAndSend(page, 'ana@ejemplo.com');
  await expect(page.locator('#acc-email-error')).toHaveText(MSG);
  await expect(page.locator('#acc-step-code')).toBeHidden();
  expect((await be(page)).sent).toEqual([]);
  const tries = s.cf().length;
  expect(tries).toBeGreaterThanOrEqual(2); // al pulsar se reintentó la carga
  s.mode.cloudflare = 'stub'; // vuelve la red
  await page.getByRole('button', { name: 'Enviarme el código' }).click(); // reintenta la carga
  await expect(page.locator('#acc-captcha-email .acc-captcha-status')).toHaveText('Verificación lista.');
  expect(s.cf().length).toBeGreaterThan(tries);
  await page.getByRole('button', { name: 'Enviarme el código' }).click();
  await expect(page.locator('#acc-step-code')).toBeVisible();
  expect((await be(page)).tokens).toHaveLength(1);
});

test('script de Cloudflare bloqueado: la app sigue viva y se puede usar sin cuenta', async ({ app, page }) => {
  app.allowConsoleErrors();
  await setup(page, app, { siteKey: PASS, cloudflare: 'blocked' });
  await expect(page.locator('#acc-captcha-email .acc-captcha-status')).toHaveText(MSG);
  await page.getByRole('button', { name: /Ahora no: usar solo en este teléfono/ }).click();
  await expect(page.locator('#account')).toBeHidden();
  await expect(page.locator('.tabbar')).toBeVisible();
});

test('SIN captchaSiteKey: no se carga ningún script externo, no hay widget y el flujo es el de siempre', async ({ app, page }) => {
  const s = await setup(page, app, { siteKey: '' });
  await expect(page.locator('#account')).toBeVisible();
  await expect(page.locator('#acc-captcha-email')).toBeHidden();
  await fillAndSend(page, 'ana@ejemplo.com');
  await expect(page.locator('#acc-step-code')).toBeVisible();
  await expect(page.locator('#acc-captcha-code')).toBeHidden();
  expect((await be(page)).tokens).toEqual([]);
  expect(await page.evaluate(() => typeof window.turnstile)).toBe('undefined');
  expect(await page.evaluate(() => [...document.scripts].map((x) => x.src).filter((u) => u && new URL(u).origin !== location.origin))).toEqual([]);
  const external = s.seen.filter((u) => { const p = new URL(u); return !['127.0.0.1', 'localhost'].includes(p.hostname) && p.protocol.startsWith('http'); });
  expect(external, 'ninguna petición a otro dominio').toEqual([]);
});

test('con config.js de verdad (vacío) la raíz no carga nada externo ni muestra captcha', async ({ app, page }) => {
  const s = await setup(page, app, { siteKey: undefined });
  await expect(page.locator('#account')).toBeVisible();
  await expect(page.locator('#acc-captcha-email')).toBeHidden();
  expect(s.cf()).toEqual([]);
});

for (const scheme of ['light', 'dark']) {
  test(`letra ancha a 390 px (${scheme}): el widget no desborda ni tapa el botón, en ambos pasos`, async ({ app, page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await setup(page, app, { siteKey: PASS });
    await page.addStyleTag({ content: WIDE });
    const check = async (step, btn) => {
      const box = await page.evaluate(({ step, btn }) => {
        const cap = document.querySelector(`#acc-captcha-${step}`), w = cap.querySelector('.acc-captcha-widget'), b = document.querySelector(btn);
        const r = (e) => { const q = e.getBoundingClientRect(); return { l: q.left, r: q.right, t: q.top, b: q.bottom, h: q.height }; };
        return { cap: r(cap), w: r(w), btn: r(b), W: window.innerWidth, sw: document.documentElement.scrollWidth, hasFrame: !!w.querySelector('iframe') };
      }, { step, btn });
      expect(box.sw, 'scroll horizontal').toBeLessThanOrEqual(390);
      expect(box.hasFrame).toBe(true);
      expect(box.cap.l).toBeGreaterThanOrEqual(0);
      expect(box.cap.r).toBeLessThanOrEqual(box.W + 0.5);
      expect(box.w.r).toBeLessThanOrEqual(box.W + 0.5);
      expect(box.btn.r).toBeLessThanOrEqual(box.W + 0.5);
      expect(box.btn.h).toBeGreaterThanOrEqual(44);
      return box;
    };
    await expect(page.locator('#acc-captcha-email .acc-captcha-status')).toHaveText('Verificación lista.');
    await check('email', '#form-acc-email .acc-main');
    // El botón recibe el toque (nada lo tapa)
    const top = await page.locator('#form-acc-email .acc-main').evaluate((b) => { b.scrollIntoView({ block: 'center' }); const q = b.getBoundingClientRect(); return document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2) === b; });
    expect(top, 'el botón no está tapado').toBe(true);
    expect(await page.evaluate(() => window.__ts.renders[0].theme)).toBe('auto');
    await page.screenshot({ path: `test-results/s9-captcha-correo-${scheme}.png`, fullPage: true });
    await fillAndSend(page, 'ana@ejemplo.com');
    await expect(page.locator('#acc-step-code')).toBeVisible();
    await expect(page.locator('#acc-captcha-code .acc-captcha-status')).toHaveText('Verificación lista.');
    await check('code', '#form-acc-code .acc-main');
    // Foco: tras pasar al paso del código, el campo recibe el foco (el widget no se lo roba)
    await expect(page.locator('#acc-code')).toBeFocused();
  });
}
