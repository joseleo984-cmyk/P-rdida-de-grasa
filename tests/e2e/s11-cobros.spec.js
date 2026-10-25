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

test('coach: lista de asesorados con filtros (Necesitan atención · Todos · Vencen pronto · Sin pagar), pago como dato secundario y cambio de estado', async ({ browser }, testInfo) => {
  const { p, errors } = await coachWithClients(browser, testInfo);
  await expect(p.locator('#tab-coach .tb-label')).toHaveText('Asesorados');
  const labels = (await p.locator('.tabbar button:visible').allTextContents()).map((x) => x.trim());
  expect(labels).toEqual(['Asesorados', 'Analítica', 'Rutinas', 'Invitar', 'Más']);
  await p.locator('#tab-coach').click();
  await p.addStyleTag({ content: H.WIDE });
  await expect(p.locator('#coach-title-list')).toHaveText('Mis asesorados');
  // Filtros con su cuenta; el de «Necesitan atención» es el de entrada (los tres aún no registran nada)
  await expect(p.locator('#coach-filters button')).toHaveText(['Necesitan atención · 3', 'Todos · 3', 'Vencen pronto · 1', 'Sin pagar · 1']);
  await expect(p.locator('#coach-filters [aria-pressed="true"]')).toHaveText('Necesitan atención · 3');
  const rows = p.locator('#coach-clients .cli-pay-row');
  await expect(rows).toHaveCount(3);
  // Ordenados por atención (empatan: por nombre). El pago va como dato secundario.
  expect(await rows.locator('.cli-name').allTextContents()).toEqual(['Ana Martínez', 'Carlos Pérez', 'Juan Gómez']);
  await expect(rows.nth(0)).toContainText('Aún no ha registrado nada');
  await expect(rows.nth(0).locator('.sem')).toHaveText('▲ Atención');
  await expect(rows.nth(0)).toContainText('Pago: al día hasta el 10 nov');
  await expect(rows.nth(1)).toContainText('Pago: vence en 3 días');
  await expect(rows.nth(2)).toContainText('Pago: sin registrar');
  await expect(rows.nth(2).locator('.chip-pay')).toHaveText('No pagó');
  await expect(rows.nth(0).locator('.chip-pay')).toHaveText('Pagó');
  await expect(rows.nth(2)).toContainText('No comparte sus hábitos');
  await H.layout(p); await H.tall(p, '#view-coach');
  await H.shot(p, 's11-coach-asesorados.png', { fullPage: true });
  // Filtros: «Vencen pronto» (≤ 7 días) y «Sin pagar»
  await p.locator('#coach-filters button', { hasText: 'Vencen pronto' }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Carlos Pérez');
  await p.locator('#coach-filters button', { hasText: 'Sin pagar' }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Juan Gómez');
  await p.locator('#coach-filters button', { hasText: 'Todos' }).click();
  await expect(rows).toHaveCount(3);
  // «Pagó»: hoy + 30 días, editable
  await rows.nth(2).locator('.chip-pay').click();
  await expect(p.locator('#sheet-pago')).toBeVisible();
  await expect(p.locator('#pago-title')).toHaveText('Cobro de Juan Gómez');
  await expect(p.locator('#pago-date')).toHaveValue(iso(30));
  await H.tall(p, '#sheet-pago'); await H.shot(p, 's11-coach-cobro.png');
  await p.locator('#pago-date').fill(iso(25));
  await p.getByRole('button', { name: 'Marcar que pagó' }).click();
  await expect(p.locator('#sheet-pago')).toBeHidden();
  await expect(app(p, 'Juan Gómez')).toContainText('Pago: al día hasta el 15 nov');
  await expect(p.locator('#coach-filters button', { hasText: 'Sin pagar' })).toHaveText('Sin pagar · 0');
  const be = await H.backend(p);
  expect(Object.values(be.links).find((l) => l.paidUntil === iso(25))).toBeTruthy();
  // «No pagó»: queda vencido desde ayer
  await app(p, 'Ana Martínez').locator('.chip-pay').click();
  await p.getByRole('button', { name: 'Marcar que no pagó' }).click();
  await expect(app(p, 'Ana Martínez')).toContainText('Pago: venció el 20 oct');
  await expect(app(p, 'Ana Martínez').locator('.chip-pay')).toHaveText('No pagó');
  await expect(p.locator('#coach-filters button', { hasText: 'Sin pagar' })).toHaveText('Sin pagar · 1');
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

test('cliente: aviso de pago solo a ≤ 7 días, bloqueo M4 con ver, descargar y borrar; el servidor impone la pausa', async ({ browser }, testInfo) => {
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
  await expect(a.locator('#pay-countdown')).toBeHidden();   // faltan 20 días: no se dice nada (el dinero no va antes que el progreso)
  // El coach acerca el vencimiento: a ≤ 7 días aparece una línea discreta
  await setPaid(a, 5);   // el coach (el «servidor» es el de este teléfono) acerca el vencimiento
  await a.evaluate(() => PGAccount.refreshLink());
  await expect(a.locator('#pay-countdown')).toHaveText('Tu plan se renueva el 26 oct. Si tienes dudas, habla con tu coach.');
  await H.shot(a, 's11-cliente-proximo-pago.png', { fullPage: true });
  // Ana guarda una medida estando al día (miércoles: toca cintura y cadera; el peso es opcional hasta que diga que tiene báscula)
  await a.locator('#tab-registro').click();
  await a.locator('#btn-medirme').click();
  await a.locator('#form-medidas input[name=waist]').fill('84,5');
  await a.locator('#form-medidas input[name=hip]').fill('100');
  await a.getByRole('button', { name: 'Guardar medidas' }).click();
  await expect(a.locator('#toast')).toContainText('Medidas guardadas');
  await expect.poll(async () => (await H.backend(a)).records && Object.values((await H.backend(a)).records).some((r) => r.kind === 'entry' && r.data.waist === 84.5)).toBe(true);
  // El coach marca «No pagó»: el servidor ya no deja subir nada
  await setPaid(a, -1);
  // La app aún cree que está al día (no ha vuelto a mirar su vínculo): el intento de sincronizar recibe payment_required y pasa a «pausa»
  await a.locator('#btn-medirme').click();
  await a.locator('#med-mas summary').click();   // hoy ya midió la cintura: queda en «Más medidas»
  await a.locator('#form-medidas input[name=waist]').fill('83');
  await a.getByRole('button', { name: 'Guardar medidas' }).click();
  await expect(a.locator('body')).toHaveClass(/paused/, { timeout: 15000 });
  const be = await H.backend(a);
  expect(Object.values(be.records).some((r) => r.kind === 'entry' && r.data.waist === 83)).toBe(false);   // el servidor NO guardó lo nuevo
  await a.locator('#tab-panel').click();
  await expect(a.locator('#pause-title')).toBeVisible();
  await expect(a.locator('#pause-title')).toHaveText('Tu plan con Laura Fit está en pausa');   // UX Etapa 2 (imagen A12)
  await expect(a.locator('#pause-text')).toContainText('Desde el');
  await expect(a.locator('#pause-text')).toContainText('Tu progreso está guardado');
  await expect(a.locator('#btn-pause-write')).toHaveAttribute('href', /^https:\/\/wa\.me\/\?text=/);
  await expect(a.locator('#dia-p1')).toHaveText('Registro personal en modo autónomo. Durante la pausa del servicio con tu coach, tus nuevos hábitos no serán supervisados ni revisados por él.');
  await expect(a.locator('#dia-pasos')).toBeHidden();
  await H.layout(a); await H.tall(a, '#pause-card');
  await H.shot(a, 's11-pausa-m4.png', { fullPage: true });
  // No se puede registrar nada nuevo: formularios escondidos y el servidor lo rechazaría
  await a.locator('#tab-registro').click();
  await expect(a.locator('#btn-medirme')).toBeVisible();
  await expect(a.locator('#view-progreso .pause-banner')).toBeVisible();
  await expect(a.locator('#medidas-history')).toContainText('Cintura 83');   // sigue pudiendo VER sus datos (lo último que guardó en el teléfono)
  await a.locator('#btn-medirme').click();
  await expect(a.locator('#form-medidas')).toBeHidden();
  await a.locator('#tab-panel').click();
  await a.evaluate(() => PGNav.show('habitos'));
  await expect(a.locator('#form-habitos')).toBeHidden();
  await a.locator('#tab-registro').click();
  await a.locator('#view-progreso .prog-seg button', { hasText: 'Fotos' }).click();
  await expect(a.locator('#form-photo')).toBeHidden();
  const forms = await a.evaluate(() => { document.querySelector('#form-medidas').requestSubmit(); return document.querySelector('#toast').textContent; });
  void forms;
  // ... pero SIEMPRE puede ver, descargar y borrar
  await a.locator('#tab-panel').click();
  await a.getByRole('button', { name: 'Ver mis datos' }).click();
  await expect(a.locator('#view-progreso')).toBeVisible();
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
  await expect(a.locator('#pay-countdown')).toBeHidden();
  await expect(a.locator('#home-dia')).toBeVisible();
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
