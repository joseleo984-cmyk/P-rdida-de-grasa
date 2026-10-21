// S3-4: semáforo (HU-P05) y reconstrucción del estado del cliente desde coach_pull.
const test = require('node:test');
const assert = require('node:assert');
const C = require('../coach.js');
const S = require('../schema.js');

const day = (n) => new Date(Date.UTC(2026, 9, 21 - n)).toISOString().slice(0, 10); // n días antes del 21-oct-2026
const mk = (entries, extra = {}) => S.normalize(S.migrate({ schemaVersion: S.CURRENT_VERSION, profile: null, entries, foods: {}, habits: {}, library: {}, ...extra })).state;
const losing = (days, step = 0.1) => days.map((n, i) => ({ id: 'e' + i, date: day(n), weight: 80 + n * step }));

test('semaforo: rojo sin datos o sin registros ≥ 5 días', () => {
  assert.strictEqual(C.semaforo(mk([]), { today: day(0) }).color, 'rojo');
  const r = C.semaforo(mk(losing([5, 6, 8, 10])), { today: day(0) });
  assert.strictEqual(r.color, 'rojo');
  assert.match(r.reason, /hace 5 días/);
  assert.strictEqual(C.semaforo(mk(losing([4, 6])), { today: day(0) }).color, 'amarillo', '4 días: aún no es rojo');
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
