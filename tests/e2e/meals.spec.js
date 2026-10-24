// S1-3 / HU-02: repetir comidas (copiar de ayer, repetir bloque, copiar día a hoy, deshacer).
const { test, expect, D, state } = require('./helpers');

const f = (id, name, meal, kcal) => ({ id, name, meal, kcal, protein: 10, carbs: 10, fat: 5 });
const seeded = () => state({
  foods: {
    [D(1)]: [f('y1', 'Avena', 'Desayuno', 300), f('y2', 'Pollo', 'Almuerzo', 450), f('y3', '<img src=x onerror="window.__xss=1">', 'Cena', 200)],
    [D(4)]: [f('a1', 'Huevos', 'Desayuno', 200), f('a2', 'Arroz', 'Almuerzo', 400), f('a3', 'Sopa', 'Cena', 300), f('a4', 'Fruta', 'Snack', 100)],
  },
});
const rows = (page) => page.locator('#food-list .food-row');
const today = D(0);

test('"Copiar de ayer" en un día vacío copia todo, con ids nuevos, sin confirmar y con "Deshacer"', async ({ app, page }) => {
  await app.open({ state: seeded() });
  await app.tab('comidas');
  await page.locator('#btn-copy-prev').click();
  await expect(app.toast()).toContainText('Se copiaron 3 alimentos a hoy');
  await expect(rows(page)).toHaveCount(3);
  const s = await app.stored();
  const ids = s.foods[today].map((x) => x.id);
  expect(new Set(ids).size).toBe(3);
  expect(ids.some((id) => ['y1', 'y2', 'y3'].includes(id))).toBe(false);
  expect(s.foods[D(1)]).toHaveLength(3);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();

  await app.toast().getByRole('button', { name: 'Deshacer' }).tap();
  await expect(app.toast()).toHaveText('Copia deshecha');
  await expect(rows(page)).toHaveCount(0);
  expect((await app.stored()).foods[today]).toBeUndefined();
});

test('"Copiar de ayer" sobre un día con comidas pide confirmación y suma sin reemplazar', async ({ app, page }) => {
  await app.open({ state: seeded() });
  await app.tab('comidas');
  await page.locator('#btn-copy-prev').click();
  const dialogs = [];
  page.on('dialog', (d) => dialogs.push(d.message()));
  await page.locator('#btn-copy-prev').click();
  await expect(rows(page)).toHaveCount(6);
  expect(dialogs[0]).toContain('ya tiene comidas');
});

test('en hoy, "Repetir <bloque> de ayer" copia solo ese bloque y el foco no se pierde', async ({ app, page }) => {
  await app.open({ state: seeded() });
  await app.tab('comidas');
  const btn = page.locator('[data-repeat-meal="Almuerzo"]');
  await btn.focus();
  await page.keyboard.press('Enter');
  await expect(app.toast()).toContainText('Se copió 1 alimento a hoy');
  expect((await app.stored()).foods[today].map((x) => x.name)).toEqual(['Pollo']);
  expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);
});

test('día pasado: "Copiar este día a hoy" copia el día completo en 2 toques', async ({ app, page }) => {
  await app.open({ state: seeded() });
  await app.tab('comidas');
  await page.fill('#food-date', D(4));
  await page.locator('#food-date').dispatchEvent('change');
  await page.locator('#btn-copy-to-today').click();
  await expect(app.toast()).toContainText('Se copiaron 4 alimentos a hoy');
  expect((await app.stored()).foods[today]).toHaveLength(4);
});

test('origen vacío: avisa y no cambia nada', async ({ app, page }) => {
  await app.open({ state: seeded() });
  await app.tab('comidas');
  await page.fill('#food-date', D(10));
  await page.locator('#food-date').dispatchEvent('change');
  const before = JSON.stringify(await app.stored());
  await page.locator('#btn-copy-prev').click();
  await expect(app.toast()).toContainText('no se copió nada');
  expect(JSON.stringify(await app.stored())).toBe(before);
});

test('cuota llena: copiar y deshacer muestran error y no fingen éxito', async ({ app, page }) => {
  await app.open({ state: seeded() });
  await app.tab('comidas');
  await app.quotaFull();
  await page.locator('#btn-copy-prev').click();
  await expect(app.toast()).toHaveText(/^Almacenamiento lleno/);
  await expect(app.toast().getByRole('button', { name: 'Deshacer' })).toHaveCount(0);
  await expect(rows(page)).toHaveCount(0);

  await app.quotaFull(false);
  await page.locator('#btn-copy-prev').click();
  await expect(rows(page)).toHaveCount(3);
  await app.quotaFull();
  await app.toast().getByRole('button', { name: 'Deshacer' }).click();
  await expect(app.toast()).toHaveText(/^Almacenamiento lleno/);
  await expect(rows(page)).toHaveCount(3);
  expect((await app.stored()).foods[today]).toHaveLength(3);
});

test('cruce de medianoche con la app abierta: el diario pasa al nuevo día', async ({ app, page }) => {
  await app.open({ state: seeded(), time: '2026-10-21T23:50:00-05:00' });
  await app.tab('comidas');
  await expect(page.locator('#food-date')).toHaveValue('2026-10-21');
  // La PWA vuelve de segundo plano con la hora ya cambiada: se fija la hora (setSystemTime), sin depender de que fastForward
  // alcance a la página (a veces no lo hacía y la prueba fallaba de forma intermitente).
  await page.clock.setSystemTime(new Date('2026-10-22T00:10:00-05:00'));
  await expect.poll(() => page.evaluate(() => new Date().getDate())).toBe(22);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('#food-date')).toHaveValue('2026-10-22');
  expect(await app.scrollWidth()).toBeLessThanOrEqual(390);
});
