// Copia DEMO (/demo/): servidor falso en el navegador y datos ficticios, sin tocar ningún servidor. Se prueba sobre el sitio REAL construido
// (npm run build:site) servido en un puerto propio, como site-pruebas.spec.js. Reloj real: la demo siempre se siembra respecto a «hoy».
const { test: base, expect } = require('@playwright/test');
const { execFileSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.txt': 'text/plain' };
const WIDE = '*{font-family:"DejaVu Sans",Verdana,sans-serif !important; letter-spacing:.02em}';
const test = base.extend({
  site: [async ({}, use) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-demo-'));
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
    await use({ base: `http://127.0.0.1:${server.address().port}` });
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }, { scope: 'worker' }],
});
test.use({ serviceWorkers: 'block' });

// Abre la demo vigilando errores y TODAS las peticiones (solo se permite el propio servidor de la prueba, blob: y data:).
async function openDemo(page, site, query = '') {
  const log = { errors: [], external: [] };
  page.on('pageerror', (e) => log.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') log.errors.push('console: ' + m.text()); });
  page.on('dialog', (d) => d.accept());
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith(site.base + '/') && !/^(blob|data):/.test(u)) log.external.push(u); });
  await page.goto(site.base + '/demo/' + query);
  return log;
}
const enterCoach = async (page, site) => {
  const log = await openDemo(page, site);
  await page.getByRole('button', { name: /Ver como coach/ }).click();
  await expect(page.locator('#coach-clients .cli-pay-row')).toHaveCount(8);
  return log;
};
const enterClient = async (page, site, query = '') => {
  const log = await openDemo(page, site, query);
  if (!query) await page.getByRole('button', { name: /Ver como asesorado/ }).click();
  await expect(page.locator('.home-greeting').filter({ visible: true }).first()).toHaveText('Hola, Ana');
  return log;
};
const noOverflow = async (page) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const bad = await page.evaluate(() => [...document.querySelectorAll('button, a[href], input, select')].filter((el) => el.offsetParent && !el.closest('.hidden, dialog:not([open]), [inert]')).filter((el) => { const r = el.getBoundingClientRect(); return r.width && (r.left < -0.5 || r.right > 390.5); }).map((el) => el.id || el.className));
  expect(bad).toEqual([]);
};

test('entrada: banner DEMO, dos botones y nada sale a la red; no hay pantalla de correo, captcha ni aceptación legal', async ({ page, site }) => {
  const log = await openDemo(page, site);
  await expect(page.locator('#demo-banner')).toHaveText('DEMO — datos ficticios; nada se guarda en ningún servidor');
  await expect(page.locator('#demo-banner')).toBeVisible();
  await expect(page.getByRole('button', { name: /Ver como coach/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Ver como asesorado/ })).toBeVisible();
  expect(await page.evaluate(() => [PGNS.env, PGNS.key('v1'), PGNS.dbName(), Remote.config().mode, Remote.config().url])).toEqual(['demo', 'perdida-grasa-demo:v1', 'perdida-grasa-demo', 'fake', '']);
  await page.getByRole('button', { name: /Ver como coach/ }).click();
  await expect(page.locator('#coach-clients .cli-pay-row')).toHaveCount(8);
  for (const sel of ['#account', '#solo', '#consent']) await expect(page.locator(sel)).toBeHidden();
  await expect(page.locator('#demo-banner')).toBeVisible();
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys.length).toBeGreaterThan(3);
  expect(keys.every((k) => k.startsWith('perdida-grasa-demo:'))).toBe(true);   // nada en las claves de la raíz ni de /pruebas/
  expect(log.external).toEqual([]);
  expect(log.errors).toEqual([]);
});

test('coach: lista con el «sin pagar», ficha con medidas, hábitos, comidas, fotos y rutinas; abre una foto', async ({ page, site }) => {
  const log = await enterCoach(page, site);
  await expect(page.locator('#coach-title-list')).toHaveText('Mis asesorados');
  // UX Etapa 1: filtros y semáforo variado (rojo, ámbar y verde, cada uno con su motivo en texto)
  await expect(page.locator('#coach-filters button')).toHaveText(['Necesitan atención · 3', 'Todos · 8', 'Vencen pronto · 2', 'Sin pagar · 1']);
  await page.locator('#coach-filters button', { hasText: 'Todos' }).click();
  const sem = (await page.locator('#coach-clients .sem').allTextContents()).map((x) => x.replace(/\s+/g, ' ').trim());
  expect(new Set(sem)).toEqual(new Set(['▲ Atención', '● Revisar', '✓ Al día']));
  await expect(page.locator('#coach-clients .cli-pay-row').filter({ hasText: 'Diego Demo' })).toContainText('Sin registrar desde hace 9 días');
  await expect(page.locator('#coach-clients .cli-pay-row').filter({ hasText: 'Gina Demo' })).toContainText('3 días sin registrar');
  await expect(page.locator('#coach-clients .cli-pay-row').filter({ hasText: 'Beto Demo' })).toContainText('Duro');
  const diego = page.locator('#coach-clients .cli-pay-row').filter({ hasText: 'Diego Demo' });
  await expect(diego).toContainText('No pagó');
  const names = (await page.locator('#coach-clients .cli-pay-row strong, #coach-clients .cli-pay-row .cli-name').allTextContents()).join(' ');
  for (const n of ['Ana', 'Beto', 'Carla', 'Diego', 'Elena', 'Fabio', 'Gina', 'Hugo']) expect(names + (await page.locator('#coach-clients').innerText())).toContain(n + ' Demo');
  await page.locator('#coach-clients .cli-pay-row').filter({ hasText: 'Ana Demo' }).locator('.cli-main').click();
  await expect(page.locator('#coach-detail-title')).toHaveText('Ana Demo');
  await expect(page.locator('#coach-detail-medidas')).toContainText('Abdomen');
  await expect(page.locator('#coach-detail-medidas')).toContainText(/−5,\d/);
  await expect(page.locator('#fc-semana-title')).toContainText('Esta semana');
  await expect(page.locator('#fc-esfuerzo')).toContainText('Esfuerzo:');
  await expect(page.locator('#fc-ins li')).toHaveCount(8);
  await expect(page.locator('#fc-const-sum')).toContainText('6 de 8');
  await expect(page.locator('#coach-detail-view')).toContainText('Hábitos de la semana');
  await expect(page.locator('#coach-detail-view')).toContainText('Comidas');
  await expect(page.locator('#coach-detail-view')).toContainText('kcal');
  await expect(page.locator('#coach-detail-rutina-line')).toContainText('2 rutinas');
  await expect(page.locator('#coach-detail-view')).toContainText('Pecho y tríceps');
  await expect(page.locator('#coach-detail-view')).toContainText('Piernas');
  await page.getByRole('button', { name: /Ver foto:/ }).first().click();
  await expect(page.locator('#coach-photo-view img')).toBeVisible();
  await expect.poll(() => page.locator('#coach-photo-view img').evaluate((i) => i.complete && i.naturalWidth > 0)).toBe(true);
  // Una ficha con poco: el recién llegado
  await page.locator('#btn-coach-back').click();
  await page.locator('#coach-clients .cli-pay-row').filter({ hasText: 'Hugo Demo' }).locator('.cli-main').click();
  await expect(page.locator('#coach-detail-title')).toHaveText('Hugo Demo');
  expect(log.external).toEqual([]);
  expect(log.errors).toEqual([]);
});

test('coach: Invitar muestra el código y el QR de ejemplo; Más tiene «Cambiar de rol» y «Reiniciar demo»', async ({ page, site }) => {
  await enterCoach(page, site);
  await page.locator('#tab-invitar').click();
  await expect(page.locator('#view-invitar')).toContainText('FTDM72');
  await page.locator('#tab-mas').click();
  await expect(page.locator('#row-demo-rol')).toBeVisible();
  await expect(page.locator('#row-demo-reset')).toBeVisible();
  await expect(page.locator('#view-mas .needs-login')).toBeHidden();   // sin «Cerrar sesión»
  await expect(page.locator('#row-c-acuerdo')).toBeVisible();
  await page.locator('#row-demo-rol').click();
  await expect(page.getByRole('button', { name: /Ver como asesorado/ })).toBeVisible();
  await page.getByRole('button', { name: /Ver como asesorado/ }).click();
  await expect(page.locator('.tabbar button:visible')).toHaveCount(5);
});

test('asesorado: Inicio «Mi día», Comidas, Entrenar (con animación), Progreso con gráficas, Fotos con comparador, insignias y bitácora', async ({ page, site }) => {
  const log = await enterClient(page, site);
  // Inicio: nota del coach sin leer ARRIBA, «Mi día», una sola rutina y la semana (sin kcal en grande)
  await expect(page.locator('#coach-notes')).toContainText('Qué buena semana, Ana');
  await expect(page.locator('#home-dia')).toBeVisible();
  await expect(page.locator('#dia-agua-t')).toHaveText('Agua 3 / 8');
  await expect(page.locator('#dia-sueno-t')).toHaveText('Sueño 7–8 h');
  await expect(page.locator('#hd-title')).toHaveText('Rutina de hoy: Piernas');
  await expect(page.locator('#semana-line')).toContainText('semanas constantes');
  expect(await page.locator('#view-panel').evaluate((v) => v.innerText)).not.toMatch(/kcal/i);
  await page.locator('#tab-comidas').click();
  await expect(page.locator('#view-micomidas')).toContainText('comidas anotadas');
  await expect(page.locator('#view-micomidas')).toContainText('kcal aprox.');
  await page.locator('#tab-registro').click();
  await expect(page.locator('#view-progreso svg').first()).toBeVisible();
  expect(await page.locator('#medidas-chart svg circle').count()).toBeGreaterThanOrEqual(5);   // pesajes tenues + línea de tendencia
  await expect(page.locator('#medidas-chart-sub')).not.toHaveText('');
  await expect(page.locator('#prog-stats')).toContainText('6 de 8');
  await page.locator('#view-progreso .prog-seg button', { hasText: 'Fotos' }).click();
  await expect(page.locator('#view-fotos')).toContainText('Comparar');
  expect(await page.locator('#view-fotos img').count()).toBeGreaterThanOrEqual(6);
  await expect(page.locator('#foto-hero-tag')).toHaveText('Visible para tu coach');
  await expect(page.locator('#gallery .vis-tag.vis-off')).toHaveCount(1);   // una foto que Ana ocultó
  await expect.poll(() => page.locator('#view-fotos img').first().evaluate((i) => i.complete && i.naturalWidth > 0)).toBe(true);
  await page.locator('#btn-fotovistas').click();
  await expect(page.locator('#fv-list li')).toHaveCount(4);
  await page.evaluate(() => PGNav.show('insignias'));
  await expect(page.locator('#insig-count')).toHaveText('6 de 8 insignias');
  await expect(page.locator('#insig-list li.earned')).toHaveCount(6);
  await page.locator('#tab-entrenar').click();
  await expect(page.locator('#view-rutina')).toContainText('Rutina de hoy');
  await expect(page.locator('#view-rutina')).toContainText('Pecho y tríceps');
  await expect(page.locator('#view-rutina')).not.toContainText('Espalda y bíceps');
  await page.locator('#view-rutina details.rut-ex', { hasText: 'Sentadilla' }).first().locator('summary').click();
  await expect.poll(() => page.locator('#view-rutina .rut-gif img').first().evaluate((i) => i.complete && i.naturalWidth === 120)).toBe(true);
  expect(log.external).toEqual([]);
  expect(log.errors).toEqual([]);
});

test('asesorado que no pagó: ve la pantalla de pausa; Reiniciar demo restaura los datos', async ({ page, site }) => {
  await openDemo(page, site);
  await page.getByRole('button', { name: /no pagó/ }).click();
  await expect(page.locator('#pause-title')).toBeVisible();
  await expect(page.locator('#pause-title')).toHaveText('Tu acceso está en pausa');
  // Reiniciar demo vuelve a la misma persona con los datos de ejemplo
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('perdida-grasa-demo:v1')); s.entries = []; localStorage.setItem('perdida-grasa-demo:v1', JSON.stringify(s)); });
  await page.locator('#tab-mas').click();
  await page.locator('#row-demo-reset').click();
  await expect(page.locator('#pause-title')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('perdida-grasa-demo:v1')).entries.length)).toBeGreaterThan(5);
});

test('enlace directo ?rol=coach entra sin pasar por la pantalla de elegir', async ({ page, site }) => {
  await openDemo(page, site, '?rol=coach');
  await expect(page.locator('#coach-clients .cli-pay-row')).toHaveCount(8);
  expect(new URL(page.url()).search).toBe('');
});

for (const scheme of ['light', 'dark']) {
  test(`claro/oscuro (${scheme}) con letra ancha a 390 px: sin desbordes en entrada, lista, ficha y vista del asesorado`, async ({ page, site }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openDemo(page, site);
    await page.addStyleTag({ content: WIDE });
    await noOverflow(page);
    await page.getByRole('button', { name: /Ver como coach/ }).click();
    await expect(page.locator('#coach-clients .cli-pay-row')).toHaveCount(8);
    await page.addStyleTag({ content: WIDE });
    await noOverflow(page);
    await page.locator('#coach-filters button', { hasText: 'Todos' }).click();
    await page.locator('#coach-clients .cli-pay-row').filter({ hasText: 'Ana Demo' }).locator('.cli-main').click();
    await expect(page.locator('#coach-detail-title')).toHaveText('Ana Demo');
    await noOverflow(page);
    await page.locator('#tab-mas').click();
    await noOverflow(page);
    await page.locator('#row-demo-rol').click();
    await page.addStyleTag({ content: WIDE });
    await page.getByRole('button', { name: /Ver como asesorado/ }).click();
    await expect(page.locator('#view-panel')).toContainText('Hola, Ana');
    await page.addStyleTag({ content: WIDE });
    await noOverflow(page);
    for (const t of ['#tab-comidas', '#tab-entrenar', '#tab-registro', '#tab-mas']) { await page.locator(t).click(); await noOverflow(page); }
    for (const v of ['habitos', 'medidas', 'fotos', 'insignias']) { await page.evaluate((x) => PGNav.show(x), v); await noOverflow(page); }
  });
}

test('la raíz y /pruebas/ no cargan nada de la demo', async ({ page, site }) => {
  const seen = [];
  page.on('request', (r) => seen.push(r.url()));
  for (const p of ['/', '/pruebas/']) {
    await page.goto(site.base + p);
    await page.waitForFunction(() => typeof PGNS !== 'undefined' && document.readyState === 'complete');
    expect(await page.evaluate(() => [typeof PGDemo, typeof PGDemoData, !!document.querySelector('#demo-banner, #demo-gate, #row-demo-rol'), PG_CONFIG.demo === true])).toEqual(['undefined', 'undefined', false, false]);
  }
  expect(seen.filter((u) => /demo/.test(new URL(u).pathname))).toEqual([]);
  expect(seen.some((u) => u.includes('remote-fake.js'))).toBe(false);
});
