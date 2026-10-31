// Logros (insignias v4, diseño B «Escudo por categoría»: equipo/diseno/v4-insignias/). Lógica PURA y dibujos SVG en texto (sin DOM;
// pruebas en tests/logros.test.js). Todo se calcula en el teléfono con lo que ya existe en `state` (hábitos, comidas, medidas), como constancia.js.
// Reglas (gamificacion.md §1.5 y ux.md §1, con las decisiones de equipo/handoffs/insignias-b.md):
//   · 6 categorías con su silueta: Primeros pasos (círculo), Constancia (rombo), Hábitos (hexágono), Entreno (escudo), Registro (libreta), Retos (estrella).
//   · SOLO de proceso: nunca por peso, centímetros, kcal ni fotos (las fotos ni se leen). Ninguna pide 7 de 7 ni premia hacer de más.
//   · Niveles bronce, plata y oro por SEMANAS en que se repite el logro: 1, 4 y 12 (no tienen que ser seguidas). Nunca por cantidad.
//     Los hitos (Primeros pasos) y «Volviste» no tienen nivel: «Volviste» nunca sube, porque premiar volver muchas veces sería premiar irse.
//   · Nunca se pierde un nivel: lo ganado se recuerda (memoria por cuenta, en el teléfono) aunque luego se borre un registro.
//   · Las 8 insignias de antes conservan su identificador y su fecha: su regla de siempre es el BRONCE (o el hito) de la nueva.
//   · «Equipo»: semanas en que el team cumplió la meta colectiva (grasa.my_team_goal) y la persona sumó (sin opt-out, comparte hábitos y comidas
//     y tiene algo propio esa semana en grasa.my_points). Solo se ve el agregado: nunca el aporte de nadie.
//   · «Reto cumplido»: retos del coach (grasa.my_challenges) con las marcas de la persona.
//   · Fuera (faltan datos): «Técnica primero» (no se registra que se vio la técnica) y «Te escucho» (no hay check-in semanal).
(function (root) {
  'use strict';
  const C = typeof module !== 'undefined' && module.exports ? require('./constancia.js') : root.Constancia;
  const { addDays, dayNum, weekStart } = C;
  const NEED = [0, 1, 4, 12];
  const LEVEL = ['', 'Bronce', 'Plata', 'Oro'];
  const LK = ['t', 'b', 's', 'g'];   // clave de metal: t = hito (turquesa), b = bronce, s = plata, g = oro
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const dm = (iso) => (iso ? `${Number(iso.slice(8, 10))} ${MES[Number(iso.slice(5, 7)) - 1]}` : '');
  const plural = (n, u) => `${n} ${n === 1 ? u[0] : u[1]}`;

  // ---------- Catálogo ----------
  const CATS = [
    { k: 'pp', name: 'Primeros pasos', shape: 'circ' },
    { k: 'con', name: 'Constancia', shape: 'rombo' },
    { k: 'hab', name: 'Hábitos', shape: 'hex' },
    { k: 'ent', name: 'Entreno', long: 'Entreno y descanso', shape: 'shield' },
    { k: 'reg', name: 'Registro', shape: 'square' },
    { k: 'ret', name: 'Retos', shape: 'star' },
  ];
  const DIAS = ['día', 'días'], NOCHES = ['noche', 'noches'], ENTRENOS = ['entreno', 'entrenos'], HABITOS = ['hábito', 'hábitos'];
  const SINCE = 'no tienen que ser seguidas';
  // what: «Qué es» (lo que se cumple en UNA semana para los de nivel). old: la descripción de antes (la del bronce o el hito; se muestra al ganarla).
  const CATALOG = [
    { id: 'arranco', cat: 'pp', name: 'Arrancó el parche', glyph: 'flag', hito: true, what: 'Tu primer día con algún registro.', old: 'Primer día registrado' },
    { id: 'primera-semana', cat: 'pp', name: 'Primera semana', glyph: 'cal7', hito: true, what: '4 días con registro en tus primeros 7 días.', old: '4 días con registro en tus primeros 7 días' },
    { id: 'primer-mes', cat: 'pp', name: 'Primer mes', glyph: 'cal30', hito: true, what: 'Un mes acompañándote, con al menos 12 días con registro.', old: 'Un mes acompañándote, con al menos 12 días con registro' },
    { id: 'semanas-constantes', cat: 'con', name: 'Semanas constantes', glyph: 'chain', what: 'Una semana con 4 días o más con registro (tus comodines cuentan).', unit: DIAS, of: 4, more: 'con registro',
      note: 'Cuenta tu constancia, no la cantidad: 4 días o 7 valen lo mismo.' },
    { id: 'volviste', cat: 'con', name: 'Volviste', glyph: 'back', hito: true, what: 'Retomaste después de una semana o más sin registrar. No tiene niveles: lo que cuenta es volver.', old: 'Retomaste después de una semana o más sin registrar' },
    { id: 'registro-honesto', cat: 'con', name: 'Registro honesto', glyph: 'heart', what: 'Anotar tus hábitos 3 días de una semana aunque no llegaras a la meta. Ser sincero/a cuenta más que ser perfecto/a.', unit: DIAS, of: 3, more: 'anotando tus hábitos',
      note: 'Cuenta tu constancia, no la cantidad: anotar lo real vale más que un día perfecto.' },
    { id: 'hidratado', cat: 'hab', name: 'Hidratado/a', glyph: 'drop', what: 'Cumplir tu meta de agua 5 días de una semana.', unit: DIAS, of: 5, more: 'con tu meta de agua', old: 'Cumpliste el agua 5 días de una semana',
      note: 'Cuenta tu constancia, no la cantidad: 8 vasos o 12 valen lo mismo.' },
    { id: 'pata-de-perro', cat: 'hab', name: 'Pata de perro', glyph: 'paw', what: 'Cumplir tu meta de pasos 5 días de una semana.', unit: DIAS, of: 5, more: 'con tu meta de pasos', old: 'Cumpliste los pasos 5 días de una semana',
      note: 'Cuenta tu constancia, no la cantidad: 8.000 pasos o 20.000 valen lo mismo.' },
    { id: 'buen-dormir', cat: 'hab', name: 'Buen dormir', glyph: 'moon', what: 'Dormir entre 7 y 10 h en 5 noches de una semana.', unit: NOCHES, of: 5, more: 'de 7 a 10 h', old: 'Dormiste entre 7 y 10 h en 5 noches de una semana',
      note: 'Cuenta tu constancia, no la cantidad: dormir más de 10 h no suma más.' },
    { id: 'semana-redonda', cat: 'hab', name: 'Semana redonda', glyph: 'round', what: 'Una semana con agua, pasos, sueño y 2 comidas registradas, cada uno al menos 4 días.', unit: HABITOS, of: 4, more: 'con 4 días',
      note: 'Cuenta tu constancia, no la cantidad: 4 días de cada hábito bastan.' },
    { id: 'tres-de-tres', cat: 'ent', name: 'Tres de tres', glyph: 'dumb', what: '3 entrenos en una semana.', unit: ENTRENOS, of: 3, more: '', old: '3 entrenos en una semana',
      note: 'Cuenta tu constancia, no la cantidad: entrenar 6 o 7 días no suma más.' },
    { id: 'entrenos-acumulados', cat: 'ent', name: 'Entrenos acumulados', glyph: 'tally', what: 'Una semana con al menos un entreno.', unit: ENTRENOS, of: 1, more: '',
      note: 'Cuenta tu constancia, no la cantidad: un entreno o cinco en la semana valen lo mismo.' },
    { id: 'descanso-inteligente', cat: 'ent', name: 'Descanso inteligente', glyph: 'leaf', what: 'Una semana en la que marcaste «Hoy es mi día de descanso». Descansar según tu plan también cuenta.', unit: DIAS, of: 1, more: 'de descanso',
      note: 'Cuenta tu constancia, no la cantidad: un día de descanso por semana basta.' },
    { id: 'tecnica-primero', cat: 'ent', name: 'Técnica primero', glyph: 'eye', what: 'Una semana en la que abriste «Cómo se hace» en todos los ejercicios de un día de tu rutina.', unit: ['ejercicio', 'ejercicios'], more: '', note: 'Cuenta tu constancia, no la cantidad: ver la técnica una vez por semana basta.' },
    { id: 'te-escucho', cat: 'reg', name: 'Te escucho', glyph: 'chat', what: 'Una semana en la que respondiste «¿Cómo te sentiste esta semana?». Tu respuesta es privada y no cambia nada.', unit: DIAS, of: 1, more: '', note: 'Cuenta tu constancia, no la cantidad: una respuesta por semana basta.' },
    { id: 'plato-a-plato', cat: 'reg', name: 'Plato a plato', glyph: 'plate', what: 'Registrar al menos 2 comidas en 4 días de una semana. Las calorías no importan.', unit: DIAS, of: 4, more: 'con 2 comidas registradas',
      note: 'Cuenta tu constancia, no la cantidad: las calorías no importan.' },
    { id: 'midiendo-con-cabeza', cat: 'reg', name: 'Midiendo con cabeza', glyph: 'tape', what: 'Registrar tus medidas una vez en la semana, con 6 días o más desde la anterior. Nunca cuenta el resultado.', unit: ['registro', 'registros'], of: 1, more: '',
      note: 'Cuenta tu constancia, no la cantidad: medirte más seguido no suma, y el resultado nunca cuenta.' },
    { id: 'reto-cumplido', cat: 'ret', name: 'Reto cumplido', glyph: 'star', what: 'Una semana en la que cumpliste un reto de tu coach.', unit: DIAS, more: '',
      note: 'Cuenta tu constancia, no la cantidad: un reto por semana basta.' },
    { id: 'equipo', cat: 'ret', name: 'Equipo', glyph: 'team', what: 'Una semana en la que el team cumplió su meta y tú sumaste. Nadie ve cuánto suma cada persona.', unit: DIAS, more: '',
      note: 'Cuenta tu constancia, no la cantidad: nadie ve cuánto sumas tú.' },
  ];
  // Del catálogo propuesto, fuera por falta de datos (no se inventa nada): ver equipo/handoffs/insignias-b.md.
  const FUERA = [];   // ya no falta ninguna: «Técnica primero» y «Te escucho» se construyeron con datos locales (ver equipo/handoffs/insignias-b2.md)
  const OLD_IDS = ['arranco', 'primera-semana', 'primer-mes', 'hidratado', 'pata-de-perro', 'buen-dormir', 'tres-de-tres', 'volviste'];
  const byId = Object.fromEntries(CATALOG.map((b) => [b.id, b]));

  // ---------- Datos por semana (lunes) ----------
  const pos = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
  const habitOf = (state, d) => { const h = state && state.habits && state.habits[d]; return h && typeof h === 'object' ? h : null; };
  const hasMeasure = (e) => ['weight', 'waist', 'abdomen', 'hip', 'neck', 'armR', 'armL', 'back', 'thighR', 'thighL', 'bodyFat'].some((k) => typeof e[k] === 'number');
  function weeks(state, today) {
    const per = {};
    const W = (d) => (per[weekStart(d)] ||= { water: [], steps: [], sleep: [], trained: [], rest: [], foods2: [], honest: [], meas: [] });
    const days = new Set();
    for (const d of Object.keys((state && state.habits) || {})) if (d <= today && habitOf(state, d)) days.add(d);
    for (const d of Object.keys((state && state.foods) || {})) if (d <= today && Array.isArray(state.foods[d]) && state.foods[d].length >= 2) days.add(d);
    const meas = new Set();
    for (const e of (state && state.entries) || []) if (e && e.date && e.date <= today && hasMeasure(e)) meas.add(e.date);
    for (const d of [...days].sort()) {
      const h = habitOf(state, d);
      const w = W(d);
      if (h) {
        const ok = C.dayDone(state, d).names;
        if (ok.includes('agua')) w.water.push(d);
        if (ok.includes('pasos')) w.steps.push(d);
        if (ok.includes('sueño')) w.sleep.push(d);
        if (ok.includes('entreno')) w.trained.push(d);
        if (h.rest === 'plan' && h.trained !== true) w.rest.push(d);
        // Registro honesto: anotó agua, pasos o sueño y alguno de los que anotó no llegó a la meta.
        const noted = [['agua', pos(h.water)], ['pasos', pos(h.steps)], ['sueño', pos(h.sleep)]].filter(([, v]) => v > 0).map(([k]) => k);
        if (noted.length && noted.some((k) => !ok.includes(k))) w.honest.push(d);
      }
      const f = state && state.foods && state.foods[d];
      if (Array.isArray(f) && f.length >= 2) w.foods2.push(d);
    }
    for (const d of [...meas].sort()) W(d).meas.push(d);
    return per;
  }
  // Semanas que cumplen `ok(w)` (orden por semana) con la fecha en que se cumplió → nivel, fechas de cada nivel y cuántas semanas.
  function fromWeeks(per, ok) {
    const q = [];
    for (const wk of Object.keys(per).sort()) { const date = ok(per[wk]); if (date) q.push({ wk, date }); }
    return q;
  }
  function leveled(q) {
    const count = q.length;
    const level = count >= NEED[3] ? 3 : count >= NEED[2] ? 2 : count >= 1 ? 1 : 0;
    return { count, level, dates: [null, q[0] ? q[0].date : null, q[3] ? q[3].date : null, q[11] ? q[11].date : null] };
  }
  const nth = (xs, n) => (xs.length >= n ? xs[n - 1] : null);
  const maxDate = (...xs) => (xs.some((x) => !x) ? null : xs.sort()[xs.length - 1]);

  // ---------- Cálculo ----------
  // ctx: { tecnica: { seen: { día: [nombres] }, days: [[nombres del día de rutina]] }, checkins: { lunes: día }, pauses, retos: [{ id, start, end, target, habit, marks }], memory: { levels, retos, equipo }, retosOn (mostrar Retos), coach (vista del coach) }
  function compute(state, today, ctx = {}) {
    const mem = normMemory(ctx.memory);
    const per = weeks(state, today);
    const cw = per[weekStart(today)] || { water: [], steps: [], sleep: [], trained: [], rest: [], foods2: [], honest: [], meas: [] };
    const rec = [...C.recordDates(state)].filter((d) => d <= today).sort();
    const first = rec[0] || null;
    const raw = {};
    // Primeros pasos (hitos)
    raw.arranco = { hito: true, date: first };
    const inFirst = first ? rec.filter((d) => dayNum(d) - dayNum(first) < 7) : [];
    raw['primera-semana'] = { hito: true, date: inFirst.length >= 4 ? inFirst[3] : null,
      cur: first && dayNum(today) - dayNum(first) < 7 ? { done: Math.min(4, inFirst.length), of: 4, unit: DIAS } : null };
    const lim = first ? addDays(first, 30) : null;
    raw['primer-mes'] = { hito: true, date: first && lim <= today && rec.length >= 12 ? lim : null,
      cur: !first ? null : rec.length < 12 ? { done: rec.length, of: 12, unit: ['día con registro', 'días con registro'] } : { done: Math.min(30, dayNum(today) - dayNum(first)), of: 30, unit: DIAS } };
    // Constancia
    const fz = C.frozenDays(ctx.pauses, today), dates = new Set(rec);
    const cq = [];
    if (first) for (let wk = weekStart(first); wk <= today; wk = addDays(wk, 7)) {
      const w = C.weekOf(dates, wk, today, fz);
      if (w.constant) { const reg = w.days.filter((d) => d.registered).map((d) => d.date); cq.push({ wk, date: reg[reg.length - 1] || wk }); }
    }
    const curConst = C.weekOf(dates, weekStart(today), today, fz);
    raw['semanas-constantes'] = { ...leveled(cq), cur: { done: Math.min(4, curConst.counted), of: 4, unit: DIAS } };
    let back = null;
    for (let i = 1; i < rec.length; i++) if (dayNum(rec[i]) - dayNum(rec[i - 1]) > 7) { back = rec[i]; break; }
    raw.volviste = { hito: true, date: back };
    raw['registro-honesto'] = { ...leveled(fromWeeks(per, (w) => nth(w.honest, 3))), cur: { done: cw.honest.length, of: 3, unit: DIAS } };
    // Hábitos
    raw.hidratado = { ...leveled(fromWeeks(per, (w) => nth(w.water, 5))), cur: { done: cw.water.length, of: 5, unit: DIAS } };
    raw['pata-de-perro'] = { ...leveled(fromWeeks(per, (w) => nth(w.steps, 5))), cur: { done: cw.steps.length, of: 5, unit: DIAS } };
    raw['buen-dormir'] = { ...leveled(fromWeeks(per, (w) => nth(w.sleep, 5))), cur: { done: cw.sleep.length, of: 5, unit: NOCHES } };
    const four = (w) => [w.water, w.steps, w.sleep, w.foods2];
    raw['semana-redonda'] = { ...leveled(fromWeeks(per, (w) => maxDate(...four(w).map((xs) => nth(xs, 4))))),
      cur: { done: four(cw).filter((xs) => xs.length >= 4).length, of: 4, unit: HABITOS } };
    // Entreno y descanso
    raw['tres-de-tres'] = { ...leveled(fromWeeks(per, (w) => nth(w.trained, 3))), cur: { done: cw.trained.length, of: 3, unit: ENTRENOS } };
    raw['entrenos-acumulados'] = { ...leveled(fromWeeks(per, (w) => nth(w.trained, 1))), cur: null };
    raw['descanso-inteligente'] = { ...leveled(fromWeeks(per, (w) => nth(w.rest, 1))), cur: null };
    // Registro
    raw['plato-a-plato'] = { ...leveled(fromWeeks(per, (w) => nth(w.foods2, 4))), cur: { done: cw.foods2.length, of: 4, unit: DIAS } };
    const mq = [];
    let last = null;
    for (const wk of Object.keys(per).sort()) for (const d of per[wk].meas) {
      if (mq.length && mq[mq.length - 1].wk === wk) break;
      if (!last || dayNum(d) - dayNum(last) >= 6) { mq.push({ wk, date: d }); last = d; break; }
    }
    raw['midiendo-con-cabeza'] = { ...leveled(mq), cur: null };
    // Retos: los del coach (con mis marcas) + los que ya se cumplieron (memoria: la API solo trae los de las 2 últimas semanas).
    const met = { ...mem.retos };
    let active = null;
    for (const c of Array.isArray(ctx.retos) ? ctx.retos : []) {
      if (!c || !c.id || !c.start || !c.end || !Number.isInteger(c.target)) continue;
      const marks = [...new Set((c.marks || []).filter((d) => d >= c.start && d <= c.end && d <= today))].sort();
      if (marks.length >= c.target) { const d = marks[c.target - 1]; if (!met[c.id] || d < met[c.id]) met[c.id] = d; }
      else if (c.start <= today && c.end >= today && (!active || marks.length / c.target > active.done / active.of)) {
        active = { done: marks.length, of: c.target, unit: c.habit === 'sleep' ? NOCHES : c.habit === 'trained' ? ENTRENOS : DIAS };
      }
    }
    const rq = {};
    for (const d of Object.values(met)) { const wk = weekStart(d); if (!rq[wk] || d < rq[wk]) rq[wk] = d; }
    raw['reto-cumplido'] = { ...leveled(Object.keys(rq).sort().map((wk) => ({ wk, date: rq[wk] }))), cur: active, met };
    // Técnica primero: semana en la que se abrió «Cómo se hace» de TODOS los ejercicios de algún día de la rutina (datos de este teléfono).
    const tec = ctx.tecnica || {}, seenD = tec.seen && typeof tec.seen === 'object' ? tec.seen : {}, tq = {};
    for (const names of Array.isArray(tec.days) ? tec.days : []) {
      const need = [...new Set((Array.isArray(names) ? names : []).filter((n) => typeof n === 'string' && n.trim()))];
      if (!need.length) continue;
      const first = {};   // semana → nombre → primer día visto esa semana
      for (const d of Object.keys(seenD).sort()) if (d <= today && Array.isArray(seenD[d])) for (const n of seenD[d]) { const w = (first[weekStart(d)] ||= {}); if (!w[n]) w[n] = d; }
      for (const wk of Object.keys(first)) if (need.every((n) => first[wk][n])) { const d = need.map((n) => first[wk][n]).sort().pop(); if (!tq[wk] || d < tq[wk]) tq[wk] = d; }
    }
    raw['tecnica-primero'] = { ...leveled(Object.keys(tq).sort().map((wk) => ({ wk, date: tq[wk] }))), cur: null };
    // Te escucho: semanas con una respuesta al check-in semanal ({ lunes: 'AAAA-MM-DD' }).
    const ck = ctx.checkins && typeof ctx.checkins === 'object' ? ctx.checkins : {}, eq = {};
    for (const d of Object.values(ck)) if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today) { const wk = weekStart(d); if (!eq[wk] || d < eq[wk]) eq[wk] = d; }
    raw['te-escucho'] = { ...leveled(Object.keys(eq).sort().map((wk) => ({ wk, date: eq[wk] }))), cur: null };
    raw.equipo = { ...leveled(Object.keys(mem.equipo).sort().map((wk) => ({ wk, date: mem.equipo[wk] }))), cur: null };

    // Nunca se pierde un nivel: lo recordado se une a lo calculado (la fecha más temprana).
    const list = [];
    for (const def of CATALOG) {
      if (def.cat === 'ret' && !ctx.retosOn) continue;
      const r = raw[def.id];
      const m = mem.levels[def.id] || {};
      let level, dates, count;
      if (def.hito) {
        const d = [r.date, m[1]].filter(Boolean).sort()[0] || null;
        level = d ? 1 : 0; dates = [null, d, null, null]; count = level;
      } else {
        dates = [null, 1, 2, 3].map((L) => (L ? [r.dates[L], m[L]].filter(Boolean).sort()[0] || null : null));
        level = dates[3] ? 3 : dates[2] ? 2 : dates[1] ? 1 : 0;
        count = Math.max(r.count, NEED[level]);
      }
      const cur = r.cur && r.cur.of ? { ...r.cur, done: Math.min(r.cur.done, r.cur.of) } : null;
      const b = { id: def.id, cat: def.cat, name: def.name, glyph: def.glyph, hito: !!def.hito, level, dates, count, date: dates[level] || null, cur, old: def.old || '' };
      b.earned = level >= 1;
      b.next = !b.hito && level < 3 ? { level: level + 1, need: NEED[level + 1], count } : null;
      b.state = b.earned ? 'earned' : cur && cur.done > 0 && cur.done < cur.of ? 'progress' : 'locked';
      if (def.id === 'primera-semana' && !b.earned && !cur) b.state = 'locked';
      list.push(b);
    }
    const cats = CATS.map((c) => {
      const items = list.filter((b) => b.cat === c.k);
      return { ...c, items, earned: items.filter((b) => b.earned).length, total: items.length };
    }).filter((c) => c.items.length);
    return { list, cats, earned: list.filter((b) => b.earned).length, total: list.length, near: near(list), met };
  }

  // «Te falta poco»: lo que más avanzó ESTA semana sin completarse (y que aún puede subir de nivel o ganarse).
  function near(list) {
    let best = null;
    for (const b of list) {
      if (!b.cur || b.cur.done <= 0 || b.cur.done >= b.cur.of) continue;
      if (b.hito ? b.earned : b.level >= 3) continue;
      const pct = b.cur.done / b.cur.of;
      if (!best || pct > best.pct) best = { b, pct };
    }
    return best ? best.b : null;
  }

  // ---------- Memoria (lo ganado nunca se pierde; qué niveles ya se celebraron) ----------
  function normMemory(m) {
    const o = m && typeof m === 'object' ? m : {};
    const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
    const iso = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
    const levels = {};
    for (const [id, v] of Object.entries(obj(o.levels))) if (byId[id]) { const l = {}; for (const L of [1, 2, 3]) if (iso(obj(v)[L])) l[L] = v[L]; levels[id] = l; }
    const clean = (x) => Object.fromEntries(Object.entries(obj(x)).filter(([k, v]) => typeof k === 'string' && k.length <= 64 && iso(v)));
    const seen = Object.fromEntries(Object.entries(obj(o.seen)).filter(([k, v]) => byId[k] && Number.isInteger(v) && v >= 0 && v <= 3));
    return { levels, retos: clean(o.retos), equipo: Object.fromEntries(Object.entries(clean(o.equipo)).filter(([k]) => /^\d{4}-\d{2}-\d{2}$/.test(k))), seen, init: o.init === true };
  }
  // Devuelve la memoria con lo ganado ahora (niveles con fecha y retos cumplidos).
  function remember(memory, res) {
    const m = normMemory(memory);
    for (const b of res.list) {
      if (!b.earned) continue;
      const l = { ...(m.levels[b.id] || {}) };
      for (const L of [1, 2, 3]) if (b.dates[L] && (!l[L] || b.dates[L] < l[L])) l[L] = b.dates[L];
      m.levels[b.id] = l;
    }
    for (const [id, d] of Object.entries(res.met || {})) if (!m.retos[id] || d < m.retos[id]) m.retos[id] = d;
    return m;
  }
  // «Equipo»: ¿esta semana el team cumplió y la persona sumó? → { wk, date } o null. Solo con lo que ya devuelven my_team_goal y my_points.
  function teamWeek({ team, mine, shares, today } = {}) {
    if (!team || team.none || !team.published || team.optedOut || !(team.target > 0) || !(team.total >= team.target)) return null;
    if (!shares || !shares.habits || !shares.nutrition || !mine || mine.paused) return null;
    const log = Array.isArray(mine.log) ? mine.log : [];
    const wk = team.weekStart || (today && weekStart(today));
    const mineWeek = log.filter((r) => r.day >= wk && r.day <= addDays(wk, 6));
    const sumo = team.metric === 'entrenos' ? mineWeek.some((r) => r.kind === 'entreno') : mineWeek.some((r) => r.points > 0);
    return sumo && wk ? { wk, date: today && today >= wk && today <= addDays(wk, 6) ? today : addDays(wk, 6) } : null;
  }
  // Niveles que subieron respecto a lo ya visto (para celebrarlos una sola vez). Los de hace más de 1 día se dan por vistos sin fiesta.
  function fresh(seen, res, today) {
    const out = [];
    for (const b of res.list) {
      const was = (seen && seen[b.id]) || 0;
      if (b.level > was && b.date && b.date >= addDays(today, -1)) out.push(b);
    }
    return out;
  }
  const seenOf = (res, prev) => { const s = { ...(prev || {}) }; for (const b of res.list) s[b.id] = Math.max(s[b.id] || 0, b.level); return s; };

  // ---------- Textos (nunca solo color: ●●○ + palabra + galones; nombre completo para lector de pantalla) ----------
  const dots = (lv) => '●●●'.slice(0, lv) + '○○○'.slice(0, 3 - lv);
  const curText = (c) => (c ? `${c.done} de ${c.of}` : '');
  function status(b) {
    if (b.earned) return b.hito ? dm(b.date) : LEVEL[b.level];
    if (b.state === 'progress') return curText(b.cur);
    return 'Aún no';
  }
  function a11y(b, today) {
    if (b.earned) {
      const when = b.date === today ? 'ganada hoy' : `ganada el ${dm(b.date)}`;
      let s = b.hito ? `${b.name}, ${when}` : `${b.name}, nivel ${LEVEL[b.level].toLowerCase()}, ${when}`;
      if (b.next) s += `. Para ${LEVEL[b.next.level].toLowerCase()}: ${b.next.count} de ${b.next.need} semanas`;
      return s;
    }
    if (b.state === 'progress') return `${b.name}, en progreso: ${curText(b.cur)} ${b.cur.of === 1 ? b.cur.unit[0] : b.cur.unit[1]} esta semana`;
    return `${b.name}, aún no la tienes`;
  }
  const WORD = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce'];
  const FEM = { noche: true, noches: true };
  // «Dos noches más de 7 a 10 h esta semana.»
  function moreLine(b) {
    const def = byId[b.id];
    if (!b.cur) return '';
    const left = b.cur.of - b.cur.done;
    if (left <= 0) return '';
    const u = b.cur.unit[left === 1 ? 0 : 1];
    let w = WORD[left] || String(left);
    if (left === 1 && FEM[u]) w = 'una';
    w = w.charAt(0).toUpperCase() + w.slice(1);
    if (b.id === 'primera-semana') return `${w} ${u} más con registro en tu primera semana.`;
    if (b.id === 'primer-mes') return b.cur.of === 12 ? `${w} ${u} más.` : `${w} ${u} más para cumplir el mes.`;
    return `${w} ${u} más${def && def.more ? ' ' + def.more : ''} esta semana.`;
  }
  const nearTitle = (b) => (b && b.cur ? `${b.name} · ${b.cur.done} de ${b.cur.of} ${b.cur.unit[1].split(' ')[0]}` : '');
  // «Qué es» con «Llevas N semanas así».
  function what(b) {
    const def = byId[b.id];
    let s = def.what;
    if (!b.hito && b.count) s += ` Llevas ${plural(b.count, ['semana', 'semanas'])} así${b.count > 1 ? ` (${SINCE})` : ''}.`;
    return s;
  }
  const note = (b) => (byId[b.id].note || 'Cuenta tu constancia, no la cantidad.') + (b.hito ? '' : ' Nunca pierdes un nivel.');

  // ---------- Dibujos (SVG en línea; un solo <defs> con siluetas y glifos, y cada insignia los usa con <use>) ----------
  const SH = {
    circ: 'M50 7a43 43 0 1 1 0 86a43 43 0 1 1 0-86Z',
    rombo: 'M50 4.5L95.5 50 50 95.5 4.5 50Z',
    hex: 'M50 4L90 27v46L50 96 10 73V27Z',
    shield: 'M50 4l39 12v32c0 25-17 41-39 48C28 89 11 73 11 48V16Z',
    square: 'M28 8h44a20 20 0 0 1 20 20v44a20 20 0 0 1-20 20H28A20 20 0 0 1 8 72V28A20 20 0 0 1 28 8Z',
    star: (() => { let p = ''; for (let i = 0; i < 12; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 6, r = i % 2 ? 37 : 47; p += (i ? 'L' : 'M') + (50 + r * Math.cos(a)).toFixed(1) + ' ' + (50 + r * Math.sin(a)).toFixed(1); } return p + 'Z'; })(),
  };
  const G = {
    flag: '<path d="M6 21V3.5M6 4h11l-2.5 4 2.5 4H6"/>',
    cal7: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4M9.5 12.5h5l-3 5.5"/>',
    cal30: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4M6.8 12.6h2.6l-1.4 1.8c1.2 0 1.7.6 1.7 1.4 0 .9-.8 1.5-1.7 1.5-.6 0-1.1-.2-1.4-.6"/><rect x="12.3" y="12.6" width="4.4" height="4.8" rx="2.2"/>',
    chain: '<path d="M10 7.5l1.6-1.6a3.6 3.6 0 0 1 5.1 5.1L15 12.6M14 16.5l-1.6 1.6a3.6 3.6 0 0 1-5.1-5.1L9 11.4M9.5 14.5l5-5"/>',
    back: '<path d="M9 14.5L4 9.5l5-5M4 9.5h10.5a5.5 5.5 0 0 1 0 11H12"/>',
    heart: '<path d="M12 20.5s-7.5-4.6-7.5-10.4A4.2 4.2 0 0 1 12 7.5a4.2 4.2 0 0 1 7.5 2.6c0 5.8-7.5 10.4-7.5 10.4z"/><path d="M9 12.3l2.2 2.2 4-4"/>',
    drop: '<path d="M12 3s6.2 6.6 6.2 11.2a6.2 6.2 0 0 1-12.4 0C5.8 9.6 12 3 12 3z"/><path d="M9.2 14.6a2.9 2.9 0 0 0 2.6 2.6"/>',
    paw: '<path d="M12 12.5c-3 0-5.2 2.8-5.2 4.9 0 1.6 1.3 2.5 2.8 2.5 1 0 1.6-.5 2.4-.5s1.4.5 2.4.5c1.5 0 2.8-.9 2.8-2.5 0-2.1-2.2-4.9-5.2-4.9z"/><circle cx="5.6" cy="10" r="1.6"/><circle cx="9.4" cy="6.2" r="1.7"/><circle cx="14.6" cy="6.2" r="1.7"/><circle cx="18.4" cy="10" r="1.6"/>',
    moon: '<path d="M19.5 14.6A8 8 0 1 1 9.4 4.5a6.4 6.4 0 0 0 10.1 10.1z"/><path d="M16 4.5v3M14.5 6h3"/>',
    round: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="7.6" r="1.3"/><circle cx="16.4" cy="12" r="1.3"/><circle cx="12" cy="16.4" r="1.3"/><circle cx="7.6" cy="12" r="1.3"/>',
    dumb: '<path d="M6.5 7v10M17.5 7v10M3.5 10v4M20.5 10v4M6.5 12h11"/>',
    tally: '<path d="M6 5v14M10 5v14M14 5v14M18 5v14M3.5 15.5l17-7"/>',
    leaf: '<path d="M5 19.5C5 11 10.5 5 20 4.5c0 9.5-6 15-14.4 15z"/><path d="M5 19.5l8.5-8.5"/>',
    plate: '<circle cx="14" cy="12" r="7"/><circle cx="14" cy="12" r="3.6"/><path d="M3 4v4.5a1.6 1.6 0 0 0 3.2 0V4M4.6 10v10"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
    chat: '<path d="M4 5.5h16v10H10l-4.5 4v-4H4Z"/><path d="M8 10.5h8"/>',
    tape: '<rect x="2.5" y="8" width="19" height="8.5" rx="2"/><path d="M6.5 8v3M10 8v4.2M13.5 8v3M17 8v4.2"/>',
    star: '<path d="M12 3l2.7 5.4 6 .9-4.3 4.2 1 5.9L12 16.6l-5.4 2.8 1-5.9-4.3-4.2 6-.9z"/>',
    team: '<circle cx="12" cy="7.5" r="3"/><circle cx="5" cy="10" r="2.3"/><circle cx="19" cy="10" r="2.3"/><path d="M6.5 20c.4-3.4 2.6-5.3 5.5-5.3s5.1 1.9 5.5 5.3M1.5 19c.3-2.2 1.5-3.6 3.3-4M22.5 19c-.3-2.2-1.5-3.6-3.3-4"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  };
  const SPARK = 'M0 -1 L.22 -.22 L1 0 L.22 .22 L0 1 L-.22 .22 L-1 0 L-.22 -.22Z';
  // Un único <svg> oculto con los degradados de metal (colores por variables: cambian con el tema), las 6 siluetas y los glifos.
  function defs() {
    let s = '<svg class="lg-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>';
    for (const k of LK) {
      s += `<linearGradient id="lg-v${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--lg-${k}-l)"/><stop offset=".5" style="stop-color:var(--lg-${k})"/><stop offset=".5" style="stop-color:var(--lg-${k}-d)"/><stop offset="1" style="stop-color:var(--lg-${k}-d)"/></linearGradient>`;
    }
    s += '<radialGradient id="lg-matte" cx=".5" cy=".3" r=".8"><stop offset="0" style="stop-color:var(--lg-face-a)"/><stop offset="1" style="stop-color:var(--lg-face-b)"/></radialGradient>';
    s += '<linearGradient id="lg-shine" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".38" stop-color="#fff" stop-opacity="0"/><stop offset=".47" stop-color="#fff" stop-opacity=".85"/><stop offset=".53" stop-color="#fff" stop-opacity=".35"/><stop offset=".62" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>';
    for (const [k, d] of Object.entries(SH)) s += `<path id="lg-s-${k}" d="${d}" pathLength="100"/>`;
    for (const [k, d] of Object.entries(G)) s += `<g id="lg-g-${k}">${d}</g>`;
    return s + '</defs></svg>';
  }
  const catOf = (k) => CATS.find((c) => c.k === k) || CATS[0];
  const glyphUse = (g, y, cls, sw) => `<use href="#lg-g-${g}" class="${cls}" transform="translate(30.8 ${y}) scale(1.6)" fill="none" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const chev = (y, cls) => `<path class="${cls}" d="M42 ${y}l8 5.5 8-5.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  // Una insignia. o: { size, uid (único en la página), lit (borde que se enciende), shine (destello), fill (relleno al 100 %) }
  function badgeSvg(b, o = {}) {
    const shape = catOf(b.cat).shape, size = o.size || 56, uid = String(o.uid || b.id).replace(/[^a-z0-9-]/gi, '');
    const S = `#lg-s-${shape}`;
    const k = b.earned ? LK[b.hito ? 0 : b.level] : '';
    let s = `<svg class="lg-svg${b.earned ? ' on lv-' + k : ''} st-${b.state}" width="${size}" height="${size}" viewBox="-3 -3 106 106" aria-hidden="true" focusable="false">`;
    if (b.earned) {
      const lv = b.hito ? 0 : b.level, gy = lv ? 20 : 26;
      s += `<use href="${S}" class="lg-face" fill="url(#lg-matte)" stroke="url(#lg-v${k})" stroke-width="5.5" stroke-linejoin="round"/>`;
      if (o.lit) s += `<use href="${S}" class="lg-lit" fill="none" stroke-width="2.6" stroke-linejoin="round" style="stroke:var(--lg-${k}-l)"/>`;
      s += glyphUse(b.glyph, gy, 'lg-gl', 2.2).replace('/>', ` style="stroke:var(--lg-${k}-ink)"/>`);
      for (let i = 0; i < lv; i++) s += chev(64 + i * 8, 'lg-chev').replace('/>', ` style="stroke:var(--lg-${k})" stroke-width="4"/>`);
      if (b.next && b.next.count > NEED[lv] && !o.lit) s += chev(64 + lv * 8, 'lg-chev lg-next').replace('/>', ' stroke-width="2.4" stroke-dasharray="2.5 2.5"/>');
      if (o.shine) s += `<clipPath id="lgc-${uid}"><use href="${S}"/></clipPath><g clip-path="url(#lgc-${uid})"><rect class="lg-shine" x="-10" y="-10" width="120" height="120" fill="url(#lg-shine)"/></g>`;
    } else {
      s += `<use href="${S}" class="lg-dash" fill="var(--lg-off)" stroke-width="2.6" stroke-dasharray="5 4.5" stroke-linejoin="round" style="fill:var(--lg-off);stroke:var(--lg-line)"/>`;
      if (b.state === 'progress') {
        const pct = Math.max(0.08, Math.min(1, b.cur.done / b.cur.of)), top = (100 - 100 * pct).toFixed(1);
        s += glyphUse(b.glyph, 26, 'lg-gl-dim', 2.2).replace('/>', ' style="stroke:var(--lg-line)"/>');
        s += `<clipPath id="lgc-${uid}"><rect class="lg-rise" x="-3" y="${top}" width="106" height="${(103 - top).toFixed(1)}"/></clipPath><g clip-path="url(#lgc-${uid})">`;
        s += `<use href="${S}" style="fill:var(--lg-fill)"/>` + glyphUse(b.glyph, 26, 'lg-gl-on', 2.4).replace('/>', ' style="stroke:var(--lg-fill-ink)"/>') + '</g>';
      } else {
        s += glyphUse(b.glyph, 26, 'lg-gl-dim', 2).replace('/>', ' style="stroke:var(--lg-line)" opacity=".7"/>');
        s += `<circle cx="84" cy="14" r="13" style="fill:var(--lg-lock-bg);stroke:var(--lg-line)" stroke-width="2"/><use href="#lg-g-lock" transform="translate(76.85 6.46) scale(.596)" fill="none" stroke-width="2.6" stroke-linecap="round" style="stroke:var(--lg-lock-ink)"/>`;
      }
    }
    return s + '</svg>';
  }
  // Silueta de la categoría en contorno (etiqueta de la fila y franja de la hoja).
  const shapeSvg = (catK, size = 40, sw = 5) => `<svg class="lg-shape lg-c-${catK}" width="${size}" height="${size}" viewBox="-3 -3 106 106" aria-hidden="true" focusable="false"><use href="#lg-s-${catOf(catK).shape}" fill="none" stroke-width="${sw}" stroke-linejoin="round"/></svg>`;
  function sparksSvg() {
    const pts = [[-0.95, -0.35, 9], [-0.7, -0.85, 6], [-0.15, -1.05, 7], [0.55, -0.9, 10], [0.98, -0.4, 6], [1.02, 0.25, 8], [0.75, 0.75, 5], [-0.85, 0.55, 7], [-1.05, 0.15, 5], [0.3, 1.0, 4]];
    let s = '<svg class="lg-spk" viewBox="-160 -105 320 210" aria-hidden="true" focusable="false"><circle r="70" fill="none" class="lg-ring" stroke-width="1"/><circle r="88" fill="none" class="lg-ring2" stroke-width=".8"/>';
    pts.forEach(([x, y, r], i) => { s += `<path class="lg-sp" style="--i:${i}" d="${SPARK}" transform="translate(${(x * 95).toFixed(1)} ${(y * 95 * 0.82).toFixed(1)}) scale(${r})"/>`; });
    return s + '</svg>';
  }

  const api = { NEED, LEVEL, LK, CATS, CATALOG, FUERA, OLD_IDS, dm, compute, near, normMemory, remember, teamWeek, fresh, seenOf, dots, status, a11y, moreLine, nearTitle, what, note,
    defs, badgeSvg, shapeSvg, sparksSvg, catOf, SH, G };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Logros = api;
})(typeof window !== 'undefined' ? window : globalThis);
