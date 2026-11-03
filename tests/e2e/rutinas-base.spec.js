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
