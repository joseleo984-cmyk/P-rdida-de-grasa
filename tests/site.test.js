// Sitio construido (scripts/build-site.js): la raíz NO lleva la URL ni la clave de pruebas; /pruebas/ sí; sin claves secretas.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-test-'));
execFileSync('node', [path.join(__dirname, '../scripts/build-site.js'), '--out', dir], { stdio: 'pipe' });
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const REF = 'myeuoqvyyhveoxrpkjvg';

test('la raíz no incluye la URL ni la clave de pruebas y su config.js sigue vacío', () => {
  const files = walk(dir).filter((f) => !f.startsWith(path.join(dir, 'pruebas') + path.sep));
  for (const f of files) {
    const t = fs.readFileSync(f, 'utf8');
    assert.ok(!t.includes(REF), 'referencia de pruebas en ' + f);
    assert.ok(!t.includes('sb_publishable_rWpR'), 'clave de pruebas en ' + f);
  }
  const cfg = read('config.js');
  assert.ok(!cfg.includes('supabase.co'));
  assert.match(cfg, /env:\s*''/);
  assert.match(cfg, /url:\s*''/);
  assert.match(cfg, /key:\s*''/);
});

test('/pruebas/ lleva la URL correcta, la clave publicable, env pruebas, noindex y manifest propio', () => {
  const cfg = read('pruebas/config.js');
  assert.ok(cfg.includes(`https://${REF}.supabase.co`));
  assert.match(cfg, /env:\s*'pruebas'/);
  assert.match(cfg, /key:\s*'sb_publishable_/);
  assert.match(read('pruebas/index.html'), /<meta name="robots" content="noindex,nofollow">/);
  assert.ok(!read('index.html').includes('noindex'));
  const m = JSON.parse(read('pruebas/manifest.webmanifest'));
  assert.strictEqual(m.name, 'Pérdida de Grasa (pruebas)');
  assert.strictEqual(m.start_url, './');
  assert.strictEqual(m.scope, './');
  assert.match(read('robots.txt'), /Disallow: \/P-rdida-de-grasa\/pruebas\//);
});

test('ninguna clave secreta ni service_role en todo _site', () => {
  for (const f of walk(dir)) {
    if (f.includes(path.sep + 'vendor' + path.sep)) continue; // la librería de terceros menciona esas palabras en su código
    const t = fs.readFileSync(f, 'utf8');
    assert.ok(!/sb_secret_|service_role/.test(t), 'clave secreta en ' + f);
  }
});

test('el sitio incluye todos los archivos que carga index.html y precachea sw.js (raíz y pruebas)', () => {
  for (const base of ['', 'pruebas/']) {
    for (const f of ['index.html', 'schema.js', 'coach.js', 'photos.js', 'app.js', 'config.js', 'ns.js', 'remote.js', 'account.js', 'coach-panel.js', 'sync.js', 'cloud-view.js', 'calc.js', 'sw.js', 'manifest.webmanifest', 'icon.svg', 'styles.css', 'vendor/supabase-2.117.2.js', 'legal/terminos.html', 'legal/privacidad.html']) {
      assert.ok(fs.existsSync(path.join(dir, base, f)), base + f);
    }
  }
});

test('PGNS: sin env los nombres son los de siempre; con env llevan sufijo', () => {
  const { create } = require('../ns.js');
  const p = create({ env: '' }), t = create({ env: 'pruebas' }), x = create({ env: '../x' });
  assert.deepStrictEqual([p.key('v1'), p.dbName(), p.cacheName(20), p.isTest], ['perdida-grasa:v1', 'perdida-grasa', 'perdida-grasa-v20', false]);
  assert.deepStrictEqual([t.key('v1'), t.dbName(), t.cacheName(20), t.isTest], ['perdida-grasa-pruebas:v1', 'perdida-grasa-pruebas', 'perdida-grasa-pruebas-v20', true]);
  assert.strictEqual(create().key('owner'), 'perdida-grasa:owner');
  assert.strictEqual(x.env, '');
  assert.ok(!t.cacheName(1).startsWith(p.cachePrefix()));
});
