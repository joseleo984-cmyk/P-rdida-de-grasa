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

  const api = { HABITS, day, week, listLine, notSharedText, GLASS_L, GLASSES_GOAL, STEPS_GOAL, SLEEP_GOAL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Habitos = api;
})(typeof window !== 'undefined' ? window : globalThis);
