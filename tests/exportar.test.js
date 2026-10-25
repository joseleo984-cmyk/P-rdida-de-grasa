// M6 · Exportar a Excel: generador XLSX (se abre el ZIP y se revisa el XML), filtro de permisos, protección contra fórmulas,
// condición de la Política v1.1, aviso v1.1 y servidor falso (registro de exportaciones).
const test = require('node:test');
const assert = require('node:assert');
const zlib = require('node:zlib');
const X = require('../exportar.js');
const AV = require('../aviso-politica.js');
const RF = require('../remote-fake.js');

// ---------- Lector ZIP mínimo (independiente del generador): directorio central → entradas, con CRC comprobado ----------
function unzip(buf) {
  const b = Buffer.from(buf);
  const eocd = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocd >= 0, 'fin del directorio central');
  const n = b.readUInt16LE(eocd + 10), cdSize = b.readUInt32LE(eocd + 12), cdOff = b.readUInt32LE(eocd + 16);
  assert.strictEqual(cdOff + cdSize, eocd, 'el directorio central termina donde empieza el EOCD');
  const out = new Map();
  let p = cdOff;
  for (let i = 0; i < n; i++) {
    assert.strictEqual(b.readUInt32LE(p), 0x02014b50, 'cabecera central');
    const method = b.readUInt16LE(p + 10), crc = b.readUInt32LE(p + 16), size = b.readUInt32LE(p + 24), nl = b.readUInt16LE(p + 28), xl = b.readUInt16LE(p + 30), cl = b.readUInt16LE(p + 32), off = b.readUInt32LE(p + 42);
    const name = b.slice(p + 46, p + 46 + nl).toString('utf8');
    assert.strictEqual(method, 0, name + ': STORED');
    assert.strictEqual(b.readUInt32LE(off), 0x04034b50, name + ': cabecera local');
    const lnl = b.readUInt16LE(off + 26), lxl = b.readUInt16LE(off + 28);
    assert.strictEqual(b.readUInt32LE(off + 14), crc, name + ': CRC local = central');
    const data = b.slice(off + 30 + lnl + lxl, off + 30 + lnl + lxl + size);
    assert.strictEqual(zlib.crc32(data), crc, name + ': CRC-32 correcto');
    out.set(name, data.toString('utf8'));
    p += 46 + nl + xl + cl;
  }
  return out;
}
// XML bien formado (lo justo para este generador): prólogo, etiquetas balanceadas y sin caracteres prohibidos.
function wellFormed(xml, name) {
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8" standalone="yes"\?>\n</, name + ': prólogo');
  assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(xml), name + ': sin caracteres de control');
  const body = xml.replace(/^<\?xml[^>]*\?>/, '');
  const stack = [];
  for (const m of body.matchAll(/<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>/g)) {
    if (m[1]) assert.strictEqual(stack.pop(), m[2], name + ': cierre de ' + m[2]);
    else if (!m[4]) stack.push(m[2]);
  }
  assert.deepStrictEqual(stack, [], name + ': etiquetas balanceadas');
  assert.ok(!/&(?!amp;|lt;|gt;|quot;|#\d+;)/.test(body), name + ': entidades escapadas');
}
const sst = (files) => [...files.get('xl/sharedStrings.xml').matchAll(/<si><t[^>]*>([\s\S]*?)<\/t><\/si>/g)].map((m) => m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
// Hoja → filas de valores (cadenas resueltas, números y fechas como número de serie).
function sheetRows(files, i) {
  const s = sst(files);
  const xml = files.get(`xl/worksheets/sheet${i}.xml`);
  return [...xml.matchAll(/<row r="(\d+)">([\s\S]*?)<\/row>/g)].map((r) => {
    const row = [];
    for (const c of r[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*)><v>([^<]*)<\/v><\/c>/g)) {
      const col = [...c[1]].reduce((t, ch) => t * 26 + ch.charCodeAt(0) - 64, 0) - 1;
      row[col] = / t="s"/.test(c[2]) ? s[Number(c[3])] : Number(c[3]);
    }
    return row;
  });
}

const D = (n) => X.addDays('2026-10-25', -n);
const rec = (kind, day, data, extra = {}) => ({ id: `${kind}-${day}-${Math.random()}`, kind, nkey: kind === 'food' ? 'f' + Math.random() : day, date: day, data, ...extra });
const ANA = { name: 'Ana Demo', shares: { body: true, nutrition: true, habits: true, notes: true }, records: [
  rec('entry', D(3), { weight: 72.4, waist: 80, note: 'me sentí bien' }),
  rec('food', D(2), { name: 'Arroz con pollo', kcal: 650, protein: 35, meal: 'Almuerzo', time: '13:10', portion: 'normal', dish: 'arroz-con-pollo' }),
  rec('habit', D(2), { water: 2.25, steps: 9000, sleep: 7, trained: true, effort: 'duro', close: 'si' }),
  rec('habit', D(1), { water: 1, trained: true, effort: 'facil' }, { pausePrivate: true }),   // pausa privada: nunca
  rec('profile', null, { name: 'Ana', sex: 'female', age: 35 }),                              // perfil: nunca
  rec('entry', D(40), { weight: 75 }),                                                          // fuera de rango
  rec('entry', D(5), { weight: 73 }, { deletedAt: '2026-10-24T00:00:00Z' }),                    // lápida: nunca
] };
const BETO = { name: 'Beto Demo', shares: { body: true, nutrition: true, habits: false, notes: false }, records: [
  rec('entry', D(4), { weight: 96, note: 'nota privada de Beto' }),
  rec('habit', D(4), { water: 3, trained: true, effort: 'normal' }),   // no comparte hábitos: nunca (aunque llegara)
  rec('food', D(4), { name: '=HYPERLINK("http://x","clic")', kcal: 100, meal: 'Snack' }),
] };

test('visibleRecords: solo lo que el coach puede ver (pausa, lápidas, perfil, biblioteca y lo no compartido fuera)', () => {
  const v = X.visibleRecords(ANA.records, ANA.shares);
  assert.deepStrictEqual(v.map((r) => r.kind).sort(), ['entry', 'entry', 'food', 'habit']);
  assert.ok(!v.some((r) => r.pausePrivate), 'sin pausa privada');
  assert.ok(!X.visibleRecords([rec('habit', D(1), { water: 1 }, { pause_private: true })], { habits: true }).length, 'también con el nombre del servidor');
  assert.deepStrictEqual(X.visibleRecords(BETO.records, BETO.shares).map((r) => r.kind).sort(), ['entry', 'food']);
  assert.deepStrictEqual(X.visibleRecords(BETO.records, { habits: false, nutrition: false }).map((r) => r.kind), ['entry'], 'sin comidas si no las comparte');
  assert.deepStrictEqual(X.visibleRecords([rec('library', null, { name: 'x' }), rec('photo', D(1), {}), { kind: 'entry', data: [] }, null], { habits: true, nutrition: true }), []);
});

test('buildSheets: Léame + una hoja por categoría, con Asesorado y Fecha; sin fotos, sin hábitos de quien no comparte, sin pausa', () => {
  const { sheets, summary } = X.buildSheets({ clients: [BETO, ANA], from: D(30), to: D(0), cats: X.CAT_KEYS, generatedLabel: '25 de octubre de 2026' });
  assert.deepStrictEqual(sheets.map((s) => s.name), ['Leame', 'Medidas', 'Comidas', 'Hábitos', 'Entrenos']);
  for (const s of sheets.slice(1)) assert.deepStrictEqual(s.rows[0].slice(0, 2), ['Asesorado', 'Fecha']);
  const [, med, com, hab, ent] = sheets;
  assert.deepStrictEqual(med.rows.slice(1).map((r) => [r[0], r[1].date, r[2]]), [['Ana Demo', D(3), 72.4], ['Beto Demo', D(4), 96]], 'orden por nombre y fecha; fuera de rango y lápida fuera');
  const noteCol = med.rows[0].indexOf('Nota');
  assert.strictEqual(med.rows[1][noteCol], 'me sentí bien', 'nota de quien comparte notas');
  assert.strictEqual(med.rows[2][noteCol], null, 'sin share_notes: sin nota');
  assert.ok(!JSON.stringify(sheets).includes('nota privada de Beto'));
  assert.deepStrictEqual(hab.rows.slice(1).map((r) => r[0]), ['Ana Demo'], 'hábitos: solo de quien los comparte, sin el día en pausa');
  assert.deepStrictEqual(ent.rows.slice(1), [['Ana Demo', { date: D(2) }, 'Sí', 'Duro']], 'entrenos: sin Beto y sin el entreno escrito en pausa');
  assert.deepStrictEqual(com.rows.slice(1).map((r) => r[4]), ['Arroz con pollo', '=HYPERLINK("http://x","clic")']);
  assert.ok(!/foto|photo|sex|female|age/i.test(JSON.stringify(sheets.slice(1))), 'sin fotos ni perfil');
  assert.deepStrictEqual(summary.noHabits, ['Beto Demo']);
  const leame = Object.fromEntries(sheets[0].rows.filter((r) => r.length === 2));
  assert.strictEqual(leame.Custodia, X.CUSTODY_TEXT, 'Léame con la frase de custodia');
  assert.strictEqual(leame.Fotos, 'No se exportan.');
  assert.strictEqual(leame['Rango de fechas'], `Desde ${D(30)} hasta ${D(0)}`);
  assert.strictEqual(leame.Generado, '25 de octubre de 2026');
  assert.match(leame['Sin hábitos ni entrenos'], /Beto Demo/);
});

test('buildSheets: solo las categorías elegidas; la nota no aparece si nadie comparte notas', () => {
  const { sheets } = X.buildSheets({ clients: [BETO], from: D(30), to: D(0), cats: ['medidas'] });
  assert.deepStrictEqual(sheets.map((s) => s.name), ['Leame', 'Medidas']);
  assert.ok(!sheets[1].rows[0].includes('Nota'));
});

test('XLSX: ZIP válido con CRC, partes obligatorias, XML bien formado y hojas con los nombres esperados', () => {
  const { sheets } = X.buildSheets({ clients: [ANA, BETO], from: D(30), to: D(0), cats: X.CAT_KEYS, generatedLabel: 'hoy' });
  const files = unzip(X.xlsx(sheets, { created: '2026-10-25T15:00:00Z' }));
  for (const f of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/sharedStrings.xml', 'docProps/core.xml', 'docProps/app.xml'])
    assert.ok(files.has(f), 'falta ' + f);
  for (const [name, xml] of files) if (name.endsWith('.xml') || name.endsWith('.rels')) wellFormed(xml, name);
  const wb = files.get('xl/workbook.xml');
  assert.deepStrictEqual([...wb.matchAll(/<sheet name="([^"]+)" sheetId="(\d+)" r:id="rId(\d+)"\/>/g)].map((m) => m[1]), ['Leame', 'Medidas', 'Comidas', 'Hábitos', 'Entrenos']);
  for (let i = 1; i <= 5; i++) {
    assert.ok(files.has(`xl/worksheets/sheet${i}.xml`));
    assert.ok(files.get('[Content_Types].xml').includes(`/xl/worksheets/sheet${i}.xml`));
    assert.ok(files.get('xl/_rels/workbook.xml.rels').includes(`Target="worksheets/sheet${i}.xml"`));
  }
  assert.ok(!/<f>|<f /.test([...files.values()].join('')), 'ninguna fórmula en el archivo');
  const med = sheetRows(files, 2);
  assert.deepStrictEqual(med[0].slice(0, 3), ['Asesorado', 'Fecha', 'Peso (kg)']);
  assert.strictEqual(med[1][0], 'Ana Demo');
  assert.strictEqual(med[1][1], X.serial(D(3)), 'la fecha es una fecha real (número de serie con formato aaaa-mm-dd)');
  assert.match(files.get('xl/worksheets/sheet2.xml'), /<c r="B2" s="2">/);
  assert.strictEqual(med[1][2], 72.4, 'los números van como números');
  const lea = sheetRows(files, 1);
  assert.ok(lea.some((r) => r[0] === 'Custodia' && r[1] === X.CUSTODY_TEXT));
  // Encabezado fijo al desplazarse y en negrita
  assert.match(files.get('xl/worksheets/sheet2.xml'), /<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"\/>/);
  assert.match(files.get('xl/worksheets/sheet2.xml'), /<c r="A1" t="s" s="1">/);
});

test('XLSX: inyección de fórmulas: celdas que empiezan con = + - @ tab o retorno van como TEXTO con apóstrofo (quotePrefix)', () => {
  const evil = ['=1+1', '+57 300', '-2+3', '@SUM(A1)', '\tTAB', '\rCR', '=HYPERLINK("http://x","clic")'];
  const files = unzip(X.xlsx([{ name: 'H', rows: [['x'], ...evil.map((e) => [e]), ['normal'], [-5]] }]));
  const xml = files.get('xl/worksheets/sheet1.xml');
  const strs = sst(files);
  for (let i = 0; i < evil.length; i++) {
    const m = xml.match(new RegExp(`<c r="A${i + 2}"([^>]*)><v>(\\d+)</v></c>`));
    assert.ok(m, 'celda ' + evil[i]);
    assert.match(m[1], / t="s"/, 'tipo cadena: ' + JSON.stringify(evil[i]));
    assert.match(m[1], / s="3"/, 'estilo con apóstrofo: ' + JSON.stringify(evil[i]));
    assert.strictEqual(strs[Number(m[2])], evil[i], 'el texto se conserva tal cual');
  }
  assert.match(files.get('xl/styles.xml'), /<xf numFmtId="49"[^>]*quotePrefix="1"\/>/, 'el estilo 3 es texto (@) con quotePrefix');
  assert.match(xml, /<c r="A9" t="s"><v>\d+<\/v><\/c>/, 'texto normal sin estilo especial');
  assert.match(xml, /<c r="A10"><v>-5<\/v><\/c>/, 'un número negativo sigue siendo número (no texto)');
  for (const e of evil) assert.strictEqual(X.isRisky(e), true);
  assert.strictEqual(X.isRisky('Ana'), false);
});

test('XLSX: escapa XML, quita caracteres de control y conserva tildes, ñ y emojis', () => {
  const files = unzip(X.xlsx([{ name: 'Hábitos & <más>', rows: [['a'], ['Ñandú <b> & "c" \u0001\u0007 💪 \uD800']] }]));
  for (const [n, x] of files) if (/\.(xml|rels)$/.test(n)) wellFormed(x, n);
  assert.ok(files.get('xl/workbook.xml').includes('name="Hábitos &amp; &lt;más&gt;"'));
  assert.ok(sst(files).includes('Ñandú <b> & "c"  💪 '));
});

test('colName, serial, fileName, rangeOf y validate', () => {
  assert.deepStrictEqual([0, 25, 26, 27, 701, 702].map(X.colName), ['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
  assert.strictEqual(X.serial('1900-03-01'), 61);
  assert.strictEqual(X.serial('2026-10-25'), 46320);
  assert.strictEqual(X.fileName('2026-10-25'), 'exportacion-2026-10-25.xlsx');
  assert.deepStrictEqual(X.rangeOf('mes', '2026-10-25'), { from: '2026-10-01', to: '2026-10-25' });
  assert.deepStrictEqual(X.rangeOf('3m', '2026-10-25'), { from: '2026-07-25', to: '2026-10-25' });
  assert.deepStrictEqual(X.rangeOf('3m', '2026-05-31'), { from: '2026-02-28', to: '2026-05-31' }, 'fin de mes corto');
  assert.deepStrictEqual(X.rangeOf('todo', '2026-10-25', '2026-08-01'), { from: '2026-08-01', to: '2026-10-25' });
  assert.strictEqual(X.rangeOf('todo', '2026-10-25').to, '2026-10-25');
  const ok = { clientIds: ['a'], cats: ['medidas'], from: '2026-10-01', to: '2026-10-25', today: '2026-10-25', custody: true };
  assert.strictEqual(X.validate(ok), null);
  assert.match(X.validate({ ...ok, custody: false }), /casilla/);
  assert.match(X.validate({ ...ok, clientIds: [] }), /asesorado/);
  assert.match(X.validate({ ...ok, cats: [] }), /tipo de dato/);
  assert.match(X.validate({ ...ok, cats: ['fotos'] }), /tipo de dato/, 'las fotos no son exportables');
  assert.match(X.validate({ ...ok, from: '2026-10-26' }), /anterior/);
  assert.match(X.validate({ ...ok, to: '2026-12-01' }), /futura/);
  assert.match(X.validate({ ...ok, from: '' }), /fechas/);
  assert.deepStrictEqual(X.logPayload({ ...ok, clientIds: ['a', 'b'], cats: ['entrenos', 'medidas'] }), { clients: 2, categories: ['medidas', 'entrenos'], from: '2026-10-01', to: '2026-10-25', custody: true },
    'al servidor va solo cuántos, categorías, rango y la casilla (nunca nombres ni datos)');
});

test('Política v1.1: con 1.0 el botón queda desactivado y dice por qué; con 1.1 y el aviso activo se habilita (ligado a legal/VERSIONS.json)', () => {
  const v = (version, active = true) => ({ privacy: { version, notice: { id: 'x', active } } });
  const g10 = X.policyGate(v('1.0'));
  assert.strictEqual(g10.ok, false);
  assert.match(g10.reason, /Política de Tratamiento de Datos v1\.1/);
  assert.match(g10.reason, /Hoy está publicada la v1\.0/);
  assert.strictEqual(X.policyGate(v('0.1')).ok, false);
  assert.strictEqual(X.policyGate(v('1.1')).ok, true);
  assert.strictEqual(X.policyGate(v('1.10')).ok, true);
  assert.strictEqual(X.policyGate(v('2.0')).ok, true);
  const off = X.policyGate(v('1.1', false));
  assert.strictEqual(off.ok, false);
  assert.match(off.reason, /aviso/);
  assert.strictEqual(X.policyGate(null).ok, false);
  const real = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '../legal/VERSIONS.json'), 'utf8'));
  assert.strictEqual(X.policyGate(real).ok, true, 'la versión publicada hoy (VERSIONS.json) habilita la descarga');
});

test('Aviso v1.1: una vez por cuenta y versión del aviso; sin sesión o con el aviso apagado no sale', () => {
  const versions = { privacy: { version: '1.1', notice: { id: 'politica-1.1', active: true } } };
  assert.strictEqual(AV.shouldShow({ versions, userId: 'u1', seen: [] }), true);
  assert.strictEqual(AV.shouldShow({ versions, userId: 'u1', seen: [AV.seenKey('u1', versions)] }), false);
  assert.strictEqual(AV.shouldShow({ versions, userId: 'u2', seen: [AV.seenKey('u1', versions)] }), true, 'otra cuenta en el mismo teléfono lo ve');
  assert.strictEqual(AV.shouldShow({ versions, userId: null, seen: [] }), false);
  assert.strictEqual(AV.shouldShow({ versions: { privacy: { version: '1.1', notice: { id: 'p', active: false } } }, userId: 'u1', seen: [] }), false);
  assert.strictEqual(AV.shouldShow({ versions: { privacy: { version: '1.2', notice: { id: 'politica-1.2', active: true } } }, userId: 'u1', seen: [AV.seenKey('u1', versions)] }), true, 'un aviso nuevo vuelve a salir');
});

test('servidor falso: log_export exige la cláusula 14, la casilla y un rango válido; my_exports solo del propio coach; el admin solo cuenta', async () => {
  const be = new RF.FakeBackend();
  const mk = async (email) => { const r = RF.createFake({ backend: be }); await r.auth.sendCode(email); await r.auth.verifyCode(email, be.lastCode(email)); await r.account.joinApp(); return r; };
  const agree = (r, v, granted = true) => r.account.recordConsents([{ kind: 'coach_agreement', granted, version: v, textHash: 'a'.repeat(64), clientAt: new Date(be.clock.now()).toISOString() }]);
  const coach = await mk('coach@x.co');
  await agree(coach, '0.4-A7-coach');
  const { inviteCode } = await coach.coach.becomeCoach('Fit X');
  const cli = await mk('ana@x.co');
  await cli.account.recordConsents(['sensitive_health', 'cloud_transfer'].map((kind) => ({ kind, granted: true, version: 't', textHash: 'b'.repeat(64), clientAt: '2026-10-01T00:00:00Z' })));
  await cli.client.joinCoach(inviteCode, { body: true, nutrition: true, habits: false, version: 'compartir-c2', textHash: 'c'.repeat(64) });
  const today = be.todayBogota();
  const ok = { clients: 1, categories: ['medidas'], from: X.addDays(today, -30), to: today, custody: true };
  await assert.rejects(coach.coach.logExport(ok), (e) => e.code === 'export_agreement_required', 'con 0.4 no exporta');
  assert.ok((await coach.coach.clients()).length === 1, 'pero la app sigue funcionando con 0.4');
  await agree(coach, '0.5-A7-coach');
  await assert.rejects(coach.coach.logExport({ ...ok, custody: false }), (e) => e.code === 'invalid');
  await assert.rejects(coach.coach.logExport({ ...ok, clients: 2 }), (e) => e.code === 'invalid', 'más asesorados de los que tiene');
  await assert.rejects(coach.coach.logExport({ ...ok, categories: ['fotos'] }), (e) => e.code === 'invalid');
  await assert.rejects(coach.coach.logExport({ ...ok, to: X.addDays(today, 5) }), (e) => e.code === 'invalid');
  const r = await coach.coach.logExport({ ...ok, categories: ['entrenos', 'medidas', 'medidas'] });
  assert.deepStrictEqual([r.clients, r.categories], [1, ['entrenos', 'medidas']]);
  assert.strictEqual((await coach.coach.exports()).length, 1);
  assert.deepStrictEqual(Object.keys(be.exports[0]).sort(), ['agreementVersion', 'categories', 'clients', 'coachId', 'createdAt', 'custody', 'from', 'id', 'to'], 'sin contenido ni identidades de asesorados');
  await assert.rejects(cli.coach.exports(), (e) => e.code === 'forbidden', 'un asesorado no ve nada de esto');
  await agree(coach, '0.5-A7-coach', false);
  await assert.rejects(coach.coach.logExport(ok), (e) => e.code === 'agreement_required' || e.code === 'export_agreement_required', 'acuerdo retirado: no exporta');
});
