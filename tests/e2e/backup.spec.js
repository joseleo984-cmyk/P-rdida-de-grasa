// S1-2 / HU-01: recordatorio de copia, confirmación "¿Se guardó?" y estado de almacenamiento.
const fs = require('fs');
const { test, expect, state } = require('./helpers');

const LAST = 'perdida-grasa:lastBackup';
const SNOOZE = 'perdida-grasa:backupSnooze';
const banner = (page) => page.locator('#backup-banner-body');

test('sin datos no hay aviso; con datos y sin copia sí, y muestra el estado del almacenamiento', async ({ app, page }) => {
  await app.open();
  await expect(banner(page)).toBeHidden();
  await page.evaluate((s) => localStorage.setItem('perdida-grasa:v1', JSON.stringify(s)), state());
  await app.reload();
  await app.tab('panel');
  await expect(banner(page)).toBeVisible();
  await expect(page.locator('#backup-banner-text')).toContainText('Aún no tienes copia');
  await expect(page.locator('#storage-status')).toHaveText(/Almacenamiento protegido|puede borrar tus datos/);
});

test('copia hace 6 días: sin aviso; hace 8 días: aviso con "hace 8 días"', async ({ app, page }) => {
  await app.open({ state: state(), prefs: { [LAST]: '2026-10-15T15:00:00Z' } });
  await expect(banner(page)).toBeHidden();
  await page.evaluate((k) => localStorage.setItem(k, '2026-10-13T15:00:00Z'), LAST);
  await app.reload();
  await expect(banner(page)).toBeVisible();
  await expect(page.locator('#backup-banner-text')).toContainText('hace 8 días');
});

test('"Recordar más tarde" pospone 3 días y persiste', async ({ app, page }) => {
  await app.open({ state: state() });
  await page.locator('#btn-backup-later').click();
  await expect(banner(page)).toBeHidden();
  expect(await app.pref(SNOOZE)).toBe('2026-10-24');
  await app.reload();
  await expect(banner(page)).toBeHidden();
});

test('exportar pregunta "¿Se guardó?": "No" y Escape no registran; "Sí" registra y oculta el aviso', async ({ app, page }) => {
  await app.open({ state: state() });
  const confirmBar = page.locator('#backup-confirm');

  let [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#btn-backup-now').click()]);
  expect(dl.suggestedFilename()).toMatch(/^perdida-grasa-.*\.json$/);
  await expect(confirmBar).toBeVisible();
  await expect(page.locator('#btn-backup-yes')).toBeFocused();
  await page.locator('#btn-backup-no').click();
  await expect(confirmBar).toBeHidden();
  expect(await app.pref(LAST)).toBeNull();
  await expect(banner(page)).toBeVisible();

  [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#btn-backup-now').click()]);
  await page.keyboard.press('Escape');
  await expect(confirmBar).toBeHidden();
  expect(await app.pref(LAST)).toBeNull();

  [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#btn-backup-now').click()]);
  const exported = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  expect(exported.schemaVersion).toBe(require('../../schema.js').CURRENT_VERSION);
  await page.locator('#btn-backup-yes').click();
  expect(await app.pref(LAST)).not.toBeNull();
  await expect(banner(page)).toBeHidden();
  await expect(page.locator('#panel-summary')).toBeFocused();
});
