// Panel admin (M7–M10), lógica PURA (sin DOM; tests/admin.test.js). Solo para quien tiene core.has_role('grasa','admin').
// El admin NUNCA recibe datos de salud ni nombres, iniciales o ids de asesorados: aquí solo llegan cantidades por coach o totales (ver r1 v1.13).
(function (root) {
  'use strict';

  // PRECIO: ÚNICO lugar donde está. Fase 1 de legal/terminos.html y equipo/legal/terminos-y-condiciones.md («Precios, fase 1»):
  // «Para el coach, gratis hasta 5 clientes y luego USD 5 por cliente activo al mes (cobrado en pesos), pagado fuera de la app».
  // El cupo gratis de cada coach viene de grasa.coaches.free_clients (por defecto 5). Si cambia el precio, se cambia SOLO aquí (y en los términos).
  const PRICE_USD_PER_ACTIVE_CLIENT = 5;
  const CURRENCY = 'USD';
  const PRICE_NOTE = `Gratis hasta el cupo de cada coach; luego ${CURRENCY} ${PRICE_USD_PER_ACTIVE_CLIENT} por asesorado activo al mes, cobrado en pesos fuera de la app.`;
  const ACTIVE_NOTE = 'Asesorado activo: vínculo activo y al menos 1 registro en los 30 días antes del cierre del mes.';
  const RETENTION_NOTE = 'Retención: de quienes empezaron hace 30 a 60 días, cuántos siguen.';
  const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

  const usd = (n) => `${CURRENCY} ${Number(n).toLocaleString('es', { maximumFractionDigits: 0 })}`;
  // Cobro estimado de un coach en el mes (con la fila de grasa.admin_coaches).
  function billing(c) {
    const active = Math.max(0, Number(c.activeClients) || 0), free = Math.max(0, Number(c.freeClients) || 0);
    const over = Math.max(0, active - free);
    return { active, free, over, amount: over * PRICE_USD_PER_ACTIVE_CLIENT, text: c.active === false && over === 0 ? '—' : usd(over * PRICE_USD_PER_ACTIVE_CLIENT) };
  }
  function totals(coaches) {
    const list = Array.isArray(coaches) ? coaches : [];
    const b = list.map(billing);
    return { coachesActive: list.filter((c) => c.active).length, coaches: list.length, over: b.reduce((s, x) => s + x.over, 0),
      amount: b.reduce((s, x) => s + x.amount, 0), amountText: usd(b.reduce((s, x) => s + x.amount, 0)) };
  }
  const pct = (kept, cohort) => (cohort > 0 ? Math.round((kept / cohort) * 100) : null);
  const pctText = (v) => (v == null ? '—' : `${v} %`);

  // Meses para el filtro: los últimos n, el actual primero. value = 'AAAA-MM-01'.
  function months(today, n = 6) {
    const out = [];
    let y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
    for (let i = 0; i < n; i++) {
      out.push({ value: `${y}-${String(m).padStart(2, '0')}-01`, label: `${cap(MONTHS_LONG[m - 1])} ${y}` });
      m -= 1; if (m === 0) { m = 12; y -= 1; }
    }
    return out;
  }
  // Barras de 8 semanas: alto relativo al máximo (o a `max` fijo, p. ej. 100 %).
  function bars(values, max) {
    const vs = values.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : null));
    const top = max || Math.max(1, ...vs.filter((v) => v != null));
    return vs.map((v) => ({ value: v, h: v == null ? 0 : Math.max(4, Math.round((v / top) * 100)) }));
  }
  // Etiquetas de semana: la 1.ª, cada 2 y «hoy» en la última (como el boceto).
  const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
  const dm = (iso) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
  const weekLabels = (weeks) => weeks.map((w, i) => (i === weeks.length - 1 ? 'hoy' : i % 2 === 0 ? dm(w.start) : ''));
  // «Coaches por tamaño» (asesorados activos).
  function sizes(s) {
    const rows = [['1 a 5', s.s1_5 || 0], ['6 a 10', s.s6_10 || 0], ['11 o más', s.s11 || 0]];
    const total = rows.reduce((a, r) => a + r[1], 0) || 1;
    return rows.map(([label, n]) => ({ label, n, pct: Math.round((n / total) * 100) }));
  }
  // Última actividad del coach: lo más reciente entre sus acciones (con hora) y los días en que abrió el panel (solo fecha).
  function lastActivity(u, today) {
    const at = u.lastActionAt ? new Date(u.lastActionAt) : null;
    const local = at ? new Date(at.getTime() - 5 * 3600000).toISOString().slice(0, 10) : null;   // día en Bogotá
    const day = [local, u.lastPanelDay].filter(Boolean).sort().pop() || null;
    if (!day) return { big: '—', sub: 'sin actividad aún' };
    const hm = at && local === day ? new Date(at.getTime() - 5 * 3600000).toISOString().slice(11, 16) : '';
    const diff = Math.round((Date.parse(today + 'T00:00:00Z') - Date.parse(day + 'T00:00:00Z')) / 86400000);
    const big = diff <= 0 ? 'Hoy' : diff === 1 ? 'Ayer' : `Hace ${diff} días`;
    return { big, sub: `última actividad${hm ? ' ' + hm : ''}` };
  }
  // Días de la semana (los 7 que terminan en ref) con «abrió el panel».
  const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  function panelWeek(ref, days) {
    const set = new Set(days || []);
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.parse(ref + 'T12:00:00Z') - i * 86400000).toISOString().slice(0, 10);
      out.push({ date: d, dow: DOW[new Date(d + 'T12:00:00Z').getUTCDay()], n: Number(d.slice(8, 10)), on: set.has(d) });
    }
    return { days: out, count: out.filter((x) => x.on).length };
  }
  // Avisos: estado según el día.
  const noticeState = (n, today) => (today < n.startsOn ? 'Programado' : today > n.endsOn ? 'Terminó' : 'Activo');
  function validNotice({ title, body, from, to }, today) {
    const e = {};
    const t = String(title || '').trim(), b = String(body || '').trim();
    if (t.length < 3 || t.length > 80) e.title = 'El título va de 3 a 80 letras.';
    if (b.length < 3 || b.length > 400) e.body = 'El texto va de 3 a 400 letras.';
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    if (!iso.test(String(from)) || !iso.test(String(to))) e.dates = 'Elige las dos fechas.';
    else if (from > to) e.dates = '«Hasta» no puede ser antes de «Desde».';
    else if ((Date.parse(to) - Date.parse(from)) / 86400000 > 90) e.dates = 'Un aviso dura como máximo 90 días.';
    else if (to < today) e.dates = 'Ese aviso ya habría terminado.';
    return { ok: !Object.keys(e).length, errors: e, value: { title: t, body: b, from, to } };
  }

  const api = { PRICE_USD_PER_ACTIVE_CLIENT, CURRENCY, PRICE_NOTE, ACTIVE_NOTE, RETENTION_NOTE, usd, billing, totals, pct, pctText, months, bars, weekLabels, sizes, lastActivity, panelWeek, noticeState, validNotice, dm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Admin = api;
})(typeof window !== 'undefined' ? window : globalThis);
