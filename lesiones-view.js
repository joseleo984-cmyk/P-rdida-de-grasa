// Lesiones y condiciones médicas (R1 v1.20; concepto jurídico 13). Asesorado: Más → «Mis lesiones y condiciones» (registrar, cambiar el estado, pasar a
// condición médica, ver el seguimiento del coach). Coach: sección «Lesiones y condiciones» en la ficha, con notas de seguimiento. Los textos son LITERALES
// (lesiones.js). La app muestra lo que la persona declara y NO interpreta ni diagnostica.
(function (root) {
  'use strict';
  if (typeof document === 'undefined') return;
  const L = root.Lesiones;
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const A = () => root.PGAccount;
  const clientApi = () => A() && A().remote && A().remote.client;
  const coachApi = () => A() && A().remote && A().remote.coach;
  const sha = (text) => root.Remote.textHash(text);
  const fmt = (d) => (d ? new Date(d + (String(d).length === 10 ? 'T12:00:00' : '')).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const say = (t) => { const m = $('#les-msg'); if (m) m.textContent = t || ''; };
  let items = [];

  // ---------------- Asesorado ----------------
  function card(i, mine) {
    const li = el('li', 'les-item');
    const head = el('div', 'les-head');
    head.append(el('strong', '', i.area), el('span', 'chip les-chip', i.kind === 'condicion' ? L.KIND.condicion : `${L.KIND.lesion} · ${L.STATUS[i.status]}`));
    li.append(head);
    const meta = [i.onset ? `Desde ${fmt(i.onset)}` : '', i.convertedAt ? 'Reclasificada como condición médica' : ''].filter(Boolean).join(' · ');
    if (meta) li.append(el('p', 'small muted', meta));
    if (i.description) li.append(el('p', 'small', i.description));
    if (i.notes.length) {
      const ul = el('ul', 'les-notes small');
      for (const n of i.notes) ul.append(el('li', '', `Tu coach (${fmt(n.createdAt.slice(0, 10))}): ${n.body}`));
      li.append(ul);
    }
    if (mine) {
      const acts = el('div', 'les-acts');
      if (i.kind === 'lesion') {
        const sel = el('select'); sel.setAttribute('aria-label', `Estado de ${i.area}`);
        for (const s of L.statusesFor('lesion')) { const o = el('option', '', L.STATUS[s]); o.value = s; if (s === i.status) o.selected = true; sel.append(o); }
        sel.addEventListener('change', () => update(i, { status: sel.value }));
        const conv = el('button', 'btn btn-ghost', 'Es una condición médica'); conv.type = 'button'; conv.addEventListener('click', () => askConvert(i));
        acts.append(sel, conv);
      }
      const del = el('button', 'btn btn-ghost', 'Borrar'); del.type = 'button'; del.setAttribute('aria-label', `Borrar ${i.area}`); del.addEventListener('click', () => remove(i));
      acts.append(del); li.append(acts);
    }
    return li;
  }
  function render() {
    const { activas, historial } = L.split(items);
    const a = $('#les-activas'), h = $('#les-historial');
    a.replaceChildren(...activas.map((i) => card(i, true)));
    h.replaceChildren(...historial.map((i) => card(i, true)));
    $('#les-vacio').hidden = items.length > 0;
    $('#les-hist-box').hidden = historial.length === 0;
  }
  async function load() {
    try { items = await clientApi().myInjuries(); render(); } catch { say('No pudimos cargar tus registros. Revisa tu conexión.'); }
  }
  async function openList() {
    say(''); const d = $('#les-dialog'); if (!d.open) d.showModal();
    $('#les-title').focus({ preventScroll: true });
    await load();
  }
  async function update(i, patch) {
    try {
      await clientApi().saveInjury({ id: i.id, kind: i.kind, area: i.area, description: i.description, status: patch.status || i.status, onset: i.onset, version: L.TEXTS[i.kind].version, textHash: await sha(L.fullText(i.kind)) });
      say('Guardado.'); await load();
    } catch { say('No pudimos guardar el cambio. Revisa tu conexión.'); }
  }
  async function remove(i) {
    if (!root.confirm(`¿Borrar «${i.area}»? Se elimina de tu cuenta y tu coach deja de verlo.`)) return;
    try { await clientApi().deleteInjury(i.id); say('Borrado.'); await load(); } catch { say('No pudimos borrarlo. Revisa tu conexión.'); }
  }

  // Formulario: texto contextual literal según el tipo; la autorización (casilla, sin marcar) solo la primera vez.
  const hasConsent = () => { const c = A().meta().consents && A().meta().consents.injury; return !!(c && c.granted === true); };
  function fillForm() {
    const kind = $('#lesf-form input[name=kind]:checked').value;
    const t = L.TEXTS[kind];
    $('#lesf-title').textContent = t.title; $('#lesf-body').textContent = t.body;
    $('#lesf-save').textContent = t.buttons.yes; $('#lesf-cancel').textContent = t.buttons.no;
  }
  function openForm() {
    const f = $('#lesf-form'); f.reset(); $('#lesf-error').textContent = '';
    $('#lesf-micro').textContent = L.TEXTS.microcopy;
    $('#lesf-auth-text').textContent = L.TEXTS.autorizacion;
    $('#lesf-auth-row').classList.toggle('hidden', hasConsent());
    fillForm(); const d = $('#les-form-dialog'); if (!d.open) d.showModal();
    $('#lesf-title').focus({ preventScroll: true });
  }
  async function saveForm(ev) {
    ev.preventDefault();
    const f = $('#lesf-form'), err = $('#lesf-error'); err.textContent = '';
    const kind = f.elements.kind.value, area = f.elements.area.value.trim();
    if (area.length < 2) { err.textContent = 'Escribe la zona, articulación o condición (mínimo 2 letras).'; f.elements.area.focus(); return; }
    if (!hasConsent() && !f.elements.auth.checked) { err.textContent = 'Para guardar, marca la casilla de autorización.'; f.elements.auth.focus(); return; }
    for (const b of f.querySelectorAll('button')) b.disabled = true;
    try {
      if (!hasConsent() && !(await A().setInjuryConsent(true))) { err.textContent = 'No pudimos guardar tu autorización. Revisa tu conexión e inténtalo de nuevo.'; return; }
      await clientApi().saveInjury({ kind, area, description: f.elements.description.value.trim(), status: 'activa', onset: f.elements.onset.value || null, version: L.TEXTS[kind].version, textHash: await sha(L.fullText(kind)) });
      $('#les-form-dialog').close(); say('Guardado. Tu coach lo verá en tu ficha.'); await load();
    } catch { err.textContent = 'No pudimos guardar. Revisa tu conexión e inténtalo de nuevo.'; }
    finally { for (const b of f.querySelectorAll('button')) b.disabled = false; }
  }
  let converting = null;
  function askConvert(i) {
    converting = i; const t = L.TEXTS.convertir;
    $('#lesc-title').textContent = t.title; $('#lesc-body').textContent = t.body; $('#lesc-yes').textContent = t.buttons.yes; $('#lesc-no').textContent = t.buttons.no;
    $('#les-conv-dialog').showModal(); $('#lesc-title').focus({ preventScroll: true });
  }
  async function doConvert() {
    const i = converting; if (!i) return;
    try { await clientApi().convertInjury(i.id, { version: L.TEXTS.convertir.version, textHash: await sha(L.fullText('convertir')) }); $('#les-conv-dialog').close(); say('Pasó a condición médica.'); await load(); }
    catch { $('#les-conv-dialog').close(); say('No pudimos actualizarlo. Revisa tu conexión.'); }
  }

  // ---------------- Coach (ficha) ----------------
  async function coach(clientId) {
    const box = $('#fc-lesiones'); if (!box || !coachApi()) return;
    box.classList.add('hidden');
    let list = [];
    try { list = await coachApi().clientInjuries(clientId); } catch { return; }
    if (!list.length) return;
    const { activas, historial } = L.split(list);
    const wrap = $('#fcl-list'); wrap.replaceChildren();
    const section = (arr) => { const ul = el('ul', 'les-list'); for (const i of arr) { const li = card(i, false); li.append(noteForm(i, clientId)); ul.append(li); } return ul; };
    if (activas.length) wrap.append(section(activas));
    if (historial.length) { const d = el('details', 'les-hist'); d.append(el('summary', '', `Antecedentes (${historial.length})`), section(historial)); wrap.append(d); }
    $('#fcl-note').textContent = 'Aviso: este registro es un reporte del usuario; como coach no emites diagnósticos ni tratas lesiones.';
    box.classList.remove('hidden');
  }
  function noteForm(i, clientId) {
    const f = el('form', 'les-note-form'); f.setAttribute('novalidate', '');
    const inp = el('input'); inp.type = 'text'; inp.maxLength = 500; inp.placeholder = 'Nota de seguimiento'; inp.setAttribute('aria-label', `Nota de seguimiento para ${i.area}`);
    const b = el('button', 'btn btn-ghost', 'Agregar nota'); b.type = 'submit';
    f.append(inp, b);
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault(); const text = inp.value.trim(); if (!text) { inp.focus(); return; }
      b.disabled = true;
      try { await coachApi().addInjuryNote(i.id, text); await coach(clientId); } catch { b.disabled = false; inp.setAttribute('aria-invalid', 'true'); }
    });
    return f;
  }

  function wire() {
    const row = $('#row-lesiones'); if (!row) return;
    row.addEventListener('click', openList);
    $('#les-add').addEventListener('click', openForm);
    $('#lesf-form').addEventListener('submit', saveForm);
    $('#lesf-form').addEventListener('change', (ev) => { if (ev.target.name === 'kind') fillForm(); });
    $('#lesf-cancel').addEventListener('click', () => $('#les-form-dialog').close());
    $('#lesc-yes').addEventListener('click', doConvert);
    $('#lesc-no').addEventListener('click', () => $('#les-conv-dialog').close());
    for (const b of document.querySelectorAll('#les-dialog [data-les-close]')) b.addEventListener('click', () => $('#les-dialog').close());
  }
  root.LesionesView = { coach };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})(window);
