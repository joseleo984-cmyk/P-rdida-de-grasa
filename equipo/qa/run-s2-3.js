// E2E de S2-3 (kit piloto): CSV completo y "Ver copia de un cliente" sin tocar los datos propios.
// Uso: node equipo/qa/run-s2-3.js [URL base] [carpeta capturas]   (por defecto file:// y equipo/qa-capturas/)
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const BASE = process.argv[2] || 'file://' + ROOT + '/';
const SHOTS = process.argv[3] || path.join(ROOT, 'equipo/qa-capturas');
const results = [];
const log = (name, ok, detail = '') => { results.push(ok); console.log((ok ? 'OK   ' : 'FALLO') + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 200) : '')); };
const iso = (n = 0) => new Date(Date.now() - n * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/backup-v1.json'), 'utf8'));
const PNG = fixture.photos[0].data;
// Copia de cliente con fechas recientes para que la adherencia de las últimas semanas tenga datos.
function clientCopy(name, opts = {}) {
  const foods = {}, habits = {}, entries = [];
  for (let i = 0; i < 10; i++) {
    entries.push({ id: 'e' + i, date: iso(i * 2), weight: Math.round((80 + i * 0.2) * 10) / 10, note: i === 0 ? opts.note || 'Semana dura' : undefined });
    if (i < 6) foods[iso(i)] = [{ id: 'f' + i, name: 'Pollo', meal: 'Almuerzo', kcal: 500, protein: 120, carbs: 10, fat: 10 }];
    if (i < 4) habits[iso(i)] = { steps: 8000, sleep: 7, water: 2, trained: i % 2 === 0 };
  }
  return {
    schemaVersion: 2, exportedAt: new Date().toISOString(),
    profile: { name, sex: 'male', age: 40, height: 175, startWeight: 85, goalWeight: 75, startDate: iso(30), activity: 1.375, rate: 0.005 },
    entries, foods, habits, library: {},
    photos: (opts.photos ?? 2) ? Array.from({ length: opts.photos ?? 2 }, (_, k) => ({ id: 'cp' + k, date: iso(k * 7), pose: 'frente', createdAt: k, data: PNG })) : undefined,
  };
}

async function snapshot(page) {
  return page.evaluate(async () => {
    const ls = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); ls[k] = localStorage.getItem(k); }
    const photos = await Photos.exportAll();
    return { ls: JSON.stringify(Object.keys(ls).sort().map((k) => [k, ls[k]])), photos: photos.length, photoBytes: photos.map((p) => p.id + p.data.length).join(',') };
  });
}
async function openCopy(page, obj, selector = '#file-coach', name = 'cliente.json') {
  const buffer = Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj));
  await page.setInputFiles(selector, { name, mimeType: 'application/json', buffer });
  await page.waitForTimeout(400);
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CO', timezoneId: 'America/Bogota', acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(BASE + 'index.html');

  // Mis datos: importo el respaldo v1 (con 2 fotos) como datos propios.
  await page.setInputFiles('#file-import', { name: 'mio.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
  await page.waitForTimeout(500);
  await page.evaluate(() => localStorage.setItem('perdida-grasa:lastBackup', '2026-10-01T10:00:00.000Z'));
  const before = await snapshot(page);
  log('Precondición: datos propios con 2 fotos', before.photos === 2 && before.ls.includes('Ana'));

  // CSV completo
  await page.click('#tab-perfil');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export-csv')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  const lines = csv.replace(/^﻿/, '').split('\r\n');
  log('CSV: BOM UTF-8, ";" y cabeceras con hábitos', csv.charCodeAt(0) === 0xFEFF && /"Pasos";"Agua \(L\)";"Sueño \(h\)";"Entrenó fuerza"/.test(lines[0]), lines[0]);
  log('CSV: coma decimal y hábitos del día', lines.some((l) => l.startsWith('2026-10-15;68,8;') && /;9000;2,5;7,5;Sí;/.test(l)), lines.find((l) => l.startsWith('2026-10-15')));

  // Abrir copia de cliente
  await openCopy(page, clientCopy('Carlos <img src=x onerror="window.__xss=1">'));
  const open1 = await page.locator('#coach-viewer').evaluate((d) => d.open);
  const title = await page.locator('#coach-title').innerText();
  const body = await page.locator('#coach-body').innerText();
  log('Copia 1: se abre el visor de solo lectura con el nombre escapado', open1 && title.includes('Carlos <img') && await page.evaluate(() => window.__xss === undefined), title);
  log('Copia 1: resumen con pesos, ritmo, adherencia y proteína vs objetivo', /Peso inicial\s*85,0 kg/.test(body) && /Ritmo/.test(body) && /1 sem\s*7\/7\s*6\s*4/.test(body) && /120 g \/ \d+ g/.test(body), body.replace(/\s+/g, ' ').slice(0, 300));
  log('Copia 1: últimas notas y 2 miniaturas', body.includes('Semana dura') && (await page.locator('#coach-body .thumb img').count()) === 2);
  const url1 = await page.locator('#coach-body .thumb img').first().getAttribute('src');
  const sw = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.querySelector('#coach-viewer').scrollWidth));
  log('Copia 1: sin scroll horizontal a 390 px', sw <= 390, 'scrollWidth=' + sw);
  await page.screenshot({ path: path.join(SHOTS, 's2-3-copia-cliente.png') });

  // Abrir otra copia seguida, desde el propio visor (se espía revokeObjectURL: con file:// no se puede hacer fetch de blob:)
  await page.evaluate(() => { window.__revoked = []; const o = URL.revokeObjectURL; URL.revokeObjectURL = (u) => { window.__revoked.push(u); return o.call(URL, u); }; });
  await openCopy(page, clientCopy('Diana', { photos: 3, note: '<script>window.__xss=2</script>' }), '#file-coach-other', 'diana.json');
  const title2 = await page.locator('#coach-title').innerText();
  const revoked = await page.evaluate((u) => window.__revoked.includes(u), url1);
  log('Copia 2: reemplaza a la 1, 3 miniaturas y libera las URLs anteriores', title2 === 'Copia de Diana' && (await page.locator('#coach-body .thumb img').count()) === 3 && revoked, title2);
  log('Copia 2: nota con <script> se muestra como texto', (await page.locator('#coach-body').innerText()).includes('<script>') && await page.evaluate(() => window.__xss === undefined));

  // Archivos no válidos: no abren nada ni tocan datos
  const urls2 = await page.locator('#coach-body .thumb img').evaluateAll((xs) => xs.map((x) => x.src));
  await page.click('#coach-close');
  await page.waitForTimeout(100);
  const left = await page.evaluate(() => document.querySelectorAll('#coach-body img').length);
  const freed = await page.evaluate((us) => us.every((u) => window.__revoked.includes(u)), urls2);
  log('Cerrar: el visor se cierra, vacía las miniaturas y libera sus URLs', !(await page.locator('#coach-viewer').evaluate((d) => d.open)) && left === 0 && freed);
  await openCopy(page, '{roto');
  const t1 = await page.locator('#toast').textContent();
  await openCopy(page, { foo: 1 });
  const t2 = await page.locator('#toast').textContent();
  log('Archivo roto o irreconocible: aviso y el visor no se abre', /JSON válido/.test(t1) && /respaldo/.test(t2) && !(await page.locator('#coach-viewer').evaluate((d) => d.open)), t1 + ' | ' + t2);
  // Copia corrupta (BUG-01) y sin fotos
  await openCopy(page, { entries: [{ weight: 80 }, { date: iso(1), weight: '79' }], foods: [], habits: null, photos: { x: 1 } });
  const body3 = await page.locator('#coach-body').innerText();
  log('Copia dañada: se abre con avisos y sin romper', /no válidos de la copia se ignoraron/.test(body3) && /fotos de la copia no tienen un formato válido/.test(body3), body3.slice(0, 120));
  await page.click('#coach-close');

  // Mis datos intactos
  const after = await snapshot(page);
  log('Datos propios intactos: localStorage byte a byte (todas las claves)', after.ls === before.ls);
  log('Datos propios intactos: IndexedDB con las mismas 2 fotos', after.photos === 2 && after.photoBytes === before.photoBytes);
  await page.click('#tab-fotos');
  log('Mi galería sigue mostrando mis 2 fotos', (await page.locator('#gallery .thumb').count()) === 2);
  await page.click('#tab-panel');
  log('Mi panel sigue con mis datos', (await page.locator('#st-weight').innerText()).includes('68,8'));
  await page.reload(); await page.waitForTimeout(300);
  log('Tras recargar, mis datos siguen intactos', (await snapshot(page)).ls === before.ls);
  log('Sin errores de consola', errors.length === 0, errors.join(' | '));

  await browser.close();
  const fails = results.filter((x) => !x).length;
  console.log(`\n${results.length - fails}/${results.length} OK`);
  process.exit(fails ? 1 : 0);
})();
