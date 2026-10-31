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

  const api = { REC_HOURS, REC_DEFAULT_HOUR, REC_TEXT, recClean, recDue, recHourLabel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Piloto = api;
})(typeof window !== 'undefined' ? window : globalThis);
