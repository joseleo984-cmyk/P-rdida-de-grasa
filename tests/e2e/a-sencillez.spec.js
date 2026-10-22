// Mejoras de sencillez (A3 guía de instalación en iPhone, A4 código del correo que se rellena solo).
const { test, expect, state, CONSENT, answerOwnerIfAsked } = require('./helpers');

const FAKE = 'index.html?remote=fake';
const EMPTY = () => state({ profile: null, entries: [], consent: CONSENT });
const lastCode = (page, email) => page.evaluate((e) => window.__pgFakeBackend.lastCode(e), email);

async function toCodeStep(page, email) {
  await page.getByLabel('Tu correo').fill(email);
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
  await expect(page.locator('#acc-code-error')).toContainText(/incorrecto|caducado/);
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
