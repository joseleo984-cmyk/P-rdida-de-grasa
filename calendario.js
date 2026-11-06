// Calendario de clases (R1 v1.24): lógica PURA (sin DOM; pruebas en tests/calendario.test.js). Fechas como texto 'AAAA-MM-DD' (hora local de quien usa la app).
(function (root) {
  'use strict';
  const MAX_DAYS = 62;       // por llamada al servidor
  const BACK = 1, AHEAD = 120;   // se programa de ayer a 120 días adelante
  const pad = (n) => String(n).padStart(2, '0');
  const key = (y, m0, d) => `${y}-${pad(m0 + 1)}-${pad(d)}`;
  const parse = (k) => { const [y, m, d] = k.split('-').map(Number); return { y, m0: m - 1, d }; };
  const daysIn = (y, m0) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
  const addDays = (k, n) => { const { y, m0, d } = parse(k); const t = new Date(Date.UTC(y, m0, d + n)); return key(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()); };
  // Lunes = 0 … domingo = 6.
  const weekday = (k) => { const { y, m0, d } = parse(k); return (new Date(Date.UTC(y, m0, d)).getUTCDay() + 6) % 7; };
  const WD = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const WD_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const monthLabel = (y, m0) => `${MONTHS[m0]} de ${y}`;
  const addMonths = (y, m0, n) => { const t = y * 12 + m0 + n; return { y: Math.floor(t / 12), m0: ((t % 12) + 12) % 12 }; };
  // Semanas del mes (lunes primero): cada semana son 7 celdas, con null donde la celda no es del mes.
  function monthGrid(y, m0) {
    const first = weekday(key(y, m0, 1)), n = daysIn(y, m0), cells = [];
    for (let i = 0; i < first; i++) cells.push(null);
    for (let d = 1; d <= n; d++) cells.push(key(y, m0, d));
    while (cells.length % 7) cells.push(null);
    const weeks = []; for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  }
  // Todos los «lunes» (o el día que sea) del mes; solo los que se pueden programar si se pasa `allowed`.
  function daysOfWeekday(y, m0, wd, allowed) {
    const out = []; for (let d = 1; d <= daysIn(y, m0); d++) { const k = key(y, m0, d); if (weekday(k) === wd && (!allowed || allowed(k))) out.push(k); }
    return out;
  }
  const canSchedule = (k, today) => k >= addDays(today, -BACK) && k <= addDays(today, AHEAD);
  const monthRange = (y, m0) => ({ from: key(y, m0, 1), to: key(y, m0, daysIn(y, m0)) });
  const chunk = (arr, n = MAX_DAYS) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
  const short = (t, n = 9) => { const s = String(t || '').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const api = { MAX_DAYS, BACK, AHEAD, key, parse, daysIn, addDays, weekday, WD, WD_NAMES, MONTHS, monthLabel, addMonths, monthGrid, daysOfWeekday, canSchedule, monthRange, chunk, short };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Calendario = api;
})(typeof window !== 'undefined' ? window : globalThis);
