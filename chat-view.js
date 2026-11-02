// Chat asesorado ⇄ coach (R1 v1.22; concepto jurídico 14). Asesorado: Más → «Chat con tu coach» (aviso LITERAL la primera vez). Coach: tarjeta «Chat» en la
// ficha del asesorado (antes debe aceptar el Acuerdo 1.0, cláusula 18). Solo texto, hasta 1000 caracteres. Se actualiza solo mientras está abierto.
(function (root) {
  'use strict';
  if (typeof document === 'undefined') return;
  const C = root.Chat;
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const A = () => root.PGAccount;
  const api = () => A() && A().remote && A().remote.chat;
  const meta = () => (A() && A().meta && A().meta()) || {};
  const isCoach = () => (meta().roles || []).includes('coach');
  const uuid = () => (root.crypto && root.crypto.randomUUID ? root.crypto.randomUUID() : root.Schema.uuid());
  const POLL_MS = 8000;
  let peer = null;          // null = asesorado; { id, name } = coach con ese asesorado
  let seen = new Map();     // id → mensaje (sin repetir)
  let timer = null, busy = false;

  const errText = (e) => {
    const c = e && e.code;
    if (c === 'offline') return 'Sin conexión. Revisa tu internet e inténtalo de nuevo.';
    if (c === 'rate_limited') return 'Enviaste muchos mensajes seguidos. Espera un poco y vuelve a intentar.';
    if (c === 'not_found' || c === 'forbidden') return 'Ya no hay un vínculo activo con tu coach, así que el chat no está disponible.';
    if (c === 'agreement_required') return 'Falta aceptar el Acuerdo del Coach actualizado.';
    if (c === 'consent_required') return 'Falta una autorización de tu cuenta. Revísala en Más.';
    return 'No pudimos completar la acción. Inténtalo de nuevo.';
  };
  const say = (t) => { const s = $('#chat-msg'); if (s) s.textContent = t || ''; };

  function draw() {
    const ul = $('#chat-list'); ul.replaceChildren();
    const arr = [...seen.values()].sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
    for (const m of arr) {
      const li = el('li', 'chat-msg ' + (m.mine ? 'chat-mine' : 'chat-theirs'));
      li.append(el('p', 'chat-body', m.body), el('span', 'chat-time small muted', C.stamp(m.createdAt)));
      ul.append(li);
    }
    $('#chat-empty').hidden = arr.length > 0;
    const box = $('#chat-scroll'); box.scrollTop = box.scrollHeight;
  }
  async function refresh() {
    if (busy || !api() || !$('#chat-dialog').open) return;
    busy = true;
    try {
      const last = [...seen.values()].reduce((a, m) => (m.createdAt > a ? m.createdAt : a), '');
      const list = await api().list(peer && peer.id, last || null);
      let incoming = false;
      for (const m of list) { if (!seen.has(m.id)) { seen.set(m.id, m); if (!m.mine) incoming = true; } }
      if (list.length) draw();
      if (incoming || !last) api().markRead(peer && peer.id).then(updateBadges).catch(() => {});
      say('');
    } catch (e) { say(errText(e)); }
    finally { busy = false; }
  }
  function startPolling() { stopPolling(); timer = setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS); }
  function stopPolling() { if (timer) clearInterval(timer); timer = null; }

  async function openDialog(who) {
    peer = who || null; seen = new Map(); say('');
    $('#chat-title').textContent = peer ? `Chat con ${peer.name}` : C.TEXTS.aviso.title;
    $('#chat-input').value = ''; $('#chat-count').textContent = `0/${C.MAX}`;
    const d = $('#chat-dialog'); if (!d.open) d.showModal();
    $('#chat-title').focus({ preventScroll: true });
    await refresh(); startPolling();
  }
  function closeDialog() { stopPolling(); const d = $('#chat-dialog'); if (d.open) d.close(); updateBadges(); }

  async function send(ev) {
    ev.preventDefault();
    const inp = $('#chat-input'), text = C.clean(inp.value);
    if (!text) { inp.focus(); return; }
    const btn = $('#chat-send'); btn.disabled = true; say('');
    try {
      const m = await api().send({ id: uuid(), clientId: peer && peer.id, body: text });
      seen.set(m.id, m); inp.value = ''; $('#chat-count').textContent = `0/${C.MAX}`; draw();
    } catch (e) { say(errText(e)); }
    finally { btn.disabled = false; inp.focus(); }
  }

  // ---------------- Asesorado ----------------
  const noticeKey = () => `pg:chat-aviso:${meta().userId || ''}`;
  const noticeSeen = () => { try { return root.localStorage.getItem(noticeKey()) === C.TEXTS.aviso.version; } catch { return false; } };
  const markNotice = () => { try { root.localStorage.setItem(noticeKey(), C.TEXTS.aviso.version); } catch { /* sin almacenamiento: se vuelve a mostrar */ } };
  function showNotice() {
    return new Promise((resolve) => {
      const d = $('#chat-aviso-dialog'), t = C.TEXTS.aviso;
      $('#chat-aviso-title').textContent = t.title; $('#chat-aviso-body').textContent = t.body; $('#chat-aviso-ok').textContent = t.button;
      $('#chat-aviso-ok').onclick = () => { markNotice(); d.close(); resolve(true); };
      d.addEventListener('close', () => resolve(false), { once: true });
      d.showModal(); $('#chat-aviso-title').focus({ preventScroll: true });
    });
  }
  async function openClient() {
    if (!noticeSeen() && !(await showNotice())) return;
    await openDialog(null);
  }

  // ---------------- Coach ----------------
  async function openCoach(clientId, name) {
    if (!root.ConsentTexts.chatAgreementOK(meta())) {
      const ok = root.RestrView && await root.RestrView.askAgreement({
        intro: 'Para leer y responder el chat con tus asesorados, acepta la versión actualizada del Acuerdo del Coach. Esta es la cláusula nueva:',
        clause: root.ConsentTexts.get('A7').clauseChat || '' });
      if (!ok) return;
    }
    await openDialog({ id: clientId, name: name || 'tu asesorado' });
  }
  async function coachSection(clientId, name) {
    const box = $('#fc-chat'); if (!box || !api()) return;
    const b = $('#fcc-open'), n = $('#fcc-n');
    b.onclick = () => openCoach(clientId, name);
    n.textContent = '';
    box.classList.remove('hidden');
    try { const u = (await api().unread()).find((x) => x.clientId === clientId); n.textContent = u && u.n ? `${u.n} sin leer` : ''; } catch { /* solo es un contador */ }
  }

  // ---------------- Contadores ----------------
  async function updateBadges() {
    const sub = $('#row-chat-sub'); if (!sub || !api()) return;
    const m = meta();
    $('#row-chat-li').classList.toggle('hidden', !(m.userId && m.link && !isCoach()));
    if (!(m.userId && m.link && !isCoach())) return;
    try { const n = (await api().unread()).reduce((a, x) => a + x.n, 0); sub.textContent = n ? `${n} mensaje${n > 1 ? 's' : ''} sin leer` : 'Escríbele a tu coach y recibe su respuesta'; } catch { /* sin conexión: queda el texto de siempre */ }
  }

  function wire() {
    const row = $('#row-chat'); if (!row) return;
    row.addEventListener('click', openClient);
    $('#chat-form').addEventListener('submit', send);
    $('#chat-input').addEventListener('input', () => { $('#chat-count').textContent = `${$('#chat-input').value.length}/${C.MAX}`; });
    $('#chat-input').addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) $('#chat-form').requestSubmit(); });
    for (const b of document.querySelectorAll('#chat-dialog [data-chat-close]')) b.addEventListener('click', closeDialog);
    $('#chat-dialog').addEventListener('cancel', () => { stopPolling(); });
    document.addEventListener('pg:account-changed', updateBadges); document.addEventListener('pg:account-ready', updateBadges);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    updateBadges();
  }
  root.ChatView = { coach: coachSection, updateBadges };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})(window);
