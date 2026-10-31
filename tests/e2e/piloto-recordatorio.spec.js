// Piloto 1 · Recordatorio diario: aviso al abrir la app (sin push). Apagado por defecto, hora elegida, «Luego», desactivable. Servidor FALSO.
const { test, expect } = require('@playwright/test');
const H = require('./ux1-helpers');

test('recordatorio: apagado por defecto; al activarlo avisa pasada la hora; «Luego» lo pospone hoy; registrar o apagar lo quita', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo);
  await expect(p.locator('#home-rec')).toBeHidden();                 // viene apagado
  await p.locator('#tab-mas').click();
  await expect(p.locator('#rec-on')).not.toBeChecked();
  await expect(p.locator('#rec-card')).toContainText('No es una notificación');
  await p.locator('#rec-hour').selectOption('22');                   // hora aún no llegada (la prueba corre a las 12:00 en Bogotá)
  await p.locator('#rec-on').check();
  await p.locator('#tab-panel').click();
  await expect(p.locator('#home-rec')).toBeHidden();
  await p.locator('#tab-mas').click();
  await p.locator('#rec-hour').selectOption('7');                    // ya pasó
  await p.locator('#tab-panel').click();
  await expect(p.locator('#home-rec')).toBeVisible();
  await expect(p.locator('#rec-aviso-text')).toHaveText('Cuando quieras: registra tu día. Un toque en «Agua» ya cuenta.');
  await expect(p.locator('#home-rec')).not.toContainText(/perder|racha|fallaste|kg|kcal/i);
  // «Luego»: no vuelve hoy, ni al recargar
  await p.locator('#rec-luego').click();
  await expect(p.locator('#home-rec')).toBeHidden();
  await p.reload(); await H.ready(p);
  await expect(p.locator('#home-rec')).toBeHidden();
  // la configuración sobrevive a recargar y se puede apagar
  await p.locator('#tab-mas').click();
  await expect(p.locator('#rec-on')).toBeChecked();
  await expect(p.locator('#rec-hour')).toHaveValue('7');
  await p.locator('#rec-on').uncheck();
  await p.locator('#rec-on').check();                                // cambiar la config borra el «Luego»
  await p.locator('#tab-panel').click();
  await expect(p.locator('#home-rec')).toBeVisible();
  // al registrar el día, el aviso se va
  await p.locator('#dia-agua').click();
  await expect(p.locator('#home-rec')).toBeHidden();
  expect(errors).toEqual([]);
});
