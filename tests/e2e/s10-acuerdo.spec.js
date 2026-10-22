// Sprint 10: «Mi acuerdo» del coach (Más → Mi acuerdo) y copia por correo tras aceptar. Servidor FALSO (sin red, sin Brevo real).
// Letra ancha a 390 px, toques de 48 px, claro/oscuro. Con CAPTURAS=1 guarda las pantallas nuevas en equipo/qa-capturas.
const { test, expect } = require('./helpers');
const { EMPTY, loginAsCoach } = require('./fake-helpers');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const CT = require('../../consent-texts.js');

const FAKE = 'index.html?remote=fake';
const SKIP = { 'perdida-grasa:account-skip': '1' };
const WIDE = '*{font-family:"DejaVu Sans",Verdana,sans-serif !important; letter-spacing:.02em}';
const SHOTS = path.resolve(__dirname, '../../equipo/qa-capturas');
const TEXT = CT.fullText('A7');
const VER = CT.version('A7');
const sha = (t) => crypto.createHash('sha256').update(t, 'utf8').digest('hex');
const shot = async (page, name, opts = {}) => { if (process.env.CAPTURAS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name), ...opts }); } };

// Coach «sin acuerdo»: lo acepta desde la pestaña Clientes, como en la vida real.
async function coachAndAccept(app, page, { copyMode } = {}) {
  await app.open({ path: FAKE, state: EMPTY(), prefs: SKIP });
  await loginAsCoach(page, 'coach@ejemplo.com', 'Fit Ana', { agreement: false });
  if (copyMode) await page.evaluate((m) => { window.__pgFakeBackend.copyMode = m; }, copyMode);
  await page.addStyleTag({ content: WIDE });
  const gate = page.locator('#view-coach .a7-gate');
  await expect(gate).toBeVisible();
  await gate.locator('input[name=a7]').check();
  await gate.getByRole('button', { name: 'Aceptar el acuerdo' }).click();
}
const goAcuerdo = async (page) => {
  await page.locator('#tab-mas').click();
  await page.locator('#row-c-acuerdo').click();
  await expect(page.locator('#view-acuerdo')).toBeVisible();
  await expect(page.locator('#acuerdo-title')).toBeFocused();
};
const copies = (page) => page.evaluate(() => window.__pgFakeBackend.agreementCopies.map((c) => ({ to: c.to, version: c.version, textHash: c.textHash })));

async function layout(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const bad = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('#view-acuerdo button, #view-acuerdo a[href]')) {
      if (el.closest('.hidden')) continue;
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      if (r.left < -0.5 || r.right > 390.5) out.push(`${el.id} fuera ${r.left}-${r.right}`);
      if (el.classList.contains('back-btn')) continue; // «← Más» es el mismo botón de las demás pantallas
      if (r.height < 47.5) out.push(`${el.id} alto ${r.height}`);
    }
    return out;
  });
  expect(bad).toEqual([]);
}

test('aceptar el acuerdo: queda registrado, llega la copia por correo (doble) y se avisa; Más → Mi acuerdo muestra el texto exacto', async ({ app, page }) => {
  await coachAndAccept(app, page);
  await expect(app.toast()).toHaveText('Te enviamos una copia a tu correo');
  const c = await copies(page);
  expect(c).toHaveLength(1);
  expect(c[0]).toEqual({ to: 'coach@ejemplo.com', version: VER, textHash: sha(TEXT) });
  await goAcuerdo(page);
  await expect(page.locator('#acuerdo-text')).toHaveText(TEXT);
  await expect(page.locator('#acuerdo-version')).toHaveText(VER);
  await expect(page.locator('#acuerdo-hash')).toHaveText(`${sha(TEXT).slice(0, 8)}…${sha(TEXT).slice(-8)}`);
  await expect(page.locator('#acuerdo-hash')).toHaveAttribute('title', sha(TEXT));
  await expect(page.locator('#acuerdo-when')).toContainText('2026');
  await expect(page.locator('#acuerdo-new')).toBeHidden();
  await expect(page.locator('#acuerdo-none')).toBeHidden();
});

test('Descargar copia: archivo imprimible con el texto exacto, versión, fecha y la huella completa que coincide con el SHA-256 del texto', async ({ app, page }) => {
  await coachAndAccept(app, page);
  await goAcuerdo(page);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar copia' }).click()]);
  expect(dl.suggestedFilename()).toBe(`acuerdo-del-coach-${VER}.html`);
  const html = fs.readFileSync(await dl.path(), 'utf8');
  const hash = sha(TEXT);
  expect(html).toContain(hash);
  expect(html).toContain(VER);
  expect(html).toContain('coach@ejemplo.com');
  const pre = html.match(/<pre>([\s\S]*?)<\/pre>/)[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  expect(pre).toBe(TEXT);
  expect(sha(pre)).toBe(hash);                       // la huella del archivo prueba el texto del archivo
  expect(html).not.toMatch(/<script/i);
  await expect(page.locator('#acuerdo-copy-status')).toContainText('guardamos el archivo');
});

test('Reenviarme la copia: respeta el límite de 1 por hora con un mensaje amable y no rompe nada', async ({ app, page }) => {
  await coachAndAccept(app, page);
  await expect(app.toast()).toHaveText('Te enviamos una copia a tu correo');
  await goAcuerdo(page);
  await page.getByRole('button', { name: 'Reenviarme la copia' }).click();
  await expect(page.locator('#acuerdo-copy-status')).toContainText('Ya te enviamos una copia hace poco');
  expect(await copies(page)).toHaveLength(1);
  await expect(page.getByRole('button', { name: 'Reenviarme la copia' })).toBeEnabled();
});

test('si la función de correo no está desplegada: aceptar funciona, sin errores ni textos técnicos; «Reenviarme» dice algo amable', async ({ app, page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await coachAndAccept(app, page, { copyMode: 'unavailable' });
  await expect(app.toast()).toHaveText('Acuerdo aceptado');
  await page.waitForTimeout(300);
  await expect(app.toast()).toHaveText('Acuerdo aceptado');         // sin aviso de error
  expect(await copies(page)).toHaveLength(0);
  await expect(page.locator('#view-coach .a7-gate')).toBeHidden();    // el acuerdo SÍ quedó registrado: ya no se pide
  await goAcuerdo(page);
  await expect(page.locator('#acuerdo-text')).toHaveText(TEXT);
  await page.getByRole('button', { name: 'Reenviarme la copia' }).click();
  const st = page.locator('#acuerdo-copy-status');
  await expect(st).toContainText('Por ahora no pudimos enviar la copia por correo');
  await expect(st).toContainText('puedes descargar la copia aquí');
  await expect(st).not.toContainText(/error|404|función|edge|brevo/i);
  expect(errors).toEqual([]);
});

test('sin internet: «Reenviarme» avisa con calma y Descargar sigue sirviendo', async ({ app, page }) => {
  await coachAndAccept(app, page);
  await goAcuerdo(page);
  await page.evaluate(() => window.__pgFakeBackend.setOnline(false));
  await page.getByRole('button', { name: 'Reenviarme la copia' }).click();
  await expect(page.locator('#acuerdo-copy-status')).toContainText('Sin internet');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar copia' }).click()]);
  expect(dl.suggestedFilename()).toContain('acuerdo-del-coach');
});

test('si el acuerdo vigente es de una versión más nueva: avisa, enseña lo aceptado antes (si se puede probar) y lleva a re-aceptar', async ({ app, page }) => {
  await app.open({ path: FAKE, state: EMPTY(), prefs: SKIP });
  await loginAsCoach(page, 'coach@ejemplo.com', 'Fit Ana');                       // acuerdo sembrado (huella de relleno)
  await page.evaluate(() => {
    const k = 'perdida-grasa:account';
    const m = JSON.parse(localStorage.getItem(k));
    m.consents.coach_agreement.version = '0.2-A7';                                  // aceptó una versión anterior
    localStorage.setItem(k, JSON.stringify(m));
  });
  await page.reload();
  await page.addStyleTag({ content: WIDE });
  await goAcuerdo(page);
  await expect(page.locator('#acuerdo-new')).toBeVisible();
  await expect(page.locator('#acuerdo-new-text')).toContainText(`versión nueva del acuerdo (${VER})`);
  await expect(page.locator('#acuerdo-mismatch')).toBeVisible();                 // el texto viejo no está en este teléfono
  await expect(page.locator('#acuerdo-text')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Descargar copia' })).toBeDisabled();
  await layout(page);
  await page.getByRole('button', { name: 'Revisar y aceptar la versión nueva' }).click();
  await expect(page.locator('#view-coach')).toBeVisible();
  await expect(page.locator('#view-coach .a7-gate')).toBeVisible();              // el mecanismo de siempre pide re-aceptar
});

test('sin aceptar todavía: Mi acuerdo lo dice y lleva a Clientes', async ({ app, page }) => {
  await app.open({ path: FAKE, state: EMPTY(), prefs: SKIP });
  await loginAsCoach(page, 'coach@ejemplo.com', 'Fit Ana', { agreement: false });
  await goAcuerdo(page);
  await expect(page.locator('#acuerdo-none')).toBeVisible();
  await expect(page.locator('#acuerdo-card')).toBeHidden();
  await page.getByRole('button', { name: 'Ir a Clientes para aceptarlo' }).click();
  await expect(page.locator('#view-coach .a7-gate')).toBeVisible();
});

test('un cliente (no coach) no ve «Mi acuerdo» en Más', async ({ app, page }) => {
  await app.open({ path: FAKE, state: EMPTY(), prefs: SKIP });
  await page.locator('#tab-mas').click();
  await expect(page.locator('#row-c-acuerdo')).toBeHidden();
});

for (const scheme of ['light', 'dark']) {
  test(`letra ancha a 390 px (${scheme}): Mi acuerdo sin desborde, toques de 48 px y texto legible`, async ({ app, page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await coachAndAccept(app, page);
    await goAcuerdo(page);
    await layout(page);
    const m = await page.evaluate(() => {
      const t = document.querySelector('#acuerdo-text');
      return { fs: parseFloat(getComputedStyle(t).fontSize), bg: getComputedStyle(document.body).backgroundColor, fg: getComputedStyle(t).color };
    });
    expect(m.fs).toBeGreaterThanOrEqual(14);
    expect(m.fg).not.toBe(m.bg);
    await page.evaluate(() => document.querySelector('#toast').classList.remove('show')); // el reloj de la prueba está congelado
    await page.waitForTimeout(500);
    await shot(page, `s10-mi-acuerdo-${scheme === 'light' ? 'claro' : 'oscuro'}.png`, { fullPage: true });
  });
}
