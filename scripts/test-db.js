// npm run test:db — Pruebas de la base de R1 (RLS, RPC, Storage) en un PostgreSQL LOCAL y temporal, sin Docker.
// 1. Comprueba que supabase/r1.sql está al día con las migraciones.
// 2. initdb + pg_ctl en un directorio temporal y un puerto libre (si se ejecuta como root, usa el usuario "postgres").
// 3. Aplica supabase/tests/00_supabase_stub.sql (auth/storage/roles mínimos), r1.sql DOS veces (idempotencia),
//    01_helpers.sql y cada supabase/tests/*.test.sql en su propia transacción.
// 4. Cuenta los "ok - …" y falla si algún archivo da error. Siempre para y borra el cluster.
// Variables: PG_BIN (por defecto /usr/lib/postgresql/16/bin), KEEP_DB=1 para no borrar el directorio.
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { build, OUT } = require('./build-r1');

const ROOT = path.resolve(__dirname, '..');
const TESTS = path.join(ROOT, 'supabase/tests');
const PG_BIN = process.env.PG_BIN || '/usr/lib/postgresql/16/bin';
const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;

function run(bin, args, opts = {}) {
  const cmd = asRoot ? 'runuser' : path.join(PG_BIN, bin);
  const full = asRoot ? ['-u', 'postgres', '--', path.join(PG_BIN, bin), ...args] : args;
  return spawnSync(cmd, full, { encoding: 'utf8', ...opts });
}
const freePort = () => new Promise((resolve) => {
  const s = net.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

// Contrato §2.5.4: dos transacciones concurrentes. T1 escribe primero (server_updated_at menor) pero confirma DESPUÉS
// de T2; un pull entre medias devuelve un cursor posterior a la marca de T1. Gracias a la ventana de solape de 30 s,
// el siguiente pull con ese cursor sigue trayendo la fila de T1 (sin solape se perdería para siempre).
function psqlAsync(dir, port, sql) {
  const { spawn } = require('child_process');
  const args = ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-h', dir, '-p', String(port), '-U', 'postgres', '-d', 'r1test', '-c', sql];
  const p = asRoot ? spawn('runuser', ['-u', 'postgres', '--', path.join(PG_BIN, 'psql'), ...args]) : spawn(path.join(PG_BIN, 'psql'), args);
  let out = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { out += d; });
  return new Promise((resolve) => p.on('close', (code) => resolve({ code, out })));
}
async function concurrency(dir, port) {
  const push = (id, nkey) => `select tests.login('ana'); select grasa.sync_push(jsonb_build_array(jsonb_build_object('id','${id}',` +
    `'kind','habit','nkey','${nkey}','date','${nkey}','data','{}'::jsonb,'updated_at',now())));`;
  const t1 = psqlAsync(dir, port, `begin; ${push('60000000-0000-4000-8000-000000000001', '2026-01-01')} select pg_sleep(2); commit;`);
  await new Promise((r) => setTimeout(r, 700));
  const t2 = await psqlAsync(dir, port, `begin; ${push('60000000-0000-4000-8000-000000000002', '2026-01-02')} commit;`);
  const mid = await psqlAsync(dir, port, `begin; select tests.login('ana'); with p as (select grasa.sync_pull(null) j)
    select (select coalesce(string_agg(e ->> 'nkey', ','), '-') from p, jsonb_array_elements(p.j -> 'records') e) || '|' || (select j ->> 'cursor' from p);
    commit;`);
  const r1 = await t1;
  const [midKeys, cursor] = mid.out.trim().split('\n').pop().split('|');
  const after = await psqlAsync(dir, port, `begin; select tests.login('ana');
    select count(*) from jsonb_array_elements(grasa.sync_pull('${cursor}') -> 'records') e where e ->> 'nkey' = '2026-01-01'; commit;`);
  await psqlAsync(dir, port, `delete from grasa.records where nkey in ('2026-01-01','2026-01-02');`);
  const seenMid = midKeys.includes('2026-01-01');   // debe ser false: T1 aún no había confirmado (hubo carrera)
  const ok = !seenMid && t2.code === 0 && r1.code === 0 && after.code === 0 && after.out.trim().split('\n').pop() === '1';
  if (ok) { oks += 1; console.log('OK    concurrencia: sync_pull con solape no pierde una fila confirmada tarde (1 comprobación)'); }
  else { failed++; console.log('FALLO concurrencia sync_pull', JSON.stringify({ t1: r1, t2, mid, after, seenMid }).slice(0, 600)); }
}

// QA-S3-1-D1 (carrera): 25 sesiones REALES a la vez prueban códigos inventados. Con el bloqueo por usuario
// (pg_advisory_xact_lock) se registran exactamente 20 intentos y el resto recibe rate_limited.
async function attemptsRace(dir, port) {
  const sql = `select tests.login('bea'); select grasa.join_coach('ZZZZZZ', jsonb_build_object('body', true,
    'version', '0.1', 'text_hash', tests.h('c')));`;
  const res = await Promise.all(Array.from({ length: 25 }, () => psqlAsync(dir, port, sql)));
  const limited = res.filter((r) => /rate_limited/.test(r.out)).length;
  const count = await psqlAsync(dir, port, `select count(*) from grasa.invite_attempts where user_id = tests.uid('bea');`);
  await psqlAsync(dir, port, `delete from grasa.invite_attempts;`);
  const n = Number(count.out.trim().split('\n').pop());
  if (n === 20 && limited === 5) { oks += 1; console.log('OK    concurrencia: 25 intentos simultáneos → 20 registrados y 5 rate_limited (1 comprobación)'); }
  else { failed++; console.log(`FALLO concurrencia de intentos: registrados=${n} rate_limited=${limited}`); }
}

let failed = 0, oks = 0;
(async () => {
  if (fs.readFileSync(OUT, 'utf8') !== build()) {
    console.error('FALLO supabase/r1.sql no está al día: ejecuta "npm run build:db"');
    process.exit(1);
  }
  if (!fs.existsSync(path.join(PG_BIN, 'initdb'))) {
    console.error(`No se encontró PostgreSQL en ${PG_BIN} (define PG_BIN).`);
    process.exit(1);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r1-pg-'));
  if (asRoot) spawnSync('chown', ['postgres:postgres', dir]);
  const data = path.join(dir, 'data');
  const port = await freePort();
  let started = false;

  try {
    let r = run('initdb', ['-D', data, '-A', 'trust', '-U', 'postgres', '-E', 'UTF8', '--locale=C', '--no-sync']);
    if (r.status !== 0) throw new Error('initdb: ' + r.stderr);
    r = run('pg_ctl', ['-D', data, '-l', path.join(dir, 'log'), '-w', '-o', `-p ${port} -k ${dir} -c listen_addresses=''`, 'start']);
    if (r.status !== 0) throw new Error('pg_ctl start: ' + r.stderr + fs.readFileSync(path.join(dir, 'log'), 'utf8'));
    started = true;
    const psql = (args, input) => run('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', dir, '-p', String(port), '-U', 'postgres', ...args],
      input === undefined ? {} : { input });
    r = psql(['-d', 'postgres', '-c', 'create database r1test']);
    if (r.status !== 0) throw new Error(r.stderr);
    const apply = (label, file, { single = true } = {}) => {
      const res = psql(['-d', 'r1test', ...(single ? ['-1'] : []), '-f', file]);
      const out = (res.stdout || '') + (res.stderr || '');
      const n = (out.match(/NOTICE:\s+ok - /g) || []).length;
      oks += n;
      if (res.status !== 0) {
        failed++;
        console.log(`FALLO ${label}`);
        console.log(out.split('\n').filter((l) => /ERROR|FALLO|DETAIL|CONTEXT|LINE/.test(l)).slice(0, 12).map((l) => '      ' + l).join('\n'));
      } else {
        console.log(`OK    ${label}${n ? ` (${n} comprobaciones)` : ''}`);
        if (process.env.VERBOSE) console.log(out.split('\n').filter((l) => /ok - /.test(l)).map((l) => '      ' + l.replace(/^.*ok - /, '')).join('\n'));
      }
      return res.status === 0;
    };
    const ok = apply('stub de Supabase (auth, storage, roles)', path.join(TESTS, '00_supabase_stub.sql'))
      && apply('supabase/r1.sql (1.ª vez)', OUT, { single: false })
      && apply('supabase/r1.sql (2.ª vez: idempotente)', OUT, { single: false })
      && apply('ayudas de prueba', path.join(TESTS, '01_helpers.sql'));
    if (ok) {
      for (const f of fs.readdirSync(TESTS).filter((x) => x.endsWith('.test.sql')).sort()) apply(f, path.join(TESTS, f), { single: false });
      await concurrency(dir, port);
      await attemptsRace(dir, port);
    }
  } catch (err) {
    failed++;
    console.error('FALLO entorno:', err.message);
  } finally {
    if (started) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
    if (!process.env.KEEP_DB) fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(failed ? `\n${failed} archivo(s) con fallos (${oks} comprobaciones OK)` : `\nBase de datos R1: ${oks} comprobaciones OK`);
  process.exit(failed ? 1 : 0);
})();
