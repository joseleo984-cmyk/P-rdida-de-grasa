#!/usr/bin/env node
// Sprint 10: genera lo que la función de borde `acuerdo-coach-copia` necesita a partir de consent-texts.js.
//  1) supabase/functions/_shared/textos-acuerdo.mjs: versión → texto EXACTO del acuerdo (A7), vigente y anteriores.
//  2) supabase/functions/acuerdo-coach-copia/pegar-en-el-panel.ts: la función en UN solo archivo (sin importar nada local), para
//     pegarla en el editor del panel de Supabase cuando no hay terminal.
// Uso: npm run build:funcion      (o `node scripts/build-funcion-acuerdo.js --check` para comprobar que están al día)
const fs = require('fs');
const path = require('path');
// Los textos del acuerdo del producto «coach» (consent-texts-solo.js) solo existen con ese producto: se simula aquí para que la función
// de borde conozca TODAS las versiones que un coach pudo aceptar (0.3-A7 de siempre y la 0.4-A7-coach con la cláusula 13).
globalThis.PG_CONFIG = { producto: 'coach', soloNube: true };
globalThis.Producto = require('../producto.js');
const CT = require('../consent-texts.js');
require('../consent-texts-solo.js');

const ROOT = path.join(__dirname, '..');
const FN = path.join(ROOT, 'supabase', 'functions');
const OUT_TEXTOS = path.join(FN, '_shared', 'textos-acuerdo.mjs');
const OUT_BUNDLE = path.join(FN, 'acuerdo-coach-copia', 'pegar-en-el-panel.ts');

function textos() {
  const body = JSON.stringify(CT.agreementTexts(), null, 2);
  return `// GENERADO por scripts/build-funcion-acuerdo.js a partir de consent-texts.js y consent-texts-solo.js: NO editar a mano (npm run build:funcion).\n// versión → texto exacto del Acuerdo del coach (A7), el que se muestra y cuyo SHA-256 se registra al aceptar.\nexport const TEXTOS = ${body};\n`;
}

// Une los módulos en un solo archivo: quita los imports locales y los `export`; deja los imports externos arriba.
function bundle() {
  const parts = ['_shared/textos-acuerdo.mjs', '_shared/acuerdo.mjs', '_shared/manejador.mjs', 'acuerdo-coach-copia/index.ts'];
  const ext = [];
  const bodies = parts.map((p) => {
    const src = (p === '_shared/textos-acuerdo.mjs' ? textos() : fs.readFileSync(path.join(FN, p), 'utf8'));
    return src.split('\n').filter((line) => {
      if (/^import\s.*from\s+['"]\.{1,2}\//.test(line)) return false;
      if (/^import\s.*from\s+['"]/.test(line)) { ext.push(line); return false; }
      return true;
    }).map((l) => l.replace(/^export (async function|function|const|let)\b/, '$1')).join('\n');
  });
  return `// GENERADO por scripts/build-funcion-acuerdo.js: la función «acuerdo-coach-copia» en UN solo archivo para pegarla en el\n// editor del panel de Supabase (Edge Functions). NO editar a mano: se rehace con npm run build:funcion.\n${[...new Set(ext)].join('\n')}\n\n${bodies.join('\n')}`;
}

function main() {
  const files = [[OUT_TEXTOS, textos()], [OUT_BUNDLE, bundle()]];
  if (process.argv.includes('--check')) {
    const bad = files.filter(([f, c]) => !fs.existsSync(f) || fs.readFileSync(f, 'utf8') !== c);
    if (bad.length) { console.error('build:funcion — desactualizado: ' + bad.map(([f]) => path.relative(ROOT, f)).join(', ')); process.exit(1); }
    console.log('build:funcion — al día');
    return;
  }
  for (const [f, c] of files) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, c); }
  console.log('build:funcion — listo (' + files.map(([f]) => path.relative(ROOT, f)).join(', ') + ')');
}
if (require.main === module) main();
module.exports = { textos, bundle, OUT_TEXTOS, OUT_BUNDLE };
