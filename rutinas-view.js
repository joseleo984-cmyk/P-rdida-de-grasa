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
  // Estilo v2: { autoplay: false } (con «Reducir movimiento») deja el video quieto con sus controles; { decorative: true } es el fondo de una tarjeta
  // (sin nombre para el lector de pantalla y sin controles aunque el sistema no deje arrancarlo solo).
  function buildVideo(url, label, { autoplay = true, decorative = false } = {}) {
    const v = document.createElement('video');
    v.className = 'rut-gif-img rut-gif-video';
    v.muted = true; v.defaultMuted = true; v.loop = true; v.autoplay = autoplay; v.playsInline = true;
    v.setAttribute('muted', ''); v.setAttribute('loop', ''); if (autoplay) v.setAttribute('autoplay', ''); v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
    v.disablePictureInPicture = true; v.preload = autoplay ? 'auto' : 'metadata';
    if (decorative) v.setAttribute('aria-hidden', 'true'); else v.setAttribute('aria-label', label);
    v.src = url;
    if (!autoplay) { v.controls = true; return v; }
    const p = v.play();
    if (p && typeof p.catch === 'function') p.catch(() => { if (!decorative) v.controls = true; });
    return v;
  }
  function buildMedia(info, url, label, opts) {
    if (info.video) return buildVideo(url, label, opts);
    const img = document.createElement('img');
    img.className = 'rut-gif-img'; img.alt = opts && opts.decorative ? '' : label; img.src = url;
    return img;
  }
  const reduceMotion = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
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
    // Estilo v2 (imagen E1): «RUTINA DE HOY · DE TU COACH», el nombre grande y «N ejercicios · Día 1 de 2»; «Empezar» abre el paso a paso en ese día.
    const t = heroTarget();
    if (!t) return;
    const day = t.r.days[t.di], nEx = day.exercises.length;
    $('#hd-tag').textContent = d ? 'Rutina de hoy · de tu coach' : n > 1 ? `Tu rutina · tienes ${n}` : 'Tu rutina · de tu coach';
    $('#hd-title').textContent = t.r.title;
    $('#hd-text').textContent = `${plural(nEx, 'ejercicio', 'ejercicios')}${t.r.days.length > 1 ? ` · Día ${t.di + 1} de ${t.r.days.length}` : ''}`;
    $('#btn-home-daily').setAttribute('aria-label', `Empezar ${t.r.title}${t.r.days.length > 1 ? `, día ${t.di + 1}` : ''}`);
    // Concepto jurídico 4: el día que reporta dolor no se ofrece volver a «Empezar» (el resto de la app sigue igual).
    const locked = painLocked();
    $('#btn-home-daily').classList.toggle('hidden', locked);
    if (locked) $('#hd-text').textContent = PAIN_LOCK_TEXT;
  }
  // ---------- Estilo v2: qué día toca de cada rutina (el siguiente al último que terminó en este teléfono; no se sincroniza) ----------
  const DAYS_KEY = (window.PGNS && PGNS.key ? PGNS.key('paso-dias') : 'perdida-grasa:paso-dias');
  const routineKey = (r) => (r.id ? `r:${r.id}` : `hoy:${r.title}`);
  const readDays = () => { try { const v = JSON.parse(localStorage.getItem(DAYS_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
  function nextDay(r) {
    const usable = r.days.map((d, i) => (d.exercises.length ? i : -1)).filter((i) => i >= 0);
    if (!usable.length) return -1;
    const last = readDays()[routineKey(r)];
    return usable.find((i) => typeof last === 'number' && i > last) ?? usable[0];
  }
  function rememberDay(r, di) { const v = readDays(); v[routineKey(r)] = di; try { localStorage.setItem(DAYS_KEY, JSON.stringify(v)); } catch { /* sin espacio */ } }
  const sameRoutine = (a, b) => a.title === b.title && JSON.stringify(a.days) === JSON.stringify(b.days);
  // La de hoy (si hay) y después las demás, sin repetir la de hoy.
  function routineOrder() {
    const d = dailyNow();
    const list = routines || [];
    return d ? [{ r: d, isDaily: true }, ...list.filter((r) => !sameRoutine(r, d)).map((r) => ({ r, isDaily: false }))] : list.map((r) => ({ r, isDaily: false }));
  }
  function heroTarget() {
    if (!myLink()) return null;
    for (const { r, isDaily } of routineOrder()) { const di = nextDay(r); if (di >= 0) return { r, di, isDaily }; }
    return null;
  }
  // UX Etapa 1: UN solo «Ya entrené» (siempre disponible para el asesorado: entrene con la rutina de su coach o por su cuenta). Marca el hábito del día y pregunta el esfuerzo.
  function renderTrained() {
    const card = $('#rutina-trained');
    card.classList.remove('hidden');
    const done = !!(window.PGNav && PGNav.trainedToday && PGNav.trainedToday());
    const b = $('#btn-rutina-trained');
    b.setAttribute('aria-pressed', String(done));
    b.setAttribute('aria-label', done ? 'Ya entrené. El entrenamiento de hoy está anotado' : 'Ya entrené');
    b.textContent = '✓ Ya entrené';
  }
  // Todos los ejercicios llevan «Cómo se hace ›»: con la animación o el video del coach, su nota o, si no hay nada, un aviso amable.
  function exerciseHTML(e, coachId) {
    const line = R.setsLine(e);   // estilo v2: «4 series · 12 repeticiones · 12 kg · descanso 90 s», o el texto libre del coach tal cual
    const head = `<span class="rut-ex-text"><span class="rut-ex-name">${esc(e.name)}</span><span class="rut-ex-sets">${esc(line)}</span></span><span class="rut-ex-how">Cómo se hace ›</span>`;
    const none = !e.gif && !e.note;
    const key = `${coachId}|${e.name}`;
    return `<li class="rut-exrow"><button type="button" class="rut-check" data-check="${esc(key)}" aria-pressed="${checked(key)}" aria-label="Marcar «${esc(e.name)}» como hecho"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      <details class="rut-ex" data-gif="${esc(e.gif)}" data-name="${esc(e.name)}" data-coach="${esc(coachId)}"><summary aria-label="${esc(e.name)}, ${esc(line)}. Cómo se hace">${head}</summary>
      <div class="rut-ex-body">${e.note ? `<p class="rut-note">${esc(e.note)}</p>` : ''}${e.gif ? '<div class="rut-gif" role="status" aria-live="polite"></div>' : ''}${none ? '<p class="rut-note muted">Tu coach todavía no agregó una demostración de este ejercicio. Si tienes dudas de cómo hacerlo, pregúntale.</p>' : ''}</div></details></li>`;
  }
  // Ejercicios marcados como hechos HOY (solo en este teléfono; no se sincroniza y no sustituye al «Ya entrené»).
  const CHECKS_KEY = (window.PGNS && PGNS.key ? PGNS.key('rutina-hechos') : 'perdida-grasa:rutina-hechos');
  const readChecks = () => { try { const v = JSON.parse(localStorage.getItem(CHECKS_KEY) || '{}'); return v && v.day === today() && Array.isArray(v.keys) ? v.keys : []; } catch { return []; } };
  const checked = (key) => readChecks().includes(key);
  function toggleCheck(key) {
    const keys = readChecks();
    const next = keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key];
    try { localStorage.setItem(CHECKS_KEY, JSON.stringify({ day: today(), keys: next })); } catch { /* sin espacio */ }
    return next.includes(key);
  }
  // Una rutina (o la de hoy): cabecera + días plegables. Solo se abre el primer día de la primera rutina de la pantalla.
  function blockHTML(r, { isDaily, openFirst, by, main, business }) {
    const stamp = isDaily ? `para hoy, ${fmtStamp(r.publishedAt)}` : r.updatedAt ? `actualizada el ${fmtStamp(r.updatedAt)}` : '';
    // Rutina principal (la de hoy o la primera): UNA tarjeta con sus ejercicios en lista; sin días plegables si solo tiene un día.
    if (main && r.days.length === 1) {
      return `<section class="rut-block rut-main${isDaily ? ' rut-daily' : ''}"><div class="card rut-card">${isDaily ? '<span class="rut-badge sr-only">Rutina de hoy</span>' : ''}<div class="rut-titlebar"><h3 class="rut-title">${esc(r.title)}</h3>${business ? `<span class="rut-by"> · de ${esc(business)}</span>` : ''}</div>
        <ul class="rut-ex-list rut-flat">${r.days[0].exercises.map((e) => exerciseHTML(e, r.coachId)).join('')}</ul></div></section>`;
    }
    return `<section class="rut-block${isDaily ? ' rut-daily' : ''}${main ? ' rut-main' : ''}"><div class="card rut-head">${isDaily ? '<span class="rut-badge">Rutina de hoy</span>' : ''}<h3 class="rut-title">${esc(r.title)}</h3>
        <p class="small muted">${by}${esc(R.summary(r))}${stamp ? ` · ${esc(stamp)}` : ''}</p>
        </div>` +
      r.days.map((d, i) => `<details class="card rut-day"${openFirst && i === 0 ? ' open' : ''}><summary><span class="rut-day-title">${esc(d.title)}</span><span class="small muted">${esc(R.dayLine(d))}</span></summary>
        <ul class="rut-ex-list">${d.exercises.map((e) => exerciseHTML(e, r.coachId)).join('')}</ul></details>`).join('') + '</section>';
  }
  // ---------- Estilo v2 (imagen E2): tarjetas grandes de Entrenar ----------
  // Dibujos de color propios (sin fotos de modelos ni imágenes ajenas): sentadilla, plancha y de pie.
  const ART = [
    '<svg class="rcard-art" viewBox="0 0 140 120" aria-hidden="true" focusable="false"><g stroke-width="7" stroke-linecap="round" fill="none"><circle cx="78" cy="22" r="10" class="ra-fill" stroke="none"/><path d="M78 34 L72 66"/><path d="M75 44 L52 54 M75 44 L98 52"/><path d="M72 66 L48 80 L56 108"/><path d="M72 66 L98 84 L96 112"/></g><rect x="40" y="50" width="70" height="7" rx="3" class="ra-acc"/></svg>',
    '<svg class="rcard-art" viewBox="0 0 140 120" aria-hidden="true" focusable="false"><g stroke-width="7" stroke-linecap="round" fill="none"><circle cx="40" cy="58" r="10" class="ra-fill" stroke="none"/><path d="M52 64 L104 74"/><path d="M60 66 L58 96 M96 72 L100 100"/></g><path d="M20 102 H124" stroke-width="4" stroke-linecap="round" class="ra-line"/></svg>',
    '<svg class="rcard-art" viewBox="0 0 140 120" aria-hidden="true" focusable="false"><g stroke-width="7" stroke-linecap="round" fill="none"><circle cx="70" cy="18" r="10" class="ra-fill" stroke="none"/><path d="M70 30 L70 70"/><path d="M70 40 L46 62 M70 40 L94 62"/><path d="M70 70 L54 108 M70 70 L86 108"/></g></svg>',
  ];
  let cards = [];          // [{ r, di, isDaily }] en el orden de la pantalla
  function cardsHTML(biz) {
    cards = [];
    for (const { r, isDaily } of routineOrder()) r.days.forEach((d, di) => { if (d.exercises.length) cards.push({ r, di, isDaily }); });
    return cards.map((c, k) => {
      const d = c.r.days[c.di], multi = c.r.days.length > 1, n = d.exercises.length;
      const title = multi ? d.title : c.r.title;
      const meta = multi ? `Día ${c.di + 1} de ${c.r.days.length} · ${c.r.title}` : biz ? `De ${biz}` : 'De tu coach';
      const gif = Paso.coverGif(d);
      const hoy = c.isDaily && c.di === nextDay(c.r);
      return `<li class="rcard g${k % 3}"${gif ? ` data-gif="${esc(gif)}" data-coach="${esc(c.r.coachId)}"` : ''}>
        <button type="button" class="rcard-btn" data-start="${k}" aria-label="Empezar ${esc(title)}${hoy ? ' (hoy)' : ''}. ${esc(meta)}. ${plural(n, 'ejercicio', 'ejercicios')}">
          <span class="rcard-media" aria-hidden="true">${ART[k % 3]}</span><span class="rcard-shade" aria-hidden="true"></span>
          ${hoy ? '<span class="rcard-pill" aria-hidden="true">HOY</span>' : ''}
          <span class="rcard-text" aria-hidden="true"><span class="rcard-title">${esc(title)}</span><span class="rcard-meta">${esc(meta)}</span></span>
          <span class="rcard-chip" aria-hidden="true">${plural(n, 'ejercicio', 'ejercicios')}</span>
        </button></li>`;
    }).join('');
  }
  // Fondo con el video o GIF del coach: SOLO la tarjeta que más se ve (una reproducción a la vez); al salir de la vista se suelta el archivo.
  // Con «Reducir movimiento» no se carga nada: queda el dibujo de color.
  let cardObs = null, cardActive = null;
  function unmountCard(li) {
    li._tok = (li._tok || 0) + 1;
    for (const m of li.querySelectorAll('.rcard-video')) { if (m.tagName === 'VIDEO') { try { m.pause(); } catch { /* ya parado */ } m.removeAttribute('src'); try { m.load(); } catch { /* sin soporte */ } } m.remove(); }
    if (li._url) URL.revokeObjectURL(li._url);
    li._url = null;
    li.classList.remove('has-media');
    if (cardActive === li) cardActive = null;
  }
  async function mountCard(li) {
    cardActive = li;
    const tok = (li._tok = (li._tok || 0) + 1);
    try {
      const info = await mediaInfo(await A.remote.client.gifBlob(li.dataset.coach, li.dataset.gif));
      if (cardActive !== li || li._tok !== tok || !li.isConnected) return;
      li._url = URL.createObjectURL(info.blob);
      const m = buildMedia(info, li._url, '', { decorative: true });
      m.classList.add('rcard-video');
      li.querySelector('.rcard-media').appendChild(m);
      li.classList.add('has-media');
    } catch { /* sin conexión: queda el dibujo */ }
  }
  function stopCardMedia() {
    if (cardObs) cardObs.disconnect();
    cardObs = null;
    for (const li of document.querySelectorAll('#rutina-cards .rcard')) unmountCard(li);
    cardActive = null;
  }
  function startCardMedia() {
    stopCardMedia();
    if (reduceMotion() || px) return;
    const lis = [...document.querySelectorAll('#rutina-cards .rcard[data-gif]')];
    if (!lis.length) return;
    if (!('IntersectionObserver' in window)) { mountCard(lis[0]); return; }
    const seen = new Map();
    cardObs = new IntersectionObserver((entries) => {
      for (const en of entries) seen.set(en.target, en.isIntersecting ? en.intersectionRatio : 0);
      let best = null, top = 0.5;
      for (const [el, r] of seen) if (r > top) { best = el; top = r; }
      if (best === cardActive) return;
      if (cardActive) unmountCard(cardActive);
      if (best) mountCard(best);
    }, { threshold: [0, 0.25, 0.5, 0.75, 1] });
    lis.forEach((li) => cardObs.observe(li));
  }
  function renderCards(biz) {
    const ul = $('#rutina-cards');
    stopCardMedia();
    const html = myLink() && routines ? cardsHTML(biz) : '';
    ul.innerHTML = html;
    ul.classList.toggle('hidden', !html);
    $('#rutina-cards-note').classList.toggle('hidden', !html);
    $('#rutina-how').classList.toggle('hidden', !html);
    if (html) startCardMedia();
  }

  function renderRoutine() {
    freeAllGifs();
    renderEntrances();
    if (!myLink() || routines === undefined) renderCards('');
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
      renderCards('');
      box.innerHTML = `<div class="card"><p><strong>Todavía no tienes una rutina.</strong></p><p class="small muted">${esc(l && l.businessName ? l.businessName : 'Tu coach')} la armará para ti y, cuando lo haga, la verás aquí con la animación de cada ejercicio.</p></div>`;
      renderTrained();
      return;
    }
    const by = l && l.businessName ? `Armada por ${esc(l.businessName)} · ` : '';
    let html = '';
    const biz = l && l.businessName ? l.businessName : '';
    renderCards(biz);
    // La rutina de hoy ya es una de «Mis rutinas»: no se repite debajo.
    const same = (a, b) => a.title === b.title && JSON.stringify(a.days) === JSON.stringify(b.days);
    const others = d ? routines.filter((r) => !same(r, d)) : routines;
    if (d) html += blockHTML(d, { isDaily: true, openFirst: true, main: true, business: biz, by: biz ? `De ${esc(biz)} · ` : '' });
    else if (routines.length) html += blockHTML(routines[0], { isDaily: false, openFirst: true, main: true, business: biz, by });
    const rest = d ? others : routines.slice(1);
    if (rest.length) html += `<details class="rut-more card"><summary>${d ? 'Mis otras rutinas' : 'Mis rutinas'} (${rest.length})</summary>${rest.map((r) => blockHTML(r, { isDaily: false, openFirst: false, by })).join('')}</details>`;
    box.innerHTML = html;
    // «Ya entrené» va justo debajo de la rutina principal (la de hoy o la primera), no al final de una lista larga.
    const first = box.querySelector('.rut-block');
    if (first && box.children.length > 1) first.after($('#rutina-trained'));
    renderTrained();
  }
  // Insignia «Técnica primero»: solo en este teléfono (primer día que se abrió «Cómo se hace» de cada ejercicio y los nombres de cada rutina).
  const SEEN_KEY = (window.PGNS && PGNS.key ? PGNS.key('ejercicios-vistos') : 'perdida-grasa:ejercicios-vistos');
  const ROUTINES_KEY = (window.PGNS && PGNS.key ? PGNS.key('ejercicios-rutinas') : 'perdida-grasa:ejercicios-rutinas');
  function markSeen(name) {
    if (!name) return;
    try { const m = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') || {}; if (!m[name]) { m[name] = today(); localStorage.setItem(SEEN_KEY, JSON.stringify(m)); } } catch { /* sin espacio */ }
  }
  function saveRoutineNames(list) {
    try { localStorage.setItem(ROUTINES_KEY, JSON.stringify((list || []).map((r) => (r.days || []).flatMap((d) => (d.exercises || []).map((e) => e.name)).filter(Boolean)))); } catch { /* sin espacio */ }
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
      saveRoutineNames(rs);
    } catch (err) {
      if (seq !== loadSeq) return;
      if (routines === undefined) loadFailed = true;
      if (!silent && routines !== undefined) toast(errText(err), true);
    }
    renderRoutine();
  }

  // ============================== Estilo v2: modo PASO A PASO (imagen E3) y «Entreno completo» (imagen E4) ==============================
  // Lo que se muestra lo escribió el coach (Paso.plan → Rutinas.parseSets): la app no calcula ni sugiere series, repeticiones, kilos ni descansos.
  // Al terminar el descanso: vibración corta si el teléfono la tiene y un aviso visual; nada de sonido. La pantalla se mantiene encendida (Wake Lock) si se puede.
  let px = null;   // { r, di, steps, st, opener, shown, url, tok, wake, timer }
  const P = () => window.Paso;
  function stageMedia(s) {
    const slot = $('#paso-media'), lbl = $('#paso-lbl');
    if (px.url) URL.revokeObjectURL(px.url);
    px.url = null;
    dropMedia(slot);
    const tok = (px.tok = (px.tok || 0) + 1);
    $('#paso-stage').classList.toggle('no-media', !s.gif);
    if (!s.gif) {
      lbl.textContent = '';
      const p = document.createElement('p');
      p.className = 'paso-empty';
      p.textContent = 'Tu coach todavía no agregó una demostración de este ejercicio. Si tienes dudas de cómo hacerlo, pregúntale.';
      slot.replaceChildren(p);
      return;
    }
    lbl.textContent = '';
    slot.textContent = 'Cargando la demostración…';
    const my = px;
    A.remote.client.gifBlob(px.coachId, s.gif).then(mediaInfo).then(async (info) => {
      if (px !== my || px.tok !== tok) return;
      px.url = URL.createObjectURL(info.blob);
      const label = `${info.video ? 'Video' : 'Animación'} del ejercicio: ${s.name}`;
      lbl.textContent = info.video ? 'Video del coach' : 'Animación del coach';
      if (!reduceMotion()) { slot.replaceChildren(buildMedia(info, px.url, label)); return; }
      // «Reducir movimiento»: el video queda quieto con sus controles; el GIF, como imagen fija (primer cuadro) con «Ver la animación».
      if (info.video) { slot.replaceChildren(buildVideo(px.url, label, { autoplay: false })); return; }
      const img = new Image();
      img.src = px.url;
      try { await img.decode(); } catch { /* se intenta igual */ }
      if (px !== my || px.tok !== tok) return;
      const c = document.createElement('canvas');
      c.width = img.naturalWidth || 120; c.height = img.naturalHeight || 120;
      c.className = 'rut-gif-img paso-still';
      c.setAttribute('role', 'img'); c.setAttribute('aria-label', `${label} (imagen fija)`);
      try { c.getContext('2d').drawImage(img, 0, 0); } catch { /* sin lienzo */ }
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn btn-ghost paso-play'; b.textContent = '▶ Ver la animación';
      b.addEventListener('click', () => { const im = buildMedia(info, px.url, label); slot.replaceChildren(im); });
      slot.replaceChildren(c, b);
    }).catch(() => {
      if (px !== my || px.tok !== tok) return;
      slot.textContent = 'No pudimos cargar la demostración. Revisa tu internet; puedes seguir con el entreno.';
    });
  }
  const repsBig = (r) => { const m = /^(\d+(?:\s*[-–]\s*\d+)?)$/.exec(r); return m ? { big: m[1], small: m[1] === '1' ? 'repetición' : 'repeticiones' } : { big: r, small: 'por serie' }; };
  function renderPaso({ announce } = {}) {
    if (!px) return;
    const Pz = P(), { steps, st } = px, now = Date.now();
    if (st.finished) { showEnd(); return; }
    const s = steps[st.i];
    $('#paso-prog').innerHTML = steps.map((x, i) => `<li class="${i < st.i ? 'ok' : i === st.i ? 'cur' : ''}"><i style="width:${i < st.i ? 100 : i > st.i ? 0 : Math.round((st.done[i] / x.series) * 100)}%"></i></li>`).join('');
    if (px.shown !== st.i) {
      px.shown = st.i;
      $('#paso-name').textContent = s.name;
      $('#paso-line').textContent = s.mode === 'sets' ? s.line : 'Indicación de tu coach';
      $('#paso-note').textContent = s.note;
      $('#paso-note').classList.toggle('hidden', !s.note);
      const nx = steps[st.i + 1];
      $('#paso-next').textContent = nx ? `Sigue: ${nx.name}` : 'Es el último';
      $('#paso-next').classList.remove('hidden');
      stageMedia(s);
    }
    const free = s.mode === 'free', rest = st.phase === 'rest', cur = Pz.setNo(st, steps);
    $('#paso-sets').classList.toggle('hidden', free);
    $('#paso-sets').innerHTML = free ? '' : Array.from({ length: s.series }, (_, k) => k + 1).map((k) => (k <= st.done[st.i]
      ? `<li class="ok"><span class="sr-only">Serie ${k}: hecha</span><span aria-hidden="true">${k} ✓</span></li>`
      : k === cur ? `<li class="now" aria-current="step">Serie ${k}</li>` : `<li><span class="sr-only">Serie </span>${k}</li>`)).join('');
    const pr = Pz.progress(st, steps);
    $('#paso-pct').textContent = `${pr.pct} %`;
    $('#paso-idx').textContent = `${pr.index} / ${pr.count}`;
    $('#paso-timer').classList.toggle('hidden', free);
    $('#paso-free').classList.toggle('hidden', !free);
    $('#paso-free').textContent = free ? s.text : '';
    $('#paso-timer').classList.toggle('is-rest', rest);
    $('#paso-timer').classList.toggle('is-paused', rest && st.paused);
    tickView(now);
    const main = $('#paso-main');
    main.textContent = rest ? (st.paused ? '▶ Seguir' : '❚❚ Pausa') : free ? 'Hecho ›' : 'Serie hecha ✓';
    main.setAttribute('aria-label', rest ? (st.paused ? 'Seguir con el descanso' : 'Pausar el descanso') : free ? `Hecho: ${s.name}` : `Serie ${cur} de ${s.series} hecha`);
    main.classList.toggle('is-rest', rest);
    $('#paso-skip').setAttribute('aria-label', rest ? 'Saltar el descanso' : st.i + 1 < steps.length ? 'Siguiente ejercicio' : 'Terminar el entreno');
    $('#paso-prev').disabled = st.i === 0 && st.done[0] === 0;
    $('#paso-hint').textContent = rest ? 'Al terminar el descanso, el teléfono vibra (si lo permite) y pasa a la siguiente serie.'
      : free ? 'Cuando termines, toca «Hecho».'
        : s.rest ? `Al terminar la serie, toca «Serie hecha»: empieza el descanso de ${s.rest} s que puso tu coach.` : 'Al terminar cada serie, toca «Serie hecha».';
    if (announce) $('#paso-live').textContent = announce;
  }
  // Solo el reloj (cada 250 ms): número y anillo.
  function tickView(now) {
    const Pz = P(), { steps, st } = px, s = steps[st.i];
    if (!s || s.mode === 'free') return;
    const arc = $('#paso-arc');
    if (st.phase === 'rest') {
      $('#paso-t').textContent = Pz.clock(Pz.left(st, now));
      $('#paso-s').textContent = st.paused ? 'En pausa' : 'Descanso';
      arc.style.strokeDashoffset = String(100 - Pz.restRatio(st, steps, now) * 100);
    } else {
      const r = repsBig(s.reps);
      $('#paso-t').textContent = r.big;
      $('#paso-s').textContent = r.small;
      arc.style.strokeDashoffset = '0';
    }
  }
  function onTick() {
    if (!px || px.st.finished) return;
    const now = Date.now();
    const { st, ended } = P().tick(px.st, px.steps, now);
    if (!ended) { if (px.st.phase === 'rest') tickView(now); return; }
    px.st = st;
    try { if (navigator.vibrate) navigator.vibrate(200); } catch { /* sin vibración */ }
    const t = $('#paso-timer');
    t.classList.add('flash');
    clearTimeout(px.flash);
    px.flash = setTimeout(() => t.classList.remove('flash'), 1500);
    renderPaso({ announce: `Descanso terminado. Serie ${P().setNo(st, px.steps)}.` });
  }
  async function wakeOn() {
    if (!px || px.wake || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    try { const w = await navigator.wakeLock.request('screen'); if (!px) { w.release(); return; } px.wake = w; w.addEventListener('release', () => { if (px && px.wake === w) px.wake = null; }); } catch { /* sin permiso o sin soporte */ }
  }
  function wakeOff() { if (px && px.wake) { try { px.wake.release(); } catch { /* ya suelto */ } px.wake = null; } }
  // ---------- Concepto jurídico 4: aviso de dolor (al terminar, o al salir con ✕ a mitad) ----------
  const PAIN_KEY = (window.PGNS && PGNS.key ? PGNS.key('dolor-dia') : 'perdida-grasa:dolor-dia');
  const painLocked = () => { try { return localStorage.getItem(PAIN_KEY) === today(); } catch { return false; } };
  const PAIN_LOCK_TEXT = 'Hoy reportaste dolor: el entreno guiado vuelve mañana.';
  async function sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  async function reportPain(pain) {
    const D = P().DOLOR;
    return A.remote.client.reportPain(today(), pain, { version: D.version, textHash: await sha256(P().dolorText()) });
  }
  function panel(name) {
    for (const [k, id] of [['run', '#paso-run'], ['end', '#paso-end'], ['ask', '#paso-ask'], ['block', '#paso-block']]) $(id).classList.toggle('hidden', k !== name);
    if (px) px.panel = name;
  }
  function painOpts(box, pressed) {
    $(box).innerHTML = P().DOLOR.options.map(([k, label]) => `<button type="button" data-dolor="${k}" aria-pressed="${pressed === k}">${esc(label)}</button>`).join('');
  }
  function askPain() {
    if (!px) return;
    clearInterval(px.timer);
    wakeOff();
    if (px.url) URL.revokeObjectURL(px.url);
    px.url = null;
    dropMedia($('#paso-media'));
    px.shown = -1;
    $('#pd-q-ask').textContent = P().DOLOR.question;
    painOpts('#pd-ask', null);
    $('#pd-ask-status').textContent = '';
    panel('ask');
    $('#pd-q-ask').focus();
  }
  function backToRun() {
    if (!px) return;
    panel('run');
    renderPaso();
    px.timer = setInterval(onTick, 250);
    wakeOn();
    $('#paso-name').focus();
  }
  // «Sí»: se bloquea el entreno guiado de hoy, se avisa al coach por el servidor y, cuando el servidor lo confirma, se muestra el texto literal.
  async function painYes() {
    try { localStorage.setItem(PAIN_KEY, today()); } catch { /* sin espacio: igual se avisa */ }
    clearInterval(px && px.timer);
    panel('block');
    $('#pb-text').textContent = P().DOLOR.block;
    $('#pb-text').classList.add('hidden');
    $('#pb-retry').classList.add('hidden');
    $('#pb-wait').textContent = 'Avisando a tu coach…';
    $('#pb-title').focus();
    renderEntrances();
    let out = null, err = null;
    try { out = await reportPain(true); } catch (e) { err = e; }
    if (!px || px.panel !== 'block') return;
    if (out && out.notified) {
      $('#pb-wait').textContent = '';
      $('#pb-text').classList.remove('hidden');
      $('#pb-ok').focus();
    } else {
      $('#pb-wait').textContent = err && err.code === 'not_found' ? 'No tienes un coach vinculado a quien avisar. Suspende el ejercicio de hoy.'
        : out ? 'Tu plan está en pausa: tu coach no recibirá este aviso. Suspende el ejercicio de hoy.'
          : 'No pudimos avisar a tu coach. Revisa tu conexión y toca «Reintentar».';
      $('#pb-retry').classList.toggle('hidden', !!out || (err && err.code === 'not_found'));
    }
  }
  async function painAnswer(where, key) {
    if (!px) return;
    if (key === 'si') { painYes(); return; }
    painOpts(where === 'ask' ? '#pd-ask' : '#pd-end', 'no');
    const st = $(where === 'ask' ? '#pd-ask-status' : '#pd-end-status');
    st.textContent = 'Gracias.';
    const p = reportPain(false).catch(() => null);
    if (where === 'ask') { await p; closePaso(); }
  }

  function openPaso(target, opener) {
    if (!window.Paso || !target) return;
    if (document.body.classList.contains('paused')) { toast('Tu plan está en pausa: la rutina queda en solo lectura.'); return; }
    if (painLocked()) { toast(PAIN_LOCK_TEXT); return; }
    const steps = P().plan(target.r.days[target.di]);
    if (!steps.length) return;
    stopCardMedia();
    px = { ...target, steps, st: P().start(steps), opener, shown: -1, coachId: target.r.coachId };
    panel('run');
    const dlg = $('#dlg-paso');
    if (!dlg.open) dlg.showModal();
    renderPaso({ announce: `${target.r.title}. ${plural(steps.length, 'ejercicio', 'ejercicios')}.` });
    $('#paso-name').focus();
    px.timer = setInterval(onTick, 250);
    wakeOn();
  }
  function showEnd() {
    const Pz = P(), sum = Pz.summary(px.st, px.steps);
    if (!sum.exercisesDone) { closePaso(); toast('Saliste sin hacer ningún ejercicio: no anotamos el entreno.'); return; }
    clearInterval(px.timer);
    if (px.url) URL.revokeObjectURL(px.url);
    px.url = null;
    dropMedia($('#paso-media'));
    wakeOff();
    if (!px.ended) {
      px.ended = true;
      rememberDay(px.r, px.di);
      // Igual que «Ya entrené» en Entrenar: marca el hábito del día, y el coach lo ve.
      document.dispatchEvent(new CustomEvent('pg:rutina-trained', { detail: { paso: true } }));
    }
    panel('end');
    $('#pd-q-end').textContent = P().DOLOR.question;
    painOpts('#pd-end', null);
    $('#pd-end-status').textContent = '';
    $('#paso-end-sub').textContent = `${px.r.title}${px.r.days.length > 1 ? ` · Día ${px.di + 1}` : ''}`;
    $('#pe-ex').textContent = `${sum.exercisesDone}/${sum.exercises}`;
    $('#pe-sets').textContent = String(sum.sets);
    $('#pe-sets-box').classList.toggle('hidden', !sum.anySets);
    $('#pe-week').textContent = `${window.PGNav && PGNav.weekDays ? PGNav.weekDays() : 0}/7`;
    renderEntrances();
    $('#paso-end-title').focus();
  }
  function closePaso() { const dlg = $('#dlg-paso'); if (dlg.open) dlg.close(); }
  function onPasoClosed() {
    if (!px) return;
    clearInterval(px.timer);
    clearTimeout(px.flash);
    if (px.url) URL.revokeObjectURL(px.url);
    dropMedia($('#paso-media'));
    wakeOff();
    const o = px.opener;
    px = null;
    renderEntrances();
    if ($('#view-rutina').classList.contains('active')) startCardMedia();
    if (o && o.isConnected) o.focus();
  }
  function wirePaso() {
    const dlg = $('#dlg-paso');
    dlg.addEventListener('close', onPasoClosed);
    // Esc a mitad del entreno = ✕: primero la pregunta de dolor. En el bloqueo, Esc = «Entendido».
    dlg.addEventListener('cancel', (ev) => { if (px && px.panel === 'run') { ev.preventDefault(); askPain(); } });
    $('#paso-x').addEventListener('click', askPain);
    $('#paso-ask-x').addEventListener('click', closePaso);
    $('#paso-ask-back').addEventListener('click', backToRun);
    $('#pd-ask').addEventListener('click', (ev) => { const b = ev.target.closest('[data-dolor]'); if (b) painAnswer('ask', b.dataset.dolor); });
    $('#pd-end').addEventListener('click', (ev) => { const b = ev.target.closest('[data-dolor]'); if (b) painAnswer('end', b.dataset.dolor); });
    $('#pb-ok').addEventListener('click', closePaso);
    $('#pb-retry').addEventListener('click', () => { if (px) painYes(); });
    $('#paso-end-x').addEventListener('click', closePaso);
    $('#paso-done').addEventListener('click', closePaso);
    $('#paso-main').addEventListener('click', () => {
      if (!px) return;
      const Pz = P(), now = Date.now(), st = px.st;
      if (st.phase === 'rest') { px.st = st.paused ? Pz.resume(st, now) : Pz.pause(st, now); renderPaso({ announce: px.st.paused ? 'Descanso en pausa.' : 'Sigue el descanso.' }); return; }
      const s = px.steps[st.i];
      px.st = Pz.complete(st, px.steps, now);
      renderPaso({ announce: px.st.finished ? '' : px.st.i !== st.i ? `Siguiente: ${px.steps[px.st.i].name}.` : px.st.phase === 'rest' ? `Serie hecha. Descanso de ${s.rest} segundos.` : `Serie hecha. Serie ${Pz.setNo(px.st, px.steps)}.` });
    });
    $('#paso-skip').addEventListener('click', () => {
      if (!px) return;
      const before = px.st;
      px.st = P().next(before, px.steps);
      renderPaso({ announce: px.st.finished ? '' : before.phase === 'rest' ? 'Descanso saltado.' : `Siguiente: ${px.steps[px.st.i].name}.` });
    });
    $('#paso-prev').addEventListener('click', () => {
      if (!px) return;
      px.st = P().prev(px.st);
      renderPaso({ announce: `${px.steps[px.st.i].name}. Desde la serie 1.` });
    });
    document.addEventListener('visibilitychange', () => { if (px && document.visibilityState === 'visible') { if (!px.ended) wakeOn(); onTick(); } });
    $('#rutina-cards').addEventListener('click', (ev) => { const b = ev.target.closest('[data-start]'); if (b) openPaso(cards[Number(b.dataset.start)], b); });
    $('#btn-home-daily').addEventListener('click', (ev) => {
      const t = heroTarget();
      if (!t || document.body.classList.contains('paused')) { $('#tab-entrenar').click(); return; }   // en pausa: Entrenar en solo lectura
      openPaso(t, ev.currentTarget);
    });
  }

  function wireClient() {
    const body = $('#view-rutina');
    body.addEventListener('toggle', (ev) => {   // 'toggle' no sube por el árbol: se escucha en la captura
      const el = ev.target;
      if (!el.classList || !el.classList.contains('rut-ex')) return;
      if (el.open) { markSeen(el.dataset.name); loadGif(el); } else freeGif(el);
    }, true);
    body.addEventListener('click', (ev) => {
      const ck = ev.target.closest('[data-check]');
      if (ck) { ck.setAttribute('aria-pressed', String(toggleCheck(ck.dataset.check))); return; }
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
    wirePaso();
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
          <fieldset class="rut-edit-sets"><legend>Series, repeticiones, peso y descanso <span class="muted small">(opcional)</span></legend>
            <div class="rut-edit-grid">
              <div><label class="acc-label" for="${idOf(i, j, 'series')}">Series</label>
              <input type="text" inputmode="numeric" id="${idOf(i, j, 'series')}" data-f="series" data-d="${i}" data-e="${j}" maxlength="2" autocomplete="off" value="${esc(e.series)}" placeholder="Ej.: 4"></div>
              <div><label class="acc-label" for="${idOf(i, j, 'reps')}">Repeticiones</label>
              <input type="text" id="${idOf(i, j, 'reps')}" data-f="reps" data-d="${i}" data-e="${j}" maxlength="${L.reps}" autocomplete="off" value="${esc(e.reps)}" placeholder="12, 10-12, 30 s"></div>
              <div><label class="acc-label" for="${idOf(i, j, 'weight')}">Peso</label>
              <input type="text" id="${idOf(i, j, 'weight')}" data-f="weight" data-d="${i}" data-e="${j}" maxlength="${L.weight}" autocomplete="off" value="${esc(e.weight)}" placeholder="Ej.: 12 kg"></div>
              <div><label class="acc-label" for="${idOf(i, j, 'rest')}">Descanso (segundos)</label>
              <input type="text" inputmode="numeric" id="${idOf(i, j, 'rest')}" data-f="rest" data-d="${i}" data-e="${j}" maxlength="3" autocomplete="off" value="${esc(e.rest)}" placeholder="Ej.: 90"></div>
            </div>
            <p class="small muted">Con esto tu asesorado sigue el ejercicio paso a paso, con el descanso en cuenta regresiva. La app no calcula ni sugiere nada: verá lo que escribas.</p>
          </fieldset>
          <label class="acc-label" for="${idOf(i, j, 'sets')}">O una indicación en texto libre <span class="muted small">(si no usas series)</span></label>
          <input type="text" id="${idOf(i, j, 'sets')}" data-f="sets" data-d="${i}" data-e="${j}" maxlength="${L.sets}" autocomplete="off" value="${esc(e.sets)}" placeholder="Por ejemplo: 4 × 12 o 30 minutos">
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
    draft = saved ? { title: saved.title, days: clone(R.toEditable(saved).days) } : R.blankRoutine();   // estilo v2: series, repeticiones, peso y descanso en sus casillas
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
