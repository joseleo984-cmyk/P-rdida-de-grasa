// QA en vivo de las reglas de privacidad (RLS) contra un proyecto Supabase REAL de pruebas, con 3 cuentas reales.
// No contiene credenciales: todo se lee de variables de entorno y el script se niega a ejecutarse si falta algo.
//
//   NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/ruta/ca.crt \
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_KEY=sb_publishable_... \
//   QA_COACH_EMAIL=... QA_COACH_PW=... QA_A_EMAIL=... QA_A_PW=... QA_B_EMAIL=... QA_B_PW=... \
//   node scripts/qa-live-rls.js
//
// Solo clave PUBLICABLE (nunca sb_secret_/service_role). No imprime contraseñas, tokens ni el código de invitación.
// AL FINAL BORRA LA CUENTA DEL CLIENTE B (delete_my_account): hace falta volver a crearla para otra pasada.
'use strict';
const crypto = require('node:crypto');

const need = ['SUPABASE_URL', 'SUPABASE_KEY', 'QA_COACH_EMAIL', 'QA_COACH_PW', 'QA_A_EMAIL', 'QA_A_PW', 'QA_B_EMAIL', 'QA_B_PW'];
const miss = need.filter((k) => !String(process.env[k] || '').trim());
if (miss.length) { console.error('Faltan variables de entorno: ' + miss.join(', ')); process.exit(2); }
const URL0 = process.env.SUPABASE_URL.trim().replace(/\/+$/, '');
const KEY = process.env.SUPABASE_KEY.trim();
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(URL0)) { console.error('SUPABASE_URL no válida'); process.exit(2); }
if (!/^sb_publishable_/.test(KEY)) { console.error('SUPABASE_KEY debe ser la clave publicable (sb_publishable_...)'); process.exit(2); }
const E = process.env;
const ACC = { coach: [E.QA_COACH_EMAIL, E.QA_COACH_PW], A: [E.QA_A_EMAIL, E.QA_A_PW], B: [E.QA_B_EMAIL, E.QA_B_PW] };

let fails = 0, n = 0;
const rep = (ok, name, info = '') => { n++; if (!ok) fails++; console.log(`${ok ? 'OK   ' : 'FALLA'} ${name}${info ? ' — ' + info : ''}`); };
const sec = (t) => console.log(`\n== ${t}`);

async function api(method, path, { token, body, headers = {} } = {}) {
  try {
    const res = await fetch(URL0 + path, {
      method, signal: AbortSignal.timeout(15000), body: body === undefined ? undefined : JSON.stringify(body),
      headers: { apikey: KEY, ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    });
    const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { /* vacío */ }
    return { status: res.status, json };
  } catch (e) { return { status: 0, json: null, error: (e && e.cause && e.cause.code) || (e && e.name) || 'red' }; }
}
const rpc = (schema, fn, args, token) => api('POST', `/rest/v1/rpc/${fn}`, { token, body: args || {}, headers: { 'Content-Profile': schema } });
const sel = (schema, tbl, q, token) => api('GET', `/rest/v1/${tbl}?${q}`, { token, headers: { 'Accept-Profile': schema } });
const mut = (method, schema, tbl, q, body, token) => api(method, `/rest/v1/${tbl}${q ? '?' + q : ''}`,
  { token, body, headers: { 'Content-Profile': schema, Accept: 'application/json', Prefer: 'return=representation' } });
const ok2 = (r) => r.status >= 200 && r.status < 300;
const errTxt = (r) => r.error ? `red:${r.error}` : `HTTP ${r.status} ${(r.json && (r.json.code || r.json.error_code)) || ''} ${(r.json && (r.json.message || r.json.msg || r.json.error_description)) || ''}`.trim();
const rows = (r) => (ok2(r) && Array.isArray(r.json) ? r.json : []);
// "denegado": error HTTP o 0 filas afectadas/visibles
const blocked = (r) => !ok2(r) || (Array.isArray(r.json) && r.json.length === 0);

async function login(who) {
  const r = await api('POST', '/auth/v1/token?grant_type=password', { body: { email: ACC[who][0], password: ACC[who][1] } });
  if (!ok2(r) || !r.json || !r.json.access_token) return { err: errTxt(r) };
  return { token: r.json.access_token, id: r.json.user && r.json.user.id };
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const SH = { version: 'qa-1', text_hash: sha('qa-live texto compartir') };
const consent = (uid, kind, granted, coach) => ({ user_id: uid, app_id: 'grasa', kind, granted, version: 'qa-1', text_hash: sha('qa ' + kind), coach_id: coach || null, client_at: new Date().toISOString() });
const NOTE = 'NOTA-PRIVADA-QA-' + crypto.randomBytes(3).toString('hex');
const day = new Date().toISOString().slice(0, 10);
const mkRec = (kind, nkey, date, data) => ({ id: crypto.randomUUID(), kind, nkey, date, data, updated_at: new Date().toISOString(), deleted_at: null });
const flat = (j) => JSON.stringify(j || {});
const kinds = (pull) => [...new Set(((pull && pull.records) || []).map((x) => x.kind))].sort().join(',');

async function gAuth(tk) {
  let r;
  // ---------- g) Errores reales de Auth ----------
  sec('g) Errores reales de Auth (HTTP / error_code / mensaje)');
  const authErr = async (label, p) => {
    const x = await p;
    const j = x.json || {};
    console.log(`AUTH  ${label}: HTTP ${x.status} | error_code=${j.error_code || j.code || '-'} | msg=${j.msg || j.message || j.error_description || j.error || '-'}`);
  };
  await authErr('contraseña incorrecta', api('POST', '/auth/v1/token?grant_type=password', { body: { email: ACC.A[0], password: 'Incorrecta-qa-123' } }));
  await authErr('correo inexistente', api('POST', '/auth/v1/token?grant_type=password', { body: { email: `qa-no-existe-${crypto.randomBytes(4).toString('hex')}@example.com`, password: 'Incorrecta-qa-123' } }));
  await authErr('correo mal formado', api('POST', '/auth/v1/token?grant_type=password', { body: { email: 'no-es-correo', password: 'x' } }));
  await authErr('GET /auth/v1/user con token mal formado', api('GET', '/auth/v1/user', { token: 'abc.def' }));
  await authErr('refresh_token inexistente', api('POST', '/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: 'qa-token-falso' } }));
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const fakeExpired = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: crypto.randomUUID(), role: 'authenticated', exp: 1600000000 })}.${b64('firma-falsa')}`;
  await authErr('GET /auth/v1/user con JWT caducado/firma falsa', api('GET', '/auth/v1/user', { token: fakeExpired }));
  const rawErr = async (label, p) => { const x = await p; const j = x.json || {}; console.log(`REST  ${label}: HTTP ${x.status} | code=${j.code || '-'} | message=${j.message || '-'} | hint=${j.hint ? 'sí' : '-'}`); };
  await rawErr('rpc con token mal formado', rpc('core', 'my_roles', { p_app: 'grasa' }, 'abc.def'));
  await rawErr('rpc con JWT caducado/firma falsa', rpc('core', 'my_roles', { p_app: 'grasa' }, fakeExpired));
  await rawErr('rpc sin sesión (solo apikey)', rpc('core', 'my_roles', { p_app: 'grasa' }, undefined));
  await rawErr('tabla sin sesión (solo apikey)', sel('grasa', 'records', 'select=id', undefined));
  r = await rpc('grasa', 'coach_pull', { p_client: crypto.randomUUID(), p_since: '1970-01-01T00:00:00Z' }, tk);
  console.log(`REST  coach_pull sin ser coach: HTTP ${r.status} | code=${r.json && r.json.code} | message=${r.json && r.json.message}`);
  r = await rpc('grasa', 'sync_push', { p_records: [{ id: 'no-uuid', kind: 'entry', nkey: 'x', data: {}, updated_at: 'ayer' }], p_photos: [] }, tk);
  console.log(`REST  sync_push con datos inválidos: HTTP ${r.status} | code=${r.json && r.json.code} | message=${r.json && r.json.message}`);

}

async function main() {
  console.log(`Proyecto ${URL0} · ${new Date().toISOString()}`);

  // ---------- a) Preparación ----------
  sec('a) Preparación');
  const S = {};
  for (const who of ['coach', 'A', 'B']) {
    S[who] = await login(who);
    rep(!!S[who].token && !!S[who].id, `login ${who}`, S[who].err || '');
  }
  if (!S.coach.token || !S.A.token) {
    console.log('\nNo se puede continuar sin coach y cliente A: se omiten a-f y h (no se toca la cuenta B). Solo se ejecuta g) si hay coach.');
    if (S.coach.token) await gAuth(S.coach.token);
    process.exit(1);
  }
  const bOk = !!S.B.token;
  const { coach, A, B } = S;
  let r = await rpc('core', 'join_app', { p_app: 'grasa' }, A.token);
  rep(ok2(r), 'A join_app', ok2(r) ? '' : errTxt(r));
  if (bOk) { r = await rpc('core', 'join_app', { p_app: 'grasa' }, B.token); rep(ok2(r), 'B join_app', ok2(r) ? '' : errTxt(r)); }
  // ---------- a2) Sprint 7: el SERVIDOR exige los consentimientos (no solo la app) ----------
  // Los consent_events no se pueden borrar: para que el script se repita, primero se RETIRAN (granted=false) y se comprueba
  // el bloqueo; después se otorgan (mismo método que ya usamos: INSERT directo en core.consent_events con la sesión de cada cuenta).
  sec('a2) El servidor exige A7 (coach) y A3 + A4 (cliente)');
  const grant = async (who, kinds_, granted) => {
    const x = await mut('POST', 'core', 'consent_events', '', kinds_.map((k) => consent(who.id, k, granted)), who.token);
    return x;
  };
  const isErr = (x, msg) => !ok2(x) && x.status === 403 && x.json && x.json.code === '42501' && x.json.message === msg;
  r = await grant(coach, ['coach_agreement'], false);
  rep(ok2(r), 'coach registra coach_agreement retirado (granted=false)', ok2(r) ? '' : errTxt(r));
  r = await rpc('grasa', 'become_coach', { p_business_name: 'QA Coach Pruebas' }, coach.token);
  rep(isErr(r, 'forbidden'), 'become_coach sin acuerdo vigente: 403 / 42501 forbidden', errTxt(r));
  r = await rpc('grasa', 'coach_clients', {}, coach.token);
  rep(isErr(r, 'forbidden'), 'coach_clients sin acuerdo vigente: 403 / 42501 forbidden', errTxt(r));
  r = await grant(A, ['sensitive_health', 'cloud_transfer'], false);
  rep(ok2(r), 'A registra sensitive_health y cloud_transfer retirados', ok2(r) ? '' : errTxt(r));
  r = await rpc('grasa', 'sync_push', { p_records: [mkRec('entry', day, day, { weight: 1 })], p_photos: [] }, A.token);
  rep(isErr(r, 'consent_required'), 'A sync_push sin A3+A4 vigentes: 403 / 42501 consent_required', errTxt(r));
  r = await rpc('grasa', 'sync_pull', { p_since: '1970-01-01T00:00:00Z', p_limit: 10 }, A.token);
  rep(isErr(r, 'consent_required'), 'A sync_pull sin A3+A4 vigentes: 403 / 42501 consent_required', errTxt(r));
  r = await rpc('grasa', 'join_coach', { p_code: 'AAAAAA', p_shares: { body: true, ...SH } }, A.token);
  rep(isErr(r, 'consent_required'), 'A join_coach sin A3+A4 vigentes: 403 / 42501 consent_required', errTxt(r));
  r = await grant(coach, ['coach_agreement'], true);
  rep(ok2(r), 'coach acepta el acuerdo (coach_agreement granted=true)', ok2(r) ? '' : errTxt(r));
  r = await grant(A, ['sensitive_health', 'cloud_transfer'], true);
  rep(ok2(r), 'A acepta sensitive_health y cloud_transfer', ok2(r) ? '' : errTxt(r));
  if (bOk) { r = await grant(B, ['sensitive_health', 'cloud_transfer'], true); rep(ok2(r), 'B acepta sensitive_health y cloud_transfer', ok2(r) ? '' : errTxt(r)); }
  r = await rpc('grasa', 'become_coach', { p_business_name: 'QA Coach Pruebas' }, coach.token);
  const code = rows(r)[0] && rows(r)[0].invite_code;
  rep(ok2(r) && /^[A-Z2-9]{6}$/.test(code || ''), 'coach become_coach devuelve código de 6 símbolos (no se imprime)', ok2(r) ? '' : errTxt(r));
  r = await rpc('core', 'my_roles', { p_app: 'grasa' }, coach.token);
  rep(flat(r.json).includes('coach'), 'coach my_roles incluye coach');
  r = await rpc('core', 'my_roles', { p_app: 'grasa' }, A.token);
  rep(flat(r.json).includes('client'), 'A my_roles incluye client');
  r = await mut('POST', 'core', 'consent_events', '', [consent(A.id, 'sensitive_health', true), consent(A.id, 'share_body', true, coach.id)], A.token);
  rep(ok2(r), 'A inserta consent_events (sensitive_health, share_body)', ok2(r) ? '' : errTxt(r));
  r = await rpc('grasa', 'join_coach', { p_code: code, p_shares: { body: true, notes: false, nutrition: false, habits: false, photos: false, ...SH } }, A.token);
  rep(ok2(r) && r.json && r.json.status === 'active' && r.json.share_body === true && !r.json.share_nutrition && !r.json.share_habits && !r.json.share_notes,
    'A join_coach con SOLO peso/medidas (vínculo activo; comidas/hábitos/notas = false)', ok2(r) ? '' : errTxt(r));
  r = await rpc('core', 'my_consents', { p_app: 'grasa' }, A.token);
  rep(ok2(r) && flat(r.json).includes('sensitive_health'), 'A my_consents devuelve sensitive_health (los share_* no se listan por diseño)');

  // ---------- b) Cliente A empuja y recupera; B no ve nada ----------
  sec('b) Aislamiento entre clientes');
  const eKey = day;
  const foodRec = mkRec('food', 'x', day, { name: 'Comida QA', kcal: 500 }); foodRec.nkey = foodRec.id;
  const recs = [
    mkRec('profile', 'profile', null, { name: 'QA A', height: 170 }),
    mkRec('entry', eKey, day, { weight: 80.5, waist: 90, note: NOTE }),
    foodRec,
    mkRec('habit', day, day, { water: true }),
    mkRec('library', 'alimento qa', null, { name: 'Alimento QA', kcal: 100 }),
  ];
  r = await rpc('grasa', 'sync_push', { p_records: recs, p_photos: [] }, A.token);
  rep(ok2(r) && r.json && Array.isArray(r.json.rejected ? r.json.rejected.records || r.json.rejected : []), 'A sync_push (profile, entry con note, food con note, habit, library)', ok2(r) ? '' : errTxt(r));
  r = await rpc('grasa', 'sync_pull', { p_since: '1970-01-01T00:00:00Z', p_limit: 1000, p_overlap: true }, A.token);
  const aPull = r.json || {};
  rep(ok2(r) && (aPull.records || []).length >= 5 && flat(aPull).includes(NOTE), 'A sync_pull recupera sus 5 registros (incluida la note privada)', ok2(r) ? kinds(aPull) : errTxt(r));
  const aIds = (aPull.records || []).map((x) => x.id);
  let bRec = null;
  if (bOk) {
    r = await rpc('grasa', 'sync_push', { p_records: [mkRec('entry', day, day, { weight: 60 })], p_photos: [] }, B.token);
    rep(ok2(r), 'B sync_push de su propio peso', ok2(r) ? '' : errTxt(r));
    r = await rpc('grasa', 'sync_pull', { p_since: '1970-01-01T00:00:00Z', p_limit: 1000 }, B.token);
    bRec = r.json || {};
    rep(ok2(r) && (bRec.records || []).length === 1 && !flat(bRec).includes(NOTE), 'B sync_pull ve solo lo suyo (1 registro), nada de A');
    r = await sel('grasa', 'records', `user_id=eq.${A.id}&select=id`, B.token);
    rep(ok2(r) && rows(r).length === 0, 'B lee grasa.records con user_id de A: 0 filas', ok2(r) ? '' : errTxt(r));
    r = await sel('grasa', 'records', `id=in.(${aIds.join(',')})&select=id`, B.token);
    rep(ok2(r) && rows(r).length === 0, 'B lee grasa.records por ids de A adivinados: 0 filas', ok2(r) ? '' : errTxt(r));
    r = await sel('grasa', 'records', 'select=id,user_id', B.token);
    rep(ok2(r) && rows(r).every((x) => x.user_id === B.id), 'B lista grasa.records sin filtro: solo filas propias');
    r = await sel('grasa', 'coach_links', `client_id=eq.${A.id}&select=id`, B.token);
    rep(ok2(r) && rows(r).length === 0, 'B no ve coach_links de A');
    r = await sel('core', 'consent_events', `user_id=eq.${A.id}&select=id`, B.token);
    rep(ok2(r) && rows(r).length === 0, 'B no ve consent_events de A');
    r = await sel('core', 'profiles', `id=eq.${A.id}&select=id`, B.token);
    rep(ok2(r) && rows(r).length === 0, 'B no ve core.profiles de A');
    r = await rpc('grasa', 'coach_pull', { p_client: A.id, p_since: '1970-01-01T00:00:00Z' }, B.token);
    rep(!ok2(r), 'B coach_pull(A) rechazado', errTxt(r));
    r = await mut('POST', 'grasa', 'records', '', { ...mkRec('entry', '2020-01-01', '2020-01-01', { weight: 1 }), user_id: A.id }, B.token);
    rep(!ok2(r), 'B inserta fila directa con user_id de A: rechazado', errTxt(r));
    // A intenta tocar datos de B
    r = await mut('POST', 'grasa', 'records', '', { ...mkRec('entry', '2020-01-02', '2020-01-02', { weight: 1 }), user_id: B.id }, A.token);
    rep(!ok2(r), 'A inserta fila directa con user_id de B: rechazado', errTxt(r));
    r = await mut('PATCH', 'grasa', 'records', `user_id=eq.${B.id}`, { data: { weight: 999 } }, A.token);
    rep(blocked(r), 'A PATCH sobre registros de B: 0 filas/denegado', errTxt(r));
    r = await mut('DELETE', 'grasa', 'records', `user_id=eq.${B.id}`, undefined, A.token);
    rep(blocked(r), 'A DELETE sobre registros de B: 0 filas/denegado', errTxt(r));
    r = await rpc('grasa', 'sync_pull', { p_since: '1970-01-01T00:00:00Z', p_limit: 1000 }, B.token);
    rep(ok2(r) && (r.json.records || []).length === 1 && flat(r.json.records).includes('"weight":60'), 'Los datos de B siguen intactos tras los ataques de A');
  } else rep(false, 'B no pudo iniciar sesión: pruebas de aislamiento con B NO ejecutadas', S.B.err);
  r = await mut('DELETE', 'grasa', 'records', `user_id=eq.${A.id}`, undefined, A.token);
  rep(blocked(r), 'A no puede hacer DELETE físico ni de lo suyo (solo lápida)', errTxt(r));
  r = await mut('PATCH', 'grasa', 'records', `user_id=eq.${A.id}&kind=eq.entry`, { user_id: B && B.id ? B.id : crypto.randomUUID() }, A.token);
  rep(blocked(r) || rows(r).every((x) => x.user_id === A.id), 'A no puede cambiar el dueño (user_id) de su fila: denegado o el trigger lo conserva', errTxt(r));

  // ---------- c) Coach ----------
  sec('c) Coach: solo lo consentido');
  r = await rpc('grasa', 'coach_clients', {}, coach.token);
  const cl = rows(r).filter((x) => x.client_id === A.id);
  rep(ok2(r) && cl.length === 1 && (!bOk || !rows(r).some((x) => x.client_id === B.id)), 'coach_clients lista a A (y no a B)', ok2(r) ? '' : errTxt(r));
  r = await rpc('grasa', 'coach_pull', { p_client: A.id, p_since: '1970-01-01T00:00:00Z' }, coach.token);
  let cp = r.json || {};
  rep(ok2(r) && kinds(cp) === 'entry,profile', 'coach_pull(A) devuelve solo profile+entry (sin food/habit/library)', ok2(r) ? kinds(cp) : errTxt(r));
  rep(ok2(r) && !flat(cp).includes(NOTE) && !flat(cp).includes('"note"'), 'coach_pull(A) NO contiene note');
  rep(ok2(r) && !flat(cp).includes('Alimento QA') && !flat(cp).includes('Comida QA'), 'coach_pull(A) no contiene biblioteca ni comidas');
  if (bOk) {
    r = await rpc('grasa', 'coach_pull', { p_client: B.id, p_since: '1970-01-01T00:00:00Z' }, coach.token);
    rep(!ok2(r), 'coach_pull(B) (sin vínculo) rechazado', errTxt(r));
  }
  r = await sel('grasa', 'records', `user_id=eq.${A.id}&select=id`, coach.token);
  rep(ok2(r) && rows(r).length === 0, 'coach lee grasa.records de A directo: 0 filas', ok2(r) ? '' : errTxt(r));
  r = await mut('POST', 'grasa', 'records', '', { ...mkRec('entry', '2020-01-03', '2020-01-03', { weight: 1 }), user_id: A.id }, coach.token);
  rep(!ok2(r), 'coach INSERT en records de A: rechazado', errTxt(r));
  r = await mut('PATCH', 'grasa', 'records', `user_id=eq.${A.id}`, { data: { weight: 1 } }, coach.token);
  rep(blocked(r), 'coach PATCH en records de A: 0 filas/denegado', errTxt(r));
  r = await mut('DELETE', 'grasa', 'records', `user_id=eq.${A.id}`, undefined, coach.token);
  rep(blocked(r), 'coach DELETE en records de A: 0 filas/denegado', errTxt(r));
  r = await rpc('grasa', 'sync_pull', { p_since: '1970-01-01T00:00:00Z', p_limit: 1000 }, A.token);
  rep(ok2(r) && (r.json.records || []).length >= 5 && flat(r.json).includes('"weight":80.5'), 'Los datos de A siguen intactos tras los ataques del coach');
  r = await sel('core', 'consent_events', `user_id=eq.${A.id}&select=id`, coach.token);
  rep(ok2(r) && rows(r).length === 0, 'coach no lee consent_events de A');
  r = await sel('grasa', 'coach_links', `select=client_id,share_notes,share_nutrition`, coach.token);
  rep(ok2(r) && rows(r).length >= 1 && rows(r).every((x) => x.client_id === A.id), 'coach solo ve vínculos propios');

  // categorías dinámicas: nutrición sí, notas no -> food sin note
  r = await rpc('grasa', 'update_shares', { p_shares: { body: true, notes: false, nutrition: true, habits: false, photos: false, ...SH } }, A.token);
  rep(ok2(r), 'A update_shares: concede comidas', ok2(r) ? '' : errTxt(r));
  r = await rpc('grasa', 'coach_pull', { p_client: A.id, p_since: '1970-01-01T00:00:00Z' }, coach.token);
  cp = r.json || {};
  rep(ok2(r) && kinds(cp) === 'entry,food,profile' && !flat(cp).includes(NOTE) && flat(cp).includes('Comida QA'), 'con nutrición concedida: coach ve food, sigue sin note ni hábitos ni biblioteca', kinds(cp));
  r = await rpc('grasa', 'update_shares', { p_shares: { body: true, notes: true, nutrition: true, habits: false, photos: false, ...SH } }, A.token);
  r = await rpc('grasa', 'coach_pull', { p_client: A.id, p_since: '1970-01-01T00:00:00Z' }, coach.token);
  rep(ok2(r) && flat(r.json).includes(NOTE) && !flat(r.json).includes('Alimento QA') && kinds(r.json) === 'entry,food,profile', 'control positivo: con notas concedidas la note SÍ aparece, biblioteca NUNCA', kinds(r.json));

  // ---------- d) Revocación ----------
  sec('d) Revocación');
  r = await rpc('grasa', 'update_shares', { p_shares: { body: true, notes: false, nutrition: false, habits: false, photos: false, ...SH } }, A.token);
  rep(ok2(r), 'A retira comidas y notas (update_shares)', ok2(r) ? '' : errTxt(r));
  r = await rpc('grasa', 'coach_pull', { p_client: A.id, p_since: '1970-01-01T00:00:00Z' }, coach.token);
  rep(ok2(r) && kinds(r.json) === 'entry,profile' && !flat(r.json).includes(NOTE), 'coach pierde comidas y notas en la siguiente consulta', kinds(r.json));
  r = await rpc('grasa', 'leave_coach', {}, A.token);
  rep(ok2(r), 'A leave_coach (termina el vínculo)', ok2(r) ? '' : errTxt(r));
  r = await rpc('grasa', 'coach_pull', { p_client: A.id, p_since: '1970-01-01T00:00:00Z' }, coach.token);
  rep(!ok2(r) && /forbidden|42501/.test(flat(r.json)), 'coach_pull(A) tras terminar vínculo: forbidden', errTxt(r));
  r = await rpc('grasa', 'coach_clients', {}, coach.token);
  rep(ok2(r) && !rows(r).some((x) => x.client_id === A.id), 'coach_clients ya no lista a A');
  r = await rpc('grasa', 'add_comment', { p_id: crypto.randomUUID(), p_client: A.id, p_ref_date: null, p_body: 'hola' }, coach.token);
  rep(!ok2(r), 'coach add_comment a A sin vínculo: rechazado', errTxt(r));

  // ---------- e) consent_events inmutable ----------
  sec('e) consent_events solo-inserción');
  const before = rows(await sel('core', 'consent_events', 'select=id', A.token)).length;
  r = await mut('PATCH', 'core', 'consent_events', `user_id=eq.${A.id}`, { granted: false }, A.token);
  rep(blocked(r), 'UPDATE en consent_events rechazado', errTxt(r));
  r = await mut('DELETE', 'core', 'consent_events', `user_id=eq.${A.id}`, undefined, A.token);
  rep(blocked(r), 'DELETE en consent_events rechazado', errTxt(r));
  const after = rows(await sel('core', 'consent_events', 'select=id,granted', A.token));
  rep(after.length === before && before > 0 && after.every((x) => x.granted !== undefined), `consent_events intacto (${before} -> ${after.length} filas)`);
  r = await mut('POST', 'core', 'consent_events', '', consent(A.id, 'share_nutrition', false, coach.id), A.token);
  rep(ok2(r), 'insertar OK (retirada de share_nutrition)', ok2(r) ? '' : errTxt(r));
  r = await mut('POST', 'core', 'consent_events', '', consent(coach.id, 'adult', true), A.token);
  rep(!ok2(r), 'A no puede insertar consentimientos a nombre de otro user_id', errTxt(r));

  // ---------- f) Códigos de invitación ----------
  sec('f) Código inválido y código de un coach sin acuerdo (máx. 5 intentos en total con el válido de antes)');
  r = await grant(coach, ['coach_agreement'], false);
  rep(ok2(r), 'coach retira el acuerdo (granted=false)', ok2(r) ? '' : errTxt(r));
  r = await rpc('grasa', 'preview_invite_code', { p_code: code }, A.token);
  rep(ok2(r) && Array.isArray(r.json) && r.json.length === 0, 'el código de un coach SIN acuerdo no sirve: vista previa vacía (cuenta como intento)', errTxt(r));
  r = await rpc('grasa', 'join_coach', { p_code: code, p_shares: { body: true, ...SH } }, A.token);
  rep(ok2(r) && (r.json === null || r.json.id === null), 'el código de un coach SIN acuerdo no sirve: join_coach devuelve null (cuenta como intento)', `HTTP ${r.status} cuerpo=${flat(r.json)}`);
  r = await rpc('grasa', 'coach_pull', { p_client: A.id, p_since: '1970-01-01T00:00:00Z' }, coach.token);
  rep(isErr(r, 'forbidden'), 'coach sin acuerdo: coach_pull 403 forbidden', errTxt(r));
  r = await rpc('grasa', 'add_comment', { p_id: crypto.randomUUID(), p_client: A.id, p_ref_date: null, p_body: 'hola' }, coach.token);
  rep(isErr(r, 'forbidden'), 'coach sin acuerdo: add_comment 403 forbidden', errTxt(r));
  r = await grant(coach, ['coach_agreement'], true);
  rep(ok2(r), 'coach vuelve a aceptar el acuerdo', ok2(r) ? '' : errTxt(r));
  r = await rpc('grasa', 'preview_invite_code', { p_code: 'AAAAAA' }, A.token);
  rep(ok2(r) && Array.isArray(r.json) && r.json.length === 0, 'preview_invite_code inválido -> 0 filas (cuenta como intento)', errTxt(r));
  r = await rpc('grasa', 'join_coach', { p_code: 'AAAAAA', p_shares: { body: true, ...SH } }, A.token);
  rep(ok2(r) && (r.json === null || r.json.id === null), 'join_coach con código inválido -> null/fila vacía, sin vínculo (cuenta como intento)', `HTTP ${r.status} cuerpo=${flat(r.json)}`);
  r = await rpc('grasa', 'my_link', {}, A.token);
  rep(ok2(r) && rows(r).length === 0, 'A sigue sin vínculo tras el código inválido');
  console.log('INFO  El contador invite_attempts no es legible por RLS: que cuente cada intento no se puede observar directamente; 3 intentos < 20/h, no se disparó rate_limited.');

  await gAuth(A.token);

  // ---------- h) Baja de B ----------
  sec('h) delete_my_account con el cliente B');
  if (bOk && fails > 0) console.log('INFO  Hay FALLAs en a-g: NO se borra B (para poder repetir). Corrige y repite.');
  else if (bOk) {
    r = await rpc('core', 'delete_my_account', {}, B.token);
    rep(ok2(r), 'B delete_my_account', ok2(r) ? '' : errTxt(r));
    const l2 = await login('B');
    rep(!l2.token, 'B ya no puede iniciar sesión (cuenta borrada)', l2.err || 'ATENCIÓN: sigue entrando');
    r = await rpc('core', 'my_roles', { p_app: 'grasa' }, B.token);
    console.log(`INFO  token antiguo de B tras la baja en my_roles: ${errTxt(r)} ${ok2(r) ? flat(r.json) : ''}`);
    r = await rpc('grasa', 'sync_pull', { p_since: '1970-01-01T00:00:00Z', p_limit: 1000 }, B.token);
    console.log(`INFO  token antiguo de B tras la baja en sync_pull: ${errTxt(r)} registros=${ok2(r) ? (r.json.records || []).length : '-'}`);
    r = await sel('grasa', 'records', `user_id=eq.${B.id}&select=id`, A.token);
    rep(ok2(r) && rows(r).length === 0, 'No quedan registros de B visibles (A no ve nada; verificación completa de huérfanos requiere SQL como Stakeholder)');
  } else rep(false, 'B no existía/no pudo iniciar sesión: delete_my_account NO ejecutado', S.B.err);

  console.log(`\nResumen: ${n - fails}/${n} OK, ${fails} FALLA`);
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error('Error inesperado:', e && e.message); process.exit(1); });
