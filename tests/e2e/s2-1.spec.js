// S2-1 / LEGAL-01: pantalla de consentimiento, textos legales en la app, autorizaciones aparte y Privacidad.
// Estas pruebas abren la app con `legal: false` para recorrer la pantalla legal real.
const fs = require('fs');
const { test, expect, state, CONSENT, KEY } = require('./helpers');
const Schema = require('../../schema.js');

const gate = (page) => page.getByTestId('legal-gate');
const box = (page, name) => page.locator(`#form-consent [name=${name}]`);
const BOXES = ['terms', 'privacy', 'sensitiveHealth', 'photos', 'adult'];
async function accept(page, names) {
  for (const n of names) await box(page, n).check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(gate(page)).toBeHidden();
}

test('primer uso: pantalla a pantalla completa, 5 casillas sin marcar y Continuar solo con las obligatorias', async ({ app, page }) => {
  await app.open({ legal: false });
  await expect(gate(page)).toBeVisible();
  await expect(page.locator('.tabbar')).toBeHidden();
  await expect(page.locator('main')).toBeHidden();
  await expect(page.locator('#consent-title')).toBeFocused();
  for (const n of BOXES) await expect(box(page, n)).not.toBeChecked();
  const cont = page.getByRole('button', { name: 'Continuar' });
  await expect(cont).toBeDisabled();
  for (const n of ['terms', 'privacy', 'sensitiveHealth', 'photos']) await box(page, n).check();
  await expect(cont).toBeDisabled(); // falta "mayor de 18"
  await box(page, 'adult').check();
  await expect(cont).toBeEnabled();
  await box(page, 'terms').uncheck();
  await expect(cont).toBeDisabled();
  expect(await app.scrollWidth()).toBeLessThanOrEqual(390);
});

test('los textos se leen dentro de la app, definitivos (sin aviso de borrador), sin notas internas y sin perder lo marcado', async ({ app, page }) => {
  await app.open({ legal: false });
  await box(page, 'terms').check();
  await box(page, 'adult').check();
  await page.getByRole('link', { name: 'Leer los Términos' }).click();
  const dialog = page.locator('#legal-dialog');
  await expect(dialog).toBeVisible();
  const frame = page.frameLocator('#legal-frame');
  await expect(frame.locator('.draft')).toHaveCount(0);   // textos definitivos del abogado (1/11/2026)
  await expect(frame.locator('h1')).toContainText('Términos y Condiciones');
  await expect(frame.locator('body')).not.toContainText('NOTA');
  await expect(page.locator('#legal-close')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('link', { name: 'Leer los Términos' })).toBeFocused();
  await expect(box(page, 'terms')).toBeChecked();
  await expect(box(page, 'adult')).toBeChecked();
  await page.getByRole('link', { name: 'Leer la Política' }).click();
  await expect(page.frameLocator('#legal-frame').locator('h1')).toContainText('Política de Tratamiento');
  await page.locator('#legal-close').click();
});

test('aceptar guarda el consentimiento; sin fotos la pestaña queda bloqueada hasta autorizarlas', async ({ app, page }) => {
  await app.open({ legal: false });
  await accept(page, ['terms', 'privacy', 'sensitiveHealth', 'adult']);
  const c = (await app.stored()).consent;
  expect(c).toMatchObject({ termsVersion: Schema.LEGAL_VERSIONS.terms, privacyVersion: Schema.LEGAL_VERSIONS.privacy, sensitiveHealth: true, photos: false, adult: true });
  expect(Date.parse(c.acceptedAt)).not.toBeNaN();
  await app.tab('fotos');
  await expect(page.locator('#view-fotos .photos-gate')).toBeVisible();
  await expect(page.locator('#form-photo')).toBeHidden();
  await page.locator('#view-fotos [data-consent-grant=photos]').click();
  await expect(page.locator('#form-photo')).toBeVisible();
  expect((await app.stored()).consent.photos).toBe(true);
});

test('sin datos de salud: seguimiento bloqueado (también un envío forzado) y se puede autorizar después', async ({ app, page }) => {
  await app.open({ legal: false });
  await accept(page, ['terms', 'privacy', 'adult']);
  await app.tab('registro');
  await expect(page.locator('#view-registro .health-gate')).toBeVisible();
  await expect(page.locator('#form-entry')).toBeHidden();
  await page.evaluate(() => { const f = document.querySelector('#form-entry'); f.elements.date.value = '2026-10-20'; f.elements.weight.value = '70'; f.requestSubmit(); });
  await expect(app.toast()).toHaveText(/Autoriza tus datos de salud/);
  expect((await app.stored()).entries).toEqual([]);
  await page.locator('#view-registro [data-consent-grant=sensitiveHealth]').click();
  await expect(page.locator('#form-entry')).toBeVisible();
});

test('Perfil → Privacidad: ver lo aceptado y retirar salud y fotos', async ({ app, page }) => {
  await app.open({ state: state({ consent: CONSENT }), legal: false });
  await app.tab('perfil');
  await expect(page.locator('#privacy-list')).toContainText('Versión ' + Schema.LEGAL_VERSIONS.terms);
  await expect(page.locator('#privacy-list')).toContainText(/Fotos\s*Autorizado/);
  await page.locator('#btn-toggle-photos').click();
  await expect(page.locator('#btn-toggle-photos')).toHaveText('Autorizar fotos');
  await page.locator('#btn-toggle-health').click();
  expect((await app.stored()).consent).toMatchObject({ photos: false, sensitiveHealth: false });
  await expect(page.locator('#form-profile')).toBeHidden();
  await expect(page.locator('#privacy-card')).toBeVisible();
  await expect(page.locator('#btn-export')).toBeVisible();
  // Los datos no se borran al retirar la autorización
  expect((await app.stored()).entries).toHaveLength(1);
});

test('usuario existente (v2): se le pide aceptar sin perder datos; exportar incluye el consentimiento e importar no adopta el ajeno', async ({ app, page }) => {
  await app.open({ state: state(), legal: false });
  await expect(gate(page)).toBeVisible();
  await accept(page, ['terms', 'privacy', 'sensitiveHealth', 'adult']);
  const mine = (await app.stored()).consent;
  expect((await app.stored()).entries).toHaveLength(1);
  await app.tab('perfil');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#btn-export').click()]);
  const backup = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  expect(backup.consent).toEqual(mine);
  await page.locator('#btn-backup-no').click();
  const other = { ...backup, photos: undefined, entries: [{ id: 'x1', date: '2026-10-15', weight: 90 }], consent: { ...mine, photos: true, acceptedAt: '2020-01-01T00:00:00.000Z' } };
  await app.importJSON(other);
  const after = await app.stored();
  expect(after.entries).toHaveLength(1);
  expect(after.entries[0].weight).toBe(90);
  expect(after.consent).toEqual(mine);
});

test('re-aceptación si cambia la versión: aviso "Actualizamos…", TODAS sin marcar y nota de lo autorizado antes', async ({ app, page }) => {
  await app.open({ state: state({ consent: { ...CONSENT, termsVersion: '0.0', photos: false } }), legal: false });
  await expect(gate(page)).toBeVisible();
  await expect(page.locator('#consent-update')).toContainText(`Actualizamos Términos y Condiciones (versión 0.0 → ${Schema.LEGAL_VERSIONS.terms})`);
  for (const n of BOXES) await expect(box(page, n)).not.toBeChecked();
  await expect(page.locator('#consent-update')).toContainText('Antes autorizaste: datos de salud; márcalo de nuevo si sigues de acuerdo.');
  await expect(page.locator('#prev-sensitiveHealth')).toBeVisible();
  await expect(page.locator('#prev-photos')).toBeHidden();
  await accept(page, ['terms', 'privacy', 'sensitiveHealth', 'adult']);
  expect((await app.stored()).consent).toMatchObject({ sensitiveHealth: true, photos: false });
  const s = await app.stored();
  expect(s.consent.termsVersion).toBe(Schema.LEGAL_VERSIONS.terms);
  expect(s.entries).toHaveLength(1);
});

test('retirar los Términos lleva a "Borrar todo" y vuelve a pedir la aceptación', async ({ app, page }) => {
  await app.open({ state: state({ consent: CONSENT }), legal: false });
  await app.tab('perfil');
  await page.locator('#btn-withdraw-legal').click();
  await expect(gate(page)).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();
});

test('sin autorización de salud tampoco se importa un respaldo (control central de escritura)', async ({ app, page }) => {
  await app.open({ state: state({ consent: { ...CONSENT, sensitiveHealth: false } }), legal: false });
  const before = await app.stored();
  await page.setInputFiles('#file-import', { name: 'r.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ entries: [{ id: 'x', date: '2026-10-10', weight: 99 }] })) });
  await expect(app.toast()).toContainText('Sin tu autorización de datos de salud');
  expect(await app.stored()).toEqual(before);
});

test('sin autorización de fotos no se leen las fotos guardadas; al autorizar se cargan', async ({ app, page }) => {
  await app.open({ state: state({ consent: { ...CONSENT, photos: false } }), legal: false });
  await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = c.height = 8;
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    await Photos.put({ id: 'p1', date: '2026-10-20', pose: 'frente', blob, width: 8, height: 8, createdAt: 1 });
  });
  await page.evaluate(() => { window.__reads = 0; const o = Photos.all; Photos.all = (...a) => { window.__reads++; return o.apply(Photos, a); }; });
  await app.tab('fotos');
  expect(await page.evaluate(() => window.__reads)).toBe(0);
  await expect(page.locator('#gallery .thumb')).toHaveCount(0);
  await page.locator('#view-fotos [data-consent-grant=photos]').click();
  await expect(page.locator('#gallery .thumb')).toHaveCount(1);
});

test('enlaces de fotos y mayor de 18 abren su sección del texto; datos más nuevos: "Recargar" primero', async ({ app, page }) => {
  await app.open({ state: { schemaVersion: 99, entries: [] }, legal: false });
  app.allowConsoleErrors();
  await page.getByRole('link', { name: 'Qué hacemos con tus fotos' }).click();
  await expect(page.locator('#legal-frame')).toHaveAttribute('src', 'legal/privacidad.html#s6');
  await expect(page.frameLocator('#legal-frame').locator('#s6')).toBeInViewport();
  await page.locator('#legal-close').click();
  await expect(page.getByRole('link', { name: 'Por qué solo mayores de 18' })).toHaveAttribute('href', 'legal/privacidad.html#s9');
  await expect(page.locator('#btn-consent-reload')).toBeVisible();
  await expect(page.locator('#btn-consent-reset')).toBeVisible();
  const [reload] = await Promise.all([page.waitForEvent('load'), page.locator('#btn-consent-reload').click()]);
  void reload;
  await expect(gate(page)).toBeVisible();
});
