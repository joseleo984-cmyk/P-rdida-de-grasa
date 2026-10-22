// scripts/check-conexion.js: revisión sin red previa a conectar la app oficial a `plataforma`.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const C = require('../scripts/check-conexion.js');

const cfg = (o = {}) => `window.PG_CONFIG = {\n  env: '${o.env ?? ''}',\n  url: '${o.url ?? 'https://abcdefghijklmnopqrst.supabase.co'}',\n  key: '${o.key ?? 'sb_publishable_AbCdEfGhIjKlMnOp12345'}',\n  mode: '${o.mode ?? 'real'}',\n};\n`;
const has = (r, re) => r.problems.some((p) => re.test(p));

test('config válida: URL https://<ref>.supabase.co y clave sb_publishable_', () => {
  assert.deepStrictEqual(C.checkConfig(cfg()).problems, []);
});
test('config: rechaza claves secretas, service_role y claves que no son publicables', () => {
  assert.ok(has(C.checkConfig(cfg({ key: 'sb_secret_abcdefghijklmnopqrstuv' })), /sb_secret_|service_role/));
  assert.ok(has(C.checkConfig(cfg({ key: 'service_role_xxxxxxxxxxxxxxxxxxxx' })), /service_role|PUBLICABLE/));
  assert.ok(has(C.checkConfig(cfg() + '// service_role'), /service_role/), 'ni en comentarios');
  assert.ok(has(C.checkConfig(cfg({ key: 'eyJhbGciOiJIUzI1NiJ9.xxx' })), /PUBLICABLE/));
  assert.ok(has(C.checkConfig(cfg({ key: 'sb_publishable_corta' })), /PUBLICABLE/));
});
test('config: rechaza URL mal formada, con ruta, http o de otro dominio', () => {
  for (const url of ['', 'http://abcdefghijklmnopqrst.supabase.co', 'https://abcdefghijklmnopqrst.supabase.co/', 'https://abcdefghijklmnopqrst.supabase.co/rest/v1', 'https://ejemplo.com', 'https://ABC.supabase.co'])
    assert.ok(has(C.checkConfig(cfg({ url })), /url debe ser/), url);
});
test("config: env distinto de '' o mode 'fake' no sirven en la app oficial", () => {
  assert.ok(has(C.checkConfig(cfg({ env: 'pruebas' })), /env/));
  assert.ok(has(C.checkConfig(cfg({ mode: 'fake' })), /mode/));
});
test('config: no puede apuntar al proyecto de pruebas', () => {
  const u = 'https://abcdefghijklmnopqrst.supabase.co';
  assert.ok(has(C.checkConfig(cfg({ url: u }), { testsUrl: u }), /PRUEBAS/));
  assert.deepStrictEqual(C.checkConfig(cfg({ url: u }), { testsUrl: 'https://zzzzzzzzzzzzzzzzzzzz.supabase.co' }).problems, []);
});
test('config vacía: falla para conectar, pasa en modo reversa (--vacio)', () => {
  const vacia = cfg({ url: '', key: '' });
  assert.ok(C.checkConfig(vacia).problems.length > 0);
  assert.deepStrictEqual(C.checkConfig(vacia, { empty: true }).problems, []);
  assert.ok(has(C.checkConfig(cfg(), { empty: true }), /REVERSA/));
});
test('config: formato inesperado se avisa', () => {
  assert.ok(has(C.checkConfig('window.PG_CONFIG = {};'), /formato/));
});
test('la salida nunca contiene la clave completa', () => {
  const r = C.checkConfig(cfg({ key: 'sb_publishable_AbCdEfGhIjKlMnOp12345' }));
  assert.ok(!r.key.includes('Op12345'));
});

test('legal: marcadores pendientes y aviso de borrador se detectan; texto limpio pasa', () => {
  const sucio = { 'legal/terminos.html': '<p>Vigentes desde: [FECHA DE VIGENCIA]</p><p>[NOMBRE COMPLETO DEL RESPONSABLE] [TELÉFONO / WHATSAPP]</p>', 'legal/privacidad.html': '<p>Borrador pendiente de revisión legal</p>' };
  const r = C.checkLegal(sucio);
  assert.strictEqual(r.problems.length, 2);
  assert.match(r.problems[0], /\[FECHA DE VIGENCIA\].*\[NOMBRE COMPLETO DEL RESPONSABLE\].*\[TELÉFONO \/ WHATSAPP\]/);
  assert.match(r.problems[1], /Borrador/);
  assert.deepStrictEqual(C.checkLegal({ 'legal/a.html': '<p>Vigente desde 2026-11-01. Ver [Política] y [1]. Tabla [x]</p>' }).problems, []);
  assert.ok(C.checkLegal({}).problems.length, 'sin archivos legales también falla');
});

test('el repo, hoy: config.js vacío pasa la reversa y los legales v0.1 NO pasan (faltan fechas del abogado)', () => {
  const root = path.join(__dirname, '..');
  const rep = Object.fromEntries(C.run(root, {}).map(([n, p]) => [n, p]));
  assert.ok(rep['config.js'].length > 0, 'vacío: aún no se puede conectar');
  assert.ok(rep['legal/*.html'].length > 0, 'v0.1 trae [FECHA DE VIGENCIA]');
  assert.deepStrictEqual(C.run(root, { empty: true })[0][1], []);
});

test('CLI: código de salida 1 si algo falla, 0 si todo está en orden (carpeta temporal)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conexion-'));
  try {
    fs.mkdirSync(path.join(dir, 'legal'));
    fs.writeFileSync(path.join(dir, 'config.js'), cfg());
    fs.writeFileSync(path.join(dir, 'legal/terminos.html'), '<p>Vigentes desde 2026-11-01</p>');
    const script = path.join(__dirname, '../scripts/check-conexion.js');
    const ok = spawnSync('node', [script, '--root', dir], { encoding: 'utf8' });
    assert.strictEqual(ok.status, 0, ok.stdout);
    assert.ok(!ok.stdout.includes('AbCdEfGhIjKlMnOp12345'));
    fs.writeFileSync(path.join(dir, 'legal/terminos.html'), '<p>[FECHA DE VIGENCIA]</p>');
    assert.strictEqual(spawnSync('node', [script, '--root', dir], { encoding: 'utf8' }).status, 1);
    fs.writeFileSync(path.join(dir, 'config.js'), cfg({ url: '', key: '' }));
    assert.strictEqual(spawnSync('node', [script, '--root', dir, '--vacio'], { encoding: 'utf8' }).status, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
