// Fase B: barra de abajo nueva (cliente: Inicio | Comidas | ＋ Registrar | Progreso | Más; coach: Clientes | ＋ Invitar | Más)
// y menú Más. Ninguna vista anterior deja de ser alcanzable.
const { test, expect, state, CONSENT, D } = require('./helpers');
const { EMPTY, loginAsCoach, newPhone, loginWithEmail } = require('./fake-helpers');

const FAKE = 'index.html?remote=fake';
const SKIP = { 'perdida-grasa:account-skip': '1' };
const bar = (page) => page.locator('#tabbar');
const barBtn = (page, name) => bar(page).getByRole('button', { name, exact: true });
const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const rgb = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);

test('cliente: cinco botones en orden, cada uno abre su vista y marca aria-current', async ({ app, page }) => {
  await app.open({ state: state({ consent: CONSENT }) });
  await expect(bar(page).getByRole('button')).toHaveText(['Inicio', 'Comidas', 'Registrar', 'Progreso', 'Más']);
  await expect(barBtn(page, 'Inicio')).toHaveAttribute('aria-current', 'page');
  await barBtn(page, 'Comidas').click();
  await expect(page.locator('#view-comidas')).toBeVisible();
  await expect(barBtn(page, 'Comidas')).toHaveAttribute('aria-current', 'page');
  await expect(barBtn(page, 'Inicio')).not.toHaveAttribute('aria-current', 'page');
  await barBtn(page, 'Progreso').click();
  await expect(page.locator('#view-registro')).toBeVisible();
  await expect(page.locator('#form-entry')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Historial' })).toBeVisible();
  await barBtn(page, 'Más').click();
  await expect(page.locator('#view-mas')).toBeVisible();
  await barBtn(page, 'Inicio').click();
  await expect(page.locator('#view-panel')).toBeVisible();
  // El botón central no es una vista: abre la hoja y no cambia la pestaña marcada
  await barBtn(page, 'Registrar').click();
  await expect(page.locator('#sheet-registrar')).toBeVisible();
  await expect(barBtn(page, 'Inicio')).toHaveAttribute('aria-current', 'page');
});

test('＋ Registrar: foco al abrir y al cerrar (×, Escape), cuatro tarjetas y la de la foto solo informa', async ({ app, page }) => {
  await app.open({ state: state({ consent: CONSENT }) });
  const sheet = page.locator('#sheet-registrar');
  await barBtn(page, 'Registrar').click();
  await expect(sheet.getByRole('heading', { name: '¿Qué quieres registrar?' })).toBeFocused();
  for (const t of ['Mi peso de hoy', 'Una comida', 'Cómo me fue hoy']) await expect(sheet.getByRole('button', { name: new RegExp(t) })).toBeVisible();
  await expect(sheet.getByRole('button', { name: /Foto de mi plato/ })).toHaveCount(0); // no es un botón
  await expect(sheet.locator('#opt-foto')).toContainText('Próximamente');
  expect(await sheet.locator('#opt-foto').evaluate((el) => el.tagName)).toBe('DIV');
  expect(await sheet.locator('#opt-foto').evaluate((el) => getComputedStyle(el).borderStyle)).toBe('dashed');
  await expect(sheet.getByRole('button', { name: 'Repetir la de ayer' })).toBeHidden(); // ayer no hay comidas
  await sheet.getByRole('button', { name: 'Cerrar' }).click();
  await expect(sheet).toBeHidden();
  await expect(barBtn(page, 'Registrar')).toBeFocused();
  await barBtn(page, 'Registrar').click();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(barBtn(page, 'Registrar')).toBeFocused();
});

test('＋ Registrar: peso, comida, "repetir la de ayer" y hábitos llevan a donde antes se hacía', async ({ app, page }) => {
  const yesterday = { id: 'f1', name: 'Arepa', meal: 'Desayuno', kcal: 300, protein: 8, carbs: 50, fat: 6 };
  await app.open({ state: state({ consent: CONSENT, foods: { [D(1)]: [yesterday] } }) });
  const sheet = page.locator('#sheet-registrar');
  // Mi peso de hoy
  await barBtn(page, 'Registrar').click();
  await sheet.getByRole('button', { name: /Mi peso de hoy/ }).click();
  await expect(page.locator('#view-registro')).toBeVisible();
  await expect(page.locator('#form-entry [name=weight]')).toBeFocused();
  await page.locator('#form-entry [name=weight]').fill('69.4');
  await page.locator('#form-entry').getByRole('button', { name: 'Guardar' }).click();
  expect((await app.stored()).entries.some((e) => e.weight === 69.4 && e.date === D(0))).toBe(true);
  // Una comida
  await barBtn(page, 'Registrar').click();
  await sheet.getByRole('button', { name: /Una comida/ }).click();
  await expect(page.locator('#view-comidas')).toBeVisible();
  await expect(page.locator('#form-food [name=name]')).toBeFocused();
  // Repetir la de ayer (existe porque ayer hay comidas)
  await barBtn(page, 'Registrar').click();
  await sheet.getByRole('button', { name: 'Repetir la de ayer' }).click();
  await expect(page.locator('#view-comidas')).toBeVisible();
  await expect.poll(async () => ((await app.stored()).foods[D(0)] || []).map((f) => f.name)).toEqual(['Arepa']);
  // Cómo me fue hoy
  await barBtn(page, 'Registrar').click();
  await sheet.getByRole('button', { name: /Cómo me fue hoy/ }).click();
  await expect(page.locator('#form-habits [name=steps]')).toBeFocused();
  await expect(page.locator('#form-habits')).toBeVisible();
});

test('Más sin servidor: cabecera, filas y cada pantalla con "← Más"; nada de coach ni cuenta', async ({ app, page }) => {
  await app.open({ state: state({ consent: CONSENT }) });
  await barBtn(page, 'Más').click();
  await expect(page.locator('#more-name')).toHaveText('Ana');
  await expect(page.locator('#more-sub')).toHaveText('Tus datos están solo en este teléfono.');
  const rows = page.locator('#view-mas .more-row:visible');
  await expect(rows).toHaveCount(6);
  for (const t of ['Mi plan y perfil', 'Mis fotos', 'Mis datos y permisos', 'Descargar una copia', 'Cómo instalar la app', 'Ayuda']) await expect(page.getByRole('button', { name: new RegExp(t) })).toBeVisible();
  for (const t of ['Mi coach', 'Cerrar sesión', 'Crear cuenta o entrar', 'Mi panel']) await expect(page.getByRole('button', { name: new RegExp(t) })).toBeHidden();
  await expect(page.locator('#more-saved')).toHaveText('');
  await expect(page.locator('#account-card')).toBeHidden();

  const back = async (rowName) => { await page.getByRole('button', { name: '← Más' }).filter({ visible: true }).click(); await expect(page.locator('#view-mas')).toBeVisible(); await expect(page.getByRole('button', { name: rowName })).toBeFocused(); };
  await page.getByRole('button', { name: /Mi plan y perfil/ }).click();
  await expect(page.getByRole('heading', { name: 'Mi plan y perfil' })).toBeFocused();
  await expect(page.locator('#form-profile')).toBeVisible();
  await expect(page.locator('#plan')).toBeVisible();
  await expect(page.locator('#privacy-card')).toBeHidden();
  await back(/Mi plan y perfil/);
  await page.getByRole('button', { name: /Mis datos y permisos/ }).click();
  await expect(page.locator('#privacy-card')).toBeVisible();
  await expect(page.locator('#btn-export')).toBeVisible();
  await expect(page.locator('#form-profile')).toBeHidden();
  await back(/Mis datos y permisos/);
  await page.getByRole('button', { name: /Descargar una copia/ }).click();
  await expect(page.locator('#btn-export')).toBeVisible();
  await expect(page.locator('#btn-export-csv')).toBeVisible();
  await expect(page.locator('#privacy-card')).toBeHidden();
  await back(/Descargar una copia/);
  await page.getByRole('button', { name: /Mis fotos/ }).click();
  await expect(page.locator('#view-fotos')).toBeVisible();
  await expect(page.locator('#form-photo')).toBeVisible();
  await back(/Mis fotos/);
  await page.getByRole('button', { name: /^Ayuda/ }).click();
  await expect(page.locator('#view-ayuda')).toBeVisible();
  await expect(page.locator('#view-ayuda .needs-account')).toBeHidden(); // sin servidor la ayuda no habla de cuentas
  await back(/^Ayuda/);
  // Perfil sigue contando con todas las tarjetas (modo "all")
  await app.goPerfil();
  for (const sel of ['#form-profile', '#plan', '#privacy-card', '#btn-export', '#btn-reset']) await expect(page.locator(sel)).toBeVisible();
});

test('app oficial sin servidor: sin textos de cuenta en Más ni en la ayuda', async ({ app, page }) => {
  await app.open({ state: state({ consent: CONSENT }) });
  await barBtn(page, 'Más').click();
  const txt = await page.locator('#view-mas').innerText();
  expect(txt).not.toMatch(/cuenta|coach|sesión/i);
  await page.getByRole('button', { name: /^Ayuda/ }).click();
  expect(await page.locator('#view-ayuda').innerText()).not.toMatch(/cuenta/i);
});

test('cliente con cuenta: cabecera con correo y "Guardado en tu cuenta", Cerrar sesión y Mi coach cuando hay vínculo', async ({ app, page, browser }, testInfo) => {
  test.setTimeout(90_000);
  await app.open({ path: FAKE, state: EMPTY(), prefs: SKIP });
  await loginAsCoach(page, 'coach@ejemplo.com', 'Fit Ana');
  const code = await page.evaluate(() => JSON.parse(localStorage.getItem('perdida-grasa:account')).coach.inviteCode);
  const backend = await page.evaluate(() => localStorage.getItem('pg-fake-backend'));
  const { ctx, p } = await newPhone(browser, testInfo, { backend, path: FAKE });
  await loginWithEmail(p, 'luis@ejemplo.com');
  await expect(p.locator('#acc-step-role')).toBeVisible();
  await p.locator('input[name=role][value=client]').check();
  await p.locator('#btn-acc-role').click(); // sin coach todavía
  await p.locator('#btn-acc-done').click();
  const more = p.locator('#tabbar').getByRole('button', { name: 'Más', exact: true });
  await more.click();
  await expect(p.locator('#more-sub')).toHaveText('luis@ejemplo.com');
  await expect(p.getByRole('button', { name: /Cerrar sesión/ })).toBeVisible();
  await expect(p.getByRole('button', { name: /^Mi coach/ })).toBeHidden();
  await expect(p.locator('#more-saved')).toHaveText(/Guardado en tu cuenta · hace|Tu cuenta está activa/);
  // Se conecta con su coach desde "Mis datos y permisos"
  await p.getByRole('button', { name: /Mis datos y permisos/ }).click();
  await p.getByRole('button', { name: 'Conectarme con mi coach' }).click();
  await p.locator('#acc-coach-code').fill(code);
  await p.locator('#btn-acc-role').click();
  await expect(p.locator('#acc-share-title')).toContainText('Fit Ana');
  await p.locator('#btn-acc-role').click();
  await p.locator('#btn-acc-done').click();
  await p.locator('#tabbar').getByRole('button', { name: 'Más', exact: true }).click();
  await p.getByRole('button', { name: /^Mi coach/ }).click();
  await expect(p.locator('#form-shares')).toBeVisible();
  await expect(p.locator('#shares-summary')).toContainText('Tu coach puede ver tu peso y tus medidas');
  await expect(p.locator('#form-profile')).toBeHidden();
  await p.getByRole('button', { name: '← Más' }).filter({ visible: true }).click();
  // Cerrar sesión desde Más
  await p.getByRole('button', { name: /Cerrar sesión/ }).click();
  await expect(p.locator('#form-logout')).toBeVisible();
  await expect(p.locator('#form-logout')).toBeInViewport(); // se ve sin tener que buscarlo bajando
  await p.getByRole('button', { name: 'Cerrar sesión', exact: true }).last().click();
  await expect(p.locator('#toast')).toHaveText('Sesión cerrada');
  await ctx.close();
});

test('coach: Clientes | ＋ Invitar | Más, y su seguimiento personal sigue en Más', async ({ app, page }) => {
  await app.open({ path: FAKE, state: EMPTY(), prefs: SKIP });
  await loginAsCoach(page, 'coach@ejemplo.com', 'Fit Ana');
  await expect(bar(page).getByRole('button')).toHaveText(['Clientes', 'Invitar', 'Más']);
  await expect(page.locator('#view-coach')).toBeVisible(); // empieza en su lista de clientes
  await expect(barBtn(page, 'Clientes')).toHaveAttribute('aria-current', 'page');
  await barBtn(page, 'Invitar').click();
  await expect(page.locator('#view-invitar')).toBeVisible();
  await expect(page.locator('#btn-invite-wa')).toBeVisible();
  await expect(page.locator('#invite-name')).toBeVisible();
  await barBtn(page, 'Más').click();
  await expect(page.locator('#more-sub')).toHaveText('coach@ejemplo.com');
  await expect(page.getByRole('button', { name: /^Mi coach/ })).toBeHidden();
  for (const t of ['Mi panel', 'Mi peso y medidas', 'Mis comidas', 'Mi plan y perfil', 'Mis fotos', 'Mis datos y permisos', 'Descargar una copia', 'Cómo instalar la app', 'Ayuda', 'Cerrar sesión']) await expect(page.getByRole('button', { name: new RegExp('^' + t) })).toBeVisible();
  await page.getByRole('button', { name: /^Mi panel/ }).click();
  await expect(page.locator('#view-panel')).toBeVisible();
  await expect(barBtn(page, 'Más')).toHaveAttribute('aria-current', 'page');
  await barBtn(page, 'Más').click();
  await page.getByRole('button', { name: /^Mi peso y medidas/ }).click();
  await expect(page.locator('#form-entry')).toBeVisible();
  await barBtn(page, 'Más').click();
  await page.getByRole('button', { name: /^Mis comidas/ }).click();
  await expect(page.locator('#view-comidas')).toBeVisible();
});

for (const scheme of ['light', 'dark']) {
  test(`contraste de la barra (${scheme}): etiquetas, botón activo y signo ＋ ≥ 4,5:1, con foco visible`, async ({ app, page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await app.open({ state: state({ consent: CONSENT }) });
    const c = await page.evaluate(() => {
      const cs = (el) => getComputedStyle(el);
      const barBg = cs(document.querySelector('#tabbar')).backgroundColor;
      return {
        barBg, off: cs(document.querySelector('#tab-comidas .tb-label')).color, on: cs(document.querySelector('#tab-panel .tb-label')).color,
        discBg: cs(document.querySelector('#tab-registrar .tab-disc')).backgroundColor, discFg: cs(document.querySelector('#tab-registrar .tab-disc')).color,
        add: cs(document.querySelector('#tab-registrar .tb-label')).color,
      };
    });
    expect(ratio(rgb(c.off), rgb(c.barBg)), 'etiqueta inactiva').toBeGreaterThanOrEqual(4.5);
    expect(ratio(rgb(c.on), rgb(c.barBg)), 'etiqueta activa').toBeGreaterThanOrEqual(4.5);
    expect(ratio(rgb(c.discFg), rgb(c.discBg)), 'signo ＋').toBeGreaterThanOrEqual(4.5);
    expect(ratio(rgb(c.add), rgb(c.barBg)), 'etiqueta Registrar').toBeGreaterThanOrEqual(4.5);
    await page.keyboard.press('Tab'); // foco visible en un botón de la barra
    await page.locator('#tab-comidas').focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    const ring = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return [document.activeElement.id, s.outlineStyle, parseFloat(s.outlineWidth)]; });
    expect(ring[0]).toBe('tab-comidas');
    expect(ring[1]).not.toBe('none');
    expect(ring[2]).toBeGreaterThanOrEqual(2);
  });
}

test('capturas de la barra nueva', async ({ app, page }) => {
  await app.open({ state: state({ consent: CONSENT }) });
  await page.screenshot({ path: 'equipo/qa-capturas/barra-cliente-claro.png' });
  await barBtn(page, 'Registrar').click();
  await page.screenshot({ path: 'equipo/qa-capturas/barra-registrar.png' });
  await page.keyboard.press('Escape');
  await barBtn(page, 'Más').click();
  await page.screenshot({ path: 'equipo/qa-capturas/barra-mas.png' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await barBtn(page, 'Inicio').click();
  await page.screenshot({ path: 'equipo/qa-capturas/barra-cliente-oscuro.png' });
});
