// S2-4: esquema v4 preparado para sincronizar (UUID, updatedAt, borrado lógico, fusión LWW).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Schema = require('../schema.js');

const fx = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8'));
const load = (raw) => Schema.normalize(Schema.migrate(raw));
// Marcas en el pasado: con el reloj acotado (+5 min) una marca futura respecto al reloj real se trataría como "ahora".
const T1 = '2026-10-01T10:00:00.000Z';
const T2 = '2026-10-01T11:00:00.000Z';
const T3 = '2026-10-01T12:00:00.000Z';
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const plain = (o) => JSON.parse(JSON.stringify(o));
// Estado v4 válido mínimo para las pruebas de marcas y fusión.
const base = () => load({ schemaVersion: 4, entries: [], foods: {}, habits: {}, library: {} }).state;

test('uuid: formato v4 con crypto.randomUUID y sin él (respaldo con getRandomValues)', () => {
  assert.ok(Schema.isUUID(Schema.uuid()));
  const orig = globalThis.crypto.randomUUID;
  try {
    globalThis.crypto.randomUUID = undefined;
    const ids = new Set(Array.from({ length: 200 }, () => Schema.uuid()));
    assert.strictEqual(ids.size, 200);
    for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  } finally { globalThis.crypto.randomUUID = orig; }
  for (const bad of ['k3j9x0aa', '', null, 12, '00000000-0000-4000-8000-00000000000g']) assert.ok(!Schema.isUUID(bad), String(bad));
});

test('migración v1, v2 y v3 → v4: UUID, updatedAt = EPOCH, sin lápidas y sin perder datos', () => {
  const v1 = fx('backup-v1.json');
  const v3 = fx('backup-v3.json');
  const v2 = { ...v1, schemaVersion: 2 };
  for (const [name, raw] of [['v1', v1], ['v2', v2], ['v3', v3]]) {
    const before = JSON.stringify(raw);
    const { state, warnings } = load(raw);
    assert.strictEqual(JSON.stringify(raw), before, name + ': no muta la entrada');
    assert.deepStrictEqual(warnings, [], name);
    assert.strictEqual(state.schemaVersion, 4);
    assert.strictEqual(state.entries.length, 3);
    const all = [...state.entries, ...Object.values(state.foods).flat(), ...Object.values(state.habits), ...Object.values(state.library)];
    assert.strictEqual(all.length, 3 + 2 + 2 + 2);
    for (const r of all) { assert.ok(Schema.isUUID(r.id), `${name}: ${r.id}`); assert.strictEqual(r.updatedAt, Schema.EPOCH); }
    assert.strictEqual(new Set(all.map((r) => r.id)).size, all.length, name + ': ids únicos');
    assert.strictEqual(state.profile.updatedAt, Schema.EPOCH);
    assert.deepStrictEqual(plain(state.deleted), { entries: [], foods: [], habits: [], photos: [] });
    // El contenido se conserva (mismas fechas, medidas y nota).
    assert.deepStrictEqual(state.entries.map((e) => [e.date, e.weight, e.note]), raw.entries.map((e) => [e.date, e.weight, e.note]));
  }
  // v3 conserva su consentimiento al cargarse (la regla "no adoptar consent ajeno" es de la importación en app.js).
  assert.strictEqual(load(v3).state.consent.termsVersion, '0.1');
  // Las fotos del respaldo también pasan a UUID.
  const ph = Schema.normalizePhotos(v3.photos);
  assert.ok(Schema.isUUID(ph.photos[0].id));
  assert.strictEqual(ph.photos[0].updatedAt, Schema.EPOCH);
});

test('migración: idempotente y estable (v4 → v4 conserva ids y updatedAt) y sigue rechazando JSON ajenos', () => {
  const once = load(fx('backup-v3.json')).state;
  const twice = load(plain(once)).state;
  assert.deepStrictEqual(plain(twice), plain(once));
  assert.throws(() => load({ foo: 1 }), /respaldo/);   // migrateTo4 no inventa claves
  assert.throws(() => Schema.migrate({ schemaVersion: 5, entries: [] }), /más nueva/);
});

test('normalize: ids no UUID, updatedAt inválido y lápidas inválidas se corrigen o descartan', () => {
  const { state, warnings } = Schema.normalize({
    schemaVersion: 4,
    entries: [{ id: 'corto', date: '2026-10-20', weight: 80, updatedAt: 'ayer' }],
    deleted: { entries: [{ id: U(1), date: '2026-10-19', deletedAt: T1 }, { id: 'x', date: '2026-10-19', deletedAt: T1 }, { id: U(2), date: 'mal', deletedAt: T1 }, { id: U(1), date: '2026-10-19', deletedAt: T1 }],
      foods: 'x', photos: [{ id: U(3), date: '2026-10-19', deletedAt: 'nunca' }] },
  });
  assert.ok(Schema.isUUID(state.entries[0].id));
  assert.strictEqual(state.entries[0].updatedAt, Schema.EPOCH);
  assert.deepStrictEqual(plain(state.deleted.entries), [{ id: U(1), date: '2026-10-19', deletedAt: T1, updatedAt: T1 }]);
  assert.deepStrictEqual(state.deleted.foods, []);
  assert.deepStrictEqual(state.deleted.photos, []);
  assert.strictEqual(warnings.filter((w) => /Borrado/.test(w)).length, 4);
});

test('stampChanges: crear, editar y no tocar → updatedAt solo en lo nuevo o cambiado', () => {
  const prev = { ...base(), entries: [{ id: U(1), date: '2026-10-19', weight: 80, updatedAt: T1 }] };
  prev.habits['2026-10-19'] = { id: U(2), trained: true, updatedAt: T1 };
  prev.library.arroz = { id: U(3), name: 'Arroz', kcal: 130, protein: 3, carbs: 28, fat: 0, updatedAt: T1 };
  const savedPrev = plain(prev);
  const next = plain(prev);
  next.foods = Object.create(null);
  next.habits = Object.assign(Object.create(null), next.habits);
  next.library = Object.assign(Object.create(null), next.library);
  next.entries.push({ id: U(4), date: '2026-10-20', weight: 79.5 });           // nuevo
  next.habits['2026-10-19'] = { trained: true, steps: 5000 };                  // el formulario lo reemplaza sin id
  next.library.arroz = { name: 'Arroz', kcal: 130, protein: 3, carbs: 28, fat: 0 }; // igual, sin id ni updatedAt
  const s = Schema.stampChanges(savedPrev, next, T2);
  assert.strictEqual(s.entries[0].updatedAt, T1, 'sin cambios conserva updatedAt');
  assert.strictEqual(s.entries[1].updatedAt, T2);
  assert.strictEqual(s.habits['2026-10-19'].id, U(2), 'hábito: se conserva el id de la fecha');
  assert.strictEqual(s.habits['2026-10-19'].updatedAt, T2);
  assert.strictEqual(s.library.arroz.id, U(3));
  assert.strictEqual(s.library.arroz.updatedAt, T1, 'biblioteca igual: no cuenta como edición');
  assert.deepStrictEqual(plain(s.deleted.entries), []);
  // Un registro sin UUID (p. ej. creado por código viejo) recibe uno.
  const s2 = Schema.stampChanges(null, { ...base(), entries: [{ id: 'abc', date: '2026-10-20', weight: 80 }] }, T2);
  assert.ok(Schema.isUUID(s2.entries[0].id));
});

test('stampChanges: borrar crea lápidas; volver a registrar la misma fecha las retira', () => {
  const prev = { ...base(), entries: [{ id: U(1), date: '2026-10-19', weight: 80, updatedAt: T1 }] };
  prev.foods['2026-10-19'] = [{ id: U(5), name: 'Pan', meal: 'Desayuno', kcal: 200, protein: 6, carbs: 38, fat: 2, updatedAt: T1 }];
  prev.habits['2026-10-19'] = { id: U(2), trained: false, updatedAt: T1 };
  const saved = plain(prev);
  const next = { ...plain(prev), entries: [], foods: Object.create(null), habits: Object.create(null), library: Object.create(null) };
  const s = Schema.stampChanges(saved, next, T2);
  assert.deepStrictEqual(plain(s.deleted.entries), [{ id: U(1), date: '2026-10-19', deletedAt: T2, updatedAt: T2 }]);
  assert.deepStrictEqual(plain(s.deleted.foods), [{ id: U(5), date: '2026-10-19', deletedAt: T2, updatedAt: T2 }]);
  assert.deepStrictEqual(plain(s.deleted.habits), [{ id: U(2), date: '2026-10-19', deletedAt: T2, updatedAt: T2 }]);
  // Las lápidas no aparecen en los datos vivos (lo que usan UI, cálculos, CSV y visor).
  assert.deepStrictEqual(s.entries, []);
  assert.deepStrictEqual(Object.keys(s.foods), []);
  // Se vuelve a pesar el mismo día (otro id): clave natural = fecha → la lápida del registro sobra.
  const again = Schema.stampChanges(plain(s), { ...plain(s), foods: Object.create(null), habits: Object.create(null), library: Object.create(null), entries: [{ id: U(9), date: '2026-10-19', weight: 79 }] }, T3);
  assert.deepStrictEqual(plain(again.deleted.entries), []);
  assert.strictEqual(again.deleted.foods.length, 1, 'las demás lápidas se conservan');
  // Las lápidas sobreviven a normalize (respaldo exportado → importado).
  const round = load(plain(again)).state;
  assert.deepStrictEqual(plain(round.deleted), plain(again.deleted));
});

test('purgeDeleted: quita solo las lápidas más viejas que N días', () => {
  const s = { ...base(), deleted: { entries: [{ id: U(1), date: '2026-01-01', deletedAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' }, { id: U(2), date: '2026-10-01', deletedAt: T1, updatedAt: T1 }], foods: [], habits: [], photos: [] } };
  const p = Schema.purgeDeleted(s, T3, 90);
  assert.deepStrictEqual(p.deleted.entries.map((t) => t.id), [U(2)]);
  assert.strictEqual(s.deleted.entries.length, 2, 'pura: no muta');
});

test('mergeRecords: gana el updatedAt mayor; empate determinista y conmutativo; lápida más nueva gana', () => {
  const a = { id: U(1), date: '2026-10-19', weight: 80, updatedAt: T1 };
  const b = { id: U(1), date: '2026-10-19', weight: 81, updatedAt: T2 };
  assert.deepStrictEqual(Schema.mergeRecords([a], [b]), [b]);
  assert.deepStrictEqual(Schema.mergeRecords([b], [a]), [b]);
  const c = { ...a, weight: 82 };
  assert.deepStrictEqual(Schema.mergeRecords([a], [c]), Schema.mergeRecords([c], [a]), 'empate: mismo resultado en ambos sentidos');
  const tombNew = { id: U(1), date: '2026-10-19', deletedAt: T3, updatedAt: T3 };
  assert.deepStrictEqual(Schema.mergeRecords([b], [tombNew]), [tombNew]);
  const tombOld = { ...tombNew, deletedAt: T1, updatedAt: T1 };
  assert.deepStrictEqual(Schema.mergeRecords([tombOld], [b]), [b], 'edición posterior al borrado lo revive');
  // Solo en un lado → se conserva.
  assert.strictEqual(Schema.mergeRecords([a], [{ ...b, id: U(2) }]).length, 2);
});

test('mergeRecords por clave natural (fecha): dos pesajes offline del mismo día → uno, con el id remoto', () => {
  const local = { id: U(1), date: '2026-10-19', weight: 80, updatedAt: T3 };
  const remote = { id: U(7), date: '2026-10-19', weight: 81, updatedAt: T2 };
  const [m] = Schema.mergeRecords([local], [remote], { key: 'date' });
  assert.strictEqual(m.weight, 80, 'gana el más nuevo (local)');
  assert.strictEqual(m.id, U(7), 'pero se queda con el id del servidor');
});

test('mergeState: fusiona registros, comidas, hábitos, biblioteca y perfil; no toca el consentimiento', () => {
  const local = base();
  const remote = base();
  local.consent = { mine: true };
  remote.consent = { other: true };
  local.profile = { name: 'L', updatedAt: T1 };
  remote.profile = { name: 'R', updatedAt: T2 };
  local.entries = [{ id: U(1), date: '2026-10-18', weight: 80, updatedAt: T1 }];
  remote.entries = [{ id: U(2), date: '2026-10-19', weight: 79, updatedAt: T1 }];
  local.foods['2026-10-19'] = [{ id: U(3), name: 'Pan', meal: 'Desayuno', kcal: 200, protein: 6, carbs: 38, fat: 2, updatedAt: T1 }];
  remote.deleted.foods = [{ id: U(3), date: '2026-10-19', deletedAt: T2, updatedAt: T2 }];   // borrado en el otro móvil
  local.habits['2026-10-19'] = { id: U(4), trained: true, updatedAt: T3 };
  remote.habits['2026-10-19'] = { id: U(5), trained: false, updatedAt: T2 };
  remote.library.arroz = { id: U(6), name: 'Arroz', kcal: 130, protein: 3, carbs: 28, fat: 0, updatedAt: T1 };
  remote.deleted.photos = [{ id: U(8), date: '2026-10-01', deletedAt: T1, updatedAt: T1 }];
  const m = Schema.mergeState(local, remote);
  assert.deepStrictEqual(m.entries.map((e) => e.date).sort(), ['2026-10-18', '2026-10-19']);
  assert.deepStrictEqual(Object.keys(m.foods), [], 'el borrado remoto más nuevo gana');
  assert.strictEqual(m.deleted.foods.length, 1);
  assert.strictEqual(m.habits['2026-10-19'].trained, true);
  assert.strictEqual(m.habits['2026-10-19'].id, U(5), 'clave natural: id del servidor');
  assert.strictEqual(m.library.arroz.kcal, 130);
  assert.strictEqual(m.profile.name, 'R');
  assert.deepStrictEqual(m.consent, { mine: true });
  assert.strictEqual(m.deleted.photos.length, 1);
  // El resultado (sin el perfil y el consentimiento de juguete de esta prueba) es un estado v4 válido.
  assert.deepStrictEqual(load(plain({ ...m, profile: null, consent: null })).warnings, []);
});

test('toRecords / fromRecords: ida y vuelta sin pérdidas', () => {
  const s = load(fx('backup-v3.json')).state;
  s.deleted.entries.push({ id: U(1), date: '2026-09-30', deletedAt: T1, updatedAt: T1 });
  const back = Schema.fromRecords(s, Schema.toRecords(s));
  assert.deepStrictEqual(plain(back), plain(s));
});

test('D2: con clave natural, LWW también dentro del mismo lado (lápida vieja no borra un registro vivo más nuevo)', () => {
  const live = { id: U(1), date: '2026-10-16', weight: 79, updatedAt: T2 };
  const oldTomb = { id: U(2), date: '2026-10-16', deletedAt: T1, updatedAt: T1 };
  assert.deepStrictEqual(Schema.mergeRecords([live, oldTomb], [], { key: 'date' }), [live]);
  assert.deepStrictEqual(Schema.mergeRecords([oldTomb, live], [], { key: 'date' }), [live]);
  assert.deepStrictEqual(Schema.mergeRecords([], [oldTomb, live], { key: 'date' }), [live]);
  // normalize también retira lápidas de un día con registro o hábito vivo.
  const { state } = Schema.normalize({ schemaVersion: 4, entries: [{ id: U(1), date: '2026-10-16', weight: 79 }],
    habits: { '2026-10-16': { id: U(3), trained: true } },
    deleted: { entries: [oldTomb, { id: U(4), date: '2026-10-15', deletedAt: T1 }], habits: [{ id: U(5), date: '2026-10-16', deletedAt: T1 }] } });
  assert.deepStrictEqual(state.deleted.entries.map((t) => t.id), [U(4)]);
  assert.deepStrictEqual(state.deleted.habits, []);
});

test('reloj acotado: un updatedAt más de 5 min en el futuro cuenta como "ahora" al fusionar y al guardar', () => {
  const now = Date.parse(T2);
  const future = { id: U(1), date: '2026-10-16', weight: 70, updatedAt: '2030-01-01T00:00:00.000Z' };
  const edit = { id: U(1), date: '2026-10-16', weight: 71, updatedAt: new Date(now + 60000).toISOString() };   // +1 min: válido
  const [m] = Schema.mergeRecords([future], [edit], { now });
  assert.strictEqual(m.weight, 71, 'la marca de 2030 ya no gana siempre');
  assert.strictEqual(Schema.clampStamp('2030-01-01T00:00:00.000Z', now), T2);
  const in4 = new Date(now + 4 * 60000).toISOString();
  assert.strictEqual(Schema.clampStamp(in4, now), in4, '≤ 5 min se respeta');
  // Una lápida futura no impide recrear el dato.
  const [r] = Schema.mergeRecords([{ id: U(1), date: '2026-10-16', deletedAt: '2031-01-01T00:00:00.000Z', updatedAt: '2031-01-01T00:00:00.000Z' }], [edit], { now });
  assert.strictEqual(r.weight, 71);
  // Al guardar: un registro sin cambios con marca futura queda en "ahora"; las lápidas futuras también.
  const prev = { ...base(), entries: [future] };
  const next = { ...plain(prev), foods: Object.create(null), habits: Object.create(null), library: Object.create(null),
    deleted: { entries: [], foods: [{ id: U(9), date: '2026-10-10', deletedAt: '2031-01-01T00:00:00.000Z', updatedAt: '2031-01-01T00:00:00.000Z' }], habits: [], photos: [] } };
  const s = Schema.stampChanges(plain(prev), next, T2);
  assert.strictEqual(s.entries[0].updatedAt, T2);
  assert.strictEqual(s.deleted.foods[0].updatedAt, T2);
  assert.strictEqual(s.deleted.foods[0].deletedAt, T2);
  // mergeState también acota el perfil.
  const ms = Schema.mergeState({ ...base(), profile: { name: 'Futuro', updatedAt: '2030-01-01T00:00:00.000Z' } },
    { ...base(), profile: { name: 'Hoy', updatedAt: new Date(now + 60000).toISOString() } }, { now });
  assert.strictEqual(ms.profile.name, 'Hoy');
});
