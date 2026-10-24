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
// Medirme (UX Etapa 1): se cambia el día si hace falta, se abre «+ Más medidas» y se escribe cada valor; al guardar vuelve a Progreso.
const saveMed = async (p, date, vals, { wait = true } = {}) => {
  if (!(await p.locator('#view-medidas').isVisible())) { await p.locator('#tab-registro').click(); await p.locator('#btn-medirme').click(); }
  if (date !== D(0)) { if (await p.locator('#med-date-row').isHidden()) await p.locator('#btn-med-cambiar').click(); await p.locator('#form-medidas input[name=date]').fill(date); }
  if (await p.locator('#med-mas').count() && !(await p.locator('#med-mas').evaluate((d) => d.open))) await p.locator('#med-mas summary').click();
  for (const [k, v] of Object.entries(vals)) await p.locator(`#form-medidas input[name=${k}]`).fill(v);
  await p.getByRole('button', { name: 'Guardar medidas' }).click();
  if (wait) await expect(p.locator('#view-progreso')).toBeVisible();
};

test('medidas: solo lo que toca hoy es obligatorio, con coma decimal; gráfica por medida, cambios en lenguaje neutro y validación', async ({ browser }, testInfo) => {
  const { p, errors } = await clientApp(browser, testInfo);
  await p.locator('#tab-registro').click();
  await p.locator('#btn-medirme').click();
  await expect(p.locator('#medidas-title')).toBeAttached();
  await H.layout(p); await H.tall(p, '#view-medidas');
  // Hoy es miércoles: toca cintura y cadera (el peso, opcional sin báscula configurada)
  await p.getByRole('button', { name: 'Guardar medidas' }).click();
  await expect(p.locator('#medidas-error')).toHaveText('Hoy toca: faltan «Cintura» (cm) y «Cadera» (cm).');
  await saveMed(p, D(0), { neck: '99', waist: '84', hip: '101' }, { wait: false });
  await expect(p.locator('#medidas-error')).toContainText('Revisa «Cuello»: debe estar entre 15 y 80 cm');
  await p.locator('#form-medidas input[name=neck]').fill('');
  await saveMed(p, D(0), { waist: '', hip: '101' }, { wait: false });
  await expect(p.locator('#medidas-error')).toHaveText('Hoy toca: falta «Cintura» (cm).');
  await expect(p.locator('#form-medidas input[name=waist]')).toBeFocused();
  expect((await p.evaluate(() => JSON.parse(localStorage.getItem('perdida-grasa:v1')))).entries).toEqual([]);   // nada se guardó
  // Dos días de medidas, con coma decimal (el 1.º de octubre es jueves: solo toca cintura y cadera)
  await saveMed(p, D(-20), { weight: '70', neck: '34', armR: '29', armL: '28,5', back: '38', waist: '84', hip: '101', thighR: '58', thighL: '58' });
  await expect(p.locator('#toast')).toContainText('Medidas guardadas');
  await saveMed(p, D(0), { weight: '68,5', neck: '33,5', armR: '28', armL: '27,5', back: '37', waist: '80', hip: '99', thighR: '56', thighL: '56,5' });
  await expect(p.locator('#toast')).toContainText('Medidas guardadas');
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem('perdida-grasa:v1')));
  expect(st.schemaVersion).toBe(6);
  expect(st.entries.map((e) => [e.date, e.weight, e.waist, e.hip, e.neck, e.armL, e.thighL])).toEqual([[D(-20), 70, 84, 101, 34, 28.5, 58], [D(0), 68.5, 80, 99, 33.5, 27.5, 56.5]]);
  // Cambios en lenguaje neutro (sin verde): «4 cm menos»
  const rows = (await p.locator('#medidas-table dl > div').allInnerTexts()).map((r) => r.replace(/\s+/g, ' ').trim());
  expect(rows).toEqual(['Cuello 0,5 cm menos', 'Brazo der. 1 cm menos', 'Brazo izq. 1 cm menos', 'Espalda 1 cm menos', 'Cintura 4 cm menos', 'Cadera 2 cm menos', 'Muslo der. 2 cm menos', 'Muslo izq. 1,5 cm menos']);
  await expect(p.locator('#medidas-table .dn')).toHaveCount(0);
  // Gráfica por medida
  await p.locator('#medidas-pick button', { hasText: 'Cintura' }).click();
  await expect(p.locator('#medidas-pick button[aria-pressed=true]')).toHaveText('Cintura');
  await expect(p.locator('#medidas-chart svg')).toHaveAttribute('aria-label', 'Cintura: de 84 cm a 80 cm en 2 registros');
  await expect(p.locator('#medidas-chart svg path.line')).toHaveCount(1);
  await expect(p.locator('#medidas-chart svg circle')).toHaveCount(2);
  await expect(p.locator('#prog-big')).toHaveText('80 cm');
  await expect(p.locator('#prog-delta')).toHaveText('· 4 cm menos desde el 1 oct');
  await p.locator('#medidas-pick button', { hasText: 'Otra' }).click();
  await p.locator('#medidas-otra').selectOption('neck');
  await expect(p.locator('#medidas-chart svg')).toHaveAttribute('aria-label', /^Cuello: de 34 cm a 33,5 cm/);
  await p.locator('#medidas-pick button', { hasText: 'Peso' }).click();   // el peso va en kg, como tendencia de 7 días
  await expect(p.locator('#medidas-chart svg')).toHaveAttribute('aria-label', 'Peso: tendencia de 7 días, 1,5 kg menos entre el 1 oct y el 21 oct; 2 pesajes');
  await expect(p.locator('#prog-big')).toHaveText('68,5 kg');
  await H.layout(p); await H.shot(p, 's11-medidas-cliente.png', { fullPage: true });
  // Mismo día: se actualiza el registro y se suma lo que falta (lo que ese día ya tiene no se vuelve a exigir)
  await saveMed(p, D(0), { weight: '', hip: '', neck: '33' });
  await expect(p.locator('#toast')).toContainText('Medidas actualizadas');
  await expect(p.locator('#medidas-history li')).toHaveCount(2);
  // Llega al servidor (al día): el coach las verá
  await expect.poll(async () => Object.values((await H.backend(p)).records).filter((r) => r.kind === 'entry').length).toBe(2);
  const srv = Object.values((await H.backend(p)).records).find((r) => r.nkey === D(0));
  expect(srv.data).toMatchObject({ weight: 68.5, hip: 99, neck: 33, armR: 28, thighL: 56.5 });
  // Borrar un registro
  await p.locator('#medidas-history li').first().getByRole('button').click();
  await expect(p.locator('#medidas-history li')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('hábitos: agua en vasos, pasos, sueño y entrenó (de un toque en Inicio y, para otro día, en «Corregir otro día»); avance de la semana con barras', async ({ browser }, testInfo) => {
  const { p, errors } = await clientApp(browser, testInfo);
  await p.locator('[data-goto="habitos"]').click();
  await expect(p.locator('#view-habitos')).toBeVisible();
  await expect(p.locator('#tab-panel')).toHaveAttribute('aria-current', 'page');   // Hábitos vive en Inicio
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
    await expect(p.locator('#toast')).toContainText('Listo, día registrado.');
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
  // Inicio («Mi día») muestra los de hoy; el esfuerzo y el cierre del día que ya había se conservan al corregir el día
  await p.locator('#tab-panel').click();
  await expect(p.locator('#dia-agua-t')).toHaveText('Agua 5 / 8');
  await expect(p.locator('#dia-sueno-t')).toHaveText('Sueño 7–8 h');
  await expect(p.locator('#dia-pasos button', { hasText: '4–8 mil' })).toHaveAttribute('aria-pressed', 'true');
  await expect(p.locator('#dia-entrene')).toHaveAttribute('aria-pressed', 'true');
  expect(await p.locator('#view-panel').innerText()).not.toMatch(/Hoy llevas|kcal/i);
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
  await expect(rows.filter({ hasText: 'Ana Martínez' })).toContainText('Al día');   // 4 de 7 días con registro y aún sin pesajes: no es motivo para revisar
  await expect(rows.filter({ hasText: 'Ana Martínez' })).not.toContainText('No comparte sus hábitos');
  await expect(rows.filter({ hasText: 'Juan Gómez' })).toContainText('No comparte sus hábitos');
  await H.layout(c);
  await rows.filter({ hasText: 'Ana Martínez' }).locator('.cli-main').click();
  await expect(c.locator('#coach-detail-title')).toHaveText('Ana Martínez');
  await expect(c.locator('#coach-detail-pay-line')).toHaveText('Pagó hasta el 5 nov · vence en 15 días');
  await expect(c.locator('#btn-detail-pay')).toHaveText('Pagó');
  const med = (await c.locator('#coach-detail-medidas tbody tr').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
  // Registros viejos (sin peso, abdomen ni cadera): exentos, quedan con «—»
  expect(med).toEqual(['Peso — — —', 'Cuello 34 33,5 −0,5', 'Brazo der. 29 28 −1', 'Brazo izq. 28,5 27,5 −1', 'Espalda 38 37 −1', 'Cintura 84 80 −4', 'Abdomen — — —', 'Cadera — — —', 'Muslo der. 58 56 −2', 'Muslo izq. 58 56,5 −1,5']);
  await expect(c.locator('#coach-detail-medidas td.dn')).toHaveCount(0);   // sin verde de «bueno»: los cambios son neutros
  const hb = (await c.locator('#coach-detail-habits .habit').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
  expect(hb).toEqual(['Agua 3 de 7 días', 'Pasos 3 de 7 días', 'Durmió 7 h o más 3 de 7 días', 'Entrenó 2 de 7 días']);
  expect(await c.locator('#view-coach').innerText()).not.toMatch(/kcal|Objetivo diario/);
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
