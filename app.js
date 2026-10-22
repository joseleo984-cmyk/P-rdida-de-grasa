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
  function show(view) {
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + view));
    $$('.tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.view === view));
    window.scrollTo({ top: 0 });
    render();
  }
  $$('.tabbar button').forEach((b) => b.addEventListener('click', () => show(b.dataset.view)));
  document.addEventListener('click', (ev) => {
    const go = ev.target.closest('[data-goto]');
    if (go) show(go.dataset.goto);
  });

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

  function fillProfileForm() {
    const p = state.profile || (pending && pending.profile);
    const el = profileForm.elements;
    if (!p) {
      el.startDate.value = today();
      el.rate.value = '0.005';
      return;
    }
    for (const k of Object.keys(p)) if (el[k]) el[k].value = p[k];
    if (!el.startDate.value) el.startDate.value = today();
  }
  function renderProfileIssue() {
    const box = $('#profile-issue');
    const msg = !state.profile && pending ? `Revisa tu perfil: ${pending.reason}. Corrige los datos y pulsa Guardar.` : '';
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
      await Photos.put(photo);
      photos.push(photo);
      comparePose = photo.pose;
      photoForm.elements.file.value = '';
      toast('Foto guardada');
      renderPhotos(true);
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
    $('#viewer-caption').textContent = `${fmtDate(viewing.date)} · ${POSES[viewing.pose]}${w ? ' · ' + fmt(w.weight) + ' kg' : ''}`;
    viewer.showModal();
  });
  $('#viewer-close').addEventListener('click', () => viewer.close());
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
    } catch {
      toast('No se pudo eliminar la foto');
    }
  });

  function renderPhotos(resetSelection = false) {
    $$('#compare-pose button').forEach((b) => b.classList.toggle('on', b.dataset.pose === comparePose));
    renderCompare(resetSelection);

    const byDate = {};
    for (const p of sortedPhotos().reverse()) (byDate[p.date] ||= []).push(p);
    const dates = Object.keys(byDate);
    $('#gallery').innerHTML = dates.length ? dates.map((d) => {
      const w = weightNear(d);
      return `<div class="photo-day">
        <div class="meal-head"><strong>${fmtDate(d)}</strong><span class="muted">${w ? fmt(w.weight) + ' kg' : ''}</span></div>
        <div class="thumbs">${byDate[d].map((p) => `
          <button class="thumb" data-photo="${esc(p.id)}" aria-label="Ver foto ${esc(POSES[p.pose])} del ${esc(fmtDate(d))}">
            <img src="${esc(photoUrl(p))}" alt="" loading="lazy"><span>${esc(POSES[p.pose])}</span>
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
    const wa = weightNear(a.date), wb = weightNear(b.date);
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
    drawChart(entries);
    renderTips(rate, w);
  }

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
  $('#btn-reset').addEventListener('click', async () => {
    if (!confirm('¿Borrar todos los datos de este dispositivo (incluidas las fotos)? No se puede deshacer.')) return;
    // Se borran las claves (no se escribe un estado vacío): no depende de la cuota ni del bloqueo por versión.
    // Incluye las copias :backup/:corrupto y las marcas de copia de HU-01: también son datos personales.
    try {
      for (const k of [STORAGE_KEY, BACKUP_KEY, CORRUPT_KEY, LAST_BACKUP_KEY, BACKUP_SNOOZE_KEY]) localStorage.removeItem(k);
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
  });

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
  const DATA_CLOUD = 'Tus datos se guardan en este teléfono y también en tu cuenta. Las fotos, por ahora, solo se guardan en este teléfono.';
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
    for (const input of [foodDate, entryForm.elements.date, photoForm.elements.date]) {
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
  function photosAllowed() { const c = state.consent; return Schema.consentStatus(c) === 'ok' && c.photos === true; }
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
    $('#consent').classList.toggle('hidden', !open);
    document.body.classList.toggle('no-health', !open && !can('sensitiveHealth'));
    document.body.classList.toggle('no-photos', !open && !can('photos'));
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
      $('#consent-title').focus();
    }
    consentShown = open;
    renderPrivacy();
  }

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
  function grant(key) {
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
  const HEALTH_FORMS = ['form-profile', 'form-entry', 'form-food', 'form-habits'];
  document.addEventListener('submit', (ev) => {
    const id = ev.target.id;
    if (id === 'form-consent') return;
    const blocked = !consentOK() ? 'Acepta los Términos y la Política para continuar'
      : HEALTH_FORMS.includes(id) && !can('sensitiveHealth') ? 'Autoriza tus datos de salud para registrar tu seguimiento'
        : id === 'form-photo' && !can('photos') ? 'Autoriza tus fotos para poder subirlas' : '';
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
  }

  entryForm.elements.date.value = today();
  photoForm.elements.date.value = today();
  loadPhotos();
  fillProfileForm();
  render();
  if (!state.profile) show('perfil');
  // El perfil a revisar ya se anuncia en #profile-issue (role=alert): no se repite en el toast (Obs. QA S1-1).
  if (pending && !state.profile) loadNotice = '';
  if (loadNotice) toast(loadNotice);

  // ---------- S3-3b: sincronización con la cuenta (contrato R1 §5) ----------
  // Sin servidor configurado (config.js vacío) no se hace NADA: la app sigue idéntica, solo en este dispositivo.
  // Disparadores: al abrir, al volver a la app, 2 s después de guardar, al recuperar la conexión, cada 5 min visible y
  // el botón "Sincronizar ahora". Nunca sincroniza sin autorización de datos de salud ni con datos de otra cuenta.
  const SYNC_META_KEY = PGNS.key('sync');
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
    healthAllowed: () => !saveBlocked && can('sensitiveHealth'),
    ownerId: () => getPref(OWNER_KEY),
    photosCloudAllowed: () => false, // S3-5: aún no existe la autorización "copia de fotos en la nube" → fotos solo locales
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
    $('#btn-sync-now').classList.toggle('hidden', !stateName || stateName === 'running');
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
    document.addEventListener('pg:account-changed', (ev) => { cloudSignedIn = !!(ev.detail && ev.detail.signedIn); if (!cloudSignedIn) syncSt = { state: 'idle', lastOkAt: null }; renderBackup(); });
    setInterval(() => { if (document.visibilityState === 'visible') scheduleSync(0); }, 5 * 60 * 1000);
    syncNow();
  }
  function initSync() {
    syncCfg = window.Remote && window.Sync ? Remote.config() : null;
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

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
