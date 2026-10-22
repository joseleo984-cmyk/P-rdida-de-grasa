// S3-2 (R1): crear cuenta / entrar con código, sesión persistente y rol, contra el servidor FALSO (sin red).
// ?remote=fake activa remote-fake.js (solo en localhost); el código OTP se lee de window.__pgFakeBackend.
const { test, expect, state, CONSENT } = require('./helpers');
const { answerOwnerIfAsked, wipeOtherAndContinue } = require('./helpers');

const FAKE = 'index.html?remote=fake';
const acc = (page) => page.getByTestId('account-gate');
const lastCode = (page, email) => page.evaluate((e) => window.__pgFakeBackend.lastCode(e), email);
const backend = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('pg-fake-backend')));
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

test('sin servidor configurado la app es la de siempre: sin pantalla ni tarjeta de cuenta', async ({ app, page }) => {
  const requested = [];
  page.on('request', (r) => requested.push(r.url()));
  await app.open({ state: state({ consent: CONSENT }) });
  await expect(page.locator('.tabbar')).toBeVisible();
  await expect(acc(page)).toBeHidden();
  await app.tab('perfil');
  await expect(page.locator('#account-card')).toBeHidden();
  expect(requested.some((u) => u.includes('remote-fake.js'))).toBe(false);
});

test('primer uso: la pantalla legal va antes; luego correo → código → rol cliente → app', async ({ app, page }) => {
  await app.open({ path: FAKE, legal: false });
  await expect(page.getByTestId('legal-gate')).toBeVisible();
  await expect(acc(page)).toBeHidden();
  for (const n of ['terms', 'privacy', 'sensitiveHealth', 'adult']) await page.locator(`#form-consent [name=${n}]`).check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(acc(page)).toBeVisible();
  await expect(page.locator('#account-title')).toBeFocused();
  await expect(page.locator('.tabbar')).toBeHidden();
  expect(await app.scrollWidth()).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'equipo/qa-capturas/s3-2-cuenta-correo.png' });

  // Correo no válido
  await page.getByLabel('Tu correo').fill('ana@');
  await page.locator('#acc-a1').check();
  await page.locator('#acc-a2').check();
  await page.getByRole('button', { name: 'Enviarme el código' }).click();
  await expect(page.locator('#acc-email-error')).toHaveText(/correo válido/);
  await expect(page.getByLabel('Tu correo')).toBeFocused();

  await enterEmail(page, 'Ana@Ejemplo.com');
  await expect(page.locator('#acc-code-email')).toHaveText('ana@ejemplo.com');
  await expect(page.getByLabel('Código', { exact: true })).toBeFocused();
  await expect(page.locator('#btn-acc-resend')).toBeDisabled();
  await expect(page.locator('#btn-acc-resend')).toHaveText(/Reenviar código \(\d+ s\)/);
  const good = await lastCode(page, 'ana@ejemplo.com');
  expect(good).toMatch(/^\d{6}$/);

  // Código incorrecto
  await page.getByLabel('Código', { exact: true }).fill(good === '111111' ? '222222' : '111111');
  await expect(page.locator('#acc-code-error')).toHaveText(/no es el correcto o ya venció/);

  await enterCode(page, 'ana@ejemplo.com');
  await expect(page.locator('#acc-step-role')).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.locator('#acc-role-error')).toHaveText(/cliente o coach/);
  await page.getByLabel(/Soy cliente/).check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.locator('#acc-done-text')).toContainText('ana@ejemplo.com');
  await page.getByRole('button', { name: 'Ir a la app' }).click();
  await expect(acc(page)).toBeHidden();
  await expect(page.locator('.tabbar')).toBeVisible();

  // Rol y consentimientos en el servidor
  const be = await backend(page);
  const user = be.users['ana@ejemplo.com'];
  expect(be.appAccess.filter((a) => a.userId === user.id).map((a) => a.role)).toEqual(['client']);
  expect(be.consentEvents.filter((e) => e.userId === user.id).map((e) => [e.kind, e.granted]).sort())
    .toEqual([['adult', true], ['cloud_transfer', true], ['privacy', true], ['sensitive_health', true], ['terms', true]]);

  // Sesión persistente tras recargar, también sin conexión
  await app.reload();
  await expect(acc(page)).toBeHidden();
  await page.evaluate(() => window.__pgFakeBackend.setOnline(false));
  await app.tab('perfil');
  await expect(page.locator('#account-status')).toContainText('Entraste con ana@ejemplo.com.');
  await app.tab('registro');
  await page.locator('#form-entry [name=weight]').fill('69.5');
  await page.locator('#form-entry button[type=submit]').click();
  await expect(page.locator('#entries-table tbody tr')).toHaveCount(1);
});

test('reenviar el código: espera de 60 s con cuenta atrás; "Usar otro correo" vuelve al paso 1', async ({ app, page }) => {
  await app.open({ path: FAKE, state: state({ consent: CONSENT }) });
  await expect(acc(page)).toBeVisible();
  await enterEmail(page, 'r@x.co');
  const first = await lastCode(page, 'r@x.co');
  await page.clock.runFor('00:30');
  await expect(page.locator('#btn-acc-resend')).toHaveText(/\((2|3)\d s\)/);
  await expect(page.locator('#btn-acc-resend')).toBeDisabled();
  await page.clock.runFor('00:31');
  await expect(page.locator('#btn-acc-resend')).toBeEnabled();
  await page.locator('#btn-acc-resend').click();
  await expect(page.locator('#acc-resend-hint')).toContainText('código nuevo');
  await expect(page.locator('#btn-acc-resend')).toBeDisabled();
  const second = await lastCode(page, 'r@x.co');
  if (first !== second) {
    await page.getByLabel('Código', { exact: true }).fill(first);
    await expect(page.locator('#acc-code-error')).toBeVisible();
  }
  await page.getByRole('button', { name: 'Usar otro correo' }).click();
  await expect(page.getByLabel('Tu correo')).toBeFocused();
});

test('coach: nombre comercial → código de invitación; un cliente se vincula eligiendo qué comparte', async ({ app, page }) => {
  await app.open({ path: FAKE, state: state({ consent: CONSENT }) });
  await enterEmail(page, 'coach@x.co');
  await enterCode(page, 'coach@x.co');
  await page.getByLabel(/Soy coach/).check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.locator('#acc-role-error')).toHaveText(/nombre de tu negocio/);
  await page.getByLabel('Nombre comercial').fill('Fit Ana');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.locator('#acc-role-error')).toHaveText(/Acuerdo del coach/); // A7: sin acuerdo no hay código de invitación
  await page.locator('#acc-a7').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.locator('#acc-done-code')).toBeVisible();
  const invite = (await page.locator('#acc-done-code').textContent()).trim();
  expect(invite).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  await page.getByRole('button', { name: 'Ir a la app' }).click();
  await app.tab('perfil');
  await expect(page.locator('#account-status')).toContainText('Tienes cuenta de coach');
  await expect(page.locator('#account-extra')).toContainText(invite);

  // Cerrar sesión (los datos se quedan) y entrar como cliente con el código
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  // S3-4 (decisión SM): pregunta si borrar también los datos del teléfono, con "No" por defecto.
  await page.locator('#form-logout').getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.locator('#account-status')).toContainText('Sin cuenta');
  expect((await app.stored()).entries.length).toBe(1);
  await page.getByRole('button', { name: 'Entrar o crear cuenta' }).click();
  await enterEmail(page, 'cli@x.co');
  await enterCode(page, 'cli@x.co');
  await wipeOtherAndContinue(page); // S3-2 O1: los datos del coach no se mezclan con la cuenta del cliente
  await page.getByLabel(/Soy cliente/).check();
  await page.getByLabel(/Código de mi coach/).fill('ZZZZZZ');
  await page.getByRole('button', { name: 'Comprobar código' }).click();
  await expect(page.locator('#acc-role-error')).toHaveText(/no existe o ya venció/);
  await page.getByLabel(/Código de mi coach/).fill(invite.toLowerCase());
  await page.getByRole('button', { name: 'Comprobar código' }).click();
  await expect(page.locator('#acc-share-title')).toHaveText('Te vas a conectar con «Fit Ana».');
  // Ninguna categoría opcional viene marcada; la corporal es obligatoria
  await expect(page.locator('#acc-share').getByLabel(/Peso y medidas/)).toBeChecked();
  for (const l of [/Comidas/, /Hábitos/, /Notas personales/]) await expect(page.locator('#acc-share').getByLabel(l)).not.toBeChecked();
  await page.locator('#acc-share').getByLabel(/Comidas/).check();
  expect(await app.scrollWidth()).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'equipo/qa-capturas/s3-2-cuenta-vincular.png', fullPage: true });
  await page.getByRole('button', { name: 'Conectarme y continuar' }).click();
  await expect(page.locator('#acc-done-text')).toContainText('con tu coach «Fit Ana»');
  const be = await backend(page);
  const link = be.links.find((l) => l.status === 'active');
  expect(link.shares).toEqual({ body: true, notes: false, nutrition: true, habits: false, photos: false });
});

test('"Ahora no": la app se usa sin cuenta y se puede entrar después desde Perfil', async ({ app, page }) => {
  await app.open({ path: FAKE, state: state({ consent: CONSENT }) });
  await expect(acc(page)).toBeVisible();
  await page.getByRole('button', { name: /Ahora no/ }).click();
  await expect(acc(page)).toBeHidden();
  await app.reload();
  await expect(acc(page)).toBeHidden();
  await app.tab('perfil');
  await expect(page.locator('#account-status')).toContainText('Sin cuenta: tus datos están solo en este teléfono');
  await page.getByRole('button', { name: 'Entrar o crear cuenta' }).click();
  await expect(acc(page)).toBeVisible();
});

test('sin conexión al pedir el código: mensaje claro y la app sigue usable', async ({ app, page }) => {
  await app.open({ path: FAKE, state: state({ consent: CONSENT }) });
  await expect(acc(page)).toBeVisible();
  await page.evaluate(() => window.__pgFakeBackend.setOnline(false));
  await page.getByLabel('Tu correo').fill('o@x.co');
  await page.locator('#acc-a1').check();
  await page.locator('#acc-a2').check();
  await page.getByRole('button', { name: 'Enviarme el código' }).click();
  await expect(page.locator('#acc-email-error')).toHaveText(/No hay internet/);
  await page.getByRole('button', { name: /Ahora no/ }).click();
  await expect(page.locator('.tabbar')).toBeVisible();
});

// ---------- QA S3-2 O1: los datos del teléfono tienen dueño ----------
const consentsOf = async (page, email) => {
  const be = await backend(page);
  const u = be.users[email];
  return u ? be.consentEvents.filter((e) => e.userId === u.id) : [];
};
async function codeOnly(page, email) {
  await enterEmail(page, email);
  await page.getByLabel('Código', { exact: true }).fill(await lastCode(page, email));
}

test('O1-a: datos sin dueño → "¿Estos datos son tuyos?" → Sí: quedan a nombre de la cuenta y se registra su aceptación', async ({ app, page }) => {
  await app.open({ path: FAKE, state: state({ consent: CONSENT }) });
  await codeOnly(page, 'a@x.co');
  await expect(page.locator('#acc-step-owner')).toBeVisible();
  await expect(page.locator('#acc-owner-title')).toBeFocused();
  expect(await consentsOf(page, 'a@x.co')).toHaveLength(0); // aún no: no se sabe si es su aceptación
  await page.getByRole('button', { name: /Sí, son míos/ }).click();
  await expect(page.locator('#acc-step-cloud')).toBeVisible(); // Sprint 6: la copia en la nube se ofrece antes del rol
  const be = await backend(page);
  expect(await page.evaluate(() => localStorage.getItem('perdida-grasa:owner'))).toBe(be.users['a@x.co'].id);
  await expect.poll(async () => (await consentsOf(page, 'a@x.co')).length).toBe(3); // A1 + A2 (terms y privacy); la nube aún no
  expect((await app.stored()).entries).toHaveLength(1);
});

test('O1-a: "No: empezar de cero" borra los datos del teléfono y pide la aceptación legal de ESTA persona', async ({ app, page }) => {
  await app.open({ path: FAKE, state: state({ consent: CONSENT }) });
  await codeOnly(page, 'b@x.co');
  await page.getByRole('button', { name: /empezar de cero/ }).click();
  await expect(page.getByTestId('legal-gate')).toBeVisible();
  expect(await consentsOf(page, 'b@x.co')).toHaveLength(0);
  for (const n of ['terms', 'privacy', 'adult']) await page.locator(`#form-consent [name=${n}]`).check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.locator('#acc-step-cloud')).toBeVisible(); // sigue con su cuenta
  const s = await app.stored();
  expect(s.entries).toHaveLength(0);
  expect(s.consent.acceptedAt).not.toBe(CONSENT.acceptedAt);
  await expect.poll(async () => (await consentsOf(page, 'b@x.co')).length).toBe(3);
  const ev = await consentsOf(page, 'b@x.co');
  expect(ev.map((e) => e.kind).sort()).toEqual(['adult', 'privacy', 'terms']); // sin A3 ni A4: no autorizó la copia
  expect(await page.evaluate(() => localStorage.getItem('perdida-grasa:owner'))).toBe((await backend(page)).users['b@x.co'].id);
});

test('O1-b: datos de OTRA cuenta → no se mezclan ni se registra nada; "Cerrar sesión" los deja intactos', async ({ app, page }) => {
  const OTHER = '00000000-0000-4000-8000-0000000000aa';
  await app.open({ path: FAKE, state: state({ consent: CONSENT }), prefs: { 'perdida-grasa:owner': OTHER } });
  await codeOnly(page, 'c@x.co');
  await expect(page.locator('#acc-step-other')).toBeVisible();
  await expect(page.locator('#acc-other-title')).toBeFocused();
  expect(await consentsOf(page, 'c@x.co')).toHaveLength(0);
  // Si se cierra la app en esta pantalla, al reabrir con la sesión tampoco se mezclan.
  await app.reload();
  await expect(page.locator('#acc-step-other')).toBeVisible();
  expect(await consentsOf(page, 'c@x.co')).toHaveLength(0);
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(acc(page)).toBeHidden();
  await app.tab('perfil');
  await expect(page.locator('#account-status')).toContainText('Sin cuenta');
  expect((await app.stored()).entries).toHaveLength(1);
  expect(await page.evaluate(() => localStorage.getItem('perdida-grasa:owner'))).toBe(OTHER);
});
