// Analítica del coach (M3), ranking privado (M5), gráficas de la ficha (M4) y metas del coach (M1/M2). Lógica PURA (sin DOM; tests/analitica.test.js).
// Reglas que no se rompen:
//   · Solo se usa lo que el coach ya puede ver (las cifras de M3/M5 llegan agregadas de grasa.coach_analytics: permisos de compartir respetados y sin pause_private).
//   · Si un asesorado NO comparte hábitos, sus cifras de hábitos son null («no comparte»), nunca 0.
//   · La app no juzga ni prescribe: no hay consejos, ni «bien» o «mal». Los colores marcan TENDENCIA (baja / estable / sube) o, si el coach fijó
//     una meta, si el cambio va hacia SU meta. Sin meta del coach no se muestra ninguna meta ni número sugerido (concepto jurídico 5).
//   · El ranking es SOLO para el coach (rótulo literal RANKING_LABEL). Ningún asesorado lo ve. Concepto 7, punto 10: nunca ordena por kilos ni cintura.
(function (root) {
  'use strict';
  const req = (n, f) => root[n] || (typeof require === 'function' ? require(f) : null);
  const Habitos = req('Habitos', './habitos.js');
  const Constancia = req('Constancia', './constancia.js');

  const DAY = 86400000;
  const dayNum = (iso) => Math.floor(Date.parse(iso + 'T00:00:00Z') / DAY);
  const addDays = (iso, n) => new Date((dayNum(iso) + n) * DAY).toISOString().slice(0, 10);
  const r1 = (n) => Math.round(n * 10) / 10;
  const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
  const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const dm = (iso) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
  const rangeText = (a, b) => (a.slice(0, 7) === b.slice(0, 7) ? `${Number(a.slice(8, 10))}–${dm(b)}` : `${dm(a)} – ${dm(b)}`);
  const num = (n, d = 1) => Number(n).toLocaleString('es', { minimumFractionDigits: 0, maximumFractionDigits: d });
  const MINUS = '−';
  const signed = (n, d = 1) => { const r = Math.round(n * 10 ** d) / 10 ** d; return r === 0 ? '=' : (r < 0 ? MINUS : '+') + num(Math.abs(r), d); };

  // Rótulos literales (los pide el encargo / el concepto 5).
  const RANKING_LABEL = 'Solo tú lo ves. Tus asesorados nunca ven un ranking.';
  const GOALS_FOOTER = 'Metas orientativas fijadas exclusivamente por tu coach. La plataforma no formula, valida ni prescribe objetivos corporales, medidas antropométricas, requerimientos nutricionales ni pautas de entrenamiento.';

  // ---------- Periodos ----------
  // Semana = los últimos 7 días (hoy incluido) contra los 7 anteriores. Mes = del 1 a hoy contra el mes anterior completo.
  function period(today, mode) {
    if (mode === 'mes') {
      const from = today.slice(0, 8) + '01';
      const prevTo = addDays(from, -1), prevFrom = prevTo.slice(0, 8) + '01';
      return { mode, from, to: today, days: dayNum(today) - dayNum(from) + 1, prevFrom, prevTo, prevDays: dayNum(prevTo) - dayNum(prevFrom) + 1,
        label: `${MONTHS_LONG[Number(today.slice(5, 7)) - 1]} (hasta hoy)`, short: MONTHS_LONG[Number(today.slice(5, 7)) - 1], vs: 'mes pasado', unit: 'mes' };
    }
    const from = addDays(today, -6);
    return { mode: 'semana', from, to: today, days: 7, prevFrom: addDays(today, -13), prevTo: addDays(today, -7), prevDays: 7,
      label: rangeText(from, today), short: rangeText(from, today), vs: 'semana pasada', unit: 'semana' };
  }
  const inRange = (d, a, b) => d >= a && d <= b;
  const countIn = (list, a, b) => (Array.isArray(list) ? list.filter((d) => inRange(d, a, b)).length : null);

  // ---------- Tendencia de peso (de los promedios semanales de grasa.coach_analytics: w = 0 es la semana que termina hoy) ----------
  // bajando / subiendo: el promedio de la semana más reciente difiere ≥ STALL_KG del de hace hasta 3 semanas.
  // estancado: difiere < STALL_KG y hay datos que cubren 3 semanas o más. sin_datos: menos de 2 semanas con pesajes, o sin pesajes en las 2 últimas.
  const STALL_KG = 0.3, TREND_WEEKS = 4;
  function trend(weeks) {
    const pts = (Array.isArray(weeks) ? weeks : []).filter((x) => x && Number.isFinite(Number(x.kg)) && Number(x.w) >= 0).map((x) => ({ w: Number(x.w), kg: Number(x.kg) })).sort((a, b) => a.w - b.w);
    const win = pts.filter((x) => x.w < TREND_WEEKS);
    if (win.length < 2 || win[0].w > 1) return { kind: 'sin_datos', weeks: 0, diff: null };
    const newest = win[0], oldest = win[win.length - 1];
    const diff = r1(newest.kg - oldest.kg), span = oldest.w - newest.w;
    const rate = span ? r1((newest.kg - oldest.kg) / span) : null;   // cambio del promedio semanal, por semana (solo para mostrarlo)
    // Semanas seguidas (hacia atrás) dentro de ±STALL_KG del promedio más reciente.
    let flat = newest.w;
    for (const x of pts) { if (x.w <= newest.w) continue; if (Math.abs(x.kg - newest.kg) < STALL_KG) flat = x.w; else break; }
    if (diff <= -STALL_KG) return { kind: 'bajando', weeks: span + 1, diff, rate };
    if (diff >= STALL_KG) return { kind: 'subiendo', weeks: span + 1, diff, rate };
    if (span >= 2) return { kind: 'estancado', weeks: flat - newest.w + 1, diff, rate };
    return { kind: 'sin_datos', weeks: 0, diff, rate };
  }
  const TREND_ORDER = ['bajando', 'estancado', 'subiendo', 'sin_datos'];
  const TREND_TEXT = { bajando: 'van bajando', estancado: 'estancados 3+ sem.', subiendo: 'subiendo', sin_datos: 'sin datos' };
  const TREND_TITLE = { bajando: 'Van bajando', estancado: 'Estancados 3+ sem.', subiendo: 'Subiendo', sin_datos: 'Sin datos' };
  // Lo que se muestra de cada persona en la lista de una categoría: solo la tendencia, en lenguaje neutro (sin «bien» ni «mal»).
  const SIN_PESAJES = 'sin pesajes suficientes';
  function trendChange(t) {
    if (!t || t.kind === 'sin_datos') return SIN_PESAJES;
    if (t.kind === 'estancado') return `estable ${t.weeks} sem.`;
    const r = t.rate == null ? t.diff : t.rate;
    return `${r < 0 ? MINUS : '+'}${num(Math.abs(r))} kg/sem`;
  }
  // Fecha del último pesaje en lo que el coach ya ve (entradas con peso). null si no hay ninguno.
  function lastWeigh(entries) {
    let last = null;
    for (const e of Array.isArray(entries) ? entries : []) if (e && typeof e.date === 'string' && typeof e.weight === 'number' && Number.isFinite(e.weight) && (!last || e.date > last)) last = e.date;
    return last;
  }
  // Asesorados de UNA categoría (rows de grasa.coach_analytics), por nombre. names: { clientId: nombre }; last: { clientId: 'AAAA-MM-DD' }.
  function trendPeople(rows, kind, { names = {}, last = {} } = {}) {
    return (Array.isArray(rows) ? rows : []).map((r) => ({ r, t: trend(r.weightWeeks) })).filter((x) => x.t.kind === kind)
      .map(({ r, t }) => ({ clientId: r.clientId, name: names[r.clientId] || 'Asesorado', kind, change: trendChange(t), last: last[r.clientId] || null, lastText: last[r.clientId] ? `Último pesaje: ${dm(last[r.clientId])}` : 'Sin pesajes' }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  // ---------- M3: resumen de todos ----------
  // rows: salida de remote.coach.analytics(from, to) pedida con from = p.prevFrom y to = p.to.
  function summary(rows, p, today) {
    const list = Array.isArray(rows) ? rows : [];
    const n = list.length;
    const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
    const cur = list.map((r) => countIn(r.logDays, p.from, p.to));
    const prev = list.map((r) => countIn(r.logDays, p.prevFrom, p.prevTo));
    const avg = (xs, days) => (n ? Math.round(xs.reduce((s, x) => s + x / days, 0) / n * 100) : null);
    const constancia = avg(cur, p.days), before = avg(prev, p.prevDays);
    const sharing = list.filter((r) => Array.isArray(r.trainedDays));
    const trainedCounts = sharing.map((r) => countIn(r.trainedDays, p.from, p.to));
    const trends = Object.fromEntries(TREND_ORDER.map((k) => [k, 0]));
    for (const r of list) trends[trend(r.weightWeeks).kind]++;
    return {
      n,
      constancia: { pct: constancia, prev: before, delta: constancia == null || before == null ? null : constancia - before, days: p.days },
      today: { count: list.filter((r) => (r.logDays || []).includes(today)).length, of: n },
      period: { count: cur.filter((x) => x > 0).length, of: n, pct: pct(cur.filter((x) => x > 0).length, n) },
      trained: { people: trainedCounts.filter((x) => x > 0).length, total: trainedCounts.reduce((s, x) => s + x, 0), of: sharing.length, notSharing: n - sharing.length },
      trend: trends,
    };
  }
  const deltaText = (s, p) => (s.constancia.delta == null ? '' : s.constancia.delta === 0 ? `= igual que la ${p.vs}` : `${s.constancia.delta > 0 ? '▲' : '▼'} ${Math.abs(s.constancia.delta)} ${Math.abs(s.constancia.delta) === 1 ? 'punto' : 'puntos'} vs. ${p.vs}`);

  // ---------- Metas: progreso hacia la meta del coach ----------
  // first = primera medida, last = la de ahora, goal = la meta del coach. pct 0–100 del camino recorrido; left = lo que falta (siempre ≥ 0);
  // away = se alejó de la meta respecto del inicio (el texto lo dice sin juzgar).
  function progress(goal, first, last) {
    if (![goal, first, last].every((x) => typeof x === 'number' && Number.isFinite(x))) return null;
    const total = goal - first, done = last - first;
    const reached = total === 0 ? true : (total < 0 ? last <= goal : last >= goal);
    const pct = total === 0 ? 100 : Math.max(0, Math.min(100, Math.round((done / total) * 100)));
    return { pct: reached ? 100 : pct, left: reached ? 0 : r1(Math.abs(goal - last)), reached, away: !reached && total !== 0 && Math.sign(done) === -Math.sign(total) && Math.abs(done) >= 0.05, moved: r1(done) };
  }
  const hasGoals = (g) => !!g && Object.keys(g).some((k) => typeof g[k] === 'number');

  // ---------- M5: ranking privado (solo el coach) ----------
  // Concepto jurídico 7, punto 10 (MANDATORIO): el ranking ordena SOLO por constancia, cumplimiento de hábitos, entrenos y puntos de constancia.
  // Nunca por kilos, cintura ni «progreso a la meta»: peso y cintura se ven solo en la ficha individual y en sus gráficas.
  // by: 'constancia' | 'habitos' | 'entrenos' | 'puntos' (cualquier otro valor = 'constancia'). names: { clientId: nombre }.
  // points: { clientId: { points, habitsMet } } de grasa.coach_points (null = no comparte: queda aparte, sin puesto, nunca 0).
  const RANK_BY = ['constancia', 'habitos', 'entrenos', 'puntos'];
  const RANK_LABEL = { constancia: 'Constancia', habitos: 'Hábitos', entrenos: 'Entrenos', puntos: 'Puntos' };
  function ranking(rows, by, { period: p, names = {}, points = {} } = {}) {
    const list = Array.isArray(rows) ? rows : [];
    const k = RANK_BY.includes(by) ? by : 'constancia';
    const nm = (r) => names[r.clientId] || 'Asesorado';
    const when = p.mode === 'mes' ? 'este mes' : 'en 7 días';
    const out = [], apart = [];
    for (const r of list) {
      const pt = points[r.clientId] || {};
      if (k === 'constancia') {
        const d = countIn(r.logDays, p.from, p.to);
        out.push({ clientId: r.clientId, value: d, pct: Math.round((d / p.days) * 100), label: `${Math.round((d / p.days) * 100)} %`, sub: `${d} de ${p.days} días con registro`, tone: 't' });
      } else if (k === 'entrenos') {
        if (!Array.isArray(r.trainedDays)) { apart.push({ clientId: r.clientId, name: nm(r), why: 'no comparte sus hábitos' }); continue; }
        const t = countIn(r.trainedDays, p.from, p.to);
        out.push({ clientId: r.clientId, value: t, label: String(t), sub: `${t} ${t === 1 ? 'entreno' : 'entrenos'} ${p.mode === 'mes' ? 'este mes' : 'esta semana'}`, tone: 't' });
      } else if (k === 'habitos') {
        if (typeof pt.habitsMet !== 'number') { apart.push({ clientId: r.clientId, name: nm(r), why: 'no comparte sus hábitos' }); continue; }
        const of = 3 * p.days, pc = Math.round((pt.habitsMet / of) * 100);
        out.push({ clientId: r.clientId, value: pc, pct: pc, label: `${pc} %`, sub: `${pt.habitsMet} de ${of} metas de agua, pasos y sueño`, tone: 't' });
      } else {
        if (typeof pt.points !== 'number') { apart.push({ clientId: r.clientId, name: nm(r), why: 'no comparte sus hábitos y comidas' }); continue; }
        out.push({ clientId: r.clientId, value: pt.points, label: String(pt.points), sub: `${pt.points} ${pt.points === 1 ? 'punto' : 'puntos'} de constancia ${when}`, tone: 't' });
      }
    }
    out.sort((a, b) => b.value - a.value || String(names[a.clientId] || '').localeCompare(String(names[b.clientId] || ''), 'es'));
    if (k === 'entrenos' || k === 'puntos') { const max = Math.max(1, ...out.map((x) => x.value)); out.forEach((x) => { x.pct = Math.round((x.value / max) * 100); }); }
    out.forEach((x, i) => { x.rank = i + 1; x.name = names[x.clientId] || 'Asesorado'; });
    return { by: k, ranked: out, apart };
  }

  // ---------- M4: gráficas de UN asesorado (estado reconstruido de coach_pull, ya filtrado por lo que comparte) ----------
  const hasFood = (state, d) => Array.isArray(state.foods[d]) && state.foods[d].length > 0;
  const habitOf = (state, d) => { const h = state.habits && state.habits[d]; return h && typeof h === 'object' ? h : null; };
  const proteinDay = (state, d) => {
    const list = (state.foods[d] || []).filter((x) => x && (typeof x.dish === 'string' || Number(x.protein) > 0));
    return list.length ? list.reduce((s, x) => s + (Number(x.protein) || 0), 0) : null;
  };
  // Cubetas: semanas de 7 días que terminan hoy (n = 12) o meses de calendario (n = 6). La última es la actual.
  function buckets(today, gran, n) {
    const out = [];
    if (gran === 'meses') {
      let y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
      for (let i = 0; i < (n || 6); i++) {
        const from = `${y}-${String(m).padStart(2, '0')}-01`;
        const nextM = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
        const to = i === 0 ? today : addDays(nextM, -1);
        out.unshift({ from, to, label: MONTHS[m - 1], long: `${MONTHS_LONG[m - 1]} ${y}` });
        m -= 1; if (m === 0) { m = 12; y -= 1; }
      }
      return out;
    }
    for (let i = 0; i < (n || 12); i++) { const to = addDays(today, -7 * i), from = addDays(to, -6); out.unshift({ from, to, label: dm(from), long: rangeText(from, to) }); }
    return out;
  }
  const METRICS = { peso: { label: 'Peso', unit: 'kg', share: 'body' }, cintura: { label: 'Cintura', unit: 'cm', share: 'body' }, proteina: { label: 'Proteína', unit: 'g', share: 'nutrition' },
    entrenos: { label: 'Entrenos', unit: '', share: 'habits' }, constancia: { label: 'Constancia', unit: 'días', share: 'body' } };
  function valueIn(state, metric, b) {
    const days = []; for (let d = b.from; d <= b.to; d = addDays(d, 1)) days.push(d);
    if (metric === 'peso' || metric === 'cintura') {
      const k = metric === 'peso' ? 'weight' : 'waist';
      const xs = (state.entries || []).filter((e) => typeof e[k] === 'number' && inRange(e.date, b.from, b.to)).map((e) => e[k]);
      return xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null;
    }
    if (metric === 'proteina') { const xs = days.map((d) => proteinDay(state, d)).filter((x) => x != null); return xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null; }
    if (metric === 'entrenos') return days.filter((d) => { const h = habitOf(state, d); return !!h && h.trained === true; }).length;
    const rec = Constancia.recordDates(state);
    return days.filter((d) => rec.has(d)).length;
  }
  function series(state, metric, gran, today, shares) {
    const m = METRICS[metric];
    if (!m) return null;
    const sh = shares || {};
    if (m.share !== 'body' && !sh[m.share]) return { metric, notShared: true, points: [] };
    const bs = buckets(today, gran);
    return { metric, gran, unit: m.unit, points: bs.map((b) => ({ ...b, value: valueIn(state, metric, b) })) };
  }
  // Tabla «Comparar semanas / meses»: a = la anterior, b = la actual. color: 'up' (va hacia la meta del coach), 'dn' (se aleja) o '' (sin meta: neutro).
  function compare(state, gran, today, shares, goals, idx) {
    const bs = buckets(today, gran, gran === 'meses' ? 6 : 12);
    const i = Math.min(bs.length - 1, Math.max(1, idx == null ? bs.length - 1 : idx));
    const a = bs[i - 1], b = bs[i], sh = shares || {}, g = goals || {};
    const goalOf = { peso: g.weight_kg, cintura: g.waist_cm, proteina: g.protein_g, entrenos: typeof g.trained_days === 'number' && gran === 'semanas' ? g.trained_days : undefined };
    const fmt = { peso: (v) => `${num(v)} kg`, cintura: (v) => `${num(v)} cm`, proteina: (v) => `~${Math.round(v)} g`, entrenos: (v) => String(v), constancia: (v, bk) => `${v} de ${dayNum(bk.to) - dayNum(bk.from) + 1}` };
    const rows = [];
    for (const k of ['peso', 'cintura', 'proteina', 'entrenos', 'constancia']) {
      const m = METRICS[k];
      if (m.share !== 'body' && !sh[m.share]) { rows.push({ key: k, label: m.label, a: 'no comparte', b: 'no comparte', change: '', color: '' }); continue; }
      const va = valueIn(state, k, a), vb = valueIn(state, k, b);
      let change = '', color = '';
      if (va != null && vb != null) {
        const d = vb - va;
        change = k === 'constancia' ? signed(d, 0) : signed(d, k === 'proteina' || k === 'entrenos' ? 0 : 1);
        const goal = goalOf[k];
        if (typeof goal === 'number' && Math.abs(d) > 1e-9) color = Math.abs(goal - vb) < Math.abs(goal - va) ? 'up' : 'dn';
      }
      rows.push({ key: k, label: m.label, a: va == null ? '—' : fmt[k](va, a), b: vb == null ? '—' : fmt[k](vb, b), change, color });
    }
    return { a, b, index: i, options: bs.map((x, j) => ({ index: j, label: x.long })).slice(1), rows,
      title: gran === 'meses' ? `${a.label} vs. ${b.label}` : `${dm(a.from)} vs. ${dm(b.from)}` };
  }

  // ---------- M1: metas del asesorado (lo que fijó SU coach; sin meta no hay nada) ----------
  function metas(state, goals, today) {
    const g = goals || {};
    const out = { any: hasGoals(g), cards: [] };
    if (!out.any) return out;
    const entries = (state.entries || []).slice().sort((a, b) => a.date.localeCompare(b.date));
    if (typeof g.weight_kg === 'number') {
      const ws = entries.filter((e) => typeof e.weight === 'number');
      const last7 = ws.filter((e) => e.date <= today && e.date > addDays(today, -7));
      const now = last7.length ? r1(last7.reduce((s, e) => s + e.weight, 0) / last7.length) : ws.length ? ws[ws.length - 1].weight : null;
      const pr = now == null || !ws.length ? null : progress(g.weight_kg, ws[0].weight, now);
      out.cards.push({ key: 'peso', goal: g.weight_kg, now, unit: 'kg', progress: pr, series: series(state, 'peso', 'semanas', today, { body: true }).points });
    }
    if (typeof g.waist_cm === 'number') {
      const ws = entries.filter((e) => typeof e.waist === 'number');
      const now = ws.length ? ws[ws.length - 1].waist : null;
      out.cards.push({ key: 'cintura', goal: g.waist_cm, now, unit: 'cm', progress: now == null ? null : progress(g.waist_cm, ws[0].waist, now) });
    }
    if (typeof g.protein_g === 'number') {
      const xs = []; for (let i = 0; i < 7; i++) { const v = proteinDay(state, addDays(today, -i)); if (v != null) xs.push(v); }
      const avg = xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null;
      out.cards.push({ key: 'proteina', goal: g.protein_g, now: avg, unit: 'g/día', pct: avg == null ? 0 : Math.min(100, Math.round((avg / g.protein_g) * 100)), days: xs.length });
    }
    const H = [['water', 'water_days', 'días agua'], ['steps', 'steps_days', 'días pasos'], ['sleep', 'sleep_days', 'días sueño'], ['trained', 'trained_days', 'entrenos']];
    const rings = [];
    for (const [key, gk, label] of H) {
      if (typeof g[gk] !== 'number') continue;
      const rule = Habitos.HABITS.find((x) => x.key === key);
      let n = 0; for (let i = 0; i < 7; i++) { const h = habitOf(state, addDays(today, -i)); if (h && rule.ok(h)) n++; }
      rings.push({ key, goal: g[gk], done: n, label, pct: Math.min(100, Math.round((n / g[gk]) * 100)), met: n >= g[gk] });
    }
    if (rings.length) out.cards.push({ key: 'habitos', rings, from: addDays(today, -6), to: today, label: rangeText(addDays(today, -6), today) });
    return out;
  }

  // Validación del formulario «Fijar metas» (M2). Vacío = sin meta. Devuelve { ok, goals, errors: { campo: mensaje } }. Nunca rellena ni sugiere.
  const GOAL_FIELDS = [
    { key: 'weight_kg', label: 'Peso', unit: 'kg', min: 30, max: 300, dec: 1 }, { key: 'waist_cm', label: 'Cintura', unit: 'cm', min: 40, max: 200, dec: 1 },
    { key: 'protein_g', label: 'Proteína', unit: 'g/día', min: 20, max: 400, dec: 0 },
    { key: 'water_days', label: 'Agua', unit: 'días', min: 1, max: 7, dec: 0 }, { key: 'steps_days', label: 'Pasos', unit: 'días', min: 1, max: 7, dec: 0 },
    { key: 'sleep_days', label: 'Sueño', unit: 'días', min: 1, max: 7, dec: 0 }, { key: 'trained_days', label: 'Días de entreno', unit: 'días', min: 1, max: 7, dec: 0 },
  ];
  function parseGoals(form) {
    const goals = {}, errors = {};
    for (const f of GOAL_FIELDS) {
      const raw = String((form && form[f.key]) == null ? '' : form[f.key]).trim().replace(',', '.');
      if (!raw) continue;
      const v = Number(raw);
      if (!Number.isFinite(v)) { errors[f.key] = `${f.label}: escribe un número.`; continue; }
      const val = f.dec ? Math.round(v * 10) / 10 : Math.round(v);
      if (f.dec === 0 && Math.abs(v - Math.round(v)) > 1e-9) { errors[f.key] = `${f.label}: usa un número entero.`; continue; }
      if (val < f.min || val > f.max) { errors[f.key] = `${f.label}: va de ${f.min} a ${f.max} ${f.unit}.`; continue; }
      goals[f.key] = val;
    }
    return { ok: !Object.keys(errors).length, goals, errors };
  }

  const api = { RANKING_LABEL, GOALS_FOOTER, STALL_KG, TREND_TEXT, TREND_TITLE, TREND_ORDER, trendChange, trendPeople, lastWeigh, SIN_PESAJES, METRICS, GOAL_FIELDS, period, trend, summary, deltaText, progress, hasGoals, ranking, RANK_BY, RANK_LABEL,
    buckets, series, compare, metas, parseGoals, addDays, rangeText, dm, num, signed };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Analitica = api;
})(typeof window !== 'undefined' ? window : globalThis);
