// Sprint 11: medidas de cuerpo tipo sastre (cuello, brazos, espalda, cintura, muslos), en cm con decimales. Lógica PURA
// (sin DOM; pruebas en tests/medidas.test.js). Viven en el registro corporal `entry` (una fila por día; Schema v5).
// UX Etapa 1 (decisión D2 del panel, aprobada por el dueño; REEMPLAZA la regla anterior de «peso, abdomen y cadera obligatorios en cada registro»):
// el formulario pide SOLO lo que «toca hoy» según un calendario por defecto y solo eso es obligatorio:
//   · Peso: lunes, miércoles y viernes (obligatorio ese día solo si la persona dijo que tiene báscula; mientras no haya báscula configurada es opcional).
//   · Cintura (a la altura del ombligo): cada semana (cuando pasan 7 días o más desde la última).
//   · Cadera: cada 2 semanas.
//   · Cuello, brazos, espalda y muslos: cada 4 semanas y siempre opcionales.
// Los registros viejos y el historial importado están EXENTOS (en el esquema siguen siendo opcionales; ver Schema.RANGES).
(function (root) {
  'use strict';
  const MINUS = '−';
  // Orden de la maqueta M2 (con peso al inicio y abdomen y cadera junto a la cintura). `key` = campo del registro corporal; `required` = lo exige
  // el formulario nuevo; `unit` = kg o cm.
  const MEASURES = [
    { key: 'weight', label: 'Peso', unit: 'kg' },
    { key: 'neck', label: 'Cuello', unit: 'cm' }, { key: 'armR', label: 'Brazo der.', unit: 'cm' }, { key: 'armL', label: 'Brazo izq.', unit: 'cm' }, { key: 'back', label: 'Espalda', unit: 'cm' },
    { key: 'waist', label: 'Cintura', unit: 'cm' }, { key: 'abdomen', label: 'Abdomen', unit: 'cm' }, { key: 'hip', label: 'Cadera', unit: 'cm' },
    { key: 'thighR', label: 'Muslo der.', unit: 'cm' }, { key: 'thighL', label: 'Muslo izq.', unit: 'cm' },
  ];
  const KEYS = MEASURES.map((m) => m.key);
  const labelOf = (key) => (MEASURES.find((m) => m.key === key) || {}).label || key;
  const unitOf = (key) => (MEASURES.find((m) => m.key === key) || {}).unit || 'cm';
  // «Cintura» (a la altura del ombligo) reemplaza a «abdomen» en el formulario nuevo: el abdomen solo se muestra si ya hay datos antiguos.
  const FORM_KEYS = ['weight', 'waist', 'hip', 'neck', 'armR', 'armL', 'back', 'thighR', 'thighL'];
  // Calendario por defecto (`everyDays` = cada cuántos días toca; el peso va por días de la semana: 1 = lunes, 3 = miércoles, 5 = viernes).
  const SCHEDULE = {
    weight: { weekdays: [1, 3, 5] }, waist: { everyDays: 7 }, hip: { everyDays: 14 },
    neck: { everyDays: 28 }, armR: { everyDays: 28 }, armL: { everyDays: 28 }, back: { everyDays: 28 }, thighR: { everyDays: 28 }, thighL: { everyDays: 28 },
  };
  const GUIDE = {
    weight: 'En ayunas, después de ir al baño y en la misma báscula.',
    waist: 'A la altura del ombligo, al final de una espiración normal, sin apretar la cinta.',
    hip: 'En la parte más ancha de la cadera, con los pies juntos y la cinta recta.',
    neck: 'Justo debajo de la nuez, con la cinta sin apretar.',
    armR: 'A mitad del brazo derecho, relajado y sin flexionar.', armL: 'A mitad del brazo izquierdo, relajado y sin flexionar.',
    back: 'Alrededor del pecho, justo debajo de los omóplatos.',
    thighR: 'En la parte más ancha del muslo derecho.', thighL: 'En la parte más ancha del muslo izquierdo.',
  };
  const DAY_MS = 86400000;
  const dayNum = (iso) => Math.floor(Date.parse(iso + 'T00:00:00Z') / DAY_MS);
  const weekdayOf = (iso) => new Date(iso + 'T12:00:00Z').getUTCDay();
  const addDaysISO = (iso, n) => new Date((dayNum(iso) + n) * DAY_MS).toISOString().slice(0, 10);
  const WD = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  // «mañana», «en 3 días», «en 1 semana», «en 3 semanas»
  function inText(left) {
    if (left <= 0) return 'hoy';
    if (left === 1) return 'mañana';
    if (left < 7) return `en ${left} días`;
    const w = Math.round(left / 7);
    return `en ${w} ${w === 1 ? 'semana' : 'semanas'}`;
  }
  // Última medida de una clave hasta `upTo` (inclusive): { value, date } o null.
  function lastOf(entries, key, upTo) {
    const s = series(entries, key).filter((p) => !upTo || p.date <= upTo);
    return s.length ? s[s.length - 1] : null;
  }
  // ¿Qué toca medir en `today`? `scale`: 'si' (tiene báscula) | 'no' | null/undefined (aún sin configurar).
  // → { items: [{ key, label, unit, due, required, last, when, guide }], dueKeys, requiredKeys }
  function dueToday(entries, today, { scale } = {}) {
    const items = FORM_KEYS.map((key) => {
      const sch = SCHEDULE[key];
      const last = lastOf(entries, key, today);
      const gone = last ? dayNum(today) - dayNum(last.date) : null;
      const doneToday = !!last && last.date === today;
      let due, when;
      if (sch.weekdays) {
        due = sch.weekdays.includes(weekdayOf(today)) && !doneToday;
        if (!due) { for (let i = 1; i <= 7; i++) if (sch.weekdays.includes(weekdayOf(addDaysISO(today, i)))) { when = i === 1 ? 'mañana' : `el ${WD[weekdayOf(addDaysISO(today, i))]}`; break; } }
      } else {
        due = (last == null || gone >= sch.everyDays) && !doneToday;
        if (!due) { const left = sch.everyDays - (gone == null ? 0 : gone); when = inText(left); }
      }
      const required = due && (key === 'waist' || key === 'hip' || (key === 'weight' && scale === 'si'));
      return { key, label: labelOf(key), unit: unitOf(key), due, required, last, when: when || '', guide: GUIDE[key] };
    });
    return { items, dueKeys: items.filter((i) => i.due).map((i) => i.key), requiredKeys: items.filter((i) => i.required).map((i) => i.key) };
  }
  // Qué falta de lo obligatorio de hoy: `vals` = lo escrito; `existing` = el registro de ese día, si ya existía (lo que ya tiene no se vuelve a exigir).
  const missing = (vals, existing, due) => (due ? due.items.filter((i) => i.required && num((vals || {})[i.key]) == null && num((existing || {})[i.key]) == null) : []);
  // «Hoy toca: falta «Cintura» (cm).» / «Hoy toca: faltan «Cintura» (cm) y «Cadera» (cm).»
  function missingText(list) {
    const names = list.map((m) => `«${m.label}» (${m.unit})`);
    if (!names.length) return '';
    return names.length === 1 ? `Hoy toca: falta ${names[0]}.` : `Hoy toca: faltan ${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}.`;
  }

  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const round1 = (v) => Math.round(v * 10) / 10;
  // 33,5 · 28 (sin ceros sobrantes).
  const fmt = (v) => (num(v) == null ? '—' : round1(v).toLocaleString('es', { minimumFractionDigits: 0, maximumFractionDigits: 1 }));
  // −0,5 · +1 · 0
  const fmtChange = (c) => { if (c == null) return '—'; const r = round1(c); return r === 0 ? '0' : (r < 0 ? MINUS : '+') + Math.abs(r).toLocaleString('es', { minimumFractionDigits: 0, maximumFractionDigits: 1 }); };

  // [{ date, value }] de una medida, de la más vieja a la más nueva (ignora registros sin esa medida).
  function series(entries, key) {
    return (entries || []).filter((e) => e && num(e[key]) != null).map((e) => ({ date: e.date, value: e[key] })).sort((a, b) => a.date.localeCompare(b.date));
  }
  // Tabla Inicio / Hoy / Cambio por medida. `change` = hoy − inicio (null si solo hay un valor). dir: 'down' | 'up' | 'same' | 'none'.
  function summary(entries) {
    return MEASURES.map((m) => {
      const s = series(entries, m.key);
      const start = s.length ? s[0].value : null, now = s.length ? s[s.length - 1].value : null;
      const change = s.length > 1 ? round1(now - start) : null;
      return { key: m.key, label: m.label, unit: m.unit, count: s.length, start, today: now, change, dir: change == null ? 'none' : change < 0 ? 'down' : change > 0 ? 'up' : 'same',
        startText: fmt(start), todayText: fmt(now), changeText: fmtChange(change), lastDate: s.length ? s[s.length - 1].date : null };
    });
  }
  const hasAny = (entries) => KEYS.some((k) => series(entries, k).length > 0);

  // Gráfica sencilla (SVG): línea y puntos de una serie en un lienzo w×h. Con un solo punto, un punto centrado.
  function chart(points, { w = 320, h = 140, padX = 14, padTop = 14, padBottom = 22 } = {}) {
    if (!points || !points.length) return null;
    const day = (iso) => Date.parse(iso + 'T12:00:00Z');
    const t0 = day(points[0].date), t1 = day(points[points.length - 1].date);
    const vs = points.map((p) => p.value);
    const lo = Math.min(...vs), hi = Math.max(...vs);
    const span = hi - lo || 1;
    const pts = points.map((p, i) => {
      const fx = points.length === 1 ? 0.5 : t1 > t0 ? (day(p.date) - t0) / (t1 - t0) : i / (points.length - 1);
      const fy = hi > lo ? 1 - (p.value - lo) / span : 0.5;
      return { x: Math.round((padX + fx * (w - 2 * padX)) * 10) / 10, y: Math.round((padTop + fy * (h - padTop - padBottom)) * 10) / 10, date: p.date, value: p.value };
    });
    const d = pts.length > 1 ? 'M' + pts.map((p) => `${p.x} ${p.y}`).join(' L') : '';
    const first = points[0], last = points[points.length - 1];
    const dir = points.length < 2 ? 'none' : last.value < first.value ? 'down' : last.value > first.value ? 'up' : 'same';
    return { w, h, d, pts, min: lo, max: hi, first, last, dir };
  }
  // Texto para lectores de pantalla.
  function chartLabel(label, c, unit = 'cm') {
    if (!c) return `${label}: sin datos`;
    if (c.pts.length < 2) return `${label}: un solo registro, ${fmt(c.last.value)} ${unit}`;
    return `${label}: de ${fmt(c.first.value)} ${unit} a ${fmt(c.last.value)} ${unit} en ${c.pts.length} registros`;
  }

  // ---------- Progreso en lenguaje NEUTRO ----------
  // «1,6 kg menos» / «2,1 cm más» / «sin cambio». Sin «bien», «mal», «ganaste» ni colores de bueno o malo: lo que es bueno depende del objetivo que acordó con su coach.
  function neutralChange(change, unit) {
    if (change == null) return '';
    const r = round1(change);
    if (r === 0) return 'sin cambio';
    return `${Math.abs(r).toLocaleString('es', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} ${unit} ${r < 0 ? 'menos' : 'más'}`;
  }
  const dayShort = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('es', { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace('.', '');
  // Peso: tendencia de 7 días (media móvil, Calc.trend) con los pesajes del día tenues detrás. Últimos `days` días hasta `today`.
  function weightTrend(entries, today, { days = 90, w = 320, h = 170, padX = 30, padTop = 10, padBottom = 24 } = {}) {
    const Calc = typeof module !== 'undefined' && module.exports ? require('./calc.js') : root.Calc;
    const lim = addDaysISO(today, -days);
    const pts = Calc.trend((entries || []).filter((e) => num(e.weight) != null)).filter((p) => p.date >= lim && p.date <= today);
    if (!pts.length) return null;
    const t0 = dayNum(pts[0].date), t1 = dayNum(pts[pts.length - 1].date);
    const vs = pts.flatMap((p) => [p.weight, p.trend]);
    let lo = Math.floor(Math.min(...vs) - 0.3), hi = Math.ceil(Math.max(...vs) + 0.3);
    if (hi - lo < 2) { hi = lo + 2; }
    if ((hi - lo) % 2) hi += 1;   // tres marcas enteras: mínimo, medio y máximo
    const X = (iso) => Math.round((padX + (t1 > t0 ? (dayNum(iso) - t0) / (t1 - t0) : 0.5) * (w - padX - 10)) * 10) / 10;
    const Y = (v) => Math.round((padTop + (1 - (v - lo) / (hi - lo)) * (h - padTop - padBottom)) * 10) / 10;
    const raw = pts.map((p) => ({ x: X(p.date), y: Y(p.weight), date: p.date, value: p.weight }));
    const trend = pts.map((p) => ({ x: X(p.date), y: Y(p.trend), date: p.date, value: p.trend }));
    const d = trend.length > 1 ? 'M' + trend.map((p) => `${p.x} ${p.y}`).join(' L') : '';
    const ticks = [lo, Math.round(((lo + hi) / 2) * 10) / 10, hi].map((v) => ({ v, y: Y(v) }));
    const first = pts[0], last = pts[pts.length - 1];
    const change = pts.length > 1 ? round1(last.trend - first.trend) : null;
    return { w, h, raw, trend, d, ticks, first, last, change, count: pts.length, from: first.date, to: last.date, trendNow: last.trend };
  }
  // ¿El peso lleva unas semanas estable? (≥ 4 pesajes en 14 a 21 días y la tendencia se mueve menos de 0,5 kg): mensaje que normaliza la meseta (neurociencia #5).
  function plateau(entries, today) {
    const ws = (entries || []).filter((e) => num(e.weight) != null && e.date <= today && dayNum(today) - dayNum(e.date) <= 21).sort((a, b) => a.date.localeCompare(b.date));
    if (ws.length < 4 || dayNum(ws[ws.length - 1].date) - dayNum(ws[0].date) < 14) return false;
    const v = ws.map((e) => e.weight);
    return Math.max(...v) - Math.min(...v) <= 1 && Math.abs(v[v.length - 1] - v[0]) < 0.5;
  }
  // ¿El último peso es más alto que el anterior? (para el mensaje que explica el «ruido» del peso diario, neurociencia #6)
  function rose(entries, date) {
    const ws = (entries || []).filter((e) => num(e.weight) != null && e.date <= date).sort((a, b) => a.date.localeCompare(b.date));
    return ws.length >= 2 && ws[ws.length - 1].date === date && ws[ws.length - 1].weight > ws[ws.length - 2].weight;
  }

  const api = { MEASURES, KEYS, FORM_KEYS, SCHEDULE, GUIDE, labelOf, unitOf, lastOf, dueToday, inText, missing, missingText, series, summary, hasAny, chart, chartLabel, fmt, fmtChange, MINUS, neutralChange, weightTrend, plateau, rose, dayShort };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Medidas = api;
})(typeof window !== 'undefined' ? window : globalThis);
