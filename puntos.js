// Puntos de constancia (concepto jurídico 7 y propuesta de gamificación aprobada). Lógica PURA (sin DOM; tests/puntos.test.js).
// IMPORTANTE: los puntos de verdad los CALCULA EL SERVIDOR (grasa.points_refresh en supabase/migrations/20261102120000_r1_puntos_meta.sql, disparado
// por cada registro que llega y por cada marca de reto); el teléfono solo los muestra (grasa.my_points). Así no se pueden inventar desde el teléfono.
// Este archivo es la REFERENCIA EJECUTABLE de esas mismas reglas: la usa el servidor falso (remote-fake.js: demo y pruebas E2E) y sus pruebas
// unitarias. Si cambia una regla, cambia aquí Y en la migración (las dos pruebas, unitaria y de BD, lo cubren).
// Reglas:
//   · registrar el día 2 · agua 1 (≥ 2 L = 8 vasos) · pasos 1 (≥ 8.000) · sueño 1 (7 a 10 h) · comidas 1 (≥ 2 registradas, sin importar las kcal)
//   · entreno 3 hasta los entrenos del plan por semana (meta del coach; 5 si no hay) · descanso planificado o «me siento mal» 2 hasta los días de
//     descanso del plan (7 − plan, entre 1 y 3) · medidas 3 por REGISTRAR, una vez por semana y con 6 días o más entre registros (nunca por el valor)
//   · volviste 5 (más de 7 días sin registrar; una vez cada 30 días) · bonos: semana constante 5 (lunes) y reto cumplido 10 (máx. 2 por semana)
//   · tope 12 al día (sin los bonos) y 80 a la semana · solo hoy y ayer · valores raros sin puntos · en pausa nada · nunca peso, cm, kcal ni fotos.
(function (root) {
  'use strict';
  const DAY_CAP = 12, WEEK_CAP = 80, PLAN_DEFAULT = 5, MEASURE_GAP = 6, BACK_GAP = 7, BACK_EVERY = 30, RETO_MAX_WEEK = 2;
  const POINTS = { registro: 2, agua: 1, pasos: 1, sueno: 1, entreno: 3, descanso: 2, comidas: 1, medidas: 3, volviste: 5, semana: 5, reto: 10 };
  const DAILY = ['registro', 'entreno', 'descanso', 'agua', 'pasos', 'sueno', 'comidas', 'medidas', 'volviste'];
  const LABELS = { registro: 'Registrar el día', agua: 'Agua cumplida', pasos: 'Pasos cumplidos', sueno: 'Sueño de 7 a 10 h', entreno: 'Entreno', descanso: 'Descanso del plan',
    comidas: 'Comidas registradas', medidas: 'Medidas registradas', volviste: 'Volviste', semana: 'Semana constante', reto: 'Reto cumplido' };
  const MEASURE_KEYS = ['weight', 'waist', 'abdomen', 'hip', 'neck', 'armR', 'armL', 'back', 'thighR', 'thighL', 'bodyFat'];
  const LEVELS = [['Arranque', 0], ['En marcha', 150], ['Constante', 500], ['Disciplinado/a', 1200], ['Ejemplo', 2500], ['Leyenda del parche', 4500]];

  const DAY = 86400000;
  const dayNum = (iso) => Math.floor(Date.parse(iso + 'T00:00:00Z') / DAY);
  const addDays = (iso, n) => new Date((dayNum(iso) + n) * DAY).toISOString().slice(0, 10);
  const monday = (iso) => { const g = new Date(iso + 'T12:00:00Z').getUTCDay(); return addDays(iso, -((g + 6) % 7)); };
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const n0 = (v) => num(v) || 0;

  // ---------- Qué cuenta (igual que pts_habit_has / pts_habit_rare / pts_entry_has / pts_entry_rare) ----------
  const habitHas = (h) => !!h && (n0(h.water) > 0 || n0(h.steps) > 0 || n0(h.sleep) > 0 || h.trained === true || h.rest === 'plan' || h.rest === 'sick');
  const habitRare = (h) => !!h && (n0(h.steps) > 60000 || n0(h.water) > 8 || n0(h.sleep) > 14);
  const entryHas = (e) => !!e && MEASURE_KEYS.some((k) => num(e[k]) != null);
  const entryRare = (e) => !!e && ((num(e.weight) != null && (e.weight < 30 || e.weight > 300)) || (num(e.waist) != null && (e.waist < 40 || e.waist > 200)));
  const restCap = (plan) => Math.min(3, Math.max(1, 7 - plan));
  const habitOn = (habit, h, foods) => (habit === 'foods' ? foods > 0 : !!h && !habitRare(h) && (habit === 'trained' ? h.trained === true : n0(h[habit]) > 0));

  const sumIn = (log, from, to) => log.filter((r) => r.day >= from && r.day <= to).reduce((s, r) => s + r.points, 0);

  // Recalcula UN día (como grasa.points_refresh). Devuelve el registro de puntos NUEVO (no muta `log`).
  //   ctx: { userLog: [{ day, source, points }], day, today, paused (en pausa ahora o ese día),
  //          habit (el del día, sin pause_private ni borrado), foods (cuántas comidas), entry (la medida del día), prevRecordDay (último día con
  //          cualquier registro antes de `day`), plan, frozenDay(d) → bool (día en pausa cerrada),
  //          challenges: [{ id, habit, target, start, end, marks: ['AAAA-MM-DD' no privados] }], habitOnDay(d, habit) → bool }
  function refreshDay(ctx) {
    const log = (ctx.userLog || []).map((r) => ({ ...r }));
    const { day, today } = ctx;
    if (!day || day < addDays(today, -1) || day > addDays(today, 1)) return log;
    if (ctx.paused) return log;
    const wk = monday(day), wkEnd = addDays(wk, 6);
    const plan = Number.isInteger(ctx.plan) && ctx.plan > 0 ? ctx.plan : PLAN_DEFAULT;
    let h = ctx.habit || null;
    if (h && (habitRare(h) || !habitHas(h))) h = null;
    const foods = Number(ctx.foods) || 0;
    let e = ctx.entry || null;
    if (e && (entryRare(e) || !entryHas(e))) e = null;
    let out = log.filter((r) => !(r.day === day && DAILY.includes(r.source)));
    const inWeek = (src) => out.filter((r) => r.source === src && r.day >= wk && r.day <= wkEnd).length;
    const pts = {};
    if (h || foods > 0 || e) pts.registro = POINTS.registro;
    if (h) {
      if (n0(h.water) >= 2) pts.agua = POINTS.agua;
      if (n0(h.steps) >= 8000) pts.pasos = POINTS.pasos;
      if (n0(h.sleep) >= 7 && n0(h.sleep) <= 10) pts.sueno = POINTS.sueno;
      if (h.trained === true) { if (inWeek('entreno') < plan) pts.entreno = POINTS.entreno; }
      else if (h.rest === 'plan' || h.rest === 'sick') { if (inWeek('descanso') < restCap(plan)) pts.descanso = POINTS.descanso; }
    }
    if (foods >= 2) pts.comidas = POINTS.comidas;
    if (e && !out.some((r) => r.source === 'medidas' && (Math.abs(dayNum(r.day) - dayNum(day)) < MEASURE_GAP || (r.day >= wk && r.day <= wkEnd)))) pts.medidas = POINTS.medidas;
    if (pts.registro && ctx.prevRecordDay && ctx.prevRecordDay < addDays(day, -BACK_GAP)
        && !out.some((r) => r.source === 'volviste' && r.day > addDays(day, -BACK_EVERY) && r.day < day)) pts.volviste = POINTS.volviste;
    let room = Math.min(DAY_CAP, WEEK_CAP - sumIn(out, wk, wkEnd));
    for (const src of DAILY) {
      const v = Math.min(pts[src] || 0, Math.max(room, 0));
      if (v > 0) { out.push({ day, source: src, points: v }); room -= v; }
    }
    // Semana constante (por la semana anterior, el lunes): ≥ 4 días con registro, o ≥ 2 + comodines (2) sobre días no congelados.
    if (wk <= today && !out.some((r) => r.day === wk && r.source === 'semana')) {
      const pw = addDays(wk, -7);
      const real = new Set(out.filter((r) => r.source === 'registro' && r.day >= pw && r.day < wk).map((r) => r.day)).size;
      let frozen = 0; for (let i = 0; i < 7; i++) if (ctx.frozenDay && ctx.frozenDay(addDays(pw, i))) frozen++;
      const missing = 7 - real - frozen;
      if (real >= 4 || (real >= 2 && real + Math.min(2, missing) >= 4)) {
        const v = Math.min(POINTS.semana, WEEK_CAP - sumIn(out, wk, wkEnd));
        if (v > 0) out.push({ day: wk, source: 'semana', points: v });
      }
    }
    // Reto cumplido: solo los días marcados con registro real a tiempo (fila «registro» de ese día) del hábito del reto.
    for (const ch of ctx.challenges || []) {
      const key = 'reto:' + ch.id;
      if (ch.start > day || ch.end < addDays(day, -31) || out.some((r) => r.source === key)) continue;
      const verified = (ch.marks || []).filter((m) => out.some((r) => r.day === m && r.source === 'registro') && ctx.habitOnDay && ctx.habitOnDay(m, ch.habit)).length;
      if (verified >= ch.target && out.filter((r) => r.source.startsWith('reto:') && r.day >= wk && r.day <= wkEnd).length < RETO_MAX_WEEK) {
        const v = Math.min(POINTS.reto, WEEK_CAP - sumIn(out, wk, wkEnd));
        if (v > 0) out.push({ day, source: key, points: v });
      }
    }
    return out;
  }

  // Lo que devuelve grasa.my_points (ya en camelCase): semana, hoy, detalle de la semana, 8 semanas, mejor semana, total.
  function summary(userLog, today, { plan = PLAN_DEFAULT, paused = false, teamOptOut = null } = {}) {
    const log = userLog || [];
    const wk = monday(today);
    const weekly = {};
    for (const r of log) { const m = monday(r.day); weekly[m] = (weekly[m] || 0) + r.points; }
    const past = Object.entries(weekly).filter(([m]) => m < wk).map(([, v]) => v);
    return {
      today, weekStart: wk, week: sumIn(log, wk, addDays(wk, 6)), todayPoints: sumIn(log, today, today),
      log: log.filter((r) => r.day >= wk && r.day <= addDays(wk, 6)).map((r) => ({ day: r.day, kind: r.source.split(':')[0], points: r.points }))
        .sort((a, b) => a.day.localeCompare(b.day) || a.kind.localeCompare(b.kind)),
      weeks: Array.from({ length: 8 }, (_, i) => { const s = addDays(wk, -7 * (7 - i)); return { start: s, points: sumIn(log, s, addDays(s, 6)) }; }),
      best: past.length ? Math.max(...past) : 0,
      total: log.reduce((s, r) => s + r.points, 0), plan, paused: !!paused, teamOptOut,
    };
  }

  // ---------- Presentación (solo lo que ya viene del servidor) ----------
  function level(total) {
    const t = Math.max(0, Number(total) || 0);
    let i = 0; for (let k = 0; k < LEVELS.length; k++) if (t >= LEVELS[k][1]) i = k;
    const next = LEVELS[i + 1] || null;
    return { name: LEVELS[i][0], next: next ? next[0] : null, toNext: next ? next[1] - t : 0, pct: next ? Math.round(((t - LEVELS[i][1]) / (next[1] - LEVELS[i][1])) * 100) : 100 };
  }
  const word = (n) => `${n} ${n === 1 ? 'punto' : 'puntos'}`;
  // «34 puntos esta semana · +8 hoy»
  const homeLine = (p) => (!p ? '' : `${word(p.week)} esta semana${p.todayPoints ? ` · +${p.todayPoints} hoy` : ''}`);
  // Desglose de un día: [{ kind, label, points }] en el orden de la tabla.
  function dayDetail(p, day) {
    const order = [...DAILY, 'semana', 'reto'];
    const by = {};
    for (const r of (p && p.log) || []) if (r.day === day) by[r.kind] = (by[r.kind] || 0) + r.points;
    return order.filter((k) => by[k]).map((k) => ({ kind: k, label: LABELS[k], points: by[k] }));
  }
  // Comparación SOLO consigo misma: «6 más que la semana pasada» / «Tu mejor semana: 71».
  function selfCompare(p) {
    if (!p || !Array.isArray(p.weeks) || p.weeks.length < 2) return '';
    const prev = p.weeks[p.weeks.length - 2].points, d = p.week - prev;
    return d > 0 ? `${d} más que la semana pasada` : d < 0 ? `${-d} menos que la semana pasada, y la semana sigue` : 'Igual que la semana pasada';
  }
  // Meta colectiva: texto de la barra común (nunca nada individual).
  function teamLine(g) {
    if (!g || g.none) return null;
    const unit = g.metric === 'puntos' ? 'puntos' : 'entrenos';
    const fmt = (n) => Number(n).toLocaleString('es-CO');
    const title = `Entre todos: ${fmt(g.target)} ${unit}`;
    if (!g.published) return { title, published: false, text: `La meta del team se activa cuando sean ${g.min || 5} o más.`, pct: 0 };
    return { title, published: true, pct: Math.min(100, Math.round((g.total / g.target) * 100)), text: `${fmt(g.total)} de ${fmt(g.target)} ${unit} · ${g.participants} personas sumando`,
      done: g.total >= g.target };
  }
  const RULES = [
    ['Registrar el día', '+2'], ['Agua, pasos y sueño cumplidos', '+1 cada uno'], ['Entreno (hasta los de tu plan)', '+3'], ['Descanso del plan o «me siento mal»', '+2'],
    ['2 comidas registradas (las calorías no importan)', '+1'], ['Medidas registradas (1 vez por semana, nunca por el resultado)', '+3'],
    ['Semana constante', '+5'], ['Reto de tu coach cumplido', '+10'], ['Volver después de una semana', '+5'],
  ];

  const api = { DAY_CAP, WEEK_CAP, PLAN_DEFAULT, POINTS, DAILY, LABELS, LEVELS, RULES, monday, addDays, habitHas, habitRare, entryHas, entryRare, restCap, habitOn,
    refreshDay, summary, level, homeLine, dayDetail, selfCompare, teamLine, word };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Puntos = api;
})(typeof window !== 'undefined' ? window : globalThis);
