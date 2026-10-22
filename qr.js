// Sprint 5: generador de códigos QR propio (ISO/IEC 18004), puro y sin dependencias. El enlace NO sale del dispositivo.
// Alcance cerrado: modo byte (UTF-8), versiones 1 a 10 (hasta 213 bytes con nivel M, 271 con L), corrección de errores M
// (se usa L solo si el texto no cabe en M), las 8 máscaras con la mejor penalización. Probado en tests/qr.test.js contra jsQR.
(function (root) {
  'use strict';
  const MAX_VERSION = 10;
  // Palabras de corrección por bloque y número de bloques, versiones 1..10 (tabla 9 de la norma).
  const ECC_PER_BLOCK = { L: [7, 10, 15, 20, 26, 18, 20, 24, 30, 18], M: [10, 16, 26, 18, 24, 16, 18, 22, 22, 26] };
  const NUM_BLOCKS = { L: [1, 1, 1, 1, 1, 2, 2, 2, 2, 4], M: [1, 1, 1, 2, 2, 4, 4, 4, 5, 5] };
  const FORMAT_BITS = { L: 1, M: 0 }; // indicador del nivel en la información de formato

  const bit = (x, i) => ((x >>> i) & 1) !== 0;

  // ---------- Aritmética GF(256), polinomio 0x11D ----------
  const EXP = new Array(512), LOG = new Array(256);
  (function () {
    let x = 1;
    for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

  function rsGenerator(degree) { // coeficientes de x^(degree-1)..x^0 de (x-α^0)…(x-α^(degree-1)), sin el término líder
    let g = [1];
    for (let i = 0; i < degree; i++) {
      const next = new Array(g.length + 1).fill(0);
      for (let j = 0; j < g.length; j++) { next[j] ^= g[j]; next[j + 1] ^= gfMul(g[j], EXP[i]); }
      g = next;
    }
    return g.slice(1);
  }
  function rsRemainder(data, degree) {
    const gen = rsGenerator(degree);
    const rem = new Array(degree).fill(0);
    for (const b of data) {
      const f = b ^ rem.shift();
      rem.push(0);
      if (f !== 0) for (let i = 0; i < degree; i++) rem[i] ^= gfMul(gen[i], f);
    }
    return rem;
  }

  // ---------- Capacidad ----------
  function alignPositions(ver) {
    if (ver === 1) return [];
    const n = Math.floor(ver / 7) + 2, size = ver * 4 + 17;
    const step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
    const res = [6];
    for (let pos = size - 7; res.length < n; pos -= step) res.splice(1, 0, pos);
    return res;
  }
  function rawModules(ver) { // módulos que no son de función
    let r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) { const n = Math.floor(ver / 7) + 2; r -= (25 * n - 10) * n - 55; if (ver >= 7) r -= 36; }
    return r;
  }
  const dataCodewords = (ver, ecc) => Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ecc][ver - 1] * NUM_BLOCKS[ecc][ver - 1];
  const ccBits = (ver) => (ver <= 9 ? 8 : 16);

  function utf8(text) {
    if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(text));
    const s = unescape(encodeURIComponent(text)); // eslint-disable-line no-undef
    return Array.from(s, (c) => c.charCodeAt(0));
  }

  function pickVersion(bytes, eccPref) {
    for (const ecc of eccPref === 'L' ? ['L'] : ['M', 'L']) {
      for (let v = 1; v <= MAX_VERSION; v++) {
        if (4 + ccBits(v) + bytes.length * 8 <= dataCodewords(v, ecc) * 8) return { version: v, ecc };
      }
    }
    return null;
  }

  // ---------- Palabras de datos y corrección ----------
  function makeCodewords(bytes, ver, ecc) {
    const bits = [];
    const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(0b0100, 4); put(bytes.length, ccBits(ver)); for (const b of bytes) put(b, 8);
    const cap = dataCodewords(ver, ecc) * 8;
    put(0, Math.min(4, cap - bits.length));
    while (bits.length % 8) bits.push(0);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    for (let pad = 0xEC; data.length < cap / 8; pad ^= 0xEC ^ 0x11) data.push(pad);

    const nBlocks = NUM_BLOCKS[ecc][ver - 1], eccLen = ECC_PER_BLOCK[ecc][ver - 1];
    const raw = Math.floor(rawModules(ver) / 8);
    const shortLen = Math.floor(raw / nBlocks), numShort = nBlocks - (raw % nBlocks);
    const blocks = [];
    for (let i = 0, k = 0; i < nBlocks; i++) {
      const len = shortLen - eccLen + (i < numShort ? 0 : 1);
      const d = data.slice(k, k + len); k += len;
      blocks.push({ data: d, ecc: rsRemainder(d, eccLen) });
    }
    const out = [];
    for (let i = 0; i < blocks[blocks.length - 1].data.length; i++) for (let j = 0; j < nBlocks; j++) if (i < blocks[j].data.length) out.push(blocks[j].data[i]);
    for (let i = 0; i < eccLen; i++) for (let j = 0; j < nBlocks; j++) out.push(blocks[j].ecc[i]);
    return out;
  }

  // ---------- Matriz ----------
  const MASKS = [
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    (x, y) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => ((((x + y) % 2) + ((x * y) % 3)) % 2) === 0,
  ];

  function formatBits(ecc, mask) { // 15 bits: BCH(15,5) con máscara 0x5412
    const data = (FORMAT_BITS[ecc] << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    return ((data << 10) | rem) ^ 0x5412;
  }
  function versionBits(ver) { // 18 bits: Golay(18,6)
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    return (ver << 12) | rem;
  }

  function buildFunctionPatterns(ver) {
    const size = ver * 4 + 17;
    const mod = Array.from({ length: size }, () => new Array(size).fill(false));
    const fn = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (x, y, dark) => { mod[y][x] = dark; fn[y][x] = true; };
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
      }
    }
    const ap = alignPositions(ver);
    for (let i = 0; i < ap.length; i++) for (let j = 0; j < ap.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === ap.length - 1) || (i === ap.length - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ap[i] + dx, ap[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    return { size, mod, fn, set };
  }
  function drawFormat(P, ecc, mask) {
    const { size, set } = P, b = formatBits(ecc, mask);
    for (let i = 0; i <= 5; i++) set(8, i, bit(b, i));
    set(8, 7, bit(b, 6)); set(8, 8, bit(b, 7)); set(7, 8, bit(b, 8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(b, i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(b, i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(b, i));
    set(8, size - 8, true); // módulo oscuro fijo
  }
  function drawVersion(P, ver) {
    if (ver < 7) return;
    const b = versionBits(ver);
    for (let i = 0; i < 18; i++) {
      const a = P.size - 11 + (i % 3), c = Math.floor(i / 3);
      P.set(a, c, bit(b, i)); P.set(c, a, bit(b, i));
    }
  }
  function placeData(P, codewords) {
    const { size, mod, fn } = P;
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j, upward = ((right + 1) & 2) === 0, y = upward ? size - 1 - vert : vert;
        if (!fn[y][x] && i < codewords.length * 8) { mod[y][x] = bit(codewords[i >>> 3], 7 - (i & 7)); i++; }
      }
    }
  }
  function applyMask(P, mask) {
    for (let y = 0; y < P.size; y++) for (let x = 0; x < P.size; x++) if (!P.fn[y][x] && MASKS[mask](x, y)) P.mod[y][x] = !P.mod[y][x];
  }

  // Penalización de la norma (reglas N1 a N4: 3, 3, 40, 10).
  function penalty(m) {
    const n = m.length;
    let score = 0, dark = 0;
    const line = (get) => {
      let run = 1;
      for (let i = 1; i < n; i++) {
        if (get(i) === get(i - 1)) run++; else { if (run >= 5) score += 3 + (run - 5); run = 1; }
      }
      if (run >= 5) score += 3 + (run - 5);
      // patrón 1:1:3:1:1 (oscuro-claro-oscuro×3-claro-oscuro) con 4 módulos claros a un lado
      for (let i = 0; i + 11 <= n; i++) {
        const w = []; for (let k = 0; k < 11; k++) w.push(get(i + k) ? 1 : 0);
        const s = w.join('');
        if (s === '10111010000' || s === '00001011101') score += 40;
      }
    };
    for (let y = 0; y < n; y++) line((i) => m[y][i]);
    for (let x = 0; x < n; x++) line((i) => m[i][x]);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (m[y][x]) dark++;
      if (x + 1 < n && y + 1 < n && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) score += 3;
    }
    const pct = (dark * 100) / (n * n);
    score += 10 * Math.floor(Math.abs(pct - 50) / 5);
    return score;
  }

  // encode(texto, { ecc: 'M'|'L' }) -> { version, size, ecc, mask, modules: boolean[][] } (true = oscuro). Lanza si no cabe.
  function encode(text, opts) {
    const bytes = utf8(String(text == null ? '' : text));
    const pick = pickVersion(bytes, (opts && opts.ecc) === 'L' ? 'L' : 'M');
    if (!pick) throw new Error('QR: el texto es demasiado largo (máximo ' + dataCodewords(MAX_VERSION, 'L') + ' bytes)');
    const { version, ecc } = pick;
    const codewords = makeCodewords(bytes, version, ecc);
    let best = null;
    const only = opts && Number.isInteger(opts.mask) && opts.mask >= 0 && opts.mask < 8 ? opts.mask : -1; // solo pruebas
    for (let mask = 0; mask < 8; mask++) {
      if (only >= 0 && mask !== only) continue;
      const P = buildFunctionPatterns(version);
      drawFormat(P, ecc, mask); drawVersion(P, version);
      placeData(P, codewords);
      applyMask(P, mask);
      const sc = penalty(P.mod);
      if (!best || sc < best.score) best = { score: sc, mask, P };
    }
    return { version, size: best.P.size, ecc, mask: best.mask, modules: best.P.mod };
  }

  const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // svg(texto, { quiet: 4, label }) -> cadena SVG: fondo blanco con zona silenciosa, módulos negros en un solo trazo.
  function svg(text, opts) {
    const o = opts || {};
    const quiet = o.quiet == null ? 4 : o.quiet;
    const qr = encode(text, o);
    const dim = qr.size + quiet * 2;
    let d = '';
    for (let y = 0; y < qr.size; y++) {
      for (let x = 0; x < qr.size; x++) {
        if (!qr.modules[y][x]) continue;
        let w = 1; while (x + w < qr.size && qr.modules[y][x + w]) w++;
        d += `M${x + quiet} ${y + quiet}h${w}v1h-${w}z`;
        x += w - 1;
      }
    }
    const label = o.label ? ` role="img" aria-label="${escAttr(o.label)}"` : ' aria-hidden="true"';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges"${label}>` +
      `<rect width="${dim}" height="${dim}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }

  const api = { MAX_VERSION, encode, svg, _internals: { rsRemainder, formatBits, versionBits, alignPositions, dataCodewords, makeCodewords, rawModules } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.QR = api;
})(typeof window !== 'undefined' ? window : globalThis);
