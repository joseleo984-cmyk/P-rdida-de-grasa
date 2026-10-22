// Sprint 5: generador de QR propio (qr.js). Se valida con jsQR (decodificador independiente, solo devDependency de pruebas)
// y con vectores conocidos de la norma ISO/IEC 18004 (información de formato/versión, capacidades, Reed-Solomon).
const test = require('node:test');
const assert = require('node:assert');
const jsQR = require('jsqr');
const QR = require('../qr.js');
const { rsRemainder, formatBits, versionBits, alignPositions, dataCodewords, rawModules } = QR._internals;

// Pinta la matriz como imagen RGBA (zona silenciosa de 4, 6 px por módulo) y la decodifica con jsQR.
function decode(qr, scale = 6, quiet = 4) {
  const dim = (qr.size + quiet * 2) * scale;
  const img = new Uint8ClampedArray(dim * dim * 4).fill(255);
  for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) {
    if (!qr.modules[y][x]) continue;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const o = (((y + quiet) * scale + dy) * dim + (x + quiet) * scale + dx) * 4;
      img[o] = img[o + 1] = img[o + 2] = 0;
    }
  }
  const r = jsQR(img, dim, dim);
  return r ? new TextDecoder().decode(Uint8Array.from(r.binaryData)) : null;
}

test('información de formato y de versión: valores de las tablas de la norma', () => {
  assert.strictEqual(formatBits('M', 0), 0b101010000010010);
  assert.strictEqual(formatBits('L', 0), 0b111011111000100);
  assert.strictEqual(formatBits('M', 5), 0b100000011001110);
  assert.strictEqual(versionBits(7), 0b000111110010010100);
  assert.strictEqual(versionBits(10), 0b001010010011010011);
});

test('capacidades en modo byte (tabla de la norma) y posiciones de alineación', () => {
  const cap = (v, e) => dataCodewords(v, e) - 2 - (v >= 10 ? 1 : 0); // bytes de texto: menos 4+8/16 bits de cabecera
  assert.deepStrictEqual([1, 2, 3, 4, 5].map((v) => cap(v, 'M')), [14, 26, 42, 62, 84]);
  assert.deepStrictEqual([1, 2, 3, 4, 5].map((v) => cap(v, 'L')), [17, 32, 53, 78, 106]);
  assert.strictEqual(cap(10, 'M'), 213);
  assert.strictEqual(cap(10, 'L'), 271);
  assert.strictEqual(rawModules(1), 208);
  assert.strictEqual(rawModules(10), 2768);
  assert.deepStrictEqual(alignPositions(1), []);
  assert.deepStrictEqual(alignPositions(2), [6, 18]);
  assert.deepStrictEqual(alignPositions(7), [6, 22, 38]);
  assert.deepStrictEqual(alignPositions(10), [6, 28, 50]);
});

test('Reed-Solomon: ejemplos publicados (1-M "01234567" de la norma y "HELLO WORLD")', () => {
  assert.deepStrictEqual(rsRemainder([16, 32, 12, 86, 97, 128, 236, 17, 236, 17, 236, 17, 236, 17, 236, 17], 10), [165, 36, 212, 193, 237, 54, 199, 135, 44, 85]);
  assert.deepStrictEqual(rsRemainder([32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17], 10), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
});

test('patrones fijos: buscadores, alineación, sincronía, módulo oscuro', () => {
  for (const [v, text] of [[1, 'a'], [2, 'x'.repeat(20)], [7, "y".repeat(140)]]) {
    const q = QR.encode(text, { ecc: v === 7 ? 'L' : 'M' });
    assert.strictEqual(q.version, v);
    const m = q.modules, n = q.size;
    for (const [cx, cy] of [[3, 3], [n - 4, 3], [3, n - 4]]) {
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        assert.strictEqual(m[cy + dy][cx + dx], d !== 2, `buscador ${cx},${cy} ${dx},${dy}`);
      }
    }
    for (let i = 8; i < n - 8; i++) { assert.strictEqual(m[6][i], i % 2 === 0); assert.strictEqual(m[i][6], i % 2 === 0); }
    assert.strictEqual(m[n - 8][8], true);
    if (v >= 2) {
      const a = alignPositions(v), c = a[a.length - 1];
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) assert.strictEqual(m[c + dy][c + dx], Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
});

test('la información de formato de la matriz se lee igual en las dos copias', () => {
  const q = QR.encode('https://ejemplo.org/app?c=ABC234');
  const m = q.modules, n = q.size;
  let a = 0, b = 0;
  const A = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  A.forEach(([x, y], i) => { if (m[y][x]) a |= 1 << i; });
  for (let i = 0; i < 8; i++) if (m[8][n - 1 - i]) b |= 1 << i;
  for (let i = 8; i < 15; i++) if (m[n - 15 + i][8]) b |= 1 << i;
  assert.strictEqual(a, b);
  assert.strictEqual(a, formatBits(q.ecc, q.mask));
});

test('decodifica con jsQR: cadenas variadas, versiones 1 a 10, niveles M y L', () => {
  const link = 'https://joseleo984-cmyk.github.io/P-rdida-de-grasa/?c=3KSDNF';
  const cases = ['A', '0', 'Hola', link, link + '/pruebas/', 'http://localhost:4770/index.html?remote=fake&c=ZZ9988',
    'Pérdida de grasa: ñandú, café, 100% ¡sí! — “comillas”', 'emoji 💪🥗 y 日本語', 'x'.repeat(14), 'x'.repeat(15), 'y'.repeat(62), 'z'.repeat(63),
    'Aa1-'.repeat(40), 'Q'.repeat(150), 'R'.repeat(120), 'w'.repeat(213), 'w'.repeat(214), 'v'.repeat(271)];
  const seen = new Set();
  for (const text of cases) {
    for (const ecc of ['M', 'L']) {
      const q = QR.encode(text, { ecc });
      seen.add(q.version);
      assert.ok(q.version >= 1 && q.version <= 10);
      assert.strictEqual(q.size, q.version * 4 + 17);
      assert.strictEqual(decode(q), text, `${ecc} v${q.version} ${text.slice(0, 20)}`);
    }
  }
  for (let v = 1; v <= 10; v++) assert.ok(seen.has(v), 'falta cubrir la versión ' + v);
});

test('aleatorio con semilla fija: 120 textos de 1 a 271 bytes, ambos niveles, decodifican igual', () => {
  let seed = 20261022;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:/?=&-_.%ñáé ';
  for (let i = 0; i < 120; i++) {
    const len = 1 + Math.floor(rnd() * (i % 2 ? 100 : 270));
    let text = ''; for (let k = 0; k < len; k++) text += alphabet[Math.floor(rnd() * alphabet.length)];
    const ecc = i % 3 === 0 ? 'L' : 'M';
    if (new TextEncoder().encode(text).length > 271) continue;
    const q = QR.encode(text, { ecc });
    assert.strictEqual(decode(q), text, `#${i} ${ecc} v${q.version} len ${len}`);
  }
});

test('las 8 máscaras producen QR válidos (versiones con y sin información de versión)', () => {
  for (const text of ['https://ejemplo.org/?c=ABC234', 'k'.repeat(120), 'k'.repeat(200)]) {
    for (let mask = 0; mask < 8; mask++) {
      const q = QR.encode(text, { mask, ecc: 'L' });
      assert.strictEqual(q.mask, mask);
      assert.strictEqual(decode(q), text, `máscara ${mask} v${q.version}`);
    }
  }
});

test('elige la máscara de menor penalización, es determinista y usa M salvo que no quepa', () => {
  const text = 'https://ejemplo.org/app/?c=KP7M2X';
  const a = QR.encode(text), b = QR.encode(text);
  assert.deepStrictEqual(a, b);
  assert.strictEqual(a.ecc, 'M');
  assert.strictEqual(QR.encode('w'.repeat(213)).ecc, 'M');
  assert.strictEqual(QR.encode('w'.repeat(214)).ecc, 'L');
  assert.strictEqual(QR.encode(text, { ecc: 'L' }).ecc, 'L');
});

test('texto demasiado largo: error claro; vacío y nulo no rompen', () => {
  assert.throws(() => QR.encode('x'.repeat(272)), /demasiado largo/);
  assert.strictEqual(decode(QR.encode('')) === null || decode(QR.encode('')) === '', true);
  assert.ok(QR.encode(null).size >= 21);
});

test('svg: fondo blanco con zona silenciosa de 4, crispEdges, role img con etiqueta escapada', () => {
  const text = 'https://ejemplo.org/?c=ABC234';
  const q = QR.encode(text);
  const s = QR.svg(text, { label: 'QR de "invitación" <b>' });
  const dim = q.size + 8;
  assert.ok(s.includes(`viewBox="0 0 ${dim} ${dim}"`));
  assert.ok(s.includes('shape-rendering="crispEdges"'));
  assert.ok(s.includes('role="img"'));
  assert.ok(s.includes('aria-label="QR de &quot;invitación&quot; &lt;b&gt;"'));
  assert.ok(s.includes('<rect width="' + dim + '" height="' + dim + '" fill="#fff"/>'));
  assert.ok(!/<b>|https?:\/\/(?!www\.w3\.org)/.test(s), 'el SVG no lleva el enlace ni HTML');
  // la ruta dibuja exactamente los módulos oscuros, desplazados 4
  const d = s.match(/<path d="([^"]+)"/)[1];
  const grid = Array.from({ length: q.size }, () => new Array(q.size).fill(false));
  for (const m of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) for (let i = 0; i < +m[3]; i++) grid[+m[2] - 4][+m[1] - 4 + i] = true;
  assert.deepStrictEqual(grid, q.modules);
  assert.ok(QR.svg(text).includes('aria-hidden="true"'));
});
