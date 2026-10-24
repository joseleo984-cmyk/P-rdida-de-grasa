// Etapa 2 (comidas), producto 'coach': el cliente elige platos de un catálogo con calorías APROXIMADAS (porción, tipo de comida y día) o escribe una
// comida libre, ve su total del día, edita, borra y repite la de ayer; el coach lo ve en la ficha (últimos 7 días); compartir las comidas es
// obligatorio (texto A5c compartir-c2); en pausa por pago el cliente aún ve sus comidas. La app OFICIAL no cambia. Servidor FALSO.
const { test, expect } = require('@playwright/test');
const H = require('./s11-helpers');

const CT = require('../../consent-texts.js');
require('../../consent-texts-solo.js');
const D0 = '2026-10-21';   // «hoy» del reloj de las pruebas
const D1 = '2026-10-20';

async function clientApp(browser, testInfo, { habits = true, wide = true } = {}) {
  const ph = await H.phone(browser, testInfo);
  const { p } = ph;
  await p.goto('index.html');
  await H.acceptSolo(p, { habits });
  const code = await H.seedCoach(p, 'laura@coach.co', 'Laura Fit');
  await p.goto(`index.html?c=${code}`);
  await H.enterWithEmail(p, 'ana@c.co', 'Ana Martínez');
  await p.getByRole('button', { name: 'Conectarme y continuar' }).click();
  await p.getByRole('button', { name: 'Ir a la app' }).click();
  await p.evaluate(() => window.__pgFakeBackend.setPaidUntil('ana@c.co', new Date(window.__pgFakeBackend.clock.now() - 5 * 3600000 + 30 * 86400000).toISOString().slice(0, 10)));
  await p.evaluate(() => PGAccount.refreshLink());
  if (wide) await p.addStyleTag({ content: H.WIDE });
  return { ...ph, code };
}
const foodsOf = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('perdida-grasa:v1')).foods);
// Agrega un plato del catálogo desde «Mis comidas»: busca, elige, escoge la porción y guarda.
async function addDish(p, query, { portion, meal, date } = {}) {
  await p.locator('#btn-mc-add').click();
  await expect(p.locator('#sheet-comida')).toBeVisible();
  await p.locator('#sc-q').fill(query);
  await p.locator('#sc-results .sc-item').first().click();
  if (portion) await p.locator('#sc-portions label', { hasText: portion }).click();
  if (meal) await p.locator('#sc-meal').selectOption(meal);
  if (date) await p.locator('#sc-date').fill(date);
  await p.getByRole('button', { name: 'Agregar', exact: true }).click();
  await expect(p.locator('#sheet-comida')).toBeHidden();
}

test('cliente: agrega un plato del catálogo con porción y una comida libre, ve su total del día, edita, borra y deshace', async ({ browser }, testInfo) => {
  const { p, errors } = await clientApp(browser, testInfo);
  // La barra no cambia; la tarjeta de Inicio y la fila de Más existen
  expect((await p.locator('.tabbar button:visible').allTextContents()).map((l) => l.trim())).toEqual(['Inicio', 'Hábitos', 'Medidas', 'Fotos', 'Más']);
  const card = p.locator('#home-comidas');
  await expect(card).toBeVisible();
  await expect(card.locator('#hm-title')).toHaveText('Mis comidas de hoy');
  await expect(p.locator('#hm-kcal')).toHaveText('0');
  await expect(card).toContainText('Las calorías son aproximadas');
  await H.layout(p); await H.tall(p, '#home-comidas');
  await H.shot(p, 's13-inicio-comidas-vacio.png', { fullPage: true });
  // «Agregar comida» abre Mis comidas con el catálogo
  await p.getByRole('button', { name: 'Agregar comida' }).first().click();
  await expect(p.locator('#view-micomidas')).toBeVisible();
  await expect(p.locator('#sheet-comida')).toBeVisible();
  await expect(p.locator('#sc-title')).toHaveText('Agregar comida');
  await expect(p.locator('#sc-recent-title')).toBeHidden();
  expect(await p.locator('#sc-results .sc-item').count()).toBeGreaterThan(50);
  await expect(p.locator('#sc-pick')).toContainText('Calorías aproximadas');
  await H.layout(p); await H.tall(p, '#sheet-comida');
  await H.shot(p, 's13-catalogo.png');
  // Búsqueda sin tildes ni mayúsculas, y por categoría
  await p.locator('#sc-q').fill('FRIJOLES');
  await expect(p.locator('#sc-results .sc-item strong').first()).toHaveText('Fríjoles guisados');
  await p.locator('#sc-q').fill('carimanola');
  await expect(p.locator('#sc-results .sc-item')).toHaveCount(1);
  await expect(p.locator('#sc-res-title')).toHaveText('1 resultado');
  await p.locator('#sc-q').fill('zzzz');
  await expect(p.locator('#sc-res-title')).toHaveText('No encontramos ese plato');
  await p.locator('#sc-q').fill('');
  await p.locator('#sc-cats button', { hasText: 'Bebidas' }).click();
  await expect(p.locator('#sc-cats button[aria-pressed=true]')).toHaveText('Bebidas');
  await expect(p.locator('#sc-res-title')).toHaveText('Bebidas');
  const bebidas = await p.locator('#sc-results .sc-item strong').allTextContents();
  expect(bebidas).toContain('Café con leche');
  expect(bebidas).not.toContain('Tamal');
  await p.locator('#sc-cats button', { hasText: 'Todos' }).click();
  // Elegir «Arepa de huevo» con porción grande
  await p.locator('#sc-q').fill('arepa de huevo');
  await p.locator('#sc-results .sc-item').first().click();
  await expect(p.locator('#sc-step2-title')).toHaveText('Arepa de huevo (costeña)');
  await expect(p.locator('#sc-dish-sub')).toHaveText('Porción normal: 1 arepa de huevo frita · 280 kcal aprox.');
  await expect(p.locator('#sc-meal')).toHaveValue('Desayuno');
  await expect(p.locator('#sc-date')).toHaveValue(D0);   // hoy por defecto
  await expect(p.locator('#sc-portions label')).toHaveText([/Media porción\s*140 kcal/, /Porción normal\s*280 kcal/, /Porción grande\s*420 kcal/, /Doble porción\s*560 kcal/]);
  await expect(p.locator('#sc-total')).toHaveText('Total: 280 kcal aproximadas');
  await p.locator('#sc-portions label', { hasText: 'Porción grande' }).click();
  await expect(p.locator('#sc-total')).toHaveText('Total: 420 kcal aproximadas');
  await H.layout(p); await H.tall(p, '#sheet-comida');
  await H.shot(p, 's13-porcion.png');
  await p.getByRole('button', { name: 'Agregar', exact: true }).click();
  await expect(p.locator('#toast')).toHaveText('Comida agregada');
  await expect(p.locator('#sheet-comida')).toBeHidden();
  await expect(p.locator('#mc-kcal')).toHaveText('420');
  await expect(p.locator('#mc-list .mc-item')).toHaveCount(1);
  await expect(p.locator('#mc-list .mc-item').first()).toContainText('Arepa de huevo (costeña)');
  await expect(p.locator('#mc-list .mc-item').first()).toContainText('Porción grande');
  await expect(p.locator('#mc-list .mc-meal-head').first()).toContainText('Desayuno');
  // Comida libre: nombre + kcal (con validación)
  await p.locator('#btn-mc-add').click();
  await p.locator('#sc-free-open').click();
  await expect(p.locator('#sc-step2-title')).toHaveText('Escribir otra comida');
  await expect(p.locator('#sc-portions')).toBeHidden();
  await p.locator('#sc-meal').selectOption('Almuerzo');
  await p.getByRole('button', { name: 'Agregar', exact: true }).click();
  await expect(p.locator('#sc-error')).toHaveText('Escribe qué comiste.');
  await p.locator('#sc-name').fill('Pollo con papas');
  await p.locator('#sc-kcal-in').fill('abc');
  await p.getByRole('button', { name: 'Agregar', exact: true }).click();
  await expect(p.locator('#sc-error')).toContainText('Escribe las calorías aproximadas');
  await p.locator('#sc-kcal-in').fill('450');
  await p.getByRole('button', { name: 'Agregar', exact: true }).click();
  await expect(p.locator('#sheet-comida')).toBeHidden();
  await expect(p.locator('#mc-kcal')).toHaveText('870');
  await expect(p.locator('#mc-list .mc-item')).toHaveCount(2);
  await H.layout(p); await H.tall(p, '#view-micomidas');
  await H.shot(p, 's13-mis-comidas.png', { fullPage: true });
  // Lo guardado (mismo registro de siempre, con plato, porción y hora)
  const foods = await foodsOf(p);
  const list = foods[D0];
  expect(list).toHaveLength(2);
  expect(list[0]).toMatchObject({ name: 'Arepa de huevo (costeña)', meal: 'Desayuno', kcal: 420, protein: 12, carbs: 33, fat: 27, dish: 'arepa-de-huevo', portion: 'large' });
  expect(list[0].time).toMatch(/^\d\d:\d\d$/);
  expect(list[1]).toMatchObject({ name: 'Pollo con papas', meal: 'Almuerzo', kcal: 450 });
  expect(list[1].dish).toBeUndefined();
  // Inicio: total del día
  await p.locator('#tab-panel').click();
  await expect(p.locator('#hm-kcal')).toHaveText('870');
  await expect(p.locator('#hm-text')).toHaveText('2 comidas registradas hoy. Calorías aproximadas.');
  // Llegan al servidor (el coach las verá)
  await expect.poll(async () => Object.values((await H.backend(p)).records).filter((r) => r.kind === 'food').length).toBe(2);
  const srv = Object.values((await H.backend(p)).records).find((r) => r.kind === 'food' && r.data.dish === 'arepa-de-huevo');
  expect(srv.data).toMatchObject({ kcal: 420, portion: 'large', meal: 'Desayuno' });
  expect(srv.date).toBe(D0);
  // Recientes: el plato ya elegido aparece arriba la próxima vez
  await p.locator('#tab-mas').click();
  await p.locator('#row-micomidas').click();
  await expect(p.locator('#micomidas-title')).toBeFocused();
  await p.locator('#btn-mc-add').click();
  await expect(p.locator('#sc-recent-title')).toBeVisible();
  await expect(p.locator('#sc-recent .sc-item strong')).toHaveText(['Arepa de huevo (costeña)']);
  await p.locator('#sc-close').click();
  await expect(p.locator('#sheet-comida')).toBeHidden();
  // Editar el plato: otra porción y otro tipo de comida
  await p.getByRole('button', { name: 'Editar: Arepa de huevo (costeña)' }).click();
  await expect(p.locator('#sc-title')).toHaveText('Editar comida');
  await expect(p.locator('#sc-portions input:checked')).toHaveValue('large');
  await p.locator('#sc-portions label', { hasText: 'Media porción' }).click();
  await p.locator('#sc-meal').selectOption('Snack');
  await p.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(p.locator('#toast')).toHaveText('Comida actualizada');
  await expect(p.locator('#mc-kcal')).toHaveText('590');
  await expect(p.locator('#mc-list')).toContainText('Media porción');
  expect((await foodsOf(p))[D0][0]).toMatchObject({ kcal: 140, portion: 'half', meal: 'Snack', dish: 'arepa-de-huevo' });
  // Editar la libre
  await p.getByRole('button', { name: 'Editar: Pollo con papas' }).click();
  await expect(p.locator('#sc-name')).toHaveValue('Pollo con papas');
  await p.locator('#sc-kcal-in').fill('500');
  await p.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(p.locator('#mc-kcal')).toHaveText('640');
  // Borrar y deshacer
  await p.getByRole('button', { name: 'Borrar: Pollo con papas' }).click();
  await expect(p.locator('#toast')).toContainText('Se borró «Pollo con papas»');
  await expect(p.locator('#mc-kcal')).toHaveText('140');
  await p.locator('#toast .toast-action').click();
  await expect(p.locator('#mc-kcal')).toHaveText('640');
  await expect(p.locator('#mc-list .mc-item')).toHaveCount(2);
  // El servidor refleja el estado final (una lápida del borrado y la comida recuperada)
  await expect.poll(async () => Object.values((await H.backend(p)).records).filter((r) => r.kind === 'food' && !r.deletedAt).map((r) => r.data.kcal).sort()).toEqual([140, 500]);
  expect(errors).toEqual([]);
});

test('cliente: elige otro día, repite la de ayer y no puede anotar días futuros', async ({ browser }, testInfo) => {
  const { p, errors } = await clientApp(browser, testInfo);
  await p.locator('#tab-mas').click();
  await p.locator('#row-micomidas').click();
  await expect(p.locator('#btn-mc-repeat')).toBeHidden();   // ayer sin comidas
  await expect(p.locator('#mc-list')).toContainText('Nada registrado este día.');
  await expect(p.locator('#mc-next')).toBeDisabled();
  // Ayer: Changua en el desayuno y Ajiaco en el almuerzo (el día se elige en la hoja)
  await addDish(p, 'changua', { date: D1 });
  await addDish(p, 'ajiaco', { date: D1, portion: 'Media porción' });
  await expect(p.locator('#mc-day-title')).toHaveText(/^Martes 20 de octubre$/);   // la pantalla va al día anotado
  await expect(p.locator('#mc-kcal')).toHaveText('448');   // Changua 210 + media porción de ajiaco 238
  await p.locator('#mc-next').click();
  await expect(p.locator('#mc-day-title')).toHaveText('Hoy, Miércoles 21 de octubre');
  await expect(p.locator('#mc-kcal')).toHaveText('0');
  // Repetir la de ayer
  await expect(p.locator('#btn-mc-repeat')).toHaveText('Repetir la de ayer');
  await p.locator('#btn-mc-repeat').click();
  await expect(p.locator('#toast')).toContainText('Se copiaron 2 alimentos a hoy');
  await expect(p.locator('#mc-kcal')).toHaveText('448');
  const foods = await foodsOf(p);
  expect(foods[D0].map((x) => [x.dish, x.portion])).toEqual([['changua', 'normal'], ['ajiaco', 'half']]);
  expect(foods[D0].every((x) => x.time === undefined)).toBe(true);   // la hora de ayer no se copia
  expect(new Set([...foods[D0], ...foods[D1]].map((x) => x.id)).size).toBe(4);
  // Un día futuro no se acepta
  await p.locator('#btn-mc-add').click();
  await p.locator('#sc-free-open').click();
  await p.locator('#sc-name').fill('Mañana');
  await p.locator('#sc-kcal-in').fill('100');
  await p.locator('#sc-date').evaluate((el) => { el.removeAttribute('max'); el.value = '2026-10-25'; });
  await p.getByRole('button', { name: 'Agregar', exact: true }).click();
  await expect(p.locator('#sc-error')).toContainText('todavía no llega');
  await p.locator('#sc-close').click();
  expect(errors).toEqual([]);
});

test('el coach ve las comidas en la ficha: últimos 7 días con total por día, plato, porción, tipo y hora', async ({ browser }, testInfo) => {
  const cli = await clientApp(browser, testInfo);
  const a = cli.p;
  await a.locator('#tab-mas').click();
  await a.locator('#row-micomidas').click();
  await addDish(a, 'bandeja paisa', { portion: 'Porción normal' });
  await addDish(a, 'jugo de naranja', { meal: 'Desayuno' });
  await a.locator('#btn-mc-add').click();
  await a.locator('#sc-free-open').click();
  await a.locator('#sc-name').fill('Pollo con papas');
  await a.locator('#sc-kcal-in').fill('450');
  await a.locator('#sc-time').fill('19:30');
  await a.locator('#sc-meal').selectOption('Cena');
  await a.getByRole('button', { name: 'Agregar', exact: true }).click();
  await addDish(a, 'tamal', { date: '2026-10-18', portion: 'Doble porción' });
  await addDish(a, 'banano', { date: '2026-10-10' });   // fuera de los 7 días
  await expect.poll(async () => Object.values((await H.backend(a)).records).filter((r) => r.kind === 'food').length).toBe(5);
  // Teléfono del coach: mismo «servidor», sesión de Laura
  const co = await H.phone(browser, testInfo);
  const c = co.p;
  await c.goto('index.html');
  await H.acceptSolo(c);
  await H.transfer(a, c);
  await c.evaluate(async () => {
    const be = window.__pgFakeBackend;
    const r = RemoteFake.createFake({ backend: be, storage: localStorage });
    await r.auth.sendCode('laura@coach.co');
    const { user } = await r.auth.verifyCode('laura@coach.co', be.lastCode('laura@coach.co'));
    const ok = (v) => ({ granted: true, version: v, textHash: 'a'.repeat(64), clientAt: '2026-10-01T12:00:00.000Z' });
    localStorage.setItem('perdida-grasa:account', JSON.stringify({ userId: user.id, email: user.email, roles: ['client', 'coach'], onboarded: true, coach: await r.coach.myCoach(), cloudAsked: true,
      consents: { sensitive_health: ok('0.2-AU'), cloud_transfer: ok('0.2-AU'), coach_agreement: ok(ConsentTexts.version('A7')) } }));
    localStorage.setItem('perdida-grasa:owner', user.id);
  });
  await c.reload(); await H.ready(c);
  await c.addStyleTag({ content: H.WIDE });
  await c.locator('#tab-coach').click();
  await c.locator('#coach-clients .cli-pay-row').filter({ hasText: 'Ana Martínez' }).locator('.cli-main').click();
  await expect(c.locator('#coach-detail-title')).toHaveText('Ana Martínez');
  await expect(c.locator('#coach-detail-shares')).toContainText('Te muestra: medidas, comidas, hábitos.');
  const card = c.locator('#coach-detail-comidas-card');
  await expect(card.locator('h2')).toHaveText('Comidas');
  await expect(c.locator('#coach-detail-comidas-line')).toHaveText('Últimos 7 días: 2 días con comidas. Las calorías son aproximadas.');
  const days = c.locator('#coach-detail-comidas .cm-day');
  await expect(days).toHaveCount(7);
  // Hoy: 3 comidas. Bandeja paisa normal 1.440, jugo de naranja 105 (1 vaso), pollo con papas 450 → total
  const hoy = days.nth(0);
  await expect(hoy.locator('.cm-head')).toContainText('Hoy · 21 oct');
  const exp = await a.evaluate(() => JSON.parse(localStorage.getItem('perdida-grasa:v1')).foods['2026-10-21'].reduce((s, x) => s + x.kcal, 0));
  await expect(hoy.locator('.cm-head b')).toHaveText(`${exp.toLocaleString('es', { useGrouping: 'always' })} kcal`);
  await expect(hoy.locator('.cm-list li')).toHaveCount(3);
  await expect(hoy.locator('.cm-list li').nth(0)).toContainText('Jugo de naranja natural');
  await expect(hoy.locator('.cm-list li').nth(0)).toContainText('Porción normal · Desayuno');
  await expect(hoy.locator('.cm-list li').nth(1)).toContainText('Bandeja paisa');
  await expect(hoy.locator('.cm-list li').nth(1)).toContainText('Almuerzo');
  await expect(hoy.locator('.cm-list li').nth(2)).toContainText('Pollo con papas');
  await expect(hoy.locator('.cm-list li').nth(2)).toContainText('Cena · 19:30');
  await expect(hoy.locator('.cm-list li').nth(2)).toContainText('450 kcal');
  await expect(days.nth(1)).toContainText('Ayer · 20 oct');
  await expect(days.nth(1)).toContainText('Sin comidas');
  const d18 = days.nth(3);
  await expect(d18.locator('.cm-head')).toContainText('18 oct');
  await expect(d18.locator('.cm-list li')).toContainText('Tamal');
  await expect(d18.locator('.cm-list li')).toContainText('Doble porción · Desayuno');
  await expect(d18.locator('.cm-list li b')).toHaveText('990 kcal');
  await expect(c.locator('#coach-detail-comidas')).not.toContainText('Banano');
  await H.layout(c); await H.tall(c, '#coach-detail-view');
  await H.shot(c, 's13-ficha-coach-comidas.png', { fullPage: true });
  expect(cli.errors).toEqual([]);
  expect(co.errors.filter((e) => !/Failed to load resource|40\d/.test(e))).toEqual([]);
});

test('compartir las comidas es obligatorio: casilla marcada y fija al entrar, con el texto compartir-c2 registrado', async ({ browser }, testInfo) => {
  const { p, errors } = await H.phone(browser, testInfo);
  await p.goto('index.html');
  await H.acceptSolo(p);
  const code = await H.seedCoach(p, 'laura@coach.co', 'Laura Fit');
  await p.goto(`index.html?c=${code}`);
  await H.enterWithEmail(p, 'ana@c.co', 'Ana');
  await expect(p.locator('#acc-share')).toBeVisible();
  const row = p.locator('#acc-share label', { hasText: 'Comidas e ingesta calórica' });
  await expect(row).toContainText('(requerido para el acompañamiento activo).');
  await expect(p.locator('#acc-share [name=share_nutrition]')).toBeChecked();
  await expect(p.locator('#acc-share [name=share_nutrition]')).toBeDisabled();
  await expect(p.locator('#acc-share [name=share_body]')).toBeDisabled();
  await expect(p.locator('#acc-share [name=share_habits]')).toBeEnabled();   // los hábitos siguen siendo opcionales
  await expect(p.locator('#acc-share [name=share_habits]')).not.toBeChecked();
  await expect(p.locator('#acc-share [name=share_habits]')).toHaveAttribute('role', 'switch');
  await expect(p.locator('#acc-share .share-switch .sw-state')).toHaveText('Desactivado');
  await p.locator('#acc-share [name=share_habits]').check();
  await expect(p.locator('#acc-share .share-switch .sw-state')).toHaveText('Activado');
  await p.locator('#acc-share [name=share_habits]').uncheck();
  await expect(p.locator('#acc-share')).not.toContainText('Opción');
  await expect(p.locator('#acc-share [name=share_photos]')).toBeDisabled();
  await p.getByRole('button', { name: 'Conectarme y continuar' }).click();
  await p.getByRole('button', { name: 'Ir a la app' }).click();
  const be = await H.backend(p);
  const id = be.users['ana@c.co'].id;
  const link = be.links.find((l) => l.clientId === id);
  expect(link.shares).toMatchObject({ body: true, nutrition: true, habits: false, notes: false, photos: false });
  const mine = be.consentEvents.filter((e) => e.userId === id && e.kind.startsWith('share_'));
  const hash = H.sha(CT.fullText('A5c', { coach: 'Laura Fit' }));
  expect(mine.every((e) => e.version === 'compartir-c2' && e.textHash === hash)).toBe(true);
  expect(Object.fromEntries(mine.map((e) => [e.kind, e.granted]))).toEqual({ share_body: true, share_nutrition: true, share_habits: false, share_notes: false, share_photos: false });
  expect(CT.fullText('A5c', { coach: 'Laura Fit' })).toContain('- Comidas e ingesta calórica (requerido para el acompañamiento activo).');
  // Más → Mi coach: lo mismo, sin poder quitar las comidas
  await p.locator('#tab-mas').click();
  await p.locator('#row-coach').click();
  await expect(p.locator('#shares-summary')).toHaveText('Tu coach puede ver tus medidas y tus comidas.');
  await expect(p.locator('#form-shares [name=share_nutrition]')).toBeChecked();
  await expect(p.locator('#form-shares [name=share_nutrition]')).toBeDisabled();
  await expect(p.locator('#shares-migrate')).toBeHidden();
  expect(errors).toEqual([]);
});

test('vínculo con el texto anterior (compartir-c1, sin comidas): se pide confirmar el nuevo y mientras tanto no se agrega nada', async ({ browser }, testInfo) => {
  const { p, errors } = await clientApp(browser, testInfo);
  // Deja el vínculo como lo creó la Etapa 1: comidas apagadas y texto compartir-c1
  await p.evaluate(async () => {
    const link = await PGAccount.remote.client.updateShares({ body: true, nutrition: false, habits: true, notes: false, photos: false, version: 'compartir-c1', textHash: 'c'.repeat(64) });
    PGAccount.setMeta({ link, shareVersion: 'compartir-c1' });
    await PGAccount.refresh();
    document.dispatchEvent(new CustomEvent('pg:link-changed'));
  });
  await expect(p.locator('#btn-hm-gate')).toBeVisible();
  await expect(p.locator('#btn-hm-add')).toBeHidden();
  await expect(p.locator('#hm-text')).toHaveText('Para usar tus comidas, confirma lo que compartes con tu coach.');
  await H.layout(p); await H.tall(p, '#home-comidas');
  await H.shot(p, 's13-inicio-confirmar.png', { fullPage: true });
  // Mis comidas explica qué falta
  await p.locator('#tab-mas').click();
  await p.locator('#row-micomidas').click();
  await expect(p.locator('#mc-gate')).toBeVisible();
  await expect(p.locator('#mc-main')).toBeHidden();
  await expect(p.locator('#mc-gate')).toContainText('tus comidas son necesarias mientras estés vinculado/a');
  // Revisar lo que comparto → Mi coach con el aviso de actualización y la casilla ya marcada
  await p.locator('#btn-mc-gate').click();
  await expect(p.locator('#form-shares')).toBeVisible();
  await expect(p.locator('#shares-migrate')).toBeVisible();
  await expect(p.locator('#shares-migrate')).toContainText('tus comidas también son necesarias');
  await expect(p.locator('#form-shares [name=share_nutrition]')).toBeChecked();
  await expect(p.locator('#form-shares [name=share_nutrition]')).toBeDisabled();
  await expect(p.locator('#form-shares [name=share_habits]')).toBeChecked();   // lo que ya compartía se conserva
  await p.getByRole('button', { name: 'Guardar lo que comparto' }).click();
  await expect(p.locator('#toast')).toHaveText('Listo: tu coach verá solo lo que marcaste');
  await expect(p.locator('#shares-migrate')).toBeHidden();
  const be = await H.backend(p);
  const id = be.users['ana@c.co'].id;
  expect(be.links.find((l) => l.clientId === id).shares).toMatchObject({ body: true, nutrition: true, habits: true });
  const ev = be.consentEvents.filter((e) => e.userId === id && e.kind === 'share_nutrition').pop();
  expect([ev.granted, ev.version, ev.textHash]).toEqual([true, 'compartir-c2', H.sha(CT.fullText('A5c', { coach: 'Laura Fit' }))]);
  expect(await p.evaluate(() => PGAccount.meta().shareVersion)).toBe('compartir-c2');
  // Ya puede usar sus comidas
  await p.locator('#tab-panel').click();
  await expect(p.locator('#btn-hm-gate')).toBeHidden();
  await expect(p.locator('#btn-hm-add')).toBeVisible();
  await p.locator('#tab-mas').click();
  await p.locator('#row-micomidas').click();
  await expect(p.locator('#mc-gate')).toBeHidden();
  await addDish(p, 'tamal');
  await expect(p.locator('#mc-list .mc-item')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('en pausa por pago el cliente aún ve sus comidas (sin agregar, editar ni borrar)', async ({ browser }, testInfo) => {
  const { p, errors } = await clientApp(browser, testInfo);
  await p.locator('#tab-mas').click();
  await p.locator('#row-micomidas').click();
  await addDish(p, 'sancocho de gallina');
  await expect(p.locator('#mc-list .mc-item')).toHaveCount(1);
  // Vence el pago
  await p.evaluate(() => window.__pgFakeBackend.setPaidUntil('ana@c.co', new Date(window.__pgFakeBackend.clock.now() - 5 * 3600000 - 3 * 86400000).toISOString().slice(0, 10)));
  await p.evaluate(() => PGAccount.refreshLink());
  await expect(p.locator('body')).toHaveClass(/paused/);
  await expect(p.locator('#view-micomidas')).toBeVisible();   // sigue en la pantalla: se ve lo que anotó
  await expect(p.locator('#mc-list')).toContainText('Sancocho de gallina');
  await expect(p.locator('.pause-banner:visible')).toContainText('por ahora solo puedes ver tus comidas');
  await H.allHidden(p, '#btn-mc-add, #btn-mc-repeat, .mc-actions');
  await H.layout(p);
  await p.locator('#tab-panel').click();
  await expect(p.locator('#pause-card')).toBeVisible();
  await expect(p.locator('#home-comidas')).toBeVisible();
  await expect(p.locator('#hm-kcal')).not.toHaveText('0');
  await H.allHidden(p, '#btn-hm-add');
  await expect(p.locator('#btn-hm-see')).toBeVisible();
  await H.shot(p, 's13-pausa-comidas.png', { fullPage: true });
  await p.locator('#btn-hm-see').click();
  await expect(p.locator('#mc-list')).toContainText('Sancocho de gallina');
  // También por código: nada nuevo en pausa
  await p.evaluate(() => document.querySelector('#btn-mc-add').click());
  await expect(p.locator('#sheet-comida')).toBeHidden();
  expect(Object.values(await foodsOf(p)).flat()).toHaveLength(1);
  // Se reactiva al pagar
  await p.evaluate(() => window.__pgFakeBackend.setPaidUntil('ana@c.co', new Date(window.__pgFakeBackend.clock.now() - 5 * 3600000 + 30 * 86400000).toISOString().slice(0, 10)));
  await p.evaluate(() => PGAccount.refreshLink());
  await expect(p.locator('#btn-mc-add')).toBeVisible();
  expect(errors).toEqual([]);
});

test('la app OFICIAL no cambia: sin tarjeta «Mis comidas de hoy», sin fila nueva en Más ni pantalla nueva; las comidas de siempre siguen', async ({ page }) => {
  await page.goto('index.html');
  expect(await page.evaluate(() => [Producto.coach, Producto.soloNube])).toEqual([false, false]);
  await page.locator('#form-consent input[name=terms]').check();
  await page.locator('#form-consent input[name=privacy]').check();
  await page.locator('#form-consent input[name=sensitiveHealth]').check();
  await page.locator('#form-consent input[name=adult]').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  expect((await page.locator('.tabbar button:visible').allTextContents()).map((l) => l.trim())).toEqual(['Inicio', 'Comidas', 'Registrar', 'Progreso', 'Más']);
  await page.locator('#tab-panel').click();
  await H.allHidden(page, '#home-comidas, #btn-hm-add, #btn-hm-gate');
  await page.locator('#tab-mas').click();
  await H.allHidden(page, '#li-micomidas, #row-micomidas');
  expect(await page.locator('#view-mas').innerText()).not.toMatch(/Lo que comes cada día/);
  await H.allHidden(page, '#view-micomidas, #sheet-comida');
  // El texto de compartir de la app oficial sigue siendo el de siempre (A5, con comidas opcionales)
  expect(await page.evaluate(() => [ConsentTexts.version('A5'), ConsentTexts.shareId(false)])).toEqual(['compartir-2', 'A5']);
  expect(await page.evaluate(() => ConsentTexts.fullText('A5', { coach: 'Laura' }))).toContain('- Comidas\n- Hábitos');
  // Las comidas de siempre: la pestaña Comidas con su formulario libre, sin catálogo
  await page.locator('#tab-comidas').click();
  await expect(page.locator('#form-food')).toBeVisible();
  await page.locator('#form-food input[name=name]').fill('Avena de siempre');
  await page.locator('#form-food input[name=kcal]').fill('300');
  await page.getByRole('button', { name: 'Agregar', exact: true }).click();
  await expect(page.locator('#food-list')).toContainText('Avena de siempre');
  const f = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('perdida-grasa:v1')).foods)[0][0]);
  expect(Object.keys(f).sort()).toEqual(['carbs', 'fat', 'id', 'kcal', 'meal', 'name', 'protein', 'updatedAt']);
});

test('claro y oscuro, letra ancha a 390 px: Inicio, Mis comidas, catálogo, porción, editar y la ficha del coach sin desborde', async ({ browser }, testInfo) => {
  for (const scheme of ['light', 'dark']) {
    const cli = await H.phone(browser, testInfo);
    const p = cli.p;
    await p.emulateMedia({ colorScheme: scheme });
    await p.goto('index.html');
    await H.acceptSolo(p);
    const code = await H.seedCoach(p, 'laura@coach.co', 'Laura Fit');
    await p.goto(`index.html?c=${code}`);
    await H.enterWithEmail(p, 'ana@c.co', 'Ana');
    await p.getByRole('button', { name: 'Conectarme y continuar' }).click();
    await p.getByRole('button', { name: 'Ir a la app' }).click();
    await p.evaluate(() => window.__pgFakeBackend.setPaidUntil('ana@c.co', new Date(window.__pgFakeBackend.clock.now() - 5 * 3600000 + 30 * 86400000).toISOString().slice(0, 10)));
    await p.evaluate(() => PGAccount.refreshLink());
    await p.addStyleTag({ content: H.WIDE });
    await H.layout(p); await H.tall(p, '#view-panel');
    await p.locator('#tab-mas').click();
    await H.layout(p); await H.tall(p, '#view-mas');
    await p.locator('#row-micomidas').click();
    await H.layout(p); await H.tall(p, '#view-micomidas');
    // Catálogo
    await p.locator('#btn-mc-add').click();
    await H.layout(p); await H.tall(p, '#sheet-comida');
    await p.locator('#sc-q').fill('pescado frito');
    await H.layout(p);
    await p.locator('#sc-results .sc-item').first().click();
    await H.layout(p); await H.tall(p, '#sheet-comida');
    expect(await p.locator('#sheet-comida').evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    if (scheme === 'dark') await H.shot(p, 's13-porcion-oscuro.png');
    await p.getByRole('button', { name: 'Agregar', exact: true }).click();
    // Libre con nombre largo
    await p.locator('#btn-mc-add').click();
    await p.locator('#sc-free-open').click();
    await p.locator('#sc-name').fill('Arroz con pollo y ensalada de la casa de mi mamá con mucho aguacate');
    await p.locator('#sc-kcal-in').fill('3500');
    await H.layout(p); await H.tall(p, '#sheet-comida');
    await p.getByRole('button', { name: 'Agregar', exact: true }).click();
    await H.layout(p); await H.tall(p, '#view-micomidas');
    if (scheme === 'dark') await H.shot(p, 's13-mis-comidas-oscuro.png', { fullPage: true });
    // Editar
    await p.getByRole('button', { name: /^Editar: Pescado/ }).click();
    await H.layout(p); await H.tall(p, '#sheet-comida');
    await p.locator('#sc-close').click();
    // Contraste mínimo del texto principal en el tema
    const ratio = await p.evaluate(() => {
      const lum = (c) => { const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const el = document.querySelector('#mc-list .mc-t strong'); const fg = lum(getComputedStyle(el).color), bg = lum(getComputedStyle(document.querySelector('#mc-list').closest('.card')).backgroundColor);
      return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
    });
    expect(ratio).toBeGreaterThan(7);
    // Teclado: la hoja se cierra con Escape y devuelve el foco a «Agregar comida»
    await p.locator('#btn-mc-add').focus();
    await p.keyboard.press('Enter');
    await expect(p.locator('#sheet-comida')).toBeVisible();
    await p.keyboard.press('Escape');
    await expect(p.locator('#sheet-comida')).toBeHidden();
    await expect(p.locator('#btn-mc-add')).toBeFocused();
    await expect.poll(async () => Object.values((await H.backend(p)).records).filter((r) => r.kind === 'food').length).toBe(2);
    // Ficha del coach con la misma letra ancha
    const co = await H.phone(browser, testInfo);
    const c = co.p;
    await c.emulateMedia({ colorScheme: scheme });
    await c.goto('index.html');
    await H.acceptSolo(c);
    await H.transfer(p, c);
    await c.evaluate(async () => {
      const be = window.__pgFakeBackend;
      const r = RemoteFake.createFake({ backend: be, storage: localStorage });
      await r.auth.sendCode('laura@coach.co');
      const { user } = await r.auth.verifyCode('laura@coach.co', be.lastCode('laura@coach.co'));
      const ok = (v) => ({ granted: true, version: v, textHash: 'a'.repeat(64), clientAt: '2026-10-01T12:00:00.000Z' });
      localStorage.setItem('perdida-grasa:account', JSON.stringify({ userId: user.id, email: user.email, roles: ['client', 'coach'], onboarded: true, coach: await r.coach.myCoach(), cloudAsked: true,
        consents: { sensitive_health: ok('0.2-AU'), cloud_transfer: ok('0.2-AU'), coach_agreement: ok(ConsentTexts.version('A7')) } }));
      localStorage.setItem('perdida-grasa:owner', user.id);
    });
    await c.reload(); await H.ready(c);
    await c.addStyleTag({ content: H.WIDE });
    await c.locator('#tab-coach').click();
    await c.locator('#coach-clients .cli-pay-row').first().locator('.cli-main').click();
    await expect(c.locator('#coach-detail-comidas .cm-day')).toHaveCount(7);
    await H.layout(c); await H.tall(c, '#coach-detail-view');
    if (scheme === 'dark') await H.shot(c, 's13-ficha-coach-oscuro.png', { fullPage: true });
    expect(cli.errors).toEqual([]);
  }
});
