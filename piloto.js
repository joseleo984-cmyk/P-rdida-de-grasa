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

  const api = { avisoCoach, plantilla, TEMPLATES, REENG_SOFT, REENG_DAYS, MSG_MAX, resumenSemanal, REC_HOURS, REC_DEFAULT_HOUR, REC_TEXT, recClean, recDue, recHourLabel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Piloto = api;
})(typeof window !== 'undefined' ? window : globalThis);
