// Ejecuta todas las E2E de equipo/qa/ (menos run-sprint0, que usa un servidor http) y resume el resultado.
// Uso: node equipo/qa/run-all.js [filtro]   (p. ej. "s1-3")
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const filter = process.argv[2] || '';
const files = fs.readdirSync(__dirname)
  .filter((f) => /^(run|qa)-s\d+-\d+\.js$/.test(f) && f.includes(filter))
  .sort();
let failed = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8', timeout: 300000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const lines = out.split('\n').filter((l) => /^FALLO|TODO OK|FALLO\(S\)|FALLOS|\d+\/\d+ OK|Error/.test(l));
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${f}`);
  for (const l of lines) console.log('      ' + l.slice(0, 240));
}
console.log(failed ? `\n${failed} suite(s) con fallos` : `\n${files.length} suites en verde`);
process.exit(failed ? 1 : 0);
