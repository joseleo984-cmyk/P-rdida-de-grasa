// E2E de S1-1 (esquema + importación segura). Uso: node equipo/qa/run-s1-1.js [URL base] [carpeta capturas]
// Por defecto abre la app con file:// y guarda capturas en equipo/qa-capturas/.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { conConsentimiento } = require('./legal-helper.js');
const CURRENT = require('../../schema.js').CURRENT_VERSION;
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const BASE = process.argv[2] || 'file://' + ROOT + '/';
const SHOTS = process.argv[3] || path.join(ROOT, 'equipo/qa-capturas');
const results = [];
const log = (name, ok, detail = '') => { results.push(ok); console.log((ok ? 'OK   ' : 'FALLO') + ' ' + name + (detail ? ' :: ' + detail : '')); };
const iso = (n = 0) => new Date(Date.now() - n * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

async function newPage(browser, init) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CO', timezoneId: 'America/Bogota' });
  await conConsentimiento(ctx); // LEGAL-01: usuario que ya aceptó (ver legal-helper.js)
  if (init) await ctx.addInitScript(init.fn, init.arg);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(BASE + 'index.html');
  return { ctx, page, errors };
}
const toastText = (page) => page.locator('#toast').textContent();
async function importJSON(page, obj) {
  const buffer = Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj));
  await page.setInputFiles('#file-import', { name: 'r.json', mimeType: 'application/json', buffer });
  await page.waitForTimeout(400);
  return toastText(page);
}
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('perdida-grasa:v1') || 'null'));
const photoCount = (page) => page.evaluate(() => Photos.all().then((x) => x.length));

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/backup-v1.json'), 'utf8'));

  { // Carga limpia + perfil inválido
    const { page, errors } = await newPage(browser);
    log('Carga sin errores y Schema disponible', errors.length === 0 && await page.evaluate(() => !!window.Schema), errors.join(' | '));
    const pf = page.locator('#form-profile');
    await pf.locator('[name=sex]').selectOption('female');
    await pf.locator('[name=age]').fill('35'); await pf.locator('[name=height]').fill('165');
    await pf.locator('[name=startWeight]').fill('70'); await pf.locator('[name=goalWeight]').fill('75');
    await pf.locator('button[type=submit]').click();
    const t = await toastText(page);
    log('BUG-04: perfil inválido no muta el estado', t.includes('meta') && (await page.locator('#plan').innerText()).includes('Guarda tu perfil'), t);

    // Respaldo v1 real con fotos
    log('Importa respaldo v1', (await importJSON(page, fixture)) === 'Datos importados');
    const s = await stored(page);
    log(`Guardado con schemaVersion ${CURRENT} y datos completos`, s.schemaVersion === CURRENT && s.entries.length === 3 && s.profile.name === 'Ana', JSON.stringify(s).slice(0, 80));
    log('Fotos importadas (2)', (await photoCount(page)) === 2);
    await page.click('#tab-registro');
    log('Historial muestra 3 registros y nota escapada', (await page.locator('#entries-table tbody tr').count()) === 3 && (await page.locator('#entries-table').innerText()).includes('<b>nota</b>'));
    await page.evaluate(() => (window.PGNav ? PGNav.show('fotos') : document.querySelector('#tab-fotos').click()));
    log('Galería con 2 miniaturas', (await page.locator('#gallery .thumb').count()) === 2);
    if (SHOTS) await page.screenshot({ path: SHOTS + '/s1-1-import-v1-fotos.png' });

    // Archivo irreconocible y fotos con formato inválido: no se toca nada
    const before = JSON.stringify(await stored(page));
    const t1 = await importJSON(page, { foo: 1 });
    const t2 = await importJSON(page, { entries: [], photos: { x: 1 } });
    const t3 = await importJSON(page, '{roto');
    log('Importación rechazada no cambia localStorage', before === JSON.stringify(await stored(page)), [t1, t2, t3].join(' | '));
    log('Importación rechazada no toca las fotos', (await photoCount(page)) === 2);
    if (SHOTS) { await page.evaluate(() => (window.PGNav ? PGNav.show('perfil', 'all') : document.querySelector('#tab-perfil').click())); await importJSON(page, { foo: 1 }); await page.screenshot({ path: SHOTS + '/s1-1-import-rechazado.png' }); }

    // Atomicidad: un fallo de IndexedDB revierte localStorage y conserva la galería
    await page.evaluate(() => { window.__orig = Photos.importAll; Photos.importAll = () => Promise.reject(new Error('fallo simulado')); });
    const t4 = await importJSON(page, { entries: [{ date: '2026-10-20', weight: 99 }], photos: [] });
    await page.evaluate(() => { Photos.importAll = window.__orig; });
    log('Fallo al escribir fotos: no se cambia nada', before === JSON.stringify(await stored(page)) && (await photoCount(page)) === 2, t4);
    log('Sin errores de consola en el flujo de importación', errors.length === 0, errors.join(' | '));
    await page.context().close();
  }

  { // BUG-01 + BUG-02 + BUG-03 por importación
    const { page, errors } = await newPage(browser);
    await importJSON(page, { entries: [{ weight: 80 }], foods: [], habits: null });
    await page.reload(); await page.waitForTimeout(300);
    log('BUG-01: JSON con estructura inválida no rompe la app tras recargar', errors.length === 0, errors.join(' | '));

    const evil = '"><img src=x onerror="window.__xss=1">';
    const t = await importJSON(page, {
      entries: [{ id: evil, date: iso(0), weight: 90 }],
      foods: { [iso(0)]: [{ id: evil, name: 'x', meal: 'Cena', kcal: '<img src=x onerror="window.__xss=2">' }, { id: evil, name: 'a', meal: 'Cena', kcal: '100' }, { id: 'b', name: 'b', meal: 'Cena', kcal: '200' }] },
      photos: [{ id: evil, date: iso(0), pose: '<img src=x onerror="window.__xss=3">', data: fixture.photos[0].data }],
    });
    for (const v of ['registro', 'comidas', 'fotos']) { await page.evaluate((v) => (window.PGNav && v === 'fotos' ? PGNav.show('fotos') : document.querySelector('#tab-' + v).click()), v); await page.waitForTimeout(150); }
    await page.reload(); await page.waitForTimeout(300);
    for (const v of ['registro', 'comidas', 'fotos']) { await page.evaluate((v) => (window.PGNav && (v === 'perfil' || v === 'fotos') ? PGNav.show(v, v === 'perfil' ? 'all' : undefined) : document.querySelector('#tab-' + v).click()), v); await page.waitForTimeout(150); }
    log('BUG-02: JSON malicioso no ejecuta JS (también tras recargar)', await page.evaluate(() => window.__xss === undefined), t);
    await page.click('#tab-comidas');
    const kcal = await page.locator('#day-macros').innerText();
    log('BUG-03: kcal como texto suman 300 (no "100200")', /\b300\b/.test(kcal) && !kcal.includes('100200'), kcal.split('\n')[1]);
    log('Sin errores de consola', errors.length === 0, errors.join(' | '));
    if (SHOTS) await page.screenshot({ path: SHOTS + '/s1-1-xss-kcal.png' });
    await page.context().close();
  }

  { // localStorage corrupto
    const bad = JSON.stringify({ entries: [{ weight: 80 }, { id: 'a1', date: iso(1), weight: '81' }], foods: null, habits: null, library: [] });
    const { page, errors } = await newPage(browser, { fn: (v) => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', 1); localStorage.setItem('perdida-grasa:v1', v); } }, arg: bad });
    await page.waitForTimeout(300);
    log('Estado guardado dañado: la app arranca y avisa', errors.length === 0 && (await toastText(page)).includes('corrigieron'), (await toastText(page)) + ' ' + errors.join(' | '));
    // LEGAL-01: legal-helper añade `consent` al leer; se compara todo lo demás.
    const bk = JSON.parse(await page.evaluate(() => localStorage.getItem('perdida-grasa:backup')) || 'null');
    if (bk) delete bk.consent;
    log('Se conserva copia cruda en perdida-grasa:backup', JSON.stringify(bk) === bad);
    await page.click('#tab-registro');
    log('El registro válido sobrevive', (await page.locator('#entries-table tbody tr').count()) === 1);
    await page.context().close();
  }
  {
    const { page, errors } = await newPage(browser, { fn: () => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', 1); localStorage.setItem('perdida-grasa:v1', '{{{basura'); } } });
    await page.waitForTimeout(300);
    log('Estado ilegible: arranca vacío, sin errores de página y con copia en :corrupto',
      !errors.some((e) => e.startsWith('pageerror')) && (await page.evaluate(() => localStorage.getItem('perdida-grasa:corrupto'))) === '{{{basura', await toastText(page));
    await page.context().close();
  }
  {
    const { page } = await newPage(browser, { fn: () => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', 1); localStorage.setItem('perdida-grasa:v1', JSON.stringify({ schemaVersion: 99, entries: [] })); } } });
    await page.waitForTimeout(300);
    // LEGAL-01: con datos de una versión más nueva no se puede leer el consentimiento → se pide; aceptar intenta guardar.
    log('Datos de versión más nueva: se pide el consentimiento', await page.locator('#consent').isVisible());
    for (const k of ['terms', 'privacy', 'sensitiveHealth', 'adult']) await page.locator(`#form-consent [name=${k}]`).check();
    await page.locator('#btn-consent').click();
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('perdida-grasa:v1')).schemaVersion);
    log('Datos de versión más nueva no se sobrescriben', kept === 99);
    await page.context().close();
  }
  { // D1: perfil heredado con meta >= inicio se conserva como borrador tras dos recargas
    const legacy = JSON.stringify({ ...fixture, photos: undefined, profile: { ...fixture.profile, startWeight: 70, goalWeight: 80 } });
    const { page, errors } = await newPage(browser, { fn: (v) => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', 1); localStorage.setItem('perdida-grasa:v1', v); } }, arg: legacy });
    await page.click('#tab-registro');
    await page.locator('#form-entry [name=date]').fill(iso(0));
    await page.locator('#form-entry [name=weight]').fill('70.2');
    await page.locator('#form-entry button[type=submit]').click();
    await page.reload(); await page.waitForTimeout(200);
    await page.reload(); await page.waitForTimeout(200);
    const start = await page.locator('#form-profile [name=startWeight]').inputValue();
    const issue = await page.locator('#profile-issue').innerText();
    log('D1: borrador de perfil precargado y motivo visible tras 2 recargas', start === '70' && /meta/.test(issue) && (await stored(page)).profile.goalWeight === 80, `start=${start} issue="${issue}"`);
    await page.locator('#form-profile [name=goalWeight]').fill('65');
    await page.locator('#form-profile button[type=submit]').click();
    log('D1: al corregirlo se guarda y desaparece el aviso', (await toastText(page)) === 'Perfil guardado' && await page.locator('#profile-issue').isHidden() && errors.length === 0, errors.join(' | '));

    // D2: sin espacio el aviso de error no lo tapa el de éxito y el cambio no queda solo en memoria
    await page.evaluate(() => { const o = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'perdida-grasa:v1') throw new DOMException('lleno', 'QuotaExceededError'); return o.call(this, k, v); }; });
    await page.locator('#form-profile [name=goalWeight]').fill('64');
    await page.locator('#form-profile button[type=submit]').click();
    const t = await toastText(page);
    log('D2: perfil sin espacio → toast de cuota y estado sin cambiar', t.startsWith('Almacenamiento lleno') && (await page.locator('#toast.error').count()) === 1 && (await stored(page)).profile.goalWeight === 65, t);
    await page.context().close();
  }
  await browser.close();
  const fails = results.filter((x) => !x).length;
  console.log(`\n${results.length - fails}/${results.length} OK`);
  process.exit(fails ? 1 : 0);
})();
