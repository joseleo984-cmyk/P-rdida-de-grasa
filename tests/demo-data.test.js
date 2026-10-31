// Copia DEMO: los datos ficticios son coherentes (fechas, rangos, kcal, ids únicos, sin personas ni correos reales) y las animaciones son GIF válidos.
const test = require('node:test');
const assert = require('node:assert');
globalThis.Producto = require('../producto.js');
globalThis.Producto.coach = true;
const CT = require('../consent-texts.js');
require('../consent-texts-solo.js');
const Schema = require('../schema.js');
const Platos = require('../platos.js');
const Rutinas = require('../rutinas.js');
const RF = require('../remote-fake.js');
const DD = require('../demo-data.js');

const TODAY = '2026-10-24';
const plan = DD.buildPlan(TODAY, { Platos });
const by = (k) => plan.clients.find((c) => c.key === k);

test('8 asesorados con nombres y correos inventados (@example.com), sin teléfonos', () => {
  assert.strictEqual(plan.clients.length, 8);
  assert.strictEqual(plan.business, 'Coach Fit Demo');
  for (const e of [DD.COACH.email, ...plan.clients.map((c) => c.email)]) assert.match(e, /^[a-z.]+\.demo@example\.com$/);
  for (const c of plan.clients) { assert.match(c.name, /^[A-Za-zñ]+ Demo$/); assert.ok(!/\d{6,}/.test(c.name + c.email)); }
  assert.strictEqual(new Set(plan.clients.map((c) => c.email)).size, 8);
});

test('fechas relativas a hoy: nada en el futuro y el historial cubre ~10 semanas en los 3 principales', () => {
  for (const c of plan.clients) {
    for (const d of [...c.entries.map((e) => e.date), ...c.habits.map((h) => h.date), ...c.foods.map((f) => f.date), ...c.photos.map((p) => p.date)]) {
      assert.ok(Schema.isISODate(d) && d <= TODAY, `${c.key}: fecha ${d}`);
    }
  }
  for (const k of ['ana', 'beto', 'carla']) {
    const dates = by(k).entries.map((e) => e.date);
    const span = (Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) / 86400000;
    assert.ok(span >= 60 && span <= 75, `${k}: ${span} días`);
    assert.ok(dates.length >= 25);
  }
  // Con otro «hoy» todo se corre igual (mismos valores, otras fechas)
  const p2 = DD.buildPlan('2026-12-01', { Platos });
  assert.deepStrictEqual(p2.clients[0].entries.map((e) => e.weight), by('ana').entries.map((e) => e.weight));
});

test('medidas: rangos del esquema, tendencia a la baja con altibajos, y los datos pasan Schema.normalize sin avisos', () => {
  for (const c of plan.clients) {
    const n = Schema.normalize({ entries: c.entries.map((e) => ({ ...e })) });
    assert.deepStrictEqual(n.warnings, [], c.key);
    assert.strictEqual(n.state.entries.length, c.entries.length);
  }
  for (const k of ['ana', 'beto', 'carla']) {
    const w = by(k).entries.map((e) => e.weight);
    assert.ok(w[0] - w[w.length - 1] >= 2.5, `${k} baja`);
    assert.ok(w.some((x, i) => i && x > w[i - 1]), `${k} tiene altibajos`);
    for (const f of ['abdomen', 'hip', 'waist', 'neck', 'armR', 'armL', 'back', 'thighR', 'thighL']) assert.ok(by(k).entries.filter((e) => e[f] !== undefined).length >= 5, `${k} ${f}`);
  }
  assert.strictEqual(by('hugo').entries.length, 1);
});

test('hábitos: rangos y cumplimientos distintos entre asesorados', () => {
  const pct = (c) => { const l = c.habits.filter((h) => h.date !== TODAY); return l.filter((h) => h.water >= 2 && h.steps >= 8000).length / l.length; };
  assert.ok(pct(by('ana')) > pct(by('carla')));
  for (const c of plan.clients) for (const h of c.habits) { assert.ok(h.water >= 0 && h.water <= 5 && h.steps >= 0 && h.sleep >= 0 && h.sleep <= 24); assert.strictEqual(typeof h.trained, 'boolean'); }
});

test('comidas: del catálogo, kcal = la del plato por su porción, días razonables', () => {
  for (const c of plan.clients) {
    const days = {};
    for (const f of c.foods) {
      const d = Platos.byId(f.dish);
      assert.ok(d, f.dish);
      assert.strictEqual(f.kcal, Platos.scale(d, f.portion).kcal);
      assert.strictEqual(f.name, d.name);
      assert.ok(Schema.MEALS.includes(f.meal));
      (days[f.date] ||= []).push(f);
    }
    for (const [date, list] of Object.entries(days)) {
      const total = list.reduce((s, f) => s + f.kcal, 0);
      assert.strictEqual(Platos.dayTotal({ [date]: list }, date).kcal, total);
      if (date !== TODAY) assert.ok(total >= 500 && total <= 3200, `${c.key} ${date}: ${total}`);
    }
  }
  assert.strictEqual(new Set(by('ana').foods.map((f) => f.date)).size, 14);   // insignias v4: 2 semanas de comidas («Plato a plato» y «Semana redonda» en bronce)
});

test('plantillas y GIF: rutinas válidas, una animación por ejercicio marcado, GIF89a animados que se decodifican', () => {
  for (const t of Object.values(DD.TEMPLATES)) {
    const r = { title: t.title, days: t.days.map((d) => ({ title: d.title, exercises: d.exercises.map((e) => ({ ...e, gif: e.gif ? '00000000-0000-4000-8000-000000000000' : '' })) })) };
    assert.ok(Rutinas.validate(r).ok, t.title);
  }
  assert.deepStrictEqual(Object.values(DD.TEMPLATES).map((t) => t.title), ['Pecho y tríceps', 'Piernas', 'Espalda y bíceps', 'Movilidad suave']);
  // Estilo v2: series/descanso estructurados, al menos un ejercicio con solo texto libre y una rutina sin video
  const all = Object.values(DD.TEMPLATES).flatMap((t) => t.days.flatMap((d) => d.exercises));
  assert.ok(all.some((e) => (Rutinas.parseSets(e.sets) || {}).rest > 0 && (Rutinas.parseSets(e.sets) || {}).weight), 'hay ejercicios con series, repeticiones, peso y descanso');
  assert.ok(all.some((e) => !Rutinas.parseSets(e.sets)), 'hay ejercicios con solo texto libre');
  assert.ok(DD.TEMPLATES.movilidad.days.every((d) => d.exercises.every((e) => !e.gif)), 'Movilidad suave no tiene video');
  for (const g of DD.GIFS) {
    const bytes = DD.makeGif(g.key);
    assert.strictEqual(String.fromCharCode(...bytes.slice(0, 6)), 'GIF89a');
    assert.ok(Rutinas.checkGif({ type: 'image/gif', size: bytes.length }, bytes.slice(0, 12)).ok);
    assert.ok(bytes.length < 60000);
    assert.strictEqual(bytes[bytes.length - 1], 0x3b);
    const fr = decode(bytes);
    assert.strictEqual(fr.length, 8);
    assert.ok(fr.every((f) => f.length === 120 * 120));
    assert.notDeepStrictEqual(Array.from(fr[0]), Array.from(fr[4]));   // se mueve
    assert.ok(new Set(fr[2]).size >= 3);
  }
});

// Decodificador GIF mínimo (solo lo que escribe nuestro codificador): comprueba que el LZW es correcto.
function decode(b) {
  let p = 13 + 3 * (1 << ((b[10] & 7) + 1));
  const frames = [];
  while (b[p] !== 0x3b) {
    if (b[p] === 0x21) { p += 2; while (b[p]) p += b[p] + 1; p++; continue; }
    p += 10; const min = b[p++]; const data = [];
    while (b[p]) { for (let i = 1; i <= b[p]; i++) data.push(b[p + i]); p += b[p] + 1; }
    p++;
    frames.push(lzwDecode(data, min));
  }
  return frames;
}
function lzwDecode(data, min) {
  const clear = 1 << min, eoi = clear + 1;
  let size = min + 1, dict = [], out = [], prev = null, bits = 0, cur = 0, di = 0;
  const reset = () => { dict = []; for (let i = 0; i < clear; i++) dict[i] = [i]; dict[clear] = []; dict[eoi] = []; size = min + 1; prev = null; };
  reset();
  for (;;) {
    while (bits < size) { if (di >= data.length) return out; cur |= data[di++] << bits; bits += 8; }
    const code = cur & ((1 << size) - 1); cur >>>= size; bits -= size;
    if (code === clear) { reset(); continue; }
    if (code === eoi) return out;
    let entry;
    if (dict[code]) entry = dict[code]; else if (code === dict.length && prev) entry = [...prev, prev[0]]; else throw new Error('LZW roto');
    out.push(...entry);
    if (prev) { dict.push([...prev, entry[0]]); if (dict.length === (1 << size) && size < 12) size++; }
    prev = entry;
  }
}

test('siembra en el servidor falso: ids únicos, estados de pago, rutinas, una oculta, rutina de hoy, bitácora y mensajes', async () => {
  const be = new RF.FakeBackend();
  const r = await DD.seed(be, { today: TODAY });
  const pay = {};
  for (const l of be.links) pay[Object.keys(r.clients).find((k) => r.clients[k].id === l.clientId)] = be.payState(l);
  const unpaid = Object.entries(pay).filter(([, s]) => !s.paid).map(([k]) => k);
  assert.deepStrictEqual(unpaid, ['diego']);
  const days = Object.entries(pay).filter(([k]) => k !== 'diego').map(([, s]) => s.daysLeft);
  assert.ok(new Set(days).size >= 6, 'vencimientos distintos');
  // ids únicos
  const ids = [...Object.values(be.records).map((x) => x.id), ...Object.keys(be.photos), ...Object.keys(be.users).map((e) => be.users[e].id)];
  assert.strictEqual(new Set(ids).size, ids.length);
  // sin correos reales
  assert.ok(Object.keys(be.users).every((e) => e.endsWith('@example.com')));
  // coach
  const coach = be.coaches[r.coach.id];
  assert.strictEqual(coach.businessName, 'Coach Fit Demo');
  assert.strictEqual(coach.inviteCode, DD.INVITE_CODE);
  assert.ok(be.hasConsent(r.coach.id, 'coach_agreement'));
  assert.strictEqual(Object.values(be.templates).length, 4);
  // Estilo v2 (concepto 4): Beto reportó dolor ayer y su coach lo ve como indicador
  assert.ok(Object.values(be.painReports).some((x) => x.userId === r.clients.beto.id && x.pain && !x.reviewedAt && !x.pausePrivate));
  assert.strictEqual(Object.keys(be.gifs).length, 4);
  const routines = Object.values(be.routines);
  assert.ok(routines.length >= 4 && routines.filter((x) => !x.visible).length === 1);
  assert.strictEqual(be.daily[r.coach.id].day, TODAY);
  assert.ok(be.photoViews.length >= 3 && be.photoViews.every((v) => v.clientId === r.clients.ana.id));
  assert.ok(Object.values(be.comments).length >= 5);
  // lo que ve el coach y lo que ve Ana salen por la API real
  const rc = DD.asUser(be, r.coach, DD.deps());
  const list = await rc.coach.clients();
  assert.strictEqual(list.length, 8);
  const loc = await DD.localFor(be, r.clients.ana);
  assert.strictEqual(Schema.consentStatus(loc.state.consent), 'ok');
  assert.ok(loc.state.entries.length >= 25 && loc.photos.length === 6 && loc.meta.link.paid);
  assert.ok(CT.cloudAllowed(loc.meta));
  const dg = await DD.localFor(be, r.clients.diego);
  assert.strictEqual(dg.meta.link.paid, false);
  // no se puede mezclar con datos reales: la siembra no toca nada fuera del backend dado
  const hugo = await DD.localFor(be, r.clients.hugo);
  assert.strictEqual(hugo.state.entries.length, 1);
});

// ---------- UX Etapa 1: la Demo muestra lo nuevo (esfuerzo, cierre del día, insignias, semáforo variado) ----------
const Constancia = require('../constancia.js');
const CoachM = require('../coach.js');
const stateOf = (c) => ({ habits: Object.fromEntries(c.habits.map(({ date, ...h }) => [date, h])),
  foods: c.foods.reduce((a, f) => { (a[f.date] ||= []).push(f); return a; }, {}), entries: c.entries, profile: null });
const attn = (k) => CoachM.atencion(stateOf(by(k)), { today: TODAY, shares: by(k).shares });
test('demo: hay esfuerzo del entreno y cierre del día, con valores válidos del esquema', () => {
  const hs = plan.clients.flatMap((c) => c.habits);
  assert.ok(hs.some((h) => h.effort === 'normal') && hs.some((h) => h.effort === 'duro') && hs.some((h) => h.effort === 'facil'));
  assert.ok(hs.some((h) => h.close === 'si') && hs.some((h) => h.close === 'casi'));
  for (const h of hs) { if (h.effort) { assert.ok(Schema.EFFORTS.includes(h.effort)); assert.strictEqual(h.trained, true); } if (h.close) assert.ok(Schema.CLOSES.includes(h.close)); }
});
const Logros = require('../logros.js');
test('demo (insignias v4): Ana tiene una colección variada (oro, plata, bronce, en progreso y bloqueada), igual cualquier día de la semana, y al marcar hoy el descanso sube a plata', () => {
  for (const today of ['2026-10-19', '2026-10-21', '2026-10-24', '2026-10-25', '2026-10-27']) {
    const p = DD.buildPlan(today, { Platos });
    const ana = p.clients.find((c) => c.key === 'ana');
    const st = stateOf(ana);
    const r = Logros.compute(st, today, { retosOn: true });
    const lv = Object.fromEntries(r.list.map((b) => [b.id, b.state === 'earned' ? b.level : b.state]));
    assert.deepStrictEqual(lv, { arranco: 1, 'primera-semana': 1, 'primer-mes': 1, 'semanas-constantes': 3, volviste: 1, 'registro-honesto': 3, hidratado: 3, 'pata-de-perro': 2,
      'buen-dormir': 'progress', 'semana-redonda': 1, 'tres-de-tres': 2, 'entrenos-acumulados': 2, 'descanso-inteligente': 1, 'plato-a-plato': 1, 'midiendo-con-cabeza': 2,
      'tecnica-primero': 'locked', 'te-escucho': 'locked', 'reto-cumplido': 'locked', equipo: 'locked' }, today);
    assert.strictEqual(r.total, 19);
    // Las 8 de antes: las mismas fechas en su bronce (o hito)
    for (const o of Constancia.badges(st, today)) if (o.earned) assert.strictEqual(r.list.find((b) => b.id === o.id).dates[1], o.date, `${today} ${o.id}`);
    // El momento de ganarla en la demo: «Hoy es mi día de descanso» → Descanso inteligente sube a PLATA hoy
    st.habits[today] = { ...st.habits[today], rest: 'plan' };
    const d = Logros.compute(st, today, { retosOn: true }).list.find((b) => b.id === 'descanso-inteligente');
    assert.deepStrictEqual([d.level, d.date], [2, today], today);
  }
});
test('demo: el semáforo del coach es variado (rojo, ámbar y verde) con motivos en texto', () => {
  const levels = Object.fromEntries(plan.clients.map((c) => [c.key, attn(c.key)]));
  assert.strictEqual(levels.diego.level, 'atencion');
  assert.match(levels.diego.reason, /^Sin registrar desde hace 9 días$/);
  assert.strictEqual(levels.gina.level, 'revisar');
  assert.match(levels.gina.reason, /^3 días sin registrar/);
  assert.strictEqual(levels.beto.level, 'revisar');
  assert.match(levels.beto.reason, /Duro/);
  assert.strictEqual(levels.ana.level, 'aldia');
  assert.strictEqual(levels.hugo.level, 'aldia');
  assert.ok(new Set(Object.values(levels).map((l) => l.level)).size === 3);
});

test('UX Etapa 2: Ana con indicador de salud y meta de 110 g, un reto en curso, y Diego en pausa con registros autónomos que el coach NO ve', async () => {
  const be = new RF.FakeBackend({ clock: RF.FakeClock(TODAY + 'T17:00:00.000Z') });
  const r = await DD.seed(be, { today: TODAY });
  const coach = DD.asUser(be, r.coach, DD.deps());
  const list = await coach.coach.clients();
  const ana = list.find((c) => c.clientId === r.clients.ana.id), diego = list.find((c) => c.clientId === r.clients.diego.id);
  assert.deepStrictEqual([ana.healthRestriction, ana.pregnancyState, ana.proteinGoal], [true, false, 110]);
  assert.strictEqual(list.find((c) => c.clientId === r.clients.elena.id).pregnancyState, true);
  assert.strictEqual(list.filter((c) => c.healthRestriction || c.pregnancyState).length, 2);
  const retos = await coach.coach.listChallenges();
  assert.strictEqual(retos.length, 1);
  assert.strictEqual(retos[0].members.length, 7, 'todos menos Diego');
  assert.ok(retos[0].members.some((m) => m.done >= 3));
  // Diego: en pausa, con hábitos autónomos privados (los ve él, no su coach)
  assert.strictEqual(diego.paid, false);
  assert.ok(diego.pauses.length && diego.pauses[diego.pauses.length - 1].to === null);
  const priv = Object.values(be.records).filter((x) => x.userId === r.clients.diego.id && x.pausePrivate);
  assert.strictEqual(priv.length, DD.AUTONOMOUS.length);
  const seen = (await coach.coach.clientData(r.clients.diego.id)).records.filter((x) => x.kind === 'habit').map((x) => x.nkey);
  for (const x of priv) assert.ok(!seen.includes(x.nkey), 'el coach no ve ' + x.nkey);
  const own = await DD.localFor(be, r.clients.diego);
  for (const x of priv) assert.ok(own.state.habits[x.nkey], 'Diego sí ve ' + x.nkey);
  assert.strictEqual(own.meta.link.pauses.length, 1);
});
