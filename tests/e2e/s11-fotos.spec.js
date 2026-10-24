// Sprint 11: fotos de progreso en la nube, detrás de A6a (guardar en la nube) y A6b (que el coach vea cada foto, una a una),
// con la subida bloqueada si el acceso está en pausa. Servidor FALSO (los archivos viven en su «Storage» en memoria).
const { test, expect } = require('@playwright/test');
const H = require('./s11-helpers');
const CT = require('../../consent-texts.js');
require('../../consent-texts-solo.js');

const D = (n) => new Date(Date.UTC(2026, 9, 21 + n)).toISOString().slice(0, 10);
// PNG de 8×8 válido (la app lo reduce y lo guarda como JPEG).
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAEklEQVR4nGNgYGD4z4AKMAUBAEnYAQHPh3bnAAAAAElFTkSuQmCC', 'base64');
const upload = async (p, date, pose) => {
  await p.locator('#form-photo input[name=date]').fill(date);
  await p.locator('#form-photo select[name=pose]').selectOption(pose);
  await p.setInputFiles('#form-photo input[name=file]', { name: 'f.png', mimeType: 'image/png', buffer: PNG });
  await p.getByRole('button', { name: 'Guardar foto' }).click();
  await expect(p.locator('#toast')).toHaveText('Foto guardada');
};
async function client(browser, testInfo) {
  const ph = await H.phone(browser, testInfo);
  const { p } = ph;
  await p.goto('index.html');
  await H.acceptSolo(p);
  const code = await H.seedCoach(p, 'laura@coach.co', 'Laura Fit');
  await p.goto(`index.html?c=${code}`);
  await H.enterWithEmail(p, 'ana@c.co', 'Ana Martínez');
  await p.getByRole('button', { name: 'Conectarme y continuar' }).click();
  await p.getByRole('button', { name: 'Ir a la app' }).click();
  await p.evaluate(() => window.__pgFakeBackend.setPaidUntil('ana@c.co', new Date(window.__pgFakeBackend.clock.now() - 5 * 3600000 + 30 * 86400000).toISOString().slice(0, 10)));
  await p.evaluate(() => PGAccount.refreshLink());
  await p.addStyleTag({ content: H.WIDE });
  return { ...ph, code };
}
const photosInServer = (p) => p.evaluate(() => Object.values(window.__pgFakeBackend.photos).map((x) => ({ id: x.id, shared: x.sharedWithCoach, deleted: !!x.deletedAt, hasFile: !!window.__pgFakeBackend.blobs[x.storagePath] })));

test('cliente: fotos bloqueadas hasta A6a; sube a la nube; el coach solo las ve con A6b y marcándolas una a una; retirar A6b las oculta; en pausa no sube', async ({ browser }, testInfo) => {
  test.setTimeout(90_000);
  const { p, errors } = await client(browser, testInfo);
  await p.locator('#tab-fotos').click();
  await expect(p.locator('#view-fotos .photos-gate')).toBeVisible();
  await expect(p.locator('#form-photo')).toBeHidden();
  await expect(p.locator('#photos-a6a-text')).toHaveText(CT.TEXTS.A6a.body);
  await H.layout(p); await H.tall(p, '#view-fotos'); await H.shot(p, 's11-fotos-bloqueadas.png', { fullPage: true });
  // Sin A6a no se sube nada: lo único registrado son los consentimientos de la entrada
  expect(await photosInServer(p)).toEqual([]);
  await p.getByRole('button', { name: 'Autorizar fotos' }).click();
  await expect(p.locator('#toast')).toHaveText('Fotos autorizadas');
  await expect(p.locator('#form-photo')).toBeVisible();
  const be0 = await H.backend(p);
  const a6a = be0.consentEvents.find((e) => e.kind === 'photos_cloud');
  expect([a6a.granted, a6a.version, a6a.textHash]).toEqual([true, CT.version('A6a'), H.sha(CT.fullText('A6a'))]);
  // Dos fotos: suben a la nube (archivo + metadatos), SIN marcar para el coach
  await upload(p, D(-20), 'frente');
  await upload(p, D(0), 'frente');
  await expect.poll(() => photosInServer(p).then((x) => x.length)).toBe(2);
  expect((await photosInServer(p)).every((x) => x.hasFile && !x.shared)).toBe(true);
  // El coach todavía no puede ver ninguna: no hay A6b ni el vínculo comparte fotos
  await expect(p.locator('#photos-coach-card')).toBeVisible();
  await expect(p.locator('#photos-coach-state')).toContainText('todavía no puede ver tus fotos');
  await expect(p.locator('#photos-a6b-text')).toContainText('Autorizo que Laura Fit acceda a las fotos de progreso que he subido y a las que suba a partir de este momento');
  await H.shot(p, 's11-fotos-cliente.png', { fullPage: true });
  await p.getByRole('button', { name: 'Permitir que Laura Fit vea mis fotos' }).click();
  await expect(p.locator('#photos-coach-state')).toContainText('Laura Fit puede ver tus fotos');
  const be1 = await H.backend(p);
  const a6b = be1.consentEvents.filter((e) => e.kind === 'photo_view_coach').pop();
  expect([a6b.granted, a6b.version]).toEqual([true, '0.4-A6b-coach']);
  expect(Object.values(be1.links).find((l) => l.status === 'active').shares.photos).toBe(true);
  // Al dar el permiso, las fotos que ya estaban pasan a verse (sin marcar una por una); la persona puede ocultar UNA: la de hoy
  await expect.poll(() => photosInServer(p).then((x) => x.filter((y) => y.shared).length)).toBe(2);
  await expect(p.locator('#gallery .shared-badge')).toHaveCount(2);
  await p.locator('#gallery .thumb').first().click();
  await expect(p.locator('#viewer-share-row')).toBeVisible();
  await expect(p.locator('#viewer-share')).toBeChecked();
  await p.locator('#viewer-share').uncheck();
  await expect(p.locator('#toast')).toHaveText('Tu coach ya no ve esta foto');
  await p.locator('#viewer-close').click();
  await expect(p.locator('#gallery .shared-badge')).toHaveCount(1);
  await expect.poll(() => photosInServer(p).then((x) => x.filter((y) => y.shared).length)).toBe(1);
  // Una foto NUEVA, con el permiso vigente, la ve el coach sin hacer nada más
  await upload(p, D(-5), 'perfil');
  await expect.poll(() => photosInServer(p).then((x) => x.filter((y) => y.shared).length)).toBe(2);
  await expect(p.locator('#gallery .shared-badge')).toHaveCount(2);
  // Lo que ve el coach (API del coach contra el mismo servidor): solo la marcada, una URL por apertura y queda registrada
  const seen = await p.evaluate(async () => {
    const be = window.__pgFakeBackend;
    const m = {}; const mem = { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
    const r = RemoteFake.createFake({ backend: be, storage: mem });
    await r.auth.sendCode('laura@coach.co'); await r.auth.verifyCode('laura@coach.co', be.lastCode('laura@coach.co'));
    const uid = Object.values(be.users).find((u) => u.email === 'ana@c.co').id;
    const d = await r.coach.clientData(uid);
    await r.coach.photoBlob(uid, d.photos[0]);
    return { n: d.photos.length, views: be.photoViews.length };
  });
  expect(seen).toEqual({ n: 2, views: 1 });
  // Retirar A6b: se oculta al instante (el vínculo deja de compartir fotos) y las marcas se limpian
  await p.getByRole('button', { name: 'Quitar el permiso a mi coach' }).click();
  await p.locator('#a8-ok').click();
  await expect(p.locator('#photos-coach-state')).toContainText('todavía no puede ver tus fotos');
  const after = await p.evaluate(async () => {
    const be = window.__pgFakeBackend;
    const m = {}; const mem = { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
    const r = RemoteFake.createFake({ backend: be, storage: mem });
    await r.auth.sendCode('laura@coach.co'); await r.auth.verifyCode('laura@coach.co', be.lastCode('laura@coach.co'));
    const uid = Object.values(be.users).find((u) => u.email === 'ana@c.co').id;
    return (await r.coach.clientData(uid)).photos.length;
  });
  expect(after).toBe(0);
  await expect(p.locator('#gallery .shared-badge')).toHaveCount(0);
  // Borrar una foto: lápida + el archivo se borra de la nube
  await p.locator('#gallery .thumb').first().click();
  await p.locator('#viewer-delete').click();
  await expect.poll(() => photosInServer(p).then((x) => x.filter((y) => y.deleted && !y.hasFile).length)).toBe(1);
  // En pausa: el servidor rechaza la subida y la app no deja subir
  await p.evaluate(() => window.__pgFakeBackend.setPaidUntil('ana@c.co', new Date(window.__pgFakeBackend.clock.now() - 5 * 3600000 - 86400000).toISOString().slice(0, 10)));
  const refused = await p.evaluate(async () => {
    const r = RemoteFake.createFake({ backend: window.__pgFakeBackend, storage: localStorage });
    try { await r.sync.uploadPhoto('00000000-0000-4000-8000-0000000000aa', new Blob(['x'])); return 'subió'; } catch (e) { return e.code; }
  });
  expect(refused).toBe('payment_required');
  await p.evaluate(() => PGAccount.refreshLink());
  await expect(p.locator('body')).toHaveClass(/paused/);
  await expect(p.locator('#form-photo')).toBeHidden();
  await expect(p.locator('#gallery .thumb')).toHaveCount(2);   // ver sus fotos, siempre
  await H.layout(p);
  expect(errors).toEqual([]);
});

test('coach: ficha con fotos que el cliente marcó, una por una (cada apertura registrada) y comparar antes/después', async ({ browser }, testInfo) => {
  const ph = await H.phone(browser, testInfo);
  const c = ph.p;
  await c.goto('index.html');
  await H.acceptSolo(c);
  const code = await H.seedCoach(c, 'laura@coach.co', 'Laura Fit');
  await H.seedClient(c, 'ana@c.co', 'Ana Martínez', code, { paidDays: 10 });
  await c.evaluate(async () => {
    const be = window.__pgFakeBackend;
    const m = {}; const mem = { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
    const r = RemoteFake.createFake({ backend: be, storage: mem });
    await r.auth.sendCode('ana@c.co'); const { user } = await r.auth.verifyCode('ana@c.co', be.lastCode('ana@c.co'));
    await r.client.updateShares({ photos: true, version: 'compartir-c1', textHash: 'c'.repeat(64) });
    const cv = document.createElement('canvas'); cv.width = cv.height = 8;
    const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg'));
    const T = '2026-10-21T10:00:00.000Z';
    const mk = (id, date, pose) => ({ id, date, pose, width: 8, height: 8, storagePath: `${user.id}/${id}.jpg`, sharedWithCoach: true, createdAt: T, updatedAt: T });
    await r.sync.push({ photos: [mk('00000000-0000-4000-8000-0000000000b1', '2026-10-01', 'frente'), mk('00000000-0000-4000-8000-0000000000b2', '2026-10-21', 'frente')] });
    // El coach entra en este teléfono
    const rc = RemoteFake.createFake({ backend: be, storage: localStorage });
    await rc.auth.sendCode('laura@coach.co');
    const { user: u } = await rc.auth.verifyCode('laura@coach.co', be.lastCode('laura@coach.co'));
    const ok = (v) => ({ granted: true, version: v, textHash: 'a'.repeat(64), clientAt: '2026-10-01T12:00:00.000Z' });
    localStorage.setItem('perdida-grasa:account', JSON.stringify({ userId: u.id, email: u.email, roles: ['client', 'coach'], onboarded: true, coach: await rc.coach.myCoach(), cloudAsked: true,
      consents: { sensitive_health: ok('0.2-AU'), cloud_transfer: ok('0.2-AU'), coach_agreement: ok(ConsentTexts.version('A7')) } }));
    localStorage.setItem('perdida-grasa:owner', u.id);
  });
  await c.reload(); await H.ready(c);
  await c.evaluate(async () => {   // los archivos no se guardan en localStorage: se ponen en el «Storage» tras recargar
    const be = window.__pgFakeBackend;
    const cv = document.createElement('canvas'); cv.width = cv.height = 8;
    const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg'));
    for (const p of Object.values(be.photos)) be.blobs[p.storagePath] = blob;
  });
  await c.locator('#tab-coach').click();
  await c.addStyleTag({ content: H.WIDE });
  await c.locator('#coach-clients .cli-main').click();
  await expect(c.locator('#coach-detail-photos-card')).toBeVisible();
  await expect(c.locator('#coach-detail-photos button')).toHaveCount(2);
  await c.locator('#coach-detail-photos button').first().click();
  await expect(c.locator('#coach-photo-view')).toBeVisible();
  expect(await c.evaluate(() => window.__pgFakeBackend.photoViews.length)).toBe(1);
  await expect(c.locator('#coach-compare')).toBeVisible();
  await c.getByRole('button', { name: 'Comparar estas dos fotos' }).click();
  await expect(c.locator('#coach-compare-out figure')).toHaveCount(2);
  await expect(c.locator('#coach-compare-out figcaption').first()).toContainText('Antes');
  await expect(c.locator('#coach-compare-out figcaption').last()).toContainText('Después');
  expect(await c.evaluate(() => window.__pgFakeBackend.photoViews.length)).toBe(3);   // cada apertura queda registrada
  await H.layout(c); await H.tall(c, '#coach-detail-photos-card'); await H.shot(c, 's11-coach-fotos-comparar.png', { fullPage: true });
  expect(ph.errors).toEqual([]);
});
