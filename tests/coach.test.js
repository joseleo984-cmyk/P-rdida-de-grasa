const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Schema = require('../schema.js');
const Coach = require('../coach.js');

const fixtureState = () => Schema.normalize(Schema.migrate(JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/backup-v1.json'), 'utf8')))).state;
const parse = (csv) => csv.replace(/^﻿/, '').trimEnd().split('\r\n').map((l) => l.split(';'));

test('CSV: BOM, separador ";", CRLF y cabeceras en español con hábitos', () => {
  const csv = Coach.toCSV(fixtureState());
  assert.ok(csv.startsWith('﻿'));
  assert.ok(csv.includes('\r\n'));
  const [head] = parse(csv);
  assert.deepStrictEqual(head.map((h) => h.replace(/"/g, '')), Coach.CSV_HEADERS);
  for (const h of ['Pasos', 'Agua (L)', 'Sueño (h)', 'Entrenó fuerza', 'Carbohidratos (g)', 'Grasas (g)']) assert.ok(Coach.CSV_HEADERS.includes(h), h);
});

test('CSV: una fila por fecha con medidas, comidas y hábitos; coma decimal', () => {
  const rows = parse(Coach.toCSV(fixtureState()));
  const col = (name) => Coach.CSV_HEADERS.indexOf(name);
  assert.deepStrictEqual(rows.slice(1).map((r) => r[0]), ['2026-10-01', '2026-10-08', '2026-10-14', '2026-10-15']);
  const d15 = rows.find((r) => r[0] === '2026-10-15');
  assert.strictEqual(d15[col('Peso (kg)')], '68,8');
  assert.strictEqual(d15[col('% grasa')], '31,5');
  assert.strictEqual(d15[col('Calorías (kcal)')], '480');
  assert.strictEqual(d15[col('Proteína (g)')], '54');
  assert.strictEqual(d15[col('Alimentos registrados')], '2');
  assert.strictEqual(d15[col('Pasos')], '9000');
  assert.strictEqual(d15[col('Agua (L)')], '2,5');
  assert.strictEqual(d15[col('Sueño (h)')], '7,5');
  assert.strictEqual(d15[col('Entrenó fuerza')], 'Sí');
  const d14 = rows.find((r) => r[0] === '2026-10-14');   // solo hábito "no entrenó"
  assert.strictEqual(d14[col('Entrenó fuerza')], 'No');
  assert.strictEqual(d14[col('Calorías (kcal)')], '');     // sin comidas: vacío, no 0
  const d08 = rows.find((r) => r[0] === '2026-10-08');
  assert.ok(Number(d08[col('% grasa')].replace(',', '.')) > 20);   // Navy calculado con el perfil
});

test('CSV: notas con comillas, ";" y fórmulas no rompen columnas ni se ejecutan', () => {
  const s = Schema.normalize({ entries: [
    { date: '2026-10-01', weight: 80, note: '=HYPERLINK("http://x";"clic")' },
    { date: '2026-10-02', weight: 80, note: 'a; b "c"\nd' },
  ] }).state;
  const csv = Coach.toCSV(s);
  assert.ok(csv.includes(`"'=HYPERLINK(""http://x"";""clic"")"`));
  assert.ok(csv.includes('"a; b ""c""\nd"'));
  assert.strictEqual(Coach.toCSV(Schema.emptyState()), '﻿' + Coach.CSV_HEADERS.map((h) => `"${h}"`).join(';') + '\r\n');
});

test('Resumen: pesos, tendencia, ritmo, % grasa y notas', () => {
  const r = Coach.summarize(fixtureState(), { today: '2026-10-15' });
  assert.strictEqual(r.name, 'Ana');
  assert.deepStrictEqual(r.range, { from: '2026-10-01', to: '2026-10-15', days: 4 });
  assert.strictEqual(r.weight.start, 70);
  assert.strictEqual(r.weight.current, 68.8);
  assert.strictEqual(r.weight.change, -1.2);
  assert.strictEqual(r.weight.goal, 62);
  assert.ok(r.weight.weeklyRate < 0);
  assert.strictEqual(r.weight.trend, 68.8);   // único pesaje en los 7 días previos
  assert.strictEqual(r.bodyFat.current, 31.5);
  assert.ok(r.target.protein > 0);
  assert.deepStrictEqual(r.notes, [{ date: '2026-10-08', note: '<b>nota</b> & "comillas"' }]);
});

test('Resumen: adherencia en ventanas de 1/2/4 semanas que terminan en la referencia', () => {
  const r = Coach.summarize(fixtureState(), { today: '2026-10-15' });
  const [w1, w2, w4] = r.adherence;
  assert.deepStrictEqual(w1, { days: 7, anyDays: 2, foodDays: 1, habitDays: 2, weighIns: 1, proteinAvg: 54, kcalAvg: 480 });
  assert.strictEqual(w2.anyDays, 3);       // 08, 14, 15
  assert.strictEqual(w2.weighIns, 2);
  assert.strictEqual(w4.anyDays, 4);
  // Referencia posterior: la semana queda vacía y la proteína media es null.
  const later = Coach.summarize(fixtureState(), { today: '2026-11-30' }).adherence[0];
  assert.deepStrictEqual(later, { days: 7, anyDays: 0, foodDays: 0, habitDays: 0, weighIns: 0, proteinAvg: null, kcalAvg: null });
  // Datos posteriores a la referencia no cuentan.
  assert.strictEqual(Coach.summarize(fixtureState(), { today: '2026-09-30' }).adherence[0].anyDays, 0);
  assert.strictEqual(Coach.summarize(fixtureState(), { today: '2026-10-07' }).adherence[0].anyDays, 1);   // solo el 01-oct
});

test('Resumen: copia vacía o sin perfil no lanza', () => {
  const r = Coach.summarize(Schema.emptyState(), { today: '2026-10-15' });
  assert.strictEqual(r.range, null);
  assert.strictEqual(r.weight.current, null);
  assert.strictEqual(r.target, null);
  assert.strictEqual(r.bodyFat, null);
  const s = Schema.normalize({ entries: [{ date: '2026-10-10', weight: 80 }, { date: '2026-10-14', weight: 79 }] }).state;
  const r2 = Coach.summarize(s, { today: '2026-10-15' });
  assert.strictEqual(r2.weight.start, 80);
  assert.strictEqual(r2.weight.change, -1);
  assert.throws(() => Coach.summarize(s), /referencia/);
});
