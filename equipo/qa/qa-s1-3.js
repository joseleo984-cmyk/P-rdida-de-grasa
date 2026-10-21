// QA adversarial de S1-3 (HU-02 repetir comidas) + re-verificación de S1-2 (D1-D5).
// Uso: node equipo/qa/qa-s1-3.js   (file://, 390x844 móvil, America/Bogota, reloj simulado)
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const URL = 'file://' + ROOT + '/index.html';
const results = [];
const log = (n, ok, d = '') => { results.push(ok); console.log((ok ? 'OK   ' : 'FALLO') + ' ' + n + (d ? ' :: ' + String(d).slice(0, 220) : '')); };

const D17 = '2026-10-17', D20 = '2026-10-20', D21 = '2026-10-21', D22 = '2026-10-22';
const food = (id, name, meal, kcal) => ({ id, name, meal, kcal, protein: 10, carbs: 10, fat: 5 });
const seed = {
  schemaVersion: 2,
  profile: { name: 'Ana', sex: 'female', age: 35, height: 165, startWeight: 70, goalWeight: 62, startDate: D17, activity: 1.375, rate: 0.005 },
  entries: Array.from({ length: 8 }, (_, i) => ({ id: 'e' + i, date: `2026-10-0${i + 1}`, weight: 70 - i * 0.1 })),
  foods: {
    [D17]: [food('a1', 'Huevos', 'Desayuno', 200), food('a2', 'Arroz', 'Almuerzo', 400), food('a3', 'Sopa', 'Cena', 300), food('a4', 'Fruta', 'Snack', 100)],
    [D20]: [food('b1', 'Avena', 'Desayuno', 300), food('b2', 'Pollo', 'Almuerzo', 450), { id: 'b3', name: '   ', meal: 'Cena', kcal: 50, protein: 0, carbs: 0, fat: 0 }],
  },
  habits: {}, library: {},
};

async function setup(browser, time) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-CO', timezoneId: 'America/Bogota', acceptDownloads: true });
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date(time) });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); d.accept(); });
  await page.goto(URL);
  await page.evaluate((s) => localStorage.setItem('perdida-grasa:v1', JSON.stringify(s)), seed);
  await page.reload();
  return { ctx, page, errors, dialogs };
}
const foods = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('perdida-grasa:v1')).foods);
const toast = (page) => page.locator('#toast').textContent();
const setDay = async (page, d) => { await page.fill('#food-date', d); await page.locator('#food-date').dispatchEvent('change'); };
const box = (page, sel) => page.locator(sel).first().boundingBox();

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

  // ===== HU-02 =====
  {
    const { page, errors, dialogs, ctx } = await setup(browser, '2026-10-21T12:00:00-05:00');
    await page.click('#tab-comidas');
    // C1. En HOY no se puede repetir solo un bloque de ayer (criterio "por cada bloque")
    log('C1: en hoy (vacío) no hay forma de repetir solo el Desayuno de ayer', (await page.locator('[data-repeat-meal]').count()) > 0,
      'botones de bloque en hoy=' + (await page.locator('[data-repeat-meal]').count()));

    // C2. Copiar un día ELEGIDO completo a hoy: cuántas interacciones
    await setDay(page, D17);
    const before = dialogs.length;
    let taps = 1; // cambiar fecha
    for (const m of ['Desayuno', 'Almuerzo', 'Cena', 'Snack']) { await page.click(`[data-repeat-meal="${m}"]`); taps++; await page.waitForTimeout(50); }
    const f = await foods(page);
    log('C2: copiar el día 17 completo a hoy copia los 4 bloques', (f[D21] || []).length === 4, `toques=${taps}, confirm()=${dialogs.length - before}`);
    log('C2: …pero exige ≥ 5 toques + 3 confirm() (métrica "1–2 toques")', taps + (dialogs.length - before) <= 2, `toques=${taps} + confirm=${dialogs.length - before}`);

    // C3. Foco tras "Repetir hoy": el botón se destruye al re-renderizar
    await page.keyboard.press('Shift+Tab'); // asegura modo teclado
    await page.locator('[data-repeat-meal="Desayuno"]').focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    const act = await page.evaluate(() => (document.activeElement && (document.activeElement.id || document.activeElement.tagName)));
    log('C3: tras "Repetir hoy" con teclado el foco no se pierde a <body>', act !== 'BODY', 'activeElement=' + act);

    // C4. Tamaño táctil
    const r = await box(page, '[data-repeat-meal]');
    const x = await box(page, '#food-list .icon-btn');
    const c = await box(page, '#btn-copy-prev');
    log('C4: "Repetir hoy" ≥ 32 px alto (pedido) y ≥ 24x24 (WCAG 2.5.8)', r.height >= 32 && r.width >= 24, `${Math.round(r.width)}x${Math.round(r.height)}`);
    log('C4b: ✕ eliminar alimento ≥ 24x24 (deshacer = tocar ✕ uno a uno)', x.height >= 24 && x.width >= 24, `${Math.round(x.width)}x${Math.round(x.height)}`);
    log('C4c: "Copiar de ayer" ≥ 44 px alto', c.height >= 44, `${Math.round(c.width)}x${Math.round(c.height)}`);

    // C5. Deshacer: copia accidental en día vacío (sin confirm) → cuántos toques para revertir
    await setDay(page, D22 === D22 ? D21 : D21);
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('perdida-grasa:v1')); delete s.foods['2026-10-21']; localStorage.setItem('perdida-grasa:v1', JSON.stringify(s)); });
    await page.reload(); await page.click('#tab-comidas');
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('perdida-grasa:v1')); return s; });
    const d0 = dialogs.length;
    await setDay(page, '2026-10-18'); // día 18 vacío → copia el 17 (4 alimentos) sin confirmar
    await page.click('#btn-copy-prev');
    const t5 = await toast(page);
    log('C5: copia accidental en día vacío se hace sin confirmación ni "Deshacer" en el toast', !(dialogs.length === d0 && !/deshacer/i.test(t5)), `confirm=${dialogs.length - d0} toast="${t5}"`);
    let n = 0;
    while (await page.locator('#food-list .icon-btn').count()) { await page.locator('#food-list .icon-btn').first().click(); n++; if (n > 10) break; }
    log('C5b: revertirla manualmente cuesta 1 toque por alimento', true, `toques=${n}`);

    // C6. Origen con alimento inválido heredado (BUG-07): el confirm anuncia más de los que se copian
    await setDay(page, D21);
    await page.locator('#form-food [name=name]').fill('Café'); await page.locator('#form-food [name=kcal]').fill('20');
    await page.locator('#form-food button[type=submit]').click();
    const d1 = dialogs.length;
    await page.click('#btn-copy-prev');
    const t6 = await toast(page);
    log('C6: confirm y toast coherentes con alimentos inválidos en origen', !dialogs[d1].includes('3 alimentos') || t6.includes('3 alimentos'),
      `confirm="${dialogs[d1]}" toast="${t6}"`);

    // C7. Doble toque rápido en "Copiar de ayer" sobre día vacío
    await setDay(page, '2026-10-19'); // vacío; origen 18 ya vacío → probar con el 18 relleno
    await setDay(page, '2026-10-18');
    const d2 = dialogs.length;
    await page.locator('#btn-copy-prev').dblclick();
    const f7 = (await foods(page))['2026-10-18'] || [];
    log('C7: doble toque no duplica sin aviso (el 2.º pide confirmación)', f7.length === 8 ? dialogs.length - d2 === 1 : f7.length === 4, `alimentos=${f7.length} confirm=${dialogs.length - d2}`);

    // C8. Sin scroll horizontal con nombres largos en cabecera de bloque
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    log('C8: sin scroll horizontal a 390 px', sw <= 390, 'scrollWidth=' + sw);
    log('C9: sin errores de consola', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // C10. Medianoche con la app abierta: el diario sigue en el día anterior
  {
    const { page, ctx } = await setup(browser, '2026-10-21T23:50:00-05:00');
    await page.click('#tab-comidas');
    await page.clock.fastForward('20:00');
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(100);
    const v = await page.inputValue('#food-date');
    const label = await page.locator('#btn-copy-prev').textContent();
    const reps = await page.locator('[data-repeat-meal]').count();
    log('C10: tras medianoche (app abierta) el diario pasa a hoy', v === D22, `food-date=${v}, botón="${label}", "Repetir hoy" visibles=${reps}`);
    await ctx.close();
  }

  // ===== Re-verificación S1-2 =====
  {
    const { page, errors, ctx } = await setup(browser, '2026-10-21T12:00:00-05:00');
    // R1. Barra de confirmación: Escape, solapes
    await page.click('#tab-perfil');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export')]);
    void dl;
    const vis = () => page.locator('#backup-confirm').isVisible();
    log('R1: la barra aparece y el foco va a "Sí"', (await vis()) && (await page.evaluate(() => document.activeElement.id)) === 'btn-backup-yes');
    await page.keyboard.press('Escape');
    log('R1b: Escape cierra la barra (= "No")', !(await vis()), 'sigue visible=' + (await vis()));
    const bar = await box(page, '#backup-confirm');
    const nav = await box(page, 'nav');
    log('R1c: la barra no tapa la barra de pestañas', bar && nav && bar.y + bar.height <= nav.y + 1, `bar.bottom=${bar && Math.round(bar.y + bar.height)} nav.top=${nav && Math.round(nav.y)}`);
    await page.click('#tab-panel');
    log('R1d: la barra sigue visible al cambiar de pestaña (no modal)', await vis());
    await page.click('#btn-backup-no');
    log('R1e: "No" no registra la copia', (await page.evaluate(() => localStorage.getItem('perdida-grasa:lastBackup'))) === null);

    // R2. visibilitychange → render(): ¿pisa lo que el usuario está escribiendo?
    await page.click('#tab-comidas');
    await page.fill('#form-habits [name=steps]', '12345');
    await page.fill('#form-food [name=name]', 'Pan integral');
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(100);
    const steps = await page.inputValue('#form-habits [name=steps]');
    const fname = await page.inputValue('#form-food [name=name]');
    log('R2: volver a la app no borra los hábitos sin guardar', steps === '12345', `steps="${steps}"`);
    log('R2b: volver a la app no borra el alimento a medio escribir', fname === 'Pan integral', `name="${fname}"`);
    log('R3: sin errores de consola (S1-2)', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  await browser.close();
  const fails = results.filter((x) => !x).length;
  console.log(`\n${results.length - fails}/${results.length} OK`);
  process.exit(fails ? 1 : 0);
})();
