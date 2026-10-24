// UX Etapa 1 (puntos 6 a 9): Comidas (comidas anotadas y proteína al frente, cierre del día, Mis platos), Entrenar («Cómo se hace» en todos, un solo «Ya entrené» con esfuerzo),
// Progreso y Medirme (tendencia, lenguaje neutro, solo lo que toca hoy) y Fotos (aviso bloqueante L1 con textos literales). Producto 'coach', servidor FALSO, miércoles 21-oct-2026.
const { test, expect } = require('@playwright/test');
const H = require('./ux1-helpers');
const Platos = require('../../platos.js');

const GIF_B64 = 'R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAEklEQVR4nGNgYGD4z4AKMAUBAEnYAQHPh3bnAAAAAElFTkSuQmCC', 'base64');
const AVISO = 'Cada foto que guardes será visible para tu coach de forma automática. Puedes ocultar fotos específicas o retirar este permiso en cualquier momento desde tu perfil.';

async function addDish(p, query, { portion, meal } = {}) {
  await p.locator('#btn-mc-add').click();
  await expect(p.locator('#sheet-comida')).toBeVisible();
  await p.locator('#sc-q').fill(query);
  await p.locator('#sc-results .sc-item').first().click();
  if (portion) await p.locator('#sc-portions label', { hasText: portion }).click();
  if (meal) await p.locator('#sc-meal').selectOption(meal);
  await p.getByRole('button', { name: 'Agregar', exact: true }).click();
  await expect(p.locator('#sheet-comida')).toBeHidden();
}

test('Comidas: «comidas anotadas» y proteína de hoy al frente, kcal pequeñas y con «aprox.», sin meta ni rojo; la comida libre cuenta como «sin dato»', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo);
  await p.locator('#tab-comidas').click();
  await expect(p.locator('#mc-count')).toHaveText('Aún sin comidas anotadas');
  await expect(p.locator('#mc-prot')).toHaveText('—');
  await expect(p.locator('#mc-bienestar')).toHaveText('Si registrar tus comidas te genera ansiedad o culpa, háblalo con tu coach o con un profesional de la salud.');
  await expect(p.locator('#mc-cierre-title')).toHaveText('¿Registraste todo lo de hoy?');
  await addDish(p, 'arepa con huevo');
  const dish = Platos.toFood('arepa-con-huevo', 'normal');
  await expect(p.locator('#mc-count')).toHaveText('1 comida anotada');
  await expect(p.locator('#mc-prot')).toHaveText(`~${Math.round(dish.protein)} g`);
  await expect(p.locator('#mc-kcal')).toHaveText(Platos.approx(dish.kcal, 10));
  await expect(p.locator('.mc-resumen')).toContainText('kcal aprox.');
  // El número grande es la proteína, no las kcal (tamaño de letra)
  const size = (sel) => p.locator(sel).evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  expect(await size('#mc-prot')).toBeGreaterThan(1.3 * await size('#mc-kcal'));
  const item = p.locator('#mc-list .mc-item').first();
  await expect(item).toContainText(`P ~${Math.round(dish.protein)} g`);
  await expect(item).toContainText(Platos.kcalApprox(dish.kcal));
  // Comida libre: sin dato de proteína (NO se inventa 0 g)
  await p.locator('#btn-mc-add').click();
  await p.locator('#sc-free-open').click();
  await p.locator('#sc-name').fill('Almuerzo en un restaurante');
  await p.locator('#sc-kcal-in').fill('640');
  await p.getByRole('button', { name: 'Agregar', exact: true }).click();
  await expect(p.locator('#mc-count')).toHaveText('2 comidas anotadas');
  await expect(p.locator('#mc-prot')).toHaveText(`~${Math.round(dish.protein)} g`);
  await expect(p.locator('#mc-prot-note')).toHaveText('1 comida sin dato de proteína (las escritas a mano no la traen).');
  await expect(p.locator('#mc-list .mc-item').filter({ hasText: 'restaurante' })).toContainText('P sin dato');
  await expect(p.locator('#mc-kcal')).toHaveText(Platos.approx(dish.kcal + 640, 10));   // kcal del plato + 640, redondeado a 10
  // Nada de metas, rojos ni «te pasaste» (la meta de proteína del coach llega en la Etapa 2)
  const txt = await p.locator('#view-micomidas').evaluate((v) => v.innerText);
  expect(txt).not.toMatch(/te pasaste|restan|excedido|meta|objetivo|de ~\d+ g/i);
  await expect(p.locator('#mc-prot-bar')).toBeHidden();
  await expect(p.locator('#view-micomidas .over')).toHaveCount(0);
  await H.layout(p); await H.tall(p, '#view-micomidas');
  await H.shot(p, 'ux1-comidas.png', { fullPage: true });
  expect(errors).toEqual([]);
});

test('Comidas: cierre del día «¿Registraste todo lo de hoy?» (Sí / Casi todo / No) se guarda en el día y viaja con los hábitos; «Mis platos» y búsqueda sin categorías', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo);
  await p.locator('#tab-comidas').click();
  await addDish(p, 'arepa con huevo');
  await expect(p.locator('#mc-cierre-chips button')).toHaveText(['Sí', 'Casi todo', 'No']);
  await p.locator('#mc-cierre-chips button', { hasText: 'Casi todo' }).click();
  expect((await H.habitsOf(p)).close).toBe('casi');
  await expect(p.locator('#mc-cierre-chips button', { hasText: 'Casi todo' })).toHaveAttribute('aria-pressed', 'true');
  await expect(p.locator('#toast')).toContainText('Así tu coach lee mejor tu semana');
  await p.locator('#mc-cierre-chips button', { hasText: 'Sí' }).click();
  expect((await H.habitsOf(p)).close).toBe('si');
  // Se sincroniza con los hábitos (mismo registro del día, sin SQL nuevo)
  await p.evaluate(() => PGSync.run());
  expect(JSON.stringify(await H.backend(p))).toContain('"close":"si"');
  await p.locator('#mc-cierre-chips button', { hasText: 'Sí' }).click();   // otra vez: lo quita
  expect((await H.habitsOf(p) || {}).close).toBeUndefined();
  // Mis platos: guardar localmente y volver a elegirlo
  await H.openMeal(p, 'Arepa');
  await p.locator('#mc-list [data-mc-fav]').click();
  await expect(p.locator('#mc-list [data-mc-fav]')).toHaveText('★ Guardado');
  expect(await p.evaluate(() => localStorage.getItem('perdida-grasa:platos'))).toContain('d:arepa-con-huevo:normal');
  await p.locator('#btn-mc-platos').click();
  await expect(p.locator('#sheet-comida')).toBeVisible();
  await expect(p.locator('#sc-tabs button')).toHaveText(['Catálogo', 'Mis platos', 'Recientes']);
  await expect(p.locator('#sc-tabs [aria-pressed="true"]')).toHaveText('Mis platos');
  await expect(p.locator('#sc-mine .sc-item')).toHaveCount(1);
  await expect(p.locator('#sc-mine .sc-item')).toContainText('Arepa con huevo');
  await expect(p.locator('#sc-mine .sc-item')).toContainText('P ~');
  await p.locator('#sc-mine .sc-item').click();
  await p.getByRole('button', { name: 'Agregar', exact: true }).click();
  await expect(p.locator('#mc-count')).toHaveText('2 comidas anotadas');
  // Recientes, y las categorías se esconden mientras se escribe (el teclado tapaba los resultados)
  await p.locator('#btn-mc-add').click();
  await p.locator('#sc-tabs button', { hasText: 'Recientes' }).click();
  await expect(p.locator('#sc-recent .sc-item')).toHaveCount(1);
  await p.locator('#sc-tabs button', { hasText: 'Catálogo' }).click();
  await expect(p.locator('#sc-cats')).toBeVisible();
  await p.locator('#sc-q').fill('sanco');
  await expect(p.locator('#sc-cats')).toBeHidden();
  await p.locator('#sc-q').fill('');
  await expect(p.locator('#sc-cats')).toBeVisible();
  expect(errors).toEqual([]);
});

async function seedRoutine(page) {
  await page.evaluate(async (b64) => {
    const be = window.__pgFakeBackend;
    const m = {}; const mem = { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
    const r = RemoteFake.createFake({ backend: be, storage: mem });
    await r.auth.sendCode('laura@coach.co');
    await r.auth.verifyCode('laura@coach.co', be.lastCode('laura@coach.co'));
    const g = await r.coach.uploadGif(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'image/gif' }), 'Press de banca');
    const ana = Object.values(be.users).find((u) => u.email === 'ana@c.co').id;
    await r.coach.saveRoutine(ana, { title: 'Fuerza en 2 días', days: [
      { title: 'Día 1 – Pecho', exercises: [{ name: 'Press de banca', sets: '4 × 12', note: 'Baja la barra despacio', gif: g.id }, { name: 'Fondos', sets: '3 × 10', note: '', gif: '' }, { name: 'Flexiones', sets: '3 × 15', note: 'Con la espalda recta', gif: '' }] },
      { title: 'Día 2 – Descanso', exercises: [] }] });
  }, GIF_B64);
}

test('Entrenar: «Cómo se hace ›» en todos los ejercicios y un solo «Ya entrené» que marca el hábito y pregunta el esfuerzo (Fácil · Normal · Duro · No pude terminar)', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo);
  await seedRoutine(p);
  await p.locator('#tab-entrenar').click();
  await expect(p.locator('#rutina-body .rut-title')).toHaveText('Fuerza en 2 días');
  await expect(p.locator('#rutina-body .rut-ex')).toHaveCount(3);
  await expect(p.locator('#rutina-body .rut-ex-how')).toHaveText(['Cómo se hace ›', 'Cómo se hace ›', 'Cómo se hace ›']);
  // Sin demostración ni nota: un aviso amable al abrirlo
  await p.locator('#rutina-body .rut-ex', { hasText: 'Fondos' }).locator('summary').click();
  await expect(p.locator('#rutina-body .rut-ex', { hasText: 'Fondos' })).toContainText('Tu coach todavía no agregó una demostración');
  // Con animación: se pide al abrir
  await p.locator('#rutina-body .rut-ex', { hasText: 'Press de banca' }).locator('summary').click();
  await expect(p.locator('#rutina-body .rut-ex', { hasText: 'Press de banca' }).locator('img')).toBeVisible();
  // Un solo «Ya entrené» (ya no existe «Hoy entrené» ni la casilla en Hábitos)
  await expect(p.locator('#view-rutina').getByRole('button', { name: /entren/i })).toHaveCount(1);
  await expect(p.locator('#btn-rutina-trained')).toHaveText('✓ Ya entrené');
  await expect(p.locator('#rutina-esfuerzo')).toBeHidden();
  await H.layout(p); await H.tall(p, '#view-rutina');
  await p.locator('#btn-rutina-trained').click();
  expect((await H.habitsOf(p)).trained).toBe(true);
  await expect(p.locator('#btn-rutina-trained')).toHaveAttribute('aria-pressed', 'true');
  await expect(p.locator('#rutina-esfuerzo')).toBeVisible();
  await expect(p.locator('#esf-title')).toHaveText('Entrenamiento anotado. ¿Cómo te sentiste?');
  await expect(p.locator('#esf-chips button')).toHaveText(['Fácil', 'Normal', 'Duro', 'No pude terminar']);
  await expect(p.locator('#esf-note')).toHaveText('Tu respuesta le llega a Laura Fit.');
  await H.shot(p, 'ux1-entrenar.png', { fullPage: true });
  await p.locator('#esf-chips button', { hasText: 'Duro' }).click();
  const h = await H.habitsOf(p);
  expect([h.trained, h.effort]).toEqual([true, 'duro']);
  await expect(p.locator('#esf-chips button', { hasText: 'Duro' })).toHaveAttribute('aria-pressed', 'true');
  await p.locator('#esf-chips button', { hasText: 'No pude terminar' }).click();
  expect((await H.habitsOf(p)).effort).toBe('no_termine');
  // El esfuerzo viaja con el hábito del día
  await p.evaluate(() => PGSync.run());
  expect(JSON.stringify(await H.backend(p))).toContain('"effort":"no_termine"');
  // Inicio ya muestra «Entrené» anotado
  await p.locator('#tab-panel').click();
  await expect(p.locator('#dia-entrene')).toHaveAttribute('aria-pressed', 'true');
  // En pausa por pago no se anota nada nuevo
  await H.setPaid(p, -3); await p.evaluate(() => PGAccount.refreshLink());
  await p.locator('#tab-entrenar').click();
  await expect(p.locator('#rutina-trained')).toBeHidden();
  expect(errors).toEqual([]);
});

const W = (n, w, extra = {}) => ({ date: H.iso(n), weight: w, ...extra });
test('Progreso: tendencia de 7 días del peso con los pesajes tenues detrás; pestañas Peso · Cintura · Cadera · Otra; cambios en lenguaje neutro; constancia en primer plano', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo);
  const ws = []; for (let i = 20; i >= 0; i -= 2) ws.push(W(-i, 76 - (20 - i) * 0.12 + (i % 4 ? 0.4 : -0.3)));
  await H.seedState(p, { entries: [...ws, { date: H.iso(-13), waist: 86.4, hip: 103.1, neck: 35 }, { date: H.iso(-1), waist: 84.6, hip: 102.1, neck: 34.6 }] });
  await p.locator('#tab-registro').click();
  await expect(p.locator('#medidas-pick button')).toHaveText(['Peso', 'Cintura', 'Cadera', 'Otra ▾']);
  await expect(p.locator('#medidas-pick button.on')).toHaveText('Peso');
  await expect(p.locator('#prog-label')).toHaveText('Tendencia (promedio de 7 días)');
  await expect(p.locator('#prog-big')).toHaveText(/^\d\d(,\d)? kg$/);
  await expect(p.locator('#prog-delta')).toContainText('menos desde el');
  // Pesajes tenues detrás + línea de tendencia
  await expect(p.locator('#medidas-chart svg circle.raw')).toHaveCount(ws.length);
  await expect(p.locator('#medidas-chart svg path.line')).toHaveCount(1);
  expect(await p.locator('#medidas-chart circle.raw').first().evaluate((e) => parseFloat(getComputedStyle(e).opacity))).toBeLessThan(0.8);
  await expect(p.locator('#medidas-chart-sub')).toContainText('El peso diario sube y baja por agua y sal');
  // Cintura, cadera y otra (con selector)
  await p.locator('#medidas-pick button', { hasText: 'Cintura' }).click();
  await expect(p.locator('#prog-big')).toHaveText('84,6 cm');
  await expect(p.locator('#prog-delta')).toHaveText(/· 1,8 cm menos desde el \d+ oct/);
  await p.locator('#medidas-pick button', { hasText: 'Cadera' }).click();
  await expect(p.locator('#prog-big')).toHaveText('102,1 cm');
  await p.locator('#medidas-pick button', { hasText: 'Otra' }).click();
  await expect(p.locator('#medidas-otra')).toBeVisible();
  await p.locator('#medidas-otra').selectOption('neck');
  await expect(p.locator('#prog-big')).toHaveText('34,6 cm');
  // Constancia: semanas constantes, entrenos del mes, días con registro e insignias
  await expect(p.locator('#prog-stats .stat')).toHaveCount(4);
  await expect(p.locator('#prog-stats')).toContainText('días con registro');
  await expect(p.locator('#prog-stats')).toContainText('insignias');
  // Cambios en lenguaje NEUTRO: «1,8 cm menos», sin verde/rojo de bueno o malo
  await expect(p.locator('#prog-cambios-title')).toHaveText(/^Cambios desde el \d+ oct$/);
  await expect(p.locator('#medidas-table')).toContainText('1,8 cm menos');
  await expect(p.locator('#medidas-table .dn, #view-progreso .dn')).toHaveCount(0);
  const colors = await p.locator('#medidas-table dd').evaluateAll((l) => [...new Set(l.map((e) => getComputedStyle(e).color))]);
  expect(colors).toHaveLength(1);
  expect(colors[0]).toBe(await p.evaluate(() => getComputedStyle(document.body).color));
  expect(await p.locator('#view-progreso').evaluate((v) => v.innerText)).not.toMatch(/ganaste|perdiste|excelente|mal\b|bien\b|logro/i);
  await H.layout(p);
  await H.shot(p, 'ux1-progreso.png', { fullPage: true });
  // Pesajes estables: el mensaje que normaliza la meseta (sin prescribir)
  await p.locator('#medidas-pick button', { hasText: 'Peso' }).click();
  await expect(p.locator('#prog-meseta')).toBeHidden();
  expect(errors).toEqual([]);
});

test('Progreso: peso estable unas semanas → mensaje de meseta sin prescripción; mis registros muestra 5 y «Ver todo»', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo);
  const ws = [-20, -16, -12, -8, -4, -1].map((n, i) => W(n, 72 + (i % 2 ? 0.2 : -0.1)));
  await H.seedState(p, { entries: [...ws, W(-30, 72.3), W(-25, 72.2)] });
  await p.locator('#tab-registro').click();
  await expect(p.locator('#prog-meseta')).toBeVisible();
  await expect(p.locator('#prog-meseta')).toHaveText('El peso lleva unas semanas estable. Es común y no borra lo que has construido. Mira tu cintura y tu constancia; tu coach revisará contigo si hace falta ajustar algo.');
  await p.locator('#prog-reg > summary').click();
  await expect(p.locator('#medidas-history li')).toHaveCount(5);
  await expect(p.locator('#btn-med-all')).toHaveText('Ver todo (8)');
  await p.locator('#btn-med-all').click();
  await expect(p.locator('#medidas-history li')).toHaveCount(8);
  expect(errors).toEqual([]);
});

test('Medirme: solo lo que toca hoy (miércoles: peso, cintura y cadera), con la guía de dónde medir, la última como ayuda debajo del campo y teclado decimal con coma', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo);
  await H.seedState(p, { entries: [W(-16, 73.4, { waist: 85.4, hip: 101.2 })] });
  await p.locator('#tab-registro').click();
  await p.locator('#btn-medirme').click();
  await expect(p.locator('#med-day-text')).toHaveText('Hoy, mié 21 oct');
  await expect(p.locator('#med-toca')).toHaveText('Toca hoy: cintura, peso y cadera');
  // Sin báscula configurada el peso es opcional; cintura y cadera sí son obligatorias
  await expect(p.locator('#med-scale-t')).toHaveText('¿Tienes báscula en casa?');
  await expect(p.locator('.med-card[data-key=waist] .med-req')).toHaveText('Toca hoy');
  await expect(p.locator('.med-card[data-key=hip] .med-req')).toHaveText('Toca hoy');
  await expect(p.locator('.med-card[data-key=weight] .med-req')).toHaveCount(0);
  // Guía de dónde medir y «la última fue…» DEBAJO del campo (no como valor escrito)
  await expect(p.locator('.med-card[data-key=waist]')).toContainText('A la altura del ombligo');
  await expect(p.locator('#med-waist-ult')).toHaveText('La última fue 85,4 cm (5 oct)');
  await expect(p.locator('#med-waist')).toHaveValue('');
  expect(await p.locator('#med-waist').getAttribute('placeholder')).toBeFalsy();
  await expect(p.locator('#med-waist')).toHaveAttribute('inputmode', 'decimal');
  await expect(p.locator('#med-hip-ult')).toHaveText('La última fue 101,2 cm (5 oct)');
  // Lo demás está plegado en «+ Más medidas (opcional)»
  await expect(p.locator('#med-mas')).not.toHaveAttribute('open', '');
  await expect(p.locator('#med-mas summary')).toContainText('+ Más medidas (opcional)');
  await expect(p.locator('#med-neck')).toBeHidden();
  await H.layout(p); await H.tall(p, '#view-medidas');
  await H.shot(p, 'ux1-medirme.png', { fullPage: true });
  // Obligatorio: lo que toca hoy
  await p.getByRole('button', { name: 'Guardar medidas' }).click();
  await expect(p.locator('#medidas-error')).toHaveText('Hoy toca: faltan «Cintura» (cm) y «Cadera» (cm).');
  await expect(p.locator('#med-waist')).toBeFocused();
  // Con báscula, el peso pasa a ser obligatorio (miércoles)
  await p.locator('#btn-scale-si').click();
  await expect(p.locator('.med-card[data-key=weight] .med-req')).toHaveText('Toca hoy');
  await p.getByRole('button', { name: 'Guardar medidas' }).click();
  await expect(p.locator('#medidas-error')).toHaveText('Hoy toca: faltan «Peso» (kg), «Cintura» (cm) y «Cadera» (cm).');
  // Decimales con coma; un valor fuera de rango se rechaza con claridad
  await p.locator('#med-weight').fill('72,8');
  await p.locator('#med-waist').fill('9');
  await p.locator('#med-hip').fill('101,5');
  await p.getByRole('button', { name: 'Guardar medidas' }).click();
  await expect(p.locator('#medidas-error')).toHaveText('Revisa «Cintura»: debe estar entre 30 y 250 cm.');
  await p.locator('#med-waist').fill('84,6');
  await p.getByRole('button', { name: 'Guardar medidas' }).click();
  await expect(p.locator('#view-progreso')).toBeVisible();   // al guardar, vuelve a Progreso
  await expect(p.locator('#toast')).toContainText('Medidas guardadas. Gracias por medirte.');
  const e = (await H.stored(p)).entries.find((x) => x.date === H.TODAY);
  expect([e.weight, e.waist, e.hip]).toEqual([72.8, 84.6, 101.5]);
  expect(errors).toEqual([]);
});

test('Medirme: un martes sin nada que toque no se exige nada; el peso solo es obligatorio miércoles a viernes con báscula; el peso que sube se explica sin alarma', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo);
  await H.seedState(p, { entries: [W(-3, 73.0, { waist: 85.0, hip: 101.0 })] });
  await p.evaluate(() => localStorage.setItem('perdida-grasa:bascula', 'si'));
  await p.locator('#tab-registro').click();
  await p.locator('#btn-medirme').click();
  await expect(p.locator('#med-scale-t')).toHaveCount(0);   // ya dijo que tiene báscula
  await p.locator('#btn-med-cambiar').click();
  await p.locator('#form-medidas input[name=date]').fill(H.iso(-1));   // martes 20
  await expect(p.locator('#med-day-text')).toHaveText('mar 20 oct');
  await expect(p.locator('#med-toca')).toHaveText('Hoy no te toca medir nada');
  await expect(p.locator('.med-req')).toHaveCount(0);
  await p.getByRole('button', { name: 'Guardar medidas' }).click();
  await expect(p.locator('#medidas-error')).toHaveText('Anota al menos una medida.');
  // Lo opcional (cuello) se puede anotar sin más
  await p.locator('#med-mas summary').click();
  await p.locator('#med-neck').fill('35,5');
  await p.getByRole('button', { name: 'Guardar medidas' }).click();
  await expect(p.locator('#view-progreso')).toBeVisible();
  expect((await H.stored(p)).entries.find((x) => x.date === H.iso(-1)).neck).toBe(35.5);
  // El miércoles el peso toca; si sube respecto a la vez anterior, el mensaje explica el ruido diario
  await p.locator('#btn-medirme').click();
  await expect(p.locator('#med-toca')).toContainText('peso');
  await p.locator('#med-weight').fill('73,6');
  await p.getByRole('button', { name: 'Guardar medidas' }).click();
  await expect(p.locator('#toast')).toHaveText('Hoy marcaste un poco más que la vez pasada. El peso diario sube y baja por agua, sal y digestión; lo que importa es la tendencia de varias semanas.');
  expect(errors).toEqual([]);
});

// ---------- Fotos (concepto jurídico 2, L1) ----------
async function upload(p, date, pose = 'frente') {
  await H.openFotoForm(p);
  await p.locator('#form-photo input[name=date]').fill(date);
  await p.locator('#form-photo select[name=pose]').selectOption(pose);
  await p.setInputFiles('#form-photo input[name=file]', { name: 'f.png', mimeType: 'image/png', buffer: PNG });
  await p.getByRole('button', { name: 'Guardar foto' }).click();
}
test('Fotos: modal BLOQUEANTE antes de la primera foto con el permiso para el coach (texto literal), etiqueta «Visible para tu coach» y el modal vuelve si se retira y se da de nuevo el permiso', async ({ browser }, testInfo) => {
  test.setTimeout(90_000);
  const { p, errors } = await H.clientApp(browser, testInfo);
  await p.locator('#tab-registro').click();
  await p.locator('#view-progreso .prog-seg button', { hasText: 'Fotos' }).click();
  await p.getByRole('button', { name: 'Autorizar fotos' }).click();
  await expect(p.locator('#toast')).toHaveText('Fotos autorizadas');
  // El recuadro fijo anterior ya no existe; sin el permiso del coach (A6b) no hay modal ni etiqueta
  await expect(p.locator('#photo-share-notice')).toHaveCount(0);
  await expect(p.locator('#foto-nueva-sum')).toHaveText('Tomar mi primera foto');
  await upload(p, H.iso(-3));
  await expect(p.locator('#toast')).toHaveText('Foto guardada');
  await expect(p.locator('#sheet-foto-aviso')).toBeHidden();
  await expect(p.locator('#gallery .vis-tag')).toHaveCount(0);
  // Se da el permiso A6b: las fotos pasan a verse y llevan la etiqueta (vista previa y miniaturas)
  await p.getByRole('button', { name: 'Permitir que Laura Fit vea mis fotos' }).click();
  await expect(p.locator('#photos-coach-state')).toContainText('Laura Fit puede ver tus fotos');
  await expect(p.locator('#foto-hero-tag')).toHaveText('Visible para tu coach');
  await expect(p.locator('#gallery .thumb .vis-tag')).toHaveText(['Visible para tu coach']);
  // La PRIMERA foto con el permiso activo: aviso bloqueante
  await upload(p, H.iso(-2));
  const dlg = p.locator('#sheet-foto-aviso');
  await expect(dlg).toBeVisible();
  await expect(p.locator('#fa-text')).toHaveText(AVISO);
  await expect(p.locator('#fa-ok')).toHaveText('Entendido y autorizar');
  await expect(dlg.locator('.vis-tag')).toHaveText('Visible para tu coach');
  expect(await p.evaluate(() => document.querySelector('#sheet-foto-aviso').matches(':modal'))).toBe(true);   // bloqueante: nada de lo de atrás se puede tocar
  await H.layout(p); await H.tall(p, '#sheet-foto-aviso');
  await H.shot(p, 'ux1-fotos-aviso.png');
  expect((await p.locator('#gallery .thumb').count())).toBe(1);   // todavía no se guardó
  await p.locator('#fa-cancel').click();
  await expect(dlg).toBeHidden();
  expect((await p.locator('#gallery .thumb').count())).toBe(1);   // «Ahora no»: no se guardó
  await p.getByRole('button', { name: 'Guardar foto' }).click();
  await expect(dlg).toBeVisible();
  await p.locator('#fa-ok').click();
  await expect(p.locator('#toast')).toHaveText('Foto guardada');
  await expect(p.locator('#gallery .thumb')).toHaveCount(2);
  await expect(p.locator('#gallery .thumb .vis-tag')).toHaveText(['Visible para tu coach', 'Visible para tu coach']);
  // Ya no vuelve a salir con las siguientes fotos
  await upload(p, H.iso(-1), 'perfil');
  await expect(p.locator('#toast')).toHaveText('Foto guardada');
  await expect(dlg).toBeHidden();
  // El visor lleva la etiqueta; ocultar una foto la marca «Oculta» (miniatura y vista previa)
  await p.locator('#gallery .thumb').first().click();
  await expect(p.locator('#viewer-vis')).toHaveText('Visible para tu coach');
  await p.locator('#viewer-share').uncheck();
  await expect(p.locator('#viewer-vis')).toHaveText('Oculta');
  await p.locator('#viewer-close').click();
  await expect(p.locator('#gallery .thumb .vis-tag.vis-off')).toHaveCount(1);
  await expect(p.locator('#gallery .thumb .vis-tag.vis-off')).toHaveText('Oculta');
  // Se retira el permiso y se vuelve a dar: el aviso vuelve a salir
  await p.getByRole('button', { name: 'Quitar el permiso a mi coach' }).click();
  await p.locator('#a8-ok').click();
  await expect(p.locator('#photos-coach-state')).toContainText('todavía no puede ver tus fotos');
  await expect(p.locator('#gallery .vis-tag')).toHaveCount(0);
  await p.waitForTimeout(60);
  await p.getByRole('button', { name: 'Permitir que Laura Fit vea mis fotos' }).click();
  await expect(p.locator('#photos-coach-state')).toContainText('Laura Fit puede ver tus fotos');
  await upload(p, H.iso(0));
  await expect(dlg).toBeVisible();
  await expect(p.locator('#fa-text')).toHaveText(AVISO);
  await p.locator('#fa-ok').click();
  await expect(p.locator('#toast')).toHaveText('Foto guardada');
  await H.shot(p, 'ux1-fotos-galeria.png', { fullPage: true });
  expect(errors).toEqual([]);
});
