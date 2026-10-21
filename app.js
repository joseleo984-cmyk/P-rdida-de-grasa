(function () {
  'use strict';

  // La clave conserva el nombre histórico ":v1"; la versión real va dentro del dato (`schemaVersion`).
  const STORAGE_KEY = 'perdida-grasa:v1';
  const BACKUP_KEY = 'perdida-grasa:backup';      // copia del dato crudo antes de migrarlo o corregirlo
  const CORRUPT_KEY = 'perdida-grasa:corrupto';   // dato ilegible que no se pudo cargar
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const fmt = (n, d = 1) => (n == null || Number.isNaN(n) ? '—' : Number(n).toLocaleString('es', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const today = () => toISO(new Date());
  const uid = () => Math.random().toString(36).slice(2, 10);

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
  let state = load();
  let chartRange = 30;

  // Migra y normaliza lo guardado. Si está dañado, la app arranca igualmente y el dato crudo se conserva.
  function load() {
    let raw;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch { return emptyState(); }
    if (!raw) return emptyState();
    try {
      const parsed = JSON.parse(raw);
      const { state: s, warnings } = Schema.normalize(Schema.migrate(parsed));
      if (warnings.length || parsed.schemaVersion !== Schema.CURRENT_VERSION) {
        try { localStorage.setItem(BACKUP_KEY, raw); } catch { /* sin espacio: seguimos */ }
      }
      if (warnings.length) {
        loadNotice = `Se corrigieron ${warnings.length} datos dañados (copia en "${BACKUP_KEY}")`;
        console.warn('Datos corregidos al cargar:', warnings);
      }
      return s;
    } catch (err) {
      try { localStorage.setItem(CORRUPT_KEY, raw); } catch { /* sin espacio: seguimos */ }
      // Datos de una versión más nueva: no se sobrescriben desde esta versión antigua.
      saveBlocked = /más nueva/.test(err.message);
      loadNotice = saveBlocked
        ? 'Tus datos son de una versión más nueva de la app: recarga para actualizar'
        : `No se pudieron leer los datos guardados (copia en "${CORRUPT_KEY}")`;
      console.error('Datos guardados ilegibles:', err);
      return emptyState();
    }
  }
  // Lanza si no se puede escribir (lo usa la importación para ser atómica).
  function persist(s) {
    if (saveBlocked) throw new Error('Guardado bloqueado');
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...s, schemaVersion: Schema.CURRENT_VERSION }));
  }
  function save() {
    try { persist(state); }
    catch { toast(saveBlocked ? loadNotice : 'No se pudo guardar en este navegador'); }
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
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
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
    save();
    toast('Perfil guardado');
    render();
  });

  function fillProfileForm() {
    const p = state.profile;
    const el = profileForm.elements;
    if (!p) {
      el.startDate.value = today();
      el.rate.value = '0.005';
      return;
    }
    for (const k of Object.keys(p)) if (el[k]) el[k].value = p[k];
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
    save();
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
    save();
    render();
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
    const d = foodDate.value || today();
    (state.foods[d] ||= []).push(item);
    state.library[item.name.toLowerCase()] = { name: item.name, kcal: item.kcal, protein: item.protein, carbs: item.carbs, fat: item.fat };
    save();
    const meal = foodForm.elements.meal.value;
    foodForm.reset();
    foodForm.elements.meal.value = meal;
    toast('Alimento agregado');
    render();
  });

  $('#food-list').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-del-food]');
    if (!btn) return;
    const d = foodDate.value;
    state.foods[d] = (state.foods[d] || []).filter((x) => x.id !== btn.dataset.delFood);
    if (!state.foods[d].length) delete state.foods[d];
    save();
    render();
  });

  const habitsForm = $('#form-habits');
  habitsForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const f = new FormData(habitsForm);
    const n = (k) => (f.get(k) === '' ? undefined : Number(f.get(k)));
    state.habits[foodDate.value || today()] = { steps: n('steps'), water: n('water'), sleep: n('sleep'), trained: f.get('trained') === 'on' };
    save();
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
    const meals = ['Desayuno', 'Almuerzo', 'Cena', 'Snack'];
    $('#food-list').innerHTML = list.length ? meals.map((m) => {
      const xs = list.filter((x) => x.meal === m);
      if (!xs.length) return '';
      const sum = xs.reduce((s, x) => s + x.kcal, 0);
      return `<div class="meal"><div class="meal-head"><strong>${m}</strong><span class="muted">${Math.round(sum)} kcal</span></div>
        ${xs.map((x) => `<div class="food-row"><span>${esc(x.name)}</span><span class="muted small">${esc(x.kcal)} kcal · P${fmt(x.protein, 0)} C${fmt(x.carbs, 0)} G${fmt(x.fat, 0)}</span><button class="icon-btn" data-del-food="${esc(x.id)}" aria-label="Eliminar">✕</button></div>`).join('')}
      </div>`;
    }).join('') : '<p class="muted small">Nada registrado este día.</p>';

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
      photos = await Photos.all();
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
      const photo = { id: uid(), date: photoForm.elements.date.value, pose: photoForm.elements.pose.value, blob, width, height, createdAt: Date.now() };
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
    download(`perdida-grasa-${today()}.json`, JSON.stringify({ ...state, schemaVersion: Schema.CURRENT_VERSION, exportedAt: new Date().toISOString(), photos: photoData }, null, 2), 'application/json');
  });
  $('#btn-export-csv').addEventListener('click', () => {
    const rows = [['fecha', 'peso_kg', 'cintura_cm', 'cuello_cm', 'cadera_cm', 'grasa_pct', 'kcal', 'proteina_g', 'pasos', 'nota']];
    const dates = new Set([...state.entries.map((e) => e.date), ...Object.keys(state.foods), ...Object.keys(state.habits)]);
    [...dates].sort().forEach((d) => {
      const e = state.entries.find((x) => x.date === d) || {};
      const t = dayTotals(d);
      const bf = e.date ? bodyFatOf(e) : null;
      rows.push([d, e.weight ?? '', e.waist ?? '', e.neck ?? '', e.hip ?? '', bf ?? '', t.kcal || '', t.protein || '', state.habits[d]?.steps ?? '', (e.note ?? '').replace(/"/g, '""')]);
    });
    download(`perdida-grasa-${today()}.csv`, rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n'), 'text/csv');
  });
  // Importación atómica: se valida TODO en memoria; si algo falla no se toca ni localStorage ni IndexedDB.
  $('#file-import').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    try {
      let data;
      try { data = JSON.parse(await file.text()); }
      catch { throw new Error('El archivo no es un JSON válido'); }
      const { state: next, warnings } = Schema.normalize(Schema.migrate(data));
      // Las copias anteriores a las fotos no traen la clave `photos`: se conservan las actuales.
      const hasPhotos = Array.isArray(data.photos);
      const ph = hasPhotos ? Schema.normalizePhotos(data.photos) : { photos: [], warnings: [] };
      const discarded = warnings.length + ph.warnings.length;
      if (discarded) console.warn('Importación: datos descartados o corregidos', [...warnings, ...ph.warnings]);
      const summary = `${next.entries.length} registros, ${Object.keys(next.foods).length} días de comidas` +
        (hasPhotos ? `, ${ph.photos.length} fotos` : '') +
        (discarded ? `. Se descartarán o corregirán ${discarded} datos no válidos` : '');
      if (!confirm(`Se importarán ${summary}.\nEsto reemplazará los datos actuales. ¿Continuar?`)) return;

      const prevRaw = localStorage.getItem(STORAGE_KEY);
      // Si falla (p. ej. sin espacio) se lanza antes de tocar las fotos.
      try { persist(next); } catch { throw new Error('No hay espacio para guardar en este navegador'); }
      if (hasPhotos) {
        try { await Photos.importAll(ph.photos); }
        catch {
          // Deshace localStorage para que la importación sea todo o nada.
          if (prevRaw == null) localStorage.removeItem(STORAGE_KEY); else localStorage.setItem(STORAGE_KEY, prevRaw);
          throw new Error('No se pudieron guardar las fotos; no se cambió nada');
        }
      }
      state = next;
      await loadPhotos();
      profileForm.reset();
      fillProfileForm();
      toast(discarded ? `Datos importados (${discarded} corregidos o descartados)` : 'Datos importados');
      render();
    } catch (err) {
      toast('No se importó. ' + (err.message || 'Archivo no válido'));
    } finally {
      ev.target.value = '';
    }
  });
  $('#btn-reset').addEventListener('click', async () => {
    if (!confirm('¿Borrar todos los datos de este dispositivo (incluidas las fotos)? No se puede deshacer.')) return;
    state = emptyState();
    save();
    try { await Photos.clear(); } catch { toast('No se pudieron borrar las fotos'); }
    await loadPhotos();
    profileForm.reset();
    fillProfileForm();
    toast('Datos borrados');
    render();
  });

  // ---------- Respaldo y almacenamiento (HU-01) ----------
  // Claves propias, fuera de `state`, para no depender del esquema de datos.
  const LAST_BACKUP_KEY = 'perdida-grasa:lastBackup';
  const BACKUP_SNOOZE_KEY = 'perdida-grasa:backupSnooze';
  const SNOOZE_DAYS = 3;
  const getPref = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const setPref = (k, v) => {
    try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* sin almacenamiento */ }
  };

  function renderBackup() {
    const last = getPref(LAST_BACKUP_KEY);
    const lastDate = last ? new Date(last) : null;
    const validLast = lastDate && !Number.isNaN(lastDate.getTime()) ? toISO(lastDate) : null;
    const hasData = state.entries.length > 0;
    const due = Calc.backupDue(validLast, getPref(BACKUP_SNOOZE_KEY), today(), hasData);
    const ago = validLast ? Calc.toDay(today()) - Calc.toDay(validLast) : null;
    const agoText = ago == null ? '' : ago <= 0 ? 'hoy' : ago === 1 ? 'ayer' : `hace ${ago} días`;

    $('#backup-status').textContent = validLast
      ? `Última copia exportada: ${fmtDate(validLast)} (${agoText}).`
      : 'Aún no has exportado ninguna copia.';
    $('#backup-banner-text').textContent = validLast
      ? `Tu última copia de seguridad es de ${agoText}. Tus datos solo están en este dispositivo: exporta una copia para no perderlos.`
      : 'Aún no tienes copia de seguridad. Tus datos solo están en este dispositivo: exporta una copia para no perderlos.';
    $('#backup-banner-body').classList.toggle('hidden', !due);
  }

  // Se registra junto al listener de exportación existente (mismo clic).
  $('#btn-export').addEventListener('click', () => {
    setPref(LAST_BACKUP_KEY, new Date().toISOString());
    setPref(BACKUP_SNOOZE_KEY, null);
    renderBackup();
  });
  $('#btn-backup-now').addEventListener('click', () => $('#btn-export').click());
  $('#btn-backup-later').addEventListener('click', () => {
    setPref(BACKUP_SNOOZE_KEY, Calc.addDays(today(), SNOOZE_DAYS));
    renderBackup();
    toast(`Te lo recordaremos en ${SNOOZE_DAYS} días`);
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

  // ---------- Render ----------
  function render() {
    $('#today-label').textContent = new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
    renderPanel();
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
  if (loadNotice) toast(loadNotice);

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
