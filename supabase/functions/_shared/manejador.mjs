// Sprint 10: el «manejador» de la función `acuerdo-coach-copia`, con todo lo externo INYECTADO (env, fetch, clientes de
// Supabase, reloj). index.ts lo conecta a Deno; las pruebas (tests/acuerdo-coach-copia.test.js) lo usan con dobles.
// Respuestas: JSON { ok: true } o { ok: false, error: '<código>' } — nunca el contenido del correo ni datos personales.
import { APP, grantedAgreement, verifyAgreement, decideRate, undoRate, buildEmail, isEmail, RATE_KEY } from './acuerdo.mjs';

export const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const CORS = {
  'Access-Control-Allow-Origin': '*', // la autorización va en el JWT (cabecera), no en cookies
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status, body, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json', ...extra } });
const err = (status, error, extra) => json(status, { ok: false, error }, extra);
// Solo códigos y estados en los logs: jamás el correo, el texto ni lo que responde Brevo.
const log = (deps, ...a) => { try { (deps.log || console.error)('acuerdo-coach-copia:', ...a); } catch { /* nada */ } };

// Sin base de datos nueva: la cuenta recuerda cuándo se envió (app_metadata, que solo el servidor puede escribir). Si la función no
// tiene la llave de servicio, queda un límite en memoria (menos fiable, pero sigue frenando el abuso).
const memory = new Map();
async function readMeta(deps, userId) {
  const admin = deps.getAdminClient && deps.getAdminClient();
  if (!admin) return { admin: null, meta: memory.get(userId) || {} };
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data || !data.user) throw new Error('admin_read');
  return { admin, meta: data.user.app_metadata || {} };
}
async function writeMeta(deps, admin, userId, meta) {
  if (!admin) { memory.set(userId, meta); return; }
  const { error } = await admin.auth.admin.updateUserById(userId, { app_metadata: meta });
  if (error) throw new Error('admin_write');
}

export async function handle(req, deps) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return err(405, 'method_not_allowed');
  // El cuerpo de la petición se IGNORA a propósito: ni el correo, ni el texto, ni la versión salen del cliente.

  const apiKey = deps.env('BREVO_API_KEY');
  const senderEmail = deps.env('BREVO_SENDER_EMAIL');
  const senderName = deps.env('BREVO_SENDER_NAME') || '';
  if (!apiKey || !isEmail(senderEmail || '')) { log(deps, 'not_configured'); return err(503, 'not_configured'); }

  const auth = req.headers.get('authorization') || '';
  const token = (auth.match(/^Bearer\s+(.+)$/i) || [])[1];
  if (!token) return err(401, 'unauthorized');
  const userClient = deps.getUserClient(auth, req.headers.get('apikey') || '');

  const { data: ud, error: ue } = await userClient.auth.getUser(token);
  const user = ud && ud.user;
  if (ue || !user || !user.id || !isEmail(user.email || '')) return err(401, 'unauthorized'); // el correo viene del JWT validado

  // El ÚLTIMO evento del acuerdo, leído con la sesión de la propia persona (core.my_consents solo ve sus eventos).
  const { data: rows, error: ce } = await userClient.schema('core').rpc('my_consents', { p_app: deps.app || APP });
  if (ce) { log(deps, 'consents_error'); return err(502, 'consents_unavailable'); }
  const ev = grantedAgreement(rows);
  if (!ev) return err(403, 'agreement_not_granted');

  const v = await verifyAgreement(ev, deps.verifyOpts);
  if (!v.ok) { log(deps, v.code, ev.version); return err(409, v.code); } // no se envía nada que no coincida con la huella registrada

  let admin, meta;
  try { ({ admin, meta } = await readMeta(deps, user.id)); } catch { log(deps, 'rate_state_error'); return err(502, 'rate_state_unavailable'); }
  const now = (deps.now || Date.now)();
  const rate = decideRate(meta, ev.version, now);
  if (!rate.allowed) return err(429, 'rate_limited', { 'Retry-After': String(rate.retryAfterSec) });
  const before = (meta[RATE_KEY] || {})[ev.version];
  try { await writeMeta(deps, admin, user.id, rate.next); } catch { log(deps, 'rate_state_error'); return err(502, 'rate_state_unavailable'); }

  const payload = buildEmail({ to: user.email, text: v.text, version: ev.version, textHash: ev.textHash, clientAt: ev.clientAt, sender: { email: senderEmail, name: senderName } });
  let res;
  try {
    res = await deps.fetch(BREVO_URL, {
      method: 'POST',
      headers: { 'api-key': apiKey, accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined,
    });
  } catch { res = null; }
  if (!res || !res.ok) {
    log(deps, 'brevo_failed', res ? res.status : 'sin_respuesta');
    try { await writeMeta(deps, admin, user.id, undoRate(rate.next, ev.version, before)); } catch { /* el límite se libera solo en una hora */ }
    return err(502, 'send_failed');
  }
  log(deps, 'sent', ev.version);
  return json(200, { ok: true, version: ev.version });
}
