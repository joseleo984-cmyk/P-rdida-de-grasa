// Pedido adicional · bienvenida del coach (una vez, sin casillas) e inicio con resumen. Servidor FALSO, miércoles 21-oct-2026.
const { test, expect } = require('@playwright/test');
const H = require('./ux1-helpers');

test('coach: bienvenida una sola vez y resumen «Hoy, escríbele a N personas» sin peso ni fotos', async ({ browser }, testInfo) => {
  const days = (offs) => offs.map((n) => H.hab(n));
  const CLIENTS = [
    { email: 'ana@c.co', name: 'Ana Martínez', paidDays: 20, habitDays: days([-6, -5, -4, -3, -2, -1, 0]) },
    { email: 'beto@c.co', name: 'Beto Ruiz', paidDays: 20, habitDays: days([-9, -8, -7, -4]) },
    { email: 'carla@c.co', name: 'Carla Soto', paidDays: 20, habitDays: days([-12]) },
  ];
  const { p, errors } = await H.coachApp(browser, testInfo, CLIENTS);
  await p.evaluate(() => localStorage.removeItem('perdida-grasa:coachBienvenida'));
  await p.reload(); await H.ready(p);
  await p.locator('#tab-coach').click();
  // Bienvenida: sin casillas, la lista aún no se ve
  await expect(p.locator('#coach-welcome')).toBeVisible();
  await expect(p.locator('#cw-title')).toHaveText('Bienvenido, coach.');
  await expect(p.locator('#coach-welcome input[type=checkbox]')).toHaveCount(0);
  await expect(p.locator('#coach-list-view')).toBeHidden();
  await p.locator('#btn-cw-start').click();
  await expect(p.locator('#coach-welcome')).toBeHidden();
  await expect(p.locator('#coach-list-view')).toBeVisible();
  // Inicio con resumen
  await expect(p.locator('#coach-inicio')).toBeVisible();
  await expect(p.locator('#ci-hoy')).toHaveText('Hoy, escríbele a 2 personas');
  await expect(p.locator('#ci-n-const')).toHaveText('1');
  await expect(p.locator('#ci-n-apaga')).toHaveText('1');
  await expect(p.locator('#ci-n-sin')).toHaveText('1');
  const rows = p.locator('#ci-list li');
  await expect(rows.first()).toContainText('Carla Soto');
  await expect(rows.first().getByRole('button', { name: /Escribirle/ })).toBeVisible();
  await expect(rows.last()).toContainText('Ana Martínez');
  await expect(rows.last().getByRole('button', { name: /Felicitar/ })).toBeVisible();
  expect(await p.locator('#coach-inicio').innerText()).not.toMatch(/\bkg\b|kcal|\bcm\b|peso|foto|perdiste/i);
  // «Escribirle» abre la ficha
  await rows.first().getByRole('button', { name: /Escribirle/ }).click();
  await expect(p.locator('#coach-detail-view')).toBeVisible();
  // La bienvenida no vuelve
  await p.reload(); await H.ready(p);
  await p.locator('#tab-coach').click();
  await expect(p.locator('#coach-welcome')).toBeHidden();
  await expect(p.locator('#coach-list-view')).toBeVisible();
  expect(errors).toEqual([]);
});
