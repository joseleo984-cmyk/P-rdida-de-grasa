// COPIA «DEMO» (solo se publica en /demo/; ver scripts/build-site.js y equipo/handoffs/demo.md).
// Datos 100 % FICTICIOS para ver la app llena: un coach («Fit Demo») con 8 asesorados inventados, con historias distintas.
// Lógica sin DOM (probada en Node: tests/demo-data.test.js). Se siembra en el servidor FALSO en memoria (remote-fake.js) con las MISMAS
// funciones de la API que usa la app, así que lo que se ve es exactamente lo que vería la app con datos reales.
//   - Todo es relativo a «hoy» (la demo siempre se ve viva): se vuelve a sembrar cuando cambia el día.
//   - Nombres inventados («Ana Demo»), correos @example.com, sin teléfonos ni personas reales. Nada sale del navegador.
//   - Series con altibajos creíbles (generador pseudoaleatorio con semilla fija: mismos datos cada vez, solo cambian las fechas).
//   - Animaciones de los ejercicios: GIF animados GENERADOS aquí (figuras de palitos); las fotos de progreso son siluetas dibujadas
//     por demo.js (canvas), nunca fotos reales.
// Script clásico: expone window.PGDemoData y module.exports.
(function (root) {
  'use strict';

  const BUSINESS = 'Coach Fit Demo';
  const COACH = { key: 'coach', name: 'Coach Demo', email: 'coach.demo@example.com' };
  const INVITE_CODE = 'FTDM72';                       // 6 letras/números válidos del alfabeto de invitaciones (sin I, L, O, 0, 1)
  const BANNER = 'DEMO — datos ficticios; nada se guarda en ningún servidor';

  // ---------- Utilidades puras ----------
  const hash32 = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
  function rng(seed) {   // mulberry32
    let a = hash32(String(seed));
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // UUID con forma de v4 (8-4-4-4-12), estable para una misma etiqueta: los ids no cambian al volver a sembrar.
  function uid(tag) {
    const h = (n) => hash32(tag + '#' + n).toString(16).padStart(8, '0');
    const a = h(1), b = h(2), c = h(3), d = h(4);
    return `${a}-${b.slice(0, 4)}-4${b.slice(5, 8)}-8${c.slice(1, 4)}-${c.slice(4, 8)}${d}`;
  }
  const addDays = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  const r1 = (v) => Math.round(v * 10) / 10;
  const pick = (rnd, list) => list[Math.floor(rnd() * list.length)];
  const localDay = (d) => { const x = d || new Date(); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  // Marca de modificación de un día: mediodía UTC de ese día, pero nunca en el futuro (el servidor acota el reloj).
  const stampOf = (date, nowMs) => new Date(Math.min(Date.parse(date + 'T12:00:00Z'), nowMs - 3600000)).toISOString();

  // ---------- Personas ----------
  // weeks: semanas de historial de medidas (0 = una sola medición); last: día del último registro (0 = hoy, -2 = hace 2 días).
  // habitDays / foodDays: cuántos días de hábitos y comidas hay (hasta «last»). paid: días de pago que le quedan (negativo = no pagó).
  const PEOPLE = [
    { key: 'ana', name: 'Ana Demo', sex: 'f', w0: 78.4, loss: 5.6, weeks: 10, last: -1, adh: 0.88, habitDays: 28, foodDays: 7, started: -72, paid: 21, notes: true, waistWeekAgo: true,
      shares: { body: true, notes: true, nutrition: true, habits: true, photos: true }, photos: [[0, 'frente', 1], [0, 'perfil', 0], [4, 'frente', 1], [8, 'frente', 1], [10, 'frente', 1], [10, 'perfil', 1]], routines: ['pecho', 'piernas'], pattern: true, early: true, steady: true },
    { key: 'beto', name: 'Beto Demo', sex: 'm', w0: 96.2, loss: 6.8, weeks: 10, last: 0, adh: 0.62, habitDays: 28, foodDays: 7, started: -75, paid: 4, notes: true, hard: true,
      shares: { body: true, notes: false, nutrition: true, habits: true, photos: true }, photos: [[0, 'frente', 1], [5, 'frente', 1], [10, 'frente', 1], [10, 'espalda', 1]], routines: ['espalda'] },
    { key: 'carla', name: 'Carla Demo', sex: 'f', w0: 69.5, loss: 3.9, weeks: 10, last: -2, adh: 0.5, habitDays: 28, foodDays: 7, started: -70, paid: 14, notes: true,
      shares: { body: true, notes: true, nutrition: true, habits: false, photos: false }, photos: [[0, 'frente', 0], [9, 'frente', 0]], routines: ['piernas*', 'pecho'] },
    { key: 'diego', name: 'Diego Demo', sex: 'm', w0: 88.9, loss: 2.6, weeks: 6, last: -9, adh: 0.4, habitDays: 14, foodDays: 0, started: -48, paid: -8, notes: false,
      shares: { body: true, notes: true, nutrition: true, habits: true, photos: false }, photos: [], routines: [] },
    { key: 'elena', name: 'Elena Demo', sex: 'f', w0: 73.1, loss: 2.4, weeks: 5, last: -1, adh: 0.75, habitDays: 14, foodDays: 4, started: -38, paid: 28, notes: false,
      shares: { body: true, notes: false, nutrition: true, habits: true, photos: true }, photos: [[0, 'frente', 1], [5, 'frente', 1]], routines: ['piernas'] },
    { key: 'fabio', name: 'Fabio Demo', sex: 'm', w0: 102.4, loss: 3.1, weeks: 4, last: 0, adh: 0.7, habitDays: 10, foodDays: 4, started: -30, paid: 2, notes: false,
      shares: { body: true, notes: false, nutrition: true, habits: true, photos: false }, photos: [], routines: [] },
    { key: 'gina', name: 'Gina Demo', sex: 'f', w0: 64.8, loss: 1.5, weeks: 3, last: -3, adh: 0.55, habitDays: 7, foodDays: 2, started: -23, paid: 9, notes: false,
      shares: { body: true, notes: false, nutrition: true, habits: false, photos: false }, photos: [], routines: [] },
    { key: 'hugo', name: 'Hugo Demo', sex: 'm', w0: 91.0, loss: 0, weeks: 0, last: 0, adh: 0, habitDays: 0, foodDays: 0, started: -2, paid: 28, notes: false,
      shares: { body: true, notes: false, nutrition: true, habits: false, photos: false }, photos: [], routines: [] },
  ].map((p) => ({ ...p, email: `${p.key}.demo@example.com` }));

  // ---------- Medidas ----------
  const BASE = {
    f: { waist: 82, abdomen: 92, hip: 106, neck: 33, armR: 29.5, armL: 29, back: 38, thighR: 59, thighL: 58.5 },
    m: { waist: 96, abdomen: 103, hip: 104, neck: 39.5, armR: 35, armL: 34.5, back: 46, thighR: 61, thighL: 60.5 },
  };
  const NOTES = ['Semana de viaje, comí fuera de casa.', 'Me sentí con más energía.', 'Dormí poco esta semana.', 'Retomé las caminatas de la mañana.'];

  function buildEntries(p, today, rnd) {
    const out = new Map();
    const weeks = p.weeks;
    const base = BASE[p.sex];
    // Avance semanal acumulado (fracción de lo que baja en total), con semanas de meseta y alguna que sube un poco.
    const raw = Array.from({ length: weeks }, () => (p.steady ? 1 : rnd() * 1.6 - 0.2));   // steady: baja parejo (sin mesetas)
    const sum = raw.reduce((a, b) => a + b, 0) || 1;
    const frac = [0];
    raw.forEach((x) => frac.push(frac[frac.length - 1] + x / sum));
    const dayOf = (w) => p.last - 7 * (weeks - w);
    const add = (off, data) => { const date = addDays(today, off); if (off <= 0) out.set(date, { date, ...data }); };
    for (let w = 0; w <= weeks; w++) {
      const f = frac[w] || 0, L = p.loss;
      const e = { weight: r1(p.w0 - L * f + (rnd() - 0.5) * 0.4), abdomen: r1(base.abdomen - L * 1.2 * f + (rnd() - 0.5) * 0.8) };
      const hipNow = r1(base.hip - L * 0.6 * f + (rnd() - 0.5) * 0.7);   // siempre se consume el mismo azar (los datos de la demo no cambian de un día a otro)
      // Cintura, cadera y las demás medidas cada 2 semanas (waistWeekAgo: la última vez fue hace una semana, así hoy «toca» la cintura).
      // El azar se consume igual que siempre (solo en las semanas pares y la última): los datos de la demo no cambian de un día a otro.
      const orig = w % 2 === 0 || w === weeks;
      const nz = (k) => (orig ? rnd() : 0.5) - 0.5, place = p.waistWeekAgo ? (w % 2 === (weeks - 1) % 2 && w < weeks) : orig;
      const g = orig || place ? { waist: r1(base.waist - L * 0.9 * f + nz() * 0.8), neck: r1(base.neck - 0.4 * f + nz() * 0.3), armR: r1(base.armR - L * 0.1 * f + nz() * 0.4), armL: r1(base.armL - L * 0.1 * f + nz() * 0.4),
        back: r1(base.back - L * 0.15 * f + nz() * 0.6), thighR: r1(base.thighR - L * 0.35 * f + nz() * 0.6), thighL: r1(base.thighL - L * 0.35 * f + nz() * 0.6) } : null;
      if (place) Object.assign(e, g, { hip: hipNow });
      if (p.notes && (w === 3 || w === 7)) e.note = NOTES[(w + p.key.length) % NOTES.length];
      add(dayOf(w), e);
      // Pesajes entre semanas (solo peso), con la fluctuación normal de un día a otro.
      if (w < weeks) for (const d of [2, 4]) {
        if (rnd() < 0.2) continue;
        const fm = f + (frac[w + 1] - f) * (d / 7);
        add(dayOf(w) + d, { weight: r1(p.w0 - L * fm + (rnd() - 0.5) * 0.7) });
      }
    }
    return [...out.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  // ---------- Hábitos ----------
  // UX Etapa 1: además de agua, pasos, sueño y entreno, cada día de entreno trae su esfuerzo («Cómo te sentiste») y algunos días traen el cierre de comidas
  // («¿Registraste todo lo de hoy?»). Ana usa un patrón fijo por días seguidos (cualquier semana del calendario tiene 6 de 7 de agua y sueño, 3 de 7 de pasos y 3 entrenos)
  // para que sus insignias sean las mismas todos los días de la semana: 6 de 8, con «Pata de perro» en camino y «Volviste» sin aplicar.
  const EFFORT_CYCLE = ['normal', 'normal', 'duro', 'facil'];
  function buildHabits(p, today, rnd) {
    const out = [];
    const anchor = p.habitDays >= 28 ? 0 : p.last;   // los asesorados al día arrancan hoy (con el día a medias)
    for (let k = 0; k < p.habitDays; k++) {
      const off = anchor - k;
      const date = addDays(today, off);
      if (off === 0) { out.push({ date, water: 0.75, steps: 3150, sleep: 7.5, trained: false }); continue; }   // hoy: el día va a medias
      if (!p.pattern && k > 6 && rnd() < 0.08) continue;                                                      // algún día sin anotar
      const a = p.adh;
      let h;
      if (p.pattern) {
        h = { water: (k % 7 !== 3 ? 8 + (k % 3) : 5) * 0.25, steps: k % 7 < 3 ? 8500 + k * 40 : 4200 + (k % 5) * 500, sleep: k % 7 !== 5 ? 7 + (k % 3) / 2 : 6, trained: [0, 2, 4].includes(k % 7) };
      } else {
        const glasses = rnd() < a ? 8 + Math.floor(rnd() * 3) : 3 + Math.floor(rnd() * 5);
        h = { water: glasses * 0.25, steps: rnd() < a ? 8000 + Math.floor(rnd() * 4500) : 3000 + Math.floor(rnd() * 4500),
          sleep: rnd() < a * 0.9 ? 7 + Math.floor(rnd() * 4) / 2 : 5 + Math.floor(rnd() * 4) / 2, trained: rnd() < a * 0.8 || !!(p.hard && k < 5) };
      }
      if (h.trained) h.effort = p.hard && k < 5 ? 'duro' : EFFORT_CYCLE[(k + p.key.length) % EFFORT_CYCLE.length];
      if (k > 0 && (k % 3 === 0 || k % 5 === 0) && rnd() < 0.9) h.close = k % 5 === 0 ? 'casi' : 'si';
      out.push({ date, ...h });
    }
    // Primeros días con la plataforma (para «Primera semana»): 5 días seguidos de registro al comienzo.
    if (p.early) {
      const first = p.last - 7 * p.weeks;
      for (let k = 1; k <= 5; k++) out.push({ date: addDays(today, first + k), water: 2, steps: 7000, sleep: 7, trained: k % 2 === 0 });
    }
    return out;
  }

  // ---------- Comidas (platos del catálogo de platos.js) ----------
  const MENU = {
    desayuno: ['arepa-queso', 'arepa-con-huevo', 'huevos-pericos', 'pan-queso', 'cereal-leche', 'changua', 'calentado', 'pan-bono', 'bollo-limpio', 'sandwich-jamon-queso'],
    bebida: ['cafe-con-leche', 'tinto', 'jugo-naranja', 'avena-bebida'],
    almuerzo: ['arroz-con-pollo', 'lentejas', 'sudado-pollo', 'frijoles', 'pechuga-plancha-arroz', 'carne-guisada', 'pescado-patacon', 'sancocho-pescado', 'pollo-asado', 'sopa-pollo'],
    cena: ['ensalada-pollo', 'omelette-verduras', 'pollo-verduras', 'pescado-plancha', 'arepa-pollo', 'yogur-granola', 'ensalada-atun'],
    snack: ['banano', 'manzana', 'yogur-bebible', 'mani', 'almendras', 'papaya', 'naranja', 'queso-costeno'],
    gusto: ['hamburguesa', 'pizza', 'salchipapa', 'helado'],
  };
  const PORTIONS = ['half', 'normal', 'normal', 'normal', 'large'];
  function buildFoods(p, today, rnd, Platos) {
    const out = [];
    const anchor = p.foodDays >= 7 ? 0 : p.last;
    for (let k = 0; k < p.foodDays; k++) {
      const off = anchor - k;
      const date = addDays(today, off);
      const weekday = new Date(date + 'T12:00:00Z').getUTCDay();
      const items = [];
      const add = (id, portion, meal, time) => { const f = Platos.toFood(id, portion, { meal, time }); if (f) items.push(f); };
      add(pick(rnd, MENU.desayuno), rnd() < 0.2 ? 'half' : 'normal', 'Desayuno', '07:30');
      if (rnd() < 0.6) add(pick(rnd, MENU.bebida), 'normal', 'Desayuno', '07:35');
      if (off === 0) { if (rnd() < 0.7) add(pick(rnd, MENU.snack), 'normal', 'Snack', '10:15'); out.push(...items.map((x) => ({ ...x, date }))); continue; }   // hoy: solo la mañana
      if (rnd() < 0.7) add(pick(rnd, MENU.snack), 'normal', 'Snack', '10:30');
      if (weekday === 6 && rnd() < 0.7) add(pick(rnd, MENU.gusto), 'normal', 'Almuerzo', '13:00');   // el sábado, un gusto
      else { add(pick(rnd, MENU.almuerzo), pick(rnd, PORTIONS), 'Almuerzo', '12:45'); if (rnd() < 0.6) add('ensalada-mixta', 'normal', 'Almuerzo', '12:50'); }
      if (rnd() < 0.7) add(pick(rnd, MENU.snack), 'normal', 'Snack', '16:00');
      add(pick(rnd, MENU.cena), pick(rnd, ['half', 'normal', 'normal']), 'Cena', '19:30');
      out.push(...items.map((x) => ({ ...x, date })));
    }
    return out;
  }

  // ---------- Rutinas (plantillas del coach) ----------
  const GIFS = [
    { key: 'press', name: 'Press de banca' }, { key: 'sentadilla', name: 'Sentadilla' },
    { key: 'remo', name: 'Remo con mancuerna' }, { key: 'curl', name: 'Curl de bíceps' },
  ];
  const TEMPLATES = {
    pecho: { title: 'Pecho y tríceps', days: [
      { title: 'Día 1 – Pecho y tríceps', exercises: [
        { name: 'Press de banca', sets: '4 × 12', note: 'Baja la barra despacio, sin rebotar.', gif: 'press' },
        { name: 'Press inclinado con mancuernas', sets: '3 × 12', note: '' },
        { name: 'Aperturas con mancuernas', sets: '3 × 15', note: 'Siente el estiramiento del pecho.' },
        { name: 'Fondos en banco', sets: '3 × 12', note: '' },
        { name: 'Extensión de tríceps con cuerda', sets: '3 × 15', note: 'Codos pegados al cuerpo.' }] },
      { title: 'Día 2 – Cardio suave', exercises: [{ name: 'Caminata rápida', sets: '30 minutos', note: 'A un ritmo en el que puedas conversar.' }] }] },
    piernas: { title: 'Piernas', days: [
      { title: 'Piernas y glúteos', exercises: [
        { name: 'Sentadilla goblet', sets: '3×12', note: 'Rodillas en la dirección de los pies.', gif: 'sentadilla' },
        { name: 'Zancadas', sets: '3×10 c/lado', note: '' },
        { name: 'Peso muerto rumano', sets: '3×10', note: 'Espalda recta, baja hasta media pierna.' },
        { name: 'Puente de glúteo', sets: '3×15', note: 'Aprieta arriba un segundo.' },
        { name: 'Elevación de talones', sets: '3×15', note: '' },
        { name: 'Plancha', sets: '3×30 s', note: '' }] }] },
    espalda: { title: 'Espalda y bíceps', days: [
      { title: 'Día 1 – Espalda y bíceps', exercises: [
        { name: 'Remo con mancuerna', sets: '4 × 12', note: 'Lleva el codo hacia la cadera.', gif: 'remo' },
        { name: 'Jalón al pecho', sets: '3 × 12', note: '' },
        { name: 'Remo en polea baja', sets: '3 × 12', note: 'Hombros atrás y abajo.' },
        { name: 'Curl de bíceps', sets: '3 × 12', note: 'Sin balancear el cuerpo.', gif: 'curl' },
        { name: 'Curl martillo', sets: '3 × 12', note: '' }] },
      { title: 'Día 2 – Cardio suave', exercises: [{ name: 'Bicicleta fija', sets: '25 minutos', note: '' }] }] },
  };

  const COACH_COMMENTS = {
    ana: [
      { ago: 1, text: '¡Qué buena semana, Ana! Mantén el agua y los pasos: se nota en las medidas.', read: false },
      { ago: 8, text: 'Vas muy bien con el abdomen. Esta semana sube un poco las series de piernas.', read: true },
      { ago: 22, text: 'Gracias por mandar las fotos. Seguimos con el mismo plan.', read: true },
    ],
    beto: [{ ago: 3, text: 'Beto, recuerda anotar el agua todos los días. Vas bajando muy bien.', read: false }],
    carla: [{ ago: 5, text: 'Carla, buen trabajo. Probemos dormir una hora más esta semana.', read: true }],
  };

  // ---------- Plan completo (puro) ----------
  function buildPlan(today, { Platos } = {}) {
    const P = Platos || deps().Platos;
    const clients = PEOPLE.map((p) => {
      const rnd = rng('demo:' + p.key);
      return { ...p, entries: buildEntries(p, today, rnd), habits: buildHabits(p, today, rnd), foods: p.foodDays ? buildFoods(p, today, rnd, P) : [],
        photos: p.photos.map(([wk, pose, shared], i) => {
          const date = addDays(today, p.last - 7 * (p.weeks - wk));
          return { id: uid(`foto:${p.key}:${i}`), date: date > today ? today : date, pose, shared: shared === 1, week: wk, progress: p.weeks ? wk / p.weeks : 0, width: 360, height: 480 };
        }) };
    });
    return { today, business: BUSINESS, coach: COACH, inviteCode: INVITE_CODE, clients, templates: TEMPLATES, gifs: GIFS, daily: 'piernas' };
  }

  // ---------- GIF animado (codificador mínimo; sin dependencias) ----------
  const PALETTE = [[0xe8, 0xf1, 0xf2], [0x0f, 0x76, 0x6e], [0x47, 0x55, 0x69], [0xf5, 0x9e, 0x0b], [0xcb, 0xd5, 0xe1], [0xef, 0x44, 0x44], [0xff, 0xff, 0xff], [0x1e, 0x29, 0x3b]];
  function lzw(idx, minCode) {
    const clear = 1 << minCode, eoi = clear + 1;
    const out = [];
    let cur = 0, nbits = 0, size = minCode + 1, next = eoi + 1, dict = new Map();
    const emit = (code) => { cur |= code << nbits; nbits += size; while (nbits >= 8) { out.push(cur & 255); cur >>>= 8; nbits -= 8; } };
    emit(clear);
    let prefix = idx[0];
    for (let i = 1; i < idx.length; i++) {
      const k = idx[i], key = prefix * 256 + k, hit = dict.get(key);
      if (hit !== undefined) { prefix = hit; continue; }
      emit(prefix);
      const code = next++;
      dict.set(key, code);
      if (code === (1 << size) && size < 12) size++;
      if (next === 4096) { emit(clear); dict = new Map(); next = eoi + 1; size = minCode + 1; }
      prefix = k;
    }
    emit(prefix);
    emit(eoi);
    if (nbits > 0) out.push(cur & 255);
    return out;
  }
  // frames: arreglos de índices de paleta (w × h). Devuelve Uint8Array con un GIF89a animado y en bucle.
  function encodeGif(w, h, frames, { delay = 10, palette = PALETTE } = {}) {
    const bits = Math.max(2, Math.ceil(Math.log2(palette.length)));
    const gct = [];
    for (let i = 0; i < 1 << bits; i++) gct.push(...(palette[i] || [0, 0, 0]));
    const b = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, w & 255, w >> 8, h & 255, h >> 8, 0x80 | ((bits - 1) << 4) | (bits - 1), 0, 0, ...gct,
      0x21, 0xff, 0x0b, ...Array.from('NETSCAPE2.0', (c) => c.charCodeAt(0)), 3, 1, 0, 0, 0];
    for (const f of frames) {
      b.push(0x21, 0xf9, 4, 0x04, delay & 255, delay >> 8, 0, 0, 0x2c, 0, 0, 0, 0, w & 255, w >> 8, h & 255, h >> 8, 0, bits);
      const data = lzw(f, bits);
      for (let i = 0; i < data.length; i += 255) { const n = Math.min(255, data.length - i); b.push(n); for (let j = 0; j < n; j++) b.push(data[i + j]); }
      b.push(0);
    }
    b.push(0x3b);
    return Uint8Array.from(b);
  }
  // Figuras de palitos de lado, dibujadas sobre un arreglo de índices.
  const SZ = 120;
  function canvas() { return new Uint8Array(SZ * SZ); }
  function disc(buf, cx, cy, r, c) {
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(SZ - 1, Math.ceil(cy + r)); y++) for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(SZ - 1, Math.ceil(cx + r)); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) buf[y * SZ + x] = c;
    }
  }
  function line(buf, x0, y0, x1, y1, r, c) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let i = 0; i <= n; i++) disc(buf, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, r, c);
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  const mix = (A, B, t) => [lerp(A[0], B[0], t), lerp(A[1], B[1], t)];
  function frame(kind, t) {
    const b = canvas();
    b.fill(0);
    line(b, 8, 106, 112, 106, 2, 4);                                   // suelo
    const limb = (...pts) => { for (let i = 0; i < pts.length - 1; i++) line(b, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 3.2, 1); };
    const plate = (p) => { disc(b, p[0], p[1], 9, 7); disc(b, p[0], p[1], 7, 3); disc(b, p[0], p[1], 2, 7); };
    if (kind === 'press') {
      line(b, 20, 90, 100, 90, 3, 2); line(b, 30, 90, 30, 106, 2, 2); line(b, 92, 90, 92, 106, 2, 2);   // banco
      const sh = [44, 82], hand = [44, lerp(66, 34, t)], el = [lerp(54, 46, t), (82 + hand[1]) / 2];
      disc(b, 28, 79, 7, 1); limb([34, 82], [70, 82], [90, 74], [92, 90]); limb(sh, el, hand);
      line(b, hand[0] - 14, hand[1], hand[0] + 14, hand[1], 2, 2); plate([hand[0] - 14, hand[1]]); plate([hand[0] + 14, hand[1]]);
    } else if (kind === 'sentadilla') {
      const hip = mix([56, 58], [42, 82], t), knee = mix([58, 80], [72, 82], t), ank = [56, 104], sh = mix([57, 28], [66, 52], t);
      limb(hip, knee, ank); limb(hip, sh); disc(b, sh[0] + 3, sh[1] - 11, 7, 1);
      line(b, sh[0] - 16, sh[1] - 2, sh[0] + 18, sh[1] - 2, 2, 2); plate([sh[0] - 17, sh[1] - 2]); plate([sh[0] + 19, sh[1] - 2]);
    } else if (kind === 'remo') {
      const hip = [42, 68], sh = [78, 50], knee = [52, 88], ank = [48, 104];
      limb(hip, knee, ank); limb(hip, sh); disc(b, 88, 44, 7, 1);
      const hand = mix([80, 92], [70, 62], t), el = mix([80, 72], [58, 58], t);
      limb(sh, el, hand); plate(hand);
      line(b, 62, 104, 98, 104, 3, 4);
    } else {   // curl
      const hip = [58, 70], sh = [58, 38], el = [64, 60], hand = mix([66, 84], [82, 50], t);
      limb([58, 104], hip); limb([58, 104], [66, 104]); limb(hip, sh); disc(b, 58, 26, 7, 1);
      limb(sh, el, hand); plate(hand);
    }
    return b;
  }
  function makeGif(kind, frames = 8) {
    const fr = [];
    for (let i = 0; i < frames; i++) fr.push(frame(kind, 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / frames)));
    return encodeGif(SZ, SZ, fr, { delay: 9 });
  }

  // ---------- Dependencias (navegador: globales; Node: require) ----------
  function deps() {
    const get = (n, f) => root[n] || (typeof require === 'function' ? require(f) : null);
    return { RemoteFake: get('RemoteFake', './remote-fake.js'), Platos: get('Platos', './platos.js'), Schema: get('Schema', './schema.js'),
      Sync: get('Sync', './sync.js'), CT: get('ConsentTexts', './consent-texts.js'), Rutinas: get('Rutinas', './rutinas.js') };
  }
  async function sha256(text) {
    const c = (typeof crypto !== 'undefined' && crypto.subtle) ? crypto : require('node:crypto').webcrypto;
    const buf = await c.subtle.digest('SHA-256', new TextEncoder().encode(String(text).replace(/\r\n?/g, '\n')));
    return Array.from(new Uint8Array(buf), (x) => x.toString(16).padStart(2, '0')).join('');
  }
  // Un «teléfono» en memoria con la sesión de esa persona (sin código por correo ni captcha: es el servidor falso).
  function asUser(be, user, D) {
    const m = { [D.RemoteFake.SESSION_KEY]: JSON.stringify({ user: { id: user.id, email: user.email }, issuedAt: be.clock.now() }) };
    const mem = { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
    return D.RemoteFake.createFake({ backend: be, storage: mem });
  }

  // ---------- Siembra del servidor falso ----------
  // `be` = FakeBackend vacío. Devuelve la lista de personas con sus ids: { today, coach, clients: { key: { id, email, name } }, code }.
  async function seed(be, { today = localDay(), deps: D = deps() } = {}) {
    const { CT, Schema, Sync } = D;
    const plan = buildPlan(today, { Platos: D.Platos });
    const nowMs = be.clock.now();
    const iso = (ms) => new Date(ms).toISOString();
    const dayMs = (off) => nowMs + off * 86400000;
    const ev = async (kind, id, vars, at, extra = {}) => ({ kind, granted: true, version: CT.version(id), textHash: await sha256(CT.fullText(id, vars)), clientAt: iso(at), ...extra });
    const makeUser = (p) => {
      const id = uid('usuario:' + p.key);
      be.users[p.email] = { id, email: p.email, createdAt: iso(dayMs(p.started || -90)) };
      be.profiles[id] = { displayName: p.name };
      return { id, email: p.email, name: p.name };
    };

    // --- Coach: acuerdo aceptado, negocio, código de invitación ---
    const coachU = makeUser({ ...COACH, started: -90 });
    const rc = asUser(be, coachU, D);
    await rc.account.joinApp();
    await rc.account.recordConsents([await ev('sensitive_health', 'AU', {}, dayMs(-90)), await ev('cloud_transfer', 'AU', {}, dayMs(-90)), await ev('coach_agreement', 'A7', {}, dayMs(-89))]);
    await rc.coach.becomeCoach(BUSINESS);
    Object.assign(be.coaches[coachU.id], { inviteCode: INVITE_CODE, freeClients: 50, createdAt: iso(dayMs(-89)), codeRotatedAt: iso(dayMs(-89)) });

    // --- Animaciones, plantillas, «Rutina de hoy» ---
    const gifId = {};
    for (const g of GIFS) gifId[g.key] = (await rc.coach.uploadGif(new Blob([makeGif(g.key)], { type: 'image/gif' }), g.name)).id;
    const tplId = {};
    for (const [key, t] of Object.entries(TEMPLATES)) {
      const days = t.days.map((d) => ({ title: d.title, exercises: d.exercises.map((e) => ({ ...e, gif: e.gif ? gifId[e.gif] : '' })) }));
      tplId[key] = (await rc.coach.saveTemplate(null, { title: t.title, days })).id;
    }

    // --- Asesorados ---
    const clients = {};
    for (const c of plan.clients) {
      const u = makeUser(c);
      clients[c.key] = { ...u, key: c.key };
      const r = asUser(be, u, D);
      await r.account.joinApp();
      const at = dayMs(c.started);
      const consents = [await ev('adult', 'A1', {}, at), await ev('terms', 'A2', { legalVersion: Schema.LEGAL_VERSIONS.terms }, at), await ev('privacy', 'A2', { legalVersion: Schema.LEGAL_VERSIONS.privacy }, at),
        await ev('sensitive_health', 'AU', {}, at), await ev('cloud_transfer', 'AU', {}, at)];
      if (c.photos.length) consents.push(await ev('photos_cloud', 'A6a', {}, at + 60000));
      if (c.shares.photos) consents.push(await ev('photo_view_coach', 'A6b', { coach: BUSINESS }, at + 120000, { coachId: coachU.id }));
      await r.account.recordConsents(consents);
      const shareText = await sha256(CT.fullText(CT.shareId(true), { coach: BUSINESS }));
      await r.client.joinCoach(INVITE_CODE, { ...c.shares, version: CT.version(CT.shareId(true)), textHash: shareText });
      const link = be.activeLink(u.id);
      link.createdAt = iso(at + 180000); link.updatedAt = link.createdAt;
      be.setPaidUntil(c.email, addDays(be.todayBogota(), Math.max(c.paid, 1)));   // para poder subir; el valor final se pone abajo

      // Datos: se normalizan con el mismo esquema de la app (lo inválido se descartaría) y se suben como registros.
      const state = Schema.normalize({
        entries: c.entries.map((e) => ({ ...e, id: uid(`medida:${c.key}:${e.date}`), updatedAt: stampOf(e.date, nowMs) })),
        habits: Object.fromEntries(c.habits.map((h) => { const { date, ...x } = h; return [date, { ...x, id: uid(`habito:${c.key}:${date}`), updatedAt: stampOf(date, nowMs) }]; })),
        foods: c.foods.reduce((acc, f, i) => { const { date, ...x } = f; (acc[date] ||= []).push({ ...x, id: uid(`comida:${c.key}:${date}:${i}`), updatedAt: stampOf(date, nowMs) }); return acc; }, {}),
      }, { uid: () => uid('relleno:' + c.key + Math.random()) });
      const wire = Sync.toWire(state.state, { userId: u.id });
      const photos = c.photos.map((p) => ({ id: p.id, date: p.date, pose: p.pose, width: p.width, height: p.height, sharedWithCoach: p.shared && c.shares.photos,
        createdAt: stampOf(p.date, nowMs), updatedAt: stampOf(p.date, nowMs) }));
      if (wire.length || photos.length) await r.sync.push({ records: wire, photos });
      // «Última actividad» de verdad: lo que el servidor marca como recibido es el día del registro, no el de la siembra.
      for (const row of Object.values(be.records)) if (row.userId === u.id) row.serverUpdatedAt = row.updatedAt;
      for (const row of Object.values(be.photos)) if (row.userId === u.id) row.serverUpdatedAt = row.updatedAt;
      be.setPaidUntil(c.email, addDays(be.todayBogota(), c.paid));
      be.activeLink(u.id).paidMarkedAt = iso(dayMs(Math.min(0, c.paid - 30)));
      c.__id = u.id;
    }

    // --- Rutinas asignadas (una oculta) y «Rutina de hoy» ---
    for (const c of plan.clients) for (const spec of c.routines) {
      const hidden = spec.endsWith('*');
      const key = spec.replace('*', '');
      const [row] = await rc.coach.assignTemplate(tplId[key], [clients[c.key].id]);
      if (hidden) await rc.coach.setRoutineVisible(row.id, false);
    }
    await rc.coach.publishDaily(tplId[plan.daily], today);

    // --- Mensajes del coach y bitácora «Quién vio mis fotos» ---
    for (const [key, list] of Object.entries(COACH_COMMENTS)) for (const [i, c] of list.entries()) {
      const cm = await rc.coach.addComment(clients[key].id, { id: uid(`mensaje:${key}:${i}`), body: c.text, refDate: addDays(today, -c.ago) });
      const row = be.comments[cm.id];
      row.createdAt = iso(dayMs(-c.ago) - 3600000 * 2); row.readAt = c.read ? iso(dayMs(-c.ago) + 3600000) : null;
      row.serverUpdatedAt = row.createdAt;
    }
    const ana = plan.clients.find((c) => c.key === 'ana');
    [[1, 0], [3, 2], [8, 4], [15, 3]].forEach(([ago, n], i) => {
      const ph = ana.photos[n];
      be.photoViews.push({ id: uid(`vista:ana:${i}`), photoId: ph.id, coachId: coachU.id, clientId: clients.ana.id, viewedAt: iso(dayMs(-ago) - 3600000 * (3 + i)) });
    });
    be._persist();
    return { today, coach: coachU, code: INVITE_CODE, clients, plan: { photos: Object.fromEntries(plan.clients.map((c) => [c.key, c.photos])) } };
  }

  // ---------- Lo que guarda cada «teléfono» ----------
  // Estado local (v1), autorizaciones de la cuenta y fotos de una persona, leídos del servidor falso por la misma API de la app.
  async function localFor(be, who, { deps: D = deps(), now = Date.now() } = {}) {
    const { Schema, Sync, CT } = D;
    const r = asUser(be, who, D);
    const roles = await r.account.roles();
    const wire = [], photos = [];
    let cursor = null;
    for (let i = 0; i < 50; i++) {
      const page = await r.sync.pull(cursor, { limit: 1000, overlap: false });
      wire.push(...page.records);
      photos.push(...page.photos);
      if (!page.hasMore) break;
      cursor = page.cursor;
    }
    const iso = new Date(now).toISOString();
    const state = { ...Sync.remoteState(wire), consent: Schema.buildConsent({ terms: true, privacy: true, adult: true, sensitiveHealth: true, photos: true }, iso) };
    let meta = CT.mergeServer({}, await r.account.consents());
    meta = { ...meta, userId: who.id, email: who.email, roles, onboarded: true, cloudAsked: true, displayName: who.name, consentQueue: [] };
    if (roles.includes('coach')) meta.coach = await r.coach.myCoach();
    else { meta.link = await r.client.myLink(); meta.shareVersion = CT.version(CT.shareId(true)); }
    return { state, meta, photos: photos.filter((p) => !p.deletedAt), session: { user: { id: who.id, email: who.email }, issuedAt: now } };
  }

  const api = { BUSINESS, COACH, PEOPLE, INVITE_CODE, BANNER, TEMPLATES, GIFS, PALETTE, buildPlan, seed, localFor, asUser, makeGif, encodeGif, lzw, uid, rng, addDays, localDay, stampOf, sha256, deps };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PGDemoData = api;
})(typeof window !== 'undefined' ? window : globalThis);
