// Sprint 4: estado de cada cliente en el panel del coach (umbrales explícitos) y textos de la fila.
const test = require('node:test');
const assert = require('node:assert');
const CS = require('../estado-cliente.js');
const S = require('../schema.js');

const day = (n) => new Date(Date.UTC(2026, 9, 22 - n)).toISOString().slice(0, 10); // n días antes del 22-oct-2026
const mk = (entries, extra = {}) => S.normalize(S.migrate({ schemaVersion: S.CURRENT_VERSION, profile: null, entries, foods: {}, habits: {}, library: {}, ...extra })).state;
const e = (n, weight) => ({ id: 'e' + n, date: day(n), weight });
const T = { today: day(0) };

test('umbrales: 0-1 día = Al día, 2-4 = Se atrasa, 5+ o nunca = Sin registrar', () => {
  const casos = [[0, 'ok'], [1, 'ok'], [2, 'late'], [3, 'late'], [4, 'late'], [5, 'none'], [6, 'none'], [30, 'none']];
  for (const [n, key] of casos) {
    assert.strictEqual(CS.keyFor(n), key, `${n} días`);
    assert.strictEqual(CS.estado(mk([e(n, 70)]), T).key, key, `estado con registro hace ${n} días`);
  }
  assert.strictEqual(CS.keyFor(null), 'none');
  assert.strictEqual(CS.AL_DIA_MAX, 1);
  assert.strictEqual(CS.SE_ATRASA_MAX, 4);
});

test('etiquetas, color y "necesita un mensaje": siempre con texto', () => {
  const ok = CS.estado(mk([e(0, 70)]), T), late = CS.estado(mk([e(3, 70)]), T), none = CS.estado(mk([]), T);
  assert.deepStrictEqual([ok.label, late.label, none.label], ['Al día', 'Se atrasa', 'Sin registrar']);
  assert.deepStrictEqual([ok.color, late.color, none.color], ['verde', 'amarillo', 'rojo']);
  assert.deepStrictEqual([ok.needsMessage, late.needsMessage, none.needsMessage], [false, true, true]);
});

test('cualquier registro cuenta: comidas y hábitos, no solo el peso', () => {
  const foods = { [day(1)]: [{ id: 'f', name: 'x', meal: 'Cena', kcal: 100 }] };
  assert.strictEqual(CS.estado(mk([e(9, 70)], { foods }), T).key, 'ok');
  const habits = { [day(3)]: { steps: 1000, trained: false } };
  assert.strictEqual(CS.estado(mk([], { habits }), T).key, 'late');
});

test('texto de la fila: hoy/ayer con peso y diferencia, o "Último registro: hace N días"', () => {
  const hoy = CS.estado(mk([e(7, 69), e(0, 68.4)].map((x, i) => (i ? { ...x, weight: 68.4 } : { ...x, weight: 69 }))), T);
  assert.strictEqual(hoy.line, 'Hoy registró · 68,4 kg (−0,6)');
  assert.deepStrictEqual(hoy.weight, { value: 68.4, diff: -0.6 });
  assert.strictEqual(CS.estado(mk([e(4, 71), e(1, 71.3)]), T).line, 'Ayer registró · 71,3 kg (+0,3)');
  assert.strictEqual(CS.estado(mk([e(1, 71), e(2, 71)]), T).line, 'Ayer registró · 71,0 kg (0,0)');
  assert.strictEqual(CS.estado(mk([e(3, 70)]), T).line, 'Último registro: hace 3 días');
  assert.strictEqual(CS.estado(mk([e(7, 70)]), T).line, 'Último registro: hace 7 días');
  assert.strictEqual(CS.estado(mk([]), T).line, 'Aún no ha registrado nada');
  assert.strictEqual(CS.estado(mk([e(0, 82.1)]), T).line, 'Hoy registró · 82,1 kg', 'primer peso: sin diferencia');
});

test('sin permiso de cuerpo no se muestra peso (aunque el estado lo trajera)', () => {
  const st = mk([e(2, 70), e(0, 69.5)]);
  const x = CS.estado(st, { ...T, shares: { body: false, nutrition: true } });
  assert.strictEqual(x.weight, null);
  assert.strictEqual(x.line, 'Hoy registró');
  assert.strictEqual(CS.estado(st, { ...T, shares: { body: true } }).weight.value, 69.5);
  assert.throws(() => CS.estado(st), /referencia/);
});

test('subtítulo del panel y orden por urgencia', () => {
  const l = [CS.estado(mk([e(0, 70)]), T), CS.estado(mk([e(3, 70)]), T), CS.estado(mk([e(8, 70)]), T), CS.estado(mk([]), T), CS.estado(mk([e(1, 70)]), T)];
  assert.strictEqual(CS.subtitle(l), '5 clientes · 3 necesitan un mensaje hoy');
  assert.strictEqual(CS.subtitle([l[1]]), '1 cliente · 1 necesita un mensaje hoy');
  assert.strictEqual(CS.subtitle([l[0], l[4]]), '2 clientes · todos al día');
  assert.strictEqual(CS.subtitle([]), 'Aún no tienes clientes');
  assert.deepStrictEqual([...l].sort(CS.byUrgency).map((x) => x.key + ':' + x.days), ['none:null', 'none:8', 'late:3', 'ok:1', 'ok:0']);
});

test('iniciales y color del avatar', () => {
  assert.strictEqual(CS.initials('María Rojas'), 'MR');
  assert.strictEqual(CS.initials('  ana  '), 'A');
  assert.strictEqual(CS.initials('carlos pérez gómez'), 'CP');
  assert.strictEqual(CS.initials('«Luisa» Mena'), 'LM');
  assert.strictEqual(CS.initials(''), '?');
  assert.strictEqual(CS.initials(null), '?');
  assert.strictEqual(CS.hue('Ana'), CS.hue('Ana'));
  for (const n of ['Ana', 'María', '', '😀', 'x'.repeat(50)]) assert.ok(CS.hue(n) >= 0 && CS.hue(n) < 6);
});
