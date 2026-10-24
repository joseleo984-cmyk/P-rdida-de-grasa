// COPIA «DEMO» (solo se publica en /demo/; ver scripts/build-site.js y equipo/handoffs/demo.md).
// Pegamento con el navegador: SOLO actúa si window.PG_CONFIG.demo === true (config.demo.js, que no existe en la app oficial ni en /pruebas/).
//   1. La app arranca con el servidor FALSO en memoria (remote-fake.js) y nunca con uno real: Remote.config() devuelve modo falso sin url ni clave.
//      Su estado y su sesión viven en el almacenamiento del entorno «demo» (PGNS: 'perdida-grasa-demo:…'), jamás en las claves de la raíz ni de /pruebas/.
//   2. Pantalla de entrada: «Ver como coach» / «Ver como asesorado». Se elige un papel, se siembra (demo-data.js) y se recarga ya «dentro»:
//      sin código por correo, sin captcha y sin pantallas de aceptación legal (la demo no registra consentimientos reales).
//   3. Banner «DEMO», «Cambiar de rol» y «Reiniciar demo» dentro de Más. Los datos se vuelven a generar cada día (fechas relativas a hoy).
// Carga después de remote.js y ANTES de account.js (que decide el servidor al arrancar).
(function () {
  'use strict';
  const cfg = window.PG_CONFIG || {};
  if (cfg.demo !== true || !window.Remote || !window.RemoteFake || !window.PGDemoData) return;

  const DD = window.PGDemoData;
  const RF = window.RemoteFake;
  const $ = (s) => document.querySelector(s);
  const STATE_KEY = PGNS.key('demo');                 // { role, client, day, roster }
  const KEEP = [PGNS.key('demo'), PGNS.key('fake-')];  // al cambiar de papel se conserva el «servidor» y este estado
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin espacio */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* nada */ } },
  };
  const readState = () => { try { return JSON.parse(ls.get(STATE_KEY) || 'null'); } catch { return null; } };

  // ---------- Servidor falso, siempre en el almacenamiento «demo» ----------
  const ns = (store) => ({
    getItem: (k) => store.getItem(PGNS.key('fake-' + k)),
    setItem: (k, v) => store.setItem(PGNS.key('fake-' + k), v),
    removeItem: (k) => store.removeItem(PGNS.key('fake-' + k)),
  });
  Remote.config = () => ({ url: '', key: '', mode: 'fake' });
  Remote.create = () => { throw new Error('La demo no se conecta a ningún servidor'); };
  const origPersistent = RF.persistentBackend;
  const origCreateFake = Remote.createFake;
  RF.persistentBackend = (store) => { const be = origPersistent(store === localStorage ? ns(localStorage) : store); fillBlobs(be); return be; };
  Remote.createFake = (o = {}) => origCreateFake({ ...o, storage: o.storage === localStorage ? ns(localStorage) : o.storage });

  // ---------- Fotos de progreso: siluetas abstractas dibujadas aquí (nunca fotos reales) ----------
  function drawPhoto(cv, { pose, date, progress }) {
    const W = cv.width, H = cv.height, g = cv.getContext('2d');
    const hue = { frente: 174, perfil: 200, espalda: 152 }[pose] || 174;
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, `hsl(${hue} 38% 90%)`); bg.addColorStop(1, `hsl(${hue} 30% 74%)`);
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = `hsl(${hue} 25% 62%)`; g.beginPath(); g.ellipse(W / 2, H * 0.93, W * 0.33, 14, 0, 0, 7); g.fill();   // sombra del suelo
    const s = 1 - 0.16 * progress;                       // la silueta se afina con las semanas: así se nota el antes y el después
    const cx = W / 2, body = `hsl(${hue} 55% 28%)`, rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); };
    g.fillStyle = body;
    g.beginPath(); g.arc(cx, H * 0.17, 30, 0, 7); g.fill();                                  // cabeza
    rr(cx - 10, H * 0.2, 20, 22, 6);                                                          // cuello
    if (pose === 'perfil') {
      const belly = 26 * s;
      g.beginPath(); g.moveTo(cx - 34, H * 0.255); g.lineTo(cx + 30, H * 0.255);
      g.bezierCurveTo(cx + 34 + belly, H * 0.4, cx + 30 + belly, H * 0.5, cx + 30, H * 0.56); g.lineTo(cx - 30, H * 0.56);
      g.bezierCurveTo(cx - 44, H * 0.45, cx - 40, H * 0.35, cx - 34, H * 0.255); g.fill();    // tronco de lado con la barriga
      rr(cx - 26, H * 0.55, 52 * s + 10, H * 0.34, 18);                                       // piernas juntas
      rr(cx - 12, H * 0.27, 24, H * 0.27, 12);                                                // brazo
    } else {
      const sh = 78 * s + 18, wa = 62 * s + 10, hp = 76 * s + 14;                              // hombros, cintura y cadera
      g.beginPath(); g.moveTo(cx - sh, H * 0.27); g.lineTo(cx + sh, H * 0.27); g.lineTo(cx + wa, H * 0.43); g.lineTo(cx + hp, H * 0.56);
      g.lineTo(cx - hp, H * 0.56); g.lineTo(cx - wa, H * 0.43); g.closePath(); g.fill();      // tronco
      rr(cx - hp + 4, H * 0.55, hp - 8, H * 0.36, 20); rr(cx + 4, H * 0.55, hp - 8, H * 0.36, 20);   // piernas
      g.save(); g.translate(cx - sh - 4, H * 0.28); g.rotate(0.12); rr(-14, 0, 26 * s + 6, H * 0.3, 14); g.restore();  // brazos
      g.save(); g.translate(cx + sh + 4, H * 0.28); g.rotate(-0.12); rr(-12, 0, 26 * s + 6, H * 0.3, 14); g.restore();
      if (pose === 'espalda') { g.strokeStyle = `hsl(${hue} 40% 70%)`; g.lineWidth = 3; g.beginPath(); g.moveTo(cx, H * 0.24); g.lineTo(cx, H * 0.55); g.stroke(); }
    }
    g.save(); g.translate(W / 2, H / 2); g.rotate(-0.5); g.fillStyle = 'rgba(255,255,255,.35)'; g.font = 'bold 64px sans-serif'; g.textAlign = 'center'; g.fillText('DEMO', 0, 0); g.restore();
    const label = `${new Date(date + 'T12:00:00').toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })} · ${pose}`;
    g.fillStyle = 'rgba(15,30,28,.62)'; g.fillRect(0, H - 34, W, 34);
    g.fillStyle = '#fff'; g.font = '600 15px sans-serif'; g.textAlign = 'center'; g.fillText(label, W / 2, H - 12);
  }
  function photoBlob(row, mine) {
    const dates = mine.map((p) => p.date).sort();
    const a = Date.parse(dates[0]), b = Date.parse(dates[dates.length - 1]);
    const progress = b > a ? (Date.parse(row.date) - a) / (b - a) : 0;
    const cv = document.createElement('canvas');
    cv.width = row.width || 360; cv.height = row.height || 480;
    drawPhoto(cv, { pose: row.pose, date: row.date, progress });
    return new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.85));
  }
  // El servidor falso no guarda los archivos de las fotos al recargar: se dibujan otra vez (así el coach puede abrirlas).
  async function fillBlobs(be) {
    const rows = Object.values(be.photos).filter((p) => !p.deletedAt);
    for (const p of rows) {
      if (be.blobs[p.storagePath]) continue;
      try { const b = await photoBlob(p, rows.filter((x) => x.userId === p.userId)); if (b) be.blobs[p.storagePath] = b; } catch { /* sin canvas */ }
    }
  }

  // ---------- Entrar con un papel ----------
  function wipeLocal({ all = false } = {}) {
    const pre = 'perdida-grasa-demo:';
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(pre) && (all || !KEEP.some((x) => k.startsWith(x)))) ls.del(k);
    }
  }
  function busy(text) {
    const g = $('#demo-gate');
    if (!g) return;
    g.querySelector('.demo-card').innerHTML = '<h2 id="demo-gate-title" tabindex="-1"></h2><p class="small muted" role="status"></p>';
    g.querySelector('h2').textContent = 'Un momento…';
    g.querySelector('p').textContent = text;
  }
  let entering = false;
  async function enter(role, clientKey = 'ana', { reset = false } = {}) {
    if (entering) return;
    entering = true;
    try {
      showGate(true); busy('Preparando la demo con datos de ejemplo…');
      const today = DD.localDay();
      let st = readState();
      let be;
      if (reset || !st || !st.roster || st.day !== today) {
        wipeLocal({ all: true });
        be = origPersistent(ns(localStorage));
        const roster = await DD.seed(be, { today });
        st = { roster: { coach: roster.coach, clients: roster.clients } };
      } else be = origPersistent(ns(localStorage));
      const who = role === 'coach' ? st.roster.coach : st.roster.clients[clientKey] || st.roster.clients.ana;
      const loc = await DD.localFor(be, who);
      // Fotos del asesorado en su «teléfono» (IndexedDB del entorno demo).
      const mine = [];
      if (window.Photos) {
        await Photos.clear();
        for (const p of loc.photos) {
          const blob = await photoBlob(p, loc.photos);
          mine.push({ id: p.id, date: p.date, pose: p.pose, width: p.width, height: p.height, createdAt: Date.parse(p.createdAt) || Date.now(), updatedAt: p.updatedAt, sharedWithCoach: p.sharedWithCoach === true, blob });
          await Photos.put(mine[mine.length - 1]);
        }
      }
      // Todo lo de esta persona se escribe al FINAL y de una vez, justo antes de recargar (la app no llega a pisarlo).
      wipeLocal();
      ls.set(PGNS.key('v1'), JSON.stringify(loc.state));
      ls.set(PGNS.key('account'), JSON.stringify(loc.meta));
      ls.set(PGNS.key('owner'), who.id);
      if (role !== 'coach') ls.set(PGNS.key('bascula'), 'si');   // el asesorado de la demo ya dijo que tiene báscula
      ns(localStorage).setItem(RF.SESSION_KEY, JSON.stringify(loc.session));
      ls.set(STATE_KEY, JSON.stringify({ role, client: role === 'coach' ? null : who.key, day: today, roster: st.roster }));
      location.replace(location.pathname);
    } catch (err) {
      entering = false;
      console.warn('Demo: no se pudo preparar', err);
      showGate(false, 'No pudimos preparar la demo en este navegador. Recarga la página e inténtalo de nuevo.');
    }
  }
  const reset = () => { const st = readState(); return enter((st && st.role) || 'client', (st && st.client) || 'ana', { reset: true }); };

  // ---------- Pantalla de entrada ----------
  const ROLES = [
    ['coach', 'Ver como coach', 'Lista de asesorados, cobros, fichas con medidas, comidas y rutinas de «Fit Demo».'],
    ['client', 'Ver como asesorado', 'La app de Ana Demo: Inicio, Hábitos, Medidas, Fotos, comidas y rutina.'],
  ];
  function inertApp(on) {
    for (const el of document.body.children) if (el.id !== 'demo-gate' && el.id !== 'demo-banner' && el.tagName !== 'SCRIPT') { if (on) el.setAttribute('inert', ''); else el.removeAttribute('inert'); }
  }
  function showGate(keep, error) {
    let g = $('#demo-gate');
    if (!g) {
      g = document.createElement('div');
      g.id = 'demo-gate'; g.className = 'demo-gate'; g.setAttribute('role', 'dialog'); g.setAttribute('aria-modal', 'true'); g.setAttribute('aria-labelledby', 'demo-gate-title');
      g.innerHTML = '<div class="demo-card card"></div>';
      document.body.appendChild(g);
    }
    inertApp(true);
    if (keep) return;
    const c = g.querySelector('.demo-card');
    c.innerHTML = '';
    const h = document.createElement('h2'); h.id = 'demo-gate-title'; h.tabIndex = -1; h.textContent = 'Pérdida de Grasa — Demo';
    const p = document.createElement('p'); p.textContent = 'Mira cómo luce la app llena de datos de ejemplo. Todo es inventado y nada se guarda en ningún servidor.';
    c.append(h, p);
    if (error) { const e = document.createElement('p'); e.className = 'acc-error'; e.setAttribute('role', 'alert'); e.textContent = error; c.append(e); }
    for (const [role, title, sub] of ROLES) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'demo-big'; b.dataset.role = role;
      const t = document.createElement('strong'); t.textContent = title;
      const s = document.createElement('span'); s.textContent = sub;
      b.append(t, s);
      b.addEventListener('click', () => enter(role));
      c.append(b);
    }
    const paused = document.createElement('button');
    paused.type = 'button'; paused.className = 'btn-link demo-paused'; paused.textContent = 'Ver cómo se ve un asesorado que no pagó (acceso en pausa)';
    paused.addEventListener('click', () => enter('client', 'diego'));
    const note = document.createElement('p'); note.className = 'small muted'; note.textContent = 'Lo que hagas aquí se queda solo en este navegador. En «Más» puedes cambiar de rol o reiniciar la demo.';
    c.append(paused, note);
    h.focus();
  }
  function hideGate() { const g = $('#demo-gate'); if (g) g.remove(); inertApp(false); }

  // ---------- Banner y filas de «Más» ----------
  function addBanner() {
    document.body.classList.add('demo', 'has-demo-banner');
    const b = document.createElement('div');
    b.id = 'demo-banner'; b.className = 'demo-banner'; b.setAttribute('role', 'note'); b.setAttribute('data-testid', 'demo-banner');
    b.textContent = DD.BANNER;
    document.body.prepend(b);
    const size = () => document.documentElement.style.setProperty('--demo-banner-h', b.offsetHeight + 'px');
    size(); addEventListener('resize', size);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(size);
  }
  const CHEV = '<svg class="row-chev" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  function addMasRows() {
    const list = $('#view-mas .more-list');
    if (!list || $('#row-demo-rol')) return;
    const row = (id, t, s) => { const li = document.createElement('li'); li.className = 'demo-more'; li.innerHTML = `<button type="button" class="more-row" id="${id}"><span class="more-text"><strong></strong><span class="more-sub"></span></span>${CHEV}</button>`; li.querySelector('strong').textContent = t; li.querySelector('.more-sub').textContent = s; return li; };
    list.prepend(row('row-demo-reset', 'Reiniciar demo', 'Borra tus cambios y vuelve a los datos de ejemplo'), row('row-demo-rol', 'Cambiar de rol', 'Volver a elegir: coach o asesorado'));
    $('#row-demo-rol').addEventListener('click', () => { const st = readState(); ls.set(STATE_KEY, JSON.stringify({ ...(st || {}), role: null })); location.replace(location.pathname); });
    $('#row-demo-reset').addEventListener('click', reset);
  }

  // ---------- Arranque ----------
  addBanner();
  addMasRows();
  const st = readState();
  const want = (/[?&]rol=(coach|asesorado|pausa)\b/.exec(location.search) || [])[1];
  if (st && st.role && st.roster && st.day === DD.localDay()) {
    // Entrada normal: ya hay datos de hoy y papel elegido.
    window.PGDemo = { state: st, enter, reset };
    // El coach empieza en su lista: el clic automático de la app puede llegar antes de que el panel esté listo, así que se repite ya con todo cargado.
    if (st.role === 'coach') document.addEventListener('pg:account-ready', () => setTimeout(() => { const t = $('#tab-coach'); if (t) t.click(); }, 150));
    document.addEventListener('pg:account-changed', (ev) => { if (!(ev.detail && ev.detail.signedIn) && !entering) { ls.set(STATE_KEY, JSON.stringify({ ...st, role: null })); location.replace(location.pathname); } });
  } else if (st && st.role && st.roster) {
    window.PGDemo = { enter, reset };
    enter(st.role, st.client || 'ana', { reset: true });                  // cambió el día: se vuelve a generar todo respecto a hoy
  } else {
    window.PGDemo = { enter, reset };
    if (want) enter(want === 'coach' ? 'coach' : 'client', want === 'pausa' ? 'diego' : 'ana');
    else showGate(false);
  }
})();
