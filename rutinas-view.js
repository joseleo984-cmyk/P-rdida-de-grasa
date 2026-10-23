// Etapa 2 («App para coaches»): rutinas de ejercicios, parte de pantalla. SOLO con producto 'coach' (la app oficial no cambia: sin él, este archivo no hace nada).
//   Cliente: «Mi rutina» (Más y Inicio), solo lectura: días plegables y, al abrir cada ejercicio, su animación con una URL firmada de 60 s NUEVA cada vez.
//   Coach: en la ficha del asesorado, «Armar rutina»: título, días, ejercicios, y su biblioteca de animaciones (se suben una vez y se reutilizan).
// Usa SOLO la API de Remote vía PGAccount (account.js). Lo que escribe otra persona (títulos, nombres, notas) entra al DOM con esc() o textContent.
// Las reglas (máx. 7 días, 12 ejercicios, 3 MB, firma de bytes) están en rutinas.js; el servidor las vuelve a comprobar (r1 v1.7).
(function () {
  'use strict';
  const PROD = window.Producto || { coach: false };
  if (!PROD.coach || !window.Rutinas) return;

  const R = window.Rutinas;
  const $ = (sel) => document.querySelector(sel);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtStamp = (iso) => (iso ? new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' }) : '');
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  let A = null;   // PGAccount (remote + metadatos)
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
    if (err && err.code === 'invalid') {
      if (err.detail === 'gif_in_use') return 'Esa animación se usa en una rutina. Quítala de los ejercicios y vuelve a intentarlo.';
      if (err.detail === 'gif_not_found') return 'Una de las animaciones ya no está en tu biblioteca. Elígela otra vez.';
      return 'Revisa la rutina: algo no es válido (hasta 7 días y 12 ejercicios por día).';
    }
    if (err && err.code === 'forbidden') return 'Este cliente ya no comparte sus datos contigo.';
    return A ? A.errorText(err, 'rutina') : 'No se pudo conectar con el servidor.';
  };

  // ============================== CLIENTE: Mi rutina ==============================
  let routine;            // undefined = sin cargar · null = no tiene · objeto = su rutina (forma de Rutinas.fromServer)
  let loadFailed = false;
  let loadSeq = 0;
  const myLink = () => { const m = A && A.meta(); return m && m.link && !(m.roles || []).includes('coach') ? m.link : null; };

  function freeGif(el) {
    if (el._url) URL.revokeObjectURL(el._url);
    el._url = null;
    el._tok = (el._tok || 0) + 1;
    const slot = el.querySelector('.rut-gif');
    if (slot) slot.replaceChildren();
  }
  function freeAllGifs() { for (const el of document.querySelectorAll('#rutina-body .rut-ex')) freeGif(el); }

  // La animación se pide SOLO al abrir el ejercicio y se suelta al cerrarlo: cada apertura firma una URL nueva (60 s).
  async function loadGif(el) {
    const slot = el.querySelector('.rut-gif');
    if (!slot || !el.dataset.gif || !routine) return;
    const tok = (el._tok = (el._tok || 0) + 1);
    slot.textContent = 'Cargando la animación…';
    try {
      const blob = await A.remote.client.gifBlob(routine.coachId, el.dataset.gif);
      if (!el.open || el._tok !== tok) return;   // lo cerró o lo reabrió mientras cargaba
      el._url = URL.createObjectURL(blob);
      const img = document.createElement('img');
      img.className = 'rut-gif-img';
      img.alt = `Animación del ejercicio: ${el.dataset.name}`;
      img.src = el._url;
      slot.replaceChildren(img);
    } catch (err) {
      if (!el.open || el._tok !== tok) return;
      const p = document.createElement('p');
      p.className = 'small warn';
      p.textContent = 'No pudimos cargar la animación. Revisa tu internet e inténtalo de nuevo.';
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn btn-ghost btn-tall'; b.textContent = 'Reintentar'; b.dataset.retry = '1';
      slot.replaceChildren(p, b);
    }
  }

  function renderEntrances() {
    const on = !!myLink();
    for (const el of document.querySelectorAll('#home-rutina, .rutina-row')) el.classList.toggle('hidden', !on);
    $('#hr-text').textContent = routine ? `${routine.title} · ${R.summary(routine)}` : routine === null && on ? 'Tu coach todavía no te armó una rutina.' : 'Tus ejercicios y cómo se hacen.';
  }
  function renderTrained() {
    const card = $('#rutina-trained');
    card.classList.toggle('hidden', !routine);
    const done = !!(window.PGNav && PGNav.trainedToday && PGNav.trainedToday());
    const b = $('#btn-rutina-trained');
    b.disabled = done;
    b.textContent = done ? 'Hoy ya anotaste que entrenaste ✓' : 'Hoy entrené';
  }
  function exerciseHTML(e) {
    const head = `<span class="rut-ex-name">${esc(e.name)}</span><span class="rut-ex-sets">${esc(e.sets)}</span>`;
    if (!e.gif && !e.note) return `<li><div class="rut-ex-row">${head}</div></li>`;
    return `<li><details class="rut-ex" data-gif="${esc(e.gif)}" data-name="${esc(e.name)}"><summary>${head}</summary>
      <div class="rut-ex-body">${e.note ? `<p class="rut-note">${esc(e.note)}</p>` : ''}${e.gif ? '<div class="rut-gif" role="status" aria-live="polite"></div>' : ''}</div></details></li>`;
  }
  function renderRoutine() {
    freeAllGifs();
    renderEntrances();
    const box = $('#rutina-body');
    const status = $('#rutina-status');
    if (routine === undefined) {
      box.replaceChildren();
      status.textContent = loadFailed ? '' : 'Cargando tu rutina…';
      if (loadFailed) box.innerHTML = '<div class="card"><p>No pudimos cargar tu rutina. Revisa tu internet e inténtalo de nuevo.</p><button type="button" class="btn btn-tall" id="btn-rutina-retry">Volver a intentar</button></div>';
      renderTrained();
      return;
    }
    status.textContent = '';
    if (routine === null) {
      const l = myLink();
      box.innerHTML = `<div class="card"><p><strong>Todavía no tienes una rutina.</strong></p><p class="small muted">${esc(l && l.businessName ? l.businessName : 'Tu coach')} la armará para ti y, cuando lo haga, la verás aquí con la animación de cada ejercicio.</p></div>`;
      renderTrained();
      return;
    }
    const l = myLink();
    const by = l && l.businessName ? `Armada por ${esc(l.businessName)} · ` : '';
    box.innerHTML = `<div class="card rut-head"><h3 class="rut-title">${esc(routine.title)}</h3>
        <p class="small muted">${by}${esc(R.summary(routine))}${routine.updatedAt ? ` · actualizada el ${esc(fmtStamp(routine.updatedAt))}` : ''}</p>
        <p class="small muted">Toca un día para ver sus ejercicios y un ejercicio para ver cómo se hace.</p></div>` +
      routine.days.map((d, i) => `<details class="card rut-day"${i === 0 ? ' open' : ''}><summary><span class="rut-day-title">${esc(d.title)}</span><span class="small muted">${esc(R.dayLine(d))}</span></summary>
        <ul class="rut-ex-list">${d.exercises.map(exerciseHTML).join('')}</ul></details>`).join('');
    renderTrained();
  }
  async function loadRoutine({ silent = false } = {}) {
    if (!A || !myLink()) { routine = undefined; renderEntrances(); return; }
    const seq = ++loadSeq;
    loadFailed = false;
    if (!silent && routine === undefined) renderRoutine();
    try {
      const r = await A.remote.client.myRoutine();
      if (seq !== loadSeq) return;
      routine = r;
    } catch (err) {
      if (seq !== loadSeq) return;
      if (routine === undefined) loadFailed = true;
      if (!silent && routine !== undefined) toast(errText(err), true);
    }
    renderRoutine();
  }
  function wireClient() {
    const body = $('#rutina-body');
    body.addEventListener('toggle', (ev) => {   // 'toggle' no sube por el árbol: se escucha en la captura
      const el = ev.target;
      if (!el.classList || !el.classList.contains('rut-ex')) return;
      if (el.open) loadGif(el); else freeGif(el);
    }, true);
    body.addEventListener('click', (ev) => {
      if (ev.target.closest('#btn-rutina-retry')) { routine = undefined; loadRoutine(); return; }
      const r = ev.target.closest('[data-retry]');
      if (r) loadGif(r.closest('.rut-ex'));
    });
    $('#btn-rutina-trained').addEventListener('click', () => document.dispatchEvent(new CustomEvent('pg:rutina-trained')));
    document.addEventListener('pg:rutina-trained-done', () => { renderTrained(); $('#rutina-trained-status').textContent = 'Anotado. ¡Buen trabajo!'; });
    // Al entrar a la pantalla se vuelve a pedir (el coach pudo cambiarla); la que ya estaba se ve mientras tanto.
    const open = () => { $('#rutina-trained-status').textContent = ''; renderRoutine(); loadRoutine({ silent: routine !== undefined }); };
    $('#row-rutina').addEventListener('click', open);
    $('#btn-home-rutina').addEventListener('click', open);
    for (const ev of ['pg:link-changed', 'pg:account-changed']) document.addEventListener(ev, () => {
      if (!myLink()) { routine = undefined; freeAllGifs(); renderEntrances(); return; }
      if (routine === undefined) loadRoutine({ silent: true }); else renderEntrances();
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && myLink()) loadRoutine({ silent: true }); });
    loadRoutine({ silent: true });
  }

  // ============================== COACH: armar la rutina ==============================
  let ctx = null;         // { clientId, name } del asesorado abierto en la ficha
  let saved = null;       // su rutina guardada (o null)
  let draft = null;       // lo que se está editando
  let gifs = [];          // biblioteca del coach
  let dirty = false;
  let busy = false;

  function renderCard() {
    const card = $('#coach-detail-rutina-card');
    card.classList.remove('hidden');
    const b = $('#btn-coach-rutina');
    b.textContent = saved ? 'Editar la rutina' : 'Armar rutina';
    $('#coach-detail-rutina-line').textContent = saved
      ? `«${saved.title}» · ${R.summary(saved)}${saved.updatedAt ? ` · actualizada el ${fmtStamp(saved.updatedAt)}` : ''}`
      : `${ctx.name} todavía no tiene una rutina.`;
  }
  async function openFicha(detail) {
    ctx = { clientId: detail.clientId, name: detail.name || 'tu asesorado' };
    saved = undefined;
    const card = $('#coach-detail-rutina-card');
    card.classList.remove('hidden');
    $('#coach-detail-rutina-line').textContent = 'Revisando su rutina…';
    $('#btn-coach-rutina').disabled = true;
    try { saved = await A.remote.coach.getRoutine(ctx.clientId); renderCard(); }
    catch (err) { saved = undefined; $('#coach-detail-rutina-line').textContent = errText(err); }
    $('#btn-coach-rutina').disabled = saved === undefined;
  }

  const idOf = (d, e, f) => (e == null ? `d${d}-${f}` : `d${d}e${e}-${f}`);
  const gifName = (id) => { const g = gifs.find((x) => x.id === id); return g ? g.name : ''; };
  function gifOptions(sel) {
    const known = gifs.some((g) => g.id === sel);
    return `<option value="">Sin animación</option>${sel && !known ? `<option value="${esc(sel)}" selected>Animación que ya no está en tu biblioteca</option>` : ''}` +
      gifs.map((g) => `<option value="${esc(g.id)}"${g.id === sel ? ' selected' : ''}>${esc(g.name)}</option>`).join('');
  }
  function renderDays() {
    const L = R.LIMITS;
    $('#redit-days').innerHTML = draft.days.map((d, i) => {
      const n = d.exercises.length;
      return `<fieldset class="rut-edit-day"><legend>Día ${i + 1}</legend>
        <label class="acc-label" for="${idOf(i, null, 'title')}">Nombre del día</label>
        <input type="text" id="${idOf(i, null, 'title')}" data-f="dtitle" data-d="${i}" maxlength="${L.dayTitle}" autocomplete="off" value="${esc(d.title)}" placeholder="Por ejemplo: Día ${i + 1} – Piernas">
        <ol class="rut-edit-list">${d.exercises.map((e, j) => `<li class="rut-edit-ex"><h3>Ejercicio ${j + 1}</h3>
          <label class="acc-label" for="${idOf(i, j, 'name')}">Nombre del ejercicio</label>
          <input type="text" id="${idOf(i, j, 'name')}" data-f="name" data-d="${i}" data-e="${j}" maxlength="${L.name}" autocomplete="off" value="${esc(e.name)}" placeholder="Por ejemplo: Press de banca">
          <label class="acc-label" for="${idOf(i, j, 'sets')}">Series × repeticiones</label>
          <input type="text" id="${idOf(i, j, 'sets')}" data-f="sets" data-d="${i}" data-e="${j}" maxlength="${L.sets}" autocomplete="off" value="${esc(e.sets)}" placeholder="Por ejemplo: 4 × 12">
          <label class="acc-label" for="${idOf(i, j, 'note')}">Nota <span class="muted small">(opcional)</span></label>
          <input type="text" id="${idOf(i, j, 'note')}" data-f="note" data-d="${i}" data-e="${j}" maxlength="${L.note}" autocomplete="off" value="${esc(e.note)}" placeholder="Por ejemplo: Baja despacio, 2 segundos">
          <label class="acc-label" for="${idOf(i, j, 'gif')}">Animación <span class="muted small">(opcional)</span></label>
          <select id="${idOf(i, j, 'gif')}" data-f="gif" data-d="${i}" data-e="${j}">${gifOptions(e.gif)}</select>
          <div class="row-actions rut-edit-actions">
            <button type="button" class="btn btn-ghost" data-act="up" data-d="${i}" data-e="${j}"${j === 0 ? ' disabled' : ''} aria-label="Subir el ejercicio ${j + 1} del día ${i + 1}">↑ Subir</button>
            <button type="button" class="btn btn-ghost" data-act="down" data-d="${i}" data-e="${j}"${j === n - 1 ? ' disabled' : ''} aria-label="Bajar el ejercicio ${j + 1} del día ${i + 1}">↓ Bajar</button>
            <button type="button" class="btn btn-ghost" data-act="del-ex" data-d="${i}" data-e="${j}" aria-label="Quitar el ejercicio ${j + 1} del día ${i + 1}">Quitar</button>
          </div></li>`).join('')}</ol>
        ${n ? '' : '<p class="small muted">Este día no tiene ejercicios: se verá como día de descanso.</p>'}
        <div class="row-actions">
          <button type="button" class="btn btn-ghost" data-act="add-ex" data-d="${i}"${n >= L.exercises ? ' disabled' : ''}>${n >= L.exercises ? `Máximo ${L.exercises} ejercicios por día` : '＋ Agregar ejercicio'}</button>
          <button type="button" class="btn btn-ghost" data-act="del-day" data-d="${i}"${draft.days.length <= 1 ? ' disabled' : ''}>Quitar este día</button>
        </div></fieldset>`;
    }).join('');
    const add = $('#btn-redit-add-day');
    add.disabled = draft.days.length >= L.days;
    add.textContent = draft.days.length >= L.days ? `Máximo ${L.days} días` : '＋ Agregar otro día';
  }
  function showError(msg, focusId) {
    const el = $('#redit-error');
    el.textContent = msg || '';
    el.classList.toggle('hidden', !msg);
    if (focusId && $('#' + focusId)) $('#' + focusId).focus();
  }
  function openEditor() {
    if (saved === undefined || !ctx) return;
    draft = saved ? { title: saved.title, days: clone(saved.days) } : R.blankRoutine();
    dirty = false;
    showError('');
    $('#redit-title').textContent = `Rutina de ${ctx.name}`;
    $('#redit-name').value = draft.title;
    $('#btn-redit-delete').classList.toggle('hidden', !saved);
    $('#redit-status').textContent = '';
    renderDays();
    renderLibrary();
    PGNav.show('rutina-edit');
    $('#redit-title').focus();
    A.remote.coach.listGifs().then((list) => { gifs = list; if (draft) { renderDays(); renderLibrary(); } }, (err) => { $('#redit-status').textContent = `No pudimos cargar tus animaciones. ${errText(err)}`; });
  }
  function leave() {
    if (dirty && !confirm('Tienes cambios sin guardar. ¿Salir sin guardar?')) return;
    freePreviews();
    draft = null; dirty = false;
    PGNav.show('coach');
    const b = $('#btn-coach-rutina');
    if (b) b.focus();
  }
  function onField(el) {
    const f = el.dataset.f, d = Number(el.dataset.d), e = el.dataset.e == null ? null : Number(el.dataset.e);
    if (f === 'dtitle') draft.days[d].title = el.value;
    else draft.days[d].exercises[e][f] = el.value;
    dirty = true;
  }
  function onAction(b) {
    const act = b.dataset.act, d = Number(b.dataset.d), e = b.dataset.e == null ? null : Number(b.dataset.e);
    const day = draft.days[d];
    let focus = null;
    if (act === 'add-ex' && day.exercises.length < R.LIMITS.exercises) { day.exercises.push(R.blankExercise()); focus = idOf(d, day.exercises.length - 1, 'name'); }
    else if (act === 'del-ex') { day.exercises.splice(e, 1); focus = day.exercises.length ? idOf(d, Math.min(e, day.exercises.length - 1), 'name') : idOf(d, null, 'title'); }
    else if (act === 'up' && e > 0) { [day.exercises[e - 1], day.exercises[e]] = [day.exercises[e], day.exercises[e - 1]]; focus = idOf(d, e - 1, 'name'); }
    else if (act === 'down' && e < day.exercises.length - 1) { [day.exercises[e + 1], day.exercises[e]] = [day.exercises[e], day.exercises[e + 1]]; focus = idOf(d, e + 1, 'name'); }
    else if (act === 'del-day') {
      if (day.exercises.length && !confirm(`¿Quitar el día ${d + 1} con sus ${plural(day.exercises.length, 'ejercicio', 'ejercicios')}?`)) return;
      draft.days.splice(d, 1);
      focus = idOf(Math.min(d, draft.days.length - 1), null, 'title');
    } else return;
    dirty = true;
    showError('');
    renderDays();
    if (focus && $('#' + focus)) $('#' + focus).focus();
  }
  async function save(ev) {
    ev.preventDefault();
    if (busy || !draft) return;
    draft.title = $('#redit-name').value;
    const v = R.validate(draft);
    if (!v.ok) { const x = v.errors[0]; showError(x.message, x.field === 'title' && x.day == null ? 'redit-name' : x.day != null ? idOf(x.day, x.ex, x.field === 'title' ? 'title' : x.field) : null); return; }
    showError('');
    busy = true;
    for (const b of document.querySelectorAll('#form-rutina button')) b.disabled = true;
    try {
      saved = await A.remote.coach.saveRoutine(ctx.clientId, draft);
      dirty = false;
      renderCard();
      toast('Rutina guardada');
      leave();
    } catch (err) { showError(errText(err)); }
    finally { busy = false; for (const b of document.querySelectorAll('#form-rutina button')) b.disabled = false; if (draft) renderDays(); }
  }
  async function removeRoutine() {
    if (!saved || !confirm(`¿Borrar la rutina de ${ctx.name}? Dejará de verla en su app.`)) return;
    try {
      await A.remote.coach.deleteRoutine(ctx.clientId);
      saved = null; dirty = false;
      renderCard();
      toast('Rutina borrada');
      leave();
    } catch (err) { showError(errText(err)); }
  }

  // ---------- Biblioteca de animaciones ----------
  const previews = new Map();   // id → object URL de la vista previa abierta (se suelta al cerrarla)
  function freePreviews() { for (const u of previews.values()) URL.revokeObjectURL(u); previews.clear(); }
  function renderLibrary() {
    const ul = $('#gif-list');
    ul.innerHTML = gifs.length ? gifs.map((g) => `<li class="gif-item" data-id="${esc(g.id)}">
        <div class="gif-row"><span class="gif-info"><strong>${esc(g.name)}</strong><span class="small muted">${esc(R.fmtSize(g.size))} · ${g.uses ? `en ${plural(g.uses, 'rutina', 'rutinas')}` : 'sin usar todavía'}</span></span>
          <span class="gif-btns"><button type="button" class="btn btn-ghost" data-gact="view" aria-expanded="false" aria-label="Ver la animación ${esc(g.name)}">Ver</button>
          <button type="button" class="btn btn-ghost" data-gact="del" aria-label="Borrar la animación ${esc(g.name)}">Borrar</button></span></div>
        <div class="gif-preview" role="status" aria-live="polite"></div></li>`).join('') : '<li class="small muted">Todavía no subes ninguna animación.</li>';
  }
  async function togglePreview(li) {
    const id = li.dataset.id, slot = li.querySelector('.gif-preview'), btn = li.querySelector('[data-gact="view"]');
    if (previews.has(id)) { URL.revokeObjectURL(previews.get(id)); previews.delete(id); slot.replaceChildren(); btn.setAttribute('aria-expanded', 'false'); btn.textContent = 'Ver'; return; }
    btn.setAttribute('aria-expanded', 'true'); btn.textContent = 'Ocultar';
    slot.textContent = 'Cargando…';
    try {
      const blob = await A.remote.coach.gifBlob(id);
      if (btn.getAttribute('aria-expanded') !== 'true') return;
      const url = URL.createObjectURL(blob);
      previews.set(id, url);
      const img = document.createElement('img');
      img.className = 'rut-gif-img'; img.alt = `Animación: ${gifName(id)}`; img.src = url;
      slot.replaceChildren(img);
    } catch (err) { slot.textContent = errText(err); btn.setAttribute('aria-expanded', 'false'); btn.textContent = 'Ver'; }
  }
  async function deleteGif(li) {
    const id = li.dataset.id;
    if (!confirm(`¿Borrar la animación «${gifName(id)}» de tu biblioteca?`)) return;
    try {
      await A.remote.coach.deleteGif(id);
      if (previews.has(id)) { URL.revokeObjectURL(previews.get(id)); previews.delete(id); }
      gifs = gifs.filter((g) => g.id !== id);
      if (draft) for (const d of draft.days) for (const e of d.exercises) if (e.gif === id) e.gif = '';
      renderLibrary(); if (draft) renderDays();
      $('#gif-status').textContent = 'Animación borrada.';
    } catch (err) { $('#gif-status').textContent = errText(err); }
  }
  async function upload(ev) {
    ev.preventDefault();
    if (busy) return;
    const fileEl = $('#gif-file'), err = $('#gif-error');
    const fail = (msg, el) => { err.textContent = msg; err.classList.remove('hidden'); if (el) el.focus(); };
    err.classList.add('hidden');
    const file = fileEl.files && fileEl.files[0];
    if (!file) { fail('Elige el archivo de la animación.', fileEl); return; }
    let name = $('#gif-name').value.trim() || R.suggestName(file.name);
    if (!name) { fail('Ponle un nombre a la animación.', $('#gif-name')); return; }
    if (name.length > R.LIMITS.gifName) { fail(`El nombre es muy largo: máximo ${R.LIMITS.gifName} letras.`, $('#gif-name')); return; }
    // Se valida aquí (tipo, tamaño y firma de bytes) para avisar enseguida; remote.js y el servidor lo vuelven a comprobar. NO se re-codifica.
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const chk = R.checkGif({ type: file.type, size: file.size }, head);
    if (!chk.ok) { fail(chk.message, fileEl); return; }
    busy = true;
    const btn = $('#btn-gif-upload');
    btn.disabled = true;
    $('#gif-status').textContent = 'Subiendo la animación…';
    try {
      await A.remote.coach.uploadGif(file, name);
      gifs = await A.remote.coach.listGifs();
      $('#form-gif').reset();
      renderLibrary(); if (draft) renderDays();
      $('#gif-status').textContent = `Listo: «${name}» ya está en tu biblioteca.`;
      toast('Animación guardada');
    } catch (e) { $('#gif-status').textContent = ''; fail(e && e.code === 'invalid' && e.detail ? e.detail : errText(e)); }
    finally { busy = false; btn.disabled = false; }
  }
  function wireCoach() {
    document.addEventListener('pg:coach-client-open', (ev) => openFicha(ev.detail || {}));
    $('#btn-coach-rutina').addEventListener('click', openEditor);
    $('#btn-redit-back').addEventListener('click', leave);
    $('#form-rutina').addEventListener('submit', save);
    $('#redit-name').addEventListener('input', () => { if (draft) { draft.title = $('#redit-name').value; dirty = true; } });
    const days = $('#redit-days');
    days.addEventListener('input', (ev) => { if (ev.target.dataset && ev.target.dataset.f && ev.target.tagName === 'INPUT') onField(ev.target); });
    days.addEventListener('change', (ev) => { if (ev.target.tagName === 'SELECT' && ev.target.dataset.f) onField(ev.target); });
    days.addEventListener('click', (ev) => { const b = ev.target.closest('[data-act]'); if (b && !b.disabled) onAction(b); });
    $('#btn-redit-add-day').addEventListener('click', () => {
      if (!draft || draft.days.length >= R.LIMITS.days) return;
      draft.days.push(R.blankDay(draft.days.length + 1));
      dirty = true; renderDays();
      $('#' + idOf(draft.days.length - 1, null, 'title')).focus();
    });
    $('#btn-redit-delete').addEventListener('click', removeRoutine);
    $('#form-gif').addEventListener('submit', upload);
    $('#gif-file').addEventListener('change', () => { const f = $('#gif-file').files[0]; if (f && !$('#gif-name').value.trim()) $('#gif-name').value = R.suggestName(f.name); $('#gif-error').classList.add('hidden'); });
    $('#gif-list').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-gact]');
      if (!b) return;
      const li = b.closest('.gif-item');
      if (b.dataset.gact === 'view') togglePreview(li); else deleteGif(li);
    });
    // Sin acuerdo vigente o sin vínculo, la ficha ya no se ve: se suelta lo que había abierto.
    document.addEventListener('pg:account-changed', () => { if (!(window.PGAccount && PGAccount.meta() && (PGAccount.meta().roles || []).includes('coach'))) { ctx = null; draft = null; freePreviews(); } });
  }

  function start() {
    if (A || !window.PGAccount) return;
    A = window.PGAccount;
    wireClient();
    wireCoach();
  }
  if (window.PGAccount) start();
  else document.addEventListener('pg:account-ready', start);
})();
