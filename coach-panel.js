// S3-4 (R1): panel del coach (HU-P05/P06/P07/P09) y, del lado del cliente, las notas de su coach.
// Usa SOLO la API del contrato vía el Remote de account.js (window.PGAccount). Los datos de clientes viven en memoria
// (nunca en el localStorage del coach). Todo lo que escribe otra persona (display_name, business_name, nombre del
// perfil, comentarios) se escapa con esc() antes de entrar en el DOM.
// Sin servidor configurado, account.js no crea PGAccount y este archivo no hace nada.
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n, d = 1) => (n == null || Number.isNaN(n) ? '—' : Number(n).toLocaleString('es', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const signed = (n, d = 1) => (n == null ? '—' : (n > 0 ? '+' : '') + num(n, d));
  const toISO = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const today = () => toISO(new Date());
  const fmtDay = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('es', { day: 'numeric', month: 'short' }) : '—');
  const fmtStamp = (iso) => (iso ? new Date(iso).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
  const COMMENTS_KEY = PGNS.key('comments'); // contrato §5.3: comentarios del cliente, aparte del estado
  const PROD = window.Producto || { coach: false };   // Sprint 11: producto 'coach' (solo la copia de pruebas)
  const SHARE_NAMES = PROD.coach ? { body: 'medidas', nutrition: 'comidas', habits: 'hábitos', photos: 'fotos' } : { body: 'peso, medidas y perfil', nutrition: 'comidas', habits: 'hábitos', notes: 'notas', photos: 'fotos' };
  const todayBo = () => Pagos.todayBogota();   // los cobros se miden con el día de Bogotá

  let A = null;           // PGAccount (remote + metadatos)
  let loadedOnce = false; // r1 v1.13: ¿ya se cargó la lista al menos una vez?
  const cache = new Map(); // clientId → { info, data, state, sem, sum }
  let current = null;      // clientId abierto en la ficha
  const ended = [];        // A8: clientes que dejaron de compartir contigo desde la última vez que lo viste
  const endedByMe = new Set(); // los que terminaste tú: no hace falta avisarte dos veces
  let photoURL = null;     // object URL de la foto abierta (se libera al cambiar)

  function toast(msg, error) {
    const t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.toggle('error', !!error);
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), error ? 4000 : 2600);
  }
  const errText = (err) => {
    if (err && err.code === 'agreement_required') { // el servidor no ve el acuerdo vigente: se vuelve a aprender qué dice la cuenta y se cierra la puerta
      if (A && A.refresh) Promise.resolve(A.refresh()).then(renderGate, () => {});
      return 'Para ver a tus clientes, acepta el Acuerdo del coach.';
    }
    if (err && err.code === 'forbidden') return 'Este cliente ya no comparte sus datos contigo.';
    return A ? A.errorText(err, 'coach') : 'No se pudo conectar con el servidor.';
  };
  const displayName = (c) => (c.info.displayName || (c.state.profile && c.state.profile.name) || 'Cliente sin nombre');

  // ---------- A7: acuerdo del coach (bloquea Clientes e Invitar hasta aceptarlo; su uso personal no se bloquea) ----------
  const agreementOK = () => !!(A && window.ConsentTexts && ConsentTexts.coachAgreementOK(A.meta()));
  function renderGate() {
    if (!A) return;
    const locked = !agreementOK();
    const t = ConsentTexts.get('A7');
    for (const sec of [$('#view-coach'), $('#view-invitar')]) {
      sec.classList.toggle('a7-locked', locked);
      const gate = sec.querySelector('.a7-gate');
      gate.classList.toggle('hidden', !locked);
      if (!locked) continue;
      gate.querySelector('.a7-intro').textContent = ConsentTexts.fill(t.intro, {});
      const clause = gate.querySelector('.a7-clause');   // producto coach: cláusula 13 completa (contenidos cargados y derechos de imagen)
      clause.textContent = t.clause || '';
      clause.classList.toggle('hidden', !t.clause);
      const cx = gate.querySelector('.a7-clause-export');   // M6: cláusula 14 (descarga y custodia local)
      cx.textContent = t.clauseExport || '';
      cx.classList.toggle('hidden', !t.clauseExport);
      gate.querySelector('.a7-text').textContent = ConsentTexts.fill(t.body, {});
      A.fillLinks(gate.querySelector('.a7-links'), t.links);
    }
    if (locked) { cache.clear(); freePhoto(); $('#coach-invite-code').textContent = ''; } // nada de clientes en memoria sin acuerdo
  }
  function wireGate() {
    for (const form of document.querySelectorAll('.a7-form')) {
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const err = form.querySelector('.a7-error');
        if (!form.elements.a7.checked) { err.textContent = 'Marca la casilla para continuar.'; err.classList.remove('hidden'); form.elements.a7.focus(); return; }
        err.classList.add('hidden');
        form.setAttribute('aria-busy', 'true');
        const ok = await A.acceptCoachAgreement();
        form.setAttribute('aria-busy', 'false');
        if (!ok) { err.textContent = 'No pudimos guardar tu aceptación. Revisa tu conexión e inténtalo de nuevo.'; err.classList.remove('hidden'); return; }
        form.reset();
        renderGate();
        toast('Acuerdo aceptado');
        if ($('#view-coach').classList.contains('active')) { showList(); loadClients(); }
        else renderInvite((A.meta() || {}).coach);
      });
    }
    document.addEventListener('pg:consents-changed', renderGate);
  }

  // ---------- Sprint 10: Mi acuerdo (Más → Mi acuerdo): texto exacto aceptado, fecha, versión, huella y copia ----------
  let agreementRes = null;
  async function renderAgreement() {
    if (!A) return;
    const r = await AcuerdoView.resolve(A.meta(), ConsentTexts, Remote.textHash);
    agreementRes = r;
    const none = r.state === 'none';
    $('#acuerdo-none').classList.toggle('hidden', !none);
    $('#acuerdo-new').classList.toggle('hidden', r.state !== 'outdated' && r.state !== 'previous');
    $('#btn-acuerdo-nuevo').classList.toggle('hidden', r.state !== 'outdated');
    $('#acuerdo-card').classList.toggle('hidden', none);
    if (none) return;
    $('#acuerdo-when').textContent = AcuerdoView.when(r.at);
    $('#acuerdo-version').textContent = r.version;
    $('#acuerdo-hash').textContent = r.hashShort;
    $('#acuerdo-hash').title = r.hash;
    $('#acuerdo-text').textContent = r.text || '';
    $('#acuerdo-text').classList.toggle('hidden', !r.text);
    $('#acuerdo-lead').classList.toggle('hidden', !r.text);
    $('#acuerdo-mismatch').classList.toggle('hidden', !!r.text);
    $('#btn-acuerdo-download').disabled = !r.text;
    if (r.state === 'outdated') $('#acuerdo-new-text').textContent = `Hay una versión nueva del acuerdo (${r.currentVersion}). Para seguir viendo a tus clientes debes aceptarla. Abajo ves el texto que aceptaste antes (versión ${r.version}).`;
    // M6: la versión que aceptaste sigue vigente para todo; la nueva (cláusula de descarga y custodia) se pide solo la primera vez que exportes.
    if (r.state === 'previous') $('#acuerdo-new-text').textContent = `Hay una versión nueva del acuerdo (${r.currentVersion}) con una cláusula sobre la descarga de datos de tus asesorados. Tu acuerdo sigue vigente: la versión nueva se te pedirá solo la primera vez que uses «Exportar a Excel». Abajo ves el texto que aceptaste (versión ${r.version}).`;
  }
  function downloadAgreement() {
    const r = agreementRes;
    if (!r || !r.text) return;
    const who = (A.meta() || {}).email || '';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([AcuerdoView.fileHtml(r, who)], { type: 'text/html;charset=utf-8' }));
    a.download = AcuerdoView.fileName(r, 'html');
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    $('#acuerdo-copy-status').textContent = 'Listo: guardamos el archivo con el acuerdo. Puedes abrirlo o imprimirlo.';
  }
  function wireAgreement() {
    $('#row-c-acuerdo').addEventListener('click', () => { $('#acuerdo-copy-status').textContent = ''; renderAgreement(); });
    $('#btn-acuerdo-download').addEventListener('click', downloadAgreement);
    $('#btn-acuerdo-mail').addEventListener('click', async () => {
      const b = $('#btn-acuerdo-mail');
      const st = $('#acuerdo-copy-status');
      b.disabled = true;
      st.textContent = 'Enviando la copia a tu correo…';
      const res = await A.sendAgreementCopy(); // nunca lanza: devuelve el estado
      st.textContent = AcuerdoView.COPY_TEXT[res.status] || AcuerdoView.COPY_TEXT.unavailable;
      b.disabled = false;
    });
    for (const id of ['#btn-acuerdo-ir', '#btn-acuerdo-nuevo']) $(id).addEventListener('click', () => $('#tab-coach').click());
    document.addEventListener('pg:consents-changed', () => { if ($('#view-acuerdo').classList.contains('active')) renderAgreement(); });
    // Justo tras aceptar: si la copia salió, se avisa; si no (función no desplegada, sin internet…), no se molesta: queda el botón de Mi acuerdo.
    document.addEventListener('pg:agreement-copy', (ev) => {
      const d = ev.detail || {};
      if (d.status === 'sent') toast('Te enviamos una copia a tu correo');
    });
  }

  // ---------- Coach: lista ----------
  async function loadClients() {
    if (!agreementOK()) { renderGate(); return; } // sin acuerdo no se pide ni un dato de clientes
    const status = $('#coach-list-status');
    status.textContent = 'Cargando clientes…';
    try {
      const [mine, list] = await Promise.all([A.remote.coach.myCoach(), A.remote.coach.clients()]);
      A.setMeta({ coach: mine });
      renderInvite(mine);
      // A8: si un cliente ya no está en la lista (terminó el vínculo o retiró lo que compartía), se avisa al coach.
      const before = new Map([...cache.values()].map((c) => [c.info.clientId, displayName(c)]));
      for (const x of list) before.delete(x.clientId);
      for (const [id, name] of before) if (!endedByMe.delete(id)) ended.push(name);
      cache.clear();
      const ref = today();
      await Promise.all(list.map(async (info) => {
        try {
          const data = await A.remote.coach.clientData(info.clientId);
          const state = Coach.stateFromWire(data.records);
          cache.set(info.clientId, { info, data, state, st: ClientStatus.estado(state, { today: ref, shares: info.shares }), sum: Coach.summarize(state, { today: ref }) });
          if (PROD.coach) lastPay.set(info.clientId, info);
        } catch (err) {
          if (!(err && err.code === 'forbidden')) throw err; // revocado entre una llamada y otra: se omite
        }
      }));
      loadedOnce = true;
      renderList();
      renderEnded();
      document.dispatchEvent(new CustomEvent('pg:coach-list-loaded'));
      const over = list.filter((c) => c.overFreeLimit).length;
      const limit = $('#coach-limit');
      limit.classList.toggle('hidden', !over);
      limit.textContent = over ? `Tienes ${list.length} clientes: pasas del límite gratuito de ${mine ? mine.freeClients : 5}. Te contactaremos para el plan fundador; nadie pierde el acceso.` : '';
      status.textContent = list.length ? `Actualizado a las ${new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}.` : '';
      if (PROD.coach) { document.body.dataset.stamp = list.length ? `Actualizado ${new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', hour12: false })}` : ''; document.dispatchEvent(new CustomEvent('pg:topbar-label')); }
    } catch (err) {
      status.textContent = errText(err);
    }
  }

  // A8 (al coach): «Perdiste el acceso a los datos de [cliente]. Borra cualquier copia que tengas en un máximo de 30 días.»
  function renderEnded() {
    const box = $('#coach-ended');
    box.replaceChildren(...ended.map((name) => {
      const p = document.createElement('p');
      p.className = 'acc-note small a7-ended';
      p.textContent = ConsentTexts.A8text.coachEnded(name);
      return p;
    }));
    box.classList.toggle('hidden', !ended.length);
  }

  // Sprint 4: filas con avatar de iniciales, nombre, última actividad y estado con TEXTO ("Al día", "Se atrasa", "Sin registrar").
  // El estado y el peso salen de ClientStatus (puro) y solo de lo que coach_pull entrega y el cliente compartió.
  function statusChip(st) { return `<span class="chip chip-${esc(st.key)}">${esc(st.label)}</span>`; }
  const lastPay = new Map();
  const payOf = (c) => Pagos.status(c.info, todayBo());
  // UX Etapa 1 (producto 'coach'): lista ordenada por «Necesitan atención», con semáforo que SIEMPRE dice el motivo en texto y lleva forma (▲ ● ✓), no solo color.
  // Umbrales (decisión D8): ámbar a los 3 días sin registrar, rojo a los 7. El pago es un dato secundario (y un botón para cambiarlo). Filtros: Necesitan atención · Todos · Vencen pronto · Sin pagar.
  const SEM_ICON = { atencion: '▲', revisar: '●', aldia: '✓' };
  let filter = 'atencion';
  let shownOrder = [];   // ids en el orden de la pantalla (para «Anterior / Siguiente» en la ficha)
  const rowsNow = () => [...cache.values()].map((c) => ({ c, at: Coach.atencion(c.state, { today: todayBo(), shares: c.info.shares }), p: payOf(c) }));
  // Concepto 7, punto 10 (guía aprobada): filtros por ESTADO OPERATIVO, nunca un ranking corporal. «Requieren revisión» = estancados 3+ semanas
  // (la regla de la tarjeta de tendencia); «Al día con registros» = semáforo al día; «Sin pesaje reciente» = más de 10 días sin pesarse.
  // Punto de enganche (APAGADO): «Alertas activas (pérdidas atípicas/rápidas)» depende de las alertas L6, que siguen apagadas hasta que un profesional
  // valide los umbrales (Etapa 3). Para encenderlo: ALERTS_FILTER = true y definir inFilter(r, 'alertas') con la señal L6 del servidor.
  const ALERTS_FILTER = false;
  const AN = () => window.Analitica || null;
  const FILTERS = [['atencion', 'Necesitan atención'], ['todos', 'Todos'], ['vencen', 'Vencen pronto'], ['sinpagar', 'Sin pagar'],
    ['revision', 'Requieren revisión'], ['aldia', 'Al día con registros'], ['sinpesaje', 'Sin pesaje reciente'], ...(ALERTS_FILTER ? [['alertas', 'Alertas activas']] : [])];
  const EMPTY = { vencen: 'Nadie vence en los próximos 7 días.', sinpagar: 'Todos están al día con el pago.', revision: 'Nadie lleva 3 semanas o más estancado.',
    aldia: 'Nadie está al día con sus registros ahora.', sinpesaje: 'Todos se pesaron en los últimos 10 días.' };
  // «Necesitan atención» es la vista de entrada: TODOS los asesorados, con quienes necesitan atención primero (el número cuenta solo a esos). «Todos» los ordena por nombre.
  const inFilter = (r, f) => (f === 'vencen' ? r.p.paid && r.p.daysLeft <= Pagos.SOON_DAYS : f === 'sinpagar' ? !r.p.paid
    : f === 'revision' ? !!AN() && AN().needsReview(r.c.state.entries, todayBo()) : f === 'aldia' ? r.at.level === 'aldia'
      : f === 'sinpesaje' ? !!AN() && AN().weighStale(r.c.state.entries, todayBo()) : f === 'alertas' ? false : true);
  const countOf = (all, f) => (f === 'atencion' ? all.filter((r) => r.at.level !== 'aldia').length : all.filter((r) => inFilter(r, f)).length);
  function orderedRows(f) {
    const byName = (a, b) => displayName(a.c).localeCompare(displayName(b.c), 'es');
    const all = rowsNow().sort(f === 'todos' ? byName : (a, b) => Coach.byAtencion(a.at, b.at) || byName(a, b));
    const list = all.filter((r) => inFilter(r, f));
    if (f === 'vencen') list.sort((a, b) => a.p.daysLeft - b.p.daysLeft || byName(a, b));
    return list;
  }
  function renderListPay() {
    const ul = $('#coach-clients');
    const all = rowsNow();
    const counts = Object.fromEntries(FILTERS.map(([k]) => [k, countOf(all, k)]));
    $('#coach-filters').innerHTML = FILTERS.map(([k, t]) => `<button type="button" data-filter="${k}" aria-pressed="${filter === k}">${t} · ${counts[k]}</button>`).join('');
    const need = counts.atencion;
    $('#coach-subtitle').textContent = all.length ? `${all.length} asesorado${all.length === 1 ? '' : 's'}${need ? ` · ${need} ${need === 1 ? 'necesita' : 'necesitan'} atención` : ' · todos al día'}` : 'Aún no tienes asesorados';
    if (!all.length) {
      const code = (A.meta() || {}).coach;
      ul.innerHTML = `<li class="small muted">Aún no tienes asesorados. Comparte tu código${code ? ` <strong>${esc(code.inviteCode)}</strong>` : ''} para que se conecten contigo.</li>`;
      shownOrder = [];
      return;
    }
    const items = orderedRows(filter);
    shownOrder = items.map((r) => r.c.info.clientId);
    if (!items.length) {
      ul.innerHTML = `<li class="small cli-empty">${EMPTY[filter] || 'Nadie en este filtro.'}</li>`;
      return;
    }
    ul.innerHTML = items.map(({ c, at, p }) => {
      const name = displayName(c), id = esc(c.info.clientId);
      const habitsOff = !(c.info.shares && c.info.shares.habits);
      const salud = window.Etapa2 ? Etapa2.coachHealth(c.info) : null;   // UX Etapa 2 (L4): solo el indicador, sin detalle
      const dolor = c.info.painReported ? `Reportó dolor · ${fmtDay(c.info.painReported)}` : '';   // estilo v2 (r1 v1.12): aviso de dolor, sin detalle
      return `<li><div class="cli-pay-row" data-level="${at.level}">
        <button type="button" class="cli-main" data-client="${id}" aria-label="${esc(name)}. ${esc(at.label)}: ${esc(at.reason)}.${AN() ? ' ' + esc(AN().lastMeasureLine(c.state.entries)) + '.' : ''}${salud ? ' ' + esc(salud.line) + '.' : ''}${dolor ? ' ' + esc(dolor) + '.' : ''} ${esc(Pagos.coachLine(p))}. Abrir su ficha">
          <span class="cli-av" aria-hidden="true">${esc(ClientStatus.initials(name))}</span>
          <span class="cli-text"><span class="cli-top"><span class="cli-name who">${esc(name)}</span><span class="sem sem-${at.level}"><span aria-hidden="true">${SEM_ICON[at.level]}</span> ${esc(at.label)}</span></span>
            <span class="cli-line cli-motivo">${esc(at.reason)}</span>
            ${AN() ? `<span class="cli-line cli-med">${esc(AN().lastMeasureLine(c.state.entries))}</span>` : ''}
            ${salud ? `<span class="cli-line cli-salud"><span aria-hidden="true">▲</span> ${esc(salud.line)}</span>` : ''}
            ${dolor ? `<span class="cli-line cli-salud cli-dolor"><span aria-hidden="true">▲</span> ${esc(dolor)}</span>` : ''}
            ${habitsOff ? '<span class="cli-line">🔒 No comparte sus hábitos</span>' : ''}
            <span class="cli-line cli-pago">${esc(Pagos.listLine(p))}</span></span>
        </button>
        <button type="button" class="chip-pay ${p.paid ? 'ok' : 'bad'}" data-pay="${id}" aria-label="${esc(name)}: ${p.paid ? 'pagó' : 'no pagó'}. Tocar para cambiar">${esc(Pagos.chipText(p))}</button>
      </div>${dolor ? `<div class="cli-dolor-row"><button type="button" class="btn btn-ghost" data-pain-review="${id}" aria-label="Marcar revisado: ${esc(name)} reportó dolor el ${esc(fmtDay(c.info.painReported))}">Marcar revisado</button></div>` : ''}</li>`;
    }).join('');
  }

  // ---- Cobro: «Pagó» (hoy + 30 días, editable) y «No pagó» ----
  let payFor = null, payOpener = null;
  function openPay(clientId) {
    const c = cache.get(clientId);
    if (!c) return;
    payFor = clientId;
    payOpener = document.activeElement;
    const p = payOf(c);
    $('#pago-title').textContent = `Cobro de ${displayName(c)}`;
    $('#pago-state').textContent = `Ahora: ${Pagos.chipText(p)}. ${Pagos.coachLine(p)}.`;
    $('#pago-date').value = Pagos.defaultPaidUntil(todayBo());
    $('#pago-error').classList.add('hidden');
    $('#sheet-pago').showModal();
    $('#pago-title').focus();
  }
  async function savePay(until, okText) {
    const err = $('#pago-error');
    err.classList.add('hidden');
    const c = cache.get(payFor);
    if (until != null && !Pagos.isISO(until)) { err.textContent = 'Elige una fecha válida.'; err.classList.remove('hidden'); $('#pago-date').focus(); return; }
    const today = todayBo();
    if (until != null && (Pagos.daysLeft(until, today) < -400 || Pagos.daysLeft(until, today) > 400)) { err.textContent = 'Esa fecha está muy lejos de hoy. Elige una más cercana.'; err.classList.remove('hidden'); $('#pago-date').focus(); return; }
    for (const b of document.querySelectorAll('#form-pago button')) b.disabled = true;
    try {
      const r = await A.remote.coach.setPayment(payFor, until);
      c.info = { ...c.info, paidUntil: r.paidUntil, paidMarkedAt: r.paidMarkedAt, paid: r.paid, daysLeft: r.daysLeft };
      $('#sheet-pago').close();
      renderList();
      if (current === payFor) renderDetail(c);
      toast(okText(r));
    } catch (e) { err.textContent = errText(e); err.classList.remove('hidden'); }
    finally { for (const b of document.querySelectorAll('#form-pago button')) b.disabled = false; }
  }
  function wirePay() {
    $('#coach-clients').addEventListener('click', (ev) => { const b = ev.target.closest('[data-pay]'); if (b) openPay(b.dataset.pay); });
    $('#btn-detail-pay').addEventListener('click', () => { if (current) openPay(current); });
    $('#form-pago').addEventListener('submit', (ev) => { ev.preventDefault(); savePay($('#pago-date').value, (r) => `Marcado: pagó hasta el ${Pagos.dayText(r.paidUntil)}`); });
    $('#pago-unpaid').addEventListener('click', () => savePay(Pagos.unpaidDate(todayBo()), () => 'Marcado: no pagó'));
    $('#pago-cancel').addEventListener('click', () => $('#sheet-pago').close());
    $('#sheet-pago').addEventListener('click', (ev) => { if (ev.target === ev.currentTarget) ev.currentTarget.close(); });
    $('#sheet-pago').addEventListener('close', () => { const o = payOpener; payOpener = null; if (o && o.isConnected) o.focus(); });
    $('#coach-filters').addEventListener('click', (ev) => { const b = ev.target.closest('[data-filter]'); if (!b) return; filter = b.dataset.filter; renderList(); const nb = $(`#coach-filters [data-filter="${filter}"]`); if (nb) nb.focus(); });
    $('#btn-coach-add').addEventListener('click', () => $('#tab-invitar').click());
    $('#btn-coach-qr').addEventListener('click', () => openQr());
  }

  function renderList() {
    if (PROD.coach) { renderListPay(); return; }
    const ul = $('#coach-clients');
    const items = [...cache.values()].sort((a, b) => ClientStatus.byUrgency(a.st, b.st) || displayName(a).localeCompare(displayName(b), 'es'));
    $('#coach-subtitle').textContent = ClientStatus.subtitle(items.map((c) => c.st));
    if (!items.length) {
      const code = (A.meta() || {}).coach;
      ul.innerHTML = `<li class="small muted">Aún no tienes clientes. Comparte tu código${code ? ` <strong>${esc(code.inviteCode)}</strong>` : ''} para que se conecten contigo.</li>`;
      return;
    }
    ul.innerHTML = items.map((c) => {
      const name = displayName(c);
      return `<li><button type="button" class="cli-row client-btn" data-client="${esc(c.info.clientId)}" aria-label="${esc(name)}: ${esc(c.st.label)}. ${esc(c.st.line)}">
        <span class="cli-av" aria-hidden="true">${esc(ClientStatus.initials(name))}</span>
        <span class="cli-text"><span class="cli-name who">${esc(name)}</span><span class="cli-line meta">${esc(c.st.line)}</span></span>
        ${statusChip(c.st)}
      </button></li>`;
    }).join('');
  }

  // A1: invitación por WhatsApp. Todo lo que escribe una persona entra al DOM con textContent y a la URL con encodeURIComponent.
  function inviteParts() {
    const mine = A && agreementOK() && (A.meta() || {}).coach;
    if (!mine || !window.Invite) return null;
    const link = Invite.inviteLink(location, mine.inviteCode);
    if (!link) return null;
    return { link, message: Invite.inviteMessage({ clientName: $('#invite-name').value, businessName: mine.businessName, link }) };
  }
  function renderInvitePreview() {
    const p = inviteParts();
    const wa = $('#btn-invite-wa');
    $('#invite-preview').textContent = p ? p.message : 'Cuando tu código esté listo verás aquí el mensaje.';
    wa.setAttribute('href', p ? Invite.whatsappUrl(p.message) : '#');
    wa.setAttribute('aria-disabled', p ? 'false' : 'true');
    wa.classList.toggle('disabled', !p);
    $('#invite-link-input').value = p ? p.link : '';
    $('#btn-invite-qr').disabled = !p || !window.QR; // mismos requisitos que WhatsApp: servidor configurado y coach con código
  }
  async function copyInviteLink() {
    const p = inviteParts();
    if (!p) return;
    try {
      await navigator.clipboard.writeText(p.link);
      $('#invite-copy-fallback').classList.add('hidden');
      toast('Enlace copiado');
    } catch {
      const box = $('#invite-link-input');
      $('#invite-copy-fallback').classList.remove('hidden');
      box.focus();
      box.select();
      try { box.setSelectionRange(0, box.value.length); document.execCommand('copy'); } catch { /* queda seleccionado para copiar a mano */ }
    }
  }

  // Sprint 5: hoja con el QR del MISMO enlace de invitación. Se dibuja aquí, en el teléfono; no se envía a ningún servicio.
  let qrOpener = null;
  function openQr() {
    const p = inviteParts();
    if (!p || !window.QR) return;
    let svg;
    try { svg = QR.svg(p.link, { label: 'Código QR de tu invitación a Pérdida de Grasa. Tu cliente lo escanea con la cámara del teléfono.' }); } catch { toast('No se pudo crear el QR', true); return; }
    $('#qr-box').innerHTML = svg; // SVG generado por qr.js: solo números y una etiqueta escapada, nada que escribió una persona
    $('#qr-code').textContent = Invite.normalizeCode((A.meta().coach || {}).inviteCode);
    qrOpener = document.activeElement;
    $('#sheet-qr').showModal();
    $('#qr-title').focus();
  }
  function closeQr() { const d = $('#sheet-qr'); if (d.open) d.close(); }

  function renderInvite(mine) {
    if (!mine || !agreementOK()) return; // sin acuerdo no hay código de invitación activo
    renderInvitePreview();
    $('#coach-invite-code').textContent = mine.inviteCode;
    const parts = [mine.expiresAt ? `Válido hasta el ${new Date(mine.expiresAt).toLocaleDateString('es')}` : 'Sin caducidad',
      mine.maxUses ? `usado ${mine.uses} de ${mine.maxUses} veces` : `usado ${mine.uses || 0} veces, sin límite`];
    $('#coach-invite-info').textContent = parts.join(' · ') + '.';
  }

  // ---------- Coach: ficha ----------
  // Barra superior de la ficha: «‹ Anterior · Nombre · Siguiente ›» (solo en el producto coach). La app oficial no la usa.
  function fichaBar(on, name) {
    if (!PROD.coach) return;
    const bar = document.querySelector('.topbar');
    bar.classList.toggle('has-back', on);
    bar.classList.toggle('has-ficha', on);
    const hb = on && (shownOrder.length > 1 || cache.size > 1);
    $('#btn-coach-prev').classList.toggle('hidden', !hb);
    $('#btn-coach-next').classList.toggle('hidden', !hb);
    $('#btn-coach-prev').disabled = !hb; $('#btn-coach-next').disabled = !hb;
    if (on && name) $('#topbar-title').textContent = name;
    else if (!on) $('#topbar-title').textContent = 'Asesorados';
  }
  function showList(focusId) {
    current = null;
    freePhoto();
    $('#coach-detail-view').classList.add('hidden');
    $('#coach-list-view').classList.remove('hidden');
    fichaBar(false);
    const btn = focusId && document.querySelector(`#coach-clients [data-client="${CSS.escape(focusId)}"]`);
    (btn || $('#coach-title-list')).focus();
  }
  function freePhoto() {
    if (typeof freeCompare === 'function') freeCompare();
    if (photoURL) URL.revokeObjectURL(photoURL);
    photoURL = null;
    const fig = $('#coach-photo-view');
    fig.classList.add('hidden');
    fig.querySelector('img').removeAttribute('src');
  }

  async function openClient(clientId) {
    reactSel = 0;
    const c = cache.get(clientId);
    if (!c) return;
    current = clientId;
    freePhoto();
    $('#coach-list-view').classList.add('hidden');
    $('#coach-detail-view').classList.remove('hidden');
    renderDetail(c);
    fichaBar(true, displayName(c));
    $('#coach-detail-title').focus();
    $('#comment-date').value = today();
    if (PROD.coach) $('#fc-react-status').textContent = '';
    if (PROD.coach) document.dispatchEvent(new CustomEvent('pg:coach-client-open', { detail: { clientId, name: displayName(c) } }));   // Etapa 2: rutinas-view.js arma su tarjeta de rutina
  }

  // Sprint 11: ficha del asesorado (M2): cobro, medidas Inicio/Hoy/Cambio, hábitos de la semana y fotos.
  function renderDetailPay(c, sh) {
    const p = payOf(c);
    $('#coach-detail-light').textContent = '';
    $('#coach-detail-pay-line').textContent = Pagos.coachLine(p);
    const b = $('#btn-detail-pay');
    b.textContent = Pagos.chipText(p);
    b.className = 'chip-pay ' + (p.paid ? 'ok' : 'bad');
    b.setAttribute('aria-label', `${displayName(c)}: ${p.paid ? 'pagó' : 'no pagó'}. Tocar para cambiar`);
    $('#coach-detail-medidas').innerHTML = Medidas.hasAny(c.state.entries) ? PGMedTable(Medidas.summary(c.state.entries)) : `<p class="small muted">${esc(displayName(c))} todavía no registra medidas.</p>`;
    const hb = $('#coach-detail-habits');
    if (sh.habits) {
      const w = Habitos.week(c.state, todayBo());
      hb.innerHTML = w.items.map((i) => `<div class="habit${i.days === i.of ? ' done' : ''}"><span>${esc(i.label)}</span><b>${esc(i.text)}</b><div class="bar" role="progressbar" aria-label="${esc(i.label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${i.pct}"><i style="width:${i.pct}%"></i></div></div>`).join('');
      $('#coach-detail-habits-line').textContent = w.line;
    } else { hb.innerHTML = ''; $('#coach-detail-habits-line').textContent = Habitos.notSharedText(displayName(c)) + '. Si quiere, puede compartirlos en Más → Mis datos y permisos.'; }
  }
  // Etapa 2: «Comidas» (producto coach): los últimos 7 días, con el total de kcal aproximadas por día y lo que comió (plato, porción, tipo y hora si existe).
  function renderDetailComidas(c, sh) {
    const box = $('#coach-detail-comidas'), line = $('#coach-detail-comidas-line');
    if (!sh.nutrition) {
      box.innerHTML = '';
      line.textContent = `${displayName(c)} todavía no comparte sus comidas. Aparecen cuando confirme lo que comparte en la app.`;
      return;
    }
    const days = Platos.lastDays(c.state.foods, todayBo(), 7);
    const withFood = days.filter((d) => d.count);
    line.textContent = withFood.length ? `Últimos 7 días: ${withFood.length} día${withFood.length === 1 ? '' : 's'} con comidas. Las calorías son aproximadas.` : `${displayName(c)} todavía no registra comidas en los últimos 7 días.`;
    const dayName = (d, i) => (i === 0 ? 'Hoy' : i === 1 ? 'Ayer' : new Date(d + 'T12:00:00').toLocaleDateString('es', { weekday: 'long' }).replace(/^./, (c) => c.toUpperCase())) + ' · ' + fmtDay(d);
    box.innerHTML = days.map((d, i) => `<section class="cm-day" aria-label="${esc(dayName(d.date, i))}"><div class="cm-head"><strong>${esc(dayName(d.date, i))}</strong><span class="${d.count ? '' : 'muted small'}">${d.count ? `<b>${esc(d.kcalText)} kcal</b> aprox.` : 'Sin comidas'}</span></div>`
      + (d.count ? `<ul class="cm-list">${d.items.map((x) => {
        const p = x.dish ? Platos.portionOf(x.portion) : null;
        const sub = [p ? p.label : '', x.meal, x.time || ''].filter(Boolean).join(' · ');
        return `<li><span class="cm-t">${esc(x.name)}<small>${esc(sub)}</small></span><b>${esc(Platos.n0(x.kcal))} kcal</b></li>`;
      }).join('')}</ul>` : '') + '</section>').join('');
  }
  // ---------- UX Etapa 1: ficha con RESUMEN SEMANAL arriba, reacciones de un toque y constancia / insignias ----------
  const fmtRange = (a, b) => `${new Date(a + 'T12:00:00').getDate()}–${fmtDay(b)}`;
  const agoText = (iso) => { if (!iso) return 'todavía no registra nada'; const n = Math.round((Date.parse(todayBo() + 'T00:00:00Z') - Date.parse(iso + 'T00:00:00Z')) / 86400000); return n <= 0 ? 'hoy' : n === 1 ? 'ayer' : `hace ${n} días`; };
  // UX Etapa 2: aviso de restricción de salud (L4, sin detalle) y meta de proteína que propone el coach (L5).
  function renderDetailEtapa2(c) {
    const salud = window.Etapa2 ? Etapa2.coachHealth(c.info) : null;
    const box = $('#fc-salud');
    box.classList.toggle('hidden', !salud);
    box.innerHTML = salud ? salud.parts.map((x) => `<p><strong>${esc(x.title)}</strong><br><span class="small">${esc(x.sub)}</span></p>`).join('') : '';
    // Estilo v2 (r1 v1.12, concepto jurídico 4): «Reportó dolor · fecha» con «Marcar revisado». Sin detalle clínico (no se sabe qué duele).
    const d = $('#fc-dolor');
    d.classList.toggle('hidden', !c.info.painReported);
    if (c.info.painReported) $('#fc-dolor-t').textContent = `Reportó dolor · ${fmtDay(c.info.painReported)}`;
    const g = c.info.proteinGoal;
    $('#fc-meta-val').textContent = g ? `~${g} g ›` : 'Sin meta ›';
  }
  function renderDetailSemana(c, sh) {
    const at = Coach.atencion(c.state, { today: todayBo(), shares: sh });
    const w = at.ws;
    $('#coach-detail-last').textContent = `Último registro: ${agoText(at.lastDate)}`;
    $('#coach-detail-light').innerHTML = `<span class="sem sem-${at.level}"><span aria-hidden="true">${SEM_ICON[at.level]}</span> ${esc(at.label)}</span> ${esc(at.reason)}`;
    $('#fc-semana-title').textContent = `Esta semana (${fmtRange(w.from, w.to)})`;
    const t = [];
    if (sh.body !== false) { t.push([w.weight ? w.weight.text : '—', 'tendencia de peso']); t.push([w.waist ? w.waist.text : '—', 'cintura']); }
    t.push([w.daysLoggedText, 'adherencia']);
    t.push(sh.habits ? [w.trainedText, 'esta semana'] : ['No comparte', 'sus hábitos']);
    if (sh.nutrition) t.push([w.proteinText || '—', 'proteína promedio']);
    if (sh.habits) t.push([w.closeText || '—', 'cierre del día']);
    $('#fc-sum').innerHTML = t.map(([a, b]) => `<div><b>${esc(a)}</b><small>${esc(b)}</small></div>`).join('');
    const lastMed = (c.state.entries || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
    $('#fc-link-med').textContent = lastMed ? `Última ${fmtDay(lastMed.date)} ›` : 'Ver ›';
    $('#fc-esfuerzo').textContent = sh.habits ? (w.effortText || 'Esfuerzo: sin respuestas esta semana') : '';
    const REACT = [['¡Bien esta semana!', '¡Bien esta semana!'], ['Sigue así', 'Sigue así'], ['Te falta medirte', 'Te falta medirte esta semana. Cuando puedas, anótalo.'], ['Te escribo', 'Te escribo hoy para hablar de tu semana.']];
    $('#fc-react-btns').innerHTML = REACT.map(([l, b], i) => `<button type="button" data-react="${i}" aria-pressed="${i === reactSel}">${esc(l)}</button>`).join('');
    reactBodies = REACT.map((r) => r[1]);
    reactLabels = REACT.map((r) => r[0]);
    renderReeng(c, at);
    const rv = readReviewed()[c.info.clientId] === todayBo();
    const b = $('#btn-fc-revisado');
    b.textContent = rv ? 'Revisado hoy ✓' : 'Revisado ✓';
    b.setAttribute('aria-pressed', String(rv));
    const hasPrev = shownOrder.length > 1 || cache.size > 1;
    $('#btn-coach-prev').disabled = !hasPrev; $('#btn-coach-next').disabled = !hasPrev;
  }
  // Piloto 3: aviso de reenganche a los 7 días sin registrar (el texto lo edita el coach; se envía como nota existente).
  let reengFor = null, reengTpl = [], reengSel = 0;
  function renderReeng(c, at) {
    const card = $('#fc-reeng');
    if (!card) return;
    const r = window.Piloto ? Piloto.avisoCoach({ days: at.days, name: displayName(c) }) : { show: false };
    card.classList.toggle('hidden', !r.show);
    if (!r.show) { reengFor = null; return; }
    $('#fc-reeng-head').textContent = r.headline;
    $('#fc-reeng-action').textContent = r.action;
    card.dataset.urgent = String(r.urgent);
    if (reengFor !== c.info.clientId) {
      reengTpl = r.templates; reengSel = 0;
      $('#fc-reeng-tpl').innerHTML = r.templates.map((t, i) => `<button type="button" data-tpl="${i}" aria-pressed="${i === 0}">${esc(t.label)}</button>`).join('');
      $('#fc-reeng-msg').value = r.message; $('#fc-reeng-status').textContent = ''; reengFor = c.info.clientId;
    }
  }
  let reactBodies = [], reactLabels = [], reactSel = 0;   // la reacción elegida (por defecto la primera); «Enviar» la manda como nota del coach
  const REVIEWED_KEY = PGNS.key('revisados');   // «Revisado ✓»: solo en el teléfono del coach
  const readReviewed = () => { try { const x = JSON.parse(localStorage.getItem(REVIEWED_KEY) || '{}'); return x && typeof x === 'object' ? x : {}; } catch { return {}; } };
  function renderDetailConst(c, sh) {
    void sh;
    const today = todayBo();
    const sm = Constancia.summary(c.state, today, { pauses: c.info.pauses || [] });   // UX Etapa 2: congelada en pausa
    // Insignias v4 (diseño B): las mismas siluetas y niveles que ve la persona, solo con SUS registros. Sin ranking ni comparación con nadie.
    // Retos y Equipo no se muestran aquí: viven en el teléfono de la persona (sus marcas y la meta del team, que el coach ve agregada en Retos).
    const lg = window.PGLogros ? PGLogros.coachHtml(c.state, today, { pauses: c.info.pauses || [] }) : null;
    const bc = lg ? { earned: lg.earned, total: lg.total } : Constancia.badgeCount(Constancia.badges(c.state, today));
    $('#fc-const-sum').innerHTML = [[sm.constantWeeks, sm.constantWeeks === 1 ? 'semana constante' : 'semanas constantes'], [`${sm.week.comodines} de 2`, 'comodines esta semana'], [`${bc.earned} de ${bc.total}`, 'insignias']]
      .map(([a, b]) => `<div><b>${esc(a)}</b><small>${esc(b)}</small></div>`).join('');
    const weeks = [...sm.history.slice(-5), sm.week];
    $('#fc-weeks').innerHTML = weeks.map((w) => `<li class="${w.frozen ? 'fz' : ''}" aria-label="Semana del ${esc(fmtDay(w.start))}: ${w.registered} días con registro${w.frozen ? ' (con días en pausa: no cuentan)' : ''}">${w.registered}</li>`).join('');
    $('#fc-ins').innerHTML = lg ? lg.html : '';
    const first = displayName(c).split(/\s+/)[0];
    $('#btn-fc-felicitar').textContent = `Felicitar a ${first}`;
    $('#fc-link-const').textContent = `${bc.earned} de ${bc.total} ›`;
  }
  async function sendReaction(body, label, { undo = true } = {}) {
    const c = cache.get(current);
    if (!c) return false;
    const id = Schema.uuid();
    try {
      await A.remote.coach.addComment(current, { id, refDate: today(), body: body.slice(0, 1000) });
      await reloadCurrent();
      toast(`Enviado: «${label}»`);
      void undo;
      return true;
    } catch (err) { toast(errText(err), true); return false; }
  }
  // Estilo v2 (r1 v1.12): el coach marca como revisado el aviso de dolor (en la lista o en la ficha).
  async function reviewPain(clientId) {
    const c = cache.get(clientId);
    if (!c) return;
    try {
      const out = await A.remote.coach.reviewPain(clientId);
      c.info = { ...c.info, painReported: out.painReported };
      renderList();
      if (current === clientId) renderDetailEtapa2(c);
      toast(`Marcado como revisado: ${displayName(c)}`);
      const back = document.querySelector(`#coach-clients [data-client="${CSS.escape(clientId)}"]`);
      if (current !== clientId && back) back.focus();
    } catch (err) { toast(errText(err), true); }
  }
  // UX Etapa 2: la barra de la ficha vuelve al regresar de la meta de proteína (app.js avisa con pg:ficha-bar).
  document.addEventListener('pg:ficha-bar', () => { const c = current && cache.get(current); if (c) { fichaBar(true, displayName(c)); renderDetail(c); } });
  window.PGCoachPanel = {
    current: () => { const c = current && cache.get(current); return c ? { clientId: current, name: displayName(c), info: c.info, state: c.state } : null; },
    setInfo: (clientId, patch) => { const c = cache.get(clientId); if (c) { c.info = { ...c.info, ...patch }; renderList(); } },
    clients: () => [...cache.values()].map((c) => ({ clientId: c.info.clientId, name: displayName(c), info: c.info })),
    rows: () => [...cache.values()].map((c) => ({ clientId: c.info.clientId, name: displayName(c), info: c.info, state: c.state })),   // r1 v1.13: Analítica («Necesitan atención» reusa el semáforo)
    open: (clientId) => { if (!cache.has(clientId)) return false; if (window.PGNav) PGNav.show('coach'); openClient(clientId); return true; },
    loaded: () => loadedOnce,
    load: () => loadClients(),
    toast,
  };
  function wireFicha() {
    $('#fc-link-meta').addEventListener('click', () => { const c = current && cache.get(current); if (c) document.dispatchEvent(new CustomEvent('pg:open-meta', { detail: { clientId: current } })); });
    $('#fc-react-btns').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-react]');
      if (!b) return;
      reactSel = Number(b.dataset.react);
      document.querySelectorAll('#fc-react-btns [data-react]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    });
    $('#fc-reeng-tpl').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-tpl]');
      if (!b || !reengTpl[Number(b.dataset.tpl)]) return;
      reengSel = Number(b.dataset.tpl);
      document.querySelectorAll('#fc-reeng-tpl [data-tpl]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      $('#fc-reeng-msg').value = reengTpl[reengSel].text;
      $('#fc-reeng-status').textContent = '';
    });
    $('#btn-fc-reeng').addEventListener('click', async () => {
      const body = $('#fc-reeng-msg').value.trim();
      if (!body) { $('#fc-reeng-status').textContent = 'Escribe un mensaje antes de enviar.'; return; }
      if (!(await sendReaction(body, 'Mensaje de reenganche'))) return;
      reengFor = null;
      $('#fc-reeng-status').textContent = 'Enviado como nota. Tu asesorado la verá en Inicio.';
    });
    $('#btn-fc-enviar').addEventListener('click', () => sendReaction(reactBodies[reactSel], reactLabels[reactSel]));
    $('#btn-fc-felicitar').addEventListener('click', () => { const c = cache.get(current); if (c) sendReaction(`¡Felicitaciones, ${displayName(c).split(/\s+/)[0]}! Tu constancia se nota.`, 'Felicitaciones'); });
    $('#btn-fc-revisado').addEventListener('click', () => {
      const m = readReviewed(), id = current;
      if (m[id] === todayBo()) delete m[id]; else m[id] = todayBo();
      try { localStorage.setItem(REVIEWED_KEY, JSON.stringify(m)); } catch { /* sin espacio */ }
      const c = cache.get(id);
      if (c) renderDetailSemana(c, c.info.shares || {});
      $('#fc-react-status').textContent = m[id] ? 'Marcado como revisado hoy.' : 'Quitamos la marca de revisado.';
    });
    const step = (d) => {
      const ids = shownOrder.includes(current) ? shownOrder : orderedRows('todos').map((r) => r.c.info.clientId);
      if (ids.length < 2) return;
      const i = ids.indexOf(current);
      openClient(ids[(i + d + ids.length) % ids.length]);
    };
    $('#btn-coach-prev').addEventListener('click', () => step(-1));
    $('#btn-coach-next').addEventListener('click', () => step(1));
  }

  function renderDetailLegacy(c, sh) {
    const s = c.sum, w = s.weight;
    const rows = [
      ['Peso actual', w.current != null ? `${num(w.current)} kg` : '—'],
      ['Inicio → meta', `${w.start != null ? num(w.start) + ' kg' : '—'} → ${w.goal != null ? num(w.goal) + ' kg' : '—'}`],
      ['Cambio total', w.change != null ? `${signed(w.change)} kg` : '—'],
      ['Tendencia (media 7 días)', w.trend != null ? `${num(w.trend, 2)} kg` : '—'],
      ['Ritmo semanal', w.weeklyRate != null ? `${signed(w.weeklyRate, 2)} kg/sem (${signed(w.weeklyRatePct, 2)} %)` : 'Faltan pesajes'],
      ['% de grasa', s.bodyFat ? `${num(s.bodyFat.current)} % (${signed(s.bodyFat.current - s.bodyFat.first)} pts desde el inicio)` : '—'],
    ];
    if (sh.nutrition && s.target) rows.push(['Objetivo diario', `${s.target.kcal} kcal · ${s.target.protein} g de proteína`]);
    $('#coach-detail-summary').innerHTML = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');

    // Adherencia 1/2/4 semanas: solo columnas de categorías compartidas.
    const cols = [['Días con registro', (a) => a.anyDays], ['Pesajes', (a) => a.weighIns]];
    if (sh.nutrition) {
      cols.push(['Días con comidas', (a) => a.foodDays]);
      cols.push(['Proteína media', (a) => (a.proteinAvg == null ? '—' : `${a.proteinAvg} g${s.target ? ' / ' + s.target.protein + ' g' : ''}`)]);
    }
    if (sh.habits) cols.push(['Días con hábitos', (a) => a.habitDays]);
    $('#coach-detail-adherence').innerHTML = `<thead><tr><th scope="col">Periodo</th>${cols.map(([h]) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>` +
      s.adherence.map((a) => `<tr><th scope="row">${a.days / 7} sem</th>${cols.map(([, f]) => `<td>${esc(f(a))}</td>`).join('')}</tr>`).join('') + '</tbody>';
  }
  function renderDetail(c) {
    const sh = c.info.shares || {};
    $('#coach-detail-title').textContent = displayName(c);
    if (PROD.coach) { renderDetailPay(c, sh); renderDetailComidas(c, sh); renderDetailSemana(c, sh); renderDetailConst(c, sh); renderDetailEtapa2(c); }
    else $('#coach-detail-light').innerHTML = `${statusChip(c.st)} ${esc(c.st.line)}`;
    const yes = Object.keys(SHARE_NAMES).filter((k) => sh[k]).map((k) => SHARE_NAMES[k]);
    const no = Object.keys(SHARE_NAMES).filter((k) => !sh[k]).map((k) => SHARE_NAMES[k]);
    $('#coach-detail-shares').textContent = `Te muestra: ${yes.join(', ') || '—'}. No te muestra: ${no.join(', ') || '—'}. Es tu cliente desde el ${new Date(c.info.since).toLocaleDateString('es')}.`;

    // Progreso (categoría body, obligatoria). Nunca notas ni biblioteca.
    // Producto «coach»: estas dos tarjetas son las heredadas (ocultas) y traen «Objetivo diario» y metas de proteína calculadas por la plataforma:
    // la plataforma no prescribe (concepto jurídico, L5), así que ni se dibujan.
    if (!PROD.coach) renderDetailLegacy(c, sh);

    // Fotos (solo si las compartió; metadatos de coach_pull). La imagen se pide al abrirla: URL firmada de corta
    // duración + registro photo_views en cada apertura. No se guarda ni la URL ni el blob.
    const photos = (c.data.photos || []).filter((p) => !p.deletedAt).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    $('#coach-detail-photos-card').classList.toggle('hidden', !sh.photos || (!photos.length && !PROD.coach));
    if (PROD.coach) fillCompare(photos);
    $('#coach-detail-photos').innerHTML = !photos.length && PROD.coach ? '<li class="small muted">Todavía no marcó fotos para ti.</li>' : photos.map((p) => `<li><button type="button" class="btn btn-ghost" data-photo="${esc(p.id)}">Ver foto: ${esc(fmtDay(p.date))} · ${esc(p.pose)}</button></li>`).join('');

    renderComments(c);
  }

  function renderComments(c) {
    const list = (c.data.comments || []).filter((x) => !x.deletedAt).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    $('#coach-comments').innerHTML = list.length ? list.map((x) => `<li>
      <p class="note-body">${esc(x.body)}</p>
      <div class="note-meta"><span>Sobre el ${esc(fmtDay(x.refDate))} · ${esc(fmtStamp(x.createdAt))} · <strong>${x.readAt ? 'Leído' : 'No leído'}</strong></span>
      <button type="button" class="btn-link small" data-del-comment="${esc(x.id)}">Borrar</button></div></li>`).join('')
      : '<li class="small muted">Sin comentarios todavía.</li>';
  }

  // Comparar antes / después: dos fotos compartidas (cada una se abre con su propio enlace de 60 s y queda registrada).
  let cmpURLs = [];
  function freeCompare() { cmpURLs.forEach((u) => URL.revokeObjectURL(u)); cmpURLs = []; const o = $('#coach-compare-out'); if (o) { o.replaceChildren(); o.classList.add('hidden'); } }
  function fillCompare(photos) {
    freeCompare();
    const box = $('#coach-compare');
    box.classList.toggle('hidden', photos.length < 2);
    const opts = photos.map((p) => `<option value="${esc(p.id)}">${esc(fmtDay(p.date))} · ${esc(p.pose)}</option>`).join('');
    $('#coach-cmp-a').innerHTML = opts; $('#coach-cmp-b').innerHTML = opts;
    if (photos.length > 1) { $('#coach-cmp-a').value = photos[0].id; $('#coach-cmp-b').value = photos[photos.length - 1].id; }
  }
  async function compareNow() {
    const c = cache.get(current);
    if (!c) return;
    const find = (id) => (c.data.photos || []).find((x) => x.id === id);
    const a = find($('#coach-cmp-a').value), b = find($('#coach-cmp-b').value);
    if (!a || !b) return;
    try {
      const [ba, bb] = [await A.remote.coach.photoBlob(current, a), await A.remote.coach.photoBlob(current, b)];
      freeCompare();
      cmpURLs = [URL.createObjectURL(ba), URL.createObjectURL(bb)];
      const out = $('#coach-compare-out');
      const fig = (url, p, label) => { const f = document.createElement('figure'); const i = document.createElement('img'); i.src = url; i.alt = `${label}: foto de ${displayName(c)}, ${fmtDay(p.date)}, ${p.pose}`; const cap = document.createElement('figcaption'); cap.className = 'small'; cap.textContent = `${label} · ${fmtDay(p.date)} · ${p.pose}`; f.append(i, cap); return f; };
      out.replaceChildren(fig(cmpURLs[0], a, 'Antes'), fig(cmpURLs[1], b, 'Después'));
      out.classList.remove('hidden');
    } catch (err) { toast(errText(err), true); }
  }

  async function reloadCurrent() {
    const c = cache.get(current);
    if (!c) return;
    try {
      c.data = await A.remote.coach.clientData(current);
      c.state = Coach.stateFromWire(c.data.records);
      c.st = ClientStatus.estado(c.state, { today: today(), shares: c.info.shares });
      c.sum = Coach.summarize(c.state, { today: today() });
      renderDetail(c);
    } catch (err) {
      toast(errText(err), true);
      if (err && err.code === 'forbidden') { cache.delete(current); renderList(); showList(); }
    }
  }

  // ---------- Eventos del coach ----------
  function wireCoach() {
    $('#tab-coach').addEventListener('click', () => { renderGate(); showList(); loadClients(); });
    // ＋ Invitar: la vista con el mensaje de WhatsApp y el código; se refresca el código del coach sin cargar toda la lista.
    $('#tab-invitar').addEventListener('click', async () => {
      renderGate();
      if (agreementOK()) {
        renderInvite((A.meta() || {}).coach);
        try { const mine = await A.remote.coach.myCoach(); A.setMeta({ coach: mine }); renderInvite(mine); } catch { /* sin conexión: se ve el código guardado */ }
      }
      $('#invitar-title').focus();
    });
    $('#btn-coach-refresh').addEventListener('click', loadClients);
    $('#invite-name').addEventListener('input', renderInvitePreview);
    $('#btn-invite-copy').addEventListener('click', copyInviteLink);
    $('#btn-invite-qr').addEventListener('click', openQr);
    $('#qr-close').addEventListener('click', closeQr);
    $('#sheet-qr').addEventListener('click', (ev) => { if (ev.target === ev.currentTarget) closeQr(); }); // toque en el fondo
    $('#sheet-qr').addEventListener('close', () => {
      $('#qr-box').innerHTML = ''; $('#qr-code').textContent = '';
      const o = qrOpener; qrOpener = null;
      if (o && o.isConnected && !o.disabled) o.focus(); else $('#invitar-title').focus();
    });
    $('#btn-invite-wa').addEventListener('click', (ev) => { if (!inviteParts()) ev.preventDefault(); });
    renderInvitePreview();
    $('#coach-clients').addEventListener('click', (ev) => {
      const r = ev.target.closest('[data-pain-review]');
      if (r) { reviewPain(r.dataset.painReview); return; }
      const b = ev.target.closest('[data-client]');
      if (b) openClient(b.dataset.client);
    });
    $('#btn-fc-dolor').addEventListener('click', () => { if (current) reviewPain(current); });
    $('#btn-coach-back').addEventListener('click', () => showList(current));
    $('#btn-coach-compare').addEventListener('click', compareNow);
    wirePay();
    if (PROD.coach) wireFicha();
    $('#form-rotate').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = ev.currentTarget;
      if (!confirm('¿Crear un código nuevo? El de ahora ya no servirá para clientes nuevos (los que ya tienes siguen igual).')) return;
      const opt = {};
      if (f.elements.validDays.value) opt.validDays = Number(f.elements.validDays.value);
      if (f.elements.maxUses.value) opt.maxUses = Number(f.elements.maxUses.value);
      try {
        await A.remote.coach.rotateCode(opt);
        const mine = await A.remote.coach.myCoach();
        A.setMeta({ coach: mine });
        renderInvite(mine);
        toast('Código nuevo listo');
      } catch (err) { toast(errText(err), true); }
    });
    $('#coach-detail-photos').addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-photo]');
      if (!b || !current) return;
      const c = cache.get(current);
      const p = (c.data.photos || []).find((x) => x.id === b.dataset.photo);
      if (!p) return;
      try {
        const blob = await A.remote.coach.photoBlob(current, p); // URL nueva en cada apertura (60 s) + photo_views
        freePhoto();
        photoURL = URL.createObjectURL(blob);
        const fig = $('#coach-photo-view');
        const img = fig.querySelector('img');
        img.src = photoURL;
        img.alt = `Foto de progreso de ${displayName(c)}: ${fmtDay(p.date)}, ${p.pose}`;
        fig.querySelector('figcaption').textContent = `${fmtDay(p.date)} · ${p.pose}`;
        fig.classList.remove('hidden');
      } catch (err) { toast(errText(err), true); }
    });
    const body = $('#comment-body');
    body.addEventListener('input', () => { $('#comment-count').textContent = `${body.value.length} / 1000`; });
    $('#form-comment').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const text = body.value.trim();
      const err = $('#comment-error');
      if (!text) { err.textContent = 'Escribe el comentario.'; err.classList.remove('hidden'); body.focus(); return; }
      err.classList.add('hidden');
      try {
        await A.remote.coach.addComment(current, { id: Schema.uuid(), refDate: $('#comment-date').value || today(), body: text.slice(0, 1000) });
        body.value = '';
        $('#comment-count').textContent = '0 / 1000';
        await reloadCurrent();
        toast('Comentario enviado');
        body.focus();
      } catch (e) { err.textContent = errText(e); err.classList.remove('hidden'); }
    });
    $('#coach-comments').addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-del-comment]');
      if (!b || !confirm('¿Borrar este comentario? Tu cliente dejará de verlo.')) return;
      try { await A.remote.coach.deleteComment(b.dataset.delComment); await reloadCurrent(); toast('Comentario borrado'); $('#comment-body').focus(); }
      catch (err) { toast(errText(err), true); }
    });
    $('#btn-end-client').addEventListener('click', async () => {
      const c = cache.get(current);
      if (!c || !confirm(`¿Dejar de acompañar a «${displayName(c)}»? Ya no verás sus datos.`)) return;
      const name = displayName(c), id = current;
      try {
        await A.remote.coach.endClient(id);
        endedByMe.add(id);
        ended.push(name);
        toast('Listo: ya no ves sus datos');
        await loadClients();
        endedByMe.delete(id);
        showList();
      }
      catch (err) { toast(errText(err), true); }
    });
  }

  // ---------- Cliente: notas de su coach (HU-P07) ----------
  // Los comentarios llegan con la sincronización (S3-3 los guardará en perdida-grasa:comments). Mientras sync.js no
  // exista, este puente los pide con remote.sync.pull y guarda SOLO los comentarios.
  const readComments = () => { try { const x = JSON.parse(localStorage.getItem(COMMENTS_KEY) || '[]'); return Array.isArray(x) ? x : []; } catch { return []; } };
  const writeComments = (list) => { try { localStorage.setItem(COMMENTS_KEY, JSON.stringify(list)); } catch { /* sin espacio */ } };
  async function refreshNotes() {
    const meta = A && A.meta();
    const s = A && await A.remote.auth.session();
    const signedIn = !!(s && meta && meta.userId === s.user.id);
    if (signedIn && !window.PGSync) {
      try {
        const out = await A.remote.sync.pull('1970-01-01T00:00:00.000Z');
        const byId = new Map(readComments().map((c) => [c.id, c]));
        for (const c of out.comments || []) byId.set(c.id, c);
        writeComments([...byId.values()].filter((c) => c.clientId === s.user.id));
      } catch { /* sin conexión: se muestran los guardados */ }
    }
    renderNotes(signedIn ? s.user.id : null);
  }
  function renderNotes(userId) {
    const list = readComments().filter((c) => userId && c.clientId === userId && !c.deletedAt).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const card = $('#coach-notes');
    const unread = list.filter((c) => !c.readAt).length;
    // UX Etapa 1 (producto coach): arriba en Inicio solo van las notas SIN LEER; las leídas bajan a «Mensajes anteriores» (al final).
    const shown = PROD.coach ? list.filter((c) => !c.readAt) : list;
    card.classList.toggle('hidden', !shown.length);
    const badge = $('#coach-notes-unread');
    badge.textContent = unread ? `${unread} sin leer` : '';
    badge.classList.toggle('hidden', !unread);
    if (PROD.coach && $('#coach-notes-title').firstChild) { const mm = A.meta && A.meta(), nm = mm && mm.link && mm.link.businessName; $('#coach-notes-title').firstChild.textContent = nm ? `${nm} te escribió ` : 'Tu coach te escribió '; }
    const li = (c, withBtn) => `<li class="${c.readAt ? '' : 'unread'}">
      <p class="note-body">${esc(c.body)}</p>
      <div class="note-meta"><span>Sobre el ${esc(fmtDay(c.refDate))} · ${esc(fmtStamp(c.createdAt))}</span>
      ${c.readAt ? '<span>Leído</span>' : withBtn ? `<button type="button" class="btn-link small" data-read-comment="${esc(c.id)}">Marcar como leído</button>` : ''}</div></li>`;
    $('#coach-notes-list').innerHTML = shown.map((c) => li(c, true)).join('');
    if (PROD.coach) {
      const old = list.filter((c) => c.readAt);
      $('#coach-notes-old').classList.toggle('hidden', !old.length);
      $('#coach-notes-old-sum').textContent = `Mensajes anteriores de tu coach (${old.length})`;
      $('#coach-notes-old-list').innerHTML = old.map((c) => li(c, false)).join('');
    }
  }
  function wireClient() {
    $('#coach-notes-list').addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-read-comment]');
      if (!b) return;
      const id = b.dataset.readComment;
      try {
        await A.remote.client.markCommentRead(id);
        writeComments(readComments().map((c) => (c.id === id ? { ...c, readAt: new Date().toISOString() } : c)));
        const s = await A.remote.auth.session();
        renderNotes(s && s.user.id);
        const nt = PROD.coach ? $('#home-greeting') : $('#coach-notes-title');
        nt.setAttribute('tabindex', '-1');
        nt.focus();
      } catch (err) { toast(A.errorText(err, 'notes'), true); }
    });
    $('#tab-panel').addEventListener('click', refreshNotes);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshNotes(); });
  }

  function start() {
    if (A || !window.PGAccount) return;
    A = window.PGAccount;
    wireGate();
    renderGate();
    wireAgreement();
    wireCoach();
    wireClient();
    if (PROD.coach) { $('#coach-title-list').textContent = 'Mis asesorados'; $('#btn-coach-back').textContent = '← Mis asesorados'; }
    refreshNotes();
    document.addEventListener('pg:account-changed', (ev) => {
      if (!(ev.detail && ev.detail.isCoach)) { cache.clear(); if ($('#view-coach').classList.contains('active') || $('#view-invitar').classList.contains('active')) $('#tab-panel').click(); }
      refreshNotes();
    });
  }
  if (window.PGAccount) start();
  else document.addEventListener('pg:account-ready', start);
})();
