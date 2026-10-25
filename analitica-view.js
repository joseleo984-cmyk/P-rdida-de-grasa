// r1 v1.13 · Vistas del producto «coach»: Analítica del coach (M3) y ranking privado (M5), pestañas de la ficha (Gráficas M4, Metas M2, Comidas),
// avisos de la plataforma arriba de la lista del coach (M10) y Progreso → Metas del asesorado (M1). La lógica está en analitica.js (pura y probada).
// Reglas: solo lo que el coach ya ve; quien no comparte hábitos sale «no comparte»; sin metas del coach no hay ninguna meta ni número sugerido;
// el ranking es SOLO del coach (rótulo literal) y nunca se dibuja en la app del asesorado; colores = tendencia, no juicio; nada de consejos.
// Todo lo que escribe otra persona (nombres, avisos) entra al DOM escapado.
(function () {
  'use strict';
  const PROD = window.Producto || { coach: false };
  if (!PROD.coach || !window.Analitica) return;
  const An = window.Analitica;
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n, d = 1) => (n == null ? '—' : Number(n).toLocaleString('es', { minimumFractionDigits: 0, maximumFractionDigits: d }));
  const toISO = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const todayLocal = () => toISO(new Date());
  const todayBo = () => (window.Pagos ? Pagos.todayBogota() : todayLocal());
  const initials = (n) => (window.ClientStatus ? ClientStatus.initials(n) : String(n || '?').slice(0, 2).toUpperCase());
  const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin espacio */ } } };
  const acc = () => window.PGAccount || null;
  const isCoach = () => document.body.classList.contains('mode-coach');

  // ================= Gráficas SVG (sin librerías). Colores por clases CSS: siguen el modo claro / oscuro. =================
  let gid = 0;
  // Línea con área, puntos y (si el coach fijó meta) la línea punteada de la meta. points: [{ label, value }] (value null = sin dato).
  function lineChart({ points, goal = null, goalLabel = '', unit = '', h = 130, aria = '' }) {
    const W = 320, H = h, padL = 30, padR = 12, padT = 12, padB = 22;
    const vals = points.map((p) => p.value).filter((v) => v != null);
    if (!vals.length) return `<p class="small muted ch-empty">Aún sin datos para esta gráfica.</p>`;
    let lo = Math.min(...vals, goal == null ? Infinity : goal), hi = Math.max(...vals, goal == null ? -Infinity : goal);
    if (hi - lo < 1) { hi += 0.5; lo -= 0.5; }
    const span = hi - lo; lo -= span * 0.12; hi += span * 0.12;
    const x = (i) => padL + (points.length === 1 ? (W - padL - padR) / 2 : (i * (W - padL - padR)) / (points.length - 1));
    const y = (v) => padT + ((hi - v) / (hi - lo)) * (H - padT - padB);
    const pts = points.map((p, i) => (p.value == null ? null : [x(i), y(p.value)])).filter(Boolean);
    const path = pts.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ');
    const id = 'g' + (++gid);
    const area = pts.length > 1 ? `<path d="${path} L${pts[pts.length - 1][0].toFixed(1)},${H - padB} L${pts[0][0].toFixed(1)},${H - padB} Z" fill="url(#${id})"/>` : '';
    const ticks = [lo + (hi - lo) * 0.12, (lo + hi) / 2, hi - (hi - lo) * 0.12].map((v) => Math.round(v));
    const grid = [...new Set(ticks)].map((t) => `<line class="ch-grid" x1="${padL}" x2="${W - padR}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/><text class="ch-ax" x="${padL - 6}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end">${t}</text>`).join('');
    const xl = [0, Math.floor((points.length - 1) / 2), points.length - 1].filter((v, i, a) => a.indexOf(v) === i)
      .map((i) => `<text class="ch-ax" x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}">${esc(points[i].label)}</text>`).join('');
    const g = goal == null ? '' : `<line class="ch-goal" x1="${padL}" x2="${W - padR}" y1="${y(goal).toFixed(1)}" y2="${y(goal).toFixed(1)}"/><text class="ch-goal-t" x="${W - padR}" y="${(y(goal) - 5).toFixed(1)}" text-anchor="end">${esc(goalLabel)}</text>`;
    const dots = pts.map((q, i) => `<circle class="ch-dot${i === pts.length - 1 ? ' last' : ''}" cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="${i === pts.length - 1 ? 5 : 2.6}"/>`).join('');
    const desc = points.filter((p) => p.value != null).map((p) => `${p.label}: ${num(p.value)} ${unit}`).join('; ');
    return `<svg class="ch" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}${goal != null ? `. ${esc(goalLabel)}` : ''}"><title>${esc(desc)}</title>
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="ch-area-a"/><stop offset="1" class="ch-area-b"/></linearGradient></defs>
      ${grid}${area}<path class="ch-line" d="${path}"/>${g}${dots}${xl}</svg>`;
  }
  // Barras (la última resaltada). values: números (null = sin dato). goal = línea punteada del coach.
  function barChart({ values, labels = [], max = null, goal = null, tone = 't', h = 90, w = 320, aria = '' }) {
    const W = w, H = h, padB = labels.some(Boolean) ? 18 : 4, padT = 6, n = values.length, gap = W < 200 ? 5 : 8;
    const top = max || Math.max(1, goal || 0, ...values.filter((v) => v != null));
    const bw = (W - gap * (n - 1)) / n;
    const y = (v) => padT + (1 - v / top) * (H - padT - padB);
    const bars = values.map((v, i) => { const yy = v == null ? H - padB : y(Math.max(v, top * 0.04)); return `<rect class="ch-bar ${tone}${i === n - 1 ? ' now' : ''}" x="${(i * (bw + gap)).toFixed(1)}" y="${yy.toFixed(1)}" width="${bw.toFixed(1)}" height="${(H - padB - yy).toFixed(1)}" rx="6"/>`; }).join('');
    const lb = labels.map((l, i) => (l ? `<text class="ch-ax" x="${(i * (bw + gap) + bw / 2).toFixed(1)}" y="${H - 4}" text-anchor="middle">${esc(l)}</text>` : '')).join('');
    const g = goal == null ? '' : `<line class="ch-goal" x1="0" x2="${W}" y1="${y(goal).toFixed(1)}" y2="${y(goal).toFixed(1)}"/>`;
    const desc = values.map((v, i) => `${labels[i] || i + 1}: ${v == null ? 'sin dato' : num(v, 0)}`).join('; ');
    return `<svg class="ch" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}"><title>${esc(desc)}</title>${g}${bars}${lb}</svg>`;
  }
  // Anillo (M3 constancia, M1 hábitos).
  function ring(pct, { size = 74, stroke = 8, cls = 't', label = '' } = {}) {
    const r = (size - stroke) / 2, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct || 0));
    return `<svg class="ring-svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle class="rg-bg" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" fill="none"/>
      <circle class="rg-fg ${cls}" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" fill="none" stroke-linecap="round" stroke-dasharray="${(c * p / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
      ${label ? `<text class="rg-t" x="50%" y="54%" text-anchor="middle" dominant-baseline="middle">${esc(label)}</text>` : ''}</svg>`;
  }
  window.PGCharts = { lineChart, barChart, ring, esc };

  // ================= M3 / M5: Analítica =================
  const AN = { tab: 'resumen', per: 'semana', by: 'meta', data: {}, loading: null };
  const TONE = { atencion: 'r', revisar: 'w', aldia: 't' };
  async function loadAnalytics(force) {
    const A = acc();
    if (!A) return null;
    const p = An.period(todayBo(), AN.per);
    const key = `${AN.per}|${p.to}`;
    if (!force && AN.data[key]) return { p, rows: AN.data[key] };
    $('#an-status').textContent = 'Cargando…';
    const rows = await A.remote.coach.analytics(p.prevFrom, p.to);
    AN.data[key] = rows;
    $('#an-status').textContent = '';
    return { p, rows };
  }
  const people = () => (window.PGCoachPanel ? PGCoachPanel.rows() : []);
  async function renderAnalitica(force) {
    const box = $('#an-resumen'), rk = $('#an-ranking');
    const st = $('#an-status');
    if (window.PGCoachPanel && !PGCoachPanel.loaded()) { st.textContent = 'Cargando…'; try { await PGCoachPanel.load(); } catch { /* el error lo dice la lista */ } }
    let out;
    try { out = await loadAnalytics(force); } catch (err) { st.textContent = acc() ? acc().errorText(err, 'coach') : 'No se pudo conectar con el servidor.'; return; }
    if (!out) return;
    const { p, rows } = out;
    const list = people(), names = Object.fromEntries(list.map((x) => [x.clientId, x.name]));
    document.body.dataset.anStamp = `${list.length} asesorado${list.length === 1 ? '' : 's'}`;
    document.dispatchEvent(new CustomEvent('pg:topbar-label'));
    $('#an-range').textContent = p.label;
    for (const b of document.querySelectorAll('#view-analitica [data-per]')) b.setAttribute('aria-pressed', String(b.dataset.per === AN.per));
    for (const b of document.querySelectorAll('#view-analitica [data-atab]')) b.setAttribute('aria-selected', String(b.dataset.atab === AN.tab));
    box.hidden = AN.tab !== 'resumen'; rk.hidden = AN.tab !== 'ranking';
    AN.rows = rows;
    if (AN.tab === 'resumen') box.innerHTML = resumenHtml(p, rows, list);
    else rk.innerHTML = rankingHtml(p, rows, names, list);
  }
  function resumenHtml(p, rows, list) {
    if (!rows.length) return '<div class="card"><p class="small muted">Cuando tengas asesorados vinculados verás aquí el resumen de todos.</p></div>';
    const s = An.summary(rows, p, todayBo());
    const d = s.constancia.delta;
    const k = (big, of, sub) => `<div class="an-k"><b>${big}<small> / ${of}</small></b><span>${sub}</span></div>`;
    const tr = s.trend, tot = rows.length || 1;
    // Cada categoría se toca (barra y leyenda) y abre la lista de esas personas. La barra repite lo de la leyenda: fuera del orden del teclado y oculta al lector.
    const seg = An.TREND_ORDER.filter((x) => tr[x]).map((x) => `<button type="button" class="an-seg-b" style="flex:${tr[x]}" data-trend="${x}" tabindex="-1" aria-hidden="true"><i class="tr-${x}"></i></button>`).join('');
    const att = attention(list);
    return `<div class="card an-glow"><div class="an-const">${ring(s.constancia.pct, { size: 82, stroke: 9, label: `${s.constancia.pct} %` })}
        <div><p class="an-tag">Constancia promedio</p><p class="small muted">Días con registro de todos, sobre ${p.days}.</p>${d == null ? '' : `<p><span class="an-pill${d < 0 ? ' w' : ''}">${esc(An.deltaText(s, p))}</span></p>`}</div></div></div>
      <div class="an-three">${k(s.today.count, s.today.of, 'registraron hoy')}${k(s.period.count, s.period.of, `registraron ${p.mode === 'mes' ? 'este mes' : 'esta semana'}`)}
        ${s.trained.of ? k(s.trained.people, s.trained.of, `entrenaron · ${s.trained.total} ${s.trained.total === 1 ? 'entreno' : 'entrenos'}`) : '<div class="an-k"><b>—</b><span>nadie comparte sus hábitos</span></div>'}</div>
      ${s.trained.notSharing ? `<p class="small muted an-note">${s.trained.notSharing} no ${s.trained.notSharing === 1 ? 'comparte' : 'comparten'} sus hábitos: no cuentan en los entrenos.</p>` : ''}
      <div class="card"><div class="an-ch"><span class="an-tag">Tendencia de peso</span><span class="small muted">últimas 3 semanas</span></div>
        <div class="an-stack">${seg}</div>
        <ul class="an-lgd an-lgd-b">${An.TREND_ORDER.map((x) => `<li><button type="button" class="an-lgd-btn" data-trend="${x}" aria-haspopup="dialog" aria-label="${tr[x]} ${esc(An.TREND_TEXT[x])}. Ver quiénes"><i class="tr-${x}" aria-hidden="true"></i><span><b>${tr[x]}</b> ${An.TREND_TEXT[x]}</span><span class="an-lgd-go" aria-hidden="true">›</span></button></li>`).join('')}</ul>
        <p class="small muted an-note">Bajando o subiendo: cambio de ${num(An.STALL_KG)} kg o más en el promedio semanal; estancado: menos que eso durante 3 semanas o más. Es una tendencia, no una evaluación.</p></div>
      <div class="card an-att"><div class="an-ch"><span class="an-tag w">Necesitan atención · ${att.length}</span><button type="button" class="btn-link" id="an-ver-todos">Ver todos ›</button></div>
        ${att.length ? `<ul class="an-list">${att.slice(0, 5).map((r) => `<li><button type="button" class="an-li" data-open="${esc(r.clientId)}" aria-label="${esc(r.name)}: ${esc(r.label)}, ${esc(r.reason)}. Abrir su ficha"><span class="an-av ${TONE[r.level]}" aria-hidden="true">${esc(initials(r.name))}</span><span class="an-li-t"><b>${esc(r.name)}</b><small>${esc(r.reason)}</small></span><span class="an-pill ${TONE[r.level]}">${esc(r.label)}</span></button></li>`).join('')}</ul>` : '<p class="small muted">Nadie necesita atención ahora.</p>'}
      </div><p class="small muted an-note">${tot} asesorado${tot === 1 ? '' : 's'} con vínculo activo. Solo cuenta lo que cada uno te comparte.</p>`;
  }
  // Lista de UNA categoría de la tendencia: nombre, iniciales, cambio del promedio semanal y último pesaje. Tocar una fila abre la ficha.
  // Las cifras salen de grasa.coach_analytics (permisos y sin pause_private) y la fecha, de lo que la lista del coach ya descargó.
  let stOpener = null;
  function openTrend(kind) {
    if (!An.TREND_ORDER.includes(kind)) return;
    const list = people(), names = Object.fromEntries(list.map((x) => [x.clientId, x.name]));
    const last = Object.fromEntries(list.map((x) => [x.clientId, An.lastWeigh(x.state && x.state.entries)]));
    const ppl = An.trendPeople(AN.rows || [], kind, { names, last });
    const known = new Set(list.map((x) => x.clientId));
    const tone = { bajando: 't', estancado: 'p', subiendo: 'w', sin_datos: 'g' }[kind];
    $('#st-title').textContent = `${An.TREND_TITLE[kind]} · ${ppl.length}`;
    $('#st-sub').textContent = kind === 'sin_datos' ? 'No hay pesajes suficientes en las últimas semanas para ver una tendencia.' : 'Cambio del promedio semanal de peso en las últimas semanas. Toca una persona para abrir su ficha.';
    $('#st-list').innerHTML = ppl.length ? ppl.map((x) => {
      const can = known.has(x.clientId);
      return `<li><button type="button" class="an-li st-li" data-st-open="${esc(x.clientId)}"${can ? '' : ' disabled'} aria-label="${esc(x.name)}: ${esc(x.change)}. ${esc(x.lastText)}.${can ? ' Abrir su ficha' : ''}"><span class="an-av ${tone}" aria-hidden="true">${esc(initials(x.name))}</span><span class="an-li-t"><b>${esc(x.name)}</b><small>${esc(x.lastText)}</small></span><span class="an-pill st-pill ${tone}">${esc(x.change)}</span>${can ? '<span class="an-lgd-go" aria-hidden="true">›</span>' : ''}</button></li>`;
    }).join('') : '<li class="small muted">Nadie en este grupo ahora.</li>';
    $('#st-rule').textContent = `Bajando o subiendo: cambio de ${num(An.STALL_KG)} kg o más en el promedio semanal; estancado: menos que eso durante 3 semanas o más. Es una tendencia, no una evaluación.`;
    stOpener = kind;
    $('#sheet-tend').showModal();
    $('#st-title').focus();
  }
  function wireTrend() {
    const d = $('#sheet-tend');
    $('#st-close').addEventListener('click', () => d.close());
    d.addEventListener('click', (ev) => {
      if (ev.target === d) { d.close(); return; }   // toque en el fondo
      const b = ev.target.closest('[data-st-open]');
      if (!b || b.disabled) return;
      stOpener = null;
      d.close();
      PGCoachPanel.open(b.dataset.stOpen);
    });
    // Esc cierra (lo hace el propio <dialog>); el foco vuelve a la categoría que se tocó.
    // (si se tocó la barra, el foco va a la leyenda de esa categoría, que es el control del teclado)
    d.addEventListener('close', () => {
      const k = stOpener; stOpener = null;
      const t = k && document.querySelector(`#an-resumen .an-lgd-btn[data-trend="${k}"]`);
      if (t) { try { t.focus(); } catch { /* sin foco */ } }
    });
  }
  // «Necesitan atención» = el semáforo de la Etapa 1 (Coach.atencion) + el aviso de dolor sin revisar.
  function attention(list) {
    const out = [];
    for (const x of list) {
      const at = Coach.atencion(x.state, { today: todayBo(), shares: x.info.shares || {} });
      let { level, label, reason } = at;
      if (x.info.painReported && level === 'aldia') { level = 'revisar'; label = 'Revisar'; reason = `Reportó dolor · ${An.dm(x.info.painReported)}`; }
      else if (x.info.painReported) reason += ` · reportó dolor`;
      if (level !== 'aldia') out.push({ clientId: x.clientId, name: x.name, level, label, reason, days: at.days });
    }
    return out.sort((a, b) => Coach.byAtencion(a, b));
  }
  function rankingHtml(p, rows, names, list) {
    const goals = Object.fromEntries(list.map((x) => [x.clientId, x.info.goals || {}]));
    const anyGoal = list.some((x) => An.hasGoals(x.info.goals) && (typeof x.info.goals.weight_kg === 'number' || typeof x.info.goals.waist_cm === 'number'));
    if (AN.by === 'meta' && !anyGoal) AN.by = 'constancia';
    const r = An.ranking(rows, AN.by, { period: p, names, goals });
    const chip = (k, t, dis) => `<button type="button" data-by="${k}" aria-pressed="${AN.by === k}"${dis ? ' disabled aria-describedby="an-meta-off"' : ''}>${t}</button>`;
    const li = (x) => `<li class="rk-li"><span class="rk-n${x.rank <= 3 ? ' top' : ''}" aria-hidden="true">${x.rank}</span><span class="an-av ${x.tone === 'w' ? 'w' : x.tone === 'r' ? 'r' : 't'}" aria-hidden="true">${esc(initials(x.name))}</span>
      <span class="rk-t"><span class="rk-top"><b>${esc(x.name)}</b><b class="rk-v">${esc(x.label)}</b></span><span class="rk-bar ${x.tone}" role="progressbar" aria-label="${esc(x.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${x.pct || 0}"><i style="width:${Math.max(2, x.pct || 0)}%"></i></span><small>${esc(x.sub)}</small></span><span class="sr-only">Puesto ${x.rank}</span></li>`;
    const apart = r.apart.length ? `<p class="small muted rk-apart">${AN.by === 'meta' ? 'Sin meta fijada' : 'Sin puesto'}: ${r.apart.map((a) => `${esc(a.name)}${AN.by === 'meta' ? '' : ` (${esc(a.why)})`}`).join(', ')}${AN.by === 'meta' ? ' · <button type="button" class="btn-link" data-fijar="' + esc(r.apart[0].clientId) + '">Fijar meta ›</button>' : ''}</p>` : '';
    return `<p class="an-banner" id="an-rk-label"><span aria-hidden="true">👁</span><span><b>Solo tú lo ves.</b> Tus asesorados nunca ven un ranking.</span></p>
      <p class="small muted rk-by-l">Ordenar por</p>
      <div class="an-chips" role="group" aria-label="Ordenar por">${chip('meta', 'Progreso a la meta', !anyGoal)}${chip('constancia', 'Constancia')}${chip('entrenos', 'Entrenos')}</div>
      ${anyGoal ? '' : '<p class="small muted" id="an-meta-off">Progreso a la meta: Disponible cuando fijes metas (de peso o de cintura).</p>'}
      <p class="small muted">${esc(AN.by === 'meta' ? 'Avance desde su primera medida hacia la meta que fijaste.' : p.mode === 'mes' ? `Este mes (${p.label})` : `Últimos 7 días (${p.label})`)}</p>
      ${r.ranked.length ? `<ol class="card rk-list" aria-label="Ranking privado">${r.ranked.map(li).join('')}</ol>` : '<div class="card"><p class="small muted">Nadie entra en este orden todavía.</p></div>'}${apart}`;
  }
  function wireAnalitica() {
    const v = $('#view-analitica');
    v.addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-atab]'); if (t) { AN.tab = t.dataset.atab; renderAnalitica(); return; }
      const pe = ev.target.closest('[data-per]'); if (pe) { AN.per = pe.dataset.per; renderAnalitica(); return; }
      const by = ev.target.closest('[data-by]'); if (by && !by.disabled) { AN.by = by.dataset.by; renderAnalitica(); const nb = v.querySelector(`[data-by="${AN.by}"]`); if (nb) nb.focus(); return; }
      const tg = ev.target.closest('[data-trend]'); if (tg) { openTrend(tg.dataset.trend); return; }
      const o = ev.target.closest('[data-open]'); if (o) { PGCoachPanel.open(o.dataset.open); return; }
      const f = ev.target.closest('[data-fijar]'); if (f) { if (PGCoachPanel.open(f.dataset.fijar)) { setFtab('metas'); openGoals(); } return; }
      if (ev.target.closest('#an-ver-todos')) $('#tab-coach').click();
    });
    $('#tab-analitica').addEventListener('click', () => { AN.data = {}; renderAnalitica(true); $('#analitica-title').focus({ preventScroll: true }); });
    document.addEventListener('pg:goals-changed', () => { if (v.classList.contains('active')) renderAnalitica(); });
  }

  // ================= Ficha: pestañas Resumen · Gráficas · Metas · Comidas =================
  const FC = { tab: 'resumen', metric: 'peso', gran: 'semanas', cmp: null };
  function setFtab(t) {
    FC.tab = t;
    $('#coach-detail-view').dataset.ftab = t;
    for (const b of document.querySelectorAll('#fc-tabs [data-ftab]')) b.setAttribute('aria-selected', String(b.dataset.ftab === t));
    renderFicha();
  }
  const cur = () => (window.PGCoachPanel ? PGCoachPanel.current() : null);
  function renderFicha() {
    const c = cur();
    if (!c) return;
    if (FC.tab === 'graficas') $('#fc-graficas').innerHTML = graficasHtml(c);
    if (FC.tab === 'metas') $('#fc-metas').innerHTML = metasCoachHtml(c);
  }
  const METRIC_LABEL = { peso: 'Peso', cintura: 'Cintura', proteina: 'Proteína', entrenos: 'Entrenos', constancia: 'Constancia' };
  function graficasHtml(c) {
    const sh = c.info.shares || {}, g = c.info.goals || {}, today = todayBo();
    const ser = An.series(c.state, FC.metric, FC.gran, today, sh);
    const goal = { peso: g.weight_kg, cintura: g.waist_cm, proteina: g.protein_g, entrenos: FC.gran === 'semanas' ? g.trained_days : undefined }[FC.metric];
    const unit = { peso: 'kg', cintura: 'cm', proteina: 'g', entrenos: '', constancia: 'días' }[FC.metric];
    const nPts = ser.points ? ser.points.filter((x) => x.value != null).length : 0;
    let chart;
    if (ser.notShared) chart = `<p class="small muted ch-empty">${esc(c.name)} no comparte ${FC.metric === 'proteina' ? 'sus comidas' : 'sus hábitos'}.</p>`;
    else if (FC.metric === 'entrenos' || FC.metric === 'constancia') chart = barChart({ values: ser.points.map((x) => x.value), labels: ser.points.map((x, i) => (i === ser.points.length - 1 ? 'hoy' : i % 3 === 0 ? x.label : '')), goal: typeof goal === 'number' ? goal : null, h: 120, aria: `${METRIC_LABEL[FC.metric]} por ${FC.gran === 'semanas' ? 'semana' : 'mes'}`, tone: FC.metric === 'constancia' ? 'p' : 't' });
    else chart = lineChart({ points: ser.points.map((x) => ({ label: x.label, value: x.value })), goal: typeof goal === 'number' ? goal : null, goalLabel: typeof goal === 'number' ? `Meta ${num(goal)} ${unit}` : '', unit, aria: `${METRIC_LABEL[FC.metric]}, promedio por ${FC.gran === 'semanas' ? 'semana' : 'mes'}` });
    const cmp = An.compare(c.state, FC.gran, today, sh, g, FC.cmp);
    const w = An.series(c.state, 'entrenos', 'semanas', today, sh), d = An.series(c.state, 'constancia', 'semanas', today, sh);
    const last7 = (s) => s.points.slice(-7).map((x) => x.value);
    const lbl7 = ['', '', '', '', '', '', 'hoy'];
    return `<div class="an-chips fc-metric" role="group" aria-label="Qué ver">${Object.keys(METRIC_LABEL).map((k) => `<button type="button" data-metric="${k}" aria-pressed="${FC.metric === k}">${METRIC_LABEL[k]}</button>`).join('')}</div>
      <div class="card"><div class="an-row"><div class="an-seg an-sm" role="group" aria-label="Agrupar por"><button type="button" data-gran="semanas" aria-pressed="${FC.gran === 'semanas'}">Semanas</button><button type="button" data-gran="meses" aria-pressed="${FC.gran === 'meses'}">Meses</button></div><span class="small muted">${nPts} ${FC.gran === 'semanas' ? (nPts === 1 ? 'semana' : 'semanas') : (nPts === 1 ? 'mes' : 'meses')}</span></div>
        ${chart}
        ${ser.notShared ? '' : `<ul class="an-lgd"><li><i class="tr-bajando" aria-hidden="true"></i>${FC.metric === 'entrenos' ? 'Entrenos' : FC.metric === 'constancia' ? 'Días con registro' : FC.gran === 'semanas' ? 'Promedio semanal' : 'Promedio mensual'}</li>${typeof goal === 'number' ? '<li><i class="lg-dash" aria-hidden="true"></i>Meta que fijaste</li>' : ''}</ul>`}</div>
      <div class="card fc-cmp"><div class="an-ch"><span class="an-tag">Comparar ${FC.gran === 'semanas' ? 'semanas' : 'meses'}</span>
        <label class="sr-only" for="fc-cmp-pick">Qué comparar</label><select id="fc-cmp-pick" class="fc-cmp-pick">${cmp.options.map((o) => `<option value="${o.index}"${o.index === cmp.index ? ' selected' : ''}>${esc(o.label)} vs. anterior</option>`).join('')}</select></div>
        <div class="table-wrap"><table class="an-tbl"><thead><tr><th scope="col"><span class="sr-only">Dato</span></th><th scope="col">${esc(cmp.a.long)}</th><th scope="col">${esc(cmp.b.long)}</th><th scope="col">Cambio</th></tr></thead>
        <tbody>${cmp.rows.map((r) => `<tr><th scope="row">${esc(r.label)}</th><td>${esc(r.a)}</td><td>${esc(r.b)}</td><td class="${r.color}">${esc(r.change)}${r.color ? `<span class="sr-only">${r.color === 'up' ? ', hacia la meta que fijaste' : ', se aleja de la meta que fijaste'}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>
        ${An.hasGoals(g) ? '<p class="small muted an-note">Turquesa: va hacia la meta que fijaste; naranja: se aleja. Sin meta, el cambio va sin color.</p>' : ''}</div>
      <div class="an-two">
        <div class="card"><p class="an-tag">Entrenos / semana</p>${w.notShared ? '<p class="small muted">No comparte sus hábitos.</p>' : barChart({ values: last7(w), labels: lbl7, goal: typeof g.trained_days === 'number' ? g.trained_days : null, max: Math.max(3, (g.trained_days || 0) + 1, ...last7(w).filter((v) => v != null)), h: 90, w: 160, aria: 'Entrenos por semana, últimas 7' })}${typeof g.trained_days === 'number' && !w.notShared ? `<p class="small muted">- - - meta de ${g.trained_days} que fijaste</p>` : ''}</div>
        <div class="card"><p class="an-tag">Días con registro</p>${barChart({ values: last7(d), labels: lbl7, max: 7, h: 90, w: 160, tone: 'p', aria: 'Días con registro por semana, últimas 7' })}</div>
      </div>`;
  }
  const GOAL_TEXT = { weight_kg: (v) => `${num(v)} kg`, waist_cm: (v) => `${num(v)} cm`, protein_g: (v) => `~${v} g al día`, water_days: (v) => `${v} días a la semana`, steps_days: (v) => `${v} días a la semana`, sleep_days: (v) => `${v} noches a la semana`, trained_days: (v) => `${v} días a la semana` };
  function metasCoachHtml(c) {
    const g = c.info.goals || {};
    const rows = An.GOAL_FIELDS.map((f) => `<li><span>${esc(f.label)}</span><b>${typeof g[f.key] === 'number' ? esc(GOAL_TEXT[f.key](g[f.key])) : '<span class="muted">Sin meta</span>'}</b></li>`).join('');
    return `<div class="card"><p class="an-tag">Metas de ${esc(c.name.split(/\s+/)[0])}</p><ul class="fc-goals">${rows}</ul>
      <button type="button" class="btn btn-tall" id="btn-fijar-metas">${An.hasGoals(g) ? 'Cambiar metas' : 'Fijar metas'}</button>
      <p class="small muted an-note">Todo es opcional. Lo que dejes vacío no le aparece a ${esc(c.name.split(/\s+/)[0])}. La app no sugiere números.</p></div>`;
  }
  // ---- Hoja «Fijar metas» (M2) ----
  function openGoals() {
    const c = cur();
    if (!c) return;
    const g = c.info.goals || {};
    const w = (c.state.entries || []).filter((e) => typeof e.weight === 'number').sort((a, b) => a.date.localeCompare(b.date)).pop();
    const wa = (c.state.entries || []).filter((e) => typeof e.waist === 'number').sort((a, b) => a.date.localeCompare(b.date)).pop();
    const SUB = { weight_kg: w ? `Hoy ${num(w.weight)} kg` : 'Sin medidas aún', waist_cm: wa ? `Hoy ${num(wa.waist)} cm` : 'Sin medidas aún', protein_g: 'Promedio diario',
      water_days: 'Días que cumple su meta de vasos', steps_days: 'Días que cumple su meta de pasos', sleep_days: 'Noches de 7 h o más', trained_days: 'Por semana' };
    const field = (f) => `<div class="sm-f"><label for="sm-${f.key}"><span>${esc(f.label)}</span><small>${esc(SUB[f.key])}</small></label>
      <span class="sm-in"><input id="sm-${f.key}" name="${f.key}" inputmode="${f.dec ? 'decimal' : 'numeric'}" autocomplete="off" placeholder="—" value="${typeof g[f.key] === 'number' ? esc(String(g[f.key]).replace('.', ',')) : ''}"><span class="muted">${esc(f.unit)}</span></span></div>`;
    $('#sm-fields').innerHTML = `<p class="an-tag muted-tag">Medidas</p>${An.GOAL_FIELDS.slice(0, 3).map(field).join('')}<p class="an-tag muted-tag">Hábitos de la semana</p>${An.GOAL_FIELDS.slice(3).map(field).join('')}`;
    $('#sm-title').textContent = `Fijar metas de ${c.name.split(/\s+/)[0]}`;
    $('#sm-error').classList.add('hidden');
    $('#sheet-metas').showModal();
    $('#sm-title').focus();
  }
  async function saveGoals(ev) {
    ev.preventDefault();
    const c = cur(), A = acc();
    if (!c || !A) return;
    const form = Object.fromEntries(An.GOAL_FIELDS.map((f) => [f.key, $('#sm-' + f.key).value]));
    const r = An.parseGoals(form);
    const err = $('#sm-error');
    if (!r.ok) { err.textContent = Object.values(r.errors).join(' '); err.classList.remove('hidden'); $('#sm-' + Object.keys(r.errors)[0]).focus(); return; }
    $('#sm-save').disabled = true;
    try {
      const out = await A.remote.coach.setGoals(c.clientId, r.goals);
      PGCoachPanel.setInfo(c.clientId, { goals: out.goals, proteinGoal: out.goals.protein_g == null ? null : out.goals.protein_g });
      $('#sheet-metas').close();
      renderFicha();
      PGCoachPanel.toast(An.hasGoals(out.goals) ? 'Metas guardadas' : 'Metas quitadas');
      document.dispatchEvent(new CustomEvent('pg:goals-changed'));
      const b = $('#btn-fijar-metas'); if (b) b.focus();
    } catch (e) { err.textContent = A.errorText(e, 'coach'); err.classList.remove('hidden'); }
    finally { $('#sm-save').disabled = false; }
  }
  function wireFicha() {
    $('#fc-tabs').addEventListener('click', (ev) => { const b = ev.target.closest('[data-ftab]'); if (b) { setFtab(b.dataset.ftab); b.focus(); } });
    $('#fc-graficas').addEventListener('click', (ev) => {
      const m = ev.target.closest('[data-metric]'); if (m) { FC.metric = m.dataset.metric; renderFicha(); const n = $(`#fc-graficas [data-metric="${FC.metric}"]`); if (n) n.focus(); return; }
      const g = ev.target.closest('[data-gran]'); if (g) { FC.gran = g.dataset.gran; FC.cmp = null; renderFicha(); const n = $(`#fc-graficas [data-gran="${FC.gran}"]`); if (n) n.focus(); }
    });
    $('#fc-graficas').addEventListener('change', (ev) => { if (ev.target.id === 'fc-cmp-pick') { FC.cmp = Number(ev.target.value); renderFicha(); $('#fc-cmp-pick').focus(); } });
    $('#fc-metas').addEventListener('click', (ev) => { if (ev.target.closest('#btn-fijar-metas')) openGoals(); });
    $('#form-metas').addEventListener('submit', saveGoals);
    for (const id of ['#sm-cancel', '#sm-close']) $(id).addEventListener('click', () => $('#sheet-metas').close());
    $('#sheet-metas').addEventListener('click', (ev) => { if (ev.target === ev.currentTarget) ev.currentTarget.close(); });
    document.addEventListener('pg:coach-client-open', () => { FC.cmp = null; setFtab('resumen'); });
    // La meta de proteína de la Etapa 2 (pantalla «Meta de proteína») y estas metas son el MISMO dato: se refresca al volver.
    document.addEventListener('pg:ficha-bar', () => renderFicha());
  }

  // ================= M10: aviso de la plataforma arriba de la lista del coach; días en que abrió el panel; coach suspendido =================
  const CLOSED_KEY = (window.PGNS ? PGNS.key('avisos-cerrados') : 'pg-avisos-cerrados');
  const PANEL_KEY = (window.PGNS ? PGNS.key('panel-dia') : 'pg-panel-dia');
  const closed = () => { try { const x = JSON.parse(store.get(CLOSED_KEY) || '[]'); return Array.isArray(x) ? x : []; } catch { return []; } };
  let notices = [];
  function renderNotices() {
    const box = $('#coach-avisos');
    const off = new Set(closed());
    const list = notices.filter((n) => !off.has(n.id));
    box.innerHTML = list.map((n) => `<section class="pa-card" aria-label="Aviso de la plataforma: ${esc(n.title)}"><div class="pa-top"><p class="pa-tag">Aviso de la plataforma</p><button type="button" class="pa-x" data-close-aviso="${esc(n.id)}" aria-label="Cerrar el aviso «${esc(n.title)}»">×</button></div><b>${esc(n.title)}</b><p>${esc(n.body)}</p></section>`).join('');
  }
  async function coachExtras() {
    const A = acc();
    if (!A || !isCoach()) return;
    let mine = null;
    try { mine = await A.remote.coach.myCoach(); } catch { return; }
    const susp = !!mine && mine.active === false;
    $('#coach-suspendido').classList.toggle('hidden', !susp);
    if (susp) { notices = []; renderNotices(); return; }
    const day = todayLocal();
    if (store.get(PANEL_KEY) !== day) { try { await A.remote.coach.panelOpened(day); store.set(PANEL_KEY, day); } catch { /* sin conexión: se intenta la próxima vez */ } }
    try { notices = await A.remote.coach.notices(day); } catch { notices = []; }
    renderNotices();
  }
  function wireNotices() {
    $('#coach-avisos').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-close-aviso]');
      if (!b) return;
      const ids = closed(); ids.push(b.dataset.closeAviso);
      store.set(CLOSED_KEY, JSON.stringify(ids.slice(-50)));
      renderNotices();
      $('#coach-title-list').focus();
    });
    $('#tab-coach').addEventListener('click', coachExtras);
    document.addEventListener('pg:account-changed', (ev) => { if (ev.detail && ev.detail.isCoach) coachExtras(); });
  }

  // ================= M1: Progreso → Metas del asesorado =================
  const myGoals = () => { const A = acc(); const m = A && A.meta(); return (m && m.link && m.link.goals) || {}; };
  window.PGMetas = { has: () => !isCoach() && An.hasGoals(myGoals()) };
  function progSeg(active) {
    return `<nav class="prog-seg" aria-label="Progreso">${[['metas', 'Metas'], ['progreso:medidas', 'Medidas'], ['fotos', 'Fotos'], ['insignias', 'Insignias']]
      .map(([v, t]) => `<button type="button" data-goto="${v}"${v === active ? ' aria-current="page" class="on"' : ''}>${t}</button>`).join('')}</nav>`;
  }
  function syncProgSeg() {
    const nav = document.querySelector('#view-progreso > .prog-seg');
    if (!nav) return;
    const has = window.PGMetas.has();
    let b = nav.querySelector('[data-goto="metas"]');
    if (has && !b) { b = document.createElement('button'); b.type = 'button'; b.dataset.goto = 'metas'; b.textContent = 'Metas'; nav.prepend(b); }
    if (!has && b) b.remove();
  }
  function renderMetas() {
    syncProgSeg();
    const v = $('#view-metas');
    if (!v.classList.contains('active')) return;
    const st = window.PGNav && PGNav.state ? PGNav.state() : null;
    const m = An.metas(st || { entries: [], foods: {}, habits: {} }, myGoals(), todayLocal());
    const foot = $('#metas-foot');
    foot.textContent = m.any ? An.GOALS_FOOTER : '';
    foot.classList.toggle('hidden', !m.any);
    if (!m.any) { $('#metas-cards').innerHTML = progSeg('metas') + '<div class="card"><p class="small muted">Tu coach todavía no fijó metas.</p></div>'; return; }
    const card = (x) => {
      if (x.key === 'peso') {
        const pr = x.progress;
        return `<div class="card an-glow mt-peso"><div class="an-ch"><span class="an-tag">Peso · tendencia de 7 días</span>${pr && !pr.reached ? `<span class="an-pill">faltan ${num(pr.left)} kg</span>` : pr && pr.reached ? '<span class="an-pill">meta alcanzada</span>' : ''}</div>
          <p class="mt-big"><b>${num(x.now)}</b> kg · meta ${num(x.goal)} kg</p>
          ${lineChart({ points: x.series.slice(-11).map((p) => ({ label: p.label, value: p.value })), goal: x.goal, goalLabel: `Meta ${num(x.goal)}`, unit: 'kg', aria: 'Tu peso, promedio por semana' })}
          ${pr ? `<div class="mt-prog"><span class="rk-bar t" role="progressbar" aria-label="Camino hacia la meta de peso" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pr.pct}"><i style="width:${Math.max(2, pr.pct)}%"></i></span><span class="small muted">${pr.pct} % del camino</span></div>` : ''}</div>`;
      }
      if (x.key === 'cintura') {
        const pr = x.progress;
        return `<div class="card"><p class="an-tag">Cintura</p><p class="mt-big"><b>${num(x.now)}</b> cm</p><p class="small muted">Meta ${num(x.goal)} cm${pr && !pr.reached ? ` · <b class="mt-left">faltan ${num(pr.left)}</b>` : pr && pr.reached ? ' · meta alcanzada' : ''}</p>
          ${pr ? `<span class="rk-bar t" role="progressbar" aria-label="Camino hacia la meta de cintura" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pr.pct}"><i style="width:${Math.max(2, pr.pct)}%"></i></span>` : ''}</div>`;
      }
      if (x.key === 'proteina') {
        return `<div class="card"><p class="an-tag">Proteína · semana</p><p class="mt-big"><b>${x.now == null ? '—' : '~' + x.now}</b> g/día</p><p class="small muted">Meta ~${x.goal} g · promedio${x.days ? ` de ${x.days} ${x.days === 1 ? 'día' : 'días'} con comidas` : ''}</p>
          <span class="rk-bar w" role="progressbar" aria-label="Proteína promedio frente a la meta" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${x.pct}"><i style="width:${Math.max(2, x.pct)}%"></i></span></div>`;
      }
      return `<div class="card"><div class="an-ch"><span class="an-tag">Hábitos · esta semana</span><span class="small muted">${esc(x.label)}</span></div>
        <ul class="mt-rings">${x.rings.map((r) => `<li>${ring(r.pct, { size: 64, stroke: 7, cls: { water: 't', steps: 'w', sleep: 'p', trained: 't' }[r.key] })}<b>${r.done} / ${r.goal}${r.met ? ' ✓' : ''}</b><small>${esc(r.label)}</small></li>`).join('')}</ul></div>`;
    };
    const two = m.cards.filter((x) => x.key === 'cintura' || x.key === 'proteina');
    $('#metas-cards').innerHTML = progSeg('metas') + m.cards.filter((x) => x.key === 'peso').map(card).join('')
      + (two.length ? `<div class="an-two">${two.map(card).join('')}</div>` : '') + m.cards.filter((x) => x.key === 'habitos').map(card).join('');
  }

  // ================= Arranque =================
  function start() {
    wireAnalitica();
    wireTrend();
    wireFicha();
    wireNotices();
    document.addEventListener('pg:view', (ev) => { const v = ev.detail && ev.detail.view; if (v === 'metas' || v === 'progreso') renderMetas(); });
    document.addEventListener('pg:link-changed', () => { syncProgSeg(); renderMetas(); });
    document.addEventListener('pg:account-changed', () => syncProgSeg());
    syncProgSeg();
  }
  start();
})();
