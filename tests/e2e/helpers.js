// Fixtures y utilidades compartidas de la E2E.
// - `app.open({ state, prefs, time })`: siembra localStorage ANTES de que arranque app.js y abre la app.
// - Acepta la pantalla legal (LEGAL-01 / S2-1) si aparece, en cada apertura y recarga.
// - Recoge errores de consola y de página: el test falla si hay alguno, salvo `app.allowConsoleErrors()`.
const { test: base, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const KEY = 'perdida-grasa:v1';
const FIXTURE_V1 = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/backup-v1.json'), 'utf8'));
// Fecha de referencia: 21-oct-2026 12:00 en Bogotá (todas las pruebas fijan el reloj aquí salvo que pidan otro).
const NOW = '2026-10-21T12:00:00-05:00';
const D = (n) => { // fecha ISO de hace n días respecto a NOW (calendario puro)
  const t = new Date(Date.UTC(2026, 9, 21 - n));
  return t.toISOString().slice(0, 10);
};

const PROFILE = { name: 'Ana', sex: 'female', age: 35, height: 165, startWeight: 70, goalWeight: 62, startDate: D(20), activity: 1.375, rate: 0.005 };
const state = (over = {}) => ({ schemaVersion: 2, profile: PROFILE, entries: [{ id: 'e1', date: D(20), weight: 70 }], foods: {}, habits: {}, library: {}, ...over });

/**
 * Pantalla legal de primer uso (S2-1 / LEGAL-01): `data-testid="legal-gate"` (#consent en la app).
 * El helper la acepta si aparece; si no, busca una vista con casillas y "Continuar". Marca todas las casillas
 * (salvo `photos:false` / `sensitive:false`) y pulsa "Continuar", que solo se habilita con las obligatorias.
 */
async function acceptLegalIfPresent(page, { photos = true, sensitive = true } = {}) {
  const gate = page.locator('[data-testid="legal-gate"], #legal-gate, #consent, .legal-gate').filter({ visible: true }).first();
  let root = gate;
  if (!(await gate.count())) {
    const cont = page.getByRole('button', { name: /^(continuar|aceptar y continuar)$/i }).filter({ visible: true }).first();
    if (!(await cont.count())) return false;
    root = page.locator('dialog[open], [role="dialog"], section, main, div').filter({ has: cont }).filter({ hasText: /Términos/i }).last();
    if (!(await root.count())) return false;
  }
  const boxes = root.locator('input[type="checkbox"]');
  for (let i = 0; i < (await boxes.count()); i++) {
    const b = boxes.nth(i);
    const label = ((await b.evaluate((el) => (el.closest('label') || el.labels?.[0] || el.parentElement).textContent)) || '').toLowerCase();
    if (!photos && label.includes('foto')) continue;
    if (!sensitive && label.includes('sensible')) continue;
    if (!(await b.isChecked())) await b.check();
  }
  await root.getByRole('button', { name: /^(continuar|aceptar y continuar)$/i }).click();
  await expect(root).toBeHidden();
  return true;
}

// La app arrancó: o se ve la barra de pestañas o la pantalla legal (que la oculta hasta aceptar).
// (S3-2) Con servidor de pruebas (?remote=fake) puede verse también la pantalla de cuenta.
const appReady = (page) => expect(page.locator('#tab-panel, [data-testid="legal-gate"], [data-testid="account-gate"]').filter({ visible: true }).first()).toBeVisible();

// Consentimiento vigente (todas las casillas) para sembrar estados que no deben pasar por la pantalla legal.
const CONSENT = require('../../schema.js').buildConsent({ terms: true, privacy: true, adult: true, sensitiveHealth: true, photos: true }, '2026-10-01T12:00:00.000Z');

const test = base.extend({
  app: async ({ page }, use, testInfo) => {
    const errors = [];
    let allowErrors = false;
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    page.on('dialog', (d) => d.accept());

    const app = {
      page,
      errors,
      allowConsoleErrors() { allowErrors = true; },
      /** Abre la app. `state` (objeto o string crudo) y `prefs` ({clave: valor}) se escriben una sola vez, antes de app.js. */
      async open({ state: s, prefs = {}, time = NOW, legal = true, path = 'index.html' } = {}) {
        if (time) await page.clock.install({ time: new Date(time) });
        const seed = { raw: s === undefined ? null : typeof s === 'string' ? s : JSON.stringify(s), prefs };
        await page.addInitScript(({ raw, prefs, key }) => {
          if (sessionStorage.getItem('__e2e_seeded')) return;
          sessionStorage.setItem('__e2e_seeded', '1');
          if (raw !== null) localStorage.setItem(key, raw);
          for (const [k, v] of Object.entries(prefs)) localStorage.setItem(k, v);
        }, { ...seed, key: KEY });
        await page.goto(path);
        await appReady(page);
        if (legal) await acceptLegalIfPresent(page);
      },
      async reload({ legal = true } = {}) {
        await page.reload();
        await appReady(page);
        if (legal) await acceptLegalIfPresent(page);
      },
      tab: (name) => page.locator(`#tab-${name}`).click(),
      stored: () => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), KEY),
      pref: (k) => page.evaluate((k) => localStorage.getItem(k), k),
      toast: () => page.locator('#toast'),
      photoCount: () => page.evaluate(() => Photos.all().then((x) => x.length)),
      scrollWidth: () => page.evaluate(() => document.documentElement.scrollWidth),
      /** Importa un respaldo (objeto o texto) por el input de archivo; los confirm() se aceptan solos. */
      async importJSON(obj) {
        const buffer = Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj));
        // Se vacía el toast antes: si no, un "Datos importados" anterior satisface la espera y se lee un resultado viejo.
        await page.evaluate(() => { document.querySelector('#toast').textContent = ''; });
        await page.setInputFiles('#file-import', { name: 'respaldo.json', mimeType: 'application/json', buffer });
        await expect(page.locator('#toast')).toHaveText(/importa|No se importó/i);
        return page.locator('#toast').textContent();
      },
      /** Simula almacenamiento lleno para la clave principal (el resto de claves siguen funcionando). */
      async quotaFull(on = true) {
        await page.evaluate((on) => {
          if (on) {
            window.__setItem = window.__setItem || Storage.prototype.setItem;
            Storage.prototype.setItem = function (k, v) {
              if (k === 'perdida-grasa:v1') throw new DOMException('lleno', 'QuotaExceededError');
              return window.__setItem.call(this, k, v);
            };
          } else if (window.__setItem) Storage.prototype.setItem = window.__setItem;
        }, on);
      },
    };
    await use(app);
    if (!allowErrors) expect(errors, `Errores de consola en "${testInfo.title}"`).toEqual([]);
  },
});

module.exports = { test, expect, acceptLegalIfPresent, CONSENT, KEY, FIXTURE_V1, NOW, D, PROFILE, state };
