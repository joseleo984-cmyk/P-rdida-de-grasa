// Sprint 11 («App para coaches»): ayudantes de las E2E con producto 'coach' y soloNube, contra el servidor FALSO.
// La app oficial se sirve con config.js vacío; aquí se intercepta config.js para añadir `producto` y `soloNube`
// (igual que config.pruebas.js, pero con modo 'fake' y sin claves). Cada «teléfono» es un contexto con su propio localStorage.
const { expect } = require('./helpers');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const WIDE = '*{font-family:"DejaVu Sans",Verdana,sans-serif !important; letter-spacing:.02em}';   // letra ancha: lo peor para el desborde
const SHOTS = path.resolve(__dirname, '../../equipo/qa-capturas');
const NOW = '2026-10-21T12:00:00-05:00';
const sha = (t) => crypto.createHash('sha256').update(t, 'utf8').digest('hex');
const shot = async (page, name, opts = {}) => { if (process.env.CAPTURAS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name), ...opts }); } };

async function useConfig(page, { producto = 'coach', soloNube = true } = {}) {
  const cfg = `window.PG_CONFIG = ${JSON.stringify({ env: '', url: '', key: '', mode: 'fake', ...(producto ? { producto } : {}), ...(soloNube ? { soloNube: true } : {}) })};`;
  await page.route('**/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: cfg }));
}
// Un «teléfono» nuevo (contexto propio), con el reloj fijo, los diálogos aceptados y los errores de consola recogidos.
async function phone(browser, testInfo, { prefs = {}, config = {} } = {}) {
  const ctx = await browser.newContext({ ...testInfo.project.use, baseURL: testInfo.project.use.baseURL, acceptDownloads: true });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  p.on('dialog', (d) => d.accept());
  await p.clock.install({ time: new Date(NOW) });
  await useConfig(p, config);
  if (Object.keys(prefs).length) await p.addInitScript((pr) => { if (sessionStorage.getItem('__pre')) return; sessionStorage.setItem('__pre', '1'); for (const [k, v] of Object.entries(pr)) localStorage.setItem(k, v); }, prefs);
  return { ctx, p, errors };
}
// Crea (en el servidor falso de ESTA página) un coach con acuerdo y devuelve su código; no toca la sesión de la página.
async function seedCoach(page, email, biz) {
  return page.evaluate(async ({ email, biz }) => {
    const be = window.__pgFakeBackend;
    const m = {}; const mem = { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
    const r = RemoteFake.createFake({ backend: be, storage: mem });
    await r.auth.sendCode(email);
    await r.auth.verifyCode(email, be.lastCode(email));
    await r.account.joinApp();
    await r.account.recordConsents([{ kind: 'coach_agreement', granted: true, version: 'x', textHash: 'a'.repeat(64), clientAt: '2026-10-01T12:00:00.000Z' }]);
    const { inviteCode } = await r.coach.becomeCoach(biz);
    return inviteCode;
  }, { email, biz });
}
// Un cliente ya vinculado con ese coach por la API (sin pasar por la interfaz). paidDays: null = sin fecha; número = pagado hasta hoy + n.
async function seedClient(page, email, name, code, { paidDays = null, habits = false, nutrition = false, measures = [], habitDays = [], foods = [] } = {}) {
  await page.evaluate(async ({ email, name, code, paidDays, habits, nutrition, measures, habitDays, foods }) => {
    const be = window.__pgFakeBackend;
    const m = {}; const mem = { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
    const r = RemoteFake.createFake({ backend: be, storage: mem });
    await r.auth.sendCode(email);
    await r.auth.verifyCode(email, be.lastCode(email));
    await r.account.joinApp();
    await r.account.setDisplayName(name);
    const ev = (kind) => ({ kind, granted: true, version: 't', textHash: 'b'.repeat(64), clientAt: '2026-10-01T12:00:00.000Z' });
    await r.account.recordConsents(['sensitive_health', 'cloud_transfer'].map(ev));
    await r.client.joinCoach(code, { body: true, habits, nutrition, version: 'compartir-c2', textHash: 'c'.repeat(64) });
    if (paidDays != null) { const t = new Date(be.clock.now() - 5 * 3600000 + paidDays * 86400000).toISOString().slice(0, 10); be.setPaidUntil(email, t); }
    const T = '2026-10-21T10:00:00.000Z';
    const recs = [];
    measures.forEach((x, i) => recs.push({ id: `00000000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`, kind: 'entry', nkey: x.date, date: x.date, data: x.data, updatedAt: T }));
    habitDays.forEach((x, i) => recs.push({ id: `00000000-0000-4000-8000-0000000002${String(i).padStart(2, '0')}`, kind: 'habit', nkey: x.date, date: x.date, data: x.data, updatedAt: T }));
    // Etapa 2: comidas { date, id (último bloque del uuid), data } sembradas por la API (solo llegan al coach si nutrition = true)
    foods.forEach((x, i) => recs.push({ id: `00000000-0000-4000-8000-0000000003${String(i).padStart(2, '0')}`, kind: 'food', nkey: `00000000-0000-4000-8000-0000000003${String(i).padStart(2, '0')}`, date: x.date, data: x.data, updatedAt: T }));
    if (paidDays != null && recs.length) await r.sync.push({ records: recs });
  }, { email, name, code, paidDays, habits, nutrition, measures, habitDays, foods });
}
// Copia el «servidor» de un teléfono al otro y recarga el destino (equivale a que hablen con el mismo servidor).
async function transfer(from, to) {
  const json = await from.evaluate(() => localStorage.getItem('pg-fake-backend'));
  await to.evaluate((j) => localStorage.setItem('pg-fake-backend', j), json);
  await to.reload();
  await ready(to);
}
const ready = (page) => expect(page.locator('.tabbar, [data-testid="solo-gate"], [data-testid="account-gate"]').filter({ visible: true }).first()).toBeVisible();
const backend = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('pg-fake-backend')));
// Sesión de un cliente/coach ya entrado (sin pasar por la pantalla de aceptación): como si ya hubiera entrado antes.
async function signedIn(page, email, { coach, name } = {}) {
  await page.evaluate(async ({ email, coach, name }) => {
    const be = window.__pgFakeBackend;
    const r = RemoteFake.createFake({ backend: be, storage: localStorage });
    await r.auth.sendCode(email);
    const { user } = await r.auth.verifyCode(email, be.lastCode(email));
    return user;
  }, { email, coach, name });
}
// Pantalla única de aceptación: marca lo pedido y continúa.
async function acceptSolo(page, { habits = false } = {}) {
  const gate = page.locator('#solo');
  await expect(gate).toBeVisible();
  await gate.locator('input[name=adult]').check();
  await gate.locator('input[name=terms]').check();
  await gate.locator('input[name=unica]').check();
  if (habits) await gate.locator('input[name=habits]').check();
  await gate.getByRole('button', { name: 'Continuar' }).click();
}
// Entrada con correo y código del servidor falso.
async function enterWithEmail(page, email, name) {
  await expect(page.locator('#acc-step-email')).toBeVisible();
  await page.getByLabel('Tu correo').fill(email);
  if (name != null) await page.getByLabel('Tu nombre').fill(name);
  await page.getByRole('button', { name: /Enviarme el código/ }).click();
  await expect(page.locator('#acc-step-code')).toBeVisible();
  await page.getByLabel('Código', { exact: true }).fill(await page.evaluate((e) => window.__pgFakeBackend.lastCode(e), email));
}
async function layout(page, sel = 'button, a[href], input, select') {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const bad = await page.evaluate((sel) => {
    const out = [];
    for (const el of document.querySelectorAll(sel)) {
      if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') continue;
      if (el.closest('.hidden, dialog:not([open]), .viewer')) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (r.left < -0.5 || r.right > 390.5) out.push(`${el.id || el.className || el.tagName} fuera ${Math.round(r.left)}-${Math.round(r.right)}`);
    }
    return out;
  }, sel);
  expect(bad).toEqual([]);
}
// Todos los botones visibles del bloque miden al menos 48 px de alto (salvo los enlaces de texto «← Más»).
async function tall(page, scope) {
  const bad = await page.evaluate((scope) => {
    const out = [];
    for (const el of document.querySelectorAll(`${scope} button, ${scope} .btn`)) {
      if (!el.offsetParent || el.closest('.hidden')) continue;
      if (el.classList.contains('btn-link') || el.classList.contains('back-btn') || el.classList.contains('toast-action')) continue;
      const r = el.getBoundingClientRect();
      if (r.height && r.height < 47.5) out.push(`${el.id || el.textContent.trim().slice(0, 20)} alto ${Math.round(r.height)}`);
    }
    return out;
  }, scope);
  expect(bad).toEqual([]);
}
// Ningún elemento que coincida con el selector se ve (los toBeHidden de Playwright exigen un solo elemento).
const allHidden = async (page, sel) => expect(await page.evaluate((sel) => [...document.querySelectorAll(sel)].filter((el) => el.offsetParent !== null).map((el) => el.id || el.className), sel)).toEqual([]);
// Producto coach: abre el formulario de «Nueva foto» (con fotos ya guardadas se abre con «+ Foto» de la barra; sin ninguna, con «Tomar mi primera foto»).
async function openFotoForm(page) {
  if (await page.locator('#foto-nueva').evaluate((d) => d.open)) return;
  const sum = page.locator('#foto-nueva-sum');
  if (await sum.isVisible()) await sum.click(); else await page.locator('#btn-foto-add').click();
}
// Producto coach: despliega las opciones (editar, borrar, guardar) de una comida de la lista.
async function openMeal(page, text) {
  const det = page.locator('#mc-list .mc-det', { hasText: text }).first();
  if (!(await det.evaluate((d) => d.open))) await det.locator('summary').click();
}

module.exports = { openFotoForm, openMeal, allHidden, useConfig, phone, seedCoach, seedClient, transfer, ready, backend, acceptSolo, enterWithEmail, layout, tall, shot, WIDE, sha, NOW, signedIn };
