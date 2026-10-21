// S1-1: esquema versionado, importación segura y atómica, carga robusta, cuota y "Borrar todo".
const { test, expect, D, state, FIXTURE_V1, KEY } = require('./helpers');

test('importa un respaldo v1 (sin schemaVersion) con fotos, sin pérdidas', async ({ app, page }) => {
  await app.open();
  expect(await app.importJSON(FIXTURE_V1)).toBe('Datos importados');
  const s = await app.stored();
  expect(s.schemaVersion).toBe(require('../../schema.js').CURRENT_VERSION);
  // v4 (S2-4): mismo contenido, con ids UUID y updatedAt = EPOCH añadidos por la migración.
  const bare = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k === 'id' || k === 'updatedAt' ? undefined : v)));
  expect(bare(s.profile)).toEqual(FIXTURE_V1.profile);
  expect(bare(s.entries)).toEqual(bare(FIXTURE_V1.entries));
  expect(bare(s.foods)).toEqual(bare(FIXTURE_V1.foods));
  const Schema = require('../../schema.js');
  expect(s.entries.every((e) => Schema.isUUID(e.id) && e.updatedAt === Schema.EPOCH)).toBe(true);
  expect(await app.photoCount()).toBe(2);
  await app.tab('registro');
  await expect(page.locator('#entries-table')).toContainText('<b>nota</b>');
  await app.tab('fotos');
  await expect(page.locator('#gallery .thumb')).toHaveCount(2);
});

test('archivos rechazados no cambian nada (irreconocible, JSON roto, fotos que no son lista)', async ({ app }) => {
  await app.open();
  await app.importJSON(FIXTURE_V1);
  const before = JSON.stringify(await app.stored());
  for (const bad of [{ foo: 1 }, '{roto', { entries: [], photos: { x: 1 } }, { schemaVersion: 99, entries: [] }]) {
    expect(await app.importJSON(bad)).toMatch(/^No se importó/);
  }
  expect(JSON.stringify(await app.stored())).toBe(before);
  expect(await app.photoCount()).toBe(2);
});

test('importación atómica: si IndexedDB falla a mitad, no cambia ni localStorage ni la galería', async ({ app, page }) => {
  await app.open();
  await app.importJSON(FIXTURE_V1);
  const before = JSON.stringify(await app.stored());
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put; let n = 0;
    IDBObjectStore.prototype.put = function (...a) { if (++n === 2) throw new DOMException('fallo simulado', 'DataError'); return put.apply(this, a); };
  });
  expect(await app.importJSON({ ...FIXTURE_V1, entries: [{ date: D(0), weight: 99 }] })).toMatch(/No se importó/);
  await app.reload();
  expect(JSON.stringify(await app.stored())).toBe(before);
  expect(await app.photoCount()).toBe(2);
});

test('XSS en ids, kcal y pose no se ejecuta, y kcal en texto suman como números (BUG-02, BUG-03)', async ({ app, page }) => {
  await app.open({ state: state() });
  const evil = '"><img src=x onerror="window.__xss=1">';
  await app.importJSON({
    entries: [{ id: evil, date: D(0), weight: 90 }],
    foods: { [D(0)]: [{ id: evil, name: evil, meal: 'Cena', kcal: '100' }, { id: 'b', name: 'b', meal: 'Cena', kcal: '200' }] },
    library: { x: { name: evil, kcal: 1 } },
    photos: [{ id: evil, date: D(0), pose: evil, data: FIXTURE_V1.photos[0].data }],
  });
  for (let i = 0; i < 2; i++) {
    for (const t of ['panel', 'registro', 'comidas', 'fotos', 'perfil']) await app.tab(t);
    await app.reload();
  }
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  await app.tab('comidas');
  await expect(page.locator('#day-macros')).toContainText(/(^|\D)300(\D|$)/);
  await expect(page.locator('#day-macros')).not.toContainText('100200');
});

test('__proto__ / constructor en el respaldo no contaminan Object.prototype', async ({ app, page }) => {
  await app.open();
  const d = D(0);
  await app.importJSON(`{"__proto__":{"polluted":1},"foods":{"__proto__":[{"name":"x","kcal":1}],"${d}":[{"name":"ok","kcal":10}]},
    "library":{"__proto__":{"name":"__proto__","kcal":1},"constructor":{"name":"Constructor","kcal":5}},"entries":[{"date":"${d}","weight":80}]}`);
  expect(await page.evaluate(() => ({}).polluted)).toBeUndefined();
  const s = await app.stored();
  expect(Object.keys(s.foods)).toEqual([d]);
  expect(Object.keys(s.library)).toEqual([]);
});

test('localStorage dañado: la app arranca, corrige y guarda una copia del original', async ({ app, page }) => {
  const bad = JSON.stringify({ entries: [{ weight: 80 }, { id: 'a1', date: D(1), weight: '81' }], foods: null, habits: null, library: [] });
  await app.open({ state: bad });
  await expect(app.toast()).toContainText('Se corrigieron');
  expect(await app.pref('perdida-grasa:backup')).toBe(bad);
  await app.tab('registro');
  await expect(page.locator('#entries-table tbody tr')).toHaveCount(1);
});

test('localStorage ilegible: arranca vacía y conserva el dato en :corrupto', async ({ app }) => {
  app.allowConsoleErrors(); // la app registra console.error('Datos guardados ilegibles')
  await app.open({ state: '{{{basura' });
  expect(await app.pref('perdida-grasa:corrupto')).toBe('{{{basura');
  expect(app.errors.filter((e) => e.startsWith('pageerror'))).toEqual([]);
});

test('datos de una versión más nueva no se sobrescriben', async ({ app, page }) => {
  app.allowConsoleErrors();
  // S2-1: el consentimiento de unos datos más nuevos no se puede leer → sale la pantalla legal; aceptarla intenta
  // guardar y NO debe sobrescribir (la pantalla sigue, con el aviso de recargar).
  await app.open({ state: { schemaVersion: 99, entries: [] }, legal: false });
  await expect(page.getByTestId('legal-gate')).toBeVisible();
  for (const n of ['terms', 'privacy', 'sensitiveHealth', 'adult']) await page.locator(`#form-consent [name=${n}]`).check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(app.toast()).toContainText('versión más nueva');
  await expect(page.getByTestId('legal-gate')).toBeVisible();
  expect((await app.stored()).schemaVersion).toBe(99);
});

test('perfil heredado inválido: se conserva como borrador, precarga el formulario y avisa (S1-1 D1)', async ({ app, page }) => {
  await app.open({ state: { profile: { name: 'Ana', sex: 'female', age: 35, height: 165, startWeight: 70, goalWeight: 80, startDate: D(5), activity: 1.375, rate: 0.005 }, entries: [{ id: 'e1', date: D(5), weight: 70 }] } });
  await expect(page.locator('#profile-issue')).toContainText('meta 80 kg');
  await expect(page.locator('#form-profile [name=goalWeight]')).toHaveValue('80');
  await app.reload();
  await app.reload();
  await expect(page.locator('#form-profile [name=goalWeight]')).toHaveValue('80');
  await page.locator('#form-profile [name=goalWeight]').fill('62');
  await page.locator('#form-profile button[type=submit]').click();
  await expect(page.locator('#profile-issue')).toBeHidden();
  expect((await app.stored()).profile.goalWeight).toBe(62);
});

test('cuota llena: aviso de error, sin mensaje de éxito y sin dato fantasma (HU-01, S1-1 D2)', async ({ app, page }) => {
  await app.open({ state: state() });
  await app.quotaFull();
  await app.tab('registro');
  await page.locator('#form-entry [name=date]').fill(D(0));
  await page.locator('#form-entry [name=weight]').fill('77.7');
  await page.locator('#form-entry button[type=submit]').click();
  await expect(app.toast()).toHaveText(/^Almacenamiento lleno/);
  await expect(app.toast()).toHaveClass(/error/);
  await expect(page.locator('#entries-table tbody tr')).toHaveCount(1);
  await expect(page.locator('#form-entry [name=weight]')).toHaveValue('77.7');
});

test('"Borrar todo" elimina todas las claves y las fotos, incluso con la cuota llena', async ({ app, page }) => {
  await app.open({ prefs: { 'perdida-grasa:lastBackup': '2026-10-01T00:00:00Z', 'perdida-grasa:backupSnooze': '2026-12-01', 'perdida-grasa:backup': '{}', 'perdida-grasa:corrupto': '{' } });
  await app.importJSON(FIXTURE_V1);
  await app.quotaFull();
  await app.tab('perfil');
  await page.locator('#btn-reset').click();
  await expect(app.toast()).toHaveText('Datos borrados');
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('perdida-grasa')))).toEqual([]);
  expect(await app.photoCount()).toBe(0);
  void KEY;
});
