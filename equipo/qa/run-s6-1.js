// E2E de S6 (autorizaciones y edad mínima) en MODO LOCAL, sin servidor: la edad de 18 aplica siempre y nada de lo nuevo
// (autorizaciones de la nube, acuerdo del coach, hoja A8) existe sin config de Supabase. El flujo con servidor falso vive
// en tests/e2e/s6-consentimientos.spec.js (Playwright Test).
// Uso: node equipo/qa/run-s6-1.js [URL base]   (por defecto file://)
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { conConsentimiento } = require('./legal-helper.js');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const BASE = process.argv[2] || 'file://' + ROOT + '/';
const results = [];
const log = (name, ok, detail = '') => { results.push(ok); console.log((ok ? 'OK   ' : 'FALLO') + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 200) : '')); };
const iso = (n = 0) => new Date(Date.now() - n * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CO', timezoneId: 'America/Bogota' });
  await conConsentimiento(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(BASE + 'index.html');
  await page.waitForTimeout(300);

  // Sin servidor: nada nuevo
  log('Sin servidor: no existe PGAccount ni ConsentTexts activo en la interfaz', (await page.evaluate(() => typeof window.PGAccount)) === 'undefined');
  for (const sel of ['#perms-card', '#account-card', '#btn-account-cloud', '#btn-account-delete', '#sheet-a8', '#acc-step-cloud', '#view-coach .a7-gate']) {
    log(`Sin servidor: ${sel} no se ve`, !(await page.locator(sel).first().isVisible()));
  }

  // Edad 18 en el formulario de perfil
  await page.evaluate(() => PGNav.show('perfil', 'plan'));
  const set = async (n, v) => page.fill(`#form-profile [name=${n}]`, String(v));
  await page.selectOption('#form-profile [name=sex]', 'female');
  await set('age', 17); await set('height', 165); await set('startWeight', 80); await set('goalWeight', 70);
  log('Edad 17: aviso amable visible', await page.locator('#age-note').isVisible() && /18 años o más/.test(await page.locator('#age-note').innerText()));
  await page.click('#form-profile button[type=submit]');
  log('Edad 17: no se guarda el perfil', await page.evaluate(() => !JSON.parse(localStorage.getItem('perdida-grasa:v1') || '{}').profile));
  await set('age', 18);
  await page.click('#form-profile button[type=submit]');
  await page.waitForTimeout(200);
  log('Edad 18: se guarda', await page.evaluate(() => (JSON.parse(localStorage.getItem('perdida-grasa:v1')).profile || {}).age === 18));

  // Perfil guardado de un menor: no se borra en silencio
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CO', timezoneId: 'America/Bogota' });
  const page2 = await ctx2.newPage();
  const Schema = require(path.join(ROOT, 'schema.js'));
  const consent = Schema.buildConsent({ terms: true, privacy: true, adult: true, sensitiveHealth: true, photos: true }, '2026-10-01T12:00:00.000Z');
  const minor = { schemaVersion: 4, profile: { name: 'Leo', sex: 'male', age: 15, height: 170, startWeight: 80, goalWeight: 70, startDate: iso(10), activity: 1.375, rate: 0.005 }, entries: [{ id: 'e1', date: iso(5), weight: 79 }], foods: {}, habits: {}, library: {}, consent };
  await page2.addInitScript((s) => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.setItem('perdida-grasa:v1', s); } }, JSON.stringify(minor));
  await page2.goto(BASE + 'index.html');
  await page2.evaluate(() => PGNav.show('perfil', 'plan'));
  log('Menor guardado: la app avisa en Perfil y pide corregir', /18 años o más/.test(await page2.locator('#profile-issue').innerText()));
  log('Menor guardado: la edad queda en el formulario para corregirla', (await page2.inputValue('#form-profile [name=age]')) === '15');
  log('Menor guardado: nada se borró (perfil y registros siguen guardados)', await page2.evaluate(() => { const s = JSON.parse(localStorage.getItem('perdida-grasa:v1')); return !!s.profile && s.profile.age === 15 && s.entries.length === 1; }));
  await ctx2.close();

  log('Sin errores de consola', errors.length === 0, errors.join(' | '));
  await browser.close();
  const fails = results.filter((x) => !x).length;
  console.log(`\n${results.length - fails}/${results.length} OK`);
  process.exit(fails ? 1 : 0);
})();
