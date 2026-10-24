// Etapa 2 («App para coaches»): rutinas de ejercicios, parte de pantalla. SOLO con producto 'coach' (la app oficial no cambia: sin él, este archivo no hace nada).
//   Cliente: «Mi rutina» (Más y Inicio), solo lectura: sus rutinas visibles + la «Rutina de hoy» de su coach; días plegables y, al abrir cada
//   ejercicio, su animación con una URL firmada de 60 s NUEVA cada vez.
//   Coach: «Mis rutinas» (biblioteca: crear, editar, borrar, «Asignar a…» y publicar la «Rutina de hoy»), y en la ficha del asesorado sus rutinas
//   asignadas (editar la copia, mostrar/ocultar, quitar, asignar otra, crear una nueva). La biblioteca de animaciones se gestiona en el editor.
// Usa SOLO la API de Remote vía PGAccount (account.js). Lo que escribe otra persona (títulos, nombres, notas) entra al DOM con esc() o textContent.
// Las reglas (máx. 7 días, 12 ejercicios, 3 MB, firma de bytes, 50 plantillas, 20 rutinas por asesorado) están en rutinas.js; el servidor las vuelve a comprobar (r1 v1.8).
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
  const today = () => R.localDay();   // el día de ESTE dispositivo (igual que Hábitos y Medidas)

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
      if (err.detail === 'template_limit') return `Ya tienes ${R.LIMITS.templates} rutinas en tu biblioteca (el máximo). Borra alguna para crear otra.`;
      if (err.detail === 'routine_limit') return `Ese asesorado ya tiene ${R.LIMITS.perClient} rutinas (el máximo). Quita alguna primero.`;
      if (err.detail === 'bad_day') return 'La fecha de tu dispositivo no coincide con la del servidor. Revisa la fecha y la hora de tu teléfono.';
      return 'Revisa la rutina: algo no es válido (hasta 7 días y 12 ejercicios por día).';
    }
    if (err && err.code === 'not_found') return 'Esa rutina ya no existe. Actualiza la pantalla.';
    if (err && err.code === 'forbidden') return 'Este cliente ya no comparte sus datos contigo.';
    return A ? A.errorText(err, 'rutina') : 'No se pudo conectar con el servidor.';
  };

  // ============================== CLIENTE: Mi rutina ==============================
  let routines;           // undefined = sin cargar · [] = no tiene · [rutinas] = sus rutinas VISIBLES (forma de Rutinas.fromServer)
  let daily = null;       // la «Rutina de hoy» que devolvió el servidor para el día de este dispositivo (se vuelve a comprobar al pintar)
  let loadFailed = false;
  let loadSeq = 0;
  const myLink = () => { const m = A && A.meta(); return m && m.link && !(m.roles || []).includes('coach') ? m.link : null; };
  const dailyNow = () => (daily && R.dailyActive(daily, today()) ? daily : null);   // si la app sigue abierta pasada la medianoche, ya no vale
  const hasAny = () => !!((routines && routines.length) || dailyNow());

  // ---------- Animación o video (v1.9) ----------
  // Lo que baja de Storage puede traer el tipo vacío: se mira la firma de bytes (12 primeros) y, si es un video, se le pone su tipo (Safari lo exige).
  async function mediaInfo(blob) {
    let mime = '';
    try { mime = R.sniff(new Uint8Array(await blob.slice(0, 12).arrayBuffer())) || ''; } catch { /* sin firma: se usa el tipo del blob */ }
    if (!mime) mime = blob.type || '';
    const video = R.isVideo(mime);
    return { blob: video && blob.type !== mime ? new Blob([blob], { type: mime }) : blob, video, mime };
  }
  // <video> que se reproduce solo, en bucle y sin sonido, como un GIF. Si el sistema no deja arrancarlo solo (ahorro de batería), aparecen los controles.
  function buildVideo(url, label) {
    const v = document.createElement('video');
    v.className = 'rut-gif-img rut-gif-video';
    v.muted = true; v.defaultMuted = true; v.loop = true; v.autoplay = true; v.playsInline = true;
    v.setAttribute('muted', ''); v.setAttribute('loop', ''); v.setAttribute('autoplay', ''); v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
    v.disablePictureInPicture = true; v.preload = 'auto';
    v.setAttribute('aria-label', label);
    v.src = url;
    const p = v.play();
    if (p && typeof p.catch === 'function') p.catch(() => { v.controls = true; });
    return v;
  }
  function buildMedia(info, url, label) {
    if (info.video) return buildVideo(url, label);
    const img = document.createElement('img');
    img.className = 'rut-gif-img'; img.alt = label; img.src = url;
    return img;
  }
  // Suelta el archivo en memoria: un <video> con la URL sin soltar mantiene el blob vivo.
  function dropMedia(slot) {
    if (!slot) return;
    for (const v of slot.querySelectorAll('video')) { try { v.pause(); } catch { /* ya parado */ } v.removeAttribute('src'); try { v.load(); } catch { /* sin soporte */ } }
    slot.replaceChildren();
  }
  // Duración (s) de un video del coach, leída con un <video> temporal. NaN si el navegador no lo puede leer. El servidor no la ve: límite blando.
  function probeDuration(file) {
    return new Promise((resolve) => {
      const v = document.createElement('video');
      const url = URL.createObjectURL(file);
      let done = false, timer;
      const end = (d) => { if (done) return; done = true; clearTimeout(timer); v.removeAttribute('src'); try { v.load(); } catch { /* sin soporte */ } URL.revokeObjectURL(url); resolve(d); };
      timer = setTimeout(() => end(NaN), 10000);
      v.preload = 'metadata'; v.muted = true; v.playsInline = true;
      v.onerror = () => end(NaN);
      v.onloadedmetadata = () => {
        if (v.duration === Infinity) {   // webm grabado en el navegador: no trae duración hasta que se salta al final
          v.ondurationchange = () => { if (Number.isFinite(v.duration)) end(v.duration); };
          v.currentTime = 1e101;
        } else end(v.duration);
      };
      v.src = url;
    });
  }

  function freeGif(el) {
    if (el._url) URL.revokeObjectURL(el._url);
    el._url = null;
    el._tok = (el._tok || 0) + 1;
    dropMedia(el.querySelector('.rut-gif'));
  }
  function freeAllGifs() { for (const el of document.querySelectorAll('#view-rutina .rut-ex')) freeGif(el); }

  // La animación se pide SOLO al abrir el ejercicio y se suelta al cerrarlo: cada apertura firma una URL nueva (60 s).
  async function loadGif(el) {
    const slot = el.querySelector('.rut-gif');
    if (!slot || !el.dataset.gif || !el.dataset.coach) return;
    const tok = (el._tok = (el._tok || 0) + 1);
    slot.textContent = 'Cargando la demostración…';
    try {
      const info = await mediaInfo(await A.remote.client.gifBlob(el.dataset.coach, el.dataset.gif));
      if (!el.open || el._tok !== tok) return;   // lo cerró o lo reabrió mientras cargaba
      el._url = URL.createObjectURL(info.blob);
      slot.replaceChildren(buildMedia(info, el._url, `${info.video ? 'Video' : 'Animación'} del ejercicio: ${el.dataset.name}`));
    } catch (err) {
      if (!el.open || el._tok !== tok) return;
      const p = document.createElement('p');
      p.className = 'small warn';
      p.textContent = 'No pudimos cargar la demostración. Revisa tu internet e inténtalo de nuevo.';
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn btn-ghost btn-tall'; b.textContent = 'Reintentar'; b.dataset.retry = '1';
      slot.replaceChildren(p, b);
    }
  }

  function renderEntrances() {
    const on = !!myLink();
    const d = on ? dailyNow() : null;
    const n = routines ? routines.length : 0;
    for (const el of document.querySelectorAll('.rutina-row')) el.classList.toggle('hidden', !on);
    // UX Etapa 1: UN solo bloque en Inicio. «Rutina de hoy: Piernas» si el coach publicó una para hoy; si no, «Mi rutina» con lo que armó (y solo si ya tiene alguna).
    const card = $('#home-daily');
    card.classList.toggle('hidden', !(d || (on && n)));
    if (d) { $('#hd-title').textContent = `Rutina de hoy: ${d.title}`; $('#hd-text').textContent = R.summary(d); }
    else if (on && n) { $('#hd-title').textContent = 'Mi rutina'; $('#hd-text').textContent = R.homeLine(routines); }
  }
  // UX Etapa 1: UN solo «Ya entrené» (siempre disponible para el asesorado: entrene con la rutina de su coach o por su cuenta). Marca el hábito del día y pregunta el esfuerzo.
  function renderTrained() {
    const card = $('#rutina-trained');
    card.classList.remove('hidden');
    const done = !!(window.PGNav && PGNav.trainedToday && PGNav.trainedToday());
    const b = $('#btn-rutina-trained');
    b.disabled = done;
    b.textContent = done ? '✓ Entrenamiento de hoy anotado' : '✓ Ya entrené';
  }
  // Todos los ejercicios llevan «Cómo se hace ›»: con la animación o el video del coach, su nota o, si no hay nada, un aviso amable.
  function exerciseHTML(e, coachId) {
    const head = `<span class="rut-ex-text"><span class="rut-ex-name">${esc(e.name)}</span><span class="rut-ex-sets">${esc(e.sets)}</span></span><span class="rut-ex-how">Cómo se hace ›</span>`;
    const none = !e.gif && !e.note;
    return `<li><details class="rut-ex" data-gif="${esc(e.gif)}" data-name="${esc(e.name)}" data-coach="${esc(coachId)}"><summary aria-label="${esc(e.name)}, ${esc(e.sets)}. Cómo se hace">${head}</summary>
      <div class="rut-ex-body">${e.note ? `<p class="rut-note">${esc(e.note)}</p>` : ''}${e.gif ? '<div class="rut-gif" role="status" aria-live="polite"></div>' : ''}${none ? '<p class="rut-note muted">Tu coach todavía no agregó una demostración de este ejercicio. Si tienes dudas de cómo hacerlo, pregúntale.</p>' : ''}</div></details></li>`;
  }
  // Una rutina (o la de hoy): cabecera + días plegables. Solo se abre el primer día de la primera rutina de la pantalla.
  function blockHTML(r, { isDaily, openFirst, by }) {
    const stamp = isDaily ? `para hoy, ${fmtStamp(r.publishedAt)}` : r.updatedAt ? `actualizada el ${fmtStamp(r.updatedAt)}` : '';
    return `<section class="rut-block${isDaily ? ' rut-daily' : ''}"><div class="card rut-head">${isDaily ? '<span class="rut-badge">Rutina de hoy</span>' : ''}<h3 class="rut-title">${esc(r.title)}</h3>
        <p class="small muted">${by}${esc(R.summary(r))}${stamp ? ` · ${esc(stamp)}` : ''}</p>
        </div>` +
      r.days.map((d, i) => `<details class="card rut-day"${openFirst && i === 0 ? ' open' : ''}><summary><span class="rut-day-title">${esc(d.title)}</span><span class="small muted">${esc(R.dayLine(d))}</span></summary>
        <ul class="rut-ex-list">${d.exercises.map((e) => exerciseHTML(e, r.coachId)).join('')}</ul></details>`).join('') + '</section>';
  }
  function renderRoutine() {
    freeAllGifs();
    renderEntrances();
    const box = $('#rutina-body');
    box.after($('#rutina-trained'));   // vuelve a su sitio (debajo de la lista) antes de repintarla
    const status = $('#rutina-status');
    if (!myLink()) {
      status.textContent = '';
      box.innerHTML = '<div class="card"><p><strong>Todavía no tienes una rutina.</strong></p><p class="small muted">Cuando tengas un coach, la rutina que arme para ti aparecerá aquí con la demostración de cada ejercicio. Mientras tanto, puedes anotar tu entrenamiento.</p></div>';
      renderTrained();
      return;
    }
    if (routines === undefined) {
      box.replaceChildren();
      status.textContent = loadFailed ? '' : 'Cargando tu rutina…';
      if (loadFailed) box.innerHTML = '<div class="card"><p>No pudimos cargar tu rutina. Revisa tu internet e inténtalo de nuevo.</p><button type="button" class="btn btn-tall" id="btn-rutina-retry">Volver a intentar</button></div>';
      renderTrained();
      return;
    }
    status.textContent = '';
    const l = myLink();
    const d = dailyNow();
    if (!routines.length && !d) {
      box.innerHTML = `<div class="card"><p><strong>Todavía no tienes una rutina.</strong></p><p class="small muted">${esc(l && l.businessName ? l.businessName : 'Tu coach')} la armará para ti y, cuando lo haga, la verás aquí con la animación de cada ejercicio.</p></div>`;
      renderTrained();
      return;
    }
    const by = l && l.businessName ? `Armada por ${esc(l.businessName)} · ` : '';
    let html = '';
    if (d) html += blockHTML(d, { isDaily: true, openFirst: true, by: l && l.businessName ? `De ${esc(l.businessName)} · ` : '' });
    if (d && routines.length) html += '<h3 class="rut-section">Mis rutinas</h3>';
    html += routines.map((r, i) => blockHTML(r, { isDaily: false, openFirst: !d && i === 0, by })).join('');
    box.innerHTML = html;
    // «Ya entrené» va justo debajo de la rutina principal (la de hoy o la primera), no al final de una lista larga.
    const blocks = box.querySelectorAll('.rut-block');
    if (blocks.length > 1) blocks[0].after($('#rutina-trained'));
    renderTrained();
  }
  async function loadRoutine({ silent = false } = {}) {
    if (!A || !myLink()) { routines = undefined; daily = null; renderEntrances(); return; }
    const seq = ++loadSeq;
    loadFailed = false;
    if (!silent && routines === undefined) renderRoutine();
    try {
      const [rs, d] = await Promise.all([A.remote.client.myRoutines(), A.remote.client.myDaily(today())]);
      if (seq !== loadSeq) return;
      routines = rs;
      daily = d;
    } catch (err) {
      if (seq !== loadSeq) return;
      if (routines === undefined) loadFailed = true;
      if (!silent && routines !== undefined) toast(errText(err), true);
    }
    renderRoutine();
  }
  function wireClient() {
    const body = $('#view-rutina');
    body.addEventListener('toggle', (ev) => {   // 'toggle' no sube por el árbol: se escucha en la captura
      const el = ev.target;
      if (!el.classList || !el.classList.contains('rut-ex')) return;
      if (el.open) loadGif(el); else freeGif(el);
    }, true);
    body.addEventListener('click', (ev) => {
      if (ev.target.closest('#btn-rutina-retry')) { routines = undefined; loadRoutine(); return; }
      const r = ev.target.closest('[data-retry]');
      if (r) loadGif(r.closest('.rut-ex'));
    });
    $('#btn-rutina-trained').addEventListener('click', () => document.dispatchEvent(new CustomEvent('pg:rutina-trained')));
    document.addEventListener('pg:rutina-trained-done', () => { renderTrained(); $('#rutina-trained-status').textContent = ''; });
    // Al entrar a la pantalla se vuelve a pedir (el coach pudo cambiarla); la que ya estaba se ve mientras tanto.
    const open = () => { $('#rutina-trained-status').textContent = ''; renderRoutine(); loadRoutine({ silent: routines !== undefined }); };
    $('#row-rutina').addEventListener('click', open);
    $('#tab-entrenar').addEventListener('click', open);   // UX Etapa 1: «Entrenar» está en la barra
    $('#btn-home-daily').addEventListener('click', open);
    for (const ev of ['pg:link-changed', 'pg:account-changed']) document.addEventListener(ev, () => {
      if (!myLink()) { routines = undefined; daily = null; freeAllGifs(); renderEntrances(); return; }
      if (routines === undefined) loadRoutine({ silent: true }); else renderEntrances();
    });
    // Al volver a la app (o pasada la medianoche) se pide otra vez: la rutina de hoy es solo de hoy.
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && myLink()) loadRoutine({ silent: true }); });
    loadRoutine({ silent: true });
  }

  // ============================== COACH: editor de una rutina (de la biblioteca o la copia de un asesorado) ==============================
  let target = null;      // { kind: 'client'|'template', clientId?, name?, routine: (guardada|null) } lo que se está editando
  let draft = null;       // lo que se está editando
  let gifs = [];          // biblioteca de animaciones del coach
  let dirty = false;
  let busy = false;

  const idOf = (d, e, f) => (e == null ? `d${d}-${f}` : `d${d}e${e}-${f}`);
  const gifName = (id) => { const g = gifs.find((x) => x.id === id); return g ? g.name : ''; };
  function gifOptions(sel) {
    const known = gifs.some((g) => g.id === sel);
    return `<option value="">Sin video ni animación</option>${sel && !known ? `<option value="${esc(sel)}" selected>Animación que ya no está en tu biblioteca</option>` : ''}` +
      gifs.map((g) => `<option value="${esc(g.id)}"${g.id === sel ? ' selected' : ''}>${esc(g.name)}${R.isVideo(g.mime) ? ' (video)' : ''}</option>`).join('');
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
  function openEditor(t) {
    if (!t) return;
    target = t;
    const saved = t.routine;
    draft = saved ? { title: saved.title, days: clone(saved.days) } : R.blankRoutine();
    dirty = false;
    showError('');
    const isTpl = t.kind === 'template';
    $('#redit-title').textContent = isTpl ? (saved ? 'Editar la rutina' : 'Crear una rutina') : saved ? `Rutina de ${t.name}` : `Nueva rutina para ${t.name}`;
    $('#redit-hint').textContent = isTpl
      ? 'Esta rutina es tuya y no pertenece a ningún asesorado. Para dársela a alguien, usa «Asignar a…» en Más → Mis rutinas.'
      : saved ? `Estás modificando la copia de ${t.name}: no cambia tu rutina original ni las de otros asesorados.` : `Esta rutina solo la verá ${t.name}.`;
    $('#redit-name').value = draft.title;
    const del = $('#btn-redit-delete');
    del.classList.toggle('hidden', !saved);
    del.textContent = isTpl ? 'Borrar la rutina' : 'Quitar esta rutina';
    $('#redit-status').textContent = '';
    renderDays();
    renderLibrary();
    PGNav.show('rutina-edit', isTpl ? 'mas' : undefined);
    $('#redit-title').focus();
    A.remote.coach.listGifs().then((list) => { gifs = list; if (draft) { renderDays(); renderLibrary(); } }, (err) => { $('#redit-status').textContent = `No pudimos cargar tus animaciones. ${errText(err)}`; });
  }
  function leave() {
    if (dirty && !confirm('Tienes cambios sin guardar. ¿Salir sin guardar?')) return;
    freePreviews();
    const t = target;
    draft = null; dirty = false; target = null;
    if (t && t.kind === 'template') { PGNav.show('rutinas'); const b = $('#btn-rl-new'); if (b) b.focus(); }
    else { PGNav.show('coach'); const b = $('#btn-coach-rutina'); if (b) b.focus(); }
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
      const t = target, id = t.routine ? t.routine.id : null;
      const out = t.kind === 'template' ? await A.remote.coach.saveTemplate(id, draft) : await A.remote.coach.saveClientRoutine(t.clientId, id, draft);
      t.routine = out;
      dirty = false;
      if (t.kind === 'client') await loadFicha({ keep: true }); else await loadLibrary({ keep: true });
      toast(t.kind === 'template' ? 'Rutina guardada en tu biblioteca' : `Rutina guardada para ${t.name}`);
      leave();
    } catch (err) { showError(errText(err)); }
    finally { busy = false; for (const b of document.querySelectorAll('#form-rutina button')) b.disabled = false; if (draft) renderDays(); }
  }
  async function removeFromEditor() {
    const t = target;
    if (!t || !t.routine) return;
    const isTpl = t.kind === 'template';
    if (!confirm(isTpl ? `¿Borrar la rutina «${t.routine.title}» de tu biblioteca? Las copias que ya asignaste y la rutina de hoy no cambian.` : `¿Quitar la rutina «${t.routine.title}» de ${t.name}? Dejará de verla en su app.`)) return;
    try {
      if (isTpl) await A.remote.coach.deleteTemplate(t.routine.id); else await A.remote.coach.deleteClientRoutine(t.routine.id);
      dirty = false;
      if (isTpl) await loadLibrary({ keep: true }); else await loadFicha({ keep: true });
      toast(isTpl ? 'Rutina borrada' : 'Rutina quitada');
      leave();
    } catch (err) { showError(errText(err)); }
  }

  // ---------- Biblioteca de animaciones (dentro del editor) ----------
  const previews = new Map();   // id → object URL de la vista previa abierta (se suelta al cerrarla)
  function freePreviews() { for (const u of previews.values()) URL.revokeObjectURL(u); previews.clear(); for (const s of document.querySelectorAll('#gif-list .gif-preview')) dropMedia(s); }
  function renderLibrary() {
    const ul = $('#gif-list');
    ul.innerHTML = gifs.length ? gifs.map((g) => `<li class="gif-item" data-id="${esc(g.id)}">
        <div class="gif-row"><span class="gif-info"><strong>${esc(g.name)}</strong><span class="small muted"><span class="gif-kind${R.isVideo(g.mime) ? ' gif-kind-video' : ''}">${R.isVideo(g.mime) ? '▶ Video' : g.mime === 'image/webp' ? 'WebP' : 'GIF'}</span> ${esc(R.fmtSize(g.size))} · ${g.uses ? `en ${plural(g.uses, 'rutina', 'rutinas')}` : 'sin usar todavía'}</span></span>
          <span class="gif-btns"><button type="button" class="btn btn-ghost" data-gact="view" aria-expanded="false" aria-label="Ver ${R.isVideo(g.mime) ? 'el video' : 'la animación'} ${esc(g.name)}">Ver</button>
          <button type="button" class="btn btn-ghost" data-gact="del" aria-label="Borrar la animación ${esc(g.name)}">Borrar</button></span></div>
        <div class="gif-preview" role="status" aria-live="polite"></div></li>`).join('') : '<li class="small muted">Todavía no subes ningún video ni animación.</li>';
  }
  async function togglePreview(li) {
    const id = li.dataset.id, slot = li.querySelector('.gif-preview'), btn = li.querySelector('[data-gact="view"]');
    if (previews.has(id)) { URL.revokeObjectURL(previews.get(id)); previews.delete(id); dropMedia(slot); btn.setAttribute('aria-expanded', 'false'); btn.textContent = 'Ver'; return; }
    btn.setAttribute('aria-expanded', 'true'); btn.textContent = 'Ocultar';
    slot.textContent = 'Cargando…';
    try {
      const info = await mediaInfo(await A.remote.coach.gifBlob(id));
      if (btn.getAttribute('aria-expanded') !== 'true') return;
      const url = URL.createObjectURL(info.blob);
      previews.set(id, url);
      slot.replaceChildren(buildMedia(info, url, `${info.video ? 'Video' : 'Animación'}: ${gifName(id)}`));
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
    if (!file) { fail('Elige el video o la animación.', fileEl); return; }
    let name = $('#gif-name').value.trim() || R.suggestName(file.name);
    if (!name) { fail('Ponle un nombre.', $('#gif-name')); return; }
    if (name.length > R.LIMITS.gifName) { fail(`El nombre es muy largo: máximo ${R.LIMITS.gifName} letras.`, $('#gif-name')); return; }
    // Se valida aquí (tipo, tamaño y firma de bytes) para avisar enseguida; remote.js y el servidor lo vuelven a comprobar. NO se re-codifica.
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const chk = R.checkGif({ type: file.type, size: file.size }, head);
    if (!chk.ok) { fail(chk.message, fileEl); return; }
    busy = true;
    const btn = $('#btn-gif-upload');
    btn.disabled = true;
    if (R.isVideo(chk.mime)) {   // duración máxima: límite blando (solo la app la ve)
      $('#gif-status').textContent = 'Revisando el video…';
      const dur = R.checkDuration(await probeDuration(file));
      if (!dur.ok) { busy = false; btn.disabled = false; $('#gif-status').textContent = ''; fail(dur.message, fileEl); return; }
    }
    $('#gif-status').textContent = R.isVideo(chk.mime) ? 'Subiendo el video…' : 'Subiendo la animación…';
    try {
      await A.remote.coach.uploadGif(file, name);
      gifs = await A.remote.coach.listGifs();
      $('#form-gif').reset();
      renderLibrary(); if (draft) renderDays();
      $('#gif-status').textContent = `Listo: «${name}» ya está en tu biblioteca. Toca «Ver» para revisarlo.`;
      toast(R.isVideo(chk.mime) ? 'Video guardado' : 'Animación guardada');
    } catch (e) { $('#gif-status').textContent = ''; fail(e && e.code === 'invalid' && e.detail ? e.detail : errText(e)); }
    finally { busy = false; btn.disabled = false; }
  }

  // ============================== COACH: ficha del asesorado ==============================
  let ctx = null;         // { clientId, name } del asesorado abierto en la ficha
  let assigned;           // sus rutinas asignadas (undefined = sin cargar)
  let templates;          // «Mis rutinas» del coach (undefined = sin cargar)

  function renderFicha() {
    const card = $('#coach-detail-rutina-card');
    card.classList.remove('hidden');
    const ul = $('#coach-detail-rutinas');
    const line = $('#coach-detail-rutina-line');
    const pick = $('#rc-assign');
    $('#btn-coach-rutina').disabled = assigned === undefined;
    if (assigned === undefined) { ul.replaceChildren(); pick.classList.add('hidden'); return; }
    const n = assigned.length, hid = assigned.filter((r) => !r.visible).length;
    line.textContent = n
      ? `${plural(n, 'rutina asignada', 'rutinas asignadas')} · ${hid ? `${plural(hid, 'oculta', 'ocultas')} para ${ctx.name}` : `${ctx.name} ${n === 1 ? 'la' : 'las'} ve`}.`
      : `${ctx.name} todavía no tiene rutinas.`;
    ul.innerHTML = assigned.map((r) => `<li class="rc-item" data-id="${esc(r.id)}">
        <div class="rc-main"><strong class="rc-name">${esc(r.title)}</strong><span class="small muted">${esc(R.summary(r))}${r.updatedAt ? ` · actualizada el ${esc(fmtStamp(r.updatedAt))}` : ''}${r.visible ? '' : ' · oculta'}</span></div>
        <label class="rc-switch"><input type="checkbox" role="switch" data-ract="vis"${r.visible ? ' checked' : ''} aria-label="Visible para el asesorado: ${esc(r.title)}"><span class="rc-track" aria-hidden="true"></span><span class="rc-switch-text">Visible para el asesorado</span></label>
        <div class="row-actions rc-actions">
          <button type="button" class="btn btn-ghost" data-ract="edit" aria-label="Entrar y modificar la rutina ${esc(r.title)} de ${esc(ctx.name)}">Entrar y modificar</button>
          <button type="button" class="btn btn-ghost" data-ract="del" aria-label="Quitar la rutina ${esc(r.title)} de ${esc(ctx.name)}">Quitar</button>
        </div></li>`).join('');
    const full = assigned.length >= R.LIMITS.perClient;
    const has = Array.isArray(templates) && templates.length;
    pick.classList.toggle('hidden', !has || full);
    if (has) $('#rc-pick').innerHTML = templates.map((t) => `<option value="${esc(t.id)}">${esc(t.title)}</option>`).join('');
    const b = $('#btn-coach-rutina');
    b.disabled = full;
    b.textContent = full ? `Máximo ${R.LIMITS.perClient} rutinas` : '＋ Crear una rutina nueva';
  }
  async function loadFicha({ keep = false } = {}) {
    if (!ctx) return;
    const my = ctx.clientId;
    if (!keep) { assigned = undefined; renderFicha(); $('#coach-detail-rutina-line').textContent = 'Revisando sus rutinas…'; }
    try {
      const [a, t] = await Promise.all([A.remote.coach.listClientRoutines(my), A.remote.coach.listTemplates()]);
      if (!ctx || ctx.clientId !== my) return;
      assigned = a; templates = t;
    } catch (err) {
      if (!ctx || ctx.clientId !== my) return;
      if (!keep) { assigned = undefined; $('#coach-detail-rutina-line').textContent = errText(err); }
      else toast(errText(err), true);
      return;
    }
    renderFicha();
  }
  function openFicha(detail) {
    ctx = { clientId: detail.clientId, name: detail.name || 'tu asesorado' };
    assigned = undefined;
    $('#coach-detail-rutinas').replaceChildren();
    $('#rc-assign').classList.add('hidden');
    $('#coach-detail-rutina-card').classList.remove('hidden');
    $('#btn-coach-rutina').disabled = true;
    loadFicha();
  }
  async function onFichaAction(ev) {
    const b = ev.target.closest('[data-ract]');
    if (!b || !ctx) return;
    const li = b.closest('.rc-item');
    const r = assigned && assigned.find((x) => x.id === li.dataset.id);
    if (!r) return;
    if (b.dataset.ract === 'edit') openEditor({ kind: 'client', clientId: ctx.clientId, name: ctx.name, routine: r });
    else if (b.dataset.ract === 'del') {
      if (!confirm(`¿Quitar la rutina «${r.title}» de ${ctx.name}? Dejará de verla en su app.`)) return;
      try { await A.remote.coach.deleteClientRoutine(r.id); toast('Rutina quitada'); await loadFicha({ keep: true }); $('#btn-coach-rutina').focus(); }
      catch (err) { toast(errText(err), true); }
    }
  }
  async function onVisible(ev) {
    const inp = ev.target.closest('input[data-ract="vis"]');
    if (!inp || !ctx) return;
    const li = inp.closest('.rc-item');
    const r = assigned && assigned.find((x) => x.id === li.dataset.id);
    if (!r) return;
    const want = inp.checked;
    inp.disabled = true;
    try {
      const out = await A.remote.coach.setRoutineVisible(r.id, want);
      r.visible = out.visible;
      toast(r.visible ? `Ahora ${ctx.name} ve «${r.title}»` : `«${r.title}» quedó oculta para ${ctx.name}`);
    } catch (err) { inp.checked = !want; toast(errText(err), true); }
    inp.disabled = false;
    renderFicha();
    const again = document.querySelector(`#coach-detail-rutinas [data-id="${CSS.escape(r.id)}"] input[data-ract="vis"]`);
    if (again) again.focus();
  }
  async function assignHere() {
    if (!ctx) return;
    const id = $('#rc-pick').value;
    const t = templates && templates.find((x) => x.id === id);
    if (!t) return;
    const btn = $('#btn-rc-assign');
    btn.disabled = true;
    try {
      await A.remote.coach.assignTemplate(id, [ctx.clientId]);
      toast(`«${t.title}» asignada a ${ctx.name}`);
      await loadFicha({ keep: true });
    } catch (err) { toast(errText(err), true); }
    btn.disabled = false;
  }

  // ============================== COACH: Mis rutinas (biblioteca) ==============================
  let lib;                // plantillas del coach (undefined = sin cargar)
  let pub;                // su «Rutina de hoy» publicada (null = ninguna)
  let libFailed = false;

  const dailyOn = () => !!(pub && R.dailyActive(pub, today()));
  function renderDaily() {
    const line = $('#rl-daily-line');
    const clear = $('#btn-rl-daily-clear');
    if (lib === undefined) { line.textContent = libFailed ? '' : 'Revisando…'; clear.classList.add('hidden'); return; }
    clear.classList.toggle('hidden', !pub);
    if (dailyOn()) line.textContent = `Hoy: «${pub.title}». La ven todos tus asesorados activos en su Inicio, solo durante hoy. Mañana ya no se verá.`;
    else if (pub) line.textContent = `La última que publicaste fue «${pub.title}» (${R.fmtDay(pub.day)}) y ya no se muestra, porque era de otro día. Publica otra para hoy cuando quieras.`;
    else line.textContent = 'Hoy no hay ninguna publicada. Elige una de tus rutinas y toca «Publicar como rutina de hoy»: todos tus asesorados activos la verán hoy en su Inicio, sin asignarla uno por uno.';
  }
  function renderLib() {
    renderDaily();
    const ul = $('#rl-list');
    const st = $('#rl-status');
    const nb = $('#btn-rl-new');
    if (lib === undefined) { ul.replaceChildren(); st.textContent = libFailed ? 'No pudimos cargar tus rutinas. Revisa tu conexión e inténtalo de nuevo.' : 'Cargando tus rutinas…'; nb.disabled = true; return; }
    const full = lib.length >= R.LIMITS.templates;
    nb.disabled = full;
    nb.textContent = full ? `Máximo ${R.LIMITS.templates} rutinas` : '＋ Crear una rutina';
    st.textContent = lib.length ? `${plural(lib.length, 'rutina', 'rutinas')} en tu biblioteca.` : 'Todavía no tienes rutinas. Crea la primera, por ejemplo «Pecho» o «Piernas».';
    ul.innerHTML = lib.map((t) => `<li class="card rl-item" data-id="${esc(t.id)}">
        <div class="rl-head"><strong class="rl-name">${esc(t.title)}</strong>${dailyOn() && pub.templateId === t.id ? '<span class="rut-badge">Es la de hoy</span>' : ''}<span class="small muted">${esc(R.summary(t))}</span></div>
        <div class="rl-btns">
          <button type="button" class="btn btn-tall" data-lact="assign" aria-label="Asignar la rutina ${esc(t.title)} a asesorados">Asignar a…</button>
          <button type="button" class="btn btn-ghost btn-tall" data-lact="daily" aria-label="Publicar ${esc(t.title)} como rutina de hoy para todos tus asesorados">Publicar como rutina de hoy</button>
          <button type="button" class="btn btn-ghost btn-tall" data-lact="edit" aria-label="Editar la rutina ${esc(t.title)}">Editar</button>
          <button type="button" class="btn btn-ghost btn-tall" data-lact="del" aria-label="Borrar la rutina ${esc(t.title)}">Borrar</button>
        </div></li>`).join('');
  }
  async function loadLibrary({ keep = false } = {}) {
    if (!A) return;
    libFailed = false;
    if (!keep) { lib = undefined; renderLib(); }
    try {
      const [t, d] = await Promise.all([A.remote.coach.listTemplates(), A.remote.coach.getDaily()]);
      lib = t; pub = d; templates = t;
    } catch (err) {
      if (!keep) libFailed = true; else toast(errText(err), true);
    }
    renderLib();
  }
  async function onLibAction(ev) {
    const b = ev.target.closest('[data-lact]');
    if (!b) return;
    const t = lib && lib.find((x) => x.id === b.closest('.rl-item').dataset.id);
    if (!t) return;
    const act = b.dataset.lact;
    if (act === 'edit') openEditor({ kind: 'template', routine: t });
    else if (act === 'assign') openAssign(t, b);
    else if (act === 'del') {
      if (!confirm(`¿Borrar la rutina «${t.title}» de tu biblioteca? Las copias que ya asignaste y la rutina de hoy no cambian.`)) return;
      try { await A.remote.coach.deleteTemplate(t.id); toast('Rutina borrada'); await loadLibrary({ keep: true }); $('#btn-rl-new').focus(); }
      catch (err) { toast(errText(err), true); }
    } else if (act === 'daily') {
      if (dailyOn() && pub.templateId !== t.id && !confirm(`Ya publicaste «${pub.title}» para hoy. ¿Cambiarla por «${t.title}»?`)) return;
      b.disabled = true;
      try {
        pub = await A.remote.coach.publishDaily(t.id, today());
        toast(`«${t.title}» es la rutina de hoy para todos tus asesorados`);
        renderLib();
        const again = document.querySelector(`#rl-list [data-id="${CSS.escape(t.id)}"] [data-lact="daily"]`);
        if (again) again.focus();
      } catch (err) { toast(errText(err), true); b.disabled = false; }
    }
  }
  async function clearDaily() {
    if (!pub || !confirm('¿Quitar la rutina de hoy? Tus asesorados dejarán de verla en su Inicio.')) return;
    try { await A.remote.coach.clearDaily(); pub = null; toast('Quitaste la rutina de hoy'); renderLib(); $('#btn-rl-new').focus(); }
    catch (err) { toast(errText(err), true); }
  }

  // ---------- «Asignar a…» (uno o varios asesorados activos; cada uno recibe su propia copia) ----------
  let assignFor = null;   // { template, opener }
  let clientsList = [];
  const pname = (c) => c.displayName || 'Cliente sin nombre';
  async function openAssign(t, opener) {
    assignFor = { template: t, opener };
    const dlg = $('#dlg-asignar');
    $('#da-title').textContent = `Asignar «${t.title}» a…`;
    $('#da-list').replaceChildren();
    $('#da-error').classList.add('hidden');
    $('#da-all-row').classList.add('hidden');
    $('#da-all').checked = false;
    $('#da-status').textContent = 'Buscando a tus asesorados…';
    $('#btn-da-ok').disabled = true;
    dlg.showModal();
    $('#da-title').focus();
    try {
      clientsList = (await A.remote.coach.clients()).slice().sort((a, b) => pname(a).localeCompare(pname(b), 'es'));
    } catch (err) { $('#da-status').textContent = errText(err); return; }
    if (!assignFor) return;
    $('#da-status').textContent = clientsList.length ? 'Marca a quién se la quieres dar:' : 'Todavía no tienes asesorados activos. Cuando tengas, podrás asignarles rutinas desde aquí.';
    $('#da-all-row').classList.toggle('hidden', clientsList.length < 2);
    $('#da-list').innerHTML = clientsList.map((c, i) => `<li><label class="check da-item"><input type="checkbox" name="da" value="${esc(c.clientId)}" id="da-c${i}"> <span>${esc(pname(c))}</span></label></li>`).join('');
    $('#btn-da-ok').disabled = !clientsList.length;
  }
  function closeAssign() {
    const dlg = $('#dlg-asignar');
    if (dlg.open) dlg.close();
  }
  async function submitAssign(ev) {
    ev.preventDefault();
    if (!assignFor || busy) return;
    const ids = [...document.querySelectorAll('#da-list input[name=da]:checked')].map((i) => i.value);
    const err = $('#da-error');
    if (!ids.length) { err.textContent = 'Marca al menos un asesorado.'; err.classList.remove('hidden'); const f = $('#da-list input'); if (f) f.focus(); return; }
    err.classList.add('hidden');
    busy = true;
    $('#btn-da-ok').disabled = true;
    try {
      const t = assignFor.template;
      await A.remote.coach.assignTemplate(t.id, ids);
      const opener = assignFor.opener;
      assignFor = null;
      closeAssign();
      toast(`«${t.title}» asignada a ${plural(ids.length, 'asesorado', 'asesorados')}. Cada uno tiene su propia copia.`);
      if (opener && opener.isConnected) opener.focus();
    } catch (e) { err.textContent = errText(e); err.classList.remove('hidden'); }
    finally { busy = false; $('#btn-da-ok').disabled = false; }
  }

  function wireCoach() {
    // --- ficha del asesorado ---
    document.addEventListener('pg:coach-client-open', (ev) => openFicha(ev.detail || {}));
    $('#btn-coach-rutina').addEventListener('click', () => { if (ctx && assigned !== undefined) openEditor({ kind: 'client', clientId: ctx.clientId, name: ctx.name, routine: null }); });
    $('#coach-detail-rutinas').addEventListener('click', onFichaAction);
    $('#coach-detail-rutinas').addEventListener('change', onVisible);
    $('#btn-rc-assign').addEventListener('click', assignHere);
    // --- editor ---
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
    $('#btn-redit-delete').addEventListener('click', removeFromEditor);
    $('#form-gif').addEventListener('submit', upload);
    $('#gif-file').addEventListener('change', () => { const f = $('#gif-file').files[0]; if (f && !$('#gif-name').value.trim()) $('#gif-name').value = R.suggestName(f.name); $('#gif-error').classList.add('hidden'); });
    $('#gif-list').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-gact]');
      if (!b) return;
      const li = b.closest('.gif-item');
      if (b.dataset.gact === 'view') togglePreview(li); else deleteGif(li);
    });
    // --- Mis rutinas (biblioteca) ---
    $('#row-c-rutinas').addEventListener('click', () => loadLibrary());
    $('#tab-rutinas').addEventListener('click', () => { document.querySelector('#rutinas-title').focus(); loadLibrary(); });   // UX Etapa 1: «Rutinas» está en la barra del coach
    $('#btn-rl-new').addEventListener('click', () => { if (lib !== undefined) openEditor({ kind: 'template', routine: null }); });
    $('#rl-list').addEventListener('click', onLibAction);
    $('#btn-rl-daily-clear').addEventListener('click', clearDaily);
    $('#form-asignar').addEventListener('submit', submitAssign);
    $('#btn-da-cancel').addEventListener('click', () => { const o = assignFor && assignFor.opener; assignFor = null; closeAssign(); if (o && o.isConnected) o.focus(); });
    $('#da-close').addEventListener('click', () => $('#btn-da-cancel').click());
    $('#dlg-asignar').addEventListener('cancel', () => { assignFor = null; });   // Esc
    $('#da-all').addEventListener('change', () => { for (const i of document.querySelectorAll('#da-list input[name=da]')) i.checked = $('#da-all').checked; });
    $('#da-list').addEventListener('change', () => {
      const all = [...document.querySelectorAll('#da-list input[name=da]')];
      $('#da-all').checked = !!all.length && all.every((i) => i.checked);
    });
    // Sin acuerdo vigente o sin vínculo, la ficha ya no se ve: se suelta lo que había abierto.
    document.addEventListener('pg:account-changed', () => {
      if (!(window.PGAccount && PGAccount.meta() && (PGAccount.meta().roles || []).includes('coach'))) { ctx = null; draft = null; target = null; assigned = undefined; templates = undefined; lib = undefined; pub = null; assignFor = null; freePreviews(); closeAssign(); }
    });
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
