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
  assert.strictEqual(plan.business, 'Fit Demo');
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
  assert.strictEqual(new Set(by('ana').foods.map((f) => f.date)).size, 7);
});

test('plantillas y GIF: rutinas válidas, una animación por ejercicio marcado, GIF89a animados que se decodifican', () => {
  for (const t of Object.values(DD.TEMPLATES)) {
    const r = { title: t.title, days: t.days.map((d) => ({ title: d.title, exercises: d.exercises.map((e) => ({ ...e, gif: e.gif ? '00000000-0000-4000-8000-000000000000' : '' })) })) };
    assert.ok(Rutinas.validate(r).ok, t.title);
  }
  assert.deepStrictEqual(Object.values(DD.TEMPLATES).map((t) => t.title), ['Pecho y tríceps', 'Piernas', 'Espalda y bíceps']);
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
  assert.strictEqual(coach.businessName, 'Fit Demo');
  assert.strictEqual(coach.inviteCode, DD.INVITE_CODE);
  assert.ok(be.hasConsent(r.coach.id, 'coach_agreement'));
  assert.strictEqual(Object.values(be.templates).length, 3);
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
