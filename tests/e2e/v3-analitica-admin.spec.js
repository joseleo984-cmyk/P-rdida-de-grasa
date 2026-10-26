// r1 v1.13 · Analítica del coach (M3), ranking privado (M5), gráficas de la ficha (M4), metas (M1/M2, concepto jurídico 5), avisos (M10) y panel admin (M7–M10).
// Servidor FALSO, reloj fijo (miércoles 21-oct-2026). El servidor real se prueba en supabase/tests/170_analitica_admin.test.sql.
const { test, expect } = require('@playwright/test');
const H = require('./ux1-helpers');
const { iso } = H;

const FOOT = 'Metas orientativas fijadas exclusivamente por tu coach. La plataforma no formula, valida ni prescribe objetivos corporales, medidas antropométricas, requerimientos nutricionales ni pautas de entrenamiento.';
const pesos = (vals) => vals.map(([d, w, waist]) => ({ date: iso(d), data: waist ? { weight: w, waist } : { weight: w } }));
const CLIENTES = [
  { email: 'ana@c.co', name: 'Ana Martínez', habits: true, measures: pesos([[-21, 74, 80], [-14, 73.5], [-7, 73.1], [-1, 72.6, 78]]),
    habitDays: [{ date: iso(0), data: { trained: true, water: 2 } }, { date: iso(-2), data: { trained: true } }, { date: iso(-3), data: { water: 1 } }] },
  { email: 'beto@c.co', name: 'Beto Gómez', habits: false, measures: pesos([[-20, 90], [-13, 90.1], [-6, 90], [0, 90.1]]) },
  { email: 'carla@c.co', name: 'Carla Ruiz', habits: true, measures: [] },
];
// Texto de TODO el DOM (visible u oculto), sin scripts.
const todoElTexto = (p) => p.evaluate(() => { const c = document.body.cloneNode(true); c.querySelectorAll('script, style, template').forEach((n) => n.remove()); return c.textContent.replace(/\s+/g, ' '); });
// Actúa en el servidor falso de esta página con otra cuenta (sin tocar la sesión de la página).
const como = (p, email, fn, arg) => p.evaluate(async ({ email, fn, arg }) => {
  const be = window.__pgFakeBackend;
  const m = {}; const mem = { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
  const r = RemoteFake.createFake({ backend: be, storage: mem });
  const u = be.users[email];
  if (u) m[RemoteFake.SESSION_KEY] = JSON.stringify({ user: { id: u.id, email }, issuedAt: be.clock.now() });   // cuenta que ya existe: sin pedir otro código
  else { await r.auth.sendCode(email); await r.auth.verifyCode(email, be.lastCode(email)); }
  await r.account.joinApp();
  const idOf = (e) => Object.values(be.users).find((u) => u.email === e).id;
  // eslint-disable-next-line no-new-func
  return new Function('r', 'be', 'idOf', 'arg', `return (async () => { ${fn} })()`)(r, be, idOf, arg);
}, { email, fn, arg });

test('M3 + M5: Analítica (Resumen y Ranking privado) con Semana/Mes; quien no comparte hábitos sale «no comparte», nunca 0; fijar metas (M2) activa «Progreso a la meta» y la línea de meta de M4', async ({ browser }, testInfo) => {
  const { p, errors } = await H.coachApp(browser, testInfo, CLIENTES);
  await p.locator('#tab-coach').click();
  await expect(p.locator('#coach-clients [data-client]')).toHaveCount(3);
  await expect(p.locator('#tab-analitica')).toBeVisible();
  expect(await p.locator('.tabbar button:visible .tb-label').allTextContents()).toEqual(['Asesorados', 'Analítica', 'Rutinas', 'Invitar', 'Más']);
  await p.locator('#tab-analitica').click();
  const res = p.locator('#an-resumen');
  await expect(res).toContainText('Constancia promedio');
  await expect(p.locator('#today-label')).toHaveText('3 asesorados');
  await expect(p.locator('#an-range')).toHaveText('15–21 oct');
  await expect(res.locator('.an-k').nth(2)).toContainText('1 / 2');
  await expect(res.locator('.an-k').nth(2)).toContainText('entrenaron · 2 entrenos');
  await expect(res).toContainText('1 no comparte sus hábitos: no cuentan en los entrenos.');
  await expect(res.locator('.an-lgd')).toContainText('1 van bajando');
  await expect(res.locator('.an-lgd')).toContainText('1 estancados 3+ sem.');
  await expect(res.locator('.an-att')).toContainText('Necesitan atención');
  expect(await p.locator('#view-analitica').textContent()).not.toMatch(/deber[ií]a|te recomendamos|recomendaci[oó]n|consejo|mal resultado|buen resultado|bien\b|\bmal\b/i);
  await p.locator('#view-analitica [data-per="mes"]').click();
  await expect(p.locator('#an-range')).toHaveText('octubre (hasta hoy)');
  await H.tall(p, '#view-analitica');
  // Ranking privado: rótulo literal; concepto 7, punto 10: solo Constancia · Hábitos · Entrenos · Puntos (nada de «Progreso a la meta»)
  await p.locator('#ant-ranking').click();
  await expect(p.locator('#an-rk-label span:last-child')).toHaveText('Solo tú lo ves. Tus asesorados nunca ven un ranking.');
  await expect(p.locator('#an-ranking [data-by]')).toHaveText(['Constancia', 'Hábitos', 'Entrenos', 'Puntos']);
  await expect(p.locator('[data-by="meta"]')).toHaveCount(0);
  await expect(p.locator('#an-ranking')).not.toContainText('Progreso a la meta');
  await expect(p.locator('.rk-li')).toHaveCount(3);
  await expect(p.locator('.rk-li').first()).toContainText('Ana Martínez');
  await p.locator('[data-by="entrenos"]').click();
  await expect(p.locator('.rk-li')).toHaveCount(2);
  await expect(p.locator('.rk-apart')).toContainText('Beto Gómez (no comparte sus hábitos)');
  await H.tall(p, '#view-analitica');
  // M2: fijar metas en la ficha (los campos empiezan vacíos: la app no sugiere números)
  await p.locator('#tab-coach').click();
  await p.locator('#coach-clients [data-client]', { hasText: 'Ana Martínez' }).click();
  await p.locator('#fct-metas').click();
  await expect(p.locator('#fc-metas .fc-goals')).toContainText('Sin meta');
  await p.locator('#btn-fijar-metas').click();
  await expect(p.locator('#sheet-metas')).toBeVisible();
  for (const k of ['weight_kg', 'waist_cm', 'protein_g', 'water_days', 'steps_days', 'sleep_days', 'trained_days']) await expect(p.locator('#sm-' + k)).toHaveValue('');
  await expect(p.locator('#sheet-metas')).toContainText('Todo es opcional. La app no sugiere números');
  await p.locator('#sm-water_days').fill('9');
  await p.locator('#sm-save').click();
  await expect(p.locator('#sm-error')).toContainText('Agua: va de 1 a 7 días.');
  await p.locator('#sm-water_days').fill('');
  await p.locator('#sm-weight_kg').fill('70,5');
  await p.locator('#sm-trained_days').fill('3');
  await p.locator('#sm-save').click();
  await expect(p.locator('#sheet-metas')).toBeHidden();
  await expect(p.locator('#fc-metas .fc-goals')).toContainText('70,5 kg');
  expect(await p.evaluate(() => { const be = window.__pgFakeBackend; return be.links.find((l) => l.status === 'active' && be.profiles[l.clientId].displayName === 'Ana Martínez').goals; })).toEqual({ weight_kg: 70.5, trained_days: 3 });
  // M4: gráficas con la línea de la meta y la tabla de comparar
  await p.locator('#fct-graficas').click();
  await expect(p.locator('#fc-graficas .ch-goal')).toHaveCount(2);   // la del peso y la de entrenos por semana
  await expect(p.locator('#fc-graficas .ch-goal-t')).toHaveText('Meta 70,5 kg');
  await expect(p.locator('#fc-graficas .an-tbl')).toContainText('Peso');
  await expect(p.locator('#coach-detail-comidas-card')).toBeHidden();
  await p.locator('#fc-graficas [data-gran="meses"]').click();
  await expect(p.locator('#fc-graficas .an-tag').first()).toHaveText('Comparar meses');
  await H.tall(p, '#fc-graficas');
  await p.locator('#fct-resumen').click();
  await expect(p.locator('#fc-semana')).toBeVisible();
  // Aun con una meta de peso, el ranking NO ofrece «Progreso a la meta» ni ordena por kilos (concepto 7, punto 10); sí por puntos y hábitos
  await p.locator('#tab-analitica').click();
  await p.locator('#ant-ranking').click();
  await expect(p.locator('[data-by="meta"]')).toHaveCount(0);
  expect(await p.locator('#an-ranking').innerText()).not.toMatch(/kg|kilo|cintura|Faltan|Progreso a la meta/i);
  await p.locator('[data-by="puntos"]').click();
  await expect(p.locator('.rk-li')).toHaveCount(2);
  await expect(p.locator('.rk-li small').first()).toContainText('puntos de constancia');
  await expect(p.locator('.rk-apart')).toContainText('Beto Gómez (no comparte sus hábitos y comidas)');
  await p.locator('[data-by="habitos"]').click();
  await expect(p.locator('.rk-li small').first()).toContainText('metas de agua, pasos y sueño');
  expect(errors).toEqual([]);
});

test('M3 · Tendencia de peso con clic: tocar «estancados» muestra exactamente a esos asesorados (cambio y último pesaje), una fila abre la ficha con Anterior/Siguiente; Cerrar y Esc; nada de la pausa privada', async ({ browser }, testInfo) => {
  const TEND = [
    { email: 'ana@c.co', name: 'Ana Martínez', measures: pesos([[-21, 74], [-14, 73.5], [-7, 73.1], [-1, 72.6]]) },
    { email: 'beto@c.co', name: 'Beto Gómez', habits: false, measures: pesos([[-20, 90], [-13, 90.1], [-6, 90], [0, 90.1]]) },
    { email: 'dani@c.co', name: 'Dani López', measures: pesos([[-20, 80], [-13, 80.1], [-6, 80], [-2, 80.1]]) },
    { email: 'eva@c.co', name: 'Eva Ríos', measures: pesos([[-14, 60], [-1, 60.6]]) },
    { email: 'carla@c.co', name: 'Carla Ruiz', measures: [] },
  ];
  const { p, errors } = await H.coachApp(browser, testInfo, TEND);
  // Carla se pesó durante su pausa privada: el servidor lo guarda como pause_private y el coach NUNCA lo ve (ni en la tendencia ni la fecha)
  await p.evaluate(() => {
    const be = window.__pgFakeBackend;
    const id = Object.values(be.users).find((u) => u.email === 'carla@c.co').id;
    [[-15, 70], [-8, 69.4], [-1, 68.8]].forEach(([d, w], i) => {
      const day = new Date(be.clock.now() - 5 * 3600000 + d * 86400000).toISOString().slice(0, 10);
      be.records[`${id}|entry|${day}`] = { id: `00000000-0000-4000-8000-0000000009${String(i).padStart(2, '0')}`, kind: 'entry', nkey: day, date: day, data: { weight: w }, updatedAt: '2026-10-21T10:00:00.000Z', deletedAt: null, userId: id, pausePrivate: true, serverUpdatedAt: be._serverStamp() };
    });
    be._persist();
  });
  await p.locator('#tab-coach').click();
  await expect(p.locator('#coach-clients [data-client]')).toHaveCount(5);
  await p.locator('#tab-analitica').click();
  const res = p.locator('#an-resumen');
  await expect(res.locator('.an-lgd')).toContainText('2 estancados 3+ sem.');
  await expect(res.locator('.an-lgd')).toContainText('1 van bajando');
  await expect(res.locator('.an-lgd')).toContainText('1 subiendo');
  await expect(res.locator('.an-lgd')).toContainText('1 sin datos');
  // Cada leyenda es un botón (48 px) y la barra también se toca
  const lg = (k) => res.locator(`.an-lgd-btn[data-trend="${k}"]`);
  for (const k of ['bajando', 'estancado', 'subiendo', 'sin_datos']) { await expect(lg(k)).toBeVisible(); expect((await lg(k).boundingBox()).height).toBeGreaterThanOrEqual(47.5); }
  const sheet = p.locator('#sheet-tend');
  const filas = sheet.locator('#st-list .st-li');
  await lg('estancado').click();
  await expect(sheet).toBeVisible();
  await expect(p.locator('#st-title')).toHaveText('Estancados 3+ sem. · 2');
  await expect(p.locator('#st-title')).toBeFocused();
  await expect(filas).toHaveCount(2);
  await expect(filas.locator('.an-li-t b')).toHaveText(['Beto Gómez', 'Dani López']);
  await expect(filas.nth(0)).toContainText('BG');
  await expect(filas.nth(0).locator('.st-pill')).toHaveText('estable 3 sem.');
  await expect(filas.nth(0)).toContainText('Último pesaje: 21 oct');
  await expect(filas.nth(1)).toContainText('Último pesaje: 19 oct');
  await expect(p.locator('#st-rule')).toContainText('Bajando o subiendo: cambio de 0,3 kg o más en el promedio semanal; estancado: menos que eso durante 3 semanas o más. Es una tendencia, no una evaluación.');
  expect(await sheet.textContent()).not.toMatch(/deber[ií]a|te recomendamos|recomendaci[oó]n|consejo|\bbien\b|\bmal\b/i);
  await H.shot(p, 'v3-tendencia-estancados.png');
  // Esc cierra y el foco vuelve a la categoría
  await p.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(lg('estancado')).toBeFocused();
  // La barra de color: bajando → Ana (−0,5 kg/sem); Cerrar
  await res.locator('.an-seg-b[data-trend="bajando"]').click();
  await expect(p.locator('#st-title')).toHaveText('Van bajando · 1');
  await expect(filas.locator('.an-li-t b')).toHaveText(['Ana Martínez']);
  await expect(filas.nth(0).locator('.st-pill')).toHaveText('−0,5 kg/sem');
  await expect(filas.nth(0)).toContainText('Último pesaje: 20 oct');
  await sheet.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(sheet).toBeHidden();
  await lg('subiendo').click();
  await expect(filas.locator('.an-li-t b')).toHaveText(['Eva Ríos']);
  await expect(filas.nth(0).locator('.st-pill')).toHaveText('+0,3 kg/sem');
  await p.keyboard.press('Escape');
  // Sin datos: Carla, con el motivo neutro; lo de su pausa privada no aparece (ni la fecha)
  await lg('sin_datos').click();
  await expect(p.locator('#st-title')).toHaveText('Sin datos · 1');
  await expect(p.locator('#st-sub')).toHaveText('No hay pesajes suficientes en las últimas semanas para ver una tendencia.');
  await expect(filas.locator('.an-li-t b')).toHaveText(['Carla Ruiz']);
  await expect(filas.nth(0).locator('.st-pill')).toHaveText('sin pesajes suficientes');
  await expect(filas.nth(0)).toContainText('Sin pesajes');
  await expect(sheet).not.toContainText('Último pesaje');
  await p.keyboard.press('Escape');
  // Una fila abre la ficha; ahí Anterior / Siguiente siguen funcionando
  await lg('estancado').click();
  await filas.filter({ hasText: 'Dani López' }).click();
  await expect(sheet).toBeHidden();
  await expect(p.locator('#coach-detail-title')).toHaveText('Dani López');
  await expect(p.locator('#coach-detail-view')).toBeVisible();
  await p.locator('#btn-coach-next').click();
  await expect(p.locator('#coach-detail-title')).not.toHaveText('Dani López');
  await p.locator('#btn-coach-prev').click();
  await expect(p.locator('#coach-detail-title')).toHaveText('Dani López');
  expect(errors).toEqual([]);
});

test('M1 + M5: el asesorado ve SOLO sus metas (con el pie literal) y jamás un ranking, su puesto ni datos de otros; sin metas no hay ninguna meta', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo, { habits: true });
  await H.seedClient(p, 'rival@c.co', 'Rival Secreto', await como(p, 'laura@coach.co', 'return (await r.coach.myCoach()).inviteCode;'), { paidDays: 20, habits: true, measures: pesos([[-3, 60]]) });
  await H.seedState(p, { entries: [{ date: iso(-20), weight: 75, waist: 82 }, { date: iso(-1), weight: 73, waist: 80 }], habits: { [iso(0)]: { trained: true, water: 2 } } });
  // Sin metas del coach: Progreso abre en Medidas, sin «Metas», sin pie ni número sugerido
  await p.locator('#tab-registro').click();
  await expect(p.locator('#view-progreso')).toBeVisible();
  await expect(p.locator('#view-progreso .prog-seg [data-goto="metas"]')).toHaveCount(0);
  expect(await todoElTexto(p)).not.toContain('Metas orientativas');
  // El coach fija metas
  await como(p, 'laura@coach.co', 'return r.coach.setGoals(idOf("ana@c.co"), arg);',
    { weight_kg: 70, waist_cm: 76, protein_g: 110, water_days: 5, trained_days: 3 });
  await p.evaluate(() => PGAccount.refreshLink());
  await p.locator('#tab-panel').click();
  await p.locator('#tab-registro').click();
  await expect(p.locator('#view-metas')).toBeVisible();
  await expect(p.locator('#metas-foot')).toHaveText(FOOT);
  expect((await todoElTexto(p)).split('Metas orientativas fijadas').length - 1).toBe(1);   // UN solo pie, no uno por tarjeta
  expect(await todoElTexto(p)).not.toContain('Meta orientativa propuesta por tu coach');
  await expect(p.locator('#metas-cards')).toContainText('meta 70 kg');
  await expect(p.locator('#metas-cards')).toContainText('faltan 3 kg');
  await expect(p.locator('#metas-cards .ch-goal')).toHaveCount(1);
  await expect(p.locator('#metas-cards .mt-rings li')).toHaveCount(2);
  await p.locator('#view-metas .prog-seg button', { hasText: 'Medidas' }).click();
  await expect(p.locator('#view-progreso')).toBeVisible();
  // Nada del ranking ni de la analítica llega al asesorado
  await expect(p.locator('#tab-analitica')).toBeHidden();
  await p.evaluate(() => PGNav.show('analitica'));
  expect(await p.locator('#an-ranking').innerHTML()).toBe('');
  expect(await p.locator('#an-resumen').innerHTML()).toBe('');
  const txt = await todoElTexto(p);
  expect(txt).not.toContain('Rival Secreto');
  expect(txt).not.toContain('Solo tú lo ves');
  expect(txt).not.toMatch(/puesto \d|#\d+ de \d+/i);
  expect(await p.evaluate(async () => { try { await PGAccount.remote.coach.analytics('2026-10-15', '2026-10-21'); return 'ok'; } catch (e) { return e.code; } })).toBe('forbidden');
  expect(await p.evaluate(async () => { try { await PGAccount.remote.coach.notices('2026-10-21'); return 'ok'; } catch (e) { return e.code; } })).toBe('forbidden');
  await expect(p.locator('#row-admin')).toBeHidden();
  expect(errors).toEqual([]);
});

test('M7–M10: «Panel admin» aparece SOLO con el rol; suspender y reactivar con confirmación y motivo; uso y por coach solo con cantidades; publicar un aviso', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo, { habits: true });
  await H.seedClient(p, 'rival@c.co', 'Rival Secreto', await como(p, 'laura@coach.co', 'return (await r.coach.myCoach()).inviteCode;'), { paidDays: 20, habits: true, measures: pesos([[-3, 60]]) });
  await p.locator('#tab-mas').click();
  await expect(p.locator('#row-admin')).toBeHidden();
  await p.evaluate(() => PGNav.show('admin-coaches'));
  expect(await p.locator('#adm-coaches').innerHTML()).toBe('');
  expect(await p.evaluate(async () => { try { await PGAccount.remote.admin.coaches('2026-10-01'); return 'ok'; } catch (e) { return e.code; } })).toBe('forbidden');
  // El rol se da a mano (aquí, en el servidor falso, como haría la sentencia SQL)
  await p.evaluate(async () => { const be = window.__pgFakeBackend; be._grant(Object.values(be.users).find((u) => u.email === 'ana@c.co').id, 'admin'); be._persist(); await PGAccount.refresh(); });
  await p.locator('#tab-mas').click();
  await expect(p.locator('#row-admin')).toBeVisible();
  await p.locator('#row-admin').click();
  expect(await p.locator('.tabbar button:visible .tb-label').allTextContents()).toEqual(['Coaches', 'Uso', 'Por coach', 'Avisos', 'Más']);
  const co = p.locator('#adm-coaches');
  await expect(co.locator('.adm-row')).toHaveCount(1);
  await expect(co.locator('.adm-row')).toContainText('Laura Fit');
  await expect(co.locator('.adm-row')).toContainText(/\d activos? · 0 sobre el cupo de 5/);
  await expect(co.locator('.adm-row .adm-money')).toHaveText('USD 0');
  await expect(co).toContainText('Coaches con mayor éxito');
  await expect(co).toContainText('nunca kilos, centímetros ni cambios corporales');
  await H.tall(p, '#view-admin-coaches');
  // Suspender (con confirmación y motivo)
  await co.locator('[data-susp]').click();
  await expect(p.locator('#ss-title')).toHaveText('¿Suspender a Laura Fit?');
  await expect(p.locator('#ss-text')).toContainText('Sus 2 asesorados siguen usando la app y conservan sus datos.');
  await p.locator('#ss-cancel').click();
  expect(await p.evaluate(() => Object.values(window.__pgFakeBackend.coaches)[0].active)).toBe(true);
  await co.locator('[data-susp]').click();
  await p.locator('#ss-reason').fill('Prueba de suspensión');
  await p.locator('#ss-ok').click();
  await expect(co.locator('.adm-st')).toHaveText('Suspendido');
  await expect(co).toContainText('Motivo: Prueba de suspensión');
  expect(await p.evaluate(() => Object.values(window.__pgFakeBackend.coaches)[0].active)).toBe(false);
  await co.locator('[data-susp]').click();
  await expect(p.locator('#ss-title')).toHaveText('¿Reactivar a Laura Fit?');
  await p.locator('#ss-ok').click();
  await expect(co.locator('.adm-st')).toHaveText('Activo');
  expect(await p.evaluate(() => Object.values(window.__pgFakeBackend.coaches)[0].active)).toBe(true);
  // Uso general y por coach: solo totales
  await p.locator('#tab-adm-uso').click();
  await expect(p.locator('#adm-uso')).toContainText('Solo cifras totales. Sin nombres de asesorados ni datos de salud.');
  await expect(p.locator('#adm-uso')).toContainText('asesorados activos');
  await p.locator('#tab-adm-coach').click();
  await expect(p.locator('#adm-coach')).toContainText('Solo uso de la app. Nunca peso, medidas, comidas, fotos ni salud.');
  await expect(p.locator('#adm-coach')).toContainText('Con menos de 3 asesorados no se muestra');
  const admin = await p.evaluate(() => ['#view-admin-coaches', '#view-admin-uso', '#view-admin-coach'].map((s) => document.querySelector(s).textContent).join(' '));
  expect(admin).not.toContain('Rival Secreto');
  expect(admin).not.toMatch(/\bkg\b|\bcm\b|peso \d|cintura \d|kcal/i);
  // Avisos
  await p.locator('#tab-adm-avisos').click();
  await expect(p.locator('#aviso-help')).toContainText('Solo comunicación operativa, técnica o de servicio.');
  await p.locator('#aviso-title').fill('Mantenimiento el domingo');
  await p.locator('#aviso-body').fill('La app puede ir lenta. Tus datos no se pierden.');
  await expect(p.locator('#aviso-prev-title')).toHaveText('Mantenimiento el domingo');
  await p.locator('#aviso-from').fill(iso(0));
  await p.locator('#aviso-to').fill(iso(5));
  await p.locator('#btn-aviso-publicar').click();
  await expect(p.locator('#adm-avisos li')).toHaveCount(1);
  await expect(p.locator('#adm-avisos li')).toContainText('Activo');
  await H.tall(p, '#view-admin-avisos');
  // Salir del panel admin: vuelve la barra de siempre
  await p.locator('#tab-mas').click();
  await expect(p.locator('#row-admin-t')).toHaveText('Salir del panel admin');
  await p.locator('#row-admin').click();
  expect(await p.locator('.tabbar button:visible .tb-label').allTextContents()).toEqual(['Inicio', 'Comidas', 'Entrenar', 'Progreso', 'Más']);
  expect(errors).toEqual([]);
});

test('M10: el coach ve «Aviso de la plataforma» arriba de su lista y lo cierra (se recuerda en el teléfono); se registra solo la fecha en que abrió el panel', async ({ browser }, testInfo) => {
  const { p, errors } = await H.coachApp(browser, testInfo, CLIENTES.slice(0, 1));
  await como(p, 'jose@admin.co', 'be._grant(idOf("jose@admin.co"), "admin"); await r.admin.saveNotice({ title: "Mantenimiento el domingo", body: "La app puede ir lenta. Tus datos no se pierden.", from: arg[0], to: arg[1] }); await r.admin.saveNotice({ title: "Aviso viejo", body: "Ya pasó.", from: arg[2], to: arg[2] }); be._persist();', [iso(-1), iso(4), iso(-1)]);
  await p.locator('#tab-coach').click();
  const card = p.locator('#coach-avisos .pa-card');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Aviso de la plataforma');
  await expect(card).toContainText('Mantenimiento el domingo');
  await expect(card).toContainText('La app puede ir lenta. Tus datos no se pierden.');
  expect(await H.contrast(p, '#coach-avisos .pa-tag')).toBeGreaterThanOrEqual(4.5);
  expect(await p.evaluate(() => { const be = window.__pgFakeBackend; return Object.values(be.panelDays)[0]; })).toEqual([iso(0)]);
  await p.getByRole('button', { name: 'Cerrar el aviso «Mantenimiento el domingo»' }).click();
  await expect(card).toHaveCount(0);
  await p.reload(); await H.ready(p);
  await p.locator('#tab-coach').click();
  await expect(p.locator('#coach-clients [data-client]')).toHaveCount(1);
  await expect(p.locator('#coach-avisos .pa-card')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test.setTimeout(120000);
test('390 px con letra al 200 %: Analítica, Ranking, Gráficas, Fijar metas, Metas del asesorado y el panel admin sin desborde; contraste AA en oscuro y claro', async ({ browser }, testInfo) => {
  const { p, errors } = await H.coachApp(browser, testInfo, CLIENTES);
  await como(p, 'laura@coach.co', 'return r.coach.setGoals(idOf("ana@c.co"), arg);', { weight_kg: 70, waist_cm: 76, protein_g: 110, water_days: 5, steps_days: 4, sleep_days: 6, trained_days: 3 });
  await p.evaluate(async () => { const be = window.__pgFakeBackend; be._grant(Object.values(be.users).find((u) => u.email === 'laura@coach.co').id, 'admin'); be._persist(); await PGAccount.refresh(); });
  await p.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const sinDesborde = async (donde) => {
    const bad = await p.evaluate(() => {
      const out = [];
      const vw = document.documentElement.clientWidth;
      if (document.documentElement.scrollWidth > vw) out.push('scroll horizontal ' + document.documentElement.scrollWidth);
      for (const el of document.querySelectorAll('button, .btn, select, input, .an-k, .rk-li, .card, .pa-card, svg.ch, .adm-row, dialog[open] .sm-f')) {
        if (!el.offsetParent || el.closest('.hidden, dialog:not([open])')) continue;
        const r = el.getBoundingClientRect();
        if (r.width && (r.left < -0.5 || r.right > vw + 0.5)) out.push(`${el.id || el.className.baseVal || el.className} fuera ${Math.round(r.left)}-${Math.round(r.right)}`);
      }
      return out;
    });
    expect(bad, donde).toEqual([]);
  };
  // Con letra al 200 % la barra de arriba y la de abajo ocupan mucho: el toque se hace sobre el propio botón (como un lector de pantalla).
  const tap = (sel, opts) => p.locator(sel, opts).first().evaluate((b) => b.click());
  const aa = async (sels, donde) => { for (const s of sels) if (await p.locator(s).first().isVisible()) expect(await H.contrast(p, s), `${donde}: ${s}`).toBeGreaterThanOrEqual(4.5); };
  for (const scheme of ['dark', 'light']) {
    await p.emulateMedia({ colorScheme: scheme });
    await tap('#tab-analitica');
    await tap('#ant-resumen');
    await expect(p.locator('#an-resumen .an-glow')).toBeVisible();
    await sinDesborde(`${scheme}: Analítica`);
    await aa(['#an-resumen .an-tag', '#an-range', '#an-resumen .an-k span', '#an-resumen .an-pill', '#an-resumen .an-lgd li', '#an-resumen .an-tag.w', '#an-resumen .an-li-t small', '#view-analitica [data-atab][aria-selected="true"]'], scheme);
    // Tendencia con clic: la lista de una categoría, sin desborde y con AA
    await aa(['#an-resumen .an-lgd-btn span'], scheme);
    await tap('#an-resumen .an-lgd-btn[data-trend="estancado"]');
    await expect(p.locator('#sheet-tend')).toBeVisible();
    await sinDesborde(`${scheme}: Tendencia (lista)`);
    await aa(['#st-title', '#st-sub', '#st-list .an-li-t b', '#st-list .an-li-t small', '#st-list .st-pill', '#st-close', '#st-rule'], `${scheme}: lista`);
    if (scheme === 'dark') await H.shot(p, 'v3-tendencia-200-oscuro.png');
    await p.keyboard.press('Escape');
    await expect(p.locator('#sheet-tend')).toBeHidden();
    await tap('#ant-ranking');
    await tap('[data-by="puntos"]');
    await sinDesborde(`${scheme}: Ranking`);
    await aa(['#an-rk-label', '.rk-li small', '.rk-n.top', '[data-by][aria-pressed="true"]', '.rk-apart'], scheme);
    await tap('#tab-coach');
    await tap('#coach-clients [data-client]', { hasText: 'Ana Martínez' });
    await tap('#fct-graficas');
    await sinDesborde(`${scheme}: Gráficas`);
    await aa(['#fc-graficas .an-tag', '#fc-graficas .an-tbl td.up', '#fc-graficas .an-tbl th', '#fct-graficas'], scheme);
    await tap('#fct-metas');
    await tap('#btn-fijar-metas');
    await sinDesborde(`${scheme}: Fijar metas`);
    await aa(['#sheet-metas .an-banner span:last-child', '#sheet-metas .sm-f small', '#sm-save'], scheme);
    await tap('#sm-cancel');
    await tap('#tab-mas');
    await tap('#row-admin');
    await expect(p.locator('#adm-coaches .adm-row')).toHaveCount(1);
    await sinDesborde(`${scheme}: Coaches`);
    await aa(['.adm-tag', '#adm-coaches .adm-st', '#adm-coaches .adm-btn', '#adm-coaches .an-k span', '.adm-best dt'], scheme);
    for (const [tab, box] of [['#tab-adm-uso', '#adm-uso .an-k'], ['#tab-adm-coach', '#adm-coach .adm-days'], ['#tab-adm-avisos', '#aviso-preview']]) {
      await p.locator(tab).click();
      await expect(p.locator(box).first()).toBeVisible();
      await sinDesborde(`${scheme}: ${tab}`);
    }
    await aa(['#aviso-help', '.pa-tag', '#aviso-prev-body', '.adm-av-t small'], scheme);
    await tap('#tab-mas');
    await tap('#row-admin');
  }
  expect(errors).toEqual([]);
});

test('M1 a 390 px con letra al 200 %: metas del asesorado sin desborde y con contraste AA (oscuro y claro)', async ({ browser }, testInfo) => {
  const { p, errors } = await H.clientApp(browser, testInfo, { habits: true });
  await H.seedState(p, { entries: [{ date: iso(-20), weight: 75, waist: 82 }, { date: iso(-1), weight: 73, waist: 80 }], habits: { [iso(0)]: { trained: true, water: 2 } }, foods: { [iso(0)]: [{ name: 'Pollo', protein: 40, kcal: 300 }] } });
  await como(p, 'laura@coach.co', 'return r.coach.setGoals(idOf("ana@c.co"), arg);', { weight_kg: 70, waist_cm: 76, protein_g: 110, water_days: 5, steps_days: 4, sleep_days: 6, trained_days: 3 });
  await p.evaluate(() => PGAccount.refreshLink());
  await p.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  for (const scheme of ['dark', 'light']) {
    await p.emulateMedia({ colorScheme: scheme });
    await p.locator('#tab-panel').click();
    await p.locator('#tab-registro').click();
    await expect(p.locator('#view-metas')).toBeVisible();
    expect(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), scheme).toBe(true);
    for (const s of ['#metas-cards .an-tag', '#metas-cards .an-pill', '#metas-foot', '#metas-cards .mt-rings small', '#metas-cards .mt-left', '#view-metas .prog-seg button.on']) expect(await H.contrast(p, s), `${scheme}: ${s}`).toBeGreaterThanOrEqual(4.5);
  }
  expect(errors).toEqual([]);
});
