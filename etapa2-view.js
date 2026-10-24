// UX Etapa 2 («App para coaches»): pantallas nuevas. Usa SOLO la API del contrato vía PGAccount (account.js) y la lógica pura de etapa2.js.
//   · Asesorado: pregunta de salud (L4 y embarazo/lactancia/posparto; imágenes A03/A03b) y tarjeta del reto de su coach en Inicio.
//   · Coach: Retos en 2 toques (C04) y meta orientativa de proteína por asesorado con vista previa (C05).
// Todo lo que escribe otra persona (nombres, títulos de retos, nombre comercial) entra al DOM escapado o con textContent.
// Sin servidor configurado (app oficial sin config de pruebas) no hay PGAccount y este archivo no hace nada. Nada de esto existe sin producto 'coach'.
(function () {
  'use strict';
  const PROD = window.Producto || { coach: false };
  if (!PROD.coach || !window.Etapa2) return;
  const E = window.Etapa2;
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toISO = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const today = () => toISO(new Date());
  const RETOS_KEY = PGNS.key('retos');   // último «mis retos» recibido (para verlo sin conexión)
  let A = null;

  function toast(msg, error) {
    const t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.toggle('error', !!error);
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), error ? 4000 : 2600);
  }
  const errText = (err, ctx) => (A && A.errorText ? A.errorText(err, ctx || 'coach') : 'No se pudo conectar con el servidor.');
  const meta = () => (A && A.meta()) || {};
  const isClient = () => { const m = meta(); return !!(m.userId && m.link && !(m.roles || []).includes('coach')); };
  const isCoach = () => (meta().roles || []).includes('coach');

  // ======================= Asesorado: pregunta de salud =======================
  let sq = null;   // { queue: ['condition', 'pregnancy'], i, answers: {}, manual }
  let asked = false;
  // No bloquea la app: mientras falte alguna respuesta, Inicio muestra una tarjeta que abre la pregunta (pantalla A03).
  async function maybeAsk() {
    if (!A || !isClient() || !window.ConsentTexts || !ConsentTexts.cloudAllowed(meta())) { renderSaludCard(); return; }
    if (!asked) {
      asked = true;
      try { A.setMeta({ health: await A.remote.client.myHealth() }); } catch { asked = false; /* sin conexión: se mira en otro momento */ }
    }
    renderSaludCard();
  }
  const pendingQs = () => { const h = meta().health; return h ? E.QUESTIONS.filter((q) => !h[q]) : []; };
  function renderSaludCard() {
    const card = $('#home-salud');
    if (card) card.classList.toggle('hidden', !(A && isClient() && pendingQs().length && window.ConsentTexts && ConsentTexts.cloudAllowed(meta())));
  }
  function openSalud(queue, answers, manual) {
    sq = { queue, i: 0, answers: { ...answers }, manual, sel: null };
    $('#salud-step').textContent = manual ? 'Tu salud' : 'Paso 2 de 3 · Tu salud';
    $('#salud-steps').classList.toggle('hidden', manual);
    document.body.classList.add('salud-open');
    $('#salud').classList.remove('hidden');
    renderSalud();
    $('#salud-title').focus();
  }
  function closeSalud() {
    sq = null;
    document.body.classList.remove('salud-open');
    $('#salud').classList.add('hidden');
    const t = document.querySelector('.tabbar button.on') || $('#tab-panel');
    if (t) t.focus();
  }
  function renderSalud() {
    const q = sq.queue[sq.i], T = E.HEALTH[q];
    if (sq.sel == null && sq.manual) sq.sel = sq.answers[q] || null;
    $('#salud-head').textContent = T.head;
    $('#salud-q').textContent = T.question;
    $('#salud-opts').innerHTML = E.OPTIONS.map(([k, l]) => `<button type="button" class="salud-opt" data-ans="${k}" aria-pressed="${sq.sel === k}">${esc(l)}</button>`).join('');
    $('#salud-opts').classList.toggle('has-sel', !!sq.sel);
    $('#salud-yes').textContent = T.yes;
    $('#salud-yes').classList.toggle('hidden', sq.sel !== 'yes');
    const ok = $('#btn-salud-ok');
    ok.disabled = !sq.sel;
    ok.textContent = sq.sel === 'yes' ? 'Entendido, continuar' : 'Continuar';
    $('#salud-error').classList.add('hidden');
  }
  async function saveSalud() {
    const q = sq.queue[sq.i], ans = sq.sel;
    if (!ans) return;
    const ok = $('#btn-salud-ok');
    ok.disabled = true;
    try {
      const textHash = await Remote.textHash(E.healthText(q, ans));
      await A.remote.client.setHealthAnswer(q, ans, { version: E.HEALTH[q].version, textHash });
      sq.answers[q] = ans;
      A.setMeta({ health: { ...(meta().health || {}), [q]: ans } });
    } catch (err) {
      const e = $('#salud-error');
      e.textContent = err && err.code === 'consent_required' ? 'Para guardar tu respuesta falta tu autorización de datos de salud (Más → Mis datos y permisos).' : 'No pudimos guardar tu respuesta. Revisa tu conexión e inténtalo de nuevo.';
      e.classList.remove('hidden');
      ok.disabled = false;
      return;
    }
    if (sq.i + 1 < sq.queue.length) { sq.i += 1; sq.sel = null; renderSalud(); $('#salud-title').focus(); return; }
    closeSalud();
    renderSaludCard();
    toast('Gracias. Tu respuesta quedó guardada.');
  }

  // ======================= Asesorado: reto de su coach (Inicio) =======================
  const readRetos = () => { try { const x = JSON.parse(localStorage.getItem(RETOS_KEY) || 'null'); return Array.isArray(x) ? x : []; } catch { return []; } };
  const writeRetos = (l) => { try { localStorage.setItem(RETOS_KEY, JSON.stringify(l)); } catch { /* sin espacio */ } };
  let retosLoading = false;
  async function loadRetos() {
    if (!A || !isClient() || retosLoading) { renderReto(); return; }
    retosLoading = true;
    try { writeRetos(await A.remote.client.myChallenges()); } catch { /* sin conexión: se muestran los guardados */ }
    retosLoading = false;
    renderReto();
  }
  // El reto que se muestra: el activo (o el próximo) más reciente; si no hay, uno que terminó hace 3 días o menos.
  function pickReto(list, d) {
    const act = list.filter((c) => c.start <= d && c.end >= d);
    if (act.length) return act[0];
    const next = list.filter((c) => c.start > d).sort((a, b) => a.start.localeCompare(b.start))[0];
    if (next) return next;
    return list.filter((c) => c.end < d && c.end >= E.addDays(d, -3)).sort((a, b) => b.end.localeCompare(a.end))[0] || null;
  }
  function renderReto() {
    const card = $('#home-reto');
    if (!card) return;
    const c = isClient() ? pickReto(readRetos(), today()) : null;
    card.classList.toggle('hidden', !c);
    if (!c) return;
    const pr = E.progress(c, today());
    $('#reto-label').textContent = `Reto de ${c.businessName || 'tu coach'}`;
    $('#reto-title').textContent = c.title;
    $('#reto-dots').textContent = pr.dots.map((x) => (x ? '●' : '○')).join('');
    $('#reto-line').textContent = pr.line;
    const b = $('#btn-reto-mark');
    b.classList.toggle('hidden', !pr.canMark);
    b.setAttribute('aria-pressed', String(pr.markedToday));
    b.textContent = pr.markedToday ? 'Cumplido hoy ✓' : 'Hoy lo cumplí';
    card.classList.toggle('reto-met', pr.met);
    const paused = document.body.classList.contains('paused');
    $('#reto-status').textContent = paused ? 'Tu acceso está en pausa: este avance es solo tuyo y tu coach no lo verá.' : '';
  }
  async function markReto() {
    const c = pickReto(readRetos(), today());
    if (!c) return;
    const pr = E.progress(c, today());
    const b = $('#btn-reto-mark');
    b.disabled = true;
    try {
      const upd = await A.remote.client.markChallenge(c.id, today(), !pr.markedToday);
      writeRetos(readRetos().map((x) => (x.id === upd.id ? { ...x, marks: upd.marks } : x)));
      renderReto();
      const now = E.progress({ ...c, marks: upd.marks }, today());
      toast(!pr.markedToday ? (now.met ? '¡Reto cumplido! Gracias por tu constancia.' : 'Anotado en tu reto') : 'Quitamos la marca de hoy');
    } catch (err) { toast(errText(err, 'notes'), true); }
    finally { b.disabled = false; }
  }

  // ======================= Coach: Retos (C04) =======================
  let rt = { tpl: E.TEMPLATES[1].key, who: 'todos', picked: new Set(), clients: [], list: [], form: null };
  function formFromTpl() {
    const tpl = E.TEMPLATES.find((t) => t.key === rt.tpl) || E.TEMPLATES[0];
    rt.form = E.fromTemplate(tpl, Pagos.todayBogota());
    $('#reto-f-title').value = rt.form.title;
    $('#reto-f-start').value = rt.form.start;
    $('#reto-f-end').value = rt.form.end;
    $('#reto-f-target').value = String(rt.form.target);
  }
  const readForm = () => ({ ...rt.form, title: $('#reto-f-title').value, start: $('#reto-f-start').value, end: $('#reto-f-end').value, target: Number($('#reto-f-target').value) });
  function renderRetosForm() {
    $('#retos-tpls').innerHTML = E.TEMPLATES.map((t) => `<button type="button" class="reto-tpl" data-tpl="${t.key}" aria-pressed="${rt.tpl === t.key}"><strong>${esc(t.title)}</strong><span>${esc(t.sub)}</span></button>`).join('');
    const n = rt.clients.length;
    $('#retos-who').innerHTML = [['todos', `Todos · ${n}`], ['elegir', rt.who === 'elegir' && rt.picked.size ? `Elegir · ${rt.picked.size}` : 'Elegir']]
      .map(([k, l]) => `<button type="button" data-who="${k}" aria-pressed="${rt.who === k}">${esc(l)}</button>`).join('');
    const pick = $('#retos-pick');
    pick.classList.toggle('hidden', rt.who !== 'elegir');
    pick.innerHTML = '<legend class="sr-only">Elige asesorados</legend>' + rt.clients.map((c) => `<label class="check"><input type="checkbox" value="${esc(c.clientId)}"${rt.picked.has(c.clientId) ? ' checked' : ''}> ${esc(c.displayName || 'Asesorado sin nombre')}</label>`).join('');
    const f = readForm();
    $('#retos-range').textContent = E.checkChallenge(f, Pagos.todayBogota()) ? '' : E.rangeLine(f);
  }
  function renderRetosList() {
    const d = Pagos.todayBogota();
    const box = $('#retos-list');
    const list = rt.list.filter((c) => c.end >= E.addDays(d, -7));
    box.innerHTML = list.map((c) => {
      const s = E.coachSummary(c, d);
      const head = s.ended ? 'Terminó' : c.start > d ? 'Próximo' : 'Activo';
      return `<section class="card reto-act" aria-label="${esc(head)}: ${esc(c.title)}">
        <h3>${esc(head)}: ${esc(c.title)}</h3>
        <p class="home-row"><span>${esc(s.line)}</span><span class="small muted">${esc(s.ended ? 'terminó el ' + E.rangeLine(c).split(' al ')[1].split(' ·')[0] : s.leftText)}</span></p>
        <div class="mc-bar" role="progressbar" aria-label="Van en camino" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${s.pct}"><div style="width:${s.pct}%"></div></div>
        <details class="reto-members"><summary>Ver cómo va cada uno</summary><ul>${s.members.map((m) => `<li><span>${esc(m.displayName || 'Asesorado')}</span><span class="small muted">${esc(m.done)} de ${esc(c.target)} · ${esc(m.label)}</span></li>`).join('')}</ul>
          <p class="small muted">Solo tú ves este avance. Tus asesorados no ven el de los demás.</p></details>
        <button type="button" class="btn btn-ghost btn-tall" data-felicitar="${esc(c.id)}"${s.met.length ? '' : ' disabled'}>Felicitar a los que cumplieron${s.met.length ? ` (${s.met.length})` : ''}</button>
        <button type="button" class="btn-link small reto-quitar" data-quitar="${esc(c.id)}">Quitar este reto</button>
      </section>`;
    }).join('');
  }
  async function openRetos() {
    if (!A || !isCoach()) return;
    if (!rt.form) formFromTpl();
    renderRetosForm();
    renderRetosList();
    try {
      const [clients, list] = await Promise.all([A.remote.coach.clients(), A.remote.coach.listChallenges()]);
      rt.clients = clients.sort((a, b) => String(a.displayName).localeCompare(String(b.displayName), 'es'));
      rt.list = list;
      renderRetosForm();
      renderRetosList();
    } catch (err) { $('#retos-list').innerHTML = `<p class="small muted">${esc(errText(err))}</p>`; }
  }
  async function lanzar() {
    const err = $('#retos-error');
    err.classList.add('hidden');
    const f = readForm();
    const bad = E.checkChallenge(f, Pagos.todayBogota());
    const ids = rt.who === 'todos' ? rt.clients.map((c) => c.clientId) : [...rt.picked];
    const msg = bad || (!ids.length ? (rt.clients.length ? 'Elige al menos un asesorado.' : 'Aún no tienes asesorados.') : '');
    if (msg) { err.textContent = msg; err.classList.remove('hidden'); return; }
    const b = $('#btn-reto-lanzar');
    b.disabled = true;
    try {
      await A.remote.coach.createChallenge({ ...f, clients: ids });
      rt.list = await A.remote.coach.listChallenges();
      renderRetosList();
      toast(`Reto lanzado a ${ids.length} asesorado${ids.length === 1 ? '' : 's'}`);
    } catch (e) { err.textContent = e && e.code === 'invalid' && e.detail === 'challenge_limit' ? 'Tienes 20 retos activos: quita alguno antes de lanzar otro.' : errText(e); err.classList.remove('hidden'); }
    finally { b.disabled = false; }
  }
  async function felicitar(id) {
    const c = rt.list.find((x) => x.id === id);
    if (!c) return;
    const met = E.coachSummary(c, Pagos.todayBogota()).met;
    let ok = 0;
    for (const m of met) {
      try { await A.remote.coach.addComment(m.clientId, { id: Schema.uuid(), refDate: today(), body: `¡Cumpliste el reto «${c.title}»! Gracias por tu constancia.` }); ok++; } catch { /* se sigue con los demás */ }
    }
    toast(ok ? `Felicitamos a ${ok} asesorado${ok === 1 ? '' : 's'}` : 'No pudimos enviar las felicitaciones', !ok);
  }
  async function quitar(id) {
    if (!confirm('¿Quitar este reto? Tus asesorados dejarán de verlo.')) return;
    try { await A.remote.coach.deleteChallenge(id); rt.list = rt.list.filter((x) => x.id !== id); renderRetosList(); toast('Reto quitado'); }
    catch (e) { toast(errText(e), true); }
  }

  // ======================= Coach: meta de proteína (C05) =======================
  let mt = null;   // { clientId, name, info, state }
  function openMeta(clientId) {
    const cur = window.PGCoachPanel && PGCoachPanel.current();
    if (!cur || cur.clientId !== clientId) return;
    mt = cur;
    $('#meta-name').textContent = mt.name;
    $('#meta-label').textContent = `Escribe la meta para ${mt.name.split(/\s+/)[0]}`;
    $('#meta-prev-title').textContent = `Así la verá ${mt.name.split(/\s+/)[0]} en Comidas`;
    $('#meta-input').value = mt.info.proteinGoal ? String(mt.info.proteinGoal) : '';
    $('#meta-error').classList.add('hidden');
    $('#btn-meta-clear').disabled = !mt.info.proteinGoal;
    PGNav.show('meta');
    renderMetaPreview();
    $('#meta-title').focus();
  }
  const metaVal = () => { const v = String($('#meta-input').value || '').trim(); return /^\d{1,3}$/.test(v) ? Number(v) : null; };
  function renderMetaPreview() {
    if (!mt) return;
    const d = Pagos.todayBogota();
    const foods = (mt.state.foods && mt.state.foods[d]) || [];
    const pr = Platos.proteinDay(mt.state.foods || {}, d), tot = Platos.dayTotal(mt.state.foods || {}, d);
    $('#mp-count').textContent = foods.length ? `${foods.length} ${foods.length === 1 ? 'comida anotada' : 'comidas anotadas'}` : 'Aún sin comidas anotadas';
    $('#mp-kcal').textContent = `${Platos.approx(tot.kcal, 10)} kcal aprox.`;
    $('#mp-prot').textContent = pr.any ? `~${pr.grams} g` : '—';
    const g = metaVal(), bar = E.proteinBar(pr.any ? pr.grams : 0, g);
    $('#mp-goal').textContent = bar ? bar.text : '';
    $('#mp-bar').classList.toggle('hidden', !bar);
    if (bar) { $('#mp-bar > div').style.width = bar.pct + '%'; $('#mp-bar').setAttribute('aria-valuenow', String(bar.pct)); }
    $('#mp-note').textContent = bar ? bar.note : g == null ? 'Sin meta: verá su proteína del día sin barra ni meta.' : `La meta va de ${E.PROTEIN_MIN} a ${E.PROTEIN_MAX} g.`;
    $('#mp-note').classList.toggle('mc-l5', !!bar);
    $('#meta-minus').disabled = g == null; $('#meta-plus').disabled = g == null;
  }
  async function saveMeta(clear) {
    if (!mt) return;
    const g = clear ? null : metaVal();
    const err = $('#meta-error');
    if (!clear && E.goalOf(g) == null) { err.textContent = `Escribe una meta entre ${E.PROTEIN_MIN} y ${E.PROTEIN_MAX} g.`; err.classList.remove('hidden'); $('#meta-input').focus(); return; }
    err.classList.add('hidden');
    try {
      const r = await A.remote.coach.setProteinGoal(mt.clientId, g);
      mt.info = { ...mt.info, proteinGoal: r.proteinGoal };
      PGCoachPanel.setInfo(mt.clientId, { proteinGoal: r.proteinGoal });
      toast(r.proteinGoal ? `Meta guardada: ~${r.proteinGoal} g al día` : 'Quitamos la meta');
      PGNav.show('coach');
    } catch (e) { err.textContent = errText(e); err.classList.remove('hidden'); }
  }

  // ======================= Arranque =======================
  function wire() {
    $('#salud-opts').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-ans]');
      if (!b || !sq) return;
      sq.sel = b.dataset.ans;
      renderSalud();
      const nb = $(`#salud-opts [data-ans="${sq.sel}"]`);
      if (nb) nb.focus();
    });
    $('#btn-salud-ok').addEventListener('click', saveSalud);
    $('#row-salud').addEventListener('click', async () => {
      let h = meta().health || {};
      try { h = await A.remote.client.myHealth(); A.setMeta({ health: h }); } catch { /* sin conexión: lo último guardado */ }
      openSalud(E.QUESTIONS.slice(), h, true);
    });
    $('#btn-home-salud').addEventListener('click', () => { const q = pendingQs(); if (q.length) openSalud(q, meta().health || {}, false); });
    $('#btn-reto-mark').addEventListener('click', markReto);
    $('#retos-tpls').addEventListener('click', (ev) => { const b = ev.target.closest('[data-tpl]'); if (!b) return; rt.tpl = b.dataset.tpl; formFromTpl(); renderRetosForm(); const nb = $(`#retos-tpls [data-tpl="${rt.tpl}"]`); if (nb) nb.focus(); });
    $('#retos-who').addEventListener('click', (ev) => { const b = ev.target.closest('[data-who]'); if (!b) return; rt.who = b.dataset.who; renderRetosForm(); const nb = $(`#retos-who [data-who="${rt.who}"]`); if (nb) nb.focus(); });
    $('#retos-pick').addEventListener('change', (ev) => { const i = ev.target; if (!i.value) return; if (i.checked) rt.picked.add(i.value); else rt.picked.delete(i.value); const w = $('#retos-who [data-who="elegir"]'); if (w) w.textContent = rt.picked.size ? `Elegir · ${rt.picked.size}` : 'Elegir'; });
    for (const id of ['#reto-f-title', '#reto-f-start', '#reto-f-end', '#reto-f-target']) $(id).addEventListener('input', () => { const f = readForm(); $('#retos-range').textContent = E.checkChallenge(f, Pagos.todayBogota()) ? '' : E.rangeLine(f); });
    $('#btn-reto-lanzar').addEventListener('click', lanzar);
    $('#retos-list').addEventListener('click', (ev) => {
      const f = ev.target.closest('[data-felicitar]'); if (f) { felicitar(f.dataset.felicitar); return; }
      const q = ev.target.closest('[data-quitar]'); if (q) quitar(q.dataset.quitar);
    });
    $('#meta-input').addEventListener('input', () => { const v = $('#meta-input').value.replace(/\D/g, '').slice(0, 3); if (v !== $('#meta-input').value) $('#meta-input').value = v; renderMetaPreview(); });
    const stepMeta = (d) => { const g = metaVal(); if (g == null) return; $('#meta-input').value = String(Math.max(E.PROTEIN_MIN, Math.min(E.PROTEIN_MAX, g + d))); renderMetaPreview(); };
    $('#meta-minus').addEventListener('click', () => stepMeta(-5));
    $('#meta-plus').addEventListener('click', () => stepMeta(5));
    $('#btn-meta-save').addEventListener('click', () => saveMeta(false));
    $('#btn-meta-clear').addEventListener('click', () => saveMeta(true));
    document.addEventListener('pg:open-meta', (ev) => openMeta(ev.detail && ev.detail.clientId));
    document.addEventListener('pg:view', (ev) => {
      const v = ev.detail && ev.detail.view;
      if (v === 'retos') openRetos();
      if (v === 'panel') loadRetos();
    });
    document.addEventListener('pg:link-changed', () => { maybeAsk(); renderReto(); });
    document.addEventListener('pg:account-changed', () => { maybeAsk(); loadRetos(); });
    document.addEventListener('pg:consents-changed', maybeAsk);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') loadRetos(); });
    // Inicio se vuelve a dibujar con cada cambio (la pausa enciende o apaga la nota de la tarjeta).
    new MutationObserver(() => renderReto()).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }
  function start() {
    if (A || !window.PGAccount) return;
    A = window.PGAccount;
    wire();
    maybeAsk();
    loadRetos();
  }
  if (window.PGAccount) start();
  else document.addEventListener('pg:account-ready', start);
  window.PGEtapa2 = { openSalud: (manual = true) => openSalud(E.QUESTIONS.slice(), meta().health || {}, manual), loadRetos, openRetos };
})();
