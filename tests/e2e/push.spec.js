// Avisos push (v1.19): consentimiento «justo a tiempo» con el texto literal, permiso del teléfono, interruptores y apagar. Entorno del navegador SIMULADO
// (window.__pgPushEnv) y servidor FALSO: el envío real se prueba en un iPhone con la app instalada.
const { test, expect } = require('@playwright/test');
const H = require('./ux1-helpers');

const TITLE = 'Avisos de tu coach y recordatorios';
const BODY = 'Activa las notificaciones para saber cuándo tu coach te escribe o actualiza tu rutina, y recibir tus recordatorios diarios. No enviamos datos de salud ni fotos. Puedes apagarlas cuando quieras. Consulta nuestra Política de Datos.';
const fakeEnv = (perm = 'granted', needsInstall = false) => ({ perm, needsInstall });
async function setEnv(p, { perm, needsInstall }) {
  await p.evaluate(({ perm, needsInstall }) => {
    const e = { perm: 'default', want: perm, unsubscribed: 0 };
    e.supported = () => true;
    e.needsInstall = () => needsInstall;
    e.permission = () => e.perm;
    e.request = async () => { e.perm = e.want; return e.want; };
    e.subscribe = async (key) => { window.__pushKey = key; return { endpoint: 'https://push.example/' + 'x'.repeat(30), p256dh: 'p'.repeat(40), auth: 'a'.repeat(20) }; };
    e.unsubscribe = async () => { e.unsubscribed++; return 'https://push.example/' + 'x'.repeat(30); };
    window.__pgPushEnv = e;
  }, { perm, needsInstall });
}
const open = async (p) => { await p.locator('#tab-mas').click(); await p.locator('#row-avisos').click(); await expect(p.locator('#push-dialog')).toBeVisible(); };
const pushState = (p) => H.backend(p).then((be) => ({ ev: be.consentEvents.filter((e) => e.kind === 'push'), dev: be.pushDevices, prefs: be.pushPrefs }));

test('avisos: el texto del abogado sale solo al activar, «Ahora no» no guarda nada y «Continuar y permitir» registra consentimiento, pide permiso y guarda el dispositivo', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo);
  await setEnv(p, fakeEnv('granted'));
  await p.locator('#tab-mas').click();
  await expect(p.locator('#row-avisos')).toBeVisible();
  await p.locator('#row-avisos').click();
  await expect(p.locator('#push-title')).toHaveText(TITLE);
  await expect(p.locator('#push-body')).toHaveText(BODY);
  await expect(p.locator('#push-body a')).toHaveText('Política de Datos');   // capa 2: la Política completa
  await expect(p.locator('#push-body a')).toHaveAttribute('href', 'legal/privacidad.html');
  await expect(p.locator('.push-note').first()).toContainText('El nombre de la app siempre se mostrará en las alertas de tu teléfono');
  await expect(p.locator('#push-yes')).toHaveText('Activar notificaciones');
  await expect(p.locator('#push-no')).toHaveText('Ahora no');
  await H.layout(p, '#push-dialog button');
  // «Ahora no»: nada guardado ni diálogo del teléfono
  await p.locator('#push-no').click();
  await expect(p.locator('#push-dialog')).toBeHidden();
  let s = await pushState(p);
  expect(s.ev).toEqual([]);
  expect(Object.values(s.dev).flat()).toEqual([]);
  expect(await p.evaluate(() => window.__pgPushEnv.perm)).toBe('default');
  // «Continuar y permitir»
  await p.locator('#row-avisos').click();
  await p.locator('#push-yes').click();
  await expect(p.locator('#push-on')).toBeVisible();
  s = await pushState(p);
  expect(s.ev.length).toBe(1);
  expect([s.ev[0].granted, s.ev[0].version, s.ev[0].textHash]).toEqual([true, '0.2-A11-push', H.sha([TITLE, BODY].join('\n'))]);
  expect(Object.values(s.dev).flat().length).toBe(1);
  expect(await p.evaluate(() => window.__pushKey)).toMatch(/^BFAKE/);
  // interruptores
  await expect(p.locator('#push-coach')).toBeChecked();
  await p.locator('#push-coach').uncheck();
  await expect.poll(async () => Object.values((await pushState(p)).prefs)[0]).toEqual({ coachMsgs: false, routines: true, alerts: true, reminder: false, reminderAt: '20:00' });
  // recordatorio diario: apagado de entrada; al activarlo aparece la hora y se guarda
  await expect(p.locator('#push-reminder')).not.toBeChecked();
  await expect(p.locator('#push-time-row')).toBeHidden();
  await p.locator('#push-reminder').check();
  await expect(p.locator('#push-time-row')).toBeVisible();
  await p.locator('#push-hour').selectOption('07');
  await p.locator('#push-min').selectOption('30');
  expect(await p.locator('#push-hour option').count()).toBe(24);   // salen TODAS las horas
  await expect.poll(async () => Object.values((await pushState(p)).prefs)[0]).toEqual({ coachMsgs: false, routines: true, alerts: true, reminder: true, reminderAt: '07:30' });
  // desactivar: se borra el dispositivo y el consentimiento queda en «no»
  await p.locator('#push-off').click();
  await expect(p.locator('#push-consent')).toBeVisible();
  s = await pushState(p);
  expect(Object.values(s.dev).flat()).toEqual([]);
  expect(s.ev[s.ev.length - 1].granted).toBe(false);
  expect(await p.evaluate(() => window.__pgPushEnv.unsubscribed)).toBe(1);
  expect(errors).toEqual([]);
});

test('avisos: si el teléfono NO permite, queda todo desactivado y sin dispositivo guardado', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo);
  await setEnv(p, fakeEnv('denied'));
  await open(p);
  await p.locator('#push-yes').click();
  await expect(p.locator('#push-msg')).toContainText('no permitió los avisos');
  await expect(p.locator('#push-consent')).toBeVisible();
  const s = await pushState(p);
  expect(Object.values(s.dev).flat()).toEqual([]);
  expect(s.ev[s.ev.length - 1].granted).toBe(false);
  expect(errors).toEqual([]);
});

test('avisos: en iPhone sin instalar la app se explica cómo instalarla y no se pide nada; el coach ve solo su interruptor', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo);
  await setEnv(p, fakeEnv('granted', true));
  await open(p);
  await expect(p.locator('#push-unsupported')).toBeVisible();
  await expect(p.locator('#push-unsupported')).toContainText('instala la app en la pantalla de inicio');
  await expect(p.locator('#push-consent')).toBeHidden();
  expect((await pushState(p)).ev).toEqual([]);
  await p.locator('#push-unsupported [data-push-close]').click();
  // El coach también tiene la fila, pero con su propio interruptor: solo «Avisos de asesorados»
  const c = await H.coachApp(browser, testInfo, []);
  await setEnv(c.p, fakeEnv('granted'));
  await c.p.locator('#tab-mas').click();
  await expect(c.p.locator('#row-avisos')).toBeVisible();
  await c.p.locator('#row-avisos').click();
  await c.p.locator('#push-yes').click();
  await expect(c.p.locator('#push-on')).toBeVisible();
  await expect(c.p.locator('#push-alerts')).toBeVisible();
  await expect(c.p.locator('#push-coach')).toBeHidden();
  await expect(c.p.locator('#push-routines')).toBeHidden();
  expect(errors).toEqual([]);
});
