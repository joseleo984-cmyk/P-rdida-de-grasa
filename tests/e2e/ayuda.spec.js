// Ayuda dentro de la app: FAQ por rol, buscador y botón de soporte. Producto 'coach', servidor FALSO.
const { test, expect } = require('@playwright/test');
const H = require('./ux1-helpers');

test('asesorado: Más → Ayuda muestra sus preguntas, el buscador filtra y soporte abre WhatsApp con mensaje fijo', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo);
  await p.locator('#tab-mas').click();
  await p.locator('#row-ayuda').click();
  await expect(p.locator('#ayuda-role')).toHaveText('Preguntas para asesorados');
  await expect(p.locator('#ayuda-list details').first()).toBeVisible();
  const total = await p.locator('#ayuda-list details').count();
  expect(total).toBeGreaterThanOrEqual(12);
  await p.locator('#ayuda-q').fill('camara');
  await expect(p.locator('#ayuda-list details')).toHaveCount(1);
  await expect(p.locator('#ayuda-list summary')).toContainText('cámara');
  await p.locator('#ayuda-list summary').click();
  await expect(p.locator('#ayuda-list p')).toContainText('opcionales');
  await p.locator('#ayuda-q').fill('zzzxyz');
  await expect(p.locator('#ayuda-list details')).toHaveCount(0);
  await expect(p.locator('#ayuda-empty')).toBeVisible();
  await p.locator('#ayuda-q').fill('');
  await expect(p.locator('#ayuda-list details')).toHaveCount(total);
  await expect(p.locator('#ayuda-soporte')).toHaveAttribute('href', /^https:\/\/wa\.me\/573128876125\?text=/);
  await expect(p.locator('#ayuda-tel')).toHaveText('312 887 6125');
  expect(await p.locator('#view-ayuda').evaluate((e) => e.innerText)).not.toMatch(/\[HORARIO\]|próximamente/i);
  expect(errors).toEqual([]);
});

test('coach: ve las preguntas de coaches', async ({ browser }, testInfo) => {
  const { p, errors } = await H.coachApp(browser, testInfo, [{ email: 'ana@c.co', name: 'Ana Martínez', paidDays: 20, habitDays: [H.hab(0)] }]);
  await p.locator('#tab-mas').click();
  await p.locator('#row-ayuda').click();
  await expect(p.locator('#ayuda-role')).toHaveText('Preguntas para coaches');
  await p.locator('#ayuda-q').fill('deshacer');
  await expect(p.locator('#ayuda-list summary')).toContainText('Marqué «Pagó» por error');
  expect(errors).toEqual([]);
});
