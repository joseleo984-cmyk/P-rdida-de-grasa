// Estilo v2 · modo «paso a paso» (imagen E3): lógica PURA del entreno guiado, sin DOM (pruebas en tests/paso.test.js).
// Sigue la rutina del coach ejercicio por ejercicio: serie en curso, descanso con cuenta regresiva, pausa, anterior y siguiente.
// La app NO calcula ni sugiere series, repeticiones, kilos ni descansos: todo sale de lo que escribió el coach (Rutinas.parseSets).
// Un ejercicio con solo texto libre («30 minutos») no tiene series ni temporizador: se muestra el texto y «Hecho ›».
// El estado es un objeto plano que cada función devuelve NUEVO; el tiempo entra como `now` (ms) para poder probarlo sin relojes.
(function (root) {
  'use strict';
  const R = typeof module !== 'undefined' && module.exports ? require('./rutinas.js') : root.Rutinas;

  // Un día de una rutina → los pasos del entreno (solo ejercicios con nombre).
  function plan(day) {
    const list = ((day && day.exercises) || []).filter((e) => e && String(e.name || '').trim());
    return list.map((e) => {
      const p = R.parseSets(R.setsOf(e));
      const base = { name: String(e.name).trim(), note: String(e.note || '').trim(), gif: String(e.gif || '').trim() };
      if (!p) return { ...base, mode: 'free', series: 1, text: String(e.sets || '').trim(), line: String(e.sets || '').trim(), reps: '', weight: '', rest: 0 };
      return { ...base, mode: 'sets', series: p.series, reps: p.reps, weight: p.weight, rest: p.rest, text: '', line: R.setsLine({ sets: R.composeSets(p) }) };
    });
  }

  // Estado inicial: primer ejercicio, ninguna serie hecha, sin descanso en curso.
  const start = (steps) => ({ i: 0, done: (steps || []).map(() => 0), phase: 'work', restEnd: null, restLeft: 0, paused: false, finished: !(steps && steps.length), restEndedAt: null });
  const copy = (st) => ({ ...st, done: st.done.slice() });
  const cur = (st, steps) => (st.finished ? null : steps[st.i] || null);
  // Serie que toca (1…series): la siguiente a las hechas. Durante el descanso es la que viene.
  const setNo = (st, steps) => { const s = cur(st, steps); return s ? Math.min(st.done[st.i] + 1, s.series) : 0; };

  function advance(st, steps) {
    const n = copy(st);
    n.phase = 'work'; n.restEnd = null; n.restLeft = 0; n.paused = false;
    if (n.i + 1 >= steps.length) { n.finished = true; return n; }
    n.i += 1;
    return n;
  }

  // «Serie hecha» (o «Hecho ›» en texto libre): suma la serie; con descanso del coach empieza la cuenta regresiva; con la última serie pasa al siguiente ejercicio.
  function complete(st, steps, now) {
    const s = cur(st, steps);
    if (!s || st.phase !== 'work') return st;
    const n = copy(st);
    n.done[n.i] = Math.min(s.series, n.done[n.i] + 1);
    if (s.mode === 'free' || n.done[n.i] >= s.series) return advance(n, steps);
    if (s.rest > 0) { n.phase = 'rest'; n.restEnd = now + s.rest * 1000; n.restLeft = 0; n.paused = false; }
    return n;
  }
  // Segundos de descanso que quedan (redondeo hacia arriba: «01:02» hasta que de verdad baje).
  function left(st, now) {
    if (st.phase !== 'rest') return 0;
    const ms = st.paused ? st.restLeft : Math.max(0, st.restEnd - now);
    return Math.ceil(ms / 1000);
  }
  // Fracción del descanso que queda (1 → 0), para el anillo.
  function restRatio(st, steps, now) {
    const s = cur(st, steps);
    if (!s || st.phase !== 'rest' || !s.rest) return 0;
    const ms = st.paused ? st.restLeft : Math.max(0, st.restEnd - now);
    return Math.max(0, Math.min(1, ms / (s.rest * 1000)));
  }
  // El reloj avanza: si el descanso terminó, vuelve a «serie en curso». Devuelve { st, ended }.
  function tick(st, steps, now) {
    if (st.phase !== 'rest' || st.paused || now < st.restEnd) return { st, ended: false };
    const n = copy(st);
    n.phase = 'work'; n.restEnd = null; n.restLeft = 0; n.restEndedAt = now;
    return { st: n, ended: true };
  }
  function pause(st, now) {
    if (st.phase !== 'rest' || st.paused) return st;
    return { ...copy(st), paused: true, restLeft: Math.max(0, st.restEnd - now), restEnd: null };
  }
  function resume(st, now) {
    if (st.phase !== 'rest' || !st.paused) return st;
    return { ...copy(st), paused: false, restEnd: now + st.restLeft, restLeft: 0 };
  }
  // «›»: en el descanso lo salta; si no, pasa al siguiente ejercicio sin contar las series que faltan.
  function next(st, steps) {
    if (st.finished) return st;
    if (st.phase === 'rest') { const n = copy(st); n.phase = 'work'; n.restEnd = null; n.restLeft = 0; n.paused = false; return n; }
    return advance(st, steps);
  }
  // «‹»: vuelve al ejercicio anterior (o al principio de este, si es el primero) y empieza sus series otra vez.
  function prev(st) {
    if (st.finished) return st;
    const n = copy(st);
    n.phase = 'work'; n.restEnd = null; n.restLeft = 0; n.paused = false;
    if (n.i > 0) n.i -= 1;
    n.done[n.i] = 0;
    return n;
  }

  // «Hecho 40 %»: series hechas sobre el total (un ejercicio de texto libre cuenta como 1).
  function progress(st, steps) {
    const total = steps.reduce((a, s) => a + s.series, 0);
    const done = st.done.reduce((a, x) => a + x, 0);
    return { done, total, pct: total ? Math.round((done / total) * 100) : 0, index: st.finished ? steps.length : st.i + 1, count: steps.length };
  }
  // Resumen del cierre (E4): ejercicios con algo hecho, de cuántos, y series hechas (solo de los ejercicios con series).
  function summary(st, steps) {
    return {
      exercisesDone: st.done.filter((x) => x > 0).length,
      exercises: steps.length,
      sets: steps.reduce((a, s, i) => a + (s.mode === 'sets' ? st.done[i] : 0), 0),
      anySets: steps.some((s) => s.mode === 'sets'),
    };
  }
  // «01:02»
  const clock = (sec) => { const s = Math.max(0, Math.round(sec)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
  // El primer ejercicio que tiene video o animación del coach (para el fondo de la tarjeta de Entrenar).
  const coverGif = (day) => { const e = ((day && day.exercises) || []).find((x) => x && x.gif); return e ? e.gif : ''; };

  // Concepto jurídico 4 (equipo/legal/concepto-4-2026-10-25.md): textos LITERALES (tests/legal-literal.test.js). Pregunta cerrada No / Sí:
  // no hay campo de texto ni se pregunta qué duele. El «Sí» muestra el bloqueo preventivo y avisa al coach por el servidor (r1 v1.12).
  const DOLOR = {
    version: '1.0-D4',
    question: '¿Sentiste dolor que te impidiera entrenar con normalidad?',
    options: [['no', 'No'], ['si', 'Sí']],
    block: 'Tu salud es lo primero: suspende el ejercicio y consulta a un médico o fisioterapeuta. Tu coach ha sido notificado para pausar o revisar tu planificación',
  };
  // Lo que vio la persona al responder (se guarda su SHA-256 como huella, como en la pregunta de salud de la Etapa 2).
  const dolorText = () => [DOLOR.question, DOLOR.options.map((o) => o[1]).join(' / ')].join('\n');

  const api = { DOLOR, dolorText, plan, start, setNo, complete, left, restRatio, tick, pause, resume, next, prev, progress, summary, clock, coverGif };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Paso = api;
})(typeof window !== 'undefined' ? window : globalThis);
