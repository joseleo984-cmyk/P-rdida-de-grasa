// S3-4: semáforo (HU-P05) y reconstrucción del estado del cliente desde coach_pull.
const test = require('node:test');
const assert = require('node:assert');
const C = require('../coach.js');
const S = require('../schema.js');

const day = (n) => new Date(Date.UTC(2026, 9, 21 - n)).toISOString().slice(0, 10); // n días antes del 21-oct-2026
const mk = (entries, extra = {}) => S.normalize(S.migrate({ schemaVersion: S.CURRENT_VERSION, profile: null, entries, foods: {}, habits: {}, library: {}, ...extra })).state;
const losing = (days, step = 0.1) => days.map((n, i) => ({ id: 'e' + i, date: day(n), weight: 80 + n * step }));

test('semaforo: rojo sin datos o sin registros ≥ 7 días (D8), ámbar desde los 3', () => {
  assert.strictEqual(C.semaforo(mk([]), { today: day(0) }).color, 'rojo');
  const r = C.semaforo(mk(losing([7, 8, 10, 12])), { today: day(0) });
  assert.strictEqual(r.color, 'rojo');
  assert.match(r.reason, /hace 7 días/);
  assert.strictEqual(C.semaforo(mk(losing([6, 8])), { today: day(0) }).color, 'amarillo', '6 días: aún no es rojo');
  const a = C.semaforo(mk(losing([3, 4, 8])), { today: day(0) });
  assert.strictEqual(a.color, 'amarillo');
  assert.match(a.reason, /3 días/, 'ámbar desde los 3 días sin registrar');
  assert.strictEqual(C.semaforo(mk(losing([2, 3, 4, 8, 9, 10])), { today: day(0) }).color, 'amarillo', '2 días: sigue la regla de los 7 días');
  assert.throws(() => C.semaforo(mk([])), /referencia/);
});

test('semaforo: verde con ≥ 4/7 días y peso bajando; amarillo con 3/7 o estancado', () => {
  const green = C.semaforo(mk(losing([0, 1, 3, 5, 8, 12, 16, 20])), { today: day(0) });
  assert.strictEqual(green.color, 'verde', JSON.stringify(green));
  assert.strictEqual(green.daysLogged7, 4);
  assert.strictEqual(C.semaforo(mk(losing([0, 2, 5, 9, 13, 17])), { today: day(0) }).color, 'amarillo', '3 de 7');
  const flat = C.semaforo(mk(losing([0, 1, 2, 3, 6, 9, 12, 15], 0)), { today: day(0) });
  assert.strictEqual(flat.color, 'amarillo');
  assert.strictEqual(flat.reason, 'Peso estancado');
  // Comidas y hábitos también cuentan como días con registro
  const foods = { [day(0)]: [{ id: 'f', name: 'x', meal: 'Cena', kcal: 1 }], [day(1)]: [{ id: 'g', name: 'y', meal: 'Cena', kcal: 1 }] };
  assert.strictEqual(C.semaforo(mk(losing([2, 3, 9, 14, 19]), { foods }), { today: day(0) }).daysLogged7, 4);
});

test('byLight: rojos primero', () => {
  const l = [{ color: 'verde' }, { color: 'rojo' }, { color: 'amarillo' }].sort(C.byLight).map((x) => x.color);
  assert.deepStrictEqual(l, ['rojo', 'amarillo', 'verde']);
});

test('stateFromWire: perfil/registros/comidas/hábitos sin notas ni biblioteca; datos no confiables saneados', () => {
  const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const T = '2026-10-20T10:00:00.000Z';
  const s = C.stateFromWire([
    { id: U(1), kind: 'profile', nkey: 'profile', data: { name: '<img src=x onerror=alert(1)>', sex: 'female', age: 35, height: 165, startWeight: 70, goalWeight: 62, startDate: '2026-10-01', activity: 1.375, rate: 0.005 }, updatedAt: T },
    { id: U(2), kind: 'entry', nkey: '2026-10-20', date: '2026-10-20', data: { weight: 69, note: 'privada' }, updatedAt: T },
    { id: U(3), kind: 'entry', nkey: '2026-10-19', date: '2026-10-19', data: {}, updatedAt: T, deletedAt: T },
    { id: U(4), kind: 'food', nkey: U(4), date: '2026-10-20', data: { name: 'Arepa', meal: 'Desayuno', kcal: '300' }, updatedAt: T },
    { id: U(5), kind: 'habit', nkey: '2026-10-20', date: '2026-10-20', data: { steps: 8000 }, updatedAt: T },
    { id: U(6), kind: 'library', nkey: 'pan', data: { name: 'Pan', kcal: 1 }, updatedAt: T },
    { id: U(7), kind: 'entry', nkey: 'no-fecha', data: { weight: 1e9 }, updatedAt: T },
    null, 'basura',
  ]);
  assert.strictEqual(s.profile.name, '<img src=x onerror=alert(1)>'); // es texto: la UI lo escapa
  assert.deepStrictEqual(s.entries.map((e) => [e.date, e.weight, 'note' in e]), [['2026-10-20', 69, false]]);
  assert.strictEqual(s.foods['2026-10-20'][0].kcal, 300);
  assert.strictEqual(s.habits['2026-10-20'].steps, 8000);
  assert.deepStrictEqual(Object.keys(s.library), []);
  const sum = C.summarize(s, { today: '2026-10-21' });
  assert.strictEqual(sum.weight.current, 69);
  assert.deepStrictEqual(sum.notes, []);
});

// ---------- UX Etapa 1: «Necesitan atención» y resumen semanal ----------
const hab = (rows) => Object.fromEntries(rows.map(([n, h], i) => [day(n), { id: `00000000-0000-4000-8000-0000000000${String(10 + i)}`, trained: false, updatedAt: '2026-10-01T10:00:00.000Z', ...h }]));
const fd = (n, items) => [day(n), items.map((x, i) => ({ id: `00000000-0000-4000-8000-0000000001${n}${i}`, name: x.name || 'Plato', meal: 'Almuerzo', kcal: 300, protein: 0, carbs: 0, fat: 0, ...x }))];
test('atencion: rojo a los 7 días, ámbar a los 3 (con el motivo en texto), verde con constancia', () => {
  const rojo = C.atencion(mk(losing([9, 10, 12])), { today: day(0) });
  assert.strictEqual(rojo.level, 'atencion');
  assert.strictEqual(rojo.label, 'Atención');
  assert.strictEqual(rojo.reason, 'Sin registrar desde hace 9 días');
  assert.strictEqual(C.atencion(mk([]), { today: day(0) }).reason, 'Aún no ha registrado nada');
  const amb = C.atencion(mk(losing([3, 9, 12])), { today: day(0) });
  assert.strictEqual(amb.level, 'revisar');
  assert.strictEqual(amb.reason, '3 días sin registrar');
  const verde = C.atencion(mk(losing([0, 1, 2, 3, 5, 8, 12, 16, 20]), { habits: hab([[0, { trained: true }], [1, { trained: true }], [2, { trained: true }]]) }), { today: day(0), shares: { habits: true } });
  assert.strictEqual(verde.level, 'aldia');
  assert.match(verde.reason, /Peso −0,\d\d? kg\/sem|3 entrenos|de 7 días/);
  assert.doesNotMatch(JSON.stringify([rojo, amb, verde]), /fallaste|culpa|perdió|castigo/i);
});
test('atencion: «Duro» repetido pone en revisión aunque registre cada día', () => {
  const s = mk(losing([0, 1, 2, 3]), { habits: hab([[0, { trained: true, effort: 'duro' }], [1, { trained: true, effort: 'duro' }], [2, { trained: true, effort: 'normal' }], [3, {}]]) });
  const a = C.atencion(s, { today: day(0), shares: { habits: true } });
  assert.strictEqual(a.level, 'revisar');
  assert.match(a.reason, /Duro.*2 veces/);
});
test('byAtencion: Atención primero, luego Revisar y Al día; dentro de cada grupo, más días sin registrar primero', () => {
  const l = [{ level: 'aldia', days: 0 }, { level: 'atencion', days: 8 }, { level: 'revisar', days: 3 }, { level: 'atencion', days: 12 }, { level: 'atencion', days: null }];
  assert.deepStrictEqual(l.sort(C.byAtencion).map((x) => `${x.level}:${x.days}`), ['atencion:null', 'atencion:12', 'atencion:8', 'revisar:3', 'aldia:0']);
});
test('weekSummary: tendencia, cintura, días, entrenos, esfuerzo, proteína promedio (solo días con dato) y cierre del día', () => {
  const entries = [...losing([0, 2, 4, 6, 9, 14]), { id: 'w1', date: day(10), waist: 85.4 }, { id: 'w2', date: day(1), waist: 84.6 }];
  const habits = hab([[0, { trained: true, effort: 'normal', close: 'si' }], [1, { trained: true, effort: 'duro', close: 'casi' }], [2, { trained: false, close: 'si' }], [8, { trained: true, effort: 'facil' }]]);
  const foods = Object.fromEntries([fd(0, [{ dish: 'x', protein: 40 }, { protein: 0, name: 'Libre' }]), fd(1, [{ protein: 60 }]), fd(2, [{ protein: 0 }])]);
  const w = C.weekSummary(mk(entries, { habits, foods }), { today: day(0), shares: { habits: true, nutrition: true } });
  assert.match(w.weight.text, /kg · [−+]/);
  assert.strictEqual(w.waist.text, '84,6 cm · −0,8');
  assert.strictEqual(w.daysLogged, 5);
  assert.strictEqual(w.daysLoggedText, '5 de 7 días');
  assert.strictEqual(w.trained, 2);
  assert.strictEqual(w.trainedText, '2 entrenos');
  assert.strictEqual(w.effortText, 'Esfuerzo: Duro · Normal');
  assert.deepStrictEqual(w.protein, { avg: 50, days: 2 });
  assert.strictEqual(w.proteinText, '~50 g/día');
  assert.strictEqual(w.closeText, '2 días con registro completo');
  const nada = C.weekSummary(mk([]), { today: day(0), shares: { habits: false } });
  assert.strictEqual(nada.trainedText, null);
  assert.strictEqual(nada.protein, null);
  assert.strictEqual(nada.weight, null);
});
test('atencion: quien empezó hace menos de una semana no se marca «Revisar» por tener pocos días', () => {
  const nuevo = C.atencion(mk(losing([0, 1])), { today: day(0) });
  assert.strictEqual(nuevo.level, 'aldia');
  assert.strictEqual(nuevo.reason, 'Recién empieza · 2 días con registro');
  const viejo = C.atencion(mk(losing([0, 1, 20])), { today: day(0) });
  assert.strictEqual(viejo.level, 'revisar');
  assert.strictEqual(viejo.reason, 'Registró 2 de 7 días');
});
test('atencion: constante sin báscula (5 de 7 días con hábitos y sin pesajes) está «Al día», no «Revisar»', () => {
  const habits = Object.fromEntries([0, 1, 2, 3, 4].map((n) => [day(n), { id: 'h' + n, trained: false, water: 2, updatedAt: '2026-10-20T10:00:00.000Z' }]));
  const a = C.atencion(mk([], { habits }), { today: day(0), shares: { habits: true } });
  assert.strictEqual(a.level, 'aldia');
  assert.match(a.reason, /^5 de 7 días con registro/);
});
