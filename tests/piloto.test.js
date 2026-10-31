const test = require('node:test');
const assert = require('node:assert');
const P = require('../piloto.js');

test('recordatorio: viene apagado y sanea la hora', () => {
  assert.deepStrictEqual(P.recClean(null), { on: false, hour: 20 });
  assert.deepStrictEqual(P.recClean({ on: 'true', hour: 25 }), { on: false, hour: 20 });
  assert.deepStrictEqual(P.recClean({ on: true, hour: 7 }), { on: true, hour: 7 });
  assert.ok(P.REC_HOURS.includes(P.REC_DEFAULT_HOUR));
});

test('recordatorio: solo avisa activado, pasada la hora, sin registro y sin posponer', () => {
  const base = { hourNow: 21, hasRecord: false, today: '2026-11-10', dismissedDay: null };
  const cfg = { on: true, hour: 20 };
  assert.strictEqual(P.recDue(cfg, base), true);
  assert.strictEqual(P.recDue({ on: false, hour: 20 }, base), false);
  assert.strictEqual(P.recDue(cfg, { ...base, hourNow: 19 }), false);
  assert.strictEqual(P.recDue(cfg, { ...base, hasRecord: true }), false);
  assert.strictEqual(P.recDue(cfg, { ...base, dismissedDay: '2026-11-10' }), false);
  assert.strictEqual(P.recDue(cfg, { ...base, dismissedDay: '2026-11-09' }), true);
});

test('recordatorio: texto amable, sin presión ni cifras de salud', () => {
  assert.doesNotMatch(P.REC_TEXT, /perder|racha|fallaste|kg|kcal|peso/i);
});

// ---- 2 · Resumen semanal ----
const S = require('../schema.js');
const mk = (habits, foods = {}, entries = []) => S.normalize(S.migrate({ schemaVersion: S.CURRENT_VERSION, profile: null, entries, foods, habits, library: {} })).state;
const hab = (o) => ({ id: 'x', trained: false, updatedAt: '2026-11-01T00:00:00.000Z', ...o });
// Semana del lunes 2026-11-02 al domingo 2026-11-08.
const W = {
  '2026-11-02': hab({ water: 2, trained: true }), '2026-11-03': hab({ sleep: 7.5 }), '2026-11-04': hab({ steps: 9000, trained: true }),
  '2026-11-06': hab({ water: 1 }),
};

test('resumen: lunes muestra la semana pasada con días, hábitos y cierre; sin cifras de salud', () => {
  const r = P.resumenSemanal(mk(W), '2026-11-09');
  assert.strictEqual(r.show, true);
  assert.strictEqual(r.title, 'Lo que lograste la semana pasada');
  assert.strictEqual(r.lines[0], '4 de 7 días con registro');
  assert.ok(r.lines.includes('Agua completa 1 día'));
  assert.ok(r.lines.includes('2 entrenos'));
  assert.ok(r.lines.includes('Pasos de 8 mil o más 1 día'));
  assert.ok(r.lines.includes('Semana constante'));
  assert.match(r.closing, /constancia real/);
  assert.match(r.closing, /Para mantener: tus entrenos\./);
  assert.doesNotMatch(r.lines.join(' ') + r.closing, /\bkg\b|kcal|\bcm\b|peso|perdiste|fallaste|racha/i);
});

test('resumen: el domingo cuenta la semana en curso; de miércoles a sábado no se muestra', () => {
  assert.strictEqual(P.resumenSemanal(mk(W), '2026-11-08').title, 'Lo que lograste esta semana');
  assert.strictEqual(P.resumenSemanal(mk(W), '2026-11-08').show, true);
  assert.strictEqual(P.resumenSemanal(mk(W), '2026-11-10').show, true);   // martes
  for (const d of ['2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14']) assert.strictEqual(P.resumenSemanal(mk(W), d).show, false);
});

test('resumen: sin registros esa semana no se muestra; semana con pocos días usa comodines y tono sin culpa', () => {
  assert.strictEqual(P.resumenSemanal(mk({}), '2026-11-09').show, false);
  const pocos = P.resumenSemanal(mk({ '2026-11-03': hab({ water: 2 }), '2026-11-05': hab({ sleep: 8 }) }), '2026-11-09');
  assert.strictEqual(pocos.show, true);
  assert.strictEqual(pocos.constant, true);                     // 2 reales + 2 comodines
  assert.ok(pocos.lines.includes('2 comodines usados'));
  const uno = P.resumenSemanal(mk({ '2026-11-03': hab({ water: 2 }) }), '2026-11-09');
  assert.strictEqual(uno.constant, false);
  assert.match(uno.closing, /^Cada día que registras cuenta\. Esta semana empieza de cero, con calma\./);
});

test('resumen: la pausa congela esos días y las comidas cuentan como registro', () => {
  const r = P.resumenSemanal(mk({}, { '2026-11-02': [{ id: 'a', name: 'x', meal: 'Almuerzo', kcal: 1, protein: 0, carbs: 0, fat: 0 }] }), '2026-11-09');
  assert.strictEqual(r.registered, 1);
  assert.strictEqual(P.resumenSemanal(mk(W), '2026-11-09', { pauses: [{ from: '2026-11-02', to: '2026-11-04' }] }).registered, 1);
});

// ---- 3 y 4 · Aviso al coach y plantillas ----
test('aviso al coach: plantillas desde los 3 días, aviso (urgent) desde los 7; nunca para quien no ha registrado', () => {
  assert.strictEqual(P.avisoCoach({ days: 2, name: 'Carla Soto' }).show, false);
  assert.strictEqual(P.avisoCoach({ days: null, name: 'Carla Soto' }).show, false);   // nunca registró: puede ser recién invitada
  const soft = P.avisoCoach({ days: 4, name: 'Carla Soto' });
  assert.deepStrictEqual([soft.show, soft.urgent], [true, false]);
  assert.match(soft.action, /Todavía es pronto/);
  const a = P.avisoCoach({ days: 7, name: 'Carla Soto' });
  assert.deepStrictEqual([a.show, a.urgent], [true, true]);
  assert.strictEqual(a.headline, 'Carla lleva 7 días sin registrar');
  assert.match(a.action, /^Qué hacer:/);
  assert.match(a.message, /^Hola Carla,/);
});

test('plantillas: 3 a 5, con nombre, sin juicio, sin pagos ni cifras ni consejos clínicos, y caben en una nota', () => {
  const a = P.avisoCoach({ days: 8, name: 'Carla Soto' });
  assert.ok(a.templates.length >= 3 && a.templates.length <= 5);
  assert.strictEqual(new Set(a.templates.map((t) => t.id)).size, a.templates.length);
  for (const t of a.templates) {
    assert.match(t.text, /^Hola Carla,/);
    assert.ok(t.text.length < P.MSG_MAX);
    assert.doesNotMatch(t.label + t.text + a.action + a.headline, /pag|cobr|\bkg\b|kcal|\bcm\b|peso|perdiste|fallaste|culpa|dieta|médic|deberías|tienes que/i);
  }
  assert.strictEqual(P.plantilla('pequeno', 'Ana Ruiz'), a.templates[1].text.replace('Carla', 'Ana'));
  assert.match(P.plantilla('no-existe', 'Ana'), /^Hola Ana,/);   // id desconocido: la primera
});
