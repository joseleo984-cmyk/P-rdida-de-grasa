// Etapa 2, 2b (v1.8) y 2c (v1.9, videos cortos): rutinas de ejercicios con animaciones. El coach arma rutinas (de su biblioteca «Mis rutinas» o directo para un asesorado),
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
      consents: { sensitive_health: { ...ev, version: '0.2-AU' }, cloud_transfer: { ...ev, version: '0.2-AU' }, coach_agreement: { ...ev, version: ConsentTexts.version('A7') } } }));
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
  await a.evaluate(() => { window.__gifCalls = 0; const c = PGAccount.remote.client; const o = c.gifBlob.bind(c); c.gifBlob = (...x) => { if (!/mountCard/.test(new Error().stack)) window.__gifCalls++; return o(...x); }; });   // estilo v2: el fondo de la tarjeta de Entrenar (mountCard) no cuenta: aquí se mide la lista
  // Inicio: una sola tarjeta («Mi rutina» y «Rutina de hoy» se fusionan) y «Entrenar» en la barra
  expect((await a.locator('.tabbar button:visible').allTextContents()).map((x) => x.trim())).toEqual(['Inicio', 'Comidas', 'Entrenar', 'Progreso', 'Más']);
  await a.locator('#tab-panel').click();
  await expect(a.locator('#home-daily')).toBeVisible();
  // Estilo v2 (E1): tarjeta grande con la rutina y «Empezar» (abre el paso a paso en el día que toca)
  await expect(a.locator('#hd-tag')).toHaveText('Tu rutina · de tu coach');
  await expect(a.locator('#hd-title')).toHaveText('Fuerza en 2 días');
  await expect(a.locator('#hd-text')).toHaveText('3 ejercicios · Día 1 de 2');
  await expect(a.locator('#btn-home-daily')).toHaveText('Empezar');
  await a.locator('#tab-entrenar').click();
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
  // Todos los ejercicios llevan «Cómo se hace ›»; solo lectura: no hay formularios de edición
  await expect(a.locator('.rut-ex').filter({ hasText: 'Fondos' })).toContainText('3 series · 10 repeticiones');   // estilo v2: lo que escribió el coach, dicho en palabras
  await expect(a.locator('.rut-ex-how')).toHaveCount(3);
  await expect(a.locator('#view-rutina input:not([type=hidden]), #view-rutina textarea, #view-rutina select')).toHaveCount(0);
  await H.layout(a); await H.tall(a, '#view-rutina');
  await H.shot(a, 's12-cliente-mi-rutina.png', { fullPage: true });
  // «Ya entrené» marca el hábito de hoy (y pregunta el esfuerzo)
  await expect(a.locator('#btn-rutina-trained')).toHaveText('✓ Ya entrené');
  await a.locator('#btn-rutina-trained').click();
  await expect(a.locator('#toast')).toContainText('Entrenamiento anotado');
  await expect(a.locator('#btn-rutina-trained')).toHaveAttribute('aria-pressed', 'true');
  await expect(a.locator('#rutina-esfuerzo')).toBeVisible();
  expect(await a.evaluate(() => Object.values(JSON.parse(localStorage.getItem('perdida-grasa-pruebas:v1') || localStorage.getItem('perdida-grasa:v1')).habits).some((h) => h.trained === true))).toBe(true);
  // Beto (otro cliente del MISMO coach): no ve la rutina de Ana ni su animación
  const beto = await clientPhone(browser, testInfo, coach, 'beto@c.co', 'Beto Ruiz');
  const b = beto.p;
  await b.locator('#tab-panel').click();
  await expect(b.locator('#home-daily')).toBeHidden();   // sin rutina: no hay tarjeta en Inicio
  await b.locator('#tab-entrenar').click();
  await expect(b.locator('#rutina-body')).toContainText('Todavía no tienes una rutina.');
  await expect(b.locator('#rutina-body')).toContainText('Laura Fit la armará para ti');
  await expect(b.locator('#rutina-trained')).toBeVisible();   // «Ya entrené» sirve también sin rutina del coach
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

test('cliente en pausa por pago: sigue viendo su rutina y sus animaciones (es lectura), pero no puede anotar «Ya entrené»', async ({ browser }, testInfo) => {
  const coach = await coachPhone(browser, testInfo);
  await seedRoutine(coach.p);
  const ana = await clientPhone(browser, testInfo, coach, 'ana@c.co', 'Ana Martínez');
  const a = ana.p;
  await setPaid(a, -3);                                  // el coach marcó «No pagó»
  await a.evaluate(() => PGAccount.refreshLink());
  await expect(a.locator('body')).toHaveClass(/paused/);
  await a.locator('#tab-panel').click();
  await expect(a.locator('#pause-title')).toBeVisible();
  await expect(a.locator('#home-dia')).toBeVisible();      // UX Etapa 2 (P1): Mi día en modo autónomo
  await expect(a.locator('#home-daily')).toBeHidden();     // imagen A12: la rutina pasa a «Rutina y notas: solo lectura»...
  await a.locator('#pause-rutina').click();                // ...y se sigue viendo
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
  await a.locator('#tab-entrenar').click();
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
  await a.locator('#tab-entrenar').click();   // estilo v2: «Empezar» de Inicio abre el paso a paso; a la lista se llega por Entrenar
  await expect(a.locator('#rutina-body .rut-title')).toHaveText('Fuerza en 3 días');
  await a.evaluate(async () => {
    const be = window.__pgFakeBackend;
    const m = {}; const mem = { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
    const r = RemoteFake.createFake({ backend: be, storage: mem });
    await r.auth.sendCode('laura@coach.co'); await r.auth.verifyCode('laura@coach.co', be.lastCode('laura@coach.co'));
    await r.coach.deleteRoutine(Object.values(be.users).find((u) => u.email === 'ana@c.co').id);
  });
  await a.locator('#tab-panel').click();
  await a.locator('#tab-entrenar').click();
  await expect(a.locator('#rutina-body')).toContainText('Todavía no tienes una rutina.');
  await expect(a.locator('#rutina-cards')).toBeHidden();
  await a.locator('#tab-panel').click();
  await expect(a.locator('#home-daily')).toBeHidden();
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
  await p.locator('#tab-rutinas').click();   // UX Etapa 1: «Rutinas» está en la barra del coach
  await expect(p.locator('#view-rutinas')).toBeVisible();
};
const NEXT_DAY = new Date('2026-10-22T12:00:00-05:00');

test('coach: crea una rutina en «Mis rutinas» con su animación, la asigna a 2 asesorados (copias), edita la copia de uno sin afectar al otro y oculta una', async ({ browser }, testInfo) => {
  const coach = await coachPhone(browser, testInfo);
  const p = coach.p;
  await p.addStyleTag({ content: H.WIDE });
  // La barra del coach es Asesorados · Rutinas · Invitar · Más: «Mis rutinas» pasó a la barra
  expect((await p.locator('.tabbar button:visible').allTextContents()).map((x) => x.trim())).toEqual(['Asesorados', 'Rutinas', 'Invitar', 'Más']);
  await openLibrary(p);
  await expect(p.locator('#tab-rutinas')).toHaveAttribute('aria-current', 'page');
  await expect(p.locator('#rl-status')).toContainText('Todavía no tienes rutinas');
  await expect(p.locator('#rl-daily-line')).toContainText('Hoy no hay ninguna publicada');
  // --- Crear la plantilla «Pecho» con una animación ---
  await p.getByRole('button', { name: '＋ Crear una rutina' }).click();
  await expect(p.locator('#redit-title')).toHaveText('Crear una rutina');
  await expect(p.locator('#tab-rutinas')).toHaveAttribute('aria-current', 'page');
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
  await ana.p.locator('#tab-entrenar').click();
  await expect(ana.p.locator('#rutina-body .rut-title')).toHaveText(['Pecho de Ana']);
  await ana.p.locator('.rut-ex').filter({ hasText: 'Press de banca' }).locator('summary').click();
  await expect.poll(() => ana.p.locator('.rut-ex img').evaluate((i) => i.naturalWidth)).toBe(1);
  const beto = await clientPhone(browser, testInfo, coach, 'beto@c.co', 'Beto Ruiz');
  await beto.p.locator('#tab-panel').click();
  await expect(beto.p.locator('#hd-tag')).toHaveText('Tu rutina · de tu coach');
  await expect(beto.p.locator('#hd-title')).toHaveText('Pecho v2');
  await expect(beto.p.locator('#hd-text')).toHaveText('1 ejercicio');
  await beto.p.locator('#tab-entrenar').click();
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
    await expect(c.p.locator('#hd-tag')).toHaveText('Rutina de hoy · de tu coach');
    await expect(c.p.locator('#hd-title')).toHaveText('Pecho');
    await expect(c.p.locator('#hd-text')).toHaveText('2 ejercicios');
    expect(await c.p.evaluate(async () => (await PGAccount.remote.client.myRoutines()).length)).toBe(0);
  }
  await H.layout(ana.p);
  // Estilo v2: «Empezar» abre el paso a paso con la rutina de hoy; la lista con «Cómo se hace» sigue en Entrenar
  await ana.p.getByRole('button', { name: 'Empezar Pecho' }).click();
  await expect(ana.p.locator('#paso-name')).toHaveText('Press de banca');
  await ana.p.locator('#paso-x').click();
  await ana.p.locator('#paso-ask-x').click();
  await ana.p.locator('#tab-entrenar').click();
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
  await expect(carlos.p.locator('#home-daily')).toBeHidden();   // sin rutina asignada ni de hoy: no hay tarjeta
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
  await ana.p.locator('#tab-entrenar').click();
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
  await expect(a.locator('#home-daily')).toBeHidden();   // UX Etapa 2 (A12): en pausa la rutina se abre desde «Rutina y notas: solo lectura»
  await a.locator('#pause-rutina').click();
  await expect(a.locator('#rutina-body .rut-title')).toHaveText(['Piernas']);   // la de hoy y la asignada son la misma: no se repite
  await expect(a.locator('#rutina-body .rut-more')).toHaveCount(0);
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
    await ana.p.locator('#tab-entrenar').click();   // estilo v2: «Empezar» abre el paso a paso
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

// ============================== v1.9: videos cortos ==============================
// Un webm real y pequeño, grabado en el propio navegador de la prueba (canvas + MediaRecorder). Chromium de Playwright no decodifica H.264,
// así que mp4/mov se cubren con las pruebas unitarias, del servidor falso y de la base; aquí se prueba el flujo completo con webm.
async function makeWebm(p, ms = 700) {
  const b64 = await p.evaluate(async (ms) => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');
    const rec = new MediaRecorder(c.captureStream(15), { mimeType: 'video/webm' });
    const chunks = []; rec.ondataavailable = (e) => chunks.push(e.data);
    const stopped = new Promise((r) => { rec.onstop = r; });
    rec.start(100);
    const t0 = performance.now(); let i = 0;
    await new Promise((res) => { const tick = () => { ctx.fillStyle = `hsl(${(i++ * 25) % 360},80%,50%)`; ctx.fillRect(0, 0, 64, 64); if (performance.now() - t0 < ms) setTimeout(tick, 40); else res(); }; tick(); });
    rec.stop(); await stopped;
    const buf = new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer());
    let bin = ''; for (const b of buf) bin += String.fromCharCode(b);
    return btoa(bin);
  }, ms);
  return Buffer.from(b64, 'base64');
}
const webmFile = (buf, name = 'sentadilla.webm') => ({ name, mimeType: 'video/webm', buffer: buf });
// Siembra por la API: una animación GIF y un video webm del coach, y la rutina de Ana con el video en el ejercicio 1 y el GIF en el 2.
async function seedVideoRoutine(page, webm) {
  return page.evaluate(async ({ gif, vid }) => {
    const be = window.__pgFakeBackend;
    const m = {}; const mem = { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
    const r = RemoteFake.createFake({ backend: be, storage: mem });
    await r.auth.sendCode('laura@coach.co');
    await r.auth.verifyCode('laura@coach.co', be.lastCode('laura@coach.co'));
    const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const g = await r.coach.uploadGif(new Blob([bytes(gif)], { type: 'image/gif' }), 'Press de banca');
    const v = await r.coach.uploadGif(new Blob([bytes(vid)], { type: 'video/webm' }), 'Sentadilla');
    const ana = Object.values(be.users).find((u) => u.email === 'ana@c.co').id;
    await r.coach.saveRoutine(ana, { title: 'Piernas con video', days: [
      { title: 'Día 1 – Piernas', exercises: [{ name: 'Sentadilla', sets: '4 × 10', note: 'Espalda recta', gif: v.id }, { name: 'Press de banca', sets: '4 × 12', note: '', gif: g.id }, { name: 'Zancadas', sets: '3 × 12', note: '', gif: '' }] }] });
    return { gif: g.id, video: v.id };
  }, { gif: GIF_B64, vid: webm.toString('base64') });
}
const videoProps = (loc) => loc.evaluate((v) => ({ muted: v.muted, loop: v.loop, autoplay: v.autoplay, playsInline: v.playsInline, controls: v.controls, ready: v.readyState, w: v.videoWidth, tag: v.tagName }));

test('coach: sube un video corto (webm), lo ve en vista previa, lo asigna a un ejercicio y el GIF sigue funcionando; rechaza tipo, peso, firma y duración', async ({ browser }, testInfo) => {
  const { p, errors } = await coachPhone(browser, testInfo);
  await p.addStyleTag({ content: H.WIDE });
  const webm = await makeWebm(p);
  expect(webm.length).toBeGreaterThan(200);
  expect(webm.length).toBeLessThan(200 * 1024);
  await openFicha(p, 'Ana Martínez');
  await p.getByRole('button', { name: '＋ Crear una rutina nueva' }).click();
  // Texto de ayuda y selector de archivo: GIF/WebP y «video/*» (así el teléfono ofrece grabar con la cámara; la validación de verdad sigue en JS, abajo)
  await expect(p.locator('#gif-help')).toContainText('Sube un video corto (hasta 15 segundos y 10 MB) o un GIF liviano (hasta 3 MB)');
  await expect(p.locator('#gif-file')).toHaveAttribute('accept', 'image/gif,image/webp,video/*');
  // --- Rechazos con mensajes claros ---
  const up = () => p.getByRole('button', { name: 'Subir animación' }).click();
  await p.locator('#gif-file').setInputFiles({ name: 'clase.avi', mimeType: 'video/x-msvideo', buffer: Buffer.alloc(100) });
  await up();
  await expect(p.locator('#gif-error')).toContainText('Ese tipo de archivo no sirve');
  await p.locator('#gif-file').setInputFiles({ name: 'doc.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 hola mundo') });
  await up();
  await expect(p.locator('#gif-error')).toContainText('Ese tipo de archivo no sirve');
  await p.locator('#gif-file').setInputFiles({ name: 'falso.mp4', mimeType: 'video/mp4', buffer: Buffer.from('89504e470d0a1a0a0000000000', 'hex') });
  await up();
  await expect(p.locator('#gif-error')).toContainText('de verdad');
  const fake = Buffer.concat([Buffer.from([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]), Buffer.alloc(11 * 1024 * 1024)]);
  await p.locator('#gif-file').setInputFiles({ name: 'enorme.mp4', mimeType: 'video/mp4', buffer: fake });
  await up();
  await expect(p.locator('#gif-error')).toContainText('Ese video pesa 11 MB; el máximo es 10 MB');
  await p.locator('#gif-file').setInputFiles({ name: 'grande.gif', mimeType: 'image/gif', buffer: Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(4 * 1024 * 1024)]) });
  await up();
  await expect(p.locator('#gif-error')).toContainText('Esa animación pesa 4 MB; el máximo es 3 MB');
  // Duración: el navegador informa 20 s (se simula solo para el <video> temporal de la revisión) → «dura 20 s; el máximo son 15»
  await p.evaluate(() => {
    const d = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'duration');
    window.__fakeDur = 20;
    Object.defineProperty(HTMLMediaElement.prototype, 'duration', { configurable: true, get() { return window.__fakeDur && !this.className ? window.__fakeDur : d.get.call(this); } });
  });
  await p.locator('#gif-name').fill('Largo');
  await p.locator('#gif-file').setInputFiles(webmFile(webm, 'largo.webm'));
  await up();
  await expect(p.locator('#gif-error')).toContainText('dura 20 s; el máximo son 15');
  await expect(p.getByRole('button', { name: 'Subir animación' })).toBeEnabled();
  await p.evaluate(() => { window.__fakeDur = 0; });
  // Un archivo que el navegador no puede leer como video (cabecera mp4 con basura) tampoco pasa: no se puede comprobar la duración
  await p.locator('#gif-file').setInputFiles({ name: 'roto.mp4', mimeType: 'video/mp4', buffer: Buffer.concat([Buffer.from([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]), Buffer.alloc(300, 7)]) });
  await up();
  await expect(p.locator('#gif-error')).toContainText('No pudimos leer este video');
  expect(Object.keys((await H.backend(p)).gifs)).toHaveLength(0);   // nada de lo anterior llegó al servidor
  // --- El video bueno ---
  await p.locator('#gif-name').fill('');
  await p.locator('#gif-file').setInputFiles(webmFile(webm));
  await expect(p.locator('#gif-name')).toHaveValue('sentadilla');
  await p.locator('#gif-name').fill('Sentadilla');
  await up();
  await expect(p.locator('#gif-status')).toContainText('«Sentadilla» ya está en tu biblioteca');
  await expect(p.locator('#gif-error')).toBeHidden();
  const item = p.locator('#gif-list li').first();
  await expect(item.locator('.gif-kind-video')).toHaveText('▶ Video');
  await expect(item).toContainText('sin usar todavía');
  const stored = Object.values((await H.backend(p)).gifs)[0];
  expect([stored.mime, stored.size]).toEqual(['video/webm', webm.length]);   // tal cual, sin re-codificar
  // Vista previa: <video muted loop playsinline autoplay>
  await item.getByRole('button', { name: 'Ver el video Sentadilla' }).click();
  const vid = item.locator('video');
  await expect(vid).toBeVisible();
  await expect(item.locator('img')).toHaveCount(0);
  await expect.poll(async () => (await videoProps(vid)).ready, { timeout: 8000 }).toBeGreaterThanOrEqual(2);
  expect(await videoProps(vid)).toMatchObject({ muted: true, loop: true, autoplay: true, playsInline: true, controls: false, tag: 'VIDEO', w: 64 });
  await expect(vid).toHaveAttribute('playsinline', '');
  await expect(vid).toHaveAttribute('muted', '');
  await H.layout(p);
  await item.getByRole('button', { name: 'Ver el video Sentadilla' }).click();   // «Ocultar»: se suelta
  await expect(item.locator('video')).toHaveCount(0);
  // --- El GIF sigue funcionando: se sube, se ve con <img> y la etiqueta es «GIF» ---
  await p.locator('#gif-name').fill('Press de banca');
  await p.locator('#gif-file').setInputFiles(gifFile('press.gif'));
  await up();
  await expect(p.locator('#gif-list li')).toHaveCount(2);
  const gifItem = p.locator('#gif-list li').filter({ hasText: 'Press de banca' });
  await expect(gifItem.locator('.gif-kind')).toHaveText('GIF');
  await gifItem.getByRole('button', { name: 'Ver la animación Press de banca' }).click();
  await expect(gifItem.locator('img')).toBeVisible();
  await expect(gifItem.locator('video')).toHaveCount(0);
  // --- Asignar el video a un ejercicio y guardar ---
  await p.locator('#redit-name').fill('Piernas con video');
  await p.getByLabel('Nombre del día').first().fill('Día 1 – Piernas');
  await p.getByLabel('Nombre del ejercicio').first().fill('Sentadilla');
  await p.locator('#d0e0-sets').fill('4 × 10');
  await p.getByLabel('Animación (opcional)').first().selectOption({ label: 'Sentadilla (video)' });
  await p.getByRole('button', { name: 'Guardar rutina' }).click();
  await expect(p.locator('#coach-detail-title')).toHaveText('Ana Martínez');
  const saved = Object.values((await H.backend(p)).routines);
  expect(saved).toHaveLength(1);
  expect(saved[0].days[0].exercises[0].gif).toBe(stored.id);
  expect(errors).toEqual([]);
});

test('cliente: el ejercicio con video se ve como <video muted loop playsinline autoplay>, cargado al abrirlo y soltado al cerrarlo; el GIF sigue con <img>; otro cliente no lo ve', async ({ browser }, testInfo) => {
  const coach = await coachPhone(browser, testInfo);
  const webm = await makeWebm(coach.p);
  await seedVideoRoutine(coach.p, webm);
  const ana = await clientPhone(browser, testInfo, coach, 'ana@c.co', 'Ana Martínez');
  const a = ana.p;
  await a.addStyleTag({ content: H.WIDE });
  await a.evaluate(() => { window.__gifCalls = 0; window.__revoked = []; const rv = URL.revokeObjectURL.bind(URL); URL.revokeObjectURL = (u) => { window.__revoked.push(u); return rv(u); }; const c = PGAccount.remote.client; const o = c.gifBlob.bind(c); c.gifBlob = (...x) => { if (!/mountCard/.test(new Error().stack)) window.__gifCalls++; return o(...x); }; });   // estilo v2: el fondo de la tarjeta de Entrenar (mountCard) no cuenta: aquí se mide la lista
  await a.locator('#tab-entrenar').click();
  await expect(a.locator('#rutina-body .rut-title')).toHaveText('Piernas con video');
  expect(await a.evaluate(() => window.__gifCalls)).toBe(0);                       // nada se pide hasta abrir un ejercicio
  await expect(a.locator('#rutina-body video, #rutina-body img')).toHaveCount(0);
  const sq = a.locator('.rut-ex').filter({ hasText: 'Sentadilla' });
  await sq.locator('summary').click();
  const v = sq.locator('video');
  await expect(v).toBeVisible();
  await expect(sq.locator('img')).toHaveCount(0);
  await expect(v).toHaveAttribute('aria-label', 'Video del ejercicio: Sentadilla');
  await expect.poll(async () => (await videoProps(v)).ready, { timeout: 8000 }).toBeGreaterThanOrEqual(2);
  expect(await videoProps(v)).toMatchObject({ muted: true, loop: true, autoplay: true, playsInline: true, controls: false, w: 64 });
  await expect(v).toHaveAttribute('loop', ''); await expect(v).toHaveAttribute('muted', ''); await expect(v).toHaveAttribute('playsinline', ''); await expect(v).toHaveAttribute('autoplay', '');
  expect(await v.evaluate((x) => x.src.startsWith('blob:'))).toBe(true);           // se descargó como blob (URL firmada de 60 s), no se enlaza directo
  expect(await a.evaluate(() => window.__gifCalls)).toBe(1);
  const src1 = await v.getAttribute('src');
  await expect.poll(() => v.evaluate((x) => !x.paused), { timeout: 8000 }).toBe(true);   // se reproduce solo
  await H.layout(a);
  // Cerrar: el <video> desaparece y la URL del blob queda revocada
  await sq.locator('summary').click();
  await expect(sq.locator('video')).toHaveCount(0);
  expect(await a.evaluate(() => window.__revoked)).toContain(src1);
  // Reabrir: se pide otra vez y la URL es nueva
  await sq.locator('summary').click();
  await expect(sq.locator('video')).toBeVisible();
  expect(await a.evaluate(() => window.__gifCalls)).toBe(2);
  expect(await sq.locator('video').getAttribute('src')).not.toBe(src1);
  // El GIF del otro ejercicio sigue siendo <img>
  const pb = a.locator('.rut-ex').filter({ hasText: 'Press de banca' });
  await pb.locator('summary').click();
  await expect(pb.locator('img')).toBeVisible();
  await expect(pb.locator('video')).toHaveCount(0);
  await expect.poll(() => pb.locator('img').evaluate((i) => i.naturalWidth)).toBe(1);
  // Otro cliente del mismo coach sin rutina no ve nada; sin vínculo la pantalla no se abre
  const beto = await clientPhone(browser, testInfo, coach, 'beto@c.co', 'Beto Ruiz');
  await beto.p.locator('#tab-panel').click();
  await expect(beto.p.locator('#home-daily')).toBeHidden();
  expect(ana.errors).toEqual([]); expect(beto.errors).toEqual([]); expect(coach.errors).toEqual([]);
});

test('claro y oscuro, letra ancha a 390 px: biblioteca con video y GIF, vista previa y rutina del cliente con video, sin desborde', async ({ browser }, testInfo) => {
  for (const scheme of ['light', 'dark']) {
    const coach = await coachPhone(browser, testInfo);
    await coach.p.emulateMedia({ colorScheme: scheme });
    const webm = await makeWebm(coach.p);
    await seedVideoRoutine(coach.p, webm);
    await coach.p.reload(); await H.ready(coach.p);
    await coach.p.addStyleTag({ content: H.WIDE });
    await openFicha(coach.p, 'Ana Martínez');
    await coach.p.getByRole('button', { name: /Entrar y modificar la rutina Piernas con video/ }).click();
    await expect(coach.p.locator('#gif-list li')).toHaveCount(2);
    await coach.p.locator('#gif-list').getByRole('button', { name: 'Ver el video Sentadilla' }).click();
    await expect(coach.p.locator('#gif-list video')).toBeVisible();
    await coach.p.locator('#gif-list').getByRole('button', { name: 'Ver la animación Press de banca' }).click();
    await expect(coach.p.locator('#gif-list img')).toBeVisible();
    await H.layout(coach.p); await H.tall(coach.p, '#view-rutina-edit');
    expect(await coach.p.evaluate(() => [...document.querySelectorAll('#gif-list video, #gif-list img')].every((m) => m.getBoundingClientRect().right <= 390.5))).toBe(true);
    const ana = await clientPhone(browser, testInfo, coach, 'ana@c.co', 'Ana Martínez');
    await ana.p.emulateMedia({ colorScheme: scheme });
    await ana.p.addStyleTag({ content: H.WIDE });
    await ana.p.locator('#tab-entrenar').click();
    await ana.p.locator('.rut-ex').filter({ hasText: 'Sentadilla' }).locator('summary').click();
    await expect(ana.p.locator('.rut-ex video')).toBeVisible();
    await H.layout(ana.p); await H.tall(ana.p, '#view-rutina');
    expect(await ana.p.evaluate(() => { const v = document.querySelector('.rut-ex video').getBoundingClientRect(); return v.left >= 0 && v.right <= 390.5 && v.height > 20; })).toBe(true);
    expect(ana.errors).toEqual([]); expect(coach.errors).toEqual([]);
  }
});

test('la app OFICIAL no cambia: sin producto coach no hay tarjetas, filas ni pantallas de rutinas', async ({ page }) => {
  await page.goto('index.html');
  expect(await page.evaluate(() => [Producto.coach, typeof Rutinas])).toEqual([false, 'object']);   // el módulo carga pero no se activa
  await H.allHidden(page, '#home-rutina, #home-daily, .rutina-row, #row-c-rutinas, #coach-detail-rutina-card, #view-rutina, #view-rutina-edit, #view-rutinas, #dlg-asignar');
  expect(await page.evaluate(() => [...document.querySelectorAll('.view.active')].map((v) => v.id))).not.toContain('view-rutina');
});
