// Re-verificación barata en vivo (sin cliente B): H6 (note en los 4 kinds), mapeos H2/H3 de remote.js con respuestas reales
// y regresión coach<->A. Solo variables de entorno (SUPABASE_URL, SUPABASE_KEY publicable, QA_COACH_EMAIL/PW, QA_A_EMAIL/PW).
// No imprime contraseñas, tokens ni el código de invitación. Termina dejando a A sin vínculo.
'use strict';
const crypto = require('node:crypto');
const Remote = require('../remote.js');
const need = ['SUPABASE_URL', 'SUPABASE_KEY', 'QA_COACH_EMAIL', 'QA_COACH_PW', 'QA_A_EMAIL', 'QA_A_PW'];
const miss = need.filter((k) => !String(process.env[k] || '').trim());
if (miss.length) { console.error('Faltan variables de entorno: ' + miss.join(', ')); process.exit(2); }
const E = process.env, URL0 = E.SUPABASE_URL.trim().replace(/\/+$/, ''), KEY = E.SUPABASE_KEY.trim();
if (!/^sb_publishable_/.test(KEY)) { console.error('Solo clave publicable'); process.exit(2); }
let fails = 0, n = 0;
const rep = (ok, name, info = '') => { n++; if (!ok) fails++; console.log(`${ok ? 'OK   ' : 'FALLA'} ${name}${info ? ' — ' + info : ''}`); };
async function api(method, path, { token, body, headers = {} } = {}) {
  try {
    const res = await fetch(URL0 + path, { method, signal: AbortSignal.timeout(15000), body: body === undefined ? undefined : JSON.stringify(body),
      headers: { apikey: KEY, ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers } });
    const t = await res.text(); let json = null; try { json = JSON.parse(t); } catch { /* */ }
    return { status: res.status, json };
  } catch (e) { return { status: 0, json: null, error: e.name }; }
}
const rpc = (schema, fn, args, token) => api('POST', `/rest/v1/rpc/${fn}`, { token, body: args || {}, headers: { 'Content-Profile': schema } });
const ok2 = (r) => r.status >= 200 && r.status < 300;
const login = async (em, pw) => { const r = await api('POST', '/auth/v1/token?grant_type=password', { body: { email: em, password: pw } }); return ok2(r) ? { token: r.json.access_token, id: r.json.user.id } : { err: r.status }; };
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const SH = { version: 'qa-1', text_hash: sha('qa recheck') };
const day = new Date().toISOString().slice(0, 10), Z = '1970-01-01T00:00:00Z';
const flat = (j) => JSON.stringify(j || {});
const kinds = (p) => [...new Set(((p && p.records) || []).map((x) => x.kind))].sort().join(',');
const sfx = crypto.randomBytes(3).toString('hex');
const NOTES = { profile: 'NP-' + sfx, entry: 'NE-' + sfx, food: 'NF-' + sfx, habit: 'NH-' + sfx, library: 'NL-' + sfx };
const rec = (kind, nkey, date, data, id) => ({ id: id || crypto.randomUUID(), kind, nkey, date, data, updated_at: new Date().toISOString(), deleted_at: null });
const code = (r) => r.code;

(async () => {
  const C = await login(E.QA_COACH_EMAIL, E.QA_COACH_PW), A = await login(E.QA_A_EMAIL, E.QA_A_PW);
  rep(!!C.token && !!A.token, 'login coach y A', C.err || A.err || '');
  if (!C.token || !A.token) process.exit(1);
  let r0;

  // Sprint 7: el servidor exige A7 (coach) y A3 + A4 (cliente). Mismo método que el resto: INSERT directo en core.consent_events
  // con la sesión de cada cuenta (los eventos no se borran; se añade uno vigente).
  const cons = (uid, kind) => ({ user_id: uid, app_id: 'grasa', kind, granted: true, version: 'qa-1', text_hash: sha('qa ' + kind), coach_id: null, client_at: new Date().toISOString() });
  const ins = (who, kinds_) => api('POST', '/rest/v1/consent_events', { token: who.token, body: kinds_.map((k) => cons(who.id, k)),
    headers: { 'Content-Profile': 'core', Accept: 'application/json', Prefer: 'return=representation' } });
  r0 = await ins(C, ['coach_agreement']);
  rep(ok2(r0), 'coach registra coach_agreement', ok2(r0) ? '' : `HTTP ${r0.status}`);
  r0 = await ins(A, ['sensitive_health', 'cloud_transfer']);
  rep(ok2(r0), 'A registra sensitive_health y cloud_transfer', ok2(r0) ? '' : `HTTP ${r0.status}`);

  console.log('\n== 1) H6: note en los 4 kinds');
  const fid = crypto.randomUUID();
  const recs = [
    rec('profile', 'profile', null, { name: 'QA A', height: 170, note: NOTES.profile }),
    rec('entry', day, day, { weight: 80.4, note: NOTES.entry }),
    rec('food', fid, day, { name: 'Comida H6', kcal: 400, note: NOTES.food }, fid),
    rec('habit', day, day, { water: true, note: NOTES.habit }),
    rec('library', 'alimento h6', null, { name: 'Alimento H6', note: NOTES.library }),
  ];
  let r = await rpc('grasa', 'sync_push', { p_records: recs, p_photos: [] }, A.token);
  rep(ok2(r), 'A sync_push con note en profile/entry/food/habit/library', ok2(r) ? '' : `HTTP ${r.status} ${r.json && r.json.message}`);
  await rpc('grasa', 'leave_coach', {}, A.token); // limpia vínculo previo, si lo hay
  const br = await rpc('grasa', 'become_coach', { p_business_name: 'QA Coach Pruebas' }, C.token);
  const cd = Array.isArray(br.json) ? br.json[0].invite_code : null;
  const shares = (o) => ({ body: true, notes: false, nutrition: false, habits: false, photos: false, ...o, ...SH });
  r = await rpc('grasa', 'join_coach', { p_code: cd, p_shares: shares({}) }, A.token);
  rep(ok2(r) && r.json && r.json.status === 'active', 'A se vincula (solo peso/medidas)');
  const pull = async () => (await rpc('grasa', 'coach_pull', { p_client: A.id, p_since: Z }, C.token));
  const noNotes = (j) => !Object.values(NOTES).some((x) => flat(j).includes(x)) && !flat(j).includes('"note"');
  let p = await pull();
  rep(ok2(p.status ? p : p) && kinds(p.json) === 'entry,profile' && noNotes(p.json), 'sin consentir comidas/hábitos y notes=false: solo entry+profile, 0 notes', kinds(p.json));
  await rpc('grasa', 'update_shares', { p_shares: shares({ nutrition: true }) }, A.token);
  p = await pull();
  rep(kinds(p.json) === 'entry,food,profile' && noNotes(p.json) && flat(p.json).includes('Comida H6'), 'comidas consentidas, notes=false: entry+food+profile, 0 notes (food sin note)', kinds(p.json));
  await rpc('grasa', 'update_shares', { p_shares: shares({ nutrition: true, habits: true }) }, A.token);
  p = await pull();
  rep(kinds(p.json) === 'entry,food,habit,profile' && noNotes(p.json), 'comidas+hábitos consentidos, notes=false: los 4 kinds sin NINGUNA note', kinds(p.json));
  await rpc('grasa', 'update_shares', { p_shares: shares({ nutrition: true, habits: true, notes: true }) }, A.token);
  p = await pull();
  const has = (k) => flat(p.json).includes(NOTES[k]);
  rep(has('profile') && has('entry') && has('food') && has('habit') && !has('library') && kinds(p.json) === 'entry,food,habit,profile',
    'control positivo notes=true: aparecen las notas de profile/entry/food/habit; la de library NUNCA', `profile=${has('profile')} entry=${has('entry')} food=${has('food')} habit=${has('habit')} library=${has('library')}`);
  await rpc('grasa', 'update_shares', { p_shares: shares({ nutrition: true, habits: true }) }, A.token);
  p = await pull();
  rep(noNotes(p.json), 'revocar notes → el coach vuelve a no ver ninguna note');
  // solo comidas: sin hábitos
  await rpc('grasa', 'update_shares', { p_shares: shares({}) }, A.token);
  p = await pull();
  rep(kinds(p.json) === 'entry,profile' && noNotes(p.json), 'revocar comidas y hábitos → solo entry+profile', kinds(p.json));

  console.log('\n== 3) Regresión coach <-> A');
  r = await rpc('grasa', 'coach_clients', {}, C.token);
  rep(ok2(r) && (r.json || []).some((x) => x.client_id === A.id), 'coach_clients lista a A');
  r = await api('GET', `/rest/v1/records?user_id=eq.${A.id}&select=id`, { token: C.token, headers: { 'Accept-Profile': 'grasa' } });
  rep(ok2(r) && r.json.length === 0, 'coach lee records de A directo: 0 filas');
  r = await api('POST', '/rest/v1/records', { token: C.token, body: { ...rec('entry', '2020-01-03', '2020-01-03', { weight: 1 }), user_id: A.id }, headers: { 'Content-Profile': 'grasa' } });
  rep(r.status === 403, 'coach INSERT en records de A → 403', `HTTP ${r.status}`);
  r = await api('DELETE', `/rest/v1/records?user_id=eq.${A.id}`, { token: C.token, headers: { 'Content-Profile': 'grasa' } });
  rep(r.status === 403 || (ok2(r) && (r.json || []).length === 0), 'coach DELETE en records de A denegado', `HTTP ${r.status}`);
  r = await rpc('grasa', 'leave_coach', {}, A.token);
  rep(ok2(r), 'A leave_coach');
  const f = await pull();
  rep(f.status === 403 && /forbidden/.test(flat(f.json)), 'coach_pull tras terminar vínculo → 403 forbidden', `HTTP ${f.status}`);
  const forb = f;

  console.log('\n== 2) mapError de remote.js con respuestas REALES');
  const map = (label, real, opts, want) => {
    const e = Remote.mapError({ message: real.json && (real.json.message || real.json.msg), code: real.json && (real.json.error_code || real.json.code), status: real.status }, { status: real.status, ...opts });
    rep(e.code === want, `${label} (HTTP ${real.status} ${(real.json && (real.json.error_code || real.json.code)) || ''}) → ${e.code}`, `esperado ${want}`);
  };
  map('refresh_token inválido', await api('POST', '/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: 'qa-falso' } }), { ctx: 'auth' }, 'auth');
  map('REST sin sesión (anon) rpc', await rpc('core', 'my_roles', { p_app: 'grasa' }), {}, 'auth');
  map('REST sin sesión (anon) tabla', await api('GET', '/rest/v1/records?select=id', { headers: { 'Accept-Profile': 'grasa' } }), {}, 'auth');
  map('con sesión, RLS/forbidden (coach_pull)', forb, {}, 'forbidden');
  r = await api('POST', '/rest/v1/records', { token: C.token, body: { ...rec('entry', '2020-01-03', '2020-01-03', {}), user_id: A.id }, headers: { 'Content-Profile': 'grasa' } });
  map('con sesión, INSERT bloqueado por RLS', r, {}, 'forbidden');
  map('JWT mal formado en REST', await rpc('core', 'my_roles', { p_app: 'grasa' }, 'abc.def'), {}, 'auth');
  map('JWT falso en /auth/v1/user', await api('GET', '/auth/v1/user', { token: 'abc.def' }), { ctx: 'auth' }, 'auth');
  map('contraseña incorrecta, ctx verify', await api('POST', '/auth/v1/token?grant_type=password', { body: { email: E.QA_A_EMAIL, password: 'x-incorrecta-qa' } }), { ctx: 'verify' }, 'invalid_code');
  map('sync_push UUID inválido (22P02)', await rpc('grasa', 'sync_push', { p_records: [{ id: 'no-uuid', kind: 'entry', nkey: 'x', data: {}, updated_at: 'ayer' }], p_photos: [] }, A.token), {}, 'invalid');

  console.log(`\nResumen: ${n - fails}/${n} OK, ${fails} FALLA`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('Error inesperado:', e.message); process.exit(1); });
