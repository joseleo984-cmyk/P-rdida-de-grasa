// E2E de S1-3 / HU-02 (repetir comidas). Uso: node equipo/qa/run-s1-3.js [URL base] [carpeta capturas]
// Reloj fijado en Bogotá a las 23:50 del 21-oct-2026 (en UTC ya es 22-oct) y luego cruza la medianoche.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { conConsentimiento } = require('./legal-helper.js');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const BASE = process.argv[2] || 'file://' + ROOT + '/';
const SHOTS = process.argv[3] || path.join(ROOT, 'equipo/qa-capturas');
let fails = 0;
const log = (n, ok, d = '') => { if (!ok) fails++; console.log((ok ? 'OK   ' : 'FALLO') + ' ' + n + (d ? ' :: ' + d : '')); };

const D19 = '2026-10-19', D20 = '2026-10-20', D21 = '2026-10-21', D22 = '2026-10-22';
const XSS = '<img src=x onerror="window.__xss=1">';
const seed = {
  schemaVersion: 2,
  profile: { name: 'Ana', sex: 'female', age: 35, height: 165, startWeight: 70, goalWeight: 62, startDate: D19, activity: 1.375, rate: 0.005 },
  entries: [{ id: 'e1', date: D19, weight: 70 }],
  foods: {
    [D20]: [
      { id: 'f1', name: 'Avena', meal: 'Desayuno', kcal: 300, protein: 10, carbs: 50, fat: 6 },
      { id: 'f2', name: 'Pollo', meal: 'Almuerzo', kcal: 450, protein: 40, carbs: 0, fat: 10 },
      { id: 'f3', name: XSS, meal: 'Cena', kcal: 200, protein: 5, carbs: 20, fat: 8 },
    ],
  },
  habits: {}, library: {},
};

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-CO', timezoneId: 'America/Bogota' });
  await conConsentimiento(ctx); // LEGAL-01: usuario que ya aceptó (ver legal-helper.js)
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date('2026-10-21T23:50:00-05:00') });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const dialogs = [];
  let answer = true;
  page.on('dialog', (d) => { dialogs.push(d.message()); answer ? d.accept() : d.dismiss(); });
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('perdida-grasa:v1')).foods);
  const toast = () => page.locator('#toast').textContent();
  const names = (list) => (list || []).map((x) => x.name).join(',');

  await page.goto(BASE + 'index.html');
  await page.evaluate((s) => localStorage.setItem('perdida-grasa:v1', JSON.stringify(s)), seed);
  await page.reload();
  await page.click('#tab-comidas');

  // 1. Día local de Bogotá, no UTC
  log('Fecha del diario = día local de Bogotá (21), no UTC (22)', (await page.inputValue('#food-date')) === D21, await page.inputValue('#food-date'));
  log('Botón "Copiar de ayer" visible en hoy', (await page.locator('#btn-copy-prev').innerText()).trim() === 'Copiar de ayer');
  // Decisión SM (D1 de QA): en hoy, cada bloque vacío que ayer tenía ofrece "Repetir <bloque> de ayer".
  log('En hoy: "Repetir <bloque> de ayer" por cada bloque de ayer (3)', (await page.locator(`[data-repeat-meal][data-from="${D20}"]`).count()) === 3
    && (await page.locator('[data-repeat-meal="Desayuno"]').innerText()).trim() === 'Repetir desayuno de ayer');

  // 2. Copiar de ayer con el día vacío: sin confirmación
  await page.click('#btn-copy-prev');
  let f = await stored();
  log('Copia 3 alimentos de ayer sin pedir confirmación (día vacío)', f[D21]?.length === 3 && dialogs.length === 0, names(f[D21]));
  log('Toast con el número copiado', (await toast()).includes('Se copiaron 3 alimentos a hoy'), await toast());
  const srcIds = new Set(f[D20].map((x) => x.id));
  log('Ids nuevos, únicos y distintos del origen', f[D21].every((x) => !srcIds.has(x.id)) && new Set(f[D21].map((x) => x.id)).size === 3);
  log('Origen intacto', names(f[D20]) === names(seed.foods[D20]) && f[D20].map((x) => x.id).join() === 'f1,f2,f3');
  log('Totales del día recalculados (950 kcal)', (await page.locator('#day-macros').innerText()).includes('950'));
  log('Nombre malicioso copiado y mostrado como texto, sin ejecutarse', (await page.locator('#food-list').innerText()).includes(XSS) && !(await page.evaluate(() => window.__xss)));
  await page.screenshot({ path: SHOTS + '/s1-3-copiado-de-ayer.png', fullPage: false });

  // 3. Día con comidas: confirmación; cancelar no cambia nada; aceptar suma (no reemplaza)
  answer = false;
  await page.click('#btn-copy-prev');
  f = await stored();
  log('Con comidas pide confirmación y al cancelar no cambia nada', dialogs.length === 1 && /ya tiene comidas/.test(dialogs[0]) && f[D21].length === 3, dialogs[0]);
  answer = true;
  await page.click('#btn-copy-prev');
  f = await stored();
  log('Al aceptar suma (6) sin reemplazar y sin ids repetidos', f[D21].length === 6 && new Set(Object.values(f).flat().map((x) => x.id)).size === 9);

  // 4. Origen vacío: aviso y nada
  await page.fill('#food-date', D19);
  const before = JSON.stringify(await stored());
  await page.click('#btn-copy-prev');
  log('Origen vacío: aviso y sin cambios', (await toast()).includes('no se copió nada') && JSON.stringify(await stored()) === before, await toast());
  log('Otro día: texto "Copiar del día anterior"', (await page.locator('#btn-copy-prev').innerText()).trim() === 'Copiar del día anterior');

  // 5. Cruce de medianoche en Bogotá: "Repetir hoy" debe ir al 22
  await page.clock.fastForward('15:00');
  log('Pasada la medianoche, hoy es 22 en Bogotá', (await page.evaluate(() => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }))) === D22);
  await page.fill('#food-date', D20);
  const reps = page.locator('[data-repeat-meal]');
  log('Día pasado: un "Repetir hoy" por bloque (3)', (await reps.count()) === 3);
  log('Botón con nombre accesible', (await page.locator('[data-repeat-meal="Almuerzo"]').getAttribute('aria-label')) === 'Repetir Almuerzo hoy');
  // Foco visible con teclado
  await page.keyboard.press('Tab');
  await page.locator('[data-repeat-meal="Almuerzo"]').focus();
  const fv = await page.evaluate(() => ({ fv: document.activeElement.matches(':focus-visible'), o: getComputedStyle(document.activeElement).outlineStyle }));
  log('Foco visible en "Repetir hoy"', fv.fv && fv.o !== 'none', JSON.stringify(fv));
  await page.screenshot({ path: SHOTS + '/s1-3-repetir-bloque.png', fullPage: false });
  await page.keyboard.press('Enter');
  f = await stored();
  log('Repetir Almuerzo copia solo ese bloque al 22 (no al 21)', names(f[D22]) === 'Pollo' && f[D21].length === 6, names(f[D22]));
  log('Toast del bloque', (await toast()).includes('Se copió 1 alimento a hoy'), await toast());

  // 6. Persistencia tras recargar y layout
  await page.reload();
  await page.click('#tab-comidas');
  f = await stored();
  log('Tras recargar el diario abre en el 22 con la copia', (await page.inputValue('#food-date')) === D22 && (await page.locator('#food-list').innerText()).includes('Pollo'));
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  log('Sin scroll horizontal a 390px', sw <= 390, 'scrollWidth=' + sw);
  await page.fill('#food-date', D21);
  const sw2 = await page.evaluate(() => document.documentElement.scrollWidth);
  log('Sin scroll horizontal con 6 alimentos y botones', sw2 <= 390, 'scrollWidth=' + sw2);
  log('Sin errores ni avisos de consola', errors.length === 0, errors.join(' | '));

  await browser.close();
  console.log(fails ? `\n${fails} FALLO(S)` : '\nTODO OK');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
