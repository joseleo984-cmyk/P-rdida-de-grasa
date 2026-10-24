// Sprint 11: medidas de cuerpo (con gráfica), hábitos de cada día y su avance semanal, y la ficha del asesorado para el coach.
const { test, expect } = require('@playwright/test');
const H = require('./s11-helpers');

const D = (n) => new Date(Date.UTC(2026, 9, 21 + n)).toISOString().slice(0, 10);
async function clientApp(browser, testInfo) {
  const ph = await H.phone(browser, testInfo);
  const { p } = ph;
  await p.goto('index.html');
  await H.acceptSolo(p, { habits: true });
  const code = await H.seedCoach(p, 'laura@coach.co', 'Laura Fit');
  await p.goto(`index.html?c=${code}`);
  await H.enterWithEmail(p, 'ana@c.co', 'Ana Martínez');
  await p.getByRole('button', { name: 'Conectarme y continuar' }).click();
  await p.getByRole('button', { name: 'Ir a la app' }).click();
  await p.evaluate(() => window.__pgFakeBackend.setPaidUntil('ana@c.co', new Date(window.__pgFakeBackend.clock.now() - 5 * 3600000 + 30 * 86400000).toISOString().slice(0, 10)));
  await p.evaluate(() => PGAccount.refreshLink());
  await p.addStyleTag({ content: H.WIDE });
  return { ...ph, code };
}
const saveMed = async (p, date, vals) => {
  await p.locator('#form-medidas input[name=date]').fill(date);
  for (const [k, v] of Object.entries(vals)) await p.locator(`#form-medidas input[name=${k}]`).fill(v);
  await p.getByRole('button', { name: 'Guardar mis medidas' }).click();
};

test('medidas: peso, abdomen y cadera obligatorios en lo nuevo, con decimales, gráfica por medida, tabla Inicio/Hoy/Cambio y validación', async ({ browser }, testInfo) => {
  const { p, errors } = await clientApp(browser, testInfo);
  await p.locator('#tab-medidas').click();
  await expect(p.locator('#medidas-title')).toBeVisible();
  await H.layout(p); await H.tall(p, '#view-medidas');
  // Validaciones: vacío y fuera de rango
  await p.getByRole('button', { name: 'Guardar mis medidas' }).click();
  await expect(p.locator('#medidas-error')).toHaveText('Faltan «Peso» (kg), «Abdomen» (cm) y «Cadera» (cm): son obligatorias.');
  await saveMed(p, D(-20), { neck: '99', weight: '70', abdomen: '92', hip: '101' });
  await expect(p.locator('#medidas-error')).toContainText('Revisa «Cuello»: debe estar entre 15 y 80 cm');
  await p.locator('#form-medidas input[name=neck]').fill('');
  // Peso, abdomen y cadera: si falta alguno no deja guardar y dice cuál falta (aunque haya otras medidas)
  await saveMed(p, D(-20), { neck: '34', waist: '84', weight: '', abdomen: '92', hip: '101' });
  await expect(p.locator('#medidas-error')).toHaveText('Falta «Peso» (kg): es obligatoria.');
  await expect(p.locator('#form-medidas input[name=weight]')).toBeFocused();
  await saveMed(p, D(-20), { weight: '70', abdomen: '', hip: '101' });
  await expect(p.locator('#medidas-error')).toHaveText('Falta «Abdomen» (cm): es obligatoria.');
  await saveMed(p, D(-20), { abdomen: '92', hip: '' });
  await expect(p.locator('#medidas-error')).toHaveText('Falta «Cadera» (cm): es obligatoria.');
  await saveMed(p, D(-20), { weight: '', abdomen: '', hip: '' });
  await expect(p.locator('#medidas-error')).toHaveText('Faltan «Peso» (kg), «Abdomen» (cm) y «Cadera» (cm): son obligatorias.');
  expect((await p.evaluate(() => JSON.parse(localStorage.getItem('perdida-grasa:v1')))).entries).toEqual([]);   // nada se guardó
  // Dos días de medidas, con coma decimal
  await saveMed(p, D(-20), { weight: '70', neck: '34', armR: '29', armL: '28,5', back: '38', waist: '84', abdomen: '92', hip: '101', thighR: '58', thighL: '58' });
  await expect(p.locator('#toast')).toHaveText('Medidas guardadas');
  await saveMed(p, D(0), { weight: '68,5', neck: '33,5', armR: '28', armL: '27,5', back: '37', waist: '80', abdomen: '88', hip: '99', thighR: '56', thighL: '56,5' });
  await expect(p.locator('#toast')).toHaveText('Medidas guardadas');
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem('perdida-grasa:v1')));
  expect(st.schemaVersion).toBe(5);
  expect(st.entries.map((e) => [e.date, e.weight, e.abdomen, e.hip, e.neck, e.armL, e.thighL])).toEqual([[D(-20), 70, 92, 101, 34, 28.5, 58], [D(0), 68.5, 88, 99, 33.5, 27.5, 56.5]]);
  // Tabla (como la maqueta M2) y cambios en verde cuando bajan
  const rows = await p.locator('#medidas-table tbody tr').allInnerTexts();
  expect(rows.map((r) => r.replace(/\s+/g, ' ').trim())).toEqual(['Peso 70 68,5 −1,5', 'Cuello 34 33,5 −0,5', 'Brazo der. 29 28 −1', 'Brazo izq. 28,5 27,5 −1', 'Espalda 38 37 −1', 'Cintura 84 80 −4', 'Abdomen 92 88 −4', 'Cadera 101 99 −2', 'Muslo der. 58 56 −2', 'Muslo izq. 58 56,5 −1,5']);
  await expect(p.locator('#medidas-table tbody tr').first().locator('td.dn')).toHaveText('−1,5');
  // Gráfica sencilla por medida
  await p.locator('#medidas-pick button', { hasText: 'Cintura' }).click();
  await expect(p.locator('#medidas-pick button[aria-pressed=true]')).toHaveText('Cintura');
  await expect(p.locator('#medidas-chart svg')).toHaveAttribute('aria-label', 'Cintura: de 84 cm a 80 cm en 2 registros');
  await expect(p.locator('#medidas-chart svg path.line')).toHaveCount(1);
  await expect(p.locator('#medidas-chart svg circle')).toHaveCount(2);
  await expect(p.locator('#medidas-chart-sub')).toHaveText('Cintura: inicio 84 cm · hoy 80 cm · cambio −4 cm');
  await p.locator('#medidas-pick button', { hasText: 'Cuello' }).click();
  await expect(p.locator('#medidas-chart svg')).toHaveAttribute('aria-label', /^Cuello: de 34 cm a 33,5 cm/);
  await p.locator('#medidas-pick button', { hasText: 'Peso' }).click();   // el peso va en kg
  await expect(p.locator('#medidas-chart svg')).toHaveAttribute('aria-label', 'Peso: de 70 kg a 68,5 kg en 2 registros');
  await expect(p.locator('#medidas-chart-sub')).toHaveText('Peso: inicio 70 kg · hoy 68,5 kg · cambio −1,5 kg');
  await H.layout(p); await H.shot(p, 's11-medidas-cliente.png', { fullPage: true });
  // Mismo día: se actualiza el registro y se suma lo que falta (ese día ya tiene peso, abdomen y cadera: no se vuelven a exigir)
  await saveMed(p, D(0), { weight: '', abdomen: '', hip: '', neck: '33' });
  await expect(p.locator('#toast')).toHaveText('Medidas actualizadas');
  await expect(p.locator('#medidas-history li')).toHaveCount(2);
  // Llega al servidor (al día): el coach las verá
  await expect.poll(async () => Object.values((await H.backend(p)).records).filter((r) => r.kind === 'entry').length).toBe(2);
  const srv = Object.values((await H.backend(p)).records).find((r) => r.nkey === D(0));
  expect(srv.data).toMatchObject({ weight: 68.5, abdomen: 88, hip: 99, neck: 33, armR: 28, thighL: 56.5 });
  // Borrar un registro
  await p.locator('#medidas-history li').first().getByRole('button').click();
  await expect(p.locator('#medidas-history li')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('hábitos: agua en vasos, pasos, sueño y entrenó; avance de la semana con barras; Inicio muestra los de hoy', async ({ browser }, testInfo) => {
  const { p, errors } = await clientApp(browser, testInfo);
  await p.locator('#tab-habitos').click();
  await expect(p.locator('#habitos-title')).toBeVisible();
  await H.layout(p); await H.tall(p, '#view-habitos');
  await p.getByRole('button', { name: 'Guardar mis hábitos' }).click();
  await expect(p.locator('#toast')).toHaveText('Anota al menos un hábito');
  const save = async (date, { glasses, steps, sleep, trained }) => {
    await p.locator('#form-habitos input[name=date]').fill(date);
    await p.locator('#form-habitos input[name=water]').fill('');
    for (let i = 0; i < glasses; i++) await p.getByRole('button', { name: 'Un vaso más' }).click();
    await p.locator('#form-habitos input[name=steps]').fill(String(steps));
    await p.locator('#form-habitos input[name=sleep]').fill(String(sleep));
    await p.locator('#form-habitos input[name=trained]').setChecked(trained);
    await p.getByRole('button', { name: 'Guardar mis hábitos' }).click();
    await expect(p.locator('#toast')).toHaveText('Hábitos guardados');
  };
  await save(D(-2), { glasses: 8, steps: 9000, sleep: 7.5, trained: true });
  await save(D(-1), { glasses: 6, steps: 3000, sleep: 6, trained: false });
  await save(D(0), { glasses: 5, steps: 6200, sleep: 7, trained: true });
  const h = await p.evaluate(() => JSON.parse(localStorage.getItem('perdida-grasa:v1')).habits);
  expect(h[D(0)]).toMatchObject({ water: 1.25, steps: 6200, sleep: 7, trained: true });
  await p.locator('#form-habitos input[name=date]').fill(D(-2));
  await p.locator('#form-habitos input[name=date]').dispatchEvent('change');
  await expect(p.locator('#form-habitos input[name=water]')).toHaveValue('8');   // al elegir otro día se cargan sus valores
  const week = (await p.locator('#habitos-week .habit').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
  expect(week).toEqual(['Agua 1 de 7 días', 'Pasos 1 de 7 días', 'Durmió 7 h o más 2 de 7 días', 'Entrenó 2 de 7 días']);
  await expect(p.locator('#habitos-week .habit').first().locator('[role=progressbar]')).toHaveAttribute('aria-valuenow', '14');
  await expect(p.locator('#habitos-week-line')).toContainText('6 de 28 hábitos');
  await H.layout(p); await H.shot(p, 's11-habitos-cliente.png', { fullPage: true });
  await p.locator('#tab-panel').click();
  const hoy = (await p.locator('#hc-habits .habit').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
  expect(hoy).toEqual(['Agua 5 de 8 vasos', 'Pasos 6.200 de 8.000', 'Sueño 7 h', 'Entrenó Sí']);
  expect(await p.locator('#view-panel').innerText()).not.toMatch(/Hoy llevas/i);   // Etapa 2: la tarjeta «Mis comidas de hoy» sí muestra kcal aproximadas
  // Llegan al servidor (el coach los ve porque Ana los compartió)
  await expect.poll(async () => Object.values((await H.backend(p)).records).filter((r) => r.kind === 'habit').length).toBe(3);
  expect(errors).toEqual([]);
});

test('ficha del coach: medidas Inicio/Hoy/Cambio, hábitos de la semana con barras y resumen en la lista; aviso si no los comparte', async ({ browser }, testInfo) => {
  const coach = await H.phone(browser, testInfo);
  const c = coach.p;
  await c.goto('index.html');
  await H.acceptSolo(c);
  const code = await H.seedCoach(c, 'laura@coach.co', 'Laura Fit');
  const meas = [{ date: D(-20), data: { neck: 34, armR: 29, armL: 28.5, back: 38, waist: 84, thighR: 58, thighL: 58 } }, { date: D(0), data: { neck: 33.5, armR: 28, armL: 27.5, back: 37, waist: 80, thighR: 56, thighL: 56.5 } }];
  const hab = [-2, -1, 0].map((n) => ({ date: D(n), data: { water: 2, steps: 9000, sleep: 7.5, trained: n !== -1 } })).concat([{ date: D(-3), data: { water: 1, steps: 100, sleep: 5, trained: false } }]);
  await H.seedClient(c, 'ana@c.co', 'Ana Martínez', code, { paidDays: 15, habits: true, measures: meas, habitDays: hab });
  await H.seedClient(c, 'juan@c.co', 'Juan Gómez', code, { paidDays: 15, habits: false, measures: meas.slice(0, 1), habitDays: hab });
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
  await c.locator('#tab-coach').click();
  await c.addStyleTag({ content: H.WIDE });
  const rows = c.locator('#coach-clients .cli-pay-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: 'Ana Martínez' })).toContainText('Hábitos de la semana: 39 %');   // 11 de 28
  await expect(rows.filter({ hasText: 'Juan Gómez' })).toContainText('No comparte sus hábitos');
  await H.layout(c);
  await rows.filter({ hasText: 'Ana Martínez' }).locator('.cli-main').click();
  await expect(c.locator('#coach-detail-title')).toHaveText('Ana Martínez');
  await expect(c.locator('#coach-detail-pay-line')).toHaveText('Pagó hasta el 5 nov · vence en 15 días');
  await expect(c.locator('#btn-detail-pay')).toHaveText('Pagó');
  const med = (await c.locator('#coach-detail-medidas tbody tr').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
  // Registros viejos (sin peso, abdomen ni cadera): exentos, quedan con «—»
  expect(med).toEqual(['Peso — — —', 'Cuello 34 33,5 −0,5', 'Brazo der. 29 28 −1', 'Brazo izq. 28,5 27,5 −1', 'Espalda 38 37 −1', 'Cintura 84 80 −4', 'Abdomen — — —', 'Cadera — — —', 'Muslo der. 58 56 −2', 'Muslo izq. 58 56,5 −1,5']);
  await expect(c.locator('#coach-detail-medidas td.dn').first()).toBeVisible();
  const hb = (await c.locator('#coach-detail-habits .habit').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
  expect(hb).toEqual(['Agua 3 de 7 días', 'Pasos 3 de 7 días', 'Durmió 7 h o más 3 de 7 días', 'Entrenó 2 de 7 días']);
  expect(await c.locator('#view-coach').innerText()).not.toMatch(/kcal|Constancia|Objetivo diario/);
  await H.layout(c); await H.tall(c, '#coach-detail-view'); await H.shot(c, 's11-coach-ficha.png', { fullPage: true });
  // Cambiar el cobro desde la ficha
  await c.locator('#btn-detail-pay').click();
  await c.getByRole('button', { name: 'Marcar que no pagó' }).click();
  await expect(c.locator('#coach-detail-pay-line')).toHaveText('Venció el 20 oct');
  await expect(c.locator('#btn-detail-pay')).toHaveText('No pagó');
  // Juan no comparte hábitos: aviso amable
  await c.getByRole('button', { name: '← Mis asesorados' }).click();
  await rows.filter({ hasText: 'Juan Gómez' }).locator('.cli-main').click();
  await expect(c.locator('#coach-detail-habits-line')).toContainText('Juan Gómez todavía no comparte sus hábitos');
  await expect(c.locator('#coach-detail-habits .habit')).toHaveCount(0);
  await expect(c.locator('#coach-detail-medidas tbody tr').nth(1)).toHaveText('Cuello3434—');
  await H.shot(c, 's11-coach-ficha-sin-habitos.png', { fullPage: true });
  expect(coach.errors).toEqual([]);
});
