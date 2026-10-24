// Sprint 11 («App para coaches», Etapa 1): cobros manuales. Lógica PURA (sin DOM; pruebas en tests/pagos.test.js).
// El cliente le paga a su coach por fuera de la app; el coach marca «Pagó» (pagado hasta = hoy + 30 días, editable) o «No pagó».
// Al día = paid_until >= hoy en America/Bogota (UTC-5 fijo: Colombia no tiene horario de verano). Sin fecha o con fecha pasada = vencido.
// El servidor decide de verdad (grasa.require_payment); esto solo dice qué mostrar y se calcula igual sin internet.
(function (root) {
  'use strict';
  const DAY = 86400000;
  const TZ_OFFSET_MS = -5 * 3600000;       // Bogotá
  const DEFAULT_DAYS = 30;                 // «Pagó» = hoy + 30 días
  const SOON_DAYS = 7;                     // «Faltan N días» se resalta si N ≤ 7
  const MINUS = '−';

  const isISO = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T12:00:00Z'));
  const dayNum = (iso) => Math.floor(Date.parse(iso + 'T00:00:00Z') / DAY);
  const addDays = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * DAY).toISOString().slice(0, 10);

  // Hoy en Bogotá (AAAA-MM-DD) para un instante en ms.
  const todayBogota = (nowMs = Date.now()) => new Date(nowMs + TZ_OFFSET_MS).toISOString().slice(0, 10);
  // Días hasta la fecha (0 = hoy, negativo = ya venció). null si no hay fecha válida.
  const daysLeft = (paidUntil, today) => (isISO(paidUntil) && isISO(today) ? dayNum(paidUntil) - dayNum(today) : null);

  // Estado de un vínculo ({ paidUntil }). key: 'paid' | 'overdue' | 'none'.
  function status(link, today) {
    const paidUntil = link && isISO(link.paidUntil) ? link.paidUntil : null;
    if (!paidUntil) return { key: 'none', paid: false, paidUntil: null, daysLeft: null };
    const left = daysLeft(paidUntil, today);
    return { key: left >= 0 ? 'paid' : 'overdue', paid: left >= 0, paidUntil, daysLeft: left };
  }
  // ¿El acceso del cliente está en pausa? Solo si TIENE vínculo activo y no está al día. Sin vínculo (null) nunca.
  const blocked = (link, today) => !!link && !status(link, today).paid;

  const defaultPaidUntil = (today) => addDays(today, DEFAULT_DAYS);
  // «No pagó»: queda vencido desde ayer (el servidor acepta fechas de hoy−400 a hoy+400).
  const unpaidDate = (today) => addDays(today, -1);

  const dayText = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('es', { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace('.', '');
  const nDays = (n) => `${n} ${n === 1 ? 'día' : 'días'}`;

  // Línea del coach (lista y ficha): «Pagó hasta el 15 nov. · vence en 20 días», «Venció el 10 oct.», «Sin pago registrado».
  function coachLine(st) {
    if (st.key === 'none') return 'Sin pago registrado';
    if (st.key === 'overdue') return `Venció el ${dayText(st.paidUntil)}`;
    const when = st.daysLeft === 0 ? 'vence hoy' : st.daysLeft === 1 ? 'vence mañana' : `vence en ${nDays(st.daysLeft)}`;
    return `Pagó hasta el ${dayText(st.paidUntil)} · ${when}`;
  }
  const chipText = (st) => (st.paid ? 'Pagó' : 'No pagó');
  // Frase del cliente: «Faltan 12 días para tu próximo pago». soon = resaltada (≤ 7 días). null si no hay nada que decir.
  function clientCountdown(st) {
    if (st.key === 'none') return { text: 'Tu coach aún no registra tu pago', soon: true };
    if (st.key === 'overdue') return { text: `Tu pago venció el ${dayText(st.paidUntil)}`, soon: true };
    // UX Etapa 1 (texto de neurociencia #12): sereno, separa lo administrativo del progreso y solo se muestra si faltan SOON_DAYS días o menos (Inicio).
    const n = st.daysLeft;
    const when = n === 0 ? 'hoy' : n === 1 ? 'mañana' : `el ${dayText(st.paidUntil)}`;
    const text = `Tu plan se renueva ${when}. Si tienes dudas, habla con tu coach.`;
    return { text, soon: n <= SOON_DAYS };
  }
  // «3 pagaron / 2 sin pagar» sobre una lista de estados.
  function summary(states) {
    const paid = states.filter((s) => s.paid).length;
    return { paid, unpaid: states.length - paid, total: states.length };
  }
  // Orden por vencimiento: primero los que ya vencieron o no tienen fecha, luego los que vencen antes.
  const dueKey = (st) => (st.paidUntil ? dayNum(st.paidUntil) : -Infinity);
  const byDue = (a, b) => { const x = dueKey(a), y = dueKey(b); return x === y ? 0 : x < y ? -1 : 1; };

  const api = { todayBogota, daysLeft, status, blocked, defaultPaidUntil, unpaidDate, coachLine, chipText, clientCountdown, summary, byDue, addDays, isISO, dayText, DEFAULT_DAYS, SOON_DAYS, MINUS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Pagos = api;
})(typeof window !== 'undefined' ? window : globalThis);
