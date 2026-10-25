// Estilo v2: modo paso a paso (paso.js, lógica pura). Series, descanso, pausa, saltar, anterior, texto libre y resumen del cierre.
const test = require('node:test');
const assert = require('node:assert');
const P = require('../paso.js');

const DAY = { title: 'Piernas', exercises: [
  { name: 'Sentadilla goblet', sets: '3×12 · 12 kg · desc. 60 s', gif: 'g1' },
  { name: 'Caminata', sets: '20 minutos a ritmo suave' },
  { name: 'Puente de glúteo', sets: '2×15' },
  { name: '', sets: '' },
] };

test('plan: un paso por ejercicio con nombre; estructurado (series, repeticiones, peso, descanso) o texto libre', () => {
  const s = P.plan(DAY);
  assert.strictEqual(s.length, 3);
  assert.deepStrictEqual([s[0].mode, s[0].series, s[0].reps, s[0].weight, s[0].rest, s[0].gif], ['sets', 3, '12', '12 kg', 60, 'g1']);
  assert.strictEqual(s[0].line, '3 series · 12 repeticiones · 12 kg · descanso 60 s');
  assert.deepStrictEqual([s[1].mode, s[1].series, s[1].text, s[1].rest], ['free', 1, '20 minutos a ritmo suave', 0]);
  assert.deepStrictEqual([s[2].mode, s[2].series, s[2].rest], ['sets', 2, 0]);
  assert.deepStrictEqual(P.plan(null), []);
  assert.strictEqual(P.start([]).finished, true);
});

test('series y descanso: «Serie hecha» empieza la cuenta del coach; al terminar vuelve a la serie que sigue', () => {
  const steps = P.plan(DAY);
  let st = P.start(steps);
  assert.strictEqual(P.setNo(st, steps), 1);
  st = P.complete(st, steps, 1000);
  assert.strictEqual(st.phase, 'rest');
  assert.strictEqual(P.setNo(st, steps), 2, 'durante el descanso, la serie que viene');
  assert.strictEqual(P.left(st, 1000), 60);
  assert.strictEqual(P.left(st, 1500), 60, 'redondea hacia arriba');
  assert.strictEqual(P.left(st, 2001), 59);
  assert.ok(Math.abs(P.restRatio(st, steps, 31000) - 0.5) < 1e-9);
  assert.strictEqual(P.complete(st, steps, 2000), st, 'en el descanso no se marca otra serie');
  let t = P.tick(st, steps, 60999);
  assert.strictEqual(t.ended, false);
  t = P.tick(st, steps, 61000);
  assert.strictEqual(t.ended, true);
  st = t.st;
  assert.strictEqual(st.phase, 'work');
  assert.deepStrictEqual(P.progress(st, steps), { done: 1, total: 6, pct: 17, index: 1, count: 3 });
});

test('pausa: congela lo que queda y lo retoma igual; «›» salta el descanso; la última serie pasa al siguiente ejercicio sin descanso', () => {
  const steps = P.plan(DAY);
  let st = P.complete(P.start(steps), steps, 0);
  st = P.pause(st, 10000);
  assert.strictEqual(st.paused, true);
  assert.strictEqual(P.left(st, 999999), 50, 'en pausa no baja');
  assert.strictEqual(P.tick(st, steps, 999999).ended, false);
  st = P.resume(st, 100000);
  assert.strictEqual(P.left(st, 100000), 50);
  st = P.next(st, steps);
  assert.strictEqual(st.phase, 'work');
  assert.strictEqual(P.setNo(st, steps), 2);
  st = P.complete(st, steps, 0); st = P.next(st, steps);   // serie 2 + saltar descanso
  st = P.complete(st, steps, 0);                            // serie 3 = última
  assert.deepStrictEqual([st.i, st.phase, st.done], [1, 'work', [3, 0, 0]]);
});

test('texto libre: «Hecho ›» sin temporizador; «›» salta el ejercicio sin contarlo; «‹» vuelve y empieza otra vez', () => {
  const steps = P.plan(DAY);
  let st = { ...P.start(steps), i: 1, done: [3, 0, 0] };
  st = P.complete(st, steps, 0);
  assert.deepStrictEqual([st.i, st.phase, st.done], [2, 'work', [3, 1, 0]]);
  st = P.prev(st);
  assert.deepStrictEqual([st.i, st.done], [1, [3, 0, 0]]);
  st = P.next(st, steps);
  assert.strictEqual(st.i, 2);
  st = P.complete(st, steps, 0);   // 2×15 sin descanso: sigue en «serie en curso»
  assert.deepStrictEqual([st.phase, P.setNo(st, steps)], ['work', 2]);
  st = P.complete(st, steps, 0);
  assert.strictEqual(st.finished, true);
  assert.deepStrictEqual(P.summary(st, steps), { exercisesDone: 2, exercises: 3, sets: 5, anySets: true });
  assert.strictEqual(P.prev(st), st, 'terminado no vuelve atrás');
});

test('clock y coverGif', () => {
  assert.strictEqual(P.clock(62), '01:02');
  assert.strictEqual(P.clock(0), '00:00');
  assert.strictEqual(P.coverGif(DAY), 'g1');
  assert.strictEqual(P.coverGif({ exercises: [{ name: 'x' }] }), '');
});
