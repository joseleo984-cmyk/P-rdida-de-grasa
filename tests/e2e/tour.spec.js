// Tour de bienvenida: aparece una sola vez por rol, justo después de aceptar y elegir rol, resalta botones REALES, se puede saltar y volver a ver desde Más.
const { test, expect } = require('@playwright/test');
const H = require('./ux1-helpers');

const SEEN = "perdida-grasa:tour";
const clearSeen = (p) => p.evaluate((k) => localStorage.removeItem(k), SEEN);

test('asesorado: el tour sale una vez sobre la pantalla real, avanza paso a paso, «Saltar» no vuelve y «Ver el tour otra vez» lo reabre', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo);
  await clearSeen(p);
  await p.reload(); await H.ready(p);
  const tour = p.locator('#tour');
  await expect(tour).toBeVisible();
  await expect(p.locator('#tour-count')).toHaveText(/^Paso 1 de \d$/);
  await expect(p.locator('#tour-title')).toHaveText('Este es tu día');
  // la luz cae sobre un botón que existe y se ve
  const box = await p.locator('#tour-light').boundingBox();
  expect(box && box.width > 20 && box.height > 20).toBe(true);
  expect(await p.locator('#tour').innerText()).not.toMatch(/\bkg\b|kcal|\bcm\b|peso|ranking|perder|resultados?/i);
  await H.layout(p, '#tour button');
  await p.locator('#tour-next').click();
  await expect(p.locator('#tour-count')).toHaveText(/^Paso 2 de \d$/);
  await expect(p.locator('#tour-back')).toBeVisible();
  await p.locator('#tour-back').click();
  await expect(p.locator('#tour-title')).toHaveText('Este es tu día');
  await p.locator('#tour-skip').click();
  await expect(tour).toHaveCount(0);
  await p.reload(); await H.ready(p);
  await p.waitForTimeout(1200);
  await expect(p.locator('#tour')).toHaveCount(0);   // no vuelve
  // desde Más
  await p.locator('#tab-mas').click();
  await p.locator('#row-tour').click();
  await expect(p.locator('#tour')).toBeVisible();
  // recorre hasta el final con «Siguiente» y la última dice «Entendido»
  while (await p.locator('#tour-next').innerText() !== 'Entendido') await p.locator('#tour-next').click();
  await p.locator('#tour-next').click();
  await expect(p.locator('#tour')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('coach: su tour es distinto, resalta la lista y las pestañas del coach y no sale encima de la puerta del acuerdo', async ({ browser }, testInfo) => {
  const { p, errors } = await H.coachApp(browser, testInfo, [{ email: 'ana@c.co', name: 'Ana Martínez', paidDays: 20, habitDays: [H.hab(-1), H.hab(0)] }]);
  await clearSeen(p);
  await p.reload(); await H.ready(p);
  await expect(p.locator('#tour')).toBeVisible();
  await expect(p.locator('#tour-title')).toHaveText('Tu lista con semáforo');
  await H.layout(p, '#tour button');
  await p.locator('#tour-skip').click();
  await expect(p.locator('#tour')).toHaveCount(0);
  // el del asesorado no se marcó como visto por el del coach
  expect(await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), SEEN)).toEqual({ c: 1 });
  expect(errors).toEqual([]);
});
