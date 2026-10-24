// Sprint 11: hábitos diarios del cliente (agua, pasos, sueño, entrenó) y su avance de la semana. Lógica PURA (sin DOM;
// pruebas en tests/habitos.test.js). Usa lo que la app ya guarda en `state.habits[fecha]` = { steps, water (litros), sleep (horas), trained }.
// El coach ve el mismo resumen SOLO si el cliente compartió sus hábitos (share_habits).
(function (root) {
  'use strict';
  const GLASS_L = 0.25, GLASSES_GOAL = 8;     // 8 vasos de 250 ml = 2 L
  const STEPS_GOAL = 8000, SLEEP_GOAL = 7;    // pasos al día y horas de sueño que cuentan como «cumplido»
  const WEEK = 7;
  const addDays = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  const n0 = (n) => Math.round(n).toLocaleString('es', { useGrouping: 'always' });
  const n1 = (n) => n.toLocaleString('es', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
  const pos = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

  // Qué cuenta como cumplido cada día. Orden y nombres de la maqueta M2.
  const HABITS = [
    { key: 'water', label: 'Agua', ok: (h) => pos(h.water) >= GLASSES_GOAL * GLASS_L - 1e-9, goal: '8 vasos (2 litros)' },
    { key: 'steps', label: 'Pasos', ok: (h) => pos(h.steps) >= STEPS_GOAL, goal: `${n0(STEPS_GOAL)} pasos` },
    { key: 'sleep', label: 'Durmió 7 h o más', ok: (h) => pos(h.sleep) >= SLEEP_GOAL, goal: `${SLEEP_GOAL} horas` },
    { key: 'trained', label: 'Entrenó', ok: (h) => h.trained === true, goal: 'entrenar' },
  ];
  const habitOf = (state, d) => { const h = state && state.habits && state.habits[d]; return h && typeof h === 'object' ? h : null; };

  // Lo de un día (para la pantalla Hábitos y la tarjeta de Inicio).
  function day(state, d) {
    const h = habitOf(state, d) || {};
    const glasses = Math.round(pos(h.water) / GLASS_L);
    const steps = Math.round(pos(h.steps)), sleep = pos(h.sleep);
    return {
      date: d, logged: !!habitOf(state, d), glasses, steps, sleep, trained: h.trained === true,
      items: [
        { key: 'water', label: 'Agua', text: `${glasses} de ${GLASSES_GOAL} vasos`, pct: Math.min(100, (glasses / GLASSES_GOAL) * 100), done: HABITS[0].ok(h) },
        { key: 'steps', label: 'Pasos', text: `${n0(steps)} de ${n0(STEPS_GOAL)}`, pct: Math.min(100, (steps / STEPS_GOAL) * 100), done: HABITS[1].ok(h) },
        { key: 'sleep', label: 'Sueño', text: sleep ? `${n1(sleep)} h` : '0 h', pct: Math.min(100, (sleep / SLEEP_GOAL) * 100), done: HABITS[2].ok(h) },
        { key: 'trained', label: 'Entrenó', text: h.trained === true ? 'Sí' : 'No', pct: h.trained === true ? 100 : 0, done: HABITS[3].ok(h) },
      ],
    };
  }

  // Avance de los últimos 7 días (hoy incluido): cuántos días cumplió cada hábito. Sin datos de un día = no cumplido.
  function week(state, today) {
    const days = Array.from({ length: WEEK }, (_, i) => addDays(today, i - (WEEK - 1)));
    const items = HABITS.map((H) => {
      const n = days.filter((d) => { const h = habitOf(state, d); return !!h && H.ok(h); }).length;
      return { key: H.key, label: H.label, days: n, of: WEEK, pct: Math.round((n / WEEK) * 100), text: `${n} de ${WEEK} días` };
    });
    const total = items.reduce((s, x) => s + x.days, 0);
    const logged = days.filter((d) => !!habitOf(state, d)).length;
    const max = HABITS.length * WEEK;
    return { from: days[0], to: today, items, total, max, pct: Math.round((total / max) * 100), loggedDays: logged,
      line: logged ? `Cumplió ${total} de ${max} hábitos esta semana (${Math.round((total / max) * 100)} %)` : 'Aún no registra hábitos esta semana' };
  }
  // Para la lista del coach: texto corto de cumplimiento por asesorado. `shared`: ¿el cliente comparte sus hábitos?
  function listLine(state, today, shared) {
    if (!shared) return 'No comparte sus hábitos';
    const w = week(state, today);
    return w.loggedDays ? `Hábitos de la semana: ${w.pct} %` : 'Hábitos: aún sin registrar';
  }
  const notSharedText = (name) => `${name || 'Este cliente'} todavía no comparte sus hábitos`;

  // ---------- Registro de un toque («Mi día», UX Etapa 1) ----------
  // Pasos en tramos y sueño en rangos: se guarda un valor representativo del tramo (el de «8 mil+» es justo la meta, así que «cumple»).
  const STEP_TIERS = [{ key: 'low', label: '<4 mil', value: 3000 }, { key: 'mid', label: '4–8 mil', value: 6000 }, { key: 'high', label: '8 mil+', value: 8000 }];
  const SLEEP_OPTS = [{ key: 's1', label: '<6 h', value: 5 }, { key: 's2', label: '6–7 h', value: 6.5 }, { key: 's3', label: '7–8 h', value: 7.5 }, { key: 's4', label: '8 h o más', value: 8.5 }];
  const tierOfSteps = (n) => (pos(n) <= 0 ? null : n < 4000 ? STEP_TIERS[0] : n < STEPS_GOAL ? STEP_TIERS[1] : STEP_TIERS[2]);
  const optOfSleep = (h) => (pos(h) <= 0 ? null : h < 6 ? SLEEP_OPTS[0] : h < 7 ? SLEEP_OPTS[1] : h < 8 ? SLEEP_OPTS[2] : SLEEP_OPTS[3]);
  const EFFORTS = [{ key: 'facil', label: 'Fácil' }, { key: 'normal', label: 'Normal' }, { key: 'duro', label: 'Duro' }, { key: 'no_termine', label: 'No pude terminar' }];
  const CLOSES = [{ key: 'si', label: 'Sí' }, { key: 'casi', label: 'Casi todo' }, { key: 'no', label: 'No' }];
  const effortLabel = (k) => (EFFORTS.find((e) => e.key === k) || {}).label || '';
  const closeLabel = (k) => (CLOSES.find((e) => e.key === k) || {}).label || '';
  // Devuelve el registro del día (nuevo objeto, sin mutar) tras UN cambio. change: { water: +1|-1 } | { steps: valor|null } | { sleep: valor|null } | { trained: bool }
  // | { effort: clave|null } | { close: clave|null } | { sameAs: registro de ayer }. Quita las claves vacías: un día sin nada no queda como «registrado».
  function apply(rec, change) {
    const h = { ...(rec || {}) };
    if ('water' in change) {
      const g = Math.round(pos(h.water) / GLASS_L) + change.water;
      const next = Math.max(0, Math.min(40, g));
      if (next > 0) h.water = next * GLASS_L; else delete h.water;
    }
    if ('steps' in change) { if (change.steps == null) delete h.steps; else h.steps = change.steps; }
    if ('sleep' in change) { if (change.sleep == null) delete h.sleep; else h.sleep = change.sleep; }
    if ('trained' in change) { h.trained = !!change.trained; if (!h.trained) delete h.effort; }
    if ('effort' in change) { if (change.effort == null) delete h.effort; else { h.effort = change.effort; h.trained = true; } }
    if ('close' in change) { if (change.close == null) delete h.close; else h.close = change.close; }
    if (change.sameAs) {
      const y = change.sameAs;
      for (const k of ['water', 'steps', 'sleep']) if (pos(y[k]) > 0) h[k] = y[k];
    }
    if (h.trained !== true) h.trained = false;
    return h;
  }
  // ¿Quedó vacío el día (nada anotado)? Entonces no se guarda un registro.
  const isEmpty = (h) => !h || (!pos(h.water) && !pos(h.steps) && !pos(h.sleep) && h.trained !== true && !h.effort && !h.close);

  const api = { HABITS, day, week, listLine, notSharedText, GLASS_L, GLASSES_GOAL, STEPS_GOAL, SLEEP_GOAL, STEP_TIERS, SLEEP_OPTS, EFFORTS, CLOSES, tierOfSteps, optOfSleep, effortLabel, closeLabel, apply, isEmpty };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Habitos = api;
})(typeof window !== 'undefined' ? window : globalThis);
