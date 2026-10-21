// S2-3 · Kit piloto: CSV completo (Excel es-CO) y "Ver copia de un cliente" en solo lectura.
const fs = require('fs');
const { test, expect, D, state, FIXTURE_V1 } = require('./helpers');

const PNG = FIXTURE_V1.photos[0].data;
const XSS = (n) => `"><img src=x onerror="window.__x${n}=1"><svg onload=window.__x${n}=1>`;
const food = (name, kcal, protein, meal = 'Almuerzo') => ({ name, meal, kcal, protein, carbs: 10, fat: 5 });

// Copia de un cliente: datos del 11 al 18-oct, exportada el 18-oct a las 22:30 en Bogotá (03:30Z del 19).
function clientCopy(over = {}) {
  const foods = {};
  for (let d = 12; d <= 18; d++) foods[`2026-10-${d}`] = [food('Pollo', 500, 40)];
  foods['2026-10-11'] = [food('Arroz', 300, 6)];
  return {
    schemaVersion: 2,
    exportedAt: '2026-10-19T03:30:00.000Z',
    profile: { name: 'Carla ' + XSS(1), sex: 'female', age: 30, height: 160, startWeight: 75, goalWeight: 65, startDate: '2026-10-01', activity: 1.375, rate: 0.005 },
    entries: [
      { id: 'c1', date: '2026-10-01', weight: 75 },
      { id: 'c2', date: '2026-10-12', weight: 74.2, note: XSS(2) },
      { id: 'c3', date: '2026-10-15', weight: 73.9, waist: 85, neck: 32, hip: 100 },
      { id: 'c4', date: '2026-10-18', weight: 73.5, note: '=HYPERLINK("http://x","clic")' },
    ],
    foods: { ...foods, '2026-10-19': [{ ...food(XSS(3), 100, 5), id: XSS(4) }] },
    habits: { '2026-10-16': { steps: 9000, trained: true }, '2026-10-17': { trained: false }, '2026-10-18': { sleep: 7.5 } },
    library: {},
    photos: [
      { id: 'p1', date: '2026-10-01', pose: 'frente', data: PNG, createdAt: 1 },
      { id: XSS(5), date: '2026-10-18', pose: XSS(6), data: PNG, createdAt: 2 },
    ],
    ...over,
  };
}
const viewer = (page) => page.locator('#coach-viewer');
async function openCopy(page, obj, input = '#file-coach', name = 'cliente.json') {
  await page.setInputFiles(input, { name, mimeType: 'application/json', buffer: Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj)) });
}
// Instantánea de TODO lo propio: localStorage completo + fotos en IndexedDB (id, tamaño, fecha, pose).
const snapshot = (page) => page.evaluate(async () => ({
  ls: Object.fromEntries(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])),
  photos: (await Photos.all()).map((p) => [p.id, p.blob.size, p.date, p.pose]).sort(),
}));

test.describe('Copia de cliente (solo lectura)', () => {
  test.beforeEach(async ({ app }) => {
    await app.open({ state: state(), prefs: { 'perdida-grasa:lastBackup': '2026-10-20T15:00:00Z' } });
    await app.importJSON(FIXTURE_V1); // datos propios con 2 fotos
    await app.tab('perfil');
  });

  test('abrir, abrir otra y cerrar NO escriben en localStorage ni en IndexedDB propios', async ({ app, page }) => {
    const before = await snapshot(page);
    await page.evaluate(() => {
      window.__writes = [];
      const spy = (proto, names, tag) => names.forEach((n) => {
        const o = proto[n];
        proto[n] = function (...a) { window.__writes.push(tag + '.' + n + ':' + String(a[0]).slice(0, 40)); return o.apply(this, a); };
      });
      spy(Storage.prototype, ['setItem', 'removeItem', 'clear'], 'storage');
      spy(IDBObjectStore.prototype, ['put', 'add', 'delete', 'clear'], 'idb');
    });
    await openCopy(page, clientCopy());
    await expect(viewer(page)).toBeVisible();
    await openCopy(page, clientCopy({ photos: [] }), '#file-coach-other');
    await expect(page.locator('#coach-body')).toContainText('no trae fotos');
    await page.locator('#coach-close').click();
    await expect(viewer(page)).toBeHidden();
    expect(await page.evaluate(() => window.__writes)).toEqual([]);
    expect(await snapshot(page)).toEqual(before);
    await app.reload();
    expect(await snapshot(page)).toEqual(before);
    await app.tab('fotos');
    await expect(page.locator('#gallery .thumb')).toHaveCount(2);
  });

  test('XSS en nombre, notas, alimentos, ids y pose de la copia no se ejecuta', async ({ app, page }) => {
    await openCopy(page, clientCopy(), '#file-coach', '<img src=x onerror=window.__x9=1>.json');
    await expect(viewer(page)).toBeVisible();
    await expect(page.locator('#coach-title')).toContainText('Carla "><img');
    await expect(page.locator('#coach-body')).toContainText('"><img src=x');
    expect(await page.evaluate(() => Object.keys(window).filter((k) => /^__x\d$/.test(k)))).toEqual([]);
    expect(await page.locator('#coach-body img:not([src^="blob:"])').count()).toBe(0);
  });

  test('resumen: referencia = día local de exportedAt y ventanas 1/2/4 semanas que terminan ese día', async ({ app, page }) => {
    await openCopy(page, clientCopy());
    await expect(page.locator('#coach-file')).toContainText('18 oct');
    await expect(page.locator('#coach-file')).toContainText('fecha de exportación');
    const rows = page.locator('.coach-table tbody tr');
    // 1 sem = 12..18-oct: 7 días con algo, 7 con comidas, 3 con hábitos, 3 pesajes (12, 15, 18); el 19 queda fuera.
    await expect(rows.nth(0)).toHaveText(/1 sem\s*7\/7\s*7\s*3\s*3\s*40 g/);
    // 2 sem = 5..18-oct: + 11-oct (comidas) → 8 días.
    await expect(rows.nth(1)).toHaveText(/2 sem\s*8\/14\s*8\s*3\s*3/);
    // 4 sem = 21-sep..18-oct: + 1-oct (pesaje) → 9 días, 4 pesajes.
    await expect(rows.nth(2)).toHaveText(/4 sem\s*9\/28\s*8\s*3\s*4/);
    await expect(page.locator('#coach-body')).toContainText('73,5 kg');
  });

  test('copia sin exportedAt (v1): usa hoy como referencia y lo indica', async ({ app, page }) => {
    const { exportedAt, schemaVersion, ...v1 } = clientCopy();
    void exportedAt; void schemaVersion;
    await openCopy(page, v1);
    await expect(page.locator('#coach-file')).toContainText('(hoy)');
    // Hoy = 21-oct: la semana 15..21 solo tiene 15-18 con datos (+19 con comidas) → 5/7.
    await expect(page.locator('.coach-table tbody tr').nth(0)).toHaveText(/1 sem\s*5\/7/);
  });

  test('object URLs de las fotos: se crean al abrir y se liberan todas al abrir otra y al cerrar con Escape', async ({ app, page }) => {
    await page.evaluate(() => {
      window.__urls = { created: [], revoked: [] };
      const c = URL.createObjectURL, r = URL.revokeObjectURL;
      URL.createObjectURL = (b) => { const u = c(b); window.__urls.created.push(u); return u; };
      URL.revokeObjectURL = (u) => { window.__urls.revoked.push(u); return r(u); };
    });
    await openCopy(page, clientCopy());
    await expect(page.locator('#coach-body .thumbs img')).toHaveCount(2);
    const first = await page.evaluate(() => [...window.__urls.created]);
    expect(first).toHaveLength(2);
    await openCopy(page, clientCopy({ photos: [clientCopy().photos[0]] }), '#file-coach-other');
    await expect(page.locator('#coach-body .thumbs img')).toHaveCount(1);
    expect(await page.evaluate(() => window.__urls.revoked)).toEqual(expect.arrayContaining(first));
    await page.keyboard.press('Escape');
    await expect(viewer(page)).toBeHidden();
    const u = await page.evaluate(() => window.__urls);
    expect([...u.revoked].sort()).toEqual([...u.created].sort());
    await expect(page.locator('#coach-body')).toBeEmpty();
  });

  test('copias rotas: JSON inválido no abre; copia dañada abre con avisos', async ({ app, page }) => {
    await openCopy(page, '{roto');
    await expect(app.toast()).toContainText('No se pudo abrir');
    await expect(viewer(page)).toBeHidden();
    await openCopy(page, { entries: [{ weight: 80 }], foods: [], habits: null, photos: { x: 1 } });
    await expect(viewer(page)).toBeVisible();
    await expect(page.locator('#coach-body')).toContainText('se ignoraron');
    await expect(page.locator('#coach-body')).toContainText('fotos de la copia no tienen un formato válido');
  });

  // Defecto D1 de S2-3 (veredicto QA): con el visor modal abierto, el toast queda debajo de la capa superior.
  // `test.fail` documenta el defecto: cuando se corrija, este test "pasará" y Playwright avisará para quitar la marca.
  test('con el visor abierto, el error de "Abrir otra" (JSON roto) es visible', async ({ app, page }) => {
    test.fail(true, 'S2-3 D1: el toast queda tapado por el <dialog> modal');
    await openCopy(page, clientCopy());
    await expect(viewer(page)).toBeVisible();
    await openCopy(page, '{roto', '#file-coach-other');
    await expect(app.toast()).toContainText('No se pudo abrir');
    const onTop = await page.evaluate(() => {
      const t = document.querySelector('#toast'); const r = t.getBoundingClientRect();
      const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !!el && (el === t || t.contains(el));
    });
    expect(onTop, 'el toast de error queda tapado por el visor modal').toBe(true);
  });

  test('accesibilidad del visor: foco dentro, Tab no sale, Escape cierra y devuelve el foco, sin scroll horizontal', async ({ app, page }) => {
    await page.locator('#file-coach').focus();
    await openCopy(page, clientCopy());
    await expect(viewer(page)).toBeVisible();
    await expect(viewer(page)).toHaveAttribute('aria-labelledby', 'coach-title');
    const inside = () => page.evaluate(() => document.querySelector('#coach-viewer').contains(document.activeElement) || document.activeElement === document.body);
    expect(await inside()).toBe(true);
    for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); expect(await inside()).toBe(true); }
    const ov = await page.evaluate(() => { const d = document.querySelector('#coach-viewer'); return d.scrollWidth - d.clientWidth; });
    expect(ov).toBeLessThanOrEqual(0);
    await page.keyboard.press('Escape');
    await expect(viewer(page)).toBeHidden();
    expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('file-coach');
  });
});

test('CSV: BOM, ";", CRLF, coma decimal, días solo con hábitos, vacíos sin 0 y fórmulas neutralizadas (BUG-12)', async ({ app, page }) => {
  // '\tTab': Schema.normalize recorta los espacios del borde, así que llega como "Tab" (no hay tabulador inicial).
  const notes = ['=HYPERLINK("http://x";"clic")', '+57 300', '-2 kg', '@SUMA(A1)', '\tTab', 'a; b "c"\ny'];
  const s = state({
    entries: [
      { id: 'e1', date: D(20), weight: 70 },
      ...notes.map((n, i) => ({ id: 'n' + i, date: D(10 - i), weight: 68.85, note: n })),
      { id: 'w', date: D(1), weight: 68.4, waist: 80, neck: 33, hip: 100 },
    ],
    foods: { [D(1)]: [food('Avena', 230.4, 8.25), food('Pollo', 250, 46)] },
    habits: { [D(0)]: { steps: 12000, water: 2.5, sleep: 7.25, trained: true }, [D(2)]: { trained: false } },
  });
  await app.open({ state: s });
  await app.tab('perfil');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#btn-export-csv').click()]);
  expect(dl.suggestedFilename()).toMatch(/\.csv$/);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  const lines = csv.slice(1).split('\r\n');
  expect(lines[0].split(';')).toHaveLength(16);
  expect(lines[0]).toContain('"Entrenó fuerza"');
  const row = (d) => lines.find((l) => l.startsWith(d + ';'));
  expect(row(D(1))).toMatch(new RegExp(`^${D(1)};68,4;80;33;100;[0-9]+,[0-9];480;54,3;20;10;2;;;;;""$`));
  expect(row(D(0))).toBe(`${D(0)};;;;;;;;;;;12000;2,5;7,3;Sí;""`);
  expect(row(D(2))).toBe(`${D(2)};;;;;;;;;;;;;;No;""`);
  // Ningún campo de texto empieza por = + - @ ni tabulador (una vez quitadas las comillas).
  for (const n of notes.slice(0, 4)) {
    const quoted = '"' + ("'" + n).replace(/"/g, '""') + '"';
    expect(csv, `nota ${JSON.stringify(n)}`).toContain(quoted);
  }
  expect(csv).toContain(';"Tab"');
  expect(csv).toContain('"a; b ""c""\ny"');
});
