// v1.15 · Puntos de constancia, meta colectiva del team, ranking sin kilos, filtros operativos de la lista del coach y aviso v1.2 (concepto jurídico 7).
// Servidor FALSO, reloj fijo (miércoles 21-oct-2026 12:00 Bogotá; semana lunes 19 a domingo 25). El servidor real: supabase/tests/190_puntos_meta.test.sql.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./ux1-helpers');
const { iso, TODAY } = H;

const SHOTS = process.env.SHOTS_PM || '';
const shot = async (p, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, name), fullPage: false }); } };
const AVISO_12 = 'Actualizamos nuestra Política de Tratamiento de Datos (v1.2) para incluir la opción voluntaria de retos y ligas de constancia en equipo. Conócela aquí.';
// Todos comparten hábitos y comidas (en el producto coach compartir comidas es obligatorio).
const shareAll = (p) => p.evaluate(() => window.__pgFakeBackend.links.forEach((l) => { l.shares.nutrition = true; l.shares.habits = true; }));
// Sincroniza y vuelve a pedir los puntos (en la app pasa solo tras cada guardado; aquí se fuerza para no esperar).
const sync = (p) => p.evaluate(async () => { await PGSync.run(); await PGPuntos.reload(); });
// Lo sembrado con seedState lleva una fecha vieja: se le pone «ahora» para que la app lo suba (como al guardar de verdad).
const touch = (p) => p.evaluate((k) => { const ts = new Date(Date.now() + 1000).toISOString(); const s = JSON.parse(localStorage.getItem(k)); for (const e of s.entries) e.updatedAt = ts; for (const d of Object.keys(s.habits)) s.habits[d].updatedAt = ts;
  for (const d of Object.keys(s.foods)) for (const f of s.foods[d]) f.updatedAt = ts; localStorage.setItem(k, JSON.stringify(s)); }, H.KEY).then(() => p.reload()).then(() => H.ready(p));
// La hoja «Nueva insignia» se abre sola al ganar una (diseño B): aquí se cierra para no tapar lo que se prueba.
const autoLogro = (p) => p.addLocatorHandler(p.locator('#lgd-ok'), (l) => l.click());
const closeAviso = async (p) => { if (await p.locator('#btn-aviso-politica').isVisible()) await p.locator('#btn-aviso-politica').click(); };
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
const OTROS = ['beto', 'carla', 'diego', 'elena'].map((k) => ({ email: `${k}@c.co`, name: `${k[0].toUpperCase()}${k.slice(1)} Ríos` }));
async function seedTeam(p, code) {
  for (const o of OTROS) await H.seedClient(p, o.email, o.name, code, { paidDays: 20, habits: true, nutrition: true, habitDays: [{ date: iso(0), data: { trained: true, water: 2 } }] });
}

test('asesorado: puntos en Inicio y en Progreso → Puntos; medir no da puntos por el resultado; tope de 12 al día; ocultarlos; nunca ve puntos de otros', async ({ browser }, testInfo) => {
  const { p, errors, code } = await H.clientApp(browser, testInfo);
  await autoLogro(p);
  await shareAll(p);
  await closeAviso(p);
  await p.locator('#dia-entrene').click();
  await expect(p.locator('#dia-rest')).toBeHidden();   // con «Entrené» no se ofrece el descanso
  await sync(p);
  await expect(p.locator('#home-puntos')).toHaveText('5 puntos esta semana · +5 hoy ›');
  await p.locator('#home-puntos').click();
  await expect(p.locator('#view-puntos')).toBeVisible();
  await expect(p.locator('#topbar-title')).toHaveText('Puntos');
  await expect(p.locator('#pt-week')).toHaveText('5');
  await expect(p.locator('#pt-detail li')).toHaveText([/Registrar el día\s*\+2/, /Entreno\s*\+3/]);
  await expect(p.locator('#pt-rules-list li')).toHaveCount(9);
  await expect(p.locator('#view-puntos')).toContainText('Máximo 12 al día y 80 a la semana');
  // Medirse: +3 por REGISTRAR. Cambiar el valor (70 → 95 kg) no cambia nada.
  await H.seedState(p, { entries: [{ date: TODAY, weight: 70 }] });
  await touch(p);
  await sync(p);
  await expect(p.locator('#home-puntos')).toHaveText('8 puntos esta semana · +8 hoy ›');
  await p.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); const e = s.entries.find((x) => x.weight === 70); e.weight = 95; e.waist = 110; e.updatedAt = new Date(Date.now() + 1000).toISOString(); localStorage.setItem(k, JSON.stringify(s)); }, H.KEY);
  await p.reload(); await H.ready(p);
  await sync(p);
  expect(await p.evaluate(() => Object.values(window.__pgFakeBackend.records).find((r) => r.kind === 'entry').data.weight)).toBe(95);
  await expect(p.locator('#home-puntos')).toHaveText('8 puntos esta semana · +8 hoy ›');
  // Tope diario: agua, pasos, sueño, 2 comidas y «volviste» (registro de hace 20 días) darían 17: el día queda en 12.
  await H.seedState(p, { habits: { [TODAY]: { water: 2, steps: 9000, sleep: 8, trained: true }, [iso(-20)]: { water: 1 } },
    foods: { [TODAY]: [{ name: 'Arepa', kcal: 300 }, { name: 'Fruta', kcal: 80 }] } });
  await touch(p);
  await sync(p);
  await expect(p.locator('#home-puntos')).toHaveText('12 puntos esta semana · +12 hoy ›');
  await p.locator('#home-puntos').click();
  await expect(p.locator('#pt-today')).toHaveText('+12 hoy');
  await shot(p, 'pm-puntos-asesorado.png');
  // Ocultar mis puntos (Más → Puntos y meta del team): desaparecen de Inicio y Progreso, se pueden volver a mostrar.
  await p.locator('#tab-mas').click();
  await p.locator('#row-puntos').click();
  await expect(p.locator('#ajp-title')).toBeFocused();
  await p.locator('#ajp-hide').check();
  await expect(p.locator('#ajp-status')).toContainText('ocultos');
  await p.locator('#tab-panel').click();
  await expect(p.locator('#home-puntos')).toBeHidden();
  await p.evaluate(() => PGNav.show('puntos'));
  await expect(p.locator('#puntos-body')).toContainText('Ocultaste tus puntos');
  await p.locator('#pt-show').click();
  await expect(p.locator('#pt-week')).toHaveText('12');
  // Nunca ve puntos de otros: Beto suma esta semana, pero a Ana no le llega nada de él (ni por pantalla ni por la API).
  await H.seedClient(p, 'beto@c.co', 'Beto Ríos', code, { paidDays: 20, habits: true, nutrition: true, habitDays: [{ date: iso(0), data: { trained: true, water: 2, steps: 9000 } }] });
  await sync(p);
  const txt = await p.evaluate(() => document.body.textContent);
  expect(txt).not.toContain('Beto');
  const api = await p.evaluate(async () => ({ mine: await PGAccount.remote.client.myPoints(), coach: await PGAccount.remote.coach.points('2026-10-15', '2026-10-21').then(() => 'ok', (e) => e.code) }));
  expect(api.coach).toBe('forbidden');
  expect(JSON.stringify(api.mine)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  expect(api.mine.week).toBe(12);
  expect(errors).toEqual([]);
});

test('asesorado: descanso planificado y «me siento mal» dan puntos; en pausa no se gana ni se pierde nada', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo);
  await autoLogro(p);
  await shareAll(p);
  await closeAviso(p);
  await expect(p.locator('#dia-rest button')).toHaveText(['Hoy es mi día de descanso', 'Hoy no entreno: me siento mal']);
  await p.locator('#dia-rest [data-rest="sick"]').click();
  await expect(p.locator('#dia-rest [data-rest="sick"]')).toHaveAttribute('aria-pressed', 'true');
  expect((await H.habitsOf(p)).rest).toBe('sick');
  await sync(p);
  await expect(p.locator('#home-puntos')).toHaveText('4 puntos esta semana · +4 hoy ›');   // registrar 2 + descanso 2
  // En pausa: lo que anota en modo autónomo no suma, y lo que tenía se conserva.
  await H.setPaid(p, -1);
  await p.evaluate(() => PGAccount.refreshLink());
  await p.locator('#dia-agua').click();
  await sync(p);
  await expect(p.locator('#home-puntos')).toHaveText('4 puntos esta semana · +4 hoy ›');
  await p.evaluate(() => PGNav.show('puntos'));
  await expect(p.locator('#puntos-body')).toContainText('Tus puntos y tu nivel están guardados');
  expect(errors).toEqual([]);
});

test('meta colectiva: el asesorado ve la barra común (total y cuántos) sin datos individuales; el opt-out lo excluye y con menos de 5 no se publica', async ({ browser }, testInfo) => {
  const { p, errors, code } = await H.clientApp(browser, testInfo);
  await autoLogro(p);
  await seedTeam(p, code);
  await shareAll(p);
  await closeAviso(p);
  await como(p, 'laura@coach.co', "return r.coach.setTeamGoal('entrenos', 20);");
  await p.locator('#dia-entrene').click();
  await sync(p);
  const card = p.locator('#home-team');
  await expect(card).toBeVisible();
  await expect(card.locator('.team-title')).toHaveText('Entre todos: 20 entrenos');
  await expect(card.locator('.team-line')).toHaveText('5 de 20 entrenos · 5 personas sumando');
  await expect(card).toContainText('nadie ve cuánto suma cada persona');
  const all = await p.evaluate(() => document.body.textContent);
  for (const o of OTROS) expect(all).not.toContain(o.name);
  expect(JSON.stringify(await p.evaluate(() => PGAccount.remote.client.myTeamGoal()))).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-|clientId|userId/);
  await card.scrollIntoViewIfNeeded();
  await shot(p, 'pm-meta-asesorado.png');
  // Opt-out: «No sumar mis hábitos a la meta del team» → Ana deja de contar (quedan 4) y la meta no se publica.
  await p.locator('#tab-mas').click();
  await p.locator('#row-puntos').click();
  await p.locator('#ajp-team').check();
  await expect(p.locator('#ajp-status')).toHaveText('Listo: lo tuyo ya no suma a la meta del team.');
  expect(await p.evaluate(() => window.__pgFakeBackend.links.find((l) => l.status === 'active' && window.__pgFakeBackend.users['ana@c.co'].id === l.clientId).teamOptOut)).toBe(true);
  await p.locator('#tab-panel').click();
  await expect(card.locator('.team-line')).toHaveText('La meta del team se activa cuando sean 5 o más.');
  await expect(card.locator('.team-bar')).toHaveCount(0);
  await expect(card).toContainText('No estás sumando lo tuyo');
  const coachView = await como(p, 'laura@coach.co', 'return r.coach.teamGoal();');
  expect([coachView.published, coachView.total, coachView.participants]).toEqual([false, null, null]);
  // Vuelve a sumar → 5 otra vez.
  await p.locator('#tab-mas').click();
  await p.locator('#row-puntos').click();
  await p.locator('#ajp-team').uncheck();
  await p.locator('#tab-panel').click();
  await expect(card.locator('.team-line')).toHaveText('5 de 20 entrenos · 5 personas sumando');
  expect(errors).toEqual([]);
});

const pesos = (vals) => vals.map(([d, w]) => ({ date: iso(d), data: { weight: w } }));
const EQUIPO = [
  { email: 'ana@c.co', name: 'Ana Martínez', measures: pesos([[-20, 74], [-13, 73.2], [-6, 72.5], [-1, 71.8]]), habitDays: [{ date: iso(0), data: { trained: true } }] },
  { email: 'beto@c.co', name: 'Beto Gómez', measures: pesos([[-20, 90], [-13, 90.1], [-6, 90], [0, 90.1]]), habitDays: [{ date: iso(0), data: { trained: true } }] },
  { email: 'carla@c.co', name: 'Carla Ruiz', measures: [{ date: iso(-15), data: { weight: 66, waist: 79 } }], habitDays: [{ date: iso(0), data: { trained: true } }] },
  { email: 'diego@c.co', name: 'Diego Paz', measures: pesos([[-2, 101.4]]), habitDays: [{ date: iso(0), data: { trained: true } }] },
  { email: 'elena@c.co', name: 'Elena Ríos', measures: pesos([[-3, 58]]), habitDays: [{ date: iso(-6), data: { water: 1 } }] },
];

test('coach: meta del team en Retos (total y cuántos, sin desglose); con menos de 5 no se publica; ranking con «Puntos» y sin «Progreso a la meta»', async ({ browser }, testInfo) => {
  const { p, errors } = await H.coachApp(browser, testInfo, EQUIPO);
  await shareAll(p);
  await closeAviso(p);
  await p.locator('#tab-mas').click();
  await p.locator('#row-c-retos').click();
  const box = p.locator('#rt-team-box');
  await expect(box.locator('[data-tmetric]')).toHaveText(['Entrenos', 'Puntos']);
  await expect(p.locator('#rt-team-n')).toHaveValue('');   // la app no sugiere ningún número
  await p.locator('#rt-team-n').fill('0');
  await p.locator('#rt-team-save').click();
  await expect(p.locator('#rt-team-err')).toContainText('Escribe un número entero');
  await p.locator('#rt-team-n').fill('20');
  await p.locator('#rt-team-save').click();
  await expect(box.locator('.team-title')).toHaveText('Entre todos: 20 entrenos');
  await expect(box.locator('.team-line')).toHaveText('4 de 20 entrenos · 5 personas sumando');
  const t = await p.locator('#retos-team').innerText();
  for (const c of EQUIPO) expect(t).not.toContain(c.name);
  await shot(p, 'pm-meta-coach.png');
  // Diego queda en pausa: 4 participan → no se publica (ni el total ni cuántos).
  await H.setPaid(p, -1, 'diego@c.co');
  await p.evaluate(() => PGPuntos.reloadCoach());
  await expect(box.locator('.team-line')).toHaveText('La meta del team se activa cuando sean 5 o más.');
  await expect(box).toContainText('Con menos de 5 personas sumando no se publica nada');
  await expect(box.locator('.team-bar')).toHaveCount(0);
  // Ranking privado: Constancia · Hábitos · Entrenos · Puntos; nunca «Progreso a la meta» ni kilos.
  await p.locator('#tab-analitica').click();
  await p.locator('#ant-ranking').click();
  await expect(p.locator('#an-ranking [data-by]')).toHaveText(['Constancia', 'Hábitos', 'Entrenos', 'Puntos']);
  await expect(p.locator('#an-ranking')).not.toContainText('Progreso a la meta');
  await p.locator('[data-by="puntos"]').click();
  await expect(p.locator('.rk-li')).toHaveCount(5);
  await expect(p.locator('.rk-li small').first()).toContainText('puntos de constancia');
  expect(await p.locator('#an-ranking .rk-list').innerText()).not.toMatch(/kg|kilo|cintura/i);
  await shot(p, 'pm-ranking-coach.png');
  expect(errors).toEqual([]);
});

test('coach: filtros por estado operativo (Requieren revisión, Al día con registros, Sin pesaje reciente) y dato neutro de peso y cintura con fecha; ninguna lista ordena por kilos', async ({ browser }, testInfo) => {
  const { p, errors } = await H.coachApp(browser, testInfo, EQUIPO);
  await closeAviso(p);
  await p.locator('#tab-coach').click();
  const names = () => p.locator('#coach-clients .cli-name').allTextContents();
  const filtro = async (t) => { await p.locator('#coach-filters button', { hasText: t }).click(); };
  await expect(p.locator('#coach-filters button')).toHaveText([/^Necesitan atención · \d$/, 'Todos · 5', /^Vencen pronto/, /^Sin pagar/, 'Requieren revisión · 1', /^Al día con registros · \d$/, 'Sin pesaje reciente · 1']);
  await expect(p.locator('#coach-filters')).not.toContainText('Alertas');   // L6 apagadas (Etapa 3): el filtro no existe todavía
  await filtro('Requieren revisión');
  expect(await names()).toEqual(['Beto Gómez']);   // estancado 3+ semanas (la regla de la tendencia)
  await filtro('Sin pesaje reciente');
  expect(await names()).toEqual(['Carla Ruiz']);   // más de 10 días sin pesarse
  await filtro('Todos');
  const alDia = await p.locator('#coach-clients .cli-pay-row[data-level="aldia"] .cli-name').allTextContents();
  await filtro('Al día con registros');
  expect(await names()).toEqual(alDia);   // las del semáforo «Al día», ni una más
  // Dato neutro: último peso y cintura con su fecha, sin flechas ni juicios.
  await filtro('Todos');
  expect(await names()).toEqual(['Ana Martínez', 'Beto Gómez', 'Carla Ruiz', 'Diego Paz', 'Elena Ríos']);   // por nombre, nunca por kilos
  const row = (n) => p.locator('#coach-clients .cli-pay-row', { hasText: n }).locator('.cli-med');
  await expect(row('Ana Martínez')).toHaveText('Peso 71,8 kg · 20 oct');
  await expect(row('Carla Ruiz')).toHaveText('Peso 66 kg · 6 oct · Cintura 79 cm · 6 oct');
  expect(await p.locator('#coach-clients .cli-med').allTextContents()).not.toContainEqual(expect.stringMatching(/[▲▼↑↓]|bajó|subió|mejor|peor/));
  await filtro('Necesitan atención');
  const order = await names();
  const kg = { 'Ana Martínez': 71.8, 'Beto Gómez': 90.1, 'Carla Ruiz': 66, 'Diego Paz': 101.4, 'Elena Ríos': 58 };
  const w = order.map((n) => kg[n]);
  expect(w).not.toEqual([...w].sort((a, b) => a - b));
  expect(w).not.toEqual([...w].sort((a, b) => b - a));
  await shot(p, 'pm-lista-coach.png');
  expect(errors).toEqual([]);
});

test('aviso v1.2: texto y «Entendido» literales, UNA vez (también para quien ya cerró el de la v1.1), sin re-aceptar', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo);
  await autoLogro(p);
  const uid = await p.evaluate(() => PGAccount.meta().userId);
  await p.evaluate((u) => localStorage.setItem('perdida-grasa:aviso-politica', JSON.stringify([`${u}|politica-1.1`])), uid);
  await p.reload(); await H.ready(p);
  await expect(p.locator('#aviso-politica')).toBeVisible();
  await expect(p.locator('#aviso-politica-text')).toHaveText(AVISO_12);
  await expect(p.locator('#aviso-politica-text a')).toHaveAttribute('href', 'legal/privacidad.html');
  await expect(p.locator('#btn-aviso-politica')).toHaveText('Entendido');
  await expect(p.locator('#solo')).toBeHidden();   // no pide re-aceptar
  await shot(p, 'pm-aviso-v12.png');
  await p.locator('#btn-aviso-politica').click();
  await expect(p.locator('#aviso-politica')).toBeHidden();
  await p.reload(); await H.ready(p);
  await expect(p.locator('#aviso-politica')).toBeHidden();
  expect(errors).toEqual([]);
});

test('390 px con letra al 200 % y fuente ancha (asesorado): Inicio, Puntos, ajustes y meta sin desborde; contraste AA en oscuro y claro', async ({ browser }, testInfo) => {
  test.setTimeout(120_000);
  const { p, errors, code } = await H.clientApp(browser, testInfo);
  await autoLogro(p);
  await seedTeam(p, code);
  await shareAll(p);
  await closeAviso(p);
  await como(p, 'laura@coach.co', "return r.coach.setTeamGoal('puntos', 2000);");
  await p.locator('#dia-entrene').click();
  await sync(p);
  await p.addStyleTag({ content: H.WIDE });
  await p.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const sinDesborde = async (donde) => {
    const bad = await p.evaluate(() => {
      const out = [];
      const vw = document.documentElement.clientWidth;
      if (document.documentElement.scrollWidth > vw) out.push('scroll horizontal ' + document.documentElement.scrollWidth);
      for (const el of document.querySelectorAll('.view.active *')) {
        if (!el.offsetParent || el.closest('.hidden')) continue;
        const r = el.getBoundingClientRect();
        if (r.width && (r.left < -0.5 || r.right > vw + 0.5)) out.push(`${el.id || (el.className && el.className.baseVal != null ? el.className.baseVal : el.className)} fuera ${Math.round(r.left)}-${Math.round(r.right)}`);
      }
      return out;
    });
    expect(bad, donde).toEqual([]);
  };
  const aa = async (sels, donde) => { for (const s of sels) if (await p.locator(s).first().isVisible()) expect(await H.contrast(p, s), `${donde}: ${s}`).toBeGreaterThanOrEqual(4.5); };
  for (const scheme of ['dark', 'light']) {
    await p.emulateMedia({ colorScheme: scheme });
    await p.evaluate(() => PGNav.show('panel'));
    await expect(p.locator('#home-puntos')).toBeVisible();
    await sinDesborde(`${scheme}: Inicio`);
    await aa(['#home-puntos', '#home-team .team-title', '#home-team .team-line', '#home-team .team-foot'], `${scheme}: Inicio`);
    if (scheme === 'dark') await shot(p, 'pm-inicio-200-oscuro.png');
    await p.evaluate(() => PGNav.show('puntos'));
    await expect(p.locator('#pt-week')).toBeVisible();
    await sinDesborde(`${scheme}: Puntos`);
    await aa(['#pt-week', '#pt-today', '#pt-detail li span', '#pt-cmp', '#puntos-team .team-line', '.pt-foot'], `${scheme}: Puntos`);
    await shot(p, `pm-puntos-200-${scheme === 'dark' ? 'oscuro' : 'claro'}.png`);
    await p.evaluate(() => PGNav.show('ajpuntos'));
    await sinDesborde(`${scheme}: Ajustes`);
    await aa(['#ajp-title', '#view-ajpuntos .check', '#view-ajpuntos .small'], `${scheme}: Ajustes`);
  }
  expect(errors).toEqual([]);
});

test('390 px con letra al 200 % y fuente ancha (coach): lista con filtros y dato neutro, meta del team y ranking sin desborde; AA en oscuro y claro', async ({ browser }, testInfo) => {
  test.setTimeout(120_000);
  const { p, errors } = await H.coachApp(browser, testInfo, EQUIPO);
  await shareAll(p);
  await closeAviso(p);
  await como(p, 'laura@coach.co', "return r.coach.setTeamGoal('entrenos', 20);");
  await p.addStyleTag({ content: H.WIDE });
  await p.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const tap = (sel, opts) => p.locator(sel, opts).first().evaluate((b) => b.click());
  const sinDesborde = async (donde) => {
    const bad = await p.evaluate(() => {
      const out = [];
      const vw = document.documentElement.clientWidth;
      if (document.documentElement.scrollWidth > vw) out.push('scroll horizontal ' + document.documentElement.scrollWidth);
      for (const el of document.querySelectorAll('.view.active button, .view.active .card, .view.active .cli-line, .view.active .rk-li, .view.active input')) {
        if (!el.offsetParent || el.closest('.hidden')) continue;
        const r = el.getBoundingClientRect();
        if (r.width && (r.left < -0.5 || r.right > vw + 0.5)) out.push(`${el.id || el.className} fuera ${Math.round(r.left)}-${Math.round(r.right)}`);
      }
      return out;
    });
    expect(bad, donde).toEqual([]);
  };
  const aa = async (sels, donde) => { for (const s of sels) if (await p.locator(s).first().isVisible()) expect(await H.contrast(p, s), `${donde}: ${s}`).toBeGreaterThanOrEqual(4.5); };
  for (const scheme of ['dark', 'light']) {
    await p.emulateMedia({ colorScheme: scheme });
    await tap('#tab-coach');
    await tap('#coach-filters button', { hasText: 'Requieren revisión' });
    await expect(p.locator('#coach-clients .cli-med')).toHaveCount(1);
    await sinDesborde(`${scheme}: lista`);
    await aa(['#coach-clients .cli-med', '#coach-filters button[aria-pressed="true"]', '#coach-filters button[aria-pressed="false"]'], `${scheme}: lista`);
    if (scheme === 'dark') await shot(p, 'pm-lista-200-oscuro.png');
    await p.evaluate(() => PGNav.show('retos'));
    await expect(p.locator('#rt-team-box .team-line')).toBeVisible();
    await sinDesborde(`${scheme}: Retos`);
    await aa(['#rt-team-box .team-title', '#rt-team-box .team-line', '#rt-team-box .team-foot'], `${scheme}: meta`);
    await tap('#tab-analitica');
    await tap('#ant-ranking');
    await tap('[data-by="puntos"]');
    await sinDesborde(`${scheme}: ranking`);
    await aa(['.rk-li small', '[data-by][aria-pressed="true"]'], `${scheme}: ranking`);
  }
  expect(errors).toEqual([]);
});
