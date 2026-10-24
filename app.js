(function () {
  'use strict';

  // La clave conserva el nombre histórico ":v1"; la versión real va dentro del dato (`schemaVersion`).
  const STORAGE_KEY = PGNS.key('v1');
  const BACKUP_KEY = PGNS.key('backup');      // copia del dato crudo antes de migrarlo o corregirlo
  const CORRUPT_KEY = PGNS.key('corrupto');   // dato ilegible que no se pudo cargar
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const fmt = (n, d = 1) => (n == null || Number.isNaN(n) ? '—' : Number(n).toLocaleString('es', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const today = () => toISO(new Date());
  const uid = () => Schema.uuid();   // S2-4: UUID (crypto.randomUUID con respaldo) para poder sincronizar
  // Sprint 11: modo producto «coach» y entrada «solo con cuenta» (solo la copia de pruebas; la app oficial no los tiene: producto.js).
  const PROD = window.Producto || { coach: false, soloNube: false };
  const CT = window.ConsentTexts;
  const HABIT_KEYS = ['water', 'steps', 'sleep'];

  function toISO(d) {
    const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return z.toISOString().slice(0, 10);
  }
  function fmtDate(iso) {
    return new Date(iso + 'T12:00:00').toLocaleDateString('es', { day: 'numeric', month: 'short', year: '2-digit' });
  }
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- Estado ----------
  const emptyState = Schema.emptyState;
  let loadNotice = '';   // aviso a mostrar tras el arranque (toast aún no está listo aquí)
  let saveBlocked = false;
  let savedJSON = null;  // último JSON escrito o leído: permite deshacer en memoria si save() falla
  // Perfil heredado que no pasa la validación (p. ej. meta ≥ peso inicial, BUG-04 de la versión anterior):
  // no se usa para calcular, pero se conserva guardado y precarga el formulario hasta que se corrija.
  let pending = null;    // { profile, reason }
  let state = load();
  let chartRange = 30;
  let syncEngine = null; // S3-3b: sincronización con la cuenta (solo si config.js tiene servidor; ver más abajo)
  let syncTimer = null;

  // Migra y normaliza lo guardado. Si está dañado, la app arranca igualmente y el dato crudo se conserva.
  function load() {
    let raw;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch { return emptyState(); }
    if (!raw) return emptyState();
    try {
      const parsed = JSON.parse(raw);
      const { state: s, warnings, rejected } = Schema.normalize(Schema.migrate(parsed));
      savedJSON = raw;
      // Copia del original antes de migrarlo o corregirlo. Solo la primera: nunca se pisa la única copia.
      const migrated = parsed.schemaVersion !== Schema.CURRENT_VERSION;
      if (warnings.length || migrated) keepCopy(BACKUP_KEY, raw);
      if (rejected.profile) pending = { profile: rejected.profile, reason: rejected.reason };
      if (migrated) {
        // Copia por versión de origen (p. ej. :backup-v3) y se guarda ya migrado: así los UUID nuevos son estables
        // entre cargas y lo migrado conserva updatedAt = EPOCH (no cuenta como edición en el primer save()).
        // Solo se conserva la copia de la migración MÁS RECIENTE (además de :backup y :corrupto): no se acumulan
        // :backup-v1, -v2, -v3… del tamaño de todo el estado (O3 de QA en S2-4).
        try {
          const keep = `${BACKUP_KEY}-v${parsed.schemaVersion || 1}`;
          for (const k of Object.keys(localStorage)) if (k.startsWith(BACKUP_KEY + '-v') && k !== keep) localStorage.removeItem(k);
          localStorage.setItem(keep, raw);
        } catch { /* sin espacio: seguimos */ }
        try {
          const json = JSON.stringify({ ...s, profile: s.profile || (pending && pending.profile) || null, schemaVersion: Schema.CURRENT_VERSION });
          localStorage.setItem(STORAGE_KEY, json);
          savedJSON = json;
        } catch { /* sin espacio: se migrará de nuevo en la próxima carga */ }
      }
      const others = warnings.length - (rejected.profile ? 1 : 0);
      if (rejected.profile) loadNotice = 'Revisa tu perfil: ' + rejected.reason;
      else if (others) loadNotice = `Se corrigieron ${others} datos dañados; se guardó una copia del original`;
      if (warnings.length) console.warn('Datos corregidos al cargar:', warnings);
      return s;
    } catch (err) {
      keepCopy(CORRUPT_KEY, raw);
      // Datos de una versión más nueva: no se sobrescriben desde esta versión antigua.
      saveBlocked = /más nueva/.test(err.message);
      loadNotice = saveBlocked
        ? 'Tus datos son de una versión más nueva de la app: recarga para actualizar'
        : 'No se pudieron leer los datos guardados; se guardó una copia del original';
      console.error('Datos guardados ilegibles:', err);
      return emptyState();
    }
  }
  function keepCopy(key, raw) {
    try { if (localStorage.getItem(key) == null) localStorage.setItem(key, raw); } catch { /* sin espacio: seguimos */ }
  }
  let healthBaseline = null; // LEGAL-01: datos de salud tal como están guardados (ver healthWriteBlocked)
  // Lanza si no se puede escribir (lo usa la importación para ser atómica).
  function persist(s, draft = pending && pending.profile) {
    if (saveBlocked) throw new Error('Guardado bloqueado');
    if (healthWriteBlocked(s)) throw Object.assign(new Error(HEALTH_LOCK_MSG), { code: 'health-lock' });
    const json = JSON.stringify({ ...s, profile: s.profile || draft || null, schemaVersion: Schema.CURRENT_VERSION });
    localStorage.setItem(STORAGE_KEY, json);
    savedJSON = json;
    healthBaseline = healthPart(s);
    scheduleSync();
  }
  const QUOTA_MSG = 'Almacenamiento lleno: exporta una copia y borra fotos antiguas';
  const isQuotaError = (err) => err && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22);
  // Devuelve true si se guardó. Si falla, avisa (aviso de error, más largo), deshace el cambio en memoria
  // para que la pantalla muestre lo que de verdad está guardado, y el llamador NO debe mostrar éxito.
  function save() {
    try {
      // S2-4: marca updatedAt en lo nuevo o cambiado y crea lápidas de lo borrado, comparando con lo guardado.
      let prev = null;
      try { prev = savedJSON ? JSON.parse(savedJSON) : null; } catch { prev = null; }
      state = Schema.stampChanges(prev, state, new Date().toISOString());
      persist(state);
      return true;
    }
    catch (err) {
      toast(err.code === 'health-lock' ? err.message : saveBlocked ? loadNotice : isQuotaError(err) ? QUOTA_MSG : 'No se pudo guardar en este navegador', true);
      try { state = savedJSON ? Schema.normalize(Schema.migrate(JSON.parse(savedJSON))).state : emptyState(); }
      catch { /* se mantiene el estado en memoria */ }
      render();
      return false;
    }
  }

  const sortedEntries = () => [...state.entries].sort((a, b) => a.date.localeCompare(b.date));
  const latestWeight = () => {
    const w = sortedEntries().filter((e) => e.weight);
    return w.length ? w[w.length - 1].weight : state.profile?.startWeight;
  };
  const latestBodyFat = () => {
    const w = sortedEntries().filter((e) => bodyFatOf(e) != null);
    return w.length ? { bf: bodyFatOf(w[w.length - 1]), first: bodyFatOf(w[0]) } : null;
  };
  function bodyFatOf(e) {
    if (e.bodyFat) return e.bodyFat;
    if (!state.profile) return null;
    return Calc.navyBodyFat({ sex: state.profile.sex, height: state.profile.height, waist: e.waist, neck: e.neck, hip: e.hip });
  }

  // ---------- Navegación ----------
  // Barra de abajo. Cliente (y sin cuenta): Inicio | Comidas | ＋ Registrar | Progreso | Más.
  // Coach: Clientes | ＋ Invitar | Más (su propio seguimiento sigue en Más). Las vistas conservan sus ids (#view-…).
  const TAB_OF = { panel: 'panel', comidas: 'comidas', registro: 'registro', mas: 'mas', perfil: 'mas', fotos: 'mas', acuerdo: 'mas', ayuda: 'mas', coach: 'coach', invitar: 'invitar', habitos: 'habitos', medidas: 'medidas', micomidas: 'mas', rutina: 'mas', rutinas: 'mas', 'rutina-edit': 'coach', fotovistas: 'fotos' };
  const PERFIL_TITLES = { all: 'Perfil', plan: 'Mi plan y perfil', datos: 'Mis datos y permisos', copia: 'Descargar una copia', coach: 'Mi coach' };
  let navCoach = false;
  function show(view, mode) {
    if (view === 'perfil') {
      // Sin autorización de datos de salud las tarjetas del plan no se muestran: se enseña todo Perfil (privacidad incluida) para poder autorizar.
      let m = PERFIL_TITLES[mode] ? mode : 'plan';
      if (m === 'plan' && document.body.classList.contains('no-health')) m = 'all';
      $('#view-perfil').dataset.mode = m;
      $('#perfil-title').textContent = PERFIL_TITLES[m];
    }
    const tabView = navCoach && ['panel', 'comidas', 'registro', 'habitos', 'medidas', 'fotos'].includes(view) ? 'mas' : PROD.coach && view === 'fotos' ? 'fotos' : (view === 'rutina-edit' || view === 'fotovistas') && mode === 'mas' ? 'mas' : TAB_OF[view] || view;   // v1.8: la rutina de la biblioteca se edita desde Más
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + view));
    $$('.tabbar button').forEach((b) => {
      const on = b.dataset.view === tabView;
      b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    window.scrollTo({ top: 0 });
    render();
  }
  // Como show(), pero para las filas de Más: el foco va al título de la pantalla nueva.
  let moreReturn = null;
  function goTo(view, mode, fromId) {
    if (fromId) moreReturn = fromId;
    show(view, mode);
    const t = $(`#view-${view} .back-title`);
    if (t) t.focus();
  }
  $$('.tabbar button[data-view]').forEach((b) => b.addEventListener('click', () => show(b.dataset.view)));
  document.addEventListener('click', (ev) => {
    const go = ev.target.closest('[data-goto]');
    if (!go) return;
    const [view, mode] = go.dataset.goto.split(':');
    if (view === 'mas' && go.classList.contains('back-btn')) {
      show('mas');
      ($('#' + moreReturn) || $('#mas-title')).focus();
    } else show(view, mode);
  });
  // Ayudante para las pruebas y para otros módulos: ir a una vista (Perfil con todas sus tarjetas: show('perfil', 'all')).
  window.PGNav = { show: (view, mode) => show(view, mode), applyNav: (isCoach) => applyNav(isCoach), resetAll: (ask) => resetAll(ask),
    photosGrant: async () => { await grant('photos'); return a6aGranted(); },
    trainedToday: () => !!(state.habits[today()] || {}).trained };   // Etapa 2: «Hoy entrené» en Mi rutina

  // Qué botones tiene la barra según la cuenta: el coach ve Clientes | Invitar | Más; todos los demás, las cinco de siempre.
  function applyNav(isCoach) {
    const was = navCoach;
    navCoach = !!isCoach;
    document.body.classList.toggle('mode-coach', navCoach);
    // Sprint 11 (producto 'coach'): cliente = Inicio · Hábitos · Medidas · Fotos · Más; coach = Asesorados · Invitar · Más.
    const order = PROD.coach ? (navCoach ? ['coach', 'invitar', 'mas'] : ['panel', 'habitos', 'medidas', 'fotos', 'mas'])
      : navCoach ? ['coach', 'invitar', 'mas'] : ['panel', 'comidas', 'registrar', 'registro', 'mas'];
    const bar = $('#tabbar');
    for (const id of ['panel', 'comidas', 'registrar', 'registro', 'mas', 'coach', 'invitar', 'habitos', 'medidas', 'fotos']) $('#tab-' + id).classList.toggle('hidden', !order.includes(id));
    order.forEach((id) => bar.appendChild($('#tab-' + id))); // el orden de lectura es el orden visual
    if (navCoach && !was) $('#tab-coach').click(); // el coach empieza en su lista de clientes
    else if (!navCoach && was) {
      const cur = document.querySelector('.view.active');
      if (cur && (cur.id === 'view-coach' || cur.id === 'view-invitar')) show('panel');
    }
  }
  if (PROD.coach) {
    $('#tab-coach .tb-label').textContent = 'Asesorados';
    applyNav(false);
  }

  // ---------- Más (cuenta y menú) ----------
  let navAcct = { signedIn: false, isCoach: false };
  function renderMas() {
    const meta = (window.PGAccount && PGAccount.meta()) || null;
    const remoteOn = document.body.classList.contains('has-remote');
    const signed = remoteOn && navAcct.signedIn && !!meta;
    const name = (state.profile && state.profile.name) || (signed && meta.email ? meta.email.split('@')[0] : '') || 'Tú';
    setText($('#more-name'), name);
    setText($('#more-avatar'), (name.trim()[0] || '?').toUpperCase());
    setText($('#more-sub'), signed ? meta.email : remoteOn ? 'Sin cuenta: tus datos están solo en este teléfono.' : 'Tus datos están solo en este teléfono.');
    setText($('#more-saved'), signed ? CloudView.savedLine(syncSt) : '');
    $('#btn-more-login').classList.toggle('hidden', !remoteOn || signed);
    $$('#view-mas .coach-only').forEach((el) => el.classList.toggle('hidden', !navCoach));
    $('#view-mas .needs-link').classList.toggle('hidden', !(signed && !navAcct.isCoach && meta.link));
    $('#view-mas .needs-login').classList.toggle('hidden', !signed);
  }
  $('#btn-more-login').addEventListener('click', () => $('#btn-account-login').click());
  $('#view-mas').addEventListener('click', (ev) => {
    const b = ev.target.closest('.more-row');
    if (!b) return;
    const to = { 'row-c-panel': ['panel'], 'row-c-registro': ['registro'], 'row-c-comidas': ['comidas'], 'row-c-acuerdo': ['acuerdo'], 'row-plan': ['perfil', 'plan'], 'row-fotos': ['fotos'], 'row-micomidas': ['micomidas'], 'row-coach': ['perfil', 'coach'], 'row-rutina': ['rutina'], 'row-c-rutinas': ['rutinas'],
      'row-datos': ['perfil', 'datos'], 'row-copia': ['perfil', 'copia'], 'row-ayuda': ['ayuda'] }[b.id];
    if (to) goTo(to[0], to[1], b.id);
    else if (b.id === 'row-salir') { goTo('perfil', 'datos', b.id); $('#btn-account-logout').click(); const f = $('#form-logout'); if (f && f.scrollIntoView) f.scrollIntoView({ block: 'center' }); }
  });
  document.addEventListener('pg:account-changed', (ev) => {
    navAcct = { signedIn: !!(ev.detail && ev.detail.signedIn), isCoach: !!(ev.detail && ev.detail.isCoach) };
    applyNav(navAcct.isCoach);
    renderMas();
  });

  // ---------- ＋ Registrar ----------
  const sheet = $('#sheet-registrar');
  let sheetNext = null;
  function openSheet() {
    const prev = Schema.addDays(today(), -1);
    $('#opt-repetir').classList.toggle('hidden', !(state.foods[prev] || []).length);
    sheet.showModal();
    $('#sheet-title').focus();
  }
  function sheetGo(fn) { sheetNext = fn; sheet.close(); }
  $('#tab-registrar').addEventListener('click', openSheet);
  $('#sheet-close').addEventListener('click', () => sheet.close());
  sheet.addEventListener('click', (ev) => { if (ev.target === sheet) sheet.close(); }); // toque en el fondo
  sheet.addEventListener('close', () => {
    const fn = sheetNext;
    sheetNext = null;
    if (fn) fn(); else $('#tab-registrar').focus();
  });
  $('#opt-peso').addEventListener('click', () => sheetGo(() => {
    show('registro');
    entryForm.elements.date.value = today();
    entryForm.elements.weight.focus();
    entryForm.scrollIntoView({ block: 'start' });
  }));
  $('#opt-comida').addEventListener('click', () => sheetGo(() => {
    foodDate.value = today();
    show('comidas');
    $('#form-food').elements.name.focus();
  }));
  $('#opt-repetir').addEventListener('click', () => sheetGo(() => {
    foodDate.value = today();
    show('comidas');
    repeatMeals(Schema.addDays(today(), -1), today());
    $('#food-list-title').focus();
  }));
  $('#opt-habitos').addEventListener('click', () => sheetGo(() => {
    foodDate.value = today();
    show('comidas');
    habitsForm.elements.steps.focus();
    habitsForm.scrollIntoView({ block: 'center' });
  }));

  let toastTimer;
  // Duración según la longitud; los errores duran más (mín. 6 s).
  // `opt`: true marca error; { label, run } añade un botón (p. ej. "Deshacer") y alarga el toast a 6 s.
  function toast(msg, opt) {
    const isError = opt === true;
    const action = opt && typeof opt === 'object' ? opt : null;
    const t = $('#toast');
    t.textContent = msg;
    if (action) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'toast-action';
      b.textContent = action.label;
      b.addEventListener('click', () => { t.classList.remove('show', 'has-action'); action.run(); }, { once: true });
      t.append(' ', b);
    }
    t.classList.toggle('has-action', !!action);
    t.classList.add('show');
    t.classList.toggle('error', isError);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show', 'has-action'), Math.max(isError || action ? 6000 : 2200, msg.length * 60));
  }

  // ---------- Perfil ----------
  const profileForm = $('#form-profile');
  profileForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const f = new FormData(profileForm);
    const profile = {
      name: f.get('name').trim(),
      sex: f.get('sex'),
      age: Number(f.get('age')),
      height: Number(f.get('height')),
      startWeight: Number(f.get('startWeight')),
      goalWeight: Number(f.get('goalWeight')),
      startDate: f.get('startDate'),
      activity: Number(f.get('activity')),
      rate: Number(f.get('rate')),
    };
    // Se valida antes de tocar el estado: un perfil inválido nunca llega a guardarse.
    const err = Schema.profileError(profile);
    if (err) { toast(err); return; }
    state.profile = profile;
    // El peso inicial cuenta como primer registro si aún no hay ninguno ese día.
    if (!state.entries.some((e) => e.date === state.profile.startDate)) {
      state.entries.push({ id: uid(), date: state.profile.startDate, weight: state.profile.startWeight });
    }
    if (!save()) return;
    pending = null;
    toast('Perfil guardado');
    render();
  });

  // Edad mínima 18: el aviso amable se ve en pantalla y también en el globo del navegador (en vez de "mayor o igual que 18").
  function checkAge() {
    const input = profileForm.elements.age;
    const v = Number(input.value);
    const under = input.value !== '' && Number.isFinite(v) && v < Schema.AGE_MIN;
    input.setCustomValidity(under ? Schema.AGE_UNDER_MSG : '');
    const note = $('#age-note');
    note.textContent = under ? Schema.AGE_UNDER_MSG : '';
    note.classList.toggle('hidden', !under);
  }
  profileForm.elements.age.addEventListener('input', checkAge);

  function fillProfileForm() {
    const p = state.profile || (pending && pending.profile);
    const el = profileForm.elements;
    if (!p) {
      el.startDate.value = today();
      el.rate.value = '0.005';
      checkAge();
      return;
    }
    for (const k of Object.keys(p)) if (el[k]) el[k].value = p[k];
    if (!el.startDate.value) el.startDate.value = today();
    checkAge();
  }
  function renderProfileIssue() {
    const box = $('#profile-issue');
    const msg = !state.profile && pending ? `Revisa tu perfil: ${pending.reason.replace(/\.$/, '')}. Corrige los datos y pulsa Guardar.` : '';
    if (box.textContent !== msg) box.textContent = msg;
    box.classList.toggle('hidden', !msg);
  }

  function renderPlan() {
    const box = $('#plan');
    if (!state.profile) { box.innerHTML = '<p class="muted">Guarda tu perfil para ver el plan.</p>'; return; }
    const w = latestWeight();
    const p = Calc.plan(state.profile, w);
    const weeks = Calc.weeksToGoal(w, state.profile.goalWeight, p.weeklyLossKg);
    const eta = weeks != null ? new Date(Date.now() + weeks * 7 * 86400000) : null;
    box.innerHTML = `
      <div class="plan-grid">
        <div><span class="muted small">Metabolismo basal</span><strong>${p.bmr} kcal</strong></div>
        <div><span class="muted small">Mantenimiento</span><strong>${p.maintenance} kcal</strong></div>
        <div><span class="muted small">Déficit diario</span><strong>${p.deficit} kcal</strong></div>
        <div class="hl"><span class="muted small">Objetivo diario</span><strong>${p.kcal} kcal</strong></div>
        <div><span class="muted small">Proteína</span><strong>${p.protein} g</strong></div>
        <div><span class="muted small">Grasas</span><strong>${p.fat} g</strong></div>
        <div><span class="muted small">Carbohidratos</span><strong>${p.carbs} g</strong></div>
        <div><span class="muted small">IMC actual</span><strong>${fmt(Calc.bmi(w, state.profile.height))}</strong></div>
      </div>
      <p class="small">Pérdida esperada: <strong>${fmt(p.weeklyLossKg, 2)} kg/semana</strong>${weeks ? ` · meta en ~${weeks} semanas (${eta.toLocaleDateString('es', { month: 'long', year: 'numeric' })})` : ''}.</p>
      ${p.floored ? '<p class="warn small">Se aplicó un mínimo de calorías por seguridad; el ritmo real será menor al elegido.</p>' : ''}`;
  }

  // ---------- Registro corporal ----------
  const entryForm = $('#form-entry');
  entryForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const f = new FormData(entryForm);
    const num = (k) => (f.get(k) === '' ? undefined : Number(f.get(k)));
    const entry = {
      date: f.get('date'), weight: num('weight'), waist: num('waist'), neck: num('neck'),
      hip: num('hip'), bodyFat: num('bodyFat'), note: f.get('note').trim() || undefined,
    };
    if (!entry.weight && !entry.waist && !entry.bodyFat) { toast('Ingresa al menos peso, cintura o % de grasa'); return; }
    const existing = state.entries.find((e) => e.date === entry.date);
    if (existing) {
      for (const [k, v] of Object.entries(entry)) if (v !== undefined) existing[k] = v;
    } else {
      state.entries.push({ id: uid(), ...entry });
    }
    if (!save()) return;
    entryForm.reset();
    entryForm.elements.date.value = today();
    toast(existing ? 'Registro actualizado' : 'Registro guardado');
    render();
  });

  $('#entries-table').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-del-entry]');
    if (!btn) return;
    if (!confirm('¿Eliminar este registro?')) return;
    state.entries = state.entries.filter((e) => e.id !== btn.dataset.delEntry);
    if (save()) render();
  });

  function renderEntries() {
    const tbody = $('#entries-table tbody');
    const rows = sortedEntries().reverse();
    $('#entries-empty').classList.toggle('hidden', rows.length > 0);
    tbody.innerHTML = rows.map((e) => {
      const bf = bodyFatOf(e);
      const lean = bf != null && e.weight ? e.weight * (1 - bf / 100) : null;
      return `<tr>
        <td>${fmtDate(e.date)}${e.note ? `<div class="muted small">${esc(e.note)}</div>` : ''}</td>
        <td>${e.weight ? fmt(e.weight) + ' kg' : '—'}</td>
        <td>${e.waist ? fmt(e.waist) + ' cm' : '—'}</td>
        <td>${bf != null ? fmt(bf) + ' %' : '—'}</td>
        <td>${lean != null ? fmt(lean) + ' kg' : '—'}</td>
        <td><button class="icon-btn" data-del-entry="${esc(e.id)}" aria-label="Eliminar">✕</button></td>
      </tr>`;
    }).join('');
    $$('.female-only').forEach((el) => el.classList.toggle('hidden', state.profile?.sex !== 'female'));
  }

  // ---------- Comidas ----------
  const foodDate = $('#food-date');
  foodDate.value = today();
  foodDate.addEventListener('change', render);

  const foodForm = $('#form-food');
  foodForm.elements.name.addEventListener('change', () => {
    const lib = state.library[foodForm.elements.name.value.trim().toLowerCase()];
    if (!lib) return;
    for (const k of ['kcal', 'protein', 'carbs', 'fat']) foodForm.elements[k].value = lib[k] ?? '';
  });
  foodForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const f = new FormData(foodForm);
    const n = (k) => Number(f.get(k) || 0);
    const item = { id: uid(), name: f.get('name').trim(), meal: f.get('meal'), kcal: n('kcal'), protein: n('protein'), carbs: n('carbs'), fat: n('fat') };
    if (!item.name) { toast('Escribe el nombre del alimento'); return; }   // BUG-07: solo espacios
    const d = foodDate.value || today();
    (state.foods[d] ||= []).push(item);
    // La biblioteca no guarda nombres reservados ("constructor", "__proto__"...): normalize() los descartaría.
    const key = item.name.toLowerCase();
    if (Schema.isSafeKey(key)) state.library[key] = { name: item.name, kcal: item.kcal, protein: item.protein, carbs: item.carbs, fat: item.fat };
    if (!save()) return;
    const meal = foodForm.elements.meal.value;
    foodForm.reset();
    foodForm.elements.meal.value = meal;
    toast('Alimento agregado');
    render();
  });

  // HU-02: repetir comidas. La lógica (ids nuevos + saneado) vive en Schema.copyMeals.
  const plural = (n) => `${n} alimento${n === 1 ? '' : 's'}`;
  // Copiar un bloque no pide confirmación (es explícito y aditivo): basta "Deshacer" en el toast.
  // Copiar un día entero sobre un día que ya tiene comidas sí la pide (evita duplicar con un doble toque).
  function repeatMeals(from, to, meal) {
    const src = (state.foods[from] || []).filter((x) => !meal || x.meal === meal);
    const yesterday = from === Schema.addDays(today(), -1);
    if (!src.length) { toast(`No hay comidas${meal ? ' de ' + meal : ''} registradas ${yesterday ? 'ayer' : 'el ' + fmtDate(from)}; no se copió nada`); return false; }
    const dest = to === today() ? 'a hoy' : 'al ' + fmtDate(to);
    if (!meal && state.foods[to]?.length &&
      !confirm(`${to === today() ? 'Hoy' : 'El ' + fmtDate(to)} ya tiene comidas. ¿Añadir ${plural(src.length)} ${yesterday ? 'de ayer' : 'del ' + fmtDate(from)}? No se reemplaza nada.`)) return false;
    let r;
    try { r = Schema.copyMeals(state.foods, from, to, { meal }); }
    catch (err) { toast('No se pudo copiar: ' + err.message); return false; }
    const prevIds = new Set((state.foods[to] || []).map((x) => x.id));
    const added = new Set((r.foods[to] || []).filter((x) => !prevIds.has(x.id)).map((x) => x.id));
    state.foods = r.foods;
    if (!save()) return false;
    render();
    toast(`${r.copied === 1 ? 'Se copió' : 'Se copiaron'} ${plural(r.copied)} ${dest}` + (r.skipped ? ` (${r.skipped} no válidos omitidos)` : ''),
      { label: 'Deshacer', run: () => undoCopy(to, added) });
    return true;
  }
  // Deshacer quita solo lo que se añadió en esa copia (respeta lo que se haya registrado después).
  function undoCopy(day, ids) {
    const left = (state.foods[day] || []).filter((x) => !ids.has(x.id));
    if (left.length) state.foods[day] = left; else delete state.foods[day];
    if (!save()) return;
    render();
    if (!document.activeElement || document.activeElement === document.body) $('#food-list-title').focus();
    toast('Copia deshecha');
  }
  $('#btn-copy-prev').addEventListener('click', () => {
    const d = foodDate.value || today();
    repeatMeals(Schema.addDays(d, -1), d);
  });
  $('#btn-copy-to-today').addEventListener('click', () => repeatMeals(foodDate.value, today()));

  $('#food-list').addEventListener('click', (ev) => {
    const rep = ev.target.closest('[data-repeat-meal]');
    if (rep) {
      const { repeatMeal: meal, from } = rep.dataset;
      repeatMeals(from, today(), meal);
      // El botón se regenera (o desaparece): devolver el foco al equivalente o al título del bloque.
      const same = $(`#food-list [data-repeat-meal="${meal}"][data-from="${from}"]`);
      (same || $(`#food-list [data-meal-title="${meal}"]`) || $('#food-list-title')).focus();
      return;
    }
    const btn = ev.target.closest('[data-del-food]');
    if (!btn) return;
    const d = foodDate.value;
    state.foods[d] = (state.foods[d] || []).filter((x) => x.id !== btn.dataset.delFood);
    if (!state.foods[d].length) delete state.foods[d];
    if (save()) render();
  });

  const habitsForm = $('#form-habits');
  habitsForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const f = new FormData(habitsForm);
    const n = (k) => (f.get(k) === '' ? undefined : Number(f.get(k)));
    state.habits[foodDate.value || today()] = { steps: n('steps'), water: n('water'), sleep: n('sleep'), trained: f.get('trained') === 'on' };
    if (!save()) return;
    toast('Hábitos guardados');
    render();
  });

  function dayTotals(d) {
    return (state.foods[d] || []).reduce((t, x) => ({
      kcal: t.kcal + x.kcal, protein: t.protein + x.protein, carbs: t.carbs + x.carbs, fat: t.fat + x.fat,
    }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  }

  function macroBars(d) {
    const t = dayTotals(d);
    const p = state.profile ? Calc.plan(state.profile, latestWeight()) : null;
    const items = [
      ['Calorías', t.kcal, p?.kcal, 'kcal', 'kcal'],
      ['Proteína', t.protein, p?.protein, 'g', 'protein'],
      ['Carbos', t.carbs, p?.carbs, 'g', 'carbs'],
      ['Grasas', t.fat, p?.fat, 'g', 'fat'],
    ];
    return items.map(([label, val, target, unit, cls]) => {
      const pct = target ? Math.min(100, (val / target) * 100) : 0;
      const over = target && val > target * 1.05;
      return `<div class="macro ${cls}">
        <div class="macro-top"><span>${label}</span><span class="${over ? 'over' : ''}">${Math.round(val)}${target ? ' / ' + target : ''} ${unit}</span></div>
        <div class="bar"><div style="width:${pct}%"></div></div>
        ${target ? `<span class="muted small">${over ? 'Excedido en ' + Math.round(val - target) : 'Restan ' + Math.max(0, Math.round(target - val))} ${unit}</span>` : ''}
      </div>`;
    }).join('');
  }

  function renderFoods() {
    const d = foodDate.value || today();
    $('#day-macros').innerHTML = macroBars(d);
    const list = state.foods[d] || [];
    const meals = Schema.MEALS;
    const isToday = d === today();
    $('#btn-copy-prev').textContent = isToday ? 'Copiar de ayer' : 'Copiar del día anterior';
    $('#btn-copy-prev').setAttribute('aria-label', `Copiar las comidas del ${fmtDate(Schema.addDays(d, -1))} a este día`);
    $('#btn-copy-to-today').classList.toggle('hidden', isToday || !list.length);
    $('#btn-copy-to-today').setAttribute('aria-label', `Copiar las comidas del ${fmtDate(d)} a hoy`);
    // Hoy: por cada bloque vacío que ayer sí tenía, "Repetir <bloque> de ayer".
    // Otro día: por cada bloque, "Repetir hoy" (lo copia al día de hoy).
    const prev = Schema.addDays(d, -1);
    const prevList = isToday ? state.foods[prev] || [] : [];
    const html = meals.map((m) => {
      const xs = list.filter((x) => x.meal === m);
      const ys = prevList.filter((x) => x.meal === m);
      if (!xs.length && !ys.length) return '';
      const sum = xs.reduce((s, x) => s + x.kcal, 0);
      const rep = !isToday
        ? `<button type="button" class="btn-link small" data-repeat-meal="${esc(m)}" data-from="${esc(d)}" aria-label="Repetir ${esc(m)} hoy">Repetir hoy</button>`
        : !xs.length
          ? `<button type="button" class="btn-link small" data-repeat-meal="${esc(m)}" data-from="${esc(prev)}">Repetir ${esc(m.toLowerCase())} de ayer</button>`
          : '';
      const side = xs.length ? `${Math.round(sum)} kcal` : `Ayer: ${Math.round(ys.reduce((s, x) => s + x.kcal, 0))} kcal`;
      return `<div class="meal"><div class="meal-head"><strong data-meal-title="${esc(m)}" tabindex="-1">${esc(m)}</strong><span class="meal-side">${rep}<span class="muted">${side}</span></span></div>
        ${xs.map((x) => `<div class="food-row"><span>${esc(x.name)}</span><span class="muted small">${esc(x.kcal)} kcal · P${fmt(x.protein, 0)} C${fmt(x.carbs, 0)} G${fmt(x.fat, 0)}</span><button class="icon-btn" data-del-food="${esc(x.id)}" aria-label="Eliminar">✕</button></div>`).join('')}
      </div>`;
    }).join('');
    $('#food-list').innerHTML = (list.length ? '' : '<p class="muted small">Nada registrado este día.</p>') + html;

    $('#food-suggestions').innerHTML = Object.values(state.library).map((x) => `<option value="${esc(x.name)}">`).join('');

    const h = state.habits[d] || {};
    const el = habitsForm.elements;
    el.steps.value = h.steps ?? '';
    el.water.value = h.water ?? '';
    el.sleep.value = h.sleep ?? '';
    el.trained.checked = !!h.trained;
  }

  // ---------- Fotos ----------
  const POSES = { frente: 'Frente', perfil: 'Perfil', espalda: 'Espalda' };
  let photos = [];
  let comparePose = 'frente';
  const photoUrls = new Map();
  const photoUrl = (p) => {
    if (!photoUrls.has(p.id)) photoUrls.set(p.id, URL.createObjectURL(p.blob));
    return photoUrls.get(p.id);
  };
  const sortedPhotos = () => [...photos].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);

  async function loadPhotos() {
    try {
      photoUrls.forEach((u) => URL.revokeObjectURL(u));
      photoUrls.clear();
      // LEGAL-01: sin autorización de fotos no se leen ni se muestran (tampoco en la galería oculta).
      if (!photosAllowed()) { photos = []; renderPhotos(true); return; }
      // Fotos guardadas por versiones anteriores sin validar (BUG-13): se ocultan si no tienen fecha válida.
      // S2-4: fotos de versiones anteriores → id UUID y updatedAt (una sola transacción; si falla se reintenta luego).
      try { await Photos.migrateIds({ isValid: Schema.isUUID, uid, epoch: Schema.EPOCH }); } catch { /* se reintenta en la próxima carga */ }
      const stored = await Photos.all();
      photos = stored.map(Schema.normalizeStoredPhoto).filter((p) => p && p.blob instanceof Blob);
      if (photos.length < stored.length) console.warn(`${stored.length - photos.length} fotos guardadas no válidas se ocultan`);
    } catch {
      photos = [];
      toast('No se pudieron cargar las fotos');
    }
    renderPhotos(true);
  }

  // ---- Sprint 11: fotos en la nube, detrás de A6a (guardar en la nube) y A6b (que el coach vea las fotos que la persona sube; puede ocultar una) ----
  const consentOf = (kind, id) => { const m = acct(); const c = m && m.consents && m.consents[kind]; return !!(c && c.granted === true && c.version === CT.version(id)); };
  const a6bGranted = () => consentOf('photo_view_coach', 'A6b');
  // ¿Se suben las fotos a la nube? Solo con producto 'coach' (la app oficial las deja apagadas), cuenta con la copia en la nube, fotos autorizadas y A6a.
  function photoCloudOn() { const m = acct(); return PROD.coach && !!m && CT.cloudAllowed(m) && consentOf('photos_cloud', 'A6a') && Schema.consentStatus(state.consent) === 'ok' && state.consent.photos === true; }
  // ¿Puede marcar fotos para su coach? A6b vigente + el vínculo comparte fotos.
  function coachPhotosOn() { const l = myLinkNow(); return photoCloudOn() && !!l && !!(l.shares && l.shares.photos) && a6bGranted(); }
  function renderPhotosCoach() {
    const l = myLinkNow();
    const card = $('#photos-coach-card');
    const show = PROD.coach && !!l && photoCloudOn();
    card.classList.toggle('hidden', !show);
    // Textos legales 24/10/2026: aviso prominente junto al formulario (solo con el permiso A6b vigente; NO es un consentimiento) y entrada a la bitácora.
    $('#photo-share-notice').classList.toggle('hidden', !(PROD.coach && coachPhotosOn()));
    $('#photos-log-card').classList.toggle('hidden', !(PROD.coach && !!acct()));
    $('#photos-a6a-text').classList.toggle('hidden', !PROD.soloNube);
    if (PROD.soloNube) setText($('#photos-a6a-text'), CT.fill(CT.get('A6a').body, {}));
    if (!show) return;
    const on = coachPhotosOn(), name = l.businessName || 'tu coach';
    setText($('#photos-coach-state'), on ? `${name} puede ver tus fotos. Para ocultar una, ábrela y desmarca «Mi coach puede ver esta foto». Quitar el permiso las oculta todas al instante.`
      : `${name} todavía no puede ver tus fotos.`);
    const t = $('#photos-a6b-text');
    t.classList.toggle('hidden', on);
    if (!on) setText(t, CT.fill(CT.get('A6b').body, { coach: name }));
    setText($('#btn-photos-coach'), on ? 'Quitar el permiso a mi coach' : `Permitir que ${name} vea mis fotos`);
  }
  $('#btn-photos-coach').addEventListener('click', async () => {
    if (!window.PGAccount || !PGAccount.setCoachPhotos) return;
    const on = coachPhotosOn();
    const err = $('#photos-coach-error');
    err.classList.add('hidden');
    const btn = $('#btn-photos-coach');
    btn.disabled = true;
    try {
      const done = await PGAccount.setCoachPhotos(!on);
      if (done && on) await unshareAllPhotos();
      if (done && !on) await shareAllPhotos();
      if (done) toast(on ? 'Listo: tu coach ya no ve tus fotos' : 'Listo: tu coach ya puede ver tus fotos');
    } catch (e) { err.textContent = PGAccount.errorText(e, 'shares'); err.classList.remove('hidden'); }
    finally { btn.disabled = false; render(); }
  });
  async function unshareAllPhotos() {
    if (!photos.length && photosAllowed()) await loadPhotos();   // al arrancar la galería puede no estar leída todavía (p. ej. al retirar un permiso viejo)
    const now = new Date().toISOString();
    for (const p of photos.filter((x) => x.sharedWithCoach)) { p.sharedWithCoach = false; p.updatedAt = now; try { await Photos.put(p); } catch { /* se reintenta en la próxima carga */ } }
    scheduleSync(300);
  }
  async function shareAllPhotos() {
    const now = new Date().toISOString();
    for (const p of photos.filter((x) => !x.sharedWithCoach)) { p.sharedWithCoach = true; p.updatedAt = now; try { await Photos.put(p); } catch { /* se reintenta en la próxima carga */ } }
    await loadPhotos();   // por si otra carga leyó la galería a medias
    scheduleSync(300);
  }
  document.addEventListener('pg:photos-unshare', () => { unshareAllPhotos(); render(); });
  document.addEventListener('pg:photos-cloud-changed', () => {
    const m = syncStore.getMeta();
    syncStore.setMeta({ ...m, pushedUpTo: null });   // las fotos que ya estaban se suben con la primera sincronización tras autorizar A6a
    loadPhotos(); render(); scheduleSync(0);
  });
  let lastPhotosAllowed = photosAllowed();
  document.addEventListener('pg:consents-changed', () => { const a = photosAllowed(); if (a !== lastPhotosAllowed) { lastPhotosAllowed = a; loadPhotos(); } render(); });
  document.addEventListener('pg:account-ready', () => { lastPhotosAllowed = photosAllowed(); loadPhotos(); });

  // ---- Textos legales 24/10/2026 (producto coach): «Quién vio mis fotos». El texto aprobado de A6b promete una bitácora de visualización en el perfil:
  // cada vez que el coach abre una foto, el servidor lo anota (grasa.photo_views) y aquí la persona lo ve (Remote.client.photoViews: las 100 más recientes).
  if (PROD.coach) {
    $('#photo-file-text').textContent = 'Adjuntar foto';   // el teléfono ofrece «Tomar foto» en el mismo selector (accept="image/*"): sin botones nuevos
    $('#coach-log-card').classList.remove('hidden');
  }
  const fvWhen = (iso) => new Date(iso).toLocaleString('es', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  const fvDay = (d) => new Date(d + 'T12:00:00').toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
  async function loadPhotoViews() {
    const status = $('#fv-status'), list = $('#fv-list'), empty = $('#fv-empty'), retry = $('#btn-fv-retry');
    list.replaceChildren(); empty.classList.add('hidden'); retry.classList.add('hidden');
    const R = window.PGAccount && PGAccount.remote;
    if (!R || !acct()) { setText(status, 'Entra a tu cuenta para ver quién abrió tus fotos.'); return; }
    setText(status, 'Cargando…');
    try {
      const rows = await R.client.photoViews();
      setText(status, rows.length ? `Aperturas registradas: ${rows.length}${rows.length >= 100 ? ' (las 100 más recientes)' : ''}.` : '');
      empty.classList.toggle('hidden', rows.length > 0);
      list.innerHTML = rows.map((v) => {
        const what = v.photoDate && POSES[v.pose] ? `tu foto de ${POSES[v.pose].toLowerCase()} del ${fvDay(v.photoDate)}` : 'una de tus fotos';
        return `<li class="fv-item"><strong>${esc(fvWhen(v.viewedAt))}</strong><span>${esc(v.coachName || 'Tu coach')} abrió ${esc(what)}.</span></li>`;
      }).join('');
    } catch (e) {
      setText(status, PGAccount.errorText(e, 'shares'));
      retry.classList.remove('hidden');
    }
  }
  const openPhotoViews = (mode) => { goTo('fotovistas', mode, mode === 'mas' ? 'row-coach' : undefined); loadPhotoViews(); };
  $('#btn-fotovistas').addEventListener('click', () => openPhotoViews());
  $('#btn-fotovistas-coach').addEventListener('click', () => openPhotoViews('mas'));
  $('#btn-fv-retry').addEventListener('click', loadPhotoViews);

  // Peso registrado el mismo día o el más cercano (máximo 3 días de diferencia).
  function weightNear(iso) {
    const day = Calc.toDay(iso);
    let best = null;
    for (const e of state.entries) {
      if (!e.weight) continue;
      const diff = Math.abs(Calc.toDay(e.date) - day);
      if (diff <= 3 && (!best || diff < best.diff)) best = { diff, entry: e };
    }
    return best?.entry || null;
  }

  const photoForm = $('#form-photo');
  photoForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const file = photoForm.elements.file.files[0];
    if (!file) return;
    const btn = photoForm.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const { blob, width, height } = await Photos.compress(file);
      const photo = { id: uid(), date: photoForm.elements.date.value, pose: photoForm.elements.pose.value, blob, width, height, createdAt: Date.now(), updatedAt: new Date().toISOString() };
      if (PROD.coach) photo.sharedWithCoach = coachPhotosOn();   // con el permiso A6b vigente la foto nueva la ve el coach; la persona puede ocultarla desde la foto
      await Photos.put(photo);
      photos.push(photo);
      comparePose = photo.pose;
      photoForm.elements.file.value = '';
      toast('Foto guardada');
      renderPhotos(true);
      if (photoCloudOn()) scheduleSync(500);   // Sprint 11: sube a la nube (A6a) si la persona lo autorizó
    } catch (err) {
      toast(err.message || 'No se pudo guardar la foto');
    } finally {
      btn.disabled = false;
    }
  });

  $('#compare-pose').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-pose]');
    if (!b) return;
    comparePose = b.dataset.pose;
    renderPhotos(true);
  });
  $('#compare-a').addEventListener('change', () => renderCompare(false));
  $('#compare-b').addEventListener('change', () => renderCompare(false));

  const viewer = $('#photo-viewer');
  let viewing = null;
  document.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-photo]');
    if (!t) return;
    viewing = photos.find((p) => p.id === t.dataset.photo);
    if (!viewing) return;
    $('img', viewer).src = photoUrl(viewing);
    const w = weightNear(viewing.date);
    $('#viewer-caption').textContent = `${fmtDate(viewing.date)} · ${POSES[viewing.pose]}${w && !PROD.coach ? ' · ' + fmt(w.weight) + ' kg' : ''}`;
    // Sprint 11: «Mi coach puede ver esta foto» (para ocultarla o mostrarla): solo con A6a + A6b vigentes y el vínculo compartiendo fotos.
    const shareRow = $('#viewer-share-row');
    shareRow.classList.toggle('hidden', !coachPhotosOn());
    $('#viewer-share').checked = viewing.sharedWithCoach === true;
    viewer.showModal();
  });
  $('#viewer-close').addEventListener('click', () => viewer.close());
  $('#viewer-share').addEventListener('change', async (ev) => {
    if (!viewing || !coachPhotosOn()) return;
    const on = ev.target.checked;
    try {
      viewing.sharedWithCoach = on;
      viewing.updatedAt = new Date().toISOString();
      await Photos.put(viewing);
      toast(on ? 'Tu coach ya puede ver esta foto' : 'Tu coach ya no ve esta foto');
      renderPhotos();
      scheduleSync(300);
    } catch { ev.target.checked = !on; toast('No se pudo cambiar', true); }
  });
  viewer.addEventListener('click', (ev) => { if (ev.target === viewer) viewer.close(); });
  $('#viewer-delete').addEventListener('click', async () => {
    if (!viewing || !confirm('¿Eliminar esta foto?')) return;
    try {
      await Photos.remove(viewing.id);
      // S2-4: lápida para que, al sincronizar, el borrado no "resucite" desde otro dispositivo.
      if (Schema.isUUID(viewing.id) && Schema.isISODate(viewing.date)) {
        const t = new Date().toISOString();
        state.deleted.photos.push({ id: viewing.id, date: viewing.date, deletedAt: t, updatedAt: t });
        save();
      }
      URL.revokeObjectURL(photoUrls.get(viewing.id));
      photoUrls.delete(viewing.id);
      photos = photos.filter((p) => p.id !== viewing.id);
      viewer.close();
      toast('Foto eliminada');
      renderPhotos();
      scheduleSync(300);   // Sprint 11: la lápida también borra el archivo de la nube
    } catch {
      toast('No se pudo eliminar la foto');
    }
  });

  function renderPhotos(resetSelection = false) {
    $$('#compare-pose button').forEach((b) => b.classList.toggle('on', b.dataset.pose === comparePose));
    renderCompare(resetSelection);
    renderPhotosCoach();

    const byDate = {};
    for (const p of sortedPhotos().reverse()) (byDate[p.date] ||= []).push(p);
    const dates = Object.keys(byDate);
    $('#gallery').innerHTML = dates.length ? dates.map((d) => {
      const w = PROD.coach ? null : weightNear(d);
      return `<div class="photo-day">
        <div class="meal-head"><strong>${fmtDate(d)}</strong><span class="muted">${w ? fmt(w.weight) + ' kg' : ''}</span></div>
        <div class="thumbs">${byDate[d].map((p) => `
          <button class="thumb" data-photo="${esc(p.id)}" aria-label="Ver foto ${esc(POSES[p.pose])} del ${esc(fmtDate(d))}${p.sharedWithCoach ? '. Tu coach puede verla' : ''}">
            <img src="${esc(photoUrl(p))}" alt="" loading="lazy"><span>${esc(POSES[p.pose])}</span>${p.sharedWithCoach ? '<em class="shared-badge">Tu coach la ve</em>' : ''}
          </button>`).join('')}</div>
      </div>`;
    }).join('') : '<p class="muted small">Aún no hay fotos.</p>';
  }

  // resetSelection: elige automáticamente la primera y la última foto de la pose.
  function renderCompare(resetSelection) {
    const list = sortedPhotos().filter((p) => p.pose === comparePose);
    const selA = $('#compare-a'), selB = $('#compare-b');
    const prevA = selA.value, prevB = selB.value;
    const opts = list.map((p) => `<option value="${esc(p.id)}">${esc(fmtDate(p.date))}</option>`).join('');
    selA.innerHTML = opts;
    selB.innerHTML = opts;
    const has = (id) => list.some((p) => p.id === id);
    selA.value = !resetSelection && has(prevA) ? prevA : list[0]?.id ?? '';
    selB.value = !resetSelection && has(prevB) ? prevB : list[list.length - 1]?.id ?? '';

    const box = $('#compare-view');
    if (list.length < 2) {
      box.innerHTML = `<p class="muted small">Necesitas al menos 2 fotos de ${POSES[comparePose].toLowerCase()} para comparar.</p>`;
      return;
    }
    const a = list.find((p) => p.id === selA.value);
    const b = list.find((p) => p.id === selB.value);
    const wa = PROD.coach ? null : weightNear(a.date), wb = PROD.coach ? null : weightNear(b.date);
    const days = Calc.toDay(b.date) - Calc.toDay(a.date);
    const parts = [`${Math.abs(days)} días`];
    if (wa && wb) {
      const d = wb.weight - wa.weight;
      parts.push(`${d > 0 ? '+' : ''}${fmt(d)} kg`);
    }
    const fig = (p, w, label) => `<figure>
        <button class="thumb" data-photo="${esc(p.id)}"><img src="${esc(photoUrl(p))}" alt="${esc(label)}"></button>
        <figcaption><strong>${label}</strong> · ${fmtDate(p.date)}${w ? ' · ' + fmt(w.weight) + ' kg' : ''}</figcaption>
      </figure>`;
    box.innerHTML = `<div class="compare-pair">${fig(a, wa, 'Antes')}${fig(b, wb, 'Después')}</div>
      <p class="small compare-diff">${parts.join(' · ')}</p>`;
  }

  // ---------- Panel ----------
  function renderPanel() {
    const p = state.profile;
    $('#onboarding').classList.toggle('hidden', !!p);
    const w = latestWeight();
    const entries = sortedEntries();
    const rate = Calc.weeklyRate(state.entries);

    $('#st-weight').textContent = w ? fmt(w) + ' kg' : '—';
    $('#st-weight-sub').textContent = p ? 'IMC ' + fmt(Calc.bmi(w, p.height)) : '';
    if (p) {
      const lost = p.startWeight - w;
      $('#st-lost').textContent = fmt(lost) + ' kg';
      $('#st-lost-sub').textContent = fmt((lost / p.startWeight) * 100) + ' % del inicio';
    }
    const bf = latestBodyFat();
    $('#st-bf').textContent = bf ? fmt(bf.bf) + ' %' : '—';
    $('#st-bf-sub').textContent = bf && bf.first !== bf.bf ? (bf.bf - bf.first > 0 ? '+' : '') + fmt(bf.bf - bf.first) + ' pts' : 'Agrega medidas';
    $('#st-rate').textContent = rate != null ? (rate > 0 ? '+' : '') + fmt(rate, 2) + ' kg' : '—';
    $('#st-rate-sub').textContent = rate != null && w ? fmt((Math.abs(rate) / w) * 100, 2) + ' % por semana' : 'Necesita 2+ pesajes';

    if (p) {
      const total = p.startWeight - p.goalWeight;
      const done = Math.max(0, Math.min(total, p.startWeight - w));
      const pct = total > 0 ? (done / total) * 100 : 0;
      $('#goal-bar').style.width = pct + '%';
      $('#goal-text').textContent = `${fmt(done)} de ${fmt(total)} kg (${fmt(pct, 0)} %) · Faltan ${fmt(Math.max(0, w - p.goalWeight))} kg para llegar a ${fmt(p.goalWeight)} kg`;
      const pace = rate != null && rate < 0 ? -rate : Calc.plan(p, w).weeklyLossKg;
      const weeks = Calc.weeksToGoal(w, p.goalWeight, pace);
      $('#goal-eta').textContent = weeks === 0 ? '¡Meta alcanzada! 🎉' : weeks ? `~${weeks} semanas` : '';
    } else {
      $('#goal-bar').style.width = '0%';
      $('#goal-text').textContent = '';
      $('#goal-eta').textContent = '';
    }

    $('#today-macros').innerHTML = macroBars(today());
    renderHome();
    drawChart(entries);
    renderTips(rate, w);
  }

  // Sprint 4: saludo y tarjetas de Inicio. Todo texto va con textContent; los números salen de HomeView (puro).
  function renderHome() {
    const d = today();
    $('#home-date').textContent = HomeView.fecha(new Date());
    $('#home-greeting').textContent = HomeView.saludo(state);
    const h = HomeView.hoy(state, d);
    $('#home-kcal').textContent = h.kcalText;
    $('#home-goal').textContent = h.goalText;
    $('#home-left').textContent = h.leftText;
    $('#home-left').classList.toggle('over', h.over);
    $('#home-protein').textContent = h.proteinText;
    $('#home-water').textContent = h.glassesText;
    for (const [id, pct] of [['kcal', h.kcalPct], ['protein', h.proteinPct], ['water', h.glassesPct]]) {
      const bar = $(`#home-${id}-bar`);
      bar.setAttribute('aria-valuenow', String(Math.round(pct)));
      bar.firstElementChild.style.width = pct + '%';
    }
    $('#home-kcal-bar').setAttribute('aria-valuetext', h.kcalGoal != null ? `${h.kcalText} de ${h.kcalGoal} kcal` : `${h.kcalText} kcal`);
    $('#home-protein-bar').setAttribute('aria-valuetext', h.proteinText);
    $('#home-water-bar').setAttribute('aria-valuetext', h.glassesText);
    const b = HomeView.desayunoAyer(state, d);
    const btn = $('#btn-repeat-breakfast');
    btn.classList.toggle('hidden', !b.show);
    btn.setAttribute('aria-label', `Repetir el desayuno de ayer (${b.count} alimento${b.count === 1 ? '' : 's'}, ${b.kcal} kcal)`);
    const p = HomeView.peso(state, d);
    $('#home-weight-value').textContent = p.valueText;
    $('#home-weight-unit').classList.toggle('hidden', !p.has);
    $('#home-weight-diff').textContent = p.diffText;
    $('#home-weight-diff').dataset.dir = p.dir || 'none';
    const sp = $('#home-spark');
    sp.classList.toggle('hidden', !p.spark);
    if (p.spark) {
      sp.setAttribute('aria-label', p.spark.label);
      sp.firstElementChild.setAttribute('d', p.spark.d);
      sp.lastElementChild.setAttribute('cx', p.spark.last[0]);
      sp.lastElementChild.setAttribute('cy', p.spark.last[1]);
    }
  }
  // Repetir el desayuno de ayer: la misma función que ya usan "Repetir <bloque> de ayer" y la hoja ＋ Registrar.
  $('#btn-repeat-breakfast').addEventListener('click', () => {
    if (!repeatMeals(Schema.addDays(today(), -1), today(), 'Desayuno')) return;
    const t = $('#home-today-title');
    t.setAttribute('tabindex', '-1');
    t.focus();
  });

  function renderTips(rate, w) {
    const p = state.profile;
    const tips = [];
    if (!p) tips.push('Completa tu perfil para obtener un plan personalizado.');
    else {
      const target = Calc.plan(p, w);
      const expected = -target.weeklyLossKg;
      const weighIns = state.entries.filter((e) => e.weight && Calc.toDay(e.date) > Calc.toDay(today()) - 14).length;
      if (weighIns < 4) tips.push('Pésate al menos 3–4 veces por semana, en ayunas y tras ir al baño: la tendencia importa más que un día suelto.');
      if (rate != null && weighIns >= 4) {
        if (rate > -0.05) tips.push(`Tu peso está estable. Si llevas 2–3 semanas así, reduce ~150 kcal/día o suma ~2.000 pasos diarios.`);
        else if (rate < expected * 1.6) tips.push('Estás bajando más rápido de lo planeado. Considera subir ~100–150 kcal para proteger tu masa muscular.');
        else tips.push('¡Vas en buen ritmo! Mantén la constancia.');
      }
      const last7 = [...Array(7)].map((_, i) => toISO(new Date(Date.now() - i * 86400000)));
      const logged = last7.filter((d) => state.foods[d]?.length);
      if (logged.length >= 3) {
        const avgP = logged.reduce((s, d) => s + dayTotals(d).protein, 0) / logged.length;
        if (avgP < target.protein * 0.85) tips.push(`Tu proteína media (${Math.round(avgP)} g) está por debajo del objetivo (${target.protein} g). Prioriza una fuente proteica en cada comida.`);
      }
      const trainedDays = last7.filter((d) => state.habits[d]?.trained).length;
      if (trainedDays < 2) tips.push('Entrena fuerza 2–4 veces por semana para conservar músculo durante el déficit.');
      const sleeps = last7.map((d) => state.habits[d]?.sleep).filter(Boolean);
      if (sleeps.length >= 3 && sleeps.reduce((a, b) => a + b, 0) / sleeps.length < 7) tips.push('Duermes menos de 7 h de media; el mal sueño aumenta el hambre y dificulta la adherencia.');
      if (!state.entries.some((e) => e.waist)) tips.push('Registra tu cintura cada 1–2 semanas: refleja la pérdida de grasa mejor que la báscula.');
    }
    $('#tips').innerHTML = tips.map((t) => `<li>${esc(t)}</li>`).join('');
  }

  // ---------- Gráfico (canvas, sin librerías) ----------
  $('#range-seg').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-range]');
    if (!b) return;
    chartRange = Number(b.dataset.range);
    $$('#range-seg button').forEach((x) => x.classList.toggle('on', x === b));
    drawChart(sortedEntries());
  });
  window.addEventListener('resize', () => drawChart(sortedEntries()));

  function drawChart(entries) {
    const canvas = $('#chart');
    if (!canvas.offsetParent) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth, H = 220;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const css = getComputedStyle(document.documentElement);
    const col = (v) => css.getPropertyValue(v).trim();

    let pts = Calc.trend(entries);
    if (chartRange) {
      const min = Calc.toDay(today()) - chartRange;
      pts = pts.filter((p) => Calc.toDay(p.date) >= min);
    }
    if (pts.length < 1) {
      ctx.fillStyle = col('--muted');
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Registra tu peso para ver la gráfica', W / 2, H / 2);
      return;
    }
    const goal = state.profile?.goalWeight;
    const ys = pts.flatMap((p) => [p.weight, p.trend]);
    let lo = Math.min(...ys), hi = Math.max(...ys);
    if (goal && goal >= lo - 3) lo = Math.min(lo, goal);
    const pad = Math.max(0.5, (hi - lo) * 0.1);
    lo -= pad; hi += pad;
    const x0 = Calc.toDay(pts[0].date), x1 = Math.max(x0 + 1, Calc.toDay(pts[pts.length - 1].date));
    const L = 40, R = 10, T = 10, B = 24;
    const X = (iso) => L + ((Calc.toDay(iso) - x0) / (x1 - x0)) * (W - L - R);
    const Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);

    ctx.font = '11px system-ui';
    ctx.fillStyle = col('--muted');
    ctx.strokeStyle = col('--line');
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const v = lo + ((hi - lo) * i) / 4;
      const y = Y(v);
      ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(W - R, y); ctx.stroke();
      ctx.fillText(v.toFixed(1), L - 6, y + 4);
    }
    ctx.textAlign = 'center';
    const labels = pts.length === 1 ? [pts[0]] : [pts[0], pts[Math.floor(pts.length / 2)], pts[pts.length - 1]];
    labels.forEach((p) => ctx.fillText(fmtDate(p.date), Math.min(W - 30, Math.max(L + 20, X(p.date))), H - 6));

    if (goal && goal >= lo && goal <= hi) {
      ctx.strokeStyle = col('--goal');
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(L, Y(goal)); ctx.lineTo(W - R, Y(goal)); ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.fillStyle = col('--raw');
    pts.forEach((p) => { ctx.beginPath(); ctx.arc(X(p.date), Y(p.weight), 3, 0, Math.PI * 2); ctx.fill(); });

    ctx.strokeStyle = col('--accent');
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(X(p.date), Y(p.trend)) : ctx.moveTo(X(p.date), Y(p.trend))));
    ctx.stroke();
  }

  // ---------- Datos ----------
  function download(name, content, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  $('#btn-export').addEventListener('click', async () => {
    let photoData = [];
    try { photoData = await Photos.exportAll(); }
    catch { toast('No se pudieron incluir las fotos en la copia'); }
    download(`perdida-grasa-${today()}.json`, JSON.stringify({ ...state, profile: state.profile || (pending && pending.profile) || null, schemaVersion: Schema.CURRENT_VERSION, exportedAt: new Date().toISOString(), photos: photoData }, null, 2), 'application/json');
  });
  // CSV completo (medidas, comidas y hábitos), con ';' y coma decimal para Excel/Sheets en Colombia: ver coach.js.
  $('#btn-export-csv').addEventListener('click', () => {
    download(`perdida-grasa-${today()}.csv`, Coach.toCSV(state), 'text/csv;charset=utf-8');
  });
  // Textos legales 24/10/2026 (producto coach, concepto punto 3.6): antes de abrir el selector de archivo se muestra el aviso LITERAL aprobado
  // («Antes de importar tu historial: …»). «Continuar» abre el selector; «Cancelar» no hace nada. En la app oficial la importación sigue como estaba.
  if (PROD.coach) {
    const dlg = $('#sheet-import');
    let passOnce = false;
    $('#file-import').addEventListener('click', (ev) => {
      if (passOnce) { passOnce = false; return; }
      ev.preventDefault();
      dlg.showModal();
      $('#import-title').focus();
    });
    $('#import-ok').addEventListener('click', () => { passOnce = true; dlg.close(); $('#file-import').click(); });
    $('#import-cancel').addEventListener('click', () => dlg.close());
  }
  // Importación atómica: se valida TODO en memoria; si algo falla no se toca ni localStorage ni IndexedDB.
  $('#file-import').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    try {
      let data;
      try { data = JSON.parse(await file.text()); }
      catch { throw new Error('El archivo no es un JSON válido'); }
      const { state: next, warnings, rejected } = Schema.normalize(Schema.migrate(data));
      next.consent = state.consent; // LEGAL-01: el consentimiento es de quien usa este dispositivo, no del respaldo
      // Las copias anteriores a las fotos no traen la clave `photos`: se conservan las actuales.
      // Si la trae con un formato que no es lista, normalizePhotos lanza y no se importa nada.
      let hasPhotos = data.photos !== undefined && data.photos !== null;
      const ph = hasPhotos ? Schema.normalizePhotos(data.photos) : { photos: [], warnings: [] };
      // Si el respaldo traía fotos y TODAS son inválidas, no se vacía la galería actual.
      const keepGallery = hasPhotos && data.photos.length > 0 && ph.photos.length === 0;
      if (keepGallery) hasPhotos = false;
      // LEGAL-01 D3: sin autorización de fotos no se escriben en IndexedDB (las actuales tampoco se tocan).
      const photosSkipped = hasPhotos && !photosAllowed() ? ph.photos.length : 0;
      if (photosSkipped) hasPhotos = false;
      const discarded = warnings.length + ph.warnings.length;
      if (discarded) console.warn('Importación: datos descartados o corregidos', [...warnings, ...ph.warnings]);
      const summary = `${next.entries.length} registros, ${Object.keys(next.foods).length} días de comidas` +
        (hasPhotos ? `, ${ph.photos.length} fotos` : '') +
        (discarded ? `. Se descartarán o corregirán ${discarded} datos no válidos` : '') +
        (rejected.profile ? `. El perfil no es válido (${rejected.reason}): se cargará en el formulario para que lo corrijas` : '') +
        (keepGallery ? '. Ninguna foto del respaldo es válida: se conservan las fotos actuales' : '') +
        (photosSkipped ? `. Las ${photosSkipped} fotos no se importarán porque no autorizaste fotos` : '');
      if (!confirm(`Se importarán ${summary}.\nEsto reemplazará los datos actuales. ¿Continuar?`)) return;

      const prevRaw = localStorage.getItem(STORAGE_KEY);
      // Si falla (p. ej. sin espacio) se lanza antes de tocar las fotos.
      try { persist(next, rejected.profile || null); } catch (err) { throw new Error(err.code === 'health-lock' ? err.message : isQuotaError(err) ? QUOTA_MSG : 'No se pudo guardar en este navegador'); }
      if (hasPhotos) {
        try { await Photos.importAll(ph.photos); }
        catch {
          // Deshace localStorage para que la importación sea todo o nada.
          if (prevRaw == null) localStorage.removeItem(STORAGE_KEY); else localStorage.setItem(STORAGE_KEY, prevRaw);
          savedJSON = prevRaw;
          throw new Error('No se pudieron guardar las fotos; no se cambió nada');
        }
      }
      state = next;
      pending = rejected.profile ? { profile: rejected.profile, reason: rejected.reason } : null;
      await loadPhotos();
      profileForm.reset();
      fillProfileForm();
      toast(discarded ? `Datos importados (${discarded} corregidos o descartados)` : 'Datos importados');
      render();
    } catch (err) {
      toast('No se importó. ' + (err.message || 'Archivo no válido'), true);
    } finally {
      ev.target.value = '';
    }
  });
  async function resetAll(ask = true) {
    if (ask && !confirm('¿Borrar todos los datos de este dispositivo (incluidas las fotos)? No se puede deshacer.')) return;
    // Se borran las claves (no se escribe un estado vacío): no depende de la cuota ni del bloqueo por versión.
    // Incluye las copias :backup/:corrupto y las marcas de copia de HU-01: también son datos personales.
    try {
      for (const k of [STORAGE_KEY, BACKUP_KEY, CORRUPT_KEY, LAST_BACKUP_KEY, BACKUP_SNOOZE_KEY, SOLO_KEY]) localStorage.removeItem(k);
      // Copias por versión de origen (:backup-v1, :backup-v3…) creadas al migrar (S2-4).
      for (const k of Object.keys(localStorage)) if (k.startsWith(BACKUP_KEY + '-v')) localStorage.removeItem(k);
    } catch {
      toast('No se pudieron borrar los datos de este navegador', true);
      return;
    }
    state = emptyState();
    pending = null;
    saveBlocked = false;
    savedJSON = null;
    let photosOk = true;
    try { await Photos.clear(); } catch { photosOk = false; }
    await loadPhotos();
    profileForm.reset();
    fillProfileForm();
    document.dispatchEvent(new CustomEvent('pg:data-reset')); // S3-2 O1: los datos del teléfono ya no tienen dueño
    if (photosOk) toast('Datos borrados');
    else toast('Se borraron los datos, pero no las fotos. Inténtalo de nuevo', true);
    render();
  }
  $('#btn-reset').addEventListener('click', () => resetAll(true));

  // ---------- Copia de un cliente (modo coach, solo lectura) ----------
  // Lee un respaldo JSON SOLO en memoria: no toca `state`, localStorage ni IndexedDB. Todo pasa por
  // Schema.normalize y esc(). Las fotos se muestran con object URLs que se liberan al cerrar o al abrir otra.
  const coachViewer = $('#coach-viewer');
  let coachUrls = [];
  let coachGen = 0;   // cambia al abrir otra o cerrar: corta la decodificación de fotos en curso
  const revokeCoachUrls = () => { coachUrls.forEach((u) => URL.revokeObjectURL(u)); coachUrls = []; };
  const setCoachError = (msg) => { const e = $('#coach-error'); e.textContent = msg; e.classList.toggle('hidden', !msg); };
  coachViewer.addEventListener('close', () => { coachGen++; revokeCoachUrls(); $('#coach-body').innerHTML = ''; setCoachError(''); });
  $('#coach-close').addEventListener('click', () => coachViewer.close());

  // Con el visor abierto el toast queda debajo del modal: el error se muestra dentro del visor (role="alert").
  function coachFail(msg) {
    if (coachViewer.open) setCoachError(`${msg}. Sigues viendo la copia anterior.`);
    else toast(msg, true);
  }

  // Decodifica las fotos de una en una, cediendo el hilo entre ellas para no congelar la UI con copias grandes.
  async function decodeCoachThumbs(list, gen) {
    const box = $('#coach-thumbs');
    for (const ph of list) {
      await new Promise((r) => setTimeout(r));
      if (gen !== coachGen) return;
      try {
        const url = URL.createObjectURL(Photos.decode(ph.data));
        coachUrls.push(url);
        box.insertAdjacentHTML('beforeend', `<figure class="thumb"><img src="${esc(url)}" alt="${esc(POSES[ph.pose])} del ${esc(fmtDate(ph.date))}" loading="lazy"><span>${esc(POSES[ph.pose])} · ${esc(fmtDate(ph.date))}</span></figure>`);
      } catch { /* foto ilegible: se omite */ }
    }
  }

  async function openCoachCopy(file) {
    let data;
    try { data = JSON.parse(await file.text()); }
    catch { coachFail(`No se pudo abrir «${file.name}». El archivo no es un JSON válido`); return; }
    let copy, photoList = [], photoNote = '';
    try { copy = Schema.normalize(Schema.migrate(data)); }
    catch (err) { coachFail(`No se pudo abrir «${file.name}». ${err.message}`); return; }
    try {
      photoList = Schema.normalizePhotos(data.photos).photos;
    } catch { photoNote = 'Las fotos de la copia no tienen un formato válido.'; }
    // Día de referencia: el de la exportación si viene en el archivo (el coach suele abrirlo al día siguiente),
    // pero nunca posterior a hoy (reloj del cliente adelantado).
    const exportedAt = typeof data.exportedAt === 'string' ? new Date(data.exportedAt) : null;
    const exported = exportedAt && !Number.isNaN(exportedAt.getTime()) ? toISO(exportedAt) : null;
    const ref = exported && exported < today() ? exported : today();
    const refLabel = !exported ? ' (hoy)' : exported > today() ? ' (hoy; la fecha de exportación es posterior)' : ' (fecha de exportación)';
    const r = Coach.summarize(copy.state, { today: ref });

    const gen = ++coachGen;
    revokeCoachUrls();
    setCoachError('');
    photoList.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
    const kg = (v) => (v == null ? '—' : fmt(v) + ' kg');
    const sign = (v, d = 1) => (v == null ? '—' : (v > 0 ? '+' : '') + fmt(v, d));
    const w = r.weight;
    const prot = (a) => (a.proteinAvg == null ? '—' : `${esc(a.proteinAvg)} g${r.target ? ' / ' + esc(r.target.protein) + ' g' : ''}`);
    $('#coach-title').textContent = r.name ? `Copia de ${r.name}` : 'Copia de cliente';
    $('#coach-file').textContent = `${file.name} · referencia ${fmtDate(r.reference)}${refLabel}`;
    const discarded = copy.warnings.length;
    $('#coach-body').innerHTML = `
      ${discarded ? `<p class="warn small">${esc(discarded)} datos no válidos de la copia se ignoraron.</p>` : ''}
      ${copy.rejected.profile ? `<p class="warn small">Perfil no válido: ${esc(copy.rejected.reason)}</p>` : ''}
      <p class="small">${r.range ? `Datos del ${esc(fmtDate(r.range.from))} al ${esc(fmtDate(r.range.to))} · ${esc(r.range.days)} ${r.range.days === 1 ? 'día' : 'días'} con algún registro` : 'La copia no tiene registros.'}</p>
      <div class="stats">
        <div class="stat"><span class="stat-label">Peso inicial</span><span class="stat-value">${esc(kg(w.start))}</span><span class="stat-sub">Meta ${esc(kg(w.goal))}</span></div>
        <div class="stat"><span class="stat-label">Peso actual</span><span class="stat-value">${esc(kg(w.current))}</span><span class="stat-sub">${esc(sign(w.change))} kg desde el inicio</span></div>
        <div class="stat"><span class="stat-label">Tendencia 7 días</span><span class="stat-value">${esc(kg(w.trend))}</span><span class="stat-sub">Ritmo ${esc(sign(w.weeklyRate, 2))} kg/sem${w.weeklyRatePct != null ? ' (' + esc(sign(w.weeklyRatePct, 2)) + ' %)' : ''}</span></div>
        <div class="stat"><span class="stat-label">% Grasa</span><span class="stat-value">${r.bodyFat ? esc(fmt(r.bodyFat.current)) + ' %' : '—'}</span><span class="stat-sub">${r.bodyFat && r.bodyFat.first !== r.bodyFat.current ? esc(sign(r.bodyFat.current - r.bodyFat.first)) + ' pts' : ''}</span></div>
      </div>
      <h3>Adherencia</h3>
      <div class="table-scroll" role="region" aria-label="Tabla de adherencia" tabindex="0">
      <table class="coach-table">
        <thead><tr><th>Últimos</th><th>Días activos</th><th>Comidas</th><th>Hábitos</th><th>Pesajes</th><th>Proteína media</th></tr></thead>
        <tbody>${r.adherence.map((a) => `<tr><td>${esc(a.days / 7)} sem</td><td>${esc(a.anyDays)}/${esc(a.days)}</td><td>${esc(a.foodDays)}</td><td>${esc(a.habitDays)}</td><td>${esc(a.weighIns)}</td><td>${prot(a)}</td></tr>`).join('')}</tbody>
      </table>
      </div>
      <p class="muted small">Proteína media de los días con comidas registradas, frente al objetivo calculado con su perfil.</p>
      <h3>Últimas notas</h3>
      ${r.notes.length ? `<ul class="coach-notes small">${r.notes.map((n) => `<li><strong>${esc(fmtDate(n.date))}</strong>: ${esc(n.note)}</li>`).join('')}</ul>` : '<p class="muted small">Sin notas.</p>'}
      <h3>Fotos</h3>
      ${photoNote ? `<p class="warn small">${esc(photoNote)}</p>` : ''}
      ${photoList.length ? '<div class="thumbs" id="coach-thumbs"></div>' : '<p class="muted small">La copia no trae fotos.</p>'}`;
    if (!coachViewer.open) coachViewer.showModal();
    coachViewer.scrollTop = 0;
    $('#coach-title').focus();   // el lector de pantalla anuncia primero de quién es la copia
    if (photoList.length) decodeCoachThumbs(photoList, gen);
  }
  for (const id of ['#file-coach', '#file-coach-other']) {
    $(id).addEventListener('change', async (ev) => {
      const file = ev.target.files[0];
      if (file) await openCoachCopy(file);
      ev.target.value = '';
    });
  }

  // ---------- Respaldo y almacenamiento (HU-01) ----------
  // Claves propias, fuera de `state`, para no depender del esquema de datos.
  const LAST_BACKUP_KEY = PGNS.key('lastBackup');
  const BACKUP_SNOOZE_KEY = PGNS.key('backupSnooze');
  const SNOOZE_DAYS = 3;
  const getPref = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const setPref = (k, v) => {
    try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* sin almacenamiento */ }
  };

  let syncCfg = null; // config.js y remote.js se cargan DESPUÉS de app.js: se lee en DOMContentLoaded
  let cloudSignedIn = false;
  let syncSt = { state: 'idle', lastOkAt: null };
  const cloudMode = () => window.CloudView
    ? CloudView.dataMode({ remoteOn: !!syncCfg, signedIn: cloudSignedIn, st: syncSt, healthOk: can('sensitiveHealth') })
    : { cloud: false, quietBackup: false };
  function renderBackup() {
    const last = getPref(LAST_BACKUP_KEY);
    const lastDate = last ? new Date(last) : null;
    const validLast = lastDate && !Number.isNaN(lastDate.getTime()) ? toISO(lastDate) : null;
    const hasData = state.entries.length > 0;
    const due = Calc.backupDue(validLast, getPref(BACKUP_SNOOZE_KEY), today(), hasData);
    const ago = validLast ? Calc.toDay(today()) - Calc.toDay(validLast) : null;
    const agoText = ago == null ? '' : ago <= 0 ? 'hoy' : ago === 1 ? 'ayer' : `hace ${ago} días`;

    setText($('#backup-status'), validLast
      ? `Última copia exportada: ${fmtDate(validLast)} (${agoText}).`
      : 'Aún no has exportado ninguna copia.');
    // El banner es una región viva: solo se toca si cambia, para que el lector no lo repita.
    setText($('#backup-banner-text'), validLast
      ? `Tu última copia de seguridad es de ${agoText}. Tus datos solo están en este dispositivo: exporta una copia para no perderlos.`
      : 'Aún no tienes copia de seguridad. Tus datos solo están en este dispositivo: exporta una copia para no perderlos.');
    const mode = cloudMode();
    const body = $('#backup-banner-body');
    const showBanner = due && !mode.quietBackup; // sync exitoso en las últimas 24 h con salud autorizada: el aviso no molesta
    if (body.classList.contains('hidden') === showBanner) body.classList.toggle('hidden', !showBanner);
    renderDataCard(mode);
  }
  // Perfil → Datos: con cuenta y sync funcionando se dice la verdad (nube + fotos solo aquí); si no, el texto de siempre.
  const DATA_LOCAL = 'Todo se guarda solo en este dispositivo. Exporta una copia para respaldarla o pasarla a otro dispositivo.';
  const DATA_CLOUD = PROD.coach ? 'Tus datos se guardan en este teléfono y también en tu cuenta. Tus fotos se guardan en tu cuenta solo si las autorizaste.'
    : 'Tus datos se guardan en este teléfono y también en tu cuenta. Las fotos, por ahora, solo se guardan en este teléfono.';
  function renderDataCard(mode) {
    setText($('#data-intro'), mode.cloud ? DATA_CLOUD : DATA_LOCAL);
    for (const id of ['#storage-status', '#backup-status']) $(id).classList.toggle('hidden', mode.cloud);
    $('#data-optional').classList.toggle('hidden', !mode.cloud);
  }
  function setText(el, txt) { if (el.textContent !== txt) el.textContent = txt; }

  // Foco a un lugar estable cuando el elemento enfocado desaparece.
  function focusSafe(el) {
    (el && el.offsetParent ? el : $('#panel-summary')).focus();
  }

  // Tras exportar no sabemos si el archivo se guardó (en iOS se puede cancelar):
  // se pregunta y solo con "Sí" se registra la copia.
  let confirmReturn = null;
  $('#btn-export').addEventListener('click', (ev) => {
    confirmReturn = ev.isTrusted ? ev.currentTarget : $('#btn-backup-now');
    $('#toast').classList.remove('show');
    $('#backup-confirm').classList.remove('hidden');
    $('#btn-backup-yes').focus();
  });
  function closeConfirm() {
    $('#backup-confirm').classList.add('hidden');
    const back = confirmReturn;
    confirmReturn = null;
    return back;
  }
  $('#btn-backup-yes').addEventListener('click', () => {
    setPref(LAST_BACKUP_KEY, new Date().toISOString());
    setPref(BACKUP_SNOOZE_KEY, null);
    const back = closeConfirm();
    renderBackup();
    focusSafe(back);
    toast('Copia registrada');
  });
  $('#btn-backup-no').addEventListener('click', () => {
    focusSafe(closeConfirm());
    toast('Copia no registrada');
  });
  $('#btn-backup-now').addEventListener('click', () => $('#btn-export').click());
  $('#btn-backup-later').addEventListener('click', () => {
    setPref(BACKUP_SNOOZE_KEY, Calc.addDays(today(), SNOOZE_DAYS));
    renderBackup();
    focusSafe(null);
    toast(`Te lo recordaremos en ${SNOOZE_DAYS} días`);
  });

  // Escape en la barra = "No".
  $('#backup-confirm').addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { ev.preventDefault(); $('#btn-backup-no').click(); }
  });

  // En iPhone la PWA se reanuda sin recargar. Solo se re-renderiza si cambió el día, para no
  // pisar lo que se estaba escribiendo (hábitos sin guardar). Las fechas que seguían en "hoy" pasan al nuevo día.
  let lastDay = today();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const now = today();
    if (now === lastDay) return;
    for (const input of [foodDate, entryForm.elements.date, photoForm.elements.date, habForm.elements.date, medForm.elements.date]) {
      if (input.value === lastDay) input.value = now;
    }
    lastDay = now;
    render();
  });

  async function checkStorage() {
    const el = $('#storage-status');
    let persisted = false;
    try {
      const st = navigator.storage;
      if (st && st.persisted) persisted = await st.persisted();
      if (!persisted && st && st.persist) persisted = await st.persist();
    } catch { persisted = false; }
    el.classList.toggle('ok', persisted);
    el.textContent = persisted
      ? 'Almacenamiento protegido: el navegador no borrará tus datos por falta de espacio.'
      : 'El navegador puede borrar tus datos: haz copias con regularidad.';
    try {
      const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
      if (est && est.usage != null) {
        const mb = est.usage / 1048576;
        el.textContent += ` Espacio usado: ${mb < 1 ? fmt(est.usage / 1024, 0) + ' KB' : fmt(mb) + ' MB'}.`;
      }
    } catch { /* estimación no disponible */ }
  }
  checkStorage();

  // ---------- LEGAL-01: consentimiento y privacidad ----------
  // El consentimiento vive en `state.consent` (schema v3) y se exporta con el respaldo, pero es de quien usa ESTE
  // dispositivo: al importar un respaldo se conserva el consentimiento actual (no se adopta el de otra persona).
  // Resumen de cambios que se muestra al pedir re-aceptación, por versión nueva (vacío = sin resumen).
  const LEGAL_CHANGES = { terms: {}, privacy: {} };

  // Control central de escritura de datos de salud: TODO pasa por persist() (formularios, copiar/repetir/deshacer
  // comidas, borrar registros o alimentos, importar). Sin autorización vigente de salud se rechaza cualquier cambio en
  // perfil, registros, comidas, hábitos o biblioteca; solo se permiten cambios del consentimiento y dejarlo todo vacío.
  const HEALTH_LOCK_MSG = 'Sin tu autorización de datos de salud no se guardan cambios en tu seguimiento';
  // S2-4: incluye ids/updatedAt (van dentro de cada registro) y las lápidas de salud (borrar también es un cambio).
  // La migración v3→v4 al cargar escribe directamente en load() (no es una escritura del usuario) y la base se
  // toma después, así que nunca queda bloqueada por este control.
  function healthPart(s) {
    const d = s.deleted || {};
    return JSON.stringify([s.profile || null, s.entries || [], s.foods || {}, s.habits || {}, s.library || {}, d.entries || [], d.foods || [], d.habits || []]);
  }
  function healthWriteBlocked(s) {
    const c = s.consent;
    if (Schema.consentStatus(c) === 'ok' && c.sensitiveHealth === true) return false;
    const empty = !s.profile && !(s.entries || []).length && ![s.foods, s.habits, s.library].some((d) => d && Object.keys(d).length);
    return !empty && healthPart(s) !== healthBaseline;
  }
  // Sprint 11 (soloNube): las fotos además exigen A6a vigente (guardar fotos en la nube), que se da desde la pestaña Fotos.
  function a6aGranted() {
    const m = window.PGAccount && PGAccount.meta();
    const c = m && m.consents && m.consents.photos_cloud;
    return !!(c && c.granted === true && c.version === CT.version('A6a'));
  }
  function photosAllowed() { const c = state.consent; return Schema.consentStatus(c) === 'ok' && c.photos === true && (!PROD.soloNube || a6aGranted()); }
  healthBaseline = healthPart(state);
  const consentForm = $('#form-consent');
  const REQUIRED = ['terms', 'privacy', 'adult'];
  const nowISO = () => new Date().toISOString();
  const fmtStamp = (iso) => (iso ? new Date(iso).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
  const consentOK = () => Schema.consentStatus(state.consent) === 'ok';
  const can = (k) => consentOK() && state.consent[k] === true;
  let consentShown = false;

  // Bloqueo de datos de salud: la misma tarjeta en cada vista de seguimiento.
  for (const v of ['panel', 'registro', 'comidas', 'fotos']) {
    $('#view-' + v).prepend($('#tpl-health-gate').content.cloneNode(true));
  }

  function renderConsent() {
    const status = Schema.consentStatus(state.consent);
    const open = status !== 'ok';
    document.body.classList.toggle('consent-open', open);
    $('#consent').classList.toggle('hidden', !open || PROD.soloNube);
    $('#solo').classList.toggle('hidden', !(open && PROD.soloNube));
    document.body.classList.toggle('no-health', !open && !can('sensitiveHealth'));
    document.body.classList.toggle('no-photos', !open && !photosAllowed());
    // Con datos de una versión más nueva no se puede guardar la aceptación: se ofrece la salida de "Borrar todo".
    $('#consent-blocked').classList.toggle('hidden', !(open && saveBlocked));
    if (open && !consentShown) {
      const upd = $('#consent-update');
      if (status === 'outdated') {
        const V = Schema.LEGAL_VERSIONS, c = state.consent;
        const parts = [];
        if (c.termsVersion !== V.terms) parts.push(`Términos y Condiciones (versión ${c.termsVersion} → ${V.terms})`);
        if (c.privacyVersion !== V.privacy) parts.push(`Política de Tratamiento de Datos (versión ${c.privacyVersion} → ${V.privacy})`);
        const notes = [LEGAL_CHANGES.terms[V.terms], LEGAL_CHANGES.privacy[V.privacy]].filter(Boolean);
        upd.textContent = `Actualizamos ${parts.join(' y ')}. ` + (notes.length ? 'Cambios: ' + notes.join(' ') + ' ' : 'Revisa los textos completos. ') +
          'Tus datos siguen guardados; para seguir usando la app, vuelve a aceptar.';
      }
      upd.classList.toggle('hidden', status !== 'outdated');
      consentForm.reset();
      // Re-aceptación (decisión SM, Ley 1581: autorización expresa): TODAS las casillas vuelven sin marcar; solo se
      // recuerda lo que la persona había autorizado antes, para que lo marque de nuevo si sigue de acuerdo.
      const prev = status === 'outdated' ? Schema.normalizeConsent(state.consent) : null;
      const had = ['sensitiveHealth', 'photos'].filter((k) => prev && prev[k]);
      for (const k of ['sensitiveHealth', 'photos']) $('#prev-' + k).classList.toggle('hidden', !had.includes(k));
      if (had.length) {
        const names = had.map((k) => (k === 'photos' ? 'fotos de progreso' : 'datos de salud'));
        upd.textContent += ` Antes autorizaste: ${names.join(' y ')}; márcalo de nuevo si sigues de acuerdo.`;
      }
      updateConsentButton();
      if (PROD.soloNube) { fillSolo(); $('#form-solo').reset(); updateSoloButton(); $('#solo-title').focus(); }
      else $('#consent-title').focus();
    }
    consentShown = open;
    renderPrivacy();
  }

  // ---- Sprint 11: UNA pantalla de aceptación (soloNube). Mismos eventos que exige el servidor, registrados por account.js al entrar. ----
  const SOLO_KEY = PGNS.key('solo');   // { at, habits }: lo que se marcó en la pantalla, hasta que la persona entre con su correo
  function fillLinks(el, links) {
    el.replaceChildren(...links.map((l) => {
      const a = document.createElement('a');
      a.className = 'legal-link'; a.href = l.href; a.setAttribute('data-legal', ''); a.textContent = l.label;
      return a;
    }));
  }
  function fillSolo() {
    const V = Schema.LEGAL_VERSIONS;
    $('#solo-a1-text').textContent = CT.fill(CT.get('A1').body, {});
    $('#solo-a2-text').textContent = CT.fill(CT.get('A2').body, { legalVersion: V.terms === V.privacy ? V.terms : `${V.terms} / ${V.privacy}` });
    fillLinks($('#solo-a2-links'), CT.get('A2').links);
    $('#solo-au-text').textContent = CT.fill(CT.get('AU').body, {});
    fillLinks($('#solo-au-links'), CT.get('AU').links);
  }
  const soloForm = $('#form-solo');
  function updateSoloButton() {
    const el = soloForm.elements;
    const ok = el.adult.checked && el.terms.checked && el.unica.checked;
    $('#btn-solo').disabled = !ok;
    $('#solo-hint').textContent = ok ? 'Listo: pulsa Continuar.' : 'Marca las tres casillas obligatorias para continuar.';
  }
  soloForm.addEventListener('change', updateSoloButton);
  soloForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const el = soloForm.elements;
    if (!(el.adult.checked && el.terms.checked && el.unica.checked)) { updateSoloButton(); return; }
    const at = nowISO();
    let c;
    // La autorización única cubre los datos de seguimiento (equivale a «datos de salud» local); las fotos se autorizan aparte, en Fotos.
    try { c = Schema.buildConsent({ terms: true, privacy: true, adult: true, sensitiveHealth: true, photos: false }, at); } catch { updateSoloButton(); return; }
    const prev = state.consent;
    state.consent = c;
    if (!save()) { state.consent = prev; return; }
    setPref(SOLO_KEY, JSON.stringify({ at, habits: el.habits.checked }));
    render();
    loadPhotos();
    toast('Aceptación guardada');
    document.dispatchEvent(new CustomEvent('pg:legal-accepted'));
  });

  function updateConsentButton() {
    const el = consentForm.elements;
    const ok = REQUIRED.every((k) => el[k].checked);
    $('#btn-consent').disabled = !ok;
    $('#consent-hint').textContent = ok ? 'Listo: pulsa Continuar.' : 'Marca las casillas obligatorias para continuar.';
  }
  consentForm.addEventListener('change', updateConsentButton);
  $('#btn-consent-reset').addEventListener('click', () => $('#btn-reset').click());
  $('#btn-consent-reload').addEventListener('click', () => location.reload());
  consentForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const el = consentForm.elements;
    let c;
    try {
      c = Schema.buildConsent({ terms: el.terms.checked, privacy: el.privacy.checked, adult: el.adult.checked, sensitiveHealth: el.sensitiveHealth.checked, photos: el.photos.checked }, nowISO());
    } catch { updateConsentButton(); return; }
    const prev = state.consent;
    state.consent = c;
    if (!save()) { state.consent = prev; return; }
    render();
    if (!state.profile) show('perfil');
    loadPhotos();
    ($('.tabbar button.on') || $('#tab-panel')).focus();
    // Si al arrancar hubo un aviso de carga (datos corregidos, perfil a revisar…), se repite: quedó tras la pantalla legal.
    toast(loadNotice || 'Aceptación guardada');
    loadNotice = '';
    // S3-2: punto de integración con la cuenta (account.js): tras la pantalla legal se ofrece crear cuenta o entrar.
    document.dispatchEvent(new CustomEvent('pg:legal-accepted'));
  });

  function renderPrivacy() {
    const c = consentOK() ? state.consent : null;
    const dl = $('#privacy-list');
    const rows = c ? [
      ['Términos', `Versión ${c.termsVersion}, aceptados el ${fmtStamp(c.acceptedAt)}`],
      ['Política', `Versión ${c.privacyVersion}, aceptada el ${fmtStamp(c.acceptedAt)}`],
      ['Mayor de 18', 'Declarado'],
      ['Datos de salud', `${c.sensitiveHealth ? 'Autorizado' : 'No autorizado'} (desde el ${fmtStamp(c.sensitiveHealthAt || c.acceptedAt)})`],
      ['Fotos', `${c.photos ? 'Autorizado' : 'No autorizado'} (desde el ${fmtStamp(c.photosAt || c.acceptedAt)})`],
    ] : [['Estado', 'Sin aceptar']];
    const html = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
    if (dl.innerHTML !== html) dl.innerHTML = html;
    $('#btn-toggle-health').textContent = c && c.sensitiveHealth ? 'Retirar autorización de datos de salud' : 'Autorizar datos de salud';
    $('#btn-toggle-photos').textContent = c && c.photos ? 'Retirar autorización de fotos' : 'Autorizar fotos';
  }

  const GRANT_TEXT = {
    sensitiveHealth: 'Autorizo de forma expresa el tratamiento de mis datos sensibles de salud (peso, medidas, % de grasa, comidas, hábitos). Sé que es facultativo.\n\n¿Confirmas la autorización?',
    photos: 'Autorizo el tratamiento de mis fotos de progreso (dato sensible, opcional).\n\n¿Confirmas la autorización?',
  };
  function setFlag(key, value) {
    if (!consentOK()) return false;
    const prev = state.consent;
    state.consent = Schema.setConsentFlag(prev, key, value, nowISO());
    if (!save()) { state.consent = prev; return false; }
    render();
    return true;
  }
  async function grant(key) {
    // Sprint 11 (soloNube): autorizar fotos = A6a (guardarlas en la nube), con su texto exacto en pantalla; sin el «confirm» de siempre.
    if (key === 'photos' && PROD.soloNube && window.PGAccount && PGAccount.grantPhotosCloud) {
      if (!(await PGAccount.grantPhotosCloud())) { toast('No pudimos guardar tu autorización. Revisa tu internet', true); return; }
      if (!consentOK()) return;
      if (!can('photos') && !setFlag('photos', true)) return;
      await loadPhotos(); render();
      toast('Fotos autorizadas');
      return;
    }
    if (!confirm(GRANT_TEXT[key])) return;
    if (!setFlag(key, true)) return;
    if (key === 'photos') loadPhotos();
    toast(key === 'photos' ? 'Fotos autorizadas' : 'Datos de salud autorizados');
  }
  async function revoke(key) {
    if (key === 'sensitiveHealth') {
      if (!confirm('Si retiras la autorización de tus datos de salud, no podrás usar el seguimiento (peso, medidas, comidas y hábitos).\n\nTus datos seguirán en este dispositivo hasta que los borres: te recomendamos exportar una copia y, si quieres, usar «Borrar todo».\n\n¿Retirar la autorización?')) return;
      if (setFlag(key, false)) toast('Autorización retirada. Puedes exportar tus datos o borrarlos');
      return;
    }
    if (!confirm('¿Retirar la autorización de fotos? La pestaña Fotos quedará bloqueada y no se podrán subir fotos.')) return;
    if (!setFlag(key, false)) return;
    if (photos.length && confirm(`¿Borrar también las ${photos.length} fotos guardadas en este dispositivo? No se puede deshacer.`)) {
      try { await Photos.clear(); toast('Autorización retirada y fotos borradas'); }
      catch { toast('No se pudieron borrar las fotos', true); }
      await loadPhotos();
      render();
    } else {
      await loadPhotos(); // deja de tenerlas cargadas en memoria
      toast('Autorización de fotos retirada');
    }
  }
  $('#btn-toggle-health').addEventListener('click', () => (can('sensitiveHealth') ? revoke('sensitiveHealth') : grant('sensitiveHealth')));
  $('#btn-toggle-photos').addEventListener('click', () => (can('photos') ? revoke('photos') : grant('photos')));
  $('#btn-withdraw-legal').addEventListener('click', () => {
    if (!confirm('La app no puede usarse sin aceptar los Términos y la Política. Para retirarlos hay que borrar todos los datos de este dispositivo (exporta antes una copia si la quieres).\n\n¿Continuar?')) return;
    $('#btn-reset').click();
  });
  document.addEventListener('click', (ev) => {
    const g = ev.target.closest('[data-consent-grant]');
    if (g) { grant(g.dataset.consentGrant); return; }
    const a = ev.target.closest('[data-gate-action]');
    if (a) $(a.dataset.gateAction === 'export' ? '#btn-export' : '#btn-reset').click();
  });

  // Ningún formulario de datos se guarda sin las autorizaciones que necesita (defensa además del bloqueo visual).
  const HEALTH_FORMS = ['form-profile', 'form-entry', 'form-food', 'form-habits', 'form-habitos', 'form-medidas'];
  document.addEventListener('submit', (ev) => {
    const id = ev.target.id;
    if (id === 'form-consent' || id === 'form-solo') return;
    const blocked = !consentOK() ? 'Acepta los Términos y la Política para continuar'
      : isPaused() && [...HEALTH_FORMS, 'form-photo'].includes(id) ? 'Tu acceso está en pausa: habla con tu coach'   // Sprint 11: nada nuevo mientras esté en pausa
      : HEALTH_FORMS.includes(id) && !can('sensitiveHealth') ? 'Autoriza tus datos de salud para registrar tu seguimiento'
        : id === 'form-photo' && !photosAllowed() ? 'Autoriza tus fotos para poder subirlas' : '';
    if (!blocked) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    toast(blocked, true);
  }, true);

  // Textos legales dentro de la app (sin perder lo marcado); funcionan sin conexión (están en la caché del SW).
  const legalDialog = $('#legal-dialog');
  let legalReturn = null;
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest('a[data-legal]');
    if (!a || typeof legalDialog.showModal !== 'function') return;
    ev.preventDefault();
    legalReturn = a;
    const title = /privacidad/.test(a.getAttribute('href')) ? 'Política de Tratamiento de Datos' : 'Términos y Condiciones';
    $('#legal-dialog-title').textContent = title;
    $('#legal-frame').title = title;
    $('#legal-frame').src = a.getAttribute('href');
    legalDialog.showModal();
    $('#legal-close').focus();
  });
  $('#legal-close').addEventListener('click', () => legalDialog.close());
  legalDialog.addEventListener('close', () => { if (legalReturn) legalReturn.focus(); legalReturn = null; });

  // ---------- Sprint 11: hábitos, medidas, Inicio del cliente y acceso en pausa (producto 'coach') ----------
  // Todo esto solo se ve con producto 'coach' (clase en <body>); en la app oficial las vistas nuevas no tienen botón en la barra.
  const acct = () => (window.PGAccount ? PGAccount.meta() : null) || null;
  const myLinkNow = () => { const m = acct(); return m && m.link && !(m.roles || []).includes('coach') ? m.link : null; };
  // Estado del pago del cliente con coach. Un vínculo guardado por una versión anterior (sin la clave paidUntil) no pausa a nadie hasta que se refresque.
  const payNow = () => { const l = myLinkNow(); return l && 'paidUntil' in l ? Pagos.status(l, Pagos.todayBogota()) : null; };
  function isPaused() { const st = payNow(); return PROD.coach && !!st && !st.paid; }
  const barHTML = (items) => items.map((i) => `<div class="habit${i.done ? ' done' : ''}"><span>${esc(i.label)}</span><b>${esc(i.text)}</b><div class="bar" role="progressbar" aria-label="${esc(i.label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(i.pct)}"><i style="width:${Math.round(i.pct)}%"></i></div></div>`).join('');

  // --- Hábitos ---
  const habForm = $('#form-habitos');
  habForm.elements.date.value = today();
  function fillHabForm() {
    const el = habForm.elements;
    const h = state.habits[el.date.value] || {};
    el.water.value = h.water != null ? Math.round(h.water / Habitos.GLASS_L) : '';
    el.steps.value = h.steps != null ? h.steps : '';
    el.sleep.value = h.sleep != null ? h.sleep : '';
    el.trained.checked = !!h.trained;
  }
  habForm.elements.date.addEventListener('change', fillHabForm);
  habForm.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-step]');
    if (!b) return;
    const input = habForm.elements.water;
    input.value = Math.max(0, Math.min(40, (Number(input.value) || 0) + Number(b.dataset.dir)));
  });
  habForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const el = habForm.elements, d = el.date.value;
    if (!Schema.isISODate(d)) { toast('Elige el día'); return; }
    const n = (k) => (el[k].value === '' ? undefined : Number(el[k].value));
    const glasses = n('water'), steps = n('steps'), sleep = n('sleep');
    if ((glasses != null && !(glasses >= 0 && glasses <= 40)) || (steps != null && !(steps >= 0 && steps <= 100000)) || (sleep != null && !(sleep >= 0 && sleep <= 24))) { toast('Revisa los números: algo está fuera de rango'); return; }
    if (glasses == null && steps == null && sleep == null && !el.trained.checked) { toast('Anota al menos un hábito'); return; }
    state.habits[d] = { steps, water: glasses == null ? undefined : glasses * Habitos.GLASS_L, sleep, trained: el.trained.checked };
    if (!save()) return;
    toast('Hábitos guardados');
    render();
  });
  function renderHabitos() {
    const w = Habitos.week(state, today());
    $('#habitos-week').innerHTML = barHTML(w.items.map((i) => ({ ...i, done: i.days === i.of })));
    setText($('#habitos-week-line'), w.line);
    setText($('#habitos-goal'), `Meta del día: ${Habitos.GLASSES_GOAL} vasos, ${Habitos.STEPS_GOAL.toLocaleString('es')} pasos y ${Habitos.SLEEP_GOAL} h de sueño.`);
    if (!habForm.contains(document.activeElement)) fillHabForm();
  }

  // Etapa 2: «Hoy entrené» en Mi rutina marca el mismo hábito «Entrené» del día (con el acceso en pausa no se guarda nada nuevo).
  document.addEventListener('pg:rutina-trained', () => {
    if (isPaused()) { toast('Tu acceso está en pausa: por ahora solo puedes ver tu rutina'); return; }
    const d = today();
    state.habits[d] = { ...(state.habits[d] || {}), trained: true };
    if (!save()) return;
    toast('Anotamos que hoy entrenaste');
    render();
    document.dispatchEvent(new CustomEvent('pg:rutina-trained-done'));
  });

  // --- Medidas ---
  const medForm = $('#form-medidas');
  medForm.elements.date.value = today();
  let medKey = 'waist';
  $('#medidas-pick').innerHTML = Medidas.MEASURES.map((m) => `<button type="button" data-med="${m.key}" aria-pressed="false">${esc(m.label)}</button>`).join('');
  $('#medidas-pick').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-med]');
    if (!b) return;
    medKey = b.dataset.med;
    renderMedChart();
  });
  medForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const el = medForm.elements, d = el.date.value;
    const err = $('#medidas-error');
    const fail = (msg, field) => { err.textContent = msg; err.classList.remove('hidden'); if (field) field.focus(); };
    if (!Schema.isISODate(d)) { fail('Elige la fecha.', el.date); return; }
    const vals = {};
    for (const m of Medidas.MEASURES) {
      const raw = String(el[m.key].value).replace(',', '.').trim();
      if (raw === '') continue;
      const v = Number(raw), [lo, hi] = Schema.RANGES[m.key];
      if (!Number.isFinite(v) || v < lo || v > hi) { fail(`Revisa «${m.label}»: debe estar entre ${lo} y ${hi} ${m.unit}.`, el[m.key]); return; }
      vals[m.key] = v;
    }
    // Peso, abdomen y cadera son obligatorios en los registros NUEVOS (si ese día ya los tiene, no se vuelven a exigir; el historial importado queda exento).
    const prior = state.entries.find((e) => e.date === d);
    const falta = Medidas.missing(vals, prior);
    if (falta.length) { fail(Medidas.missingText(falta), el[falta[0].key]); return; }
    err.classList.add('hidden');
    const existing = state.entries.find((e) => e.date === d);
    if (existing) Object.assign(existing, vals); else state.entries.push({ id: uid(), date: d, ...vals });
    if (!save()) return;
    for (const m of Medidas.MEASURES) el[m.key].value = '';
    el.date.value = today();
    toast(existing ? 'Medidas actualizadas' : 'Medidas guardadas');
    render();
  });
  $('#medidas-history').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-del-med]');
    if (!b || isPaused()) return;
    if (!confirm('¿Eliminar este registro de medidas?')) return;
    state.entries = state.entries.filter((e) => e.id !== b.dataset.delMed);
    if (save()) render();
  });
  function medChartSVG(key) {
    const label = Medidas.labelOf(key), unit = Medidas.unitOf(key);
    const c = Medidas.chart(Medidas.series(state.entries, key), { w: 320, h: 150 });
    if (!c) return `<p class="muted small">Aún no hay medidas de «${esc(label)}». Anota la primera arriba.</p>`;
    const first = c.pts[0], last = c.pts[c.pts.length - 1];
    const val = (p, anchor) => `<text x="${p.x}" y="${Math.max(11, p.y - 9)}" text-anchor="${anchor}">${esc(Medidas.fmt(p.value))}</text>`;
    return `<svg viewBox="0 0 ${c.w} ${c.h}" role="img" aria-label="${esc(Medidas.chartLabel(label, c, unit))}" focusable="false">
      <line class="axis" x1="10" y1="${c.h - 20}" x2="${c.w - 10}" y2="${c.h - 20}"/>
      ${c.d ? `<path class="line" d="${c.d}"/>` : ''}${c.pts.map((p) => `<circle class="dot" cx="${p.x}" cy="${p.y}" r="4"/>`).join('')}
      ${val(first, c.pts.length > 1 ? 'start' : 'middle')}${c.pts.length > 1 ? val(last, 'end') : ''}
      <text x="10" y="${c.h - 5}" text-anchor="start">${esc(fmtDate(first.date))}</text>${c.pts.length > 1 ? `<text x="${c.w - 10}" y="${c.h - 5}" text-anchor="end">${esc(fmtDate(last.date))}</text>` : ''}</svg>`;
  }
  function renderMedChart() {
    $$('#medidas-pick button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.med === medKey)));
    $$('#medidas-pick button').forEach((b) => b.classList.toggle('on', b.dataset.med === medKey));
    $('#medidas-chart').innerHTML = medChartSVG(medKey);
    const row = Medidas.summary(state.entries).find((r) => r.key === medKey);
    setText($('#medidas-chart-sub'), row.count ? `${row.label}: inicio ${row.startText} ${row.unit} · hoy ${row.todayText} ${row.unit}${row.change == null ? '' : ` · cambio ${row.changeText} ${row.unit}`}` : '');
  }
  window.PGMedTable = (rows) => `<table class="med-table"><thead><tr><th scope="col">Medida</th><th scope="col">Inicio</th><th scope="col">Hoy</th><th scope="col">Cambio</th></tr></thead><tbody>${rows.map((r) =>
    `<tr><th scope="row">${esc(r.label)}</th><td>${esc(r.startText)}</td><td>${esc(r.todayText)}</td><td class="${r.dir === 'down' ? 'dn' : ''}">${esc(r.changeText)}</td></tr>`).join('')}</tbody></table>`;
  function renderMedidas() {
    renderMedChart();
    $('#medidas-table').innerHTML = PGMedTable(Medidas.summary(state.entries));
    const list = state.entries.filter((e) => Medidas.KEYS.some((k) => e[k] != null)).sort((a, b) => b.date.localeCompare(a.date));
    $('#medidas-empty').classList.toggle('hidden', list.length > 0);
    $('#medidas-history').innerHTML = list.map((e) => `<li><span><strong>${esc(fmtDate(e.date))}</strong><br><span class="small muted">${Medidas.MEASURES.filter((m) => e[m.key] != null).map((m) => `${esc(m.label)} ${esc(Medidas.fmt(e[m.key]))}${m.unit === 'kg' ? ' kg' : ''}`).join(' · ')}</span></span>
      <button type="button" class="icon-btn" data-del-med="${esc(e.id)}" aria-label="Eliminar las medidas del ${esc(fmtDate(e.date))}">✕</button></li>`).join('');
    // Lo último que anotó, como pista en cada casilla.
    for (const r of Medidas.summary(state.entries)) medForm.elements[r.key].placeholder = r.count ? `Última: ${r.todayText}` : '';
  }

  // --- Inicio del cliente (modo coach): próximo pago, hábitos de hoy y atajos ---
  function renderHomeCoach() {
    if (!PROD.coach) return;
    const st = payNow();
    const cd = $('#pay-countdown');
    const c = st && !isPaused() ? Pagos.clientCountdown(st) : null;
    cd.classList.toggle('hidden', !c);
    cd.classList.toggle('soon', !!(c && c.soon));
    setText(cd, c ? c.text : '');
    const day = Habitos.day(state, today());
    $('#hc-habits').innerHTML = barHTML(day.items);
    setText($('#hc-habits-sub'), day.logged ? 'Hoy' : 'Aún sin registrar');
    const last = Medidas.summary(state.entries).filter((r) => r.count).sort((a, b) => b.lastDate.localeCompare(a.lastDate))[0];
    setText($('#hc-med-text'), last ? `Última medida: ${fmtDate(last.lastDate)} · ${last.label} ${last.todayText} ${last.unit}` : 'Aún no registras medidas.');
    const m = acct();
    const name = (m && m.displayName) || (m && m.email ? m.email.split('@')[0] : '');
    setText($('#home-greeting'), name ? `Hola, ${name.charAt(0).toUpperCase() + name.slice(1)}` : 'Hola');
  }


  // --- Etapa 2: Mis comidas (producto 'coach') ---
  // Usa el MISMO registro de siempre (`state.foods`, su guardado y su sincronización); solo cambia cómo se elige y se ve.
  // Cada comida del catálogo (platos.js) guarda además su plato, su porción y la hora (campos opcionales del registro).
  const mcDate = $('#mc-date');
  mcDate.value = today();
  const capFirst = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const longDay = (d) => capFirst(new Date(d + 'T12:00:00').toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', ''));
  const nowHM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const mealByHour = (h) => (h < 10 ? 'Desayuno' : h < 15 ? 'Almuerzo' : h < 18 ? 'Snack' : 'Cena');
  const plural1 = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  // Compartir las comidas con el coach es OBLIGATORIO en este producto: hasta confirmarlo (Más → Mi coach) no se agrega nada.
  function shareGate() {
    if (!PROD.coach || navCoach) return false;
    const l = myLinkNow();
    return !!l && !(l.shares && l.shares.nutrition === true);
  }
  const mcBlock = () => (isPaused() ? 'Tu acceso está en pausa: habla con tu coach' : shareGate() ? 'Antes confirma lo que compartes con tu coach (Más → Mi coach)'
    : !consentOK() ? 'Acepta los Términos y la Política para continuar' : !can('sensitiveHealth') ? 'Autoriza tus datos de salud para registrar tu seguimiento' : '');

  function renderComidasCoach() {
    if (!PROD.coach) return;
    const client = !navCoach;
    const gate = shareGate(), paused = isPaused();
    $('#li-micomidas').classList.toggle('hidden', !client);
    $('#home-comidas').classList.toggle('hidden', !client);
    if (!client) return;
    // Inicio
    const t = Platos.dayTotal(state.foods, today());
    setText($('#hm-kcal'), Platos.n0(t.kcal));
    setText($('#hm-sub'), t.count ? 'Hoy' : 'Aún sin registrar');
    setText($('#hm-text'), gate ? 'Para usar tus comidas, confirma lo que compartes con tu coach.' : t.count ? `${plural1(t.count, 'comida registrada', 'comidas registradas')} hoy. Calorías aproximadas.` : 'Aún no registras comidas hoy. Las calorías son aproximadas.');
    $('#btn-hm-add').classList.toggle('hidden', gate || paused);
    $('#btn-hm-see').classList.toggle('hidden', gate);
    $('#btn-hm-gate').classList.toggle('hidden', !gate);
    // Pantalla Mis comidas
    $('#mc-gate').classList.toggle('hidden', !gate);
    $('#mc-main').classList.toggle('hidden', gate);
    if (gate) return;
    const day = Schema.isISODate(mcDate.value) ? mcDate.value : today();
    const isToday = day === today();
    const tot = Platos.dayTotal(state.foods, day);
    setText($('#mc-day-title'), (isToday ? 'Hoy, ' : '') + longDay(day));
    setText($('#mc-kcal'), Platos.n0(tot.kcal));
    $('#mc-next').disabled = day >= today();
    const prev = Schema.addDays(day, -1);
    const canRepeat = !paused && (state.foods[prev] || []).length > 0;
    $('#btn-mc-repeat').classList.toggle('hidden', !canRepeat);
    setText($('#btn-mc-repeat'), isToday ? 'Repetir la de ayer' : 'Repetir el día anterior');
    const list = state.foods[day] || [];
    const html = Schema.MEALS.map((m) => {
      const xs = list.filter((x) => x.meal === m).sort((a, b) => String(a.time || '99').localeCompare(String(b.time || '99')));
      if (!xs.length) return '';
      const sum = xs.reduce((n, x) => n + x.kcal, 0);
      return `<div class="mc-meal"><div class="mc-meal-head"><strong>${esc(m)}</strong><span class="muted">${Platos.n0(sum)} kcal</span></div><ul class="mc-items">${xs.map((x) => {
        const p = x.dish ? Platos.portionOf(x.portion) : null;
        const sub = [p ? p.label : '', x.time || ''].filter(Boolean).join(' · ');
        return `<li class="mc-item"><div class="mc-line"><span class="mc-t"><strong>${esc(x.name)}</strong>${sub ? `<small>${esc(sub)}</small>` : ''}</span><b class="mc-k">${Platos.n0(x.kcal)} kcal</b></div>
          <div class="mc-actions"><button type="button" class="btn-link" data-mc-edit="${esc(x.id)}" aria-label="Editar: ${esc(x.name)}">Editar</button><button type="button" class="btn-link" data-mc-del="${esc(x.id)}" aria-label="Borrar: ${esc(x.name)}">Borrar</button></div></li>`;
      }).join('')}</ul></div>`;
    }).join('');
    $('#mc-list').innerHTML = html || '<p class="muted">Nada registrado este día.</p>' + (isToday && !paused ? '<p class="small muted">Toca «Agregar comida» para anotar la primera.</p>' : '');
  }
  const mcGoToday = () => { mcDate.value = today(); };
  mcDate.addEventListener('change', () => { if (!Schema.isISODate(mcDate.value) || mcDate.value > today()) mcGoToday(); render(); });
  $('#mc-prev').addEventListener('click', () => { mcDate.value = Schema.addDays(mcDate.value || today(), -1); render(); });
  $('#mc-next').addEventListener('click', () => { const n = Schema.addDays(mcDate.value || today(), 1); mcDate.value = n > today() ? today() : n; render(); });
  $('#row-micomidas').addEventListener('click', mcGoToday);
  $('#btn-hm-see').addEventListener('click', mcGoToday);
  $('#btn-mc-repeat').addEventListener('click', () => {
    const blocked = mcBlock();
    if (blocked) { toast(blocked, true); return; }
    const day = mcDate.value || today();
    repeatMeals(Schema.addDays(day, -1), day);
    $('#mc-list-title').focus();
  });
  // Borrar (con «Deshacer») y editar
  $('#mc-list').addEventListener('click', (ev) => {
    const del = ev.target.closest('[data-mc-del]'), ed = ev.target.closest('[data-mc-edit]');
    if (!del && !ed) return;
    const blocked = mcBlock();
    if (blocked) { toast(blocked, true); return; }
    const id = (del || ed).dataset.mcDel || (del || ed).dataset.mcEdit;
    const day = mcDate.value || today();
    const item = (state.foods[day] || []).find((x) => x.id === id);
    if (!item) return;
    if (ed) { openComida({ edit: item, day, opener: ed }); return; }
    state.foods[day] = state.foods[day].filter((x) => x.id !== id);
    if (!state.foods[day].length) delete state.foods[day];
    if (!save()) return;
    render();
    $('#mc-list-title').focus();
    toast(`Se borró «${item.name}»`, { label: 'Deshacer', run: () => {
      (state.foods[day] ||= []).push({ ...item, id: uid() });
      if (save()) { render(); toast('Comida recuperada'); }
    } });
  });

  // Hoja para agregar o editar
  const sheetC = $('#sheet-comida'), formC = $('#form-comida');
  let scCat = 'todas', scSt = null, scOpener = null;
  const scCats = [{ key: 'todas', label: 'Todos' }, ...Platos.CATEGORIES];
  const scShow = (step) => { $('#sc-pick').classList.toggle('hidden', step !== 'pick'); formC.classList.toggle('hidden', step !== 'form'); };
  function scRenderCats() {
    $('#sc-cats').innerHTML = scCats.map((c) => `<button type="button" data-cat="${esc(c.key)}" aria-pressed="${c.key === scCat}">${esc(c.label)}</button>`).join('');
  }
  const scItemHTML = (d) => `<li><button type="button" class="sc-item" data-dish="${esc(d.id)}"><span class="sc-t"><strong>${esc(d.name)}</strong><small>${esc(d.portion)}</small></span><b>${Platos.n0(d.kcal)} kcal</b></button></li>`;
  const SC_MAX = 60;
  function scRenderList() {
    const q = $('#sc-q').value;
    const rec = !q.trim() && scCat === 'todas' ? Platos.recents(state.foods, 6) : [];
    $('#sc-recent-title').classList.toggle('hidden', !rec.length);
    $('#sc-recent').classList.toggle('hidden', !rec.length);
    $('#sc-recent').innerHTML = rec.map(scItemHTML).join('');
    const res = Platos.search(q, { category: scCat });
    const cat = Platos.categoryOf(scCat);
    setText($('#sc-res-title'), q.trim() ? (res.length ? plural1(res.length, 'resultado', 'resultados') : 'No encontramos ese plato') : cat ? cat.label : 'Todos los platos');
    $('#sc-results').innerHTML = res.slice(0, SC_MAX).map(scItemHTML).join('') + (res.length > SC_MAX ? `<li class="small muted">Hay ${res.length - SC_MAX} más: escribe un poco más para encontrarlos.</li>` : '')
      + (!res.length ? '<li class="small muted">Prueba con otra palabra o toca «Escribir otra comida».</li>' : '');
  }
  function scPortionsHTML(d, selected) {
    return Platos.PORTIONS.map((p) => {
      const v = Platos.scale(d, p.key);
      return `<label class="sc-portion"><input type="radio" name="portion" value="${p.key}"${p.key === selected ? ' checked' : ''}><span class="sc-pl">${esc(p.label)}</span><span class="sc-pk">${Platos.n0(v.kcal)} kcal</span></label>`;
    }).join('');
  }
  function scUpdateTotal() {
    if (!scSt || scSt.mode !== 'dish') { setText($('#sc-total'), ''); return; }
    const v = Platos.scale(scSt.dish, formC.elements.portion.value || 'normal');
    setText($('#sc-total'), `Total: ${Platos.n0(v.kcal)} kcal aproximadas`);
  }
  formC.addEventListener('change', (ev) => { if (ev.target.name === 'portion') scUpdateTotal(); });
  function scOpenForm({ dish, edit, day }) {
    const free = !dish;
    scSt = { mode: free ? 'free' : 'dish', dish: dish || null, edit: edit || null, day };
    const f = formC.elements;
    $('#sc-error').classList.add('hidden');
    $('#sc-free').classList.toggle('hidden', !free);
    $('#sc-portions').classList.toggle('hidden', free);
    setText($('#sc-step2-title'), free ? (edit ? 'Editar comida' : 'Escribir otra comida') : dish.name);
    setText($('#sc-dish-sub'), free ? 'Escribe lo que comiste y sus calorías aproximadas.' : `Porción normal: ${dish.portion} · ${Platos.n0(dish.kcal)} kcal aprox.`);
    if (!free) $('#sc-portions').innerHTML = '<legend>¿Cuánto comiste?</legend>' + scPortionsHTML(dish, (edit && edit.portion) || 'normal');
    f.name.value = free && edit ? edit.name : '';
    f.kcal.value = free && edit ? String(edit.kcal) : '';
    f.meal.value = edit ? edit.meal : free ? mealByHour(new Date().getHours()) : (Platos.categoryOf(dish.category) || {}).meal || 'Snack';
    f.date.value = day; f.date.max = today();
    f.time.value = edit ? edit.time || '' : day === today() ? nowHM() : '';
    setText($('#sc-save'), edit ? 'Guardar cambios' : 'Agregar');
    setText($('#sc-back'), edit ? 'Cancelar' : 'Volver a la lista');
    scUpdateTotal();
    scShow('form');
    $('#sc-step2-title').focus();
  }
  function openComida({ edit, day, opener } = {}) {
    scOpener = opener || document.activeElement;
    day = day || (mcDate.value && Schema.isISODate(mcDate.value) ? mcDate.value : today());
    scSt = { day };
    setText($('#sc-title'), edit ? 'Editar comida' : 'Agregar comida');
    if (edit) {
      sheetC.showModal();
      scOpenForm({ dish: edit.dish ? Platos.byId(edit.dish) : null, edit, day });
      return;
    }
    $('#sc-q').value = ''; scCat = 'todas'; scRenderCats(); scRenderList(); scShow('pick');
    sheetC.showModal();
    $('#sc-title').focus();
  }
  $('#sc-q').addEventListener('input', scRenderList);
  $('#sc-cats').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-cat]');
    if (!b) return;
    scCat = b.dataset.cat; scRenderCats(); scRenderList();
    $(`#sc-cats [data-cat="${scCat}"]`).focus();
  });
  $('#sheet-comida').addEventListener('click', (ev) => {
    const it = ev.target.closest('[data-dish]');
    if (it) { scOpenForm({ dish: Platos.byId(it.dataset.dish), day: scSt.day }); return; }
    if (ev.target === sheetC) sheetC.close(); // toque en el fondo
  });
  $('#sc-free-open').addEventListener('click', () => scOpenForm({ dish: null, day: scSt.day }));
  $('#sc-close').addEventListener('click', () => sheetC.close());
  $('#sc-back').addEventListener('click', () => {
    if (scSt && scSt.edit) { sheetC.close(); return; }
    scShow('pick'); $('#sc-title').focus();
  });
  sheetC.addEventListener('close', () => { const o = scOpener; scOpener = null; if (o && o.isConnected && !o.disabled) { try { o.focus(); } catch { /* sin foco */ } } });
  formC.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const f = formC.elements, errBox = $('#sc-error');
    const fail = (msg, el) => { setText(errBox, msg); errBox.classList.remove('hidden'); if (el) el.focus(); };
    const blocked = mcBlock();
    if (blocked) { fail(blocked); return; }
    const date = f.date.value;
    if (!Schema.isISODate(date)) { fail('Elige el día.', f.date); return; }
    if (date > today()) { fail('Ese día todavía no llega: elige hoy o un día anterior.', f.date); return; }
    const meal = f.meal.value, time = /^\d{2}:\d{2}$/.test(f.time.value) ? f.time.value : '';
    let fields;
    if (scSt.mode === 'dish') {
      fields = Platos.toFood(scSt.dish, f.portion.value || 'normal', { meal, time: time || undefined });
    } else {
      const name = f.name.value.trim();
      const raw = String(f.kcal.value).replace(',', '.').trim();
      const kcal = Number(raw);
      if (!name) { fail('Escribe qué comiste.', f.name); return; }
      if (raw === '' || !Number.isFinite(kcal) || kcal < 0 || kcal > 5000) { fail('Escribe las calorías aproximadas, entre 0 y 5.000.', f.kcal); return; }
      fields = { name, meal, kcal: Math.round(kcal) };
      if (time) fields.time = time;
    }
    if (scSt.edit) {
      const old = scSt.edit;
      const from = Object.keys(state.foods).find((d) => (state.foods[d] || []).some((x) => x.id === old.id));
      const item = from ? state.foods[from].find((x) => x.id === old.id) : null;
      if (!item) { sheetC.close(); render(); return; }
      delete item.time;
      Object.assign(item, scSt.mode === 'dish' ? fields : { name: fields.name, meal: fields.meal, kcal: fields.kcal, ...(fields.time ? { time: fields.time } : {}) });
      if (from !== date) {
        state.foods[from] = state.foods[from].filter((x) => x.id !== item.id);
        if (!state.foods[from].length) delete state.foods[from];
        (state.foods[date] ||= []).push(item);
      }
    } else {
      const item = { id: uid(), protein: 0, carbs: 0, fat: 0, ...fields };
      (state.foods[date] ||= []).push(item);
    }
    if (!save()) return;
    sheetC.close();
    scOpener = null;
    mcDate.value = date;
    render();
    toast(scSt.edit ? 'Comida actualizada' : 'Comida agregada');
    $('#mc-list-title').focus();
  });
  // Atajos: «Agregar comida» en Inicio y en la pantalla Mis comidas
  $('#btn-hm-add').addEventListener('click', () => {
    const blocked = mcBlock();
    if (blocked) { toast(blocked, true); return; }
    mcGoToday();
    show('micomidas');
    openComida({ day: today(), opener: $('#btn-mc-add') });
  });
  $('#btn-mc-add').addEventListener('click', () => {
    const blocked = mcBlock();
    if (blocked) { toast(blocked, true); return; }
    openComida({ opener: $('#btn-mc-add') });
  });

  // --- Acceso en pausa (M4) ---
  function renderPaused() {
    const paused = isPaused();
    document.body.classList.toggle('paused', paused);
    $('#pause-card').classList.toggle('hidden', !paused);
    if (!paused) return;
    const l = myLinkNow(), st = payNow();
    const who = l.businessName ? `tu coach, ${l.businessName},` : 'tu coach';
    setText($('#pause-text'), `${st.key === 'overdue' ? `Tu pago venció el ${Pagos.dayText(st.paidUntil)}. ` : ''}Habla con ${who} para reactivarlo. Cuando te confirme el pago, la app vuelve a funcionar sola.`);
  }
  async function checkPayment(manual) {
    if (!window.PGAccount || !PGAccount.refreshLink) return;
    const was = isPaused();
    if (manual) setText($('#pause-status'), 'Comprobando…');
    try { await PGAccount.refreshLink(); } catch { if (manual) setText($('#pause-status'), 'No pudimos comprobarlo. Revisa tu internet.'); return; }
    render();
    if (was && !isPaused()) { toast('Listo: tu acceso volvió'); scheduleSync(0); }
    else if (manual && isPaused()) setText($('#pause-status'), 'Todavía no aparece tu pago. Tu coach debe marcarlo en su lista.');
    else if (manual) setText($('#pause-status'), '');
  }
  $('#btn-pause-check').addEventListener('click', () => checkPayment(true));
  $('#btn-pause-see').addEventListener('click', () => { show('medidas'); $('#medidas-title').focus(); });
  $('#btn-pause-download').addEventListener('click', () => $('#btn-export').click());
  $('#btn-pause-delete').addEventListener('click', () => $('#btn-account-delete').click());
  document.addEventListener('pg:link-changed', () => render());
  document.addEventListener('pg:account-ready', () => render());
  document.addEventListener('pg:payment-required', () => checkPayment(false));
  // Mientras está en pausa se vuelve a mirar sola cada minuto y al volver a la app: cuando el coach marque el pago, se reactiva.
  setInterval(() => { if (isPaused() && document.visibilityState === 'visible') checkPayment(false); }, 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && PROD.coach && myLinkNow()) checkPayment(false); });

  // ---------- Render ----------
  function render() {
    renderConsent();
    $('#today-label').textContent = new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
    renderPanel();
    renderProfileIssue();
    renderBackup();
    renderEntries();
    renderFoods();
    renderPlan();
    renderPhotos();
    renderMas();
    renderHabitos();
    renderMedidas();
    renderHomeCoach();
    renderComidasCoach();
    renderPaused();
  }

  entryForm.elements.date.value = today();
  photoForm.elements.date.value = today();
  loadPhotos();
  fillProfileForm();
  render();
  if (!state.profile && !PROD.coach) show('perfil');   // Sprint 11: en el modo coach no se pide perfil (ni peso ni plan)
  // El perfil a revisar ya se anuncia en #profile-issue (role=alert): no se repite en el toast (Obs. QA S1-1).
  if (pending && !state.profile) loadNotice = '';
  if (loadNotice) toast(loadNotice);

  // ---------- S3-3b: sincronización con la cuenta (contrato R1 §5) ----------
  // Sin servidor configurado (config.js vacío) no se hace NADA: la app sigue idéntica, solo en este dispositivo.
  // Disparadores: al abrir, al volver a la app, 2 s después de guardar, al recuperar la conexión, cada 5 min visible y
  // el botón "Sincronizar ahora". Nunca sincroniza sin autorización de datos de salud ni con datos de otra cuenta.
  const SYNC_META_KEY = PGNS.key('sync');
  const ACCOUNT_KEY = PGNS.key('account');
  const OWNER_KEY = PGNS.key('owner');
  const COMMENTS_KEY = PGNS.key('comments');
  const PRE_SYNC_KEY = PGNS.key('backup-pre-sync');
  let syncRemote = null;
  const readJSON = (k) => { try { return JSON.parse(getPref(k) || 'null'); } catch { return null; } };
  const hasLocalData = () => !!(state.profile || state.entries.length || [state.foods, state.habits, state.library].some((d) => d && Object.keys(d).length));
  const syncStore = {
    getState: () => state,
    // §5.3 regla crítica: lo recibido se guarda SIN stampChanges (no se re-sella como edición nueva).
    saveMerged(merged) {
      const json = JSON.stringify({ ...merged, profile: merged.profile || (pending && pending.profile) || null, schemaVersion: Schema.CURRENT_VERSION });
      localStorage.setItem(STORAGE_KEY, json);
      savedJSON = json;
      state = merged;
      healthBaseline = healthPart(merged);
      if (!profileForm.contains(document.activeElement)) fillProfileForm();
      render();
    },
    getMeta: () => readJSON(SYNC_META_KEY) || {},
    setMeta: (m) => setPref(SYNC_META_KEY, JSON.stringify(m)),
    // Sprint 6 (A3 + A4): la copia en la nube solo corre si la cuenta tiene vigentes las dos autorizaciones (account.js las guarda).
    cloudAllowed: () => !window.ConsentTexts || ConsentTexts.cloudAllowed(readJSON(ACCOUNT_KEY)),
    healthAllowed: () => !saveBlocked && can('sensitiveHealth'),
    ownerId: () => getPref(OWNER_KEY),
    // Sprint 6: A6a/A6b se registran como consentimiento. La SUBIDA de fotos a la nube sigue APAGADA en la app oficial.
    // Sprint 11: solo con producto 'coach' (copia de pruebas) y con A6a vigente (photoCloudOn). La visibilidad para el coach, además, exige A6b y marcar cada foto.
    photosCloudAllowed: () => PROD.coach && photoCloudOn(),
    photos: {
      async list() { return (await Photos.all()).map(({ blob, ...meta }) => meta); },
      async getBlob(id) { const p = await Photos.get(id); return p ? p.blob : null; },
      // Fotos recibidas: se baja el archivo con URL firmada (solo si es nueva en este teléfono) y se guardan los metadatos.
      async applyRemote({ upserts = [], deletes = [] }) {
        for (const r of upserts) {
          const mine = await Photos.get(r.id);
          let blob = mine && mine.blob;
          if (!blob) {
            try { blob = await syncRemote.sync.downloadPhoto(r.storagePath); }
            catch (e) { if (e && e.code === 'not_found') continue; throw e; }   // otro error: el ciclo se repite con el mismo cursor
          }
          await Photos.put({ ...(mine || {}), id: r.id, date: r.date, pose: r.pose, width: r.width, height: r.height,
            createdAt: Number.isFinite(Date.parse(r.createdAt)) ? Date.parse(r.createdAt) : Date.now(), updatedAt: r.updatedAt, sharedWithCoach: r.sharedWithCoach === true, blob });
        }
        for (const d of deletes) await Photos.remove(d.id);
        await loadPhotos();
      },
    },
    saveComments(list) {
      const byId = new Map((readJSON(COMMENTS_KEY) || []).map((c) => [c.id, c]));
      for (const c of list) if (c && c.id) byId.set(c.id, c);
      setPref(COMMENTS_KEY, JSON.stringify([...byId.values()]));
    },
  };

  function showSync(stateName) {
    const el = $('#sync-status');
    if (!el) return;
    const txt = stateName ? CloudView.syncText(syncSt) : '';
    el.classList.toggle('hidden', !stateName);
    el.dataset.state = stateName || '';
    if (el.textContent !== txt) el.textContent = txt; // la región viva solo cambia si cambia el texto
    $('#btn-sync-now').classList.toggle('hidden', !stateName || stateName === 'running' || stateName === 'nocloud' || stateName === 'consent' || stateName === 'paused');
    renderBackup();
  }

  function scheduleSync(delay = 2000) {
    if (!syncEngine) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncNow(), delay);
  }

  // Sesión guardada (sin red). Si cambia la cuenta, los metadatos de sincronización empiezan de cero para esa cuenta.
  async function syncSession() {
    const s = syncRemote ? await syncRemote.auth.session().catch(() => null) : null;
    if (!s) return null;
    const meta = syncStore.getMeta();
    if (meta.userId !== s.user.id) syncStore.setMeta({ userId: s.user.id, deviceId: meta.deviceId || Schema.uuid(), cursor: null, pushedUpTo: null });
    return s;
  }

  async function syncNow() {
    if (!syncEngine || !syncRemote) return null;
    const s = await syncSession();
    cloudSignedIn = !!s;
    if (!s) { syncSt = { state: 'idle', lastOkAt: null }; showSync(null); return null; }
    // §5.6: sin dueño y sin datos locales es seguro adoptar la cuenta; con datos, lo confirma el usuario (confirmOwner).
    if (!getPref(OWNER_KEY) && !hasLocalData()) setPref(OWNER_KEY, s.user.id);
    if (syncEngine.isRunning()) return null;
    syncSt = { ...syncSt, state: 'syncing' };
    showSync('running');
    const go = () => syncEngine.run();
    let r = null;
    try {
      r = navigator.locks && navigator.locks.request
        ? await navigator.locks.request('pg-sync', { ifAvailable: true }, (lock) => (lock ? go() : null))
        : await go();
    } catch { r = null; }
    if (!r) { const st = syncEngine.status(); if (st.state === 'idle') showSync(null); else onSyncStatus(st); } // otra pestaña sincronizaba
    return r;
  }

  function onSyncStatus(st) {
    if (st.state === 'idle') return;
    syncSt = { state: st.state, lastOkAt: st.lastOkAt || null };
    showSync(CloudView.stateKey(st));
    if (st.state === 'consent') document.dispatchEvent(new CustomEvent('pg:consent-required')); // account.js envía lo pendiente y reintenta
    if (st.state === 'paused') document.dispatchEvent(new CustomEvent('pg:payment-required'));  // Sprint 11: el servidor dice «payment_required»: se vuelve a mirar el vínculo
    if (st.nextRetryAt && (st.state === 'offline' || st.state === 'error')) scheduleSync(Math.max(1000, Date.parse(st.nextRetryAt) - Date.now()));
  }

  // §5.6 "¿Estos datos son tuyos?": la UI de la cuenta lo llama al confirmar. Copia de seguridad previa (como el export).
  async function confirmOwner() {
    const s = await syncSession();
    if (!s) return false;
    if (hasLocalData() && savedJSON && getPref(PRE_SYNC_KEY) == null) setPref(PRE_SYNC_KEY, savedJSON);
    setPref(OWNER_KEY, s.user.id);
    scheduleSync(0);
    return true;
  }

  function waitFakeBackend(ms = 10000) {
    return new Promise((resolve, reject) => {
      const t0 = Date.now();
      (function poll() {
        if (window.__pgFakeBackend) resolve(window.__pgFakeBackend);
        else if (Date.now() - t0 > ms) reject(new Error('Servidor simulado no disponible'));
        else setTimeout(poll, 50);
      })();
    });
  }
  async function startSync() {
    // En pruebas (mode fake) se comparte el backend simulado que crea account.js; en real, el cliente supabase-js.
    syncRemote = syncCfg.mode === 'fake'
      ? Remote.createFake({ backend: await waitFakeBackend(), storage: localStorage })
      : Remote.create({ url: syncCfg.url, key: syncCfg.key, app: 'grasa', storage: localStorage });
    syncEngine = Sync.createSync({ remote: syncRemote, store: syncStore, onStatus: onSyncStatus });
    window.PGSync = { run: syncNow, confirmOwner, status: () => syncEngine.status() };
    if (syncRemote.auth.onChange) syncRemote.auth.onChange((e) => { if (e.event === 'signed_in') scheduleSync(0); if (e.event === 'signed_out') { cloudSignedIn = false; syncSt = { state: 'idle', lastOkAt: null }; showSync(null); } });
    $('#btn-sync-now').addEventListener('click', () => syncNow());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleSync(0); });
    window.addEventListener('online', () => scheduleSync(0));
    document.addEventListener('pg:signed-in', () => scheduleSync(0));
    document.addEventListener('pg:cloud-changed', () => scheduleSync(0)); // Sprint 6: se activó o retiró la copia en la nube
    document.addEventListener('pg:account-changed', (ev) => { cloudSignedIn = !!(ev.detail && ev.detail.signedIn); if (!cloudSignedIn) syncSt = { state: 'idle', lastOkAt: null }; renderBackup(); });
    setInterval(() => { if (document.visibilityState === 'visible') scheduleSync(0); }, 5 * 60 * 1000);
    syncNow();
  }
  function initSync() {
    syncCfg = window.Remote && window.Sync ? Remote.config() : null;
    if (syncCfg) { document.body.classList.add('has-remote'); renderMas(); }
    if (!syncCfg && PROD.soloNube) { Producto.apply({ soloNube: false }); render(); } // «solo con cuenta» no tiene sentido sin servidor: vuelve el modo local
    if (syncCfg) $('#coach-copy-card').classList.add('hidden'); // con servidor, el coach usa la pestaña Clientes
    if (syncCfg) startSync().catch((err) => console.warn('Sincronización no disponible:', err && err.message));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initSync);
  else initSync();

  // Copia de pruebas (env 'pruebas'): banner fijo y visible; en producción no existe.
  if (PGNS.isTest) {
    const banner = document.createElement('div');
    banner.id = 'env-banner';
    banner.className = 'env-banner';
    banner.setAttribute('role', 'note');
    banner.setAttribute('data-testid', 'env-banner');
    banner.textContent = 'VERSIÓN DE PRUEBAS — no uses datos reales';
    document.body.prepend(banner);
    document.body.classList.add('has-env-banner');
  }

  // Diagnóstico de pantalla: muestra las medidas del navegador para entender por qué una barra fija queda mal puesta.
  // Se activa con ?diag=1 en el enlace o tocando 5 veces el círculo de arriba de «Más» (sirve en la app instalada); se apaga igual.
  const DIAG_KEY = PGNS.key('diag');
  const diagStored = () => { try { return localStorage.getItem(DIAG_KEY) === '1'; } catch { return false; } };
  const diagStore = (on) => { try { if (on) localStorage.setItem(DIAG_KEY, '1'); else localStorage.removeItem(DIAG_KEY); } catch { /* sin espacio */ } };
  let diagBox = null, diagTimer = 0;
  function diagDraw() {
    if (!diagBox) return;
    const vv = window.visualViewport, bar = document.querySelector('.tabbar'), r = bar ? bar.getBoundingClientRect() : null;
    const standalone = navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
    diagBox.textContent = [
      `inner ${innerWidth}x${innerHeight}  client ${document.documentElement.clientHeight}  screen ${screen.height}`,
      vv ? `vv h${Math.round(vv.height)} top${Math.round(vv.offsetTop)} esc${vv.scale.toFixed(2)}` : 'sin visualViewport',
      `scrollY ${Math.round(scrollY)}  standalone ${standalone}`,
      r ? `barra top${Math.round(r.top)} bottom${Math.round(r.bottom)} alto${Math.round(r.height)}` : 'sin barra',
      `safe-bottom ${getComputedStyle(document.body).paddingBottom}`,
    ].join('\n');
  }
  function diagShow(on) {
    if (on && !diagBox) {
      diagBox = document.createElement('pre');
      diagBox.style.cssText = 'position:fixed;left:4px;top:calc(env(safe-area-inset-top) + 4px);z-index:99999;margin:0;padding:6px 8px;font:11px/1.3 ui-monospace,Menlo,monospace;background:rgba(0,0,0,.82);color:#7CFC9A;border-radius:8px;pointer-events:none;max-width:92vw;white-space:pre-wrap';
      document.body.appendChild(diagBox);
      diagTimer = setInterval(diagDraw, 1000);
      diagDraw();
    } else if (!on && diagBox) { clearInterval(diagTimer); diagBox.remove(); diagBox = null; }
  }
  ['scroll', 'resize', 'touchend', 'focusout'].forEach((ev) => addEventListener(ev, () => setTimeout(diagDraw, 50), { passive: true }));
  if (window.visualViewport) { visualViewport.addEventListener('resize', diagDraw); visualViewport.addEventListener('scroll', diagDraw); }
  diagShow(/[?&]diag=1\b/.test(location.search) || diagStored());
  { // cinco toques seguidos (en menos de 4 s) en el círculo de «Más» encienden o apagan el diagnóstico
    let taps = 0, first = 0;
    const av = document.getElementById('more-avatar');
    if (av) av.addEventListener('click', () => {
      const now = Date.now();
      if (now - first > 4000) { taps = 0; first = now; }
      if (++taps >= 5) { taps = 0; const on = !diagBox; diagStore(on); diagShow(on); toast(on ? 'Diagnóstico de pantalla activado' : 'Diagnóstico de pantalla apagado'); }
    });
  }

  // iPhone/iPad: tras el teclado, un zoom o volver desde otra app, la barra fija puede quedar a mitad de pantalla.
  // Un empujón de 1 px al desplazamiento hace que Safari vuelva a calcular la posición de las barras fijas.
  (() => {
    const vv = window.visualViewport;
    let t = 0;
    const resync = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        if (vv && (vv.scale > 1.01 || vv.height < window.innerHeight - 1)) return;   // zoom o teclado abierto: no tocar
        const y = window.scrollY;
        window.scrollTo(window.scrollX, y + 1);
        window.scrollTo(window.scrollX, y);
      }, 150);
    };
    document.addEventListener('focusout', resync);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) resync(); });
    window.addEventListener('pageshow', resync);
    if (vv) vv.addEventListener('resize', resync);
  })();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
