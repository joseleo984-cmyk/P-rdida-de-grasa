// Piloto 3 · Aviso al coach con guía de qué escribir (a los 7 días sin registrar). Solo lo ve el coach. Servidor FALSO, miércoles 21-oct-2026.
const { test, expect } = require('@playwright/test');
const H = require('./ux1-helpers');

const CLIENTS = [
  { email: 'ana@c.co', name: 'Ana Martínez', paidDays: 20, habitDays: [0, -1, -2].map((n) => H.hab(n)) },
  { email: 'beto@c.co', name: 'Beto Ruiz', paidDays: 3, habitDays: [H.hab(-4), H.hab(-5)] },
  { email: 'carla@c.co', name: 'Carla Soto', paidDays: -2, habitDays: [H.hab(-9)] },
];
const open = async (p, n) => { await p.locator('#coach-clients .cli-main', { hasText: n }).click(); await expect(p.locator('#coach-detail-title')).toHaveText(n); };
const back = (p) => p.locator('#btn-coach-back').click();

test('reenganche: a los 7+ días sin registrar la ficha sugiere qué hacer y un mensaje editable; se envía como nota; antes de 7 días no aparece', async ({ browser }, testInfo) => {
  const { p, errors } = await H.coachApp(browser, testInfo, CLIENTS);
  await p.locator('#tab-coach').click();
  await open(p, 'Ana Martínez');
  await expect(p.locator('#fc-reeng')).toBeHidden();          // hoy registró
  await back(p);
  await open(p, 'Beto Ruiz');
  await expect(p.locator('#fc-reeng')).toBeHidden();          // 4 días: aún no
  await back(p);
  await open(p, 'Carla Soto');
  await expect(p.locator('#fc-reeng')).toBeVisible();
  await expect(p.locator('#fc-reeng-head')).toHaveText('Carla lleva 9 días sin registrar');
  await expect(p.locator('#fc-reeng-action')).toContainText('mensaje corto y amable');
  await expect(p.locator('#fc-reeng-msg')).toHaveValue(/^Hola Carla, hace unos días no te veo por la app/);
  const visible = await p.locator('#fc-reeng').innerText();
  expect(visible).not.toMatch(/pag|cobr|\bkg\b|kcal|perdiste|fallaste|culpa/i);
  // El coach edita y envía: llega como nota del coach
  await p.locator('#fc-reeng-msg').fill('Hola Carla, ¿cómo vas? Aquí estoy para lo que necesites.');
  await p.locator('#btn-fc-reeng').click();
  await expect(p.locator('#fc-reeng-status')).toHaveText('Enviado como nota. Tu asesorado la verá en Inicio.');
  await expect.poll(async () => Object.values((await H.backend(p)).comments).map((c) => c.body)).toEqual(['Hola Carla, ¿cómo vas? Aquí estoy para lo que necesites.']);
  // Mensaje vacío no se envía
  await p.locator('#fc-reeng-msg').fill('   ');
  await p.locator('#btn-fc-reeng').click();
  await expect(p.locator('#fc-reeng-status')).toHaveText('Escribe un mensaje antes de enviar.');
  expect(errors).toEqual([]);
});
