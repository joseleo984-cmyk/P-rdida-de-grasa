#!/usr/bin/env node
// npm run check:conexion — Revisión SIN RED antes (y después) de conectar la app oficial al proyecto `plataforma`.
// Procedimiento completo: equipo/handoffs/conectar-plataforma.md. NO forma parte del CI obligatorio todavía.
//   node scripts/check-conexion.js            → comprueba que config.js está listo para conectar y que legal/*.html no tienen pendientes
//   node scripts/check-conexion.js --vacio    → comprueba el estado de REVERSA: config.js vacío (app solo local)
//   node scripts/check-conexion.js --root dir → revisa otra carpeta (pruebas)
// Reglas (todas deben cumplirse; el script imprime cada fallo y sale con código 1):
//   config.js: env '' · mode 'real' · url https://<ref>.supabase.co · key sb_publishable_… · ni sb_secret_ ni service_role
//              en ningún sitio del archivo · la URL no es la del proyecto de pruebas (config.pruebas.js).
//   legal/*.html: sin marcadores pendientes ([FECHA DE VIGENCIA], [NOMBRE COMPLETO DEL RESPONSABLE]…, cualquier [MAYÚSCULAS])
//              y sin el aviso «Borrador pendiente de revisión legal».
// No imprime nunca la clave completa.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const URL_RE = /^https:\/\/[a-z0-9]{15,30}\.supabase\.co$/;
const KEY_RE = /^sb_publishable_[A-Za-z0-9_-]{16,}$/;
const SECRET_RE = /sb_secret_|service_role/i;
// [FECHA DE VIGENCIA], [CIUDAD], [NÚMERO DE CÉDULA]… (mayúsculas, espacios, barras), y la palabra PENDIENTE entre corchetes.
const PLACEHOLDER_RE = /\[[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9 ./_:-]{2,60}\]/g;
const DRAFT_RE = /Borrador pendiente de revisión legal/i;

const field = (text, name) => { const m = text.match(new RegExp(`\\b${name}:\\s*(['"\`])([^'"\`]*)\\1`)); return m ? m[2] : null; };
const mask = (k) => (k ? k.slice(0, 15) + '…' : '(vacía)');

// Devuelve { problems: [], url, key } (key enmascarada). `testsRef`: referencia del proyecto de pruebas a rechazar.
function checkConfig(text, { empty = false, testsUrl = null } = {}) {
  const problems = [];
  const url = field(text, 'url'), key = field(text, 'key'), env = field(text, 'env'), mode = field(text, 'mode');
  if (SECRET_RE.test(text)) problems.push('config.js contiene sb_secret_ o service_role: NUNCA van en el cliente');
  if (url === null || key === null) { problems.push('config.js no define url y key (formato de PG_CONFIG inesperado)'); return { problems, url, key: mask(key) }; }
  if (empty) {
    if (url !== '' || key !== '') problems.push('REVERSA: config.js debe tener url y key vacías');
    if (env !== '') problems.push("REVERSA: env debe ser ''");
    return { problems, url, key: mask(key) };
  }
  if (env !== '') problems.push("env debe ser '' en la app oficial (env 'pruebas' es solo de /pruebas/)");
  if (mode !== 'real') problems.push("mode debe ser 'real' (mode 'fake' solo sirve en localhost)");
  if (!URL_RE.test(url)) problems.push('url debe ser https://<ref>.supabase.co (sin barra final ni ruta)');
  if (!KEY_RE.test(key)) problems.push('key debe ser la clave PUBLICABLE: empieza por sb_publishable_');
  if (testsUrl && url === testsUrl) problems.push('la URL es la del proyecto de PRUEBAS; la app oficial debe apuntar a `plataforma`');
  return { problems, url, key: mask(key) };
}

// files: { 'legal/terminos.html': '<html…' }
function checkLegal(files) {
  const problems = [];
  const names = Object.keys(files);
  if (!names.length) problems.push('no hay legal/*.html');
  for (const name of names) {
    const html = files[name];
    const found = [...new Set(html.match(PLACEHOLDER_RE) || [])];
    if (found.length) problems.push(`${name}: marcadores pendientes ${found.join(' ')}`);
    if (DRAFT_RE.test(html)) problems.push(`${name}: sigue el aviso «Borrador pendiente de revisión legal»`);
  }
  return { problems };
}

function run(root, { empty = false } = {}) {
  const rd = (f) => fs.readFileSync(path.join(root, f), 'utf8');
  const report = [];
  let testsUrl = null;
  try { testsUrl = field(rd('config.pruebas.js'), 'url'); } catch { /* sin archivo de pruebas */ }
  let cfg;
  try { cfg = checkConfig(rd('config.js'), { empty, testsUrl }); } catch (e) { cfg = { problems: ['no se pudo leer config.js: ' + e.message] }; }
  report.push(['config.js', cfg.problems, cfg.url ? `url=${cfg.url} key=${cfg.key}` : '']);
  if (!empty) {
    const files = {};
    const dir = path.join(root, 'legal');
    if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.html'))) files['legal/' + f] = rd('legal/' + f);
    report.push(['legal/*.html', checkLegal(files).problems, Object.keys(files).join(', ')]);
  }
  return report;
}

module.exports = { checkConfig, checkLegal, run, URL_RE, KEY_RE };

if (require.main === module) {
  const a = process.argv.slice(2);
  const i = a.indexOf('--root');
  const root = path.resolve(i >= 0 ? a[i + 1] : path.join(__dirname, '..'));
  const empty = a.includes('--vacio');
  let bad = 0;
  for (const [name, problems, info] of run(root, { empty })) {
    if (problems.length) { bad += problems.length; console.log(`FALLA ${name}`); for (const p of problems) console.log('   - ' + p); }
    else console.log(`OK    ${name}${info ? ' (' + info + ')' : ''}`);
  }
  console.log(bad ? `\ncheck:conexion: ${bad} problema(s). NO conectar todavía.` : `\ncheck:conexion: todo en orden${empty ? ' (reversa: app solo local)' : ''}.`);
  process.exit(bad ? 1 : 0);
}
