// UX Etapa 1 (puntos 2 a 5): contraste y letra grande, la nueva barra, Inicio «Mi día» (registro de un toque con guardado automático, constancia semanal con comodines,
// aviso de pago solo a ≤ 7 días) y la celebración al guardar (sin culpa). Producto 'coach', servidor FALSO, reloj fijo: miércoles 21-oct-2026.
const { test, expect } = require('@playwright/test');
const H = require('./ux1-helpers');

const labels = async (p) => (await p.locator('.tabbar button:visible').allTextContents()).map((x) => x.trim());

test('barra del asesorado: Inicio · Comidas · Entrenar · Progreso · Más; Hábitos vive en Inicio y Medidas y Fotos dentro de Progreso', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo);
  expect(await labels(p)).toEqual(['Inicio', 'Comidas', 'Entrenar', 'Progreso', 'Más']);
  await expect(p.locator('#tab-panel')).toHaveAttribute('aria-current', 'page');
  await expect(p.locator('#topbar-title')).toHaveText('Inicio');
  await expect(p.locator('#today-label')).toHaveText('mié 21 oct');
  // Hábitos ya no es una pestaña: está en Inicio («Mi día»)
  await expect(p.locator('#tab-habitos, #tab-medidas, #tab-fotos')).toHaveCount(0);
  await expect(p.locator('#home-dia')).toBeVisible();
  // Cada pestaña lleva a su pantalla y se marca como actual
  for (const [tab, view, title] of [['comidas', 'micomidas', 'Comidas'], ['entrenar', 'rutina', 'Entrenar'], ['registro', 'progreso', 'Progreso']]) {
    await p.locator('#tab-' + tab).click();
    await expect(p.locator('#view-' + view)).toBeVisible();
    await expect(p.locator('#tab-' + tab)).toHaveAttribute('aria-current', 'page');
    await expect(p.locator('#topbar-title')).toHaveText(title);
  }
  // Progreso: Medidas · Fotos · Insignias; la pestaña «Progreso» sigue marcada en las tres; «Medirme» es una pantalla aparte
  const seg = p.locator('#view-progreso .prog-seg button');
  await expect(seg).toHaveText(['Medidas', 'Fotos', 'Insignias']);
  await seg.nth(1).click();
  await expect(p.locator('#view-fotos')).toBeVisible();
  await expect(p.locator('#tab-registro')).toHaveAttribute('aria-current', 'page');
  // Fotos e Insignias son pantallas hijas: «‹ Progreso» a la izquierda de la barra superior; «+ Foto» a la derecha en Fotos
  await expect(p.locator('#topbar-title')).toHaveText('Fotos');
  await expect(p.locator('#topbar-back')).toHaveText('‹ Progreso');
  await expect(p.locator('#btn-foto-add')).toHaveCount(1);   // aparece con las fotos autorizadas
  await p.locator('#topbar-back').click();
  await expect(p.locator('#view-progreso')).toBeVisible();
  await expect(p.locator('#btn-foto-add')).toBeHidden();
  await seg.nth(2).click();
  await expect(p.locator('#view-insignias')).toBeVisible();
  await expect(p.locator('#tab-registro')).toHaveAttribute('aria-current', 'page');
  await expect(p.locator('#topbar-back')).toBeVisible();
  await p.locator('#topbar-back').click();
  await p.locator('#btn-medirme').click();
  await expect(p.locator('#view-medidas')).toBeVisible();
  await expect(p.locator('#tab-registro')).toHaveAttribute('aria-current', 'page');
  // Más conserva lo demás y ya no repite lo que está en la barra
  await p.locator('#tab-mas').click();
  const rows = (await p.locator('#view-mas .more-row:visible strong').allTextContents()).map((x) => x.trim());
  expect(rows).toEqual(expect.arrayContaining(['Mi coach', 'Mis datos y permisos', 'Descargar una copia', 'Cómo instalar la app', 'Ayuda', 'Cerrar sesión']));
  expect(rows).not.toContain('Mis comidas');
  expect(rows).not.toContain('Mi rutina');
  expect(rows).not.toContain('Mis rutinas');
  expect(errors).toEqual([]);
});

test('barra del coach: Asesorados · Rutinas · Invitar · Más; «Mis rutinas» pasa a la barra', async ({ browser }, testInfo) => {
  const ph = await H.phone(browser, testInfo, { prefs: {} });
  const { p, errors } = ph;
  await p.goto('index.html');
  await H.acceptSolo(p);
  await H.seedCoach(p, 'laura@coach.co', 'Laura Fit');
  await p.evaluate(async () => {
    const be = window.__pgFakeBackend;
    const r = RemoteFake.createFake({ backend: be, storage: localStorage });
    await r.auth.sendCode('laura@coach.co');
    const { user } = await r.auth.verifyCode('laura@coach.co', be.lastCode('laura@coach.co'));
    const c = await r.coach.myCoach();
    const ev = { granted: true, version: 't', textHash: 'a'.repeat(64), clientAt: '2026-10-01T12:00:00.000Z' };
    localStorage.setItem('perdida-grasa:account', JSON.stringify({ userId: user.id, email: user.email, roles: ['client', 'coach'], onboarded: true, coach: c, cloudAsked: true,
      consents: { sensitive_health: { ...ev, version: '0.2-AU' }, cloud_transfer: { ...ev, version: '0.2-AU' }, coach_agreement: { ...ev, version: ConsentTexts.version('A7') } } }));
    localStorage.setItem('perdida-grasa:owner', user.id);
  });
  await p.reload(); await H.ready(p);
  expect(await labels(p)).toEqual(['Asesorados', 'Rutinas', 'Invitar', 'Más']);
  await expect(p.locator('#tab-coach')).toHaveAttribute('aria-current', 'page');
  await p.locator('#tab-rutinas').click();
  await expect(p.locator('#view-rutinas')).toBeVisible();
  await expect(p.locator('#tab-rutinas')).toHaveAttribute('aria-current', 'page');
  await expect(p.locator('#topbar-title')).toHaveText('Rutinas');
  await expect(p.locator('#view-rutinas .back-btn')).toBeHidden();
  await p.locator('#tab-invitar').click();
  await expect(p.locator('#view-invitar')).toBeVisible();
  await p.locator('#tab-mas').click();
  const rows = (await p.locator('#view-mas .more-row:visible strong').allTextContents()).map((x) => x.trim());
  expect(rows).not.toContain('Mis rutinas');
  expect(rows).toContain('Mi acuerdo');
  expect(errors).toEqual([]);
});

test('contraste: el texto sobre turquesa (botones, barra de arriba, chips) pasa de 4,5:1 en oscuro y en claro', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo);
  for (const scheme of ['dark', 'light']) {
    await p.emulateMedia({ colorScheme: scheme });
    await p.locator('#tab-panel').click();
    expect(await H.contrast(p, '.topbar h1'), `${scheme}: barra de arriba`).toBeGreaterThanOrEqual(4.5);
    expect(await H.contrast(p, '#today-label'), `${scheme}: fecha de la barra`).toBeGreaterThanOrEqual(4.5);
    await p.locator('#tab-registro').click();
    expect(await H.contrast(p, '.prog-seg button.on'), `${scheme}: pestaña activa de Progreso`).toBeGreaterThanOrEqual(4.5);
    await p.locator('#tab-entrenar').click();
    expect(await H.contrast(p, '#btn-rutina-trained'), `${scheme}: «Ya entrené»`).toBeGreaterThanOrEqual(4.5);
    await p.locator('#tab-comidas').click();
    expect(await H.contrast(p, '#btn-mc-add'), `${scheme}: «+ Comida»`).toBeGreaterThanOrEqual(4.5);
    expect(await H.contrast(p, '.tabbar button.on .tb-label'), `${scheme}: pestaña activa de la barra`).toBeGreaterThanOrEqual(4.5);
    expect(await H.contrast(p, '#mc-bienestar'), `${scheme}: texto secundario`).toBeGreaterThanOrEqual(4.5);
  }
  // En oscuro el texto de los botones es oscuro (antes era blanco sobre #2dd4bf: 1,9:1); en claro, blanco sobre el turquesa profundo
  await p.emulateMedia({ colorScheme: 'dark' });
  await p.locator('#tab-panel').click();
  expect(await p.evaluate(() => getComputedStyle(document.querySelector('.topbar h1')).color)).toBe('rgb(6, 32, 28)');
  await p.emulateMedia({ colorScheme: 'light' });
  expect(await p.evaluate(() => [getComputedStyle(document.querySelector('.topbar h1')).color, getComputedStyle(document.querySelector('.topbar')).backgroundColor])).toEqual(['rgb(255, 255, 255)', 'rgb(15, 118, 110)']);
  expect(errors).toEqual([]);
});

test('letra grande (texto al 200 %) a 390 px: la barra de arriba y las pestañas no se cortan, ni el asesorado ni el coach', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo);
  await p.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const sinCortes = async (donde) => {
    const r = await p.evaluate(() => {
      const out = [];
      const vw = document.documentElement.clientWidth;
      if (document.documentElement.scrollWidth > vw) out.push(`scroll horizontal ${document.documentElement.scrollWidth}`);
      const h1 = document.querySelector('.topbar h1'), date = document.querySelector('#today-label'), bar = document.querySelector('.topbar');
      for (const [n, el] of [['título', h1], ['fecha', date]]) { const b = el.getBoundingClientRect(); if (b.left < -0.5 || b.right > vw + 0.5) out.push(`${n} fuera de pantalla ${Math.round(b.left)}-${Math.round(b.right)}`); if (el.scrollWidth > el.clientWidth + 1) out.push(`${n} cortado`); if (getComputedStyle(el).textOverflow === 'ellipsis') out.push(`${n} con puntos suspensivos`); }
      if (bar.scrollWidth > bar.clientWidth + 1) out.push('barra de arriba desborda');
      for (const btn of document.querySelectorAll('.tabbar button')) {
        if (!btn.offsetParent) continue;
        const l = btn.querySelector('.tb-label'), b = l.getBoundingClientRect(), bb = btn.getBoundingClientRect();
        if (l.scrollWidth > l.clientWidth + 1) out.push(`pestaña «${l.textContent}» cortada`);
        if (b.left < bb.left - 0.5 || b.right > bb.right + 0.5 || b.right > vw + 0.5) out.push(`pestaña «${l.textContent}» se sale de su botón`);
        if (getComputedStyle(l).textOverflow === 'ellipsis') out.push(`pestaña «${l.textContent}» con puntos suspensivos`);
        if (!l.textContent.trim()) out.push('pestaña sin etiqueta');
      }
      return out;
    });
    expect(r, donde).toEqual([]);
  };
  await sinCortes('Inicio');
  for (const [tab, title] of [['comidas', 'Comidas'], ['entrenar', 'Entrenar'], ['registro', 'Progreso'], ['mas', 'Más']]) {
    await p.locator('#tab-' + tab).click();
    await expect(p.locator('#topbar-title')).toHaveText(title);
    await sinCortes(title);
  }
  await p.locator('#tab-registro').click();
  await p.locator('#btn-medirme').click();
  await sinCortes('Medirme');
  await p.locator('#tab-panel').click();
  await p.locator('[data-goto="habitos"]').click();
  await sinCortes('Corregir otro día');   // título largo: pasa a otra línea sin cortarse
  // Las etiquetas son el texto completo (accesibles), no abreviaturas
  expect(await labels(p)).toEqual(['Inicio', 'Comidas', 'Entrenar', 'Progreso', 'Más']);
  expect(errors).toEqual([]);
});

test('Inicio «Mi día»: nota del coach sin leer arriba; agua +1 por toque, sueño con selector, pasos en tramos y «Entrené» se guardan solos, con Deshacer', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo);
  await p.addStyleTag({ content: H.WIDE });
  await expect(p.locator('#home-greeting')).toHaveText('Hola, Ana');
  await expect(p.locator('#home-sub')).toHaveText('Hoy solo hay una tarea: registrar tu día. Te toma menos de un minuto.');
  // Una nota del coach SIN LEER va arriba de todo (antes de «Mi día»); ya leída baja a «Mensajes anteriores»
  await p.evaluate(() => {
    const m = PGAccount.meta();
    localStorage.setItem('perdida-grasa:comments', JSON.stringify([{ id: '00000000-0000-4000-8000-00000000c001', clientId: m.userId, body: 'Ana, esta semana registraste 6 de 7 días. ¿Qué te funcionó mejor?', refDate: '2026-10-20', createdAt: '2026-10-20T15:00:00.000Z', readAt: null }]));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(p.locator('#coach-notes')).toBeVisible();
  await expect(p.locator('#coach-notes-title')).toContainText('te escribió');
  const y = (sel) => p.locator(sel).evaluate((e) => e.getBoundingClientRect().top);
  expect(await y('#coach-notes')).toBeLessThan(await y('#home-dia'));
  await H.layout(p); await H.tall(p, '#home-dia');
  await H.shot(p, 'ux1-inicio-mi-dia.png', { fullPage: true });
  // Agua: +1 vaso por toque, guardado al instante (sin botón «Guardar»)
  await expect(p.locator('#dia-agua-t')).toHaveText('Agua 0 / 8');
  await expect(p.locator('#home-dia').getByRole('button', { name: /^Guardar/ })).toHaveCount(0);
  for (let i = 1; i <= 3; i++) {
    await p.locator('#dia-agua').click();
    await expect(p.locator('#dia-agua-t')).toHaveText(`Agua ${i} / 8`);
    expect((await H.habitsOf(p)).water).toBeCloseTo(i * 0.25, 5);
  }
  await expect(p.locator('#toast')).toContainText('Registrado. Mañana sumamos');
  await expect(p.locator('#toast .toast-action')).toHaveText('Deshacer');
  await p.locator('#toast .toast-action').click();
  await expect(p.locator('#dia-agua-t')).toHaveText('Agua 2 / 8');
  expect((await H.habitsOf(p)).water).toBeCloseTo(0.5, 5);
  // Sueño: selector rápido
  await p.locator('#dia-sueno').click();
  await expect(p.locator('#dia-sueno-opts button')).toHaveText(['<6 h', '6–7 h', '7–8 h', '8 h o más']);
  await p.locator('#dia-sueno-opts button', { hasText: '7–8 h' }).click();
  await expect(p.locator('#dia-sueno-t')).toHaveText('Sueño 7–8 h');
  expect((await H.habitsOf(p)).sleep).toBe(7.5);
  await expect(p.locator('#dia-sueno-opts')).toBeHidden();
  // Pasos en tramos <4k / 4–8k / 8k+ (de nuevo el mismo tramo lo quita)
  await p.locator('#dia-pasos').click();
  await expect(p.locator('#dia-pasos-opts button')).toHaveText(['<4 mil', '4–8 mil', '8 mil+']);
  await p.locator('#dia-pasos-opts button', { hasText: '4–8 mil' }).click();
  expect((await H.habitsOf(p)).steps).toBe(6000);
  await expect(p.locator('#dia-pasos-opts')).toBeHidden();
  await p.locator('#dia-pasos').click();
  await expect(p.locator('#dia-pasos-opts button', { hasText: '4–8 mil' })).toHaveAttribute('aria-pressed', 'true');
  await p.locator('#dia-pasos-opts button', { hasText: '8 mil+' }).click();
  expect((await H.habitsOf(p)).steps).toBe(8000);
  await p.locator('#dia-pasos').click();
  await p.locator('#dia-pasos-opts button', { hasText: '8 mil+' }).click();
  expect((await H.habitsOf(p)).steps).toBeUndefined();
  // Entrené
  await p.locator('#dia-entrene').click();
  expect((await H.habitsOf(p)).trained).toBe(true);
  await expect(p.locator('#dia-entrene')).toHaveAttribute('aria-pressed', 'true');
  await expect(p.locator('#toast')).toContainText('Entrenamiento anotado');
  await expect(p.locator('#toast .toast-action')).toHaveText('Contar cómo te sentiste');
  await p.locator('#dia-entrene').click();
  expect((await H.habitsOf(p)).trained).toBe(false);
  // Cada registro cuenta para la semana: aparece en «Tu semana»
  await expect(p.locator('#semana-count')).toHaveText('1 de 7 días');
  await expect(p.locator('#semana-days li')).toHaveCount(7);
  await expect(p.locator('#semana-days li.hoy.on')).toHaveCount(1);
  await expect(p.locator('#dia-status')).toContainText('Llevas 1 día esta semana');
  // Sin kcal en Inicio
  expect(await p.locator('#view-panel').evaluate((v) => v.innerText)).not.toMatch(/kcal/i);
  // Se guardó en el teléfono sin tocar nada más: sigue ahí tras recargar
  await p.reload(); await H.ready(p);
  await expect(p.locator('#dia-agua-t')).toHaveText('Agua 2 / 8');
  await expect(p.locator('#dia-sueno-t')).toHaveText('Sueño 7–8 h');
  expect(errors).toEqual([]);
});

test('Inicio: «Igual que ayer», «+ Comida», mensaje de regreso sin culpa y «Rutina de hoy» única; en pausa por pago el registro sigue bloqueado', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo);
  await H.seedState(p, { habits: { [H.iso(-1)]: { water: 2, steps: 8000, sleep: 7.5, trained: true, effort: 'duro', close: 'si' } } });
  await expect(p.locator('#home-sub')).toHaveText('Hoy solo hay una tarea: registrar tu día.');
  await p.locator('#dia-igual').click();
  await expect(p.locator('#dia-agua-t')).toHaveText('Agua 8 / 8');
  await expect(p.locator('#dia-sueno-t')).toHaveText('Sueño 7–8 h');
  const h = await H.habitsOf(p);
  expect([h.water, h.steps, h.sleep, h.trained, h.effort, h.close]).toEqual([2, 8000, 7.5, false, undefined, undefined]);   // el entreno y el esfuerzo de ayer NO se copian
  await expect(p.locator('#toast')).toContainText('repetimos lo de ayer');
  // «+ Comida» abre la hoja de comidas
  await p.locator('#dia-comida').click();
  await expect(p.locator('#view-micomidas')).toBeVisible();
  await expect(p.locator('#sheet-comida')).toBeVisible();
  await p.locator('#sc-close').click();
  // Regreso tras varios días sin registrar: mensaje cálido, sin culpa
  const q = await H.clientApp(browser, testInfo);
  await H.seedState(q.p, { habits: { [H.iso(-3)]: { water: 1 } } });
  await expect(q.p.locator('#home-sub')).toHaveText('Qué bueno verte. ¿Registramos hoy? Lo de ayer ya pasó; cuenta lo que haces desde aquí.');
  const r = await H.clientApp(browser, testInfo);
  await H.seedState(r.p, { habits: { [H.iso(-9)]: { water: 1 } } });
  await expect(r.p.locator('#home-sub')).toHaveText('Volver también es parte del proceso. Empecemos con lo más fácil: ¿cuántos vasos de agua llevas?');
  for (const t of [await q.p.locator('#view-panel').innerText(), await r.p.locator('#view-panel').innerText()]) expect(t).not.toMatch(/fallaste|perdiste|racha|castigo/i);
  // En pausa por pago (UX Etapa 2, P1): Mi día sigue en modo autónomo (agua y sueño)
  await H.setPaid(p, -3);
  await p.evaluate(() => PGAccount.refreshLink());
  await p.locator('#tab-panel').click();
  await expect(p.locator('#pause-card')).toBeVisible();
  await expect(p.locator('#pause-title')).toContainText('está en pausa');
  await expect(p.locator('#pause-text')).toContainText('Tu progreso está guardado');
  await expect(p.locator('#home-dia')).toBeVisible();
  await expect(p.locator('#dia-modo')).toHaveText('modo autónomo');
  await expect(p.locator('#pause-const')).toHaveText('congelada, no se pierde');
  expect(errors).toEqual([]);
});

test('Tu semana: constancia SEMANAL (≥ 4 días con registro), 2 comodines por semana aplicados a días pasados y cualquier registro cuenta', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo);
  // Hoy es miércoles 21. Semana en curso: lunes con hábitos y martes solo con comidas. Tres semanas anteriores constantes (la del 28-sep con 2 días y 2 comodines).
  const wk = (mon, days) => Object.fromEntries(days.map((n) => [H.iso(mon + n), { water: 2 }]));
  await H.seedState(p, { habits: { ...wk(-2, [0]), ...wk(-9, [0, 1, 2, 3]), ...wk(-16, [0, 1, 2, 4, 5]), ...wk(-23, [1, 3]) }, foods: { [H.iso(-1)]: [{ name: 'Arepa', kcal: 200 }] } });
  await expect(p.locator('#semana-count')).toHaveText('2 de 7 días');
  const cls = await p.locator('#semana-days li').evaluateAll((l) => l.map((x) => [x.textContent, x.className.replace(/\s+/g, ' ').trim()]));
  expect(cls.map((c) => c[0]).join('')).toBe('LMMJVSD');
  expect(cls[0][1]).toBe('sd on');
  expect(cls[1][1]).toBe('sd on');
  expect(cls[2][1]).toContain('hoy');
  expect(cls[3][1]).toContain('fut');
  // La semana en curso aún no suma (2 de 4); las 3 anteriores sí: la del 28-sep con 2 días + 2 comodines (nunca «perdiste»)
  await expect(p.locator('#semana-line')).toHaveText('3 semanas constantes');
  await p.locator('#dia-agua').click();
  await p.locator('#dia-agua').click();   // hoy también cuenta: miércoles con registro → 3 días en la semana
  await expect(p.locator('#semana-count')).toHaveText('3 de 7 días');
  await p.locator('#tab-registro').click();
  await expect(p.locator('#prog-stats')).toContainText('3semanas constantes');
  expect(errors).toEqual([]);
});

test('aviso de pago en Inicio: solo si faltan 7 días o menos, como una línea discreta (nada de «Faltan N días» ni cuenta regresiva)', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo, { paid: 30 });
  await expect(p.locator('#pay-countdown')).toBeHidden();
  await H.setPaid(p, 8); await p.evaluate(() => PGAccount.refreshLink());
  await expect(p.locator('#pay-countdown')).toBeHidden();
  await H.setPaid(p, 7); await p.evaluate(() => PGAccount.refreshLink());
  await expect(p.locator('#pay-countdown')).toBeVisible();
  await expect(p.locator('#pay-countdown')).toHaveText('Tu plan se renueva el 28 oct. Si tienes dudas, habla con tu coach.');
  await H.setPaid(p, 1); await p.evaluate(() => PGAccount.refreshLink());
  await expect(p.locator('#pay-countdown')).toHaveText('Tu plan se renueva mañana. Si tienes dudas, habla con tu coach.');
  // Va al final, después de «Tu semana»; no es una tarjeta de progreso
  const y = (sel) => p.locator(sel).evaluate((e) => e.getBoundingClientRect().top);
  expect(await y('#pay-countdown')).toBeGreaterThan(await y('#home-semana'));
  expect(await p.locator('#pay-countdown').evaluate((e) => e.classList.contains('card') || e.classList.contains('home-card'))).toBe(false);
  expect(errors).toEqual([]);
});

test('celebración: al completar los 4 hábitos sale «Día completo» (aro 4/4, dato de constancia e insignia nueva); sin «reducir movimiento» el aro no se anima', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo);
  await p.emulateMedia({ reducedMotion: 'reduce' });
  // Lunes y martes ya entrenó: el tercer entreno de la semana gana «Tres de tres»
  await H.seedState(p, { habits: { [H.iso(-2)]: { water: 2, trained: true }, [H.iso(-1)]: { water: 2, trained: true } } });
  for (let i = 0; i < 8; i++) await p.locator('#dia-agua').click();
  await p.locator('#dia-sueno').click(); await p.locator('#dia-sueno-opts button', { hasText: '7–8 h' }).click();
  await p.locator('#dia-pasos').click(); await p.locator('#dia-pasos-opts button', { hasText: '8 mil+' }).click();
  await expect(p.locator('#dlg-dia')).toBeHidden();   // aún faltan: sin celebración, solo el mensaje amable
  await p.locator('#dia-entrene').click();
  const d = p.locator('#dlg-dia');
  await expect(d).toBeVisible();
  await expect(p.locator('#dd-title')).toHaveText('Día completo');
  await expect(p.locator('#dd-frac')).toHaveText('4/4');
  await expect(p.locator('#dd-text')).toHaveText('Agua, sueño, pasos y entreno. Llevas 3 días esta semana.');
  await expect(p.locator('#dd-badge')).toContainText('Nueva insignia: Tres de tres');
  await expect(p.locator('#dd-badge')).toContainText('3 entrenos en una semana');
  await expect(p.locator('#dd-foot')).toContainText('verá tu semana en su resumen');
  // Con «reducir movimiento» no hay transición del aro; sin él, dura menos de 1 s
  expect(await p.locator('#dd-arc').evaluate((e) => getComputedStyle(e).transitionDuration)).toBe('0s');
  await p.emulateMedia({ reducedMotion: 'no-preference' });
  const dur = await p.locator('#dd-arc').evaluate((e) => parseFloat(getComputedStyle(e).transitionDuration));
  expect(dur).toBeGreaterThan(0);
  expect(dur).toBeLessThanOrEqual(1);
  expect(await p.locator('#dd-arc').evaluate((e) => e.style.strokeDashoffset)).toBe('0');
  await H.shot(p, 'ux1-celebracion.png');
  await p.locator('#dd-ok').click();
  await expect(d).toBeHidden();
  // Una sola vez al día: otro toque no la repite
  await p.locator('#dia-agua').click();
  await expect(d).toBeHidden();
  await expect(p.locator('#toast')).toContainText('Día completo');
  expect(errors).toEqual([]);
});

test('celebración sin culpa: «Registrado. Mañana sumamos» cuando el día no está completo; nunca «fallaste» ni «perdiste tu racha»', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo);
  await p.locator('#dia-listo').click();   // aún no hay nada anotado
  await expect(p.locator('#dlg-dia')).toBeHidden();
  await expect(p.locator('#toast')).toContainText('Todavía no anotas nada hoy');
  await p.locator('#dia-agua').click();
  await p.locator('#dia-sueno').click(); await p.locator('#dia-sueno-opts button', { hasText: '7–8 h' }).click();
  await p.locator('#dia-listo').click();
  await expect(p.locator('#dlg-dia')).toBeVisible();
  await expect(p.locator('#dd-title')).toHaveText('Registrado. Mañana sumamos');
  await expect(p.locator('#dd-frac')).toHaveText('1/4');
  await expect(p.locator('#dd-text')).toHaveText('Anotaste agua y sueño. Este día ya cuenta para tu semana: llevas 1 de 7.');
  await expect(p.locator('#dd-foot')).toHaveText('Tu constancia sigue intacta.');
  await expect(p.locator('#dd-badge')).toBeHidden();
  expect(await p.locator('#dlg-dia').innerText()).not.toMatch(/fallaste|perdiste|racha|castigo|culpa/i);
  await H.layout(p);
  await H.shot(p, 'ux1-registrado-manana.png');
  await p.locator('#dd-ok').click();
  expect(errors).toEqual([]);
});
