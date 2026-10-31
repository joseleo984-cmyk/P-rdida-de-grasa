// Función 5 · Liga semanal: opt-in literal, alias de catálogo, mínimo 5, tabla solo con alias y puntos, salir; el coach habilita aceptando la cláusula 15. Servidor FALSO.
const { test, expect } = require('@playwright/test');
const H = require('./ux1-helpers');
const L = require('../../liga.js');
const RF = require('../../remote-fake.js');

// Actúa con otra cuenta en el servidor falso de esta página.
const como = (p, email, fn) => p.evaluate(async ({ email, fn }) => {
  const be = window.__pgFakeBackend;
  const m = {}; const mem = { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
  const u = be.users[email];
  m[RemoteFake.SESSION_KEY] = JSON.stringify({ user: { id: u.id, email }, issuedAt: be.clock.now() });
  const r = RemoteFake.createFake({ backend: be, storage: mem });
  // eslint-disable-next-line no-new-func
  return new Function('r', 'be', `return (async () => { ${fn} })()`)(r, be);
}, { email, fn });
const ev = "const ev = (kind, granted = true, version = 't') => ({ kind, granted, version, textHash: 'a'.repeat(64), clientAt: new Date(be.clock.now()).toISOString() });";
const autoLogro = (p) => p.addLocatorHandler(p.locator('#lgd-ok'), (l) => l.click());
const closeAviso = async (p) => { if (await p.locator('#btn-aviso-politica').isVisible()) await p.locator('#btn-aviso-politica').click(); };
const verPuntos = async (p) => { await p.evaluate(() => window.PGNav.show('puntos')); };

test('asesorado: la liga solo aparece si el coach la habilita; opt-in con el texto literal; con 4 solo el mensaje, con 5 la tabla de alias; salir la quita', async ({ browser }, testInfo) => {
  const { p, errors, code } = await H.clientApp(browser, testInfo);
  await autoLogro(p);
  await closeAviso(p);
  await verPuntos(p);
  await expect(p.locator('#liga-box')).toBeHidden();                       // el coach no ha aceptado la cláusula de ligas
  await como(p, 'laura@coach.co', `${ev} await r.account.recordConsents([ev('coach_agreement', true, '0.6-A7-coach')]);`);
  await p.evaluate(() => window.PGLiga.reload());
  await expect(p.locator('#liga-box')).toBeVisible();
  await expect(p.locator('#liga-body')).toContainText('Es voluntaria');
  // Modal: texto LITERAL, casilla y botón; sin la casilla no se une
  await p.locator('#btn-liga-open').click();
  await expect(p.locator('#lg-title')).toHaveText(L.TITLE);
  await expect(p.locator('#lg-text-1')).toHaveText(L.CONSENT[0]);
  await expect(p.locator('#lg-text-2')).toHaveText(L.CONSENT[1]);
  await expect(p.locator('#lg-box')).toHaveText(L.BOX);
  await expect(p.locator('#btn-lg-join')).toHaveText(L.BUTTON);
  await expect(p.locator('#btn-lg-join')).toBeDisabled();
  await p.locator('#lg-ok').check();
  await p.locator('#btn-lg-join').click();
  // Con 1 participante: aviso de cabecera, alias y el mensaje del mínimo; nada de tabla
  await expect(p.locator('#liga-body .liga-notice')).toHaveText(L.NOTICE);
  await expect(p.locator('#liga-min')).toHaveText(L.MIN_MESSAGE);
  await expect(p.locator('.liga-table')).toHaveCount(0);
  const alias = await p.locator('#liga-body strong').first().textContent();
  expect(RF.LIGA_ALIASES).toContain(alias);
  const be1 = await H.backend(p);
  expect(be1.consentEvents.filter((c) => c.kind === 'liga').map((c) => [c.granted, c.version])).toEqual([[true, '0.1-A9-liga']]);   // el consentimiento queda registrado con su versión
  // Cuatro personas más se unen: ya hay 5 y se publica la tabla
  const OTROS = ['beto', 'carla', 'diego', 'elena'];
  for (const k of OTROS) {
    await H.seedClient(p, `${k}@c.co`, `${k} Ríos`, code, { paidDays: 20, habits: true, nutrition: true });
    await como(p, `${k}@c.co`, `${ev} await r.account.recordConsents([ev('adult'), ev('liga')]); await r.client.joinLiga();`);
  }
  await p.evaluate(() => window.PGLiga.reload());
  await expect(p.locator('.liga-table li')).toHaveCount(5);
  await expect(p.locator('#liga-min')).toHaveCount(0);
  const rows = await p.locator('.liga-table li').allInnerTexts();
  expect(rows.filter((r) => /\(tú\)/.test(r))).toHaveLength(1);
  expect(rows.join(' ')).not.toMatch(/Ríos|beto|carla|diego|elena|@|kg|kcal/i);   // solo alias y puntos
  expect(await p.locator('#liga-box').evaluate((e) => e.innerText)).toContain(L.NOTICE);
  // Salir: se quita al instante y vuelve la invitación
  await p.locator('#btn-liga-leave').click();
  await expect(p.locator('#btn-liga-open')).toBeVisible();
  const be2 = await H.backend(p);
  const ana = Object.values(be2.users).find((u) => u.email === 'ana@c.co').id;
  expect(be2.consentEvents.filter((c) => c.kind === 'liga' && c.userId === ana).map((c) => c.granted)).toEqual([true, false]);   // el retiro también queda registrado
  await como(p, 'beto@c.co', "const m = await r.client.myLiga(); if (m.published) throw new Error('debía despublicarse');");
  expect(errors).toEqual([]);
});

test('coach: habilitar la liga = aceptar el acuerdo con la cláusula 15 literal; luego solo ve si se publica y cuántos, nunca alias', async ({ browser }, testInfo) => {
  const CLIENTS = [{ email: 'ana@c.co', name: 'Ana Martínez', paidDays: 20, habitDays: [H.hab(0)] }];
  const { p, errors } = await H.coachApp(browser, testInfo, CLIENTS);
  await p.locator('#tab-mas').click();
  await p.locator('#row-c-retos').click();
  await expect(p.locator('#liga-coach')).toBeVisible();
  await expect(p.locator('#liga-coach-body')).toContainText('cláusula 15');
  await p.locator('#btn-liga-habilitar').click();
  await expect(p.locator('#lga-c15')).toHaveText(L.CLAUSE);
  await expect(p.locator('#lga-ver')).toHaveText('0.6-A7-coach');
  await p.locator('#btn-lga-ok').click();
  await expect(p.locator('#lga-error')).toBeVisible();                     // sin marcar la casilla no se acepta
  await p.locator('#lga-ok').check();
  await p.locator('#btn-lga-ok').click();
  await expect(p.locator('#liga-coach-state')).toContainText('Liga habilitada. Se publica cuando haya 5 participantes o más.');
  await expect(p.locator('#liga-coach')).not.toContainText(/alias:|Halcón|Titán/);
  const be = await H.backend(p);
  const last = be.consentEvents.filter((c) => c.kind === 'coach_agreement').pop();
  expect([last.granted, last.version]).toEqual([true, '0.6-A7-coach']);
  expect(errors).toEqual([]);
});
