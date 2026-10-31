// Piloto 2 · Resumen semanal («lo que lograste»). Reloj fijo: miércoles 21-oct-2026; se mueve al lunes 26-oct para ver la semana pasada. Servidor FALSO.
const { test, expect } = require('@playwright/test');
const H = require('./ux1-helpers');

test('resumen semanal: miércoles no se ofrece; el lunes muestra la semana pasada, «Entendido» lo oculta esa semana', async ({ browser, }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo);
  await H.seedState(p, { habits: { [H.iso(-2)]: { water: 2, trained: true }, [H.iso(-1)]: { sleep: 8 }, [H.iso(0)]: { steps: 9000 } } });  // lun 19, mar 20 y miér 21
  await expect(p.locator('#home-resumen')).toBeHidden();                      // miércoles: no se ofrece
  await p.clock.setFixedTime(new Date('2026-10-26T12:00:00-05:00'));          // lunes siguiente
  await p.reload(); await H.ready(p);
  await expect(p.locator('#home-resumen')).toBeVisible();
  await expect(p.locator('#res-title')).toHaveText('Lo que lograste la semana pasada');
  await expect(p.locator('#res-lines li').first()).toHaveText('3 de 7 días con registro');
  await expect(p.locator('#home-resumen')).toContainText('1 comodín usado');
  await expect(p.locator('#home-resumen')).toContainText('Semana constante');
  await expect(p.locator('#home-resumen')).not.toContainText(/\bkg\b|kcal|\bcm\b|peso|racha|perdiste/i);
  await p.locator('#res-ok').click();
  await expect(p.locator('#home-resumen')).toBeHidden();
  await p.reload(); await H.ready(p);
  await expect(p.locator('#home-resumen')).toBeHidden();
  expect(errors).toEqual([]);
});
