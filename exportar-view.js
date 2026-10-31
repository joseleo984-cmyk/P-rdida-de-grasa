// M6 · «Exportar a Excel» del coach (Más → Exportar a Excel), boceto equipo/diseno/v3-analitica-admin/M6-exportar-excel.png. Solo producto «coach».
// Lógica pura y generador XLSX: exportar.js. Reglas (concepto jurídico 6):
//   · Solo se exporta lo que el coach YA ve: los datos se piden con coach_pull (mismos permisos del servidor) y además pasan por Exportar.visibleRecords
//     (sin pausa privada, comidas/hábitos solo si los comparte, nunca fotos, perfil, salud L4 ni dolor; nota solo con share_notes).
//   · Casilla LITERAL obligatoria antes de CADA descarga (se desmarca después de cada una). Sin casilla, el botón queda desactivado.
//   · La PRIMERA vez: si su acuerdo aceptado no trae la cláusula 14 (0.5-A7-coach), se le muestra y debe aceptarla (se registra en el servidor con versión,
//     huella y fecha, como todos los consentimientos: account.js → acceptCoachAgreement). No se le obliga a re-aceptar para el resto de la app.
//   · Antes de entregar el archivo se registra la exportación en el servidor (grasa.log_export, sin contenido). Si no se puede registrar, no se descarga.
//   · El botón exige la Política publicada ≥ 1.1 con su aviso activo (legal/VERSIONS.json → Exportar.policyGate).
//   · Descarga: Blob con a[download]; si falla (o en la PWA de iPhone, donde a[download] no siempre guarda), la hoja de compartir del sistema.
// Todo lo que escribe otra persona (nombres) entra al DOM con textContent o escapado.
(function () {
  'use strict';
  const PROD = window.Producto || { coach: false };
  if (!PROD.coach || !window.Exportar) return;
  const X = window.Exportar;
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const acc = () => window.PGAccount || null;
  const isCoach = () => document.body.classList.contains('mode-coach');
  const todayBo = () => (window.Pagos ? Pagos.todayBogota() : new Date().toISOString().slice(0, 10));
  const initials = (n) => (window.ClientStatus ? ClientStatus.initials(n) : String(n || '?').slice(0, 2).toUpperCase());
  const fmtDay = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const fmtStamp = (iso) => (iso ? new Date(iso).toLocaleString('es', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
  const CAT_NAME = Object.fromEntries(X.CATS.map((c) => [c.key, c.label]));

  const st = { clients: [], selected: new Set(), range: '3m', cats: new Set(X.CAT_KEYS), gate: { ok: false, reason: '' }, busy: false, file: null };

  // ---------- Pintar ----------
  function renderWho() {
    const box = $('#xl-who');
    box.innerHTML = st.clients.map((c, i) => `<button type="button" class="xl-av" data-id="${esc(c.clientId)}" aria-pressed="${st.selected.has(c.clientId)}" aria-label="${esc(c.name)}"><span aria-hidden="true">${esc(initials(c.name))}</span></button>`).join('')
      || '<p class="small muted">Aún no tienes asesorados que compartan datos contigo.</p>';
    const all = st.clients.length > 0 && st.selected.size === st.clients.length;
    const b = $('#xl-all');
    b.textContent = `Todos (${st.clients.length})`;
    b.setAttribute('aria-pressed', String(all));
    b.disabled = !st.clients.length;
    const chosen = st.clients.filter((c) => st.selected.has(c.clientId)).map((c) => c.name.split(/\s+/)[0]);
    $('#xl-who-sum').textContent = !st.clients.length ? '' : chosen.length ? `${chosen.length} ${chosen.length === 1 ? 'elegido' : 'elegidos'} · ${chosen.join(', ')}` : 'Ninguno elegido: toca a quién quieres exportar.';
  }
  function renderCats() {
    $('#xl-cats').innerHTML = X.CATS.map((c) => `<label class="xl-cat"><input type="checkbox" name="xl-cat" value="${c.key}"${st.cats.has(c.key) ? ' checked' : ''}><span class="xl-cat-t">${esc(c.label)}</span><span class="xl-cat-s">${esc(c.sub)}</span></label>`).join('');
  }
  function setRange(kind) {
    st.range = kind;
    const earliest = st.clients.map((c) => c.since).filter(Boolean).sort()[0];
    const r = X.rangeOf(kind, todayBo(), earliest);
    $('#xl-from').value = r.from;
    $('#xl-to').value = r.to;
    for (const b of document.querySelectorAll('.xl-range button')) b.setAttribute('aria-pressed', String(b.dataset.range === kind));
  }
  const choice = () => ({ clientIds: st.clients.filter((c) => st.selected.has(c.clientId)).map((c) => c.clientId), cats: X.CAT_KEYS.filter((k) => st.cats.has(k)),
    from: $('#xl-from').value, to: $('#xl-to').value, today: todayBo(), custody: $('#xl-custody').checked });
  function update() {
    const g = st.gate;
    $('#xl-gate').textContent = g.ok ? '' : g.reason;
    $('#xl-gate').classList.toggle('hidden', g.ok);
    const msg = X.validate(choice());
    $('#btn-xl').disabled = st.busy || !g.ok || !!msg;
    if (!st.busy && !st.done) $('#xl-status').textContent = g.ok && msg ? msg : '';
  }
  function renderHistory(list) {
    const ul = $('#xl-hist');
    if (!list) { ul.innerHTML = '<li class="small muted">No pudimos cargar tu historial ahora.</li>'; return; }
    ul.innerHTML = list.length ? list.map((x) => `<li class="xl-hist-row"><b>${esc(fmtStamp(x.createdAt))}</b><span>${x.clients} ${x.clients === 1 ? 'asesorado' : 'asesorados'} · ${esc(X.CAT_KEYS.filter((k) => x.categories.includes(k)).map((k) => CAT_NAME[k]).join(', '))}</span><span class="muted">${esc(fmtDay(x.from))} → ${esc(fmtDay(x.to))}</span></li>`).join('')
      : '<li class="small muted">Aún no has exportado nada.</li>';
  }
  async function loadHistory() {
    const A = acc();
    if (!A || !A.remote.coach.exports) return;
    try { renderHistory(await A.remote.coach.exports()); } catch { renderHistory(null); }
  }

  // ---------- Abrir la pantalla ----------
  async function open() {
    if (!isCoach()) { if (window.PGNav) PGNav.show('mas'); return; }   // un asesorado no ve nada de esto
    st.done = false;
    $('#xl-error').classList.add('hidden');
    $('#xl-custody-t').textContent = X.CUSTODY_TEXT;
    $('#xl-custody').checked = false;
    $('#btn-xl-share').classList.add('hidden');
    st.file = null;
    renderCats();
    const P = window.PGCoachPanel;
    $('#xl-status').textContent = 'Cargando…';
    try { if (P && !P.loaded()) await P.load(); } catch { /* la lista muestra su propio error */ }
    st.clients = P ? P.clients().map((c) => ({ clientId: c.clientId, name: c.name, shares: (c.info && c.info.shares) || {}, since: c.info && c.info.since ? String(c.info.since).slice(0, 10) : null }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es')) : [];
    st.selected = new Set(st.clients.map((c) => c.clientId));
    renderWho();
    setRange(st.range);
    $('#xl-status').textContent = '';
    try { st.gate = X.policyGate(await window.AvisoPolitica.versions()); } catch { st.gate = X.policyGate(null); }
    update();
    loadHistory();
  }

  // ---------- Exportar ----------
  function deliverAnchor(blob, name) {
    if (!('download' in HTMLAnchorElement.prototype)) throw new Error('sin a[download]');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  const iosStandalone = () => navigator.standalone === true || (/iPhone|iPad|iPod/.test(navigator.userAgent) && window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  const canShareFile = (f) => !!(f && navigator.canShare && navigator.share && (() => { try { return navigator.canShare({ files: [f] }); } catch { return false; } })());
  async function share(f) {
    try { await navigator.share({ files: [f], title: f.name }); return true; } catch (e) { return e && e.name === 'AbortError' ? 'abort' : false; }
  }
  async function deliver(bytes, name) {
    const blob = new Blob([bytes], { type: X.MIME });
    const f = typeof File === 'function' ? new File([blob], name, { type: X.MIME }) : null;
    st.file = f;
    $('#btn-xl-share').classList.toggle('hidden', !canShareFile(f));
    if (iosStandalone() && canShareFile(f)) { const r = await share(f); if (r) return 'share'; }
    try { deliverAnchor(blob, name); return 'download'; } catch {
      if (canShareFile(f)) { const r = await share(f); if (r) return 'share'; }
      throw new Error('no_delivery');
    }
  }
  async function doExport() {
    const A = acc();
    const c = choice();
    if (X.validate(c) || !st.gate.ok) { update(); return; }
    st.busy = true; update();
    const err = $('#xl-error');
    err.classList.add('hidden');
    $('#xl-status').textContent = 'Preparando el archivo…';
    try {
      const picked = st.clients.filter((x) => c.clientIds.includes(x.clientId));
      const got = [];
      for (const p of picked) {
        try {
          const d = await A.remote.coach.clientData(p.clientId);   // coach_pull: lo que el servidor deja ver, nada más
          got.push({ name: p.name, shares: p.shares, records: d.records });
        } catch (e) { if (!(e && e.code === 'forbidden')) throw e; }   // dejó de compartir entre medias: no se incluye
      }
      if (!got.length) throw Object.assign(new Error('vacío'), { code: 'none' });
      // 1) Registro en el servidor ANTES de entregar el archivo (sin contenido). Si falla, no se descarga nada.
      await A.remote.coach.logExport(X.logPayload({ ...c, clientIds: got.map((_, i) => i) }));
      // 2) El archivo.
      const now = new Date();
      const { sheets } = X.buildSheets({ clients: got, from: c.from, to: c.to, cats: c.cats, generatedLabel: now.toLocaleString('es', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' }) });
      const name = X.fileName(todayBo());
      const how = await deliver(X.xlsx(sheets, { created: now.toISOString().replace(/\.\d+Z$/, 'Z'), when: now }), name);
      st.done = true;
      $('#xl-custody').checked = false;   // la casilla se marca antes de CADA descarga
      $('#xl-status').textContent = how === 'share' ? `Listo: elige dónde guardar ${name}. Guárdalo en un lugar seguro y bórralo cuando termines la asesoría.`
        : `Listo: descargamos ${name} (${got.length} ${got.length === 1 ? 'asesorado' : 'asesorados'}). Guárdalo en un lugar seguro y bórralo cuando termines la asesoría.`;
      loadHistory();
    } catch (e) {
      const code = e && e.code;
      err.textContent = code === 'export_agreement_required' ? 'Falta aceptar la versión del Acuerdo del coach con la cláusula de descarga. Vuelve a tocar «Descargar Excel».'
        : code === 'none' ? 'Ninguno de los asesorados elegidos comparte datos contigo ahora. No se descargó nada.'
        : code === 'rate_limited' ? 'Hiciste muchas exportaciones hoy. Inténtalo mañana.'
        : e && e.message === 'no_delivery' ? 'Tu teléfono no permitió guardar el archivo. Toca «Compartir el archivo» para guardarlo.'
        : `No pudimos registrar la exportación, así que no se descargó nada. ${A ? A.errorText(e, 'coach') : ''}`.trim();
      err.classList.remove('hidden');
      $('#xl-status').textContent = '';
      if (code === 'export_agreement_required' && A && A.refresh) Promise.resolve(A.refresh()).catch(() => {});
    } finally {
      st.busy = false;
      update();
    }
  }

  // ---------- Primera vez: aceptar la versión del acuerdo con la cláusula 14 ----------
  let opener = null;
  function askAgreement() {
    const CT = window.ConsentTexts, t = CT.get('A7'), A = acc();
    $('#xla-ver').textContent = CT.version('A7');
    $('#xla-clause').textContent = t.clauseExport || '';
    $('#xla-clause-liga').textContent = t.clauseLiga || '';
    $('#xla-clause-liga').classList.toggle('hidden', !t.clauseLiga);
    $('#xla-intro').textContent = CT.fill(t.intro, {});
    $('#xla-clause13').textContent = t.clause || '';
    $('#xla-clause13').classList.toggle('hidden', !t.clause);
    $('#xla-body').textContent = CT.fill(t.body, {});
    if (A && A.fillLinks) A.fillLinks($('#xla-links'), t.links);
    $('#xla-ok').checked = false;
    $('#xla-error').classList.add('hidden');
    opener = document.activeElement;
    $('#sheet-xl-acuerdo').showModal();
    $('#xla-title').focus();
  }
  async function acceptAgreement() {
    const err = $('#xla-error');
    if (!$('#xla-ok').checked) { err.textContent = 'Marca la casilla para aceptar el acuerdo.'; err.classList.remove('hidden'); $('#xla-ok').focus(); return; }
    const b = $('#btn-xla-ok');
    b.disabled = true;
    const ok = await acc().acceptCoachAgreement();   // se registra en el servidor (versión, huella SHA-256 del texto completo y fecha) o no sigue
    b.disabled = false;
    if (!ok) { err.textContent = 'No pudimos guardar tu aceptación. Revisa tu conexión e inténtalo de nuevo.'; err.classList.remove('hidden'); return; }
    $('#sheet-xl-acuerdo').close();
    if (window.PGCoachPanel) PGCoachPanel.toast('Acuerdo aceptado');
    doExport();
  }

  function onDownload() {
    const A = acc();
    if (!A || st.busy) return;
    if (!window.ConsentTexts.exportAgreementOK(A.meta())) { askAgreement(); return; }
    doExport();
  }

  function wire() {
    $('#row-c-exportar').addEventListener('click', () => { open(); });
    $('#xl-who').addEventListener('click', (ev) => {
      const b = ev.target.closest('.xl-av');
      if (!b) return;
      const id = b.dataset.id;
      if (st.selected.has(id)) st.selected.delete(id); else st.selected.add(id);
      renderWho(); update();
      const again = $(`#xl-who .xl-av[data-id="${CSS.escape(id)}"]`);
      if (again) again.focus();
    });
    $('#xl-all').addEventListener('click', () => {
      const all = st.selected.size === st.clients.length;
      st.selected = new Set(all ? [] : st.clients.map((c) => c.clientId));
      renderWho(); update();
    });
    document.querySelector('.xl-range').addEventListener('click', (ev) => { const b = ev.target.closest('button[data-range]'); if (b) { setRange(b.dataset.range); update(); } });
    for (const id of ['#xl-from', '#xl-to']) $(id).addEventListener('input', () => {
      for (const b of document.querySelectorAll('.xl-range button')) b.setAttribute('aria-pressed', 'false');
      st.range = null; update();
    });
    $('#xl-cats').addEventListener('change', (ev) => { const i = ev.target; if (i.name === 'xl-cat') { if (i.checked) st.cats.add(i.value); else st.cats.delete(i.value); update(); } });
    $('#xl-custody').addEventListener('change', () => { st.done = false; update(); });
    $('#btn-xl').addEventListener('click', onDownload);
    $('#btn-xl-share').addEventListener('click', async () => {
      if (!st.file) return;
      const r = await share(st.file);
      if (r === false) { $('#xl-error').textContent = 'No se pudo abrir la hoja de compartir.'; $('#xl-error').classList.remove('hidden'); }
    });
    $('#btn-xla-ok').addEventListener('click', acceptAgreement);
    $('#btn-xla-cancel').addEventListener('click', () => $('#sheet-xl-acuerdo').close());
    $('#sheet-xl-acuerdo').addEventListener('close', () => { if (opener && opener.focus) opener.focus(); });
    $('#sheet-xl-acuerdo').addEventListener('click', (ev) => { if (ev.target === ev.currentTarget) ev.currentTarget.close(); });
  }
  window.PGExportar = { open, state: () => ({ selected: [...st.selected], cats: [...st.cats], gate: st.gate }) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
