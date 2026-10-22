// npm run vendor — Copia el UMD de supabase-js (devDependency con versión exacta) a vendor/supabase-<versión>.js y
// escribe su SHA-256 en vendor/VERSIONS.json (contrato R1 §6). GitHub Pages no ejecuta npm: el archivo se commitea.
// tests/vendor.test.js comprueba que nadie lo edita a mano (hash) y que coincide con node_modules cuando existe.
// Al cambiar de versión: npm i -D -E @supabase/supabase-js@2.X.Y && npm run vendor, y actualizar index.html, sw.js
// (ASSETS + CACHE) y .github/workflows/pages.yml con el nuevo nombre.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PKG = path.join(ROOT, 'node_modules/@supabase/supabase-js');
const UMD = path.join(PKG, 'dist/umd/supabase.js');
const OUT_DIR = path.join(ROOT, 'vendor');

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function main() {
  const { version } = JSON.parse(fs.readFileSync(path.join(PKG, 'package.json'), 'utf8'));
  const buf = fs.readFileSync(UMD);
  const file = `supabase-${version}.js`;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const f of fs.readdirSync(OUT_DIR)) if (/^supabase-.*\.js$/.test(f) && f !== file) fs.unlinkSync(path.join(OUT_DIR, f));
  fs.writeFileSync(path.join(OUT_DIR, file), buf);
  const versions = { '@supabase/supabase-js': { version, file, source: 'dist/umd/supabase.js', sha256: sha256(buf), bytes: buf.length } };
  fs.writeFileSync(path.join(OUT_DIR, 'VERSIONS.json'), JSON.stringify(versions, null, 2) + '\n');
  console.log(`vendor/${file} (${buf.length} bytes) sha256 ${versions['@supabase/supabase-js'].sha256}`);
}

if (require.main === module) main();
module.exports = { sha256, PKG, UMD, OUT_DIR };
