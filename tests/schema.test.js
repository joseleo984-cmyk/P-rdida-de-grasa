const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Schema = require('../schema.js');

const fixture = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/backup-v1.json'), 'utf8'));
let n = 0;
const uid = () => 'gen' + ++n;
const load = (raw) => Schema.normalize(Schema.migrate(raw), { uid });
// v4 añade `id` (UUID) y `updatedAt` a cada registro: para comparar el contenido se quitan.
const bare = (o) => {
  if (Array.isArray(o)) return o.map(bare);
  if (!o || typeof o !== 'object') return o;
  const out = {};
  for (const k of Object.keys(o)) if (k !== 'id' && k !== 'updatedAt') out[k] = bare(o[k]);
  return out;
};

test('migrate: v1 sin schemaVersion pasa a la versión actual sin mutar la entrada', () => {
  const raw = { entries: [] };
  const s = Schema.migrate(raw);
  assert.strictEqual(s.schemaVersion, Schema.CURRENT_VERSION);
  assert.strictEqual(Schema.CURRENT_VERSION, 6);
  assert.strictEqual(raw.schemaVersion, undefined);
});

test('migrate: rechaza estructuras irreconocibles y versiones futuras o inválidas', () => {
  for (const bad of [null, 42, 'texto', [], [{ entries: [] }]]) assert.throws(() => Schema.migrate(bad));
  assert.throws(() => Schema.migrate({ schemaVersion: 99, entries: [] }), /más nueva/);
  assert.throws(() => Schema.migrate({ schemaVersion: '2', entries: [] }), /no válida/);
  assert.throws(() => Schema.migrate({ schemaVersion: 0, entries: [] }), /no válida/);
});

test('normalize: rechaza objetos que no son de la app', () => {
  assert.throws(() => Schema.normalize({ foo: 1 }), /respaldo/);
  assert.throws(() => Schema.normalize(null));
});

test('respaldo v1 real: se migra sin pérdidas ni avisos', () => {
  const raw = fixture();
  const { state, warnings } = load(raw);
  const ph = Schema.normalizePhotos(raw.photos, { uid });
  assert.deepStrictEqual(warnings, []);
  assert.deepStrictEqual(ph.warnings, []);
  assert.strictEqual(state.schemaVersion, 6);
  assert.deepStrictEqual(bare(state.profile), raw.profile);
  assert.deepStrictEqual(bare(state.entries), bare(raw.entries));
  assert.deepStrictEqual(bare({ ...state.foods }), bare(raw.foods));
  assert.deepStrictEqual(bare({ ...state.habits }), raw.habits);
  assert.deepStrictEqual(bare({ ...state.library }), raw.library);
  // v4: ids UUID y updatedAt = EPOCH en todo lo migrado; sin lápidas.
  for (const e of state.entries) { assert.ok(Schema.isUUID(e.id), e.id); assert.strictEqual(e.updatedAt, Schema.EPOCH); }
  assert.deepStrictEqual(state.deleted, { entries: [], foods: [], habits: [], photos: [] });
  assert.strictEqual(ph.photos.length, 2);
  assert.deepStrictEqual(bare(ph.photos[0]), bare(raw.photos[0]));
  // Ida y vuelta: lo normalizado se vuelve a normalizar igual (idempotente).
  const again = load(JSON.parse(JSON.stringify(state)));
  assert.deepStrictEqual(again.warnings, []);
  assert.deepStrictEqual(JSON.stringify(again.state), JSON.stringify(state));
});

test('BUG-01: habits null, foods array y entradas sin fecha no rompen el estado', () => {
  const { state, warnings } = load({ entries: [{ weight: 80 }, { date: '2026-13-40', weight: 80 }, { date: '2026-10-20', weight: 80 }], foods: [], habits: null });
  assert.strictEqual(state.entries.length, 1);
  assert.strictEqual(state.entries[0].date, '2026-10-20');
  assert.ok(state.entries[0].id);
  assert.deepStrictEqual(Object.keys(state.foods), []);
  assert.deepStrictEqual(Object.keys(state.habits), []);
  assert.strictEqual(state.profile, null);
  assert.ok(warnings.length >= 3);
  // Faltan claves: se rellenan.
  const s2 = load({ profile: null }).state;
  assert.deepStrictEqual(s2.entries, []);
  // entries que no es array ni foods con días no válidos
  const s3 = load({ entries: 'x', foods: { '2026-10-20': null, 'no-fecha': [] }, habits: { '2026-10-20': 'x' } });
  assert.deepStrictEqual(s3.state.entries, []);
  assert.deepStrictEqual(Object.keys(s3.state.foods), []);
  assert.deepStrictEqual(Object.keys(s3.state.habits), []);
});

test('XSS: ids peligrosos se regeneran y kcal no numérica se descarta', () => {
  const evil = '"><img src=x onerror="window.__xss=1">';
  const { state } = load({
    entries: [{ id: evil, date: '2026-10-20', weight: 90 }],
    foods: { '2026-10-20': [
      { id: evil, name: 'a', meal: 'Cena', kcal: '<img src=x onerror=alert(1)>' },
      { id: evil, name: 'b', meal: '<script>', kcal: 100, protein: '<b>' },
    ] },
  });
  assert.match(state.entries[0].id, /^[a-z0-9-]{1,40}$/i);
  const foods = state.foods['2026-10-20'];
  assert.strictEqual(foods.length, 1);
  assert.match(foods[0].id, /^[a-z0-9-]{1,40}$/i);
  assert.strictEqual(foods[0].meal, 'Snack');
  assert.strictEqual(foods[0].protein, 0);
  const ph = Schema.normalizePhotos([
    { id: evil, date: '2026-10-20', pose: 'frente', data: 'data:image/png;base64,AAAA' },
    { id: 'ok', date: '2026-10-20', pose: '<b>', data: 'data:image/svg+xml;base64,AAAA' },
    { id: 'ok2', date: '2026-10-20', pose: 'x', data: 'javascript:alert(1)' },
    { id: 'ok3', date: 'ayer', pose: 'frente', data: 'data:image/png;base64,AAAA' },
  ], { uid });
  assert.strictEqual(ph.photos.length, 1);
  assert.match(ph.photos[0].id, /^[a-z0-9-]{1,40}$/i);
  assert.strictEqual(ph.warnings.length, 3);
  assert.throws(() => Schema.normalizePhotos({}), /fotos/);
});

test('BUG-03: números como texto se convierten a Number (no "100200")', () => {
  const { state } = load({
    entries: [{ id: 'a', date: '2026-10-20', weight: '80.5', waist: 'abc', neck: -5 }],
    foods: { '2026-10-20': [{ name: 'x', kcal: '100' }, { name: 'y', kcal: '200', fat: '3.5' }] },
    habits: { '2026-10-20': { steps: '9000', water: 'mucha', trained: 'true' } },
  });
  const total = state.foods['2026-10-20'].reduce((s, x) => s + x.kcal, 0);
  assert.strictEqual(total, 300);
  assert.strictEqual(state.foods['2026-10-20'][1].fat, 3.5);
  assert.strictEqual(state.entries[0].weight, 80.5);
  assert.strictEqual(state.entries[0].waist, undefined);
  assert.strictEqual(state.entries[0].neck, undefined);
  assert.deepStrictEqual(bare({ ...state.habits['2026-10-20'] }), { trained: false, steps: 9000 });
  // Valores absurdos o no finitos
  const s2 = load({ entries: [{ date: '2026-10-20', weight: 1e9 }, { date: '2026-10-21', weight: NaN }] }).state;
  assert.strictEqual(s2.entries.length, 0);
});

test('__proto__ y claves peligrosas no contaminan prototipos', () => {
  const raw = JSON.parse('{"entries":[],"library":{"__proto__":{"name":"__proto__","kcal":1,"polluted":true},"constructor":{"name":"constructor","kcal":1},"ok":{"name":"Arroz","kcal":130}},"foods":{"__proto__":[{"name":"x","kcal":1}]},"habits":{"__proto__":{"trained":true}}}');
  const { state } = load(raw);
  assert.deepStrictEqual(Object.keys(state.library), ['arroz']);
  assert.strictEqual(Object.getPrototypeOf(state.library), null);
  assert.deepStrictEqual(Object.keys(state.foods), []);
  assert.deepStrictEqual(Object.keys(state.habits), []);
  assert.strictEqual({}.polluted, undefined);
  // Un diccionario sin prototipo admite cualquier nombre como clave sin efectos colaterales.
  state.library['__proto__'] = { name: '__proto__' };
  assert.strictEqual(Object.getPrototypeOf(state.library), null);
});

test('ids duplicados se regeneran', () => {
  const { state } = load({ entries: [{ id: 'a', date: '2026-10-19', weight: 80 }, { id: 'a', date: '2026-10-20', weight: 79 }] });
  assert.notStrictEqual(state.entries[0].id, state.entries[1].id);
});

test('perfil: se valida y se descarta si es inválido (BUG-04)', () => {
  const base = fixture().profile;
  assert.strictEqual(Schema.profileError(base), null);
  assert.match(Schema.profileError({ ...base, goalWeight: 80 }), /meta/);
  assert.match(Schema.profileError({ ...base, age: NaN }), /edad/);
  assert.match(Schema.profileError({ ...base, startDate: '' }), /fecha/);
  assert.match(Schema.profileError({ ...base, activity: 3 }), /actividad/);
  // Strings numéricos se aceptan; actividad desconocida se corrige con aviso.
  const r = load({ profile: { ...base, age: '35', activity: 'x' } });
  assert.strictEqual(r.state.profile.age, 35);
  assert.strictEqual(r.state.profile.activity, 1.2);
  assert.strictEqual(r.warnings.length, 1);
  const bad = load({ profile: { ...base, goalWeight: 75 } });
  assert.strictEqual(bad.state.profile, null);
  assert.strictEqual(load({ profile: 'x' }).state.profile, null);
});

test('isISODate', () => {
  assert.ok(Schema.isISODate('2024-02-29'));
  for (const d of ['2023-02-29', '2026-1-1', '2026-10-20T00:00', '', null, 20261020, '1800-01-01']) assert.ok(!Schema.isISODate(d), String(d));
});

test('D1: un perfil heredado inválido se devuelve como borrador (no se pierde)', () => {
  const raw = fixture();
  raw.profile = { ...raw.profile, startWeight: 70, goalWeight: 80 };
  const r = load(raw);
  assert.strictEqual(r.state.profile, null);
  assert.match(r.rejected.reason, /meta debe ser menor/);
  const d = r.rejected.profile;
  assert.strictEqual(d.startWeight, 70);
  assert.strictEqual(d.goalWeight, 80);
  assert.strictEqual(d.name, 'Ana');
  assert.strictEqual(d.startDate, '2026-10-01');
  // Campos inválidos → vacíos (tipos seguros para el formulario); el motivo es el primero que falla.
  const r2 = load({ profile: { ...raw.profile, age: 'abc', sex: '<b>', startDate: 'x' } });
  assert.strictEqual(r2.rejected.profile.age, '');
  assert.strictEqual(r2.rejected.profile.sex, '');
  assert.strictEqual(r2.rejected.profile.startDate, '');
  assert.match(r2.rejected.reason, /sexo/);
  // El borrador guardado (como hace app.js) vuelve a salir como borrador en la siguiente carga.
  const again = load(JSON.parse(JSON.stringify({ ...r.state, profile: d })));
  assert.deepStrictEqual(again.rejected.profile, d);
  assert.deepStrictEqual(load(fixture()).rejected, {});
});

test('D4: fotos guardadas sin fecha o con pose desconocida al leer IndexedDB', () => {
  assert.strictEqual(Schema.normalizeStoredPhoto({ id: 'x', pose: 'frente' }), null);
  assert.strictEqual(Schema.normalizeStoredPhoto({ id: 'x', date: '"><img>', pose: 'frente' }), null);
  assert.strictEqual(Schema.normalizeStoredPhoto(null), null);
  const p = { id: '"><img>', date: '2026-10-01', pose: '<b>', createdAt: 1 };
  const n = Schema.normalizeStoredPhoto(p);
  assert.strictEqual(n.pose, 'frente');
  assert.strictEqual(n.id, p.id);         // el id no cambia: se usa para borrarla (se escapa al pintar)
  const ok = { id: 'a', date: '2026-10-01', pose: 'perfil' };
  assert.strictEqual(Schema.normalizeStoredPhoto(ok), ok);
});

test('isSafeKey', () => {
  for (const k of ['__proto__', 'constructor', 'Prototype']) assert.ok(!Schema.isSafeKey(k), k);
  assert.ok(Schema.isSafeKey('arroz'));
});

test('edad mínima 18: se rechaza con mensaje amable y claro; 18 se acepta', () => {
  const base = fixture().profile;
  assert.strictEqual(Schema.AGE_MIN, 18);
  assert.strictEqual(Schema.profileError({ ...base, age: 18 }), null);
  assert.strictEqual(Schema.profileError({ ...base, age: 100 }), null);
  for (const age of [17, 14, 10, 0, 1]) {
    const msg = Schema.profileError({ ...base, age });
    assert.match(msg, /18 años o más/, `edad ${age}`);
    assert.match(msg, /Si escribiste mal tu edad, corrígela/);
  }
  assert.match(Schema.profileError({ ...base, age: 101 }), /entre 18 y 100/);
  assert.match(Schema.profileError({ ...base, age: -3 }), /18 años o más/);
  assert.match(Schema.profileError({ ...base, age: NaN }), /entre 18 y 100/);
});

test('edad mínima 18: datos ya guardados de un menor no se borran en silencio (quedan como borrador a corregir)', () => {
  const base = fixture().profile;
  const r = load({ profile: { ...base, age: 16 }, entries: [{ id: 'a1', date: '2026-10-19', weight: 80 }] });
  assert.strictEqual(r.state.profile, null);                 // no se usa como perfil válido…
  assert.strictEqual(r.rejected.profile.age, 16);            // …pero se conserva para precargar el formulario
  assert.strictEqual(r.rejected.profile.name, base.name);
  assert.match(r.rejected.reason, /18 años o más/);
  assert.ok(r.warnings.some((w) => /18 años o más/.test(w)));
  assert.strictEqual(r.state.entries.length, 1);             // el resto de los datos sigue intacto
  const ok = load({ profile: { ...base, age: '18' } });      // el borrador corregido pasa
  assert.strictEqual(ok.state.profile.age, 18);
});
