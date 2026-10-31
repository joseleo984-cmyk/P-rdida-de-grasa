// Insignias v4 · diseño B «Escudo por categoría» (equipo/diseno/v4-insignias/B1 y B2). Producto 'coach', servidor FALSO, miércoles 21-oct-2026.
// Colección con estados, hoja de detalle, momento de ganarla (y que no salte a mitad de un registro), «Reducir movimiento», 390 px con letra al 200 %
// y fuente ancha con contraste AA, nombre completo para el lector de pantalla, «Equipo» con la meta colectiva sin ver a nadie, y la ficha del coach.
const { test, expect } = require('@playwright/test');
const H = require('./ux1-helpers');
const { iso, TODAY } = H;

// Semanas pasadas (lunes) y días de la semana: el lunes de esta semana es iso(-2).
const mon = (w) => -2 - 7 * w;
function weekDays(w, n, h) { const o = {}; for (let i = 0; i < n; i++) o[iso(mon(w) + i)] = { ...h }; return o; }
const merge = (...xs) => { const o = {}; for (const x of xs) for (const [d, h] of Object.entries(x)) o[d] = { ...(o[d] || {}), ...h }; return o; };
const closeAviso = async (p) => { if (await p.locator('#btn-aviso-politica').isVisible()) await p.locator('#btn-aviso-politica').click(); };
const openLogros = async (p) => { await p.locator('#tab-registro').click(); await p.locator('#view-progreso .prog-seg button', { hasText: 'Logros' }).click(); await expect(p.locator('#view-insignias')).toBeVisible(); };
// Animaciones de un elemento y sus hijos: la que más tarda (retraso + duración, en ms).
const maxAnim = (p, sel) => p.evaluate((sel) => Math.max(0, ...document.querySelector(sel).getAnimations({ subtree: true }).map((a) => { const t = a.effect.getTiming(); return (t.delay || 0) + (Number(t.duration) || 0); })), sel);

// Ana: agua 5 días en 4 semanas (plata), 1 entreno hace 2 semanas, y esta semana sueño lunes y martes (en progreso).
const COLECCION = { habits: merge(weekDays(1, 5, { water: 2 }), weekDays(2, 5, { water: 2 }), weekDays(3, 5, { water: 2 }), weekDays(4, 5, { water: 2 }),
  { [iso(mon(2))]: { trained: true } }, { [iso(-2)]: { sleep: 8 }, [iso(-1)]: { sleep: 8 } }) };

test('colección: 6 categorías con su silueta y contador; ganada (nivel con ●●○ + palabra + galones), en progreso («2 de 5») y bloqueada («Aún no»); «Te falta poco»; nombre completo para el lector de pantalla', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo, { celebra: true });
  await closeAviso(p);
  await H.seedState(p, COLECCION);
  await openLogros(p);
  // Como el boceto B1: título «Progreso», «Medirme ›» y la pestaña «Logros» marcada
  await expect(p.locator('#topbar-title')).toHaveText('Progreso');
  await expect(p.locator('#btn-medirme')).toBeVisible();
  await expect(p.locator('#topbar-back')).toBeHidden();
  await expect(p.locator('#view-insignias .prog-seg button[aria-current="page"]')).toHaveText('Logros');
  await expect(p.locator('#view-progreso .prog-seg button')).toHaveText(['Medidas', 'Fotos', 'Logros', 'Puntos']);
  const rows = p.locator('#lg-cats .lg-row');
  await expect(rows.locator('h3')).toHaveText(['Primeros pasos', 'Constancia', 'Hábitos', 'Entreno', 'Registro', 'Retos']);
  for (const [i, shape] of ['circ', 'rombo', 'hex', 'shield', 'square', 'star'].entries()) await expect(rows.nth(i).locator('.lg-lab use')).toHaveAttribute('href', `#lg-s-${shape}`);
  await expect(rows.nth(2).locator('.lg-cnt')).toHaveText('1 de 4');
  await expect(p.locator('#lg-earned')).toHaveText('6');
  // Ganada con nivel: nombre completo para el lector de pantalla (el dibujo y los textos sueltos van ocultos)
  const hid = p.getByRole('button', { name: 'Hidratado/a, nivel plata, ganada el 16 oct. Para oro: 4 de 12 semanas' });
  await expect(hid).toBeVisible();
  await expect(hid.locator('.lg-st')).toHaveText('Plata');
  await expect(hid.locator('.lg-dots i.f')).toHaveCount(2);
  await expect(hid.locator('.lg-chev')).toHaveCount(2);
  expect(await hid.locator('svg.lg-svg').getAttribute('aria-hidden')).toBe('true');
  // En progreso: «2 de 5» y el relleno sube desde abajo
  const bd = p.locator('[data-logro="buen-dormir"]');
  await expect(bd).toHaveAttribute('aria-label', 'Buen dormir, en progreso: 2 de 5 noches esta semana');
  await expect(bd).toHaveClass(/st-progress/);
  await expect(bd.locator('.lg-st')).toHaveText('2 de 5');
  await expect(bd.locator('.lg-rise')).toHaveCount(1);
  // Bloqueada: silueta punteada, candado y «Aún no»
  const pp = p.locator('[data-logro="pata-de-perro"]');
  await expect(pp).toHaveAttribute('aria-label', 'Pata de perro, aún no la tienes');
  await expect(pp.locator('.lg-st')).toHaveText('Aún no');
  await expect(pp.locator('use[href="#lg-g-lock"]')).toHaveCount(2);
  await expect(pp.locator('.lg-dash')).toHaveAttribute('stroke-dasharray', '5 4.5');
  // Hito: ✓ y la fecha
  await expect(p.locator('[data-logro="arranco"] .lg-st')).toHaveText('21 sep');
  // «Te falta poco»: lo más avanzado de esta semana, con lo que falta
  await expect(p.locator('#lg-near .lg-tag')).toHaveText('Te falta poco');
  await expect(p.locator('#lg-near .lg-near-n')).toHaveText('Semanas constantes · 2 de 4 días');
  await expect(p.locator('#lg-near .lg-near-s')).toHaveText('Dos días más con registro esta semana.');
  // Toques de 44 px o más, foco visible y nada animado en la colección
  for (const b of await p.locator('#lg-cats .lg-tile').all()) { const r = await b.boundingBox(); expect(r.width >= 44 && r.height >= 44).toBe(true); }
  await p.locator('[data-logro="arranco"]').focus();
  await p.keyboard.press('Tab');
  await expect(p.locator('[data-logro="primera-semana"]')).toBeFocused();
  expect(await p.locator('[data-logro="primera-semana"]').evaluate((e) => getComputedStyle(e).outlineStyle)).toBe('solid');
  expect(await maxAnim(p, '#view-insignias')).toBe(0);
  // Nunca por peso, kcal, centímetros ni fotos; sin ranking
  expect(await p.locator('#lg-cats').innerText() + await p.locator('#lg-near').innerText()).not.toMatch(/\bkg\b|kcal|\bcm\b|foto|puesto|ranking de/i);
  await expect(p.locator('#view-insignias .lg-foot')).toHaveText('Las insignias reconocen tu constancia y tu proceso. Nunca se dan por peso, calorías ni centímetros, y no hay ranking entre asesorados.');
  await H.shot(p, 'ib-coleccion.png');
  expect(errors).toEqual([]);
});

test('detalle: qué es, tus niveles con fechas, progreso al siguiente con barra y la nota de constancia; se cierra con «Listo» o Esc y el foco vuelve', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo, { celebra: true });
  await closeAviso(p);
  await H.seedState(p, COLECCION);
  await openLogros(p);
  const tile = p.locator('[data-logro="hidratado"]');
  await tile.click();
  const d = p.locator('#dlg-logro');
  await expect(d).toBeVisible();
  await expect(p.locator('#lgd-title')).toBeFocused();
  await expect(p.locator('#lgd-band')).toHaveText('Hábitos · 1 de 4 ganada');
  await expect(p.locator('#lgd-title')).toHaveText('Hidratado/a');
  await expect(p.locator('#lgd-line')).toHaveText('Plata · 16 oct');
  await expect(p.locator('#lgd-new')).toBeHidden();
  await expect(p.locator('#lgd-what')).toHaveText('Cumplir tu meta de agua 5 días de una semana. Llevas 4 semanas así (no tienen que ser seguidas).');
  const lv = p.locator('#lgd-levels .lg-lvr');
  await expect(lv).toHaveText([/Bronce\s*25 sep/, /Plata\s*16 oct/, /Oro\s*4 de 12 semanas/]);
  await expect(lv.nth(2).locator('[role="progressbar"]')).toHaveAttribute('aria-valuenow', '33');
  await expect(p.locator('#lgd-note')).toHaveText('Cuenta tu constancia, no la cantidad: 8 vasos o 12 valen lo mismo. Nunca pierdes un nivel.');
  await H.shot(p, 'ib-detalle.png');
  await p.locator('#lgd-ok').click();
  await expect(d).toBeHidden();
  await expect(tile).toBeFocused();
  // Bloqueada: cómo se gana y lo de esta semana, sin fechas límite
  await p.locator('[data-logro="buen-dormir"]').click();
  await expect(p.locator('#lgd-line')).toHaveText('En progreso · 2 de 5 noches esta semana');
  await expect(p.locator('#lgd-levels')).toContainText('Esta semana: 2 de 5 noches');
  await expect(p.locator('#lgd-levels')).toContainText('0 de 1 semana');
  await p.keyboard.press('Escape');
  await expect(d).toBeHidden();
  expect(errors).toEqual([]);
});

test('momento de ganarla: sale solo al terminar la acción (no a mitad de los toques del agua), con borde que se enciende, pulso y chispas en ≤ 1 s, una sola vez, y se anuncia', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo, { celebra: true });
  await closeAviso(p);
  // 3 semanas con 3 entrenos + lunes y martes de esta semana: el entreno de hoy da «Tres de tres» PLATA
  await H.seedState(p, { habits: merge(weekDays(1, 3, { trained: true }), weekDays(2, 3, { trained: true }), weekDays(3, 3, { trained: true }), weekDays(0, 2, { trained: true })) });
  await p.locator('#dia-entrene').click();
  const d = p.locator('#dlg-logro');
  await expect(d).toBeVisible();
  await expect(p.locator('#lgd-new')).toHaveText('Nuevo nivel');
  await expect(p.locator('#lgd-title')).toHaveText('Tres de tres');
  await expect(p.locator('#lgd-line')).toHaveText('Plata · hoy, 21 oct');
  await expect(p.locator('#lgd-hero')).toHaveClass(/lg-go/);
  await expect(p.locator('#lgd-hero .lg-lit')).toHaveCount(1);
  await expect(p.locator('#lgd-hero .lg-sp')).toHaveCount(10);
  const t = await maxAnim(p, '#lgd-hero');
  expect(t).toBeGreaterThan(300);
  expect(t).toBeLessThanOrEqual(1000);
  await expect(p.locator('#lg-live')).toHaveText('Nuevo nivel: Tres de tres, nivel plata');
  await expect(p.locator('#lgd-levels .lg-lvr').nth(1)).toHaveText(/Plata\s*hoy/);
  await H.shot(p, 'ib-momento.png');
  await p.locator('#lgd-ok').click();
  await expect(d).toBeHidden();
  // Una sola vez: volver a Inicio o recargar no la repite
  await p.locator('#tab-registro').click(); await p.locator('#tab-panel').click();
  await p.reload(); await H.ready(p);
  await p.waitForTimeout(400);
  await expect(d).toBeHidden();
  expect(errors).toEqual([]);
});

test('momento de ganarla: no salta a mitad de los toques del agua; aparece al volver a Inicio', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo, { celebra: true });
  await closeAviso(p);
  // Un registro de hace 10 días: el agua de hoy gana «Volviste»
  await H.seedState(p, { habits: { [iso(-10)]: { water: 1 } } });
  const d = p.locator('#dlg-logro');
  for (let i = 0; i < 3; i++) await p.locator('#dia-agua').click();
  await p.waitForTimeout(400);
  await expect(d).toBeHidden();
  await p.locator('#tab-registro').click();
  await p.waitForTimeout(200);
  await expect(d).toBeHidden();
  await p.locator('#tab-panel').click();
  await expect(d).toBeVisible();
  await expect(p.locator('#lgd-new')).toHaveText('Nueva insignia');
  await expect(p.locator('#lgd-title')).toHaveText('Volviste');
  await expect(p.locator('#lgd-line')).toHaveText('Ganada hoy');
  await p.locator('#lgd-ok').click();
  await expect(d).toBeHidden();
  expect(errors).toEqual([]);
});

test('«Reducir movimiento»: el momento de ganarla es solo un fundido (≤ 150 ms), sin borde que corre, pulso ni chispas animadas', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo, { celebra: true });
  await p.emulateMedia({ reducedMotion: 'reduce' });
  await closeAviso(p);
  await H.seedState(p, { habits: weekDays(0, 2, { trained: true }) });
  await p.locator('#dia-entrene').click();
  const d = p.locator('#dlg-logro');
  await expect(d).toBeVisible();
  await expect(p.locator('#lgd-title')).toHaveText('Tres de tres');
  await expect(p.locator('#lgd-new')).toHaveText('Nueva insignia');
  await expect(p.locator('#lgd-hero')).not.toHaveClass(/lg-go/);
  expect(await p.locator('#lgd-hero .lg-hb').evaluate((e) => getComputedStyle(e).animationName)).toBe('lg-fade');
  expect(await maxAnim(p, '#lgd-hero')).toBeLessThanOrEqual(150);
  expect(await p.locator('#lgd-hero .lg-lit').evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
  await expect(p.locator('#lg-live')).toHaveText('Nueva insignia: Tres de tres, nivel bronce');
  await p.locator('#lgd-ok').click();
  expect(errors).toEqual([]);
});

test('390 px con letra al 200 % y fuente ancha: colección y detalle sin desborde ni palabras cortadas; contraste AA en oscuro y claro', async ({ browser }, testInfo) => {
  test.setTimeout(90_000);
  const { p, errors } = await H.clientApp(browser, testInfo, { celebra: true });
  await closeAviso(p);
  await H.seedState(p, COLECCION);
  await openLogros(p);
  await p.addStyleTag({ content: H.WIDE });
  await p.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const sinDesborde = async (root, donde) => {
    const bad = await p.evaluate((root) => {
      const out = [];
      const vw = document.documentElement.clientWidth;
      if (document.documentElement.scrollWidth > vw) out.push('scroll horizontal ' + document.documentElement.scrollWidth);
      for (const el of document.querySelectorAll(root + ' *')) {
        if (!el.getClientRects().length || el.closest('.hidden, svg')) continue;
        const r = el.getBoundingClientRect();
        if (r.width && (r.left < -0.5 || r.right > vw + 0.5)) out.push(`${el.id || el.className} fuera ${Math.round(r.left)}-${Math.round(r.right)}`);
        if (el.matches('.lg-nm, .lg-lab h3, .lg-near-n, .lg-dh') && el.scrollWidth > el.clientWidth + 1) out.push(`${el.className} cortado: ${el.textContent}`);
      }
      return out;
    }, root);
    expect(bad, donde).toEqual([]);
  };
  const aa = async (sels, donde) => { for (const s of sels) if (await p.locator(s).first().isVisible()) { let c; try { c = await H.contrast(p, s); } catch (e) { throw new Error(`${donde}: ${s} ${e.message}`); } expect(c, `${donde}: ${s}`).toBeGreaterThanOrEqual(4.5); } };
  for (const scheme of ['dark', 'light']) {
    await p.emulateMedia({ colorScheme: scheme });
    await sinDesborde('#view-insignias', `${scheme}: colección`);
    await aa(['.lg-nm', '.lg-cnt', '[data-logro="hidratado"] .lg-st', '[data-logro="entrenos-acumulados"] .lg-st', '[data-logro="buen-dormir"] .lg-st', '[data-logro="pata-de-perro"] .lg-st',
      '[data-logro="arranco"] .lg-st', '.lg-near-n', '.lg-near-s', '.lg-near .lg-tag', '.lg-total span', '.lg-foot', '.lg-lab h3'], `${scheme}: colección`);
    await H.shot(p, `ib-200-${scheme}.png`);
    await p.locator('[data-logro="hidratado"]').click();
    await expect(p.locator('#dlg-logro')).toBeVisible();
    await sinDesborde('#dlg-logro', `${scheme}: detalle`);
    await aa(['#lgd-band span', '#lgd-title', '#lgd-line', '#lgd-what', '#lgd-levels .lg-tag', '#lgd-levels .lg-lvn', '#lgd-levels .lg-okd', '#lgd-levels .lg-lvp span', '#lgd-note'], `${scheme}: detalle`);
    await H.shot(p, `ib-200-detalle-${scheme}.png`);
    await p.locator('#lgd-ok').click();
  }
  expect(errors).toEqual([]);
});

// Equipo: la meta colectiva (5 o más) cumplida esta semana con aporte propio. Nadie ve cuánto suma cada persona.
const shareAll = (p) => p.evaluate(() => window.__pgFakeBackend.links.forEach((l) => { l.shares.nutrition = true; l.shares.habits = true; }));
const como = (p, email, fn) => p.evaluate(async ({ email, fn }) => {
  const be = window.__pgFakeBackend;
  const m = {}; const mem = { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
  const u = be.users[email];
  m[RemoteFake.SESSION_KEY] = JSON.stringify({ user: { id: u.id, email }, issuedAt: be.clock.now() });
  const r = RemoteFake.createFake({ backend: be, storage: mem });
  // eslint-disable-next-line no-new-func
  return new Function('r', 'be', `return (async () => { ${fn} })()`)(r, be);
}, { email, fn });
test('un asesorado no ve insignias de otros: solo las suyas; «Equipo» se gana cuando el team cumple la meta y la persona sumó, sin exponer a nadie', async ({ browser }, testInfo) => {
  test.setTimeout(90_000);
  const { p, errors, code } = await H.clientApp(browser, testInfo, { celebra: true });
  // 4 compañeros con MUCHA historia (ellos tendrían oro); Ana casi nada
  const lots = []; for (let k = 0; k < 90; k++) lots.push({ date: iso(-k), data: { trained: k % 2 === 0, water: 2, steps: 9000, sleep: 8 } });
  for (const k of ['beto', 'carla', 'diego', 'elena']) await H.seedClient(p, `${k}@c.co`, `${k[0].toUpperCase()}${k.slice(1)} Ríos`, code, { paidDays: 20, habits: true, nutrition: true, habitDays: lots });
  await shareAll(p);
  await closeAviso(p);
  await como(p, 'laura@coach.co', "return r.coach.setTeamGoal('entrenos', 5);");
  await p.locator('#dia-entrene').click();
  // Su primer registro: «Arrancó el parche» sale al terminar la acción
  await expect(p.locator('#lgd-title')).toHaveText('Arrancó el parche');
  await p.locator('#lgd-ok').click();
  await p.evaluate(async () => { await PGSync.run(); await PGPuntos.reload(); });
  await expect(p.locator('#home-team')).toContainText('¡Meta cumplida!');
  await openLogros(p);
  const eq = p.locator('[data-logro="equipo"]');
  await expect(eq).toHaveAttribute('aria-label', /^Equipo, nivel bronce, ganada hoy/);
  const txt = await p.locator('#view-insignias').innerText();
  expect(txt).not.toMatch(/Beto|Carla|Diego|Elena|Ríos/);
  // Solo lo propio: Ana tiene 1 día de registro, así que nada de oro ni plata (los demás sí los tendrían)
  await expect(p.locator('#lg-cats .lg-st.lg-lv.lv-g, #lg-cats .lg-st.lg-lv.lv-s')).toHaveCount(0);
  await eq.click();
  await expect(p.locator('#lgd-what')).toContainText('Nadie ve cuánto suma cada persona');
  expect(await p.locator('#dlg-logro').innerText()).not.toMatch(/Beto|Carla|Diego|Elena|Ríos|\d+ personas/);
  await p.locator('#lgd-ok').click();
  // Con opt-out ya no se gana (la de esta semana queda: nunca se pierde lo ganado)
  expect(errors).toEqual([]);
});

test('coach: la ficha muestra las insignias del asesorado con el mismo diseño (siluetas, niveles y estados), sin Retos ni ranking', async ({ browser }, testInfo) => {
  test.setTimeout(90_000);
  const habitDays = []; for (let k = 0; k < 30; k++) habitDays.push(H.hab(-k, { water: 2, steps: k % 7 < 5 ? 9000 : 2000, trained: k % 7 < 3 }));
  const { p, errors } = await H.coachApp(browser, testInfo, [{ email: 'ana@c.co', name: 'Ana Martínez', habitDays }]);
  await p.locator('#tab-coach').click();
  await p.locator('#coach-clients .cli-main', { hasText: 'Ana Martínez' }).click();
  await expect(p.locator('#coach-detail-title')).toHaveText('Ana Martínez');
  const rows = p.locator('#fc-ins .lg-row');
  await expect(rows.locator('h3')).toHaveText(['Primeros pasos', 'Constancia', 'Hábitos', 'Entreno', 'Registro']);
  await expect(p.locator('#fc-ins .lg-tile')).toHaveCount(17);
  await expect(p.locator('#fc-ins [data-logro="hidratado"]')).toHaveAttribute('aria-label', /^Hidratado\/a, nivel plata, ganada el/);
  await p.locator('#fc-ins [data-logro="hidratado"]').click();
  await expect(p.locator('#dlg-logro')).toBeVisible();
  await expect(p.locator('#lgd-levels .lg-tag')).toHaveText('Sus niveles');
  await p.locator('#lgd-ok').click();
  expect(await p.locator('#fc-const').innerText()).not.toMatch(/kg|kcal|puesto|ranking de/i);
  await expect(p.locator('#fc-const .fc-const-note')).toContainText('Sin ranking entre asesorados');
  expect(errors).toEqual([]);
});

void TODAY;
