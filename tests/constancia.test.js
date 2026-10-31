// UX Etapa 1: constancia semanal con comodines, «día completo» e insignias de proceso (constancia.js, puro) y el registro de un toque (habitos.js).
const test = require('node:test');
const assert = require('node:assert');
const C = require('../constancia.js');
const H = require('../habitos.js');

// 2026-10-19 es lunes; 2026-10-24 es sábado.
const MON = '2026-10-19', SAT = '2026-10-24';
const add = (iso, n) => C.addDays(iso, n);
const hab = (days, extra = {}) => Object.fromEntries(days.map((d) => [d, { trained: false, water: 0.25, ...extra }]));
const st = (habits = {}, more = {}) => ({ habits, foods: {}, entries: [], ...more });

test('la semana va de lunes a domingo', () => {
  assert.strictEqual(C.weekStart('2026-10-19'), '2026-10-19');
  assert.strictEqual(C.weekStart('2026-10-24'), '2026-10-19');
  assert.strictEqual(C.weekStart('2026-10-25'), '2026-10-19');
  assert.strictEqual(C.weekStart('2026-10-26'), '2026-10-26');
});

test('un día con registro es cualquier registro: hábitos, comidas o medidas', () => {
  const s = st({ [MON]: { trained: false } }, { foods: { [add(MON, 1)]: [{ id: 'x', name: 'Arepa', kcal: 200 }] }, entries: [{ date: add(MON, 2), weight: 70 }, { date: add(MON, 3), note: 'solo nota' }] });
  const d = C.recordDates(s);
  assert.deepStrictEqual([...d].sort(), [MON, add(MON, 1), add(MON, 2)]);
});

test('semana constante = 4 días con registro; 3 días solos no bastan; los comodines (máx. 2) cubren días pasados', () => {
  const s4 = C.summary(st(hab([MON, add(MON, 1), add(MON, 3), add(MON, 4)])), SAT);
  assert.strictEqual(s4.week.registered, 4);
  assert.strictEqual(s4.week.constant, true);
  assert.strictEqual(s4.constantWeeks, 1);
  assert.strictEqual(s4.weekLine, '4 de 7 días');
  assert.ok(s4.week.days[2].comodin, 'el miércoles sin registro queda cubierto por un comodín (se pinta distinto, no como hueco)');
  assert.ok(!s4.week.days[5].comodin, 'hoy no se perdona: aún puede registrarse');
  // 2 días + 2 comodines = 4 → constante; 1 día solo no se «salva»
  const s2 = C.summary(st(hab([MON, add(MON, 2)])), SAT);
  assert.strictEqual(s2.week.comodines, 2);
  assert.strictEqual(s2.week.constant, true);
  const s1 = C.summary(st(hab([MON])), SAT);
  assert.strictEqual(s1.week.comodines, 0);
  assert.strictEqual(s1.week.constant, false);
  assert.match(s1.line, /Cada día que registras cuenta/);
  assert.doesNotMatch(JSON.stringify([s1, s2, s4]), /fallaste|perdiste|racha rota/i);
});

test('los comodines nunca se aplican a hoy ni al futuro', () => {
  // Lunes es hoy: 1 registro; nada pasado sin registro
  const s = C.summary(st(hab([MON])), MON);
  assert.strictEqual(s.week.comodines, 0);
  const s2 = C.summary(st(hab([MON, add(MON, 1)])), add(MON, 2));
  assert.strictEqual(s2.week.comodines, 0, 'el miércoles es hoy');
});

test('las semanas constantes se cuentan seguidas hacia atrás; una semana vacía corta la cuenta; la semana en curso no rompe nada', () => {
  const week = (start, n) => hab(Array.from({ length: n }, (_, i) => add(start, i)));
  const w = (k) => add(MON, -7 * k);
  // 3 semanas constantes seguidas (anteriores), semana en curso con 1 día
  const s = st({ ...week(w(3), 5), ...week(w(2), 4), ...week(w(1), 6), ...week(MON, 1) });
  assert.strictEqual(C.summary(s, SAT).constantWeeks, 3);
  // la en curso ya constante suma una
  const s2 = st({ ...week(w(3), 5), ...week(w(2), 4), ...week(w(1), 6), ...week(MON, 4) });
  assert.strictEqual(C.summary(s2, SAT).constantWeeks, 4);
  // hueco: la semana w(2) vacía corta
  const s3 = st({ ...week(w(3), 5), ...week(w(1), 6) });
  assert.strictEqual(C.summary(s3, SAT).constantWeeks, 1);
  assert.strictEqual(C.summary(st({}), SAT).constantWeeks, 0);
});

test('mensaje de regreso: días desde el último registro', () => {
  assert.strictEqual(C.daysSince(st({}), SAT), null);
  assert.strictEqual(C.daysSince(st(hab([MON])), SAT), 5);
  assert.strictEqual(C.daysSince(st(hab([SAT])), SAT), 0);
});

test('día completo: los 4 hábitos; el sueño de más de 10 h no cuenta; se nombra lo anotado', () => {
  const full = st({ [SAT]: { water: 2, steps: 8000, sleep: 7.5, trained: true } });
  assert.deepStrictEqual(C.dayDone(full, SAT), { done: 4, of: 4, complete: true, names: ['agua', 'sueño', 'pasos', 'entreno'] });
  assert.strictEqual(C.dayDone(st({ [SAT]: { water: 2, steps: 8000, sleep: 12, trained: true } }), SAT).complete, false);
  const half = st({ [SAT]: { water: 0.5, sleep: 7.5, trained: false } });
  assert.strictEqual(C.dayDone(half, SAT).done, 1);
  assert.deepStrictEqual(C.noted(half, SAT), ['agua', 'sueño']);
  assert.strictEqual(C.joinEs(['agua', 'sueño']), 'agua y sueño');
  assert.strictEqual(C.joinEs(['agua', 'sueño', 'pasos']), 'agua, sueño y pasos');
});

test('insignias: las 18, calculadas con lo que ya existe y nunca por peso ni kcal', () => {
  const none = C.badges(st({}), SAT);
  assert.deepStrictEqual(none.map((b) => b.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
  assert.strictEqual(none.length, 18);
  assert.ok(none.every((b) => !b.earned));
  // el peso, las kcal y las medidas no dan insignias por su valor: bajar 20 kg no cambia nada salvo ser un día con registro
  const weights = st({}, { entries: [{ date: MON, weight: 100 }, { date: add(MON, 1), weight: 80 }], foods: { [MON]: [{ id: 'a', name: 'x', kcal: 100 }] } });
  const b = C.badges(weights, SAT);
  assert.deepStrictEqual(b.filter((x) => x.earned).map((x) => x.id), ['arranco']);
  assert.doesNotMatch(JSON.stringify(none.map((x) => x.desc + x.hint)), /peso|kcal|cm|kg/i);
});

test('insignias por hábito: semana con 5 días de agua, 3 entrenos, primera semana, volviste', () => {
  const days = (n) => Array.from({ length: n }, (_, i) => add(MON, i));
  const habits = {};
  for (const d of days(5)) habits[d] = { water: 2, steps: 9000, sleep: 7.5, trained: d <= add(MON, 2) };
  const all = C.badges(st(habits), SAT);
  const by = Object.fromEntries(all.map((b) => [b.id, b]));
  assert.ok(by.arranco.earned && by.arranco.date === MON);
  assert.ok(by['primera-semana'].earned && by['primera-semana'].date === add(MON, 3));
  assert.ok(by.hidratado.earned && by.hidratado.date === add(MON, 4));
  assert.ok(by['pata-de-perro'].earned && by['buen-dormir'].earned);
  assert.ok(by['tres-de-tres'].earned && by['tres-de-tres'].date === add(MON, 2));
  assert.ok(!by['primer-mes'].earned && !by.volviste.earned);
  assert.deepStrictEqual(C.badgeCount(all), { earned: 6, total: 18 });
  // Volviste: nuevo registro tras más de 7 días sin registrar
  const back = C.badges(st({ [MON]: { trained: false, water: 1 }, [add(MON, 10)]: { trained: false, water: 1 } }), add(MON, 12));
  assert.ok(back.find((x) => x.id === 'volviste').earned);
  // sueño de más de 10 h no premia
  const long = {}; for (const d of days(5)) long[d] = { sleep: 11 };
  assert.ok(!C.badges(st(long), SAT).find((x) => x.id === 'buen-dormir').earned);
  // primer mes: 30 días y ≥12 con registro
  const month = {}; for (let i = 0; i < 14; i++) month[add(MON, -40 + i * 2)] = { water: 1 };
  assert.ok(C.badges(st(month), SAT).find((x) => x.id === 'primer-mes').earned);
});

test('insignias nuevas: 4, 8, 10, 12, 14, 16 y 17 por proceso; sin peso, kcal ni medirse más seguido', () => {
  const by = (state, today) => Object.fromEntries(C.badges(state, today).map((b) => [b.id, b]));
  // Semana redonda y Doce entrenos: 4 semanas con 4 días completos (3 entrenos por semana no bastan: 12 = 4 semanas × 3)
  const habits = {};
  for (let w = 0; w < 4; w++) for (let i = 0; i < 4; i++) habits[add(MON, -28 + w * 7 + i)] = { water: 2, steps: 9000, sleep: 8, trained: true };
  const b = by(st(habits), SAT);
  assert.ok(b['semana-redonda'].earned && b['doce-entrenos'].earned && b['constancia-4'].earned);
  assert.ok(!by(st({ [MON]: { water: 2, steps: 9000, sleep: 8, trained: true } }), SAT)['semana-redonda'].earned);
  // Descanso inteligente: solo «día de descanso», no «me siento mal»
  assert.ok(!by(st({ [MON]: { rest: 'sick', trained: false } }), SAT)['descanso-inteligente'].earned);
  assert.ok(by(st({ [MON]: { rest: 'plan', trained: false } }), SAT)['descanso-inteligente'].earned);
  // Registro honesto: 8 días con algún hábito sin cumplir
  const h8 = {}; for (let i = 0; i < 8; i++) h8[add(MON, -10 + i)] = { water: 1 };
  assert.ok(by(st(h8), SAT)['registro-honesto'].earned && !by(st({ [MON]: { water: 1 } }), SAT)['registro-honesto'].earned);
  // Midiendo con cabeza: separados ≥6 días; medirse a diario no suma
  const sep = [0, 6, 12, 18].map((n) => ({ date: add(MON, -30 + n), waist: 90 }));
  const daily = [0, 1, 2, 3].map((n) => ({ date: add(MON, -30 + n), waist: 90 }));
  assert.ok(by(st({}, { entries: sep }), SAT)['midiendo-con-cabeza'].earned && !by(st({}, { entries: daily }), SAT)['midiendo-con-cabeza'].earned);
  // Plato a plato: 10 días con ≥2 comidas, sin importar kcal
  const foods = {}; for (let i = 0; i < 10; i++) foods[add(MON, -12 + i)] = [{ id: 'a' + i, name: 'x', kcal: 0 }, { id: 'b' + i, name: 'y', kcal: 0 }];
  assert.ok(by(st({}, { foods }), SAT)['plato-a-plato'].earned);
  assert.doesNotMatch(JSON.stringify(C.badges(st({}), SAT).map((x) => x.desc + x.hint)), /peso|kcal|cm\b|kg/i);
});

test('insignias 11, 15 y 18: ejercicios vistos, fotos de frente y perfil del mismo día y reto cumplido (solo con `extra`)', () => {
  const by = (extra) => Object.fromEntries(C.badges(st({}), SAT, extra).map((b) => [b.id, b]));
  assert.ok(!by()['tecnica-primero'].earned && !by()['mi-espejo'].earned && !by()['reto-cumplido'].earned);
  // Técnica primero: TODOS los ejercicios de una rutina
  const routines = [['Sentadilla', 'Puente'], ['Remo']];
  assert.ok(!by({ routines, seen: { Sentadilla: MON } })['tecnica-primero'].earned);
  assert.strictEqual(by({ routines, seen: { Sentadilla: MON } })['tecnica-primero'].hint, '1 de 2 ejercicios');
  const t = by({ routines, seen: { Sentadilla: MON, Puente: add(MON, 2) } })['tecnica-primero'];
  assert.ok(t.earned && t.date === add(MON, 2));
  // Mi espejo: frente y perfil el MISMO día
  assert.ok(!by({ photos: [{ date: MON, pose: 'frente' }, { date: add(MON, 1), pose: 'perfil' }] })['mi-espejo'].earned);
  assert.ok(!by({ photos: [{ date: MON, pose: 'frente' }, { date: MON, pose: 'espalda' }] })['mi-espejo'].earned);
  assert.strictEqual(by({ photos: [{ date: MON, pose: 'frente' }, { date: MON, pose: 'perfil' }] })['mi-espejo'].date, MON);
  // Reto cumplido: marcas dentro del reto hasta la meta; el valor de peso/kcal no interviene
  const ch = { start: MON, end: add(MON, 6), target: 3 };
  assert.ok(!by({ challenges: [{ ...ch, marks: [MON, add(MON, 1)] }] })['reto-cumplido'].earned);
  assert.strictEqual(by({ challenges: [{ ...ch, marks: [MON, add(MON, 1), add(MON, 3), add(MON, 20)] }] })['reto-cumplido'].date, add(MON, 3));
  assert.doesNotMatch(JSON.stringify(C.badges(st({}), SAT).map((x) => x.desc + x.hint)), /peso|kcal|cm\b|kg/i);
});

test('registro de un toque: agua +1 vaso por toque, tramos de pasos, rangos de sueño, entreno y esfuerzo', () => {
  let h = null;
  h = H.apply(h, { water: 1 }); h = H.apply(h, { water: 1 }); h = H.apply(h, { water: 1 });
  assert.strictEqual(Math.round(h.water / H.GLASS_L), 3);
  h = H.apply(h, { water: -1 });
  assert.strictEqual(Math.round(h.water / H.GLASS_L), 2);
  assert.strictEqual(H.apply(H.apply(null, { water: 1 }), { water: -1 }).water, undefined, 'sin vasos no queda la clave');
  assert.strictEqual(H.apply(null, { water: -1 }).water, undefined);
  assert.deepStrictEqual(H.STEP_TIERS.map((t) => [t.label, t.value]), [['<4 mil', 3000], ['4–8 mil', 6000], ['8 mil+', 8000]]);
  assert.strictEqual(H.tierOfSteps(3999).key, 'low'); assert.strictEqual(H.tierOfSteps(4000).key, 'mid'); assert.strictEqual(H.tierOfSteps(7999).key, 'mid'); assert.strictEqual(H.tierOfSteps(8000).key, 'high'); assert.strictEqual(H.tierOfSteps(0), null);
  assert.strictEqual(H.apply(null, { steps: 8000 }).steps, 8000);
  assert.deepStrictEqual(H.SLEEP_OPTS.map((o) => o.label), ['<6 h', '6–7 h', '7–8 h', '8 h o más']);
  assert.strictEqual(H.optOfSleep(7.5).key, 's3'); assert.strictEqual(H.optOfSleep(5.9).key, 's1'); assert.strictEqual(H.optOfSleep(9).key, 's4');
  h = H.apply(h, { trained: true }); h = H.apply(h, { effort: 'duro' });
  assert.strictEqual(h.effort, 'duro');
  assert.strictEqual(H.apply(h, { trained: false }).effort, undefined, 'si deja de ser «entrené», el esfuerzo se va');
  assert.strictEqual(H.apply(null, { effort: 'facil' }).trained, true, 'responder el esfuerzo implica que entrenó');
  assert.deepStrictEqual(H.EFFORTS.map((e) => e.label), ['Fácil', 'Normal', 'Duro', 'No pude terminar']);
  assert.deepStrictEqual(H.CLOSES.map((e) => e.label), ['Sí', 'Casi todo', 'No']);
  assert.strictEqual(H.apply(null, { close: 'casi' }).close, 'casi');
  assert.ok(H.isEmpty(null) && H.isEmpty({ trained: false }) && !H.isEmpty({ trained: false, close: 'si' }));
});

test('«Igual que ayer» copia agua, pasos y sueño, pero no el entreno ni el esfuerzo', () => {
  const ayer = { water: 2, steps: 6000, sleep: 7.5, trained: true, effort: 'duro', close: 'si' };
  const h = H.apply({ trained: false }, { sameAs: ayer });
  assert.deepStrictEqual(h, { trained: false, water: 2, steps: 6000, sleep: 7.5 });
});
