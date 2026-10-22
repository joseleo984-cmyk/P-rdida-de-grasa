// QA adversarial de S1-1 (esquema versionado + importación segura).
// Uso: node equipo/qa/qa-s1-1.js [carpeta con la app ANTERIOR a S1-1]
// La app anterior se extrae con: git archive 8d8a1ad^1 index.html app.js calc.js photos.js styles.css sw.js manifest.webmanifest icon.svg | tar -x -C <carpeta>
// Si no se pasa carpeta, se extrae automáticamente en os.tmpdir().
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { conConsentimiento } = require('./legal-helper.js');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '../..');
const NEW = 'file://' + ROOT + '/index.html';
let OLD_DIR = process.argv[2];
if (!OLD_DIR) {
  OLD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-old-'));
  execSync(`git archive 8d8a1ad^1 index.html app.js calc.js photos.js styles.css sw.js manifest.webmanifest icon.svg | tar -x -C ${OLD_DIR}`, { cwd: ROOT });
}
const OLD = 'file://' + path.resolve(OLD_DIR) + '/index.html';
const Schema = require(path.join(ROOT, 'schema.js'));

const results = [];
const log = (name, ok, detail = '') => { results.push({ name, ok }); console.log((ok ? 'OK   ' : 'FALLO') + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 220) : '')); };
const iso = (n = 0) => new Date(Date.now() - n * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
const KEY = 'perdida-grasa:v1';

async function open(browser, url, init) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CO', timezoneId: 'America/Bogota', acceptDownloads: true });
  if (url !== OLD) await conConsentimiento(ctx); // LEGAL-01: usuario que ya aceptó (ver legal-helper.js); la app anterior no lo conoce
  if (init) await ctx.addInitScript(init.fn, init.arg);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(url);
  await page.waitForTimeout(200);
  return { ctx, page, errors };
}
// Inyecta localStorage solo en la primera carga del contexto.
const seed = (raw) => ({ fn: (v) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', 1); localStorage.setItem('perdida-grasa:v1', v); } }, arg: raw });
const toast = (page) => page.locator('#toast').textContent();
async function importJSON(page, obj) {
  const buffer = Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj));
  await page.setInputFiles('#file-import', { name: 'r.json', mimeType: 'application/json', buffer });
  await page.waitForTimeout(500);
  return toast(page);
}
const stored = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), KEY);
const exportPhotos = (page) => page.evaluate(() => Photos.exportAll());
async function fillProfile(page, p) {
  await page.click('#tab-perfil');
  const f = page.locator('#form-profile');
  await f.locator('[name=name]').fill(p.name);
  await f.locator('[name=sex]').selectOption(p.sex);
  await f.locator('[name=age]').fill(String(p.age));
  await f.locator('[name=height]').fill(String(p.height));
  await f.locator('[name=startWeight]').fill(String(p.startWeight));
  await f.locator('[name=goalWeight]').fill(String(p.goalWeight));
  await f.locator('[name=startDate]').fill(p.startDate);
  await f.locator('[name=activity]').selectOption(String(p.activity));
  await f.locator('[name=rate]').selectOption(String(p.rate));
  await f.locator('button[type=submit]').click();
  await page.waitForTimeout(150);
}
async function addEntry(page, e) {
  await page.click('#tab-registro');
  const f = page.locator('#form-entry');
  await f.locator('[name=date]').fill(e.date);
  for (const k of ['weight', 'waist', 'neck', 'hip', 'bodyFat', 'note']) if (e[k] !== undefined) await f.locator(`[name=${k}]`).fill(String(e[k]));
  await f.locator('button[type=submit]').click();
  await page.waitForTimeout(120);
}
async function addFood(page, x) {
  await page.click('#tab-comidas');
  await page.locator('#food-date').fill(x.date);
  await page.locator('#food-date').dispatchEvent('change');
  const f = page.locator('#form-food');
  await f.locator('[name=name]').fill(x.name);
  await f.locator('[name=meal]').selectOption(x.meal);
  for (const k of ['kcal', 'protein', 'carbs', 'fat']) await f.locator(`[name=${k}]`).fill(String(x[k]));
  await f.locator('button[type=submit]').click();
  await page.waitForTimeout(120);
}
async function addHabits(page, d, h) {
  await page.click('#tab-comidas');
  await page.locator('#food-date').fill(d);
  await page.locator('#food-date').dispatchEvent('change');
  const f = page.locator('#form-habits');
  for (const k of ['steps', 'water', 'sleep']) if (h[k] !== undefined) await f.locator(`[name=${k}]`).fill(String(h[k]));
  if (h.trained) await f.locator('[name=trained]').check();
  await f.locator('button[type=submit]').click();
  await page.waitForTimeout(120);
}
async function addPhoto(page, d, pose) {
  await page.click('#tab-fotos');
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 320; c.height = 240;
    const g = c.getContext('2d'); g.fillStyle = '#c33'; g.fillRect(0, 0, 320, 240); g.fillStyle = '#3c3'; g.fillRect(40, 40, 120, 90);
    return c.toDataURL('image/png').split(',')[1];
  });
  const f = page.locator('#form-photo');
  await f.locator('[name=date]').fill(d);
  await f.locator('[name=pose]').selectOption(pose);
  await f.locator('[name=file]').setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') });
  await f.locator('button[type=submit]').click();
  await page.waitForTimeout(500);
}
const plain = (o) => JSON.parse(JSON.stringify(o));
// Comparación profunda que no depende del orden de las claves.
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const eq = (a, b) => JSON.stringify(canon(plain(a))) === JSON.stringify(canon(plain(b)));
// S2-4 (schema v4): la migración añade `id` UUID y `updatedAt` a cada registro. El contenido debe seguir idéntico.
const bare = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k === 'id' || k === 'updatedAt' ? undefined : v)));
const eqData = (a, b) => eq(bare(a), bare(b));

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

  // ===== 1. Respaldo v1 REAL generado con la app anterior (8d8a1ad^1) =====
  const profile = { name: 'Lucía <i>QA</i>', sex: 'female', age: 41, height: 158.5, startWeight: 82.4, goalWeight: 68, startDate: iso(20), activity: 1.55, rate: 0.0075 };
  const old = await open(browser, OLD);
  await fillProfile(old.page, profile);
  await addEntry(old.page, { date: iso(10), weight: 80.9, waist: 92.5, neck: 34, hip: 108, note: 'Semana "dura" & <b>cansada</b> ñ 😅' });
  await addEntry(old.page, { date: iso(3), weight: 79.6, bodyFat: 36.2 });
  await addFood(old.page, { date: iso(3), name: 'Arepa con queso', meal: 'Desayuno', kcal: 320, protein: 12.5, carbs: 40, fat: 11.2 });
  await addFood(old.page, { date: iso(3), name: 'Bandeja paisa (media)', meal: 'Almuerzo', kcal: 980, protein: 45, carbs: 90, fat: 48 });
  await addFood(old.page, { date: iso(1), name: 'Yogur griego', meal: 'Snack', kcal: 130, protein: 15, carbs: 6, fat: 4 });
  await addHabits(old.page, iso(3), { steps: 8500, water: 2.2, sleep: 6.5, trained: true });
  await addHabits(old.page, iso(1), { sleep: 8 });
  await addPhoto(old.page, iso(10), 'frente');
  await addPhoto(old.page, iso(3), 'perfil');
  const oldRaw = await old.page.evaluate((k) => localStorage.getItem(k), KEY);
  const oldState = JSON.parse(oldRaw);
  await old.page.click('#tab-perfil');
  const [dl] = await Promise.all([old.page.waitForEvent('download'), old.page.click('#btn-export')]);
  const oldBackup = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  log('App anterior: datos v1 creados por UI (sin schemaVersion, 2 fotos)', oldBackup.schemaVersion === undefined && oldBackup.photos.length === 2 && oldState.entries.length === 3 && old.errors.length === 0, old.errors.join(' | '));
  await old.ctx.close();

  { // 1a. Importar ese respaldo en la app nueva
    const { page, errors, ctx } = await open(browser, NEW);
    const t = await importJSON(page, oldBackup);
    const s = await stored(page);
    const { photos: _p, ...oldNoPhotos } = oldBackup;
    log('Respaldo v1 real: toast sin datos descartados', t === 'Datos importados', t);
    log('Respaldo v1 real: perfil idéntico', eqData(s.profile, oldNoPhotos.profile), JSON.stringify(s.profile));
    log('Respaldo v1 real: registros idénticos (medidas, nota) con ids UUID (v4)', eqData(s.entries, oldNoPhotos.entries) && s.entries.every((e) => Schema.isUUID(e.id)));
    log('Respaldo v1 real: comidas, hábitos y biblioteca idénticos', eqData(s.foods, oldNoPhotos.foods) && eqData(s.habits, oldNoPhotos.habits) && eqData(s.library, oldNoPhotos.library),
      JSON.stringify(s.habits) + ' vs ' + JSON.stringify(oldNoPhotos.habits));
    const ph = await exportPhotos(page);
    const key = (x) => x.createdAt;   // v4: los ids de foto pasan a UUID; createdAt identifica cada foto
    const same = ph.length === 2 && oldBackup.photos.every((o) => { const n = ph.find((p) => key(p) === key(o)); return n && n.data === o.data && n.pose === o.pose && n.date === o.date && n.width === o.width && n.createdAt === o.createdAt; });
    log('Respaldo v1 real: 2 fotos con bytes, pose, fecha y metadatos idénticos', same);
    await page.click('#tab-fotos');
    log('Respaldo v1 real: galería y comparador renderizan', (await page.locator('#gallery .thumb').count()) === 2 && errors.length === 0, errors.join(' | '));
    // Ida y vuelta: exportar desde la nueva y reimportar
    await page.click('#tab-perfil');
    const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export')]);
    const newBackup = JSON.parse(fs.readFileSync(await dl2.path(), 'utf8'));
    log(`Exportación nueva lleva schemaVersion ${Schema.CURRENT_VERSION} y exportedAt`, newBackup.schemaVersion === Schema.CURRENT_VERSION && !Number.isNaN(Date.parse(newBackup.exportedAt)));
    await importJSON(page, newBackup);
    log('Ida y vuelta v2 sin pérdidas', eq((await stored(page)).entries, s.entries) && eq((await stored(page)).foods, s.foods) && (await exportPhotos(page)).length === 2);
    await ctx.close();
  }

  { // 1b. Actualización in situ: localStorage escrito por la app anterior
    const { page, errors, ctx } = await open(browser, NEW, seed(oldRaw));
    const t = await toast(page);
    const s = await page.evaluate(() => null);
    await page.click('#tab-registro');
    const rows = await page.locator('#entries-table tbody tr').count();
    log('Actualización v1→v2 en localStorage: sin avisos de corrección, 3 registros', !t.includes('corrigieron') && rows === 3 && errors.length === 0, t + ' ' + errors.join('|'));
    // LEGAL-01: legal-helper añade `consent` al leer; se compara todo lo demás clave a clave.
    const bkRaw = await page.evaluate(() => localStorage.getItem('perdida-grasa:backup'));
    const { consent: _c, ...bkRest } = JSON.parse(bkRaw || 'null') || {};
    log('Actualización v1→v2: copia cruda en perdida-grasa:backup', !!bkRaw && eq(bkRest, JSON.parse(oldRaw)));
    log('Actualización v1→v2: el perfil se conserva (no reaparece onboarding)', await page.locator('#onboarding').isHidden());
    void s;
    await ctx.close();
  }

  // ===== 2. Riesgo señalado: perfil antiguo con meta >= peso inicial (BUG-04 ya ocurrido) =====
  {
    const o = await open(browser, OLD);
    await fillProfile(o.page, { ...profile, startWeight: 70, goalWeight: 80 });          // BUG-04: queda en memoria
    await addEntry(o.page, { date: iso(2), weight: 71 });                                  // ...y se persiste
    await addFood(o.page, { date: iso(2), name: 'Pan', meal: 'Desayuno', kcal: 200, protein: 6, carbs: 38, fat: 2 });
    const raw = await o.page.evaluate((k) => localStorage.getItem(k), KEY);
    await o.ctx.close();
    const legacyProfile = JSON.parse(raw).profile;
    log('Precondición: la app anterior persistió un perfil con meta > inicio', legacyProfile && legacyProfile.goalWeight === 80);

    const { page, ctx } = await open(browser, NEW, seed(raw));
    const t = await toast(page);
    const onboarding = await page.locator('#onboarding').isVisible().catch(() => false);
    const formName = await page.locator('#form-profile [name=name]').inputValue();
    const formStart = await page.locator('#form-profile [name=startWeight]').inputValue();
    log('R1: perfil antiguo inválido se descarta → vista Perfil vacía (pérdida percibida)', !(formStart === '' && formName === ''),
      `toast="${t}" onboarding=${onboarding} form.name="${formName}" form.startWeight="${formStart}"`);
    // Cualquier acción guarda sin perfil
    await addEntry(page, { date: iso(1), weight: 70.5 });
    log('R1: tras la primera acción el perfil desaparece de perdida-grasa:v1', (await stored(page)).profile !== null, 'profile=' + JSON.stringify((await stored(page)).profile));
    const bk1 = await page.evaluate(() => localStorage.getItem('perdida-grasa:backup'));
    log('R1: la copia en :backup conserva el perfil original', bk1 && JSON.parse(bk1).profile && JSON.parse(bk1).profile.goalWeight === 80);
    // Un dato que el formulario aún acepta (BUG-07: nombre de solo espacios) provoca un aviso en la siguiente carga...
    await addFood(page, { date: iso(1), name: '   ', meal: 'Cena', kcal: 100, protein: 0, carbs: 0, fat: 0 });
    await page.reload(); await page.waitForTimeout(300);
    const bk2 = await page.evaluate(() => localStorage.getItem('perdida-grasa:backup'));
    log('R1: la copia :backup NO se sobrescribe en una carga posterior con avisos', bk2 && JSON.parse(bk2).profile && JSON.parse(bk2).profile.goalWeight === 80,
      'backup.profile=' + (bk2 ? JSON.stringify(JSON.parse(bk2).profile) : 'null') + ' toast=' + (await toast(page)));
    await ctx.close();
  }

  // ===== 3. __proto__ / constructor =====
  {
    const { page, errors, ctx } = await open(browser, NEW);
    const d = iso(0);
    const txt = `{"__proto__":{"polluted":"top"},"constructor":{"prototype":{"polluted":"ctor"}},
      "profile":{"__proto__":{"polluted":"profile"},"sex":"male","age":30,"height":175,"startWeight":90,"goalWeight":80,"startDate":"${d}","activity":1.2,"rate":0.005},
      "entries":[{"__proto__":{"polluted":"entry"},"id":"__proto__","date":"${d}","weight":90}],
      "foods":{"__proto__":[{"name":"x","kcal":1}],"constructor":[{"name":"y","kcal":1}],"${d}":[{"__proto__":{"polluted":"food"},"id":"constructor","name":"ok","kcal":10}]},
      "habits":{"__proto__":{"steps":1},"prototype":{"steps":1},"${d}":{"steps":"5000","trained":true}},
      "library":{"__proto__":{"name":"__proto__","kcal":1},"constructor":{"name":"Constructor","kcal":5},"x":{"name":"prototype","kcal":5},"ok":{"name":"Ok","kcal":10}}}`;
    const t = await importJSON(page, txt);
    const r = await page.evaluate(() => ({ p: ({}).polluted, p2: Object.prototype.polluted, s: JSON.parse(localStorage.getItem('perdida-grasa:v1')) }));
    log('__proto__/constructor: Object.prototype intacto', r.p === undefined && r.p2 === undefined, t);
    log('__proto__/constructor: solo claves de fecha y biblioteca segura',
      eq(Object.keys(r.s.foods), [d]) && eq(Object.keys(r.s.habits), [d]) && eq(Object.keys(r.s.library), ['ok']) && r.s.entries[0].id !== '__proto__' && r.s.profile && r.s.profile.startWeight === 90,
      JSON.stringify({ f: Object.keys(r.s.foods), h: Object.keys(r.s.habits), l: Object.keys(r.s.library), id: r.s.entries[0].id }));
    // Alimento legítimo llamado "Constructor" escrito por el usuario
    await addFood(page, { date: d, name: 'Constructor', meal: 'Cena', kcal: 300, protein: 1, carbs: 1, fat: 1 });
    await page.reload(); await page.waitForTimeout(300);
    const t2 = await toast(page);
    log('Alimento legítimo "Constructor" no se trata como dato dañado al recargar', !t2.includes('corrigieron'), t2);
    log('Sin errores de consola (__proto__)', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ===== 4. Atomicidad real: IndexedDB falla a mitad de la transacción =====
  {
    const { page, ctx } = await open(browser, NEW);
    await importJSON(page, oldBackup);
    const before = JSON.stringify(await stored(page));
    const beforePh = JSON.stringify(await exportPhotos(page));
    await page.evaluate(() => {
      const orig = IDBObjectStore.prototype.put; let n = 0;
      IDBObjectStore.prototype.put = function (...a) { if (++n === 2) throw new DOMException('fallo simulado', 'DataError'); return orig.apply(this, a); };
    });
    const t = await importJSON(page, { ...oldBackup, entries: [{ date: iso(0), weight: 99 }] });
    await page.evaluate(() => { delete IDBObjectStore.prototype.put; });
    await page.reload(); await page.waitForTimeout(300);
    log('Atomicidad: put() falla en la 2.ª foto → localStorage y fotos intactos (clear revertido)',
      before === JSON.stringify(await stored(page)) && beforePh === JSON.stringify(await exportPhotos(page)), t);
    // Fotos válidas todas descartadas → la galería actual se vacía (con confirmación)
    const t2 = await importJSON(page, { ...oldBackup, photos: [{ id: 'a', date: iso(0), pose: 'frente', data: 'data:image/svg+xml;base64,PHN2Zz4=' }] });
    log('Obs: respaldo cuyas fotos son todas inválidas conserva la galería actual', (await exportPhotos(page)).length === 2, t2 + ' · fotos=' + (await exportPhotos(page)).length);
    await ctx.close();
  }

  // ===== 5. Cuota llena =====
  {
    const { page, ctx } = await open(browser, NEW);
    await importJSON(page, oldBackup);
    const before = JSON.stringify(await stored(page));
    await page.evaluate(() => {
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { if (k === 'perdida-grasa:v1') throw new DOMException('lleno', 'QuotaExceededError'); return orig.call(this, k, v); };
    });
    await addEntry(page, { date: iso(0), weight: 79 });
    const t = await toast(page);
    log('Cuota: el toast de HU-01 llega al usuario al guardar (no lo tapa el de éxito)', t === 'Almacenamiento lleno: exporta una copia y borra fotos antiguas', t);
    const t2 = await importJSON(page, { entries: [{ date: iso(0), weight: 70 }], photos: [] });
    log('Cuota: importación rechazada sin tocar fotos', t2.includes('Almacenamiento lleno') && (await exportPhotos(page)).length === 2 && before === JSON.stringify(await stored(page)), t2);
    await ctx.close();
  }

  // ===== 6. Borrar todo =====
  {
    const { page, ctx } = await open(browser, NEW);
    await importJSON(page, oldBackup);
    await page.evaluate(() => {
      localStorage.setItem('perdida-grasa:lastBackup', new Date().toISOString());
      localStorage.setItem('perdida-grasa:backupSnooze', '2026-12-01');
      localStorage.setItem('perdida-grasa:backup', '{"profile":{"name":"secreto"}}');
      localStorage.setItem('perdida-grasa:corrupto', '{secreto');
    });
    await page.click('#tab-perfil');
    await page.click('#btn-reset');
    await page.waitForTimeout(400);
    const k = await page.evaluate(() => Object.fromEntries(['lastBackup', 'backupSnooze', 'backup', 'corrupto'].map((x) => [x, localStorage.getItem('perdida-grasa:' + x)])));
    log('Borrar todo elimina lastBackup y backupSnooze', k.lastBackup === null && k.backupSnooze === null, JSON.stringify(k));
    log('Borrar todo elimina las copias :backup y :corrupto (datos personales)', k.backup === null && k.corrupto === null, JSON.stringify(k));
    log('Borrar todo elimina fotos', (await exportPhotos(page)).length === 0);
    await ctx.close();
  }

  // ===== 7. Fotos heredadas en IndexedDB (importadas con la app anterior, sin validar) =====
  {
    const { page, errors, ctx } = await open(browser, NEW);
    await page.evaluate(async () => {
      const blob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
      await Photos.put({ id: '"><img src=x onerror="window.__xss=1">', date: '"><img src=x onerror="window.__xss=2">', pose: '<img src=x onerror="window.__xss=3">', blob, createdAt: 1 });
      await Photos.put({ id: 'sinfecha', pose: 'frente', blob, createdAt: 2 });
    });
    await page.reload(); await page.waitForTimeout(400);
    await page.click('#tab-fotos'); await page.waitForTimeout(200);
    const xss = await page.evaluate(() => window.__xss);
    log('Fotos heredadas maliciosas en IndexedDB: sin XSS', xss === undefined, 'xss=' + xss);
    log('Fotos heredadas sin fecha: la galería no rompe', !errors.some((e) => e.startsWith('pageerror')), errors.join(' | '));
    await ctx.close();
  }

  // ===== 8. Escape exhaustivo: payload en TODOS los campos de texto/número =====
  {
    const { page, errors, ctx } = await open(browser, NEW);
    const P = (n) => `"><img src=x onerror="window.__x${n}=1">'<svg onload=window.__x${n}=1>`;
    const d = iso(0);
    await importJSON(page, {
      profile: { name: P(1), sex: 'female', age: 30, height: 160, startWeight: 80, goalWeight: 70, startDate: d, activity: P(2), rate: P(3) },
      entries: [{ id: P(4), date: d, weight: 80, waist: P(5), neck: '35', hip: '100', note: P(6) }, { id: 'b', date: iso(8), weight: 81, waist: 95, neck: 35, hip: 100 }],
      foods: { [d]: [{ id: P(7), name: P(8), meal: P(9), kcal: '50', protein: P(10), carbs: '1e2', fat: '0x10' }] },
      habits: { [d]: { steps: P(11), water: '2', sleep: '7', trained: P(12) } },
      library: { k: { name: P(13), kcal: 1 } },
      photos: [{ id: P(14), date: d, pose: P(15), data: oldBackup.photos[0].data }, { id: 'z', date: iso(8), pose: P(16), data: oldBackup.photos[1].data }],
    });
    for (const v of ['panel', 'registro', 'comidas', 'fotos', 'perfil']) { await page.click('#tab-' + v); await page.waitForTimeout(120); }
    await page.locator('#compare-pose button[data-pose=frente]').click().catch(() => {});
    await page.reload(); await page.waitForTimeout(300);
    for (const v of ['panel', 'registro', 'comidas', 'fotos', 'perfil']) { await page.click('#tab-' + v); await page.waitForTimeout(120); }
    const fired = await page.evaluate(() => Object.keys(window).filter((k) => /^__x\d+$/.test(k)));
    log('Payload en todos los campos: ningún script ejecutado', fired.length === 0, fired.join(','));
    const s = await stored(page);
    log('Normalización: "1e2"→100 y "0x10"→16 aceptados como números (observación)', s.foods[d][0].carbs === 100 && s.foods[d][0].fat === 16, JSON.stringify(s.foods[d][0]));
    log('Sin errores de consola (escape)', errors.length === 0, errors.join(' | '));
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    log('Sin scroll horizontal a 390 px', sw <= 390, 'scrollWidth=' + sw);
    await ctx.close();
  }

  // ===== 9. Schema (Node): casos límite de migrate/normalize =====
  {
    const throws = (f) => { try { f(); return false; } catch { return true; } };
    log(`migrate: lanza con versión "2", 2.5, 0, null, ${Schema.CURRENT_VERSION + 1}, array, null`, ['2', 2.5, 0, null, Schema.CURRENT_VERSION + 1].every((v) => throws(() => Schema.migrate({ schemaVersion: v, entries: [] }))) && throws(() => Schema.migrate([])) && throws(() => Schema.migrate(null)));
    const input = { entries: [{ date: '2026-01-01', weight: 80 }] };
    const frozen = JSON.stringify(input);
    Schema.normalize(Schema.migrate(input));
    log('migrate/normalize no mutan la entrada', JSON.stringify(input) === frozen);
    log('migrate: idempotente (v3 añade consent: null)', eq(Schema.migrate(Schema.migrate({ entries: [] })), { entries: [], schemaVersion: Schema.CURRENT_VERSION, consent: null, deleted: { entries: [], foods: [], habits: [], photos: [] } }));
    const n = Schema.normalize({ entries: [
      { date: '2024-02-29', weight: 80 }, { date: '2026-02-29', weight: 80 }, { date: ' 2026-10-01', weight: 80 }, { date: '2026-10-01T00:00', weight: 80 },
      { date: '2026-10-02', weight: '80,5' }, { date: '2026-10-03', weight: Infinity }, { date: '2026-10-04', weight: 19.9 }, { date: '2026-10-05', weight: 400 },
      { date: '2026-10-06', weight: true }, { date: '2026-10-07', weight: [80] }, { date: '2026-10-08', weight: 80, note: 'x'.repeat(500) },
      { id: 'dup', date: '2026-10-09', weight: 80 }, { id: 'dup', date: '2026-10-10', weight: 80 },
    ] }, { uid: (() => { let i = 0; return () => 'u' + ++i; })() });
    const dates = n.state.entries.map((e) => e.date);
    log('normalize: fechas bisiestas/espacios/hora y números límite', eq(dates, ['2024-02-29', '2026-10-05', '2026-10-08', '2026-10-09', '2026-10-10']), dates.join(','));
    log('Obs: "80,5" (coma decimal) descarta el registro', !dates.includes('2026-10-02'));
    log('Obs: nota de 500 caracteres se trunca a 140 sin aviso', n.state.entries.find((e) => e.date === '2026-10-08').note.length === 140 && !n.warnings.some((w) => w.includes('nota')));
    log('normalize: ids duplicados se regeneran', new Set(n.state.entries.map((e) => e.id)).size === n.state.entries.length);
    const h = Schema.normalize({ habits: { '2026-10-01': { trained: 'true', steps: -1 }, '2026-10-02': [] } });
    log('normalize: hábitos (trained "true"→false, pasos negativos fuera, array descartado)', eqData(h.state.habits, { '2026-10-01': { trained: false } }), JSON.stringify(h.state.habits));
    log('normalize: lanza si no hay claves conocidas o no es objeto', throws(() => Schema.normalize({ foo: 1 })) && throws(() => Schema.normalize('x')) && throws(() => Schema.normalize([])));
    const ph = Schema.normalizePhotos([
      { date: '2026-10-01', pose: 'frente', data: 'data:image/png;base64,AAAA' },
      { date: '2026-10-01', pose: 'frente', data: 'data:image/png;base64,AA AA' },
      { date: '2026-10-01', pose: 'frente', data: 'data:image/svg+xml;base64,AAAA' },
      { date: '2026-10-01', pose: 'frente', data: 'javascript:alert(1)' },
      { date: '2026-13-01', pose: 'frente', data: 'data:image/png;base64,AAAA' },
      { date: '2026-10-01', pose: 'x', data: 'data:image/webp;base64,AAAA', width: -5, createdAt: 'x' },
    ]);
    log('normalizePhotos: solo png/jpeg/webp base64 con fecha válida; pose corregida', ph.photos.length === 2 && ph.photos[1].pose === 'frente' && ph.photos[1].width === undefined && ph.photos[1].createdAt === 0);
    log('normalizePhotos: lanza si no es lista', throws(() => Schema.normalizePhotos({ a: 1 })) && throws(() => Schema.normalizePhotos('x')));
    const big = Date.now(); Schema.normalizePhotos([{ date: '2026-10-01', pose: 'frente', data: 'data:image/jpeg;base64,' + 'A'.repeat(8e6) + '!' }]);
    log('normalizePhotos: regex sin backtracking catastrófico (8 MB inválidos)', Date.now() - big < 1500, (Date.now() - big) + ' ms');
    const prof = Schema.normalize({ profile: { sex: 'male', age: '30', height: '175', startWeight: '90', goalWeight: '80', startDate: '2026-10-01', activity: '1.55', rate: '0.005' } });
    log('normalize: perfil con números en texto se convierte', prof.state.profile && prof.state.profile.age === 30 && prof.state.profile.activity === 1.55);
  }

  // ===== 11. Re-verificación de las correcciones (c1c95a9) =====
  {
    const QUOTA = () => { const o = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'perdida-grasa:v1') throw new DOMException('lleno', 'QuotaExceededError'); return o.call(this, k, v); }; };
    // D2: con cuota llena, el registro no aparece, el formulario conserva lo escrito y el toast es de error
    const { page, errors, ctx } = await open(browser, NEW);
    await importJSON(page, oldBackup);
    await page.evaluate(QUOTA);
    await page.click('#tab-registro');
    const rows0 = await page.locator('#entries-table tbody tr').count();
    await page.locator('#form-entry [name=date]').fill(iso(0));
    await page.locator('#form-entry [name=weight]').fill('77.7');
    await page.locator('#form-entry button[type=submit]').click();
    await page.waitForTimeout(150);
    const t = await toast(page);
    const cls = await page.locator('#toast').getAttribute('class');
    log('D2: cuota → toast de error, sin fila fantasma y el formulario conserva el valor',
      t.startsWith('Almacenamiento lleno') && /error/.test(cls) && (await page.locator('#entries-table tbody tr').count()) === rows0 && (await page.locator('#form-entry [name=weight]').inputValue()) === '77.7',
      `toast="${t}" class="${cls}"`);
    await page.click('#tab-comidas');
    await page.locator('#form-food [name=name]').fill('Pan'); await page.locator('#form-food [name=kcal]').fill('100');
    await page.locator('#form-food button[type=submit]').click(); await page.waitForTimeout(150);
    log('D2: cuota en alimento → no aparece en la lista', !(await page.locator('#food-list').innerText()).includes('Pan') && (await toast(page)).startsWith('Almacenamiento'), await toast(page));
    // D3 con cuota llena: Borrar todo funciona igualmente
    await page.click('#tab-perfil'); await page.click('#btn-reset'); await page.waitForTimeout(300);
    const left = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('perdida-grasa')));
    log('D3: Borrar todo con cuota llena borra todas las claves', left.length === 0 && (await toast(page)) === 'Datos borrados', JSON.stringify(left) + ' ' + (await toast(page)));
    log('Sin errores de consola (re-verificación D2/D3)', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  {
    // D3 con datos de versión futura (guardado bloqueado)
    const { page, ctx } = await open(browser, NEW, seed(JSON.stringify({ schemaVersion: 99, entries: [] })));
    // LEGAL-01: con datos más nuevos el consentimiento no se puede leer ni guardar → la pantalla legal ofrece "Borrar".
    await page.click('#btn-consent-reset'); await page.waitForTimeout(300);
    log('D3: Borrar todo con datos de versión más nueva los borra', (await page.evaluate(() => localStorage.getItem('perdida-grasa:v1'))) === null);
    await ctx.close();
  }
  {
    // D1: borrador → corregir → desaparece; export/import del borrador
    const bad = JSON.stringify({ profile: { name: 'Ana', sex: 'female', age: 35, height: 165, startWeight: 70, goalWeight: 80, startDate: iso(5), activity: 1.375, rate: 0.005 }, entries: [{ id: 'e1', date: iso(5), weight: 70 }] });
    const { page, ctx } = await open(browser, NEW, seed(bad));
    const issue = await page.locator('#profile-issue').innerText();
    const t = await toast(page);
    log('D1: aviso persistente con el motivo y formulario precargado', issue.includes('meta 80 kg') && (await page.locator('#form-profile [name=goalWeight]').inputValue()) === '80', issue);
    log('Obs: el motivo se anuncia dos veces al cargar (toast role=status + #profile-issue role=alert)', !(t.includes('Revisa tu perfil') && issue.includes('Revisa tu perfil')), `toast="${t}"`);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export')]);
    const exp = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
    log('D1: la exportación conserva el borrador', exp.profile && exp.profile.goalWeight === 80);
    await page.click('#btn-backup-no').catch(() => {});
    await page.locator('#form-profile [name=goalWeight]').fill('62');
    await page.locator('#form-profile button[type=submit]').click(); await page.waitForTimeout(150);
    await page.reload(); await page.waitForTimeout(300);
    const s = await stored(page);
    log('D1: al corregir se guarda el perfil válido y el aviso desaparece tras recargar', s.profile.goalWeight === 62 && await page.locator('#profile-issue').isHidden() && !(await toast(page)).includes('Revisa'));
    const ti = await page.evaluate(async (txt) => {
      let msg = ''; const o = window.confirm; window.confirm = (m) => { msg = m; return false; };
      const dt = new DataTransfer(); dt.items.add(new File([txt], 'r.json', { type: 'application/json' }));
      const inp = document.querySelector('#file-import'); inp.files = dt.files; inp.dispatchEvent(new Event('change'));
      await new Promise((r) => setTimeout(r, 300)); window.confirm = o; return msg;
    }, JSON.stringify(exp));
    log('L7: el confirm de importación nombra el perfil inválido y su motivo', /perfil no es válido/i.test(ti) && ti.includes('meta 80'), ti.replace(/\n/g, ' '));
    await ctx.close();
  }
  {
    // L1 / L6
    const { page, ctx } = await open(browser, NEW);
    await page.click('#tab-comidas');
    await page.locator('#form-food [name=name]').fill('   '); await page.locator('#form-food [name=kcal]').fill('50');
    await page.locator('#form-food button[type=submit]').click(); await page.waitForTimeout(100);
    log('L6: alimento de solo espacios rechazado', (await page.locator('#food-list').innerText()).includes('Nada registrado'), await toast(page));
    await page.locator('#form-food [name=name]').fill('__proto__'); await page.locator('#form-food [name=kcal]').fill('50');
    await page.locator('#form-food button[type=submit]').click(); await page.waitForTimeout(100);
    await page.reload(); await page.waitForTimeout(300);
    log('L1: "__proto__" como alimento se guarda en el diario sin aviso de datos dañados', !(await toast(page)).includes('dañados') && (await page.evaluate(() => ({}).kcal)) === undefined, await toast(page));
    await ctx.close();
  }

  // ===== 10. Despliegue =====
  {
    const yml = fs.readFileSync(path.join(ROOT, '.github/workflows/pages.yml'), 'utf8');
    const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    log('el despliegue (build-site.js, invocado por pages.yml) copia schema.js', /npm run build:site/.test(yml) && /'schema\.js'/.test(fs.readFileSync(path.join(ROOT, 'scripts/build-site.js'), 'utf8')));
    // CACHE solo debe ser >= v3 (la versión en que entró schema.js); otras historias la siguen subiendo.
    const cacheV = Number((sw.match(/CACHE\s*=\s*PGNS\.cacheName\((\d+)\)/) || [])[1]);
    log('sw.js: schema.js en ASSETS y CACHE >= v3', /'schema\.js'/.test(sw) && cacheV >= 3, 'CACHE=v' + cacheV);
    log('index.html carga schema.js antes de photos.js y app.js', html.indexOf('schema.js') > 0 && html.indexOf('schema.js') < html.indexOf('photos.js') && html.indexOf('photos.js') < html.indexOf('app.js'));
  }

  await browser.close();
  const fails = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} OK`);
  if (fails.length) console.log('FALLOS:\n- ' + fails.map((f) => f.name).join('\n- '));
  process.exit(fails.length ? 1 : 0);
})();
