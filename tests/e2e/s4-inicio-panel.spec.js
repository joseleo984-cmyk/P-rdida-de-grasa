// Sprint 4: Inicio del cliente (tarjetas) y panel del coach (filas con estado). Fuente ancha a 390 px: regresión de desborde.
// Con CAPTURAS=1 guarda capturas claro/oscuro en equipo/qa-capturas/.
const { test, expect, state, D, CONSENT } = require('./helpers');
const path = require('path');
const fs = require('fs');
const { loginAsCoach } = require('./fake-helpers');

const WIDE = '*{font-family:"DejaVu Sans",Verdana,sans-serif !important; letter-spacing:.02em}';
const SHOTS = path.resolve(__dirname, '../../equipo/qa-capturas');
const FAKE = 'index.html?remote=fake';
const SKIP = { 'perdida-grasa:account-skip': '1' };

async function shots(page, name) {
  if (!process.env.CAPTURAS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.screenshot({ path: path.join(SHOTS, `${name}-${scheme === 'light' ? 'claro' : 'oscuro'}.png`), fullPage: false });
  }
  await page.emulateMedia({ colorScheme: 'light' });
}
const food = (id, meal, name, kcal, protein) => ({ id, name, meal, kcal, protein, carbs: 10, fat: 5 });
const homeState = (over = {}) => state({
  entries: [{ id: 'a', date: D(14), weight: 70 }, { id: 'b', date: D(7), weight: 69 }, { id: 'c', date: D(0), weight: 68.4 }],
  foods: {
    [D(1)]: [food('f1', 'Desayuno', 'Arepa con huevo', 380, 18), food('f2', 'Desayuno', 'Café con leche', 90, 4), food('f3', 'Cena', 'Sopa', 300, 15)],
    [D(0)]: [food('f4', 'Almuerzo', 'Pollo con arroz', 650, 45)],
  },
  habits: { [D(0)]: { water: 1.25, trained: false } },
  consent: CONSENT, ...over,
});
// Bloques de la pantalla Inicio sin desborde y con tamaños mínimos (texto ≥ 13 px, toques ≥ 48 px).
async function checkHome(page, where) {
  const r = await page.evaluate(() => {
    const W = window.innerWidth;
    const out = { over: document.documentElement.scrollWidth > W, cut: [], smallText: [], smallTargets: [] };
    for (const el of document.querySelectorAll('#view-panel .home-card, #view-panel .home-repeat, #view-panel .home-head')) {
      if (el.offsetParent === null) continue;
      const q = el.getBoundingClientRect();
      if (q.left < -0.5 || q.right > W + 0.5) out.cut.push(el.id || el.className);
    }
    for (const el of document.querySelectorAll('#home-today *, #home-weight *, #btn-repeat-breakfast *, #home-greeting, #home-date')) {
      if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      if (parseFloat(getComputedStyle(el).fontSize) < 13) out.smallText.push(el.id || el.className || el.tagName);
    }
    const b = document.querySelector('#btn-repeat-breakfast');
    if (b && b.offsetParent && b.getBoundingClientRect().height < 48) out.smallTargets.push('repetir');
    return out;
  });
  expect(r.over, `scroll horizontal en ${where}`).toBe(false);
  expect(r.cut, `tarjetas fuera de pantalla en ${where}`).toEqual([]);
  expect(r.smallText, `texto menor de 13 px en ${where}`).toEqual([]);
  expect(r.smallTargets, `toques menores de 48 px en ${where}`).toEqual([]);
}

test('Inicio del cliente: saludo, Hoy llevas, repetir el desayuno de ayer, Tu peso; lo anterior sigue debajo', async ({ app, page }) => {
  await app.open({ state: homeState(), prefs: { 'perdida-grasa:lastBackup': '2026-10-20T10:00:00.000Z' } });
  await expect(page.locator('#home-greeting')).toHaveText('Hola, Ana');
  await shots(page, 'inicio'); // capturas con la letra normal; las comprobaciones siguen con letra ancha
  await page.addStyleTag({ content: WIDE });
  await expect(page.locator('#home-date')).toHaveText('Miércoles 21 de octubre');
  // Hoy llevas: 650 kcal consumidas de la meta del plan
  await expect(page.locator('#home-kcal')).toHaveText('650');
  await expect(page.locator('#home-goal')).toHaveText(/^Meta [\d.]+ kcal$/);
  await expect(page.locator('#home-left')).toHaveText(/^Te quedan [\d.]+ kcal$/);
  await expect(page.locator('#home-protein')).toHaveText(/^45 de \d+ g$/);
  await expect(page.locator('#home-water')).toHaveText('5 de 8 vasos');
  const bar = page.locator('#home-kcal-bar');
  await expect(bar).toHaveAttribute('role', 'progressbar');
  expect(Number(await bar.getAttribute('aria-valuenow'))).toBeGreaterThan(20);
  // Tu peso
  await expect(page.locator('#home-weight-value')).toHaveText('68,4');
  await expect(page.locator('#home-weight-diff')).toHaveText('0,6 kg menos que la semana pasada');
  await expect(page.locator('#home-spark')).toHaveAttribute('aria-label', 'Tu peso viene bajando');
  await expect(page.locator('#home-spark')).toHaveAttribute('role', 'img');
  await checkHome(page, 'Inicio con datos');
  // Lo que ya existía sigue accesible debajo de las tarjetas
  for (const sel of ['#panel-summary', '#st-weight', '#goal-bar', '#chart', '#today-macros', '#tips', '#backup-banner']) await expect(page.locator(sel)).toBeAttached();
  await expect(page.locator('#panel-summary')).toBeVisible();
  await expect(page.locator('#view-panel').getByRole('button', { name: 'Registrar comida' })).toBeVisible();
  const order = await page.evaluate(() => ['#home-today', '#btn-repeat-breakfast', '#home-weight', '#panel-summary', '#today-macros'].map((s) => document.querySelector(s).getBoundingClientRect().top));
  expect(order).toEqual([...order].sort((a, b) => a - b));
  // Repetir el desayuno de ayer: copia SOLO el desayuno a hoy con la función existente y se puede deshacer
  const rep = page.locator('#btn-repeat-breakfast');
  await expect(rep).toBeVisible();
  await expect(rep).toContainText('Repetir el desayuno de ayer');
  await rep.click();
  await expect(page.locator('#toast')).toContainText('Se copiaron 2 alimentos a hoy');
  const foods = await page.evaluate(() => JSON.parse(localStorage.getItem('perdida-grasa:v1')).foods);
  expect(foods[D(0)].map((x) => x.name).sort()).toEqual(['Arepa con huevo', 'Café con leche', 'Pollo con arroz']);
  await expect(page.locator('#home-kcal')).toHaveText('1.120');
  await expect(rep).toBeHidden();
  await expect(page.locator('#home-today-title')).toBeFocused();
  await page.locator('#toast').getByRole('button', { name: 'Deshacer' }).click();
  await expect(page.locator('#home-kcal')).toHaveText('650');
  await expect(rep).toBeVisible();
  await checkHome(page, 'Inicio tras repetir');
});

test('Inicio: sin desayuno ayer el botón no aparece', async ({ app, page }) => {
  await app.open({ state: homeState({ foods: { [D(1)]: [food('f3', 'Cena', 'Sopa', 300, 15)] } }) });
  await expect(page.locator('#btn-repeat-breakfast')).toBeHidden();
});

test('Inicio sin perfil ni registros: tarjetas vacías claras, sin línea de tendencia y sin desborde (fuente ancha)', async ({ app, page }) => {
  await app.open({ state: state({ profile: null, entries: [], consent: CONSENT }) });
  await page.addStyleTag({ content: WIDE });
  await page.evaluate(() => PGNav.show('panel'));
  await expect(page.locator('#home-greeting')).toHaveText('Hola');
  await expect(page.locator('#home-kcal')).toHaveText('0');
  await expect(page.locator('#home-left')).toHaveText('');
  await expect(page.locator('#home-weight-value')).toHaveText('—');
  await expect(page.locator('#home-weight-diff')).toHaveText('Aún no registras tu peso');
  await expect(page.locator('#home-spark')).toBeHidden();
  await expect(page.locator('#btn-repeat-breakfast')).toBeHidden();
  await expect(page.locator('#onboarding')).toBeVisible();
  await checkHome(page, 'Inicio vacío');
});

test('Inicio con nombre largo y 16 de zoom de letra: no ensancha la página', async ({ app, page }) => {
  const long = 'Maria'.repeat(8);
  await app.open({ state: homeState({ profile: { ...homeState().profile, name: long } }) });
  await page.addStyleTag({ content: WIDE + 'html{font-size:20px}' });
  await expect(page.locator('#home-greeting')).toHaveText('Hola, ' + long);
  await checkHome(page, 'nombre largo y letra grande');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  expect(await page.evaluate(() => document.querySelector('.tabbar').getBoundingClientRect().right)).toBeLessThanOrEqual(390.5);
});

// ---- Panel del coach: datos de clientes simulados en la frontera (PGAccount.remote.coach), sin tocar el servidor ----
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function wire(name, clientId, spec, shares) {
  const t = '2026-10-20T10:00:00.000Z';
  const records = spec.map(([n, w], i) => ({ id: U(clientId * 100 + i), kind: 'entry', nkey: D(n), date: D(n), data: { weight: w, note: 'NOTA PRIVADA' }, updatedAt: t }));
  return { info: { clientId: U(clientId), displayName: name, shares, since: '2026-09-01T10:00:00.000Z', overFreeLimit: false }, data: { records, photos: [], comments: [] } };
}
const ALL = { body: true, nutrition: true, habits: true, notes: false, photos: false };
const CLIENTS = [
  wire('María Rojas', 1, [[7, 70]], ALL),
  wire('Juan Gómez', 2, [[3, 80]], ALL),
  wire('Ana', 3, [[7, 69], [0, 68.4]], ALL),
  wire('Carlos Pérez', 4, [[7, 83.2], [0, 82.1]], ALL),
  wire('<img src=x onerror="window.__xss=1">Luisa Mena', 5, [[4, 71.3], [1, 71]], { ...ALL, body: false }),
  wire('Sin Datos', 6, [], ALL),
];
async function openCoachPanel(app, page) {
  await app.open({ path: FAKE, state: state({ consent: CONSENT }), prefs: SKIP });
  await loginAsCoach(page, 'coach@x.co', 'Coach Sprint 4');
  await page.evaluate((cs) => {
    const c = window.PGAccount.remote.coach;
    c.clients = async () => cs.map((x) => x.info);
    c.clientData = async (id) => { const x = cs.find((y) => y.info.clientId === id); if (!x) { const e = new Error('forbidden'); e.code = 'forbidden'; throw e; } return x.data; };
  }, CLIENTS);
  await page.locator('#tab-coach').click();
  await expect(page.locator('#coach-clients .cli-row')).toHaveCount(CLIENTS.length);
}

test('Panel del coach: Mis clientes, subtítulo, filas con avatar, estado con texto y peso solo si se comparte (fuente ancha)', async ({ app, page }) => {
  await openCoachPanel(app, page);
  await expect(page.locator('#coach-title-list')).toHaveText('Mis clientes');
  await shots(page, 'panel');
  await page.addStyleTag({ content: WIDE });
  await expect(page.locator('#coach-subtitle')).toHaveText('6 clientes · 3 necesitan un mensaje hoy');
  const rows = page.locator('#coach-clients .cli-row');
  // más urgentes primero: sin registrar, se atrasa, al día
  await expect(rows.locator('.cli-name')).toHaveText(['Sin Datos', 'María Rojas', 'Juan Gómez', '<img src=x onerror="window.__xss=1">Luisa Mena', 'Ana', 'Carlos Pérez']);
  await expect(rows.locator('.chip')).toHaveText(['Sin registrar', 'Sin registrar', 'Se atrasa', 'Al día', 'Al día', 'Al día']);
  await expect(rows.locator('.cli-line')).toHaveText(['Aún no ha registrado nada', 'Último registro: hace 7 días', 'Último registro: hace 3 días',
    'Ayer registró', 'Hoy registró · 68,4 kg (\u22120,6)', 'Hoy registró · 82,1 kg (\u22121,1)']);
  await expect(rows.locator('.cli-av')).toHaveText(['SD', 'MR', 'JG', 'IS', 'A', 'CP']);
  // el cliente que no comparte el cuerpo: sin peso ni en la fila ni en la ficha
  await expect(page.locator('#coach-clients')).not.toContainText('71');
  await expect(page.locator('body')).not.toContainText('NOTA PRIVADA');
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  // accesibilidad: cada fila anuncia nombre, estado y detalle; toques ≥ 48 px; sin desborde
  await expect(rows.nth(1)).toHaveAttribute('aria-label', 'María Rojas: Sin registrar. Último registro: hace 7 días');
  const m = await page.evaluate(() => {
    const W = window.innerWidth;
    return { over: document.documentElement.scrollWidth > W, small: [...document.querySelectorAll('#coach-clients .cli-row, #btn-coach-refresh')].filter((e) => e.getBoundingClientRect().height < 48).length,
      cut: [...document.querySelectorAll('#coach-clients .cli-row')].filter((e) => { const q = e.getBoundingClientRect(); return q.left < -0.5 || q.right > W + 0.5; }).length,
      chipCut: [...document.querySelectorAll('#coach-clients .chip')].filter((e) => { const q = e.getBoundingClientRect(); return q.right > W + 0.5 || e.scrollWidth > e.clientWidth + 0.5; }).length,
      tiny: [...document.querySelectorAll('#coach-clients .cli-line, #coach-clients .chip, #coach-subtitle')].filter((e) => parseFloat(getComputedStyle(e).fontSize) < 13).length };
  });
  expect(m).toEqual({ over: false, small: 0, cut: 0, chipCut: 0, tiny: 0 });
  // abrir la ficha sigue funcionando y muestra el estado con texto
  await rows.nth(4).click(); // Ana
  await expect(page.locator('#coach-detail-title')).toHaveText('Ana');
  await expect(page.locator('#coach-detail-light')).toContainText('Al día');
  await expect(page.locator('#coach-detail-light')).toContainText('Hoy registró · 68,4 kg');
  await page.locator('#btn-coach-back').click();
  await expect(rows.nth(4)).toBeFocused();
});

test('Panel del coach sin clientes: subtítulo claro y sin errores', async ({ app, page }) => {
  await app.open({ path: FAKE, state: state({ consent: CONSENT }), prefs: SKIP });
  await loginAsCoach(page, 'coach2@x.co', 'Coach vacío');
  await page.locator('#tab-coach').click();
  await expect(page.locator('#coach-clients')).toContainText('Aún no tienes clientes');
  await expect(page.locator('#coach-subtitle')).toHaveText('Aún no tienes clientes');
});
