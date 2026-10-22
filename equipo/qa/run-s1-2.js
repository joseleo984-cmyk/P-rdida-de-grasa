const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { conConsentimiento } = require('./legal-helper.js');
// E2E de S1-2 / HU-01 (recordatorio de copia). Uso: node equipo/qa/run-s1-2.js
const path = require('path');
const ROOT = path.resolve(__dirname, '../..') + '/';
const URL = 'file://' + ROOT + 'index.html';
const SHOTS = ROOT + 'equipo/qa-capturas/';
let fails = 0;
const log = (n, ok, d = '') => { if (!ok) fails++; console.log((ok ? 'OK   ' : 'FALLO') + ' ' + n + (d ? ' :: ' + d : '')); };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-CO', timezoneId: 'America/Bogota', acceptDownloads: true });
  await conConsentimiento(ctx); // LEGAL-01: usuario que ya aceptó (ver legal-helper.js)
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('dialog', (d) => d.accept());
  const banner = () => page.locator('#backup-banner-body:not(.hidden)').count();
  const ls = (k) => page.evaluate((k) => localStorage.getItem(k), k);

  await page.goto(URL);
  log('Sin datos: no hay banner', (await banner()) === 0);
  log('Estado de almacenamiento visible', /Almacenamiento protegido|puede borrar tus datos/.test(await page.locator('#storage-status').textContent()), await page.locator('#storage-status').textContent());

  const today = await page.evaluate(() => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); });
  await page.evaluate((d) => {
    localStorage.setItem('perdida-grasa:v1', JSON.stringify({ profile: { name: 'Ana', sex: 'female', age: 35, height: 165, startWeight: 70, goalWeight: 62, startDate: d, activity: 1.375, rate: 0.005 }, entries: [{ id: 'a1', date: d, weight: 70 }], foods: {}, habits: {}, library: {} }));
  }, today);
  await page.reload();
  log('Con datos y sin copia: banner visible', (await banner()) === 1);
  log('Banner con role=status', (await page.locator('#backup-banner[role=status]').count()) === 1);
  log('Texto del banner', (await page.locator('#backup-banner-text').textContent()).includes('Aún no tienes copia'));
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  log('Sin scroll horizontal a 390px', sw <= 390, 'scrollWidth=' + sw);
  await page.screenshot({ path: SHOTS + 's1-2-banner-panel.png' });

  // Foco visible en el botón del banner
  await page.locator('#btn-backup-now').focus();
  await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle + ' ' + document.activeElement.id);
  log('Foco visible en "Hacer copia ahora"', outline.startsWith('solid') && outline.includes('btn-backup-now'), outline);

  await page.locator('#btn-backup-later').click();
  log('"Recordar más tarde" oculta el banner', (await banner()) === 0);
  const snooze = await ls('perdida-grasa:backupSnooze');
  // Calculado en la zona horaria del navegador (America/Bogota), no la de Node.
  const plus3 = await page.evaluate(() => { const d = new Date(Date.now() + 3 * 86400000); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); });
  log('Pospone 3 días', snooze === plus3, snooze);
  await page.reload();
  log('Tras recargar sigue pospuesto', (await banner()) === 0);

  // 6 días -> no; 8 días -> sí
  await page.evaluate((d) => { localStorage.removeItem('perdida-grasa:backupSnooze'); localStorage.setItem('perdida-grasa:lastBackup', d); }, new Date(Date.now() - 6 * 86400000).toISOString());
  await page.reload();
  log('Copia hace 6 días: sin banner', (await banner()) === 0);
  await page.evaluate((d) => localStorage.setItem('perdida-grasa:lastBackup', d), new Date(Date.now() - 8 * 86400000).toISOString());
  await page.reload();
  log('Copia hace 8 días: banner', (await banner()) === 1 && (await page.locator('#backup-banner-text').textContent()).includes('hace 8 días'));

  // Exportar desde el banner
  const confirmOn = () => page.locator('#backup-confirm:not(.hidden)').count();
  const before = await ls('perdida-grasa:lastBackup');
  // D5: con "No" no se registra la copia
  let [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#btn-backup-now').click()]);
  log('"Hacer copia ahora" descarga el JSON', /perdida-grasa-.*\.json$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  log('Tras exportar se pregunta "¿Se guardó el archivo?" con foco en "Sí"', (await confirmOn()) === 1 && (await page.evaluate(() => document.activeElement.id)) === 'btn-backup-yes');
  log('Antes de confirmar no se registra la copia', (await ls('perdida-grasa:lastBackup')) === before);
  await page.locator('#btn-backup-no').click();
  log('"No": no registra la copia y el banner sigue', (await ls('perdida-grasa:lastBackup')) === before && (await banner()) === 1 && (await confirmOn()) === 0);
  log('"No": el foco vuelve a "Hacer copia ahora"', (await page.evaluate(() => document.activeElement.id)) === 'btn-backup-now');
  [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#btn-backup-now').click()]);
  await page.screenshot({ path: SHOTS + 's1-2-confirmacion.png' });
  await page.locator('#btn-backup-yes').click();
  const last = await ls('perdida-grasa:lastBackup');
  log('"Sí": exportar actualiza la fecha', last && Date.now() - Date.parse(last) < 60000, last);
  log('Tras confirmar el banner desaparece', (await banner()) === 0);
  const act = await page.evaluate(() => ({ id: document.activeElement.id, visible: !!document.activeElement.offsetParent }));
  log('Foco tras ocultar el banner va al resumen del panel', act.id === 'panel-summary' && act.visible, JSON.stringify(act));

  await page.evaluate(() => (window.PGNav ? PGNav.show('perfil', 'all') : document.querySelector('#tab-perfil').click()));
  await page.locator('#backup-status').scrollIntoViewIfNeeded();
  log('Datos muestra la última copia', (await page.locator('#backup-status').textContent()).includes('(hoy)'), await page.locator('#backup-status').textContent());
  const sw2 = await page.evaluate(() => document.documentElement.scrollWidth);
  log('Perfil sin scroll horizontal', sw2 <= 390, 'scrollWidth=' + sw2);
  await page.locator('#backup-status').evaluate((el) => el.closest('.card').scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: SHOTS + 's1-2-datos-estado.png' });

  log('Sin errores ni avisos de consola', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(fails ? `\n${fails} FALLOS` : '\nTODO OK');
  process.exit(fails ? 1 : 0);
})();
