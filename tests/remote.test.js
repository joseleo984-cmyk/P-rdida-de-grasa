// remote.js real (S3-3b) con un cliente supabase-js SIMULADO: llamadas que hace, traducción camelCase ↔ snake_case,
// lotes, URL firmadas de 60 s y mapeo de errores (contrato §10.4, primero por mensaje y luego por SQLSTATE).
// No hay red: el servidor real se comprueba con `npm run smoke:remote` (scripts/smoke-remote.js).
const test = require('node:test');
const assert = require('node:assert');
const Remote = require('../remote.js');

const URL0 = 'https://abcdefgh.supabase.co';
const KEY0 = 'sb_publishable_TEST';
const UID = '11111111-1111-4111-8111-111111111111';
const KEY_SESSION = 'sb-abcdefgh-auth-token';

function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), map: m };
}
const withSession = () => memStorage({ [KEY_SESSION]: JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_at: 1, user: { id: UID, email: 'ana@x.co' } }) });

// Cliente supabase-js simulado: registra cada llamada y responde con `h` (rpc / table / auth / storage).
function mock(h = {}) {
  const calls = [];
  const ok = (data) => ({ data, error: null, status: 200 });
  const reply = (fn, ...a) => Promise.resolve(fn ? fn(...a) : ok(null));
  const query = (schema, table) => {
    const ops = [];
    const q = {};
    for (const m of ['select', 'insert', 'update', 'eq', 'maybeSingle']) q[m] = (...a) => { ops.push([m, ...a]); return q; };
    q.then = (res, rej) => { calls.push(['table', schema, table, ops]); return reply(h.table, schema, table, ops).then(res, rej); };
    return q;
  };
  const client = {
    schema: (schema) => ({
      rpc: (fn, args) => { calls.push(['rpc', schema, fn, args]); return reply(h.rpc, schema, fn, args); },
      from: (t) => query(schema, t),
    }),
    auth: new Proxy({}, { get: (_, name) => (...a) => {
      calls.push(['auth', name, ...a]);
      if (name === 'onAuthStateChange') { h.authCb = a[0]; return { data: { subscription: { unsubscribe: () => calls.push(['unsub']) } } }; }
      return reply(h.auth, name, ...a);
    } }),
    functions: { invoke: (name, o) => { calls.push(['fn', name, o]); return reply(h.fn, name, o); } },
    storage: { from: (b) => new Proxy({}, { get: (_, name) => (...a) => { calls.push(['storage', b, name, ...a]); return reply(h.storage, name, ...a); } }) },
  };
  let opts = null;
  const createClient = (url, key, o) => { calls.push(['createClient', url, key]); opts = o; return client; };
  return { calls, createClient, opts: () => opts, h };
}
const make = (m, extra = {}) => Remote.create({ url: URL0, key: KEY0, storage: withSession(), createClient: m.createClient, ...extra });
const err = (o, status = 400) => ({ data: null, error: o, status });
const rejects = async (p, code) => { await assert.rejects(p, (e) => { assert.strictEqual(e.name, 'RemoteError'); assert.strictEqual(e.code, code); return true; }); };

test('create: opciones de supabase-js del contrato (§5.7) y fetch con timeout', () => {
  const m = mock();
  const r = make(m);
  assert.strictEqual(r.kind, 'real');
  const o = m.opts();
  assert.deepStrictEqual({ ...o.auth, storage: !!o.auth.storage }, { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storage: true, storageKey: KEY_SESSION });
  assert.strictEqual(typeof o.global.fetch, 'function');
  for (const g of ['auth', 'account', 'sync', 'client', 'coach']) for (const [k, v] of Object.entries(r[g])) assert.strictEqual(typeof v, 'function', `${g}.${k}`);
});

test('sin supabase-js cargado: error claro (server)', () => {
  assert.throws(() => Remote.create({ url: URL0, key: KEY0 }), (e) => e.code === 'server');
});

test('un solo cliente supabase-js por proyecto: account.js y la sincronización lo comparten', () => {
  const m = mock();
  globalThis.supabase = { createClient: m.createClient };
  try {
    Remote.create({ url: URL0, key: KEY0, storage: memStorage() });
    Remote.create({ url: URL0, key: KEY0, storage: memStorage() });
    assert.strictEqual(m.calls.filter((c) => c[0] === 'createClient').length, 1);
  } finally { delete globalThis.supabase; }
});

test('auth.sendCode: OTP por correo con shouldCreateUser; correo no válido sin llamar', async () => {
  const m = mock();
  const r = make(m);
  await r.auth.sendCode('  Ana@X.co ');
  assert.deepStrictEqual(m.calls.at(-1), ['auth', 'signInWithOtp', { email: 'ana@x.co', options: { shouldCreateUser: true } }]);
  const n = m.calls.length;
  await rejects(r.auth.sendCode('no-es-correo'), 'invalid');
  assert.strictEqual(m.calls.length, n);
  m.h.auth = () => err({ name: 'AuthApiError', status: 429, code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' }, 429);
  await rejects(r.auth.sendCode('ana@x.co'), 'rate_limited');
});

test('auth.verifyCode: 6 a 10 dígitos, type email; código mal formado no llama al servidor', async () => {
  const m = mock({ auth: () => ({ data: { user: { id: UID, email: 'ana@x.co' }, session: {} }, error: null }) });
  const r = make(m);
  assert.deepStrictEqual(await r.auth.verifyCode('ana@x.co', '123456'), { user: { id: UID, email: 'ana@x.co' } });
  assert.deepStrictEqual(m.calls.at(-1), ['auth', 'verifyOtp', { email: 'ana@x.co', token: '123456', type: 'email' }]);
  await r.auth.verifyCode('ana@x.co', '12345678');
  const n = m.calls.length;
  for (const bad of ['12345', 'abcdef', '12345678901', '']) await rejects(r.auth.verifyCode('ana@x.co', bad), 'invalid_code');
  assert.strictEqual(m.calls.length, n);
  m.h.auth = () => err({ name: 'AuthApiError', status: 403, code: 'otp_expired', message: 'Token has expired or is invalid' }, 403);
  await rejects(r.auth.verifyCode('ana@x.co', '654321'), 'invalid_code');
  m.h.auth = () => err({ name: 'AuthApiError', status: 429, code: 'over_request_rate_limit', message: 'Request rate limit reached' }, 429);
  await rejects(r.auth.verifyCode('ana@x.co', '654321'), 'rate_limited');
  m.h.auth = () => err({ name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' }, 0);
  await rejects(r.auth.verifyCode('ana@x.co', '654321'), 'offline');
});

test('auth.session: lee la sesión guardada SIN red (sirve offline); signOut la borra; onChange traduce eventos', async () => {
  const m = mock();
  const storage = withSession();
  const r = Remote.create({ url: URL0, key: KEY0, storage, createClient: m.createClient, navigator: { onLine: false } });
  const n = m.calls.length;
  assert.deepStrictEqual(await r.auth.session(), { user: { id: UID, email: 'ana@x.co' } });
  assert.strictEqual(m.calls.length, n, 'session() no llama a supabase-js');
  const seen = [];
  const off = r.auth.onChange((e) => seen.push(e));
  m.h.authCb('INITIAL_SESSION', null);
  m.h.authCb('SIGNED_IN', { user: { id: UID, email: 'ana@x.co' } });
  m.h.authCb('TOKEN_REFRESHED', { user: { id: UID, email: 'ana@x.co' } });
  m.h.authCb('SIGNED_OUT', null);
  assert.deepStrictEqual(seen.map((e) => e.event), ['signed_in', 'refreshed', 'signed_out']);
  off();
  assert.ok(m.calls.some((c) => c[0] === 'unsub'));
  await r.auth.signOut({ local: true });
  assert.ok(m.calls.some((c) => c[1] === 'signOut' && c[2].scope === 'local'));
  assert.strictEqual(await r.auth.session(), null);
  assert.strictEqual(storage.getItem(KEY_SESSION), null);
});

test('sin sesión: auth, sin ninguna llamada al servidor', async () => {
  const m = mock();
  const r = Remote.create({ url: URL0, key: KEY0, storage: memStorage(), createClient: m.createClient });
  const n = m.calls.length;
  await rejects(r.sync.pull(null), 'auth');
  await rejects(r.sync.push({ records: [] }), 'auth');
  await rejects(r.coach.clients(), 'auth');
  await rejects(r.account.roles(), 'auth');
  assert.strictEqual(m.calls.length, n);
});

test('mapError: tabla del contrato §10.4 (mensaje primero, luego SQLSTATE, red, HTTP y Auth)', () => {
  const cases = [
    [{ message: 'not_found', code: 'P0002' }, 'not_found'],
    [{ message: 'invalid_code', code: 'P0002' }, 'invalid_code'],
    [{ message: 'forbidden', code: '42501' }, 'forbidden'],
    [{ message: 'rate_limited', code: '54000' }, 'rate_limited'],
    [{ message: 'auth', code: '28000' }, 'auth'],
    [{ message: 'invalid', code: '22023', details: 'máximo 500 elementos por llamada' }, 'invalid'],
    [{ message: 'permission denied for table records', code: '42501' }, 'forbidden'],
    [{ message: 'new row violates check constraint', code: '23514' }, 'invalid'],
    [{ message: 'x', code: '22P02' }, 'invalid'],
    [{ message: 'x', code: '23502' }, 'invalid'],
    [{ message: 'x', code: '22001' }, 'invalid'],
    [{ message: 'duplicate key', code: '23505' }, 'invalid'],
    [{ message: 'JWT expired', code: 'PGRST301' }, 'auth'],
    [{ message: 'x', code: 'PGRST303' }, 'auth'],
    [{ message: 'x', status: 401 }, 'auth'],
    [{ message: 'statement too complex', code: '54000' }, 'rate_limited'],
    [{ message: 'Too Many Requests', status: 429 }, 'rate_limited'],
    [{ name: 'AuthApiError', code: 'over_email_send_rate_limit', status: 429 }, 'rate_limited'],
    [{ name: 'AuthApiError', code: 'over_request_rate_limit', status: 429 }, 'rate_limited'],
    [{ message: 'TypeError: Failed to fetch', details: 'stack', code: '' }, 'offline'],
    [{ name: 'TypeError', message: 'fetch failed' }, 'offline'],
    [{ message: 'AbortError: This operation was aborted', code: '' }, 'offline'],
    [{ name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' }, 'offline'],
    [{ name: 'StorageUnknownError', message: 'Failed to fetch' }, 'offline'],
    [{ name: 'AuthRetryableFetchError', status: 503, message: 'Service Unavailable' }, 'server'],
    [{ message: 'Internal Server Error', status: 500 }, 'server'],
    [{ message: 'JSON object requested, multiple rows returned', code: 'PGRST116' }, 'server'],
    [{ message: '¿?' }, 'server'],
    // Sprint 7 (r1 v1.5): el servidor impone los consentimientos
    [{ message: 'consent_required', code: '42501', status: 403, details: 'faltan las autorizaciones de datos de salud (A3) y copia en la nube (A4)' }, 'consent_required'],
    [{ message: 'forbidden', code: '42501', status: 403, details: 'coach_agreement_required' }, 'agreement_required'],
    [{ message: 'forbidden', code: '42501', status: 403 }, 'forbidden'],
  ];
  for (const [e, code] of cases) assert.strictEqual(Remote.mapError(e).code, code, JSON.stringify(e));
  assert.strictEqual(Remote.mapError({ name: 'AuthApiError', code: 'otp_expired', status: 403 }, { ctx: 'verify' }).code, 'invalid_code');
  assert.strictEqual(Remote.mapError({ message: 'x', status: 500 }, { nav: { onLine: false } }).code, 'server');
  // H2 (QA vivo): refresh_token inválido → 400 validation_failed "Refresh token is not valid" → `auth`, no `invalid`.
  assert.strictEqual(Remote.mapError({ name: 'AuthApiError', code: 'validation_failed', status: 400, message: 'Refresh token is not valid' }, { ctx: 'auth' }).code, 'auth');
  assert.strictEqual(Remote.mapError({ name: 'AuthApiError', code: 'validation_failed', status: 400, message: 'Unable to validate email address: invalid format' }, { ctx: 'auth' }).code, 'invalid');
  // H3 (QA vivo): 42501 sin sesión (HTTP 401) → `auth`; con sesión y RLS (HTTP 403 o sin status) → `forbidden`.
  assert.strictEqual(Remote.mapError({ message: 'permission denied for schema grasa', code: '42501' }, { status: 401 }).code, 'auth');
  assert.strictEqual(Remote.mapError({ message: 'permission denied for table records', code: '42501' }, { status: 403 }).code, 'forbidden');
  assert.strictEqual(Remote.mapError({ message: 'forbidden', code: '42501' }, { status: 403 }).code, 'forbidden');
  assert.strictEqual(Remote.mapError({ message: 'x' }, { nav: { onLine: false } }).code, 'offline');
  assert.strictEqual(Remote.mapError({ message: 'Object not found', status: 400 }, { ctx: 'storage' }).code, 'not_found');
  assert.strictEqual(Remote.mapError({ message: 'new row violates row-level security policy', status: 400 }, { ctx: 'storage' }).code, 'forbidden');
  assert.strictEqual(Remote.mapError({ message: 'The object exceeded the maximum allowed size', status: 413 }, { ctx: 'storage' }).code, 'invalid');
  // Reintentable solo offline / server / rate_limited; el mensaje crudo del servidor nunca es el texto del error.
  const e = Remote.mapError({ message: 'invalid', code: '22023', details: 'dato interno' });
  assert.strictEqual(e.retryable, false);
  assert.strictEqual(e.detail, 'dato interno');
  assert.strictEqual(Remote.mapError({ message: 'TypeError: Failed to fetch' }).retryable, true);
  assert.strictEqual(Remote.mapError({ message: 'boom', status: 500 }).retryable, true);
  assert.notStrictEqual(Remote.mapError({ message: 'permission denied for table secret_stuff', code: '42501' }).message, 'permission denied for table secret_stuff');
});

test('navigator.onLine === false: offline sin llamar al servidor', async () => {
  const m = mock();
  const r = make(m, { navigator: { onLine: false } });
  const n = m.calls.length;
  await rejects(r.sync.pull(null), 'offline');
  assert.strictEqual(m.calls.length, n);
});

test('timeout de 15 s (aquí 20 ms): la petición se aborta y es offline', async () => {
  const m = mock();
  const hang = (_u, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }))));
  make(m, { fetch: hang, timeoutMs: 20 });
  const f = m.opts().global.fetch;
  await assert.rejects(f('https://abcdefgh.supabase.co/rest/v1/rpc/x', {}), (e) => Remote.mapError(e).code === 'offline');
});

test('sync.push: snake_case, lápidas con data {}, lotes de ≤ 500 (registros + fotos) y rejected en camelCase', async () => {
  const m = mock({ rpc: (s, fn, a) => ({ data: { server_now: '2026-10-21T10:00:00.123456+00:00', rejected: {
    records: a.p_records.length ? [{ id: 'R1', kind: 'entry', nkey: '2026-10-01', date: '2026-10-01', data: { weight: 80 }, updated_at: '2026-10-21T09:00:00+00:00', deleted_at: null, server_updated_at: '2026-10-21T09:00:00.654321+00:00' }] : [],
    photos: a.p_photos.length ? [{ id: 'P1', date: '2026-10-01', pose: 'frente', width: 10, height: 20, storage_path: `${UID}/P1.jpg`, shared_with_coach: true, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-02T00:00:00Z', deleted_at: null, server_updated_at: 'S' }] : [] } }, error: null }) });
  const r = make(m);
  const recs = Array.from({ length: 700 }, (_, i) => ({ id: 'r' + i, kind: 'entry', nkey: 'k' + i, date: '2026-10-01', data: { weight: 80 }, updatedAt: '2026-10-21T08:00:00.000Z', deletedAt: null }));
  recs[0] = { ...recs[0], data: { weight: 1 }, deletedAt: '2026-10-21T08:00:00.000Z' };
  const photos = Array.from({ length: 300 }, (_, i) => ({ id: 'p' + i, date: '2026-10-01', pose: 'frente', width: 1, height: 1, sharedWithCoach: false, updatedAt: '2026-10-21T08:00:00.000Z', deletedAt: null }));
  const out = await r.sync.push({ records: recs, photos });
  const pushes = m.calls.filter((c) => c[2] === 'sync_push');
  assert.strictEqual(pushes.length, 2);
  for (const c of pushes) { assert.strictEqual(c[1], 'grasa'); assert.ok(c[3].p_records.length + c[3].p_photos.length <= 500); }
  const first = pushes[0][3].p_records[0];
  assert.deepStrictEqual(first, { id: 'r0', kind: 'entry', nkey: 'k0', date: '2026-10-01', data: {}, updated_at: '2026-10-21T08:00:00.000Z', deleted_at: '2026-10-21T08:00:00.000Z' });
  assert.deepStrictEqual(pushes[1][3].p_photos[0], { id: 'p0', date: '2026-10-01', pose: 'frente', width: 1, height: 1, storage_path: `${UID}/p0.jpg`, shared_with_coach: false, created_at: '2026-10-21T08:00:00.000Z', updated_at: '2026-10-21T08:00:00.000Z', deleted_at: null });
  assert.deepStrictEqual(out.rejected.records[0], { id: 'R1', kind: 'entry', nkey: '2026-10-01', date: '2026-10-01', data: { weight: 80 }, updatedAt: '2026-10-21T09:00:00.000Z', deletedAt: null, serverUpdatedAt: '2026-10-21T09:00:00.654321+00:00' });
  assert.strictEqual(out.rejected.photos[0].storagePath, `${UID}/P1.jpg`);
  assert.strictEqual(out.rejected.photos[0].sharedWithCoach, true);
  const n = m.calls.length;
  assert.deepStrictEqual(await r.sync.push({ records: [], photos: [] }), { serverNow: null, rejected: { records: [], photos: [] } });
  assert.strictEqual(m.calls.length, n, 'nada que subir: sin llamada');
});

test('sync.pull: p_overlap (§11.8), cursor del servidor TAL CUAL y comentarios en camelCase', async () => {
  const m = mock({ rpc: () => ({ data: { records: [{ id: 'a', kind: 'habit', nkey: '2026-10-01', date: '2026-10-01', data: { done: true }, updated_at: '2026-10-01T10:00:00+00:00', deleted_at: null, server_updated_at: 'X' }],
    photos: [], comments: [{ id: 'c', link_id: 'L', coach_id: 'C', client_id: UID, ref_date: null, body: 'Bien', created_at: '2026-10-01T00:00:00Z', read_at: null, deleted_at: null, server_updated_at: 'Y' }],
    cursor: '2026-10-21T10:00:00.123456+00:00', has_more: true, server_now: 'N' }, error: null }) });
  const r = make(m);
  const out = await r.sync.pull('2026-10-01T00:00:00.000Z', { overlap: false });
  assert.deepStrictEqual(m.calls.at(-1), ['rpc', 'grasa', 'sync_pull', { p_since: '2026-10-01T00:00:00.000Z', p_limit: 1000, p_overlap: false }]);
  assert.strictEqual(out.cursor, '2026-10-21T10:00:00.123456+00:00');
  assert.strictEqual(out.hasMore, true);
  assert.strictEqual(out.records[0].updatedAt, '2026-10-01T10:00:00.000Z');
  assert.deepStrictEqual(out.comments[0], { id: 'c', linkId: 'L', coachId: 'C', clientId: UID, refDate: null, body: 'Bien', createdAt: '2026-10-01T00:00:00.000Z', readAt: null, deletedAt: null, serverUpdatedAt: 'Y' });
  await r.sync.pull(null);
  assert.deepStrictEqual(m.calls.at(-1)[3], { p_since: '1970-01-01T00:00:00.000Z', p_limit: 1000, p_overlap: true });
});

test('Storage: subida {uid}/{id}.jpg con upsert; descarga con URL firmada de 60 s; rutas ajenas prohibidas', async () => {
  const fetched = [];
  const fetchImpl = async (u) => { fetched.push(u); return u.includes('missing') ? { ok: false, status: 404 } : { ok: true, status: 200, blob: async () => 'BLOB' }; };
  const m = mock({ storage: (name, path) => ({ data: name === 'createSignedUrl' ? { signedUrl: `https://abcdefgh.supabase.co/storage/v1/object/sign/${path}?token=t` } : { path }, error: null }) });
  const r = make(m, { fetch: fetchImpl });
  assert.deepStrictEqual(await r.sync.uploadPhoto('P1', 'b'), { path: `${UID}/P1.jpg` });
  assert.deepStrictEqual(m.calls.at(-1), ['storage', 'grasa-photos', 'upload', `${UID}/P1.jpg`, 'b', { upsert: true, contentType: 'image/jpeg', cacheControl: '0' }]);
  assert.strictEqual(await r.sync.downloadPhoto(`${UID}/P1.jpg`), 'BLOB');
  assert.deepStrictEqual(m.calls.at(-1), ['storage', 'grasa-photos', 'createSignedUrl', `${UID}/P1.jpg`, 60]);
  assert.match(fetched.at(-1), /token=t$/);
  await rejects(r.sync.downloadPhoto(`${UID}/missing.jpg`), 'not_found');
  const n = m.calls.length;
  await rejects(r.sync.downloadPhoto('otro-usuario/P1.jpg'), 'forbidden');
  await rejects(r.sync.deletePhotoFile('otro-usuario/P1.jpg'), 'forbidden');
  assert.strictEqual(m.calls.length, n);
  m.h.storage = () => err({ name: 'StorageApiError', status: 403, message: 'new row violates row-level security policy' }, 403);
  await rejects(r.sync.uploadPhoto('P2', 'b'), 'forbidden');
});

test('coach.photoBlob: registra el acceso ANTES de firmar la URL (60 s); foto de otro cliente prohibida', async () => {
  const m = mock({ storage: () => ({ data: { signedUrl: 'https://abcdefgh.supabase.co/s?token=t' }, error: null }) });
  const r = make(m, { fetch: async () => ({ ok: true, blob: async () => 'B' }) });
  const C = '22222222-2222-4222-8222-222222222222';
  assert.strictEqual(await r.coach.photoBlob(C, { id: 'P', storagePath: `${C}/P.jpg` }), 'B');
  const i = m.calls.findIndex((c) => c[2] === 'coach_photo_opened');
  const j = m.calls.findIndex((c) => c[2] === 'createSignedUrl');
  assert.ok(i >= 0 && j > i);
  assert.deepStrictEqual(m.calls[i][3], { p_photo: 'P' });
  assert.strictEqual(m.calls[j][4], 60);
  await rejects(r.coach.photoBlob(C, { id: 'P', storagePath: `${UID}/P.jpg` }), 'forbidden');
  m.h.rpc = () => err({ message: 'forbidden', code: '42501' }, 403);
  await rejects(r.coach.photoBlob(C, { id: 'P', storagePath: `${C}/P.jpg` }), 'forbidden');
});

test('cliente: previewCode 0 filas e join_coach null = invalid_code; shares con version y text_hash; myLink con nombre', async () => {
  const H = 'a'.repeat(64);
  const link = { id: 'L', coach_id: 'C', business_name: 'Coach X', share_body: true, share_notes: false, share_nutrition: true, share_habits: false, share_photos: false, since: '2026-10-21T00:00:00Z' };
  const m = mock({ rpc: (s, fn) => ({ data: { preview_invite_code: [], join_coach: null, my_link: [] }[fn] ?? null, error: null }) });
  const r = make(m);
  await rejects(r.client.previewCode('ZZZZZZ'), 'invalid_code');
  await rejects(r.client.joinCoach('ZZZZZZ', { body: true, version: '0.1', textHash: H }), 'invalid_code');
  assert.deepStrictEqual(m.calls.find((c) => c[2] === 'join_coach')[3], { p_code: 'ZZZZZZ', p_shares: { body: true, notes: false, nutrition: true, habits: true, photos: false, version: '0.1', text_hash: H } });
  assert.strictEqual(await r.client.myLink(), null);
  m.h.rpc = (s, fn) => ({ data: { preview_invite_code: [{ business_name: 'Coach X' }], join_coach: { id: 'L', coach_id: 'C' }, my_link: [link], update_shares: {} }[fn] ?? null, error: null });
  assert.deepStrictEqual(await r.client.previewCode('abc234'), { businessName: 'Coach X' });
  const expected = { id: 'L', coachId: 'C', businessName: 'Coach X', shares: { body: true, notes: false, nutrition: true, habits: false, photos: false }, since: '2026-10-21T00:00:00Z', paidUntil: null, paidMarkedAt: null, paid: false, daysLeft: null };
  assert.deepStrictEqual(await r.client.joinCoach('ABC234', { body: true, habits: false, version: '0.1', textHash: H }), expected);
  await r.client.updateShares({ notes: true, version: '0.2', textHash: H });
  assert.deepStrictEqual(m.calls.find((c) => c[2] === 'update_shares')[3].p_shares, { body: true, notes: true, nutrition: true, habits: false, photos: false, version: '0.2', text_hash: H });
  m.h.rpc = () => err({ message: 'rate_limited', code: '54000' });
  await rejects(r.client.previewCode('ABC234'), 'rate_limited');
});

test('coach: becomeCoach, myCoach (caducidad y usos), rotateCode, clients, clientData y comentarios', async () => {
  const m = mock({
    rpc: (s, fn) => ({ data: {
      become_coach: [{ invite_code: 'ABC234' }], rotate_invite_code: 'XYZ789',
      coach_clients: [{ client_id: 'A', display_name: 'Ana', link_id: 'L', since: 'S', shares: { body: true, notes: false, nutrition: true, habits: true, photos: false }, last_activity: null, over_free_limit: false }],
      coach_pull: { records: [], photos: [{ id: 'P', date: '2026-10-01', pose: 'frente', width: 1, height: 1, storage_path: 'A/P.jpg', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', server_updated_at: 'Z' }], comments: [], cursor: 'CUR' },
      add_comment: { id: 'K', link_id: 'L', coach_id: UID, client_id: 'A', ref_date: '2026-10-01', body: 'Hola', created_at: '2026-10-21T00:00:00Z', read_at: null, deleted_at: null, server_updated_at: 'W' },
    }[fn] ?? null, error: null }),
    table: (s, t) => ({ data: { business_name: 'Coach X', invite_code: 'ABC234', free_clients: 5, invite_expires_at: null, invite_max_uses: 10, invite_uses: 2 }, error: null }),
  });
  const r = make(m);
  assert.deepStrictEqual(await r.coach.becomeCoach(' Coach X '), { inviteCode: 'ABC234' });
  await rejects(r.coach.becomeCoach('x'), 'invalid');
  assert.deepStrictEqual(await r.coach.myCoach(), { businessName: 'Coach X', inviteCode: 'ABC234', freeClients: 5, expiresAt: null, maxUses: 10, uses: 2 });
  assert.deepStrictEqual(m.calls.at(-1).slice(0, 3), ['table', 'grasa', 'coaches']);
  assert.strictEqual(await r.coach.rotateCode({ validDays: 7, maxUses: 1 }), 'XYZ789');
  assert.deepStrictEqual(m.calls.at(-1)[3], { p_valid_days: 7, p_max_uses: 1 });
  assert.strictEqual((await r.coach.clients())[0].displayName, 'Ana');
  const d = await r.coach.clientData('A');
  assert.deepStrictEqual(m.calls.at(-1)[3], { p_client: 'A', p_since: '1970-01-01T00:00:00.000Z' });
  assert.strictEqual(d.photos[0].storagePath, 'A/P.jpg');
  assert.strictEqual(d.cursor, 'CUR');
  const c = await r.coach.addComment('A', { refDate: '2026-10-01', body: ' Hola ' });
  assert.strictEqual(c.linkId, 'L');
  const args = m.calls.find((x) => x[2] === 'add_comment')[3];
  assert.match(args.p_id, /^[0-9a-f-]{36}$/);
  assert.strictEqual(args.p_body, 'Hola');
  await rejects(r.coach.addComment('A', { body: '' }), 'invalid');
  m.h.rpc = () => err({ message: 'forbidden', code: '42501' }, 403);
  await rejects(r.coach.clientData('B'), 'forbidden');
});

test('cuenta: consentimientos con text_hash, roles, perfil y baja (primero Storage; si la BD ve archivos, reintenta)', async () => {
  const H = 'b'.repeat(64);
  let files = [['f1.jpg', 'f2.jpg'], []];
  let delCalls = 0;
  const m = mock({
    rpc: (s, fn) => {
      if (fn === 'delete_my_account') { delCalls++; return delCalls === 1 ? err({ message: 'invalid', code: '22023', details: 'borra primero tus fotos de Storage' }) : { data: null, error: null }; }
      return { data: { join_app: ['client'], my_roles: ['client', 'coach'], my_consents: [{ kind: 'terms', granted: true, version: '1.0', client_at: '2026-10-21T00:00:00Z', text_hash: H }] }[fn] ?? null, error: null };
    },
    table: () => ({ data: { display_name: 'Ana' }, error: null }),
    storage: (name) => (name === 'list' ? { data: (files.shift() || []).map((n) => ({ name: n })), error: null } : { data: [], error: null }),
  });
  const r = make(m);
  assert.deepStrictEqual(await r.account.joinApp(), ['client']);
  assert.deepStrictEqual(m.calls.at(-1), ['rpc', 'core', 'join_app', { p_app: 'grasa' }]);
  assert.deepStrictEqual(await r.account.roles(), ['client', 'coach']);
  assert.deepStrictEqual(await r.account.profile(), { id: UID, email: 'ana@x.co', displayName: 'Ana' });
  await r.account.recordConsents([{ kind: 'terms', granted: true, version: '1.0', textHash: H, clientAt: '2026-10-21T00:00:00.000Z' }]);
  const ins = m.calls.at(-1);
  assert.deepStrictEqual(ins.slice(0, 3), ['table', 'core', 'consent_events']);
  assert.deepStrictEqual(ins[3][0], ['insert', [{ user_id: UID, app_id: 'grasa', kind: 'terms', granted: true, version: '1.0', text_hash: H, coach_id: null, client_at: '2026-10-21T00:00:00.000Z' }]]);
  await rejects(r.account.recordConsents([{ kind: 'terms', granted: true, version: '1.0', clientAt: '2026-10-21T00:00:00.000Z' }]), 'invalid');
  assert.deepStrictEqual(await r.account.consents(), { terms: { granted: true, version: '1.0', clientAt: '2026-10-21T00:00:00.000Z', textHash: H } });
  files = [['f1.jpg', 'f2.jpg'], [], ['tarde.jpg'], []];
  await r.account.deleteAccount();
  const removes = m.calls.filter((c) => c[2] === 'remove');
  assert.deepStrictEqual(removes[0][3], [`${UID}/f1.jpg`, `${UID}/f2.jpg`]);
  assert.deepStrictEqual(removes[1][3], [`${UID}/tarde.jpg`]);
  assert.strictEqual(delCalls, 2);
  assert.ok(m.calls.findIndex((c) => c[2] === 'remove') < m.calls.findIndex((c) => c[2] === 'delete_my_account'));
  assert.ok(m.calls.some((c) => c[1] === 'signOut'));
});

test('createFake: adapta pull(since, { overlap }) a la firma del fake (§11.8)', async () => {
  const Fake = require('../remote-fake.js');
  globalThis.RemoteFake = Fake;
  try {
    const backend = new Fake.FakeBackend();
    const r = Remote.createFake({ backend, storage: memStorage() });
    await r.auth.sendCode('ana@x.co');
    await r.auth.verifyCode('ana@x.co', backend.lastCode('ana@x.co'));
    await r.account.recordConsents(['sensitive_health', 'cloud_transfer'].map((kind) => ({ kind, granted: true, version: 't', textHash: 'a'.repeat(64), clientAt: new Date().toISOString() })));   // Sprint 7
    await r.sync.push({ records: [{ id: '33333333-3333-4333-8333-333333333333', kind: 'entry', nkey: '2026-10-01', date: '2026-10-01', data: { weight: 80 }, updatedAt: '2026-10-01T00:00:00.000Z', deletedAt: null }] });
    const out = await r.sync.pull(null, { overlap: true });
    assert.strictEqual(out.records.length, 1);
  } finally { delete globalThis.RemoteFake; }
});

// ---------- Sprint 10: copia del acuerdo por correo (función de borde acuerdo-coach-copia) ----------
const fnErr = (status, body, name = 'FunctionsHttpError') => ({ data: null, error: { name, message: 'x', context: { status, json: async () => body } } });

test('sendAgreementCopy: invoca la función con el JWT de la sesión (supabase-js) y SIN datos en el cuerpo', async () => {
  const m = mock({ fn: () => ({ data: { ok: true }, error: null }) });
  const r = await make(m).account.sendAgreementCopy();
  assert.deepStrictEqual(r, { sent: true });
  assert.deepStrictEqual(m.calls.filter((c) => c[0] === 'fn'), [['fn', 'acuerdo-coach-copia', { body: {} }]]);
});

test('sendAgreementCopy: errores amables (429, 401, 403, 404/503/5xx = unavailable, red = offline)', async () => {
  const cases = [
    [fnErr(429, { ok: false, error: 'rate_limited' }), 'rate_limited'],
    [fnErr(401, { ok: false, error: 'unauthorized' }), 'auth'],
    [fnErr(403, { ok: false, error: 'agreement_not_granted' }), 'agreement_required'],
    [fnErr(404, null), 'unavailable'],
    [fnErr(503, { ok: false, error: 'not_configured' }), 'unavailable'],
    [fnErr(502, { ok: false, error: 'send_failed' }), 'unavailable'],
    [fnErr(409, { ok: false, error: 'hash_mismatch' }), 'unavailable'],
    [{ data: null, error: { name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function' } }, 'offline'],
    [{ data: null, error: { name: 'FunctionsRelayError', message: 'relay' } }, 'unavailable'],
  ];
  for (const [res, code] of cases) await rejects(make(mock({ fn: () => res })).account.sendAgreementCopy(), code);
  await rejects(make(mock({ fn: () => { throw new TypeError('Failed to fetch'); } })).account.sendAgreementCopy(), 'offline');
});

test('sendAgreementCopy: sin sesión → auth; sin internet → offline sin llamar', async () => {
  const m = mock();
  await rejects(Remote.create({ url: URL0, key: KEY0, storage: memStorage(), createClient: m.createClient }).account.sendAgreementCopy(), 'auth');
  const m2 = mock();
  await rejects(make(m2, { navigator: { onLine: false } }).account.sendAgreementCopy(), 'offline');
  assert.strictEqual(m2.calls.filter((c) => c[0] === 'fn').length, 0);
});

// ---------- Sprint 11 (r1 v1.6): cobros manuales ----------
test('payment_required (42501, detail payment_required) se traduce a su propio código, no es técnico ni reintentable', async () => {
  const m = mock({ rpc: () => err({ message: 'payment_required', code: '42501', details: 'payment_required' }, 403) });
  const r = make(m);
  await assert.rejects(r.sync.push({ records: [{ id: UID, kind: 'entry', nkey: '2026-10-21', date: '2026-10-21', data: {}, updatedAt: '2026-10-21T10:00:00Z' }] }), (e) => {
    assert.strictEqual(e.code, 'payment_required'); assert.strictEqual(e.retryable, false); return true;
  });
  assert.strictEqual(Remote.mapError({ message: 'x', code: '42501', details: 'payment_required' }, { status: 403 }).code, 'payment_required');
  assert.strictEqual(Remote.mapError({ message: 'payment_required', code: '42501' }, { status: 403 }).code, 'payment_required');
  assert.strictEqual(Remote.mapError({ message: 'forbidden', code: '42501' }, { status: 403 }).code, 'forbidden');
});
test('coach.setPayment, coach.clients y client.myLink llevan paid_until, paid y days_left', async () => {
  const m = mock({ rpc: (s, fn) => ({ data: {
    set_client_payment: { client_id: 'A', paid_until: '2026-11-20', paid_marked_at: '2026-10-21T10:00:00Z', paid: true, days_left: 30 },
    coach_clients: [{ client_id: 'A', display_name: 'Ana', link_id: 'L', since: 'S', shares: { body: true }, last_activity: null, over_free_limit: false, paid_until: '2026-11-20', paid_marked_at: '2026-10-21T10:00:00Z', paid: true, days_left: 30 }],
    my_link: [{ id: 'L', coach_id: 'C', business_name: 'Coach X', share_body: true, share_notes: false, share_nutrition: false, share_habits: true, share_photos: false, since: 'S', paid_until: null, paid_marked_at: null, paid: false, days_left: null }],
  }[fn] ?? null, error: null }) });
  const r = make(m);
  assert.deepStrictEqual(await r.coach.setPayment('A', '2026-11-20'), { paidUntil: '2026-11-20', paidMarkedAt: '2026-10-21T10:00:00.000Z', paid: true, daysLeft: 30 });
  assert.deepStrictEqual(m.calls.at(-1)[3], { p_client: 'A', p_paid_until: '2026-11-20' });
  await r.coach.setPayment('A', null);
  assert.deepStrictEqual(m.calls.at(-1)[3], { p_client: 'A', p_paid_until: null });
  await rejects(r.coach.setPayment('A', 'mañana'), 'invalid');
  const [c] = await r.coach.clients();
  assert.deepStrictEqual([c.paidUntil, c.paid, c.daysLeft], ['2026-11-20', true, 30]);
  const l = await r.client.myLink();
  assert.deepStrictEqual([l.paidUntil, l.paid, l.daysLeft, l.shares.habits], [null, false, null, true]);
});
test('uploadPhoto: el 403 de Storage con el vínculo vencido se traduce a payment_required (con el vínculo al día sigue siendo forbidden)', async () => {
  const m = mock({ storage: (name) => (name === 'upload' ? err({ message: 'new row violates row-level security policy', statusCode: '403' }, 403) : { data: null, error: null }),
    rpc: () => ({ data: [{ id: 'L', coach_id: 'C', business_name: 'X', paid: false, paid_until: null }], error: null }) });
  const r = make(m);
  await rejects(r.sync.uploadPhoto('P1', 'b'), 'payment_required');
  m.h.rpc = () => ({ data: [{ id: 'L', coach_id: 'C', business_name: 'X', paid: true, paid_until: '2099-01-01' }], error: null });
  await rejects(r.sync.uploadPhoto('P1', 'b'), 'forbidden');
  m.h.rpc = () => ({ data: [], error: null });
  await rejects(r.sync.uploadPhoto('P1', 'b'), 'forbidden');
});

// ---------- Etapa 2 (r1 v1.7): rutinas y animaciones ----------
const COACH = '22222222-2222-4222-8222-222222222222';
const GIFID = 'a0000000-0000-4000-8000-000000000001';
const gifFile = (head, type = 'image/gif', extra = 0) => new Blob([Uint8Array.from([...Buffer.from(head, 'latin1'), 0, 0, 0, 0, 0, 0, ...new Array(extra).fill(1)])], { type });
test('coach.uploadGif: valida tipo, tamaño y firma de bytes, registra con p_head y sube SIN re-codificar a ejercicios/{uid}/{id}.gif', async () => {
  globalThis.Rutinas = require('../rutinas.js');
  try {
    const m = mock({ rpc: (s, fn, a) => ({ data: fn === 'register_gif' ? { id: a.p_id, name: a.p_name, mime: a.p_mime, size_bytes: a.p_size, created_at: '2026-10-25T10:00:00Z', uses: 0 } : null, error: null }),
      storage: (name, path) => ({ data: { path }, error: null }) });
    const r = make(m);
    const f = gifFile('GIF89a');
    const out = await r.coach.uploadGif(f, '  Press de banca ');
    const reg = m.calls.find((c) => c[2] === 'register_gif');
    assert.deepStrictEqual([reg[3].p_name, reg[3].p_mime, reg[3].p_size, reg[3].p_head], ['Press de banca', 'image/gif', 12, '474946383961000000000000']);
    const up = m.calls.find((c) => c[0] === 'storage' && c[2] === 'upload');
    assert.deepStrictEqual([up[1], up[2], up[3] === `${UID}/${reg[3].p_id}.gif`, up[4] === f, up[5]], ['ejercicios', 'upload', true, true, { upsert: true, contentType: 'image/gif', cacheControl: '0' }]);
    assert.deepStrictEqual([out.name, out.mime, out.size, out.uses], ['Press de banca', 'image/gif', 12, 0]);
    // Rechazos locales: no llegan a llamar al servidor
    const n = m.calls.length;
    await rejects(r.coach.uploadGif(gifFile('\x89PNG\r\n\x1a\n', 'image/png'), 'x'), 'invalid');
    await rejects(r.coach.uploadGif(gifFile('\x89PNG\r\n\x1a\n', 'image/gif'), 'x'), 'invalid');
    await rejects(r.coach.uploadGif(gifFile('GIF89a', 'image/gif', 3 * 1048576), 'x'), 'invalid');
    await rejects(r.coach.uploadGif(null, 'x'), 'invalid');
    assert.strictEqual(m.calls.length, n);
    const bad = await r.coach.uploadGif(gifFile('GIF89a', 'image/png'), 'x').catch((e) => e);
    assert.match(bad.detail, /GIF o WebP/);
    // Si la subida falla, se deshace el registro
    m.h.storage = () => err({ name: 'StorageApiError', status: 400, message: 'mime type image/gif is not supported' }, 400);
    await rejects(r.coach.uploadGif(gifFile('GIF87a'), 'y'), 'invalid');
    assert.strictEqual(m.calls.at(-1)[2], 'delete_gif');
  } finally { delete globalThis.Rutinas; }
});
test('coach.deleteGif: borra el registro y después el archivo; en uso → invalid con detail gif_in_use', async () => {
  const m = mock({ rpc: () => ({ data: null, error: null }), storage: () => ({ data: [], error: null }) });
  const r = make(m);
  await r.coach.deleteGif(GIFID);
  assert.deepStrictEqual(m.calls.filter((c) => c[0] === 'rpc' || c[0] === 'storage').map((c) => [...c.slice(0, 3), c[3]]), [['rpc', 'grasa', 'delete_gif', { p_id: GIFID }], ['storage', 'ejercicios', 'remove', [`${UID}/${GIFID}.gif`]]]);
  m.h.rpc = () => err({ message: 'invalid', code: '22023', details: 'gif_in_use' });
  const e = await r.coach.deleteGif(GIFID).catch((x) => x);
  assert.deepStrictEqual([e.code, e.detail], ['invalid', 'gif_in_use']);
  assert.strictEqual(m.calls.filter((c) => c[2] === 'remove').length, 1, 'si la BD se niega, el archivo no se toca');
});
test('gifBlob (coach y cliente): URL firmada de 60 s del bucket ejercicios; ids no válidos no llaman', async () => {
  globalThis.Rutinas = require('../rutinas.js');
  try {
    const m = mock({ storage: (name, path) => ({ data: name === 'createSignedUrl' ? { signedUrl: `https://abcdefgh.supabase.co/storage/v1/object/sign/${path}?token=t` } : { path }, error: null }) });
    const r = make(m, { fetch: async () => ({ ok: true, status: 200, blob: async () => 'GIF' }) });
    assert.strictEqual(await r.client.gifBlob(COACH, GIFID), 'GIF');
    assert.deepStrictEqual(m.calls.at(-1), ['storage', 'ejercicios', 'createSignedUrl', `${COACH}/${GIFID}.gif`, 60]);
    assert.strictEqual(await r.coach.gifBlob(GIFID), 'GIF');
    assert.deepStrictEqual(m.calls.at(-1), ['storage', 'ejercicios', 'createSignedUrl', `${UID}/${GIFID}.gif`, 60]);
    const n = m.calls.length;
    await rejects(r.client.gifBlob('../otro', GIFID), 'invalid');
    await rejects(r.client.gifBlob(COACH, 'x/../y'), 'invalid');
    await rejects(r.coach.gifBlob('nope'), 'invalid');
    assert.strictEqual(m.calls.length, n);
    m.h.storage = () => err({ name: 'StorageApiError', status: 400, message: 'Object not found' }, 400);
    await rejects(r.client.gifBlob(COACH, GIFID), 'not_found');
  } finally { delete globalThis.Rutinas; }
});
test('rutinas: saveRoutine manda título y contenido limpios; myRoutine y getRoutine traducen la fila; null si no hay', async () => {
  globalThis.Rutinas = require('../rutinas.js');
  try {
    const row = { id: 'RID', coach_id: COACH, client_id: UID, title: 'Fuerza', updated_at: '2026-10-25T10:00:00Z', content: { days: [{ title: 'Día 1', exercises: [{ name: 'Press', sets: '4 × 12', gif: GIFID }] }] } };
    const m = mock({ rpc: (s, fn) => ({ data: fn === 'my_routine' || fn === 'get_routine' || fn === 'save_routine' ? row : null, error: null }) });
    const r = make(m);
    const draft = { title: ' Fuerza ', days: [{ title: ' Día 1 ', exercises: [{ name: ' Press ', sets: '4 × 12', note: '', gif: GIFID.toUpperCase() }, { name: '', sets: '', note: '', gif: '' }] }] };
    const saved = await r.coach.saveRoutine(UID, draft);
    assert.deepStrictEqual(m.calls.at(-1), ['rpc', 'grasa', 'save_routine', { p_client: UID, p_title: 'Fuerza', p_content: { days: [{ title: 'Día 1', exercises: [{ name: 'Press', sets: '4 × 12', gif: GIFID }] }] } }]);
    assert.deepStrictEqual([saved.id, saved.coachId, saved.title, saved.days[0].exercises[0].gif, saved.days[0].exercises[0].note], ['RID', COACH, 'Fuerza', GIFID, '']);
    assert.strictEqual((await r.client.myRoutine()).title, 'Fuerza');
    assert.strictEqual((await r.coach.getRoutine(UID)).coachId, COACH);
    assert.deepStrictEqual(m.calls.at(-1), ['rpc', 'grasa', 'get_routine', { p_client: UID }]);
    m.h.rpc = () => ({ data: null, error: null });
    assert.strictEqual(await r.client.myRoutine(), null);
    await r.coach.deleteRoutine(UID);
    assert.deepStrictEqual(m.calls.at(-1), ['rpc', 'grasa', 'delete_routine', { p_client: UID }]);
    // Validación local: no llega al servidor
    const n = m.calls.length;
    const e = await r.coach.saveRoutine(UID, { title: '', days: [] }).catch((x) => x);
    assert.deepStrictEqual([e.code, /título/.test(e.detail)], ['invalid', true]);
    assert.strictEqual(m.calls.length, n);
    // Errores del servidor
    m.h.rpc = () => err({ message: 'invalid', code: '22023', details: 'gif_not_found' });
    assert.strictEqual((await r.coach.saveRoutine(UID, draft).catch((x) => x)).detail, 'gif_not_found');
    m.h.rpc = () => err({ message: 'forbidden', code: '42501', details: 'coach_agreement_required' }, 403);
    await rejects(r.coach.getRoutine(UID), 'agreement_required');
    m.h.rpc = () => err({ message: 'forbidden', code: '42501' }, 403);
    await rejects(r.coach.saveRoutine(UID, draft), 'forbidden');
  } finally { delete globalThis.Rutinas; }
});
test('coach.listGifs traduce la biblioteca (tamaño, usos)', async () => {
  const m = mock({ rpc: () => ({ data: [{ id: GIFID, name: 'Press', mime: 'image/gif', size_bytes: 1500, created_at: '2026-10-25T10:00:00Z', uses: 2 }], error: null }) });
  assert.deepStrictEqual(await make(m).coach.listGifs(), [{ id: GIFID, name: 'Press', mime: 'image/gif', size: 1500, createdAt: '2026-10-25T10:00:00.000Z', uses: 2 }]);
  assert.deepStrictEqual(m.calls.at(-1), ['rpc', 'grasa', 'my_gifs', {}]);
});
test('account.deleteAccount también vacía el bucket ejercicios antes de borrar la cuenta', async () => {
  const m = mock({ rpc: () => ({ data: null, error: null }), storage: () => ({ data: [], error: null }) });
  await make(m).account.deleteAccount();
  const lists = m.calls.filter((c) => c[0] === 'storage' && c[2] === 'list').map((c) => c[1]);
  assert.deepStrictEqual(lists, ['grasa-photos', 'ejercicios']);
});

// ---------- v1.8: biblioteca, asignar, visibilidad y rutina de hoy ----------
test('v1.8 cliente: myRoutines traduce el arreglo (con visible) y myDaily manda su fecha de hoy; fecha mal formada no llama', async () => {
  globalThis.Rutinas = require('../rutinas.js');
  try {
    const row = (id, title) => ({ id, coach_id: COACH, client_id: UID, title, visible: true, created_at: '2026-10-25T10:00:00Z', updated_at: '2026-10-25T10:00:00Z', content: { days: [{ title: 'D', exercises: [] }] } });
    const m = mock({ rpc: (s, fn) => ({ data: fn === 'my_routines' ? [row('R1', 'Pecho'), row('R2', 'Piernas')] : fn === 'my_daily' ? { coach_id: COACH, template_id: 'T', title: 'Hoy', day: '2026-10-21', published_at: '2026-10-21T10:00:00Z', content: { days: [{ title: 'D', exercises: [] }] } } : null, error: null }) });
    const r = make(m);
    const list = await r.client.myRoutines();
    assert.deepStrictEqual(list.map((x) => [x.id, x.title, x.visible]), [['R1', 'Pecho', true], ['R2', 'Piernas', true]]);
    assert.deepStrictEqual(m.calls.at(-1), ['rpc', 'grasa', 'my_routines', {}]);
    const d = await r.client.myDaily('2026-10-21');
    assert.deepStrictEqual(m.calls.at(-1), ['rpc', 'grasa', 'my_daily', { p_today: '2026-10-21' }]);
    assert.deepStrictEqual([d.title, d.day, d.coachId, d.id], ['Hoy', '2026-10-21', COACH, null]);
    const n = m.calls.length;
    await rejects(r.client.myDaily('hoy'), 'invalid');
    assert.strictEqual(m.calls.length, n);
    m.h.rpc = () => ({ data: null, error: null });
    assert.strictEqual(await r.client.myDaily('2026-10-22'), null);
    m.h.rpc = () => ({ data: [], error: null });
    assert.deepStrictEqual(await r.client.myRoutines(), []);
  } finally { delete globalThis.Rutinas; }
});
test('v1.8 coach: plantillas, asignar, rutinas del asesorado, visibilidad y rutina de hoy llaman a las funciones correctas', async () => {
  globalThis.Rutinas = require('../rutinas.js');
  try {
    const row = { id: 'T1', coach_id: UID, title: 'Pecho', visible: true, updated_at: '2026-10-25T10:00:00Z', content: { days: [{ title: 'D', exercises: [] }] } };
    const m = mock({ rpc: (s, fn) => ({ data: fn === 'list_templates' || fn === 'assign_template' || fn === 'list_client_routines' ? [row] : fn === 'save_template' || fn === 'save_client_routine' || fn === 'set_routine_visible' ? row : fn === 'publish_daily' ? { coach_id: UID, title: 'Pecho', day: '2026-10-21', content: { days: [{ title: 'D', exercises: [] }] } } : null, error: null }) });
    const r = make(m);
    const draft = { title: ' Pecho ', days: [{ title: 'D', exercises: [] }] };
    const last = () => m.calls.at(-1);
    assert.strictEqual((await r.coach.listTemplates())[0].title, 'Pecho');
    assert.deepStrictEqual(last(), ['rpc', 'grasa', 'list_templates', {}]);
    await r.coach.saveTemplate(null, draft);
    assert.deepStrictEqual(last(), ['rpc', 'grasa', 'save_template', { p_id: null, p_title: 'Pecho', p_content: { days: [{ title: 'D', exercises: [] }] } }]);
    await r.coach.saveTemplate('T1', draft);
    assert.strictEqual(last()[3].p_id, 'T1');
    await r.coach.deleteTemplate('T1');
    assert.deepStrictEqual(last(), ['rpc', 'grasa', 'delete_template', { p_id: 'T1' }]);
    assert.strictEqual((await r.coach.assignTemplate('T1', ['A', 'B', 'A'])).length, 1);
    assert.deepStrictEqual(last(), ['rpc', 'grasa', 'assign_template', { p_template: 'T1', p_clients: ['A', 'B'] }]);
    await rejects(r.coach.assignTemplate('T1', []), 'invalid');
    assert.strictEqual((await r.coach.listClientRoutines('A'))[0].visible, true);
    assert.deepStrictEqual(last(), ['rpc', 'grasa', 'list_client_routines', { p_client: 'A' }]);
    await r.coach.saveClientRoutine('A', null, draft);
    assert.deepStrictEqual([last()[2], last()[3].p_client, last()[3].p_id], ['save_client_routine', 'A', null]);
    await r.coach.saveClientRoutine('A', 'R9', draft);
    assert.strictEqual(last()[3].p_id, 'R9');
    await r.coach.deleteClientRoutine('R9');
    assert.deepStrictEqual(last(), ['rpc', 'grasa', 'delete_client_routine', { p_id: 'R9' }]);
    await r.coach.setRoutineVisible('R9', false);
    assert.deepStrictEqual(last(), ['rpc', 'grasa', 'set_routine_visible', { p_id: 'R9', p_visible: false }]);
    const d = await r.coach.publishDaily('T1', '2026-10-21');
    assert.deepStrictEqual(last(), ['rpc', 'grasa', 'publish_daily', { p_template: 'T1', p_day: '2026-10-21' }]);
    assert.strictEqual(d.day, '2026-10-21');
    await rejects(r.coach.publishDaily('T1', 'hoy'), 'invalid');
    m.h.rpc = () => ({ data: null, error: null });
    assert.strictEqual(await r.coach.getDaily(), null);
    await r.coach.clearDaily();
    assert.deepStrictEqual(last(), ['rpc', 'grasa', 'clear_daily', {}]);
    // validación local y errores del servidor
    const n = m.calls.length;
    await rejects(r.coach.saveTemplate(null, { title: '', days: [] }), 'invalid');
    assert.strictEqual(m.calls.length, n);
    m.h.rpc = () => err({ message: 'invalid', code: '22023', details: 'template_limit' });
    assert.strictEqual((await r.coach.saveTemplate(null, draft).catch((x) => x)).detail, 'template_limit');
    m.h.rpc = () => err({ message: 'invalid', code: '22023', details: 'routine_limit' });
    assert.strictEqual((await r.coach.assignTemplate('T1', ['A']).catch((x) => x)).detail, 'routine_limit');
  } finally { delete globalThis.Rutinas; }
});
