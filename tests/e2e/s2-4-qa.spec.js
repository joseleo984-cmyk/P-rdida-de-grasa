// S2-4 · casos adversariales de QA: migración v1/v2/v3 → v4 sin pérdidas (también fotos con fallos), lápidas
// invisibles en UI/CSV/export/visor, LWW con relojes desordenados y empates, crecimiento por lápidas, bloqueo de salud.
const fs = require('fs');
const path = require('path');
const { test, expect, D, CONSENT, FIXTURE_V1, state } = require('./helpers');
const Schema = require('../../schema.js');

const V3 = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/backup-v3.json'), 'utf8'));
const { photos: V3_PHOTOS, exportedAt, ...V3_STATE } = V3;
void exportedAt;
const PNG = FIXTURE_V1.photos[0].data;
const strip = (r) => { const { id, updatedAt, ...x } = r; void id; void updatedAt; return x; };
const photoRows = (page) => page.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('perdida-grasa');
  r.onsuccess = () => {
    const db = r.result; const st = db.objectStoreNames[0];
    if (!st) { res([]); return; }
    const q = db.transaction(st).objectStore(st).getAll();
    q.onsuccess = () => res(q.result.map((p) => ({ id: p.id, date: p.date, pose: p.pose, size: p.blob && p.blob.size, createdAt: p.createdAt, updatedAt: p.updatedAt })));
  };
}));
async function seedLegacyPhotos(page, n = 3) {
  await page.evaluate(async ({ data, n }) => {
    for (let i = 0; i < n; i++) await Photos.put({ id: 'legacy' + i, date: `2026-10-0${i + 1}`, pose: 'frente', blob: Photos.decode(data), createdAt: i });
  }, { data: PNG, n });
}

// ---------- Migración ----------
for (const [label, raw] of [
  ['v1 (sin schemaVersion)', (() => { const { photos, ...s } = FIXTURE_V1; void photos; return s; })()],
  ['v2', { ...state(), schemaVersion: 2, foods: { [D(1)]: [{ id: 'abc', name: 'Avena', meal: 'Desayuno', kcal: 300, protein: 10, carbs: 50, fat: 5 }] }, habits: { [D(1)]: { steps: 9000, trained: true } }, library: { avena: { name: 'Avena', kcal: 300, protein: 10, carbs: 50, fat: 5 } } }],
  ['v3', { ...V3_STATE, consent: CONSENT }],
]) {
  test(`migración ${label} → v5 al cargar: mismo contenido, UUID, EPOCH y copia por versión`, async ({ app }) => {
    const rawJSON = JSON.stringify(raw);
    await app.open({ state: rawJSON });
    const s = await app.stored();
    expect(s.schemaVersion).toBe(5);
    expect(s.entries.map(strip)).toEqual(raw.entries.map(strip));
    for (const d of Object.keys(raw.foods || {})) expect(s.foods[d].map(strip)).toEqual(raw.foods[d].map(strip));
    for (const d of Object.keys(raw.habits || {})) expect(strip(s.habits[d])).toEqual(strip({ trained: false, ...raw.habits[d] }));
    for (const r of [...s.entries, ...Object.values(s.foods).flat(), ...Object.values(s.habits), ...Object.values(s.library)]) {
      expect(Schema.isUUID(r.id)).toBe(true);
    }
    const v = raw.schemaVersion || 1;
    expect(await app.pref(`perdida-grasa:backup-v${v}`)).toBe(rawJSON);
  });
}

test('fotos: un fallo de IndexedDB a mitad de la migración a UUID no pierde ni duplica fotos', async ({ app, page }) => {
  await app.open({ state: state({ consent: CONSENT }) });
  await seedLegacyPhotos(page, 3);
  const before = (await photoRows(page)).map((p) => [p.date, p.size, p.createdAt]).sort();
  // Fallo en el 2.º put de la transacción de migrateIds (antes de que arranque la app en la recarga).
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__fail_once')) return;
    sessionStorage.setItem('__fail_once', '1');
    const put = IDBObjectStore.prototype.put; let n = 0;
    IDBObjectStore.prototype.put = function (...a) { if (++n === 2) throw new DOMException('fallo simulado', 'DataError'); return put.apply(this, a); };
  });
  await app.reload();
  let rows = await photoRows(page);
  expect(rows.map((p) => [p.date, p.size, p.createdAt]).sort(), 'tras el fallo: mismas fotos').toEqual(before);
  expect(rows.every((p) => p.id.startsWith('legacy')), 'la transacción fallida no deja ids a medias').toBe(true);
  await app.reload(); // sin fallo: ahora sí migra
  rows = await photoRows(page);
  expect(rows.map((p) => [p.date, p.size, p.createdAt]).sort()).toEqual(before);
  expect(rows.every((p) => Schema.isUUID(p.id) && p.updatedAt === Schema.EPOCH)).toBe(true);
  await app.tab('fotos');
  await expect(page.locator('#gallery .thumb')).toHaveCount(3);
});

// S2-4 D1 (corregido): migrateIds lee y reescribe en la MISMA transacción readwrite; dos ejecuciones a la vez se
// serializan y la segunda ya ve las fotos migradas.
test('fotos: dos migraciones simultáneas (dos pestañas al actualizar) no duplican fotos', async ({ app, page, context }) => {
  await app.open({ state: state({ consent: CONSENT }) });
  await seedLegacyPhotos(page, 3);
  // Equivale a dos pestañas abiertas que ejecutan la migración a la vez.
  await page.evaluate(() => Promise.allSettled([
    Photos.migrateIds({ isValid: Schema.isUUID, uid: Schema.uuid, epoch: Schema.EPOCH }),
    Photos.migrateIds({ isValid: Schema.isUUID, uid: Schema.uuid, epoch: Schema.EPOCH }),
  ]));
  const rows = await photoRows(page);
  expect(rows.length, 'fotos duplicadas por la migración concurrente').toBe(3);
  void context;
});

test('cuota llena durante la migración al cargar: no se pierde nada y la siguiente carga migra', async ({ app, page }) => {
  const raw = JSON.stringify({ ...V3_STATE, consent: CONSENT });
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__quota_once')) return;
    sessionStorage.setItem('__quota_once', '1');
    const set = Storage.prototype.setItem;
    window.__quota = true;
    Storage.prototype.setItem = function (k, v) {
      if (window.__quota && k.startsWith('perdida-grasa:') && k !== 'perdida-grasa:v1' ? true : window.__quota && k === 'perdida-grasa:v1' && !String(v).includes('"__e2e')) {
        throw new DOMException('lleno', 'QuotaExceededError');
      }
      return set.call(this, k, v);
    };
  });
  // La semilla del helper se escribe con setItem también: se escribe antes de que se instale el fallo.
  await page.addInitScript((r) => { if (!localStorage.getItem('perdida-grasa:v1')) { window.__quota = false; localStorage.setItem('perdida-grasa:v1', r); window.__quota = true; } }, raw);
  await app.open();
  expect(await page.evaluate(() => localStorage.getItem('perdida-grasa:v1'))).toBe(raw);
  await app.tab('registro');
  await expect(page.locator('#entries-table tbody tr')).toHaveCount(V3_STATE.entries.length);
  // Se libera espacio en la misma sesión y el usuario guarda algo: no deben aparecer lápidas de lo migrado.
  await page.evaluate(() => { window.__quota = false; });
  await page.locator('#form-entry [name=date]').fill(D(0));
  await page.locator('#form-entry [name=weight]').fill('70.1');
  await page.locator('#form-entry button[type=submit]').click();
  const s = await app.stored();
  expect(s.schemaVersion).toBe(5);
  expect(s.deleted.entries).toEqual([]);
  expect(s.entries.length).toBe(V3_STATE.entries.length + 1);
});

// ---------- Lápidas ----------
test('lo borrado no reaparece: tabla, CSV, exportación (solo en deleted) y visor de copia', async ({ app, page }) => {
  await app.open({ state: { ...V3_STATE, consent: CONSENT } });
  const victim = (await app.stored()).entries.slice().sort((a, b) => a.date.localeCompare(b.date))[1];
  await app.tab('registro');
  const rows0 = await page.locator('#entries-table tbody tr').count();
  await page.locator(`[data-del-entry="${victim.id}"]`).click();
  await expect(page.locator('#entries-table tbody tr')).toHaveCount(rows0 - 1);
  await app.reload();
  await app.tab('registro');
  await expect(page.locator('#entries-table tbody tr')).toHaveCount(rows0 - 1);
  const s = await app.stored();
  expect(s.entries.some((e) => e.id === victim.id)).toBe(false);
  expect(s.deleted.entries.map((t) => t.id)).toContain(victim.id);
  await app.tab('perfil');
  const [csvDl] = await Promise.all([page.waitForEvent('download'), page.locator('#btn-export-csv').click()]);
  const csv = fs.readFileSync(await csvDl.path(), 'utf8');
  const hasOtherData = (V3_STATE.foods[victim.date] || V3_STATE.habits[victim.date]);
  if (!hasOtherData) expect(csv).not.toContain(victim.date + ';');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#btn-export').click()]);
  const exp = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  expect(exp.entries.some((e) => e.id === victim.id)).toBe(false);
  expect(exp.deleted.entries.some((t) => t.id === victim.id)).toBe(true);
  await page.locator('#btn-backup-no').click().catch(() => {});
  await page.setInputFiles('#file-coach', { name: 'c.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exp)) });
  await expect(page.locator('#coach-viewer')).toBeVisible();
  // Re-importar el propio respaldo conserva lápidas y updatedAt sin re-marcarlos.
  await page.locator('#coach-close').click();
  await app.importJSON(exp);
  const s2 = await app.stored();
  expect(s2.deleted).toEqual(exp.deleted);
  expect(s2.entries.map((e) => [e.id, e.updatedAt])).toEqual(exp.entries.map((e) => [e.id, e.updatedAt]));
  expect(s2.consent).toEqual(s.consent);
});

test('crecimiento por lápidas: 30 ciclos de "Copiar de ayer" + "Deshacer"', async ({ app, page }) => {
  const foods = { [D(1)]: Array.from({ length: 10 }, (_, i) => ({ id: Schema.uuid(), name: 'Alimento ' + i, meal: 'Almuerzo', kcal: 100, protein: 5, carbs: 5, fat: 5 })) };
  await app.open({ state: state({ consent: CONSENT, schemaVersion: 4, foods }) });
  await app.tab('comidas');
  const size0 = (await page.evaluate(() => localStorage.getItem('perdida-grasa:v1'))).length;
  for (let i = 0; i < 30; i++) {
    await page.locator('#btn-copy-prev').click();
    await app.toast().getByRole('button', { name: 'Deshacer' }).click();
    await expect(app.toast()).toHaveText('Copia deshecha');
  }
  const s = await app.stored();
  const size1 = (await page.evaluate(() => localStorage.getItem('perdida-grasa:v1'))).length;
  test.info().annotations.push({ type: 'lápidas', description: `${s.deleted.foods.length} lápidas de comida; ${size0} → ${size1} bytes` });
  // Observación (no fallo): hoy no hay servidor, así que estas lápidas nunca se sincronizarán.
  expect(s.deleted.foods.length).toBe(300);
  expect(size1 - size0).toBeLessThan(60000);
});

// ---------- Bloqueo de salud ----------
test('sin autorización de salud: autorizar fotos (solo consentimiento) se guarda; borrar un registro no', async ({ app, page }) => {
  const noHealth = { ...CONSENT, sensitiveHealth: false, photos: false };
  await app.open({ state: { ...V3_STATE, consent: noHealth } });
  const before = await app.stored();
  await app.tab('perfil');
  await page.locator('#btn-toggle-photos').click();
  const s = await app.stored();
  expect(s.consent.photos).toBe(true);
  expect(s.entries).toEqual(before.entries);
  await page.evaluate(() => document.querySelector('[data-del-entry]')?.click());
  expect((await app.stored()).entries).toEqual(before.entries);
  expect((await app.stored()).deleted.entries).toEqual([]);
});

// ---------- LWW (puro) ----------
test('mergeRecords / mergeState: relojes desordenados, empates, lápidas y formatos de fecha', async () => {
  const id = Schema.uuid();
  const rec = (over) => ({ id, date: '2026-10-10', weight: 70, ...over });
  const A = rec({ weight: 71, updatedAt: '2026-10-10T10:00:00.000Z' });
  const B = rec({ weight: 72, updatedAt: '2026-10-10T10:00:00Z' }); // mismo instante, otro formato
  const C = rec({ weight: 73, updatedAt: '2026-10-10T05:00:00-05:00' }); // mismo instante en otra zona
  const m = (a, b) => Schema.mergeRecords([a], [b]);
  // Empates: conmutativo y determinista, sin importar el formato del instante.
  for (const [x, y] of [[A, B], [A, C], [B, C]]) expect(m(x, y)).toEqual(m(y, x));
  // Asociativo con tres réplicas.
  const ab_c = Schema.mergeRecords(m(A, B), [C]);
  const a_bc = Schema.mergeRecords([A], m(B, C));
  expect(ab_c).toEqual(a_bc);
  // Reloj adelantado: gana aunque sea la edición "más vieja" en la realidad (limitación conocida de LWW).
  const future = rec({ weight: 99, updatedAt: '2030-01-01T00:00:00.000Z' });
  expect(m(future, rec({ weight: 70.5, updatedAt: '2026-10-21T12:00:00.000Z' }))[0].weight).toBe(99);
  // Lápida más nueva gana; edición posterior revive.
  const tomb = { id, date: '2026-10-10', deletedAt: '2026-10-11T00:00:00.000Z', updatedAt: '2026-10-11T00:00:00.000Z' };
  expect(m(A, tomb)[0].deletedAt).toBeDefined();
  expect(m(tomb, rec({ weight: 74, updatedAt: '2026-10-12T00:00:00.000Z' }))[0].weight).toBe(74);
  // updatedAt inválido o ausente cuenta como EPOCH: pierde contra cualquier edición fechada.
  expect(m(rec({ weight: 1, updatedAt: 'ayer' }), A)[0].weight).toBe(71);
  // Clave natural: mismo día en las dos réplicas con ids distintos → un solo registro con el id remoto.
  const L = { id: Schema.uuid(), date: '2026-10-15', weight: 80, updatedAt: '2026-10-15T10:00:00.000Z' };
  const R = { id: Schema.uuid(), date: '2026-10-15', weight: 81, updatedAt: '2026-10-15T09:00:00.000Z' };
  const nat = Schema.mergeRecords([L], [R], { key: 'date' });
  expect(nat).toHaveLength(1);
  expect(nat[0]).toMatchObject({ weight: 80, id: R.id });
});

// S2-4 D2 (corregido): con clave natural, LWW se aplica también al rellenar cada lado, así una lápida vieja no pisa
// al registro vivo más nuevo del mismo día.
test('mergeRecords con clave natural: dos registros del mismo día en el MISMO lado se resuelven por LWW', async () => {
  // Mismo lado con registro vivo + lápida del mismo día (respaldo antiguo/importado): no debe perderse el vivo.
  const live = { id: Schema.uuid(), date: '2026-10-16', weight: 79, updatedAt: '2026-10-16T10:00:00.000Z' };
  const oldTomb = { id: Schema.uuid(), date: '2026-10-16', deletedAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' };
  const same = Schema.mergeRecords([live, oldTomb], [], { key: 'date' });
  expect(same.find((r) => r.date === '2026-10-16').weight, 'una lápida vieja del mismo lado pisa al registro vivo').toBe(79);
});
