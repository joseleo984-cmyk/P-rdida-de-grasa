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

// ---- 6 · A quién reconocer ----
const iso = (base, n) => new Date(Date.parse(base + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const days = (base, offs) => Object.fromEntries(offs.map((n) => [iso(base, n), hab({ water: 2 })]));
// Hoy lunes 2026-11-16: la semana que cerró es lun 9 a dom 15 nov.
test('reconocer: solo lunes a miércoles; sugiere por constancia y por regreso, máximo 3, sin cifras de salud', () => {
  const MON = '2026-11-16';
  const consta = mk({ ...days('2026-11-02', [0, 1, 2, 3, 7, 8, 9, 10]) });           // semanas del 2 y del 9 constantes
  const regreso = mk({ ...days('2026-10-20', [0]), ...days('2026-11-09', [0, 2]) });  // volvió tras más de 7 días
  const poco = mk({ ...days('2026-11-09', [0]) });
  const rows = [{ id: 'a', name: 'Ana Ruiz', state: consta }, { id: 'b', name: 'Beto Paz', state: regreso }, { id: 'c', name: 'Carla Soto', state: poco }];
  const r = P.reconocer(rows, MON);
  assert.strictEqual(r.show, true);
  assert.deepStrictEqual(r.items.map((i) => [i.id, i.kind]), [['b', 'regreso'], ['a', 'constancia']]);
  assert.match(r.items[1].message, /^¡Felicitaciones, Ana! 2 semanas constantes seguidas/);
  assert.doesNotMatch(JSON.stringify(r), /\bkg\b|kcal|\bcm\b|peso|perdiste/i);
  assert.strictEqual(P.reconocer(rows, '2026-11-19').show, false);                    // jueves
  const muchos = Array.from({ length: 6 }, (_, i) => ({ id: 'x' + i, name: 'N' + i, state: consta }));
  assert.strictEqual(P.reconocer(muchos, MON).items.length, 3);
});

// ---- 8 · Hito de 6 semanas y cierre ----
test('hito: se ofrece a las 6 semanas (14 días) y a las 8 (cierre); en semanas, con objetivos de proceso y sin peso', () => {
  const st = mk(Object.fromEntries(Array.from({ length: 60 }, (_, i) => [iso('2026-09-01', i), hab({ water: 2 })])));   // registra todos los días
  assert.strictEqual(P.hito(st, iso('2026-09-01', 41)).show, false);
  const h6 = P.hito(st, iso('2026-09-01', 42));
  assert.deepStrictEqual([h6.show, h6.stage, h6.title], [true, 6, 'Cumpliste 6 semanas']);
  assert.ok(h6.lines[0].endsWith('de 6 semanas constantes'));
  assert.strictEqual(P.hito(st, iso('2026-09-01', 55)).stage, 6);
  const h8 = P.hito(st, iso('2026-09-01', 56));
  assert.deepStrictEqual([h8.stage, h8.title], [8, 'Cierre de ciclo: 8 semanas']);
  assert.strictEqual(P.hito(st, iso('2026-09-01', 70)).show, false);
  assert.strictEqual(P.hito(mk({}), '2026-11-16').show, false);
  assert.ok(h6.options.length >= 3 && h6.options.every((o) => o.id && o.label));
  assert.match(h6.closing, /semanas, nunca en kilos/);
  assert.doesNotMatch(JSON.stringify(h6) + JSON.stringify(h8), /\bkg\b|kcal|\bcm\b|peso\b(?! )|perdiste|fallaste/i);
});

test('inicio del coach: cuenta quién necesita un mensaje, ordena por urgencia y solo muestra constancia', () => {
  const rows = [
    { id: 'a', name: 'Ana', level: 'aldia', days: 0, daysLogged7: 6 },
    { id: 'b', name: 'Beto', level: 'revisar', days: 3, daysLogged7: 2 },
    { id: 'c', name: 'Carla', level: 'atencion', days: 8, daysLogged7: 0 },
    { id: 'd', name: 'Dani', level: 'atencion', days: null, daysLogged7: 0 },
  ];
  const r = P.inicioCoach(rows);
  assert.strictEqual(r.hoy, 3);
  assert.strictEqual(r.headline, 'Hoy, escríbele a 3 personas');
  assert.deepStrictEqual([r.constantes, r.apagan, r.sinRegistrar], [1, 1, 2]);
  assert.deepStrictEqual(r.items.map((i) => i.id), ['d', 'c', 'b', 'a']);
  assert.strictEqual(r.items[0].detail, 'Aún no registra');
  assert.strictEqual(r.items[1].detail, '8 días sin registrar');
  assert.strictEqual(r.items[3].action, 'Felicitar');
  assert.strictEqual(r.items[3].detail, '6 de 7 días');
  assert.doesNotMatch(JSON.stringify(r), /\bkg\b|kcal|\bcm\b|peso|foto|perdiste/i);
  assert.strictEqual(P.inicioCoach([rows[0]]).headline, 'Hoy nadie necesita un mensaje');
  assert.strictEqual(P.inicioCoach([{ id: 'x', name: 'X', level: 'revisar', days: 3, daysLogged7: 1 }]).headline, 'Hoy, escríbele a 1 persona');
  assert.strictEqual(P.inicioCoach([]).headline, 'Aún no tienes asesorados');
  assert.strictEqual(P.inicioCoach(Array.from({ length: 9 }, (_, i) => ({ id: 'i' + i, name: 'N' + i, level: 'atencion', days: 9, daysLogged7: 0 }))).items.length, P.INICIO_MAX);
});
