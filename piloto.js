// Funciones del piloto (pedido de José, 2026-10-31). Puro, sin DOM; pruebas en tests/piloto.test.js.
// Solo constancia: nunca peso, kg, cm, kcal ni fotos. Sin culpa, sin «vas a perder…».
(function (root) {
  'use strict';

  // ---------- 1 · Recordatorio diario ----------
  // iPhone: las notificaciones push de una PWA exigen iOS 16.4+, la app instalada y un servidor push propio
  // (claves VAPID); aquí no hay servidor y Safari no programa avisos locales. Por eso el recordatorio es un
  // aviso AL ABRIR la app: la hora y el estado viven solo en este teléfono (no se envía nada).
  const REC_HOURS = [7, 8, 9, 12, 14, 18, 19, 20, 21, 22];
  const REC_DEFAULT_HOUR = 20;
  const REC_TEXT = 'Cuando quieras: registra tu día. Un toque en «Agua» ya cuenta.';

  // Config limpia: apagado por defecto; hora entera 0–23 (si no es válida, 20).
  function recClean(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const h = Number(r.hour);
    return { on: r.on === true, hour: Number.isInteger(h) && h >= 0 && h <= 23 ? h : REC_DEFAULT_HOUR };
  }
  // ¿Mostrar el aviso ahora? Activado, ya pasó la hora, hoy no hay registro y no lo pospuso hoy.
  function recDue(cfg, { hourNow, hasRecord, today, dismissedDay } = {}) {
    const c = recClean(cfg);
    return c.on && !hasRecord && dismissedDay !== today && Number(hourNow) >= c.hour;
  }
  const recHourLabel = (h) => `${String(h).padStart(2, '0')}:00`;

  // ---------- 2 · Resumen semanal del asesorado («lo que lograste») ----------
  // Solo días, hábitos, constancia y comodines (nunca peso, kg, cm ni kcal). Se ofrece domingo, lunes y martes:
  // el domingo cuenta la semana en curso; lunes y martes, la que acaba de cerrar. Sin registros no se muestra (sin culpa).
  const Constancia = typeof module !== 'undefined' && module.exports ? require('./constancia.js') : root.Constancia;
  const HABITS = [
    { key: 'agua', ok: (h) => h.water >= Constancia.GLASSES_GOAL * Constancia.GLASS_L - 1e-9, line: (n) => `Agua completa ${n === 1 ? '1 día' : n + ' días'}`, keep: 'el agua', tryIt: 'anotar tus vasos de agua' },
    { key: 'sueno', ok: (h) => h.sleep >= Constancia.SLEEP_GOAL && h.sleep <= 10, line: (n) => `Dormiste 7 h o más ${n === 1 ? '1 día' : n + ' días'}`, keep: 'tu sueño', tryIt: 'anotar tus horas de sueño' },
    { key: 'pasos', ok: (h) => h.steps >= Constancia.STEPS_GOAL, line: (n) => `Pasos de 8 mil o más ${n === 1 ? '1 día' : n + ' días'}`, keep: 'tus pasos', tryIt: 'anotar tus pasos' },
    { key: 'entreno', ok: (h) => h.trained === true, line: (n) => (n === 1 ? '1 entreno' : `${n} entrenos`), keep: 'tus entrenos', tryIt: 'anotar tu entrenamiento' },
  ];
  function resumenSemanal(state, today, { pauses } = {}) {
    const dow = new Date(today + 'T12:00:00Z').getUTCDay();   // 0 = domingo
    const current = dow === 0;
    const start = current ? Constancia.weekStart(today) : Constancia.addDays(Constancia.weekStart(today), -7);
    const end = Constancia.addDays(start, 6);
    const dates = Constancia.recordDates(state);
    const wk = Constancia.weekOf(dates, start, today, Constancia.frozenDays(pauses, today));
    const base = { show: false, refStart: start, current, title: current ? 'Lo que lograste esta semana' : 'Lo que lograste la semana pasada', lines: [], closing: '', registered: wk.registered, constant: wk.constant };
    if (dow > 2 || wk.registered === 0) return base;
    const counts = HABITS.map((hb) => ({ hb, n: wk.days.filter((d) => { const h = state.habits && state.habits[d.date]; return d.registered && h && typeof h === 'object' && hb.ok(Object.assign({ water: 0, sleep: 0, steps: 0 }, h)); }).length }));
    const lines = [`${wk.registered} de 7 días con registro`];
    for (const c of counts) if (c.n > 0) lines.push(c.hb.line(c.n));
    if (wk.comodines) lines.push(wk.comodines === 1 ? '1 comodín usado' : `${wk.comodines} comodines usados`);
    const weeks = Constancia.summary(state, end, { pauses }).constantWeeks;
    if (wk.constant) lines.push(weeks >= 2 ? `${weeks} semanas constantes seguidas` : 'Semana constante');
    const best = counts.slice().sort((a, b) => b.n - a.n)[0];
    const least = counts.slice().sort((a, b) => a.n - b.n)[0];
    let closing = wk.constant ? 'Eso es constancia real, no suerte.' : 'Cada día que registras cuenta. Esta semana empieza de cero, con calma.';
    if (best.n > 0) closing += ` Para mantener: ${best.hb.keep}.`;
    if (least.n < best.n) closing += ` Para probar: ${least.hb.tryIt}.`;
    return { ...base, show: true, lines, closing };
  }

  // ---------- 3 · Aviso al coach con guía de qué escribir  ·  4 · Plantillas de reenganche ----------
  // Solo lo ve el coach (ficha del asesorado). Desde los 3 días sin registrar ofrece las plantillas; a los 7 días
  // (`urgent`) es el aviso con la acción sugerida. Sin juicio, sin consejos clínicos, sin pagos ni cifras de salud.
  // El coach elige una plantilla, la edita y la envía como nota. Textos para revisar el tono (el coach no es profesional de salud).
  const REENG_SOFT = 3, REENG_DAYS = 7;
  const MSG_MAX = 1000;
  const TEMPLATES = [
    { id: 'extrano', label: 'Te extrañamos', text: (n) => `Hola ${n}, hace unos días no te veo por la app y quería saber cómo vas. Sin presión: cuando puedas, un solo toque en «Agua» ya cuenta.` },
    { id: 'pequeno', label: 'Empezar pequeño', text: (n) => `Hola ${n}, lo de ayer ya pasó. Empecemos hoy con lo más fácil: anota tus vasos de agua. ¿Te parece?` },
    { id: 'ayuda', label: '¿Cómo te ayudo?', text: (n) => `Hola ${n}, ¿qué te ha costado más para registrar esta semana? Cuéntame y lo ajustamos para que te sea más fácil.` },
    { id: 'una-cosa', label: 'Una cosa pequeña', text: (n) => `Hola ${n}, ¿qué una cosa pequeña podrías anotar hoy? Con eso ya cuenta para tu semana.` },
    { id: 'aqui-estoy', label: 'Aquí sigo', text: (n) => `Hola ${n}, aquí sigo para cuando quieras retomar. Tus registros siguen guardados y tu semana empieza de cero, con calma.` },
  ];
  const firstName = (name) => String(name || '').trim().split(/\s+/)[0];
  const plantilla = (id, name) => { const t = TEMPLATES.find((x) => x.id === id) || TEMPLATES[0]; return t.text(firstName(name)); };
  // `days`: días desde el último registro (null si nunca registró: no se avisa, puede ser alguien recién invitado).
  function avisoCoach({ days, name } = {}) {
    const first = firstName(name) || 'Tu asesorado';
    if (days == null || days < REENG_SOFT) return { show: false, urgent: false, headline: '', action: '', message: '', templates: [] };
    const urgent = days >= REENG_DAYS;
    return {
      show: true, urgent,
      headline: `${first} lleva ${days} días sin registrar`,
      action: urgent
        ? 'Qué hacer: escríbele hoy un mensaje corto y amable. Pídele solo un paso pequeño, como anotar el agua. Sin reproches ni preguntas sobre cifras.'
        : 'Todavía es pronto. Si quieres, un mensaje breve y sin presión ayuda a que no se enfríe.',
      message: plantilla(TEMPLATES[0].id, name),
      templates: TEMPLATES.map((t) => ({ id: t.id, label: t.label, text: t.text(firstName(name)) })),
    };
  }

  // ---------- 6 · «A quién reconocer este lunes» (coach) ----------
  // Sugiere hasta 3 asesorados por constancia o por regreso, con un mensaje de 1 toque. Solo lunes a miércoles y sobre la semana que cerró.
  // Solo días, constancia y regreso (nunca peso, kg, cm ni kcal). `rows`: [{ id, name, state, pauses }].
  const MAX_RECONOCER = 3;
  function reconocer(rows, today) {
    const dow = new Date(today + 'T12:00:00Z').getUTCDay();
    const base = { show: false, week: '', items: [] };
    if (dow < 1 || dow > 3) return base;
    const start = Constancia.addDays(Constancia.weekStart(today), -7), end = Constancia.addDays(start, 6);
    const items = [];
    for (const r of rows || []) {
      if (!r || !r.state) continue;
      const first = firstName(r.name) || 'tu asesorado';
      const dates = Constancia.recordDates(r.state);
      const wk = Constancia.weekOf(dates, start, today, Constancia.frozenDays(r.pauses, today));
      if (wk.registered < 2) continue;
      const inWeek = [...dates].filter((d) => d >= start && d <= end).sort();
      const prev = [...dates].filter((d) => d < inWeek[0]).sort().pop();
      const gap = prev ? Constancia.dayNum(inWeek[0]) - Constancia.dayNum(prev) : 0;
      const weeks = Constancia.summary(r.state, end, { pauses: r.pauses }).constantWeeks;
      let it = null;
      if (prev && gap >= 7) it = { kind: 'regreso', score: 50 + wk.registered, reason: 'Volvió a registrar esta semana después de unos días', message: `¡${first}, qué bueno verte de vuelta! Volver también es parte del proceso.` };
      else if (wk.constant && weeks >= 2) it = { kind: 'constancia', score: weeks * 10 + wk.registered, reason: `${weeks} semanas constantes seguidas`, message: `¡Felicitaciones, ${first}! ${weeks} semanas constantes seguidas. Eso es constancia real.` };
      if (it) items.push({ id: r.id, name: r.name, first, ...it });
    }
    items.sort((a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name), 'es'));
    return { show: items.length > 0, week: start, items: items.slice(0, MAX_RECONOCER) };
  }

  // ---------- 8 · Hito de 6 semanas y cierre de ciclo (semana 8 del piloto) ----------
  // Para el asesorado: a las 6 semanas desde su primer registro («Cumpliste 6 semanas») y a las 8 («Cierre de ciclo»), con un nuevo objetivo
  // elegido por él. Todo se mide en semanas y días con registro, nunca en peso. Cada hito se ofrece durante 14 días.
  const HITO_OPTIONS = [
    { id: 'dias5', label: 'Registrar mi día 5 de 7 días cada semana' },
    { id: 'entreno3', label: 'Anotar 3 entrenos por semana' },
    { id: 'agua', label: 'Anotar mi agua casi todos los días' },
    { id: 'sueno', label: 'Anotar mis horas de sueño 5 noches por semana' },
  ];
  const optionLabel = (id) => (HITO_OPTIONS.find((o) => o.id === id) || {}).label || '';
  function hito(state, today, { pauses } = {}) {
    const off = { show: false, stage: null };
    const sm = Constancia.summary(state, today, { pauses });
    if (!sm.first) return off;
    const days = Constancia.dayNum(today) - Constancia.dayNum(sm.first);
    const stage = days >= 56 && days < 70 ? 8 : days >= 42 && days < 56 ? 6 : null;
    if (!stage) return off;
    const dates = Constancia.recordDates(state), fz = Constancia.frozenDays(pauses, today);
    const w0 = Constancia.weekStart(sm.first);
    let constant = 0, registered = 0, comodines = 0;
    for (let i = 0; i < stage; i++) {
      const w = Constancia.weekOf(dates, Constancia.addDays(w0, 7 * i), today, fz);
      if (w.constant) constant++;
      registered += w.registered; comodines += w.comodines;
    }
    const lines = [`${constant} de ${stage} semanas constantes`, `${registered} días con registro`];
    if (comodines) lines.push(comodines === 1 ? '1 comodín usado' : `${comodines} comodines usados`);
    return {
      show: true, stage, lines, options: HITO_OPTIONS,
      title: stage === 6 ? 'Cumpliste 6 semanas' : 'Cierre de ciclo: 8 semanas',
      closing: (stage === 6 ? 'Seis semanas de constancia: eso es proceso, no suerte.' : 'Ocho semanas: un ciclo completo.') + ' Tu avance se mide en semanas, nunca en kilos.',
      ask: stage === 6 ? 'Elige tu objetivo para las próximas 2 semanas' : 'Elige tu objetivo para el siguiente ciclo',
    };
  }

  const api = { reconocer, hito, optionLabel, HITO_OPTIONS, MAX_RECONOCER, avisoCoach, plantilla, TEMPLATES, REENG_SOFT, REENG_DAYS, MSG_MAX, resumenSemanal, REC_HOURS, REC_DEFAULT_HOUR, REC_TEXT, recClean, recDue, recHourLabel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Piloto = api;
})(typeof window !== 'undefined' ? window : globalThis);
