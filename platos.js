// Etapa 2 (comidas, SOLO producto 'coach'): catálogo estático de platos comunes de Colombia y el Caribe colombiano, con calorías APROXIMADAS.
// Lógica PURA (sin DOM; pruebas en tests/platos.test.js). Los valores son una ESTIMACIÓN hecha con conocimiento general de porciones típicas:
// NO son una tabla oficial ni de un laboratorio, y el dueño debe revisarlos (equipo/handoffs/comidas-etapa2.md). La app lo dice: «Calorías aproximadas».
// Cada plato: id estable (no cambiar nunca: los registros de los clientes lo guardan), nombre, categoría, descripción de la porción NORMAL,
// kcal, proteína, carbohidratos y grasa (g) de esa porción. El alcohol (bebidas) va aparte, en gramos, y cuenta 7 kcal por gramo.
(function (root) {
  'use strict';

  const CATEGORIES = [
    { key: 'desayuno', label: 'Desayunos', meal: 'Desayuno' },
    { key: 'almuerzo', label: 'Almuerzos', meal: 'Almuerzo' },
    { key: 'sopa', label: 'Sopas', meal: 'Almuerzo' },
    { key: 'cena', label: 'Cenas ligeras', meal: 'Cena' },
    { key: 'snack', label: 'Snacks', meal: 'Snack' },
    { key: 'fritos', label: 'Fritos', meal: 'Snack' },
    { key: 'fruta', label: 'Frutas', meal: 'Snack' },
    { key: 'bebida', label: 'Bebidas', meal: 'Snack' },
    { key: 'postre', label: 'Postres', meal: 'Snack' },
  ];
  // Porciones que el cliente puede elegir (factor sobre la porción NORMAL).
  const PORTIONS = [
    { key: 'half', label: 'Media porción', short: '½', factor: 0.5 },
    { key: 'normal', label: 'Porción normal', short: '1×', factor: 1 },
    { key: 'large', label: 'Porción grande', short: '1,5×', factor: 1.5 },
    { key: 'double', label: 'Doble porción', short: '2×', factor: 2 },
  ];

  // [id, nombre, categoría, porción normal, kcal, proteína g, carbohidratos g, grasa g, alcohol g (opcional), otros nombres para buscar (opcional)]
  const RAW = [
    ['arepa-simple', 'Arepa de maíz', 'desayuno', '1 arepa mediana', 135, 3, 28, 1],
    ['arepa-queso', 'Arepa con queso', 'desayuno', '1 arepa mediana con queso', 235, 9, 30, 9],
    ['arepa-con-huevo', 'Arepa con huevo', 'desayuno', '1 arepa con 1 huevo frito', 265, 10, 29, 12],
    ['arepa-de-huevo', 'Arepa de huevo (costeña)', 'desayuno', '1 arepa de huevo frita', 280, 8, 22, 18],
    ['huevos-pericos', 'Huevos pericos', 'desayuno', '2 huevos con tomate y cebolla', 195, 13, 4, 14, 0, 'perico'],
    ['huevos-fritos', 'Huevos fritos', 'desayuno', '2 huevos', 185, 12, 1, 15],
    ['huevos-revueltos', 'Huevos revueltos', 'desayuno', '2 huevos', 180, 12, 2, 14],
    ['huevo-cocido', 'Huevo cocido', 'desayuno', '1 huevo', 75, 6, 1, 5],
    ['calentado', 'Calentado de fríjoles con arroz y huevo', 'desayuno', '1 plato', 485, 18, 65, 17],
    ['changua', 'Changua', 'desayuno', '1 tazón', 210, 12, 14, 12, 0, 'leche con huevo'],
    ['pan-queso', 'Pan con queso', 'desayuno', '1 pan con 1 lonja de queso', 240, 10, 28, 10],
    ['pan-bono', 'Pan de bono', 'desayuno', '1 unidad', 170, 5, 24, 6, 0, 'pandebono'],
    ['bollo-limpio', 'Bollo limpio de maíz', 'desayuno', '1 bollo', 180, 3, 40, 1],
    ['cereal-leche', 'Cereal con leche', 'desayuno', '1 tazón', 255, 8, 45, 5, 0, 'hojuelas corn flakes'],
    ['tamal', 'Tamal', 'desayuno', '1 tamal', 495, 18, 50, 25, 0, 'tamal tolimense'],
    ['empanada', 'Empanada de carne', 'desayuno', '1 empanada frita', 210, 6, 20, 12],
    ['bunuelo', 'Buñuelo', 'desayuno', '1 unidad', 170, 4, 18, 9],
    ['carimanola', 'Carimañola', 'desayuno', '1 unidad', 265, 7, 30, 13],
    ['yuca-cocida', 'Yuca cocida', 'desayuno', '1 porción (100 g)', 155, 1, 38, 0],
    ['yuca-frita', 'Yuca frita', 'desayuno', '1 porción', 315, 2, 45, 14],
    ['sandwich-jamon-queso', 'Sándwich de jamón y queso', 'desayuno', '1 sándwich', 295, 15, 32, 12, 0, 'emparedado'],
    ['bandeja-paisa', 'Bandeja paisa', 'almuerzo', '1 plato completo', 1440, 65, 115, 80],
    ['arroz-con-pollo', 'Arroz con pollo', 'almuerzo', '1 plato', 560, 30, 70, 18],
    ['pescado-patacon', 'Pescado frito con patacón y arroz con coco', 'almuerzo', '1 plato', 805, 38, 85, 35, 0, 'mojarra'],
    ['arroz-coco', 'Arroz con coco', 'almuerzo', '1 porción (1 taza)', 235, 3, 40, 7, 0, 'arroz de coco'],
    ['arroz-blanco', 'Arroz blanco', 'almuerzo', '1 porción (1 taza)', 205, 4, 45, 1],
    ['lentejas', 'Lentejas guisadas', 'almuerzo', '1 plato hondo', 260, 16, 40, 4, 0, 'lenteja'],
    ['frijoles', 'Fríjoles guisados', 'almuerzo', '1 plato hondo', 300, 15, 42, 8, 0, 'frijol'],
    ['mondongo', 'Mondongo', 'almuerzo', '1 plato', 490, 30, 30, 28],
    ['sudado-pollo', 'Sudado de pollo con papa y arroz', 'almuerzo', '1 plato', 525, 35, 65, 14],
    ['posta-cartagenera', 'Posta cartagenera', 'almuerzo', '1 porción de carne (150 g)', 310, 32, 14, 14, 0, 'posta negra'],
    ['pechuga-plancha-arroz', 'Pechuga a la plancha con arroz y ensalada', 'almuerzo', '1 plato', 470, 42, 55, 9],
    ['pechuga-plancha', 'Pechuga a la plancha', 'almuerzo', '1 pechuga (150 g)', 205, 40, 0, 5],
    ['carne-asada', 'Carne asada', 'almuerzo', '1 porción (150 g)', 315, 38, 0, 18],
    ['carne-desmechada', 'Carne desmechada', 'almuerzo', '1 porción (120 g)', 235, 30, 6, 10],
    ['carne-guisada', 'Carne guisada con papa', 'almuerzo', '1 plato', 365, 32, 28, 14],
    ['sobrebarriga', 'Sobrebarriga en salsa criolla', 'almuerzo', '1 porción (150 g)', 345, 35, 6, 20],
    ['pollo-asado', 'Pollo asado', 'almuerzo', '1 presa (pierna con contramuslo)', 325, 36, 0, 20],
    ['arroz-mariscos', 'Arroz con mariscos', 'almuerzo', '1 plato', 540, 28, 75, 14],
    ['cazuela-mariscos', 'Cazuela de mariscos', 'almuerzo', '1 plato', 455, 35, 22, 25],
    ['pasta-carne', 'Espagueti con carne molida', 'almuerzo', '1 plato', 595, 28, 80, 18, 0, 'pasta'],
    ['hamburguesa', 'Hamburguesa', 'almuerzo', '1 hamburguesa', 540, 28, 40, 30],
    ['perro-caliente', 'Perro caliente', 'almuerzo', '1 unidad', 375, 14, 30, 22, 0, 'hot dog'],
    ['pizza', 'Pizza', 'almuerzo', '2 porciones', 490, 18, 60, 20],
    ['salchipapa', 'Salchipapa', 'almuerzo', '1 plato', 730, 22, 70, 40],
    ['chuzo', 'Chuzo de carne o pollo', 'almuerzo', '1 chuzo', 255, 25, 5, 15, 0, 'pincho'],
    ['ensalada-mixta', 'Ensalada mixta', 'almuerzo', '1 plato (lechuga, tomate, cebolla)', 30, 1, 6, 0],
    ['tajadas-maduro', 'Plátano maduro frito', 'almuerzo', '4 tajadas', 215, 1, 32, 9, 0, 'tajadas'],
    ['patacon', 'Patacón', 'almuerzo', '2 unidades', 280, 1, 38, 14, 0, 'patacones tostones'],
    ['papa-cocida', 'Papa cocida', 'almuerzo', '1 papa mediana', 130, 3, 30, 0],
    ['ajiaco', 'Ajiaco santafereño', 'sopa', '1 plato', 475, 30, 50, 17],
    ['sancocho-gallina', 'Sancocho de gallina', 'sopa', '1 plato', 520, 30, 55, 20],
    ['sancocho-pescado', 'Sancocho de pescado', 'sopa', '1 plato', 440, 28, 50, 14],
    ['mote-queso', 'Mote de queso', 'sopa', '1 plato', 335, 12, 45, 12],
    ['caldo-costilla', 'Caldo de costilla', 'sopa', '1 tazón', 200, 12, 15, 10],
    ['sopa-pollo', 'Sopa de pollo con verduras', 'sopa', '1 plato', 250, 20, 25, 8],
    ['cuchuco-trigo', 'Cuchuco de trigo', 'sopa', '1 plato', 370, 20, 45, 12],
    ['ensalada-pollo', 'Ensalada de pollo', 'cena', '1 plato', 310, 35, 15, 12],
    ['ensalada-atun', 'Ensalada de atún', 'cena', '1 plato', 230, 28, 12, 8],
    ['omelette-verduras', 'Omelette de verduras', 'cena', '2 huevos', 215, 14, 4, 16, 0, 'tortilla'],
    ['pollo-verduras', 'Pollo a la plancha con verduras', 'cena', '1 plato', 300, 40, 12, 10],
    ['pescado-plancha', 'Pescado a la plancha con ensalada', 'cena', '1 plato', 260, 35, 8, 10],
    ['arepa-pollo', 'Arepa con pollo desmechado', 'cena', '1 arepa', 280, 22, 30, 8],
    ['yogur-granola', 'Yogur con granola', 'cena', '1 vaso', 225, 8, 35, 6],
    ['mani', 'Maní', 'snack', '1 puñado (30 g)', 185, 8, 5, 15, 0, 'cacahuate'],
    ['almendras', 'Almendras', 'snack', '1 puñado (28 g)', 175, 6, 6, 14],
    ['barra-cereal', 'Barra de cereal', 'snack', '1 barra', 155, 2, 25, 5],
    ['galletas-saladas', 'Galletas saladas', 'snack', '5 unidades', 95, 2, 15, 3, 0, 'saltinas'],
    ['papas-paquete', 'Papas de paquete', 'snack', '1 bolsa pequeña (40 g)', 215, 3, 22, 13, 0, 'chips'],
    ['chocolatina', 'Chocolatina', 'snack', '1 pequeña', 170, 2, 20, 9],
    ['yogur-bebible', 'Yogur bebible', 'snack', '1 vaso (200 ml)', 165, 6, 28, 3],
    ['queso-costeno', 'Queso costeño', 'snack', '1 porción (50 g)', 170, 10, 1, 14],
    ['palomitas', 'Palomitas de maíz', 'snack', '2 tazas', 145, 3, 20, 6],
    ['deditos-queso', 'Deditos de queso', 'fritos', '2 unidades', 240, 8, 20, 14],
    ['papa-rellena', 'Papa rellena', 'fritos', '1 unidad', 340, 9, 35, 18],
    ['chicharron', 'Chicharrón', 'fritos', '1 porción (50 g)', 270, 14, 0, 24],
    ['papas-fritas', 'Papas fritas', 'fritos', '1 porción mediana', 360, 4, 45, 18, 0, 'francesas'],
    ['chorizo', 'Chorizo', 'fritos', '1 unidad', 255, 12, 2, 22],
    ['butifarra', 'Butifarra', 'fritos', '2 unidades', 220, 12, 3, 18],
    ['mojarra-frita', 'Mojarra frita', 'fritos', '1 mediana', 390, 40, 8, 22, 0, 'pescado'],
    ['banano', 'Banano', 'fruta', '1 mediano', 110, 1, 27, 0, 0, 'guineo'],
    ['manzana', 'Manzana', 'fruta', '1 mediana', 105, 1, 25, 0],
    ['naranja', 'Naranja', 'fruta', '1 mediana', 65, 1, 15, 0],
    ['mango', 'Mango', 'fruta', '1 taza (165 g)', 115, 1, 25, 1],
    ['papaya', 'Papaya', 'fruta', '1 taza', 70, 1, 16, 0],
    ['patilla', 'Patilla', 'fruta', '1 tajada grande', 100, 2, 23, 0, 0, 'sandía'],
    ['pina', 'Piña', 'fruta', '1 taza', 90, 1, 22, 0],
    ['fresas', 'Fresas', 'fruta', '1 taza', 50, 1, 12, 0],
    ['guayaba', 'Guayaba', 'fruta', '1 unidad', 65, 2, 12, 1],
    ['aguacate', 'Aguacate', 'fruta', '½ unidad', 180, 2, 9, 15],
    ['salpicon', 'Salpicón de frutas', 'fruta', '1 vaso', 115, 1, 28, 0],
    ['jugo-agua', 'Jugo de fruta en agua con azúcar', 'bebida', '1 vaso (250 ml)', 115, 1, 28, 0],
    ['jugo-leche', 'Jugo de fruta en leche', 'bebida', '1 vaso (250 ml)', 175, 5, 30, 4],
    ['jugo-naranja', 'Jugo de naranja natural', 'bebida', '1 vaso (250 ml)', 90, 1, 22, 0],
    ['jugo-caja', 'Jugo de caja', 'bebida', '1 caja (200 ml)', 95, 0, 24, 0],
    ['cafe-con-leche', 'Café con leche', 'bebida', '1 taza (200 ml)', 95, 5, 8, 5],
    ['tinto', 'Tinto con azúcar', 'bebida', '1 taza', 20, 0, 5, 0, 0, 'café'],
    ['chocolate', 'Chocolate caliente con leche', 'bebida', '1 taza (200 ml)', 205, 7, 26, 8],
    ['avena-bebida', 'Avena (bebida)', 'bebida', '1 vaso (250 ml)', 185, 5, 30, 5],
    ['gaseosa', 'Gaseosa', 'bebida', '1 vaso (250 ml)', 110, 0, 27, 0, 0, 'refresco soda'],
    ['gaseosa-lata', 'Gaseosa en lata', 'bebida', '1 lata (355 ml)', 150, 0, 38, 0, 0, 'refresco soda'],
    ['agua-panela', 'Agua de panela', 'bebida', '1 vaso (250 ml)', 95, 0, 24, 0],
    ['leche', 'Leche entera', 'bebida', '1 vaso (250 ml)', 150, 8, 12, 8],
    ['batido-proteina', 'Batido de proteína', 'bebida', '1 medida con agua', 125, 24, 3, 2, 0, 'whey'],
    ['cerveza', 'Cerveza', 'bebida', '1 botella o lata (330 ml)', 140, 1, 11, 0, 13],
    ['aguardiente', 'Aguardiente', 'bebida', '1 trago (45 ml)', 100, 0, 0, 0, 14],
    ['vino', 'Vino tinto', 'bebida', '1 copa (150 ml)', 120, 0, 4, 0, 15],
    ['arroz-leche', 'Arroz con leche', 'postre', '1 porción', 260, 6, 45, 6],
    ['flan', 'Flan', 'postre', '1 porción', 185, 5, 28, 6],
    ['helado', 'Helado', 'postre', '1 bola', 140, 2, 17, 7],
    ['natilla', 'Natilla', 'postre', '1 porción', 190, 4, 32, 5],
    ['enyucado', 'Enyucado', 'postre', '1 porción', 275, 4, 38, 12],
    ['arequipe', 'Arequipe', 'postre', '1 cucharada', 60, 1, 10, 2, 0, 'dulce de leche'],
    ['ponque', 'Ponqué', 'postre', '1 tajada', 265, 4, 35, 12, 0, 'torta'],
    ['oblea', 'Oblea con arequipe', 'postre', '1 unidad', 225, 3, 40, 6],
  ];

  const LIST = RAW.map(([id, name, category, portion, kcal, protein, carbs, fat, alcohol, alias]) => Object.freeze({
    id, name, category, portion, kcal, protein, carbs, fat, alcohol: alcohol || 0, alias: alias || '' }));
  const BY_ID = new Map(LIST.map((d) => [d.id, d]));
  const byId = (id) => BY_ID.get(id) || null;
  const portionOf = (key) => PORTIONS.find((p) => p.key === key) || null;
  const categoryOf = (key) => CATEGORIES.find((c) => c.key === key) || null;

  // Sin mayúsculas ni tildes («Fríjoles» = «frijoles», «ñ» = «n»), para buscar sin fijarse en la ortografía.
  const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const HAY = new Map(LIST.map((d) => [d.id, norm(d.name + ' ' + d.alias)]));

  // Búsqueda por texto: todas las palabras escritas deben aparecer (en cualquier orden). Primero los que empiezan por lo escrito.
  // `category` filtra por categoría ('' o 'todas' = todas). Sin texto devuelve toda la categoría (o todo el catálogo) en orden alfabético.
  function search(query, { category, limit } = {}) {
    const words = norm(query).split(' ').filter(Boolean);
    const cat = category && category !== 'todas' ? category : '';
    const hits = LIST.filter((d) => (!cat || d.category === cat) && words.every((w) => HAY.get(d.id).includes(w)));
    const q = words.join(' ');
    const rank = (d) => { const n = norm(d.name); return !q ? 2 : n.startsWith(q) ? 0 : n.split(' ').some((w) => w.startsWith(words[0])) ? 1 : 2; };
    hits.sort((a, b) => rank(a) - rank(b) || norm(a.name).localeCompare(norm(b.name), 'es'));
    return limit ? hits.slice(0, limit) : hits;
  }

  // Valores de un plato en la porción elegida (kcal y gramos redondeados; los gramos con un decimal).
  const r1 = (v) => Math.round(v * 10) / 10;
  function scale(dish, portionKey) {
    const d = typeof dish === 'string' ? byId(dish) : dish;
    const p = portionOf(portionKey || 'normal');
    if (!d || !p) return null;
    return { kcal: Math.round(d.kcal * p.factor), protein: r1(d.protein * p.factor), carbs: r1(d.carbs * p.factor), fat: r1(d.fat * p.factor), portion: p.key };
  }
  // Un registro de `state.foods` (el mismo formato de siempre + dish, portion y time) para un plato y una porción.
  function toFood(dish, portionKey, { meal, time } = {}) {
    const d = typeof dish === 'string' ? byId(dish) : dish;
    const v = scale(d, portionKey);
    if (!d || !v) return null;
    const item = { name: d.name, meal: meal || (categoryOf(d.category) || {}).meal || 'Snack', kcal: v.kcal, protein: v.protein, carbs: v.carbs, fat: v.fat, dish: d.id, portion: v.portion };
    if (time) item.time = time;
    return item;
  }
  // Texto de una porción: «Porción normal (1 arepa mediana)», «½ porción · 1 arepa mediana».
  function portionText(dish, portionKey) {
    const d = typeof dish === 'string' ? byId(dish) : dish;
    const p = portionOf(portionKey || 'normal');
    return p ? p.label + (d && p.key === 'normal' ? ` (${d.portion})` : '') : '';
  }

  // «Recientes»: los platos del catálogo que la persona agregó últimamente (el más reciente primero, sin repetir).
  function recents(foods, limit = 8) {
    const out = [];
    const seen = new Set();
    const days = Object.keys(foods || {}).sort().reverse();
    for (const day of days) {
      const list = Array.isArray(foods[day]) ? foods[day] : [];
      const sorted = list.map((x, i) => [x, i]).sort((a, b) => String(b[0].updatedAt || '').localeCompare(String(a[0].updatedAt || '')) || b[1] - a[1]);
      for (const [x] of sorted) {
        if (!x || typeof x.dish !== 'string' || seen.has(x.dish) || !BY_ID.has(x.dish)) continue;
        seen.add(x.dish);
        out.push(BY_ID.get(x.dish));
        if (out.length >= limit) return out;
      }
    }
    return out;
  }

  // Total de un día (kcal, proteína, carbohidratos y grasa).
  function dayTotal(foods, day) {
    const list = foods && Array.isArray(foods[day]) ? foods[day] : [];
    return list.reduce((t, x) => ({ kcal: t.kcal + (Number(x.kcal) || 0), protein: t.protein + (Number(x.protein) || 0), carbs: t.carbs + (Number(x.carbs) || 0), fat: t.fat + (Number(x.fat) || 0), count: t.count + 1 }), { kcal: 0, protein: 0, carbs: 0, fat: 0, count: 0 });
  }
  const n0 = (n) => Math.round(n).toLocaleString('es', { useGrouping: 'always' });
  const addDays = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  // Los últimos `days` días (hoy incluido, el más nuevo primero): para el coach. Solo cuenta días con comidas, salvo que `all` sea true.
  const MEAL_ORDER = ['Desayuno', 'Almuerzo', 'Cena', 'Snack'];
  function lastDays(foods, today, days = 7) {
    return Array.from({ length: days }, (_, i) => addDays(today, -i)).map((date) => {
      const list = (foods && Array.isArray(foods[date]) ? foods[date] : []).slice();
      list.sort((a, b) => MEAL_ORDER.indexOf(a.meal) - MEAL_ORDER.indexOf(b.meal) || String(a.time || '99').localeCompare(String(b.time || '99')));
      const t = dayTotal(foods, date);
      return { date, count: list.length, kcal: Math.round(t.kcal), kcalText: n0(t.kcal), items: list };
    });
  }
  // Una línea para una comida registrada: «Arepa de huevo (costeña) · Porción grande · Desayuno · 8:30».
  function lineOf(x) {
    const p = portionOf(x.portion);
    return [x.name, p && x.dish ? p.label : '', x.meal, x.time || ''].filter(Boolean).join(' · ');
  }

  const api = { CATEGORIES, PORTIONS, LIST, byId, portionOf, categoryOf, norm, search, scale, toFood, portionText, recents, dayTotal, lastDays, lineOf, n0 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Platos = api;
})(typeof window !== 'undefined' ? window : globalThis);
