// Sprint 10: copia del acuerdo del coach por correo. Lógica pura (acuerdo.mjs) y manejador (manejador.mjs) con dobles de fetch y de
// clientes de Supabase; sin Deno ni red. Más: textos generados al día, paquete «pegar en el panel» coherente y sin secretos.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const CT = require('../consent-texts.js');
const Remote = require('../remote.js');

const FN = path.join(__dirname, '..', 'supabase', 'functions');
const load = (f) => import(require('node:url').pathToFileURL(path.join(FN, '_shared', f)).href);
const TEXT = CT.fullText('A7');
const VER = CT.version('A7');

async function setup(opts = {}) {
  const [A, M] = await Promise.all([load('acuerdo.mjs'), load('manejador.mjs')]);
  const hash = await Remote.textHash(TEXT);
  const env = { BREVO_API_KEY: 'xkeysib-PRUEBA', BREVO_SENDER_EMAIL: 'hola@ejemplo.test', BREVO_SENDER_NAME: 'Equipo', ...(opts.env || {}) };
  const calls = { brevo: [], logs: [], adminWrites: [] };
  let appMeta = opts.appMeta || {};
  const rows = opts.rows !== undefined ? opts.rows : [{ kind: 'coach_agreement', granted: true, version: VER, client_at: '2026-10-22T15:30:00.000Z', text_hash: hash }];
  const user = opts.user === undefined ? { id: 'u1', email: 'coach@ejemplo.test' } : opts.user;
  const deps = {
    env: (k) => env[k],
    now: () => (opts.now || Date.parse('2026-10-23T12:00:00Z')),
    log: (...a) => calls.logs.push(a.join(' ')),
    fetch: async (url, init) => { calls.brevo.push({ url, init, body: JSON.parse(init.body) }); return opts.brevo ? opts.brevo() : new Response('{"messageId":"x"}', { status: 201 }); },
    getUserClient: (auth, apikey) => { calls.auth = auth; calls.apikey = apikey; return {
      auth: { getUser: async () => (user ? { data: { user }, error: null } : { data: { user: null }, error: { message: 'bad jwt' } }) },
      schema: (s) => ({ rpc: async (fn, args) => { calls.rpc = [s, fn, args]; return opts.rpcError ? { data: null, error: { message: 'x' } } : { data: rows, error: null }; } }),
    }; },
    getAdminClient: opts.noAdmin ? () => null : () => ({ auth: { admin: {
      getUserById: async () => ({ data: { user: { app_metadata: appMeta } }, error: null }),
      updateUserById: async (id, body) => { calls.adminWrites.push(body.app_metadata); appMeta = body.app_metadata; return { error: null }; },
    } } }),
  };
  const req = (o = {}) => new Request('https://x.supabase.co/functions/v1/acuerdo-coach-copia', { method: 'POST', headers: { authorization: 'Bearer jwt.abc.def', apikey: 'sb_publishable_x', ...(o.headers || {}) }, body: o.body });
  return { A, M, deps, calls, req, hash, env };
}

test('textos generados al día y el paquete «pegar en el panel» coincide con las fuentes', () => {
  execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'build-funcion-acuerdo.js'), '--check']);
});

test('los textos generados traen la versión vigente tal cual y su huella coincide con la que registra la app', async () => {
  const { A } = await setup();
  const { TEXTOS } = await load('textos-acuerdo.mjs');
  assert.strictEqual(TEXTOS[VER], TEXT);
  assert.strictEqual(await A.sha256Hex(TEXT), await Remote.textHash(TEXT));
  assert.strictEqual(await A.sha256Hex('a\r\nb'), await A.sha256Hex('a\nb'));
});

test('el paquete de un solo archivo no importa nada local, no lleva secretos y su parte pura es JavaScript válido', () => {
  const src = fs.readFileSync(path.join(FN, 'acuerdo-coach-copia', 'pegar-en-el-panel.ts'), 'utf8');
  assert.ok(!/from\s+['"]\.{1,2}\//.test(src), 'sin imports locales');
  assert.ok(!/^export /m.test(src));
  assert.ok(/Deno\.serve/.test(src) && /npm:@supabase\/supabase-js@/.test(src));
  assert.ok(!/xkeysib-|sb_secret_|eyJ[A-Za-z0-9_-]{20,}/.test(src), 'sin claves');
  const pure = src.split('const env = (k: string)')[0].replace(/^import .*$/m, '');
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ac-')), 'x.mjs');
  fs.writeFileSync(f, pure);
  execFileSync(process.execPath, ['--check', f]);
});

test('no hay claves en la carpeta de la función ni referencias a valores reales', () => {
  for (const f of ['acuerdo-coach-copia/index.ts', '_shared/acuerdo.mjs', '_shared/manejador.mjs']) {
    const s = fs.readFileSync(path.join(FN, f), 'utf8');
    assert.ok(!/xkeysib-[A-Za-z0-9]/.test(s) && !/sb_secret_/.test(s), f);
  }
  const idx = fs.readFileSync(path.join(FN, 'acuerdo-coach-copia', 'index.ts'), 'utf8');
  for (const k of ['BREVO_API_KEY', 'BREVO_SENDER_EMAIL', 'BREVO_SENDER_NAME']) assert.match(idx, new RegExp(k));
});

test('grantedAgreement: solo con el último evento concedido, con versión y huella válidas', async () => {
  const { A, hash } = await setup();
  const ok = A.grantedAgreement([{ kind: 'terms', granted: true }, { kind: 'coach_agreement', granted: true, version: VER, text_hash: hash, client_at: '2026-10-22T15:30:00Z' }]);
  assert.deepStrictEqual(ok, { version: VER, textHash: hash, clientAt: '2026-10-22T15:30:00Z' });
  assert.strictEqual(A.grantedAgreement([{ kind: 'coach_agreement', granted: false, version: VER, text_hash: hash }]), null);
  assert.strictEqual(A.grantedAgreement([{ kind: 'coach_agreement', granted: true, version: VER, text_hash: 'zz' }]), null);
  assert.strictEqual(A.grantedAgreement([]), null);
  assert.strictEqual(A.grantedAgreement(null), null);
});

test('verifyAgreement: versión desconocida y huella distinta no envían', async () => {
  const { A, hash } = await setup();
  assert.deepStrictEqual(await A.verifyAgreement({ version: VER, textHash: hash }), { ok: true, text: TEXT });
  assert.deepStrictEqual(await A.verifyAgreement({ version: '9.9', textHash: hash }), { ok: false, code: 'unknown_version' });
  assert.deepStrictEqual(await A.verifyAgreement({ version: VER, textHash: 'b'.repeat(64) }), { ok: false, code: 'hash_mismatch' });
  assert.deepStrictEqual(await A.verifyAgreement({ version: '__proto__', textHash: hash }), { ok: false, code: 'unknown_version' });
});

test('decideRate: 1 por usuario y versión por hora; otra versión sí; pasada la hora, sí; deshacer', async () => {
  const { A } = await setup();
  const t0 = Date.parse('2026-10-23T12:00:00Z');
  const a = A.decideRate({}, 'v1', t0);
  assert.ok(a.allowed);
  const b = A.decideRate(a.next, 'v1', t0 + 59 * 60000);
  assert.ok(!b.allowed && b.retryAfterSec === 60);
  assert.ok(A.decideRate(a.next, 'v2', t0 + 1000).allowed);
  assert.ok(A.decideRate(a.next, 'v1', t0 + 61 * 60000).allowed);
  assert.ok(A.decideRate({ otra: 1 }, 'v1', t0).next.otra === 1, 'conserva el resto de app_metadata');
  assert.ok(A.decideRate(A.undoRate(a.next, 'v1', undefined), 'v1', t0 + 1000).allowed);
  let m = {}; for (let i = 0; i < 9; i++) m = A.decideRate(m, 'v' + i, t0 + i).next;
  assert.ok(Object.keys(m[A.RATE_KEY]).length <= 5);
});

test('buildEmail: Brevo recibe remitente, destinatario, texto, versión, fecha y huella; todo escapado', async () => {
  const { A } = await setup();
  const evil = 'Hola <script>alert(1)</script> & "x" \'y\'';
  const m = A.buildEmail({ to: 'coach@ejemplo.test', text: evil, version: '<b>1</b>', textHash: 'c'.repeat(64), clientAt: '2026-10-22T15:30:00.000Z', sender: { email: 'hola@ejemplo.test', name: 'Equipo' } });
  assert.deepStrictEqual(m.to, [{ email: 'coach@ejemplo.test' }]);
  assert.deepStrictEqual(m.sender, { email: 'hola@ejemplo.test', name: 'Equipo' });
  assert.ok(!m.htmlContent.includes('<script>') && !m.htmlContent.includes('<b>1</b>'));
  assert.ok(m.htmlContent.includes('&lt;script&gt;') && m.htmlContent.includes('&amp;') && m.htmlContent.includes('&quot;x&quot;'));
  assert.ok(m.textContent.includes(evil) && m.textContent.includes('c'.repeat(64)));
  assert.ok(/2026/.test(m.htmlContent) && /UTC/.test(m.htmlContent) && /Colombia/.test(m.htmlContent));
  assert.match(m.subject, /Acuerdo del coach/);
  const noName = A.buildEmail({ to: 'a@b.co', text: 't', version: '1', textHash: 'c'.repeat(64), clientAt: 'x', sender: { email: 'hola@ejemplo.test', name: '' } });
  assert.deepStrictEqual(noName.sender, { email: 'hola@ejemplo.test' });
  assert.match(noName.textContent, /No disponible/);
});

test('manejador: camino feliz envía a Brevo con la clave de los secretos, el correo del JWT y el texto del servidor', async () => {
  const { M, deps, calls, req, hash } = await setup();
  const res = await M.handle(req({ body: JSON.stringify({ to: 'victima@otro.test', text: 'TEXTO FALSO', version: '9' }) }), deps);
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), { ok: true, version: VER });
  assert.strictEqual(calls.brevo.length, 1);
  const b = calls.brevo[0];
  assert.strictEqual(b.url, 'https://api.brevo.com/v3/smtp/email');
  assert.strictEqual(b.init.headers['api-key'], 'xkeysib-PRUEBA');
  assert.deepStrictEqual(b.body.to, [{ email: 'coach@ejemplo.test' }]); // JWT, no el cuerpo
  assert.ok(b.body.textContent.includes(TEXT) && !b.body.textContent.includes('TEXTO FALSO'));
  assert.ok(b.body.textContent.includes(hash) && b.body.textContent.includes(VER));
  assert.deepStrictEqual(calls.rpc, ['core', 'my_consents', { p_app: 'grasa' }]);
  assert.strictEqual(calls.auth, 'Bearer jwt.abc.def');
  assert.strictEqual(calls.apikey, 'sb_publishable_x');
  assert.strictEqual(calls.adminWrites.length, 1);
  // los logs no llevan el correo, el texto ni la clave
  const logs = calls.logs.join('\n');
  assert.ok(!/coach@ejemplo|xkeysib|Acepto el Acuerdo/.test(logs));
});

test('manejador: segundo envío de la misma versión en la hora → 429; pasada la hora, vuelve a enviar', async () => {
  const s = await setup();
  assert.strictEqual((await s.M.handle(s.req(), s.deps)).status, 200);
  const r2 = await s.M.handle(s.req(), s.deps);
  assert.strictEqual(r2.status, 429);
  assert.deepStrictEqual(await r2.json(), { ok: false, error: 'rate_limited' });
  assert.ok(Number(r2.headers.get('Retry-After')) > 0);
  assert.strictEqual(s.calls.brevo.length, 1);
  s.deps.now = () => Date.parse('2026-10-23T13:01:00Z');
  assert.strictEqual((await s.M.handle(s.req(), s.deps)).status, 200);
  assert.strictEqual(s.calls.brevo.length, 2);
});

test('manejador: si Brevo falla, 502 y el límite se libera para reintentar', async () => {
  const s = await setup({ brevo: () => new Response('{"message":"coach@ejemplo.test mal"}', { status: 401 }) });
  const r = await s.M.handle(s.req(), s.deps);
  assert.strictEqual(r.status, 502);
  assert.deepStrictEqual(await r.json(), { ok: false, error: 'send_failed' });
  assert.ok(!s.calls.logs.join(' ').includes('coach@ejemplo') && /brevo_failed 401/.test(s.calls.logs.join(' ')));
  s.deps.fetch = async () => new Response('{}', { status: 201 });
  assert.strictEqual((await s.M.handle(s.req(), s.deps)).status, 200);
});

test('manejador: error de red hacia Brevo → 502 sin romper', async () => {
  const s = await setup({ brevo: () => { throw new TypeError('fetch failed'); } });
  assert.strictEqual((await s.M.handle(s.req(), s.deps)).status, 502);
});

test('manejador: sin secretos configurados → 503 not_configured y no llama a nada', async () => {
  for (const env of [{ BREVO_API_KEY: '' }, { BREVO_SENDER_EMAIL: '' }, { BREVO_SENDER_EMAIL: 'no-es-correo' }]) {
    const s = await setup({ env });
    const r = await s.M.handle(s.req(), s.deps);
    assert.strictEqual(r.status, 503);
    assert.deepStrictEqual(await r.json(), { ok: false, error: 'not_configured' });
    assert.strictEqual(s.calls.brevo.length, 0);
  }
});

test('manejador: sin JWT o con JWT inválido → 401; GET → 405; OPTIONS → 204 con CORS', async () => {
  let s = await setup();
  assert.strictEqual((await s.M.handle(new Request('https://x.test/', { method: 'POST' }), s.deps)).status, 401);
  s = await setup({ user: null });
  assert.strictEqual((await s.M.handle(s.req(), s.deps)).status, 401);
  s = await setup();
  assert.strictEqual((await s.M.handle(new Request('https://x.test/', { method: 'GET' }), s.deps)).status, 405);
  const o = await s.M.handle(new Request('https://x.test/', { method: 'OPTIONS' }), s.deps);
  assert.strictEqual(o.status, 204);
  assert.match(o.headers.get('Access-Control-Allow-Headers'), /authorization/);
  assert.strictEqual(s.calls.brevo.length, 0);
});

test('manejador: último evento retirado, sin evento, versión desconocida o huella distinta → no envía', async () => {
  const hash = await Remote.textHash(TEXT);
  const base = { kind: 'coach_agreement', version: VER, client_at: '2026-10-22T15:30:00.000Z', text_hash: hash };
  const cases = [
    [{ rows: [{ ...base, granted: false }] }, 403, 'agreement_not_granted'],
    [{ rows: [] }, 403, 'agreement_not_granted'],
    [{ rows: [{ ...base, granted: true, version: '0.1-viejo' }] }, 409, 'unknown_version'],
    [{ rows: [{ ...base, granted: true, text_hash: 'd'.repeat(64) }] }, 409, 'hash_mismatch'],
    [{ rpcError: true }, 502, 'consents_unavailable'],
  ];
  for (const [opts, status, code] of cases) {
    const s = await setup(opts);
    const r = await s.M.handle(s.req(), s.deps);
    assert.strictEqual(r.status, status, code);
    assert.strictEqual((await r.json()).error, code);
    assert.strictEqual(s.calls.brevo.length, 0, code);
  }
});

test('manejador: sin llave de servicio usa el límite en memoria (best effort)', async () => {
  const s = await setup({ noAdmin: true, user: { id: 'u-mem-' + Math.random(), email: 'm@ejemplo.test' } });
  assert.strictEqual((await s.M.handle(s.req(), s.deps)).status, 200);
  assert.strictEqual((await s.M.handle(s.req(), s.deps)).status, 429);
});
