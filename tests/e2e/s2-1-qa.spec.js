// S2-1 / LEGAL-01 · casos adversariales de QA (complementan s2-1.spec.js).
const fs = require('fs');
const path = require('path');
const { test, expect, state, CONSENT, FIXTURE_V1, D } = require('./helpers');
const Schema = require('../../schema.js');

const gate = (page) => page.getByTestId('legal-gate');
const box = (page, name) => page.locator(`#form-consent [name=${name}]`);
const noHealth = { ...CONSENT, sensitiveHealth: false, photos: false };
const f = (id, name, meal, kcal) => ({ id, name, meal, kcal, protein: 10, carbs: 10, fat: 5 });

// S2-1 D1 (corregido): copiar/repetir comidas y borrar registros o alimentos no pasan por un <form>; el control
// central en persist() las rechaza igual que a los formularios.
test('sin autorización de salud, NINGUNA vía escribe datos de salud (no solo formularios)', async ({ app, page }) => {
  const s = state({
    consent: noHealth,
    entries: [{ id: 'e1', date: D(20), weight: 70 }, { id: 'e2', date: D(1), weight: 69 }],
    foods: { [D(1)]: [f('y1', 'Avena', 'Desayuno', 300)], [D(0)]: [f('t1', 'Café', 'Desayuno', 20)] },
  });
  await app.open({ state: s });
  await expect(page.locator('body')).toHaveClass(/no-health/);
  const before = JSON.stringify(await app.stored());
  // Botones ocultos por CSS, pero vivos en el DOM: un clic programático (extensión, lector, script) no debe escribir.
  await page.evaluate(() => {
    document.querySelector('#btn-copy-prev').click();
    document.querySelector('[data-repeat-meal]')?.click();
    document.querySelector('[data-del-entry]')?.click();
    document.querySelector('[data-del-food]')?.click();
  });
  await page.waitForTimeout(200);
  expect(JSON.parse(JSON.stringify(await app.stored())), 'el estado guardado no debe cambiar').toEqual(JSON.parse(before));
});

test('importar un respaldo NO adopta su consentimiento (ni más ni menos permisos)', async ({ app, page }) => {
  const mine = { ...CONSENT, photos: false };
  await app.open({ state: state({ consent: mine }) });
  const foreign = { ...FIXTURE_V1, schemaVersion: 3, consent: { ...CONSENT, termsVersion: '9.9', privacyVersion: '9.9', photos: true, acceptedAt: '2020-01-01T00:00:00.000Z' } };
  await app.importJSON(foreign);
  expect((await app.stored()).consent).toEqual(Schema.normalizeConsent(mine));
  await app.tab('fotos');
  await expect(page.locator('body')).toHaveClass(/no-photos/);
  // Y al revés: un respaldo SIN consentimiento no le quita el suyo.
  await app.importJSON({ ...FIXTURE_V1, schemaVersion: 2 });
  expect((await app.stored()).consent).toEqual(Schema.normalizeConsent(mine));
  await expect(gate(page)).toBeHidden();
});

test('migración v1 → v3 desde localStorage: pide aceptar y conserva todo', async ({ app, page }) => {
  const { photos, ...v1 } = FIXTURE_V1; void photos;
  await app.open({ state: v1, legal: false });
  await expect(gate(page)).toBeVisible();
  for (const n of ['terms', 'privacy', 'sensitiveHealth', 'adult']) await box(page, n).check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(gate(page)).toBeHidden();
  const s = await app.stored();
  expect(s.schemaVersion).toBe(Schema.CURRENT_VERSION);
  // S2-4 (schema v4): la migración añade id UUID y updatedAt a cada registro; el contenido se conserva igual.
  const bare = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k === 'id' || k === 'updatedAt' ? undefined : v)));
  expect(bare(s.profile)).toEqual(v1.profile);
  expect(bare(s.entries)).toEqual(bare(v1.entries));
  expect(bare(s.foods)).toEqual(bare(v1.foods));
  expect(s.entries.every((e) => Schema.isUUID(e.id))).toBe(true);
  expect(s.consent.sensitiveHealth).toBe(true);
  expect(s.consent.photos).toBe(false);
});

test('los enlaces dentro de una casilla no la marcan ni desmarcan', async ({ app, page }) => {
  await app.open({ legal: false });
  await page.getByRole('link', { name: 'Qué datos y para qué' }).click();
  await page.locator('#legal-close').click();
  await expect(box(page, 'sensitiveHealth')).not.toBeChecked();
});

test('accesibilidad: cada casilla tiene nombre, Tab no sale de la pantalla legal y no hay scroll a 390 px', async ({ app, page }) => {
  await app.open({ legal: false });
  for (const name of [/Términos y Condiciones/, /Política de Tratamiento/, /datos sensibles de salud/, /fotos de progreso/, /mayor de 18/]) {
    await expect(page.getByRole('checkbox', { name })).toHaveCount(1);
  }
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab');
    const ok = await page.evaluate(() => document.activeElement === document.body || !!document.activeElement.closest('#consent'));
    expect(ok, 'el foco no debe ir a elementos ocultos tras la pantalla legal').toBe(true);
  }
  expect(await app.scrollWidth()).toBeLessThanOrEqual(390);
});

test.describe('modo oscuro', () => {
  test.use({ colorScheme: 'dark' });
  // Contraste WCAG entre el color del texto y el fondo efectivo (se sube por los ancestros hasta un fondo opaco).
  const contrast = (loc) => loc.evaluate((el) => {
    const rgb = (s) => (s.match(/[\d.]+/g) || []).map(Number);
    const lum = ([r, g, b]) => { const c = [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    let n = el, bg = null;
    while (n && n.nodeType === 1) { const c = rgb(getComputedStyle(n).backgroundColor); if (c.length >= 3 && (c[3] === undefined || c[3] > 0.9)) { bg = c; break; } n = n.parentElement; }
    bg = bg || [255, 255, 255];
    const a = lum(rgb(getComputedStyle(el).color)), b = lum(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  test('pantalla legal y textos legibles (contraste ≥ 4,5:1)', async ({ app, page }) => {
    await app.open({ legal: false });
    expect(await contrast(page.locator('#consent-title'))).toBeGreaterThanOrEqual(4.5);
    expect(await contrast(page.locator('#form-consent .check span').first())).toBeGreaterThanOrEqual(4.5);
    expect(await contrast(page.locator('#consent-hint'))).toBeGreaterThanOrEqual(4.5);
    await page.getByRole('link', { name: 'Leer la Política' }).click();
    const fr = page.frameLocator('#legal-frame');
    await expect(fr.locator('h1')).toBeVisible();
    expect(await contrast(fr.locator('h1'))).toBeGreaterThanOrEqual(4.5);
    expect(await contrast(fr.locator('p').nth(2))).toBeGreaterThanOrEqual(4.5);
  });
});

test('datos de una versión más nueva: aceptar en la pantalla legal no los sobrescribe', async ({ app, page }) => {
  app.allowConsoleErrors();
  const future = JSON.stringify({ schemaVersion: 99, entries: [{ id: 'z', date: D(0), weight: 50 }], consent: CONSENT });
  await app.open({ state: future, legal: false });
  await expect(gate(page)).toBeVisible();
  await expect(page.locator('#consent-blocked')).toBeVisible();
  for (const n of ['terms', 'privacy', 'adult']) await box(page, n).check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  expect(await page.evaluate(() => localStorage.getItem('perdida-grasa:v1'))).toBe(future);
  await expect(gate(page)).toBeVisible();
});

// Bloquea el PILOTO (no la historia): los textos aún tienen marcadores sin rellenar ([NOMBRE COMPLETO], [CORREO]…).
// Ley 1581: la autorización exige identificar al responsable y su contacto. Cuando se rellenen, este test pasará
// y Playwright avisará para quitar `test.fail`.
test('textos legales sin marcadores por rellenar ([NOMBRE COMPLETO], [CORREO]…)', async () => {
  test.fail(true, 'S2-1 D2: marcadores pendientes en los borradores legales (bloquea el piloto con datos reales)');
  for (const f of ['terminos.html', 'privacidad.html']) {
    const txt = fs.readFileSync(path.join(__dirname, '../../legal', f), 'utf8').replace(/<[^>]*>/g, ' ');
    expect(txt.match(/\[[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ]{2,}[^\]]*\]/g) || [], f).toEqual([]);
  }
});
