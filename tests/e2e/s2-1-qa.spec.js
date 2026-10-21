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
  expect(s.profile).toEqual(v1.profile);
  expect(s.entries).toEqual(v1.entries);
  expect(s.foods).toEqual(v1.foods);
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

// ---- Re-verificación de las correcciones (b3aeeba) ----

// S2-1 D3 (re-verificación): la importación escribe las fotos del respaldo en IndexedDB aunque no estén autorizadas.
test('importar con fotos NO las escribe si las fotos no están autorizadas', async ({ app, page }) => {
  test.fail(true, 'S2-1 D3: importar guarda fotos sin autorización de fotos');
  await app.open({ state: state({ consent: { ...CONSENT, photos: false } }) });
  await app.importJSON(FIXTURE_V1);
  // Sin autorización la app no lee IndexedDB (O4): se consulta directamente.
  const n = await page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('perdida-grasa');
    r.onsuccess = () => {
      const db = r.result;
      if (!db.objectStoreNames.length) { res(0); return; }
      const st = db.transaction(db.objectStoreNames[0]).objectStore(db.objectStoreNames[0]).count();
      st.onsuccess = () => res(st.result);
    };
    r.onerror = () => res(-1);
  }));
  expect(n, 'fotos de un respaldo guardadas sin autorización de fotos').toBe(0);
});

test('"Deshacer" de una copia tras retirar la autorización de salud no escribe', async ({ app, page }) => {
  await app.open({ state: state({ consent: CONSENT, foods: { [D(1)]: [f('y1', 'Avena', 'Desayuno', 300)] } }) });
  await app.tab('comidas');
  await page.locator('#btn-copy-prev').click();
  await expect(app.toast().getByRole('button', { name: 'Deshacer' })).toBeVisible();
  const deshacer = await app.toast().getByRole('button', { name: 'Deshacer' }).elementHandle();
  // Retirar salud sin pasar por la UI de Privacidad (equivale a hacerlo en otra pestaña antes de los 6 s).
  await page.evaluate(() => document.querySelector('#btn-toggle-health').click());
  expect((await app.stored()).consent.sensitiveHealth).toBe(false);
  const after = JSON.stringify((await app.stored()).foods);
  expect(JSON.parse(after)[D(0)]).toHaveLength(1);
  await deshacer.evaluate((b) => b.click());
  expect(JSON.stringify((await app.stored()).foods)).toBe(after);
});

test('textos legales de la fase piloto: legibles a 390 px, sin desbordes y con anclas que llevan a su sección', async ({ app, page }) => {
  await app.open({ legal: false });
  for (const [link, anchor, heading] of [['Qué datos y para qué', 's5', /Datos sensibles/], ['Por qué solo mayores de 18', 's7', /Menores de edad/]]) {
    await page.getByRole('link', { name: link }).click();
    const fr = page.frameLocator('#legal-frame');
    await expect(fr.locator('h1')).toBeVisible();
    await expect(fr.locator(`#${anchor}`)).toHaveText(heading);
    await expect(fr.locator(`#${anchor}`)).toBeInViewport();
    const ov = await fr.locator('body').evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(ov, 'scroll horizontal en el texto legal').toBeLessThanOrEqual(0);
    await expect(fr.locator('body')).toContainText('sin servidor');
    await expect(fr.locator('body')).not.toContainText(/Dudas para el abogado/i);
    await page.locator('#legal-close').click();
  }
});
