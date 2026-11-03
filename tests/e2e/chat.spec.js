// v1.22: chat asesorado ⇄ coach. Aviso previo LITERAL la primera vez, mensajes en los dos sentidos, sin leer, Acuerdo 1.0 del coach (cláusula 18). Servidor FALSO.
const { test, expect } = require('@playwright/test');
const H = require('./ux1-helpers');
const Ch = require('../../chat.js');

const backend = (p) => H.backend(p);

test('asesorado: el aviso literal sale solo la primera vez, escribe a su coach y ve la respuesta; el aviso al coach es neutro', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo);
  await p.locator('#tab-mas').click();
  await expect(p.locator('#row-chat')).toBeVisible();
  await p.locator('#row-chat').click();
  await expect(p.locator('#chat-aviso-dialog')).toBeVisible();
  await expect(p.locator('#chat-aviso-title')).toHaveText(Ch.TEXTS.aviso.title);
  await expect(p.locator('#chat-aviso-body')).toHaveText(Ch.TEXTS.aviso.body);
  await expect(p.locator('#chat-aviso-ok')).toHaveText('Entendido');
  await H.layout(p, '#chat-aviso-dialog button');
  await p.locator('#chat-aviso-ok').click();
  await expect(p.locator('#chat-dialog')).toBeVisible();
  await expect(p.locator('#chat-empty')).toBeVisible();
  await H.layout(p, '#chat-dialog button, #chat-dialog textarea');
  await p.locator('#chat-input').fill('Hola coach, hoy entrené piernas');
  await expect(p.locator('#chat-count')).toHaveText('31/1000');
  await p.locator('#chat-send').click();
  await expect(p.locator('#chat-list .chat-mine')).toContainText('Hola coach, hoy entrené piernas');
  let be = await backend(p);
  expect(be.chatMessages.length).toBe(1);
  expect(be.chatMessages[0]).toMatchObject({ sender: 'client', body: 'Hola coach, hoy entrené piernas' });
  // el coach responde (servidor) y el asesorado lo ve sin recargar
  await p.evaluate(() => {
    const be = window.__pgFakeBackend, m = be.chatMessages[0];
    be.chatMessages.push({ id: '00000000-0000-4000-8000-000000000777', clientId: m.clientId, coachId: m.coachId, sender: 'coach', body: 'Muy bien, sigue así', createdAt: be._serverStamp(), readAt: null });
    be._persist();
  });
  await expect(p.locator('#chat-list .chat-theirs')).toContainText('Muy bien, sigue así', { timeout: 15000 });
  await expect.poll(async () => (await backend(p)).chatMessages.find((m) => m.sender === 'coach').readAt).not.toBeNull();
  // sin contenido en ningún aviso
  expect(JSON.stringify((await backend(p)).pushOutbox)).not.toMatch(/Hola coach|sigue así/);
  // cerrar y volver a abrir: ya no repite el aviso
  await p.locator('#chat-dialog [data-chat-close]').click();
  await p.locator('#row-chat').click();
  await expect(p.locator('#chat-aviso-dialog')).toBeHidden();
  await expect(p.locator('#chat-dialog')).toBeVisible();
  // límites
  await p.locator('#chat-input').fill('a'.repeat(1000));
  expect(await p.locator('#chat-input').inputValue()).toHaveLength(1000);
  expect(errors).toEqual([]);
});

test('coach: ve los sin leer, debe aceptar el Acuerdo 1.0 (cláusula 18 literal) antes de leer o responder, y contesta', async ({ browser }, testInfo) => {
  const { p, errors } = await H.coachApp(browser, testInfo, [{ email: 'ana@c.co', name: 'Ana Martínez', paidDays: 20, habitDays: [H.hab(-1)] }]);
  await p.evaluate(() => {
    const be = window.__pgFakeBackend, ana = Object.values(be.users).find((u) => u.email === 'ana@c.co'), coach = Object.values(be.users).find((u) => u.email === 'laura@coach.co');
    // el coach tiene el Acuerdo 0.9 (sin la cláusula 18), también en el teléfono
    be.consentEvents.filter((x) => x.userId === coach.id && x.kind === 'coach_agreement').forEach((x) => { x.version = '0.9-A7-coach'; });
    const m = JSON.parse(localStorage.getItem('perdida-grasa:account')); m.consents.coach_agreement.version = '0.9-A7-coach'; localStorage.setItem('perdida-grasa:account', JSON.stringify(m));
    be.chatMessages.push({ id: '00000000-0000-4000-8000-000000000555', clientId: ana.id, coachId: coach.id, sender: 'client', body: '¿Puedo cambiar el día de piernas?', createdAt: be._serverStamp(), readAt: null });
    be._persist();
  });
  await p.reload(); await H.ready(p);
  await p.locator('#tab-coach').click();
  await p.locator('#coach-clients .cli-main').first().click();
  await expect(p.locator('#fc-chat')).toBeVisible();
  await expect(p.locator('#fcc-n')).toHaveText('1 sin leer');
  await p.locator('#fcc-open').click();
  await expect(p.locator('#rest-agree-dialog')).toBeVisible();
  await expect(p.locator('#rest-agree-clause')).toHaveText(Ch.TEXTS.clausula);
  await H.layout(p, '#rest-agree-dialog button, #rest-agree-dialog input');
  // sin aceptar no se lee nada
  await p.locator('#rest-agree-no').click();
  await expect(p.locator('#chat-dialog')).toBeHidden();
  await p.locator('#fcc-open').click();
  await p.locator('#rest-agree-box').check();
  await p.locator('#rest-agree-ok').click();
  await expect(p.locator('#chat-dialog')).toBeVisible();
  await expect(p.locator('#chat-title')).toHaveText('Chat con Ana Martínez');
  await expect(p.locator('#chat-list .chat-theirs')).toContainText('¿Puedo cambiar el día de piernas?');
  const be0 = await backend(p);
  expect(be0.consentEvents.filter((e) => e.kind === 'coach_agreement').pop().version).toBe('1.0-A7-coach');
  await p.locator('#chat-input').fill('Sí, pásalo al jueves');
  await p.locator('#chat-send').click();
  await expect(p.locator('#chat-list .chat-mine')).toContainText('Sí, pásalo al jueves');
  const be = await backend(p);
  expect(be.chatMessages.map((m) => m.sender)).toEqual(['client', 'coach']);
  expect(be.chatMessages[0].readAt).not.toBeNull();
  expect(errors).toEqual([]);
});

test('el coach pierde el chat al desvincularse el asesorado', async ({ browser }, testInfo) => {
  const { p } = await H.coachApp(browser, testInfo, [{ email: 'ana@c.co', name: 'Ana Martínez', paidDays: 20, habitDays: [H.hab(-1)] }]);
  const r = await p.evaluate(async () => {
    const be = window.__pgFakeBackend, ana = Object.values(be.users).find((u) => u.email === 'ana@c.co');
    be.links.forEach((l) => { l.status = 'ended'; });
    try { await PGAccount.remote.chat.list(ana.id); return 'visible'; } catch (e) { return e.code; }
  });
  expect(r).toBe('forbidden');
});

test('al reportar dolor aparece «Escribirle a mi coach» y abre el chat directo (con el aviso la primera vez)', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo);
  await p.evaluate(() => { document.querySelector('#paso-name').textContent = 'Remo'; document.querySelector('#paso-pain').click(); });
  await p.locator('#pain-yes').click();
  await expect(p.locator('#paso-pain-status')).toHaveText('Anotado. Tu coach podrá verlo.');
  expect(await p.evaluate(() => document.querySelector('#paso-pain-chat').classList.contains('hidden'))).toBe(false);   // el paso a paso no está abierto en la prueba: se toca por código
  await p.evaluate(() => document.querySelector('#paso-pain-chat').click());
  await expect(p.locator('#chat-aviso-dialog')).toBeVisible();
  await p.locator('#chat-aviso-ok').click();
  await expect(p.locator('#chat-dialog')).toBeVisible();
  expect(errors).toEqual([]);
});

test('insignia numérica: el ícono muestra los mensajes sin leer y se limpia al leerlos', async ({ browser }, testInfo) => {
  const { p } = await H.clientApp(browser, testInfo);
  await p.evaluate(() => { window.__badge = []; navigator.setAppBadge = async (n) => { window.__badge.push(n); }; navigator.clearAppBadge = async () => { window.__badge.push(0); }; });
  await p.evaluate(() => {
    const be = window.__pgFakeBackend, ana = Object.values(be.users).find((u) => u.email === 'ana@c.co'), l = be.links.find((x) => x.clientId === ana.id);
    for (const i of [1, 2]) be.chatMessages.push({ id: `00000000-0000-4000-8000-00000000099${i}`, clientId: ana.id, coachId: l.coachId, sender: 'coach', body: 'hola ' + i, createdAt: be._serverStamp(), readAt: null });
    be._persist(); return ChatView.updateBadges();
  });
  await expect.poll(() => p.evaluate(() => window.__badge.slice(-1)[0])).toBe(2);
  await p.locator('#tab-mas').click();
  await p.locator('#row-chat').click();
  const ok = p.locator('#chat-aviso-ok');
  if (await ok.isVisible()) await ok.click();
  await expect(p.locator('#chat-list .chat-theirs')).toHaveCount(2);
  await p.locator('#chat-dialog [data-chat-close]').click();
  await expect.poll(() => p.evaluate(() => window.__badge.slice(-1)[0])).toBe(0);
});
