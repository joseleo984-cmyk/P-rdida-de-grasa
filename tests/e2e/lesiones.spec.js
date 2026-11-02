// Lesiones y condiciones médicas (v1.20): el asesorado las registra con autorización contextual, el coach las ve con su seguimiento, se reclasifican a
// condición médica (modal literal) y, si la persona retira la autorización, el coach no ve nada. Servidor FALSO.
const { test, expect } = require('@playwright/test');
const H = require('./ux1-helpers');
const L = require('../../lesiones.js');

const backend = (p) => H.backend(p);

test('asesorado: registra una lesión (casilla de autorización, textos literales), cambia su estado y la pasa a condición médica; el coach la ve y anota seguimiento', async ({ browser }, testInfo) => {
  const { p, errors, code } = await H.clientApp(browser, testInfo);
  await p.locator('#tab-mas').click();
  await expect(p.locator('#row-lesiones')).toBeVisible();
  await p.locator('#row-lesiones').click();
  await expect(p.locator('#les-vacio')).toBeVisible();
  await p.locator('#les-add').click();
  // textos literales de la lesión; la autorización viene SIN marcar
  await expect(p.locator('#lesf-title')).toHaveText(L.TEXTS.lesion.title);
  await expect(p.locator('#lesf-body')).toHaveText(L.TEXTS.lesion.body);
  await expect(p.locator('#lesf-save')).toHaveText('Guardar lesión');
  await expect(p.locator('#lesf-micro')).toHaveText(L.TEXTS.microcopy);
  await expect(p.locator('#lesf-auth-text')).toHaveText(L.TEXTS.autorizacion);
  await expect(p.locator('#lesf-form input[name=auth]')).not.toBeChecked();
  await H.layout(p, '#les-form-dialog button, #les-form-dialog input');
  // al cambiar a condición médica cambia el texto
  await p.locator('#lesf-form input[value=condicion]').check();
  await expect(p.locator('#lesf-title')).toHaveText(L.TEXTS.condicion.title);
  await expect(p.locator('#lesf-save')).toHaveText('Guardar condición médica');
  await p.locator('#lesf-form input[value=lesion]').check();
  // sin casilla no guarda
  await p.locator('#lesf-form input[name=area]').fill('Rodilla derecha');
  await p.locator('#lesf-save').click();
  await expect(p.locator('#lesf-error')).toContainText('casilla de autorización');
  expect((await backend(p)).injuries).toEqual([]);
  await p.locator('#lesf-form input[name=auth]').check();
  await p.locator('#lesf-form textarea').fill('Dolor al bajar escaleras');
  await p.locator('#lesf-save').click();
  await expect(p.locator('#les-activas li')).toHaveCount(1);
  await expect(p.locator('#les-activas li').first()).toContainText('Rodilla derecha');
  let be = await backend(p);
  expect(be.injuries.length).toBe(1);
  expect(be.consentEvents.filter((e) => e.kind === 'injury').pop()).toMatchObject({ granted: true, version: '0.1-A12-lesion', textHash: H.sha(L.TEXTS.autorizacion) });
  expect([be.injuries[0].kind, be.injuries[0].version, be.injuries[0].textHash]).toEqual(['lesion', '0.1-L1', H.sha(L.fullText('lesion'))]);
  // la segunda vez ya no pide la casilla
  await p.locator('#les-add').click();
  await expect(p.locator('#lesf-auth-row')).toBeHidden();
  await p.locator('#lesf-cancel').click();
  // estado
  await p.locator('#les-activas select').selectOption('recuperacion');
  await expect.poll(async () => (await backend(p)).injuries[0].status).toBe('recuperacion');
  // el coach (otro teléfono) la ve y anota seguimiento
  const coach = await H.coachApp(browser, testInfo, []);
  await coach.p.evaluate((be) => { window.__pgFakeBackend.injuries = be.injuries; }, (await backend(p)));
  // reclasificar a condición médica (modal literal)
  await p.locator('#les-activas').getByRole('button', { name: 'Es una condición médica' }).click();
  await expect(p.locator('#lesc-title')).toHaveText(L.TEXTS.convertir.title);
  await expect(p.locator('#lesc-body')).toHaveText(L.TEXTS.convertir.body);
  await expect(p.locator('#lesc-yes')).toHaveText('Confirmar y actualizar');
  await expect(p.locator('#lesc-no')).toHaveText('Mantener como lesión');
  await p.locator('#lesc-no').click();
  expect((await backend(p)).injuries[0].kind).toBe('lesion');
  await p.locator('#les-activas').getByRole('button', { name: 'Es una condición médica' }).click();
  await p.locator('#lesc-yes').click();
  await expect(p.locator('#les-activas li').first()).toContainText('Condición médica');
  await expect(p.locator('#les-activas select')).toHaveCount(0);   // una condición no se «supera»
  be = await backend(p);
  expect([be.injuries[0].kind, be.injuries[0].status, be.injuries[0].version, be.injuries[0].textHash]).toEqual(['condicion', 'activa', '0.1-L3', H.sha(L.fullText('convertir'))]);
  expect(errors).toEqual([]);
});

test('coach: ve lo declarado en la ficha con su aviso, agrega seguimiento; si el asesorado retira la autorización no ve nada', async ({ browser }, testInfo) => {
  const { p, errors } = await H.coachApp(browser, testInfo, [{ email: 'ana@c.co', name: 'Ana Martínez', paidDays: 20, habitDays: [H.hab(-1), H.hab(0)] }]);
  // se siembra lo declarado por Ana directamente en el servidor falso (lo que registraría con su autorización)
  await p.evaluate(() => {
    const be = window.__pgFakeBackend;
    const ana = Object.values(be.users).find((u) => u.email === 'ana@c.co');
    const at = '2026-10-21T12:00:00.000Z', h = 'a'.repeat(64);
    be.consentEvents.push({ userId: ana.id, kind: 'injury', granted: true, version: '0.1-A12-lesion', textHash: h, clientAt: at, createdAt: at });
    be.injuries.push({ id: 'a1000000-0000-4000-8000-000000000001', clientId: ana.id, kind: 'lesion', area: 'Hombro izquierdo', description: 'Molestia al subir el brazo', status: 'activa', onset: null, version: '0.1-L1', textHash: h, convertedAt: null, createdAt: at, updatedAt: at, notes: [] },
      { id: 'a1000000-0000-4000-8000-000000000002', clientId: ana.id, kind: 'lesion', area: 'Tobillo', description: '', status: 'superada', onset: null, version: '0.1-L1', textHash: h, convertedAt: null, createdAt: at, updatedAt: at, notes: [] });
    be._persist();
  });
  await p.reload(); await H.ready(p);
  await p.locator('#tab-coach').click();
  await p.locator('#coach-clients .cli-main').first().click();
  await expect(p.locator('#fc-lesiones')).toBeVisible();
  await expect(p.locator('#fcl-list')).toContainText('Hombro izquierdo');
  await expect(p.locator('#fcl-list')).toContainText('Molestia al subir el brazo');
  await expect(p.locator('#fcl-list .les-hist summary')).toContainText('Antecedentes (1)');   // la superada va al historial
  await expect(p.locator('#fcl-note')).toHaveText('Aviso: este registro es un reporte del usuario; como coach no emites diagnósticos ni tratas lesiones.');
  await H.layout(p, '#fc-lesiones button, #fc-lesiones input');
  await p.getByLabel('Nota de seguimiento para Hombro izquierdo').fill('Evitar press por encima de la cabeza');
  await p.getByRole('button', { name: 'Agregar nota' }).first().click();
  await expect(p.locator('#fcl-list')).toContainText('Evitar press por encima de la cabeza');
  // retira la autorización → el coach no ve nada
  await p.evaluate(() => {
    const be = window.__pgFakeBackend;
    const ana = Object.values(be.users).find((u) => u.email === 'ana@c.co');
    const at = '2026-10-22T12:00:00.000Z';
    be.consentEvents.push({ userId: ana.id, kind: 'injury', granted: false, version: '0.1-A12-lesion', textHash: 'a'.repeat(64), clientAt: at, createdAt: at });
    be._persist();
  });
  await p.locator('#btn-coach-back').click();
  await p.locator('#coach-clients .cli-main').first().click();
  await expect(p.locator('#fc-lesiones')).toBeHidden();
  expect(errors).toEqual([]);
});
