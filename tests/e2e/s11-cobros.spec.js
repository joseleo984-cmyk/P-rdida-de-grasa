// Sprint 11: cobros manuales (lista de asesorados, Pagó / No pagó), días restantes y bloqueo M4 con ver, descargar y borrar.
const { test, expect } = require('@playwright/test');
const H = require('./s11-helpers');

const iso = (n) => new Date(Date.UTC(2026, 9, 21 + n)).toISOString().slice(0, 10);   // hoy = 21-oct-2026 (Bogotá)

// Coach con tres asesorados (vence en 20 días, vence en 3 días y sin pago) ya entrado en su teléfono.
async function coachWithClients(browser, testInfo) {
  const ph = await H.phone(browser, testInfo, { prefs: {} });
  const { p } = ph;
  await p.goto('index.html');
  await H.acceptSolo(p);
  const code = await H.seedCoach(p, 'laura@coach.co', 'Laura Fit');
  await p.evaluate(async () => { // el coach entra (sesión propia en este teléfono) con su acuerdo ya aceptado
    const be = window.__pgFakeBackend;
    const r = RemoteFake.createFake({ backend: be, storage: localStorage });
    await r.auth.sendCode('laura@coach.co');
    const { user } = await r.auth.verifyCode('laura@coach.co', be.lastCode('laura@coach.co'));
    const c = await r.coach.myCoach();
    const ev = (kind) => ({ kind, granted: true, version: 'v', textHash: 'a'.repeat(64), clientAt: '2026-10-01T12:00:00.000Z' });
    localStorage.setItem('perdida-grasa:account', JSON.stringify({ userId: user.id, email: user.email, roles: ['client', 'coach'], onboarded: true, coach: c, cloudAsked: true,
      consents: { sensitive_health: { granted: true, version: '0.2-AU', textHash: 'a'.repeat(64), clientAt: '2026-10-01T12:00:00.000Z' }, cloud_transfer: { granted: true, version: '0.2-AU', textHash: 'a'.repeat(64), clientAt: '2026-10-01T12:00:00.000Z' }, coach_agreement: { granted: true, version: ConsentTexts.version('A7'), textHash: 'a'.repeat(64), clientAt: '2026-10-01T12:00:00.000Z' } } }));
    localStorage.setItem('perdida-grasa:owner', user.id);
    void ev;
  });
  await H.seedClient(p, 'ana@c.co', 'Ana Martínez', code, { paidDays: 20 });
  await H.seedClient(p, 'carlos@c.co', 'Carlos Pérez', code, { paidDays: 3 });
  await H.seedClient(p, 'juan@c.co', 'Juan Gómez', code, { paidDays: null });
  await p.reload(); await H.ready(p);
  return { ...ph, code };
}

test('coach: lista de asesorados con Pagó / No pagó, resumen, orden por vencimiento y cambio de estado', async ({ browser }, testInfo) => {
  const { p, errors } = await coachWithClients(browser, testInfo);
  await expect(p.locator('#tab-coach .tb-label')).toHaveText('Asesorados');
  const labels = (await p.locator('.tabbar button:visible').allTextContents()).map((x) => x.trim());
  expect(labels).toEqual(['Asesorados', 'Invitar', 'Más']);
  await p.locator('#tab-coach').click();
  await p.addStyleTag({ content: H.WIDE });
  await expect(p.locator('#coach-title-list')).toHaveText('Mis asesorados');
  const rows = p.locator('#coach-clients .cli-pay-row');
  await expect(rows).toHaveCount(3);
  // Orden por vencimiento: primero el que no tiene pago, luego el que vence antes
  expect(await rows.locator('.cli-name').allTextContents()).toEqual(['Juan Gómez', 'Carlos Pérez', 'Ana Martínez']);
  await expect(rows.nth(0)).toContainText('Sin pago registrado');
  await expect(rows.nth(1)).toContainText('Pagó hasta el 24 oct · vence en 3 días');
  await expect(rows.nth(2)).toContainText('Pagó hasta el 10 nov · vence en 20 días');
  await expect(rows.nth(0).locator('.chip-pay')).toHaveText('No pagó');
  await expect(rows.nth(2).locator('.chip-pay')).toHaveText('Pagó');
  await expect(p.locator('#coach-pay-summary')).toContainText('2pagaron');
  await expect(p.locator('#coach-pay-summary')).toContainText('1sin pagar');
  await expect(rows.nth(0)).toContainText('No comparte sus hábitos');
  await H.layout(p); await H.tall(p, '#view-coach');
  await H.shot(p, 's11-coach-asesorados.png', { fullPage: true });
  // Por nombre
  await p.locator('#coach-sort').selectOption('name');
  expect(await rows.locator('.cli-name').allTextContents()).toEqual(['Ana Martínez', 'Carlos Pérez', 'Juan Gómez']);
  await p.locator('#coach-sort').selectOption('due');
  // «Pagó»: hoy + 30 días, editable
  await rows.nth(0).locator('.chip-pay').click();
  await expect(p.locator('#sheet-pago')).toBeVisible();
  await expect(p.locator('#pago-title')).toHaveText('Cobro de Juan Gómez');
  await expect(p.locator('#pago-date')).toHaveValue(iso(30));
  await H.tall(p, '#sheet-pago'); await H.shot(p, 's11-coach-cobro.png');
  await p.locator('#pago-date').fill(iso(25));
  await p.getByRole('button', { name: 'Marcar que pagó' }).click();
  await expect(p.locator('#sheet-pago')).toBeHidden();
  await expect(app(p, 'Juan Gómez')).toContainText('Pagó hasta el 15 nov · vence en 25 días');
  await expect(p.locator('#coach-pay-summary')).toContainText('3pagaron');
  await expect(p.locator('#coach-pay-summary')).toContainText('0sin pagar');
  const be = await H.backend(p);
  expect(Object.values(be.links).find((l) => l.paidUntil === iso(25))).toBeTruthy();
  // «No pagó»: queda vencido desde ayer
  await app(p, 'Ana Martínez').locator('.chip-pay').click();
  await p.getByRole('button', { name: 'Marcar que no pagó' }).click();
  await expect(app(p, 'Ana Martínez')).toContainText('Venció el 20 oct');
  await expect(app(p, 'Ana Martínez').locator('.chip-pay')).toHaveText('No pagó');
  await expect(p.locator('#coach-pay-summary')).toContainText('2pagaron');
  await expect(p.locator('#coach-pay-summary')).toContainText('1sin pagar');
  // Fecha fuera de rango: mensaje, no se guarda
  await app(p, 'Carlos Pérez').locator('.chip-pay').click();
  await p.locator('#pago-date').fill('2030-01-01');
  await p.getByRole('button', { name: 'Marcar que pagó' }).click();
  await expect(p.locator('#pago-error')).toContainText('muy lejos');
  await p.getByRole('button', { name: 'Cancelar' }).click();
  expect(errors).toEqual([]);
});
const setPaid = (p, days) => p.evaluate((d) => window.__pgFakeBackend.setPaidUntil('ana@c.co', new Date(window.__pgFakeBackend.clock.now() - 5 * 3600000 + d * 86400000).toISOString().slice(0, 10)), days);
const app = (p, name) => p.locator('#coach-clients .cli-pay-row').filter({ hasText: name });

test('cliente: «Faltan N días» (resaltado si ≤ 7), bloqueo M4 con ver, descargar y borrar; el servidor impone la pausa', async ({ browser }, testInfo) => {
  const coach = await coachWithClients(browser, testInfo);
  // Teléfono de Ana (cliente de Laura): entra por la interfaz con su correo
  const ana = await H.phone(browser, testInfo);
  const a = ana.p;
  await a.goto('index.html');
  await H.acceptSolo(a, { habits: true });
  await H.transfer(coach.p, a);
  await H.enterWithEmail(a, 'ana@c.co', 'Ana Martínez');
  await expect(a.locator('#acc-step-role, #acc-step-done').filter({ visible: true }).first()).toBeVisible();
  // Ana ya estaba vinculada en el servidor: entra directo (rol cliente con vínculo)
  if (await a.locator('#acc-step-role').isVisible()) { await a.locator('#form-acc-role input[value=client]').check(); await a.getByLabel(/Código de mi coach/).fill(coach.code); await a.getByRole('button', { name: 'Comprobar código' }).click(); await a.getByRole('button', { name: /Conectarme/ }).click(); }
  await a.getByRole('button', { name: 'Ir a la app' }).click();
  await a.evaluate(() => PGAccount.refreshLink());
  await a.addStyleTag({ content: H.WIDE });
  await expect(a.locator('#pay-countdown')).toHaveText('Faltan 20 días para tu próximo pago');
  await expect(a.locator('#pay-countdown')).not.toHaveClass(/soon/);
  // El coach acerca el vencimiento: ≤ 7 días se resalta
  await setPaid(a, 5);   // el coach (el «servidor» es el de este teléfono) acerca el vencimiento
  await a.evaluate(() => PGAccount.refreshLink());
  await expect(a.locator('#pay-countdown')).toHaveText('Faltan 5 días para tu próximo pago');
  await expect(a.locator('#pay-countdown')).toHaveClass(/soon/);
  await H.shot(a, 's11-cliente-proximo-pago.png', { fullPage: true });
  // Ana guarda una medida estando al día
  await a.locator('#tab-medidas').click();
  await a.locator('#form-medidas input[name=weight]').fill('70');   // peso, abdomen y cadera: obligatorios en lo nuevo
  await a.locator('#form-medidas input[name=abdomen]').fill('90');
  await a.locator('#form-medidas input[name=hip]').fill('100');
  await a.locator('#form-medidas input[name=waist]').fill('84,5');
  await a.getByRole('button', { name: 'Guardar mis medidas' }).click();
  await expect(a.locator('#toast')).toHaveText('Medidas guardadas');
  await expect.poll(async () => (await H.backend(a)).records && Object.values((await H.backend(a)).records).some((r) => r.kind === 'entry' && r.data.waist === 84.5)).toBe(true);
  // El coach marca «No pagó»: el servidor ya no deja subir nada
  await setPaid(a, -1);
  // La app aún cree que está al día (no ha vuelto a mirar su vínculo): el intento de sincronizar recibe payment_required y pasa a «pausa»
  await a.locator('#form-medidas input[name=waist]').fill('83');
  await a.getByRole('button', { name: 'Guardar mis medidas' }).click();
  await expect(a.locator('body')).toHaveClass(/paused/, { timeout: 15000 });
  const be = await H.backend(a);
  expect(Object.values(be.records).some((r) => r.kind === 'entry' && r.data.waist === 83)).toBe(false);   // el servidor NO guardó lo nuevo
  await a.locator('#tab-panel').click();
  await expect(a.locator('#pause-title')).toBeVisible();
  await expect(a.locator('#pause-title')).toHaveText('Tu acceso está en pausa');
  await expect(a.locator('#pause-text')).toContainText('Habla con tu coach, Laura Fit');
  await expect(a.locator('#home-coach')).toBeHidden();
  await H.layout(a); await H.tall(a, '#pause-card');
  await H.shot(a, 's11-pausa-m4.png', { fullPage: true });
  // No se puede registrar nada nuevo: formularios escondidos y el servidor lo rechazaría
  await a.locator('#tab-medidas').click();
  await expect(a.locator('#form-medidas')).toBeHidden();
  await expect(a.locator('#view-medidas .pause-banner')).toBeVisible();
  await expect(a.locator('#medidas-table')).toContainText('83');   // sigue pudiendo VER sus datos (lo último que guardó en el teléfono)
  await a.locator('#tab-habitos').click();
  await expect(a.locator('#form-habitos')).toBeHidden();
  await a.locator('#tab-fotos').click();
  await expect(a.locator('#form-photo')).toBeHidden();
  const forms = await a.evaluate(() => { document.querySelector('#form-medidas').requestSubmit(); return document.querySelector('#toast').textContent; });
  void forms;
  // ... pero SIEMPRE puede ver, descargar y borrar
  await a.locator('#tab-panel').click();
  await a.getByRole('button', { name: 'Ver mis datos' }).click();
  await expect(a.locator('#view-medidas')).toBeVisible();
  await a.locator('#tab-panel').click();
  const [dl] = await Promise.all([a.waitForEvent('download'), a.getByRole('button', { name: 'Descargar mis datos' }).click()]);
  const json = JSON.parse(require('fs').readFileSync(await dl.path(), 'utf8'));
  expect(json.entries.some((e) => e.waist === 83)).toBe(true);
  await a.locator('#btn-backup-yes').click();   // «¿Se guardó el archivo?»
  // El coach marca el pago: «Ya pagué» vuelve a comprobar y la app se reactiva sola
  await setPaid(a, 30);
  await a.locator('#tab-panel').click();
  await a.getByRole('button', { name: 'Ya pagué: volver a comprobar' }).click();
  await expect(a.locator('body')).not.toHaveClass(/paused/);
  await expect(a.locator('#pay-countdown')).toHaveText('Faltan 30 días para tu próximo pago');
  // Con el acceso en pausa de nuevo, borrar la cuenta funciona
  await setPaid(a, -3);
  await a.evaluate(() => PGAccount.refreshLink());
  await expect(a.locator('body')).toHaveClass(/paused/);
  await a.locator('#tab-panel').click();
  await a.getByRole('button', { name: 'Borrar mi cuenta' }).click();
  await a.locator('#a8-ok').click();
  await expect(a.locator('#solo')).toBeVisible({ timeout: 10000 });   // sin modo local: vuelve la pantalla de aceptación
  const be2 = await H.backend(a);
  expect(Object.values(be2.users).some((u) => u.email === 'ana@c.co')).toBe(false);
  expect(ana.errors.filter((e) => !/40\d|403/.test(e))).toEqual([]);
});
