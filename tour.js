// Tour de bienvenida (pedido de José, 2026-11-01): 4 o 5 pantallas sobre la pantalla REAL, con una luz que resalta el botón verdadero.
// Dos tours (asesorado «a» y coach «c»), una sola vez cada uno, justo después de aceptar los textos y elegir rol. Solo producto coach.
// Solo localStorage (como la tarjeta de instalar): sin servidor, sin SQL, sin consentimientos. Los textos no prometen resultados de salud
// ni hablan de ranking por peso, kg o cm. Un paso cuyo botón no existe en esa pantalla se omite (nada se rompe si cambia la barra).
(function (root) {
  'use strict';

  // `sel`: selectores del elemento a resaltar (el primero visible). `tab`: si el título lleva el nombre real de la pestaña, se lee de la barra.
  const TOURS = {
    a: [
      { sel: ['#dia-agua', '#tab-panel'], t: 'Este es tu día', b: 'Toca el agua: +1 por cada vaso. Un toque ya cuenta y todo se guarda solo.' },
      { sel: ['#tab-comidas'], t: 'Aquí anotas lo que comes', b: 'Entra a «Comidas». Toca «+ Comida» o «Igual que ayer».' },
      { sel: ['#tab-entrenar'], t: 'Aquí está tu rutina', b: 'Mira cómo se hace cada ejercicio y toca «Ya entrené» al terminar.' },
      { sel: ['#tab-registro'], t: 'Aquí ves tu avance y te mides', b: 'En «{tab}» puedes medirte. Es opcional y solo toca lo de hoy.' },
      { sel: ['#tab-mas'], t: 'Aquí decides y pides ayuda', b: 'En «Más» ves qué comparte tu coach, descargas tus datos y encuentras la ayuda.' },
    ],
    c: [
      { sel: ['#tab-coach'], t: 'Tu lista con semáforo', b: 'Quien necesita atención sale primero. Toca un nombre para abrir su ficha.' },
      { sel: ['#tab-invitar'], t: 'Aquí invitas a tus asesorados', b: 'Por WhatsApp (solo va un enlace) o con un QR.' },
      { sel: ['#coach-clients .cli-main', '#ci-list button'], t: 'La ficha de cada asesorado', b: 'Toca un nombre para ver su resumen. Solo ves lo que la persona autorizó.' },
      { sel: ['#coach-clients .chip-pay'], t: 'Marca los pagos aquí', b: 'Toca el chip «Pagó / No pagó». Tú cobras por tu lado y lo marcas en la app.' },
      { sel: ['#tab-rutinas'], t: 'Crea y publica rutinas', b: 'Créalas, asígnalas y publícalas como «rutina de hoy».' },
      { sel: ['#tab-mas'], t: 'Y si tienes dudas', b: 'En «Más → Ayuda» están las respuestas a las preguntas más comunes.' },
    ],
  };
  const FORBIDDEN = /\b(kg|kcal|cm|peso|ranking|perder|bajar|resultados?)\b/i;

  // Estado: { a: 1, c: 1 } en localStorage (solo este teléfono).
  const readSeen = (key) => { try { const x = JSON.parse(localStorage.getItem(key) || '{}'); return x && typeof x === 'object' ? x : {}; } catch { return {}; } };
  const writeSeen = (key, role) => { try { localStorage.setItem(key, JSON.stringify({ ...readSeen(key), [role]: 1 })); } catch { /* sin espacio */ } };

  const api = { TOURS, FORBIDDEN, readSeen, writeSeen };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.Tour = api;
  if (typeof document === 'undefined') return;

  const $ = (s) => document.querySelector(s);
  const KEY = root.PGNS.key('tour');
  const visible = (el) => !!el && !el.closest('.hidden, [hidden]') && el.getClientRects().length > 0;
  const firstVisible = (sels) => { for (const s of sels) { for (const el of document.querySelectorAll(s)) if (visible(el)) return el; } return null; };

  let ui = null, steps = [], at = 0, role = 'a', opener = null, timer = null;
  const reduce = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function build() {
    const o = document.createElement('div');
    o.id = 'tour'; o.className = 'tour'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-labelledby', 'tour-title');
    o.innerHTML = '<div class="tour-light" id="tour-light" aria-hidden="true"></div>'
      + '<div class="tour-card" id="tour-card"><p class="tour-count small muted" id="tour-count"></p><h2 id="tour-title" tabindex="-1"></h2><p id="tour-body"></p>'
      + '<div class="tour-btns"><button type="button" class="btn btn-ghost" id="tour-back">Atrás</button><button type="button" class="btn" id="tour-next">Siguiente</button></div>'
      + '<button type="button" class="btn-link small" id="tour-skip">Saltar</button></div>';
    document.body.appendChild(o);
    o.addEventListener('click', (ev) => {
      const id = ev.target && ev.target.id;
      if (id === 'tour-next') go(1); else if (id === 'tour-back') go(-1); else if (id === 'tour-skip') close();
    });
    o.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') { ev.preventDefault(); close(); return; }
      if (ev.key !== 'Tab') return;
      const f = [...o.querySelectorAll('button')].filter((b) => !b.disabled && visible(b));
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (ev.shiftKey && i <= 0) { ev.preventDefault(); f[f.length - 1].focus(); }
      else if (!ev.shiftKey && i === f.length - 1) { ev.preventDefault(); f[0].focus(); }
    });
    return o;
  }

  function place() {
    if (!ui) return;
    const s = steps[at], el = firstVisible(s.sel);
    const light = $('#tour-light'), card = $('#tour-card');
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      const r = el.getBoundingClientRect(), pad = 6;
      Object.assign(light.style, { display: 'block', left: Math.max(0, r.left - pad) + 'px', top: Math.max(0, r.top - pad) + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
      const below = r.top < root.innerHeight / 2;
      card.classList.toggle('tour-top', !below); card.classList.toggle('tour-bottom', below);
    } else { light.style.display = 'none'; card.classList.add('tour-bottom'); card.classList.remove('tour-top'); }
  }

  function show() {
    const s = steps[at], tabEl = firstVisible(s.sel);
    const label = tabEl && tabEl.querySelector('.tb-label') ? tabEl.querySelector('.tb-label').textContent.trim() : '';
    $('#tour-title').textContent = s.t;
    $('#tour-body').textContent = s.b.replace('{tab}', label || 'Progreso');
    $('#tour-count').textContent = `Paso ${at + 1} de ${steps.length}`;
    $('#tour-back').hidden = at === 0;
    $('#tour-next').textContent = at === steps.length - 1 ? 'Entendido' : 'Siguiente';
    $('#tour-card').classList.toggle('tour-still', reduce());
    place();
    $('#tour-title').focus({ preventScroll: true });
  }
  function go(d) { if (at + d >= steps.length) { close(); return; } at = Math.max(0, at + d); show(); }
  function close() {
    writeSeen(KEY, role);
    if (ui) { ui.remove(); ui = null; }
    root.removeEventListener('resize', place);
    if (opener && opener.focus) { try { opener.focus({ preventScroll: true }); } catch { /* nada */ } }
    opener = null;
  }

  // El rol sale de la cuenta; el tour solo cuenta los pasos cuyo botón existe ahora mismo.
  const roleNow = () => { const m = root.PGAccount && root.PGAccount.meta && root.PGAccount.meta(); return m && (m.roles || []).includes('coach') ? 'c' : 'a'; };
  function start(force) {
    if (ui) return false;
    role = roleNow();
    steps = TOURS[role].filter((s) => firstVisible(s.sel));
    if (steps.length < 2) return false;
    at = 0; opener = document.activeElement;
    ui = build();
    root.addEventListener('resize', place);
    show();
    return true;
  }

  // ¿Es el momento? Después de aceptar los textos y elegir rol; nunca sobre pantallas legales, la cuenta, la pausa ni la puerta del acuerdo del coach.
  function ready() {
    const P = root.Producto;
    if (!P || !P.coach || !['', 'pruebas'].includes(root.PGNS.env)) return false;
    const m = root.PGAccount && root.PGAccount.meta && root.PGAccount.meta();
    if (!m || !m.userId || !m.onboarded) return false;
    if (document.body.classList.contains('consent-open')) return false;
    if (!$('#account').classList.contains('hidden')) return false;
    if (!$('#pause-card').classList.contains('hidden')) return false;
    if (document.querySelector('dialog[open]')) return false;
    if (document.querySelector('.a7-gate:not(.hidden)') && root.PGAccount.meta().roles && root.PGAccount.meta().roles.includes('coach')) {
      const g = document.querySelector('#view-coach .a7-gate'); if (g && visible(g)) return false;
    }
    return !readSeen(KEY)[roleNow()];
  }
  function maybe() { clearTimeout(timer); timer = setTimeout(() => { if (!ui && ready()) start(false); }, 700); }

  document.addEventListener('pg:account-changed', maybe);
  document.addEventListener('pg:consents-changed', maybe);
  document.addEventListener('pg:account-ready', maybe);
  document.addEventListener('DOMContentLoaded', maybe);
  document.addEventListener('click', (ev) => {
    if (ev.target.closest && ev.target.closest('#row-tour')) start(true);
    else if (!ui) maybe();
  });
  root.Tour.start = start;
})(typeof window !== 'undefined' ? window : globalThis);
