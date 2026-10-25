// r1 v1.13 · Panel admin (M7–M10) para el dueño de la plataforma. Solo aparece con el rol 'admin' (core.has_role('grasa','admin'), que se da
// A MANO en SQL) y solo en el producto «coach». Más → «Panel admin» abre su propia barra: Coaches · Uso · Por coach · Avisos · Más.
// Regla de oro (Ley 1581 / concepto 5): aquí solo llegan cantidades por coach o totales. Nunca salud ni nombres, iniciales o ids de asesorados.
// La lógica (cobro con el precio en UN solo lugar, meses, barras…) está en admin.js; el servidor vuelve a comprobar el rol en cada función.
(function () {
  'use strict';
  const PROD = window.Producto || { coach: false };
  if (!PROD.coach || !window.Admin || !window.PGCharts) return;
  const Adm = window.Admin;
  const { barChart, esc } = window.PGCharts;
  const $ = (s) => document.querySelector(s);
  const acc = () => window.PGAccount || null;
  const todayBo = () => (window.Pagos ? Pagos.todayBogota() : new Date().toISOString().slice(0, 10));
  const isAdmin = () => { const A = acc(); const m = A && A.meta(); return !!(m && (m.roles || []).includes('admin')); };
  const errText = (e) => (acc() ? acc().errorText(e, 'coach') : 'No se pudo conectar con el servidor.');
  const S = { month: null, coach: null, coaches: [], susp: null };
  const k = (big, sub, em = '') => `<div class="an-k"><b>${big}</b><span>${sub}</span>${em ? `<em>${em}</em>` : ''}</div>`;
  const lock = (t) => `<p class="an-banner an-banner-t"><span aria-hidden="true">🔒</span><span>${esc(t)}</span></p>`;
  const status = (box, t) => { box.innerHTML = `<p class="small muted" role="status">${esc(t)}</p>`; };

  function who() {
    const A = acc(); const m = (A && A.meta()) || {};
    const n = (m.displayName || (m.email || '').split('@')[0] || 'admin').split(/\s+/)[0];
    for (const el of document.querySelectorAll('.adm-who')) el.textContent = n;
  }
  function fillMonths() {
    const ms = Adm.months(todayBo(), 6);
    if (!S.month) S.month = ms[0].value;
    for (const sel of document.querySelectorAll('.adm-month')) { sel.innerHTML = ms.map((m) => `<option value="${m.value}"${m.value === S.month ? ' selected' : ''}>${esc(m.label)}</option>`).join(''); }
  }

  // ---------- M7: Coaches y cobro (+ «coaches con mayor éxito», solo negocio y adherencia) ----------
  async function renderCoaches() {
    const box = $('#adm-coaches');
    status(box, 'Cargando…');
    let cs, sx;
    try { [cs, sx] = await Promise.all([acc().remote.admin.coaches(S.month), acc().remote.admin.success(S.month)]); } catch (e) { status(box, errText(e)); return; }
    S.coaches = cs;
    const t = Adm.totals(cs);
    const row = (c) => {
      const b = Adm.billing(c);
      return `<li class="adm-row"><div class="adm-row-t"><p><b>${esc(c.businessName)}</b> <span class="adm-st ${c.active ? 'on' : 'off'}">${c.active ? 'Activo' : 'Suspendido'}</span></p>
        <p class="small muted">${esc(c.coachName || '—')}</p><p class="small muted">${b.active} ${b.active === 1 ? 'activo' : 'activos'} · <b class="${b.over ? 'adm-over' : ''}">${b.over} sobre el cupo de ${b.free}</b></p>
        ${!c.active && c.lastReason ? `<p class="small muted">Motivo: ${esc(c.lastReason)}</p>` : ''}</div>
        <div class="adm-row-r"><b class="adm-money">${esc(b.text)}</b><button type="button" class="adm-btn ${c.active ? 'r' : 'g'}" data-susp="${esc(c.coachId)}" aria-label="${c.active ? 'Suspender' : 'Reactivar'} a ${esc(c.businessName)}">${c.active ? 'Suspender' : 'Reactivar'}</button></div></li>`;
    };
    const best = sx.slice().sort((a, b) => (b.habitsPct ?? -1) - (a.habitsPct ?? -1) || (b.retention90 ?? -1) - (a.retention90 ?? -1) || (b.onTimePct ?? -1) - (a.onTimePct ?? -1));
    box.innerHTML = `<div class="an-three">${k(`${t.coachesActive}<small> / ${t.coaches}</small>`, 'coaches activos')}${k(t.over, 'asesorados sobre el cupo')}${k(esc(t.amountText), 'a cobrar estimado')}</div>
      ${cs.length ? `<ul class="card adm-list">${cs.map(row).join('')}</ul>` : '<div class="card"><p class="small muted">Aún no hay coaches.</p></div>'}
      <p class="small muted adm-note">${esc(Adm.PRICE_NOTE)} ${esc(Adm.ACTIVE_NOTE)}</p>
      <div class="card"><p class="an-tag">Coaches con mayor éxito</p><p class="small muted">Solo negocio y adherencia: nunca kilos, centímetros ni cambios corporales.</p>
        <ol class="adm-best">${best.map((x) => `<li><b>${esc(x.businessName)}</b><dl><div><dt>Completan hábitos</dt><dd>${Adm.pctText(x.habitsPct)}</dd></div><div><dt>Siguen a 3 meses</dt><dd>${Adm.pctText(x.retention90)}</dd></div><div><dt>Siguen a 6 meses</dt><dd>${Adm.pctText(x.retention180)}</dd></div><div><dt>Pagos al día</dt><dd>${Adm.pctText(x.onTimePct)}</dd></div></dl></li>`).join('')}</ol>
        <p class="small muted an-note">Completan hábitos: de sus asesorados que comparten hábitos, % que cumplió alguno (agua, pasos, sueño o entreno) 4 de los últimos 7 días; «—» con menos de 3. Retención: de los que empezaron hace 3 a 6 meses (o 6 a 12), % que sigue. Pagos al día: % de sus asesorados con el pago marcado vigente.</p></div>`;
  }
  function openSusp(id) {
    const c = S.coaches.find((x) => x.coachId === id);
    if (!c) return;
    S.susp = c;
    const name = c.coachName || c.businessName;
    $('#ss-title').textContent = c.active ? `¿Suspender a ${c.businessName}?` : `¿Reactivar a ${c.businessName}?`;
    $('#ss-text').textContent = c.active
      ? `${name} no podrá entrar al panel de coach. Sus ${c.linkedClients} asesorados siguen usando la app y conservan sus datos. Puedes reactivarlo cuando quieras.`
      : `${name} vuelve a ver a sus asesorados y a usar su panel de coach.`;
    $('#ss-ok').textContent = c.active ? 'Sí, suspender' : 'Sí, reactivar';
    $('#ss-ok').classList.toggle('btn-danger', c.active);
    $('#ss-reason').value = '';
    $('#ss-reason').closest('.sm-body').querySelector('textarea').classList.toggle('hidden', !c.active);
    $('#ss-error').classList.add('hidden');
    $('#sheet-susp').showModal();
    $('#ss-title').focus();
  }
  async function confirmSusp(ev) {
    ev.preventDefault();
    const c = S.susp;
    if (!c) return;
    $('#ss-ok').disabled = true;
    try {
      await acc().remote.admin.setCoachActive(c.coachId, !c.active, c.active ? $('#ss-reason').value : null);
      $('#sheet-susp').close();
      window.PGCoachPanel && PGCoachPanel.toast(c.active ? `${c.businessName}: suspendido` : `${c.businessName}: reactivado`);
      await renderCoaches();
      const b = document.querySelector(`#adm-coaches [data-susp="${CSS.escape(c.coachId)}"]`); if (b) b.focus();
    } catch (e) { $('#ss-error').textContent = errText(e); $('#ss-error').classList.remove('hidden'); }
    finally { $('#ss-ok').disabled = false; }
  }

  // ---------- M8: Uso general (solo totales) ----------
  async function renderUso() {
    const box = $('#adm-uso');
    status(box, 'Cargando…');
    let u;
    try { u = await acc().remote.admin.usage(S.month); } catch (e) { status(box, errText(e)); return; }
    const net = u.signups - u.drops;
    const last = u.weeks.length ? u.weeks[u.weeks.length - 1].records : 0;
    const ret = Adm.pct(u.retention30.kept, u.retention30.cohort);
    box.innerHTML = `${lock('Solo cifras totales. Sin nombres de asesorados ni datos de salud.')}
      <div class="an-two">${k(u.coachesActive, 'coaches activos', `${u.coachesNew >= 0 ? '+' : ''}${u.coachesNew} este mes`)}${k(u.clientsActive, 'asesorados activos', `${net >= 0 ? '+' : '−'}${Math.abs(net)} este mes`)}</div>
      <div class="card"><div class="an-ch"><span class="an-tag">Registros por semana</span><span class="small muted">últimas 8</span></div>
        <p class="mt-big"><b>${last}</b> esta semana</p>${barChart({ values: u.weeks.map((w) => w.records), labels: Adm.weekLabels(u.weeks), h: 110, aria: 'Registros por semana, últimas 8' })}</div>
      <div class="an-three">${k(u.signups, 'altas del mes')}${k(u.drops, 'bajas del mes')}${k(Adm.pctText(ret), 'retención a 30 días')}</div>
      <div class="card"><div class="an-ch"><span class="an-tag">Coaches por tamaño</span><span class="small muted">asesorados activos</span></div>
        <ul class="adm-sizes">${Adm.sizes(u.sizes).map((x) => `<li><span class="small muted">${x.label}</span><span class="rk-bar t" aria-hidden="true"><i style="width:${Math.max(2, x.pct)}%"></i></span><b>${x.n}</b></li>`).join('')}</ul></div>
      <p class="small muted adm-note">${esc(Adm.ACTIVE_NOTE)}<br>${esc(Adm.RETENTION_NOTE)}</p>`;
  }

  // ---------- M9: Por coach (solo uso de la app) ----------
  async function renderPorCoach() {
    const box = $('#adm-coach'), pick = $('#adm-coach-pick');
    status(box, 'Cargando…');
    try { if (!S.coaches.length) S.coaches = await acc().remote.admin.coaches(S.month); } catch (e) { status(box, errText(e)); return; }
    if (!S.coaches.length) { pick.innerHTML = ''; status(box, 'Aún no hay coaches.'); return; }
    if (!S.coach || !S.coaches.some((c) => c.coachId === S.coach)) S.coach = S.coaches[0].coachId;
    pick.innerHTML = S.coaches.map((c) => `<option value="${esc(c.coachId)}"${c.coachId === S.coach ? ' selected' : ''}>${esc(c.businessName)} · ${esc(c.coachName || '—')}</option>`).join('');
    let u, sx;
    try { [u, sx] = await Promise.all([acc().remote.admin.coachUsage(S.coach, S.month), acc().remote.admin.success(S.month)]); } catch (e) { status(box, errText(e)); return; }
    const s = sx.find((x) => x.coachId === S.coach) || {};
    const la = Adm.lastActivity(u, todayBo());
    const pw = Adm.panelWeek(u.ref || todayBo(), u.panelDays);
    const lastW = u.weeks[u.weeks.length - 1] || {};
    const few = u.weeks.every((w) => w.pctLogging == null);
    box.innerHTML = `${lock('Solo uso de la app. Nunca peso, medidas, comidas, fotos ni salud.')}
      <div class="an-three">${k(u.activeClients, 'asesorados activos')}${k(Adm.pctText(Adm.pct(u.retention30.kept, u.retention30.cohort)), 'retención a 30 días')}${k(esc(la.big), esc(la.sub))}</div>
      <div class="card"><div class="an-ch"><span class="an-tag">% que registra cada semana</span><span class="small muted">${lastW.pctLogging == null ? '—' : lastW.pctLogging + ' % esta sem.'}</span></div>
        ${few ? '<p class="small muted">Con menos de 3 asesorados no se muestra (se podría deducir a una persona).</p>' : barChart({ values: u.weeks.map((w) => w.pctLogging), labels: Adm.weekLabels(u.weeks), max: 100, h: 84, aria: '% de asesorados que registra cada semana' })}</div>
      <div class="card"><div class="an-ch"><span class="an-tag">Entrenos anotados por semana</span><span class="small muted">${lastW.trained == null ? '—' : lastW.trained + ' esta sem.'}</span></div>
        ${u.weeks.every((w) => w.trained == null) ? '<p class="small muted">Con menos de 3 asesorados que comparten hábitos no se muestra.</p>' : barChart({ values: u.weeks.map((w) => w.trained), labels: Adm.weekLabels(u.weeks), tone: 'p', h: 84, aria: 'Entrenos anotados por semana' })}</div>
      <div class="card"><div class="an-ch"><span class="an-tag">Actividad del coach</span><span class="small muted">${pw.count} de 7 días</span></div>
        <ul class="adm-days">${pw.days.map((d) => `<li class="${d.on ? 'on' : ''}"><span>${d.dow}</span><b>${d.n}</b><span class="sr-only">${d.on ? 'abrió el panel' : 'no abrió el panel'}</span></li>`).join('')}</ul>
        <p class="small muted">Días en que abrió el panel de coach.</p></div>
      <div class="card"><p class="an-tag">Éxito del coach · negocio y adherencia</p>
        <div class="an-two adm-success">${k(Adm.pctText(s.habitsPct), 'completan hábitos')}${k(Adm.pctText(s.onTimePct), 'pagos al día')}${k(Adm.pctText(s.retention90), 'retención a 3 meses')}${k(Adm.pctText(s.retention180), 'retención a 6 meses')}</div>
        <p class="small muted an-note">Nunca kilos, centímetros ni cambios corporales.</p></div>`;
  }

  // ---------- M10: Avisos ----------
  const formVal = () => ({ title: $('#aviso-title').value, body: $('#aviso-body').value, from: $('#aviso-from').value, to: $('#aviso-to').value });
  function preview() {
    const v = formVal();
    $('#aviso-prev-title').textContent = v.title.trim() || 'Título del aviso';
    $('#aviso-prev-body').textContent = v.body.trim() || 'El texto aparece aquí.';
  }
  const dm = (iso) => Adm.dm(iso);
  async function renderAvisos() {
    const ul = $('#adm-avisos');
    if (!$('#aviso-from').value) { $('#aviso-from').value = todayBo(); }
    preview();
    let list;
    try { list = await acc().remote.admin.listNotices(); } catch (e) { ul.innerHTML = `<li class="small muted">${esc(errText(e))}</li>`; return; }
    const t = todayBo();
    ul.innerHTML = list.length ? list.map((n) => { const st = Adm.noticeState(n, t); return `<li class="adm-av"><span class="adm-av-t"><b>${esc(n.title)}</b><small>${esc(dm(n.startsOn))} – ${esc(dm(n.endsOn))}</small></span><span class="an-pill ${st === 'Activo' ? '' : 'g'}">${st}</span><button type="button" class="btn-link small" data-del-aviso="${esc(n.id)}" aria-label="Quitar el aviso «${esc(n.title)}»">Quitar</button></li>`; }).join('')
      : '<li class="small muted">Todavía no hay avisos.</li>';
  }
  async function publish() {
    const err = $('#aviso-error');
    const r = Adm.validNotice(formVal(), todayBo());
    if (!r.ok) { err.textContent = Object.values(r.errors).join(' '); err.classList.remove('hidden'); return; }
    err.classList.add('hidden');
    $('#btn-aviso-publicar').disabled = true;
    try {
      await acc().remote.admin.saveNotice(r.value);
      $('#form-aviso').reset();
      window.PGCoachPanel && PGCoachPanel.toast('Aviso publicado');
      await renderAvisos();
      $('#adm-avisos-title').focus();
    } catch (e) { err.textContent = errText(e); err.classList.remove('hidden'); }
    finally { $('#btn-aviso-publicar').disabled = false; }
  }

  // ---------- Navegación ----------
  const RENDER = { 'admin-coaches': renderCoaches, 'admin-uso': renderUso, 'admin-coach': renderPorCoach, 'admin-avisos': renderAvisos };
  function renderRow() {
    const on = !!(window.PGNav && PGNav.isAdmin && PGNav.isAdmin());
    $('#row-admin-t').textContent = on ? 'Salir del panel admin' : 'Panel admin';
    $('#row-admin-s').textContent = on ? 'Volver a la app' : 'Coaches, cobro, uso y avisos (solo cantidades)';
  }
  function start() {
    $('#row-admin').addEventListener('click', () => {
      if (!isAdmin()) return;
      const on = !PGNav.isAdmin();
      who(); fillMonths();
      PGNav.setAdmin(on);
      renderRow();
    });
    document.addEventListener('pg:view', (ev) => { const v = ev.detail && ev.detail.view; if (RENDER[v] && isAdmin()) { who(); fillMonths(); RENDER[v](); } });
    document.addEventListener('pg:account-changed', () => { if (!isAdmin() && window.PGNav && PGNav.isAdmin()) { PGNav.setAdmin(false); renderRow(); } });
    for (const id of ['#adm-month-coaches', '#adm-month-uso']) $(id).addEventListener('change', (ev) => { S.month = ev.target.value; S.coaches = []; fillMonths(); const v = document.querySelector('.view.active'); if (v && RENDER[v.id.slice(5)]) RENDER[v.id.slice(5)](); });
    $('#adm-coach-pick').addEventListener('change', (ev) => { S.coach = ev.target.value; renderPorCoach().then(() => $('#adm-coach-pick').focus()); });
    $('#adm-coaches').addEventListener('click', (ev) => { const b = ev.target.closest('[data-susp]'); if (b) openSusp(b.dataset.susp); });
    $('#form-susp').addEventListener('submit', confirmSusp);
    $('#ss-cancel').addEventListener('click', () => $('#sheet-susp').close());
    $('#sheet-susp').addEventListener('click', (ev) => { if (ev.target === ev.currentTarget) ev.currentTarget.close(); });
    $('#form-aviso').addEventListener('input', preview);
    $('#form-aviso').addEventListener('submit', (ev) => { ev.preventDefault(); publish(); });
    $('#btn-aviso-publicar').addEventListener('click', publish);
    $('#adm-avisos').addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-del-aviso]');
      if (!b || !confirm('¿Quitar este aviso? Los coaches dejan de verlo.')) return;
      try { await acc().remote.admin.deleteNotice(b.dataset.delAviso); await renderAvisos(); $('#adm-avisos-title').focus(); } catch (e) { window.PGCoachPanel && PGCoachPanel.toast(errText(e), true); }
    });
    renderRow();
  }
  if (window.PGAccount) start(); else document.addEventListener('pg:account-ready', start, { once: true });
})();
