// v1.21: dolor por ejercicio (consentimiento contextual), lista «a evitar», advertencias al asignar y Acuerdo del Coach 0.9. Servidor FALSO.
const { test, expect } = require('@playwright/test');
const H = require('./ux1-helpers');
const L = require('../../lesiones.js');

const backend = (p) => H.backend(p);

test('asesorado: «Reportar molestia o dolor» pide la autorización la primera vez (modal literal) y después reporta directo; el coach no recibe nada sin autorización', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo);
  await p.evaluate(() => { document.querySelector('#paso-name').textContent = 'Sentadilla búlgara'; document.querySelector('#paso-pain').click(); });
  await expect(p.locator('#pain-dialog')).toBeVisible();
  await expect(p.locator('#pain-title')).toHaveText(L.TEXTS.dolor.title);
  await expect(p.locator('#pain-body')).toHaveText(L.TEXTS.dolor.body);
  await expect(p.locator('#pain-yes')).toHaveText('Confirmar reporte');
  await expect(p.locator('#pain-no')).toHaveText('Cancelar');
  await H.layout(p, '#pain-dialog button');
  await p.locator('#pain-no').click();
  let be = await backend(p);
  expect(be.exercisePain).toEqual([]);
  expect(be.consentEvents.filter((e) => e.kind === 'pain_report')).toEqual([]);
  await p.evaluate(() => document.querySelector('#paso-pain').click());
  await p.locator('#pain-yes').click();
  await expect(p.locator('#pain-dialog')).toBeHidden();
  be = await backend(p);
  expect(be.exercisePain.length).toBe(1);
  expect([be.exercisePain[0].name, be.exercisePain[0].version, be.exercisePain[0].textHash]).toEqual(['Sentadilla búlgara', '0.1-D1', H.sha(L.fullText('dolor'))]);
  expect(be.consentEvents.filter((e) => e.kind === 'pain_report').pop()).toMatchObject({ granted: true, version: '0.1-A13-dolor', textHash: H.sha(L.fullText('dolor')) });
  // la segunda vez ya no pregunta
  await p.evaluate(() => { document.querySelector('#paso-name').textContent = 'Remo'; document.querySelector('#paso-pain').click(); });
  await expect(p.locator('#paso-pain-status')).toHaveText('Anotado. Tu coach podrá verlo.');
  await expect(p.locator('#pain-dialog')).toBeHidden();
  expect((await backend(p)).exercisePain.length).toBe(2);
  expect(errors).toEqual([]);
});

test('coach: lista «a evitar» e historial de dolor en la ficha; al asignar un ejercicio con restricción o dolor sale la advertencia literal', async ({ browser }, testInfo) => {
  const { p, errors } = await H.coachApp(browser, testInfo, [{ email: 'ana@c.co', name: 'Ana Martínez', paidDays: 20, habitDays: [H.hab(-1), H.hab(0)] }]);
  await p.evaluate(() => {
    const be = window.__pgFakeBackend, ana = Object.values(be.users).find((u) => u.email === 'ana@c.co'), at = '2026-10-21T12:00:00.000Z', h = 'a'.repeat(64);
    const coach = Object.values(be.users).find((u) => u.email === 'laura@coach.co');
    be.consentEvents.filter((x) => x.userId === coach.id && x.kind === 'coach_agreement').forEach((x) => { x.version = '0.9-A7-coach'; });   // el servidor ya tiene el Acuerdo 0.9
    be.consentEvents.push({ userId: ana.id, kind: 'pain_report', granted: true, version: '0.1-A13-dolor', textHash: h, clientAt: at, createdAt: at });
    be.exercisePain.push({ clientId: ana.id, key: 'sentadilla bulgara', name: 'Sentadilla búlgara', day: '2026-10-20', version: '0.1-D1', textHash: h });
    be._persist();
  });
  await p.reload(); await H.ready(p);
  await p.locator('#tab-coach').click();
  await p.locator('#coach-clients .cli-main').first().click();
  await expect(p.locator('#fc-restr')).toBeVisible();
  await expect(p.locator('#fcr-body')).toContainText('Sentadilla búlgara · 20/10/2026');
  await H.layout(p, '#fc-restr button, #fc-restr input');
  await p.getByLabel('Ejercicio a evitar').fill('Peso muerto');
  await p.locator('#fc-restr').getByRole('button', { name: 'Agregar a evitar' }).first().click();
  await expect(p.locator('#fcr-body')).toContainText('Peso muerto');
  // advertencia al asignar (restricción + dolor), literal; «Cancelar» no sigue
  const ids = await p.evaluate(() => { const be = window.__pgFakeBackend; return Object.values(be.users).find((u) => u.email === 'ana@c.co').id; });
  const run = (autoClick) => p.evaluate(async ({ id, autoClick }) => {
    const rutina = { days: [{ exercises: [{ name: 'Sentadilla Búlgara' }, { name: 'peso  MUERTO' }, { name: 'Remo' }] }] };
    const prom = RestrView.confirmAssign([{ id, name: 'Ana Martínez' }], rutina);
    await new Promise((r) => setTimeout(r, 200));
    const txt = document.querySelector('#rest-warn-list').innerText;
    document.querySelector(autoClick).click();
    return { txt, proceed: await prom };
  }, { id: ids, autoClick });
  let r = await run('#rest-warn-no');
  expect(r.proceed).toBe(false);
  expect(r.txt).toContain('⚠️ Historial de molestia: Este asesorado reportó dolor en este ejercicio el 20/10/2026. Verifica su evolución o evalúa ejercicios alternativos. Aviso: este registro es un reporte del usuario; como coach no emites diagnósticos ni tratas lesiones.');
  expect(r.txt).toContain('⚠️ Ejercicio restringido: Marcaste este ejercicio como «a evitar» para este asesorado. ¿Confirmas que deseas asignarlo de todas formas?');
  expect(r.txt).not.toContain('Remo');
  r = await run('#rest-warn-yes');
  expect(r.proceed).toBe(true);
  // sin conflicto no molesta
  const quiet = await p.evaluate(async (id) => RestrView.confirmAssign([{ id, name: 'Ana' }], { days: [{ exercises: [{ name: 'Remo' }] }] }), ids);
  expect(quiet).toBe(true);
  expect(errors).toEqual([]);
});

test('coach con el Acuerdo 0.8: al programar se le pide aceptar el Acuerdo actualizado (cláusula 17) antes de ver listas y avisos', async ({ browser }, testInfo) => {
  const { p, errors } = await H.coachApp(browser, testInfo, [{ email: 'ana@c.co', name: 'Ana Martínez', paidDays: 20, habitDays: [H.hab(-1)] }]);
  // vuelve al Acuerdo 0.8 (sin la cláusula de listas de exclusión)
  await p.evaluate(() => {
    const be = window.__pgFakeBackend, coach = Object.values(be.users).find((u) => u.email === 'laura@coach.co');
    const e = be.consentEvents.filter((x) => x.userId === coach.id && x.kind === 'coach_agreement').pop(); e.version = '0.8-A7-coach';
    const m = JSON.parse(localStorage.getItem('perdida-grasa:account')); m.consents.coach_agreement.version = '0.8-A7-coach'; localStorage.setItem('perdida-grasa:account', JSON.stringify(m));
    be._persist();
  });
  await p.reload(); await H.ready(p);
  await p.locator('#tab-coach').click();
  await p.locator('#coach-clients .cli-main').first().click();
  await expect(p.locator('#fcr-body')).toContainText('acepta el Acuerdo del Coach actualizado');
  const ids = await p.evaluate(() => Object.values(window.__pgFakeBackend.users).find((u) => u.email === 'ana@c.co').id);
  const prom = p.evaluate(async (id) => RestrView.confirmAssign([{ id, name: 'Ana' }], { days: [{ exercises: [{ name: 'Remo' }] }] }), ids);
  await expect(p.locator('#rest-agree-dialog')).toBeVisible();
  await expect(p.locator('#rest-agree-clause')).toHaveText(L.TEXTS.clausulaExclusion);
  await H.layout(p, '#rest-agree-dialog button, #rest-agree-dialog input');
  await p.locator('#rest-agree-ok').click();
  await expect(p.locator('#rest-agree-err')).toHaveText('Marca la casilla para continuar.');
  await p.locator('#rest-agree-box').check();
  await p.locator('#rest-agree-ok').click();
  expect(await prom).toBe(true);
  const be = await backend(p);
  expect(be.consentEvents.filter((e) => e.kind === 'coach_agreement').pop().version).toBe('1.0-A7-coach');
  expect(errors).toEqual([]);
});
