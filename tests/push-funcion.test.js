const test = require('node:test');
const assert = require('node:assert');

const load = () => import('../supabase/functions/_shared/push.mjs');
const req = (body, method = 'POST') => new Request('http://x/', { method, headers: { 'Content-Type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body) : undefined });

function fakeDeps({ keys = null, pending = [], sendStatus = () => 201 } = {}) {
  const calls = [];
  let stored = keys;
  return {
    calls,
    admin: {
      async rpc(fn, args) {
        calls.push([fn, args]);
        if (fn === 'push_keys_get') return { data: stored ? { public: stored.public, private: stored.private } : null, error: null };
        if (fn === 'push_keys_set') { stored = stored || { public: args.p_public, private: args.p_private }; return { data: { public: stored.public, private: stored.private }, error: null }; }
        if (fn === 'push_take') { const p = pending.splice(0); return { data: p, error: null }; }
        return { data: null, error: null };
      },
    },
    generateKeys: () => ({ publicKey: 'PUB', privateKey: 'PRIV' }),
    async send(sub, payload) { calls.push(['send', sub.endpoint, payload]); return { status: sendStatus(sub) }; },
  };
}

test('push-enviar: la clave pública se crea la primera vez y la privada NUNCA sale en la respuesta', async () => {
  const { handle } = await load();
  const d = fakeDeps();
  const r = await handle(req({ accion: 'clave' }), d);
  const txt = await r.text();
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(JSON.parse(txt), { publicKey: 'PUB' });
  assert.doesNotMatch(txt, /PRIV/);
  assert.strictEqual(d.calls.filter((c) => c[0] === 'push_keys_set').length, 1);
  // la segunda vez reutiliza las guardadas
  const d2 = fakeDeps({ keys: { public: 'P2', private: 'S2' } });
  assert.deepStrictEqual(await (await handle(req({ accion: 'clave' }), d2)).json(), { publicKey: 'P2' });
  assert.strictEqual(d2.calls.filter((c) => c[0] === 'push_keys_set').length, 0);
});

test('push-enviar: envía solo el tipo (sin texto), borra dispositivos que ya no existen y cuenta lo enviado', async () => {
  const { handle } = await load();
  const dev = (n) => ({ endpoint: 'https://push.example/' + n, p256dh: 'k', auth: 'a' });
  const d = fakeDeps({ keys: { public: 'P', private: 'S' }, pending: [{ id: 1, kind: 'coach_msg', devices: [dev('ok'), dev('gone'), dev('boom')] }, { id: 2, kind: 'raro', devices: [dev('x')] }],
    sendStatus: (s) => (s.endpoint.endsWith('gone') ? 410 : s.endpoint.endsWith('boom') ? 500 : 201) });
  const r = await (await handle(req({ type: 'INSERT' }), d)).json();
  assert.deepStrictEqual(r, { sent: 1, gone: 1, failed: 1 });
  const sends = d.calls.filter((c) => c[0] === 'send');
  assert.strictEqual(sends.length, 3, 'un tipo desconocido no se envía');
  for (const s of sends) assert.deepStrictEqual(JSON.parse(s[2]), { kind: 'coach_msg' });
  assert.deepStrictEqual(d.calls.filter((c) => c[0] === 'push_gone').map((c) => c[1].p_endpoint), ['https://push.example/gone']);
});

test('push-enviar: solo POST (y responde el preflight del navegador)', async () => {
  const { handle } = await load();
  assert.strictEqual((await handle(req(null, 'GET'), fakeDeps())).status, 405);
  assert.strictEqual((await handle(new Request('http://x/', { method: 'OPTIONS' }), fakeDeps())).status, 204);
});
