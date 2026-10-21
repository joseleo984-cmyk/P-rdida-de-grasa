// QA-S3-1-D3: el script de barrido llama a la RPC de huérfanos, lista con la API de Storage y solo borra con --apply.
const test = require('node:test');
const assert = require('node:assert');
const { main } = require('../supabase/tools/sweep-orphan-photos.js');

const ORPHAN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function fakeFetch() {
  const calls = [];
  const f = async (u, opts) => {
    calls.push({ url: u, method: opts.method, body: opts.body, headers: opts.headers });
    let body = [];
    if (u.endsWith('/rest/v1/rpc/orphan_photo_folders')) body = [{ folder: ORPHAN, files: 2 }, { folder: 'no-uuid', files: 1 }];
    else if (u.includes('/storage/v1/object/list/grasa-photos')) body = [{ name: 'p1.jpg' }, { name: 'p2.jpg' }];
    else if (opts.method === 'DELETE') body = [];
    return { ok: true, status: 200, json: async () => body, text: async () => '' };
  };
  f.calls = calls;
  return f;
}

test('simulación: lista pero no borra; exige URL y clave', async () => {
  const f = fakeFetch();
  const r = await main({ url: 'https://x.supabase.co/', key: 'k', apply: false, fetchImpl: f, log: () => {} });
  assert.deepStrictEqual(r, { folders: 2, files: 2 });
  assert.ok(!f.calls.some((c) => c.method === 'DELETE'), 'sin --apply no hay DELETE');
  assert.strictEqual(f.calls[0].headers['Content-Profile'], 'grasa');
  assert.strictEqual(f.calls[0].headers.Authorization, 'Bearer k');
  await assert.rejects(() => main({ url: '', key: '', fetchImpl: f, log: () => {} }), /SUPABASE_URL/);
});

test('--apply: borra exactamente los archivos de la carpeta huérfana (y salta nombres no UUID)', async () => {
  const f = fakeFetch();
  await main({ url: 'https://x.supabase.co', key: 'k', apply: true, fetchImpl: f, log: () => {} });
  const del = f.calls.filter((c) => c.method === 'DELETE');
  assert.strictEqual(del.length, 1);
  assert.strictEqual(del[0].url, 'https://x.supabase.co/storage/v1/object/grasa-photos');
  assert.deepStrictEqual(JSON.parse(del[0].body), { prefixes: [`${ORPHAN}/p1.jpg`, `${ORPHAN}/p2.jpg`] });
});
