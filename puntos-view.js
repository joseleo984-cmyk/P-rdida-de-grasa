// v1.15 · Vistas de los PUNTOS DE CONSTANCIA y de la META COLECTIVA DEL TEAM (concepto jurídico 7, puntos 7 y 10; propuesta de gamificación aprobada).
//   · Asesorado: una línea en Inicio («34 puntos esta semana · +8 hoy»), Progreso → Puntos (semana, hoy, 8 semanas comparadas SOLO consigo misma,
//     nivel, cómo se ganan), la barra común de la meta del team (Inicio y Puntos) y Más → «Puntos y meta del team» (ocultar sus puntos y el opt-out).
//   · Coach: Más → Retos → «Meta del team» (crear, cambiar o quitar la de esta semana; ve el total y cuántos suman, nunca el aporte de nadie).
// Los puntos los CALCULA EL SERVIDOR (grasa.my_points / coach_points / team_goal_out); aquí solo se muestran. Nada de otra persona llega al asesorado:
// la meta del team es una suma con mínimo 5 participantes. «Ocultar mis puntos» se recuerda en este teléfono (por cuenta); el opt-out, en el servidor.
// Todo lo que escribe otra persona entra escapado. Nada de esto existe sin el producto «coach» ni sin servidor (PGAccount).
(function () {
  'use strict';
  const PROD = window.Producto || { coach: false };
  if (!PROD.coach || !window.Puntos) return;
  const P = window.Puntos;
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
  const dm = (iso) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
  const HIDE_KEY = window.PGNS ? PGNS.key('puntos-ocultos') : 'perdida-grasa:puntos-ocultos';
  let A = null;
  let mine = null, team = null, coachTeam = null, coachMetric = 'entrenos';

  const meta = () => (A && A.meta()) || {};
  const isClient = () => { const m = meta(); return !!(m.userId && m.link && !(m.roles || []).includes('coach')); };
  const isCoach = () => document.body.classList.contains('mode-coach');
  const errText = (err) => (A && A.errorText ? A.errorText(err, 'coach') : 'No se pudo conectar con el servidor.');
  const hiddenList = () => { try { const v = JSON.parse(localStorage.getItem(HIDE_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
  const isHidden = () => !!meta().userId && hiddenList().includes(meta().userId);
  function setHidden(on) {
    const id = meta().userId;
    if (!id) return;
    const l = hiddenList().filter((x) => x !== id);
    if (on) l.push(id);
    try { localStorage.setItem(HIDE_KEY, JSON.stringify(l.slice(-20))); } catch { /* sin almacenamiento: vuelven a verse */ }
  }
  function toast(msg, error) {
    const t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.toggle('error', !!error);
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), error ? 4000 : 2600);
  }

  // ======================= Asesorado =======================
  let loading = null;
  async function loadMine() {
    if (!A || !isClient() || isCoach()) { mine = null; team = null; renderClient(); return; }
    if (loading) return loading.then(() => loadMine());   // lo que se pidió mientras cargaba se vuelve a pedir (puede haber llegado un registro nuevo)
    loading = (async () => {
      try { mine = await A.remote.client.myPoints(); } catch { /* sin conexión o SQL viejo: se queda lo último */ }
      try { team = await A.remote.client.myTeamGoal(); } catch { /* idem */ }
      renderClient();
    })().finally(() => { loading = null; });
    return loading;
  }
  // Barra común (Inicio, Puntos y la vista del coach): título, barra y «N de M · K personas sumando», o «se activa con 5 o más».
  function teamHtml(g, { coach = false } = {}) {
    const t = P.teamLine(g);
    if (!t) return '';
    const bar = t.published ? `<span class="rk-bar t team-bar" role="progressbar" aria-label="Avance de la meta del team" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${t.pct}"><i style="width:${Math.max(2, t.pct)}%"></i></span>` : '';
    const out = g.optedOut ? '<p class="small muted team-out">No estás sumando lo tuyo a esta meta (Más → Puntos y meta del team).</p>' : '';
    const foot = coach ? 'Tus asesorados ven solo este total y cuántos suman; nadie ve el aporte de cada persona.' : 'Solo se ve el total del team: nadie ve cuánto suma cada persona.';
    return `<p class="team-title">${esc(t.title)}</p>${bar}<p class="small team-line">${esc(t.text)}${t.done ? ' · ¡Meta cumplida!' : ''}</p>${out}<p class="small muted team-foot">${esc(foot)}</p>`;
  }
  function renderClient() {
    const show = !!mine && isClient() && !isCoach();
    const hid = isHidden();
    const home = $('#home-puntos');
    if (home) {
      home.classList.toggle('hidden', !show || hid);
      home.textContent = show ? `${P.homeLine(mine)} ›` : '';
      home.setAttribute('aria-label', show ? `${P.homeLine(mine)}. Ver mis puntos` : '');
    }
    const hasTeam = !!team && !team.none && isClient() && !isCoach();
    const ht = $('#home-team');
    if (ht) { ht.classList.toggle('hidden', !hasTeam); $('#home-team-box').innerHTML = hasTeam ? teamHtml(team) : ''; }
    const pt = $('#puntos-team');
    if (pt) { pt.classList.toggle('hidden', !hasTeam); $('#puntos-team-box').innerHTML = hasTeam ? teamHtml(team) : ''; }
    renderView();
    renderAj();
    // Insignias v4: «Equipo» (logros-view.js) mira si esta semana el team cumplió y la persona sumó. Solo el agregado y lo propio.
    if (show) document.dispatchEvent(new CustomEvent('pg:puntos', { detail: { mine, team } }));
  }
  function renderView() {
    const body = $('#puntos-body');
    if (!body) return;
    $('#pt-rules-list').innerHTML = P.RULES.map(([t, v]) => `<li><span>${esc(t)}</span><b>${esc(v)}</b></li>`).join('');
    if (!isClient()) { body.innerHTML = '<div class="card"><p class="small muted">Los puntos de constancia aparecen cuando tienes coach y tu cuenta sincroniza.</p></div>'; return; }
    if (isHidden()) {
      body.innerHTML = `<div class="card pt-hidden"><p>Ocultaste tus puntos en este teléfono.</p><button type="button" class="btn btn-ghost btn-tall" id="pt-show">Mostrar mis puntos</button></div>`;
      return;
    }
    if (!mine) { body.innerHTML = '<div class="card"><p class="small muted">Cargando tus puntos…</p></div>'; return; }
    const p = mine;
    const lv = P.level(p.total);
    const detail = P.dayDetail(p, p.today);
    const chart = window.PGCharts ? PGCharts.barChart({ values: p.weeks.map((w) => w.points), labels: p.weeks.map((w, i) => (i === p.weeks.length - 1 ? 'esta' : i % 2 === 1 ? dm(w.start) : '')), h: 110,
      aria: `Tus puntos por semana: ${p.weeks.map((w) => `${dm(w.start)} ${w.points}`).join(', ')}`, tone: 't' }) : '';
    const cmp = P.selfCompare(p);
    body.innerHTML = `<div class="card an-glow pt-card">
        <p class="pt-big"><b id="pt-week">${p.week}</b> <span>${p.week === 1 ? 'punto' : 'puntos'} esta semana</span></p>
        <p class="small pt-today" id="pt-today">${p.todayPoints ? `+${p.todayPoints} hoy` : 'Hoy todavía no suma: un toque en «Mi día» ya cuenta.'}</p>
        ${p.paused ? '<p class="small pt-paused">Tus puntos y tu nivel están guardados. Vuelven a sumar cuando se reactive tu plan.</p>' : ''}
        <p class="small muted">Máximo 12 al día y 80 a la semana: hacer más no suma más.</p>
      </div>
      ${detail.length ? `<div class="card"><p class="an-tag">Hoy</p><ul class="pt-detail" id="pt-detail">${detail.map((x) => `<li><span>${esc(x.label)}</span><b>+${x.points}</b></li>`).join('')}</ul></div>` : ''}
      <div class="card"><div class="an-ch"><span class="an-tag">Tus semanas</span><span class="small muted">comparadas solo contigo</span></div>${chart}
        <p class="small" id="pt-cmp">${esc(cmp)}${p.best ? `${cmp ? ' · ' : ''}Tu mejor semana: ${p.best}` : ''}</p></div>
      <div class="card"><p class="an-tag">Tu nivel</p><p class="pt-level"><b>${esc(lv.name)}</b> · ${p.total} ${p.total === 1 ? 'punto' : 'puntos'} en total</p>
        ${lv.next ? `<span class="rk-bar t" role="progressbar" aria-label="Camino al nivel ${esc(lv.next)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${lv.pct}"><i style="width:${Math.max(2, lv.pct)}%"></i></span><p class="small muted">Faltan ${lv.toNext} para ${esc(lv.next)}</p>` : ''}</div>`;
  }
  function renderAj() {
    const h = $('#ajp-hide'), t = $('#ajp-team');
    if (!h || !t) return;
    h.checked = isHidden();
    const out = mine && mine.teamOptOut != null ? mine.teamOptOut : team ? !!team.optedOut : false;
    t.checked = !!out;
  }

  // ======================= Coach: meta del team en Retos =======================
  async function loadCoach() {
    const box = $('#rt-team-box');
    if (!box || !A || !isCoach()) return;
    try { coachTeam = await A.remote.coach.teamGoal(); renderCoach(); }
    catch (err) { box.innerHTML = `<p class="small muted">${esc(errText(err))}</p>`; }
  }
  function renderCoach(editing) {
    const box = $('#rt-team-box');
    if (!box) return;
    const g = coachTeam;
    if (g && !editing) {
      box.innerHTML = `${teamHtml(g, { coach: true })}${g.published ? '' : '<p class="small muted">Con menos de 5 personas sumando no se publica nada, ni a ti ni a tus asesorados.</p>'}
        <div class="rt-team-acts"><button type="button" class="btn btn-ghost btn-tall" id="rt-team-edit">Cambiar la meta</button><button type="button" class="btn btn-ghost btn-tall" id="rt-team-del">Quitar la meta</button></div>`;
      return;
    }
    if (g) coachMetric = g.metric;
    box.innerHTML = `<p class="small muted">Una meta común para la semana. Tus asesorados ven solo el total y cuántos suman, nunca el aporte de cada persona. Quien no comparte hábitos y comidas, está en pausa o decidió no sumar, no cuenta. Se publica con 5 o más personas.</p>
      <div class="an-chips" role="group" aria-label="Qué suma la meta">${[['entrenos', 'Entrenos'], ['puntos', 'Puntos']].map(([k, t]) => `<button type="button" data-tmetric="${k}" aria-pressed="${coachMetric === k}">${t}</button>`).join('')}</div>
      <label class="acc-label" for="rt-team-n">Entre todos, esta semana (${coachMetric === 'puntos' ? 'puntos' : 'entrenos'})</label>
      <input type="number" id="rt-team-n" min="1" max="${coachMetric === 'puntos' ? 20000 : 2000}" inputmode="numeric" value="${g ? g.target : ''}">
      <p id="rt-team-err" class="acc-error hidden" role="alert"></p>
      <button type="button" class="btn btn-tall" id="rt-team-save">Publicar meta</button>${g ? '<button type="button" class="btn btn-ghost btn-tall" id="rt-team-cancel">Cancelar</button>' : ''}`;
  }
  async function saveCoach() {
    const n = Number($('#rt-team-n').value);
    const err = $('#rt-team-err');
    const max = coachMetric === 'puntos' ? 20000 : 2000;
    if (!Number.isInteger(n) || n < 1 || n > max) { err.textContent = `Escribe un número entero de 1 a ${max.toLocaleString('es-CO')}.`; err.classList.remove('hidden'); $('#rt-team-n').focus(); return; }
    try {
      coachTeam = await A.remote.coach.setTeamGoal(coachMetric, n);
      renderCoach();
      toast('Meta del team publicada');
      const b = $('#rt-team-edit'); if (b) b.focus();
    } catch (e) { err.textContent = errText(e); err.classList.remove('hidden'); }
  }
  async function deleteCoach() {
    try { await A.remote.coach.deleteTeamGoal(); coachTeam = null; renderCoach(); toast('Quitamos la meta del team'); const b = $('#rt-team-n'); if (b) b.focus(); }
    catch (e) { toast(errText(e), true); }
  }

  // ======================= Arranque =======================
  function wire() {
    document.addEventListener('click', (ev) => {
      if (ev.target.closest('#pt-show')) { setHidden(false); renderClient(); $('#puntos-title').focus(); return; }
      const m = ev.target.closest('[data-tmetric]');
      if (m) { const v = $('#rt-team-n') ? $('#rt-team-n').value : ''; coachMetric = m.dataset.tmetric; renderCoach(true); $('#rt-team-n').value = v; const nb = $(`[data-tmetric="${coachMetric}"]`); if (nb) nb.focus(); return; }
      if (ev.target.closest('#rt-team-save')) { saveCoach(); return; }
      if (ev.target.closest('#rt-team-edit')) { renderCoach(true); $('#rt-team-n').focus(); return; }
      if (ev.target.closest('#rt-team-cancel')) { renderCoach(); return; }
      if (ev.target.closest('#rt-team-del')) deleteCoach();
    });
    $('#ajp-hide').addEventListener('change', (ev) => { setHidden(ev.target.checked); renderClient(); $('#ajp-status').textContent = ev.target.checked ? 'Listo: tus puntos quedan ocultos en este teléfono.' : 'Listo: vuelves a ver tus puntos.'; });
    $('#ajp-team').addEventListener('change', async (ev) => {
      const on = ev.target.checked;
      const st = $('#ajp-status');
      try {
        team = await A.remote.client.setTeamOptOut(on);
        if (mine) mine = { ...mine, teamOptOut: on };
        st.textContent = on ? 'Listo: lo tuyo ya no suma a la meta del team.' : 'Listo: lo tuyo vuelve a sumar a la meta del team.';
        renderClient();
      } catch (e) { ev.target.checked = !on; st.textContent = errText(e); }
    });
    document.addEventListener('pg:view', (ev) => {
      const v = ev.detail && ev.detail.view;
      if (v === 'panel' || v === 'puntos' || v === 'ajpuntos') loadMine();
      if (v === 'retos') loadCoach();
      if (v === 'puntos' || v === 'ajpuntos') renderClient();
    });
    document.addEventListener('pg:synced', () => { if (isClient()) loadMine(); });
    document.addEventListener('pg:account-changed', () => { mine = null; team = null; coachTeam = null; loadMine(); });
    document.addEventListener('pg:link-changed', () => loadMine());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') loadMine(); });
  }
  function start() {
    if (A || !window.PGAccount) return;
    A = window.PGAccount;
    wire();
    loadMine();
  }
  window.PGPuntos = { reload: () => loadMine(), reloadCoach: () => loadCoach(), state: () => ({ mine, team, coachTeam }) };
  if (window.PGAccount) start();
  else document.addEventListener('pg:account-ready', start);
})();
