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
const DEMO_FILES = ['demo.js', 'demo-data.js', 'demo.css', 'remote-fake.js'];
const inRoot = (f) => !f.startsWith(path.join(dir, 'pruebas') + path.sep) && !f.startsWith(path.join(dir, 'demo') + path.sep);

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

test('captcha: la raíz no lleva la captchaSiteKey de pruebas y ningún archivo lleva claves con forma de secreta', () => {
  const m = fs.readFileSync(path.join(__dirname, '../config.pruebas.js'), 'utf8').match(/captchaSiteKey:\s*'([^']+)'/);
  if (m) {
    for (const f of walk(dir).filter((f) => !f.startsWith(path.join(dir, 'pruebas') + path.sep))) assert.ok(!fs.readFileSync(f, 'utf8').includes(m[1]), 'site key de pruebas en ' + f);
    assert.ok(read('pruebas/config.js').includes(m[1]));
  }
  assert.ok(!/captchaSiteKey:\s*'[^']/.test(read('config.js')), 'la raíz sin captchaSiteKey');
  for (const f of walk(dir)) {
    if (f.includes(path.sep + 'vendor' + path.sep)) continue;
    assert.ok(!/captcha[_-]?secret|turnstile[_-]?secret/i.test(fs.readFileSync(f, 'utf8')), 'clave secreta del captcha en ' + f);
  }
  assert.ok(fs.existsSync(path.join(dir, 'captcha.js')) && fs.existsSync(path.join(dir, 'pruebas', 'captcha.js')));
});

test('Sprint 10: el sitio no lleva nada de la función de correo ni claves de Brevo (viven en secretos de Supabase)', () => {
  for (const f of walk(dir)) {
    if (f.includes(path.sep + 'vendor' + path.sep)) continue;
    const t = fs.readFileSync(f, 'utf8');
    assert.ok(!/xkeysib-|BREVO_API_KEY|api\.brevo\.com\/v3\/smtp/.test(t), 'rastro de la clave o la API de Brevo en ' + f);
  }
  assert.ok(!fs.existsSync(path.join(dir, 'supabase')));
  assert.ok(fs.existsSync(path.join(dir, 'acuerdo-view.js')) && fs.existsSync(path.join(dir, 'pruebas', 'acuerdo-view.js')));
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
    for (const f of ['index.html', 'schema.js', 'consent-texts.js', 'consent-texts-solo.js', 'producto.js', 'pagos.js', 'medidas.js', 'habitos.js', 'platos.js', 'rutinas.js', 'coach.js', 'estado-cliente.js', 'inicio-view.js', 'photos.js', 'app.js', 'config.js', 'ns.js', 'captcha.js', 'remote.js', 'account.js', 'coach-panel.js', 'rutinas-view.js', 'sync.js', 'cloud-view.js', 'acuerdo-view.js', 'invite.js', 'qr.js', 'install-guide.js', 'calc.js', 'sw.js', 'manifest.webmanifest', 'icon.svg', 'styles.css', 'vendor/supabase-2.117.2.js', 'legal/terminos.html', 'legal/privacidad.html']) {
      assert.ok(fs.existsSync(path.join(dir, base, f)), base + f);
    }
  }
});

test('demo: la raíz y /pruebas/ no contienen nada de la demo (archivos, datos, banner, referencias)', () => {
  const MARK = /Fit Demo|\.demo@example\.com|DEMO — datos ficticios|PGDemoData|config\.demo|demo-data|demo\.js|demo\.css|PG_CONFIG\.demo|env:\s*'demo'|perdida-grasa-demo/;
  for (const f of walk(dir).filter((f) => !f.startsWith(path.join(dir, 'demo') + path.sep) && !f.includes(path.sep + 'vendor' + path.sep))) {
    if (f.endsWith('robots.txt')) continue;   // solo aquí aparece /demo/ (Disallow)
    assert.ok(!MARK.test(fs.readFileSync(f, 'utf8')), 'rastro de la demo en ' + f);
  }
  for (const base of ['', 'pruebas/']) for (const f of DEMO_FILES) assert.ok(!fs.existsSync(path.join(dir, base, f)), 'archivo de la demo en ' + base + f);
  assert.ok(/Disallow: \/P-rdida-de-grasa\/demo\//.test(read('robots.txt')));
});

test('demo: /demo/ no lleva claves ni URLs de Supabase ni captcha, usa env demo con servidor falso, noindex y manifest propio', () => {
  const cfg = read('demo/config.js');
  assert.match(cfg, /env:\s*'demo'/);
  assert.match(cfg, /demo:\s*true/);
  assert.match(cfg, /producto:\s*'coach'/);
  assert.match(cfg, /soloNube:\s*true/);
  assert.match(cfg, /url:\s*''/);
  assert.match(cfg, /key:\s*''/);
  assert.ok(!/captchaSiteKey/.test(cfg));
  for (const f of walk(path.join(dir, 'demo'))) {
    if (f.includes(path.sep + 'vendor' + path.sep)) continue;   // la librería de terceros cita el dominio en su código; la app nunca la inicia en la demo
    const t = fs.readFileSync(f, 'utf8');
    assert.ok(!/https?:\/\/[a-z0-9-]+\.supabase\.co/i.test(t), 'URL de Supabase en ' + f);
    assert.ok(!/sb_publishable_[A-Za-z0-9_-]{10,}|sb_secret_[A-Za-z0-9]|service_role/.test(t), 'clave en ' + f);
    assert.ok(!t.includes(REF), 'referencia del proyecto de pruebas en ' + f);
    assert.ok(!/['"]0x4[A-Za-z0-9_-]{17,27}['"]/.test(t), 'site key de captcha en ' + f);
  }
  const html = read('demo/index.html');
  assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
  for (const f of DEMO_FILES) { assert.ok(fs.existsSync(path.join(dir, 'demo', f)), f); assert.ok(read('demo/sw.js').includes(`'${f}'`), 'sw de la demo sin ' + f); }
  assert.ok(html.indexOf('remote.js') < html.indexOf('remote-fake.js') && html.indexOf('demo.js') < html.indexOf('account.js'), 'demo.js debe cargar antes de account.js');
  const m = JSON.parse(read('demo/manifest.webmanifest'));
  assert.strictEqual(m.name, 'Pérdida de Grasa (demo)');
  assert.strictEqual(m.scope, './');
  // El sw de la raíz y el de pruebas no precachean nada de la demo
  assert.ok(!/demo/.test(read('sw.js')) && !/demo/.test(read('pruebas/sw.js')));
  assert.ok(/cacheName\(47\)/.test(read('demo/sw.js')));
});

test('PGNS: sin env los nombres son los de siempre; con env llevan sufijo', () => {
  const { create } = require('../ns.js');
  const p = create({ env: '' }), t = create({ env: 'pruebas' }), x = create({ env: '../x' });
  assert.deepStrictEqual([p.key('v1'), p.dbName(), p.cacheName(20), p.isTest], ['perdida-grasa:v1', 'perdida-grasa', 'perdida-grasa-v20', false]);
  assert.deepStrictEqual([t.key('v1'), t.dbName(), t.cacheName(20), t.isTest], ['perdida-grasa-pruebas:v1', 'perdida-grasa-pruebas', 'perdida-grasa-pruebas-v20', true]);
  assert.strictEqual(create().key('owner'), 'perdida-grasa:owner');
  assert.strictEqual(x.env, '');
  assert.ok(!t.cacheName(1).startsWith(p.cachePrefix()));
  const d = create({ env: 'demo' });
  assert.deepStrictEqual([d.key('v1'), d.dbName(), d.cacheName(47), d.isTest], ['perdida-grasa-demo:v1', 'perdida-grasa-demo', 'perdida-grasa-demo-v47', false]);
  assert.ok(!d.cacheName(1).startsWith(p.cachePrefix()) && !d.cacheName(1).startsWith(t.cachePrefix()) && !t.cacheName(1).startsWith(d.cachePrefix()));
});
