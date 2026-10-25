// Estilo v2 (bocetos E1–E4 de equipo/diseno/v2-estilo/): modo paso a paso con series y descanso del coach, texto libre, sin video,
// «Entreno completo» (marca «Ya entrené» y pide el esfuerzo de la Etapa 1), aviso de dolor del concepto jurídico 4 (No / Sí → bloqueo preventivo →
// el coach ve «Reportó dolor» → revisado), «Reducir movimiento» y letra al 200 % a 390 px. Producto 'coach', servidor FALSO, reloj fijo (mié 21-oct-2026).
const { test, expect } = require('@playwright/test');
const H = require('./ux1-helpers');

const GIF_B64 = 'R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
const BLOCK = 'Tu salud es lo primero: suspende el ejercicio y consulta a un médico o fisioterapeuta. Tu coach ha sido notificado para pausar o revisar tu planificación';
const QUESTION = '¿Sentiste dolor que te impidiera entrenar con normalidad?';

// Laura (coach) le arma a Ana una rutina por la API. withGif: el primer ejercicio lleva una animación de su biblioteca.
async function seed(page, exercises, { title = 'Piernas v2', withGif = true } = {}) {
  await page.evaluate(async ({ b64, exercises, title, withGif }) => {
    const be = window.__pgFakeBackend;
    const m = {}; const mem = { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
    const r = RemoteFake.createFake({ backend: be, storage: mem });
    await r.auth.sendCode('laura@coach.co');
    await r.auth.verifyCode('laura@coach.co', be.lastCode('laura@coach.co'));
    const g = withGif ? await r.coach.uploadGif(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'image/gif' }), 'Sentadilla') : null;
    const ana = Object.values(be.users).find((u) => u.email === 'ana@c.co').id;
    await r.coach.saveRoutine(ana, { title, days: [{ title: 'Día 1', exercises: exercises.map((e, i) => ({ note: '', ...e, gif: g && i === 0 ? g.id : '' })) }] });
  }, { b64: GIF_B64, exercises, title, withGif });
  await page.evaluate(() => PGAccount.refreshLink());
  await page.locator('#tab-entrenar').click();
  await expect(page.locator('#rutina-cards .rcard')).toHaveCount(1);
  await page.locator('#tab-panel').click();
}
const STRUCT = [
  { name: 'Sentadilla goblet', series: '2', reps: '12', weight: '12', rest: '30' },
  { name: 'Plancha', sets: 'Aguanta 30 s, 3 veces' },
  { name: 'Puente de glúteo', sets: '2×15' },
];
// El editor del coach guarda lo estructurado dentro de «sets» con la forma fija (sin SQL): aquí se arma igual.
const asContent = (list) => list.map((e) => (e.series ? { name: e.name, sets: `${e.series}×${e.reps}${e.weight ? ` · ${e.weight} kg` : ''}${e.rest ? ` · desc. ${e.rest} s` : ''}` } : e));
const painOf = (p) => p.evaluate(() => Object.values(window.__pgFakeBackend.painReports || {}));
// El coach (Laura) entra en SU teléfono con el «servidor» que dejó el teléfono de Ana.
async function coachFrom(browser, testInfo, from) {
  const ph = await H.phone(browser, testInfo);
  const { p } = ph;
  await p.goto('index.html');
  await H.acceptSolo(p);
  await H.transfer(from, p);
  await p.evaluate(async () => {
    const be = window.__pgFakeBackend;
    const r = RemoteFake.createFake({ backend: be, storage: localStorage });
    await r.auth.sendCode('laura@coach.co');
    const { user } = await r.auth.verifyCode('laura@coach.co', be.lastCode('laura@coach.co'));
    const c = await r.coach.myCoach();
    const at = '2026-10-01T12:00:00.000Z', h = 'a'.repeat(64);
    localStorage.setItem('perdida-grasa:account', JSON.stringify({ userId: user.id, email: user.email, roles: ['client', 'coach'], onboarded: true, coach: c, cloudAsked: true,
      consents: { sensitive_health: { granted: true, version: '0.2-AU', textHash: h, clientAt: at }, cloud_transfer: { granted: true, version: '0.2-AU', textHash: h, clientAt: at }, coach_agreement: { granted: true, version: ConsentTexts.version('A7'), textHash: h, clientAt: at } } }));
    localStorage.setItem('perdida-grasa:owner', user.id);
  });
  await p.reload(); await H.ready(p);
  await p.locator('#tab-coach').click();
  await expect(p.locator('#coach-clients .cli-pay-row')).toHaveCount(1);
  return ph;
}

test('E3/E4 con series del coach: serie hecha → descanso en cuenta regresiva, Pausa, fin del descanso con vibración, saltar, anterior, texto libre y «Entreno completo» que marca «Ya entrené» y el esfuerzo', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo);
  await p.addInitScript(() => { window.__vib = []; Object.defineProperty(navigator, 'vibrate', { configurable: true, value: (x) => { window.__vib.push(x); return true; } }); });
  await p.reload(); await H.ready(p);
  await seed(p, asContent(STRUCT));
  // E1: la tarjeta grande con «Empezar»
  await expect(p.locator('#hd-tag')).toHaveText('Tu rutina · de tu coach');
  await expect(p.locator('#hd-title')).toHaveText('Piernas v2');
  await expect(p.locator('#hd-text')).toHaveText('3 ejercicios');
  await p.locator('#btn-home-daily').click();
  const dlg = p.locator('#dlg-paso');
  await expect(dlg).toBeVisible();
  await expect(p.locator('#paso-name')).toHaveText('Sentadilla goblet');
  await expect(p.locator('#paso-line')).toHaveText('2 series · 12 repeticiones · 12 kg · descanso 30 s');
  await expect(p.locator('#paso-sets li')).toHaveText(['Serie 1', 'Serie 2']);
  await expect(p.locator('#paso-sets li.now')).toHaveText('Serie 1');
  await expect(p.locator('#paso-media img')).toBeVisible();   // la animación del coach, en grande
  await expect(p.locator('#paso-lbl')).toHaveText('Animación del coach');
  await expect(p.locator('#paso-t')).toHaveText('12');
  await expect(p.locator('#paso-idx')).toHaveText('1 / 3');
  await expect(p.locator('#paso-main')).toHaveText('Serie hecha ✓');
  // Serie hecha → descanso del coach (30 s) en el anillo
  await p.locator('#paso-main').click();
  await expect(p.locator('#paso-t')).toHaveText('00:30');
  await expect(p.locator('#paso-s')).toHaveText('Descanso');
  await expect(p.locator('#paso-main')).toHaveText('❚❚ Pausa');
  await expect(p.locator('#paso-sets li.ok')).toHaveText(['Serie 1: hecha1 ✓']);
  await expect(p.locator('#paso-pct')).toHaveText('20 %');   // 1 de 5 (2 + 1 del texto libre + 2)
  await p.clock.runFor(10_000);
  await expect(p.locator('#paso-t')).toHaveText('00:20');
  // Pausa: no baja
  await p.locator('#paso-main').click();
  await expect(p.locator('#paso-main')).toHaveText('▶ Seguir');
  await expect(p.locator('#paso-s')).toHaveText('En pausa');
  await p.clock.runFor(30_000);
  await expect(p.locator('#paso-t')).toHaveText('00:20');
  await p.locator('#paso-main').click();
  await p.clock.runFor(20_300);
  // Fin del descanso: vibración corta y aviso visual; sigue la serie 2 (sin sonido)
  await expect(p.locator('#paso-sets li.now')).toHaveText('Serie 2');
  await expect(p.locator('#paso-live')).toHaveText('Descanso terminado. Serie 2.');
  expect(await p.evaluate(() => window.__vib)).toEqual([200]);
  await expect(p.locator('#paso-timer')).toHaveClass(/flash/);
  expect(await p.locator('#dlg-paso audio').count()).toBe(0);
  // Última serie: pasa al siguiente ejercicio (texto libre: «Hecho ›» sin temporizador)
  await p.locator('#paso-main').click();
  await expect(p.locator('#paso-name')).toHaveText('Plancha');
  await expect(p.locator('#paso-free')).toHaveText('Aguanta 30 s, 3 veces');
  await expect(p.locator('#paso-timer')).toBeHidden();
  await expect(p.locator('#paso-sets')).toBeHidden();
  await expect(p.locator('#paso-main')).toHaveText('Hecho ›');
  await expect(p.locator('#paso-media')).toContainText('Tu coach todavía no agregó una demostración');
  // › salta al siguiente; ‹ vuelve
  await p.locator('#paso-skip').click();
  await expect(p.locator('#paso-name')).toHaveText('Puente de glúteo');
  await expect(p.locator('#paso-line')).toHaveText('2 series · 15 repeticiones');
  await p.locator('#paso-prev').click();
  await expect(p.locator('#paso-name')).toHaveText('Plancha');
  await p.locator('#paso-main').click();
  // Sin descanso del coach: las series siguen sin temporizador
  await p.locator('#paso-main').click();
  await expect(p.locator('#paso-sets li.now')).toHaveText('Serie 2');
  await expect(p.locator('#paso-main')).toHaveText('Serie hecha ✓');
  await p.locator('#paso-main').click();
  // E4: Entreno completo
  await expect(p.locator('#paso-end')).toBeVisible();
  await expect(p.locator('#paso-end-title')).toHaveText('¡Entreno completo!');
  await expect(p.locator('#pe-ex')).toHaveText('3/3');
  await expect(p.locator('#pe-sets')).toHaveText('4');
  await expect(p.locator('#pe-week')).toHaveText('1/7');
  expect((await H.habitsOf(p)).trained).toBe(true);   // «Ya entrené», igual que el botón de Entrenar
  await expect(p.locator('#paso-esf button')).toHaveText(['Fácil', 'Normal', 'Duro', 'No pude terminar']);
  await p.locator('#paso-esf button', { hasText: 'Duro' }).click();
  expect((await H.habitsOf(p)).effort).toBe('duro');
  await expect(p.locator('#paso-esf button', { hasText: 'Duro' })).toHaveAttribute('aria-pressed', 'true');
  await expect(p.locator('#paso-end-foot')).toHaveText('Laura Fit verá que entrenaste y cómo te sentiste.');
  // Pregunta de dolor del concepto 4: «No»
  await expect(p.locator('#pd-q-end')).toHaveText(QUESTION);
  await expect(p.locator('#pd-end button')).toHaveText(['No', 'Sí']);
  await p.locator('#pd-end button', { hasText: 'No' }).click();
  await expect(p.locator('#pd-end-status')).toHaveText('Gracias.');
  await expect.poll(async () => (await painOf(p)).map((x) => x.pain)).toEqual([false]);
  await p.locator('#paso-done').click();
  await expect(dlg).toBeHidden();
  await expect(p.locator('#btn-home-daily')).toBeVisible();   // con «No» se puede volver a empezar
  await expect(p.locator('#dia-entrene')).toHaveAttribute('aria-pressed', 'true');
  // La app no prescribe: ningún número inventado en el paso a paso (solo lo del coach)
  expect(await p.locator('#dlg-paso').innerText()).not.toMatch(/kcal|te recomendamos|sugerimos/i);
  expect(errors).toEqual([]);
});

test('E3 sin video y con solo texto libre: aviso amable, «Hecho ›» sin temporizador; ✕ a mitad pregunta por el dolor; «No» cierra sin marcar «Ya entrené»', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo);
  await seed(p, [{ name: 'Caminata', sets: '20 minutos a ritmo suave' }, { name: 'Estiramientos', sets: 'Lo que te pida el cuerpo' }], { title: 'Movilidad', withGif: false });
  await p.locator('#tab-entrenar').click();
  await expect(p.locator('#rutina-cards .rcard')).toHaveCount(1);
  await expect(p.locator('#rutina-cards .rcard[data-gif]')).toHaveCount(0);   // sin video: dibujo de color
  await expect(p.locator('#rutina-cards .rcard-art')).toBeVisible();
  await expect(p.locator('#rutina-cards .rcard-chip')).toHaveText('2 ejercicios');
  expect(await p.locator('#rutina-cards').innerText()).not.toMatch(/min|minutos/);   // no hay duración
  await p.locator('#rutina-cards .rcard-btn').click();
  await expect(p.locator('#paso-name')).toHaveText('Caminata');
  await expect(p.locator('#paso-media')).toHaveText('Tu coach todavía no agregó una demostración de este ejercicio. Si tienes dudas de cómo hacerlo, pregúntale.');
  await expect(p.locator('#paso-free')).toHaveText('20 minutos a ritmo suave');
  await expect(p.locator('#paso-timer')).toBeHidden();
  await expect(p.locator('#paso-main')).toHaveText('Hecho ›');
  await p.locator('#paso-main').click();
  await expect(p.locator('#paso-name')).toHaveText('Estiramientos');
  // ✕ a mitad: la pregunta cerrada; «Volver al entreno» regresa donde iba
  await p.locator('#paso-x').click();
  await expect(p.locator('#paso-ask')).toBeVisible();
  await expect(p.locator('#pd-q-ask')).toHaveText(QUESTION);
  await expect(p.locator('#pd-ask button')).toHaveText(['No', 'Sí']);
  await expect(p.locator('#paso-ask textarea, #paso-ask input')).toHaveCount(0);   // no se pregunta qué duele
  await p.locator('#paso-ask-back').click();
  await expect(p.locator('#paso-name')).toHaveText('Estiramientos');
  await p.keyboard.press('Escape');   // Esc = ✕
  await expect(p.locator('#paso-ask')).toBeVisible();
  await p.locator('#pd-ask button', { hasText: 'No' }).click();
  await expect(p.locator('#dlg-paso')).toBeHidden();
  expect((await H.habitsOf(p)) || {}).not.toMatchObject({ trained: true });   // salió a mitad: no se marca «Ya entrené»
  expect((await painOf(p)).map((x) => x.pain)).toEqual([false]);
  expect(errors).toEqual([]);
});

test('aviso de dolor «Sí» (concepto 4): bloqueo preventivo LITERAL cuando el servidor confirma; ese día no se ofrece «Empezar»; el coach ve «▲ Reportó dolor» aunque no compartan hábitos y lo marca revisado', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo, { habits: false });
  await seed(p, asContent(STRUCT));
  await p.locator('#btn-home-daily').click();
  await p.locator('#paso-main').click();
  await p.locator('#paso-x').click();
  await p.locator('#pd-ask button', { hasText: 'Sí' }).click();
  await expect(p.locator('#paso-block')).toBeVisible();
  await expect(p.locator('#pb-text')).toHaveText(BLOCK);
  await expect(p.locator('#pb-text')).toBeVisible();
  expect((await painOf(p)).map((x) => [x.pain, x.pausePrivate])).toEqual([[true, false]]);
  await p.locator('#pb-ok').click();
  await expect(p.locator('#dlg-paso')).toBeHidden();
  // Ese día no se ofrece volver a empezar; el resto de la app sigue
  await expect(p.locator('#btn-home-daily')).toBeHidden();
  await expect(p.locator('#hd-text')).toHaveText('Hoy reportaste dolor: el entreno guiado vuelve mañana.');
  await p.locator('#tab-entrenar').click();
  await p.locator('#rutina-cards .rcard-btn').click();
  await expect(p.locator('#dlg-paso')).toBeHidden();
  await expect(p.locator('#toast')).toContainText('Hoy reportaste dolor');
  await expect(p.locator('#btn-rutina-trained')).toBeVisible();
  await p.locator('#tab-panel').click();
  await p.locator('#dia-agua').click();
  await expect(p.locator('#dia-agua-t')).toHaveText('Agua 1 / 8');
  // El coach: indicador en la lista y en la ficha, sin detalle; «Marcar revisado»
  const c = await coachFrom(browser, testInfo, p);
  const row = c.p.locator('#coach-clients li').first();
  await expect(row.locator('.cli-dolor')).toHaveText('▲ Reportó dolor · 21 oct');
  await expect(row.locator('.cli-salud').first()).toBeVisible();
  await row.locator('.cli-main').click();
  await expect(c.p.locator('#fc-dolor')).toBeVisible();
  await expect(c.p.locator('#fc-dolor-t')).toHaveText('Reportó dolor · 21 oct');
  expect(await c.p.locator('#coach-detail-view').innerText()).not.toMatch(/rodilla|espalda baja|qué le duele:/i);
  await c.p.locator('#btn-fc-dolor').click();
  await expect(c.p.locator('#fc-dolor')).toBeHidden();
  await expect(c.p.locator('#toast')).toContainText('Marcado como revisado');
  await c.p.locator('#tab-coach').click();
  await expect(c.p.locator('#coach-clients .cli-dolor')).toHaveCount(0);
  expect(await c.p.evaluate(() => Object.values(window.__pgFakeBackend.painReports).map((x) => !!x.reviewedAt))).toEqual([true]);
  expect(errors).toEqual([]);
  expect(c.errors).toEqual([]);
});

test('coach: «Marcar revisado» también desde la lista', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo);
  await seed(p, asContent(STRUCT));
  await p.evaluate(async () => { const r = RemoteFake.createFake({ backend: window.__pgFakeBackend, storage: localStorage }); await r.client.reportPain('2026-10-21', true, { version: '1.0-D4', textHash: 'c'.repeat(64) }); });
  const c = await coachFrom(browser, testInfo, p);
  await expect(c.p.locator('#coach-clients .cli-dolor')).toHaveText('▲ Reportó dolor · 21 oct');
  await c.p.locator('#coach-clients [data-pain-review]').click();
  await expect(c.p.locator('#coach-clients .cli-dolor')).toHaveCount(0);
  await expect(c.p.locator('#coach-clients [data-pain-review]')).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(c.errors).toEqual([]);
});

test('«Reducir movimiento»: en Entrenar no se reproduce ningún video ni GIF (dibujo de color) y en el paso a paso el GIF queda como imagen fija con «Ver la animación»', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo);
  await seed(p, asContent(STRUCT));
  // Sin la opción: la tarjeta que se ve carga el GIF del coach de fondo (una sola a la vez)
  await p.locator('#tab-entrenar').click();
  await expect(p.locator('#rutina-cards .rcard.has-media .rcard-video')).toHaveCount(1);
  await p.emulateMedia({ reducedMotion: 'reduce' });
  await p.locator('#tab-panel').click();
  await p.locator('#tab-entrenar').click();
  await expect(p.locator('#rutina-cards .rcard')).toHaveCount(1);
  await p.waitForTimeout(400);
  await expect(p.locator('#rutina-cards .rcard-video, #rutina-cards video, #rutina-cards img')).toHaveCount(0);
  await expect(p.locator('#rutina-cards .rcard-art')).toBeVisible();
  await p.locator('#rutina-cards .rcard-btn').click();
  await expect(p.locator('#paso-media canvas.paso-still')).toBeVisible();
  await expect(p.locator('#paso-media img, #paso-media video[autoplay]')).toHaveCount(0);
  await p.locator('#paso-media .paso-play').click();
  await expect(p.locator('#paso-media img')).toBeVisible();
  // Sin transiciones en los anillos
  expect(await p.evaluate(() => getComputedStyle(document.querySelector('.pt-arc')).transitionDuration)).toBe('0s');
  expect(errors).toEqual([]);
});

test('390 px con letra al 200 %: Inicio, Entrenar, paso a paso, entreno completo y bloqueo sin cortes ni desborde; contraste AA en oscuro y claro', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo);
  await seed(p, asContent(STRUCT));
  await p.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const sinDesborde = async (donde) => {
    const bad = await p.evaluate(() => {
      const out = [];
      const vw = document.documentElement.clientWidth;
      if (document.documentElement.scrollWidth > vw) out.push('scroll horizontal ' + document.documentElement.scrollWidth);
      const dlg = document.querySelector('#dlg-paso[open]');
      if (dlg && dlg.scrollWidth > dlg.clientWidth + 1) out.push('el paso a paso desborda');
      for (const el of document.querySelectorAll('button, .btn, #paso-t, .rcard-title, .sd')) {
        if (!el.offsetParent || el.closest('.hidden, dialog:not([open])')) continue;
        const r = el.getBoundingClientRect();
        if (r.width && (r.left < -0.5 || r.right > vw + 0.5)) out.push(`${el.id || el.className} fuera ${Math.round(r.left)}-${Math.round(r.right)}`);
      }
      return out;
    });
    expect(bad, donde).toEqual([]);
  };
  for (const scheme of ['dark', 'light']) {
    await p.emulateMedia({ colorScheme: scheme });
    await p.locator('#tab-panel').click();
    await sinDesborde(`${scheme}: Inicio`);
    for (const sel of ['#hd-title', '#hd-tag', '#btn-home-daily', '#dia-agua-t', '#semana-count', '.tabbar button.on .tb-label']) expect(await H.contrast(p, sel), `${scheme}: ${sel}`).toBeGreaterThanOrEqual(4.5);
    await p.locator('#tab-entrenar').click();
    await sinDesborde(`${scheme}: Entrenar`);
    expect(await H.contrast(p, '#rutina-cards .rcard-title'), `${scheme}: título de la tarjeta`).toBeGreaterThanOrEqual(4.5);
    await p.locator('#rutina-cards .rcard-btn').click();
    await sinDesborde(`${scheme}: paso a paso`);
    for (const sel of ['#paso-name', '#paso-line', '#paso-main', '#paso-t', '#paso-hint']) expect(await H.contrast(p, sel), `${scheme}: ${sel}`).toBeGreaterThanOrEqual(4.5);
    await p.locator('#paso-main').click();
    expect(await H.contrast(p, '#paso-main'), `${scheme}: Pausa`).toBeGreaterThanOrEqual(4.5);
    await sinDesborde(`${scheme}: descanso`);
    for (let i = 0; i < 12 && !(await p.locator('#paso-end').isVisible()); i++) await p.locator('#paso-skip').click();
    await expect(p.locator('#paso-end')).toBeVisible();
    await sinDesborde(`${scheme}: entreno completo`);
    for (const sel of ['#paso-end-title', '#pe-ex', '#paso-done']) expect(await H.contrast(p, sel), `${scheme}: ${sel}`).toBeGreaterThanOrEqual(4.5);
    await p.locator('#paso-done').click();
  }
  // El bloqueo preventivo también se lee entero
  await p.locator('#tab-panel').click();
  await p.locator('#btn-home-daily').click();
  await p.locator('#paso-x').click();
  await sinDesborde('pregunta de dolor');
  await p.locator('#pd-ask button', { hasText: 'Sí' }).click();
  await expect(p.locator('#pb-text')).toBeVisible();
  await sinDesborde('bloqueo');
  expect(await H.contrast(p, '#pb-text')).toBeGreaterThanOrEqual(4.5);
  expect(errors).toEqual([]);
});
