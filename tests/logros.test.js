// Insignias v4 (diseño B «Escudo por categoría»): cada regla, los niveles por semanas (1, 4 y 12), la migración de las 8 de antes, la memoria
// («nunca pierdes un nivel»), «Equipo» con la meta colectiva, retos del coach, textos accesibles y los dibujos SVG.
const test = require('node:test');
const assert = require('node:assert');
const L = require('../logros.js');
const C = require('../constancia.js');

const TODAY = '2026-10-21';   // miércoles; semana del lunes 19
const d = (n) => C.addDays(TODAY, n);
const empty = () => ({ habits: {}, foods: {}, entries: [] });
const get = (st, id, ctx = {}, today = TODAY) => L.compute(st, today, { retosOn: true, ...ctx }).list.find((b) => b.id === id);
// n semanas (hacia atrás desde la semana pasada) en que `fill(lunes, st)` escribe lo de esa semana
function weeksBack(n, fill, st = empty()) { const mon = C.weekStart(TODAY); for (let i = 1; i <= n; i++) fill(C.addDays(mon, -7 * i), st); return st; }
const days = (mon, k, h, st) => { for (let i = 0; i < k; i++) st.habits[C.addDays(mon, i)] = { ...(st.habits[C.addDays(mon, i)] || {}), ...h }; };

test('catálogo: 17 insignias en 6 categorías con su silueta; 2 fuera por falta de datos; nunca peso, kcal, cm ni fotos', () => {
  assert.strictEqual(L.CATALOG.length, 17);
  assert.deepStrictEqual(L.CATS.map((c) => [c.name, c.shape]), [['Primeros pasos', 'circ'], ['Constancia', 'rombo'], ['Hábitos', 'hex'], ['Entreno', 'shield'], ['Registro', 'square'], ['Retos', 'star']]);
  assert.deepStrictEqual(L.FUERA.map((x) => x.id), ['tecnica-primero', 'te-escucho']);
  assert.strictEqual(L.CATALOG.length + L.FUERA.length, 19);
  for (const b of L.CATALOG) assert.ok(!/\b(kg|kilo|peso|cm|cent[ií]metro|kcal|calor[ií]as? (?:de )?menos|foto)/i.test(b.what.replace('Las calorías no importan', '').replace('Nunca cuenta el resultado', '')), b.id);
  assert.deepStrictEqual(L.CATALOG.filter((b) => b.hito).map((b) => b.id), ['arranco', 'primera-semana', 'primer-mes', 'volviste']);
  assert.deepStrictEqual(L.NEED, [0, 1, 4, 12]);
});

test('migración: las 8 insignias de antes conservan id y fecha (su regla es el bronce o el hito)', () => {
  const st = empty();
  // 6 semanas de historia variada + un hueco de 9 días (Volviste)
  for (let k = 60; k >= 0; k--) {
    if (k >= 40 && k <= 48) continue;
    st.habits[d(-k)] = { water: k % 7 !== 3 ? 2.25 : 1, steps: k % 7 < 5 ? 9000 : 3000, sleep: k % 7 < 5 ? 7.5 : 6, trained: [0, 2, 4].includes(k % 7) };
  }
  const old = C.badges(st, TODAY);
  const nu = L.compute(st, TODAY, {}).list;
  assert.deepStrictEqual(L.OLD_IDS, old.map((b) => b.id));
  for (const o of old) {
    const b = nu.find((x) => x.id === o.id);
    assert.ok(b, o.id);
    assert.strictEqual(b.earned, o.earned, o.id);
    assert.strictEqual(b.dates[1], o.date, o.id);
  }
  assert.ok(old.filter((b) => b.earned).length >= 7);
});

test('niveles: bronce con 1 semana, plata con 4 y oro con 12 (no tienen que ser seguidas); la fecha de cada nivel es el día en que se cumplió', () => {
  const st = weeksBack(14, (mon, s) => { if (mon.endsWith('-07') || mon.endsWith('-14')) return; days(mon, 5, { water: 2 }, s); });   // 12 de 14 semanas
  const b = get(st, 'hidratado');
  assert.strictEqual(b.level, 3);
  assert.strictEqual(b.count, 12);
  const q = Object.keys(st.habits).sort();
  assert.strictEqual(b.dates[1], q[4]);
  assert.ok(b.dates[1] < b.dates[2] && b.dates[2] < b.dates[3]);
  assert.strictEqual(b.next, null);
  const three = weeksBack(3, (mon, s) => days(mon, 5, { water: 2 }, s));
  const h3 = get(three, 'hidratado');
  assert.deepStrictEqual([h3.level, h3.count, h3.next.level, h3.next.need], [1, 3, 2, 4]);
  assert.strictEqual(L.a11y(h3, TODAY), `Hidratado/a, nivel bronce, ganada el ${L.dm(h3.date)}. Para plata: 3 de 4 semanas`);
});

test('nunca por hacer más: 20.000 pasos, 12 vasos o 7 entrenos valen lo mismo; dormir más de 10 h no cuenta; ninguna pide 7 de 7', () => {
  const a = weeksBack(1, (mon, s) => days(mon, 5, { steps: 8000, water: 2, trained: true }, s));
  const b = weeksBack(1, (mon, s) => days(mon, 7, { steps: 20000, water: 3, trained: true }, s));
  for (const id of ['pata-de-perro', 'hidratado', 'tres-de-tres', 'entrenos-acumulados']) assert.strictEqual(get(a, id).level, get(b, id).level, id);
  const sleep = weeksBack(1, (mon, s) => days(mon, 7, { sleep: 11 }, s));
  assert.strictEqual(get(sleep, 'buen-dormir').level, 0);
  assert.strictEqual(get(weeksBack(1, (mon, s) => days(mon, 5, { sleep: 7 }, s)), 'buen-dormir').level, 1);
  assert.strictEqual(get(weeksBack(1, (mon, s) => days(mon, 4, { steps: 9000 }, s)), 'pata-de-perro').level, 0, '4 de 7 no alcanza');
});

test('cada regla de proceso: constancia, registro honesto, semana redonda, tres de tres, entrenos, descanso, plato a plato y medidas', () => {
  // Semanas constantes (≥ 4 días con registro; comodines cuentan)
  const c = weeksBack(4, (mon, s) => days(mon, 4, { water: 0.5 }, s));
  assert.strictEqual(get(c, 'semanas-constantes').level, 2);
  const c2 = weeksBack(1, (mon, s) => days(mon, 2, { water: 0.5 }, s));   // 2 días + 2 comodines = constante
  assert.strictEqual(get(c2, 'semanas-constantes').level, 1);
  // Registro honesto: 3 días anotados aunque alguno no llegara a la meta
  const h = weeksBack(1, (mon, s) => days(mon, 3, { water: 1, sleep: 8 }, s));
  assert.strictEqual(get(h, 'registro-honesto').level, 1);
  const perfect = weeksBack(1, (mon, s) => days(mon, 3, { water: 2, sleep: 8 }, s));
  assert.strictEqual(get(perfect, 'registro-honesto').level, 0, 'solo días con algo por debajo de la meta');
  // Semana redonda: agua, pasos, sueño y 2 comidas, cada uno ≥ 4 días
  const r = weeksBack(1, (mon, s) => { days(mon, 4, { water: 2, steps: 9000, sleep: 7 }, s); for (let i = 0; i < 4; i++) s.foods[C.addDays(mon, i)] = [{ name: 'a', kcal: 1 }, { name: 'b', kcal: 1 }]; });
  assert.strictEqual(get(r, 'semana-redonda').level, 1);
  const r2 = weeksBack(1, (mon, s) => days(mon, 4, { water: 2, steps: 9000, sleep: 7 }, s));
  assert.strictEqual(get(r2, 'semana-redonda').level, 0);
  // Tres de tres y Entrenos acumulados (semanas con al menos un entreno)
  const t = weeksBack(4, (mon, s) => days(mon, 3, { trained: true }, s));
  assert.deepStrictEqual([get(t, 'tres-de-tres').level, get(t, 'entrenos-acumulados').level], [2, 2]);
  const one = weeksBack(1, (mon, s) => days(mon, 1, { trained: true }, s));
  assert.deepStrictEqual([get(one, 'tres-de-tres').level, get(one, 'entrenos-acumulados').level], [0, 1]);
  // Descanso inteligente: «Hoy es mi día de descanso» (plan); «me siento mal» no cuenta
  assert.strictEqual(get(weeksBack(1, (mon, s) => { s.habits[mon] = { rest: 'plan' }; }), 'descanso-inteligente').level, 1);
  assert.strictEqual(get(weeksBack(1, (mon, s) => { s.habits[mon] = { rest: 'sick' }; }), 'descanso-inteligente').level, 0);
  // Plato a plato: 4 días con ≥ 2 comidas (las kcal no importan)
  const pl = weeksBack(1, (mon, s) => { for (let i = 0; i < 4; i++) s.foods[C.addDays(mon, i)] = [{ name: 'a', kcal: 4000 }, { name: 'b', kcal: 0 }]; });
  assert.strictEqual(get(pl, 'plato-a-plato').level, 1);
  const pl1 = weeksBack(1, (mon, s) => { for (let i = 0; i < 7; i++) s.foods[C.addDays(mon, i)] = [{ name: 'a', kcal: 1 }]; });
  assert.strictEqual(get(pl1, 'plato-a-plato').level, 0, 'una comida al día no alcanza');
  // Midiendo con cabeza: 1 por semana con 6 días o más entre registros; medirse a diario no suma; el valor nunca importa
  const m = empty();
  for (let k = 0; k < 28; k++) m.entries.push({ date: d(-k), weight: 200 - k, waist: 50 });
  const mm = get(m, 'midiendo-con-cabeza');
  assert.ok(mm.count <= 5 && mm.level === 2, `semanas ${mm.count}`);
  const m2 = { ...empty(), entries: m.entries.map((e) => ({ ...e, weight: 60, waist: 120 })) };
  assert.deepStrictEqual([get(m2, 'midiendo-con-cabeza').level, get(m2, 'midiendo-con-cabeza').count], [mm.level, mm.count], 'el resultado no cambia nada');
});

test('hitos sin nivel: Arrancó, Primera semana, Primer mes y Volviste (nunca sube por volver muchas veces)', () => {
  const st = empty();
  for (const k of [-60, -59, -58, -57, -40, -20, -19, -18, -17, -16, -15, -14, -13]) st.habits[d(k)] = { water: 1 };
  const res = L.compute(st, TODAY, {});
  const v = res.list.find((b) => b.id === 'volviste');
  assert.deepStrictEqual([v.hito, v.level, v.date, v.next], [true, 1, d(-40), null]);
  assert.strictEqual(L.status(v), L.dm(d(-40)));
  assert.strictEqual(L.a11y(v, TODAY), `Volviste, ganada el ${L.dm(d(-40))}`);
  assert.strictEqual(res.list.find((b) => b.id === 'primera-semana').date, d(-57));
  assert.strictEqual(res.list.find((b) => b.id === 'primer-mes').date, d(-30));
  // En progreso: «2 de 4 días» en la primera semana
  const s2 = empty(); s2.habits[d(-1)] = { water: 1 }; s2.habits[TODAY] = { water: 1 };
  const p = get(s2, 'primera-semana');
  assert.deepStrictEqual([p.state, L.status(p)], ['progress', '2 de 4']);
  assert.strictEqual(L.moreLine(p), 'Dos días más con registro en tu primera semana.');
});

test('estados: ganada, en progreso («3 de 5» de esta semana) y bloqueada («Aún no»); «Te falta poco» elige lo más avanzado de la semana', () => {
  const st = empty();
  for (let i = 0; i < 3; i++) st.habits[d(-2 + i)] = { sleep: 8, water: 0.5 };
  const res = L.compute(st, TODAY, {});
  const bd = res.list.find((b) => b.id === 'buen-dormir');
  assert.deepStrictEqual([bd.state, L.status(bd)], ['progress', '3 de 5']);
  assert.strictEqual(L.a11y(bd, TODAY), 'Buen dormir, en progreso: 3 de 5 noches esta semana');
  assert.strictEqual(L.moreLine(bd), 'Dos noches más de 7 a 10 h esta semana.');
  const pa = res.list.find((b) => b.id === 'pata-de-perro');
  assert.deepStrictEqual([pa.state, L.status(pa), L.a11y(pa, TODAY)], ['locked', 'Aún no', 'Pata de perro, aún no la tienes']);
  assert.strictEqual(res.near.id, 'primera-semana');   // 3 de 4 (75 %) gana a Buen dormir 3 de 5; Registro honesto 3 de 3 ya está completo
});

test('nunca pierdes un nivel: lo recordado se une a lo calculado aunque se borre el registro', () => {
  const st = weeksBack(4, (mon, s) => days(mon, 5, { water: 2 }, s));
  const res = L.compute(st, TODAY, {});
  const mem = L.remember({}, res);
  assert.strictEqual(Object.keys(mem.levels.hidratado).length, 2);
  const res2 = L.compute(empty(), TODAY, { memory: mem });
  const h = res2.list.find((b) => b.id === 'hidratado');
  assert.deepStrictEqual([h.level, h.date, h.count], [2, res.list.find((b) => b.id === 'hidratado').date, 4]);
  // Memoria dañada: se limpia sin romper
  const bad = L.normMemory({ levels: { hidratado: { 1: 'x', 2: '2026-01-05' }, falsa: { 1: '2026-01-01' } }, retos: { a: 5 }, equipo: { 'no-fecha': '2026-01-01' }, seen: { hidratado: 9 } });
  assert.deepStrictEqual(bad, { levels: { hidratado: { 2: '2026-01-05' } }, retos: {}, equipo: {}, seen: {}, init: false });
});

test('celebración una sola vez: lo nuevo de hoy o ayer se celebra; lo viejo se da por visto sin fiesta', () => {
  const FRI = '2026-10-23';
  const st = weeksBack(3, (mon, s) => days(mon, 5, { water: 2 }, s));
  for (let i = 0; i < 4; i++) st.habits[C.addDays('2026-10-19', i)] = { water: 2 };
  const before = L.compute(st, FRI, {});
  const seen = L.seenOf(before);
  st.habits[FRI] = { water: 2 };   // 5.º día de esta semana → 4.ª semana → plata, hoy
  const after = L.compute(st, FRI, {});
  assert.deepStrictEqual(L.fresh(seen, after, FRI).map((b) => [b.id, b.level]).filter(([id]) => id === 'hidratado'), [['hidratado', 2]]);
  assert.deepStrictEqual(L.fresh(L.seenOf(after), after, FRI), []);
  // Un nivel con fecha vieja (sincronizado de otro teléfono) no se celebra
  const old = weeksBack(1, (mon, s) => days(mon, 3, { trained: true }, s));
  assert.deepStrictEqual(L.fresh({}, L.compute(old, TODAY, {}), TODAY).filter((b) => b.id === 'tres-de-tres'), []);
});

test('Equipo: semana con la meta del team cumplida en la que la persona sumó; nunca con opt-out, sin compartir, en pausa ni sin aporte propio', () => {
  const team = { metric: 'entrenos', target: 20, total: 21, published: true, participants: 6, weekStart: '2026-10-19', optedOut: false };
  const mine = { paused: false, log: [{ day: '2026-10-20', kind: 'entreno', points: 3 }, { day: '2026-10-20', kind: 'registro', points: 2 }] };
  const shares = { habits: true, nutrition: true };
  assert.deepStrictEqual(L.teamWeek({ team, mine, shares, today: TODAY }), { wk: '2026-10-19', date: TODAY });
  assert.strictEqual(L.teamWeek({ team: { ...team, total: 19 }, mine, shares, today: TODAY }), null, 'no cumplida');
  assert.strictEqual(L.teamWeek({ team: { ...team, published: false, total: null }, mine, shares, today: TODAY }), null, 'menos de 5');
  assert.strictEqual(L.teamWeek({ team: { ...team, optedOut: true }, mine, shares, today: TODAY }), null, 'opt-out');
  assert.strictEqual(L.teamWeek({ team, mine, shares: { habits: false, nutrition: true }, today: TODAY }), null, 'no comparte hábitos');
  assert.strictEqual(L.teamWeek({ team, mine: { ...mine, paused: true }, shares, today: TODAY }), null, 'en pausa');
  assert.strictEqual(L.teamWeek({ team, mine: { ...mine, log: mine.log.filter((r) => r.kind !== 'entreno') }, shares, today: TODAY }), null, 'meta de entrenos sin entrenar');
  assert.ok(L.teamWeek({ team: { ...team, metric: 'puntos' }, mine: { ...mine, log: mine.log.filter((r) => r.kind !== 'entreno') }, shares, today: TODAY }), 'meta de puntos con puntos propios');
  assert.strictEqual(L.teamWeek({ team: { none: true }, mine, shares, today: TODAY }), null);
  // 4 semanas recordadas → plata
  const eq = { '2026-09-28': '2026-10-02', '2026-10-05': '2026-10-09', '2026-10-12': '2026-10-16', '2026-10-19': TODAY };
  const b = get(empty(), 'equipo', { memory: { equipo: eq } });
  assert.deepStrictEqual([b.level, b.date], [2, TODAY]);
  assert.strictEqual(get(empty(), 'equipo').state, 'locked');
  assert.strictEqual(L.compute(empty(), TODAY, {}).list.some((x) => x.cat === 'ret'), false, 'sin coach no hay Retos');
});

test('Reto cumplido: retos del coach con mis marcas (dentro del reto); se recuerdan aunque la API ya no los traiga', () => {
  const retos = [{ id: 'a', start: d(-9), end: d(-3), target: 3, habit: 'water', marks: [d(-9), d(-8), d(-6), d(-20)] },
    { id: 'b', start: d(-2), end: d(4), target: 5, habit: 'sleep', marks: [d(-2), d(-1), TODAY] }];
  const res = L.compute(empty(), TODAY, { retos, retosOn: true });
  const r = res.list.find((b) => b.id === 'reto-cumplido');
  assert.deepStrictEqual([r.level, r.date], [1, d(-6)]);
  assert.deepStrictEqual(r.cur, { done: 3, of: 5, unit: ['noche', 'noches'] });
  const mem = L.remember({}, res);
  assert.deepStrictEqual(mem.retos, { a: d(-6) });
  assert.strictEqual(get(empty(), 'reto-cumplido', { memory: mem }).level, 1, 'recordado sin la API');
  const fuera = [{ id: 'c', start: d(-9), end: d(-3), target: 3, habit: 'water', marks: [d(-20), d(-19), d(-18)] }];
  assert.strictEqual(get(empty(), 'reto-cumplido', { retos: fuera }).level, 0, 'marcas fuera del reto no cuentan');
});

test('textos: nivel con ●●○ + palabra; «Qué es» con las semanas; nota de constancia; la vista del coach usa las mismas reglas sin Retos', () => {
  assert.deepStrictEqual([L.dots(1), L.dots(2), L.dots(3)], ['●○○', '●●○', '●●●']);
  const st = weeksBack(4, (mon, s) => days(mon, 5, { steps: 9000 }, s));
  const b = get(st, 'pata-de-perro');
  assert.strictEqual(L.status(b), 'Plata');
  assert.strictEqual(L.what(b), 'Cumplir tu meta de pasos 5 días de una semana. Llevas 4 semanas así (no tienen que ser seguidas).');
  assert.strictEqual(L.note(b), 'Cuenta tu constancia, no la cantidad: 8.000 pasos o 20.000 valen lo mismo. Nunca pierdes un nivel.');
  assert.match(L.a11y({ ...b, date: TODAY }, TODAY), /^Pata de perro, nivel plata, ganada hoy/);
  const coach = L.compute(st, TODAY, {});
  assert.strictEqual(coach.cats.length, 5);
  assert.strictEqual(coach.total, 15);
});

test('dibujos: SVG en línea ligero (sin imágenes externas), silueta por categoría, galones por nivel, candado en bloqueadas', () => {
  const defs = L.defs();
  assert.ok(defs.length < 9000, `defs ${defs.length}`);
  for (const k of Object.keys(L.SH)) assert.ok(defs.includes(`id="lg-s-${k}"`));
  const st = weeksBack(12, (mon, s) => days(mon, 5, { water: 2 }, s));
  const res = L.compute(st, TODAY, { retosOn: true });
  let total = 0;
  for (const b of res.list) {
    const svg = L.badgeSvg(b, { uid: 't' + b.id });
    total += svg.length;
    assert.ok(!/<image|https?:|data:/.test(svg), b.id);
    assert.ok(svg.includes(`#lg-s-${L.catOf(b.cat).shape}`), b.id);
    assert.ok(svg.includes('aria-hidden="true"'));
    if (b.state === 'locked') assert.ok(svg.includes('#lg-g-lock'), b.id);
  }
  assert.ok(total < 22000, `17 insignias pesan ${total} caracteres`);
  const oro = res.list.find((b) => b.id === 'hidratado');
  assert.strictEqual((L.badgeSvg(oro).match(/class="lg-chev"/g) || []).length, 3);
  assert.ok(L.badgeSvg(oro).includes('lv-g'));
  assert.ok(L.badgeSvg(oro, { lit: true, shine: true }).includes('lg-lit'));
});
