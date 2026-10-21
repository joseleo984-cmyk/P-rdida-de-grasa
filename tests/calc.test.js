const test = require('node:test');
const assert = require('node:assert');
const Calc = require('../calc.js');

const male = { sex: 'male', age: 30, height: 180, startWeight: 90, goalWeight: 80, activity: 1.55, rate: 0.005 };

test('BMR Mifflin-St Jeor', () => {
  assert.strictEqual(Calc.bmr({ sex: 'male', weight: 90, height: 180, age: 30 }), 1880);
  assert.strictEqual(Calc.bmr({ sex: 'female', weight: 60, height: 165, age: 30 }), 1320.25);
});

test('plan: déficit acorde al ritmo y macros que cuadran', () => {
  const p = Calc.plan(male, 90);
  assert.strictEqual(p.maintenance, 2914);
  assert.ok(Math.abs(p.weeklyLossKg - 0.45) < 0.02);
  assert.strictEqual(p.protein, 180);
  const kcalFromMacros = p.protein * 4 + p.carbs * 4 + p.fat * 9;
  assert.ok(Math.abs(kcalFromMacros - p.kcal) < 10);
});

test('plan: respeta el mínimo de calorías', () => {
  const small = { sex: 'female', age: 60, height: 150, startWeight: 50, goalWeight: 45, activity: 1.2, rate: 0.01 };
  const p = Calc.plan(small, 50);
  assert.strictEqual(p.kcal, 1200);
  assert.ok(p.floored);
});

test('% grasa método Navy', () => {
  const bf = Calc.navyBodyFat({ sex: 'male', height: 180, waist: 90, neck: 38 });
  assert.ok(bf > 17 && bf < 21, String(bf));
  assert.strictEqual(Calc.navyBodyFat({ sex: 'female', height: 165, waist: 75, neck: 32 }), null);
  const f = Calc.navyBodyFat({ sex: 'female', height: 165, waist: 75, neck: 32, hip: 100 });
  assert.ok(f > 25 && f < 32, String(f));
});

test('ritmo semanal por regresión', () => {
  const entries = [];
  for (let i = 0; i < 15; i++) {
    const d = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
    entries.push({ date: d, weight: 90 - (0.5 / 7) * i });
  }
  assert.strictEqual(Calc.weeklyRate(entries), -0.5);
  assert.strictEqual(Calc.weeklyRate(entries.slice(0, 1)), null);
});

test('tendencia media 7 días', () => {
  const t = Calc.trend([
    { date: '2026-01-01', weight: 90 },
    { date: '2026-01-02', weight: 89 },
    { date: '2026-01-10', weight: 88 },
  ]);
  assert.strictEqual(t[1].trend, 89.5);
  assert.strictEqual(t[2].trend, 88);
});

test('semanas a la meta', () => {
  assert.strictEqual(Calc.weeksToGoal(90, 80, 0.5), 20);
  assert.strictEqual(Calc.weeksToGoal(79, 80, 0.5), 0);
  assert.strictEqual(Calc.weeksToGoal(90, 80, 0), null);
});

test('recordatorio de copia (backupDue)', () => {
  const hoy = '2026-10-21';
  assert.strictEqual(Calc.backupDue(null, null, hoy, true), true, 'nunca se hizo copia');
  assert.strictEqual(Calc.backupDue('2026-10-15', null, hoy, true), false, 'hace 6 días');
  assert.strictEqual(Calc.backupDue('2026-10-14', null, hoy, true), true, 'hace 7 días');
  assert.strictEqual(Calc.backupDue('2026-10-14T23:59:00.000Z', null, hoy, true), true, 'acepta fecha con hora');
  assert.strictEqual(Calc.backupDue(null, '2026-10-24', hoy, true), false, 'pospuesto');
  assert.strictEqual(Calc.backupDue(null, '2026-10-21', hoy, true), true, 'el aplazamiento terminó hoy');
  assert.strictEqual(Calc.backupDue('2026-10-01', '2026-10-24', hoy, true), false, 'pospuesto aunque toque');
  assert.strictEqual(Calc.backupDue(null, null, hoy, false), false, 'sin datos');
  assert.strictEqual(Calc.backupDue('2026-10-01', null, hoy, false), false, 'sin datos aunque toque');
  assert.strictEqual(Calc.backupDue('basura', 'basura', hoy, true), true, 'fechas inválidas = nunca');
  assert.strictEqual(Calc.backupDue('2026-12-31', null, '2027-01-07', true), true, 'cruza de año');
});

test('addDays', () => {
  assert.strictEqual(Calc.addDays('2026-10-21', 3), '2026-10-24');
  assert.strictEqual(Calc.addDays('2026-12-30', 3), '2027-01-02');
  assert.strictEqual(Calc.addDays('2028-02-28', 1), '2028-02-29');
});
