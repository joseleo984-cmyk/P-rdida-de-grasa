// S3-2 (R1): crear cuenta / entrar con código por correo, sesión persistente y rol (cliente o coach).
// Habla con el servidor SOLO a través de Remote (remote.js); en pruebas, con la implementación falsa (remote-fake.js).
// Sin servidor configurado (config.js vacío) este archivo no hace nada: la app funciona como antes, solo local.
// No sincroniza datos (S3-3) ni muestra el panel del coach (S3-4).
(function () {
  'use strict';

  const cfg = window.Remote ? Remote.config() : null;
  if (!cfg) return;

  const $ = (sel) => document.querySelector(sel);
  const META_KEY = 'perdida-grasa:account';     // { userId, email, roles, onboarded, coach, link, consentsSent }
  const SKIP_KEY = 'perdida-grasa:account-skip'; // "Ahora no": no volver a mostrar la pantalla al abrir
  const STATE_KEY = 'perdida-grasa:v1';
  const RESEND_S = 60;
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin espacio */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* nada */ } },
  };
  const readMeta = () => { try { return JSON.parse(ls.get(META_KEY) || 'null'); } catch { return null; } };
  const writeMeta = (m) => (m ? ls.set(META_KEY, JSON.stringify(m)) : ls.del(META_KEY));

  let remote = null;
  let email = '';
  let resendTimer = null;
  let resendLeft = 0;
  let previewed = null; // { code, businessName }

  // ---------- Conexión ----------
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('No se pudo cargar ' + src));
      document.head.appendChild(s);
    });
  }
  async function connect() {
    if (cfg.mode === 'fake') {
      // Solo pruebas (localhost o ?remote=fake fuera de producción): servidor simulado guardado en localStorage.
      if (!window.RemoteFake) await loadScript('remote-fake.js');
      const backend = RemoteFake.persistentBackend(localStorage);
      window.__pgFakeBackend = backend; // las pruebas leen aquí el código OTP (backend.lastCode)
      return Remote.createFake({ backend, storage: localStorage });
    }
    return Remote.create({ url: cfg.url, key: cfg.key, app: 'grasa', storage: localStorage });
  }

  // ---------- Utilidades de interfaz ----------
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.remove('error');
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }
  function errorText(err, where) {
    switch (err && err.code) {
      case 'offline': return where === 'email' || where === 'code'
        ? 'Sin conexión. Para entrar la primera vez en este dispositivo necesitas internet.'
        : 'Sin conexión. Inténtalo cuando vuelvas a tener internet.';
      case 'invalid_code': return where === 'role'
        ? 'Ese código de coach no existe o ya no es válido. Revísalo con tu coach.'
        : 'Código incorrecto o caducado. Revisa el último correo que te llegó o pide otro.';
      case 'rate_limited': return 'Demasiados intentos seguidos. Espera un poco y vuelve a intentarlo.';
      case 'invalid': return where === 'email' ? 'Escribe un correo válido, por ejemplo nombre@correo.com.' : (err.message || 'Revisa los datos.');
      case 'auth': return 'Tu sesión caducó: vuelve a entrar con tu correo.';
      default: return 'No se pudo conectar con el servidor. Inténtalo de nuevo en un momento.';
    }
  }
  function showError(id, msg) {
    const el = $(id);
    el.textContent = msg || '';
    el.classList.toggle('hidden', !msg);
  }
  function busy(form, on) {
    for (const el of form.querySelectorAll('button, input')) {
      if (on) { el.dataset.wasDisabled = el.disabled ? '1' : ''; el.disabled = true; }
      else el.disabled = el.dataset.wasDisabled === '1';
    }
    form.setAttribute('aria-busy', on ? 'true' : 'false');
  }
  const STEPS = ['email', 'code', 'role', 'done'];
  function step(name, focusSel) {
    for (const s of STEPS) $('#acc-step-' + s).classList.toggle('hidden', s !== name);
    const f = $(focusSel || `#acc-step-${name} h2`);
    if (f) f.focus();
  }
  function openScreen(name = 'email') {
    document.body.classList.add('account-open');
    $('#account').classList.remove('hidden');
    step(name);
  }
  function closeScreen() {
    document.body.classList.remove('account-open');
    $('#account').classList.add('hidden');
    stopResend();
    renderCard();
    const tab = document.querySelector('.tabbar button.on') || $('#tab-panel');
    if (tab) tab.focus();
  }
  function legalOK() {
    if (document.body.classList.contains('consent-open')) return false;
    try { return Schema.consentStatus((JSON.parse(ls.get(STATE_KEY) || 'null') || {}).consent) === 'ok'; } catch { return false; }
  }

  // ---------- Paso 1: correo ----------
  $('#form-acc-email').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const form = ev.currentTarget;
    const value = $('#acc-email').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) { showError('#acc-email-error', errorText({ code: 'invalid' }, 'email')); $('#acc-email').focus(); return; }
    showError('#acc-email-error', '');
    busy(form, true);
    try {
      await remote.auth.sendCode(value);
      email = value.toLowerCase();
      $('#acc-code-email').textContent = email;
      $('#acc-code').value = '';
      showError('#acc-code-error', '');
      startResend();
      step('code', '#acc-code');
    } catch (err) {
      // Si ya se pidió uno hace menos de un minuto, se puede escribir el que llegó.
      if (err && err.code === 'rate_limited' && email === value.toLowerCase()) { startResend(); step('code', '#acc-code'); }
      else { showError('#acc-email-error', errorText(err, 'email')); $('#acc-email').focus(); }
    } finally { busy(form, false); }
  });
  $('#btn-acc-skip').addEventListener('click', () => {
    ls.set(SKIP_KEY, '1');
    closeScreen();
    toast('Puedes crear tu cuenta cuando quieras en Perfil → Cuenta');
  });

  // ---------- Paso 2: código ----------
  function stopResend() { clearInterval(resendTimer); resendTimer = null; }
  function startResend() {
    stopResend();
    resendLeft = RESEND_S;
    const btn = $('#btn-acc-resend');
    const tick = () => {
      btn.disabled = resendLeft > 0;
      btn.textContent = resendLeft > 0 ? `Reenviar código (${resendLeft} s)` : 'Reenviar código';
      if (resendLeft === 0) { $('#acc-resend-hint').textContent = 'Ya puedes pedir otro código.'; stopResend(); }
      resendLeft--;
    };
    $('#acc-resend-hint').textContent = '';
    tick();
    resendTimer = setInterval(tick, 1000);
  }
  $('#btn-acc-resend').addEventListener('click', async () => {
    try {
      await remote.auth.sendCode(email);
      startResend();
      showError('#acc-code-error', '');
      $('#acc-resend-hint').textContent = 'Te enviamos un código nuevo. El anterior ya no sirve.';
      $('#acc-code').focus();
    } catch (err) { showError('#acc-code-error', errorText(err, 'code')); }
  });
  $('#btn-acc-change').addEventListener('click', () => { stopResend(); step('email', '#acc-email'); });
  $('#acc-code').addEventListener('input', (ev) => { ev.target.value = ev.target.value.replace(/\D/g, '').slice(0, 10); });
  $('#form-acc-code').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const form = ev.currentTarget;
    const code = $('#acc-code').value.trim();
    if (!/^\d{6,10}$/.test(code)) { showError('#acc-code-error', 'El código tiene 6 dígitos (algunos correos traen hasta 10).'); $('#acc-code').focus(); return; }
    showError('#acc-code-error', '');
    busy(form, true);
    try {
      const { user } = await remote.auth.verifyCode(email, code);
      stopResend();
      const roles = await remote.account.joinApp();
      const prev = readMeta();
      const meta = { ...(prev && prev.userId === user.id ? prev : {}), userId: user.id, email: user.email, roles };
      if (roles.includes('coach')) { meta.onboarded = true; meta.coach = await remote.coach.myCoach().catch(() => meta.coach || null); }
      writeMeta(meta);
      ls.del(SKIP_KEY);
      await sendConsents();
      if (meta.onboarded) { finish(roles.includes('coach') ? 'coach' : 'client'); return; }
      $('#form-acc-role').reset();
      updateRoleFields();
      step('role');
    } catch (err) {
      showError('#acc-code-error', errorText(err, 'code'));
      $('#acc-code').focus();
    } finally { busy(form, false); }
  });

  // ---------- Paso 3: rol ----------
  function updateRoleFields() {
    const role = $('#form-acc-role').elements.role.value; // RadioNodeList: vale aunque el formulario esté ocupado (disabled)
    $('#acc-client-fields').classList.toggle('hidden', role !== 'client');
    $('#acc-coach-fields').classList.toggle('hidden', role !== 'coach');
    const code = $('#acc-coach-code').value.trim();
    if (!previewed || previewed.code !== normCode(code)) { previewed = null; $('#acc-share').classList.add('hidden'); }
    $('#btn-acc-role').textContent = role === 'client' && code && !previewed ? 'Comprobar código' : role === 'client' && previewed ? 'Vincularme y continuar' : 'Continuar';
  }
  const normCode = (c) => String(c || '').toUpperCase().replace(/[\s-]/g, '');
  $('#form-acc-role').addEventListener('change', updateRoleFields);
  $('#acc-coach-code').addEventListener('input', updateRoleFields);
  $('#form-acc-role').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const form = ev.currentTarget;
    const f = new FormData(form);
    const role = form.elements.role.value;
    if (!role) { showError('#acc-role-error', 'Elige si eres cliente o coach.'); form.querySelector('input[name=role]').focus(); return; }
    showError('#acc-role-error', '');
    busy(form, true);
    try {
      const meta = readMeta() || {};
      if (role === 'coach') {
        const name = String(f.get('business') || '').trim();
        if (name.length < 2 || name.length > 60) { showError('#acc-role-error', 'Escribe tu nombre comercial (2 a 60 caracteres).'); busy(form, false); $('#acc-business').focus(); return; }
        await remote.coach.becomeCoach(name);
        meta.coach = await remote.coach.myCoach();
        meta.roles = await remote.account.roles();
      } else {
        const code = normCode(f.get('coachCode'));
        if (code && !previewed) {
          const { businessName } = await remote.client.previewCode(code);
          previewed = { code, businessName };
          $('#acc-share-title').textContent = `Te vas a vincular con «${businessName}».`;
          $('#acc-share').classList.remove('hidden');
          updateRoleFields();
          busy(form, false);
          $('#acc-share-title').setAttribute('tabindex', '-1');
          $('#acc-share-title').focus();
          return;
        }
        if (code && previewed) {
          const shares = { body: true, nutrition: form.elements.share_nutrition.checked, habits: form.elements.share_habits.checked, notes: form.elements.share_notes.checked, photos: false };
          meta.link = await remote.client.joinCoach(code, shares);
        }
      }
      meta.onboarded = true;
      writeMeta(meta);
      finish(role);
    } catch (err) {
      showError('#acc-role-error', errorText(err, 'role'));
    } finally { busy(form, false); }
  });

  // ---------- Paso 4: listo ----------
  function finish(role) {
    const meta = readMeta() || {};
    const code = $('#acc-done-code');
    if (role === 'coach' && meta.coach) {
      $('#acc-done-text').textContent = `Tu cuenta de coach «${meta.coach.businessName}» está lista. Comparte este código con tus clientes para que se vinculen:`;
      code.textContent = meta.coach.inviteCode;
      code.classList.remove('hidden');
    } else {
      $('#acc-done-text').textContent = meta.link ? `Sesión iniciada como ${meta.email}. Ya estás vinculado con «${meta.link.businessName}».` : `Sesión iniciada como ${meta.email}.`;
      code.classList.add('hidden');
    }
    step('done');
  }
  $('#btn-acc-done').addEventListener('click', () => { closeScreen(); toast('Sesión iniciada'); });

  // ---------- Consentimiento → servidor ----------
  // PUNTO DE INTEGRACIÓN LEGAL (S3-5, Analista): la aceptación local (state.consent, pantalla legal de S2-1) se registra
  // en core.consent_events al iniciar sesión, una vez por usuario y versión de los textos. Cuando S3-5 publique los
  // textos "con cuentas" bastará con subir Schema.LEGAL_VERSIONS: la pantalla legal pide re-aceptar y aquí se envían
  // los nuevos eventos. Para no volver a pedirla en un dispositivo nuevo se usará remote.account.consents() (pendiente).
  async function sendConsents() {
    const meta = readMeta();
    let c = null;
    try { c = (JSON.parse(ls.get(STATE_KEY) || 'null') || {}).consent; } catch { c = null; }
    if (!meta || Schema.consentStatus(c) !== 'ok') return;
    const tag = `${c.termsVersion}|${c.privacyVersion}|${c.sensitiveHealth}|${c.updatedAt}`;
    if (meta.consentsSent === tag) return;
    const at = c.acceptedAt;
    const events = [
      { kind: 'terms', granted: true, version: c.termsVersion, clientAt: at },
      { kind: 'privacy', granted: true, version: c.privacyVersion, clientAt: at },
      { kind: 'adult', granted: true, version: c.termsVersion, clientAt: at },
      { kind: 'sensitive_health', granted: c.sensitiveHealth === true, version: c.privacyVersion, clientAt: c.sensitiveHealthAt || at },
    ];
    try {
      await remote.account.recordConsents(events);
      writeMeta({ ...readMeta(), consentsSent: tag });
    } catch { /* sin conexión: se reintenta al abrir la app con sesión */ }
  }

  // ---------- Perfil → Cuenta ----------
  async function renderCard() {
    const card = $('#account-card');
    card.classList.remove('hidden');
    const s = remote ? await remote.auth.session().catch(() => null) : null;
    const meta = readMeta();
    const status = $('#account-status'), extra = $('#account-extra');
    if (s && meta && meta.userId === s.user.id) {
      const roles = (meta.roles || []).includes('coach') ? 'coach' : 'cliente';
      status.textContent = `Sesión iniciada: ${s.user.email} (${roles}).` + (navigator.onLine === false ? ' Sin conexión: sigues usando la app con normalidad.' : '');
      extra.textContent = meta.coach ? `Tu código para clientes: ${meta.coach.inviteCode}` : meta.link ? `Coach: ${meta.link.businessName}` : '';
      if (meta.authExpired) extra.textContent = 'Tu sesión caducó: vuelve a entrar con tu correo (tus datos siguen aquí).';
    } else {
      status.textContent = 'Sin cuenta: tus datos solo están en este dispositivo.';
      extra.textContent = '';
    }
    const signedIn = !!(s && meta && meta.userId === s.user.id);
    $('#btn-account-login').classList.toggle('hidden', signedIn && !(meta && meta.authExpired));
    $('#btn-account-logout').classList.toggle('hidden', !signedIn);
  }
  $('#btn-account-login').addEventListener('click', () => {
    const meta = readMeta();
    if (meta && meta.email) $('#acc-email').value = meta.email;
    openScreen('email');
  });
  $('#btn-account-logout').addEventListener('click', async () => {
    // Por ahora los datos se quedan en el dispositivo; la pregunta "¿borrar tus datos?" (contrato §5.6) la define el Analista.
    if (!confirm('¿Cerrar sesión en este dispositivo?\n\nTus datos siguen guardados aquí.')) return;
    await remote.auth.signOut({ local: true });
    writeMeta(null);
    renderCard();
    toast('Sesión cerrada');
  });

  // Con sesión guardada: refresca roles en segundo plano. Sin conexión no pasa nada (la sesión sirve offline).
  async function refresh() {
    const s = await remote.auth.session();
    const meta = readMeta();
    if (!s || !meta || meta.userId !== s.user.id) return;
    try {
      const roles = await remote.account.roles();
      writeMeta({ ...readMeta(), roles, authExpired: false });
      await sendConsents();
    } catch (err) {
      if (err && err.code === 'auth') writeMeta({ ...readMeta(), authExpired: true });
    }
    renderCard();
  }

  async function maybeOffer() {
    if (!legalOK()) return;
    const s = await remote.auth.session();
    const meta = readMeta();
    if (s && meta && meta.userId === s.user.id) {
      if (!meta.onboarded) { openScreen('role'); updateRoleFields(); }
      return;
    }
    if (ls.get(SKIP_KEY) === '1') return;
    openScreen('email');
  }

  // ---------- Arranque ----------
  connect().then(async (r) => {
    remote = r;
    await renderCard();
    await maybeOffer();
    refresh();
    document.addEventListener('pg:legal-accepted', () => { maybeOffer(); sendConsents(); });
    window.addEventListener('online', refresh);
  }).catch((err) => {
    console.warn('Cuenta no disponible:', err);
  });
})();
