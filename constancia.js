// UX Etapa 1 («App para coaches»): constancia SEMANAL con comodines e insignias de proceso. Lógica PURA (sin DOM; pruebas en tests/constancia.test.js).
// Todo se calcula en el teléfono con lo que ya existe en `state` (hábitos, comidas, medidas). No hay servidor ni datos nuevos.
// Reglas (equipo/diseno/04-gamificacion.md, decisión 5 del panel):
//   · Día con registro = hay hábitos anotados ese día, o comidas, o medidas. Cualquier registro cuenta.
//   · Semana (lunes a domingo) constante = días con registro + comodines ≥ 4. Hay 2 comodines por semana que se aplican solos a días PASADOS sin registro
//     (nunca a hoy ni al futuro) y solo en una semana con al menos 2 días con registro (una semana vacía no se «salva» sola).
//   · Las semanas constantes se cuentan seguidas hacia atrás. La semana en curso suma si ya es constante; si aún no lo es, no rompe la cuenta.
//   · Nunca hay «perdiste tu racha»: una semana no constante simplemente corta el conteo y se vuelve a empezar.
//   · Insignias de proceso (las 18 del diseño). Nunca por peso, kcal ni centímetros.
//   · UX Etapa 2 (P1): la constancia se CONGELA en los días de pausa por pago (`frozen`: [{ from, to }] de my_link / coach_clients; to = null = sigue).
//     Esos días no cuentan ni restan: una semana con días en pausa que no llega a constante se salta (no corta la cuenta) y la que sí llega cuenta.
(function (root) {
  'use strict';
  const MIN_DAYS = 4, COMODINES = 2, MIN_REAL_FOR_COMODIN = 2;
  const GLASS_L = 0.25, GLASSES_GOAL = 8, STEPS_GOAL = 8000, SLEEP_GOAL = 7, SLEEP_MAX = 10;
  const DAY = 86400000;
  const dayNum = (iso) => Math.floor(Date.parse(iso + 'T00:00:00Z') / DAY);
  const addDays = (iso, n) => new Date((dayNum(iso) + n) * DAY).toISOString().slice(0, 10);
  // Lunes de la semana de `iso` (0 = domingo en getUTCDay).
  const weekStart = (iso) => { const g = new Date(iso + 'T12:00:00Z').getUTCDay(); return addDays(iso, -((g + 6) % 7)); };
  const LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const DAYNAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

  const habitOf = (state, d) => { const h = state && state.habits && state.habits[d]; return h && typeof h === 'object' ? h : null; };
  const hasMeasure = (e) => ['weight', 'waist', 'abdomen', 'hip', 'neck', 'armR', 'armL', 'back', 'thighR', 'thighL', 'bodyFat'].some((k) => typeof e[k] === 'number');
  // Todas las fechas con algún registro (Set).
  function recordDates(state) {
    const s = new Set();
    for (const d of Object.keys((state && state.habits) || {})) if (habitOf(state, d)) s.add(d);
    for (const d of Object.keys((state && state.foods) || {})) if (Array.isArray(state.foods[d]) && state.foods[d].length) s.add(d);
    for (const e of (state && state.entries) || []) if (e && e.date && hasMeasure(e)) s.add(e.date);
    return s;
  }
  const hasRecord = (state, d) => recordDates(state).has(d);

  // Una semana (lunes `start`) vista el día `today`: días, comodines aplicados y si es constante.
  function weekOf(dates, start, today, frozen) {
    const fz = frozen || EMPTY;
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(start, i);
      const ice = fz.has(date) && date <= today;
      return { date, letter: LETTERS[i], name: DAYNAMES[i], registered: !ice && dates.has(date), frozen: ice, future: date > today, today: date === today, comodin: false };
    });
    const real = days.filter((d) => d.registered).length;
    const missingPast = days.filter((d) => !d.registered && !d.frozen && d.date < today);
    let used = 0;
    if (real >= MIN_REAL_FOR_COMODIN && real < MIN_DAYS) {
      used = Math.min(COMODINES, MIN_DAYS - real, missingPast.length);
    }
    // Un día pasado sin registro en una semana ya constante también se perdona con comodín (solo se muestra; hasta 2 por semana).
    if (real >= MIN_DAYS) used = Math.min(COMODINES, missingPast.length);
    missingPast.slice(0, used).forEach((d) => { d.comodin = true; });
    const counted = real + (real < MIN_DAYS ? used : 0);
    const frozenDays = days.filter((d) => d.frozen).length;
    return { start, days, registered: real, comodines: used, comodinesLeft: COMODINES - used, counted, constant: counted >= MIN_DAYS, frozen: frozenDays > 0, frozenDays };
  }
  const EMPTY = new Set();
  // Días de pausa (Set de 'AAAA-MM-DD') a partir de [{ from, to }] hasta `today` (to = null: la pausa sigue). Máx. 400 días por pausa.
  function frozenDays(pauses, today) {
    const out = new Set();
    for (const p of Array.isArray(pauses) ? pauses : []) {
      if (!p || typeof p.from !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.from)) continue;
      const to = p.to && /^\d{4}-\d{2}-\d{2}$/.test(p.to) ? (p.to < today ? p.to : today) : today;
      for (let d = p.from, i = 0; d <= to && i < 400; d = addDays(d, 1), i++) out.add(d);
    }
    return out;
  }

  // Resumen de la constancia al día `today`.
  function summary(state, today, { pauses } = {}) {
    const dates = recordDates(state);
    const fz = frozenDays(pauses, today);
    const first = [...dates].sort()[0] || null;
    const cur = weekOf(dates, weekStart(today), today, fz);
    let n = 0;
    const history = [];
    // Semanas anteriores (hasta 52): se cuentan seguidas las constantes, a partir de la última semana completa.
    let wk = addDays(cur.start, -7), counting = true;
    for (let i = 0; i < 52 && first && wk >= weekStart(first); i++, wk = addDays(wk, -7)) {
      const w = weekOf(dates, wk, today, fz);
      if (i < 6) history.push(w);
      if (counting && w.constant) n++;
      else if (counting && w.frozen) continue;   // semana con pausa: no rompe la cuenta
      else counting = false;
    }
    if (cur.constant) n += 1;
    const frozenNow = fz.has(today);
    const line = frozenNow ? 'Tu constancia está congelada: no se pierde' : n === 0 ? 'Cada día que registras cuenta para tu semana' : n === 1 ? '1 semana constante' : `${n} semanas constantes`;
    const comodinLine = cur.comodines ? ` · ${cur.comodines} ${cur.comodines === 1 ? 'comodín usado' : 'comodines usados'}` : '';
    return { week: cur, constantWeeks: n, daysThisWeek: cur.registered, history: history.reverse(), first, line: line + (frozenNow ? '' : comodinLine), frozenNow,
      weekLine: `${cur.registered} de 7 días`, comodinesLeft: cur.comodinesLeft };
  }

  // Días desde el último registro (null si nunca). Para el mensaje de regreso sin culpa.
  function daysSince(state, today) {
    const ds = [...recordDates(state)].filter((d) => d <= today).sort();
    return ds.length ? dayNum(today) - dayNum(ds[ds.length - 1]) : null;
  }

  // ---------- Hábitos cumplidos (mismas metas que habitos.js) ----------
  const pos = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
  const waterOk = (h) => pos(h.water) >= GLASSES_GOAL * GLASS_L - 1e-9;
  const stepsOk = (h) => pos(h.steps) >= STEPS_GOAL;
  const sleepOk = (h) => pos(h.sleep) >= SLEEP_GOAL && pos(h.sleep) <= SLEEP_MAX;   // no se premia dormir de más
  const trainedOk = (h) => h.trained === true;
  // «Día completo»: los 4 hábitos cumplidos ese día. { done, of, complete, names:[…cumplidos] }
  function dayDone(state, d) {
    const h = habitOf(state, d) || {};
    const names = [];
    if (waterOk(h)) names.push('agua'); if (sleepOk(h)) names.push('sueño'); if (stepsOk(h)) names.push('pasos'); if (trainedOk(h)) names.push('entreno');
    return { done: names.length, of: 4, complete: names.length === 4, names };
  }
  // Lo que se anotó (aunque no alcance la meta): «Anotaste agua y sueño».
  function noted(state, d) {
    const h = habitOf(state, d) || {};
    const out = [];
    if (pos(h.water) > 0) out.push('agua'); if (pos(h.sleep) > 0) out.push('sueño'); if (pos(h.steps) > 0) out.push('pasos'); if (h.trained === true) out.push('entreno');
    const foods = state && state.foods && state.foods[d];
    if (Array.isArray(foods) && foods.length) out.push('comidas');
    return out;
  }
  const joinEs = (xs) => (xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1]);

  // ---------- Insignias (8 del MVP) ----------
  // Cada una: { id, n, name, desc, earned, date, hint }. `date` = el día en que se ganó (la primera vez).
  function badges(state, today, extra) {
    const dates = recordDates(state);
    const sorted = [...dates].filter((d) => d <= today).sort();
    const first = sorted[0] || null;
    const weeksSet = new Set(sorted.map(weekStart));
    // Por semana: fechas en que se cumplió cada hábito, y entrenos.
    const per = {};
    for (const d of sorted) {
      const h = habitOf(state, d);
      if (!h) continue;
      const w = (per[weekStart(d)] ||= { water: [], steps: [], sleep: [], trained: [] });
      if (waterOk(h)) w.water.push(d);
      if (stepsOk(h)) w.steps.push(d);
      if (sleepOk(h)) w.sleep.push(d);
      if (trainedOk(h)) w.trained.push(d);
    }
    const weekBadge = (key, need) => {
      let best = 0, date = null;
      for (const wk of Object.keys(per).sort()) {
        const xs = per[wk][key];
        best = Math.max(best, xs.length);
        if (!date && xs.length >= need) date = xs[need - 1];
      }
      return { date, best };
    };
    const mk = (id, n, name, desc, date, hint) => ({ id, n, name, desc, earned: !!date, date: date || null, hint: date ? '' : hint });
    const out = [];
    out.push(mk('arranco', 1, 'Arrancó el parche', 'Primer día registrado', first, 'Se gana con tu primer registro'));
    // Primera semana: ≥4 registros dentro de los primeros 7 días desde el primer registro.
    let d2 = null;
    if (first) { const inFirst = sorted.filter((d) => dayNum(d) - dayNum(first) < 7); if (inFirst.length >= 4) d2 = inFirst[3]; }
    out.push(mk('primera-semana', 2, 'Primera semana', '4 días con registro en tus primeros 7 días', d2,
      first ? `${Math.min(4, sorted.filter((d) => dayNum(d) - dayNum(first) < 7).length)} de 4 días` : 'Aún no empiezas'));
    // Primer mes: 30 días desde el primer registro y ≥12 días con registro.
    let d3 = null;
    if (first) { const lim = addDays(first, 30); if (lim <= today && sorted.length >= 12) d3 = lim; }
    out.push(mk('primer-mes', 3, 'Primer mes', 'Un mes acompañándote, con al menos 12 días con registro', d3,
      first ? `${Math.min(12, sorted.length)} de 12 días con registro` : 'Aún no empiezas'));
    const w5 = weekBadge('water', 5);
    out.push(mk('hidratado', 5, 'Hidratado/a', 'Cumpliste el agua 5 días de una semana', w5.date, `agua: ${w5.best} de 5 días`));
    const w6 = weekBadge('steps', 5);
    out.push(mk('pata-de-perro', 6, 'Pata de perro', 'Cumpliste los pasos 5 días de una semana', w6.date, `pasos: ${w6.best} de 5 días`));
    const w7 = weekBadge('sleep', 5);
    out.push(mk('buen-dormir', 7, 'Buen dormir', 'Dormiste entre 7 y 10 h en 5 noches de una semana', w7.date, `sueño: ${w7.best} de 5 días`));
    const w9 = weekBadge('trained', 3);
    out.push(mk('tres-de-tres', 9, 'Tres de tres', '3 entrenos en una semana', w9.date, `entrenos: ${w9.best} de 3`));
    // Volviste: primer registro después de un hueco de 7 días o más sin registrar.
    let d13 = null;
    for (let i = 1; i < sorted.length; i++) if (dayNum(sorted[i]) - dayNum(sorted[i - 1]) > 7) { d13 = sorted[i]; break; }
    out.push(mk('volviste', 13, 'Volviste', 'Retomaste después de una semana o más sin registrar', d13, 'aún no aplica'));
    void weeksSet;
    out.push(...moreBadges(state, today, sorted, per, mk));
    out.push(...extraBadges(today, extra || {}, mk));
    return out.sort((a, b) => a.n - b.n);
  }
  // ---------- Insignias 4, 8, 10, 12, 14, 16 y 17 (las que se calculan con lo que ya existe) ----------
  // Pendientes por falta de datos: 11 «Técnica primero» (evento «vio ejercicio»), 15 «Mi espejo» (las fotos viven en IndexedDB, no en `state`), 18 «Reto cumplido» (`challenges`).
  function moreBadges(state, today, sorted, per, mk) {
    const out = [];
    const habitDays = sorted.filter((d) => habitOf(state, d));
    // 4 · Constancia 4 semanas: 4 semanas seguidas ya cerradas con ≥4 días contando comodines.
    let d4 = null, run = 0, left = 'aún no empiezas';
    if (sorted.length) {
      const dates = new Set(sorted);
      let best = 0;
      for (let wk = weekStart(sorted[0]); addDays(wk, 6) < today; wk = addDays(wk, 7)) {
        if (weekOf(dates, wk, today).constant) { run++; best = Math.max(best, run); if (run === 4 && !d4) d4 = addDays(wk, 6); } else run = 0;
      }
      left = `${Math.min(4, best)} de 4 semanas`;
    }
    out.push(mk('constancia-4', 4, 'Constancia 4 semanas', '4 semanas seguidas con 4 días de registro (los comodines cuentan)', d4, left));
    // 8 · Semana redonda: los 4 hábitos al menos 4 días cada uno en la misma semana.
    let d8 = null, bestMin = 0;
    for (const wk of Object.keys(per).sort()) {
      const w = per[wk], m = Math.min(w.water.length, w.steps.length, w.sleep.length, w.trained.length);
      bestMin = Math.max(bestMin, m);
      if (!d8 && m >= 4) d8 = [w.water[3], w.steps[3], w.sleep[3], w.trained[3]].sort().pop();
    }
    out.push(mk('semana-redonda', 8, 'Semana redonda', 'Los 4 hábitos al menos 4 días cada uno en una semana', d8, `${Math.min(4, bestMin)} de 4 días en tu hábito más corto`));
    // 10 · Doce entrenos acumulados.
    const tr = habitDays.filter((d) => trainedOk(habitOf(state, d)));
    out.push(mk('doce-entrenos', 10, 'Doce entrenos', '12 entrenos acumulados', tr[11] || null, `${Math.min(12, tr.length)} de 12 entrenos`));
    // 12 · Descanso inteligente: marcó «Hoy es mi día de descanso» (no «me siento mal»).
    out.push(mk('descanso-inteligente', 12, 'Descanso inteligente', 'Respetaste un día de descanso de tu plan', habitDays.find((d) => habitOf(state, d).rest === 'plan') || null, 'Marca «Hoy es mi día de descanso» cuando toque'));
    // 14 · Registro honesto: ≥8 días registrados con algún hábito sin alcanzar la meta (premia ser sincero, no perfecto).
    const honest = habitDays.filter((d) => { const h = habitOf(state, d); return (pos(h.water) > 0 && !waterOk(h)) || (pos(h.steps) > 0 && !stepsOk(h)) || (pos(h.sleep) > 0 && !sleepOk(h)); });
    out.push(mk('registro-honesto', 14, 'Registro honesto', 'Anotaste 8 días tal como fueron, también los que no llegaste a la meta', honest[7] || null, `${Math.min(8, honest.length)} de 8 días`));
    // 16 · Midiendo con cabeza: 4 registros de medidas espaciados ≥6 días (no hay insignia por medirse más seguido).
    const md = [...new Set(((state && state.entries) || []).filter((e) => e && e.date && e.date <= today && hasMeasure(e)).map((e) => e.date))].sort();
    const sp = []; for (const d of md) if (!sp.length || dayNum(d) - dayNum(sp[sp.length - 1]) >= 6) sp.push(d);
    out.push(mk('midiendo-con-cabeza', 16, 'Midiendo con cabeza', '4 registros de medidas separados por al menos 6 días', sp[3] || null, `${Math.min(4, sp.length)} de 4 registros`));
    // 17 · Plato a plato: 10 días con al menos 2 comidas registradas (cuenta registrar, no las kcal).
    const pl = Object.keys((state && state.foods) || {}).filter((d) => d <= today && Array.isArray(state.foods[d]) && state.foods[d].length >= 2).sort();
    out.push(mk('plato-a-plato', 17, 'Plato a plato', 'Registraste tus comidas 10 días', pl[9] || null, `${Math.min(10, pl.length)} de 10 días`));
    return out;
  }
  // ---------- Insignias 11, 15 y 18: usan datos que no viven en `state` y llegan en `extra` (todos opcionales; sin ellos no se ganan) ----------
  //   extra.photos = [{ date, pose }] · extra.challenges = [{ start, end, target, marks }] · extra.routines = [[nombre, …], …] (ejercicios de cada rutina) · extra.seen = { nombre: 'AAAA-MM-DD' } (primer día que abrió «Cómo se hace»)
  function extraBadges(today, extra, mk) {
    const out = [];
    // 11 · Técnica primero: abrió «Cómo se hace» de TODOS los ejercicios de una rutina (la mejor rutina da el avance).
    const seen = extra.seen && typeof extra.seen === 'object' ? extra.seen : {};
    let d11 = null, bestSeen = 0, bestOf = 0;
    for (const r of Array.isArray(extra.routines) ? extra.routines : []) {
      const names = [...new Set((Array.isArray(r) ? r : []).filter((n) => typeof n === 'string' && n.trim()))];
      if (!names.length) continue;
      const got = names.filter((n) => typeof seen[n] === 'string' && seen[n] <= today);
      if (got.length === names.length) { const when = got.map((n) => seen[n]).sort().pop(); if (!d11 || when < d11) d11 = when; }
      if (got.length / names.length >= (bestOf ? bestSeen / bestOf : 0)) { bestSeen = got.length; bestOf = names.length; }
    }
    out.push(mk('tecnica-primero', 11, 'Técnica primero', 'Viste cómo se hace cada ejercicio de una rutina', d11, bestOf ? `${bestSeen} de ${bestOf} ejercicios` : 'Abre «Cómo se hace» en los ejercicios de tu rutina'));
    // 15 · Mi espejo: dos fotos de vistas distintas (frente y perfil) el mismo día.
    const byDay = {};
    for (const p of Array.isArray(extra.photos) ? extra.photos : []) if (p && typeof p.date === 'string' && p.date <= today && (p.pose === 'frente' || p.pose === 'perfil')) (byDay[p.date] ||= new Set()).add(p.pose);
    const d15 = Object.keys(byDay).sort().find((d) => byDay[d].size === 2) || null;
    out.push(mk('mi-espejo', 15, 'Mi espejo', 'Tus fotos de frente y de perfil del mismo día', d15, 'Súbelas el mismo día, si quieres'));
    // 18 · Reto cumplido: llegó a la meta de un reto del coach (cuenta el día de la marca que la completó).
    let d18 = null;
    for (const c of Array.isArray(extra.challenges) ? extra.challenges : []) {
      const marks = (Array.isArray(c && c.marks) ? c.marks : []).filter((d) => typeof d === 'string' && d >= c.start && d <= c.end && d <= today).sort();
      if (c && c.target > 0 && marks.length >= c.target) { const when = marks[c.target - 1]; if (!d18 || when < d18) d18 = when; }
    }
    out.push(mk('reto-cumplido', 18, 'Reto cumplido', 'Completaste un reto de tu coach', d18, 'Cuando tu coach te lance un reto'));
    return out;
  }
  const badgeCount = (list) => ({ earned: list.filter((b) => b.earned).length, total: list.length });

  const api = { MIN_DAYS, COMODINES, weekStart, addDays, dayNum, recordDates, hasRecord, weekOf, frozenDays, summary, daysSince, dayDone, noted, joinEs, badges, badgeCount, LETTERS, DAYNAMES, GLASSES_GOAL, STEPS_GOAL, SLEEP_GOAL, GLASS_L };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Constancia = api;
})(typeof window !== 'undefined' ? window : globalThis);
