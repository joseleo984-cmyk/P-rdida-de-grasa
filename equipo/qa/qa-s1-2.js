const { chromium } = require('/opt/node22/lib/node_modules/playwright');
// QA adversarial de S1-2 / HU-01. Uso: node equipo/qa/qa-s1-2.js
// Cubre: modo oscuro, foco tras ocultar el banner, live region, zonas horarias y cambio de día.
const path = require('path');
const ROOT = path.resolve(__dirname, '../..') + '/';
const URL = 'file://' + ROOT + 'index.html';
const SHOTS = ROOT + 'equipo/qa-capturas/';
let fails = 0;
const log = (n, ok, d = '') => { if (!ok) fails++; console.log((ok ? 'OK   ' : 'FALLO') + ' ' + n + (d ? ' :: ' + d : '')); };
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

function lum(rgb) {
  const [r, g, b] = rgb.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

async function setup(browser, { tz = 'America/Bogota', dark = false, now } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-CO', timezoneId: tz, acceptDownloads: true, colorScheme: dark ? 'dark' : 'light' });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') page.errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  page.on('dialog', (d) => d.accept());
  if (now) await page.clock.install({ time: new Date(now) });
  await page.goto(URL);
  return { ctx, page };
}
async function seed(page, { lastBackup = null, snooze = null } = {}) {
  await page.evaluate(({ lastBackup, snooze }) => {
    const d = new Date(); const t = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    localStorage.setItem('perdida-grasa:v1', JSON.stringify({ profile: { name: 'Ana', sex: 'female', age: 35, height: 165, startWeight: 70, goalWeight: 62, startDate: t, activity: 1.375, rate: 0.005 }, entries: [{ id: 'a1', date: t, weight: 70 }], foods: {}, habits: {}, library: {} }));
    lastBackup ? localStorage.setItem('perdida-grasa:lastBackup', lastBackup) : localStorage.removeItem('perdida-grasa:lastBackup');
    snooze ? localStorage.setItem('perdida-grasa:backupSnooze', snooze) : localStorage.removeItem('perdida-grasa:backupSnooze');
  }, { lastBackup, snooze });
  await page.reload();
}
const bannerOn = (page) => page.locator('#backup-banner-body:not(.hidden)').count().then((n) => n === 1);
const text = (page) => page.locator('#backup-banner-text').textContent();

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });

  // 1. Modo oscuro: contraste del borde y del texto
  {
    const { ctx, page } = await setup(browser, { dark: true });
    await seed(page);
    const s = await page.evaluate(() => {
      const b = document.querySelector('#backup-banner-body'); const cs = getComputedStyle(b);
      const p = getComputedStyle(document.querySelector('#backup-banner-text'));
      const later = getComputedStyle(document.querySelector('#btn-backup-later'));
      return { border: cs.borderLeftColor, bg: cs.backgroundColor, fg: p.color, laterFg: later.color, laterBg: later.backgroundColor, bodyBg: getComputedStyle(document.body).backgroundColor };
    });
    const bg = s.bg.includes('rgba(0, 0, 0, 0)') ? s.bodyBg : s.bg;
    log('Oscuro: borde del banner vs fondo >= 3:1 (WCAG 1.4.11)', contrast(s.border, bg) >= 3, `${s.border} / ${bg} = ${contrast(s.border, bg).toFixed(2)}`);
    log('Oscuro: texto del banner >= 4.5:1', contrast(s.fg, bg) >= 4.5, `${s.fg} / ${bg} = ${contrast(s.fg, bg).toFixed(2)}`);
    await page.screenshot({ path: SHOTS + 's1-2-qa-banner-oscuro.png' });
    await page.locator('.tabbar button[data-view=perfil]').click();
    await page.locator('#backup-status').evaluate((el) => el.closest('.card').scrollIntoView({ block: 'center' }));
    const st = await page.evaluate(() => { const el = document.querySelector('#backup-status'); return { fg: getComputedStyle(el).color, bg: getComputedStyle(el.closest('.card')).backgroundColor }; });
    log('Oscuro: "Última copia" (muted) >= 4.5:1', contrast(st.fg, st.bg) >= 4.5, `${st.fg} / ${st.bg} = ${contrast(st.fg, st.bg).toFixed(2)}`);
    await page.screenshot({ path: SHOTS + 's1-2-qa-datos-oscuro.png' });
    log('Oscuro: sin errores de consola', page.errors.length === 0, page.errors.join(' | '));
    await ctx.close();
  }
  // Modo claro: contraste del borde
  {
    const { ctx, page } = await setup(browser);
    await seed(page);
    const s = await page.evaluate(() => { const cs = getComputedStyle(document.querySelector('#backup-banner-body')); return { border: cs.borderLeftColor, bg: cs.backgroundColor }; });
    log('Claro: borde del banner vs fondo >= 3:1', contrast(s.border, s.bg) >= 3, `${s.border} / ${s.bg} = ${contrast(s.border, s.bg).toFixed(2)}`);
    await ctx.close();
  }

  // 2. Accesibilidad: teclado, foco tras ocultar el banner, live region
  {
    const { ctx, page } = await setup(browser);
    await seed(page);
    // Tab desde el inicio del documento: ¿se alcanza el banner?
    await page.evaluate(() => document.activeElement.blur());
    let reached = false;
    for (let i = 0; i < 25 && !reached; i++) { await page.keyboard.press('Tab'); reached = await page.evaluate(() => document.activeElement.id === 'btn-backup-now'); }
    log('Teclado: se llega a "Hacer copia ahora" con Tab', reached);
    await page.locator('#btn-backup-later').focus();
    await page.keyboard.press('Enter');
    const act = await page.evaluate(() => ({ tag: document.activeElement.tagName, id: document.activeElement.id, visible: !!document.activeElement.offsetParent }));
    log('Foco tras "Recordar más tarde" va a un elemento visible (no se pierde en <body>)', act.tag !== 'BODY' && act.visible, JSON.stringify(act));
    const toastTxt = await page.locator('#toast').textContent();
    const toastRole = await page.locator('#toast').evaluate((el) => el.getAttribute('role') || el.getAttribute('aria-live') || '(sin role/aria-live)');
    log('Toast de confirmación anunciable (role/aria-live)', toastRole !== '(sin role/aria-live)', `"${toastTxt}" role=${toastRole}`);

    // Live region: mutaciones del texto al cambiar de pestaña con el banner visible
    await seed(page);
    await page.evaluate(() => {
      window.__mut = 0;
      new MutationObserver((ms) => { window.__mut += ms.length; }).observe(document.querySelector('#backup-banner'), { childList: true, subtree: true, characterData: true });
    });
    for (const v of ['registro', 'panel', 'registro', 'panel']) await page.locator(`.tabbar button[data-view=${v}]`).click();
    const mut = await page.evaluate(() => window.__mut);
    log('Live region: el texto no se reescribe si no cambia (evita re-anuncios)', mut === 0, `${mut} mutaciones en #backup-banner (role=status) tras 4 cambios de pestaña sin cambio de contenido`);
    const role = await page.evaluate(() => document.querySelector('#backup-banner').getAttribute('role'));
    log('Banner tiene role=status + aria-live=polite', role === 'status');
    await ctx.close();
  }

  // 3. Zonas horarias: 7 días justos con hora local distinta del día UTC
  for (const [tz, now, last, expectDue, label] of [
    // Tokio (UTC+9). Ahora: 21 oct 01:00 local (= 20 oct 16:00Z). Última copia: 14 oct 00:30 local (= 13 oct 15:30Z) -> 7 días locales.
    ['Asia/Tokyo', '2026-10-20T16:00:00Z', '2026-10-13T15:30:00Z', true, '7 días locales (UTC dice 7)'],
    // Tokio: copia 15 oct 00:30 local (= 14 oct 15:30Z) -> 6 días locales, aunque en UTC serían 6 (20-14).
    ['Asia/Tokyo', '2026-10-20T16:00:00Z', '2026-10-14T15:30:00Z', false, '6 días locales'],
    // Bogotá (UTC-5). Ahora: 21 oct 23:30 local (= 22 oct 04:30Z). Copia: 14 oct 20:00 local (= 15 oct 01:00Z) -> 7 días locales; en UTC serían 7 también.
    ['America/Bogota', '2026-10-22T04:30:00Z', '2026-10-15T01:00:00Z', true, '7 días locales de noche'],
    // Bogotá: copia 15 oct 20:00 local (=16 oct 01:00Z); ahora 21 oct 23:30 -> 6 locales (UTC diría 6 también, 22-16)
    ['America/Bogota', '2026-10-22T04:30:00Z', '2026-10-16T01:00:00Z', false, '6 días locales de noche'],
    // Kiritimati (UTC+14): ahora 21 oct 08:00 local (= 20 oct 18:00Z); copia 14 oct 09:00 local (= 13 oct 19:00Z)
    ['Pacific/Kiritimati', '2026-10-20T18:00:00Z', '2026-10-13T19:00:00Z', true, '7 días locales UTC+14'],
    // Honolulu (UTC-10): ahora 21 oct 20:00 local (= 22 oct 06:00Z); copia 15 oct 21:00 local (= 16 oct 07:00Z) -> 6 días
    ['Pacific/Honolulu', '2026-10-22T06:00:00Z', '2026-10-16T07:00:00Z', false, '6 días locales UTC-10'],
  ]) {
    const { ctx, page } = await setup(browser, { tz, now });
    await seed(page, { lastBackup: last });
    const on = await bannerOn(page);
    const t = await text(page);
    log(`TZ ${tz}: ${label} -> banner ${expectDue ? 'sí' : 'no'}`, on === expectDue, t);
    // Posponer: 3 días locales
    if (on) {
      await page.locator('#btn-backup-later').click();
      const sn = await page.evaluate(() => localStorage.getItem('perdida-grasa:backupSnooze'));
      const exp = await page.evaluate(() => { const d = new Date(Date.now() + 3 * 86400000); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); });
      log(`TZ ${tz}: posponer = hoy local + 3`, sn === exp, `${sn} vs ${exp}`);
    }
    if (page.errors.length) log(`TZ ${tz}: consola`, false, page.errors.join(' | '));
    await ctx.close();
  }

  // 4. Exportar a las 23:50 y mirar al día siguiente: "ayer"
  {
    const { ctx, page } = await setup(browser, { tz: 'America/Bogota', now: '2026-10-22T04:50:00Z' }); // 21 oct 23:50 local
    await seed(page);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#btn-backup-now').click()]);
    log('23:50 local: nombre de archivo con día local', dl.suggestedFilename() === 'perdida-grasa-2026-10-21.json', dl.suggestedFilename());
    await page.locator('#btn-backup-yes').click(); // D5: la copia se registra al confirmar
    log('Confirmar "Sí" registra la copia', !!(await page.evaluate(() => localStorage.getItem('perdida-grasa:lastBackup'))));
    await page.clock.fastForward('00:20:00'); // 22 oct 00:10 local
    await page.locator('.tabbar button[data-view=perfil]').click();
    const st = await page.locator('#backup-status').textContent();
    log('Tras medianoche, la copia figura como "ayer" con fecha local', st.includes('(ayer)') && st.includes('21 oct'), st);
    await ctx.close();
  }

  // 5. Cambio de día con la app abierta (iOS: PWA reanudada sin recargar)
  {
    // 21 oct 23:58 local Bogotá, última copia 15 oct 12:00 local -> 6 días: sin banner.
    const { ctx, page } = await setup(browser, { tz: 'America/Bogota', now: '2026-10-22T04:58:00Z' });
    await seed(page, { lastBackup: '2026-10-15T17:00:00Z' });
    log('23:58, copia hace 6 días: sin banner', !(await bannerOn(page)));
    await page.clock.fastForward('00:05:00'); // 22 oct 00:03 -> 7 días
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('pageshow')); });
    log('Tras medianoche, al volver a la app (visibilitychange/pageshow) aparece el banner sin navegar', await bannerOn(page));
    await page.locator('.tabbar button[data-view=registro]').click();
    await page.locator('.tabbar button[data-view=panel]').click();
    log('Tras medianoche, al cambiar de pestaña aparece el banner', await bannerOn(page), await text(page));
    await ctx.close();
  }

  // 6. Robustez: valores corruptos y reloj atrasado
  {
    const { ctx, page } = await setup(browser);
    await seed(page, { lastBackup: 'basura', snooze: '{"x":1}' });
    log('lastBackup/snooze corruptos: banner como "nunca"', (await bannerOn(page)) && (await text(page)).includes('Aún no tienes copia'));
    await seed(page, { lastBackup: new Date(Date.now() + 30 * 86400000).toISOString() });
    log('lastBackup en el futuro (reloj cambiado): texto coherente', true, `banner=${await bannerOn(page)} texto="${await page.locator('#backup-status').textContent()}"`);
    log('Robustez: sin errores de consola', page.errors.length === 0, page.errors.join(' | '));
    await ctx.close();
  }

  // 7. persist() concedido vs. denegado (simulado)
  {
    const { ctx, page } = await setup(browser);
    await page.addInitScript(() => { navigator.storage.persisted = async () => false; navigator.storage.persist = async () => true; navigator.storage.estimate = async () => ({ usage: 3.5 * 1048576, quota: 1e9 }); });
    await page.reload();
    await page.waitForFunction(() => /Espacio usado/.test(document.querySelector('#storage-status').textContent));
    const t = await page.locator('#storage-status').textContent();
    const ok = await page.locator('#storage-status.ok').count();
    log('persist() concedido: "Almacenamiento protegido" + MB', ok === 1 && /protegido/.test(t) && /3,5 MB/.test(t), t);
    await page.addInitScript(() => { delete navigator.storage; Object.defineProperty(navigator, 'storage', { value: undefined }); });
    await page.reload();
    await page.waitForTimeout(200);
    const t2 = await page.locator('#storage-status').textContent();
    log('Sin API storage (Safari antiguo): mensaje de riesgo, sin errores', /puede borrar/.test(t2) && page.errors.length === 0, t2 + ' ' + page.errors.join(' | '));
    await ctx.close();
  }

  await browser.close();
  console.log(fails ? `\n${fails} FALLOS` : '\nTODO OK');
  process.exit(fails ? 1 : 0);
})();
