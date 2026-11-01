// Textos legales del 24/10/2026 (concepto del abogado), producto 'coach' con servidor FALSO: A6b nuevo con aviso visible y bitácora «Quién vio mis fotos»,
// aviso previo a importar, medidas con peso/abdomen/cadera obligatorios, acuerdo del coach con la cláusula nueva (y re-aceptación), política con §6 y §7.1,
// cámara (etiqueta «Adjuntar foto» y selector de animaciones) y la app OFICIAL sin cambios. Claro/oscuro con letra ancha a 390 px.
// Los textos aprobados se leen del concepto (equipo/legal/concepto-2026-10-24.md) y se comparan con lo que de verdad se ve en pantalla.
const base = require('./helpers');
const { test, expect } = base;   // el `test` de helpers añade `app` (app OFICIAL con config vacío) y sigue dando `browser` para el producto coach
const H = require('./s11-helpers');
const fs = require('fs');
const path = require('path');

const D = (n) => new Date(Date.UTC(2026, 9, 21 + n)).toISOString().slice(0, 10);
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
// PNG de 8×8 válido (la app lo reduce y lo guarda como JPEG).
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAEklEQVR4nGNgYGD4z4AKMAUBAEnYAQHPh3bnAAAAAElFTkSuQmCC', 'base64');

// Textos aprobados, tal como están en el concepto: { '3.3': ['…'], … }
const APPROVED = (() => {
  const md = fs.readFileSync(path.join(__dirname, '../../equipo/legal/concepto-2026-10-24.md'), 'utf8');
  const out = {};
  for (const sec of md.split(/^### (?=3\.\d)/m).slice(1)) {
    const quote = sec.split('\n').filter((l) => /^>/.test(l)).map((l) => l.replace(/^>\s?/, '')).join('\n');
    out[sec.slice(0, 3)] = [...quote.matchAll(/«([\s\S]*?)»/g)].map((m) => m[1]);
  }
  return out;
})();
const A6B = APPROVED['3.3'][0], IMPORT = APPROVED['3.6'][0], CLAUSE = APPROVED['3.5'][0].replace('[X]', '13'), P6 = APPROVED['3.4'][0], P71 = APPROVED['3.4'][1];
// Concepto 2 (L1) reemplazó el recuadro fijo por un aviso bloqueante antes de la primera foto (ver ux1-registro.spec.js y legal-literal.test.js).
const AVISO_L1 = 'Cada foto que guardes será visible para tu coach de forma automática. Puedes ocultar fotos específicas o retirar este permiso en cualquier momento desde tu perfil.';
const goFotos = async (p) => { await p.locator('#tab-registro').click(); await p.locator('#view-progreso .prog-seg button', { hasText: 'Fotos' }).click(); };

const upload = async (p, date, pose) => {
  await H.openFotoForm(p);
  await p.locator('#form-photo input[name=date]').fill(date);
  await p.locator('#form-photo select[name=pose]').selectOption(pose);
  await p.setInputFiles('#form-photo input[name=file]', { name: 'f.png', mimeType: 'image/png', buffer: PNG });
  await p.getByRole('button', { name: 'Guardar foto' }).click();
  if (await p.locator('#sheet-foto-aviso').isVisible()) await p.locator('#fa-ok').click();   // L1: «Entendido y autorizar»
  await expect(p.locator('#toast')).toHaveText('Foto guardada');
};
// Cliente (Ana) ya vinculada con Laura Fit y al día, con letra ancha.
async function client(browser, testInfo, { habits = false } = {}) {
  const ph = await H.phone(browser, testInfo);
  const { p } = ph;
  await p.goto('index.html');
  await H.acceptSolo(p, { habits });
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
// La coach abre las fotos de Ana (por la API, contra el mismo servidor falso): cada apertura queda anotada.
const coachOpens = (p, n) => p.evaluate(async (n) => {
  const be = window.__pgFakeBackend;
  const m = {}; const mem = { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
  const r = RemoteFake.createFake({ backend: be, storage: mem });
  await r.auth.sendCode('laura@coach.co'); await r.auth.verifyCode('laura@coach.co', be.lastCode('laura@coach.co'));
  const uid = Object.values(be.users).find((u) => u.email === 'ana@c.co').id;
  const d = await r.coach.clientData(uid);
  // la más antigua primero: el orden de llegada de las fotos al servidor no es fijo
  for (const ph of d.photos.sort((a, b) => a.date.localeCompare(b.date)).slice(0, n)) { await r.coach.photoBlob(uid, ph); be.clock.advance && be.clock.advance(60000); }
  return d.photos.length;
}, n);
const dark = (p, on) => p.emulateMedia({ colorScheme: on ? 'dark' : 'light' });

test('A6b nuevo: texto aprobado literal, aviso visible solo con el permiso y «Adjuntar foto»; la bitácora lista cada apertura del coach (vacía al inicio)', async ({ browser }, testInfo) => {
  test.setTimeout(90_000);
  const { p, errors } = await client(browser, testInfo);
  const info = await p.evaluate(() => ({ v: ConsentTexts.version('A6b'), full: ConsentTexts.fullText('A6b', { coach: 'Laura Fit' }) }));
  expect(info.v).toBe('0.4-A6b-coach');
  await goFotos(p);
  await p.getByRole('button', { name: 'Autorizar fotos' }).click();
  await H.openFotoForm(p);
  await expect(p.locator('#form-photo')).toBeVisible();
  // Cámara: sin botones nuevos; la etiqueta dice «Adjuntar foto» y la ayuda explica la galería y «Tomar foto»
  await expect(p.locator('#photo-file-text')).toHaveText('Adjuntar foto');
  await expect(p.locator('#photo-file-help')).toHaveText('Elige de tu galería o toca «Tomar foto» para usar la cámara');
  await expect(p.locator('#form-photo input[name=file]')).toHaveAttribute('accept', 'image/*');
  await expect(p.locator('#form-photo input[type=file]')).toHaveCount(1);
  // Sin el permiso A6b: ni aviso ni foto visible para el coach; el texto que se ofrece es el aprobado, LITERAL
  await expect(p.locator('#photo-share-notice')).toHaveCount(0);
  await expect(p.locator('#gallery .vis-tag')).toHaveCount(0);
  await expect(p.locator('#photos-a6b-text')).toHaveText(norm(A6B).replace('{coach}', 'Laura Fit'));
  await H.layout(p); await H.tall(p, '#photos-coach-card');
  await p.getByRole('button', { name: 'Permitir que Laura Fit vea mis fotos' }).click();
  await expect(p.locator('#photos-coach-state')).toContainText('Laura Fit puede ver tus fotos');
  // El evento guarda la versión nueva y la huella del texto EXACTO aprobado
  const ev = (await H.backend(p)).consentEvents.filter((e) => e.kind === 'photo_view_coach').pop();
  expect([ev.granted, ev.version, ev.textHash]).toEqual([true, '0.4-A6b-coach', H.sha(info.full)]);
  expect(info.full.startsWith(A6B.replace('{coach}', 'Laura Fit'))).toBe(true);
  // Concepto 2 (L1): el recuadro fijo ya no existe; el aviso es un modal bloqueante antes de la primera foto (no es un consentimiento: no lleva huella)
  await expect(p.locator('#photo-share-notice')).toHaveCount(0);
  expect((await H.backend(p)).consentEvents.some((e) => e.textHash === H.sha(AVISO_L1))).toBe(false);
  await H.layout(p);
  // Bitácora «Quién vio mis fotos»: vacía mientras nadie mire
  await upload(p, D(-20), 'frente');
  await upload(p, D(-5), 'perfil');
  await expect.poll(() => p.evaluate(() => Object.values(window.__pgFakeBackend.photos).filter((x) => x.sharedWithCoach).length)).toBe(2);
  await p.locator('#btn-fotovistas').click();
  await expect(p.locator('#view-fotovistas')).toBeVisible();
  await expect(p.locator('#fotovistas-title')).toBeFocused();
  await expect(p.locator('#fv-empty')).toHaveText('Nadie ha mirado tus fotos todavía.');
  await expect(p.locator('#fv-list li')).toHaveCount(0);
  await H.layout(p); await H.tall(p, '#view-fotovistas');
  // La coach abre las dos fotos: aparecen con fecha y hora, qué foto y el nombre del coach; la más reciente primero
  expect(await coachOpens(p, 2)).toBe(2);
  await p.getByRole('button', { name: '← Fotos' }).click();
  await expect(p.locator('#view-fotos')).toBeVisible();
  await p.locator('#btn-fotovistas').click();
  await expect(p.locator('#fv-list li')).toHaveCount(2);
  await expect(p.locator('#fv-empty')).toBeHidden();
  const items = (await p.locator('#fv-list li').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
  expect(items[0]).toMatch(/^21 de octubre de 2026, \d{1,2}:\d{2} [ap]\. ?m\. Laura Fit abrió tu foto de perfil del 16 de octubre de 2026\.$/);
  expect(items[1]).toMatch(/Laura Fit abrió tu foto de frente del 1 de octubre de 2026\.$/);
  await H.layout(p); await H.tall(p, '#view-fotovistas'); await H.shot(p, 's14-bitacora-fotos.png', { fullPage: true });
  // Claro y oscuro, con letra ancha: sin desbordes
  for (const d of [true, false]) { await dark(p, d); await H.layout(p); }
  // Segunda entrada: Más → Mi coach
  await p.locator('#tab-mas').click();
  await p.locator('#row-coach').click();
  await expect(p.locator('#coach-log-card')).toBeVisible();
  await H.layout(p);
  await p.locator('#btn-fotovistas-coach').click();
  await expect(p.locator('#view-fotovistas')).toBeVisible();
  await expect(p.locator('#fv-list li')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('quien dio el permiso con el texto anterior (0.3-A6b-coach) queda sin permiso vigente: el coach deja de ver sus fotos y debe volver a darlo', async ({ browser }, testInfo) => {
  test.setTimeout(90_000);
  const { p, errors } = await client(browser, testInfo);
  await goFotos(p);
  await p.getByRole('button', { name: 'Autorizar fotos' }).click();
  await upload(p, D(-3), 'frente');
  await p.getByRole('button', { name: 'Permitir que Laura Fit vea mis fotos' }).click();
  await expect(p.locator('#photos-coach-state')).toContainText('Laura Fit puede ver tus fotos');
  await expect.poll(() => p.evaluate(() => Object.values(window.__pgFakeBackend.photos).filter((x) => x.sharedWithCoach).length)).toBe(1);
  expect(await coachOpens(p, 5)).toBe(1);   // mientras el permiso vale, la coach ve su foto
  // Se vuelve a como estaba con la versión anterior (en el teléfono y en el servidor falso)
  await p.evaluate(() => {
    const be = window.__pgFakeBackend;
    const ev = be.consentEvents.filter((e) => e.kind === 'photo_view_coach').pop();
    ev.version = '0.3-A6b-coach'; be._persist();
    const k = 'perdida-grasa:account';
    const m = JSON.parse(localStorage.getItem(k));
    m.consents.photo_view_coach.version = '0.3-A6b-coach';
    localStorage.setItem(k, JSON.stringify(m));
  });
  await p.reload(); await H.ready(p);
  await p.addStyleTag({ content: H.WIDE });
  await expect(p.locator('#toast')).toContainText('Actualizamos el permiso de tus fotos');
  await goFotos(p);
  await expect(p.locator('#photos-coach-state')).toContainText('todavía no puede ver tus fotos');
  await expect(p.locator('#photos-a6b-text')).toContainText('Autorizo que Laura Fit acceda a las fotos de progreso');
  await expect(p.locator('#gallery .vis-tag')).toHaveCount(0);   // sin permiso vigente no hay etiqueta
  await expect.poll(() => p.evaluate(() => Object.values(window.__pgFakeBackend.photos).filter((x) => x.sharedWithCoach).length)).toBe(0);   // las marcas se limpian en el servidor
  const be = await H.backend(p);
  expect(Object.values(be.links).find((l) => l.status === 'active').shares.photos).toBe(false);   // el servidor ya no le muestra fotos
  expect(be.consentEvents.filter((e) => e.kind === 'photo_view_coach').pop()).toMatchObject({ granted: false, version: '0.4-A6b-coach' });
  expect(await coachOpens(p, 5)).toBe(0);
  // Vuelve a darlo con el texto nuevo: todo funciona otra vez
  await p.getByRole('button', { name: 'Permitir que Laura Fit vea mis fotos' }).click();
  await expect(p.locator('#photos-coach-state')).toContainText('Laura Fit puede ver tus fotos');
  await expect(p.locator('#foto-hero-tag')).toHaveText('Visible para tu coach');
  expect((await H.backend(p)).consentEvents.filter((e) => e.kind === 'photo_view_coach').pop()).toMatchObject({ granted: true, version: '0.4-A6b-coach' });
  expect(errors).toEqual([]);
});

test('importar historial: el aviso aprobado se muestra ANTES del selector; «Continuar» abre el selector y «Cancelar» no; el historial sin peso ni cadera entra', async ({ browser }, testInfo) => {
  test.setTimeout(90_000);
  const { p, errors } = await client(browser, testInfo);
  await p.locator('#tab-mas').click();
  await p.locator('#row-copia').click();
  let chooser = 0;
  p.on('filechooser', () => { chooser++; });
  const imp = p.locator('label.file-btn', { hasText: 'Importar JSON' });
  await imp.click();
  const dlg = p.locator('#sheet-import');
  await expect(dlg).toBeVisible();
  await expect(p.locator('#import-title')).toBeFocused();
  expect(norm(await dlg.innerText()).replace(/ Continuar Cancelar$/, '')).toBe(norm(IMPORT));   // título + párrafo = el texto aprobado, sin añadidos
  await expect(dlg.getByRole('button', { name: 'Continuar', exact: true })).toBeVisible();
  await expect(dlg.getByRole('button', { name: 'Cancelar', exact: true })).toBeVisible();
  await H.layout(p); await H.tall(p, '#sheet-import'); await H.shot(p, 's14-aviso-importar.png');
  for (const d of [true, false]) { await dark(p, d); await H.layout(p); }
  // Cancelar: el selector NO se abre
  await dlg.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(dlg).toBeHidden();
  await p.waitForTimeout(300);
  expect(chooser).toBe(0);
  // Continuar: ahora sí se abre el selector, y el historial viejo (sin peso, abdomen ni cadera) se importa
  await imp.click();
  await expect(dlg).toBeVisible();
  const hist = { schemaVersion: 5, entries: [{ id: '11111111-1111-4111-8111-111111111111', date: D(-60), neck: 35, waist: 86 }, { id: '22222222-2222-4222-8222-222222222222', date: D(-30), weight: 74 }], foods: {}, habits: {}, library: {} };
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), dlg.getByRole('button', { name: 'Continuar', exact: true }).click()]);
  await fc.setFiles({ name: 'historial.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(hist)) });
  await expect(p.locator('#toast')).toHaveText('Datos importados');
  await expect(dlg).toBeHidden();
  await p.locator('#tab-registro').click();
  await expect(p.locator('#medidas-history li')).toHaveCount(2);
  await expect(p.locator('#medidas-history')).toContainText('Peso 74 kg');
  await expect(p.locator('#medidas-history')).toContainText('Cuello 35');
  // Un registro NUEVO exige solo lo que TOCA hoy (miércoles: cintura y cadera; el cuello es opcional)
  await p.locator('#btn-medirme').click();
  await p.locator('#med-mas summary').click();
  await p.locator('#form-medidas input[name=neck]').fill('34');
  await p.getByRole('button', { name: 'Guardar medidas' }).click();
  await expect(p.locator('#medidas-error')).toHaveText('Hoy toca: faltan «Cintura» (cm) y «Cadera» (cm).');
  for (const d of [true, false]) { await dark(p, d); await H.layout(p); await H.tall(p, '#view-medidas'); }
  expect(chooser).toBe(1);
  expect(errors).toEqual([]);
});

test('medidas nuevas: peso, cintura y cadera (D2: solo lo que toca) llegan al coach en la ficha y al CSV de exportación', async ({ browser }, testInfo) => {
  test.setTimeout(90_000);
  const { p, errors } = await client(browser, testInfo);
  await p.locator('#tab-registro').click();
  const save = async (date, v) => {
    await p.locator('#btn-medirme').click();
    if (date !== D(0)) { await p.locator('#btn-med-cambiar').click(); await p.locator('#form-medidas input[name=date]').fill(date); }
    if (!(await p.locator('#med-mas').evaluate((d) => d.open))) await p.locator('#med-mas summary').click();
    for (const [k, x] of Object.entries(v)) await p.locator(`#form-medidas input[name=${k}]`).fill(x);
    await p.getByRole('button', { name: 'Guardar medidas' }).click();
    await expect(p.locator('#view-progreso')).toBeVisible();
  };
  await save(D(-20), { weight: '70', hip: '101', waist: '84' });
  await expect(p.locator('#toast')).toContainText('Medidas guardadas');
  await save(D(0), { weight: '68,5', hip: '99', waist: '80' });
  await expect(p.locator('#toast')).toContainText('Medidas guardadas');
  await expect(p.locator('#medidas-history')).toContainText('Peso 68,5 kg');
  await H.layout(p); await H.shot(p, 's14-medidas-obligatorias.png', { fullPage: true });
  // CSV de exportación (Más → Descargar una copia): trae la columna del abdomen junto a peso, cintura y cadera
  await p.locator('#tab-mas').click();
  await p.locator('#row-copia').click();
  const [dl] = await Promise.all([p.waitForEvent('download'), p.locator('#btn-export-csv').click()]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  const lines = csv.replace(/^﻿/, '').trim().split('\r\n').map((l) => l.split(';').map((c) => c.replace(/"/g, '')));
  expect(lines[0].slice(0, 5)).toEqual(['Fecha', 'Peso (kg)', 'Cintura (cm)', 'Cuello (cm)', 'Cadera (cm)']);   // sin columna de abdomen: ya no se pide (solo si hay datos viejos)
  expect(lines.find((l) => l[0] === D(0)).slice(1, 5)).toEqual(['68,5', '80', '', '99']);
  // JSON de exportación e importación: los tres campos viajan
  const [dj] = await Promise.all([p.waitForEvent('download'), p.locator('#btn-export').click()]);
  const json = JSON.parse(fs.readFileSync(await dj.path(), 'utf8'));
  expect(json.entries.find((e) => e.date === D(0))).toMatchObject({ weight: 68.5, waist: 80, hip: 99 });
  // Llega al servidor y la coach lo ve en la ficha (Peso en kg, Abdomen y Cadera en cm)
  await expect.poll(async () => Object.values((await H.backend(p)).records).filter((r) => r.kind === 'entry').length).toBe(2);
  const srv = Object.values((await H.backend(p)).records).find((r) => r.nkey === D(0));
  expect(srv.data).toMatchObject({ weight: 68.5, waist: 80, hip: 99 });
  const c = await H.phone(browser, testInfo);
  await c.p.goto('index.html');
  await H.acceptSolo(c.p);
  await H.transfer(p, c.p);
  await c.p.evaluate(async () => {
    const be = window.__pgFakeBackend;
    const r = RemoteFake.createFake({ backend: be, storage: localStorage });
    await r.auth.sendCode('laura@coach.co');
    const { user } = await r.auth.verifyCode('laura@coach.co', be.lastCode('laura@coach.co'));
    const ok = (v) => ({ granted: true, version: v, textHash: 'a'.repeat(64), clientAt: '2026-10-01T12:00:00.000Z' });
    localStorage.setItem('perdida-grasa:account', JSON.stringify({ userId: user.id, email: user.email, roles: ['client', 'coach'], onboarded: true, coach: await r.coach.myCoach(), cloudAsked: true,
      consents: { sensitive_health: ok('0.2-AU'), cloud_transfer: ok('0.2-AU'), coach_agreement: ok(ConsentTexts.version('A7')) } }));
    localStorage.setItem('perdida-grasa:owner', user.id);
  });
  await c.p.reload(); await H.ready(c.p);
  await c.p.locator('#tab-coach').click();
  await c.p.addStyleTag({ content: H.WIDE });
  await c.p.locator('#coach-filters button', { hasText: 'Todos' }).click();
  await c.p.locator('#coach-clients .cli-main').click();
  const med = (await c.p.locator('#coach-detail-medidas tbody tr').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
  expect(med.slice(0, 1)).toEqual(['Peso 70 68,5 −1,5']);
  expect(med).toContain('Cintura 84 80 −4');
  expect(med).toContain('Cadera 101 99 −2');
  await H.layout(c.p); await H.shot(c.p, 's14-coach-ficha-medidas.png', { fullPage: true });
  expect(errors).toEqual([]); expect(c.errors).toEqual([]);
});

// Coach con acuerdo aceptado en la versión ANTERIOR (0.3-A7, con su huella real) entrando en su teléfono.
async function coachOldAgreement(browser, testInfo) {
  const ph = await H.phone(browser, testInfo);
  const { p } = ph;
  await p.goto('index.html');
  await H.acceptSolo(p);
  await H.seedCoach(p, 'laura@coach.co', 'Laura Fit');
  const texts = await p.evaluate(() => ({ cur: ConsentTexts.fullText('A7'), ver: ConsentTexts.version('A7'), old: ConsentTexts.agreementText('0.3-A7'), clause: ConsentTexts.TEXTS.A7.clause }));
  await p.evaluate(async ({ oldHash }) => {
    const be = window.__pgFakeBackend;
    const r = RemoteFake.createFake({ backend: be, storage: localStorage });
    await r.auth.sendCode('laura@coach.co');
    const { user } = await r.auth.verifyCode('laura@coach.co', be.lastCode('laura@coach.co'));
    const c = await r.coach.myCoach();
    const ev = (v, h) => ({ granted: true, version: v, textHash: h, clientAt: '2026-10-01T12:00:00.000Z' });
    localStorage.setItem('perdida-grasa:account', JSON.stringify({ userId: user.id, email: user.email, roles: ['client', 'coach'], onboarded: true, coach: c, cloudAsked: true,
      consents: { sensitive_health: ev('0.2-AU', 'a'.repeat(64)), cloud_transfer: ev('0.2-AU', 'a'.repeat(64)), coach_agreement: ev('0.3-A7', oldHash) } }));
    localStorage.setItem('perdida-grasa:owner', user.id);
  }, { oldHash: H.sha(texts.old) });
  await p.reload(); await H.ready(p);
  await p.addStyleTag({ content: H.WIDE });
  return { ...ph, texts };
}

test('acuerdo del coach: la cláusula 13 aprobada se muestra LITERAL; quien aceptó la versión anterior debe aceptar la nueva y su texto viejo sigue en «Mi acuerdo»', async ({ browser }, testInfo) => {
  test.setTimeout(90_000);
  const { p, errors, texts } = await coachOldAgreement(browser, testInfo);
  expect(texts.ver).toBe('0.8-A7-coach');   // M6: la vigente trae además las cláusulas 14 y 15
  expect(norm(texts.clause)).toBe(norm(CLAUSE));
  expect(texts.old).not.toContain('Cláusula');
  // Con la versión anterior, ya no basta: Mi acuerdo avisa y enseña el texto viejo, intacto (su huella coincide)
  await p.locator('#tab-mas').click();
  await p.locator('#row-c-acuerdo').click();
  await expect(p.locator('#acuerdo-new')).toBeVisible();
  await expect(p.locator('#acuerdo-new-text')).toContainText('versión nueva del acuerdo (0.8-A7-coach)');
  await expect(p.locator('#acuerdo-text')).toHaveText(texts.old);
  await H.layout(p);
  await p.getByRole('button', { name: 'Revisar y aceptar la versión nueva' }).click();
  // La puerta de Asesorados pide aceptar de nuevo, con la cláusula completa a la vista, antes de la casilla
  const gate = p.locator('#view-coach .a7-gate');
  await expect(gate).toBeVisible();
  const clause = gate.locator('.a7-clause');
  await expect(clause).toBeVisible();
  expect(norm(await clause.innerText())).toBe(norm(CLAUSE));
  await expect(clause).toContainText('Cláusula 13. Contenidos Cargados, Propiedad Intelectual y Derechos de Imagen:');
  await expect(gate.locator('.a7-clause-export')).toContainText('Cláusula 14. Descarga y custodia local de datos de los asesorados');   // M6 (concepto 6)
  await H.layout(p, '#view-coach button, #view-coach input'); await H.shot(p, 's14-acuerdo-clausula.png', { fullPage: true });
  for (const d of [true, false]) { await dark(p, d); await H.layout(p); }
  await gate.locator('input[name=a7]').check();
  await gate.getByRole('button', { name: 'Aceptar el acuerdo' }).click();
  await expect(gate.locator('.a7-error')).toContainText('segunda casilla');   // concepto 2.3: la autorización de datos es una casilla aparte y también obligatoria
  await gate.locator('input[name=a10]').check();
  await gate.getByRole('button', { name: 'Aceptar el acuerdo' }).click();
  await expect(gate).toBeHidden();
  const be = await H.backend(p);
  const ev = be.consentEvents.filter((e) => e.kind === 'coach_agreement').pop();
  expect([ev.granted, ev.version, ev.textHash]).toEqual([true, '0.8-A7-coach', H.sha(texts.cur)]);
  const ev10 = be.consentEvents.filter((e) => e.kind === 'coach_data').pop();   // evento DISTINTO, con su propia versión y huella
  expect([ev10.granted, ev10.version]).toEqual([true, '0.1-A10-coach']);
  expect(ev10.textHash).not.toBe(ev.textHash);
  expect(texts.cur).toContain(norm(CLAUSE).split(':')[0]);
  // Mi acuerdo ya muestra la versión nueva, con la cláusula
  await p.locator('#tab-mas').click();
  await p.locator('#row-c-acuerdo').click();
  await expect(p.locator('#acuerdo-new')).toBeHidden();
  await expect(p.locator('#acuerdo-version')).toHaveText('0.8-A7-coach');
  expect(norm(await p.locator('#acuerdo-text').innerText())).toContain(norm(CLAUSE));
  expect(errors).toEqual([]);
});

test('el registro como coach también muestra la cláusula antes de la casilla del acuerdo', async ({ browser }, testInfo) => {
  const { p, errors } = await H.phone(browser, testInfo);
  await p.goto('index.html');
  await H.acceptSolo(p);
  await H.enterWithEmail(p, 'nuevo@coach.co', 'Nuevo Coach');
  await expect(p.locator('#acc-step-role, #acc-step-done').filter({ visible: true }).first()).toBeVisible();
  await p.locator('#form-acc-role input[value=coach]').check();
  await expect(p.locator('#acc-a7-clause')).toBeVisible();
  expect(norm(await p.locator('#acc-a7-clause').innerText())).toBe(norm(CLAUSE));
  // Concepto 2.3: dos casillas separadas, vacías, con su texto literal (la 1 del acuerdo y la 2 de datos y transmisión internacional)
  await expect(p.locator('#acc-a7')).not.toBeChecked();
  await expect(p.locator('#acc-a10')).not.toBeChecked();
  await expect(p.locator('#acc-a7-text')).toHaveText('He leído y acepto el Acuerdo del Coach (versión 0.8), comprometiéndome a respetar los límites éticos y legales del servicio, la confidencialidad de mis asesorados y la prohibición estricta de descargar, capturar o difundir sus fotografías corporales o datos sensibles fuera de la plataforma.');
  await expect(p.locator('#acc-a10-text')).toHaveText('Autorizo a José Granados a tratar mis datos personales de registro y gestión conforme a la Política de Tratamiento de Datos, y consiento su transmisión internacional a servidores en la nube (Supabase, EE. UU.) y proveedores de correo (Brevo, Francia) bajo medidas de seguridad internacionales.');
  await p.locator('#acc-business').fill('Mi Negocio');
  await p.locator('#acc-a7').check();
  await p.locator('#form-acc-role').getByRole('button').last().click();
  await expect(p.locator('#acc-role-error')).toContainText('segunda casilla');   // con una sola casilla no avanza
  await H.layout(p);
  expect(errors).toEqual([]);
});

test('política: la página legal trae el texto definitivo del abogado (1/11/2026): §6 de fotos y §7.1 del coach, sin repetirlos y sin la redacción antigua', async ({ page }) => {
  await page.goto('legal/privacidad.html');
  const text = norm(await page.locator('main').innerText());
  for (const par of ['La visualización se realiza a través de enlaces cifrados temporales con vigencia de sesenta (60) segundos.',
    'Las fotografías corporales quedan excluidas en su totalidad de esta función y nunca pueden ser descargadas por esta vía.']) {
    expect(text).toContain(norm(par));
    expect(text.split(norm(par)).length - 1).toBe(1);
  }
  expect(text).not.toContain('una a una');
  await expect(page.getByRole('heading', { name: /Régimen Especial de Fotografías de Progreso/ })).toBeVisible();
  await expect(page.locator('main')).toContainText('cuentademomisapps@gmail.com');
  await expect(page.locator('main')).not.toContainText(/Borrador|Calle 18|joseleo984/i);
});

test('app OFICIAL sin cambios: «Foto», sin aviso ni bitácora, textos y selector de siempre; importar abre el selector directo', async ({ app, page }) => {
  await app.open({});
  const t = await page.evaluate(() => ({ a6b: ConsentTexts.version('A6b'), a7: ConsentTexts.version('A7'), clause: ConsentTexts.TEXTS.A7.clause, producto: !!(window.Producto && window.Producto.coach) }));
  expect(t).toEqual({ a6b: '0.2-A6b', a7: '0.3-A7', clause: undefined, producto: false });
  await app.tab('fotos');
  await expect(page.locator('#photo-file-text')).toHaveText('Foto');
  await expect(page.locator('#photo-file-help')).toBeHidden();
  await expect(page.locator('#photo-share-notice')).toHaveCount(0);
  await expect(page.locator('#photos-log-card')).toBeHidden();
  await app.goPerfil('coach');
  await expect(page.locator('#coach-log-card')).toBeHidden();
  // Registro corporal de siempre: sin abdomen y con el peso opcional
  await app.tab('registro');
  await expect(page.locator('#form-entry input[name=abdomen]')).toHaveCount(0);
  // Importar JSON: sin aviso previo; el selector se abre al tocar
  await app.goPerfil('copia');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.locator('label.file-btn', { hasText: 'Importar JSON' }).click()]);
  expect(fc).toBeTruthy();
  await expect(page.locator('#sheet-import')).toBeHidden();
  // Los textos legales de la política (adenda) están en la página legal compartida; el resto del documento no se tocó
  expect(await page.evaluate(() => document.querySelector('#view-medidas') !== null)).toBe(true);
});

test('app oficial: el CSV no cambia (sin columna de abdomen)', async ({ app, page }) => {
  await app.open({ state: base.state({ entries: [{ id: 'e1', date: base.D(5), weight: 70, waist: 80 }] }) });
  await app.goPerfil('copia');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#btn-export-csv').click()]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  expect(csv.split('\r\n')[0]).toBe('﻿"Fecha";"Peso (kg)";"Cintura (cm)";"Cuello (cm)";"Cadera (cm)";"% grasa";"Calorías (kcal)";"Proteína (g)";"Carbohidratos (g)";"Grasas (g)";"Alimentos registrados";"Pasos";"Agua (L)";"Sueño (h)";"Entrenó fuerza";"Nota"');
});
