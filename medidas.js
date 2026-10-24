// Sprint 11: medidas de cuerpo tipo sastre (cuello, brazos, espalda, cintura, muslos), en cm con decimales. Lógica PURA
// (sin DOM; pruebas en tests/medidas.test.js). Viven en el registro corporal `entry` (una fila por día; Schema v5).
// Textos legales del 24/10/2026: el formulario de medidas NUEVAS exige peso (kg), abdomen y cadera (cm); las otras siete siguen opcionales.
// Los registros viejos y el historial importado están EXENTOS (en el esquema siguen siendo opcionales; ver Schema.RANGES).
(function (root) {
  'use strict';
  const MINUS = '−';
  // Orden de la maqueta M2 (con peso al inicio y abdomen y cadera junto a la cintura). `key` = campo del registro corporal; `required` = lo exige
  // el formulario nuevo; `unit` = kg o cm.
  const MEASURES = [
    { key: 'weight', label: 'Peso', unit: 'kg', required: true },
    { key: 'neck', label: 'Cuello', unit: 'cm' }, { key: 'armR', label: 'Brazo der.', unit: 'cm' }, { key: 'armL', label: 'Brazo izq.', unit: 'cm' }, { key: 'back', label: 'Espalda', unit: 'cm' },
    { key: 'waist', label: 'Cintura', unit: 'cm' }, { key: 'abdomen', label: 'Abdomen', unit: 'cm', required: true }, { key: 'hip', label: 'Cadera', unit: 'cm', required: true },
    { key: 'thighR', label: 'Muslo der.', unit: 'cm' }, { key: 'thighL', label: 'Muslo izq.', unit: 'cm' },
  ];
  const KEYS = MEASURES.map((m) => m.key);
  const REQUIRED = MEASURES.filter((m) => m.required).map((m) => m.key);
  const labelOf = (key) => (MEASURES.find((m) => m.key === key) || {}).label || key;
  const unitOf = (key) => (MEASURES.find((m) => m.key === key) || {}).unit || 'cm';
  // Qué falta en un registro NUEVO: `vals` = lo escrito en el formulario; `existing` = el registro de ese mismo día, si ya existía (lo que ya tiene no se vuelve a exigir).
  // → lista de medidas (objetos de MEASURES) que faltan.
  const missing = (vals, existing) => MEASURES.filter((m) => m.required && num((vals || {})[m.key]) == null && num((existing || {})[m.key]) == null);
  // «Falta «Abdomen» (cm): es obligatoria.» / «Faltan «Peso» (kg), «Abdomen» (cm) y «Cadera» (cm): son obligatorias.»
  function missingText(list) {
    const names = list.map((m) => `«${m.label}» (${m.unit})`);
    if (!names.length) return '';
    return names.length === 1 ? `Falta ${names[0]}: es obligatoria.` : `Faltan ${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}: son obligatorias.`;
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

  const api = { MEASURES, KEYS, REQUIRED, labelOf, unitOf, missing, missingText, series, summary, hasAny, chart, chartLabel, fmt, fmtChange, MINUS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Medidas = api;
})(typeof window !== 'undefined' ? window : globalThis);
