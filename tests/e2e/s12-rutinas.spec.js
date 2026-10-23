// Etapa 2 y 2b (v1.8): rutinas de ejercicios con animaciones. El coach arma rutinas (de su biblioteca «Mis rutinas» o directo para un asesorado),
// las asigna (copias), las muestra u oculta y publica la «Rutina de hoy»; el cliente las ve en «Mi rutina» (solo lectura) y la animación se
// pide al abrir cada ejercicio. Servidor FALSO; producto 'coach'.
const { test, expect } = require('@playwright/test');
const H = require('./s11-helpers');

// GIF válido de 1×1 px (37 bytes). La firma «GIF89a» es lo que mira la validación.
const GIF_B64 = 'R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
const gifFile = (name = 'press-banca.gif') => ({ name, mimeType: 'image/gif', buffer: Buffer.from(GIF_B64, 'base64') });

// Coach (Laura) con dos asesorados ya vinculados: Ana (al día) y Beto (sin fecha de pago), entrado en su teléfono.
async function coachPhone(browser, testInfo) {
  const ph = await H.phone(browser, testInfo, { prefs: {} });
  const { p } = ph;
  await p.goto('index.html');
  await H.acceptSolo(p);
  const code = await H.seedCoach(p, 'laura@coach.co', 'Laura Fit');
  await p.evaluate(async () => {
    const be = window.__pgFakeBackend;
    const r = RemoteFake.createFake({ backend: be, storage: localStorage });
    await r.auth.sendCode('laura@coach.co');
    const { user } = await r.auth.verifyCode('laura@coach.co', be.lastCode('laura@coach.co'));
    const c = await r.coach.myCoach();
    const ev = { granted: true, version: 't', textHash: 'a'.repeat(64), clientAt: '2026-10-01T12:00:00.000Z' };
    localStorage.setItem('perdida-grasa:account', JSON.stringify({ userId: user.id, email: user.email, roles: ['client', 'coach'], onboarded: true, coach: c, cloudAsked: true,
      consents: { sensitive_health: { ...ev, version: '0.1-AU-prueba' }, cloud_transfer: { ...ev, version: '0.1-AU-prueba' }, coach_agreement: { ...ev, version: ConsentTexts.version('A7') } } }));
    localStorage.setItem('perdida-grasa:owner', user.id);
  });
  await H.seedClient(p, 'ana@c.co', 'Ana Martínez', code, { paidDays: 20 });
  await H.seedClient(p, 'beto@c.co', 'Beto Ruiz', code, { paidDays: 20 });
  await p.reload(); await H.ready(p);
  return { ...ph, code };
}
// Un cliente que ya estaba vinculado entra en SU teléfono con su correo (copiando antes el «servidor» del teléfono del coach).
async function clientPhone(browser, testInfo, coachPhoneObj, email, name) {
  const ph = await H.phone(browser, testInfo);
  const a = ph.p;
  await a.goto('index.html');
  await H.acceptSolo(a, { habits: true });
  await H.transfer(coachPhoneObj.p, a);
  await H.enterWithEmail(a, email, name);
  await expect(a.locator('#acc-step-role, #acc-step-done').filter({ visible: true }).first()).toBeVisible();
  if (await a.locator('#acc-step-role').isVisible()) { await a.locator('#form-acc-role input[value=client]').check(); await a.getByLabel(/Código de mi coach/).fill(coachPhoneObj.code); await a.getByRole('button', { name: 'Comprobar código' }).click(); await a.getByRole('button', { name: /Conectarme/ }).click(); }
  await a.getByRole('button', { name: 'Ir a la app' }).click();
  await a.evaluate(() => PGAccount.refreshLink());
  return ph;
}
// Siembra por la API (sin pasar por la pantalla): una animación y la rutina de Ana, hechas por Laura. Devuelve el id de la animación.
async function seedRoutine(page) {
  return page.evaluate(async (b64) => {
    const be = window.__pgFakeBackend;
    const m = {}; const mem = { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
    const r = RemoteFake.createFake({ backend: be, storage: mem });
    await r.auth.sendCode('laura@coach.co');
    await r.auth.verifyCode('laura@coach.co', be.lastCode('laura@coach.co'));
    const g = await r.coach.uploadGif(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'image/gif' }), 'Press de banca');
    const ana = Object.values(be.users).find((u) => u.email === 'ana@c.co').id;
    await r.coach.saveRoutine(ana, { title: 'Fuerza en 2 días', days: [
      { title: 'Día 1 – Pecho y tríceps', exercises: [{ name: 'Press de banca', sets: '4 × 12', note: 'Baja la barra despacio', gif: g.id }, { name: 'Fondos', sets: '3 × 10', note: '', gif: '' }, { name: 'Flexiones', sets: '3 × 15', note: 'Con la espalda recta', gif: '' }] },
      { title: 'Día 2 – Descanso', exercises: [] }] });
    return g.id;
  }, GIF_B64);
}
const setPaid = (p, days) => p.evaluate((d) => window.__pgFakeBackend.setPaidUntil('ana@c.co', new Date(window.__pgFakeBackend.clock.now() - 5 * 3600000 + d * 86400000).toISOString().slice(0, 10)), days);
const openFicha = async (p, name) => {
  await p.locator('#tab-coach').click();
  await p.locator('#coach-clients .cli-pay-row').filter({ hasText: name }).locator('.cli-main').click();
  await expect(p.locator('#coach-detail-title')).toHaveText(name);
};

test('coach: arma la rutina de un asesorado con su propia animación (valida tipo, tamaño y firma), la edita y la borra', async ({ browser }, testInfo) => {
  const { p, errors } = await coachPhone(browser, testInfo);
  await p.addStyleTag({ content: H.WIDE });
  await openFicha(p, 'Ana Martínez');
  await expect(p.locator('#coach-detail-rutina-card h2')).toHaveText('Rutinas de ejercicios');
  await expect(p.locator('#coach-detail-rutina-line')).toHaveText('Ana Martínez todavía no tiene rutinas.');
  await p.getByRole('button', { name: '＋ Crear una rutina nueva' }).click();
  await expect(p.locator('#redit-title')).toHaveText('Nueva rutina para Ana Martínez');
  await expect(p.locator('#view-rutina-edit')).toBeVisible();
  await expect(p.locator('#tab-coach')).toHaveAttribute('aria-current', 'page');
  // --- Biblioteca: se rechazan los archivos que no sirven (tipo, firma de bytes, tamaño) ---
  await p.locator('#gif-file').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a0000000000', 'hex') });
  await p.getByRole('button', { name: 'Subir animación' }).click();
  await expect(p.locator('#gif-error')).toContainText('GIF o WebP');
  await p.locator('#gif-file').setInputFiles({ name: 'falso.gif', mimeType: 'image/gif', buffer: Buffer.from('89504e470d0a1a0a0000000000', 'hex') });
  await p.getByRole('button', { name: 'Subir animación' }).click();
  await expect(p.locator('#gif-error')).toContainText('de verdad');
  await p.locator('#gif-file').setInputFiles({ name: 'grande.gif', mimeType: 'image/gif', buffer: Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(3 * 1024 * 1024)]) });
  await p.getByRole('button', { name: 'Subir animación' }).click();
  await expect(p.locator('#gif-error')).toContainText('3 MB');
  expect(Object.keys((await H.backend(p)).gifs)).toHaveLength(0);
  // --- Una animación buena: el nombre se propone a partir del archivo ---
  await p.locator('#gif-name').fill('');
  await p.locator('#gif-file').setInputFiles(gifFile('press-banca.gif'));
  await expect(p.locator('#gif-name')).toHaveValue('press banca');
  await p.locator('#gif-name').fill('Press de banca');
  await p.getByRole('button', { name: 'Subir animación' }).click();
  await expect(p.locator('#gif-status')).toContainText('«Press de banca» ya está en tu biblioteca');
  await expect(p.locator('#gif-list li')).toHaveCount(1);
  await expect(p.locator('#gif-list li').first()).toContainText('sin usar todavía');
  await p.locator('#gif-list').getByRole('button', { name: 'Ver la animación Press de banca' }).click();
  await expect(p.locator('#gif-list img')).toBeVisible();
  await expect.poll(() => p.locator('#gif-list img').evaluate((i) => i.naturalWidth)).toBe(1);   // el GIF se cargó de verdad
  await p.locator('#gif-list').getByRole('button', { name: 'Ver la animación Press de banca' }).click();   // «Ocultar»
  await expect(p.locator('#gif-list img')).toHaveCount(0);
  expect(Object.values((await H.backend(p)).gifs)[0].size).toBe(37);   // se sube tal cual: mismos 37 bytes, sin re-codificar
  // --- La rutina ---
  await p.locator('#redit-name').fill('Fuerza en 2 días');
  await p.getByLabel('Nombre del día').first().fill('Día 1 – Pecho y tríceps');
  await p.getByLabel('Nombre del ejercicio').first().fill('Press de banca');
  await p.getByLabel('Nota (opcional)').first().fill('Baja la barra despacio');
  await p.getByLabel('Animación (opcional)').first().selectOption({ label: 'Press de banca' });
  // Falta «series × repeticiones»: avisa con un mensaje claro y deja el cursor en esa casilla
  await p.getByRole('button', { name: 'Guardar rutina' }).click();
  await expect(p.locator('#redit-error')).toContainText('escribe las series y repeticiones, por ejemplo «4 × 12»');
  await expect(p.locator('#d0e0-sets')).toBeFocused();
  await p.locator('#d0e0-sets').fill('4 × 12');
  await p.getByRole('button', { name: '＋ Agregar ejercicio' }).click();
  await expect(p.locator('#d0e1-name')).toBeFocused();
  await p.locator('#d0e1-name').fill('Fondos');
  await p.locator('#d0e1-sets').fill('3 × 10');
  await p.getByRole('button', { name: '＋ Agregar otro día' }).click();
  await expect(p.locator('#d1-title')).toBeFocused();
  await p.locator('#d1-title').fill('Día 2 – Descanso');
  await p.getByRole('button', { name: 'Quitar el ejercicio 1 del día 2' }).click();   // el ejercicio vacío del día 2 se quita: día de descanso
  await expect(p.getByText('Este día no tiene ejercicios: se verá como día de descanso.')).toBeVisible();
  // Mover ejercicios
  await p.getByRole('button', { name: 'Subir el ejercicio 2 del día 1' }).click();
  await expect(p.locator('#d0e0-name')).toHaveValue('Fondos');
  await p.getByRole('button', { name: 'Bajar el ejercicio 1 del día 1' }).click();
  await expect(p.locator('#d0e0-name')).toHaveValue('Press de banca');
  await H.layout(p); await H.tall(p, '#view-rutina-edit');
  await H.shot(p, 's12-coach-editor.png', { fullPage: true });
  await p.getByRole('button', { name: 'Guardar rutina' }).click();
  await expect(p.locator('#toast')).toHaveText('Rutina guardada para Ana Martínez');
  await expect(p.locator('#coach-detail-view')).toBeVisible();
  await expect(p.locator('#coach-detail-rutina-line')).toHaveText('1 rutina asignada · Ana Martínez la ve.');
  await expect(p.locator('#coach-detail-rutinas .rc-item')).toHaveCount(1);
  await expect(p.locator('#coach-detail-rutinas .rc-item')).toContainText('Fuerza en 2 días');
  await expect(p.locator('#coach-detail-rutinas .rc-item')).toContainText('2 días · 2 ejercicios');
  await expect(p.getByRole('switch', { name: /Visible para el asesorado: Fuerza en 2 días/ })).toBeChecked();
  let be = await H.backend(p);
  const row = Object.values(be.routines)[0];
  expect(row.days[0].exercises[0]).toMatchObject({ name: 'Press de banca', sets: '4 × 12', note: 'Baja la barra despacio' });
  expect(row.days[0].exercises[0].gif).toBe(Object.keys(be.gifs)[0]);
  expect(row.days[1].exercises).toEqual([]);
  // Editar: llega con lo guardado; ya hay una animación en uso (no se puede borrar)
  await p.getByRole('button', { name: /Entrar y modificar/ }).click();
  await expect(p.locator('#redit-title')).toHaveText('Rutina de Ana Martínez');
  await expect(p.locator('#redit-hint')).toContainText('Estás modificando la copia de Ana Martínez');
  await expect(p.locator('#redit-name')).toHaveValue('Fuerza en 2 días');
  await expect(p.getByLabel('Animación (opcional)').first()).toHaveValue(Object.keys(be.gifs)[0]);
  await expect(p.locator('#gif-list li').first()).toContainText('en 1 rutina');
  await p.locator('#gif-list').getByRole('button', { name: 'Borrar la animación Press de banca' }).click();
  await expect(p.locator('#gif-status')).toContainText('Esa animación se usa en una rutina');
  // Salir con cambios sin guardar pregunta
  await p.locator('#redit-name').fill('Fuerza en 3 días');
  let asked = '';
  p.removeAllListeners('dialog');
  p.once('dialog', (d) => { asked = d.message(); d.dismiss(); });
  await p.getByRole('button', { name: '← Volver' }).click();
  expect(asked).toContain('cambios sin guardar');
  await expect(p.locator('#view-rutina-edit')).toBeVisible();
  p.on('dialog', (d) => d.accept());
  // Máximos: 7 días y 12 ejercicios por día
  for (let i = 0; i < 5; i++) await p.getByRole('button', { name: '＋ Agregar otro día' }).click();
  await expect(p.getByRole('button', { name: 'Máximo 7 días' })).toBeDisabled();
  for (let i = 0; i < 10; i++) await p.getByRole('button', { name: '＋ Agregar ejercicio' }).first().click();
  await expect(p.getByRole('button', { name: 'Máximo 12 ejercicios por día' })).toBeDisabled();
  await H.layout(p);
  // Borrar la rutina
  await p.getByRole('button', { name: 'Quitar esta rutina' }).click();
  await expect(p.locator('#toast')).toHaveText('Rutina quitada');
  await expect(p.locator('#coach-detail-rutina-line')).toHaveText('Ana Martínez todavía no tiene rutinas.');
  be = await H.backend(p);
  expect(Object.keys(be.routines)).toHaveLength(0);
  // Sin uso, la animación se puede borrar de la biblioteca
  await p.getByRole('button', { name: '＋ Crear una rutina nueva' }).click();
  await p.locator('#gif-list').getByRole('button', { name: 'Borrar la animación Press de banca' }).click();
  await expect(p.locator('#gif-status')).toHaveText('Animación borrada.');
  expect(Object.keys((await H.backend(p)).gifs)).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('cliente: ve «Mi rutina» (solo lectura) con días plegables y la animación al abrir cada ejercicio; otro cliente y otro coach no la ven', async ({ browser }, testInfo) => {
  const coach = await coachPhone(browser, testInfo);
  const gifId = await seedRoutine(coach.p);
  const ana = await clientPhone(browser, testInfo, coach, 'ana@c.co', 'Ana Martínez');
  const a = ana.p;
  await a.addStyleTag({ content: H.WIDE });
  // La animación solo se pide al abrir el ejercicio (cada vez, con una URL nueva): se cuentan las llamadas
  await a.evaluate(() => { window.__gifCalls = 0; const c = PGAccount.remote.client; const o = c.gifBlob.bind(c); c.gifBlob = (...x) => { window.__gifCalls++; return o(...x); }; });
  // Inicio: tarjeta y fila en Más; la barra sigue siendo Inicio · Hábitos · Medidas · Fotos · Más
  expect((await a.locator('.tabbar button:visible').allTextContents()).map((x) => x.trim())).toEqual(['Inicio', 'Hábitos', 'Medidas', 'Fotos', 'Más']);
  await a.locator('#tab-panel').click();
  await expect(a.locator('#home-rutina')).toBeVisible();
  await expect(a.locator('#hr-text')).toHaveText('Fuerza en 2 días · 2 días · 3 ejercicios');
  await a.locator('#tab-mas').click();
  await expect(a.locator('#row-rutina')).toBeVisible();
  await a.locator('#row-rutina').click();
  await expect(a.locator('#rutina-title')).toBeFocused();
  await expect(a.locator('#rutina-body .rut-title')).toHaveText('Fuerza en 2 días');
  await expect(a.locator('#rutina-body .rut-head')).toContainText('Armada por Laura Fit · 2 días · 3 ejercicios');
  const days = a.locator('#rutina-body .rut-day');
  await expect(days).toHaveCount(2);
  await expect(days.nth(0)).toHaveAttribute('open', '');
  await expect(days.nth(1)).not.toHaveAttribute('open', '');
  await expect(days.nth(1)).toContainText('Día de descanso');
  expect(await a.evaluate(() => window.__gifCalls)).toBe(0);   // nada se pidió todavía
  await expect(a.locator('#rutina-body img')).toHaveCount(0);
  // Abrir el ejercicio con animación (con el teclado: Enter sobre el resumen)
  const press = a.locator('.rut-ex').filter({ hasText: 'Press de banca' });
  await press.locator('summary').focus();
  await a.keyboard.press('Enter');
  await expect(press).toHaveAttribute('open', '');
  await expect(press.locator('.rut-note')).toHaveText('Baja la barra despacio');
  await expect(press.locator('img')).toBeVisible();
  await expect(press.locator('img')).toHaveAttribute('alt', 'Animación del ejercicio: Press de banca');
  await expect.poll(() => press.locator('img').evaluate((i) => i.naturalWidth)).toBe(1);
  expect(await a.evaluate(() => window.__gifCalls)).toBe(1);
  const url1 = await press.locator('img').getAttribute('src');
  await a.keyboard.press('Enter');   // cerrar: se suelta la imagen
  await expect(press.locator('img')).toHaveCount(0);
  await a.keyboard.press('Enter');   // volver a abrir: URL NUEVA
  await expect(press.locator('img')).toBeVisible();
  expect(await a.evaluate(() => window.__gifCalls)).toBe(2);
  expect(await press.locator('img').getAttribute('src')).not.toBe(url1);
  // Los que no tienen animación ni nota no son desplegables; solo lectura: no hay formularios de edición
  await expect(a.locator('.rut-ex-row').filter({ hasText: 'Fondos' })).toContainText('3 × 10');
  await expect(a.locator('#view-rutina input:not([type=hidden]), #view-rutina textarea, #view-rutina select')).toHaveCount(0);
  await H.layout(a); await H.tall(a, '#view-rutina');
  await H.shot(a, 's12-cliente-mi-rutina.png', { fullPage: true });
  // «Hoy entrené» marca el hábito de hoy
  await expect(a.locator('#btn-rutina-trained')).toHaveText('Hoy entrené');
  await a.locator('#btn-rutina-trained').click();
  await expect(a.locator('#toast')).toHaveText('Anotamos que hoy entrenaste');
  await expect(a.locator('#btn-rutina-trained')).toBeDisabled();
  await expect(a.locator('#btn-rutina-trained')).toHaveText('Hoy ya anotaste que entrenaste ✓');
  expect(await a.evaluate(() => Object.values(JSON.parse(localStorage.getItem('perdida-grasa-pruebas:v1') || localStorage.getItem('perdida-grasa:v1')).habits).some((h) => h.trained === true))).toBe(true);
  // Beto (otro cliente del MISMO coach): no ve la rutina de Ana ni su animación
  const beto = await clientPhone(browser, testInfo, coach, 'beto@c.co', 'Beto Ruiz');
  const b = beto.p;
  await b.locator('#tab-panel').click();
  await expect(b.locator('#hr-text')).toHaveText('Tu coach todavía no te armó una rutina.');
  await b.locator('#tab-mas').click();
  await b.locator('#row-rutina').click();
  await expect(b.locator('#rutina-body')).toContainText('Todavía no tienes una rutina.');
  await expect(b.locator('#rutina-body')).toContainText('Laura Fit la armará para ti');
  await expect(b.locator('#rutina-trained')).toBeHidden();
  const coachId = await b.evaluate(() => PGAccount.meta().link.coachId);
  const blocked = await b.evaluate(async ([coachId, gifId]) => { try { await PGAccount.remote.client.gifBlob('00000000-0000-4000-8000-000000000000', gifId); return 'leyó otra'; } catch (e) { return e.code; } }, [coachId, gifId]);
  expect(blocked).toBe('not_found');
  // OJO: Beto SÍ está vinculado a Laura, así que la biblioteca de Laura es legible para él por diseño (los GIFs no son datos de salud);
  // lo que no puede es ver la RUTINA de Ana (arriba) ni leer GIFs de OTRO coach (aquí).
  // Otro coach (Marta) no ve la rutina de Ana ni la biblioteca de Laura
  const other = await coach.p.evaluate(async ([gifId]) => {
    const be = window.__pgFakeBackend;
    const m = {}; const mem = { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
    const r = RemoteFake.createFake({ backend: be, storage: mem });
    await r.auth.sendCode('marta@coach.co'); await r.auth.verifyCode('marta@coach.co', be.lastCode('marta@coach.co')); await r.account.joinApp();
    await r.account.recordConsents([{ kind: 'coach_agreement', granted: true, version: 'x', textHash: 'a'.repeat(64), clientAt: '2026-10-01T12:00:00.000Z' }]);
    await r.coach.becomeCoach('Marta Fit');
    const ana = Object.values(be.users).find((u) => u.email === 'ana@c.co').id;
    const out = {};
    for (const [k, fn] of [['rutina', () => r.coach.getRoutine(ana)], ['guardar', () => r.coach.saveRoutine(ana, { title: 'x', days: [{ title: 'd', exercises: [] }] })], ['gif', () => r.coach.gifBlob(gifId)]]) {
      try { await fn(); out[k] = 'accedió'; } catch (e) { out[k] = e.code; }
    }
    out.biblioteca = (await r.coach.listGifs()).length;
    return out;
  }, [gifId]);
  expect(other).toEqual({ rutina: 'forbidden', guardar: 'forbidden', gif: 'not_found', biblioteca: 0 });
  expect(ana.errors).toEqual([]);
  expect(beto.errors).toEqual([]);
});

test('cliente en pausa por pago: sigue viendo su rutina y sus animaciones (es lectura), pero no puede anotar «Hoy entrené»', async ({ browser }, testInfo) => {
  const coach = await coachPhone(browser, testInfo);
  await seedRoutine(coach.p);
  const ana = await clientPhone(browser, testInfo, coach, 'ana@c.co', 'Ana Martínez');
  const a = ana.p;
  await setPaid(a, -3);                                  // el coach marcó «No pagó»
  await a.evaluate(() => PGAccount.refreshLink());
  await expect(a.locator('body')).toHaveClass(/paused/);
  await a.locator('#tab-panel').click();
  await expect(a.locator('#pause-title')).toBeVisible();
  await expect(a.locator('#home-coach')).toBeHidden();   // lo demás sí se esconde...
  await expect(a.locator('#home-rutina')).toBeVisible(); // ...pero la rutina se ve
  await a.getByRole('button', { name: 'Ver mi rutina' }).click();
  await expect(a.locator('#rutina-body .rut-title')).toHaveText('Fuerza en 2 días');
  await a.locator('.rut-ex').filter({ hasText: 'Press de banca' }).locator('summary').click();
  await expect(a.locator('.rut-ex img')).toBeVisible();
  await expect.poll(() => a.locator('.rut-ex img').evaluate((i) => i.naturalWidth)).toBe(1);
  await expect(a.locator('#rutina-trained')).toBeHidden();   // anotar es guardar algo nuevo: en pausa no
  await H.layout(a);
  await H.shot(a, 's12-cliente-rutina-en-pausa.png', { fullPage: true });
  // Se reactiva: vuelve el botón
  await setPaid(a, 30);
  await a.evaluate(() => PGAccount.refreshLink());
  await expect(a.locator('body')).not.toHaveClass(/paused/);
  await expect(a.locator('#rutina-trained')).toBeVisible();
  expect(ana.errors.filter((e) => !/40\d|403/.test(e))).toEqual([]);
});

test('el coach cambia la rutina y el cliente la ve actualizada al volver a la pantalla; si el coach la borra, desaparece', async ({ browser }, testInfo) => {
  const coach = await coachPhone(browser, testInfo);
  await seedRoutine(coach.p);
  const ana = await clientPhone(browser, testInfo, coach, 'ana@c.co', 'Ana Martínez');
  const a = ana.p;
  await a.locator('#tab-mas').click(); await a.locator('#row-rutina').click();
  await expect(a.locator('#rutina-body .rut-title')).toHaveText('Fuerza en 2 días');
  // El coach (en el «servidor» compartido) cambia el título
  await a.evaluate(async () => {
    const be = window.__pgFakeBackend;
    const m = {}; const mem = { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
    const r = RemoteFake.createFake({ backend: be, storage: mem });
    await r.auth.sendCode('laura@coach.co'); await r.auth.verifyCode('laura@coach.co', be.lastCode('laura@coach.co'));
    const ana = Object.values(be.users).find((u) => u.email === 'ana@c.co').id;
    const cur = await r.coach.getRoutine(ana);
    await r.coach.saveRoutine(ana, { ...cur, title: 'Fuerza en 3 días' });
  });
  await a.locator('#tab-panel').click();
  await a.locator('#btn-home-rutina').click();
  await expect(a.locator('#rutina-body .rut-title')).toHaveText('Fuerza en 3 días');
  await a.evaluate(async () => {
    const be = window.__pgFakeBackend;
    const m = {}; const mem = { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
    const r = RemoteFake.createFake({ backend: be, storage: mem });
    await r.auth.sendCode('laura@coach.co'); await r.auth.verifyCode('laura@coach.co', be.lastCode('laura@coach.co'));
    await r.coach.deleteRoutine(Object.values(be.users).find((u) => u.email === 'ana@c.co').id);
  });
  await a.locator('#tab-panel').click();
  await a.locator('#btn-home-rutina').click();
  await expect(a.locator('#rutina-body')).toContainText('Todavía no tienes una rutina.');
});

// ======================= v1.8: biblioteca, asignar, mostrar/ocultar y rutina de hoy =======================
// Siembra por la API (como Laura): una animación y dos plantillas («Pecho», con la animación, y «Piernas»). Devuelve sus ids.
async function seedLibrary(page) {
  return page.evaluate(async (b64) => {
    const be = window.__pgFakeBackend;
    const m = {}; const mem = { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
    const r = RemoteFake.createFake({ backend: be, storage: mem });
    await r.auth.sendCode('laura@coach.co');
    await r.auth.verifyCode('laura@coach.co', be.lastCode('laura@coach.co'));
    const g = await r.coach.uploadGif(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'image/gif' }), 'Press de banca');
    const pecho = await r.coach.saveTemplate(null, { title: 'Pecho', days: [{ title: 'Día 1 – Pecho', exercises: [{ name: 'Press de banca', sets: '4 × 12', note: 'Baja despacio', gif: g.id }, { name: 'Fondos', sets: '3 × 10', note: '', gif: '' }] }] });
    const piernas = await r.coach.saveTemplate(null, { title: 'Piernas', days: [{ title: 'Día 1 – Piernas', exercises: [{ name: 'Sentadilla', sets: '4 × 10', note: '', gif: '' }] }] });
    return { gif: g.id, pecho: pecho.id, piernas: piernas.id };
  }, GIF_B64);
}
// Hace algo por la API como Laura (la coach) en el «servidor» de esa página.
const asLaura = (page, fn, arg) => page.evaluate(async ([src, arg]) => {
  const be = window.__pgFakeBackend;
  const m = {}; const mem = { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
  const r = RemoteFake.createFake({ backend: be, storage: mem });
  await r.auth.sendCode('laura@coach.co'); await r.auth.verifyCode('laura@coach.co', be.lastCode('laura@coach.co'));
  const id = (e) => Object.values(be.users).find((u) => u.email === e).id;
  // eslint-disable-next-line no-new-func
  return new Function('r', 'be', 'id', 'arg', `return (async () => { ${src} })()`)(r, be, id, arg);
}, [fn, arg]);
const openLibrary = async (p) => {
  await p.locator('#tab-mas').click();
  await p.locator('#row-c-rutinas').click();
  await expect(p.locator('#rutinas-title')).toBeFocused();
};
const NEXT_DAY = new Date('2026-10-22T12:00:00-05:00');

test('coach: crea una rutina en «Mis rutinas» con su animación, la asigna a 2 asesorados (copias), edita la copia de uno sin afectar al otro y oculta una', async ({ browser }, testInfo) => {
  const coach = await coachPhone(browser, testInfo);
  const p = coach.p;
  await p.addStyleTag({ content: H.WIDE });
  // La barra del coach sigue siendo Asesorados · Invitar · Más; «Mis rutinas» está dentro de Más
  expect((await p.locator('.tabbar button:visible').allTextContents()).map((x) => x.trim())).toEqual(['Asesorados', 'Invitar', 'Más']);
  await openLibrary(p);
  await expect(p.locator('#tab-mas')).toHaveAttribute('aria-current', 'page');
  await expect(p.locator('#rl-status')).toContainText('Todavía no tienes rutinas');
  await expect(p.locator('#rl-daily-line')).toContainText('Hoy no hay ninguna publicada');
  // --- Crear la plantilla «Pecho» con una animación ---
  await p.getByRole('button', { name: '＋ Crear una rutina' }).click();
  await expect(p.locator('#redit-title')).toHaveText('Crear una rutina');
  await expect(p.locator('#tab-mas')).toHaveAttribute('aria-current', 'page');
  await expect(p.locator('#redit-hint')).toContainText('no pertenece a ningún asesorado');
  await p.locator('#gif-file').setInputFiles(gifFile('press-banca.gif'));
  await p.locator('#gif-name').fill('Press de banca');
  await p.getByRole('button', { name: 'Subir animación' }).click();
  await expect(p.locator('#gif-status')).toContainText('«Press de banca» ya está en tu biblioteca');
  await p.locator('#redit-name').fill('Pecho');
  await p.getByLabel('Nombre del día').first().fill('Día 1 – Pecho');
  await p.locator('#d0e0-name').fill('Press de banca');
  await p.locator('#d0e0-sets').fill('4 × 12');
  await p.getByLabel('Animación (opcional)').first().selectOption({ label: 'Press de banca' });
  await p.getByRole('button', { name: 'Guardar rutina' }).click();
  await expect(p.locator('#toast')).toHaveText('Rutina guardada en tu biblioteca');
  await expect(p.locator('#view-rutinas')).toBeVisible();
  await expect(p.locator('#rl-list .rl-item')).toHaveCount(1);
  await expect(p.locator('#rl-list .rl-item')).toContainText('Pecho');
  await expect(p.locator('#rl-list .rl-item')).toContainText('1 día · 1 ejercicio');
  let be = await H.backend(p);
  expect(Object.values(be.templates)).toHaveLength(1);
  expect(Object.values(be.routines)).toHaveLength(0);   // una plantilla no pertenece a nadie
  // --- «Asignar a…» Ana y Beto ---
  await p.getByRole('button', { name: 'Asignar la rutina Pecho a asesorados' }).click();
  const dlg = p.locator('#dlg-asignar');
  await expect(dlg).toBeVisible();
  await expect(p.locator('#da-title')).toHaveText('Asignar «Pecho» a…');
  await expect(p.locator('#da-list input')).toHaveCount(2);
  await expect(p.locator('#da-list')).toContainText('Ana Martínez');
  await expect(p.locator('#da-list')).toContainText('Beto Ruiz');
  await p.getByRole('button', { name: 'Asignar', exact: true }).click();
  await expect(p.locator('#da-error')).toHaveText('Marca al menos un asesorado.');
  await H.layout(p); await H.tall(p, '#dlg-asignar .da-body');
  await p.getByLabel('Todos mis asesorados').check();
  await expect(p.locator('#da-list input:checked')).toHaveCount(2);
  await p.getByLabel('Beto Ruiz').uncheck();
  await expect(p.getByLabel('Todos mis asesorados')).not.toBeChecked();
  await p.getByLabel('Beto Ruiz').check();
  await expect(p.getByLabel('Todos mis asesorados')).toBeChecked();
  await p.getByRole('button', { name: 'Asignar', exact: true }).click();
  await expect(dlg).not.toBeVisible();
  await expect(p.locator('#toast')).toContainText('asignada a 2 asesorados');
  be = await H.backend(p);
  const rows = Object.values(be.routines);
  expect(rows).toHaveLength(2);
  expect(new Set(rows.map((r) => r.id)).size).toBe(2);
  expect(rows.every((r) => r.visible === true && r.title === 'Pecho' && r.days[0].exercises[0].gif === Object.keys(be.gifs)[0])).toBe(true);
  // --- La copia de Ana se modifica desde su ficha: no cambia la de Beto ---
  await openFicha(p, 'Ana Martínez');
  await expect(p.locator('#coach-detail-rutinas .rc-item')).toHaveCount(1);
  await p.getByRole('button', { name: /Entrar y modificar/ }).click();
  await expect(p.locator('#tab-coach')).toHaveAttribute('aria-current', 'page');
  await p.locator('#redit-name').fill('Pecho de Ana');
  await p.locator('#d0e0-sets').fill('5 × 8');
  await p.getByRole('button', { name: 'Guardar rutina' }).click();
  await expect(p.locator('#toast')).toHaveText('Rutina guardada para Ana Martínez');
  await expect(p.locator('#coach-detail-rutinas .rc-item')).toContainText('Pecho de Ana');
  be = await H.backend(p);
  const byTitle = (t) => Object.values(be.routines).filter((r) => r.title === t);
  expect(byTitle('Pecho de Ana')).toHaveLength(1);
  expect(byTitle('Pecho')).toHaveLength(1);
  expect(byTitle('Pecho')[0].days[0].exercises[0].sets).toBe('4 × 12');
  // --- Editar la plantilla después NO cambia las copias ya asignadas ---
  await openLibrary(p);
  await p.getByRole('button', { name: 'Editar la rutina Pecho' }).click();
  await expect(p.locator('#redit-title')).toHaveText('Editar la rutina');
  await p.locator('#redit-name').fill('Pecho v2');
  await p.getByRole('button', { name: 'Guardar rutina' }).click();
  await expect(p.locator('#toast')).toHaveText('Rutina guardada en tu biblioteca');
  await expect(p.locator('#rl-list .rl-item')).toContainText('Pecho v2');
  be = await H.backend(p);
  expect(Object.values(be.routines).map((r) => r.title).sort()).toEqual(['Pecho', 'Pecho de Ana']);
  // --- Beto: oculta la rutina con el interruptor y le asigna otra desde la biblioteca ---
  await openFicha(p, 'Beto Ruiz');
  const sw = p.getByRole('switch', { name: /Visible para el asesorado: Pecho/ });
  await expect(sw).toBeChecked();
  await sw.uncheck();
  await expect(p.locator('#toast')).toHaveText('«Pecho» quedó oculta para Beto Ruiz');
  await expect(p.locator('#coach-detail-rutina-line')).toHaveText('1 rutina asignada · 1 oculta para Beto Ruiz.');
  await expect(sw).not.toBeChecked();
  expect(Object.values((await H.backend(p)).routines).find((r) => r.title === 'Pecho').visible).toBe(false);
  await p.locator('#rc-pick').selectOption({ label: 'Pecho v2' });
  await p.getByRole('button', { name: 'Asignar', exact: true }).click();
  await expect(p.locator('#toast')).toHaveText('«Pecho v2» asignada a Beto Ruiz');
  await expect(p.locator('#coach-detail-rutinas .rc-item')).toHaveCount(2);
  await H.layout(p); await H.tall(p, '#coach-detail-rutina-card');
  // --- Los clientes: Ana ve la suya (con la animación); Beto ve solo la visible, no la oculta ---
  const ana = await clientPhone(browser, testInfo, coach, 'ana@c.co', 'Ana Martínez');
  await ana.p.locator('#tab-mas').click(); await ana.p.locator('#row-rutina').click();
  await expect(ana.p.locator('#rutina-body .rut-title')).toHaveText(['Pecho de Ana']);
  await ana.p.locator('.rut-ex').filter({ hasText: 'Press de banca' }).locator('summary').click();
  await expect.poll(() => ana.p.locator('.rut-ex img').evaluate((i) => i.naturalWidth)).toBe(1);
  const beto = await clientPhone(browser, testInfo, coach, 'beto@c.co', 'Beto Ruiz');
  await beto.p.locator('#tab-panel').click();
  await expect(beto.p.locator('#hr-text')).toHaveText('Pecho v2 · 1 día · 1 ejercicio');
  await beto.p.locator('#tab-mas').click(); await beto.p.locator('#row-rutina').click();
  await expect(beto.p.locator('#rutina-body .rut-title')).toHaveText(['Pecho v2']);   // la oculta («Pecho») no aparece
  await expect(beto.p.locator('#rutina-body')).not.toContainText('Pecho de Ana');
  expect(ana.errors).toEqual([]);
  expect(beto.errors).toEqual([]);
  expect(coach.errors).toEqual([]);
});

test('rutina de hoy: el coach publica una de su biblioteca para TODOS sus asesorados; solo se ve ese día; otro coach o cliente ajeno no la ven', async ({ browser }, testInfo) => {
  const coach = await coachPhone(browser, testInfo);
  const p = coach.p;
  const ids = await seedLibrary(p);
  const martaCode = await H.seedCoach(p, 'marta@coach.co', 'Marta Fit');
  await H.seedClient(p, 'carlos@c.co', 'Carlos Gómez', martaCode, { paidDays: 20 });
  await p.reload(); await H.ready(p);
  await p.addStyleTag({ content: H.WIDE });
  await openLibrary(p);
  await expect(p.locator('#rl-list .rl-item')).toHaveCount(2);
  await p.getByRole('button', { name: /Publicar Pecho como rutina de hoy/ }).click();
  await expect(p.locator('#toast')).toHaveText('«Pecho» es la rutina de hoy para todos tus asesorados');
  await expect(p.locator('#rl-daily-line')).toContainText('Hoy: «Pecho». La ven todos tus asesorados activos en su Inicio, solo durante hoy.');
  await expect(p.locator('#rl-list .rl-item').filter({ hasText: 'Pecho' }).locator('.rut-badge')).toHaveText('Es la de hoy');
  let be = await H.backend(p);
  const laura = Object.values(be.users).find((u) => u.email === 'laura@coach.co').id;
  expect(be.daily[laura]).toMatchObject({ title: 'Pecho', day: '2026-10-21' });   // la fecha de calendario del dispositivo del coach
  // Cambiarla por otra pide confirmación y la reemplaza (una sola por coach); luego vuelve a la primera
  let asked = '';
  p.removeAllListeners('dialog');
  p.once('dialog', (d) => { asked = d.message(); d.accept(); });
  await p.getByRole('button', { name: /Publicar Piernas como rutina de hoy/ }).click();
  await expect(p.locator('#rl-daily-line')).toContainText('Hoy: «Piernas»');
  expect(asked).toContain('Ya publicaste «Pecho» para hoy');
  p.on('dialog', (d) => d.accept());
  await p.getByRole('button', { name: /Publicar Pecho como rutina de hoy/ }).click();
  await expect(p.locator('#rl-daily-line')).toContainText('Hoy: «Pecho»');
  await H.layout(p); await H.tall(p, '#view-rutinas');
  // --- Clientes del coach: ambos la ven en Inicio sin que se la asignen ---
  const ana = await clientPhone(browser, testInfo, coach, 'ana@c.co', 'Ana Martínez');
  const beto = await clientPhone(browser, testInfo, coach, 'beto@c.co', 'Beto Ruiz');
  for (const c of [ana, beto]) {
    await c.p.addStyleTag({ content: H.WIDE });
    await c.p.locator('#tab-panel').click();
    await expect(c.p.locator('#hd-title')).toHaveText('Rutina de hoy');
    await expect(c.p.locator('#hd-text')).toHaveText('Pecho · 1 día · 2 ejercicios');
    await expect(c.p.locator('#home-rutina')).toBeHidden();   // no tiene rutinas asignadas: solo la de hoy
    expect(await c.p.evaluate(async () => (await PGAccount.remote.client.myRoutines()).length)).toBe(0);
  }
  await H.layout(ana.p);
  await ana.p.getByRole('button', { name: 'Ver la rutina de hoy' }).click();
  await expect(ana.p.locator('#view-rutina')).toBeVisible();
  await expect(ana.p.locator('#rutina-body .rut-daily .rut-badge')).toHaveText('Rutina de hoy');
  await expect(ana.p.locator('#rutina-body .rut-title')).toHaveText(['Pecho']);
  await ana.p.locator('.rut-ex').filter({ hasText: 'Press de banca' }).locator('summary').click();
  await expect.poll(() => ana.p.locator('.rut-ex img').evaluate((i) => i.naturalWidth)).toBe(1);   // las animaciones de la de hoy las lee cualquier asesorado
  await expect(ana.p.locator('#rutina-trained')).toBeVisible();
  await H.layout(ana.p);
  // --- Cliente ajeno (de OTRO coach) y el otro coach: no la ven ---
  const carlos = await clientPhone(browser, testInfo, { p, code: martaCode }, 'carlos@c.co', 'Carlos Gómez');
  await carlos.p.locator('#tab-panel').click();
  await expect(carlos.p.locator('#home-daily')).toBeHidden();
  await expect(carlos.p.locator('#hr-text')).toHaveText('Tu coach todavía no te armó una rutina.');
  expect(await carlos.p.evaluate(async () => PGAccount.remote.client.myDaily('2026-10-21'))).toBeNull();
  const marta = await p.evaluate(async () => {
    const be = window.__pgFakeBackend;
    const m = {}; const mem = { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
    const r = RemoteFake.createFake({ backend: be, storage: mem });
    await r.auth.sendCode('marta@coach.co'); await r.auth.verifyCode('marta@coach.co', be.lastCode('marta@coach.co'));
    const out = { daily: await r.coach.getDaily(), templates: (await r.coach.listTemplates()).length };
    try { await r.coach.publishDaily(Object.keys(be.templates)[0], '2026-10-21'); out.publicar = 'pudo'; } catch (e) { out.publicar = e.code; }
    return out;
  });
  expect(marta).toEqual({ daily: null, templates: 0, publicar: 'not_found' });
  // --- Al día siguiente (reloj del dispositivo y fecha del servidor) ya no aparece ---
  await ana.p.clock.setSystemTime(NEXT_DAY);
  await ana.p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await ana.p.locator('#tab-panel').click();
  await expect(ana.p.locator('#home-daily')).toBeHidden();
  await ana.p.locator('#tab-mas').click(); await ana.p.locator('#row-rutina').click();
  await expect(ana.p.locator('#rutina-body')).toContainText('Todavía no tienes una rutina.');
  await expect(ana.p.locator('#rutina-body .rut-daily')).toHaveCount(0);
  expect(await ana.p.evaluate(async () => PGAccount.remote.client.myDaily('2026-10-22'))).toBeNull();   // el servidor compara con la fecha publicada
  expect(await ana.p.evaluate(async () => (await PGAccount.remote.client.myDaily('2026-10-21')).title)).toBe('Pecho');
  // Beto sigue en «hoy»: la sigue viendo (cada dispositivo compara con SU fecha)
  await expect(beto.p.locator('#home-daily')).toBeVisible();
  // El coach, al día siguiente: la última ya no se muestra; la quita
  await p.clock.setSystemTime(NEXT_DAY);
  await openLibrary(p);
  await expect(p.locator('#rl-daily-line')).toContainText('«Pecho» (21 oct) y ya no se muestra');
  await expect(p.locator('#rl-list .rut-badge')).toHaveCount(0);
  await p.getByRole('button', { name: 'Quitar la rutina de hoy' }).click();
  await expect(p.locator('#toast')).toHaveText('Quitaste la rutina de hoy');
  await expect(p.locator('#rl-daily-line')).toContainText('Hoy no hay ninguna publicada');
  be = await H.backend(p);
  expect(Object.keys(be.daily)).toHaveLength(0);
  expect(ids.gif).toBeTruthy();
  for (const x of [ana, beto, carlos, coach]) expect(x.errors).toEqual([]);
});

test('en pausa por pago el cliente sigue viendo sus rutinas asignadas y la rutina de hoy (es lectura); ocultar una la quita de su lista', async ({ browser }, testInfo) => {
  const coach = await coachPhone(browser, testInfo);
  const ids = await seedLibrary(coach.p);
  await asLaura(coach.p, `
    const [a] = await r.coach.assignTemplate(arg.pecho, [id('ana@c.co')]);
    await r.coach.assignTemplate(arg.piernas, [id('ana@c.co')]);
    await r.coach.publishDaily(arg.piernas, '2026-10-21');
    await r.coach.setRoutineVisible(a.id, false);
    return null;`, ids);
  const ana = await clientPhone(browser, testInfo, coach, 'ana@c.co', 'Ana Martínez');
  const a = ana.p;
  await setPaid(a, -3);
  await a.evaluate(() => PGAccount.refreshLink());
  await expect(a.locator('body')).toHaveClass(/paused/);
  await a.locator('#tab-panel').click();
  await expect(a.locator('#home-coach')).toBeHidden();
  await expect(a.locator('#home-daily')).toBeVisible();
  await expect(a.locator('#hd-text')).toHaveText('Piernas · 1 día · 1 ejercicio');
  await expect(a.locator('#home-rutina')).toBeVisible();
  await expect(a.locator('#hr-text')).toHaveText('Piernas · 1 día · 1 ejercicio');   // la de «Pecho» está oculta
  await a.getByRole('button', { name: 'Ver la rutina de hoy' }).click();
  await expect(a.locator('#rutina-body .rut-title')).toHaveText(['Piernas', 'Piernas']);   // la de hoy y la asignada
  await expect(a.locator('#rutina-body .rut-section')).toHaveText('Mis rutinas');
  await expect(a.locator('#rutina-trained')).toBeHidden();   // en pausa no se anota nada nuevo
  await H.layout(a);
  expect(ana.errors.filter((e) => !/40\d|403/.test(e))).toEqual([]);
});

test('claro y oscuro, letra ancha a 390 px: Mis rutinas, «Asignar a…», la ficha con rutinas y Mi rutina con la de hoy, sin desborde', async ({ browser }, testInfo) => {
  for (const scheme of ['light', 'dark']) {
    const coach = await coachPhone(browser, testInfo);
    await coach.p.emulateMedia({ colorScheme: scheme });
    const ids = await seedLibrary(coach.p);
    await asLaura(coach.p, `
      const [a] = await r.coach.assignTemplate(arg.pecho, [id('ana@c.co')]);
      await r.coach.assignTemplate(arg.piernas, [id('ana@c.co'), id('beto@c.co')]);
      await r.coach.setRoutineVisible(a.id, false);
      await r.coach.publishDaily(arg.pecho, '2026-10-21');
      return null;`, ids);
    await coach.p.reload(); await H.ready(coach.p);
    await coach.p.addStyleTag({ content: H.WIDE });
    // Mis rutinas
    await openLibrary(coach.p);
    await expect(coach.p.locator('#rl-list .rl-item')).toHaveCount(2);
    await H.layout(coach.p); await H.tall(coach.p, '#view-rutinas');
    if (scheme === 'dark') await H.shot(coach.p, 's12-coach-mis-rutinas-oscuro.png', { fullPage: true });
    // Asignar a…
    await coach.p.getByRole('button', { name: 'Asignar la rutina Pecho a asesorados' }).click();
    await expect(coach.p.locator('#da-list input')).toHaveCount(2);
    await H.layout(coach.p); await H.tall(coach.p, '#dlg-asignar .da-body');
    await H.shot(coach.p, `s12-coach-asignar-${scheme}.png`);
    await coach.p.getByRole('button', { name: 'Cancelar' }).click();
    await expect(coach.p.locator('#dlg-asignar')).not.toBeVisible();
    // Ficha de Ana: dos rutinas, una oculta
    await openFicha(coach.p, 'Ana Martínez');
    await expect(coach.p.locator('#coach-detail-rutinas .rc-item')).toHaveCount(2);
    await expect(coach.p.locator('#coach-detail-rutina-line')).toHaveText('2 rutinas asignadas · 1 oculta para Ana Martínez.');
    await coach.p.locator('#coach-detail-rutina-card').scrollIntoViewIfNeeded();
    await H.layout(coach.p); await H.tall(coach.p, '#coach-detail-rutina-card');
    if (scheme === 'dark') await H.shot(coach.p, 's12-coach-ficha-rutinas-oscuro.png', { fullPage: true });
    // Editor
    await coach.p.getByRole('button', { name: /Entrar y modificar la rutina Piernas/ }).click();
    await H.layout(coach.p); await H.tall(coach.p, '#view-rutina-edit');
    // Cliente con la de hoy + sus rutinas
    const ana = await clientPhone(browser, testInfo, coach, 'ana@c.co', 'Ana Martínez');
    await ana.p.emulateMedia({ colorScheme: scheme });
    await ana.p.addStyleTag({ content: H.WIDE });
    await ana.p.locator('#tab-panel').click();
    await expect(ana.p.locator('#home-daily')).toBeVisible();
    await H.layout(ana.p);
    await ana.p.getByRole('button', { name: 'Ver la rutina de hoy' }).click();
    await ana.p.locator('.rut-ex').filter({ hasText: 'Press de banca' }).locator('summary').click();
    await expect(ana.p.locator('.rut-ex img')).toBeVisible();
    await H.layout(ana.p); await H.tall(ana.p, '#view-rutina');
    const small = await ana.p.evaluate(() => [...document.querySelectorAll('#view-rutina summary')].filter((s) => s.getBoundingClientRect().height < 47.5).length);
    expect(small).toBe(0);
    if (scheme === 'dark') await H.shot(ana.p, 's12-cliente-rutina-de-hoy-oscuro.png', { fullPage: true });
    expect(ana.errors).toEqual([]);
    expect(coach.errors).toEqual([]);
  }
});

test('la app OFICIAL no cambia: sin producto coach no hay tarjetas, filas ni pantallas de rutinas', async ({ page }) => {
  await page.goto('index.html');
  expect(await page.evaluate(() => [Producto.coach, typeof Rutinas])).toEqual([false, 'object']);   // el módulo carga pero no se activa
  await H.allHidden(page, '#home-rutina, #home-daily, .rutina-row, #row-c-rutinas, #coach-detail-rutina-card, #view-rutina, #view-rutina-edit, #view-rutinas, #dlg-asignar');
  expect(await page.evaluate(() => [...document.querySelectorAll('.view.active')].map((v) => v.id))).not.toContain('view-rutina');
});
