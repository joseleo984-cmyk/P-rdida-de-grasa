// Sprint 6: autorizaciones A1–A8, edad mínima 18 y bloqueos de la preasesoría legal. Servidor FALSO (sin red).
// Letra ancha a 390 px: sin desborde horizontal y toques de al menos 48 px. Con CAPTURAS=1 guarda las pantallas nuevas.
const { test, expect, state, CONSENT, D } = require('./helpers');
const { EMPTY, loginAsCoach, newPhone, loginWithEmail, consentsSeed, acceptTerms, answerCloud } = require('./fake-helpers');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const CT = require('../../consent-texts.js');

const FAKE = 'index.html?remote=fake';
const WIDE = '*{font-family:"DejaVu Sans",Verdana,sans-serif !important; letter-spacing:.02em}';
const SHOTS = path.resolve(__dirname, '../../equipo/qa-capturas');
const sha = (t) => crypto.createHash('sha256').update(t, 'utf8').digest('hex');
const backend = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('pg-fake-backend')));
const eventsOf = async (page, email) => { const be = await backend(page); const u = be.users[email]; return u ? be.consentEvents.filter((e) => e.userId === u.id) : []; };
const kinds = (ev) => ev.map((e) => e.kind);
const lastCode = (page, email) => page.evaluate((e) => window.__pgFakeBackend.lastCode(e), email);
const shot = async (page, name, opts = {}) => { if (process.env.CAPTURAS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name), ...opts }); } };

// Mide: sin desborde horizontal y cada control tocable visible mide al menos 48 px de alto.
async function checkLayout(page, scope = 'body') {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const bad = await page.evaluate((scope) => {
    const root = document.querySelector(scope);
    const out = [];
    for (const el of root.querySelectorAll('button, a[href], input[type=checkbox], input[type=radio], label.check')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue;
      if (el.closest('.hidden, [hidden], dialog:not([open])')) continue;
      if (r.left < -0.5 || r.right > 390.5) out.push(`${el.tagName}#${el.id || el.name || el.textContent.trim().slice(0, 20)} fuera: ${r.left}-${r.right}`);
      const target = el.tagName === 'INPUT' ? el.closest('label') || el : el;
      if (target.getBoundingClientRect().height < 47.5) out.push(`${el.tagName}#${el.id || el.name || el.textContent.trim().slice(0, 20)} alto ${target.getBoundingClientRect().height}`);
    }
    return out;
  }, scope);
  expect(bad).toEqual([]);
}

// ---------- Edad mínima 18 (aplica SIEMPRE, también sin servidor) ----------
test('edad mínima 18: el formulario rechaza 17 con un mensaje amable y no guarda; 18 sí se guarda', async ({ app, page }) => {
  await app.open({ state: { schemaVersion: 4, entries: [], consent: CONSENT } });
  await app.goPerfil('plan');
  const f = page.locator('#form-profile');
  await f.locator('[name=sex]').selectOption('male');
  await f.locator('[name=age]').fill('17');
  await f.locator('[name=height]').fill('175');
  await f.locator('[name=startWeight]').fill('90');
  await f.locator('[name=goalWeight]').fill('80');
  await expect(page.locator('#age-note')).toBeVisible();
  await expect(page.locator('#age-note')).toContainText('solo para personas de 18 años o más');
  await expect(page.locator('#age-note')).toContainText('Si escribiste mal tu edad, corrígela');
  expect(await f.locator('[name=age]').evaluate((el) => el.validationMessage)).toContain('18 años o más');
  await f.locator('button[type=submit]').click();
  expect((await app.stored()).profile).toBeFalsy();                  // nada se guardó
  await f.locator('[name=age]').fill('18');
  await expect(page.locator('#age-note')).toBeHidden();
  await f.locator('button[type=submit]').click();
  await expect(app.toast()).toHaveText('Perfil guardado');
  expect((await app.stored()).profile.age).toBe(18);
});

test('edad mínima 18: un perfil ya guardado de un menor NO se borra: la app avisa y pide corregir (con letra ancha, sin desborde)', async ({ app, page }) => {
  const minor = { name: 'Leo', sex: 'male', age: 16, height: 170, startWeight: 80, goalWeight: 70, startDate: D(10), activity: 1.375, rate: 0.005 };
  await app.open({ state: state({ profile: minor, consent: CONSENT }) });
  await app.goPerfil('plan');
  await page.addStyleTag({ content: WIDE });
  const issue = page.locator('#profile-issue');
  await expect(issue).toBeVisible();
  await expect(issue).toContainText('Revisa tu perfil');
  await expect(issue).toContainText('18 años o más');
  await expect(page.locator('#form-profile [name=age]')).toHaveValue('16');   // se conserva para corregirlo
  await expect(page.locator('#age-note')).toBeVisible();
  // No se perdió nada: el borrador sigue guardado y los registros también
  const raw = await app.stored();
  expect(raw.profile.age).toBe(16);
  expect(raw.entries.length).toBeGreaterThan(0);
  expect(await app.scrollWidth()).toBeLessThanOrEqual(390);
  await shot(page, 's6-edad-menor.png', { fullPage: true });
  await page.locator('#form-profile [name=age]').fill('30');
  await page.locator('#form-profile button[type=submit]').click();
  await expect(app.toast()).toHaveText('Perfil guardado');
  await expect(issue).toBeHidden();
  expect((await app.stored()).profile.age).toBe(30);
});

// ---------- Sin servidor: nada de lo nuevo se ve ----------
test('sin servidor configurado no existe nada de las autorizaciones nuevas (solo la edad de 18 aplica)', async ({ app, page }) => {
  await app.open({ state: state({ consent: CONSENT }) });
  expect(await page.evaluate(() => typeof window.PGAccount)).toBe('undefined');
  await app.goPerfil('all');
  for (const sel of ['#perms-card', '#account-card', '#form-shares', '#btn-account-cloud', '#btn-account-delete', '#acc-step-cloud', '#sheet-a8']) await expect(page.locator(sel)).toBeHidden();
  await expect(page.getByTestId('account-gate')).toBeHidden();
  // El modo local sigue completo: se puede registrar peso sin tocar ninguna autorización nueva
  await app.tab('registro');
  await page.locator('#form-entry [name=weight]').fill('69.5');
  await page.locator('#form-entry button[type=submit]').click();
  await expect(page.locator('#entries-table tbody tr')).toHaveCount(2);
});

// ---------- A1 + A2 al crear la cuenta; A3 + A4 al activar la copia ----------
test('A1 y A2 vienen sin marcar y sin ellas no sale el correo; A3 y A4 son un paso aparte que no obliga', async ({ app, page }) => {
  await app.open({ path: FAKE, state: state({ consent: CONSENT }) });
  await page.addStyleTag({ content: WIDE });
  await expect(page.getByTestId('account-gate')).toBeVisible();
  const a1 = page.locator('#acc-a1'), a2 = page.locator('#acc-a2');
  await expect(a1).not.toBeChecked();
  await expect(a2).not.toBeChecked();
  await expect(page.locator('#acc-a1-text')).toHaveText('Declaro que soy mayor de 18 años. Esta app no es para menores de edad.');
  await expect(page.locator('#acc-a2-text')).toHaveText('Leí y acepto los Términos y Condiciones y la Política de Tratamiento de Datos (versión 0.1).');
  await expect(page.locator('#acc-brevo')).toContainText('Te enviaremos un código con Brevo');
  await expect(page.locator('#acc-a2-links a')).toHaveCount(2);
  await expect(page.locator('#acc-a2-links a').first()).toHaveAttribute('href', 'legal/terminos.html');
  await expect(page.locator('#acc-a2-links a').nth(1)).toHaveAttribute('href', 'legal/privacidad.html');
  await checkLayout(page, '#acc-step-email');
  await shot(page, 's6-a1-a2-correo.png', { fullPage: true });

  await page.getByLabel('Tu correo').fill('ana@ejemplo.com');
  await page.getByRole('button', { name: 'Enviarme el código' }).click();
  await expect(page.locator('#acc-email-error')).toContainText('marca las dos casillas');
  expect(await lastCode(page, 'ana@ejemplo.com')).toBeNull();           // no se envió nada
  await a1.check();
  await page.getByRole('button', { name: 'Enviarme el código' }).click();
  await expect(page.locator('#acc-email-error')).toContainText('marca las dos casillas');
  expect(await lastCode(page, 'ana@ejemplo.com')).toBeNull();
  await a2.check();
  await page.getByRole('button', { name: 'Enviarme el código' }).click();
  await expect(page.locator('#acc-step-code')).toBeVisible();
  await page.getByLabel('Código', { exact: true }).fill(await lastCode(page, 'ana@ejemplo.com'));
  await page.getByRole('button', { name: /Sí, son míos/ }).click();

  // Paso de la copia en la nube: A3 y A4 sin marcar, con Brevo y Supabase EE. UU. nombrados
  await expect(page.locator('#acc-step-cloud')).toBeVisible();
  await expect(page.locator('#acc-a3')).not.toBeChecked();
  await expect(page.locator('#acc-a4')).not.toBeChecked();
  await expect(page.locator('#acc-a3-text')).toContainText('Autorizo a José Granados a tratar mis datos sensibles de salud');
  await expect(page.locator('#acc-a4-text')).toContainText('Supabase, servidores en EE. UU.');
  await expect(page.locator('#acc-a4-text')).toContainText('Brevo');
  await expect(page.locator('#acc-a4-text')).toContainText('transmisión internacional');
  await expect(page.locator('#acc-a4-text')).toContainText('Es facultativo');
  await checkLayout(page, '#acc-step-cloud');
  await shot(page, 's6-a3-a4-nube.png', { fullPage: true });
  // Solo una marcada: no se activa
  await page.locator('#acc-a3').check();
  await page.getByRole('button', { name: 'Activar la copia en la nube' }).click();
  await expect(page.locator('#acc-cloud-error')).toContainText('marca las dos autorizaciones');
  expect(kinds(await eventsOf(page, 'ana@ejemplo.com')).includes('cloud_transfer')).toBe(false);
  // "Ahora no": la cuenta sigue, la copia queda apagada y nada se sube
  await page.getByRole('button', { name: /Ahora no: solo en mi teléfono/ }).click();
  await expect(page.locator('#acc-step-role')).toBeVisible();
  await page.getByLabel(/Soy cliente/).check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Ir a la app' }).click();
  await expect.poll(async () => kinds(await eventsOf(page, 'ana@ejemplo.com')).sort()).toEqual(['adult', 'privacy', 'terms']);
  const ev = await eventsOf(page, 'ana@ejemplo.com');
  expect(ev.find((e) => e.kind === 'adult')).toMatchObject({ granted: true, version: CT.version('A1'), textHash: sha(CT.fullText('A1')) });
  expect(ev.find((e) => e.kind === 'terms')).toMatchObject({ granted: true, version: CT.version('A2'), textHash: sha(CT.fullText('A2', { legalVersion: '0.1' })) });
  await page.waitForTimeout(500);
  expect(Object.keys((await backend(page)).records)).toHaveLength(0);       // sin A3+A4 no se sube nada
  await app.goPerfil('datos');
  await expect(page.locator('#sync-status')).toContainText('copia en la nube está apagada');
  await expect(page.locator('#btn-sync-now')).toBeHidden();
});

test('activar la copia después, desde Mis datos y permisos: registra A3 y A4 con su huella y entonces sí se sincroniza', async ({ app, page }) => {
  await app.open({ path: FAKE, state: state({ consent: CONSENT }) });
  await page.getByLabel('Tu correo').fill('bea@ejemplo.com');
  await acceptTerms(page);
  await page.getByRole('button', { name: 'Enviarme el código' }).click();
  await page.getByLabel('Código', { exact: true }).fill(await lastCode(page, 'bea@ejemplo.com'));
  await page.getByRole('button', { name: /Sí, son míos/ }).click();
  await answerCloud(page, false);
  await page.getByLabel(/Soy cliente/).check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Ir a la app' }).click();
  await app.goPerfil('datos');
  await page.addStyleTag({ content: WIDE });
  await page.getByRole('button', { name: 'Activar la copia en la nube' }).click();
  await answerCloud(page, true);
  await expect(page.getByTestId('account-gate')).toBeHidden();
  await expect.poll(async () => kinds(await eventsOf(page, 'bea@ejemplo.com')).sort()).toEqual(['adult', 'cloud_transfer', 'privacy', 'sensitive_health', 'terms']);
  const ev = await eventsOf(page, 'bea@ejemplo.com');
  expect(ev.find((e) => e.kind === 'cloud_transfer')).toMatchObject({ granted: true, version: CT.version('A4'), textHash: sha(CT.fullText('A4')) });
  expect(ev.find((e) => e.kind === 'sensitive_health')).toMatchObject({ granted: true, version: CT.version('A3'), textHash: sha(CT.fullText('A3')) });
  await expect.poll(async () => Object.keys((await backend(page)).records).length).toBeGreaterThan(0);   // ahora sí sube
});

// ---------- "Mis datos y permisos": A3, A4, A6a, A6b ----------
async function signedInClient(app, page, email = 'cli@ejemplo.com') {
  await app.open({ path: FAKE, state: state({ consent: CONSENT }) });
  await page.getByLabel('Tu correo').fill(email);
  await acceptTerms(page);
  await page.getByRole('button', { name: 'Enviarme el código' }).click();
  await page.getByLabel('Código', { exact: true }).fill(await lastCode(page, email));
  await page.getByRole('button', { name: /Sí, son míos/ }).click();
  await answerCloud(page, true);
  await page.getByLabel(/Soy cliente/).check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Ir a la app' }).click();
}

test('A6a y A6b: dos interruptores separados, sin marcar, que solo registran la decisión; la subida de fotos sigue APAGADA', async ({ app, page }) => {
  await signedInClient(app, page);
  await app.goPerfil('datos');
  await page.addStyleTag({ content: WIDE });
  const card = page.locator('#perms-card');
  await expect(card).toBeVisible();
  const a6a = card.locator('input[data-auth=A6a]'), a6b = card.locator('input[data-auth=A6b]');
  await expect(a6a).not.toBeChecked();
  await expect(a6b).not.toBeChecked();
  await expect(card).toContainText('Autorizo guardar mis fotos de progreso en la nube');
  await expect(card).toContainText('Autorizo que tu coach vea la foto que marqué, una a una');
  await expect(card).toContainText('por ahora no se suben a la nube');
  await checkLayout(page, '#perms-card');
  await shot(page, 's6-permisos.png', { fullPage: true });
  await a6a.check();
  await expect.poll(async () => kinds(await eventsOf(page, 'cli@ejemplo.com'))).toContain('photos_cloud');
  expect(kinds(await eventsOf(page, 'cli@ejemplo.com'))).not.toContain('photo_view_coach'); // A6b es otra decisión
  await a6b.check();
  await expect.poll(async () => kinds(await eventsOf(page, 'cli@ejemplo.com'))).toContain('photo_view_coach');
  const ev = await eventsOf(page, 'cli@ejemplo.com');
  expect(ev.find((e) => e.kind === 'photos_cloud')).toMatchObject({ granted: true, version: CT.version('A6a'), textHash: sha(CT.fullText('A6a')) });
  expect(ev.find((e) => e.kind === 'photo_view_coach')).toMatchObject({ granted: true, version: CT.version('A6b'), textHash: sha(CT.fullText('A6b', { coach: 'tu coach' })) });
  // La subida de fotos NO se enciende por tener las autorizaciones
  await app.tab('perfil');
  expect(await page.evaluate(() => Object.keys(window.__pgFakeBackend.photos).length)).toBe(0);
  expect(Object.keys((await backend(page)).photos)).toHaveLength(0);
  const src = await (await page.request.get('app.js')).text();
  expect(src).toMatch(/photosCloudAllowed: \(\) => false/);
  // Las autorizaciones sobreviven a recargar
  await app.reload();
  await app.goPerfil('datos');
  await expect(a6a).toBeChecked();
});

test('retirar la copia en la nube: aviso A8 con "Exportar antes", Cancelar no cambia nada y Retirar apaga la sincronización y termina el vínculo', async ({ app, page, browser }, testInfo) => {
  test.setTimeout(90_000);
  await app.open({ path: FAKE, state: EMPTY(), prefs: { 'perdida-grasa:account-skip': '1' } });
  await loginAsCoach(page, 'coach@ejemplo.com', 'Fit Ana');
  const code = await page.evaluate(() => JSON.parse(localStorage.getItem('perdida-grasa:account')).coach.inviteCode);
  const backendJSON = await page.evaluate(() => localStorage.getItem('pg-fake-backend'));
  const { ctx, p } = await newPhone(browser, testInfo, { backend: backendJSON, path: FAKE });
  await loginWithEmail(p, 'cli@ejemplo.com');
  await p.getByLabel(/Soy cliente/).check();
  await p.getByLabel(/Código de mi coach/).fill(code);
  await p.getByRole('button', { name: 'Comprobar código' }).click();
  await p.getByRole('button', { name: 'Conectarme y continuar' }).click();
  await p.getByRole('button', { name: 'Ir a la app' }).click();
  await p.evaluate(() => PGNav.show('perfil', 'datos'));
  await p.addStyleTag({ content: WIDE });
  const A4 = p.locator('#perms-card input[data-auth=A4]');
  await expect(A4).toBeChecked();
  expect((await backend(p)).links.filter((l) => l.status === 'active')).toHaveLength(1);
  await A4.click();
  const dlg = p.locator('#sheet-a8');
  await expect(dlg).toBeVisible();
  await expect(p.locator('#a8-text')).toContainText('Retirarás la copia en la nube. Tu coach deja de verlo ya.');
  await expect(p.locator('#a8-text')).toContainText('prueba mínima de tu autorización anterior, sin tu nombre');
  await checkLayout(p, '#sheet-a8');
  await shot(p, 's6-a8-retirar.png');
  await p.locator('#a8-cancel').click();
  await expect(dlg).toBeHidden();
  await expect(A4).toBeChecked();                                            // cancelar no cambia nada
  expect(kinds(await eventsOf(p, 'cli@ejemplo.com')).filter((k) => k === 'cloud_transfer')).toHaveLength(1);
  await A4.click();
  const dl = p.waitForEvent('download');
  await p.getByRole('button', { name: 'Exportar mis datos' }).click();
  await dl;
  await expect(p.locator('#a8-exported')).toBeVisible();
  await p.locator('#a8-ok').click();
  await expect(dlg).toBeHidden();
  await expect(A4).not.toBeChecked();
  await expect.poll(async () => (await eventsOf(p, 'cli@ejemplo.com')).filter((e) => e.kind === 'cloud_transfer').map((e) => e.granted)).toEqual([true, false]);
  expect((await backend(p)).links.filter((l) => l.status === 'active')).toHaveLength(0); // el coach deja de ver ya
  await expect(p.locator('#sync-status')).toContainText('copia en la nube está apagada');
  await ctx.close();
});

// ---------- A5: compartir por categoría (nace apagado) y migración de vínculos anteriores ----------
async function coachAndClient(app, page, browser, testInfo, { email = 'cli@ejemplo.com' } = {}) {
  await app.open({ path: FAKE, state: EMPTY(), prefs: { 'perdida-grasa:account-skip': '1' } });
  await loginAsCoach(page, 'coach@ejemplo.com', 'Fit Ana');
  const code = await page.evaluate(() => JSON.parse(localStorage.getItem('perdida-grasa:account')).coach.inviteCode);
  const backendJSON = await page.evaluate(() => localStorage.getItem('pg-fake-backend'));
  const { ctx, p } = await newPhone(browser, testInfo, { backend: backendJSON, path: FAKE });
  await loginWithEmail(p, email);
  await p.getByLabel(/Soy cliente/).check();
  await p.getByLabel(/Código de mi coach/).fill(code);
  await p.getByRole('button', { name: 'Comprobar código' }).click();
  return { ctx, p, code };
}

test('A5: al vincularse cada categoría viene sin marcar (comidas y hábitos también), con el texto exacto y compartir-2', async ({ app, page, browser }, testInfo) => {
  test.setTimeout(90_000);
  const { ctx, p } = await coachAndClient(app, page, browser, testInfo);
  await p.addStyleTag({ content: WIDE });
  const box = p.locator('#acc-share');
  await expect(box).toBeVisible();
  await expect(p.locator('#acc-share-title')).toHaveText('Te vas a conectar con «Fit Ana».');
  await expect(box).toContainText('Compartir con Fit Ana (él es responsable de cómo usa lo que ves):');
  await expect(box).toContainText('Tu coach no ve tu correo. Puedes quitar cada categoría o terminar el vínculo cuando quieras; deja de verla al instante.');
  await expect(box.getByLabel('Peso y medidas (necesario mientras estés vinculado/a)')).toBeChecked();
  await expect(box.getByLabel('Peso y medidas (necesario mientras estés vinculado/a)')).toBeDisabled();
  for (const l of ['Notas personales', 'Comidas', 'Hábitos']) await expect(box.getByLabel(l, { exact: true })).not.toBeChecked();
  await expect(box.getByLabel('Fotos (se piden aparte, ver A6)')).not.toBeChecked();
  await expect(box.getByLabel('Fotos (se piden aparte, ver A6)')).toBeDisabled();
  await checkLayout(p, '#acc-share');
  await shot(p, 's6-a5-vincular.png', { fullPage: true });
  await box.getByLabel('Hábitos', { exact: true }).check();
  await p.getByRole('button', { name: 'Conectarme y continuar' }).click();
  await p.getByRole('button', { name: 'Ir a la app' }).click();
  const be = await backend(p);
  const link = be.links.find((l) => l.status === 'active');
  expect(link.shares).toEqual({ body: true, notes: false, nutrition: false, habits: true, photos: false });
  const shareEvents = be.consentEvents.filter((e) => e.kind.startsWith('share_'));
  expect(shareEvents).toHaveLength(5);
  const hash = sha(CT.fullText('A5', { coach: 'Fit Ana' }));
  for (const e of shareEvents) expect(e).toMatchObject({ version: 'compartir-2', textHash: hash });
  expect(shareEvents.find((e) => e.kind === 'share_habits').granted).toBe(true);
  expect(shareEvents.find((e) => e.kind === 'share_nutrition').granted).toBe(false);
  await ctx.close();
});

test('vínculos anteriores (compartir-1): se avisa, nada cambia solo, y al confirmar se registran las 4 categorías con compartir-2', async ({ app, page, browser }, testInfo) => {
  test.setTimeout(90_000);
  const { ctx, p } = await coachAndClient(app, page, browser, testInfo);
  await p.locator('#acc-share [name=share_nutrition]').check();
  await p.getByRole('button', { name: 'Conectarme y continuar' }).click();
  await p.getByRole('button', { name: 'Ir a la app' }).click();
  // Se simula un vínculo hecho con la versión anterior: sin shareVersion en el teléfono
  await p.evaluate(() => { const m = JSON.parse(localStorage.getItem('perdida-grasa:account')); delete m.shareVersion; localStorage.setItem('perdida-grasa:account', JSON.stringify(m)); });
  await p.reload();
  await p.evaluate(() => PGNav.show('perfil', 'datos'));
  await p.addStyleTag({ content: WIDE });
  const note = p.locator('#shares-migrate');
  await expect(note).toBeVisible();
  await expect(note).toContainText('Actualizamos los textos para compartir con tu coach');
  await expect(p.locator('#form-shares [name=share_nutrition]')).toBeChecked();           // lo que ya compartía sigue igual
  expect((await backend(p)).links.find((l) => l.status === 'active').shares.nutrition).toBe(true); // el servidor no cambió
  await checkLayout(p, '#form-shares');
  await shot(p, 's6-a5-migracion.png', { fullPage: true });
  const before = (await backend(p)).consentEvents.filter((e) => e.kind.startsWith('share_')).length;
  await p.getByRole('button', { name: 'Guardar lo que comparto' }).click();
  await expect(note).toBeHidden();
  const be = await backend(p);
  const after = be.consentEvents.filter((e) => e.kind.startsWith('share_'));
  expect(after.length).toBeGreaterThan(before);
  const hash = sha(CT.fullText('A5', { coach: 'Fit Ana' }));
  for (const k of ['body', 'notes', 'nutrition', 'habits']) {
    const last = after.filter((e) => e.kind === 'share_' + k).pop();
    expect(last, k).toMatchObject({ version: 'compartir-2', textHash: hash });
  }
  expect(after.filter((e) => e.kind === 'share_nutrition').pop().granted).toBe(true);
  await p.reload();
  await p.evaluate(() => PGNav.show('perfil', 'datos'));
  await expect(note).toBeHidden();                                                          // no vuelve a molestar
  await ctx.close();
});

// ---------- A7: acuerdo del coach ----------
test('A7 al registrarse como coach: sin aceptarlo no hay código de invitación; queda registrado con versión y huella ANTES de crearse el código', async ({ app, page }) => {
  await app.open({ path: FAKE, state: state({ consent: CONSENT }) });
  await page.getByLabel('Tu correo').fill('coach@ejemplo.com');
  await acceptTerms(page);
  await page.getByRole('button', { name: 'Enviarme el código' }).click();
  await page.getByLabel('Código', { exact: true }).fill(await lastCode(page, 'coach@ejemplo.com'));
  await page.getByRole('button', { name: /Sí, son míos/ }).click();
  await answerCloud(page, true);
  await page.getByLabel(/Soy coach/).check();
  await page.addStyleTag({ content: WIDE });
  await page.getByLabel('Nombre comercial').fill('Fit Ana');
  await expect(page.locator('#acc-a7')).not.toBeChecked();
  await expect(page.locator('#acc-a7-intro')).toContainText('Para ver datos de clientes, acepta el Acuerdo del coach.');
  await expect(page.locator('#acc-a7-intro')).toContainText('no descargas, capturas ni compartes fotos');
  await expect(page.locator('#acc-a7-text')).toHaveText('Acepto el Acuerdo del coach.');
  await checkLayout(page, '#acc-step-role');
  await shot(page, 's6-a7-registro-coach.png', { fullPage: true });
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.locator('#acc-role-error')).toContainText('acepta el Acuerdo del coach');
  expect(Object.keys((await backend(page)).coaches)).toHaveLength(0);                       // no se creó código
  await page.locator('#acc-a7').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.locator('#acc-done-code')).toBeVisible();
  const be = await backend(page);
  const uid = be.users['coach@ejemplo.com'].id;
  const ev = be.consentEvents.find((e) => e.userId === uid && e.kind === 'coach_agreement');
  expect(ev).toMatchObject({ granted: true, version: CT.version('A7'), textHash: sha(CT.fullText('A7')) });
  expect(Date.parse(ev.createdAt)).toBeLessThanOrEqual(Date.parse(be.coaches[uid].createdAt));
});

test('A7 en un coach que ya existía: Clientes e Invitar quedan bloqueados (sin datos ni código) hasta aceptar; su uso personal no se bloquea', async ({ app, page }) => {
  await app.open({ path: FAKE, state: state({ consent: CONSENT }), prefs: { 'perdida-grasa:account-skip': '1' } });
  await loginAsCoach(page, 'coach@ejemplo.com', 'Fit Ana', { agreement: false });
  await page.addStyleTag({ content: WIDE });
  await page.locator('#tab-coach').click();
  const gate = page.locator('#view-coach .a7-gate');
  await expect(gate).toBeVisible();
  await expect(gate).toContainText('Antes de ver a tus clientes');
  await expect(page.locator('#coach-list-view')).toBeHidden();
  await expect(page.locator('#coach-clients')).toBeHidden();
  await checkLayout(page, '#view-coach');
  await shot(page, 's6-a7-bloqueo-clientes.png', { fullPage: true });
  await page.locator('#tab-invitar').click();
  await expect(page.locator('#view-invitar .a7-gate')).toBeVisible();
  await expect(page.locator('#invite-card')).toBeHidden();
  await expect(page.locator('#coach-invite-code')).toBeHidden();
  expect(await page.locator('#coach-invite-code').textContent()).toBe('');                  // el código ni siquiera está en la página
  expect(await page.evaluate(() => document.body.innerText.includes(JSON.parse(localStorage.getItem('perdida-grasa:account')).coach.inviteCode))).toBe(false);
  // Lo personal sigue funcionando
  await page.getByRole('button', { name: /^Más/ }).click();
  await page.getByRole('button', { name: /^Mi peso y medidas/ }).click();
  await page.locator('#form-entry [name=weight]').fill('70.5');
  await page.locator('#form-entry button[type=submit]').click();
  await expect(app.toast()).toHaveText('Registro guardado');
  // Sin marcar la casilla no avanza; sin conexión tampoco (no se da por aceptado algo que no llegó)
  await page.locator('#tab-coach').click();
  await gate.getByRole('button', { name: 'Aceptar el acuerdo' }).click();
  await expect(gate.locator('.a7-error')).toContainText('Marca la casilla');
  await gate.locator('[name=a7]').check();
  await page.evaluate(() => window.__pgFakeBackend.setOnline(false));
  await gate.getByRole('button', { name: 'Aceptar el acuerdo' }).click();
  await expect(gate.locator('.a7-error')).toContainText('No pudimos guardar tu aceptación');
  await expect(gate).toBeVisible();
  await page.evaluate(() => window.__pgFakeBackend.setOnline(true));
  await gate.getByRole('button', { name: 'Aceptar el acuerdo' }).click();
  await expect(gate).toBeHidden();
  await expect(page.locator('#coach-list-view')).toBeVisible();
  const be = await backend(page);
  expect(be.consentEvents.filter((e) => e.kind === 'coach_agreement').pop()).toMatchObject({ granted: true, version: CT.version('A7'), textHash: sha(CT.fullText('A7')) });
  await page.locator('#tab-invitar').click();
  await expect(page.locator('#coach-invite-code')).toHaveText(/^[A-Z2-9]{6}$/);
});

// ---------- A8: borrar la cuenta y fin de vínculo (coach) ----------
test('A8 al borrar la cuenta: aviso con "Exportar", Cancelar no borra, Borrar deja el teléfono intacto y en el servidor solo la prueba mínima sin datos personales', async ({ app, page }) => {
  await signedInClient(app, page, 'borrar@ejemplo.com');
  await app.goPerfil('datos');
  await page.addStyleTag({ content: WIDE });
  await page.locator('#perms-card input[data-auth=A6a]').check();
  await expect.poll(async () => kinds(await eventsOf(page, 'borrar@ejemplo.com')).length).toBe(6);
  const uid = (await backend(page)).users['borrar@ejemplo.com'].id;
  const del = page.getByRole('button', { name: 'Borrar mi cuenta' });
  await del.click();
  await expect(page.locator('#a8-text')).toHaveText('Se borrarán tu cuenta, tus datos, fotos y vínculos de la nube; no se puede deshacer. Tu teléfono conserva su copia hasta que la borres. Guardamos 3 años una prueba mínima y sin tu nombre de lo que autorizaste.');
  await checkLayout(page, '#sheet-a8');
  await shot(page, 's6-a8-borrar-cuenta.png');
  await page.locator('#a8-cancel').click();
  expect((await backend(page)).users['borrar@ejemplo.com']).toBeTruthy();
  await del.click();
  await page.locator('#a8-ok').click();
  await expect(page.locator('#account-status')).toContainText('Sin cuenta');
  await expect(app.toast()).toContainText('Cuenta borrada');
  const be = await backend(page);
  expect(be.users['borrar@ejemplo.com']).toBeUndefined();
  expect(be.consentEvents.filter((e) => e.userId === uid)).toHaveLength(0);
  expect(be.consentArchive).toHaveLength(6);
  const dump = JSON.stringify(be.consentArchive);
  expect(dump.includes(uid) || dump.includes('borrar@ejemplo.com')).toBe(false);
  expect(be.consentArchive.map((x) => x.kind).sort()).toEqual(['adult', 'cloud_transfer', 'photos_cloud', 'privacy', 'sensitive_health', 'terms']);
  expect((await app.stored()).entries.length).toBeGreaterThan(0);                           // el teléfono conserva su copia
});

test('A8 al coach: al terminar el vínculo se le avisa que pierde el acceso y debe borrar sus copias en 30 días', async ({ app, page, browser }, testInfo) => {
  test.setTimeout(90_000);
  const { ctx, p } = await coachAndClient(app, page, browser, testInfo);
  await p.getByRole('button', { name: 'Conectarme y continuar' }).click();
  await p.getByRole('button', { name: 'Ir a la app' }).click();
  await p.evaluate(() => PGSync.run());
  const json = await p.evaluate(() => localStorage.getItem('pg-fake-backend'));
  await page.evaluate((j) => localStorage.setItem('pg-fake-backend', j), json);
  await page.reload();
  await page.addStyleTag({ content: WIDE });
  await page.locator('#tab-coach').click();
  await expect(page.locator('#coach-clients .client-btn')).toHaveCount(1);
  await page.locator('#coach-clients .client-btn').click();
  await page.locator('#btn-end-client').click();    // el diálogo nativo de confirmación lo acepta la fixture
  await expect(page.locator('#coach-ended')).toContainText('Perdiste el acceso a los datos de Cliente sin nombre. Borra cualquier copia que tengas en un máximo de 30 días.');
  await checkLayout(page, '#view-coach');
  await shot(page, 's6-a8-coach-vinculo.png', { fullPage: true });
  await ctx.close();
});
