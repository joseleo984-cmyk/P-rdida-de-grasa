// Avisos push (R1 v1.19). Lógica pura de la función de borde `push-enviar`: se prueba con node --test (tests/push-funcion.test.js).
//   · { accion: 'clave' }  → devuelve la clave PÚBLICA para suscribirse (la crea la primera vez; la privada nunca sale de la base).
//   · cualquier otro POST (lo llama un Database Webhook al insertarse en grasa.push_outbox) → reclama lo pendiente y lo envía.
// El contenido del aviso NO viaja: solo `kind`. La app fija las frases (neutrales, sin datos de salud) en el service worker.
export const SUBJECT = 'mailto:cuentademomisapps@gmail.com';
export const KINDS = ['coach_msg', 'routine', 'client_alert', 'reminder'];
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// deps: { admin: { rpc(fn, args) → { data, error } }, generateKeys() → { publicKey, privateKey }, send(sub, payload, vapid) → { status } }
export async function ensureKeys(deps) {
  const got = await deps.admin.rpc('push_keys_get');
  if (got.error) throw new Error('keys_get');
  if (got.data && got.data.public && got.data.private) return got.data;
  const k = await deps.generateKeys();
  const set = await deps.admin.rpc('push_keys_set', { p_public: k.publicKey, p_private: k.privateKey });
  if (set.error || !set.data) throw new Error('keys_set');
  return set.data;   // si otra llamada ganó la carrera, devuelve la que quedó guardada
}

export async function sendPending(deps, keys) {
  const taken = await deps.admin.rpc('push_take', { p_limit: 50 });
  if (taken.error) throw new Error('take');
  const out = { sent: 0, gone: 0, failed: 0 };
  for (const item of taken.data || []) {
    if (!KINDS.includes(item.kind)) continue;
    for (const d of item.devices || []) {
      let status = 0;
      try { status = (await deps.send({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, JSON.stringify({ kind: item.kind }), { subject: SUBJECT, publicKey: keys.public, privateKey: keys.private })).status; }
      catch (e) { status = Number(e && e.statusCode) || 0; }
      if (status >= 200 && status < 300) out.sent++;
      else if (status === 404 || status === 410) { out.gone++; await deps.admin.rpc('push_gone', { p_endpoint: d.endpoint }); }
      else out.failed++;
    }
  }
  return out;
}

export async function handle(req, deps) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method' });
  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  try {
    const keys = await ensureKeys(deps);
    if (body && body.accion === 'clave') return json(200, { publicKey: keys.public });
    return json(200, await sendPending(deps, keys));
  } catch (e) { return json(500, { error: String(e && e.message || 'error') }); }
}
