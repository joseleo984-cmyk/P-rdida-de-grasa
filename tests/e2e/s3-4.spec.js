// S3-4 (R1): panel del coach + lado del cliente, con DOS usuarios (coach y cliente) contra el servidor FALSO.
// Cada usuario usa su propio contexto (su propio "teléfono"). El servidor falso vive en localStorage['pg-fake-backend']
// de cada contexto, así que `transfer()` copia el estado del servidor de un teléfono al otro y recarga: equivale a que
// los dos hablen con el mismo servidor. Los blobs de fotos no se serializan: se colocan en el "Storage" del teléfono
// del coach (lo haría la subida a Storage de S3-3).
const { test, expect, state, CONSENT, acceptLegalIfPresent } = require('./helpers');

const FAKE = 'index.html?remote=fake';
const SKIP = { 'perdida-grasa:account-skip': '1' };
const XSS_NAME = '<img src=x onerror="window.__xss=1">Lucía';
const XSS_BIZ = 'Fit <b onmouseover="window.__xss=2">Ana</b>';
const XSS_COMMENT = '¡Bien! <img src=x onerror="window.__xss=3"> Sigue así';
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const day = (n) => new Date(Date.UTC(2026, 9, 21 - n)).toISOString().slice(0, 10);

async function loginAs(page, email, { coach, displayName } = {}) {
  await page.evaluate(async ({ email, coach, displayName }) => {
    const be = window.__pgFakeBackend;
    const r = RemoteFake.createFake({ backend: be, storage: localStorage });
    await r.auth.sendCode(email);
    const { user } = await r.auth.verifyCode(email, be.lastCode(email));
    await r.account.joinApp();
    if (displayName) await r.account.setDisplayName(displayName);
    let c = null;
    if (coach) { await r.coach.becomeCoach(coach); c = await r.coach.myCoach(); }
    localStorage.setItem('perdida-grasa:account', JSON.stringify({ userId: user.id, email: user.email, roles: await r.account.roles(), onboarded: true, coach: c }));
  }, { email, coach, displayName });
  await page.reload();
  await acceptLegalIfPresent(page);
}
async function transfer(from, to) {
  const json = await from.evaluate(() => localStorage.getItem('pg-fake-backend'));
  await to.evaluate((j) => localStorage.setItem('pg-fake-backend', j), json);
  await to.reload();
  await expect(to.locator('.tabbar')).toBeVisible();
}
const backend = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('pg-fake-backend')));
// Lo que haría sync.js (S3-3): subir los registros del cliente con la API del contrato.
async function pushClientData(page) {
  await page.evaluate(async ({ recs }) => {
    const r = RemoteFake.createFake({ backend: window.__pgFakeBackend, storage: localStorage });
    await r.sync.push({ records: recs });
  }, { recs: [
    { id: U(1), kind: 'profile', nkey: 'profile', data: { name: '<script>window.__xss=4</script>Perfil', sex: 'female', age: 35, height: 165, startWeight: 72, goalWeight: 62, startDate: day(20), activity: 1.375, rate: 0.005 }, updatedAt: '2026-10-21T10:00:00.000Z' },
    ...[0, 1, 2, 4, 6, 9, 13, 17, 20].map((n, i) => ({ id: U(10 + i), kind: 'entry', nkey: day(n), date: day(n), data: { weight: 70 + n * 0.1, note: 'NOTA PRIVADA ' + n, waist: 80 }, updatedAt: '2026-10-21T10:00:00.000Z' })),
    { id: U(30), kind: 'food', nkey: U(30), date: day(0), data: { name: 'Arepa', meal: 'Desayuno', kcal: 300, protein: 20, carbs: 30, fat: 10 }, updatedAt: '2026-10-21T10:00:00.000Z' },
    { id: U(31), kind: 'habit', nkey: day(0), date: day(0), data: { steps: 9000, trained: true }, updatedAt: '2026-10-21T10:00:00.000Z' },
    { id: U(32), kind: 'library', nkey: 'pan secreto', data: { name: 'Pan secreto', kcal: 100 }, updatedAt: '2026-10-21T10:00:00.000Z' },
  ] });
}

test('coach y cliente: invitación, semáforo, ficha filtrada, fotos con registro, comentarios y control del cliente', async ({ app, page, browser }, testInfo) => {
  test.setTimeout(90_000);
  const coach = page;
  // ---- Teléfono del cliente ----
  const ctx = await browser.newContext({ ...testInfo.project.use, baseURL: testInfo.project.use.baseURL });
  const client = await ctx.newPage();
  const clientErrors = [];
  client.on('pageerror', (e) => clientErrors.push(e.message));
  client.on('console', (m) => { if (m.type() === 'error') clientErrors.push(m.text()); });
  client.on('dialog', (d) => d.accept());
  await client.clock.install({ time: new Date('2026-10-21T12:00:00-05:00') });
  await client.addInitScript(({ s, skip }) => {
    if (sessionStorage.getItem('__seed')) return;
    sessionStorage.setItem('__seed', '1');
    localStorage.setItem('perdida-grasa:v1', JSON.stringify(s));
    for (const [k, v] of Object.entries(skip)) localStorage.setItem(k, v);
  }, { s: state({ consent: CONSENT }), skip: SKIP });

  await test.step('el coach crea su cuenta y ve su panel vacío con el código', async () => {
    await app.open({ path: FAKE, state: state({ consent: CONSENT }), prefs: SKIP });
    await loginAs(coach, 'coach@x.co', { coach: XSS_BIZ });
    await expect(coach.locator('#tab-coach')).toBeVisible();
    await coach.locator('#tab-coach').click();
    await expect(coach.locator('#coach-clients')).toContainText('Aún no tienes clientes');
    await expect(coach.locator('#coach-invite-code')).toHaveText(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    await expect(coach.locator('#coach-invite-info')).toContainText('Sin caducidad');
    expect(await app.scrollWidth()).toBeLessThanOrEqual(390);
  });
  const invite = (await coach.locator('#coach-invite-code').textContent()).trim();

  await test.step('el cliente entra, sube sus datos y se vincula desde Perfil eligiendo qué comparte', async () => {
    await client.goto(FAKE);
    await transfer(coach, client);
    await loginAs(client, 'cli@x.co', { displayName: XSS_NAME });
    await pushClientData(client);
    await expect(client.locator('#tab-coach')).toBeHidden();
    await client.locator('#tab-perfil').click();
    await client.getByRole('button', { name: 'Vincularme con un coach' }).click();
    await client.getByLabel(/Código de mi coach/).fill(invite);
    await client.getByRole('button', { name: 'Comprobar código' }).click();
    await expect(client.locator('#acc-share-title')).toHaveText(`Te vas a vincular con «${XSS_BIZ}».`); // texto literal, escapado
    await client.locator('#acc-share').getByLabel(/Comidas del diario/).check();
    await client.getByRole('button', { name: 'Vincularme y continuar' }).click();
    await client.getByRole('button', { name: 'Ir a la app' }).click();
    await client.locator('#tab-perfil').click();
    await expect(client.locator('#shares-title')).toContainText(`«${XSS_BIZ}»`);
    await expect(client.locator('#form-shares [name=share_nutrition]')).toBeChecked();
    await expect(client.locator('#form-shares [name=share_habits]')).not.toBeChecked();
    const be = await backend(client);
    expect(be.consentEvents.filter((e) => e.kind.startsWith('share_')).every((e) => /^[0-9a-f]{64}$/.test(e.textHash) && e.version === 'compartir-1')).toBe(true);
  });

  await test.step('el coach ve al cliente con semáforo; la ficha solo muestra lo consentido (sin notas ni biblioteca)', async () => {
    await transfer(client, coach);
    await coach.locator('#tab-coach').click();
    const item = coach.locator('#coach-clients .client-btn');
    await expect(item).toHaveCount(1);
    await expect(item.locator('.who')).toHaveText(XSS_NAME);
    await expect(item.locator('.light')).toHaveText(/Verde|Amarillo|Rojo/);
    await expect(item.locator('.light')).toHaveText('Verde'); // 5/7 días y peso bajando
    await item.click();
    await expect(coach.locator('#coach-detail-title')).toBeFocused();
    await expect(coach.locator('#coach-detail-title')).toHaveText(XSS_NAME);
    await expect(coach.locator('#coach-detail-summary')).toContainText('70,0 kg');
    await expect(coach.locator('#coach-detail-shares')).toContainText('No comparte: hábitos, notas, fotos');
    const head = coach.locator('#coach-detail-adherence thead');
    await expect(head).toContainText('Días con comidas');
    await expect(head).toContainText('Proteína media');
    await expect(head).not.toContainText('Días con hábitos');
    await expect(coach.locator('body')).not.toContainText('NOTA PRIVADA');
    await expect(coach.locator('body')).not.toContainText('Pan secreto');
    expect(await app.scrollWidth()).toBeLessThanOrEqual(390);
  });

  await test.step('comentario del coach (con XSS) → el cliente lo ve como texto y lo marca leído → el coach ve "Leído"', async () => {
    await coach.getByLabel(/Nuevo comentario/).fill(XSS_COMMENT);
    await coach.getByRole('button', { name: 'Enviar comentario' }).click();
    await expect(coach.locator('#coach-comments .note-body')).toHaveText(XSS_COMMENT);
    await expect(coach.locator('#coach-comments')).toContainText('No leído');
    await transfer(coach, client);
    await expect(client.locator('#coach-notes')).toBeVisible();
    await expect(client.locator('#coach-notes .note-body')).toHaveText(XSS_COMMENT);
    await expect(client.locator('#coach-notes-unread')).toHaveText('1 sin leer');
    await client.getByRole('button', { name: 'Marcar como leído' }).click();
    await expect(client.locator('#coach-notes-unread')).toBeHidden();
    await expect(client.locator('#coach-notes')).toContainText('Leído');
    await transfer(client, coach);
    await coach.locator('#tab-coach').click();
    await coach.locator('#coach-clients .client-btn').click();
    await expect(coach.locator('#coach-comments')).toContainText('Leído');
  });

  await test.step('fotos: solo si el cliente las comparte; cada apertura pide una URL nueva y queda registrada', async () => {
    await expect(coach.locator('#coach-detail-photos-card')).toBeHidden();
    await transfer(coach, client);
    await client.evaluate(async () => {
      const be = window.__pgFakeBackend;
      const r = RemoteFake.createFake({ backend: be, storage: localStorage });
      const uid = (await r.auth.session()).user.id;
      const id = '00000000-0000-4000-8000-0000000000f1';
      await r.sync.push({ photos: [{ id, date: '2026-10-20', pose: 'frente', width: 8, height: 8, storagePath: `${uid}/${id}.jpg`, sharedWithCoach: false, createdAt: '2026-10-20T10:00:00.000Z', updatedAt: '2026-10-20T10:00:00.000Z' }] });
      await r.client.setPhotoShared(id, true);
    });
    await client.locator('#tab-perfil').click();
    await client.locator('#form-shares [name=share_photos]').check();
    await client.getByRole('button', { name: 'Guardar lo que comparto' }).click();
    await expect(client.locator('#toast')).toContainText('Guardado');
    await transfer(client, coach);
    await coach.evaluate(async () => { // el archivo en Storage (lo subiría S3-3)
      const be = window.__pgFakeBackend;
      const p = Object.values(be.photos)[0];
      const c = document.createElement('canvas'); c.width = c.height = 8;
      be.blobs[p.storagePath] = await new Promise((res) => c.toBlob(res, 'image/jpeg'));
    });
    await coach.locator('#tab-coach').click();
    await coach.locator('#coach-clients .client-btn').click();
    await expect(coach.locator('#coach-detail-photos-card')).toBeVisible();
    await coach.getByRole('button', { name: /Ver foto: .* frente/ }).click();
    await expect(coach.locator('#coach-photo-view img')).toHaveAttribute('src', /^blob:/);
    const first = await coach.locator('#coach-photo-view img').getAttribute('src');
    await coach.getByRole('button', { name: /Ver foto: .* frente/ }).click();
    await expect(coach.locator('#coach-photo-view img')).not.toHaveAttribute('src', first);
    expect((await backend(coach)).photoViews.length).toBe(2);
  });

  await test.step('el cliente deja de compartir comidas → el coach deja de ver esa columna', async () => {
    await transfer(coach, client);
    await client.locator('#tab-perfil').click();
    await client.locator('#form-shares [name=share_nutrition]').uncheck();
    await client.getByRole('button', { name: 'Guardar lo que comparto' }).click();
    await expect(client.locator('#toast')).toContainText('Guardado');
    await transfer(client, coach);
    await coach.locator('#tab-coach').click();
    await coach.locator('#coach-clients .client-btn').click();
    await expect(coach.locator('#coach-detail-adherence thead')).not.toContainText('Días con comidas');
  });

  await test.step('el coach rota el código con caducidad y usos', async () => {
    await coach.getByRole('button', { name: '← Mis clientes' }).click();
    await coach.locator('#form-rotate [name=validDays]').selectOption('7');
    await coach.locator('#form-rotate [name=maxUses]').selectOption('1');
    await coach.getByRole('button', { name: 'Generar código nuevo' }).click();
    await expect(coach.locator('#coach-invite-code')).not.toHaveText(invite);
    await expect(coach.locator('#coach-invite-info')).toContainText('Válido hasta el 28/10/2026');
    await expect(coach.locator('#coach-invite-info')).toContainText('usado 0 de 1 veces');
  });

  await test.step('el cliente termina el vínculo → el coach ya no lo ve', async () => {
    await transfer(coach, client);
    await client.locator('#tab-perfil').click();
    await client.getByRole('button', { name: 'Terminar el vínculo' }).click();
    await expect(client.getByRole('button', { name: 'Vincularme con un coach' })).toBeVisible();
    await transfer(client, coach);
    await coach.locator('#tab-coach').click();
    await expect(coach.locator('#coach-clients')).toContainText('Aún no tienes clientes');
  });

  expect(await coach.evaluate(() => window.__xss)).toBeUndefined();
  expect(await client.evaluate(() => window.__xss)).toBeUndefined();
  expect(clientErrors).toEqual([]);
  await ctx.close();
});

test('cerrar sesión pregunta si borrar los datos del teléfono, con "No" marcado por defecto', async ({ app, page }) => {
  await app.open({ path: FAKE, state: state({ consent: CONSENT }), prefs: SKIP });
  await loginAs(page, 'z@x.co');
  await app.tab('perfil');
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByLabel('No, conservarlos aquí')).toBeChecked();
  await expect(page.getByLabel('No, conservarlos aquí')).toBeFocused();
  await page.locator('#form-logout').getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.locator('#account-status')).toContainText('Sin cuenta');
  expect((await app.stored()).entries).toHaveLength(1);
});
