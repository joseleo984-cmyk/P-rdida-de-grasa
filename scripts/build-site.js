#!/usr/bin/env node
// Arma _site/ (app oficial en la raíz + copia de pruebas en _site/pruebas/ + copia DEMO en _site/demo/). Uso: npm run build:site [-- --out dir]
// - Raíz: config.js tal cual (vacío, solo local). NUNCA incluye la URL ni la clave de pruebas ni nada de la demo.
// - /pruebas/: config.js generado desde config.pruebas.js, noindex en index.html y manifest propio.
// - /demo/: config.js generado desde config.demo.js (SIN url ni clave: servidor falso en el navegador, datos ficticios), noindex, manifest propio,
//   y los archivos de la demo (demo.js, demo-data.js, demo.css, remote-fake.js) que SOLO existen aquí; su sw.js los precachea. Ver equipo/handoffs/demo.md.
// - robots.txt en la raíz con Disallow de /P-rdida-de-grasa/pruebas/ y /P-rdida-de-grasa/demo/.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const arg = process.argv.indexOf('--out');
const OUT = path.resolve(ROOT, arg > 0 ? process.argv[arg + 1] : '_site');
const FILES = ['index.html', 'styles.css', 'ns.js', 'calc.js', 'schema.js', 'consent-texts.js', 'producto.js', 'consent-texts-solo.js', 'pagos.js', 'medidas.js', 'habitos.js', 'constancia.js', 'platos.js', 'rutinas.js', 'paso.js', 'sync.js', 'cloud-view.js', 'acuerdo-view.js', 'invite.js', 'qr.js', 'install-guide.js', 'coach.js', 'estado-cliente.js', 'inicio-view.js', 'photos.js', 'etapa2.js', 'app.js', 'config.js',
  'captcha.js', 'remote.js', 'account.js', 'coach-panel.js', 'rutinas-view.js', 'etapa2-view.js', 'sw.js', 'manifest.webmanifest', 'icon.svg'];
const DEMO_FILES = ['remote-fake.js', 'demo-data.js', 'demo.js', 'demo.css'];   // solo en /demo/
const DIRS = [['legal', 'legal'], ['fonts', 'fonts'], ['vendor/supabase-2.117.2.js', 'vendor/supabase-2.117.2.js']];
const { checkCaptcha } = require('./check-conexion.js');
const SITE_PATH = '/P-rdida-de-grasa/';

function die(msg) { console.error('build-site: ' + msg); process.exit(1); }
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

function copyApp(dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const f of FILES) {
    if (!fs.existsSync(path.join(ROOT, f))) die('falta ' + f);
    fs.copyFileSync(path.join(ROOT, f), path.join(dest, f));
  }
  for (const [from, to] of DIRS) {
    if (!fs.existsSync(path.join(ROOT, from))) die('falta ' + from);
    fs.mkdirSync(path.dirname(path.join(dest, to)), { recursive: true });
    fs.cpSync(path.join(ROOT, from), path.join(dest, to), { recursive: true });
  }
}

// Comprobación de coherencia: todo lo que carga index.html y precachea sw.js debe estar en el sitio.
function checkComplete(dest) {
  const html = fs.readFileSync(path.join(dest, 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(dest, 'sw.js'), 'utf8');
  const refs = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  const assets = (sw.match(/const ASSETS = \[([^\]]+)\]/) || [])[1];
  if (!assets) die('no se encontró ASSETS en sw.js');
  refs.push(...[...assets.matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((a) => a !== './'));
  for (const r of refs) if (!fs.existsSync(path.join(dest, r))) die(`${path.relative(OUT, dest) || '.'} no incluye ${r}`);
}

fs.rmSync(OUT, { recursive: true, force: true });
copyApp(OUT);
checkComplete(OUT);

// --- copia de pruebas ---
const cfg = read('config.pruebas.js');
const key = (cfg.match(/key:\s*'([^']*)'/) || [])[1] || '';
if (!key.startsWith('sb_publishable_')) die('config.pruebas.js: la clave debe empezar por sb_publishable_ (nunca secreta / service_role)');
if (/sb_secret_|service_role/.test(cfg)) die('config.pruebas.js contiene una clave secreta');
if (!/env:\s*'pruebas'/.test(cfg)) die("config.pruebas.js debe definir env: 'pruebas'");
// Sprint 9: captchaSiteKey (clave PÚBLICA de Turnstile) es opcional; si existe debe tener su forma. La raíz no lleva la de pruebas.
const capProblems = [...checkCaptcha(cfg).map((p) => 'config.pruebas.js: ' + p), ...checkCaptcha(read('config.js')).map((p) => 'config.js: ' + p)];
if (capProblems.length) die(capProblems.join('\n'));
const capKey = (cfg.match(/captchaSiteKey:\s*'([^']*)'/) || [])[1] || '';
if (capKey && read('config.js').includes(capKey)) die('config.js lleva la captchaSiteKey de pruebas: la raíz no puede compartirla');
const P = path.join(OUT, 'pruebas');
copyApp(P);
fs.writeFileSync(path.join(P, 'config.js'), cfg);
let html = fs.readFileSync(path.join(P, 'index.html'), 'utf8');
if (!html.includes('<meta charset="utf-8">')) die('index.html sin <meta charset> para inyectar noindex');
html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n  <meta name="robots" content="noindex,nofollow">');
fs.writeFileSync(path.join(P, 'index.html'), html);
const manifest = JSON.parse(read('manifest.webmanifest'));
manifest.name = 'Pérdida de Grasa (pruebas)';
manifest.short_name = 'Grasa (pruebas)';
manifest.start_url = './';
manifest.scope = './';
fs.writeFileSync(path.join(P, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2) + '\n');
checkComplete(P);

// --- copia DEMO: sin servidor, datos ficticios en el navegador ---
const dcfg = read('config.demo.js');
const dcode = dcfg.replace(/^\s*\/\/.*$/gm, '');   // sin los comentarios
if (/supabase|sb_publishable_|sb_secret_|service_role|captchaSiteKey|https?:\/\//i.test(dcode)) die('config.demo.js no puede llevar ninguna url, clave ni captcha');
if (!/env:\s*'demo'/.test(dcfg) || !/demo:\s*true/.test(dcfg)) die("config.demo.js debe definir env: 'demo' y demo: true");
if (!/url:\s*''/.test(dcfg) || !/key:\s*''/.test(dcfg)) die("config.demo.js debe llevar url: '' y key: ''");
const DM = path.join(OUT, 'demo');
copyApp(DM);
for (const f of DEMO_FILES) {
  if (!fs.existsSync(path.join(ROOT, f))) die('falta ' + f);
  fs.copyFileSync(path.join(ROOT, f), path.join(DM, f));
}
fs.writeFileSync(path.join(DM, 'config.js'), dcfg);
let dhtml = fs.readFileSync(path.join(DM, 'index.html'), 'utf8');
if (!dhtml.includes('<meta charset="utf-8">') || !dhtml.includes('<link rel="stylesheet" href="styles.css">') || !dhtml.includes('<script src="remote.js"></script>')) die('index.html no tiene los puntos donde inyectar la demo');
dhtml = dhtml.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n  <meta name="robots" content="noindex,nofollow">')
  .replace('<link rel="stylesheet" href="styles.css">', '<link rel="stylesheet" href="styles.css">\n  <link rel="stylesheet" href="demo.css">')
  .replace('<script src="remote.js"></script>', '<script src="remote.js"></script>\n' + DEMO_FILES.filter((f) => f.endsWith('.js')).map((f) => `  <script src="${f}"></script>`).join('\n'))
  .replace('<title>Pérdida de Grasa</title>', '<title>Pérdida de Grasa (demo)</title>');
fs.writeFileSync(path.join(DM, 'index.html'), dhtml);
let dsw = fs.readFileSync(path.join(DM, 'sw.js'), 'utf8');
if (!dsw.includes('const ASSETS = [')) die('no se encontró ASSETS en sw.js');
dsw = dsw.replace('const ASSETS = [', `const ASSETS = [${DEMO_FILES.map((f) => `'${f}'`).join(', ')}, `);
fs.writeFileSync(path.join(DM, 'sw.js'), dsw);
const dman = JSON.parse(read('manifest.webmanifest'));
dman.name = 'Pérdida de Grasa (demo)';
dman.short_name = 'Grasa (demo)';
dman.start_url = './';
dman.scope = './';
fs.writeFileSync(path.join(DM, 'manifest.webmanifest'), JSON.stringify(dman, null, 2) + '\n');
checkComplete(DM);

fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nDisallow: ${SITE_PATH}pruebas/\nDisallow: ${SITE_PATH}demo/\n`);
console.log('build-site: ' + path.relative(ROOT, OUT) + '/ listo (raíz + pruebas/ + demo/)');
