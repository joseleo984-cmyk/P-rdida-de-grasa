// Sprint 9: CAPTCHA (Cloudflare Turnstile). captcha.js con un navegador simulado, Remote (config, mapError, captchaToken),
// servidor falso, revisión de config*.js (nunca una clave secreta), service worker e index.html sin cargas externas.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Captcha = require('../captcha.js');
const Remote = require('../remote.js');
const Fake = require('../remote-fake.js');
const C = require('../scripts/check-conexion.js');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
// Claves de prueba OFICIALES de Cloudflare (documentación de Turnstile → Testing). Solo para pruebas, nunca en config*.js.
const PASS = '1x00000000000000000000AA';   // siempre pasa (visible)
const BLOCK = '2x00000000000000000000AB';  // siempre bloquea (visible)
const REAL = '0x4AAAAAAAdJZmF4e1rsFqWr1';  // forma de una site key pública (inventada)

// ---------- navegador simulado ----------
function browser({ turnstile = 'ok' } = {}) {
  const scripts = [];
  const w = {};
  const d = {
    head: { appendChild(s) { scripts.push(s); if (turnstile === 'ok') queueMicrotask(() => { w.turnstile = makeTs(w); s.onload(); }); else if (turnstile === 'error') queueMicrotask(() => s.onerror()); } },
    createElement: () => ({ parentNode: null }),
  };
  return { w, d, scripts };
}
function makeTs(w) {
  const widgets = [];
  const ts = {
    widgets, removed: [], resets: [],
    render(el, o) { widgets.push({ el, o }); return 'w' + widgets.length; },
    reset(id) { ts.resets.push(id); },
    remove(id) { ts.removed.push(id); },
  };
  return ts;
}
const mk = (b, extra = {}) => Captcha.create({ siteKey: REAL, doc: b.d, win: b.w, ...extra });
const el = (width = 358) => ({ clientWidth: width, replaceChildren() { this.cleared = true; } });

test('no se descarga nada hasta llamar a mount(): crear el controlador no toca el documento', () => {
  const b = browser();
  const c = mk(b);
  assert.strictEqual(b.scripts.length, 0);
  assert.strictEqual(c.state(), 'idle');
});

test('mount carga api.js de Cloudflare UNA vez (render explícito) y pinta el widget gestionado no interactivo', async () => {
  const b = browser();
  const c = mk(b);
  assert.strictEqual(await c.mount(el()), 'pending');
  assert.strictEqual(b.scripts.length, 1);
  assert.strictEqual(b.scripts[0].src, 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit');
  const { o } = b.w.turnstile.widgets[0];
  assert.strictEqual(o.sitekey, REAL);
  assert.strictEqual(o.appearance, 'interaction-only');
  assert.strictEqual(o.theme, 'auto');
  assert.strictEqual(o.size, 'flexible');
  assert.strictEqual(o['response-field'], false);
  await c.mount(el()); // segundo mount: no vuelve a cargar el script
  assert.strictEqual(b.scripts.length, 1);
  assert.deepStrictEqual(b.w.turnstile.removed, ['w1'], 'el widget anterior se retira');
});

test('contenedor estrecho (< 300 px) → tamaño compact; el token llega por callback y reset() lo descarta', async () => {
  const b = browser();
  const states = [];
  const c = mk(b, { onState: (s) => states.push(s) });
  await c.mount(el(280));
  const { o } = b.w.turnstile.widgets[0];
  assert.strictEqual(o.size, 'compact');
  o.callback('TOKEN-1');
  assert.strictEqual(c.state(), 'solved');
  assert.strictEqual(c.token(), 'TOKEN-1');
  c.reset(); // token de un solo uso
  assert.strictEqual(c.token(), '');
  assert.strictEqual(c.state(), 'pending');
  assert.deepStrictEqual(b.w.turnstile.resets, ['w1']);
  o['expired-callback']();
  assert.strictEqual(c.state(), 'pending');
  assert.strictEqual(o['error-callback'](), true);
  assert.strictEqual(c.state(), 'error');
  assert.deepStrictEqual(states.slice(0, 2), ['loading', 'pending']);
});

test('script bloqueado o sin red → unavailable (sin lanzar) y se puede reintentar', async () => {
  const b = browser({ turnstile: 'error' });
  const c = mk(b);
  assert.strictEqual(await c.mount(el()), 'unavailable');
  assert.strictEqual(c.token(), '');
  b.d.head.appendChild = (s) => { b.scripts.push(s); queueMicrotask(() => { b.w.turnstile = makeTs(b.w); s.onload(); }); }; // vuelve la red
  assert.strictEqual(await c.mount(el()), 'pending');
  assert.strictEqual(b.scripts.length, 2, 'un segundo intento de carga');
});

test('script que nunca responde → unavailable por tiempo', async () => {
  const b = browser({ turnstile: 'never' });
  const c = mk(b, { timeoutMs: 20 });
  assert.strictEqual(await c.mount(el()), 'unavailable');
});

test('un mount viejo que termina tarde no pisa al nuevo; destroy() retira el widget', async () => {
  const b = browser();
  const c = mk(b);
  const p1 = c.mount(el());
  const p2 = c.mount(el());
  await Promise.all([p1, p2]);
  assert.strictEqual(b.w.turnstile.widgets.length, 1);
  c.destroy();
  assert.strictEqual(c.state(), 'idle');
  assert.ok(b.w.turnstile.removed.length >= 1);
});

// ---------- Remote ----------
const loc = { hostname: 'x.org', search: '' };
const base = { url: 'https://abc.supabase.co', key: 'sb_publishable_123' };
test('Remote.config: captchaSiteKey es opcional y solo pasa con la forma de una site key', () => {
  assert.deepStrictEqual(Remote.config({ location: loc, PG_CONFIG: { ...base, captchaSiteKey: '' } }), { ...base, mode: 'real' });
  assert.deepStrictEqual(Remote.config({ location: loc, PG_CONFIG: { ...base, captchaSiteKey: REAL } }), { ...base, mode: 'real', captchaSiteKey: REAL });
  for (const bad of [123, 'abc', 'sb_secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxx', REAL + 'x'.repeat(20), '0x4AAA']) {
    assert.strictEqual(Remote.config({ location: loc, PG_CONFIG: { ...base, captchaSiteKey: bad } }).captchaSiteKey, undefined, String(bad));
  }
  const fake = Remote.config({ location: { hostname: 'localhost', search: '?remote=fake' }, PG_CONFIG: { captchaSiteKey: PASS } });
  assert.deepStrictEqual(fake, { url: '', key: '', mode: 'fake', captchaSiteKey: PASS });
  assert.strictEqual(Remote.config({ location: { hostname: 'x.org', search: '?remote=fake' }, PG_CONFIG: { captchaSiteKey: PASS } }), null);
});

test('mapError: errores de captcha de Supabase Auth → captcha_failed, con mensaje amable y sin detalle técnico', () => {
  for (const e of [
    { name: 'AuthApiError', status: 400, code: 'captcha_failed', message: 'captcha verification process failed' },
    { name: 'AuthApiError', status: 400, message: 'captcha verification process failed' },
    { name: 'AuthApiError', status: 400, message: 'no captcha response (captcha_token) found in request' },
    { message: 'captcha_failed' },
  ]) {
    const r = Remote.mapError(e, { status: 400, ctx: 'auth' });
    assert.strictEqual(r.code, 'captcha_failed', JSON.stringify(e));
    assert.strictEqual(r.message, 'No pudimos verificar que eres una persona');
    assert.strictEqual(r.retryable, false);
  }
  assert.strictEqual(Remote.mapError({ name: 'AuthApiError', status: 400, code: 'validation_failed', message: 'otra cosa' }, { ctx: 'auth' }).code, 'invalid');
});

test('auth.sendCode real: captchaToken viaja en options solo si existe', async () => {
  const calls = [];
  const sb = { auth: { signInWithOtp: async (a) => { calls.push(a); return { data: {}, error: null }; } } };
  const r = Remote.create({ url: 'https://abcdefgh.supabase.co', key: 'sb_publishable_TEST', storage: { getItem: () => null, setItem() {}, removeItem() {} }, createClient: () => sb });
  await r.auth.sendCode('Ana@X.co');
  await r.auth.sendCode('ana@x.co', { captchaToken: 'TOK' });
  await r.auth.sendCode('ana@x.co', { captchaToken: '' });
  assert.deepStrictEqual(calls, [
    { email: 'ana@x.co', options: { shouldCreateUser: true } },
    { email: 'ana@x.co', options: { shouldCreateUser: true, captchaToken: 'TOK' } },
    { email: 'ana@x.co', options: { shouldCreateUser: true } },
  ]);
});

test('supabase-js vendorizado: signInWithOtp manda options.captchaToken como gotrue_meta_security.captcha_token', () => {
  const v = read('vendor/supabase-2.117.2.js');
  assert.ok(/signInWithOtp\(e\)\{[^]{0,400}gotrue_meta_security:\{captcha_token:r\?\.captchaToken\}/.test(v));
});

test('el mensaje de error del captcha de remote.js y el de captcha.js dicen lo mismo', () => {
  assert.ok(Captcha.MESSAGES.failed.startsWith(Remote.mapError({ code: 'captcha_failed' }).message));
});

// ---------- servidor falso ----------
test('remote-fake: con captchaRequired exige token, es de un solo uso y captchaFail(n) lo rechaza', async () => {
  const be = new Fake.FakeBackend({ clock: Fake.FakeClock('2026-10-21T15:00:00.000Z') });
  const r = Fake.createFake({ backend: be });
  await r.auth.sendCode('a@x.co'); // sin captcha requerido: como siempre
  be.captchaRequired = true;
  await assert.rejects(r.auth.sendCode('b@x.co'), (e) => e.code === 'captcha_failed');
  await r.auth.sendCode('b@x.co', { captchaToken: 'T1' });
  await assert.rejects(r.auth.sendCode('c@x.co', { captchaToken: 'T1' }), (e) => e.code === 'captcha_failed', 'token reutilizado');
  be.captchaFail(1);
  await assert.rejects(r.auth.sendCode('c@x.co', { captchaToken: 'T2' }), (e) => e.code === 'captcha_failed');
  await r.auth.sendCode('c@x.co', { captchaToken: 'T3' });
  // el token dummy de las claves de prueba de Cloudflare se acepta siempre
  await r.auth.sendCode('d@x.co', { captchaToken: 'XXXX.DUMMY.TOKEN.XXXX' });
  await r.auth.sendCode('e@x.co', { captchaToken: 'XXXX.DUMMY.TOKEN.XXXX' });
  assert.ok(be.lastCode('e@x.co'));
});

// ---------- revisión de configuración (nunca una clave secreta) ----------
const cfgWith = (captcha) => `window.PG_CONFIG = {\n  env: '',\n  url: '',\n  key: '',\n  mode: 'real',\n${captcha === undefined ? '' : `  captchaSiteKey: '${captcha}',\n`}};\n`;

test('config*.js del repo: solo la forma de una site key pública (o vacía) y nada con forma de clave secreta', () => {
  for (const f of ['config.js', 'config.pruebas.js']) {
    const t = read(f);
    assert.deepStrictEqual(C.checkCaptcha(t), [], f);
    const m = t.match(/captchaSiteKey:\s*'([^']*)'/);
    if (m && m[1]) assert.match(m[1], /^0x4[A-Za-z0-9_-]{17,27}$/, f + ': ¿clave secreta?');
    assert.ok(!/sb_secret_|service_role/.test(t), f);
    assert.ok(!(/\b0x4[A-Za-z0-9_-]{8,}/.test(t.replace(/captchaSiteKey:\s*'[^']*'/, ''))), f + ': clave con forma de Cloudflare fuera de captchaSiteKey');
    assert.ok(!/secret[_-]?key|captcha[_-]?secret|turnstile[_-]?secret/i.test(t), f);
  }
  assert.strictEqual(read('config.js').includes('captchaSiteKey'), false, 'config.js sigue vacío y sin tocar');
});

test('check-conexion: valida el formato de captchaSiteKey y rechaza secretas y claves de prueba', () => {
  assert.deepStrictEqual(C.checkCaptcha(cfgWith(undefined)), []);
  assert.deepStrictEqual(C.checkCaptcha(cfgWith('')), []);
  assert.deepStrictEqual(C.checkCaptcha(cfgWith(REAL)), []);
  assert.strictEqual(C.checkCaptcha(cfgWith('0x4AAAAAAAdJZmF4e1rsFqWr1_ClaveSecretaMuchoMasLargaQueLaPublica')).length >= 1, true, 'secreta: más larga');
  assert.ok(C.checkCaptcha(cfgWith('hola')).some((p) => /site key pública/.test(p)));
  assert.ok(C.checkCaptcha(cfgWith(PASS)).some((p) => /PRUEBA de Cloudflare/.test(p)));
  assert.deepStrictEqual(C.checkCaptcha(cfgWith(PASS), { allowTest: true }), []);
  assert.ok(C.checkCaptcha(cfgWith(REAL) + "// captchaSecret: 'x'").length >= 1);
  assert.ok(C.checkCaptcha(cfgWith('') + "// 0x4AAAAAAAdJZmF4e1rsFqWr1xxxxxxxxxxxx").some((p) => /fuera de captchaSiteKey/.test(p)));
  assert.ok(C.checkCaptcha(cfgWith(REAL), { empty: true }).some((p) => /REVERSA/.test(p)));
  // integrado en checkConfig (config.js de la app oficial)
  const full = (c) => `window.PG_CONFIG = {\n  env: '',\n  url: 'https://abcdefghijklmnopqrst.supabase.co',\n  key: 'sb_publishable_AbCdEfGhIjKlMnOp12345',\n  mode: 'real',\n  captchaSiteKey: '${c}',\n};\n`;
  assert.deepStrictEqual(C.checkConfig(full(REAL)).problems, []);
  assert.deepStrictEqual(C.checkConfig(full('')).problems, []);
  assert.ok(C.checkConfig(full('basura')).problems.length >= 1);
});

test('el patrón de site key es el mismo en remote.js (navegador) y check-conexion.js (script)', () => {
  const real = Remote.CAPTCHA_SITEKEY_RE.source.match(/0x4\[A-Za-z0-9_-\]\{17,27\}/);
  assert.ok(real);
  assert.strictEqual(C.CAPTCHA_RE.source, '^' + real[0] + '$');
  assert.strictEqual(Captcha.SITEKEY_RE.source, C.CAPTCHA_RE.source);
});

// ---------- el sitio y el service worker ----------
test('index.html: sin CSP que ampliar y sin ningún script externo escrito a mano; captcha.js va antes de account.js', () => {
  const h = read('index.html');
  assert.ok(!/Content-Security-Policy/i.test(h));
  assert.ok(!/<script[^>]+src="https?:/i.test(h));
  assert.ok(!/cloudflare/i.test(h));
  assert.ok(h.indexOf('captcha.js') > 0 && h.indexOf('captcha.js') < h.indexOf('account.js'));
});

test('service worker: precachea captcha.js y NO toca recursos de otros orígenes (Cloudflare)', () => {
  const sw = read('sw.js');
  assert.ok(/'captcha\.js'/.test(sw));
  assert.ok(!/cloudflare/i.test(sw.replace(/\/\/.*$/gm, '')), 'ningún recurso de Cloudflare en el SW (fuera de comentarios)');
  assert.ok(/new URL\(e\.request\.url\)\.origin !== self\.location\.origin\) return;/.test(sw));
  assert.ok(/cacheName\((\d+)\)/.test(sw));
});

test('captcha.js solo menciona un host externo: challenges.cloudflare.com', () => {
  const hosts = new Set((read('captcha.js').match(/https?:\/\/[a-z0-9.-]+/gi) || []).map((u) => u.replace(/^https?:\/\//, '')));
  assert.deepStrictEqual([...hosts], ['challenges.cloudflare.com']);
});
