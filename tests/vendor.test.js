// supabase-js vendorizado (contrato R1 §6): el archivo commiteado no se edita a mano (SHA-256 de vendor/VERSIONS.json),
// coincide con la devDependency de versión exacta (si node_modules está instalado) y se publica y precachea sin CDN.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { sha256, PKG, UMD } = require('../scripts/vendor.js');

const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const V = JSON.parse(read('vendor/VERSIONS.json'))['@supabase/supabase-js'];

test('vendor: el hash del archivo vendorizado coincide con VERSIONS.json (nadie lo edita a mano)', () => {
  assert.match(V.version, /^2\.\d+\.\d+$/);
  assert.strictEqual(V.file, `supabase-${V.version}.js`);
  const buf = fs.readFileSync(path.join(ROOT, 'vendor', V.file));
  assert.strictEqual(buf.length, V.bytes);
  assert.strictEqual(sha256(buf), V.sha256);
  assert.deepStrictEqual(fs.readdirSync(path.join(ROOT, 'vendor')).filter((f) => f.startsWith('supabase-')), [V.file], 'una sola versión vendorizada');
});

test('vendor: versión exacta en package.json e idéntico al UMD de node_modules (si está instalado)', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.strictEqual(pkg.devDependencies['@supabase/supabase-js'], V.version, 'devDependency con versión EXACTA (sin ^ ni ~)');
  if (!fs.existsSync(UMD)) return; // pages.yml ejecuta npm test sin npm ci: basta el hash de VERSIONS.json
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(PKG, 'package.json'), 'utf8')).version, V.version);
  assert.strictEqual(sha256(fs.readFileSync(UMD)), V.sha256, 'vendor/ no coincide con node_modules: ejecuta npm run vendor');
});

test('vendor: se carga en index.html antes de remote.js, se precachea en sw.js y se publica en pages.yml; sin CDN', () => {
  const html = read('index.html');
  const srcs = [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(srcs.includes(`vendor/${V.file}`));
  assert.ok(srcs.indexOf(`vendor/${V.file}`) < srcs.indexOf('remote.js'));
  assert.ok(srcs.indexOf('schema.js') < srcs.indexOf('sync.js') && srcs.indexOf('sync.js') < srcs.indexOf('app.js'));
  for (const s of srcs) assert.ok(!/^(https?:)?\/\//.test(s), 'script externo (CDN) en producción: ' + s);
  const sw = read('sw.js');
  for (const f of [`vendor/${V.file}`, 'sync.js', 'remote.js', 'config.js']) assert.ok(sw.includes(`'${f}'`), 'sw.js ASSETS sin ' + f);
  const pages = read('scripts/build-site.js'); // pages.yml ejecuta `npm run build:site`
  assert.ok(read('.github/workflows/pages.yml').includes('npm run build:site'), 'pages.yml no usa build:site');
  assert.ok(pages.includes(`vendor/${V.file}`), 'build-site.js no publica el vendor');
  assert.ok(/'sync\.js'/.test(pages), 'build-site.js no copia sync.js');
  // El servidor falso solo se publica en la copia DEMO (/demo/, sin servidor real): una única mención en código, en DEMO_FILES; la raíz y /pruebas/ no lo llevan (tests/site.test.js).
  const code = pages.split('\n').filter((l) => !/^\s*\/\//.test(l));
  const mentions = code.filter((l) => /remote-fake\.js/.test(l));
  assert.strictEqual(mentions.length, 1, 'el fake solo puede publicarse en la demo');
  assert.ok(/DEMO_FILES\s*=/.test(mentions[0]), 'el fake solo se publica en DEMO_FILES');
});

test('config.js: conectado a plataforma con URL y clave PUBLICABLE; nunca una clave secreta ni la de pruebas', () => {
  const cfg = read('config.js');
  assert.match(cfg, /url: 'https:\/\/[a-z0-9]{20}\.supabase\.co'/);
  assert.match(cfg, /key: 'sb_publishable_[A-Za-z0-9_-]+'/);
  assert.ok(!cfg.includes('myeuoqvyyhveoxrpkjvg') && !cfg.includes('sb_publishable_rWpR'), 'no es la de pruebas');
  assert.ok(!/sb_secret_|service_role/.test(cfg.replace(/\/\/.*$/gm, '')));
});
