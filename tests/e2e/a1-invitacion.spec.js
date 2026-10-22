// A1: invitación por WhatsApp (panel del coach) y apertura de la app con ?c=CODIGO (lado del cliente). Servidor FALSO.
const { test, expect } = require('./helpers');

const FAKE = 'index.html?remote=fake';
const SKIP = { 'perdida-grasa:account-skip': '1' };
const { EMPTY, INVITE_KEY, loginAsCoach, newPhone, loginWithEmail } = require('./fake-helpers');

test('coach: mensaje de WhatsApp con vista previa, enlace con el código y copia con alternativa', async ({ app, page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await app.open({ path: FAKE, state: EMPTY(), prefs: SKIP });
  await loginAsCoach(page, 'coach@ejemplo.com', 'Fit <b>Ana</b> & Co');
  await page.locator('#tab-invitar').click();
  await expect(page.locator('#view-invitar')).toBeVisible();
  const code = await page.evaluate(() => JSON.parse(localStorage.getItem('perdida-grasa:account')).coach.inviteCode);
  await expect(page.locator('#invite-card')).toBeVisible();
  const origin = await page.evaluate(() => location.origin + location.pathname);
  const link = `${origin}?c=${code}`;
  const wa = page.locator('#btn-invite-wa');
  // Sin nombre
  await expect(page.locator('#invite-preview')).toHaveText(`Hola, soy Fit <b>Ana</b> & Co. Te invito a seguir tu progreso conmigo en Pérdida de Grasa. Toca este enlace y listo: ${link}`);
  // Con nombre (con HTML: se muestra como texto, no se interpreta)
  await page.locator('#invite-name').fill('Luis <i>& Ro</i>');
  const msg = `Hola Luis <i>& Ro</i>, soy Fit <b>Ana</b> & Co. Te invito a seguir tu progreso conmigo en Pérdida de Grasa. Toca este enlace y listo: ${link}`;
  await expect(page.locator('#invite-preview')).toHaveText(msg);
  await expect(page.locator('#invite-preview i, #invite-preview b')).toHaveCount(0);
  const href = await wa.getAttribute('href');
  expect(href.startsWith('https://wa.me/?text=')).toBe(true);
  expect(decodeURIComponent(href.slice('https://wa.me/?text='.length))).toBe(msg);
  expect(href).not.toMatch(/[<> ]/);
  await expect(wa).toHaveAttribute('target', '_blank');
  // Copiar enlace (portapapeles real)
  await page.getByRole('button', { name: 'Copiar enlace' }).click();
  await expect(page.locator('#toast')).toHaveText('Enlace copiado');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
  // Sin portapapeles: queda el enlace seleccionado para copiar a mano
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('no')) }, configurable: true }); });
  await page.getByRole('button', { name: 'Copiar enlace' }).click();
  await expect(page.locator('#invite-copy-fallback')).toBeVisible();
  await expect(page.locator('#invite-link-input')).toHaveValue(link);
  await expect(page.locator('#invite-link-input')).toBeFocused();
  expect(await page.evaluate(() => { const i = document.querySelector('#invite-link-input'); return i.selectionEnd - i.selectionStart; })).toBe(link.length);
  expect(await app.scrollWidth()).toBeLessThanOrEqual(390);
  // El coach abre un enlace de invitación: solo se le explica que es para clientes
  await page.goto(`${FAKE}&c=${code}`);
  await expect(page.locator('#acc-step-done')).toBeVisible();
  await expect(page.locator('#acc-done-text')).toContainText('es para clientes');
  expect(await app.pref(INVITE_KEY)).toBeNull();
});

test('cliente: abre ?c=CODIGO, entra con el código del correo y queda con el código de su coach puesto', async ({ app, page, browser }, testInfo) => {
  test.setTimeout(90_000);
  await app.open({ path: FAKE, state: EMPTY(), prefs: SKIP });
  await loginAsCoach(page, 'coach@ejemplo.com', 'Fit Ana');
  const code = await page.evaluate(() => JSON.parse(localStorage.getItem('perdida-grasa:account')).coach.inviteCode);
  const backend = await page.evaluate(() => localStorage.getItem('pg-fake-backend'));

  const { ctx, p } = await newPhone(browser, testInfo, { backend, path: `${FAKE}&c=${code.toLowerCase()}` });
  // El parámetro se quita de la barra pero queda lo demás
  expect(await p.evaluate(() => location.search)).toBe('?remote=fake');
  expect(JSON.parse(await p.evaluate((k) => localStorage.getItem(k), INVITE_KEY)).code).toBe(code);
  await expect(p.locator('#acc-invite-email')).toBeVisible();
  await expect(p.locator('#acc-invite-email')).toContainText('Tu coach te invitó');
  await loginWithEmail(p, 'luis@ejemplo.com');
  await expect(p.locator('#acc-step-role')).toBeVisible();
  await expect(p.locator('input[name=role][value=client]')).toBeChecked();
  await expect(p.locator('#acc-coach-code')).toHaveValue(code);
  await expect(p.locator('#acc-share-title')).toContainText('Fit Ana');
  await p.locator('#btn-acc-role').click();
  await expect(p.locator('#acc-step-done')).toBeVisible();
  await expect(p.locator('#acc-done-text')).toContainText('Fit Ana');
  expect(await p.evaluate((k) => localStorage.getItem(k), INVITE_KEY)).toBeNull();
  // Recarga: ya no hay invitación ni pantalla
  await p.reload();
  await expect(p.getByTestId('account-gate')).toBeHidden();
  await ctx.close();
});

test('cliente: código que no existe, y enlace vencido o sin código válido', async ({ app, page, browser }, testInfo) => {
  test.setTimeout(90_000);
  await app.open({ path: FAKE, state: EMPTY(), prefs: SKIP });
  await loginAsCoach(page, 'coach@ejemplo.com', 'Fit Ana');
  const code = await page.evaluate(() => JSON.parse(localStorage.getItem('perdida-grasa:account')).coach.inviteCode);
  const backend = await page.evaluate(() => localStorage.getItem('pg-fake-backend'));

  const a = await newPhone(browser, testInfo, { backend, path: `${FAKE}&c=AAAAAA` });
  await loginWithEmail(a.p, 'ana@ejemplo.com');
  await expect(a.p.locator('#acc-role-error')).toContainText('no existe o ya venció');
  await expect(a.p.locator('#acc-coach-code')).toBeEditable();
  await a.p.locator('#acc-coach-code').fill(code);
  await a.p.locator('#btn-acc-role').click();
  await expect(a.p.locator('#acc-share-title')).toContainText('Fit Ana');
  await a.ctx.close();

  // Invitación guardada hace 8 días: no se usa y se borra
  const old = JSON.stringify({ code, at: '2026-10-13T12:00:00.000Z' });
  const b = await newPhone(browser, testInfo, { backend, path: FAKE, prefs: { [INVITE_KEY]: old } });
  await expect(b.p.getByTestId('account-gate')).toBeVisible();
  await expect(b.p.locator('#acc-invite-email')).toBeHidden();
  expect(await b.p.evaluate((k) => localStorage.getItem(k), INVITE_KEY)).toBeNull();
  await b.ctx.close();

  // Enlace sin código con formato válido
  const c = await newPhone(browser, testInfo, { backend, path: `${FAKE}&c=0O1I` });
  await loginWithEmail(c.p, 'eva@ejemplo.com');
  await expect(c.p.locator('#acc-invite-note')).toContainText('no trae un código válido');
  await expect(c.p.locator('#acc-coach-code')).toBeFocused();
  await c.ctx.close();
});

test('sin servidor configurado: ?c= no se toca ni se guarda nada', async ({ app, page }) => {
  await app.open({ path: 'index.html?c=ABC234', state: EMPTY() });
  expect(await page.evaluate(() => location.search)).toBe('?c=ABC234');
  expect(await app.pref(INVITE_KEY)).toBeNull();
  await expect(page.getByTestId('account-gate')).toBeHidden();
});
