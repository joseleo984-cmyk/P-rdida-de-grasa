// Genera supabase/r1.sql (archivo único e idempotente del contrato §2, para pegar en el SQL Editor) a partir de las
// migraciones de supabase/migrations/ (formato Supabase CLI). Fuente de verdad: las migraciones.
// Uso: node scripts/build-r1.js          → escribe supabase/r1.sql
//      node scripts/build-r1.js --check  → falla si supabase/r1.sql no está al día (lo usa npm run test:db)
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'supabase/migrations');
const OUT = path.join(ROOT, 'supabase/r1.sql');
const VERSION = 'r1 v1';

function build() {
  const files = fs.readdirSync(DIR).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort();
  const parts = files.map((f) => `-- ======== ${f} ========\n${fs.readFileSync(path.join(DIR, f), 'utf8').trim()}\n`);
  return [
    '-- GENERADO por scripts/build-r1.js a partir de supabase/migrations/. NO EDITAR A MANO.',
    `-- Base de datos de R1 (${VERSION}): equipo/r1-contrato.md §2. Idempotente: se puede pegar entero en el SQL Editor`,
    '-- de Supabase (primero en el proyecto de PRUEBAS). Al final debe mostrar una fila con "OK r1 v1".',
    'begin;',
    '',
    ...parts,
    `select 'OK ${VERSION}' as resultado;`,
    'commit;',
    '',
  ].join('\n');
}

module.exports = { build, OUT };

if (require.main === module) {
  const sql = build();
  if (process.argv.includes('--check')) {
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (cur !== sql) { console.error('supabase/r1.sql no está al día: ejecuta "npm run build:db"'); process.exit(1); }
    console.log('supabase/r1.sql al día');
  } else {
    fs.writeFileSync(OUT, sql);
    console.log('Escrito ' + path.relative(ROOT, OUT));
  }
}
