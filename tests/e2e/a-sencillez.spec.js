// Mejoras de sencillez (A3 guía de instalación en iPhone, A4 código del correo que se rellena solo).
const { test, expect, state, CONSENT, answerOwnerIfAsked } = require('./helpers');

const FAKE = 'index.html?remote=fake';
const EMPTY = () => state({ profile: null, entries: [], consent: CONSENT });
const lastCode = (page, email) => page.evaluate((e) => window.__pgFakeBackend.lastCode(e), email);

async function toCodeStep(page, email) {
  await page.getByLabel('Tu correo').fill(email);
  await page.locator('#acc-a1').check();
  await page.locator('#acc-a2').check();
  await page.getByRole('button', { name: /Enviarme el código/ }).click();
  await expect(page.locator('#acc-step-code')).toBeVisible();
}

test('A4: campos de correo y código con los atributos que activan el autollenado del teléfono', async ({ app, page }) => {
  await app.open({ path: FAKE, state: EMPTY() });
  const attrs = (sel) => page.locator(sel).evaluate((el) => Object.fromEntries([...el.attributes].map((a) => [a.name, a.value])));
  expect(await attrs('#acc-email')).toMatchObject({ type: 'email', autocomplete: 'email', inputmode: 'email', autocapitalize: 'off', autocorrect: 'off' });
  expect(await attrs('#acc-code')).toMatchObject({ autocomplete: 'one-time-code', inputmode: 'numeric', pattern: '[0-9]*', maxlength: '6', autocapitalize: 'off' });
});

test('A4: al completar los 6 dígitos entra sola, una sola vez; con un código malo avisa y deja corregir', async ({ app, page }) => {
  await app.open({ path: FAKE, state: EMPTY() });
  await expect(page.getByTestId('account-gate')).toBeVisible();
  await toCodeStep(page, 'ana@ejemplo.com');
  await page.evaluate(() => { window.__submits = 0; document.querySelector('#form-acc-code').addEventListener('submit', () => window.__submits++); });
  const code = await lastCode(page, 'ana@ejemplo.com');
  const bad = code === '111111' ? '222222' : '111111';
  const field = page.getByLabel('Código', { exact: true });
  // Cinco dígitos: no se envía nada
  await field.fill(bad.slice(0, 5));
  await expect(page.locator('#acc-code-error')).toBeHidden();
  expect(await page.evaluate(() => window.__submits)).toBe(0);
  // Seis dígitos malos: se envía solo y avisa
  await field.fill(bad);
  await expect(page.locator('#acc-code-error')).toContainText(/no es el correcto|ya venció/);
  expect(await page.evaluate(() => window.__submits)).toBe(1);
  // Se corrige y entra sola, con un único envío más
  await field.fill(code);
  await answerOwnerIfAsked(page);
  await expect(page.locator('#acc-step-code')).toBeHidden();
  expect(await page.evaluate(() => window.__submits)).toBe(2);
});

test('A4: el botón Entrar sigue sirviendo si el teléfono no avisó del cambio', async ({ app, page }) => {
  await app.open({ path: FAKE, state: EMPTY() });
  await toCodeStep(page, 'eva@ejemplo.com');
  const code = await lastCode(page, 'eva@ejemplo.com');
  await page.evaluate((c) => { document.querySelector('#acc-code').value = c; }, code); // sin evento input
  await page.getByRole('button', { name: 'Entrar' }).click();
  await answerOwnerIfAsked(page);
  await expect(page.locator('#acc-step-code')).toBeHidden();
});

// ---------- A3: guía para instalar en iPhone ----------
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const CHROME_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1';
const GUIDE_KEY = 'perdida-grasa:install-guide';

test.describe('A3 en Safari de iPhone', () => {
  test.use({ userAgent: IPHONE });

  test('aparece una vez tras aceptar los textos legales, con 3 pasos; "Entendido" no vuelve a molestar', async ({ app, page }) => {
    await app.open({ legal: false });
    await expect(page.getByTestId('legal-gate')).toBeVisible();
    await expect(page.locator('#install-card')).toBeHidden(); // antes de aceptar no
    for (const n of ['terms', 'privacy', 'sensitiveHealth', 'adult']) await page.locator(`#form-consent [name=${n}]`).check();
    await page.getByRole('button', { name: 'Continuar' }).click();
    const card = page.locator('#install-card');
    await expect(card).toBeVisible();
    await expect(card.getByRole('heading', { name: 'Instala la app en tu iPhone' })).toBeVisible();
    await expect(card.locator('ol li')).toHaveCount(3);
    await expect(card.locator('ol li svg')).toHaveCount(3);
    await expect(card).toContainText('Toca Compartir');
    await expect(card).toContainText('Elige «Añadir a pantalla de inicio»');
    await expect(card).toContainText('Toca «Añadir»');
    expect(await app.scrollWidth()).toBeLessThanOrEqual(390);
    await card.getByRole('button', { name: 'Entendido' }).click();
    await expect(card).toBeHidden();
    expect(await app.pref(GUIDE_KEY)).toBe('ok');
    await app.reload();
    await expect(card).toBeHidden();
  });

  test('"No mostrar más" se recuerda, y "Cómo instalar la app" sigue disponible en Más', async ({ app, page }) => {
    await app.open({ state: state({ consent: CONSENT }) });
    await expect(page.locator('#install-card')).toBeVisible();
    await page.getByRole('button', { name: 'No mostrar más' }).click();
    expect(await app.pref(GUIDE_KEY)).toBe('never');
    await app.reload();
    await expect(page.locator('#install-card')).toBeHidden();
    await page.locator('#tab-mas').click();
    const opener = page.getByRole('button', { name: /Cómo instalar la app/ });
    await opener.click();
    const dlg = page.locator('#install-dialog');
    await expect(dlg).toBeVisible();
    await expect(dlg.locator('#install-dialog-steps ol li')).toHaveCount(3);
    await expect(dlg.locator('#install-dialog-note')).toBeHidden(); // es Safari de iPhone: sin la nota para otros navegadores
    await expect(page.locator('#install-dialog-close')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('con la app ya instalada (pantalla de inicio) no aparece', async ({ app, page }) => {
    await page.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { value: true, configurable: true }); });
    await app.open({ state: state({ consent: CONSENT }) });
    await expect(page.locator('#install-card')).toBeHidden();
  });
});

test.describe('A3 en otros navegadores', () => {
  test.describe('Chrome en iPhone', () => {
    test.use({ userAgent: CHROME_IOS });
    test('no aparece, pero la guía permanente avisa que los pasos son de Safari', async ({ app, page }) => {
      await app.open({ state: state({ consent: CONSENT }) });
      await expect(page.locator('#install-card')).toBeHidden();
      await page.locator('#tab-mas').click();
      await page.getByRole('button', { name: /Cómo instalar la app/ }).click();
      await expect(page.locator('#install-dialog-note')).toBeVisible();
    });
  });
  test.describe('Chrome en Android', () => {
    test.use({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36' });
    test('la guía permanente trae los pasos de Android (Chrome) y de computador', async ({ app, page }) => {
      await app.open({ state: state({ consent: CONSENT }) });
      await expect(page.locator('#install-card')).toBeHidden();
      await page.locator('#tab-mas').click();
      await page.getByRole('button', { name: /Cómo instalar la app/ }).click();
      const note = page.locator('#install-dialog-note');
      await expect(note).toBeVisible();
      await expect(note).toContainText('En Android (Chrome)');
      await expect(note).toContainText('Instalar app');
      await expect(note).toContainText('Abrir en Chrome');
      await expect(note).toContainText('En computador (Chrome o Edge)');
    });
  });
  test('en el navegador de escritorio de las pruebas tampoco aparece', async ({ app, page }) => {
    await app.open({ state: state({ consent: CONSENT }) });
    await expect(page.locator('#install-card')).toBeHidden();
    expect(await app.pref(GUIDE_KEY)).toBeNull();
  });
});
