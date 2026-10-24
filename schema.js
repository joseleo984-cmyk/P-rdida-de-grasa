// Esquema de datos: versión, migraciones y normalización (puro, sin DOM) para poder probarlo con Node.
// Se aplica al cargar de localStorage y al importar un respaldo JSON (un respaldo viejo es otra versión).
(function (root) {
  'use strict';

  // v1: formato original, sin `schemaVersion`. v2: igual, con `schemaVersion` y datos normalizados.
  // v3: añade `consent` (LEGAL-01). Los datos anteriores no tienen consentimiento: se pedirá al abrir la app.
  // v4 (S2-4, preparada para sincronizar, ver spike-servidor.md §4):
  //   - ids UUID en registros, alimentos, hábitos y biblioteca (y fotos, en IndexedDB y en respaldos);
  //   - `updatedAt` (ISO) en cada registro mutable; los datos anteriores reciben EPOCH, así cualquier edición real gana;
  //   - borrado lógico: `deleted = { entries, foods, habits, photos }` con lápidas { id, date, deletedAt, updatedAt }.
  //     Las lápidas viven APARTE de los datos vivos: la UI, los cálculos, el CSV y el visor del coach no las ven.
  //   - claves naturales: registro corporal y hábitos por fecha; biblioteca por nombre en minúsculas.
  // v5 (Sprint 11, «App para coaches»): el registro corporal (`entry`) admite medidas de cuerpo tipo sastre: brazo derecho/izquierdo
  //   (armR, armL), espalda (back) y muslo derecho/izquierdo (thighR, thighL), además de cuello y cintura que ya existían.
  //   Son campos OPCIONALES: un respaldo v4 es válido tal cual (la migración v4→v5 no cambia ningún dato) y el peso ya no es obligatorio.
  //   Un respaldo v5 no se puede abrir en una app de versión 4 (dice «versión más nueva»), como siempre.
  const CURRENT_VERSION = 5;
  const EPOCH = '1970-01-01T00:00:00.000Z';

  // Cada migración recibe el estado de la versión N-1 (y `ctx.uid`) y devuelve uno nuevo de la versión N (sin mutar).
  const MIGRATIONS = {
    2: (s) => ({ ...s }),
    3: (s) => ({ ...s, consent: s.consent === undefined ? null : s.consent }),
    4: (s, ctx) => migrateTo4(s, ctx.uid),
    5: (s) => ({ ...s }),   // medidas nuevas opcionales en `entry`: nada que convertir
  };

  // LEGAL-01: versiones vigentes de los textos legales (deben coincidir con "**Versión:**" de los .md;
  // lo comprueba tests/legal.test.js). Si cambian, la app pide aceptar de nuevo.
  const LEGAL_VERSIONS = { terms: '0.1', privacy: '0.1' };
  // Edad mínima (decisión del Stakeholder, 2026-10-22): 18 años. Con menos no se guarda el perfil; si ya había uno
  // guardado, no se borra: queda como borrador para que la persona lo corrija (ver normalizeProfile).
  const AGE_MIN = 18;
  const AGE_UNDER_MSG = `Esta app es solo para personas de ${AGE_MIN} años o más. Si escribiste mal tu edad, corrígela; si eres menor de edad, por ahora no podemos guardar tu perfil.`;

  const MEALS = ['Desayuno', 'Almuerzo', 'Cena', 'Snack'];
  const POSES = ['frente', 'perfil', 'espalda'];
  const ACTIVITY = [1.2, 1.375, 1.55, 1.725, 1.9];
  const RATES = [0.0025, 0.005, 0.0075, 0.01];
  const ID_RE = /^[a-z0-9-]{1,40}$/i;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isUUID = (v) => typeof v === 'string' && UUID_RE.test(v);
  const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
  const PHOTO_DATA_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;

  // Rangos aceptados (algo más amplios que los del formulario para no perder datos legítimos).
  const RANGES = {
    weight: [20, 400], waist: [30, 250], neck: [15, 80], hip: [40, 250], bodyFat: [2, 70],
    armR: [10, 80], armL: [10, 80], back: [15, 150], thighR: [20, 120], thighL: [20, 120],
    kcal: [0, 10000], protein: [0, 1000], carbs: [0, 2000], fat: [0, 1000],
    steps: [0, 200000], water: [0, 20], sleep: [0, 24],
  };

  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const dict = () => Object.create(null);
  const emptyDeleted = () => ({ entries: [], foods: [], habits: [], photos: [] });
  const emptyState = () => ({ schemaVersion: CURRENT_VERSION, profile: null, entries: [], foods: dict(), habits: dict(), library: dict(), consent: null, deleted: emptyDeleted() });

  // UUID v4: crypto.randomUUID si existe (contextos seguros); si no, getRandomValues; último recurso, Math.random.
  function uuid() {
    const c = typeof crypto !== 'undefined' ? crypto : null;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    const b = new Uint8Array(16);
    if (c && typeof c.getRandomValues === 'function') c.getRandomValues(b);
    else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  const defaultUid = uuid;

  function isISODate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d));
    return y >= 1900 && y <= 2100 && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
  }

  // Número a partir de number o string numérico. Devuelve undefined si falta y NaN si es inválido o fuera de rango.
  function num(v, [min, max]) {
    if (v === undefined || v === null || v === '') return undefined;
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    return Number.isFinite(n) && n >= min && n <= max ? n : NaN;
  }

  const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

  // Lanza si `raw` no es un estado reconocible; devuelve una copia en CURRENT_VERSION.
  function migrate(raw, opts = {}) {
    const ctx = { uid: opts.uid || defaultUid };
    if (!isObj(raw)) throw new Error('El archivo no contiene datos de la app');
    let version = raw.schemaVersion === undefined ? 1 : raw.schemaVersion;
    if (!Number.isInteger(version) || version < 1) throw new Error('Versión de datos no válida');
    if (version > CURRENT_VERSION) throw new Error('Los datos son de una versión más nueva de la app');
    let s = { ...raw };
    while (version < CURRENT_VERSION) {
      version += 1;
      s = MIGRATIONS[version](s, ctx);
    }
    s.schemaVersion = CURRENT_VERSION;
    return s;
  }

  // v3 → v4: reasigna ids no-UUID y añade `updatedAt` = EPOCH. No hay referencias cruzadas entre registros
  // (las fotos se asocian al pesaje por FECHA, no por id), así que no hace falta tabla de equivalencias.
  // Las fotos de IndexedDB las migra photos.js (Photos.migrateIds) y las de un respaldo normalizePhotos().
  function migrateTo4(s, uid) {
    const fix = (x) => (isObj(x) ? { ...x, id: isUUID(x.id) ? x.id : uid(), updatedAt: x.updatedAt === undefined ? EPOCH : x.updatedAt } : x);
    const mapDict = (o, fn) => {
      if (!isObj(o)) return o;
      const out = dict();
      for (const k of Object.keys(o)) out[k] = fn(o[k]);
      return out;
    };
    // Solo se tocan las claves que existen: un JSON ajeno ({foo:1}) debe seguir siendo irreconocible para normalize().
    const out = { ...s };
    if (isObj(s.profile)) out.profile = { ...s.profile, updatedAt: s.profile.updatedAt === undefined ? EPOCH : s.profile.updatedAt };
    if (Array.isArray(s.entries)) out.entries = s.entries.map(fix);
    if ('foods' in s) out.foods = mapDict(s.foods, (list) => (Array.isArray(list) ? list.map(fix) : list));
    if ('habits' in s) out.habits = mapDict(s.habits, fix);
    if ('library' in s) out.library = mapDict(s.library, fix);
    out.deleted = emptyDeleted();
    return out;
  }

  const isISOStampV = (v) => typeof v === 'string' && v.length <= 40 && /^\d{4}-\d{2}-\d{2}T/.test(v) && !Number.isNaN(Date.parse(v));
  const stamp = (v) => (isISOStampV(v) ? new Date(Date.parse(v)).toISOString() : EPOCH);
  const okId = (v, ids, uid) => (isUUID(v) && !ids.has(v) ? v : uid());

  // Devuelve el motivo por el que un perfil no es válido, o null si lo es. Lo usan el formulario y normalize().
  function profileError(p) {
    if (!isObj(p)) return 'Perfil vacío';
    if (p.sex !== 'male' && p.sex !== 'female') return 'Elige el sexo';
    if (Number.isFinite(p.age) && p.age < AGE_MIN) return AGE_UNDER_MSG;
    if (!(p.age >= AGE_MIN && p.age <= 100)) return `La edad debe estar entre ${AGE_MIN} y 100 años`;
    if (!(p.height >= 120 && p.height <= 230)) return 'La estatura debe estar entre 120 y 230 cm';
    if (!(p.startWeight >= 30 && p.startWeight <= 400)) return 'El peso inicial debe estar entre 30 y 400 kg';
    if (!(p.goalWeight >= 30 && p.goalWeight <= 400)) return 'El peso meta debe estar entre 30 y 400 kg';
    if (p.goalWeight >= p.startWeight) return `La meta debe ser menor que el peso inicial (meta ${p.goalWeight} kg, inicial ${p.startWeight} kg)`;
    if (!isISODate(p.startDate)) return 'La fecha de inicio no es válida';
    if (!ACTIVITY.includes(p.activity)) return 'Nivel de actividad no válido';
    if (!RATES.includes(p.rate)) return 'Ritmo no válido';
    return null;
  }

  // Un perfil inválido no se tira: se devuelve en `rejected` como borrador con tipos seguros
  // (cadenas vacías donde el valor no sirve) para precargar el formulario y que el usuario lo corrija.
  function normalizeProfile(raw, warn, rejected) {
    if (raw === null || raw === undefined) return null;
    if (!isObj(raw)) { warn('Perfil descartado: formato no válido'); return null; }
    const n = (v) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : v);
    const p = {
      name: text(raw.name, 40),
      sex: raw.sex,
      age: n(raw.age),
      height: n(raw.height),
      startWeight: n(raw.startWeight),
      goalWeight: n(raw.goalWeight),
      startDate: raw.startDate,
      activity: n(raw.activity),
      rate: n(raw.rate),
    };
    if (!ACTIVITY.includes(p.activity)) { warn('Perfil: actividad no válida, se usa "Sedentario"'); p.activity = 1.2; }
    if (!RATES.includes(p.rate)) { warn('Perfil: ritmo no válido, se usa "Moderado"'); p.rate = 0.005; }
    const err = profileError(p);
    if (err) {
      warn('Perfil no válido: ' + err);
      const okNum = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : '');
      rejected.profile = {
        name: p.name, sex: p.sex === 'male' || p.sex === 'female' ? p.sex : '',
        age: okNum(p.age), height: okNum(p.height), startWeight: okNum(p.startWeight), goalWeight: okNum(p.goalWeight),
        startDate: isISODate(p.startDate) ? p.startDate : '', activity: p.activity, rate: p.rate,
      };
      rejected.reason = err;
      return null;
    }
    p.updatedAt = stamp(raw.updatedAt);
    return p;
  }

  // Medidas que puede llevar un registro corporal (todas opcionales; basta con una). Sprint 11: + brazos, espalda y muslos.
  const ENTRY_FIELDS = ['weight', 'waist', 'neck', 'hip', 'bodyFat', 'armR', 'armL', 'back', 'thighR', 'thighL'];
  function normalizeEntries(raw, warn, uid) {
    if (raw === undefined) return [];
    if (!Array.isArray(raw)) { warn('Registros descartados: formato no válido'); return []; }
    const out = [];
    const ids = new Set();
    raw.forEach((e, i) => {
      if (!isObj(e) || !isISODate(e.date)) { warn(`Registro ${i + 1} descartado: sin fecha válida`); return; }
      const entry = { id: e.id, date: e.date };
      for (const k of ENTRY_FIELDS) {
        const v = num(e[k], RANGES[k]);
        if (Number.isNaN(v)) warn(`Registro ${e.date}: "${k}" no válido, se descarta`);
        else if (v !== undefined) entry[k] = v;
      }
      const note = text(e.note, 140);
      if (note) entry.note = note;
      if (ENTRY_FIELDS.every((k) => entry[k] === undefined)) {
        warn(`Registro ${e.date} descartado: sin medidas`);
        return;
      }
      entry.id = okId(entry.id, ids, uid);
      entry.updatedAt = stamp(e.updatedAt);
      ids.add(entry.id);
      out.push(entry);
    });
    return out;
  }

  // Objeto { 'YYYY-MM-DD': valor } sin prototipo; descarta claves que no sean fechas.
  function normalizeByDate(raw, label, warn, fn) {
    const out = dict();
    if (raw === undefined || raw === null) return out;
    if (!isObj(raw)) { warn(`${label} descartados: formato no válido`); return out; }
    for (const d of Object.keys(raw)) {
      if (!isISODate(d)) { warn(`${label}: fecha "${String(d).slice(0, 20)}" no válida, se descarta`); continue; }
      const v = fn(raw[d], d);
      if (v !== undefined) out[d] = v;
    }
    return out;
  }

  const DISH_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/, TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/, PORTION_KEYS = ['half', 'normal', 'large', 'double'];
  function normalizeFood(x, d, warn, uid, ids) {
    if (!isObj(x)) { warn(`Comidas ${d}: elemento no válido, se descarta`); return null; }
    const name = text(x.name, 80);
    const kcal = num(x.kcal, RANGES.kcal);
    if (!name || kcal === undefined || Number.isNaN(kcal)) { warn(`Comidas ${d}: alimento sin nombre o calorías válidas, se descarta`); return null; }
    const item = { id: x.id, name, meal: MEALS.includes(x.meal) ? x.meal : 'Snack', kcal };
    for (const k of ['protein', 'carbs', 'fat']) {
      const v = num(x[k], RANGES[k]);
      if (Number.isNaN(v)) warn(`Comidas ${d}: "${k}" no válido en "${name}", se usa 0`);
      item[k] = Number.isFinite(v) ? v : 0;
    }
    // Etapa 2 (comidas, producto coach): lo que viene del catálogo de platos (platos.js) guarda su plato, su porción y la hora. Todo opcional.
    if (typeof x.dish === 'string' && DISH_RE.test(x.dish)) item.dish = x.dish;
    if (typeof x.portion === 'string' && PORTION_KEYS.includes(x.portion)) item.portion = x.portion;
    if (typeof x.time === 'string' && TIME_RE.test(x.time)) item.time = x.time;
    if (typeof item.id !== 'string' || !ID_RE.test(item.id) || ids.has(item.id)) item.id = uid();
    ids.add(item.id);
    return item;
  }

  function normalizeLibrary(raw, warn, uid) {
    const ids = new Set();
    const out = dict();
    if (raw === undefined || raw === null) return out;
    if (!isObj(raw)) { warn('Biblioteca de alimentos descartada: formato no válido'); return out; }
    for (const k of Object.keys(raw)) {
      const x = raw[k];
      const name = isObj(x) ? text(x.name, 80) : '';
      const key = name.toLowerCase();
      const kcal = isObj(x) ? num(x.kcal, RANGES.kcal) : NaN;
      if (!name || DANGEROUS_KEYS.has(key) || DANGEROUS_KEYS.has(k) || !Number.isFinite(kcal)) {
        warn(`Biblioteca: alimento "${String(k).slice(0, 30)}" no válido, se descarta`);
        continue;
      }
      const item = { name, kcal };
      for (const m of ['protein', 'carbs', 'fat']) {
        const v = num(x[m], RANGES[m]);
        item[m] = Number.isFinite(v) ? v : 0;
      }
      item.id = okId(x.id, ids, uid);
      ids.add(item.id);
      item.updatedAt = stamp(x.updatedAt);
      out[key] = item;
    }
    return out;
  }

  // Valida y sanea un estado completo (ya migrado). Lanza si la estructura base es irreconocible.
  function normalize(raw, opts = {}) {
    const uid = opts.uid || defaultUid;
    const warnings = [];
    const warn = (m) => warnings.push(m);
    if (!isObj(raw)) throw new Error('El archivo no contiene datos de la app');
    if (!['profile', 'entries', 'foods', 'habits', 'library'].some((k) => k in raw)) {
      throw new Error('El archivo no parece un respaldo de esta app');
    }
    const foodIds = new Set();
    const habitIds = new Set();
    const rejected = {};
    const state = {
      schemaVersion: CURRENT_VERSION,
      profile: normalizeProfile(raw.profile, warn, rejected),
      entries: normalizeEntries(raw.entries, warn, uid),
      foods: normalizeByDate(raw.foods, 'Comidas', warn, (list, d) => {
        if (!Array.isArray(list)) { warn(`Comidas ${d}: formato no válido, se descarta`); return undefined; }
        const items = list.map((x) => {
          const item = normalizeFood(x, d, warn, uid, foodIds);
          if (!item) return null;
          if (!isUUID(item.id)) { foodIds.delete(item.id); item.id = okId(null, foodIds, uid); foodIds.add(item.id); }
          item.updatedAt = stamp(x.updatedAt);
          return item;
        }).filter(Boolean);
        return items.length ? items : undefined;
      }),
      habits: normalizeByDate(raw.habits, 'Hábitos', warn, (h, d) => {
        if (!isObj(h)) { warn(`Hábitos ${d}: formato no válido, se descarta`); return undefined; }
        const out = { trained: h.trained === true };
        for (const k of ['steps', 'water', 'sleep']) {
          const v = num(h[k], RANGES[k]);
          if (Number.isNaN(v)) warn(`Hábitos ${d}: "${k}" no válido, se descarta`);
          else if (v !== undefined) out[k] = v;
        }
        out.id = okId(h.id, habitIds, uid);
        habitIds.add(out.id);
        out.updatedAt = stamp(h.updatedAt);
        return out;
      }),
      library: normalizeLibrary(raw.library, warn, uid),
      consent: normalizeConsent(raw.consent, warn),
      deleted: normalizeDeleted(raw.deleted, warn),
    };
    // Clave natural (fecha): una lápida de registro/hábito con un dato vivo ese mismo día sobra (D2 de QA en S2-4).
    const liveDates = new Set(state.entries.map((e) => e.date));
    state.deleted.entries = state.deleted.entries.filter((t) => !liveDates.has(t.date));
    state.deleted.habits = state.deleted.habits.filter((t) => !(t.date in state.habits));
    return { state, warnings, rejected };
  }

  // Lápidas de borrado lógico. Una lápida no válida se descarta (lo peor que pasa es que el dato "resucite").
  function normalizeDeleted(raw, warn) {
    const out = emptyDeleted();
    if (raw === undefined || raw === null) return out;
    if (!isObj(raw)) { warn('Borrados descartados: formato no válido'); return out; }
    for (const k of Object.keys(out)) {
      if (!Array.isArray(raw[k])) continue;
      const seen = new Set();
      for (const t of raw[k]) {
        if (!isObj(t) || !isUUID(t.id) || !isISODate(t.date) || !isISOStampV(t.deletedAt) || seen.has(t.id)) { warn(`Borrado de ${k} no válido, se descarta`); continue; }
        seen.add(t.id);
        out[k].push({ id: t.id, date: t.date, deletedAt: stamp(t.deletedAt), updatedAt: stamp(t.updatedAt || t.deletedAt) });
      }
    }
    return out;
  }

  // ---------- S2-4: marcas de cambio, borrado lógico y fusión (para la sincronización de R1) ----------
  const strip = (r) => { if (!isObj(r)) return r; const { updatedAt, ...rest } = r; void updatedAt; return rest; };
  // JSON con claves ordenadas: los formularios reconstruyen los objetos y el orden de las claves puede cambiar.
  const canon = (v) => JSON.stringify(v, (k, x) => (isObj(x) ? Object.keys(x).sort().reduce((o, kk) => { o[kk] = x[kk]; return o; }, {}) : x));
  const sameRecord = (a, b) => canon(strip(a)) === canon(strip(b));
  const tomb = (id, date, nowISO) => ({ id, date, deletedAt: nowISO, updatedAt: nowISO });

  // Reloj acotado (spike §4.2, decisión del SM): una marca más de 5 min en el futuro (móvil con la hora adelantada)
  // se trata como "ahora" al guardar y al fusionar; si no, ganaría siempre y una lápida futura impediría recrear el dato.
  const MAX_SKEW_MS = 5 * 60 * 1000;
  function clampStamp(iso, nowMs) {
    const t = Date.parse(iso);
    return Number.isFinite(t) && t > nowMs + MAX_SKEW_MS ? new Date(nowMs).toISOString() : iso;
  }
  const clampRec = (r, nowMs) => {
    if (!isObj(r)) return r;
    const u = clampStamp(r.updatedAt, nowMs);
    const d = r.deletedAt !== undefined ? clampStamp(r.deletedAt, nowMs) : undefined;
    if (u === r.updatedAt && d === r.deletedAt) return r;
    return d === undefined ? { ...r, updatedAt: u } : { ...r, updatedAt: u, deletedAt: d };
  };

  // Compara el estado guardado (`prev`) con el nuevo (`next`) y devuelve una copia de `next` donde:
  // - todo registro nuevo o cambiado lleva `updatedAt = nowISO` (y un UUID si no lo tenía);
  // - lo que estaba en `prev` y ya no está pasa a `deleted` como lápida;
  // - una lápida cuyo id (o fecha, en registros y hábitos) vuelve a estar vivo se elimina.
  // Así la app no tiene que acordarse de marcar nada en cada formulario: save() lo aplica siempre. Pura.
  function stampChanges(prev, next, nowISO, opts = {}) {
    const uid = opts.uid || defaultUid;
    const nowMs = Date.parse(nowISO);
    const p = isObj(prev) ? prev : {};
    const del = isObj(next.deleted) ? next.deleted : emptyDeleted();
    const deleted = {};
    for (const k of Object.keys(emptyDeleted())) deleted[k] = Array.isArray(del[k]) ? del[k].map((t) => clampRec(t, nowMs)) : [];
    const touch = (rec, old) => (old && sameRecord(old, rec) ? { ...rec, updatedAt: clampStamp(old.updatedAt || EPOCH, nowMs) } : { ...rec, updatedAt: nowISO });

    // Registro corporal (lista, por id)
    const prevEntries = new Map((Array.isArray(p.entries) ? p.entries : []).filter(isObj).map((e) => [e.id, e]));
    const entries = next.entries.map((e) => {
      const rec = isUUID(e.id) ? e : { ...e, id: uid() };
      return touch(rec, prevEntries.get(rec.id));
    });
    const liveEntryIds = new Set(entries.map((e) => e.id));
    for (const [id, e] of prevEntries) if (!liveEntryIds.has(id) && isUUID(id)) deleted.entries.push(tomb(id, e.date, nowISO));

    // Comidas ({fecha: [items]}, por id)
    const prevFoods = new Map();
    if (isObj(p.foods)) for (const d of Object.keys(p.foods)) for (const x of Array.isArray(p.foods[d]) ? p.foods[d] : []) if (isObj(x)) prevFoods.set(x.id, { x, d });
    const foods = dict();
    const liveFoodIds = new Set();
    for (const d of Object.keys(next.foods)) {
      foods[d] = next.foods[d].map((x) => {
        const rec = isUUID(x.id) ? x : { ...x, id: uid() };
        liveFoodIds.add(rec.id);
        const old = prevFoods.get(rec.id);
        return touch(rec, old && old.d === d ? old.x : null);
      });
    }
    for (const [id, { d }] of prevFoods) if (!liveFoodIds.has(id) && isUUID(id)) deleted.foods.push(tomb(id, d, nowISO));

    // Hábitos ({fecha: {...}}, clave natural = fecha: se conserva el id de esa fecha)
    const prevHabits = isObj(p.habits) ? p.habits : {};
    const habits = dict();
    for (const d of Object.keys(next.habits)) {
      const old = isObj(prevHabits[d]) ? prevHabits[d] : null;
      const h = next.habits[d];
      const id = isUUID(h.id) ? h.id : old && isUUID(old.id) ? old.id : uid();
      habits[d] = touch({ ...h, id }, old);
    }
    for (const d of Object.keys(prevHabits)) {
      if (!(d in habits) && isObj(prevHabits[d]) && isUUID(prevHabits[d].id)) deleted.habits.push(tomb(prevHabits[d].id, d, nowISO));
    }

    // Biblioteca ({nombre: {...}}, clave natural = nombre en minúsculas)
    const prevLib = isObj(p.library) ? p.library : {};
    const library = dict();
    for (const k of Object.keys(next.library)) {
      const old = isObj(prevLib[k]) ? prevLib[k] : null;
      const x = next.library[k];
      const id = isUUID(x.id) ? x.id : old && isUUID(old.id) ? old.id : uid();
      library[k] = touch({ ...x, id }, old);
    }

    const profile = next.profile ? touch(next.profile, isObj(p.profile) ? p.profile : null) : next.profile;

    // Lápidas que ya no aplican: id vivo de nuevo, o fecha con registro/hábito vivo (clave natural).
    const entryDates = new Set(entries.map((e) => e.date));
    deleted.entries = deleted.entries.filter((t) => !liveEntryIds.has(t.id) && !entryDates.has(t.date));
    deleted.foods = deleted.foods.filter((t) => !liveFoodIds.has(t.id));
    deleted.habits = deleted.habits.filter((t) => !(t.date in habits));
    return { ...next, profile, entries, foods, habits, library, deleted };
  }

  // Borra las lápidas con `deletedAt` anterior a `days` días. OPCIONAL: en R1 solo debe llamarse cuando el servidor
  // haya confirmado el borrado (si se purga antes, otro dispositivo podría "resucitar" el dato). Pura.
  function purgeDeleted(state, nowISO, days = 90) {
    const limit = Date.parse(nowISO) - days * 86400000;
    const deleted = emptyDeleted();
    const src = isObj(state.deleted) ? state.deleted : {};
    for (const k of Object.keys(deleted)) deleted[k] = (src[k] || []).filter((t) => Date.parse(t.deletedAt) >= limit);
    return { ...state, deleted };
  }

  // Gana el `updatedAt` mayor; si empatan, el JSON mayor (determinista y conmutativo). Recibe registros ya acotados.
  function newer(a, b) {
    const ta = Date.parse(a.updatedAt) || 0, tb = Date.parse(b.updatedAt) || 0;
    if (ta !== tb) return ta > tb ? a : b;
    return JSON.stringify(a) >= JSON.stringify(b) ? a : b;
  }

  // Last-write-wins POR REGISTRO entre dos listas de registros (vivos o con `deletedAt`). `key`: 'id' o una clave
  // natural ('date', 'key' o una función). Con clave natural se conserva el id del lado remoto (el servidor manda, §4.2).
  // LWW se aplica también DENTRO de cada lado (p. ej. un registro vivo y una lápida vieja del mismo día en local).
  // Marcas más de 5 min en el futuro respecto a `now` (ms) se tratan como `now`.
  function mergeRecords(local, remote, { key = 'id', now = Date.now() } = {}) {
    const k = typeof key === 'function' ? key : (r) => r[key];
    const out = new Map();
    const add = (raw, isRemote) => {
      const r = clampRec(raw, now);
      const kk = k(r);
      const l = out.get(kk);
      if (!l) { out.set(kk, r); return; }
      const w = newer(l, r);
      out.set(kk, key !== 'id' && isRemote ? { ...w, id: r.id } : w);
    };
    for (const r of local || []) add(r, false);
    for (const r of remote || []) add(r, true);
    return [...out.values()];
  }

  // Estado ↔ listas planas de registros para sincronizar: cada registro lleva su fecha (o `key` en la biblioteca)
  // y, si es una lápida, `deletedAt`. fromRecords separa de nuevo vivos y lápidas.
  function toRecords(state) {
    const del = isObj(state.deleted) ? state.deleted : emptyDeleted();
    const foods = [];
    for (const d of Object.keys(state.foods)) for (const x of state.foods[d]) foods.push({ ...x, date: d });
    return {
      entries: [...state.entries, ...(del.entries || [])],
      foods: [...foods, ...(del.foods || [])],
      habits: [...Object.keys(state.habits).map((d) => ({ ...state.habits[d], date: d })), ...(del.habits || [])],
      library: Object.keys(state.library).map((key) => ({ ...state.library[key], key })),
    };
  }
  function fromRecords(base, recs) {
    const deleted = { ...emptyDeleted(), photos: isObj(base.deleted) && Array.isArray(base.deleted.photos) ? base.deleted.photos.slice() : [] };
    const isDel = (r) => r.deletedAt !== undefined && r.deletedAt !== null;
    const t = (r) => ({ id: r.id, date: r.date, deletedAt: r.deletedAt, updatedAt: r.updatedAt });
    const entries = [];
    for (const r of recs.entries) (isDel(r) ? deleted.entries.push(t(r)) : entries.push(r));
    const foods = dict();
    for (const r of recs.foods) {
      if (isDel(r)) { deleted.foods.push(t(r)); continue; }
      const { date, ...x } = r;
      (foods[date] ||= []).push(x);
    }
    const habits = dict();
    for (const r of recs.habits) {
      if (isDel(r)) { deleted.habits.push(t(r)); continue; }
      const { date, ...h } = r;
      habits[date] = h;
    }
    const library = dict();
    for (const r of recs.library) { const { key, ...x } = r; if (isSafeKey(key)) library[key] = x; }
    return { ...base, entries, foods, habits, library, deleted };
  }

  // Fusión completa local + remoto (LWW por registro). Registro corporal y hábitos por FECHA; comidas por id;
  // biblioteca por nombre; perfil entero por updatedAt; lápidas de fotos por id.
  // El consentimiento NO se fusiona: es de quien usa este dispositivo (regla de S2-1).
  function mergeState(local, remote, { now = Date.now() } = {}) {
    const a = toRecords(local), b = toRecords(remote);
    const out = fromRecords(local, {
      entries: mergeRecords(a.entries, b.entries, { key: 'date', now }),
      foods: mergeRecords(a.foods, b.foods, { now }),
      habits: mergeRecords(a.habits, b.habits, { key: 'date', now }),
      library: mergeRecords(a.library, b.library, { key: 'key', now }),
    });
    const lp = clampRec(local.profile, now), rp = clampRec(remote.profile, now);
    out.profile = lp && rp ? newer(lp, rp) : lp || rp || null;
    out.deleted.photos = mergeRecords(local.deleted && local.deleted.photos, remote.deleted && remote.deleted.photos, { now });
    return out;
  }

  // ---------- LEGAL-01: consentimiento ----------
  const isISOStamp = (v) => typeof v === 'string' && v.length <= 40 && /^\d{4}-\d{2}-\d{2}T/.test(v) && !Number.isNaN(Date.parse(v));
  const isVersion = (v) => typeof v === 'string' && /^[0-9a-z.\-]{1,20}$/i.test(v);

  // Un consentimiento con forma no válida se descarta (null): la app vuelve a pedirlo, nunca lo inventa.
  function normalizeConsent(raw, warn = () => {}) {
    if (raw === undefined || raw === null) return null;
    if (!isObj(raw) || !isVersion(raw.termsVersion) || !isVersion(raw.privacyVersion) || raw.adult !== true || !isISOStamp(raw.acceptedAt)) {
      warn('Consentimiento no válido: se pedirá de nuevo');
      return null;
    }
    const c = {
      termsVersion: raw.termsVersion,
      privacyVersion: raw.privacyVersion,
      sensitiveHealth: raw.sensitiveHealth === true,
      photos: raw.photos === true,
      adult: true,
      acceptedAt: raw.acceptedAt,
      updatedAt: isISOStamp(raw.updatedAt) ? raw.updatedAt : raw.acceptedAt,
    };
    // Fecha del último cambio de cada autorización facultativa (para mostrarla en Perfil → Privacidad).
    for (const k of ['sensitiveHealthAt', 'photosAt']) if (isISOStamp(raw[k])) c[k] = raw[k];
    return c;
  }

  // 'missing' (nunca aceptó o dato inválido), 'outdated' (cambió la versión de T&C o Política) u 'ok'.
  function consentStatus(consent, versions = LEGAL_VERSIONS) {
    const c = normalizeConsent(consent);
    if (!c) return 'missing';
    if (c.termsVersion !== versions.terms || c.privacyVersion !== versions.privacy) return 'outdated';
    return 'ok';
  }

  // Crea el registro a partir de las casillas. Lanza si faltan las obligatorias (T&C, Política, mayor de 18).
  function buildConsent(boxes, nowISO, versions = LEGAL_VERSIONS) {
    if (!isObj(boxes) || boxes.terms !== true || boxes.privacy !== true || boxes.adult !== true) throw new Error('Faltan casillas obligatorias');
    if (!isISOStamp(nowISO)) throw new Error('Fecha no válida');
    return {
      termsVersion: versions.terms, privacyVersion: versions.privacy,
      sensitiveHealth: boxes.sensitiveHealth === true, photos: boxes.photos === true, adult: true,
      acceptedAt: nowISO, updatedAt: nowISO, sensitiveHealthAt: nowISO, photosAt: nowISO,
    };
  }

  // Cambia una autorización facultativa ('sensitiveHealth' | 'photos'). Pura: devuelve un objeto nuevo.
  function setConsentFlag(consent, key, value, nowISO) {
    const c = normalizeConsent(consent);
    if (!c) throw new Error('No hay consentimiento');
    if (key !== 'sensitiveHealth' && key !== 'photos') throw new Error('Autorización no válida');
    if (!isISOStamp(nowISO)) throw new Error('Fecha no válida');
    return { ...c, [key]: value === true, [key + 'At']: nowISO, updatedAt: nowISO };
  }

  // Fotos de un respaldo: valida metadatos y que `data` sea una imagen en base64. No decodifica.
  function normalizePhotos(raw, opts = {}) {
    const uid = opts.uid || defaultUid;
    const warnings = [];
    if (raw === undefined || raw === null) return { photos: [], warnings };
    if (!Array.isArray(raw)) throw new Error('Las fotos del respaldo no tienen un formato válido');
    const ids = new Set();
    const photos = [];
    raw.forEach((p, i) => {
      if (!isObj(p) || typeof p.data !== 'string' || !PHOTO_DATA_RE.test(p.data)) { warnings.push(`Foto ${i + 1} descartada: imagen no válida`); return; }
      if (!isISODate(p.date)) { warnings.push(`Foto ${i + 1} descartada: fecha no válida`); return; }
      let pose = p.pose;
      if (!POSES.includes(pose)) { warnings.push(`Foto ${i + 1}: pose no válida, se usa "frente"`); pose = 'frente'; }
      const id = okId(p.id, ids, uid);
      ids.add(id);
      const dim = (v) => (Number.isInteger(v) && v > 0 && v <= 20000 ? v : undefined);
      photos.push({
        id, date: p.date, pose, width: dim(p.width), height: dim(p.height),
        createdAt: Number.isFinite(p.createdAt) ? p.createdAt : 0, updatedAt: stamp(p.updatedAt), data: p.data,
        ...(p.sharedWithCoach === true ? { sharedWithCoach: true } : {}),   // Sprint 11: foto marcada para que la vea el coach
      });
    });
    return { photos, warnings };
  }

  // Metadatos de una foto ya guardada en IndexedDB (versiones anteriores no validaban al importar).
  // Devuelve la foto (pose corregida) o null si no se puede mostrar. No cambia el id: se usa para borrarla.
  function normalizeStoredPhoto(p) {
    if (!isObj(p) || typeof p.id !== 'string' || !p.id || !isISODate(p.date)) return null;
    return POSES.includes(p.pose) ? p : { ...p, pose: 'frente' };
  }

  const isSafeKey = (k) => !DANGEROUS_KEYS.has(String(k).toLowerCase());

  // ---------- HU-02: repetir comidas ----------
  // Suma `n` días a una fecha ISO (calendario puro, sin zona horaria). Lanza si la fecha no es válida.
  function addDays(iso, n) {
    if (!isISODate(iso) || !Number.isInteger(n)) throw new Error('Fecha no válida');
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
  }

  // Copia los alimentos de `fromISO` a `toISO` (opcionalmente solo un bloque `opts.meal`).
  // Pura: no muta `foods`; devuelve { foods, copied, skipped }. Las copias pasan por el mismo saneado que
  // `normalize` y reciben ids nuevos que no chocan con ninguno existente. Se suman a lo que ya hay en destino.
  function copyMeals(foods, fromISO, toISO, opts = {}) {
    if (!isISODate(fromISO) || !isISODate(toISO)) throw new Error('Fecha no válida');
    if (fromISO === toISO) throw new Error('El día de origen y el de destino son el mismo');
    if (opts.meal !== undefined && !MEALS.includes(opts.meal)) throw new Error('Comida no válida');
    const uid = opts.uid || defaultUid;
    const src = isObj(foods) ? foods : dict();
    const out = dict();
    const ids = new Set();
    for (const k of Object.keys(src)) {
      if (!Array.isArray(src[k])) continue;
      out[k] = src[k].slice();
      for (const x of src[k]) if (isObj(x) && typeof x.id === 'string') ids.add(x.id);
    }
    const from = Array.isArray(src[fromISO]) ? src[fromISO] : [];
    const picked = opts.meal ? from.filter((x) => isObj(x) && x.meal === opts.meal) : from;
    const fresh = () => {
      for (let i = 0; i < 100; i++) {
        const id = uid();
        if (typeof id === 'string' && ID_RE.test(id) && !ids.has(id)) return id;
      }
      throw new Error('No se pudo generar un id único');
    };
    let skipped = 0;
    const copies = [];
    for (const x of picked) {
      // Id vacío fuerza a normalizeFood a generar uno nuevo y único.
      const item = normalizeFood(isObj(x) ? { ...x, id: '', time: undefined } : x, toISO, () => {}, fresh, ids);
      if (item) copies.push(item); else skipped++;
    }
    if (copies.length) out[toISO] = (out[toISO] || []).concat(copies);
    return { foods: out, copied: copies.length, skipped };
  }

  const api = { ENTRY_FIELDS, RANGES, AGE_MIN, AGE_UNDER_MSG, CURRENT_VERSION, MIGRATIONS, emptyState, migrate, normalize, normalizePhotos, profileError, isISODate, addDays, copyMeals, MEALS, normalizeStoredPhoto, isSafeKey,
    LEGAL_VERSIONS, normalizeConsent, consentStatus, buildConsent, setConsentFlag,
    EPOCH, uuid, isUUID, stampChanges, purgeDeleted, mergeRecords, toRecords, fromRecords, mergeState, clampStamp, MAX_SKEW_MS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Schema = api;
})(typeof window !== 'undefined' ? window : globalThis);
