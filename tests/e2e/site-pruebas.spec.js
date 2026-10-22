// Copia de pruebas (/pruebas/): espacio de nombres por entorno sobre el sitio REAL construido (npm run build:site).
// Raíz y /pruebas/ comparten origen: aquí se sirve el _site (raíz + pruebas/) en un mismo puerto y un mismo contexto.
const { test: base, expect } = require('@playwright/test');
const { execFileSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { acceptLegalIfPresent, FIXTURE_V1, PROFILE, D, state } = require('./helpers');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.txt': 'text/plain' };
const test = base.extend({
  site: [async ({}, use) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-'));
    execFileSync('node', [path.join(__dirname, '../../scripts/build-site.js'), '--out', dir], { stdio: 'pipe' });
    const server = http.createServer((req, res) => {
      let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (rel.endsWith('/')) rel += 'index.html';
      const file = path.join(dir, rel);
      if (!file.startsWith(dir + path.sep)) { res.writeHead(403).end(); return; }
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404).end('404'); return; }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(buf);
      });
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    await use({ base: `http://127.0.0.1:${server.address().port}`, dir });
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }, { scope: 'worker' }],
});
test.use({ serviceWorkers: 'allow' });

async function open(page, url) {
  await page.goto(url);
  await page.waitForFunction(() => typeof PGNS !== 'undefined' && document.readyState === 'complete');
  await acceptLegalIfPresent(page);
}
const NAMES = (page) => page.evaluate(async () => {
  await Photos.all();                                    // abre (y crea) la base IndexedDB de fotos
  return { ls: Object.keys(localStorage).sort(), idb: (await indexedDB.databases()).map((d) => d.name).sort(), caches: await caches.keys() };
});
const entry = (w) => state({ profile: { ...PROFILE, startWeight: w }, entries: [{ id: 'e1', date: D(20), weight: w }] });

test('(a) producción (env vacío): las claves y nombres NO cambian y un respaldo v1 se lee igual', async ({ page, site }) => {
  await open(page, site.base + '/');
  expect(await page.evaluate(() => [PGNS.env, PGNS.key('v1'), PGNS.key('backup'), PGNS.key('owner'), PGNS.key('lastBackup'), PGNS.key('backupSnooze'), PGNS.dbName(), PGNS.cacheName(28)]))
    .toEqual(['', 'perdida-grasa:v1', 'perdida-grasa:backup', 'perdida-grasa:owner', 'perdida-grasa:lastBackup', 'perdida-grasa:backupSnooze', 'perdida-grasa', 'perdida-grasa-v28']);
  page.on('dialog', (d) => d.accept());
  await page.setInputFiles('#file-import', { name: 'r.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(FIXTURE_V1)) });
  await expect(page.locator('#toast')).toHaveText(/importa/i);
  const names = await NAMES(page);
  expect(names.ls).toContain('perdida-grasa:v1');
  expect(names.ls.filter((k) => k.includes('pruebas'))).toEqual([]);
  expect(names.idb).toEqual(['perdida-grasa']);
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('perdida-grasa:v1')));
  expect(st.entries.length).toBe(FIXTURE_V1.entries.length);
  await expect(page.locator('#env-banner')).toHaveCount(0);
});

test('(b)(c) raíz y /pruebas/ no se ven entre sí en el mismo origen; banner solo en pruebas', async ({ page, site }) => {
  await open(page, site.base + '/');
  await page.evaluate((s) => localStorage.setItem('perdida-grasa:v1', JSON.stringify(s)), entry(70));
  await page.reload(); await acceptLegalIfPresent(page);
  await expect(page.locator('#st-weight')).toContainText('70');

  await open(page, site.base + '/pruebas/');
  const banner = page.locator('#env-banner');
  await expect(banner).toBeVisible();
  await expect(banner).toHaveText('VERSIÓN DE PRUEBAS — no uses datos reales');
  expect(await page.evaluate(() => [PGNS.env, PGNS.key('v1'), PGNS.dbName()])).toEqual(['pruebas', 'perdida-grasa-pruebas:v1', 'perdida-grasa-pruebas']);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('perdida-grasa-pruebas:v1') || '{}').entries || [])).toEqual([]); // no ve los datos de la raíz
  await expect(page.locator('#st-weight')).not.toContainText('70');
  await page.evaluate((s) => localStorage.setItem('perdida-grasa-pruebas:v1', JSON.stringify(s)), entry(80));
  await page.reload(); await acceptLegalIfPresent(page);
  await expect(page.locator('#st-weight')).toContainText('80');
  const n = await NAMES(page);
  expect(n.idb).toEqual(expect.arrayContaining(['perdida-grasa-pruebas']));

  await open(page, site.base + '/');                      // la raíz sigue con lo suyo
  await expect(page.locator('#st-weight')).toContainText('70');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('perdida-grasa:v1')).entries[0].weight)).toBe(70);
  await expect(page.locator('#env-banner')).toHaveCount(0);
  await expect(page.locator('meta[name=robots]')).toHaveCount(0);
});

test('(d) los service workers de la raíz y de pruebas conviven sin borrarse las cachés', async ({ page, site }) => {
  await open(page, site.base + '/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await open(page, site.base + '/pruebas/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller || true);
  const regs = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map((r) => new URL(r.scope).pathname).sort());
  expect(regs).toEqual(['/', '/pruebas/']);
  // Reabrir cada una fuerza install/activate otra vez: ninguna debe borrar la caché de la otra.
  await page.reload(); await page.waitForTimeout(500);
  await open(page, site.base + '/');
  await page.waitForTimeout(500);
  const keys = await page.evaluate(() => caches.keys());
  expect(keys.sort()).toEqual(['perdida-grasa-pruebas-v28', 'perdida-grasa-v28']);
  for (const k of keys) expect(await page.evaluate(async (k) => (await (await caches.open(k)).keys()).length, k)).toBeGreaterThan(5);
  expect(await page.evaluate(async () => (await (await caches.open('perdida-grasa-pruebas-v28')).keys()).some((r) => r.url.includes('/pruebas/app.js')))).toBe(true);
});
