// Logros (insignias v4, diseño B «Escudo por categoría»): Progreso → Logros, la hoja de detalle, el momento de ganarla y la ficha del coach.
// La lógica y los dibujos están en logros.js (puro); aquí solo el DOM. Todo se calcula en el teléfono con los datos propios (como constancia.js):
// no hay servidor nuevo. «Equipo» usa lo que ya devuelven grasa.my_team_goal y grasa.my_points (puntos-view.js avisa con 'pg:puntos').
//   · Lo ganado se recuerda por cuenta en este teléfono (PGNS 'logros'): nunca se pierde un nivel y cada nivel se celebra una sola vez.
//   · El momento de ganarla no salta a mitad de un registro: queda pendiente y se muestra al volver a Inicio o al terminar la acción.
//   · Rendimiento: un solo <defs> con siluetas y glifos; cada insignia es un <svg> pequeño con <use>. Nada animado en la colección.
// Solo producto «coach». Nada de otra persona llega al asesorado: no hay ranking ni comparación.
(function () {
  'use strict';
  const PROD = window.Producto || { coach: false };
  if (!PROD.coach || !window.Logros) return;
  const L = window.Logros;
  const $ = (s, c = document) => c.querySelector(s);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toISO = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const today = () => toISO(new Date());
  const MEM_KEY = window.PGNS ? PGNS.key('logros') : 'perdida-grasa:logros';
  const RETOS_KEY = window.PGNS ? PGNS.key('retos') : 'perdida-grasa:retos';
  const reduce = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const acct = () => (window.PGAccount && PGAccount.meta && PGAccount.meta()) || null;
  const link = () => (window.PGNav && PGNav.link ? PGNav.link() : null);
  const isCoachNav = () => document.body.classList.contains('mode-coach');
  const owner = () => { const m = acct(); return (m && m.userId) || 'local'; };

  // ---------- Memoria por cuenta ----------
  function readAll() { try { const x = JSON.parse(localStorage.getItem(MEM_KEY) || '{}'); return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; } catch { return {}; } }
  const readMem = () => L.normMemory(readAll()[owner()]);
  function writeMem(m) {
    const all = readAll();
    all[owner()] = m;
    const keys = Object.keys(all);
    if (keys.length > 10) for (const k of keys.slice(0, keys.length - 10)) delete all[k];
    try { localStorage.setItem(MEM_KEY, JSON.stringify(all)); } catch { /* sin espacio: se vuelve a calcular */ }
  }
  const readRetos = () => { try { const x = JSON.parse(localStorage.getItem(RETOS_KEY) || 'null'); return Array.isArray(x) ? x : []; } catch { return []; } };

  // ---------- Cálculo (asesorado) ----------
  let baseline = null;          // dueño cuyo estado ya se tomó como «visto» en esta sesión
  const pending = new Map();    // id → nivel por celebrar
  function result() {
    const st = window.PGNav && PGNav.state ? PGNav.state() : null;
    if (!st) return null;
    const l = link();
    const mem = readMem();
    const d = today();
    const res = L.compute(st, d, { pauses: (l && l.pauses) || [], retos: l ? readRetos() : [], memory: mem, retosOn: !!l });
    // Lo que ya existía al abrir la app se da por visto (sin fiesta); lo que sube después, una sola vez.
    let seen = mem.seen;
    if (baseline !== owner() || !mem.init) { seen = L.seenOf(res, seen); baseline = owner(); }
    else for (const b of L.fresh(seen, res, d)) pending.set(b.id, b.level);
    const next = L.remember(mem, res);
    next.seen = L.seenOf(res, seen);
    next.init = true;
    if (JSON.stringify(next) !== JSON.stringify(mem)) writeMem(next);
    return res;
  }

  // ---------- Colección ----------
  function tile(b, uid) {
    const label = L.a11y(b, today());
    let st;
    if (b.earned && b.hito) st = `<span class="lg-st lg-t"><svg class="lg-ck" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>${esc(L.status(b))}</span>`;
    else if (b.earned) st = `<span class="lg-st lg-lv lv-${L.LK[b.level]}"><span class="lg-dots" aria-hidden="true">${dotsHtml(b.level)}</span><span>${esc(L.LEVEL[b.level])}</span></span>`;
    else if (b.state === 'progress') st = `<span class="lg-st lg-p">${esc(L.status(b))}</span>`;
    else st = `<span class="lg-st lg-l"><svg class="lg-ck" viewBox="0 0 24 24" aria-hidden="true"><use href="#lg-g-lock"/></svg>Aún no</span>`;
    return `<li><button type="button" class="lg-tile st-${b.state}" data-logro="${esc(b.id)}" aria-label="${esc(label)}">${L.badgeSvg(b, { uid: uid + b.id })}<span class="lg-nm" aria-hidden="true">${esc(b.name)}</span><span aria-hidden="true">${st}</span></button></li>`;
  }
  const dotsHtml = (lv) => [1, 2, 3].map((i) => `<i class="${i <= lv ? 'f' : ''}"></i>`).join('');
  function catsHtml(res, uid) {
    return res.cats.map((c) => `<section class="lg-row lg-c-${c.k}" aria-labelledby="lg-h-${uid}${c.k}">
      <div class="lg-lab">${L.shapeSvg(c.k, 40, 5)}<h3 id="lg-h-${uid}${c.k}">${esc(c.name)}</h3><span class="lg-cnt">${c.earned} de ${c.total}</span></div>
      <ul class="lg-grid" aria-label="${esc(c.name)}: ${c.earned} de ${c.total} ganadas">${c.items.map((b) => tile(b, uid)).join('')}</ul></section>`).join('');
  }
  function progSeg() {
    const has = window.PGMetas && PGMetas.has();
    return `<nav class="prog-seg" aria-label="Progreso">${[...(has ? [['metas', 'Metas']] : []), ['progreso:medidas', 'Medidas'], ['fotos', 'Fotos'], ['insignias', 'Logros'], ['puntos', 'Puntos']]
      .map(([v, t]) => `<button type="button" data-goto="${v}"${v === 'insignias' ? ' aria-current="page" class="on"' : ''}>${t}</button>`).join('')}</nav>`;
  }
  let last = null;
  function render() {
    if (isCoachNav()) return;
    const res = result();
    last = res;
    const v = $('#view-insignias');
    if (!v || !v.classList.contains('active') || !res) return;
    $('#lg-seg').innerHTML = progSeg();
    const n = res.near;
    const nearBox = $('#lg-near');
    nearBox.classList.toggle('hidden', !n && !res.total);
    nearBox.innerHTML = `${n ? `<button type="button" class="lg-near-b" data-logro="${esc(n.id)}" aria-label="${esc(`Te falta poco: ${L.nearTitle(n)}. ${L.moreLine(n)}`)}">${L.badgeSvg(n, { uid: 'near', size: 46 })}</button>
        <div class="lg-near-t" aria-hidden="true"><p class="lg-tag">Te falta poco</p><p class="lg-near-n">${esc(L.nearTitle(n))}</p><p class="lg-near-s">${esc(L.moreLine(n))}</p></div>`
      : '<div class="lg-near-t"><p class="lg-tag">Tus logros</p><p class="lg-near-s">Cada registro cuenta para tu semana.</p></div>'}
      <p class="lg-total"><b id="lg-earned">${res.earned}</b><span>de ${res.total}</span><span class="sr-only"> insignias ganadas</span></p>`;
    $('#lg-cats').innerHTML = catsHtml(res, 'a');
  }

  // ---------- Hoja de detalle y momento de ganarla ----------
  const dlg = $('#dlg-logro');
  let opener = null, ctxRes = null;
  function open(id, { nuevo = false, res = null, from = null, coach = false } = {}) {
    const r = res || result();
    const b = r && r.list.find((x) => x.id === id);
    if (!b) return;
    ctxRes = r;
    opener = from;
    const c = r.cats.find((x) => x.k === b.cat);
    const d = today();
    const when = (x) => (x === d ? 'hoy' : L.dm(x));
    $('#lgd-band').className = `lg-band lg-c-${b.cat}`;
    $('#lgd-band').innerHTML = `${L.shapeSvg(b.cat, 22, 7)}<span>${esc(c.name)} · ${c.earned} de ${c.total} ${c.earned === 1 ? 'ganada' : 'ganadas'}</span>`;
    $('#lgd-new').classList.toggle('hidden', !nuevo);
    $('#lgd-new-t').textContent = b.hito || b.level === 1 ? 'Nueva insignia' : 'Nuevo nivel';
    const hero = $('#lgd-hero');
    hero.classList.remove('lg-go');
    hero.classList.toggle('lg-nuevo', nuevo);
    hero.innerHTML = (nuevo ? L.sparksSvg() : '') + `<div class="lg-hb">${L.badgeSvg({ ...b, next: null }, { uid: 'hero', size: 140, lit: nuevo, shine: nuevo })}</div>`;
    $('#lgd-title').textContent = b.name;
    let line;
    if (b.earned && b.hito) line = `<svg class="lg-ck" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>Ganada ${b.date === d ? 'hoy' : 'el ' + esc(L.dm(b.date))}`;
    else if (b.earned) line = `<span class="lg-dots" aria-hidden="true">${dotsHtml(b.level)}</span>${esc(L.LEVEL[b.level])} · ${b.date === d ? 'hoy, ' + esc(L.dm(b.date)) : esc(L.dm(b.date))}`;
    else if (b.state === 'progress') line = `En progreso · ${esc(L.status(b))} ${esc(b.cur.unit[1])} esta semana`;
    else line = '<svg class="lg-ck" viewBox="0 0 24 24" aria-hidden="true"><use href="#lg-g-lock"/></svg>Aún no';
    const ln = $('#lgd-line');
    ln.className = `lg-dl${b.earned && !b.hito ? ' lg-lv lv-' + L.LK[b.level] : b.earned ? ' lg-t' : ''}`;
    ln.innerHTML = line;
    $('#lgd-what').textContent = L.what(b);
    const lv = $('#lgd-levels');
    if (b.hito) {
      lv.classList.toggle('hidden', b.earned || !b.cur);
      lv.innerHTML = !b.earned && b.cur ? `<p class="lg-tag lg-mt">${coach ? 'Su avance' : 'Tu avance'}</p>${progRow(b.cur.done, b.cur.of, b.cur.unit)}` : '';
    } else {
      lv.classList.remove('hidden');
      lv.innerHTML = `<p class="lg-tag lg-mt">${coach ? 'Sus niveles' : 'Tus niveles'}</p>` + [1, 2, 3].map((n) => {
        const name = `<span class="lg-lvn lg-lv lv-${L.LK[n]}"><span class="lg-dots" aria-hidden="true">${dotsHtml(n)}</span>${L.LEVEL[n]}</span>`;
        if (b.dates[n]) return `<div class="lg-lvr">${name}<span class="lg-okd"><svg class="lg-ck" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>${esc(when(b.dates[n]))}</span></div>`;
        if (n === b.level + 1) {
          const pct = Math.round((Math.min(b.count, L.NEED[n]) / L.NEED[n]) * 100);
          return `<div class="lg-lvr">${name}<span class="lg-lvp"><span>${Math.min(b.count, L.NEED[n])} de ${L.NEED[n]} ${L.NEED[n] === 1 ? 'semana' : 'semanas'}</span><span class="lg-bar" role="progressbar" aria-label="Camino a ${L.LEVEL[n].toLowerCase()}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${Math.max(3, pct)}%"></i></span></span></div>`;
        }
        return `<div class="lg-lvr">${name}<span class="lg-lvp"><span>${L.NEED[n]} semanas</span></span></div>`;
      }).join('') + (!b.earned && b.cur ? `<p class="lg-week">Esta semana: ${esc(b.cur.done)} de ${esc(b.cur.of)} ${esc(b.cur.unit[1])}</p>` : '');
    }
    $('#lgd-note').textContent = L.note(b);
    if (!dlg.open) dlg.showModal();
    if (nuevo) {
      $('#lg-live').textContent = `${b.hito || b.level === 1 ? 'Nueva insignia' : 'Nuevo nivel'}: ${b.name}${b.hito ? '' : ', nivel ' + L.LEVEL[b.level].toLowerCase()}`;
      void hero.getBoundingClientRect();
      if (!reduce()) hero.classList.add('lg-go');
    }
    $('#lgd-title').focus();
  }
  const progRow = (done, of, unit) => {
    const pct = Math.round((done / of) * 100);
    return `<div class="lg-lvr"><span>${done} de ${of} ${esc(unit[1])}</span><span class="lg-bar" role="progressbar" aria-label="Avance" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${Math.max(3, pct)}%"></i></span></div>`;
  };
  if (dlg) {
    $('#lgd-ok').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', (ev) => { if (ev.target === dlg) dlg.close(); });
    dlg.addEventListener('close', () => {
      $('#lgd-hero').classList.remove('lg-go', 'lg-nuevo');
      const t = opener && document.contains(opener) ? opener : null;
      opener = null;
      if (t) t.focus();
      setTimeout(flush, 0);
    });
  }
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-logro]');
    if (!b) return;
    const inCoach = !!b.closest('#fc-const');
    open(b.dataset.logro, { from: b, res: inCoach ? coachRes : null, coach: inCoach });
  });

  // Muestra lo pendiente si no hay nada abierto (nunca a mitad de un registro).
  function flush() {
    if (!pending.size || isCoachNav() || !dlg) return;
    if (document.querySelector('dialog[open]') || document.body.classList.contains('salud-open')) return;
    const active = document.querySelector('.view.active');
    if (!active || active.id !== 'view-panel') return;
    const res = result();
    if (!res) return;
    // El más alto que siga ganado; los demás quedan celebrados con él (una sola hoja).
    const ids = [...pending.keys()];
    pending.clear();
    const list = res.list.filter((b) => ids.includes(b.id) && b.earned).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.level - a.level);
    if (list.length) open(list[0].id, { nuevo: true, res, from: null });
  }
  // Para el diálogo «Mi día»: niveles antes y después de un cambio (la línea «Nueva insignia» / «Nuevo nivel»).
  function levels() { const r = result(); return r ? Object.fromEntries(r.list.map((b) => [b.id, b.level])) : {}; }
  function since(before) { const r = result(); return r ? r.list.filter((b) => b.level > (before[b.id] || 0)) : []; }

  // ---------- Coach: ficha del asesorado (mismo diseño, solo con sus registros; nunca de otros ni ranking) ----------
  let coachRes = null;
  function coachHtml(st, d, { pauses } = {}) {
    coachRes = L.compute(st, d, { pauses: pauses || [], retosOn: false });
    return { html: catsHtml(coachRes, 'c'), earned: coachRes.earned, total: coachRes.total };
  }

  // ---------- Equipo: semana de meta cumplida en la que la persona sumó ----------
  document.addEventListener('pg:puntos', (ev) => {
    const l = link();
    const w = L.teamWeek({ ...(ev.detail || {}), shares: l && l.shares, today: today() });
    if (!w) return;
    const m = readMem();
    if (m.equipo[w.wk]) return;
    m.equipo[w.wk] = w.date;
    writeMem(m);
    render();
  });
  document.addEventListener('pg:view', (ev) => {
    const v = ev.detail && ev.detail.view;
    if (v === 'panel') setTimeout(flush, 0);
  });

  if (!document.querySelector('.lg-defs')) document.body.insertAdjacentHTML('afterbegin', L.defs());
  window.PGLogros = { render, open, flush, levels, since, coachHtml, result: () => result(), pending: () => [...pending.keys()], last: () => last };
  render();
})();
