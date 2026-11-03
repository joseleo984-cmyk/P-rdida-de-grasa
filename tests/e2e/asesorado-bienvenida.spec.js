// Bienvenida del asesorado: con el enlace de su coach es la PRIMERA pantalla (antes de «Antes de empezar»), sin casillas, una sola vez por teléfono. Servidor FALSO.
const { test, expect } = require('@playwright/test');
const H = require('./ux1-helpers');

test('asesorado con enlace de invitación: ve la bienvenida primero, sin casillas; «Empezar» lleva a la aceptación; no se repite', async ({ browser }, testInfo) => {
  const ph = await H.phone(browser, testInfo);
  const { p, errors } = ph;
  await p.goto('index.html');
  await H.ready(p).catch(() => {});
  const code = await H.seedCoach(p, 'laura@coach.co', 'Laura Fit');
  await p.evaluate(() => localStorage.removeItem('perdida-grasa:coachBienvenida'));
  await p.goto(`index.html?c=${code}`);
  await expect(p.locator('#client-welcome')).toBeVisible();
  await expect(p.locator('#clw-title')).toHaveText('¡Hola! Te damos la bienvenida.');
  await expect(p.locator('#client-welcome li')).toHaveText(['Esta app es tu cuaderno del día.', 'Tú decides qué ve tu coach.', 'Ahora te explicamos tus permisos: es rápido.']);
  await expect(p.locator('#client-welcome input[type=checkbox]')).toHaveCount(0);
  expect(await p.locator('#client-welcome').innerText()).not.toMatch(/\bkg\b|kcal|\bcm\b|peso|ranking|perder|resultados?/i);
  await expect(p.locator('#solo')).toBeHidden();
  await expect(p.locator('#coach-welcome')).toBeHidden();
  await H.layout(p, '#client-welcome button');
  await p.locator('#btn-clw-start').click();
  await expect(p.locator('#client-welcome')).toBeHidden();
  await expect(p.locator('#solo')).toBeVisible();   // las autorizaciones siguen igual, sin marcar
  await expect(p.locator('#solo input[type=checkbox]:checked')).toHaveCount(0);
  await p.reload();
  await expect(p.locator('#client-welcome')).toBeHidden();   // una sola vez
  await expect(p.locator('#solo')).toBeVisible();
  expect(errors).toEqual([]);
});

test('el aviso del código de 6 números se lee claro en la pantalla del correo', async ({ browser }, testInfo) => {
  const { p } = await H.phone(browser, testInfo);
  await p.goto('index.html');
  await H.acceptSolo(p, { habits: true });
  await expect(p.locator('#acc-email-help')).toHaveText('Te enviamos un código de 6 números a tu correo. No necesitas contraseña.');
  expect(await p.locator('#acc-email-help').evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);
});

test('«Ir a la app» deja al asesorado en Inicio aunque estuviera en Más', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo);   // termina con «Ir a la app» ya pulsado
  await p.locator('#tab-mas').click();
  await p.evaluate(() => document.querySelector('#btn-acc-done').click());
  await expect(p.locator('#tab-panel')).toHaveClass(/\bon\b/);
  expect(errors).toEqual([]);
});
