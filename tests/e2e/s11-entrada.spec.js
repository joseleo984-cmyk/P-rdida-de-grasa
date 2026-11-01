// Sprint 11: entrada «solo con cuenta» (soloNube) y modo producto coach, contra el servidor FALSO (config.js interceptado).
const { test, expect } = require('@playwright/test');
const H = require('./s11-helpers');
const CT = require('../../consent-texts.js');
require('../../consent-texts-solo.js');

test('soloNube: una pantalla de aceptación, sin «solo en mi teléfono» ni «Ahora no», y se registran los mismos eventos que exige el servidor', async ({ browser }, testInfo) => {
  const { p, errors } = await H.phone(browser, testInfo);
  await p.goto('index.html');
  await expect(p.locator('#solo')).toBeVisible();
  await expect(p.locator('#consent')).toBeHidden();
  await expect(p.locator('.tabbar')).toBeHidden();
  await p.addStyleTag({ content: H.WIDE });
  await expect(p.locator('.draft-badge')).toHaveText('Borrador de prueba, pendiente del abogado');
  await expect(p.locator('#solo-au-text')).toHaveText(CT.TEXTS.AU.body);
  await expect(p.locator('#solo-title')).toBeFocused();
  // Las tres casillas obligatorias; «Compartir mis hábitos» existe, sin premarcar
  await expect(p.getByRole('button', { name: 'Continuar' })).toBeDisabled();
  for (const n of ['adult', 'terms', 'unica', 'habits']) await expect(p.locator(`#solo input[name=${n}]`)).not.toBeChecked();
  await expect(p.locator('#solo')).toContainText('Compartir mis hábitos con mi coach');
  await expect(p.locator('#solo')).not.toContainText('solo en mi teléfono');
  await p.locator('#solo input[name=adult]').check();
  await p.locator('#solo input[name=terms]').check();
  await expect(p.getByRole('button', { name: 'Continuar' })).toBeDisabled();
  await p.locator('#solo input[name=unica]').check();
  await expect(p.getByRole('button', { name: 'Continuar' })).toBeEnabled();
  await H.layout(p); await H.tall(p, '#solo');
  await H.shot(p, 's11-entrada-aceptacion.png', { fullPage: true });
  // Un coach existe (código de invitación) y el cliente llega con su enlace
  const code = await H.seedCoach(p, 'laura@coach.co', 'Laura Fit');
  await p.goto(`index.html?c=${code}`);
  await expect(p.locator('#solo')).toBeVisible();
  await p.locator('#solo input[name=adult]').check();
  await p.locator('#solo input[name=terms]').check();
  await p.locator('#solo input[name=unica]').check();
  await p.locator('#solo input[name=habits]').check();
  await p.getByRole('button', { name: 'Continuar' }).click();
  // Entrada con correo: sin «Ahora no» ni casillas A1/A2; con nombre
  await expect(p.locator('#acc-step-email')).toBeVisible();
  await expect(p.getByRole('button', { name: /Ahora no/ })).toBeHidden();
  await expect(p.locator('#acc-terms')).toBeHidden();
  await expect(p.getByLabel('Tu nombre')).toBeVisible();
  await p.addStyleTag({ content: H.WIDE });
  await H.layout(p); await H.shot(p, 's11-entrada-correo.png', { fullPage: true });
  await p.getByLabel('Tu correo').fill('ana@cliente.co');
  await p.getByRole('button', { name: /Enviarme el código/ }).click();
  await expect(p.locator('#acc-email-error')).toContainText('Escribe tu nombre');
  await H.enterWithEmail(p, 'ana@cliente.co', 'Ana Martínez');
  // El enlace del coach lleva directo a conectarse: A5c con solo medidas (fijo), hábitos (elegido) y fotos (aparte)
  await expect(p.locator('#acc-share-title')).toHaveText('Te vas a conectar con «Laura Fit».');
  // Quien llega con el enlace NO ve la pregunta «¿coach o cliente?»: ni las opciones ni el nombre comercial
  await expect(p.locator('#acc-role-title')).toHaveText('Te invitó tu coach');
  await expect(p.locator('#form-acc-role .acc-roles')).toBeHidden();
  await expect(p.getByLabel(/Soy coach/)).toBeHidden();
  await expect(p.locator('#acc-coach-fields')).toBeHidden();
  await expect(p.locator('#acc-share [name=share_body]')).toBeChecked();
  await expect(p.locator('#acc-share [name=share_body]')).toBeDisabled();
  await expect(p.locator('#acc-share [name=share_habits]')).toBeChecked();
  await expect(p.locator('#acc-share [name=share_photos]')).toBeDisabled();
  // Etapa 2: las comidas son necesarias mientras esté vinculada (marcadas y sin poder quitarse), igual que las medidas
  await expect(p.locator('#acc-share [name=share_nutrition]')).toBeChecked();
  await expect(p.locator('#acc-share [name=share_nutrition]')).toBeDisabled();
  await expect(p.locator('#acc-share [name=share_notes]')).toHaveCount(0);
  await H.shot(p, 's11-entrada-conectar.png', { fullPage: true });
  await p.getByRole('button', { name: 'Conectarme y continuar' }).click();
  await p.getByRole('button', { name: 'Ir a la app' }).click();
  // Eventos de consentimiento
  const be = await H.backend(p);
  const mine = be.consentEvents.filter((e) => e.userId === be.users['ana@cliente.co'].id);
  const kinds = mine.map((e) => e.kind).sort();
  expect(kinds).toEqual(['adult', 'cloud_transfer', 'privacy', 'sensitive_health', 'share_body', 'share_habits', 'share_nutrition', 'share_notes', 'share_photos', 'terms'].sort());
  const auHash = H.sha(CT.fullText('AU'));
  for (const k of ['sensitive_health', 'cloud_transfer']) {
    const e = mine.find((x) => x.kind === k);
    expect([e.granted, e.version, e.textHash]).toEqual([true, CT.version('AU'), auHash]);
  }
  const shares = Object.fromEntries(mine.filter((e) => e.kind.startsWith('share_')).map((e) => [e.kind, e.granted]));
  expect(shares).toEqual({ share_body: true, share_habits: true, share_notes: false, share_nutrition: true, share_photos: false });
  expect(mine.filter((e) => e.kind.startsWith('share_')).every((e) => e.version === 'compartir-c2' && e.textHash === H.sha(CT.fullText('A5c', { coach: 'Laura Fit' })))).toBe(true);
  expect(be.profiles[be.users['ana@cliente.co'].id].displayName).toBe('Ana Martínez');
  // Más: no existe el modo local ni «Ahora no»
  await p.locator('#tab-mas').click();
  expect(await p.locator('#view-mas').innerText()).not.toMatch(/solo (en|este) (mi )?tel[eé]fono/i);
  await expect(p.locator('#btn-more-login')).toBeHidden();
  expect(errors).toEqual([]);
});

test('soloNube: sin código de coach un cliente no entra; con un código inválido, mensaje claro', async ({ browser }, testInfo) => {
  const { p, errors } = await H.phone(browser, testInfo);
  await p.goto('index.html');
  await H.acceptSolo(p);
  await H.enterWithEmail(p, 'sin@codigo.co', 'Sin Código');
  await expect(p.locator('#acc-step-role')).toBeVisible();
  await p.locator('#form-acc-role input[value=client]').check();
  await expect(p.locator('#acc-code-opt')).toBeHidden();
  await p.getByRole('button', { name: 'Continuar' }).click();
  await expect(p.locator('#acc-role-error')).toContainText('Para entrar necesitas el código o el enlace de tu coach');
  await p.getByLabel(/Código de mi coach/).fill('ZZZZZZ');
  await p.getByRole('button', { name: 'Comprobar código' }).click();
  await expect(p.locator('#acc-role-error')).toContainText('no existe o ya venció');
  expect(errors.filter((e) => !/Failed to load resource|40\d/.test(e))).toEqual([]);
});

test('la barra del cliente en modo coach: Inicio · Comidas · Entrenar · Progreso · Más; sin plan ni recomendaciones; con «Mi día» (UX Etapa 1)', async ({ browser }, testInfo) => {
  const { p, errors } = await H.phone(browser, testInfo);
  await p.goto('index.html');
  await H.acceptSolo(p);
  const code = await H.seedCoach(p, 'laura@coach.co', 'Laura Fit');
  await p.goto(`index.html?c=${code}`);
  await H.enterWithEmail(p, 'ana@cliente.co', 'Ana');
  await p.getByRole('button', { name: 'Conectarme y continuar' }).click();
  await p.getByRole('button', { name: 'Ir a la app' }).click();
  await p.evaluate(() => window.__pgFakeBackend.setPaidUntil('ana@cliente.co', new Date(window.__pgFakeBackend.clock.now() - 5 * 3600000 + 30 * 86400000).toISOString().slice(0, 10)));
  await p.reload(); await H.ready(p);
  const labels = await p.locator('.tabbar button:visible').allTextContents();
  expect(labels.map((l) => l.trim())).toEqual(['Inicio', 'Comidas', 'Entrenar', 'Progreso', 'Más']);
  await p.addStyleTag({ content: H.WIDE });
  const home = p.locator('#view-panel');
  await expect(home).toContainText('Mi día');
  expect(await home.innerText()).not.toMatch(/Hoy llevas|Proteína|Recomendaciones|plan|kcal/i);   // solo lo que se VE: sin calorías ni plan en Inicio
  await H.allHidden(p, '#home-today, #tips-card, #home-weight, #btn-repeat-breakfast, #panel-summary');
  await H.allHidden(p, '#tab-registrar');
  await expect(p.locator('#pay-countdown')).toBeHidden();   // faltan 30 días: el pago no aparece en Inicio
  await H.layout(p); await H.tall(p, '#view-panel');
  await H.shot(p, 's11-inicio-cliente.png', { fullPage: true });
  // Más: sin plan; lo de la barra ya no se repite
  await p.locator('#tab-mas').click();
  const mas = await p.locator('#view-mas').innerText();
  expect(mas).not.toMatch(/Mi plan y perfil|Mis fotos|Mis comidas|Mi rutina/);
  expect(mas).toContain('Mis datos y permisos');
  await H.layout(p);
  expect(errors).toEqual([]);
});

test('la app OFICIAL (config sin producto ni soloNube) no cambia: barra de siempre, sin clases nuevas ni pantallas nuevas', async ({ page }) => {
  // La app oficial real ya está conectada a plataforma: aquí se prueba la oficial SIN servidor (el config.js vacío de antes).
  await page.route('**/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: "window.PG_CONFIG = { env: '', url: '', key: '', mode: 'real' };" }));
  await page.goto('index.html');
  expect(await page.evaluate(() => [document.body.classList.contains('producto-coach'), document.body.classList.contains('solo-nube'), Producto.coach, Producto.soloNube])).toEqual([false, false, false, false]);
  await expect(page.locator('#consent')).toBeVisible();
  await expect(page.locator('#solo')).toBeHidden();
  await page.locator('#form-consent input[name=terms]').check();
  await page.locator('#form-consent input[name=privacy]').check();
  await page.locator('#form-consent input[name=sensitiveHealth]').check();
  await page.locator('#form-consent input[name=adult]').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  const labels = await page.locator('.tabbar button:visible').allTextContents();
  expect(labels.map((l) => l.trim())).toEqual(['Inicio', 'Comidas', 'Registrar', 'Progreso', 'Más']);
  await page.locator('#tab-panel').click();
  await expect(page.locator('#home-today')).toBeVisible();
  await H.allHidden(page, '#home-coach, #pause-card');
  await H.allHidden(page, '#tab-entrenar, #tab-rutinas');
});

test('claro y oscuro, letra ancha a 390 px: pantalla de aceptación, Inicio, Comidas, Entrenar, Progreso, Hábitos, Medirme y Fotos sin desborde', async ({ browser }, testInfo) => {
  for (const scheme of ['light', 'dark']) {
    const { p, errors } = await H.phone(browser, testInfo);
    await p.emulateMedia({ colorScheme: scheme });
    await p.goto('index.html');
    await p.addStyleTag({ content: H.WIDE });
    await expect(p.locator('#solo')).toBeVisible();
    await H.layout(p);
    if (scheme === 'dark') await H.shot(p, 's11-entrada-aceptacion-oscuro.png', { fullPage: true });
    await H.acceptSolo(p);
    const code = await H.seedCoach(p, 'laura@coach.co', 'Laura Fit');
    await p.goto(`index.html?c=${code}`);
    await H.enterWithEmail(p, 'ana@c.co', 'Ana');
    await p.getByRole('button', { name: 'Conectarme y continuar' }).click();
    await p.getByRole('button', { name: 'Ir a la app' }).click();
    await p.evaluate(() => window.__pgFakeBackend.setPaidUntil('ana@c.co', new Date(window.__pgFakeBackend.clock.now() - 5 * 3600000 + 4 * 86400000).toISOString().slice(0, 10)));
    await p.evaluate(() => PGAccount.refreshLink());
    await p.addStyleTag({ content: H.WIDE });
    for (const [tab, view] of [['panel', '#view-panel'], ['comidas', '#view-micomidas'], ['entrenar', '#view-rutina'], ['registro', '#view-progreso'], ['mas', '#view-mas']]) {
      await p.locator(`#tab-${tab}`).click();
      await expect(p.locator(view)).toBeVisible();
      await H.layout(p); await H.tall(p, view);
      if (scheme === 'dark' && (tab === 'panel' || tab === 'registro')) await H.shot(p, `s11-${tab}-oscuro.png`, { fullPage: true });
    }
    for (const [v, sel] of [['habitos', '#view-habitos'], ['medidas', '#view-medidas'], ['fotos', '#view-fotos']]) {
      await p.evaluate((x) => PGNav.show(x), v);
      await expect(p.locator(sel)).toBeVisible();
      await H.layout(p); await H.tall(p, sel);
    }
    // El foco se ve: la pestaña activa y los botones tienen contorno al navegar con teclado
    await p.locator('#tab-panel').focus();
    await p.keyboard.press('Tab');   // con teclado se activa :focus-visible
    expect(await p.evaluate(() => getComputedStyle(document.activeElement).outlineStyle)).not.toBe('none');
    expect(errors).toEqual([]);
  }
});
