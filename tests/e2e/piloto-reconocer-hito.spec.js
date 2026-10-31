// Piloto 6 · «A quién reconocer este lunes» (coach) y 8 · hito de 6 semanas (asesorado). Servidor FALSO, miércoles 21-oct-2026.
const { test, expect } = require('@playwright/test');
const H = require('./ux1-helpers');

test('coach: «A quién reconocer» sugiere por regreso y constancia, felicitar es 1 toque (nota) y desaparece', async ({ browser }, testInfo) => {
  const days = (offs) => offs.map((n) => H.hab(n));
  const CLIENTS = [
    { email: 'ana@c.co', name: 'Ana Martínez', paidDays: 20, habitDays: days([-16, -15, -14, -13, -9, -8, -7, -6]) },   // 2 semanas constantes seguidas
    { email: 'beto@c.co', name: 'Beto Ruiz', paidDays: 20, habitDays: days([-23, -9, -7]) },                           // volvió tras más de 7 días
    { email: 'carla@c.co', name: 'Carla Soto', paidDays: 20, habitDays: days([-3]) },                                  // un solo día: no
  ];
  const { p, errors } = await H.coachApp(browser, testInfo, CLIENTS);
  await p.locator('#tab-coach').click();
  await expect(p.locator('#coach-reconocer')).toBeVisible();
  const items = p.locator('#rec-lunes-list li');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText('Beto Ruiz');
  await expect(items.nth(0)).toContainText('Volvió a registrar esta semana después de unos días');
  await expect(items.nth(1)).toContainText('Ana Martínez');
  await expect(items.nth(1)).toContainText('2 semanas constantes seguidas');
  expect(await p.locator('#coach-reconocer').innerText()).not.toMatch(/\bkg\b|kcal|\bcm\b|peso|perdiste/i);
  await items.nth(0).getByRole('button', { name: /Felicitar a Beto/ }).click();
  await expect(p.locator('#toast')).toHaveText('Felicitación enviada a Beto Ruiz');
  await expect(items).toHaveCount(1);
  await expect.poll(async () => Object.values((await H.backend(p)).comments).map((c) => c.body)).toEqual(['¡Beto, qué bueno verte de vuelta! Volver también es parte del proceso.']);
  await p.reload(); await H.ready(p);
  await p.locator('#tab-coach').click();
  await expect(p.locator('#rec-lunes-list li')).toHaveCount(1);   // lo ya felicitado esa semana no vuelve
  expect(errors).toEqual([]);
});

test('asesorado: a las 6 semanas aparece el hito en semanas, elige un objetivo de proceso y «Entendido» lo oculta', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo);
  await p.addLocatorHandler(p.locator('#lgd-ok'), (l) => l.click());
  const habits = Object.fromEntries(Array.from({ length: 43 }, (_, i) => [H.iso(-42 + i), { water: 2 }]));
  await H.seedState(p, { habits });
  await expect(p.locator('#home-hito')).toBeVisible();
  await expect(p.locator('#hito-title')).toHaveText('Cumpliste 6 semanas');
  await expect(p.locator('#hito-lines li').first()).toContainText('de 6 semanas constantes');
  await expect(p.locator('#hito-closing')).toContainText('semanas, nunca en kilos');
  expect(await p.locator('#home-hito').innerText()).not.toMatch(/\bkg\b|kcal|\bcm\b|perdiste|fallaste/i);
  await p.locator('#hito-opts button', { hasText: 'Anotar 3 entrenos por semana' }).click();
  await expect(p.locator('#hito-goal')).toHaveText('Tu objetivo: Anotar 3 entrenos por semana.');
  await p.locator('#hito-ok').click();
  await expect(p.locator('#home-hito')).toBeHidden();
  await p.reload(); await H.ready(p);
  await expect(p.locator('#home-hito')).toBeHidden();
  expect(errors).toEqual([]);
});
