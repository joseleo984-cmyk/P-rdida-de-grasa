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

  // ---------- 3 · Aviso al coach con guía de qué escribir ----------
  // Solo lo ve el coach (ficha del asesorado). Al llegar a 7 días sin registrar sugiere UNA acción y un mensaje.
  // Sin juicio, sin consejos clínicos, sin mencionar pagos ni cifras de salud. El coach lo edita antes de enviarlo.
  const REENG_DAYS = 7;
  const MSG_MAX = 1000;
  const DEFAULT_MESSAGE = (name) => `Hola ${name}, hace unos días no te veo por la app y quería saber cómo vas. Sin presión: cuando puedas, un solo toque en «Agua» ya cuenta.`;
  // `days`: días desde el último registro (null si nunca registró: no se avisa, puede ser alguien recién invitado).
  function avisoCoach({ days, name } = {}) {
    const first = String(name || '').trim().split(/\s+/)[0] || 'tu asesorado';
    if (days == null || days < REENG_DAYS) return { show: false, headline: '', action: '', message: '' };
    return {
      show: true,
      headline: `${first} lleva ${days} días sin registrar`,
      action: 'Qué hacer: escríbele hoy un mensaje corto y amable. Pídele solo un paso pequeño, como anotar el agua. Sin reproches ni preguntas sobre cifras.',
      message: DEFAULT_MESSAGE(String(name || '').trim().split(/\s+/)[0] || ''),
    };
  }

  const api = { avisoCoach, REENG_DAYS, MSG_MAX, resumenSemanal, REC_HOURS, REC_DEFAULT_HOUR, REC_TEXT, recClean, recDue, recHourLabel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Piloto = api;
})(typeof window !== 'undefined' ? window : globalThis);
