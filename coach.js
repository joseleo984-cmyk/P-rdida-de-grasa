// Kit del piloto con coaches (puro, sin DOM) para poder probarlo con Node:
// - toCSV(state): exporte por día con medidas, comidas y hábitos, pensado para Excel/Sheets en Colombia.
// - summarize(state, { today }): resumen de solo lectura de la copia de un cliente.
// Recibe un estado YA normalizado con Schema.normalize.
(function (root) {
  'use strict';

  const Calc = typeof module !== 'undefined' && module.exports ? require('./calc.js') : root.Calc;
  const WINDOWS = [7, 14, 28];

  const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;
  const hasFood = (state, d) => Array.isArray(state.foods[d]) && state.foods[d].length > 0;
  // Un día con hábitos guardados cuenta como registro aunque solo diga "no entrené" (el usuario envió el formulario).
  const hasHabits = (h) => !!h && typeof h === 'object';

  function bodyFatOf(e, profile) {
    if (e.bodyFat) return e.bodyFat;
    if (!profile) return null;
    return Calc.navyBodyFat({ sex: profile.sex, height: profile.height, waist: e.waist, neck: e.neck, hip: e.hip });
  }

  function dayTotals(state, d) {
    return (state.foods[d] || []).reduce((t, x) => ({
      kcal: t.kcal + x.kcal, protein: t.protein + x.protein, carbs: t.carbs + x.carbs, fat: t.fat + x.fat,
    }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  }

  // Todas las fechas con algún dato (registro corporal, comidas u hábitos), ordenadas.
  function allDates(state) {
    const s = new Set(state.entries.map((e) => e.date));
    for (const d of Object.keys(state.foods)) if (hasFood(state, d)) s.add(d);
    for (const d of Object.keys(state.habits)) if (hasHabits(state.habits[d])) s.add(d);
    return [...s].sort();
  }

  // ---------- CSV ----------
  // Separador ';' y coma decimal: es lo que Excel en español (Colombia) abre en columnas sin asistente,
  // y Google Sheets lo detecta al importar. BOM UTF-8 para que Excel muestre bien tildes y ñ. Saltos CRLF.
  const CSV_HEADERS = ['Fecha', 'Peso (kg)', 'Cintura (cm)', 'Cuello (cm)', 'Cadera (cm)', '% grasa', 'Calorías (kcal)',
    'Proteína (g)', 'Carbohidratos (g)', 'Grasas (g)', 'Alimentos registrados', 'Pasos', 'Agua (L)', 'Sueño (h)',
    'Entrenó fuerza', 'Nota'];

  const csvNum = (n, d = 1) => (typeof n === 'number' && Number.isFinite(n) ? String(round(n, d)).replace('.', ',') : '');
  function csvText(s) {
    let v = String(s ?? '');
    // Evita que Excel/Sheets interprete el texto como fórmula (BUG-12).
    if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
    return '"' + v.replace(/"/g, '""') + '"';
  }

  function toCSV(state) {
    const byDate = new Map(state.entries.map((e) => [e.date, e]));
    // Producto «coach»: si algún registro trae abdomen, se añade su columna tras «Cintura». Sin abdomen (la app oficial) el CSV queda IGUAL que siempre.
    const withAbdomen = state.entries.some((e) => typeof e.abdomen === 'number');
    const heads = withAbdomen ? [...CSV_HEADERS.slice(0, 3), 'Abdomen (cm)', ...CSV_HEADERS.slice(3)] : CSV_HEADERS;
    const rows = [heads.map(csvText).join(';')];
    for (const d of allDates(state)) {
      const e = byDate.get(d) || {};
      const food = hasFood(state, d);
      const t = dayTotals(state, d);
      const h = state.habits[d];
      const habits = hasHabits(h);
      const bf = byDate.has(d) ? bodyFatOf(e, state.profile) : null;
      rows.push([
        d, csvNum(e.weight), csvNum(e.waist), ...(withAbdomen ? [csvNum(e.abdomen)] : []), csvNum(e.neck), csvNum(e.hip), csvNum(bf),
        food ? csvNum(t.kcal, 0) : '', food ? csvNum(t.protein) : '', food ? csvNum(t.carbs) : '', food ? csvNum(t.fat) : '',
        food ? String(state.foods[d].length) : '',
        habits ? csvNum(h.steps, 0) : '', habits ? csvNum(h.water) : '', habits ? csvNum(h.sleep) : '',
        habits ? (h.trained ? 'Sí' : 'No') : '', csvText(e.note),
      ].join(';'));
    }
    return '﻿' + rows.join('\r\n') + '\r\n';
  }

  // ---------- Resumen para el coach ----------
  // `today` (AAAA-MM-DD) es el día de referencia: las ventanas de 1/2/4 semanas terminan ese día, incluido.
  function summarize(state, { today } = {}) {
    if (!today) throw new Error('Falta la fecha de referencia');
    const ref = Calc.toDay(today);
    const p = state.profile;
    const dates = allDates(state);
    const weights = state.entries.filter((e) => e.weight).sort((a, b) => a.date.localeCompare(b.date));
    const current = weights.length ? weights[weights.length - 1].weight : null;
    const start = p ? p.startWeight : weights.length ? weights[0].weight : null;
    const trendPts = Calc.trend(state.entries);
    const rate = Calc.weeklyRate(state.entries);
    const target = p && (current || p.startWeight) ? Calc.plan(p, current || p.startWeight) : null;

    const withBf = state.entries.filter((e) => bodyFatOf(e, p) != null).sort((a, b) => a.date.localeCompare(b.date));
    const bodyFat = withBf.length ? {
      first: bodyFatOf(withBf[0], p), current: bodyFatOf(withBf[withBf.length - 1], p),
      date: withBf[withBf.length - 1].date,
    } : null;

    const inWindow = (d, days) => { const x = Calc.toDay(d); return x <= ref && x > ref - days; };
    const adherence = WINDOWS.map((days) => {
      const foodDays = Object.keys(state.foods).filter((d) => inWindow(d, days) && hasFood(state, d));
      const protein = foodDays.length ? foodDays.reduce((s, d) => s + dayTotals(state, d).protein, 0) / foodDays.length : null;
      const kcal = foodDays.length ? foodDays.reduce((s, d) => s + dayTotals(state, d).kcal, 0) / foodDays.length : null;
      return {
        days,
        anyDays: dates.filter((d) => inWindow(d, days)).length,
        foodDays: foodDays.length,
        habitDays: Object.keys(state.habits).filter((d) => inWindow(d, days) && hasHabits(state.habits[d])).length,
        weighIns: weights.filter((e) => inWindow(e.date, days)).length,
        proteinAvg: protein == null ? null : round(protein, 0),
        kcalAvg: kcal == null ? null : round(kcal, 0),
      };
    });

    return {
      name: p && p.name ? p.name : '',
      reference: today,
      range: dates.length ? { from: dates[0], to: dates[dates.length - 1], days: dates.length } : null,
      weight: {
        start, current, goal: p ? p.goalWeight : null,
        change: start != null && current != null ? round(current - start, 1) : null,
        trend: trendPts.length ? trendPts[trendPts.length - 1].trend : null,
        weeklyRate: rate,
        weeklyRatePct: rate != null && current ? round((rate / current) * 100, 2) : null,
      },
      bodyFat,
      target: target ? { kcal: target.kcal, protein: target.protein } : null,
      adherence,
      notes: state.entries.filter((e) => e.note).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)
        .map((e) => ({ date: e.date, note: e.note })),
    };
  }

  // ---------- S3-4: panel del coach ----------
  // Semáforo de HU-P05 (umbrales simples y documentados; se muestran en el panel):
  // - rojo: sin NINGÚN registro (peso, medidas, comidas o hábitos) hace ≥ 5 días, o sin datos;
  // - verde: registró ≥ 4 de los últimos 7 días Y el peso baja ≥ 0,05 kg/semana (regresión de 21 d) Y no está
  //   estancado en los últimos 14 días (ritmo de 14 d también ≤ −0,05);
  // - amarillo: el resto (2–3 de 7 días, o estancado, o sin pesajes suficientes para ver la tendencia).
  // Solo usa lo que el coach puede ver (el estado ya viene filtrado por las categorías que el cliente compartió).
  const RED_DAYS = 5, GREEN_DAYS = 4, STALL = -0.05;
  function semaforo(state, { today } = {}) {
    if (!today) throw new Error('Falta la fecha de referencia');
    const ref = Calc.toDay(today);
    const dates = allDates(state).filter((d) => Calc.toDay(d) <= ref);
    const last = dates.length ? dates[dates.length - 1] : null;
    const since = last ? ref - Calc.toDay(last) : null;
    const d7 = dates.filter((d) => Calc.toDay(d) > ref - 7).length;
    const rate21 = Calc.weeklyRate(state.entries, 21);
    const rate14 = Calc.weeklyRate(state.entries, 14);
    const base = { lastDate: last, daysSinceLast: since, daysLogged7: d7, weeklyRate: rate21 };
    if (!last || since >= RED_DAYS) {
      return { ...base, color: 'rojo', label: 'Rojo', reason: last ? `Sin registros desde hace ${since} días` : 'Aún no hay registros' };
    }
    const losing = rate21 != null && rate21 <= STALL;
    const stalled = rate14 != null && rate14 > STALL;
    if (d7 >= GREEN_DAYS && losing && !stalled) return { ...base, color: 'verde', label: 'Verde', reason: `Registró ${d7} de 7 días y su peso baja` };
    const why = d7 < GREEN_DAYS ? `Registró ${d7} de 7 días` : rate21 == null ? 'Faltan pesajes para ver la tendencia' : 'Peso estancado';
    return { ...base, color: 'amarillo', label: 'Amarillo', reason: why };
  }
  const LIGHT_ORDER = { rojo: 0, amarillo: 1, verde: 2 };
  const byLight = (a, b) => LIGHT_ORDER[a.color] - LIGHT_ORDER[b.color] || String(a.lastDate || '').localeCompare(String(b.lastDate || ''));

  // Reconstruye el estado de un cliente a partir de las filas de coach_pull (formato de la frontera, contrato §3.3).
  // Los datos vienen de OTRA persona: se tratan como no confiables (Schema.normalize, igual que un import).
  // Nunca se reconstruye la biblioteca ni las notas: el panel no las muestra aunque llegaran.
  function stateFromWire(records) {
    const S = typeof module !== 'undefined' && module.exports ? require('./schema.js') : root.Schema;
    const raw = { schemaVersion: S.CURRENT_VERSION, profile: null, entries: [], foods: {}, habits: {}, library: {} };
    for (const r of Array.isArray(records) ? records : []) {
      if (!r || typeof r !== 'object' || r.deletedAt || !r.data || typeof r.data !== 'object') continue;
      const d = { ...r.data };
      delete d.note;
      if (r.kind === 'profile') raw.profile = { ...d, updatedAt: r.updatedAt };
      else if (r.kind === 'entry') raw.entries.push({ ...d, id: r.id, date: r.nkey, updatedAt: r.updatedAt });
      else if (r.kind === 'food' && r.date) (raw.foods[r.date] ||= []).push({ ...d, id: r.id, updatedAt: r.updatedAt });
      else if (r.kind === 'habit') raw.habits[r.nkey] = { ...d, updatedAt: r.updatedAt };
    }
    const { state } = S.normalize(S.migrate(raw));
    return state;
  }

  const api = { toCSV, summarize, semaforo, byLight, stateFromWire, CSV_HEADERS, RED_DAYS, GREEN_DAYS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Coach = api;
})(typeof window !== 'undefined' ? window : globalThis);
