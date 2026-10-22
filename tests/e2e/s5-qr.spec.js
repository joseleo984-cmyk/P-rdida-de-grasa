// Sprint 5: "Mostrar QR" en Invitar (coach). Servidor FALSO. Fuente ancha a 390 px. Con CAPTURAS=1 guarda qr-claro/qr-oscuro.
// El QR del DOM se rasteriza en el navegador y se decodifica en Node con jsQR (decodificador independiente del generador).
const { test, expect } = require('./helpers');
const jsQR = require('jsqr');
const path = require('path');
const fs = require('fs');
const { EMPTY, loginAsCoach } = require('./fake-helpers');

const WIDE = '*{font-family:"DejaVu Sans",Verdana,sans-serif !important; letter-spacing:.02em}';
const SHOTS = path.resolve(__dirname, '../../equipo/qa-capturas');
const FAKE = 'index.html?remote=fake';
const SKIP = { 'perdida-grasa:account-skip': '1' };

async function openInvite(app, page) {
  await app.open({ path: FAKE, state: EMPTY(), prefs: SKIP });
  await loginAsCoach(page, 'coach@ejemplo.com', 'Fit Ana');
  await page.locator('#tab-invitar').click();
  await expect(page.locator('#view-invitar')).toBeVisible();
  await page.addStyleTag({ content: WIDE });
  const code = await page.evaluate(() => JSON.parse(localStorage.getItem('perdida-grasa:account')).coach.inviteCode);
  const link = (await page.evaluate(() => location.origin + location.pathname)) + '?c=' + code;
  return { code, link };
}
// Rasteriza el SVG del DOM (800 px) y lo decodifica.
async function decodeDom(page) {
  const px = await page.evaluate(async () => {
    const svg = document.querySelector('#qr-box svg');
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
    const img = new Image(); img.src = url; await img.decode();
    const c = document.createElement('canvas'); c.width = c.height = 800;
    const g = c.getContext('2d'); g.fillStyle = '#808080'; g.fillRect(0, 0, 800, 800); g.drawImage(img, 0, 0, 800, 800);
    return Array.from(g.getImageData(0, 0, 800, 800).data);
  });
  const r = jsQR(Uint8ClampedArray.from(px), 800, 800);
  return r && r.data;
}

test('Mostrar QR: se abre con el QR del enlace de invitación, el código de respaldo, y se cierra con Cerrar, Esc y el fondo', async ({ app, page }) => {
  const { code, link } = await openInvite(app, page);
  const sent = [];
  page.on('request', (r) => sent.push(r.url() + ' ' + (r.postData() || '')));
  const btn = page.getByRole('button', { name: 'Mostrar QR' });
  await expect(btn).toBeEnabled();
  const dlg = page.locator('#sheet-qr');
  await expect(dlg).toBeHidden();

  await btn.click();
  await expect(dlg).toBeVisible();
  await expect(page.locator('#qr-title')).toHaveText('Tu cliente apunta la cámara aquí');
  await expect(page.locator('#qr-title')).toBeFocused();
  await expect(page.locator('#qr-code')).toHaveText(code);
  const svg = page.locator('#qr-box svg');
  await expect(svg).toHaveAttribute('role', 'img');
  await expect(svg).toHaveAttribute('shape-rendering', 'crispEdges');
  await expect(svg).toHaveAttribute('aria-label', /Código QR de tu invitación/);
  // El QR del DOM decodifica al MISMO enlace que WhatsApp/Copiar enlace (con zona silenciosa de 4 módulos y fondo blanco)
  expect(await decodeDom(page)).toBe(link);
  const vb = (await svg.getAttribute('viewBox')).split(' ').map(Number);
  expect(vb[2]).toBeGreaterThanOrEqual(29); // al menos versión 1 (21) + 8 de zona silenciosa
  expect(await page.evaluate(() => document.querySelector('#qr-box svg rect').getAttribute('fill'))).toBe('#fff');
  // El enlace no sale del dispositivo: ninguna petición lleva el código ni el QR
  expect(sent.filter((u) => u.includes(code) || /qr/i.test(u))).toEqual([]);
  // Cerrar (>= 48 px de alto)
  const close = page.getByRole('button', { name: 'Cerrar' }).filter({ visible: true });
  expect((await close.boundingBox()).height).toBeGreaterThanOrEqual(48);
  await close.click();
  await expect(dlg).toBeHidden();
  await expect(btn).toBeFocused();
  expect(await page.evaluate(() => document.querySelector('#qr-box').innerHTML)).toBe('');

  // Esc
  await btn.click(); await expect(dlg).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dlg).toBeHidden(); await expect(btn).toBeFocused();
  // Toque en el fondo
  await btn.click(); await expect(dlg).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(dlg).toBeHidden();
  // Con el teclado: Tab se queda dentro de la hoja
  await btn.focus(); await page.keyboard.press('Enter'); await expect(dlg).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement.closest('#sheet-qr'))).toBe(true);
});

test('Mostrar QR con letra ancha a 390 px: sin desborde, toques de 48 px, QR cuadrado dentro de la pantalla; capturas claro/oscuro', async ({ app, page }) => {
  await openInvite(app, page);
  const W = 390;
  // Fila de botones
  const r = await page.evaluate(() => [...document.querySelectorAll('#invite-card .row-actions > *')].map((e) => { const q = e.getBoundingClientRect(); return { id: e.id, h: q.height, l: q.left, r: q.right }; }));
  expect(r.length).toBe(3);
  for (const b of r) { expect(b.h, b.id).toBeGreaterThanOrEqual(48); expect(b.l).toBeGreaterThanOrEqual(0); expect(b.r).toBeLessThanOrEqual(W + 0.5); }
  expect(await app.scrollWidth()).toBeLessThanOrEqual(W);
  await page.locator('#btn-invite-qr').click();
  await expect(page.locator('#sheet-qr')).toBeVisible();
  const m = await page.evaluate(() => {
    const q = (s) => document.querySelector(s).getBoundingClientRect();
    return { dlg: q('#sheet-qr'), svg: q('#qr-box svg'), code: q('#qr-code'), close: q('#qr-close'), over: document.documentElement.scrollWidth, dlgScroll: document.querySelector('#sheet-qr').scrollWidth, dlgClient: document.querySelector('#sheet-qr').clientWidth, H: innerHeight };
  });
  expect(m.over).toBeLessThanOrEqual(W);
  expect(m.dlgScroll).toBeLessThanOrEqual(m.dlgClient);
  for (const k of ['dlg', 'svg', 'code', 'close']) { expect(m[k].left, k).toBeGreaterThanOrEqual(-0.5); expect(m[k].right, k).toBeLessThanOrEqual(W + 0.5); }
  expect(Math.abs(m.svg.width - m.svg.height)).toBeLessThan(1);
  expect(m.svg.width).toBeGreaterThanOrEqual(250); // grande para que la cámara lo lea
  expect(m.close.height).toBeGreaterThanOrEqual(48);
  expect(m.close.bottom).toBeLessThanOrEqual(m.H); // el botón Cerrar se ve sin desplazar
  // Fondo blanco en tema oscuro
  await page.emulateMedia({ colorScheme: 'dark' });
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('#qr-box')).backgroundColor)).toBe('rgb(255, 255, 255)');
  expect(await decodeDom(page)).toMatch(/\?c=[A-Z0-9]{6}$/);
  if (process.env.CAPTURAS) {
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.reload(); // capturas con la letra normal
    await page.locator('#tab-invitar').click();
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.locator('#btn-invite-qr').click();
      await expect(page.locator('#sheet-qr')).toBeVisible();
      await page.screenshot({ path: path.join(SHOTS, `qr-${scheme === 'light' ? 'claro' : 'oscuro'}.png`) });
      await page.keyboard.press('Escape');
    }
  }
});

test('Mostrar QR no está disponible sin coach con código (mismos requisitos que WhatsApp)', async ({ app, page }) => {
  await app.open({ path: FAKE, state: EMPTY(), prefs: SKIP });
  await expect(page.locator('#btn-invite-qr')).toBeDisabled();
  await expect(page.locator('#sheet-qr')).toBeHidden();
});
