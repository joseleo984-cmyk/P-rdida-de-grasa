// Sprint 4: estado de cada cliente en el panel del coach (puro, sin DOM; pruebas en tests/estado-cliente.test.js).
// Umbrales EXPLÍCITOS (días desde el último registro de cualquier tipo: peso, medidas, comidas u hábitos):
//   0 o 1 día   -> "Al día"        (registró hoy o ayer)
//   2 a 4 días  -> "Se atrasa"
//   5 días o más, o nunca -> "Sin registrar"
// "Necesita un mensaje hoy" = cualquiera que no esté "Al día". El estado siempre lleva TEXTO (no solo color).
// Solo usa lo que el coach puede ver: el estado ya viene filtrado por lo que el cliente compartió y,
// además, el peso solo se muestra si `shares.body` no es false.
(function (root) {
  'use strict';
  const Coach = typeof module !== 'undefined' && module.exports ? require('./coach.js') : root.Coach;

  const AL_DIA_MAX = 1;   // hoy o ayer
  const SE_ATRASA_MAX = 4; // 2 a 4 días; desde 5 es "Sin registrar"
  const STATES = {
    ok: { key: 'ok', label: 'Al día', color: 'verde' },
    late: { key: 'late', label: 'Se atrasa', color: 'amarillo' },
    none: { key: 'none', label: 'Sin registrar', color: 'rojo' },
  };

  const MINUS = '−';
  const num1 = (n) => Math.abs(n).toLocaleString('es', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const signed1 = (n) => { const r = Math.round(n * 10) / 10; return r === 0 ? '0,0' : (r < 0 ? MINUS : '+') + num1(r); };

  // Clave del estado según los días desde el último registro (null = nunca).
  function keyFor(days) {
    if (days == null) return 'none';
    if (days <= AL_DIA_MAX) return 'ok';
    if (days <= SE_ATRASA_MAX) return 'late';
    return 'none';
  }

  // "María Rojas" -> "MR"; "Ana" -> "A"; sin nombre -> "?". Solo letras (ignora emojis y signos al inicio de cada palabra).
  function initials(name) {
    const words = String(name == null ? '' : name).split(/\s+/).map((w) => w.replace(/^[^\p{L}\p{N}]+/u, '')).filter(Boolean);
    if (!words.length) return '?';
    return words.slice(0, 2).map((w) => Array.from(w)[0].toUpperCase()).join('');
  }

  // Número estable 0..n-1 a partir del nombre (para dar color fijo al avatar).
  function hue(name, n = 6) {
    let h = 0;
    for (const ch of String(name == null ? '' : name)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return h % n;
  }

  function lastWeights(state) {
    return state.entries.filter((e) => e.weight).sort((a, b) => a.date.localeCompare(b.date));
  }

  // Devuelve { key, label, color, days, lastDate, needsMessage, weight, line }.
  //  weight: { value, diff } | null (diff null si es el primer peso). line: texto de la fila.
  function estado(state, { today, shares } = {}) {
    if (!today) throw new Error('Falta la fecha de referencia');
    const sem = Coach.semaforo(state, { today });
    const days = sem.lastDate ? sem.daysSinceLast : null;
    const st = STATES[keyFor(days)];
    const canWeight = !shares || shares.body !== false;
    const ws = canWeight ? lastWeights(state).filter((e) => e.date <= today) : [];
    const weight = ws.length ? { value: ws[ws.length - 1].weight, diff: ws.length > 1 ? Math.round((ws[ws.length - 1].weight - ws[ws.length - 2].weight) * 10) / 10 : null } : null;
    let line;
    if (days == null) line = 'Aún no ha registrado nada';
    else if (days <= AL_DIA_MAX) {
      const w = weight ? ` · ${num1(weight.value)} kg${weight.diff == null ? '' : ` (${signed1(weight.diff)})`}` : '';
      line = (days === 0 ? 'Hoy registró' : 'Ayer registró') + w;
    } else line = `Último registro: hace ${days} días`;
    return { ...st, days, lastDate: sem.lastDate, needsMessage: st.key !== 'ok', weight, line };
  }

  // Más urgentes primero (Sin registrar, Se atrasa, Al día); dentro de cada grupo, el que lleva más tiempo sin registrar.
  const ORDER = { none: 0, late: 1, ok: 2 };
  const byUrgency = (a, b) => ORDER[a.key] - ORDER[b.key] || (b.days == null ? 1e9 : b.days) - (a.days == null ? 1e9 : a.days);

  // Subtítulo del panel: "5 clientes · 2 necesitan un mensaje hoy".
  function subtitle(list) {
    const n = list.length;
    const m = list.filter((x) => x.needsMessage).length;
    if (!n) return 'Aún no tienes clientes';
    const a = `${n} cliente${n === 1 ? '' : 's'}`;
    if (!m) return `${a} · todos al día`;
    return `${a} · ${m} ${m === 1 ? 'necesita' : 'necesitan'} un mensaje hoy`;
  }

  const api = { estado, keyFor, initials, hue, byUrgency, subtitle, STATES, AL_DIA_MAX, SE_ATRASA_MAX };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ClientStatus = api;
})(typeof window !== 'undefined' ? window : globalThis);
