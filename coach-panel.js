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
  const SHARE_NAMES = { body: 'peso, medidas y perfil', nutrition: 'comidas', habits: 'hábitos', notes: 'notas', photos: 'fotos' };

  let A = null;           // PGAccount (remote + metadatos)
  const cache = new Map(); // clientId → { info, data, state, sem, sum }
  let current = null;      // clientId abierto en la ficha
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
    if (err && err.code === 'forbidden') return 'Este cliente ya no comparte sus datos contigo.';
    return A ? A.errorText(err, 'coach') : 'No se pudo conectar con el servidor.';
  };
  const displayName = (c) => (c.info.displayName || (c.state.profile && c.state.profile.name) || 'Cliente sin nombre');

  // ---------- Coach: lista ----------
  async function loadClients() {
    const status = $('#coach-list-status');
    status.textContent = 'Cargando clientes…';
    try {
      const [mine, list] = await Promise.all([A.remote.coach.myCoach(), A.remote.coach.clients()]);
      A.setMeta({ coach: mine });
      renderInvite(mine);
      cache.clear();
      const ref = today();
      await Promise.all(list.map(async (info) => {
        try {
          const data = await A.remote.coach.clientData(info.clientId);
          const state = Coach.stateFromWire(data.records);
          cache.set(info.clientId, { info, data, state, st: ClientStatus.estado(state, { today: ref, shares: info.shares }), sum: Coach.summarize(state, { today: ref }) });
        } catch (err) {
          if (!(err && err.code === 'forbidden')) throw err; // revocado entre una llamada y otra: se omite
        }
      }));
      renderList();
      const over = list.filter((c) => c.overFreeLimit).length;
      const limit = $('#coach-limit');
      limit.classList.toggle('hidden', !over);
      limit.textContent = over ? `Tienes ${list.length} clientes: pasas del límite gratuito de ${mine ? mine.freeClients : 5}. Te contactaremos para el plan fundador; nadie pierde el acceso.` : '';
      status.textContent = list.length ? `Actualizado a las ${new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}.` : '';
    } catch (err) {
      status.textContent = errText(err);
    }
  }

  // Sprint 4: filas con avatar de iniciales, nombre, última actividad y estado con TEXTO ("Al día", "Se atrasa", "Sin registrar").
  // El estado y el peso salen de ClientStatus (puro) y solo de lo que coach_pull entrega y el cliente compartió.
  function statusChip(st) { return `<span class="chip chip-${esc(st.key)}">${esc(st.label)}</span>`; }
  function renderList() {
    const ul = $('#coach-clients');
    const items = [...cache.values()].sort((a, b) => ClientStatus.byUrgency(a.st, b.st));
    $('#coach-subtitle').textContent = ClientStatus.subtitle(items.map((c) => c.st));
    if (!items.length) {
      const code = (A.meta() || {}).coach;
      ul.innerHTML = `<li class="small muted">Aún no tienes clientes. Comparte tu código${code ? ` <strong>${esc(code.inviteCode)}</strong>` : ''} para que se conecten contigo.</li>`;
      return;
    }
    ul.innerHTML = items.map((c) => {
      const name = displayName(c);
      return `<li><button type="button" class="cli-row client-btn" data-client="${esc(c.info.clientId)}" aria-label="${esc(name)}: ${esc(c.st.label)}. ${esc(c.st.line)}">
        <span class="cli-av av${ClientStatus.hue(name)}" aria-hidden="true">${esc(ClientStatus.initials(name))}</span>
        <span class="cli-text"><span class="cli-name who">${esc(name)}</span><span class="cli-line meta">${esc(c.st.line)}</span></span>
        ${statusChip(c.st)}
      </button></li>`;
    }).join('');
  }

  // A1: invitación por WhatsApp. Todo lo que escribe una persona entra al DOM con textContent y a la URL con encodeURIComponent.
  function inviteParts() {
    const mine = A && (A.meta() || {}).coach;
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

  function renderInvite(mine) {
    if (!mine) return;
    renderInvitePreview();
    $('#coach-invite-code').textContent = mine.inviteCode;
    const parts = [mine.expiresAt ? `Válido hasta el ${new Date(mine.expiresAt).toLocaleDateString('es')}` : 'Sin caducidad',
      mine.maxUses ? `usado ${mine.uses} de ${mine.maxUses} veces` : `usado ${mine.uses || 0} veces, sin límite`];
    $('#coach-invite-info').textContent = parts.join(' · ') + '.';
  }

  // ---------- Coach: ficha ----------
  function showList(focusId) {
    current = null;
    freePhoto();
    $('#coach-detail-view').classList.add('hidden');
    $('#coach-list-view').classList.remove('hidden');
    const btn = focusId && document.querySelector(`#coach-clients [data-client="${CSS.escape(focusId)}"]`);
    (btn || $('#coach-title-list')).focus();
  }
  function freePhoto() {
    if (photoURL) URL.revokeObjectURL(photoURL);
    photoURL = null;
    const fig = $('#coach-photo-view');
    fig.classList.add('hidden');
    fig.querySelector('img').removeAttribute('src');
  }

  async function openClient(clientId) {
    const c = cache.get(clientId);
    if (!c) return;
    current = clientId;
    freePhoto();
    $('#coach-list-view').classList.add('hidden');
    $('#coach-detail-view').classList.remove('hidden');
    renderDetail(c);
    $('#coach-detail-title').focus();
    $('#comment-date').value = today();
  }

  function renderDetail(c) {
    const sh = c.info.shares || {};
    $('#coach-detail-title').textContent = displayName(c);
    $('#coach-detail-light').innerHTML = `${statusChip(c.st)} ${esc(c.st.line)}`;
    const yes = Object.keys(SHARE_NAMES).filter((k) => sh[k]).map((k) => SHARE_NAMES[k]);
    const no = Object.keys(SHARE_NAMES).filter((k) => !sh[k]).map((k) => SHARE_NAMES[k]);
    $('#coach-detail-shares').textContent = `Te muestra: ${yes.join(', ') || '—'}. No te muestra: ${no.join(', ') || '—'}. Es tu cliente desde el ${new Date(c.info.since).toLocaleDateString('es')}.`;

    // Progreso (categoría body, obligatoria). Nunca notas ni biblioteca.
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

    // Fotos (solo si las compartió; metadatos de coach_pull). La imagen se pide al abrirla: URL firmada de corta
    // duración + registro photo_views en cada apertura. No se guarda ni la URL ni el blob.
    const photos = (c.data.photos || []).filter((p) => !p.deletedAt).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    $('#coach-detail-photos-card').classList.toggle('hidden', !sh.photos || !photos.length);
    $('#coach-detail-photos').innerHTML = photos.map((p) => `<li><button type="button" class="btn btn-ghost" data-photo="${esc(p.id)}">Ver foto: ${esc(fmtDay(p.date))} · ${esc(p.pose)}</button></li>`).join('');

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
    $('#tab-coach').addEventListener('click', () => { showList(); loadClients(); });
    // ＋ Invitar: la vista con el mensaje de WhatsApp y el código; se refresca el código del coach sin cargar toda la lista.
    $('#tab-invitar').addEventListener('click', async () => {
      renderInvite((A.meta() || {}).coach);
      try { const mine = await A.remote.coach.myCoach(); A.setMeta({ coach: mine }); renderInvite(mine); } catch { /* sin conexión: se ve el código guardado */ }
      $('#invitar-title').focus();
    });
    $('#btn-coach-refresh').addEventListener('click', loadClients);
    $('#invite-name').addEventListener('input', renderInvitePreview);
    $('#btn-invite-copy').addEventListener('click', copyInviteLink);
    $('#btn-invite-wa').addEventListener('click', (ev) => { if (!inviteParts()) ev.preventDefault(); });
    renderInvitePreview();
    $('#coach-clients').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-client]');
      if (b) openClient(b.dataset.client);
    });
    $('#btn-coach-back').addEventListener('click', () => showList(current));
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
      try { await A.remote.coach.endClient(current); toast('Listo: ya no ves sus datos'); await loadClients(); showList(); }
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
    card.classList.toggle('hidden', !list.length);
    const unread = list.filter((c) => !c.readAt).length;
    const badge = $('#coach-notes-unread');
    badge.textContent = unread ? `${unread} sin leer` : '';
    badge.classList.toggle('hidden', !unread);
    $('#coach-notes-list').innerHTML = list.map((c) => `<li class="${c.readAt ? '' : 'unread'}">
      <p class="note-body">${esc(c.body)}</p>
      <div class="note-meta"><span>Sobre el ${esc(fmtDay(c.refDate))} · ${esc(fmtStamp(c.createdAt))}</span>
      ${c.readAt ? '<span>Leído</span>' : `<button type="button" class="btn-link small" data-read-comment="${esc(c.id)}">Marcar como leído</button>`}</div></li>`).join('');
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
        $('#coach-notes-title').setAttribute('tabindex', '-1');
        $('#coach-notes-title').focus();
      } catch (err) { toast(A.errorText(err, 'notes'), true); }
    });
    $('#tab-panel').addEventListener('click', refreshNotes);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshNotes(); });
  }

  function start() {
    if (A || !window.PGAccount) return;
    A = window.PGAccount;
    wireCoach();
    wireClient();
    refreshNotes();
    document.addEventListener('pg:account-changed', (ev) => {
      if (!(ev.detail && ev.detail.isCoach)) { cache.clear(); if ($('#view-coach').classList.contains('active') || $('#view-invitar').classList.contains('active')) $('#tab-panel').click(); }
      refreshNotes();
    });
  }
  if (window.PGAccount) start();
  else document.addEventListener('pg:account-ready', start);
})();
