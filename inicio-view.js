// Sprint 4: datos de la pantalla Inicio del cliente (puro, sin DOM; pruebas en tests/inicio-view.test.js).
// Solo cambia cómo se ve lo que ya existe: no escribe nada ni toca la sincronización.
(function (root) {
  'use strict';
  const Calc = typeof module !== 'undefined' && module.exports ? require('./calc.js') : root.Calc;
  const addDays = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);

  const GLASS_L = 0.25;    // un vaso = 250 ml
  const GLASSES_GOAL = 8;  // meta de agua: 8 vasos (2 L). El hábito guarda litros; aquí solo se convierte.
  const WEEK = 7, WEEK_MIN = 5, WEEK_MAX = 10; // "semana pasada": un peso de entre 5 y 10 días antes del último
  const SPARK_DAYS = 30, SPARK_MAX = 12;

  const n0 = (n) => Math.round(n).toLocaleString('es');
  const n1 = (n) => Math.abs(n).toLocaleString('es', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const dayTotals = (state, d) => (state.foods[d] || []).reduce((t, x) => ({ kcal: t.kcal + x.kcal, protein: t.protein + x.protein }), { kcal: 0, protein: 0 });
  const weights = (state) => state.entries.filter((e) => e.weight).sort((a, b) => a.date.localeCompare(b.date));
  const clampPct = (v, t) => (t > 0 ? Math.max(0, Math.min(100, (v / t) * 100)) : 0);

  // "Hoy llevas": calorías, proteína y agua del día contra la meta del plan (sin perfil no hay meta).
  function hoy(state, today) {
    const ws = weights(state);
    const w = ws.length ? ws[ws.length - 1].weight : (state.profile && state.profile.startWeight) || null;
    const plan = state.profile && w ? Calc.plan(state.profile, w) : null;
    const t = dayTotals(state, today);
    const kcal = Math.round(t.kcal);
    const kcalGoal = plan ? plan.kcal : null;
    const left = kcalGoal != null ? kcalGoal - kcal : null;
    const protein = Math.round(t.protein);
    const proteinGoal = plan ? plan.protein : null;
    const liters = state.habits[today] && Number(state.habits[today].water) > 0 ? Number(state.habits[today].water) : 0;
    const glasses = Math.round(liters / GLASS_L);
    return {
      kcal, kcalGoal, kcalPct: kcalGoal ? clampPct(kcal, kcalGoal) : 0,
      kcalText: n0(kcal), goalText: kcalGoal != null ? `Meta ${n0(kcalGoal)} kcal` : 'Sin meta: completa tu perfil',
      leftText: left == null ? '' : left >= 0 ? `Te quedan ${n0(left)} kcal` : `Te pasaste ${n0(-left)} kcal`,
      over: left != null && left < 0,
      protein, proteinGoal, proteinPct: proteinGoal ? clampPct(protein, proteinGoal) : 0,
      proteinText: proteinGoal != null ? `${protein} de ${proteinGoal} g` : `${protein} g`,
      glasses, glassesGoal: GLASSES_GOAL, glassesPct: clampPct(glasses, GLASSES_GOAL),
      glassesText: `${glasses} de ${GLASSES_GOAL} vasos`,
    };
  }

  // "Repetir el desayuno de ayer": hay desayuno ayer (y hoy aún no tiene uno, para no duplicar con un toque).
  function desayunoAyer(state, today) {
    const prev = addDays(today, -1);
    const items = (state.foods[prev] || []).filter((x) => x.meal === 'Desayuno');
    const hasToday = (state.foods[today] || []).some((x) => x.meal === 'Desayuno');
    return { from: prev, count: items.length, show: items.length > 0 && !hasToday, kcal: Math.round(items.reduce((s, x) => s + x.kcal, 0)) };
  }

  // Línea de tendencia: hasta SPARK_MAX pesos de los últimos SPARK_DAYS días, en un lienzo w×h.
  function spark(state, today, { w = 86, h = 56, pad = 6 } = {}) {
    const from = addDays(today, -SPARK_DAYS);
    const ws = weights(state).filter((e) => e.date <= today && e.date >= from).slice(-SPARK_MAX);
    if (ws.length < 2) return null;
    const t0 = Date.parse(ws[0].date + 'T12:00:00Z'), t1 = Date.parse(ws[ws.length - 1].date + 'T12:00:00Z');
    const lo = Math.min(...ws.map((e) => e.weight)), hi = Math.max(...ws.map((e) => e.weight));
    const pts = ws.map((e, i) => {
      const fx = t1 > t0 ? (Date.parse(e.date + 'T12:00:00Z') - t0) / (t1 - t0) : i / (ws.length - 1);
      const fy = hi > lo ? 1 - (e.weight - lo) / (hi - lo) : 0.5;
      return [Math.round((pad + fx * (w - 2 * pad)) * 10) / 10, Math.round((pad + fy * (h - 2 * pad)) * 10) / 10]; // el peso mayor queda arriba (y menor)
    });
    const d = 'M' + pts.map((p) => p.join(' ')).join(' L');
    const delta = ws[ws.length - 1].weight - ws[0].weight;
    const trend = delta <= -0.2 ? 'baja' : delta >= 0.2 ? 'sube' : 'estable';
    const label = trend === 'baja' ? 'Tu peso viene bajando' : trend === 'sube' ? 'Tu peso viene subiendo' : 'Tu peso se mantiene estable';
    return { d, last: pts[pts.length - 1], w, h, trend, label, count: ws.length };
  }

  // "Tu peso": último peso y diferencia contra la semana pasada, dicha con palabras.
  function peso(state, today) {
    const ws = weights(state).filter((e) => e.date <= today);
    if (!ws.length) return { has: false, valueText: '—', diffText: 'Aún no registras tu peso', spark: null };
    const last = ws[ws.length - 1];
    const ref = ws.filter((e) => e.date <= addDays(last.date, -WEEK_MIN) && e.date >= addDays(last.date, -WEEK_MAX))
      .sort((a, b) => Math.abs(Date.parse(a.date) - Date.parse(addDays(last.date, -WEEK))) - Math.abs(Date.parse(b.date) - Date.parse(addDays(last.date, -WEEK))))[0];
    let diff = null, diffText = 'Aún no hay un peso de la semana pasada para comparar', dir = 'none';
    if (ref) {
      diff = Math.round((last.weight - ref.weight) * 10) / 10;
      dir = diff < 0 ? 'down' : diff > 0 ? 'up' : 'same';
      diffText = diff === 0 ? 'Igual que la semana pasada' : `${n1(diff)} kg ${diff < 0 ? 'menos' : 'más'} que la semana pasada`;
    }
    return { has: true, value: last.weight, valueText: n1(last.weight), date: last.date, diff, dir, diffText, spark: spark(state, today) };
  }

  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  // "Jueves 22 de octubre" y "Hola, Ana" (sin nombre: "Hola").
  const fecha = (date) => cap(date.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', ''));
  const saludo = (state) => { const n = state.profile && state.profile.name && String(state.profile.name).trim(); return n ? `Hola, ${n}` : 'Hola'; };

  const api = { hoy, desayunoAyer, peso, spark, fecha, saludo, GLASS_L, GLASSES_GOAL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HomeView = api;
})(typeof window !== 'undefined' ? window : globalThis);
