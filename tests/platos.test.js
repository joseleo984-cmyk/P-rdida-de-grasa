// Etapa 2 (comidas): catálogo de platos comunes de Colombia (platos.js, puro).
const test = require('node:test');
const assert = require('node:assert');
const P = require('../platos.js');

test('el catálogo tiene entre 100 y 130 platos con ids estables y únicos', () => {
  assert.ok(P.LIST.length >= 100 && P.LIST.length <= 130, 'platos: ' + P.LIST.length);
  const ids = P.LIST.map((d) => d.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'ids repetidos');
  for (const id of ids) assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `id no válido: ${id}`);
  const names = P.LIST.map((d) => P.norm(d.name));
  assert.strictEqual(new Set(names).size, names.length, 'nombres repetidos');
});
test('cada plato tiene nombre, categoría conocida, porción y números razonables', () => {
  const cats = new Set(P.CATEGORIES.map((c) => c.key));
  for (const d of P.LIST) {
    assert.ok(d.name && d.name.length <= 60, d.id);
    assert.ok(cats.has(d.category), `${d.id}: categoría ${d.category}`);
    assert.ok(d.portion && d.portion.length <= 60, `${d.id}: porción`);
    for (const k of ['kcal', 'protein', 'carbs', 'fat', 'alcohol']) assert.ok(Number.isFinite(d[k]) && d[k] >= 0, `${d.id}: ${k}`);
    assert.ok(d.kcal >= 5 && d.kcal <= 1600, `${d.id}: kcal ${d.kcal}`);
  }
  for (const c of P.CATEGORIES) assert.ok(P.LIST.some((d) => d.category === c.key), `categoría vacía: ${c.key}`);
});
test('coherencia: kcal ≈ 4P + 4C + 9G (+7 por gramo de alcohol) dentro de ~10 %', () => {
  for (const d of P.LIST) {
    const calc = 4 * d.protein + 4 * d.carbs + 9 * d.fat + 7 * d.alcohol;
    const tol = Math.max(0.1 * d.kcal, 5);
    assert.ok(Math.abs(d.kcal - calc) <= tol, `${d.id}: ${d.kcal} kcal contra ${calc} calculadas por los macros`);
  }
});
test('están los platos pedidos por el dueño', () => {
  const want = ['arepa con huevo', 'arepa de huevo', 'huevos pericos', 'calentado', 'changua', 'pan con queso', 'tamal', 'empanada', 'buñuelo', 'carimañola', 'yuca frita',
    'bandeja paisa', 'sancocho', 'arroz con pollo', 'pescado frito', 'arroz con coco', 'lentejas', 'fríjoles', 'mondongo', 'ajiaco', 'sudado de pollo', 'posta', 'pechuga a la plancha',
    'jugo', 'café con leche', 'avena', 'gaseosa', 'cerveza'];
  for (const w of want) assert.ok(P.search(w).length > 0, `falta: ${w}`);
});
test('búsqueda: sin tildes ni mayúsculas, palabras en cualquier orden, el que empieza primero', () => {
  assert.deepStrictEqual(P.search('FRIJOLES').map((d) => d.id), P.search('fríjoles').map((d) => d.id));
  assert.ok(P.search('carimanola').some((d) => d.id === 'carimanola'));
  assert.ok(P.search('bunuelo').some((d) => d.id === 'bunuelo'));
  assert.ok(P.search('huevo arepa').some((d) => d.id === 'arepa-de-huevo'));
  assert.strictEqual(P.search('arepa')[0].name.toLowerCase().startsWith('arepa'), true);
  assert.deepStrictEqual(P.search('zzzz'), []);
  assert.ok(P.search('perico').some((d) => d.id === 'huevos-pericos'), 'por otro nombre');
  assert.ok(P.search('').length === P.LIST.length, 'sin texto devuelve todo');
});
test('búsqueda por categoría y con límite', () => {
  const des = P.search('', { category: 'desayuno' });
  assert.ok(des.length > 5 && des.every((d) => d.category === 'desayuno'));
  assert.ok(P.search('arepa', { category: 'cena' }).every((d) => d.category === 'cena'));
  assert.strictEqual(P.search('', { limit: 3 }).length, 3);
  assert.strictEqual(P.search('', { category: 'todas' }).length, P.LIST.length);
});
test('porciones: ½, normal, grande (×1,5) y 2×', () => {
  assert.deepStrictEqual(P.PORTIONS.map((p) => p.factor), [0.5, 1, 1.5, 2]);
  const d = P.byId('arepa-de-huevo');
  assert.deepStrictEqual(P.scale(d, 'normal'), { kcal: d.kcal, protein: d.protein, carbs: d.carbs, fat: d.fat, portion: 'normal' });
  assert.strictEqual(P.scale(d, 'half').kcal, Math.round(d.kcal / 2));
  assert.strictEqual(P.scale(d, 'large').kcal, Math.round(d.kcal * 1.5));
  assert.strictEqual(P.scale('arepa-de-huevo', 'double').kcal, d.kcal * 2);
  assert.strictEqual(P.scale('nada', 'normal'), null);
  assert.strictEqual(P.scale(d, 'enorme'), null);
  assert.strictEqual(P.scale(d).portion, 'normal', 'sin porción = normal');
});
test('toFood: registro listo para state.foods con tipo de comida por categoría y hora opcional', () => {
  const f = P.toFood('arepa-de-huevo', 'large', { time: '08:30' });
  assert.deepStrictEqual(f, { name: 'Arepa de huevo (costeña)', meal: 'Desayuno', kcal: 420, protein: 12, carbs: 33, fat: 27, dish: 'arepa-de-huevo', portion: 'large', time: '08:30' });
  assert.strictEqual(P.toFood('bandeja-paisa', 'normal', { meal: 'Cena' }).meal, 'Cena');
  assert.strictEqual(P.toFood('ajiaco').meal, 'Almuerzo');
  assert.strictEqual('time' in P.toFood('ajiaco'), false);
  assert.strictEqual(P.toFood('nada'), null);
});
test('portionText nombra la porción normal con su descripción', () => {
  assert.strictEqual(P.portionText('arepa-simple', 'normal'), 'Porción normal (1 arepa mediana)');
  assert.strictEqual(P.portionText('arepa-simple', 'half'), 'Media porción');
});
test('recientes: platos del catálogo ya elegidos, el último primero y sin repetir', () => {
  const foods = {
    '2026-10-22': [{ dish: 'tamal', updatedAt: '2026-10-22T12:00:00Z' }, { name: 'Libre', kcal: 100 }],
    '2026-10-24': [{ dish: 'ajiaco', updatedAt: '2026-10-24T08:00:00Z' }, { dish: 'changua', updatedAt: '2026-10-24T09:00:00Z' }],
    '2026-10-23': [{ dish: 'ajiaco' }, { dish: 'no-existe' }],
  };
  assert.deepStrictEqual(P.recents(foods).map((d) => d.id), ['changua', 'ajiaco', 'tamal']);
  assert.strictEqual(P.recents(foods, 2).length, 2);
  assert.deepStrictEqual(P.recents({}), []);
  assert.deepStrictEqual(P.recents(null), []);
});
test('total del día y últimos 7 días (para el coach)', () => {
  const foods = {
    '2026-10-24': [{ name: 'A', meal: 'Cena', kcal: 300.4, protein: 10, carbs: 20, fat: 5 }, { name: 'B', meal: 'Desayuno', kcal: 200, protein: 5, carbs: 30, fat: 2, time: '07:15' }],
    '2026-10-20': [{ name: 'C', meal: 'Snack', kcal: 150, protein: 1, carbs: 20, fat: 0 }],
  };
  assert.strictEqual(P.dayTotal(foods, '2026-10-24').kcal, 500.4);
  assert.strictEqual(P.dayTotal(foods, '2026-10-01').count, 0);
  const w = P.lastDays(foods, '2026-10-24', 7);
  assert.deepStrictEqual(w.map((d) => d.date), ['2026-10-24', '2026-10-23', '2026-10-22', '2026-10-21', '2026-10-20', '2026-10-19', '2026-10-18']);
  assert.strictEqual(w[0].kcal, 500);
  assert.deepStrictEqual(w[0].items.map((x) => x.name), ['B', 'A'], 'ordenado por tipo de comida');
  assert.strictEqual(w[1].count, 0);
  assert.strictEqual(w[4].kcal, 150);
});
test('lineOf: plato · porción · tipo · hora', () => {
  assert.strictEqual(P.lineOf({ name: 'Tamal', dish: 'tamal', portion: 'half', meal: 'Desayuno', time: '08:30' }), 'Tamal · Media porción · Desayuno · 08:30');
  assert.strictEqual(P.lineOf({ name: 'Mi receta', meal: 'Cena' }), 'Mi receta · Cena');
});
