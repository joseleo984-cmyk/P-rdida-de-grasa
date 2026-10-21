// Esquema de datos: versión, migraciones y normalización (puro, sin DOM) para poder probarlo con Node.
// Se aplica al cargar de localStorage y al importar un respaldo JSON (un respaldo viejo es otra versión).
(function (root) {
  'use strict';

  // v1: formato original, sin `schemaVersion`. v2: igual, con `schemaVersion` y datos normalizados.
  const CURRENT_VERSION = 2;

  // Cada migración recibe el estado de la versión N-1 y devuelve uno nuevo de la versión N (sin mutar).
  const MIGRATIONS = {
    2: (s) => ({ ...s }),
  };

  const MEALS = ['Desayuno', 'Almuerzo', 'Cena', 'Snack'];
  const POSES = ['frente', 'perfil', 'espalda'];
  const ACTIVITY = [1.2, 1.375, 1.55, 1.725, 1.9];
  const RATES = [0.0025, 0.005, 0.0075, 0.01];
  const ID_RE = /^[a-z0-9-]{1,40}$/i;
  const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
  const PHOTO_DATA_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;

  // Rangos aceptados (algo más amplios que los del formulario para no perder datos legítimos).
  const RANGES = {
    weight: [20, 400], waist: [30, 250], neck: [15, 80], hip: [40, 250], bodyFat: [2, 70],
    kcal: [0, 10000], protein: [0, 1000], carbs: [0, 2000], fat: [0, 1000],
    steps: [0, 200000], water: [0, 20], sleep: [0, 24],
  };

  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const dict = () => Object.create(null);
  const emptyState = () => ({ schemaVersion: CURRENT_VERSION, profile: null, entries: [], foods: dict(), habits: dict(), library: dict() });

  function defaultUid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
  }

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
  function migrate(raw) {
    if (!isObj(raw)) throw new Error('El archivo no contiene datos de la app');
    let version = raw.schemaVersion === undefined ? 1 : raw.schemaVersion;
    if (!Number.isInteger(version) || version < 1) throw new Error('Versión de datos no válida');
    if (version > CURRENT_VERSION) throw new Error('Los datos son de una versión más nueva de la app');
    let s = { ...raw };
    while (version < CURRENT_VERSION) {
      version += 1;
      s = MIGRATIONS[version](s);
    }
    s.schemaVersion = CURRENT_VERSION;
    return s;
  }

  // Devuelve el motivo por el que un perfil no es válido, o null si lo es. Lo usan el formulario y normalize().
  function profileError(p) {
    if (!isObj(p)) return 'Perfil vacío';
    if (p.sex !== 'male' && p.sex !== 'female') return 'Elige el sexo';
    if (!(p.age >= 14 && p.age <= 100)) return 'La edad debe estar entre 14 y 100 años';
    if (!(p.height >= 120 && p.height <= 230)) return 'La estatura debe estar entre 120 y 230 cm';
    if (!(p.startWeight >= 30 && p.startWeight <= 400)) return 'El peso inicial debe estar entre 30 y 400 kg';
    if (!(p.goalWeight >= 30 && p.goalWeight <= 400)) return 'El peso meta debe estar entre 30 y 400 kg';
    if (p.goalWeight >= p.startWeight) return 'La meta debe ser menor que el peso inicial';
    if (!isISODate(p.startDate)) return 'La fecha de inicio no es válida';
    if (!ACTIVITY.includes(p.activity)) return 'Nivel de actividad no válido';
    if (!RATES.includes(p.rate)) return 'Ritmo no válido';
    return null;
  }

  function normalizeProfile(raw, warn) {
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
    if (err) { warn('Perfil descartado: ' + err); return null; }
    return p;
  }

  function normalizeEntries(raw, warn, uid) {
    if (raw === undefined) return [];
    if (!Array.isArray(raw)) { warn('Registros descartados: formato no válido'); return []; }
    const out = [];
    const ids = new Set();
    raw.forEach((e, i) => {
      if (!isObj(e) || !isISODate(e.date)) { warn(`Registro ${i + 1} descartado: sin fecha válida`); return; }
      const entry = { id: e.id, date: e.date };
      for (const k of ['weight', 'waist', 'neck', 'hip', 'bodyFat']) {
        const v = num(e[k], RANGES[k]);
        if (Number.isNaN(v)) warn(`Registro ${e.date}: "${k}" no válido, se descarta`);
        else if (v !== undefined) entry[k] = v;
      }
      const note = text(e.note, 140);
      if (note) entry.note = note;
      if (entry.weight === undefined && entry.waist === undefined && entry.neck === undefined && entry.hip === undefined && entry.bodyFat === undefined) {
        warn(`Registro ${e.date} descartado: sin medidas`);
        return;
      }
      if (typeof entry.id !== 'string' || !ID_RE.test(entry.id) || ids.has(entry.id)) entry.id = uid();
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
    if (typeof item.id !== 'string' || !ID_RE.test(item.id) || ids.has(item.id)) item.id = uid();
    ids.add(item.id);
    return item;
  }

  function normalizeLibrary(raw, warn) {
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
    const state = {
      schemaVersion: CURRENT_VERSION,
      profile: normalizeProfile(raw.profile, warn),
      entries: normalizeEntries(raw.entries, warn, uid),
      foods: normalizeByDate(raw.foods, 'Comidas', warn, (list, d) => {
        if (!Array.isArray(list)) { warn(`Comidas ${d}: formato no válido, se descarta`); return undefined; }
        const items = list.map((x) => normalizeFood(x, d, warn, uid, foodIds)).filter(Boolean);
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
        return out;
      }),
      library: normalizeLibrary(raw.library, warn),
    };
    return { state, warnings };
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
      let id = p.id;
      if (typeof id !== 'string' || !ID_RE.test(id) || ids.has(id)) id = uid();
      ids.add(id);
      const dim = (v) => (Number.isInteger(v) && v > 0 && v <= 20000 ? v : undefined);
      photos.push({
        id, date: p.date, pose, width: dim(p.width), height: dim(p.height),
        createdAt: Number.isFinite(p.createdAt) ? p.createdAt : 0, data: p.data,
      });
    });
    return { photos, warnings };
  }

  const api = { CURRENT_VERSION, MIGRATIONS, emptyState, migrate, normalize, normalizePhotos, profileError, isISODate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Schema = api;
})(typeof window !== 'undefined' ? window : globalThis);
