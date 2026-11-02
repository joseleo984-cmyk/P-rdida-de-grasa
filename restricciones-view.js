// Dolor por ejercicio, lista «ejercicios a evitar» y advertencias al asignar (R1 v1.21; concepto jurídico 13). Textos LITERALES (lesiones.js).
// Asesorado: botón «Reportar molestia o dolor» en cada ejercicio del paso a paso (consentimiento contextual la primera vez).
// Coach: sección «Restricciones de entrenamiento» en la ficha y advertencias al asignar una rutina (aviso fáctico, nunca contraindicación ni diagnóstico).
// El Acuerdo del Coach 0.9 (cláusula 17) se acepta aquí la primera vez que el coach programa o gestiona estas listas.
(function (root) {
  'use strict';
  if (typeof document === 'undefined') return;
  const L = root.Lesiones;
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const A = () => root.PGAccount;
  const sha = (t) => root.Remote.textHash(t);
  const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const meta = () => (A() && A().meta && A().meta()) || {};
  const hasPainConsent = () => { const c = (meta().consents || {}).pain_report; return !!(c && c.granted === true); };

  // ---------------- Asesorado: «Reportar molestia o dolor» ----------------
  function painButton() { return $('#paso-pain'); }
  function syncPainButton() {
    const b = painButton(); if (!b) return;
    const m = meta();
    b.classList.toggle('hidden', !(m.userId && m.link && !(m.roles || []).includes('coach')));
    b.textContent = L.TEXTS.dolor.button;
  }
  function say(t) { const s = $('#paso-pain-status'); if (s) s.textContent = t || ''; }
  async function sendPain(name) {
    await A().remote.client.reportExercisePain({ exercise: name, day: todayIso(), version: L.TEXTS.dolor.version, textHash: await sha(L.fullText('dolor')) });
    say('Anotado. Tu coach podrá verlo.');
  }
  async function onPain() {
    const name = ($('#paso-name') && $('#paso-name').textContent || '').trim();
    if (!name) return;
    say('');
    if (hasPainConsent()) { try { await sendPain(name); } catch { say('No pudimos guardar el reporte. Revisa tu conexión.'); } return; }
    const d = $('#pain-dialog'), t = L.TEXTS.dolor;
    $('#pain-title').textContent = t.title; $('#pain-body').textContent = t.body; $('#pain-yes').textContent = t.buttons.yes; $('#pain-no').textContent = t.buttons.no;
    $('#pain-msg').textContent = ''; d.dataset.exercise = name;
    d.showModal(); $('#pain-title').focus({ preventScroll: true });
  }
  async function confirmPain() {
    const d = $('#pain-dialog'), name = d.dataset.exercise, msg = $('#pain-msg');
    for (const b of d.querySelectorAll('button')) b.disabled = true;
    try {
      if (!(await A().setPainConsent(true))) { msg.textContent = 'No pudimos guardar tu autorización. Revisa tu conexión e inténtalo de nuevo.'; return; }
      await sendPain(name); d.close();
    } catch { msg.textContent = 'No pudimos guardar el reporte. Revisa tu conexión e inténtalo de nuevo.'; }
    finally { for (const b of d.querySelectorAll('button')) b.disabled = false; }
  }

  // ---------------- Coach: advertencias al asignar ----------------
  let warnResolve = null;
  function closeWarn(v) { const d = $('#rest-warn-dialog'); if (d.open) d.close(); const r = warnResolve; warnResolve = null; if (r) r(v); }
  function showWarn(items) {
    return new Promise((resolve) => {
      warnResolve = resolve;
      const box = $('#rest-warn-list'); box.replaceChildren();
      for (const w of items) {
        const p = el('div', 'rest-warn-item');
        const who = el('strong', '', `${w.name} · ${w.exercise}`);
        if (w.kind === 'avoid') p.append(who, el('p', '', `${L.TEXTS.restringido.title} ${L.TEXTS.restringido.body}`));
        else p.append(who, el('p', '', `${L.TEXTS.historial.head} ${L.TEXTS.historial.body.replace('[DD/MM/AAAA]', L.fmtDay(w.day))}`));
        box.append(p);
      }
      $('#rest-warn-yes').textContent = L.TEXTS.restringido.buttons.yes; $('#rest-warn-no').textContent = L.TEXTS.restringido.buttons.no;
      const d = $('#rest-warn-dialog'); d.showModal(); $('#rest-warn-title').focus({ preventScroll: true });
    });
  }
  // Primera vez: el Acuerdo del Coach actualizado (cláusula 17) antes de programar. Devuelve true si lo acepta.
  // opts (opcional): { intro, clause } para pedir el mismo Acuerdo por otra cláusula nueva (p. ej. la del chat).
  function askAgreement(opts = {}) {
    return new Promise((resolve) => {
      const d = $('#rest-agree-dialog'), t = root.ConsentTexts.get('A7');
      $('#rest-agree-intro').textContent = opts.intro || 'Para programar rutinas con las listas de ejercicios a evitar y los reportes de dolor, acepta la versión actualizada del Acuerdo. Esta es la cláusula nueva:';
      $('#rest-agree-clause').textContent = opts.clause != null ? opts.clause : (t.clauseExclusion || '');
      $('#rest-agree-box').checked = false; $('#rest-agree-err').textContent = '';
      $('#rest-agree-text').textContent = root.ConsentTexts.fill(t.body, {});
      const done = (v) => { if (d.open) d.close(); $('#rest-agree-ok').onclick = null; $('#rest-agree-no').onclick = null; resolve(v); };
      $('#rest-agree-no').onclick = () => done(false);
      d.addEventListener('cancel', () => done(false), { once: true });
      $('#rest-agree-ok').onclick = async () => {
        if (!$('#rest-agree-box').checked) { $('#rest-agree-err').textContent = 'Marca la casilla para continuar.'; return; }
        $('#rest-agree-ok').disabled = true;
        const ok = await A().acceptAgreementUpdate();
        $('#rest-agree-ok').disabled = false;
        if (!ok) { $('#rest-agree-err').textContent = 'No pudimos guardar tu aceptación. Revisa tu conexión e inténtalo de nuevo.'; return; }
        done(true);
      };
      d.showModal(); $('#rest-agree-title').focus({ preventScroll: true });
    });
  }
  // clients: [{ id, name }] o 'all' (todos los asesorados activos). content: { days }. → true = seguir, false = cancelar.
  async function confirmAssign(clients, content) {
    const coach = A().remote.coach;
    let list = clients;
    if (list === 'all') list = (await coach.clients()).map((c) => ({ id: c.clientId, name: c.displayName || 'Asesorado' }));
    if (!list.length) return true;
    // Primera vez con la cláusula 17: si el Acuerdo guardado en este teléfono todavía no la trae, se pide aceptarlo antes de programar.
    if (!root.ConsentTexts.restrictionsAgreementOK(meta())) { if (!(await askAgreement())) return false; }
    const flagsBy = await Promise.all(list.map(async (c) => ({ c, f: await coach.exerciseFlags(c.id).catch(() => null) })));
    const warn = [];
    for (const { c, f } of flagsBy) for (const x of L.conflicts(content, f)) warn.push({ ...x, name: c.name });
    return warn.length ? showWarn(warn) : true;
  }

  // ---------------- Coach: sección en la ficha ----------------
  async function coachSection(clientId) {
    const box = $('#fc-restr'); if (!box || !A()) return;
    box.classList.add('hidden');
    let f;
    try { f = await A().remote.coach.exerciseFlags(clientId); } catch { return; }
    const wrap = $('#fcr-body'); wrap.replaceChildren();
    if (!f.agreement) {
      wrap.append(el('p', 'small', 'Para ver el historial de dolor y la lista «a evitar», acepta el Acuerdo del Coach actualizado.'));
      const b = el('button', 'btn btn-ghost', 'Revisar el Acuerdo actualizado'); b.type = 'button';
      b.addEventListener('click', async () => { if (await askAgreement()) coachSection(clientId); });
      wrap.append(b); box.classList.remove('hidden'); return;
    }
    const avoid = el('ul', 'les-list');
    for (const a of f.avoid) {
      const li = el('li', 'les-item'); li.append(el('strong', '', a.exercise));
      const rm = el('button', 'btn btn-ghost', 'Quitar'); rm.type = 'button'; rm.setAttribute('aria-label', `Quitar ${a.exercise} de la lista`);
      rm.addEventListener('click', async () => { try { await A().remote.coach.avoidRemove(clientId, a.exercise); coachSection(clientId); } catch { rm.disabled = true; } });
      li.append(rm); avoid.append(li);
    }
    wrap.append(el('h4', '', 'Ejercicios a evitar'), f.avoid.length ? avoid : el('p', 'small muted', 'Aún no marcaste ninguno.'));
    const form = el('form', 'les-note-form'); form.setAttribute('novalidate', '');
    const inp = el('input'); inp.type = 'text'; inp.maxLength = 80; inp.placeholder = 'Nombre del ejercicio'; inp.setAttribute('aria-label', 'Ejercicio a evitar');
    const add = el('button', 'btn btn-ghost', 'Agregar a evitar'); add.type = 'submit'; form.append(inp, add);
    form.addEventListener('submit', async (ev) => { ev.preventDefault(); const v = inp.value.trim(); if (!v) { inp.focus(); return; } try { await A().remote.coach.avoidAdd(clientId, v); coachSection(clientId); } catch { inp.setAttribute('aria-invalid', 'true'); } });
    wrap.append(form);
    if (f.pain.length) {
      const have = new Set(f.avoid.map((a) => L.key(a.exercise)));
      const ul = el('ul', 'les-list');
      for (const p of f.pain) {
        const li = el('li', 'les-item'); li.append(el('span', '', `${p.exercise} · ${L.fmtDay(p.day)}`));
        if (!have.has(L.key(p.exercise))) {
          const b = el('button', 'btn btn-ghost', 'Agregar a evitar'); b.type = 'button'; b.setAttribute('aria-label', `Agregar ${p.exercise} a evitar`);
          b.addEventListener('click', async () => { try { await A().remote.coach.avoidAdd(clientId, p.exercise); coachSection(clientId); } catch { b.disabled = true; } });
          li.append(b);
        }
        ul.append(li);
      }
      wrap.append(el('h4', '', 'Molestias reportadas por el asesorado'), ul);
    }
    $('#fcr-note').textContent = L.TEXTS.historial.body.replace(/^Este asesorado reportó dolor en este ejercicio el \[DD\/MM\/AAAA\]\. Verifica su evolución o evalúa ejercicios alternativos\. /, '');
    box.classList.remove('hidden');
  }

  function wire() {
    const pb = painButton();
    if (pb) { pb.addEventListener('click', onPain); document.addEventListener('pg:account-changed', syncPainButton); document.addEventListener('pg:account-ready', syncPainButton); syncPainButton(); }
    if ($('#pain-yes')) { $('#pain-yes').addEventListener('click', confirmPain); $('#pain-no').addEventListener('click', () => $('#pain-dialog').close()); }
    if ($('#rest-warn-yes')) { $('#rest-warn-yes').addEventListener('click', () => closeWarn(true)); $('#rest-warn-no').addEventListener('click', () => closeWarn(false)); $('#rest-warn-dialog').addEventListener('cancel', () => closeWarn(false)); }
  }
  root.RestrView = { confirmAssign, coach: coachSection, syncPainButton, askAgreement };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})(window);
