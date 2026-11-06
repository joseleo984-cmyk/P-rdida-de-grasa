// v1.24: calendario de clases. El coach programa el mes desde la ficha; el asesorado solo ve la clase de HOY. Servidor FALSO.
const { test, expect } = require('@playwright/test');
const H = require('./ux1-helpers');
const B = require('../../rutinas-base.js');

test('coach: programa «todos los lunes» y días sueltos con una clase, ve lo programado y lo quita', async ({ browser }, testInfo) => {
  const { p, errors } = await H.coachApp(browser, testInfo, [{ email: 'ana@c.co', name: 'Ana Martínez', paidDays: 20, habitDays: [H.hab(-1)] }]);
  await p.evaluate(async (s) => { await PGAccount.remote.coach.saveTemplate(null, s); }, B.STARTERS[3]);   // «Pierna y glúteo – 2 días»
  await p.locator('#tab-coach').click();
  await p.locator('#coach-clients .cli-main').first().click();
  await expect(p.locator('#fc-cal')).toBeVisible();
  await expect(p.locator('#cal-month')).toContainText('de 20');
  await expect(p.locator('#cal-set')).toBeDisabled();
  await H.layout(p, '#fc-cal button, #fc-cal select');
  await p.locator('#cal-wd button').first().click();                         // todos los lunes (los que se pueden programar)
  const picked = await p.locator('#cal-grid .cal-day[aria-pressed="true"]').count();
  expect(picked).toBeGreaterThan(0);
  await p.locator('#cal-set').click();
  await expect(p.locator('#cal-msg')).toContainText('Programaste «Pierna y glúteo – 2 días»');
  let be = await H.backend(p);
  expect(Object.keys(be.classSchedule).length).toBe(picked);
  await expect(p.locator('#cal-grid .cal-t').first()).toBeVisible();
  // quitar un día
  await p.locator('#cal-grid .cal-day', { has: p.locator('.cal-t') }).first().click();
  await p.locator('#cal-clear').click();
  await expect(p.locator('#cal-msg')).toContainText('Quitaste la clase de 1 día');
  be = await H.backend(p);
  expect(Object.keys(be.classSchedule).length).toBe(picked - 1);
  // el mes siguiente carga vacío y se puede navegar
  await p.locator('#cal-next').click();
  await expect(p.locator('#cal-grid .cal-t')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('asesorado: solo ve la clase programada para HOY (no las de otros días)', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo);
  await p.evaluate(() => {
    const be = window.__pgFakeBackend, ana = Object.values(be.users).find((u) => u.email === 'ana@c.co'), l = be.links.find((x) => x.clientId === ana.id);
    const day = (n) => new Date(Date.now() - 5 * 3600000 + n * 86400000).toISOString().slice(0, 10);
    const mk = (n, title, ex) => ({ coachId: l.coachId, clientId: ana.id, day: day(n), templateId: null, title, days: [{ title: 'Día 1 – ' + title, exercises: [{ name: ex, sets: '3×10', note: '', gif: '' }] }], createdAt: new Date().toISOString() });
    for (const s of [mk(0, 'Clase de hoy', 'Sentadilla'), mk(1, 'Clase de mañana', 'Remo')]) be.classSchedule[`${s.coachId}|${s.clientId}|${s.day}`] = s;
    be._persist();
  });
  await p.reload(); await H.ready(p);
  await p.locator('#tab-entrenar').click();
  await expect(p.locator('#view-rutina')).toContainText('Clase de hoy');
  await expect(p.locator('#view-rutina')).toContainText('Sentadilla');
  await expect(p.locator('#view-rutina')).not.toContainText('Clase de mañana');
  await expect(p.locator('#view-rutina')).not.toContainText('Remo');
  expect(errors).toEqual([]);
});

test('coach: «Repetir las 4 semanas anteriores» copia al mes que se ve y avisa cuando no hay nada que repetir', async ({ browser }, testInfo) => {
  const { p, errors } = await H.coachApp(browser, testInfo, [{ email: 'ana@c.co', name: 'Ana Martínez', paidDays: 20, habitDays: [H.hab(-1)] }]);
  await p.evaluate(async (s) => { await PGAccount.remote.coach.saveTemplate(null, s); }, B.STARTERS[3]);
  await p.locator('#tab-coach').click();
  await p.locator('#coach-clients .cli-main').first().click();
  await expect(p.locator('#fc-cal')).toBeVisible();
  await H.layout(p, '#fc-cal button, #fc-cal select');
  await p.locator('#cal-repeat').click();
  await expect(p.locator('#cal-msg')).toContainText('No hay clases en las 4 semanas anteriores');
  // programa todos los lunes de este mes, pasa al mes siguiente y repite: llegan las clases de 28 días antes
  await p.locator('#cal-wd button').first().click();
  await p.locator('#cal-set').click();
  await expect(p.locator('#cal-msg')).toContainText('Programaste');
  const before = Object.keys((await H.backend(p)).classSchedule).length;
  await p.locator('#cal-next').click();
  await expect(p.locator('#cal-grid .cal-t')).toHaveCount(0);
  await p.locator('#cal-repeat').click();
  await expect(p.locator('#cal-msg')).toContainText('repetiste las clases de las 4 semanas anteriores');
  expect(Object.keys((await H.backend(p)).classSchedule).length).toBeGreaterThan(before);
  await expect(p.locator('#cal-grid .cal-t').first()).toBeVisible();
  expect(errors).toEqual([]);
});
