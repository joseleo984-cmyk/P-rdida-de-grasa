const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const URL = 'http://127.0.0.1:8765/';
const SHOTS = '/home/user/P-rdida-de-grasa/equipo/qa-capturas/';
const OUT = '/tmp/claude-0/qa/';
const results = [];
const log = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log((ok ? 'OK   ' : 'FALLO') + ' ' + name + (detail ? ' :: ' + detail : '')); };

async function newPage(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-CO', timezoneId: 'America/Bogota', acceptDownloads: true, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('dialog', (d) => d.accept());
  return { ctx, page, errors };
}
const toast = (page) => page.locator('#toast').textContent();

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
  // ---------- Flujo principal ----------
  {
    const { ctx, page, errors } = await newPage(browser);
    await page.goto(URL);
    const perfilActive = await page.locator('#view-perfil.active').count();
    log('Arranque sin perfil abre vista Perfil', perfilActive === 1);
    await page.screenshot({ path: SHOTS + '01-inicio-sin-perfil.png', fullPage: false });

    // Meta inválida: debe rechazar
    const pf = page.locator('#form-profile');
    await pf.locator('[name=name]').fill('Ana QA');
    await pf.locator('[name=sex]').selectOption('female');
    await pf.locator('[name=age]').fill('35');
    await pf.locator('[name=height]').fill('165');
    await pf.locator('[name=startWeight]').fill('70');
    await pf.locator('[name=goalWeight]').fill('75');
    await pf.locator('button[type=submit]').click();
    log('Perfil: meta >= peso inicial rechazada (toast)', (await toast(page)).includes('meta debe ser menor'));
    const onboardingHidden = await page.locator('#onboarding.hidden').count();
    const planTxt = await page.locator('#plan').innerText();
    log('Perfil inválido NO debe quedar en memoria', onboardingHidden === 0 && planTxt.includes('Guarda tu perfil'), `onboarding oculto=${onboardingHidden === 1}; plan="${planTxt.slice(0, 60).replace(/\n/g, ' ')}"`);

    await pf.locator('[name=goalWeight]').fill('62');
    await pf.locator('[name=activity]').selectOption('1.375');
    await pf.locator('button[type=submit]').click();
    log('Perfil válido guardado', (await toast(page)).includes('Perfil guardado'));
    const plan = await page.locator('#plan').innerText();
    log('Plan calculado visible', /Objetivo diario[\s\S]*kcal/.test(plan), plan.replace(/\n/g, ' | ').slice(0, 200));
    await page.screenshot({ path: SHOTS + '02-perfil-plan.png', fullPage: true });

    // Registro
    await page.click('#tab-registro');
    const ef = page.locator('#form-entry');
    const femaleVisible = await page.locator('#form-entry label.female-only:not(.hidden)').count();
    log('Campo cadera visible para mujer', femaleVisible === 1);
    // vacío
    await ef.locator('button[type=submit]').click();
    log('Registro vacío rechazado', (await toast(page)).includes('al menos'));
    // fecha anterior
    const d = (n) => { const x = new Date(Date.now() - n * 86400000); return x.toISOString().slice(0, 10); };
    for (const [n, w] of [[6, 69.6], [4, 69.3], [2, 69.1], [0, 68.8]]) {
      await ef.locator('[name=date]').fill(d(n));
      await ef.locator('[name=weight]').fill(String(w));
      if (n === 0) { await ef.locator('[name=waist]').fill('80'); await ef.locator('[name=neck]').fill('33'); await ef.locator('[name=hip]').fill('100'); await ef.locator('[name=note]').fill('<b>nota</b> & "comillas"'); }
      await ef.locator('button[type=submit]').click();
    }
    const rows = await page.locator('#entries-table tbody tr').count();
    log('Registros de peso/medidas guardados', rows >= 5, `filas=${rows}`);
    const firstRow = await page.locator('#entries-table tbody tr').first().innerText();
    log('Nota escapada y % grasa Navy calculado', firstRow.includes('<b>nota</b>') && /%/.test(firstRow), firstRow.replace(/\s+/g, ' '));
    // número fuera de rango -> validación nativa
    await ef.locator('[name=weight]').fill('5');
    await ef.locator('button[type=submit]').click();
    const invalid = await ef.locator('[name=weight]').evaluate((e) => !e.validity.valid);
    log('Peso fuera de rango bloqueado por validación HTML', invalid);
    await ef.locator('[name=weight]').fill('');
    await page.screenshot({ path: SHOTS + '03-registro.png', fullPage: true });

    // Comidas
    await page.click('#tab-comidas');
    const ff = page.locator('#form-food');
    await ff.locator('[name=name]').fill('Pechuga de pollo 150 g');
    await ff.locator('[name=kcal]').fill('250');
    await ff.locator('[name=protein]').fill('46');
    await ff.locator('[name=fat]').fill('5');
    await ff.locator('button[type=submit]').click();
    await ff.locator('[name=name]').fill('<img src=x onerror=alert(1)>');
    await ff.locator('[name=kcal]').fill('100');
    await ff.locator('button[type=submit]').click();
    const foods = await page.locator('#food-list .food-row').count();
    const injected = await page.locator('#food-list img').count();
    log('Añadir comida (2 alimentos) y nombre con HTML escapado', foods === 2 && injected === 0, `filas=${foods} img inyectadas=${injected}`);
    // autocompletar desde biblioteca
    await ff.locator('[name=name]').fill('pechuga de pollo 150 g');
    await ff.locator('[name=name]').dispatchEvent('change');
    log('Autocompletar macros desde biblioteca', (await ff.locator('[name=kcal]').inputValue()) === '250');
    await ff.locator('[name=name]').fill('   ');
    await ff.locator('[name=kcal]').fill('50');
    await ff.locator('button[type=submit]').click();
    const blankRows = await page.locator('#food-list .food-row span:first-child').allInnerTexts();
    log('Nombre de alimento solo con espacios rechazado', !blankRows.some((t) => t.trim() === ''), JSON.stringify(blankRows));
    // borrar alimento
    const before = await page.locator('#food-list .food-row').count();
    await page.locator('#food-list [data-del-food]').last().click();
    log('Eliminar alimento', (await page.locator('#food-list .food-row').count()) === before - 1);

    // Hábitos
    const hf = page.locator('#form-habits');
    await hf.locator('[name=steps]').fill('8000');
    await hf.locator('[name=water]').fill('2.5');
    await hf.locator('[name=sleep]').fill('6.5');
    await hf.locator('[name=trained]').check();
    await hf.locator('button[type=submit]').click();
    await page.reload();
    await page.click('#tab-comidas');
    log('Hábitos persisten tras recargar', (await hf.locator('[name=steps]').inputValue()) === '8000' && await hf.locator('[name=trained]').isChecked());
    await page.screenshot({ path: SHOTS + '04-comidas-habitos.png', fullPage: true });

    // Panel
    await page.click('#tab-panel');
    const stWeight = await page.locator('#st-weight').innerText();
    const stRate = await page.locator('#st-rate').innerText();
    const goal = await page.locator('#goal-text').innerText();
    log('Panel muestra peso/ritmo/meta', stWeight.includes('68,8') && stRate !== '—', `peso=${stWeight} ritmo=${stRate} meta="${goal}"`);
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    log('Sin scroll horizontal en 390px', scrollW <= 390, `scrollWidth=${scrollW}`);
    await page.screenshot({ path: SHOTS + '05-panel-movil.png', fullPage: true });

    // Exportar JSON + CSV
    await page.click('#tab-perfil');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export')]);
    const jsonPath = OUT + 'export.json';
    await dl.saveAs(jsonPath);
    const exported = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    log('Exportar JSON', Array.isArray(exported.entries) && exported.profile && Array.isArray(exported.photos), `entries=${exported.entries.length}, fechas comidas=${Object.keys(exported.foods)}`);
    const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export-csv')]);
    await dl2.saveAs(OUT + 'export.csv');
    log('Exportar CSV', fs.readFileSync(OUT + 'export.csv', 'utf8').split('\n').length >= 5);

    // Borrar todo + importar
    await page.click('#btn-reset');
    const afterReset = await page.evaluate(() => JSON.parse(localStorage.getItem('perdida-grasa:v1')));
    log('Borrar todo', afterReset.entries.length === 0 && afterReset.profile === null);
    await page.setInputFiles('#file-import', jsonPath);
    await page.waitForTimeout(500);
    const afterImport = await page.evaluate(() => JSON.parse(localStorage.getItem('perdida-grasa:v1')));
    log('Importar JSON (ida y vuelta)', afterImport.entries.length === exported.entries.length && afterImport.profile?.name === 'Ana QA', await toast(page));

    // JSON malformado
    fs.writeFileSync(OUT + 'bad.json', '{ "entries": [ ');
    await page.setInputFiles('#file-import', OUT + 'bad.json');
    await page.waitForTimeout(300);
    log('JSON sintácticamente inválido rechazado sin perder datos', (await toast(page)).includes('no válido') && (await page.evaluate(() => JSON.parse(localStorage.getItem('perdida-grasa:v1')).entries.length)) === exported.entries.length);
    log('Errores de consola flujo principal', errors.length === 0, errors.join(' || '));
    await ctx.close();
  }

  // ---------- Importación con estructura válida pero contenido inválido ----------
  {
    const { ctx, page, errors } = await newPage(browser);
    await page.goto(URL);
    fs.writeFileSync(OUT + 'shape.json', JSON.stringify({ entries: [{ weight: 80 }], foods: [], habits: null }));
    await page.setInputFiles('#file-import', OUT + 'shape.json');
    await page.waitForTimeout(500);
    const t = await toast(page);
    const stored = await page.evaluate(() => localStorage.getItem('perdida-grasa:v1'));
    errors.length = 0;
    await page.reload();
    await page.waitForTimeout(300);
    const tabsWork = await page.click('#tab-registro').then(() => page.locator('#view-registro.active').count()).catch(() => 0);
    log('Import con entrada sin fecha / habits=null no rompe la app', errors.length === 0, `toast="${t}"; guardado=${stored?.slice(0, 80)}; errores tras recargar: ${errors.join(' || ')}; tabs ok=${tabsWork}`);
    await page.screenshot({ path: SHOTS + '06-import-corrupto-app-rota.png', fullPage: false });
    await ctx.close();
  }

  // ---------- XSS vía importación ----------
  {
    const { ctx, page, errors } = await newPage(browser);
    await page.goto(URL);
    const day = new Date().toISOString().slice(0, 10);
    const payload = {
      profile: { name: 'x', sex: 'male', age: 30, height: 180, startWeight: 90, goalWeight: 80, startDate: day, activity: 1.2, rate: 0.005 },
      entries: [{ id: '"><img src=x onerror="window.__xss1=1">', date: day, weight: 90 }],
      foods: { [day]: [{ id: 'a', name: 'ok', meal: 'Cena', kcal: '<img src=x onerror="window.__xss2=1">', protein: 1, carbs: 1, fat: 1 }] },
      habits: {}, library: {},
    };
    fs.writeFileSync(OUT + 'xss.json', JSON.stringify(payload));
    await page.setInputFiles('#file-import', OUT + 'xss.json');
    await page.waitForTimeout(600);
    await page.click('#tab-comidas');
    await page.waitForTimeout(300);
    const x = await page.evaluate(() => ({ a: window.__xss1, b: window.__xss2 }));
    log('XSS por JSON importado (id de registro / kcal de alimento)', !x.a && !x.b, `ejecutado id=${!!x.a} kcal=${!!x.b}`);
    // texto kcal concatenado: "100" string -> totales
    await ctx.close();
  }

  // ---------- Tipos string en import: totales concatenados ----------
  {
    const { ctx, page } = await newPage(browser);
    await page.goto(URL);
    const day = await page.evaluate(() => document.querySelector('#food-date').value);
    fs.writeFileSync(OUT + 'str.json', JSON.stringify({ entries: [], foods: { [day]: [{ id: 'a', name: 'a', meal: 'Cena', kcal: '100', protein: 0, carbs: 0, fat: 0 }, { id: 'b', name: 'b', meal: 'Cena', kcal: '200', protein: 0, carbs: 0, fat: 0 }] } }));
    await page.setInputFiles('#file-import', OUT + 'str.json');
    await page.waitForTimeout(500);
    await page.click('#tab-comidas');
    const m = await page.locator('#day-macros .macro').first().innerText();
    log('Import con kcal como texto suma bien', m.includes('300'), m.replace(/\n/g, ' '));
    await ctx.close();
  }

  // ---------- Zona horaria: fecha "hoy" cerca de medianoche ----------
  {
    const { ctx, page } = await newPage(browser, { timezoneId: 'America/Bogota' });
    await page.clock.install({ time: new Date('2026-10-21T04:30:00Z') }); // 23:30 del 20-oct en Bogotá
    await page.goto(URL);
    const v = await page.locator('#form-entry [name=date]').inputValue();
    log('Fecha por defecto usa día local (23:30 Bogotá => 2026-10-20)', v === '2026-10-20', v);
    await ctx.close();
  }
  {
    const { ctx, page } = await newPage(browser, { timezoneId: 'Europe/Madrid' });
    // 30-mar-2026 01:30 local, justo después del cambio de horario (29-mar)
    await page.clock.install({ time: new Date('2026-03-29T23:30:00Z') });
    await page.goto(URL);
    const last7 = await page.evaluate(() => {
      const toISO = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      return [...Array(7)].map((_, i) => toISO(new Date(Date.now() - i * 86400000)));
    });
    const uniq = new Set(last7).size;
    log('Cálculo "últimos 7 días" (app.js:493) sin duplicados tras cambio de hora', uniq === 7, last7.join(','));
    await ctx.close();
  }

  await browser.close();
  fs.writeFileSync(OUT + 'results.json', JSON.stringify(results, null, 2));
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(1); });
