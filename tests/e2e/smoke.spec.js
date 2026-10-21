// Humo: arranque, navegación, perfil y registro (flujo principal en móvil 390x844).
const { test, expect, D, state } = require('./helpers');

test('primer uso: arranca sin errores, abre Perfil y no hay scroll horizontal', async ({ app, page }) => {
  await app.open();
  await expect(page.locator('#view-perfil')).toBeVisible();
  expect(await app.scrollWidth()).toBeLessThanOrEqual(390);
  for (const t of ['panel', 'registro', 'comidas', 'fotos', 'perfil']) {
    await app.tab(t);
    await expect(page.locator(`#view-${t}`)).toBeVisible();
    expect(await app.scrollWidth()).toBeLessThanOrEqual(390);
  }
});

test('perfil inválido (meta ≥ peso inicial) no se guarda; uno válido muestra el plan (BUG-04)', async ({ app, page }) => {
  await app.open();
  // Tras aceptar la pantalla legal (S2-1) ya hay un estado guardado con `consent`: el perfil inválido no debe cambiarlo.
  const before = await app.stored();
  expect(before === null || before.profile === null).toBe(true);
  const f = page.locator('#form-profile');
  await f.locator('[name=sex]').selectOption('female');
  await f.locator('[name=age]').fill('35');
  await f.locator('[name=height]').fill('165');
  await f.locator('[name=startWeight]').fill('70');
  await f.locator('[name=goalWeight]').fill('75');
  await f.locator('button[type=submit]').click();
  await expect(app.toast()).toContainText('meta debe ser menor');
  expect(await app.stored()).toEqual(before);
  await expect(page.locator('#plan')).toContainText('Guarda tu perfil');

  await f.locator('[name=goalWeight]').fill('62');
  await f.locator('button[type=submit]').click();
  await expect(app.toast()).toHaveText('Perfil guardado');
  await expect(page.locator('#plan')).toContainText('Objetivo diario');
  const s = await app.stored();
  expect(s.schemaVersion).toBe(require('../../schema.js').CURRENT_VERSION);
  expect(s.profile.goalWeight).toBe(62);
});

test('registro corporal: guardar, ver en el historial con la nota escapada y persistir tras recargar', async ({ app, page }) => {
  await app.open({ state: state() });
  await app.tab('registro');
  const f = page.locator('#form-entry');
  await f.locator('[name=date]').fill(D(0));
  await f.locator('[name=weight]').fill('68.4');
  await f.locator('[name=waist]').fill('80');
  await f.locator('[name=note]').fill('<b>ok</b>');
  await f.locator('button[type=submit]').click();
  await expect(app.toast()).toHaveText('Registro guardado');
  await app.reload();
  await app.tab('registro');
  await expect(page.locator('#entries-table tbody tr')).toHaveCount(2);
  await expect(page.locator('#entries-table')).toContainText('<b>ok</b>');
});
