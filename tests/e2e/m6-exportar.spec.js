// M6 · Exportar a Excel del coach (concepto jurídico 6) y Política v1.1 (aviso informativo). Servidor FALSO, reloj fijo (miércoles 21-oct-2026).
// El servidor real se prueba en supabase/tests/180_exportar_excel.test.sql; el generador XLSX y los filtros, en tests/exportar.test.js.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./ux1-helpers');
const { workbook } = require('../xlsx-reader');
const { iso } = H;

const CUSTODY = 'Asumo la custodia y confidencialidad de estos datos conforme a la Ley 1581 de 2012 como responsable independiente.';
const SHOTS = process.env.XL_SHOTS || '';   // carpeta opcional para las capturas y el .xlsx de ejemplo (entrega)
const keep = async (p, name, opts = {}) => { await H.shot(p, name, opts); if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, name), ...opts }); } };

const CLIENTES = [
  { email: 'ana@c.co', name: 'Ana Martínez', habits: true,
    measures: [{ date: iso(-20), data: { weight: 74, waist: 80 } }, { date: iso(-1), data: { weight: 72.6, waist: 78 } }],
    habitDays: [{ date: iso(-2), data: { water: 2, steps: 9000, sleep: 7, trained: true, effort: 'duro' } }, { date: iso(-3), data: { water: 1.5 } }],
    foods: [{ date: iso(-1), data: { name: 'Arroz con pollo', kcal: 650, protein: 35, meal: 'Almuerzo', time: '13:10' } }, { date: iso(-1), data: { name: '=1+1', kcal: 100, meal: 'Snack' } }] },
  { email: 'beto@c.co', name: 'Beto Gómez', habits: false,
    measures: [{ date: iso(-6), data: { weight: 90 } }],
    habitDays: [{ date: iso(-6), data: { water: 3.3, trained: true, effort: 'normal' } }] },   // no comparte hábitos: el servidor no los entrega
  { email: 'carla@c.co', name: 'Carla Ruiz', habits: true, measures: [{ date: iso(-4), data: { weight: 66 } }], habitDays: [{ date: iso(-5), data: { water: 2.5 } }] },
];

// Coach (Laura) entrado en su teléfono, con el acuerdo `a7` aceptado (con su huella real) y los asesorados pedidos (comidas compartidas).
async function coachXL(browser, testInfo, { a7 = '0.4-A7-coach', clients = CLIENTES } = {}) {
  const ph = await H.phone(browser, testInfo);
  const { p } = ph;
  await p.goto('index.html');
  await H.acceptSolo(p);
  const code = await H.seedCoach(p, 'laura@coach.co', 'Laura Fit');
  await p.evaluate(async ({ a7, hash }) => {
    const be = window.__pgFakeBackend;
    const r = RemoteFake.createFake({ backend: be, storage: localStorage });
    await r.auth.sendCode('laura@coach.co');
    const { user } = await r.auth.verifyCode('laura@coach.co', be.lastCode('laura@coach.co'));
    const at = '2026-10-01T12:00:00.000Z', h = 'a'.repeat(64);
    await r.account.recordConsents([{ kind: 'coach_agreement', granted: true, version: a7, textHash: hash, clientAt: at }]);
    localStorage.setItem('perdida-grasa:account', JSON.stringify({ userId: user.id, email: user.email, roles: ['client', 'coach'], onboarded: true, coach: await r.coach.myCoach(), cloudAsked: true,
      consents: { sensitive_health: { granted: true, version: '0.2-AU', textHash: h, clientAt: at }, cloud_transfer: { granted: true, version: '0.2-AU', textHash: h, clientAt: at }, coach_agreement: { granted: true, version: a7, textHash: hash, clientAt: at } } }));
    localStorage.setItem('perdida-grasa:owner', user.id);
    localStorage.setItem('perdida-grasa:aviso-politica', JSON.stringify([`${user.id}|politica-1.1`, `${user.id}|politica-1.2`]));   // el aviso se prueba aparte
  }, { a7, hash: H.sha(await p.evaluate((v) => ConsentTexts.agreementText(v), a7)) });
  for (const c of clients) {
    await H.seedClient(p, c.email, c.name, code, { paidDays: 20, habits: c.habits !== false, nutrition: true, measures: c.measures || [], habitDays: c.habitDays || [], foods: c.foods || [] });
  }
  // Carla registró en su pausa privada: el servidor lo guarda como pause_private y el coach NUNCA lo recibe (tampoco en el Excel).
  await p.evaluate(() => {
    const be = window.__pgFakeBackend;
    const u = Object.values(be.users).find((x) => x.email === 'carla@c.co');
    if (!u) return;
    const id = u.id;
    const day = new Date(be.clock.now() - 5 * 3600000 - 86400000).toISOString().slice(0, 10);
    be.records[`${id}|habit|${day}`] = { id: '00000000-0000-4000-8000-000000000999', kind: 'habit', nkey: day, date: day, data: { water: 9.9, trained: true, effort: 'no_termine' },
      updatedAt: '2026-10-21T10:00:00.000Z', deletedAt: null, userId: id, pausePrivate: true, serverUpdatedAt: be._serverStamp() };
    be.records[`${id}|entry|${day}`] = { id: '00000000-0000-4000-8000-000000000998', kind: 'entry', nkey: day, date: day, data: { weight: 55.5 },
      updatedAt: '2026-10-21T10:00:00.000Z', deletedAt: null, userId: id, pausePrivate: true, serverUpdatedAt: be._serverStamp() };
    be._persist();
  });
  await p.reload(); await H.ready(p);
  return { ...ph, code };
}
const openExport = async (p) => {
  await p.locator('#tab-mas').click();
  await p.locator('#row-c-exportar').click();
  await expect(p.locator('#view-exportar')).toBeVisible();
  await expect(p.locator('#xl-who .xl-av').first()).toBeVisible();
};
const read = async (download) => workbook(fs.readFileSync(await download.path()));
const rowsOf = (wb, name) => wb.sheets.find((s) => s.name === name).rows;

test('M6: pantalla del boceto; sin casilla no descarga; la primera vez pide la cláusula 14 y queda registrada; el .xlsx trae solo lo que el coach ve; el historial lo muestra', async ({ browser }, testInfo) => {
  test.setTimeout(90_000);
  const { p, errors } = await coachXL(browser, testInfo);
  await openExport(p);
  // 1 · Asesorados: todos elegidos por defecto
  await expect(p.locator('#xl-title')).toHaveText('Exportar a Excel');
  await expect(p.locator('#xl-who .xl-av[aria-pressed="true"]')).toHaveCount(3);
  await expect(p.locator('#xl-all')).toHaveText('Todos (3)');
  await expect(p.locator('#xl-who-sum')).toHaveText('3 elegidos · Ana, Beto, Carla');
  await p.locator('#xl-who .xl-av[aria-label="Beto Gómez"]').click();
  await expect(p.locator('#xl-who-sum')).toHaveText('2 elegidos · Ana, Carla');
  await p.locator('#xl-all').click();
  await expect(p.locator('#xl-who-sum')).toHaveText('3 elegidos · Ana, Beto, Carla');
  // 2 · Fechas: atajos y Desde/Hasta
  await expect(p.locator('.xl-range [aria-pressed="true"]')).toHaveText('Últimos 3 meses');
  await expect(p.locator('#xl-from')).toHaveValue('2026-07-21');
  await expect(p.locator('#xl-to')).toHaveValue('2026-10-21');
  await p.locator('.xl-range [data-range="mes"]').click();
  await expect(p.locator('#xl-from')).toHaveValue('2026-10-01');
  await p.locator('.xl-range [data-range="3m"]').click();
  // 3 · Qué datos; Fotos desactivada con «no se exportan»
  await expect(p.locator('#xl-cats input:checked')).toHaveCount(4);
  expect(await p.locator('#xl-cats .xl-cat-t').allTextContents()).toEqual(['Medidas', 'Comidas', 'Hábitos', 'Entrenos']);
  await expect(p.locator('.xl-off input')).toBeDisabled();
  await expect(p.locator('.xl-off')).toContainText('Fotos');
  await expect(p.locator('#xl-foto-s')).toHaveText('no se exportan');
  // Casilla LITERAL; sin ella el botón está desactivado y no se descarga ni se registra nada
  await expect(p.locator('#xl-custody-t')).toHaveText(CUSTODY);
  await expect(p.locator('#xl-gate')).toBeHidden();
  await expect(p.locator('#btn-xl')).toBeDisabled();
  await expect(p.locator('#xl-status')).toHaveText('Marca la casilla de custodia para descargar.');
  await expect(p.locator('#xl-hist')).toContainText('Aún no has exportado nada.');
  await keep(p, 'm6-pantalla.png', { fullPage: true });
  expect(await p.evaluate(() => window.__pgFakeBackend.exports.length)).toBe(0);
  await p.locator('#xl-custody').check();
  await expect(p.locator('#btn-xl')).toBeEnabled();
  await keep(p, 'm6-casilla.png', { fullPage: true });
  await p.locator('#xl-custody').uncheck();
  await expect(p.locator('#btn-xl')).toBeDisabled();
  await p.locator('#xl-custody').check();
  // Primera vez: el acuerdo aceptado es 0.4 (sin la cláusula 14) → se muestra la cláusula y hay que aceptarla
  await p.locator('#btn-xl').click();
  const dlg = p.locator('#sheet-xl-acuerdo');
  await expect(dlg).toBeVisible();
  const ct = await p.evaluate(() => ({ clause: ConsentTexts.TEXTS.A7.clauseExport, full: ConsentTexts.fullText('A7'), ver: ConsentTexts.version('A7') }));
  expect(ct.ver).toBe('0.8-A7-coach');
  await expect(p.locator('#xla-clause')).toHaveText(ct.clause);
  await expect(p.locator('#xla-clause')).toContainText('Cláusula 14. Descarga y custodia local de datos de los asesorados');
  await expect(p.locator('#xla-ver')).toHaveText('0.8-A7-coach');
  await H.layout(p, '#sheet-xl-acuerdo button, #sheet-xl-acuerdo input');
  await keep(p, 'm6-aceptar-clausula.png');
  await p.locator('#btn-xla-ok').click();
  await expect(p.locator('#xla-error')).toHaveText('Marca la casilla para aceptar el acuerdo.');
  expect(await p.evaluate(() => window.__pgFakeBackend.exports.length)).toBe(0);
  await p.locator('#xla-ok').check();
  const [dl] = await Promise.all([p.waitForEvent('download'), p.locator('#btn-xla-ok').click()]);
  await expect(dlg).toBeHidden();
  expect(dl.suggestedFilename()).toBe('exportacion-2026-10-21.xlsx');
  // La aceptación quedó registrada en el servidor con versión, huella del texto completo y fecha
  const be = await H.backend(p);
  const ev = be.consentEvents.filter((e) => e.kind === 'coach_agreement').pop();
  expect([ev.granted, ev.version, ev.textHash]).toEqual([true, '0.8-A7-coach', H.sha(ct.full)]);
  expect(ev.clientAt).toBeTruthy();
  // La exportación quedó registrada SIN contenido
  expect(be.exports).toHaveLength(1);
  expect(Object.keys(be.exports[0]).sort()).toEqual(['agreementVersion', 'categories', 'clients', 'coachId', 'createdAt', 'custody', 'from', 'id', 'to']);
  expect([be.exports[0].clients, be.exports[0].categories, be.exports[0].from, be.exports[0].to, be.exports[0].custody]).toEqual([3, ['comidas', 'entrenos', 'habitos', 'medidas'], '2026-07-21', '2026-10-21', true]);
  // El archivo: Léame + una hoja por categoría, sin fotos, sin hábitos de quien no comparte y sin registros de pausa
  const wb = await read(dl);
  expect(wb.sheets.map((s) => s.name)).toEqual(['Leame', 'Medidas', 'Comidas', 'Hábitos', 'Entrenos']);
  for (const s of wb.sheets.slice(1)) expect(s.rows[0].slice(0, 2)).toEqual(['Asesorado', 'Fecha']);
  expect(rowsOf(wb, 'Medidas').slice(1).map((r) => [r[0], r[2]])).toEqual([['Ana Martínez', 74], ['Ana Martínez', 72.6], ['Beto Gómez', 90], ['Carla Ruiz', 66]]);
  expect(rowsOf(wb, 'Hábitos').slice(1).map((r) => r[0])).toEqual(['Ana Martínez', 'Ana Martínez', 'Carla Ruiz']);
  expect(rowsOf(wb, 'Entrenos').slice(1).map((r) => [r[0], r[2], r[3]])).toEqual([['Ana Martínez', 'Sí', 'Duro']]);
  expect(rowsOf(wb, 'Comidas').slice(1).map((r) => [r[0], r[2] || '', r[4]])).toEqual([['Ana Martínez', '', '=1+1'], ['Ana Martínez', '13:10', 'Arroz con pollo']]);   // por fecha y hora
  const all = JSON.stringify(wb.sheets.map((s) => s.rows));
  expect(all).not.toContain('Beto Gómez","3.3');
  expect(all).not.toMatch(/9\.9|55\.5|No pude terminar/);   // lo de la pausa privada de Carla no está
  expect(wb.sheets.some((s) => /foto/i.test(s.name))).toBe(false);
  const lea = Object.fromEntries(rowsOf(wb, 'Leame').filter((r) => r.length === 2));
  expect(lea.Custodia).toBe(CUSTODY);
  expect(lea.Fotos).toBe('No se exportan.');
  expect(lea['Rango de fechas']).toBe('Desde 2026-07-21 hasta 2026-10-21');
  expect(lea['Sin hábitos ni entrenos']).toBe('No comparten sus hábitos: Beto Gómez');
  expect(lea.Generado).toMatch(/21 de octubre de 2026/);
  // Fórmulas: la comida «=1+1» va como texto con apóstrofo, nunca como fórmula
  const com = wb.sheets.find((s) => s.name === 'Comidas').xml;
  expect(com).not.toMatch(/<f>/);
  expect(com).toMatch(/<c r="E\d+" t="s" s="3">/);
  // Después: la casilla vuelve a estar sin marcar (se pide antes de CADA descarga) y el historial muestra la exportación
  await expect(p.locator('#xl-custody')).not.toBeChecked();
  await expect(p.locator('#btn-xl')).toBeDisabled();
  await expect(p.locator('#xl-status')).toContainText('Listo: descargamos exportacion-2026-10-21.xlsx (3 asesorados)');
  await expect(p.locator('#xl-hist .xl-hist-row')).toHaveCount(1);
  await expect(p.locator('#xl-hist .xl-hist-row').first()).toContainText('3 asesorados · Medidas, Comidas, Hábitos, Entrenos');
  // Segunda descarga: ya no pide la cláusula, pero SÍ la casilla
  await p.locator('#xl-who .xl-av[aria-label="Beto Gómez"]').click();
  await p.locator('#xl-cats input[value="comidas"]').uncheck();
  await p.locator('#xl-custody').check();
  const [dl2] = await Promise.all([p.waitForEvent('download'), p.locator('#btn-xl').click()]);
  await expect(dlg).toBeHidden();
  const wb2 = await read(dl2);
  expect(wb2.sheets.map((s) => s.name)).toEqual(['Leame', 'Medidas', 'Hábitos', 'Entrenos']);
  expect(JSON.stringify(wb2.sheets.map((s) => s.rows))).not.toContain('Beto');
  await expect(p.locator('#xl-hist .xl-hist-row')).toHaveCount(2);
  await expect(p.locator('#xl-hist .xl-hist-row').first()).toContainText('2 asesorados · Medidas, Hábitos, Entrenos');
  // Mi acuerdo ya muestra la 0.5
  await p.locator('#tab-mas').click();
  await p.locator('#row-c-acuerdo').click();
  await expect(p.locator('#acuerdo-version')).toHaveText('0.8-A7-coach');
  await expect(p.locator('#acuerdo-new')).toBeHidden();
  expect(errors).toEqual([]);
});

test('M6: con la 0.4 del acuerdo el resto de la app funciona sin re-aceptar; «Mi acuerdo» lo explica sin pedirlo; cancelar la cláusula no descarga', async ({ browser }, testInfo) => {
  const { p, errors } = await coachXL(browser, testInfo, { clients: CLIENTES.slice(0, 1) });
  await p.locator('#tab-coach').click();
  await expect(p.locator('#view-coach .a7-gate')).toBeHidden();
  await expect(p.locator('#coach-clients [data-client]')).toHaveCount(1);
  await p.locator('#tab-mas').click();
  await p.locator('#row-c-acuerdo').click();
  await expect(p.locator('#acuerdo-version')).toHaveText('0.4-A7-coach');
  await expect(p.locator('#acuerdo-new-text')).toContainText('se te pedirá solo la primera vez que uses «Exportar a Excel»');
  await expect(p.locator('#btn-acuerdo-nuevo')).toBeHidden();
  await openExport(p);
  await p.locator('#xl-custody').check();
  await p.locator('#btn-xl').click();
  await expect(p.locator('#sheet-xl-acuerdo')).toBeVisible();
  await p.locator('#btn-xla-cancel').click();
  await expect(p.locator('#sheet-xl-acuerdo')).toBeHidden();
  await expect(p.locator('#btn-xl')).toBeFocused();
  const be = await H.backend(p);
  expect(be.exports).toHaveLength(0);
  expect(be.consentEvents.filter((e) => e.kind === 'coach_agreement').pop().version).toBe('0.4-A7-coach');
  expect(errors).toEqual([]);
});

test('Política v1.1: con la política 1.0 (o sin el aviso activo) «Descargar Excel» queda desactivado y dice por qué; con 1.1 se habilita', async ({ browser }, testInfo) => {
  const { p, errors } = await coachXL(browser, testInfo, { a7: '0.5-A7-coach', clients: CLIENTES.slice(0, 1) });
  const serve = (privacy) => p.route('**/legal/VERSIONS.json', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ terms: { version: '0.1' }, privacy }) }));
  await serve({ version: '1.0', notice: { id: 'politica-1.0', active: true } });
  await p.reload(); await H.ready(p);
  await openExport(p);
  await expect(p.locator('#xl-gate')).toBeVisible();
  await expect(p.locator('#xl-gate')).toHaveText('La descarga se habilita cuando esté publicada la Política de Tratamiento de Datos v1.1 y su aviso a los asesorados esté activo. Hoy está publicada la v1.0.');
  await p.locator('#xl-custody').check();
  await expect(p.locator('#btn-xl')).toBeDisabled();
  await p.unroute('**/legal/VERSIONS.json');
  await serve({ version: '1.1', notice: { id: 'politica-1.1', active: false } });
  await p.reload(); await H.ready(p);
  await openExport(p);
  await expect(p.locator('#xl-gate')).toContainText('cuando el aviso de la Política de Tratamiento de Datos v1.1 esté activo');
  await p.locator('#xl-custody').check();
  await expect(p.locator('#btn-xl')).toBeDisabled();
  await p.unroute('**/legal/VERSIONS.json');
  await p.reload(); await H.ready(p);   // el VERSIONS.json real del repositorio: 1.2 (≥ 1.1) con el aviso activo: sigue habilitado
  await openExport(p);
  await expect(p.locator('#xl-gate')).toBeHidden();
  await p.locator('#xl-custody').check();
  await expect(p.locator('#btn-xl')).toBeEnabled();
  expect(await p.evaluate(() => window.__pgFakeBackend.exports.length)).toBe(0);
  expect(errors).toEqual([]);
});

test('Asesorado: no ve nada de la exportación (ni la fila, ni la pantalla, ni el historial); ve UNA vez el aviso literal de la Política vigente (v1.2, concepto 7) con su enlace', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo);
  const TEXT = 'Actualizamos nuestra Política de Tratamiento de Datos (v1.2) para incluir la opción voluntaria de retos y ligas de constancia en equipo. Conócela aquí.';
  const aviso = p.locator('#aviso-politica');
  await expect(aviso).toBeVisible();
  await expect(p.locator('#aviso-politica-text')).toHaveText(TEXT);
  await expect(p.locator('#aviso-politica-text a')).toHaveText('aquí');
  await expect(p.locator('#aviso-politica-text a')).toHaveAttribute('href', 'legal/privacidad.html');
  await expect(p.locator('#btn-aviso-politica')).toHaveText('Entendido');
  await H.layout(p);
  // No tapa nada: la app se usa con el aviso a la vista (no es modal ni pide re-aceptar)
  await expect(p.locator('#solo')).toBeHidden();
  await p.locator('#tab-mas').click();
  await expect(p.locator('#row-c-exportar')).toBeHidden();
  await p.evaluate(() => PGNav.show('exportar'));
  await expect(p.locator('#view-exportar')).toBeHidden();
  await expect(p.locator('#view-mas')).toBeVisible();
  const code = await p.evaluate(async () => { try { await PGAccount.remote.coach.exports(); return 'ok'; } catch (e) { return e.code; } });
  expect(code).toBe('forbidden');
  await p.locator('#btn-aviso-politica').click();
  await expect(aviso).toBeHidden();
  await p.reload(); await H.ready(p);
  await p.locator('#tab-mas').click();
  await expect(aviso).toBeHidden();   // una sola vez
  expect(errors).toEqual([]);
});

test('M6 a 390 px con letra al 200 % y fuente ancha: pantalla, casilla y aceptación de la cláusula sin desborde; botones de 48 px; contraste AA en oscuro y claro', async ({ browser }, testInfo) => {
  test.setTimeout(90_000);
  const { p, errors } = await coachXL(browser, testInfo);
  await p.addStyleTag({ content: H.WIDE });
  await p.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const tap = (sel) => p.locator(sel).first().evaluate((b) => b.click());
  const sinDesborde = async (donde) => {
    const bad = await p.evaluate(() => {
      const out = [];
      const vw = document.documentElement.clientWidth;
      if (document.documentElement.scrollWidth > vw) out.push('scroll horizontal ' + document.documentElement.scrollWidth);
      for (const el of document.querySelectorAll('#view-exportar *, dialog[open] *')) {
        if (!el.offsetParent || el.closest('.hidden, dialog:not([open])')) continue;
        const r = el.getBoundingClientRect();
        if (r.width && (r.left < -0.5 || r.right > vw + 0.5)) out.push(`${el.id || el.className || el.tagName} fuera ${Math.round(r.left)}-${Math.round(r.right)}`);
      }
      return out;
    });
    expect(bad, donde).toEqual([]);
  };
  const aa = async (sels, donde) => { for (const s of sels) if (await p.locator(s).first().isVisible()) expect(await H.contrast(p, s), `${donde}: ${s}`).toBeGreaterThanOrEqual(4.5); };
  await tap('#tab-mas');
  await tap('#row-c-exportar');
  await expect(p.locator('#xl-who .xl-av').first()).toBeVisible();
  for (const scheme of ['dark', 'light']) {
    await p.emulateMedia({ colorScheme: scheme });
    await sinDesborde(`${scheme}: pantalla`);
    await H.tall(p, '#view-exportar');
    await aa(['#xl-who-t', '#xl-all', '#xl-who .xl-av[aria-pressed="true"]', '#xl-who-sum', '.xl-range [aria-pressed="true"]', '.xl-range [aria-pressed="false"]', '.xl-date span', '#xl-from',
      '#xl-cats .xl-cat-t', '#xl-cats .xl-cat-s', '#xl-foto-s', '#xl-custody-t', '#xl-status', '#xl-hist-t', '#xl-hist li'], `${scheme}: pantalla`);
    await tap('#xl-custody');
    await expect(p.locator('#btn-xl')).toBeEnabled();
    await aa(['#btn-xl'], scheme);
    if (scheme === 'dark') await keep(p, 'm6-200-oscuro.png', { fullPage: true });
    await tap('#btn-xl');
    await expect(p.locator('#sheet-xl-acuerdo')).toBeVisible();
    await sinDesborde(`${scheme}: cláusula`);
    await aa(['#xla-title', '#xla-clause', '#xla-body', '#btn-xla-ok', '#btn-xla-cancel', '.xla-more summary'], `${scheme}: cláusula`);
    await H.tall(p, '#sheet-xl-acuerdo');
    if (scheme === 'dark') await keep(p, 'm6-200-clausula.png');
    await tap('#btn-xla-cancel');
    await tap('#xl-custody');
  }
  // Teclado: la casilla y los avatares tienen foco visible
  await p.emulateMedia({ colorScheme: 'dark' });
  await p.locator('#xl-who .xl-av').first().focus();
  expect(await p.locator('#xl-who .xl-av').first().evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
  expect(errors).toEqual([]);
});
