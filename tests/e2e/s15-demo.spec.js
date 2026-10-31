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
  await expect(page.locator('#coach-filters button')).toHaveText(['Necesitan atención · 3', 'Todos · 8', 'Vencen pronto · 2', 'Sin pagar · 1', 'Requieren revisión · 2', 'Al día con registros · 5', 'Sin pesaje reciente · 0']);
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
  await expect(page.locator('#fc-ins li')).toHaveCount(15);
  await expect(page.locator('#fc-const-sum')).toContainText('6 de 8');
  await expect(page.locator('#coach-detail-view')).toContainText('Hábitos de la semana');
  await expect(page.locator('#coach-detail-view')).toContainText('Comidas');
  await expect(page.locator('#coach-detail-view')).toContainText('kcal');
  await expect(page.locator('#coach-detail-rutina-line')).toContainText('3 rutinas');   // estilo v2: + «Movilidad suave» (sin video)
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
  await expect(page.locator('#hd-tag')).toHaveText('Rutina de hoy · de tu coach');
  await expect(page.locator('#hd-title')).toHaveText('Piernas');
  await expect(page.locator('#semana-line')).toContainText('semanas constantes');
  expect(await page.locator('#view-panel').evaluate((v) => v.innerText)).not.toMatch(/kcal/i);
  await page.locator('#tab-comidas').click();
  await expect(page.locator('#view-micomidas')).toContainText('comidas anotadas');
  await expect(page.locator('#view-micomidas')).toContainText('kcal aprox.');
  await page.locator('#tab-registro').click();
  // r1 v1.13 (M1): Ana tiene metas de su coach → Progreso abre en «Metas», con el pie literal del concepto 5; «Medidas» sigue a un toque.
  await expect(page.locator('#view-metas')).toBeVisible();
  await expect(page.locator('#metas-foot')).toHaveText(/^Metas orientativas fijadas exclusivamente por tu coach\./);
  await page.locator('#view-metas .prog-seg button', { hasText: 'Medidas' }).click();
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
  await expect(page.locator('#insig-count')).toHaveText('10 de 15 insignias');
  await expect(page.locator('#insig-list li.earned')).toHaveCount(10);
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
  await expect(page.locator('#pause-title')).toHaveText('Tu plan con Coach Fit Demo está en pausa');
  // Reiniciar demo vuelve a la misma persona con los datos de ejemplo
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('perdida-grasa-demo:v1')); s.entries = []; localStorage.setItem('perdida-grasa-demo:v1', JSON.stringify(s)); });
  await page.locator('#tab-mas').click();
  await page.locator('#row-demo-reset').click();
  await expect(page.locator('#pause-title')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('perdida-grasa-demo:v1')).entries.length)).toBeGreaterThan(5);
});

test('r1 v1.13: ?rol=admin abre el panel admin con coaches ficticios (cifras del boceto M7) y el coach de la demo ve Analítica, Ranking y el aviso', async ({ page, site }) => {
  const log = await openDemo(page, site, '?rol=admin');
  await expect(page.locator('#adm-coaches .adm-row')).toHaveCount(5);
  await expect(page.locator('#adm-coaches .an-k').nth(0)).toContainText('4 / 5');
  await expect(page.locator('#adm-coaches .an-k').nth(1)).toContainText('11');
  await expect(page.locator('#adm-coaches .an-k').nth(2)).toContainText('USD 55');
  for (const t of ['Fuerza Studio', 'Laura Entrena', 'Vida Activa', 'Pablo Coach']) await expect(page.locator('#adm-coaches')).toContainText(t);
  await expect(page.locator('#adm-coaches .adm-row', { hasText: 'Pablo Coach' })).toContainText('Suspendido');
  expect(await page.locator('#view-admin-coaches').textContent()).not.toMatch(/Ana Demo|Beto Demo|Asesorado \d/);
  await page.locator('#tab-adm-uso').click();
  await expect(page.locator('#adm-uso .an-k').first()).toContainText('4');
  await page.locator('#tab-adm-coach').click();
  await expect(page.locator('#adm-coach .adm-days li.on')).toHaveCount(5);
  await page.locator('#tab-adm-avisos').click();
  await expect(page.locator('#adm-avisos li')).toHaveCount(2);
  expect(log.errors).toEqual([]);
  expect(log.external).toEqual([]);
  // El coach de la demo
  await page.evaluate(() => localStorage.clear());
  await openDemo(page, site, '?rol=coach');
  await expect(page.locator('#coach-avisos .pa-card')).toContainText('Aviso de la plataforma');
  await page.locator('#tab-analitica').click();
  await expect(page.locator('#an-resumen .an-glow')).toContainText('Constancia promedio');
  await expect(page.locator('#an-resumen .an-lgd')).toContainText('2 estancados 3+ sem.');
  // Tendencia con clic: «estancados» lista a esas personas y una fila abre su ficha (con Anterior / Siguiente)
  await page.locator('#an-resumen .an-lgd-btn[data-trend="estancado"]').click();
  await expect(page.locator('#sheet-tend')).toBeVisible();
  await expect(page.locator('#st-list .an-li-t b')).toHaveText([/^Beto/, /^Gina/]);
  for (const pill of await page.locator('#st-list .st-pill').allTextContents()) expect(pill).toMatch(/^estable \d+ sem\.$/);
  await expect(page.locator('#st-list .st-li').first()).toContainText('Último pesaje:');
  await page.keyboard.press('Escape');
  await expect(page.locator('#sheet-tend')).toBeHidden();
  await page.locator('#an-resumen .an-seg-b[data-trend="sin_datos"]').click();
  await expect(page.locator('#st-list .st-li')).toHaveCount(1);
  await expect(page.locator('#st-list .st-pill')).toHaveText('sin pesajes suficientes');
  await page.locator('#st-close').click();
  await page.locator('#an-resumen .an-lgd-btn[data-trend="estancado"]').click();
  const gina = await page.locator('#st-list .an-li-t b').nth(1).textContent();
  await page.locator('#st-list .st-li').nth(1).click();
  await expect(page.locator('#coach-detail-title')).toHaveText(gina);
  await page.locator('#btn-coach-next').click();
  await expect(page.locator('#coach-detail-title')).not.toHaveText(gina);
  await page.locator('#btn-coach-prev').click();
  await expect(page.locator('#coach-detail-title')).toHaveText(gina);
  await page.locator('#tab-analitica').click();
  await page.locator('#ant-ranking').click();
  await expect(page.locator('.rk-li')).toHaveCount(8);   // por constancia: los 8 (ya no hay «Progreso a la meta», concepto 7)
  await expect(page.locator('[data-by="meta"]')).toHaveCount(0);
  await page.locator('[data-by="puntos"]').click();
  await expect(page.locator('.rk-apart')).toContainText('Carla Demo');   // no comparte hábitos: sin puesto, nunca 0
});

test('v1.15: ?rol=asesorado ve sus puntos y la meta del team en curso (sin datos de nadie); ?rol=coach ve la meta, el ranking por puntos y los filtros', async ({ page, site }) => {
  await openDemo(page, site, '?rol=asesorado');
  if (await page.locator('#btn-aviso-politica').isVisible()) await page.locator('#btn-aviso-politica').click();
  await expect(page.locator('#home-puntos')).toHaveText(/^\d+ puntos esta semana( · \+\d+ hoy)? ›$/);
  await expect(page.locator('#home-team .team-title')).toHaveText('Entre todos: 20 entrenos');
  await expect(page.locator('#home-team .team-line')).toHaveText(/^\d+ de 20 entrenos · 5 personas sumando$/);
  for (const n of ['Beto', 'Elena', 'Fabio', 'Hugo']) await expect(page.locator('#home-team')).not.toContainText(n);
  await page.locator('#home-puntos').click();
  await expect(page.locator('#pt-week')).toBeVisible();
  await expect(page.locator('#pt-cmp')).toContainText('Tu mejor semana');
  await page.evaluate(() => PGDemo.enter('coach'));   // «Cambiar de rol»
  await expect(page.locator('#coach-clients .cli-pay-row')).toHaveCount(8);
  await page.locator('#tab-mas').click();
  await page.locator('#row-c-retos').click();
  await expect(page.locator('#rt-team-box .team-line')).toHaveText(/^\d+ de 20 entrenos · 5 personas sumando$/);
  await page.locator('#tab-analitica').click();
  await page.locator('#ant-ranking').click();
  await page.locator('[data-by="puntos"]').click();
  await expect(page.locator('.rk-li')).toHaveCount(6);   // Carla y Gina no comparten hábitos: aparte, sin puesto
  await expect(page.locator('.rk-apart')).toContainText('Gina Demo');
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

// M6 · Exportar a Excel en la demo (?rol=coach): datos ficticios, servidor falso; el historial trae la exportación sembrada y la nueva.
test('M6 en la demo: el coach exporta un .xlsx con las 4 hojas y el Léame, sin pedir nada a ningún servidor', async ({ page, site }) => {
  test.setTimeout(90_000);
  const { workbook } = require('../xlsx-reader');
  const log = await openDemo(page, site, '?rol=coach');
  await expect(page.locator('#coach-clients .cli-pay-row')).toHaveCount(8);
  if (await page.locator('#btn-aviso-politica').isVisible()) await page.locator('#btn-aviso-politica').click();
  await page.locator('#tab-mas').click();
  await page.locator('#row-c-exportar').click();
  await expect(page.locator('#xl-who .xl-av')).toHaveCount(8);
  await expect(page.locator('#xl-hist .xl-hist-row')).toHaveCount(1);
  await page.locator('#xl-custody').check();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#btn-xl').click()]);
  expect(dl.suggestedFilename()).toMatch(/^exportacion-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const wb = workbook(fs.readFileSync(await dl.path()));
  expect(wb.sheets.map((s) => s.name)).toEqual(['Leame', 'Medidas', 'Comidas', 'Hábitos', 'Entrenos']);
  expect(wb.sheets[1].rows.length).toBeGreaterThan(10);
  expect(JSON.stringify(wb.sheets[3].rows)).not.toContain('Carla Demo');   // Carla no comparte hábitos
  if (process.env.XL_SHOTS) { fs.mkdirSync(process.env.XL_SHOTS, { recursive: true }); fs.copyFileSync(await dl.path(), path.join(process.env.XL_SHOTS, dl.suggestedFilename().replace('.xlsx', '-demo.xlsx'))); }
  await expect(page.locator('#xl-hist .xl-hist-row')).toHaveCount(2);
  await noOverflow(page);
  expect(log.external).toEqual([]);
  expect(log.errors).toEqual([]);
});

