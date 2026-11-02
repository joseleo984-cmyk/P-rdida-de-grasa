const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const L = require('../lesiones.js');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const norm = (t) => t.replace(/\s+/g, ' ').trim();

test('lesiones: los textos del abogado están LITERALES (concepto 13) y los botones también', () => {
  const md = norm(read('equipo/legal/concepto-13-2026-11-02-lesiones.md'));
  for (const k of ['lesion', 'condicion', 'convertir']) {
    const t = L.TEXTS[k];
    for (const frase of [t.title, t.body, t.buttons.yes, t.buttons.no]) assert.ok(md.includes(norm(frase)), k + ': ' + frase.slice(0, 40));
  }
  assert.ok(md.includes(norm(L.TEXTS.autorizacion)), 'autorización de la restricción declarada');
  assert.ok(md.includes(norm(L.TEXTS.microcopy)), 'microcopy permanente bajo el campo');
});

test('lesiones: una condición médica nunca se «supera»; las lesiones tienen tres estados; el historial son las superadas', () => {
  assert.deepStrictEqual(L.statusesFor('condicion'), ['activa']);
  assert.deepStrictEqual(L.statusesFor('lesion'), ['activa', 'recuperacion', 'superada']);
  const r = L.split([{ id: 1, status: 'activa' }, { id: 2, status: 'superada' }, { id: 3, status: 'recuperacion' }]);
  assert.deepStrictEqual([r.activas.map((i) => i.id), r.historial.map((i) => i.id)], [[1, 3], [2]]);
  assert.deepStrictEqual(L.split(null), { activas: [], historial: [] });
});

test('lesiones: cada texto contextual tiene versión propia y la huella sale del título y el texto', () => {
  const v = Object.values(L.TEXTS).filter((t) => t && t.version).map((t) => t.version);
  assert.strictEqual(new Set(v).size, v.length);
  assert.strictEqual(L.fullText('lesion'), L.TEXTS.lesion.title + '\n' + L.TEXTS.lesion.body);
});

test('restricciones: el cruce de una rutina con la lista «a evitar» y el historial de dolor ignora mayúsculas, tildes y espacios', () => {
  const rutina = { days: [{ exercises: [{ name: 'Sentadilla Búlgara' }, { name: 'Remo  con barra' }, { name: 'Peso muerto' }] }, { exercises: [{ name: 'sentadilla bulgara' }] }] };
  const flags = { avoid: [{ exercise: 'peso MUERTO' }], pain: [{ exercise: 'Sentadilla búlgara', day: '2026-10-20' }, { exercise: 'Sentadilla búlgara', day: '2026-10-28' }, { exercise: 'Press', day: '2026-10-01' }] };
  const r = L.conflicts(rutina, flags);
  assert.deepStrictEqual(r.map((x) => [x.kind, x.exercise, x.day || null]), [['pain', 'Sentadilla Búlgara', '2026-10-28'], ['avoid', 'Peso muerto', null]]);   // el dolor más reciente; sin repetir el ejercicio de dos días
  assert.deepStrictEqual(L.conflicts(rutina, null), []);
  assert.deepStrictEqual(L.conflicts(null, flags), []);
  assert.strictEqual(L.fmtDay('2026-10-28'), '28/10/2026');
  assert.strictEqual(L.key('  Elevación   LATERAL '), 'elevacion lateral');
});
