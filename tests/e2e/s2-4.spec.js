// S2-4 · Esquema v4 preparado para sincronizar: migración v3 → v4 (UUID, updatedAt), marcas automáticas al editar
// y borrado lógico (lápidas que la UI, el CSV y el visor no muestran). Sin red: solo el modelo de datos.
const fs = require('fs');
const path = require('path');
const { test, expect, D, CONSENT, KEY } = require('./helpers');
const Schema = require('../../schema.js');

const V3 = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/backup-v3.json'), 'utf8'));
const { photos: V3_PHOTOS, exportedAt, ...V3_STATE } = V3;
void exportedAt;
const seedV3 = () => ({ ...V3_STATE, consent: CONSENT });   // consentimiento vigente: no aparece la pantalla legal
const EPOCH = Schema.EPOCH;

test('carga de datos v3 guardados: migra a v4 una vez, con UUID estables, EPOCH y copia :backup-v3', async ({ app, page }) => {
  const raw = JSON.stringify(seedV3());
  await app.open({ state: raw });
  const s = await app.stored();
  expect(s.schemaVersion).toBe(5);
  const all = [...s.entries, ...Object.values(s.foods).flat(), ...Object.values(s.habits), ...Object.values(s.library)];
  expect(all.length).toBe(9);
  for (const r of all) { expect(Schema.isUUID(r.id)).toBe(true); expect(r.updatedAt).toBe(EPOCH); }
  expect(s.deleted).toEqual({ entries: [], foods: [], habits: [], photos: [] });
  expect(s.consent).toEqual(CONSENT);
  expect(await app.pref('perdida-grasa:backup-v3')).toBe(raw);
  // Los ids no cambian al recargar (la migración se guardó al cargar).
  await app.reload();
  expect((await app.stored()).entries.map((e) => e.id)).toEqual(s.entries.map((e) => e.id));
  await app.tab('registro');
  await expect(page.locator('#entries-table tbody tr')).toHaveCount(3);
});

test('copias por versión: se conserva solo la :backup-v<N> más reciente y "Borrar todo" las elimina todas', async ({ app, page }) => {
  const raw = JSON.stringify(seedV3());
  await app.open({ state: raw, prefs: { 'perdida-grasa:backup-v1': '{"viejo":1}', 'perdida-grasa:backup-v2': '{"viejo":2}', 'perdida-grasa:backup': '{"primera":1}' } });
  const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('perdida-grasa:backup')).sort());
  expect(keys).toEqual(['perdida-grasa:backup', 'perdida-grasa:backup-v3']);
  expect(await app.pref('perdida-grasa:backup-v3')).toBe(raw);
  expect(await app.pref('perdida-grasa:backup')).toBe('{"primera":1}');   // la primera copia nunca se pisa
  await app.tab('perfil');
  await page.click('#btn-reset');
  await expect(app.toast()).toContainText('Datos borrados');
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => /backup$|backup-v|corrupto/.test(k)))).toEqual([]);
});

test('sin autorización de datos de salud, la migración v3 → v4 al cargar no se bloquea (no es una escritura del usuario)', async ({ app }) => {
  const noHealth = Schema.buildConsent({ terms: true, privacy: true, adult: true, sensitiveHealth: false, photos: false }, '2026-10-01T12:00:00.000Z');
  await app.open({ state: { ...V3_STATE, consent: noHealth } });
  const s = await app.stored();
  expect(s.schemaVersion).toBe(5);
  expect(s.entries.every((e) => Schema.isUUID(e.id) && e.updatedAt === EPOCH)).toBe(true);
  expect(s.consent).toEqual(noHealth);
});

test('fotos antiguas en IndexedDB: pasan a UUID con updatedAt en una transacción y la galería sigue igual', async ({ app, page }) => {
  await app.open({ state: seedV3() });
  await page.evaluate(async (data) => {
    for (const [i, id] of ['ph01abcd', 'ph02abcd'].entries()) {
      await Photos.put({ id, date: '2026-10-0' + (i + 1), pose: 'frente', blob: Photos.decode(data), createdAt: i });
    }
  }, V3_PHOTOS[0].data);
  await app.reload();
  const ph = await page.evaluate(() => Photos.all());
  expect(ph.length).toBe(2);
  for (const p of ph) { expect(Schema.isUUID(p.id)).toBe(true); expect(p.updatedAt).toBe(EPOCH); }
  await app.tab('fotos');
  await expect(page.locator('#gallery .thumb')).toHaveCount(2);
});

test('crear, editar y borrar desde la UI: updatedAt automático y lápidas que la UI, el CSV y el panel ignoran', async ({ app, page }) => {
  await app.open({ state: seedV3() });
  const before = await app.stored();
  // Editar el registro del 15-oct (misma fecha → se actualiza ese registro)
  await app.tab('registro');
  const f = page.locator('#form-entry');
  await f.locator('[name=date]').fill('2026-10-15');
  await f.locator('[name=weight]').fill('68.5');
  await f.locator('button[type=submit]').click();
  // Nuevo pesaje hoy
  await f.locator('[name=date]').fill(D(0));
  await f.locator('[name=weight]').fill('68.1');
  await f.locator('button[type=submit]').click();
  let s = await app.stored();
  const e15 = s.entries.find((e) => e.date === '2026-10-15');
  expect(e15.id).toBe(before.entries.find((e) => e.date === '2026-10-15').id);
  expect(e15.updatedAt > EPOCH).toBe(true);
  expect(s.entries.find((e) => e.date === '2026-10-01').updatedAt).toBe(EPOCH);   // no tocado
  expect(Schema.isUUID(s.entries.find((e) => e.date === D(0)).id)).toBe(true);
  // Borrar el registro del 08-oct → lápida, y desaparece de la tabla
  const id08 = s.entries.find((e) => e.date === '2026-10-08').id;
  await page.locator(`[data-del-entry="${id08}"]`).click();
  s = await app.stored();
  expect(s.entries.some((e) => e.id === id08)).toBe(false);
  expect(s.deleted.entries).toEqual([expect.objectContaining({ id: id08, date: '2026-10-08' })]);
  expect(Date.parse(s.deleted.entries[0].deletedAt)).toBeGreaterThan(0);
  await expect(page.locator('#entries-table tbody tr')).toHaveCount(3);
  await expect(page.locator('#entries-table')).not.toContainText('nota');
  // CSV sin el día borrado
  await app.tab('perfil');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export-csv')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  expect(csv).not.toContain('2026-10-08');
  // Hábitos: se conserva el id de la fecha y se marca updatedAt
  const habitId = s.habits['2026-10-15'].id;
  await app.tab('comidas');
  await page.locator('#food-date').fill('2026-10-15');
  await page.locator('#food-date').dispatchEvent('change');
  await page.locator('#form-habits [name=steps]').fill('10000');
  await page.locator('#form-habits button[type=submit]').click();
  s = await app.stored();
  expect(s.habits['2026-10-15'].id).toBe(habitId);
  expect(s.habits['2026-10-15'].steps).toBe(10000);
  expect(s.habits['2026-10-15'].updatedAt > EPOCH).toBe(true);
  // Borrar un alimento → lápida de comida
  const foodId = s.foods['2026-10-15'][0].id;
  await page.locator(`[data-del-food="${foodId}"]`).click();
  s = await app.stored();
  expect(s.deleted.foods).toEqual([expect.objectContaining({ id: foodId, date: '2026-10-15' })]);
  // Volver a pesarse el 08-oct retira la lápida (clave natural = fecha)
  await app.tab('registro');
  await f.locator('[name=date]').fill('2026-10-08');
  await f.locator('[name=weight]').fill('69.2');
  await f.locator('button[type=submit]').click();
  expect((await app.stored()).deleted.entries).toEqual([]);
});

test('borrar una foto deja lápida; exportar incluye updatedAt y lápidas; importar v3 no adopta su consentimiento', async ({ app, page }) => {
  await app.open({ state: seedV3() });
  expect(await app.importJSON({ ...V3, consent: { ...V3.consent, photos: false, sensitiveHealth: false } })).toMatch(/Datos importados/);
  let s = await app.stored();
  expect(s.consent).toEqual(CONSENT);                       // regla de S2-1: el consentimiento es de este dispositivo
  const [photo] = await page.evaluate(() => Photos.all());
  expect(Schema.isUUID(photo.id)).toBe(true);
  await app.tab('fotos');
  await page.locator('#gallery .thumb').first().click();
  await page.locator('#viewer-delete').click();
  await expect(page.locator('#gallery .thumb')).toHaveCount(0);
  s = await app.stored();
  expect(s.deleted.photos).toEqual([expect.objectContaining({ id: photo.id, date: photo.date })]);
  // Exportar
  await app.tab('perfil');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export')]);
  const exp = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  expect(exp.schemaVersion).toBe(5);
  expect(exp.deleted.photos.map((t) => t.id)).toEqual([photo.id]);
  expect(exp.entries.every((e) => Schema.isUUID(e.id) && typeof e.updatedAt === 'string')).toBe(true);
  // Ida y vuelta del respaldo v4: mismas lápidas e ids
  expect(await app.importJSON(exp)).toMatch(/Datos importados/);
  const back = await app.stored();
  expect(back.deleted).toEqual(s.deleted);
  expect(back.entries.map((e) => e.id)).toEqual(s.entries.map((e) => e.id));
  void KEY;
});
