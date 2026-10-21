// npm run smoke:remote — Comprobaciones INOFENSIVAS contra un proyecto Supabase real, sin iniciar sesión.
// No escribe nada ni crea usuarios: solo lee estados HTTP. Lo ejecuta el Stakeholder (o el equipo) cuando hay red.
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_KEY=sb_publishable_... npm run smoke:remote
//
// La URL y la clave se leen SOLO de variables de entorno (nunca del repo) y la clave no se imprime. Solo se acepta la
// clave PUBLICABLE (sb_publishable_…): si se pasa una secreta (sb_secret_… / service_role), el script se niega.
// Comprueba:
//   1. Auth responde (/auth/v1/health) y acepta la clave publicable; el inicio con correo está activado (settings).
//   2. Los esquemas `core` y `grasa` están expuestos en la API (si no, PostgREST da PGRST106) — contrato §10.8.2.
//   3. El rol anónimo NO puede ejecutar las RPC ni leer las tablas (401/403 con 42501) — contrato §10.7.
//   4. El bucket `grasa-photos` no es público (la URL pública no sirve archivos) — contrato §2.4.
'use strict';

const URL0 = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const KEY = String(process.env.SUPABASE_KEY || '').trim();
const TIMEOUT = 15000;

function usage(msg) {
  console.error(msg);
  console.error('Uso: SUPABASE_URL=https://<ref>.supabase.co SUPABASE_KEY=sb_publishable_... npm run smoke:remote');
  process.exit(2);
}
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(URL0)) usage('SUPABASE_URL no válida (formato https://<ref>.supabase.co).');
if (/^sb_secret_/.test(KEY) || /service_role/.test(KEY)) usage('Esa es una clave SECRETA: este script solo usa la clave publicable. No la compartas.');
if (!/^sb_publishable_/.test(KEY)) usage('SUPABASE_KEY debe ser la clave publicable (sb_publishable_...).');

let fails = 0;
const report = (ok, name, info = '') => { if (!ok) fails++; console.log(`${ok ? 'OK  ' : 'FALLA'} ${name}${info ? ' — ' + info : ''}`); };

async function req(path, { method = 'GET', headers = {}, body } = {}) {
  try {
    const res = await fetch(URL0 + path, {
      method, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT),
      headers: { apikey: KEY, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { json = null; }
    return { status: res.status, json };
  } catch (err) {
    return { status: 0, json: null, error: (err && (err.cause && err.cause.code)) || (err && err.name) || 'error de red' };
  }
}
const pgCode = (r) => (r.json && (r.json.code || r.json.error_code)) || '';
const denied = (r) => (r.status === 401 || r.status === 403) && !/^PGRST106$/.test(pgCode(r));

async function main() {
  console.log(`Proyecto: ${URL0} (clave publicable: ${KEY.slice(0, 15)}…)`);

  const health = await req('/auth/v1/health');
  if (health.status === 0) {
    report(false, 'Conexión con el proyecto', `sin red o bloqueada (${health.error}). No se puede comprobar nada más.`);
    process.exit(1);
  }
  report(health.status === 200, 'Auth: /auth/v1/health responde', `HTTP ${health.status}`);

  const settings = await req('/auth/v1/settings');
  report(settings.status === 200, 'Auth: la clave publicable es aceptada', `HTTP ${settings.status}`);
  if (settings.status === 200 && settings.json) {
    const email = settings.json.external && settings.json.external.email;
    report(email === true, 'Auth: inicio con correo (código) activado', `external.email = ${email}`);
  }

  // RPC como anónimo: esquema expuesto (≠ PGRST106) y ejecución denegada (42501).
  for (const [schema, fn, body] of [['grasa', 'sync_pull', {}], ['grasa', 'coach_clients', {}], ['core', 'my_roles', { p_app: 'grasa' }]]) {
    const r = await req(`/rest/v1/rpc/${fn}`, { method: 'POST', headers: { 'Content-Profile': schema }, body });
    if (pgCode(r) === 'PGRST106') report(false, `Esquema ${schema} expuesto en la API`, 'añádelo en Settings → API → Exposed schemas');
    else report(denied(r), `Anónimo no ejecuta ${schema}.${fn}`, `HTTP ${r.status} ${pgCode(r)}`);
  }

  // Tablas como anónimo: sin permiso de lectura.
  for (const [schema, table] of [['grasa', 'records'], ['grasa', 'coaches'], ['core', 'consent_events']]) {
    const r = await req(`/rest/v1/${table}?select=*&limit=1`, { headers: { 'Accept-Profile': schema } });
    if (pgCode(r) === 'PGRST106') report(false, `Esquema ${schema} expuesto en la API`, 'añádelo en Settings → API → Exposed schemas');
    else report(denied(r), `Anónimo no lee ${schema}.${table}`, `HTTP ${r.status} ${pgCode(r)}`);
  }

  // Storage: el bucket es privado (la URL pública no sirve nada).
  const pub = await req('/storage/v1/object/public/grasa-photos/smoke-inexistente.jpg');
  report(pub.status >= 400 && pub.status < 500, 'Storage: grasa-photos no es público', `HTTP ${pub.status}`);

  console.log(fails ? `\n${fails} comprobación(es) fallida(s).` : '\nTodo OK (comprobaciones sin sesión).');
  process.exit(fails ? 1 : 0);
}

main();
