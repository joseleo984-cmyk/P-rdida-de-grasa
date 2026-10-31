// Función 5 · Vistas de la LIGA SEMANAL de constancia (concepto jurídico 7, puntos 3, 4, 8 y 12). Lógica y textos literales: liga.js.
//   · Asesorado: Progreso → Puntos → «Liga semanal de constancia». Voluntaria y apagada por defecto: «Unirme» abre el modal con el texto LITERAL y la casilla;
//     el servidor decide (grasa.liga_join). Unido: aviso de cabecera permanente, su alias y la tabla (alias y puntos, nada más) o, con menos de 5, el mensaje del mínimo.
//   · Coach: Más → Retos → «Liga semanal del team»: habilitarla = aceptar la versión del acuerdo con la cláusula 15; luego solo ve si se publica y cuántos participan.
//     Nunca alias ni personas.
// Los puntos y la tabla los CALCULA EL SERVIDOR. Todo lo que llega entra escapado. Nada de esto existe sin el producto «coach» ni sin servidor (PGAccount).
(function () {
  'use strict';
  const PROD = window.Producto || { coach: false };
  if (!PROD.coach || !window.Liga) return;
  const LG = window.Liga, CT = window.ConsentTexts;
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let A = null, my = null, coachLiga = null, busy = false;

  const meta = () => (A && A.meta()) || {};
  const isCoach = () => document.body.classList.contains('mode-coach');
  const isClient = () => { const m = meta(); return !!(m.userId && m.link && !(m.roles || []).includes('coach')); };
  const errText = (err) => (A && A.errorText ? A.errorText(err, 'coach') : 'No se pudo conectar con el servidor.');
  function toast(msg, error) {
    const t = $('#toast');
    if (!t) return;
    t.textContent = msg; t.classList.toggle('error', !!error); t.classList.add('show');
    clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.remove('show'), error ? 4000 : 2600);
  }

  // ======================= Asesorado =======================
  async function loadMine() {
    if (!A || !isClient() || isCoach()) { my = null; renderClient(); return; }
    try { my = await A.remote.client.myLiga(); } catch { /* sin conexión o SQL viejo: se queda lo último */ }
    renderClient();
  }
  function renderClient() {
    const box = $('#liga-box');
    const v = LG.view(my);
    const show = isClient() && !isCoach() && v.state !== 'off';
    box.classList.toggle('hidden', !show);
    if (!show) return;
    const body = $('#liga-body');
    if (v.state === 'invite') {
      body.innerHTML = `<p class="small">Una tabla semanal por alias, solo de constancia. Es voluntaria: no cambia nada de tu asesoría y puedes salir cuando quieras.</p>
        <button type="button" class="btn btn-tall" id="btn-liga-open">Conocer y unirme</button>`;
      return;
    }
    const head = `<p class="liga-notice" role="note">${esc(LG.NOTICE)}</p>
      <p class="small">Tu alias en la liga: <strong>${esc(v.alias)}</strong>. Cada lunes la tabla vuelve a empezar.</p>`;
    const leave = '<button type="button" class="btn btn-ghost btn-tall" id="btn-liga-leave">Salir de la liga</button>';
    if (v.state === 'waiting') { body.innerHTML = `${head}<p id="liga-min" class="liga-min">${esc(v.message)}</p>${leave}`; return; }
    body.innerHTML = `${head}<ol class="liga-table" aria-label="Tabla semanal por alias">${v.rows.map((r) => `<li class="${r.me ? 'me' : ''}"><span class="liga-rank">${r.rank}</span><span class="liga-alias">${esc(r.alias)}${r.me ? ' (tú)' : ''}</span><span class="liga-pts">${r.points} pts</span></li>`).join('')}</ol>
      <p class="small muted">Solo se muestran alias y puntos de constancia. Nunca nombres, fotos, peso, medidas ni comidas.</p>${leave}`;
  }
  function openJoin() {
    $('#lg-title').textContent = LG.TITLE;
    $('#lg-text-1').textContent = LG.CONSENT[0];
    $('#lg-text-2').textContent = LG.CONSENT[1];
    $('#lg-box').textContent = LG.BOX;
    $('#btn-lg-join').textContent = LG.BUTTON;
    $('#lg-ok').checked = false;
    $('#btn-lg-join').disabled = true;
    $('#lg-error').classList.add('hidden');
    $('#sheet-liga').showModal();
    $('#lg-title').focus();
  }
  async function join() {
    if (busy || !$('#lg-ok').checked) return;
    busy = true;
    const err = $('#lg-error');
    err.classList.add('hidden');
    try {
      if (!(await A.setLigaConsent(true))) throw new Error('offline');   // el consentimiento queda registrado en el servidor (versión, huella y fecha) o no sigue
      my = await A.remote.client.joinLiga();
      $('#sheet-liga').close();
      renderClient();
      toast('Te uniste a la liga');
    } catch (e) {
      err.textContent = e && e.detail === 'liga_requires_habits' ? 'Para la liga necesitas compartir tus hábitos y comidas con tu coach.' : e && e.message === 'offline' ? 'No pudimos guardar tu autorización. Revisa tu conexión e inténtalo de nuevo.' : errText(e);
      err.classList.remove('hidden');
    } finally { busy = false; }
  }
  async function leave() {
    if (busy) return;
    busy = true;
    try {
      my = await A.remote.client.leaveLiga();   // primero se quita de la tabla (al instante); luego se registra el retiro del consentimiento
      renderClient();
      toast('Saliste de la liga');
      await A.setLigaConsent(false);
    } catch (e) { toast(errText(e), true); }
    finally { busy = false; }
  }

  // ======================= Coach =======================
  async function loadCoach() {
    if (!A || !isCoach()) { $('#liga-coach').classList.add('hidden'); return; }
    try { coachLiga = await A.remote.coach.liga(); } catch { /* idem */ }
    renderCoach();
  }
  function renderCoach() {
    const box = $('#liga-coach');
    const show = isCoach() && !!coachLiga;
    box.classList.toggle('hidden', !show);
    if (!show) return;
    const g = coachLiga, body = $('#liga-coach-body');
    if (!g.enabled) {
      body.innerHTML = `<p class="small">Tus asesorados pueden unirse a una tabla semanal por alias, solo de constancia (voluntaria y con mínimo de ${g.min}). Para habilitarla, acepta la versión del acuerdo con la cláusula 15 (manejo ético y confidencialidad en ligas).</p>
        <button type="button" class="btn btn-tall" id="btn-liga-habilitar">Habilitar la liga</button>`;
      return;
    }
    body.innerHTML = `<p id="liga-coach-state" class="small">${g.published ? `Liga habilitada: participan ${esc(g.participants)} personas.` : `Liga habilitada. Se publica cuando haya ${g.min} participantes o más.`}</p>
      <p class="small muted">Tú no ves quién es cada alias. Tu acuerdo te obliga a no revelarlo, a no usar la tabla para presionar y a no compartir capturas.</p>
      <details class="small"><summary>Ver la cláusula 15</summary><p>${esc(LG.CLAUSE)}</p></details>`;
  }
  function openAgreement() {
    const t = CT.get('A7');
    $('#lga-ver').textContent = CT.version('A7');
    $('#lga-intro').textContent = CT.fill(t.intro, {});
    $('#lga-c13').textContent = t.clause || '';
    $('#lga-c14').textContent = t.clauseExport || '';
    $('#lga-c15').textContent = t.clauseLiga || '';
    $('#lga-body').textContent = CT.fill(t.body, {});
    $('#lga-ok').checked = false;
    $('#lga-error').classList.add('hidden');
    $('#sheet-lg-acuerdo').showModal();
    $('#lga-title').focus();
  }
  async function acceptAgreement() {
    const err = $('#lga-error');
    if (!$('#lga-ok').checked) { err.textContent = 'Marca la casilla para aceptar el acuerdo.'; err.classList.remove('hidden'); $('#lga-ok').focus(); return; }
    const b = $('#btn-lga-ok');
    b.disabled = true;
    const ok = await A.acceptCoachAgreement();
    b.disabled = false;
    if (!ok) { err.textContent = 'No pudimos guardar tu aceptación. Revisa tu conexión e inténtalo de nuevo.'; err.classList.remove('hidden'); return; }
    $('#sheet-lg-acuerdo').close();
    toast('Acuerdo aceptado: liga habilitada');
    loadCoach();
  }

  function wire() {
    document.addEventListener('click', (ev) => {
      if (ev.target.closest('#btn-liga-open')) openJoin();
      else if (ev.target.closest('#btn-liga-leave')) leave();
      else if (ev.target.closest('#btn-liga-habilitar')) openAgreement();
    });
    $('#lg-ok').addEventListener('change', () => { $('#btn-lg-join').disabled = !$('#lg-ok').checked; });
    $('#btn-lg-join').addEventListener('click', join);
    $('#btn-lg-cancel').addEventListener('click', () => $('#sheet-liga').close());
    $('#sheet-liga').addEventListener('click', (ev) => { if (ev.target === ev.currentTarget) ev.currentTarget.close(); });
    $('#btn-lga-ok').addEventListener('click', acceptAgreement);
    $('#btn-lga-cancel').addEventListener('click', () => $('#sheet-lg-acuerdo').close());
    $('#sheet-lg-acuerdo').addEventListener('click', (ev) => { if (ev.target === ev.currentTarget) ev.currentTarget.close(); });
    document.addEventListener('pg:view', (ev) => {
      const v = ev.detail && ev.detail.view;
      if (v === 'puntos') loadMine();
      if (v === 'retos') loadCoach();
    });
    document.addEventListener('pg:synced', () => { if (isClient()) loadMine(); });
    document.addEventListener('pg:account-changed', () => { my = null; coachLiga = null; loadMine(); });
    document.addEventListener('pg:link-changed', () => loadMine());
  }
  function start() {
    if (A || !window.PGAccount) return;
    A = window.PGAccount;
    wire();
  }
  window.PGLiga = { reload: () => Promise.all([loadMine(), loadCoach()]), state: () => ({ my, coachLiga }) };
  if (window.PGAccount) start();
  else document.addEventListener('pg:account-ready', start);
})();
