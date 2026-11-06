// Rutinas de ejemplo (con series y repeticiones de referencia) y sugerencias de ejercicios para el coach (editables). Servidor FALSO.
const { test, expect } = require('@playwright/test');
const H = require('./ux1-helpers');
const B = require('../../rutinas-base.js');

test('coach: carga las rutinas de ejemplo (series y repeticiones de referencia), no se duplican y se pueden editar; el nombre del ejercicio sugiere el catálogo', async ({ browser }, testInfo) => {
  const { p, errors } = await H.coachApp(browser, testInfo, [{ email: 'ana@c.co', name: 'Ana Martínez', paidDays: 20, habitDays: [H.hab(-1)] }]);
  await p.locator('#tab-rutinas').click();
  await expect(p.locator('#rl-status')).toContainText('Todavía no tienes rutinas');
  await expect(p.locator('#btn-rl-starters')).toHaveText('Cargar rutinas de ejemplo');
  await H.layout(p, '#view-rutinas button');
  await p.locator('#btn-rl-starters').click();
  await expect(p.locator('#rl-list .rl-item')).toHaveCount(B.STARTERS.length);
  const be = await H.backend(p);
  const saved = be.templates || {};
  expect(JSON.stringify(saved)).toContain('3×8-10');
  expect(JSON.stringify(saved)).not.toMatch(/Por definir/);
  // una segunda vez no duplica
  await p.locator('#btn-rl-starters').click();
  await expect(p.locator('.toast, #toast').first()).toContainText('Ya tienes las rutinas de ejemplo');
  await expect(p.locator('#rl-list .rl-item')).toHaveCount(B.STARTERS.length);
  // editar: el campo del nombre sugiere el catálogo
  await p.locator('#rl-list .rl-item').first().getByRole('button', { name: /Editar/ }).click();
  const name = p.locator('#redit-days input[data-f="name"]').first();
  await expect(name).toHaveAttribute('list', 'rut-exercise-names');
  expect(await p.locator('#rut-exercise-names option').count()).toBe(B.names().length);
  expect(errors).toEqual([]);
});

test('asesorado: un ejercicio de la lista sin animación del coach muestra dos fotos de referencia al abrirlo; uno fuera de la lista, el aviso', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo);
  await p.evaluate(async () => {
    const be = window.__pgFakeBackend;
    const m = {}; const mem = { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
    const r = RemoteFake.createFake({ backend: be, storage: mem });
    await r.auth.sendCode('laura@coach.co');
    await r.auth.verifyCode('laura@coach.co', be.lastCode('laura@coach.co'));
    const ana = Object.values(be.users).find((u) => u.email === 'ana@c.co').id;
    await r.coach.saveRoutine(ana, { title: 'Prueba fotos', days: [{ title: 'Día 1', exercises: [{ name: 'Flexiones de brazos', sets: '3×10-12', note: '', gif: '' }, { name: 'Ejercicio raro', sets: '3×10', note: '', gif: '' }] }] });
  });
  await p.locator('#tab-entrenar').click();
  await expect(p.locator('#rutina-body .rut-title')).toHaveText('Prueba fotos');
  await expect(p.locator('#rutina-body img')).toHaveCount(0);   // cerradas: no se carga nada
  const fl = p.locator('#rutina-body .rut-ex', { hasText: 'Flexiones' });
  await fl.locator('summary').click();
  await expect(fl.locator('img')).toHaveCount(2);
  await expect(fl.locator('img').first()).toHaveAttribute('src', /^ejercicios\/pushups-0\.jpg$/);
  await fl.locator('summary').click();
  await expect(fl.locator('img')).toHaveCount(0);
  const raro = p.locator('#rutina-body .rut-ex', { hasText: 'Ejercicio raro' });
  await raro.locator('summary').click();
  await expect(raro).toContainText('Tu coach todavía no agregó una demostración');
  await expect(raro.locator('img')).toHaveCount(0);
  expect(errors).toEqual([]);
});
