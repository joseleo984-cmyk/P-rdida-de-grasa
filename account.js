// S3-2 (R1): crear cuenta / entrar con código por correo, sesión persistente y rol (cliente o coach).
// Habla con el servidor SOLO a través de Remote (remote.js); en pruebas, con la implementación falsa (remote-fake.js).
// Sin servidor configurado (config.js vacío) este archivo no hace nada: la app funciona como antes, solo local.
// No sincroniza datos (S3-3) ni muestra el panel del coach (S3-4).
// Sprint 6: autorizaciones A1–A8 (textos en consent-texts.js). Todo lo nuevo vive aquí dentro, así que sin servidor
// configurado no existe nada de esto (el modo local sin cuenta queda intacto).
(function () {
  'use strict';

  const cfg = window.Remote ? Remote.config() : null;
  if (!cfg) return;

  const $ = (sel) => document.querySelector(sel);
  const CT = window.ConsentTexts;
  const nowISO = () => new Date().toISOString();
  const META_KEY = PGNS.key('account');     // { userId, email, roles, onboarded, coach, link, consentsSent }
  const SKIP_KEY = PGNS.key('account-skip'); // "Ahora no": no volver a mostrar la pantalla al abrir
  const STATE_KEY = PGNS.key('v1');
  const INVITE_KEY = PGNS.key('invite');      // A1: invitación pendiente { code, at } (caduca a los 7 días)
  const RESEND_S = 60;
  const OTP_LEN = 6;           // largo del código del correo (el mismo que el campo y su maxlength)
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin espacio */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* nada */ } },
  };
  const readMeta = () => { try { return JSON.parse(ls.get(META_KEY) || 'null'); } catch { return null; } };
  const writeMeta = (m) => (m ? ls.set(META_KEY, JSON.stringify(m)) : ls.del(META_KEY));

  // A1: si la app se abrió con ?c=CODIGO (enlace de invitación del coach), se guarda como invitación pendiente y el
  // parámetro se quita de la barra de direcciones (no queda en el historial ni se comparte sin querer).
  let inviteFresh = false;
  try {
    const got = window.Invite && Invite.codeFromSearch(location.search);
    if (got) {
      ls.set(INVITE_KEY, JSON.stringify(Invite.makePending(got.code)));
      inviteFresh = true;
      history.replaceState(history.state, '', location.pathname + Invite.withoutCode(location.search, location.hash));
    }
  } catch { /* sin history: la app sigue igual */ }
  function pendingInvite() {
    let p = null;
    try { p = JSON.parse(ls.get(INVITE_KEY) || 'null'); } catch { p = null; }
    const st = window.Invite ? Invite.pendingState(p) : 'none';
    if (st === 'expired') ls.del(INVITE_KEY);
    return st === 'ok' ? p : null;
  }
  const clearInvite = () => ls.del(INVITE_KEY);

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
        ? 'No hay internet. Para entrar por primera vez en este teléfono necesitas conexión.'
        : 'No hay internet. Inténtalo cuando vuelva la conexión.';
      case 'invalid_code': return where === 'role'
        ? 'Ese código no existe o ya venció. Pídele a tu coach un enlace nuevo, o escríbelo aquí a mano.'
        : 'Ese código no es el correcto o ya venció. Mira el último correo que te llegó o pide uno nuevo.';
      case 'rate_limited': return 'Demasiados intentos seguidos. Espera un poco y vuelve a intentarlo.';
      case 'invalid': return where === 'email' ? 'Escribe un correo válido, por ejemplo nombre@correo.com.' : (err.message || 'Revisa los datos.');
      case 'auth': return 'Tu sesión se cerró. Entra de nuevo con tu correo.';
      case 'consent_required': return 'Falta aceptar la copia en la nube (datos de salud y servidor). Revísalo en Más → Mis datos y permisos.';
      case 'agreement_required': return 'Para usar esto como coach primero acepta el Acuerdo del coach.';
      default: return 'No pudimos conectarnos. Inténtalo de nuevo en un momento.';
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
      else if (el.dataset.wasDisabled !== undefined) el.disabled = el.dataset.wasDisabled === '1'; // los campos nuevos (A5) conservan lo que traen
    }
    form.setAttribute('aria-busy', on ? 'true' : 'false');
  }
  const STEPS = ['email', 'code', 'owner', 'other', 'cloud', 'role', 'done'];
  function step(name, focusSel) {
    for (const s of STEPS) $('#acc-step-' + s).classList.toggle('hidden', s !== name);
    $('#acc-invite-email').classList.toggle('hidden', !(name === 'email' && pendingInvite()));
    const f = $(focusSel || `#acc-step-${name} h2`);
    if (f) f.focus();
  }
  function openScreen(name = 'email') {
    document.body.classList.add('account-open');
    $('#account').classList.remove('hidden');
    if (name === 'email') renderTermsStep();
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
    // A1 + A2 (sin marcar): sin ellas no se pide el código, porque el correo viaja a Brevo para enviarlo.
    const a1 = $('#acc-a1'), a2 = $('#acc-a2');
    if (!a1.checked || !a2.checked) {
      showError('#acc-email-error', 'Para crear tu cuenta marca las dos casillas. Si prefieres no hacerlo, usa la app sin cuenta: tus datos se quedan solo en tu teléfono.');
      (a1.checked ? a2 : a1).focus();
      return;
    }
    showError('#acc-email-error', '');
    busy(form, true);
    try {
      await remote.auth.sendCode(value);
      termsAt = nowISO();
      email = value.toLowerCase();
      $('#acc-code-email').textContent = email;
      $('#acc-code').value = '';
      codeSent = '';
      showError('#acc-code-error', '');
      startResend();
      step('code', '#acc-code');
    } catch (err) {
      // Si ya se pidió uno hace menos de un minuto, se puede escribir el que llegó.
      if (err && err.code === 'rate_limited' && email === value.toLowerCase()) { startResend(); step('code', '#acc-code'); }
      else { showError('#acc-email-error', errorText(err, 'email')); $('#acc-email').focus(); }
    } finally { busy(form, false); }
  });
  // ---------- A1 + A2 (al crear la cuenta) ----------
  let termsAt = null; // cuándo las marcó la persona (se registran al entrar, ya con cuenta)
  const legalVars = () => { const V = Schema.LEGAL_VERSIONS; return { legalVersion: V.terms === V.privacy ? V.terms : `${V.terms} / ${V.privacy}` }; };
  function fillLinks(el, links) {
    el.replaceChildren(...links.map((l) => {
      const a = document.createElement('a');
      a.className = 'legal-link'; a.href = l.href; a.setAttribute('data-legal', ''); a.textContent = l.label;
      return a;
    }));
  }
  function renderTermsStep() {
    $('#acc-a1-text').textContent = CT.fill(CT.get('A1').body, {});
    $('#acc-a2-text').textContent = CT.fill(CT.get('A2').body, legalVars());
    fillLinks($('#acc-a2-links'), CT.get('A2').links);
    const n = CT.get('A4code'), brevo = $('#acc-brevo');
    const a = document.createElement('a');
    a.className = 'legal-link'; a.href = n.links[0].href; a.setAttribute('data-legal', ''); a.textContent = n.links[0].label;
    brevo.replaceChildren(n.body + ' ', a);
    for (const id of ['#acc-a1', '#acc-a2']) $(id).checked = false;
  }
  async function queueTermsEvents() {
    if (!termsAt) return;
    const at = termsAt;
    termsAt = null;
    await logConsent('A1', 'adult', true, {}, { clientAt: at });
    await logConsent('A2', 'terms', true, legalVars(), { clientAt: at });
    await logConsent('A2', 'privacy', true, legalVars(), { clientAt: at });
  }
  $('#btn-acc-skip').addEventListener('click', () => {
    ls.set(SKIP_KEY, '1');
    closeScreen();
    toast('Cuando quieras, crea tu cuenta en Perfil');
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
  // A4: el código del correo (o el que sugiere el teclado) entra solo al completar los dígitos. `codeSent` evita enviarlo dos veces.
  let codeSent = '';
  $('#acc-code').addEventListener('input', (ev) => {
    const el = ev.target;
    el.value = el.value.replace(/\D/g, '').slice(0, OTP_LEN);
    const form = $('#form-acc-code');
    if (el.value.length === OTP_LEN && el.value !== codeSent && form.getAttribute('aria-busy') !== 'true' && email) { codeSent = el.value; form.requestSubmit(); }
  });
  $('#form-acc-code').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const form = ev.currentTarget;
    if (form.getAttribute('aria-busy') === 'true') return; // ya se está enviando
    const code = $('#acc-code').value.trim();
    codeSent = code;
    if (code.length !== OTP_LEN || !/^\d+$/.test(code)) { showError('#acc-code-error', `El código tiene ${OTP_LEN} dígitos.`); $('#acc-code').focus(); codeSent = ''; return; }
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
      await queueTermsEvents();
      await afterLogin(user.id);
    } catch (err) {
      showError('#acc-code-error', errorText(err, 'code'));
      $('#acc-code').focus();
    } finally { codeSent = ''; busy(form, false); }
  });

  // ---------- Dueño de los datos del teléfono (QA S3-2 O1, decisión del SM) ----------
  // perdida-grasa:owner = userId de la cuenta a la que pertenecen los datos locales (contrato §5.2/§5.6).
  // - Sin datos locales → la cuenta que entra es la dueña.
  // - Datos sin dueño (uso previo sin cuenta) → "¿Estos datos son tuyos?": guardarlos en la cuenta / empezar de cero.
  // - Datos de OTRA cuenta → nunca se mezclan: cerrar sesión o borrar los datos del teléfono.
  // sync.js (S3-3) solo debe subir datos si owner === cuenta actual.
  const OWNER_KEY = PGNS.key('owner');
  let pendingOwner = null;
  function hasLocalData() {
    try {
      const s = JSON.parse(ls.get(STATE_KEY) || 'null');
      if (!s || typeof s !== 'object') return false;
      const n = (o) => (o && typeof o === 'object' ? Object.keys(o).length : 0);
      return !!s.profile || (Array.isArray(s.entries) && s.entries.length > 0) || n(s.foods) > 0 || n(s.habits) > 0;
    } catch { return false; }
  }
  // 'ok' | 'unowned' | 'other'
  function ownership(userId) {
    const owner = ls.get(OWNER_KEY);
    if (owner === userId) return 'ok';
    if (!hasLocalData()) { ls.set(OWNER_KEY, userId); return 'ok'; }
    return owner ? 'other' : 'unowned';
  }
  async function afterLogin(userId) {
    document.dispatchEvent(new Event('pg:signed-in')); // la sincronización arranca al momento (Backend S3-3b)
    const own = ownership(userId);
    if (own === 'unowned') { step('owner'); return; }
    if (own === 'other') { step('other'); return; }
    await continueOnboarding();
  }
  // Lo que la cuenta ya autorizó en otro teléfono (A3, A4, A7…): no se vuelve a pedir lo que sigue vigente.
  async function learnServerConsents() {
    try { const server = await remote.account.consents(); writeMeta(CT.mergeServer(readMeta(), server)); } catch (e) { /* sin conexión: se usa lo local */ }
  }
  async function continueOnboarding(afterCloud = false) {
    await flushConsents();
    await learnServerConsents();
    const meta = readMeta() || {};
    // A3 + A4: la copia en la nube es opcional; se ofrece una vez (después, desde Mis datos y permisos).
    if (!afterCloud && !meta.cloudAsked && !CT.cloudAllowed(meta)) { showCloudStep(); return; }
    if (meta.onboarded) {
      if (handleInvite(meta)) return;
      finish((meta.roles || []).includes('coach') ? 'coach' : 'client');
      return;
    }
    const inv = pendingInvite();
    if (inv) { showInviteRole(inv); return; }
    $('#form-acc-role').reset();
    updateRoleFields();
    step('role');
  }
  // A1: pantalla de vinculación con el código de la invitación ya escrito y "cliente" elegido.
  function showInviteRole(inv) {
    openScreen('role');
    const form = $('#form-acc-role');
    form.reset();
    form.elements.role.value = 'client';
    $('#acc-coach-code').value = inv.code;
    updateRoleFields();
    const ok = Invite.isValidCode(inv.code);
    const note = $('#acc-invite-note');
    note.textContent = ok ? 'Tu coach te invitó. Ya pusimos su código; revisa que sea el correcto.'
      : 'Ese enlace no trae un código válido. Escribe a mano el código que te dio tu coach.';
    note.classList.remove('hidden');
    if (ok) form.requestSubmit(); // comprueba el código y muestra el nombre del coach
    else $('#acc-coach-code').focus();
  }
  // Con invitación pendiente: coach → frase simple; cliente ya vinculado → aviso; cliente sin coach → ofrecer vincularse.
  function handleInvite(meta) {
    const inv = pendingInvite();
    if (!inv) return false;
    if ((meta.roles || []).includes('coach')) { clearInvite(); finish('coach', 'Ese enlace es para clientes: tú ya tienes tu cuenta de coach.'); return true; }
    if (meta.link) { clearInvite(); finish('client', `Ya estás con «${meta.link.businessName}», así que el enlace de invitación no cambió nada.`); return true; }
    showInviteRole(inv);
    return true;
  }
  // Borra los datos del teléfono con el "Borrar todo" de la app (pide su confirmación). Al terminar (evento
  // pg:data-reset) los datos quedan a nombre de esta cuenta y la pantalla legal pide la aceptación de ESTA persona.
  function wipeFor(userId) {
    pendingOwner = userId;
    closeScreen();
    $('#btn-reset').click();
  }
  document.addEventListener('pg:data-reset', () => {
    ls.del(OWNER_KEY);
    if (pendingOwner) { ls.set(OWNER_KEY, pendingOwner); pendingOwner = null; }
    writeMeta(readMeta() ? { ...readMeta(), consentsSent: null } : null);
  });
  $('#btn-owner-mine').addEventListener('click', async () => {
    const meta = readMeta();
    if (!meta) return;
    ls.set(OWNER_KEY, meta.userId);
    if (window.PGSync && PGSync.confirmOwner) await PGSync.confirmOwner().catch(() => {}); // copia previa + dueño + sincroniza
    await continueOnboarding();
  });
  $('#btn-owner-fresh').addEventListener('click', () => { const meta = readMeta(); if (meta) wipeFor(meta.userId); });
  $('#btn-other-wipe').addEventListener('click', () => { const meta = readMeta(); if (meta) wipeFor(meta.userId); });
  $('#btn-other-logout').addEventListener('click', async () => {
    await remote.auth.signOut({ local: true });
    writeMeta(null);
    closeScreen();
    toast('Cerraste sesión. Tus datos siguen en este teléfono');
  });

  // ---------- Paso 3: rol ----------
  function renderA7Box() {
    const t = CT.get('A7');
    $('#acc-a7-intro').textContent = CT.fill(t.intro, {});
    $('#acc-a7-text').textContent = CT.fill(t.body, {});
    fillLinks($('#acc-a7-links'), t.links);
  }
  function updateRoleFields() {
    const role = $('#form-acc-role').elements.role.value; // RadioNodeList: vale aunque el formulario esté ocupado (disabled)
    $('#acc-client-fields').classList.toggle('hidden', role !== 'client');
    $('#acc-coach-fields').classList.toggle('hidden', role !== 'coach');
    const code = $('#acc-coach-code').value.trim();
    if (!previewed || previewed.code !== normCode(code)) { previewed = null; $('#acc-share').classList.add('hidden'); }
    $('#btn-acc-role').textContent = role === 'client' && code && !previewed ? 'Comprobar código' : role === 'client' && previewed ? 'Conectarme y continuar' : 'Continuar';
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
        if (name.length < 2 || name.length > 60) { showError('#acc-role-error', 'Escribe el nombre de tu negocio (de 2 a 60 letras).'); busy(form, false); $('#acc-business').focus(); return; }
        // A7: el acuerdo se acepta ANTES de crear el código de invitación y de ver datos de clientes.
        if (!$('#acc-a7').checked) { showError('#acc-role-error', 'Para ser coach acepta el Acuerdo del coach: marca la casilla.'); busy(form, false); $('#acc-a7').focus(); return; }
        if (!(await acceptStrict('A7', 'coach_agreement'))) { showError('#acc-role-error', 'No pudimos guardar tu aceptación. Revisa tu conexión e inténtalo de nuevo.'); busy(form, false); return; }
        await remote.coach.becomeCoach(name);
        meta.coach = await remote.coach.myCoach();
        meta.roles = await remote.account.roles();
      } else {
        const code = normCode(f.get('coachCode'));
        if (code && !previewed) {
          const { businessName } = await remote.client.previewCode(code);
          previewed = { code, businessName };
          $('#acc-share-title').textContent = `Te vas a conectar con «${businessName}».`;
          renderShareFields($('#acc-share-fields'), businessName, {});
          $('#acc-share').classList.remove('hidden');
          updateRoleFields();
          busy(form, false);
          $('#acc-share-title').setAttribute('tabindex', '-1');
          $('#acc-share-title').focus();
          return;
        }
        if (code && previewed) {
          // Para que el coach vea algo, los datos tienen que estar en la nube: hace falta A3 + A4.
          if (!CT.cloudAllowed(readMeta())) {
            busy(form, false);
            showCloudStep({
              lead: 'Para conectarte con tu coach hace falta la copia en la nube: así puede ver lo que tú decidas compartir.',
              then: () => { step('role', '#acc-share-title'); if (!CT.cloudAllowed(readMeta())) showError('#acc-role-error', 'Sin la copia en la nube no podemos conectarte con tu coach. Puedes activarla cuando quieras en Más → Mis datos y permisos.'); },
            });
            return;
          }
          const shares = { body: true, nutrition: form.elements.share_nutrition.checked, habits: form.elements.share_habits.checked, notes: form.elements.share_notes.checked, photos: false,
            ...(await shareMeta(previewed.businessName)) };
          meta.link = await remote.client.joinCoach(code, shares);
          meta.shareVersion = CT.version('A5');
        }
      }
      meta.onboarded = true;
      // Las autorizaciones se guardaron aparte durante el envío (A7): no se pisan con la copia vieja de meta.
      const now = readMeta() || {};
      writeMeta({ ...now, ...meta, consents: now.consents, consentQueue: now.consentQueue });
      clearInvite();
      finish(role);
    } catch (err) {
      showError('#acc-role-error', errorText(err, 'role'));
    } finally { busy(form, false); }
  });

  // ---------- Paso 4: listo ----------
  function finish(role, note) {
    document.body.classList.add('account-open');
    $('#account').classList.remove('hidden');
    const meta = readMeta() || {};
    const code = $('#acc-done-code');
    if (role === 'coach' && meta.coach && !CT.coachAgreementOK(meta)) {
      $('#acc-done-text').textContent = `Tu cuenta de coach «${meta.coach.businessName}» está lista. Para ver a tus clientes y usar tu código de invitación, primero acepta el Acuerdo del coach en la pestaña Clientes.`;
      code.classList.add('hidden');
    } else if (role === 'coach' && meta.coach) {
      $('#acc-done-text').textContent = `Tu cuenta de coach «${meta.coach.businessName}» está lista. Comparte este código con tus clientes para que se conecten contigo:`;
      code.textContent = meta.coach.inviteCode;
      code.classList.remove('hidden');
    } else {
      $('#acc-done-text').textContent = meta.link ? `Entraste como ${meta.email}. Ya estás con tu coach «${meta.link.businessName}».` : `Entraste como ${meta.email}.`;
      code.classList.add('hidden');
    }
    if (note) $('#acc-done-text').textContent += ' ' + note;
    step('done');
  }
  $('#btn-acc-done').addEventListener('click', () => { closeScreen(); toast('Listo, ya entraste'); });

  // ---------- Autorizaciones (A1–A8) → servidor ----------
  // Cada decisión se guarda primero en el teléfono (meta.consents + cola) y se envía a core.consent_events cuando hay
  // conexión. `textHash` = SHA-256 del texto EXACTO de consent-texts.js (CT.fullText), que es el que se muestra.
  let flushing = null;
  function flushConsents() {
    if (flushing) return flushing;
    flushing = (async () => {
      const m0 = readMeta() || {};
      const q = m0.consentQueue || [];
      if (!q.length || !remote) return true;
      // Como antes: nada se registra mientras no se sepa de quién son los datos de este teléfono (QA S3-2 O1).
      if (m0.userId && ls.get(OWNER_KEY) !== m0.userId) return false;
      try {
        await remote.account.recordConsents(q.map((e) => ({ ...e })));
        writeMeta(CT.dropSent(readMeta(), q.length));
        return true;
      } catch (err) {
        // Un evento que el servidor rechaza por no válido no debe bloquear la cola para siempre.
        if (err && err.code === 'invalid') { writeMeta(CT.dropSent(readMeta(), q.length)); console.warn('Autorización descartada por el servidor'); }
        return false;
      }
    })().finally(() => { flushing = null; });
    return flushing;
  }
  async function logConsent(id, kind, granted, vars = {}, { coachId, clientAt } = {}) {
    const ev = { kind, granted: granted === true, version: CT.version(id), textHash: await Remote.textHash(CT.fullText(id, vars)), clientAt: clientAt || nowISO(), ...(coachId ? { coachId } : {}) };
    writeMeta(CT.applyEvent(readMeta() || {}, ev));
    return ev;
  }
  // Para lo que NO puede quedar "pendiente" (A7): se registra y se envía ahora; si no llega, se deshace y devuelve false.
  async function acceptStrict(id, kind) {
    const prev = readMeta();
    await logConsent(id, kind, true);
    if (await flushConsents()) { document.dispatchEvent(new CustomEvent('pg:consents-changed')); return true; }
    writeMeta(prev);
    return false;
  }
  const shareMeta = async (coach) => ({ version: CT.version('A5'), textHash: await Remote.textHash(CT.fullText('A5', { coach })) });

  // ---------- A3 + A4: copia en la nube ----------
  let cloudThen = null;
  function renderCloudTexts() {
    for (const [id, n] of [['A3', 'a3'], ['A4', 'a4']]) {
      $(`#acc-${n}-text`).textContent = CT.fill(CT.get(id).body, {});
      fillLinks($(`#acc-${n}-links`), CT.get(id).links);
    }
  }
  function showCloudStep({ lead, then } = {}) {
    cloudThen = then || null;
    $('#acc-cloud-lead').textContent = lead || 'Es opcional. Sin ella, tus datos de salud se quedan solo en tu teléfono y la app funciona igual.';
    renderCloudTexts();
    $('#form-acc-cloud').reset();
    showError('#acc-cloud-error', '');
    openScreen('cloud');
  }
  function cloudDone() {
    const t = cloudThen;
    cloudThen = null;
    if (t) t(); else continueOnboarding(true);
  }
  $('#form-acc-cloud').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const form = ev.currentTarget;
    if (!$('#acc-a3').checked || !$('#acc-a4').checked) {
      showError('#acc-cloud-error', 'Para guardar la copia en la nube marca las dos autorizaciones. Si no quieres, pulsa «Ahora no»: la app funciona igual en tu teléfono.');
      ($('#acc-a3').checked ? $('#acc-a4') : $('#acc-a3')).focus();
      return;
    }
    showError('#acc-cloud-error', '');
    busy(form, true);
    try {
      await logConsent('A3', 'sensitive_health', true);
      await logConsent('A4', 'cloud_transfer', true);
      writeMeta({ ...readMeta(), cloudAsked: true });
      await flushConsents();
      document.dispatchEvent(new CustomEvent('pg:cloud-changed'));
    } finally { busy(form, false); }
    cloudDone();
  });
  $('#btn-acc-cloud-skip').addEventListener('click', () => {
    writeMeta({ ...readMeta(), cloudAsked: true });
    cloudDone();
  });

  // ---------- A8: aviso antes de retirar, terminar un vínculo o borrar la cuenta ----------
  let a8Opener = null;
  function a8Confirm({ text, okLabel }) {
    const dlg = $('#sheet-a8');
    return new Promise((resolve) => {
      a8Opener = document.activeElement;
      $('#a8-text').textContent = text;
      $('#a8-ok').textContent = okLabel;
      $('#a8-exported').classList.add('hidden');
      let result = false;
      const done = (v) => { result = v; dlg.close(); };
      const onOk = () => done(true), onCancel = () => done(false);
      const onExport = () => { $('#btn-export').click(); $('#a8-exported').classList.remove('hidden'); };
      const onClose = () => {
        $('#a8-ok').removeEventListener('click', onOk); $('#a8-cancel').removeEventListener('click', onCancel);
        $('#a8-export').removeEventListener('click', onExport); dlg.removeEventListener('close', onClose);
        if (a8Opener && a8Opener.focus) a8Opener.focus();
        a8Opener = null;
        resolve(result);
      };
      $('#a8-ok').addEventListener('click', onOk); $('#a8-cancel').addEventListener('click', onCancel);
      $('#a8-export').addEventListener('click', onExport); dlg.addEventListener('close', onClose);
      dlg.showModal();
      $('#a8-title').focus();
    });
  }

  // ---------- A5: compartir con el coach, por categoría (sin casillas premarcadas) ----------
  function renderShareFields(fs, coach, shares) {
    const t = CT.get('A5'), vars = { coach };
    const legend = document.createElement('legend');
    legend.className = 'small share-intro';
    legend.textContent = CT.fill(t.intro, vars);
    const rows = ['body', 'notes', 'nutrition', 'habits', 'photos'].map((k) => {
      const label = document.createElement('label');
      label.className = 'check share-row';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.name = 'share_' + k;
      if (k === 'body') { input.checked = true; input.disabled = true; }
      else if (k === 'photos') input.disabled = true; // las fotos se piden aparte (A6) y hoy no se suben a la nube
      else input.checked = !!(shares && shares[k]);
      const span = document.createElement('span');
      span.textContent = t.categories[k];
      label.append(input, span);
      return label;
    });
    const out = document.createElement('p');
    out.className = 'small share-outro';
    out.append(CT.fill(t.outro, vars) + ' ');
    const links = document.createElement('span');
    links.className = 'auth-links';
    fillLinks(links, t.links);
    out.append(links);
    fs.replaceChildren(legend, ...rows, out);
  }

  // ---------- Perfil → Cuenta ----------
  async function renderCard() {
    const card = $('#account-card');
    card.classList.remove('hidden');
    const s = remote ? await remote.auth.session().catch(() => null) : null;
    const meta = readMeta();
    const status = $('#account-status'), extra = $('#account-extra');
    if (s && meta && meta.userId === s.user.id) {
      const roles = (meta.roles || []).includes('coach') ? ' Tienes cuenta de coach.' : '';
      status.textContent = `Entraste con ${s.user.email}.${roles}` + (navigator.onLine === false ? ' No hay internet: puedes seguir usando la app con normalidad.' : '');
      extra.textContent = meta.coach ? (CT.coachAgreementOK(meta) ? `Tu código para invitar clientes: ${meta.coach.inviteCode}` : 'Para ver a tus clientes y usar tu código de invitación, acepta el Acuerdo del coach en la pestaña Clientes.') : meta.link ? `Tu coach: ${meta.link.businessName}` : '';
      if (meta.authExpired) extra.textContent = 'Tu sesión se cerró. Entra de nuevo con tu correo (tus datos siguen aquí).';
    } else {
      status.textContent = 'Sin cuenta: tus datos están solo en este teléfono. Crea una cuenta o entra para que queden guardados también en tu cuenta.';
      extra.textContent = '';
    }
    const signedIn = !!(s && meta && meta.userId === s.user.id);
    const isCoach = signedIn && (meta.roles || []).includes('coach');
    $('#btn-account-login').classList.toggle('hidden', signedIn && !(meta && meta.authExpired));
    $('#btn-account-logout').classList.toggle('hidden', !signedIn);
    $('#btn-account-link').classList.toggle('hidden', !signedIn || isCoach || !!meta.link);
    $('#btn-account-coach').classList.toggle('hidden', !isCoach);
    $('#btn-account-cloud').classList.toggle('hidden', !signedIn || CT.cloudAllowed(meta));
    $('#btn-account-delete').classList.toggle('hidden', !signedIn);
    $('#perms-card').classList.toggle('hidden', !signedIn);
    if (signedIn) renderPerms(meta);
    $('#tab-coach').classList.toggle('hidden', !isCoach);
    // Cliente vinculado: qué comparte (lo escribe el propio cliente; el nombre del coach lo escribe otra persona → textContent).
    const sf = $('#form-shares');
    sf.classList.toggle('hidden', !signedIn || !meta.link);
    if (signedIn && meta.link) {
      $('#shares-title').textContent = `Tu coach: «${meta.link.businessName}», desde el ${new Date(meta.link.since).toLocaleDateString('es')}.`;
      // No se vuelve a dibujar mientras la persona está tocando las casillas (se perdería lo que acaba de marcar).
      if (!sf.contains(document.activeElement) || !sf.elements.share_nutrition) renderShareFields($('#shares-fieldset'), meta.link.businessName, meta.link.shares);
      $('#shares-migrate').classList.toggle('hidden', !CT.shareMigrationNeeded(meta));
      const SEE = { nutrition: 'tus comidas', habits: 'tus hábitos', notes: 'tus notas', photos: 'las fotos que marques' };
      const sees = ['tu peso y tus medidas', ...Object.keys(SEE).filter((k) => meta.link.shares && meta.link.shares[k]).map((k) => SEE[k])];
      $('#shares-summary').textContent = `Tu coach puede ver ${sees.length > 1 ? sees.slice(0, -1).join(', ') + ' y ' + sees[sees.length - 1] : sees[0]}.`;
    }
    if (!signedIn) $('#form-logout').classList.add('hidden');
    document.dispatchEvent(new CustomEvent('pg:account-changed', { detail: { signedIn, isCoach } }));
  }
  $('#btn-account-link').addEventListener('click', () => {
    openScreen('role');
    $('#form-acc-role').reset();
    $('#form-acc-role').elements.role.value = 'client';
    const inv = pendingInvite();
    if (inv) $('#acc-coach-code').value = inv.code;
    updateRoleFields();
    $('#acc-coach-code').focus();
  });
  $('#btn-account-coach').addEventListener('click', () => $('#tab-coach').click());
  const SHARE_LABEL = { notes: 'tus notas', nutrition: 'tus comidas', habits: 'tus hábitos', photos: 'tus fotos' };
  $('#form-shares').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.currentTarget;
    const meta = readMeta();
    if (!meta || !meta.link) return;
    const old = meta.link.shares || {};
    const shares = { body: true, nutrition: f.elements.share_nutrition.checked, habits: f.elements.share_habits.checked,
      notes: f.elements.share_notes.checked, photos: false, ...(await shareMeta(meta.link.businessName)) };
    showError('#shares-error', '');
    // A8: quitar una categoría es retirar una autorización.
    const removed = Object.keys(SHARE_LABEL).filter((k) => old[k] && !shares[k]);
    if (removed.length && !(await a8Confirm({ text: CT.A8text.withdraw(`que tu coach vea ${removed.map((k) => SHARE_LABEL[k]).join(', ')}`), okLabel: 'Retirar' }))) { renderCard(); return; }
    busy(f, true);
    try {
      const link = await remote.client.updateShares(shares);
      let next = { ...readMeta(), link };
      // Vínculo creado con textos anteriores (compartir-1): lo que no cambió no genera evento en el servidor, así que la
      // confirmación con los textos nuevos se registra aquí, categoría por categoría.
      if (CT.shareMigrationNeeded(meta)) {
        writeMeta(next);
        const was = (k) => !!old[k], now = (k) => !!(link.shares || {})[k];
        for (const k of ['body', 'notes', 'nutrition', 'habits']) {
          if (k === 'body' || was(k) === now(k)) await logConsent('A5', 'share_' + k, k === 'body' ? true : now(k), { coach: meta.link.businessName }, { coachId: link.coachId });
        }
        next = { ...readMeta(), link };
        await flushConsents();
      }
      writeMeta({ ...next, shareVersion: CT.version('A5') });
      toast('Listo: tu coach verá solo lo que marcaste');
    } catch (err) { showError('#shares-error', errorText(err, 'shares')); }
    finally { busy(f, false); renderCard(); }
  });
  $('#btn-leave-coach').addEventListener('click', async () => {
    const meta = readMeta();
    if (!meta || !meta.link) return;
    if (!(await a8Confirm({ text: CT.A8text.withdraw(`compartir con «${meta.link.businessName}»`), okLabel: 'Dejar de compartir' }))) return;
    try {
      await remote.client.leaveCoach();
      writeMeta({ ...readMeta(), link: null });
      toast('Dejaste de compartir con tu coach');
      renderCard();
      $('#btn-account-link').focus();
    } catch (err) { showError('#shares-error', errorText(err, 'shares')); }
  });
  // ---------- Mis datos y permisos: A3, A4, A6a, A6b (interruptores; opcionales y revocables) ----------
  const AUTH_ROWS = [
    { id: 'A3', kind: 'sensitive_health', que: 'tu autorización de datos de salud en la cuenta', cloud: true },
    { id: 'A4', kind: 'cloud_transfer', que: 'la copia en la nube', cloud: true },
    { id: 'A6a', kind: 'photos_cloud', que: 'la copia de tus fotos en la nube' },
    { id: 'A6b', kind: 'photo_view_coach', que: 'que tu coach vea tus fotos', coach: true },
  ];
  const fmtDate = (iso) => new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
  function renderPerms(meta) {
    const list = $('#perms-list');
    const coachName = meta.link ? meta.link.businessName : 'tu coach';
    const sig = JSON.stringify([coachName, AUTH_ROWS.map((r) => { const c = (meta.consents || {})[r.kind]; return [CT.version(r.id), c && c.granted, c && c.version, c && c.clientAt]; })]);
    if (list.dataset.sig === sig) return;
    if (list.contains(document.activeElement) && list.dataset.sig) return; // no se redibuja mientras la persona toca un interruptor
    list.dataset.sig = sig;
    list.replaceChildren(...AUTH_ROWS.map((r) => {
      const c = (meta.consents || {})[r.kind];
      const on = !!(c && c.granted === true && c.version === CT.version(r.id));
      const row = document.createElement('div');
      row.className = 'auth-row';
      const label = document.createElement('label');
      label.className = 'check';
      const input = document.createElement('input');
      input.type = 'checkbox'; input.checked = on; input.dataset.auth = r.id;
      const span = document.createElement('span');
      span.textContent = CT.fill(CT.get(r.id).body, { coach: coachName });
      label.append(input, span);
      const links = document.createElement('span');
      links.className = 'auth-links';
      fillLinks(links, CT.get(r.id).links);
      const date = document.createElement('p');
      date.className = 'small muted auth-date';
      date.textContent = c && c.clientAt ? (c.granted ? `Autorizada el ${fmtDate(c.clientAt)}.` : `Retirada el ${fmtDate(c.clientAt)}.`) : 'Sin autorizar.';
      row.append(label, links, date);
      return row;
    }));
  }
  $('#perms-list').addEventListener('change', async (ev) => {
    const input = ev.target.closest('input[data-auth]');
    if (!input) return;
    const row = AUTH_ROWS.find((r) => r.id === input.dataset.auth);
    const meta = readMeta() || {};
    const vars = { coach: meta.link ? meta.link.businessName : 'tu coach' };
    const coachId = row.coach && meta.link ? meta.link.coachId : undefined;
    showError('#perms-error', '');
    if (input.checked) {
      await logConsent(row.id, row.kind, true, vars, { coachId });
      if (row.cloud) writeMeta({ ...readMeta(), cloudAsked: true });
      toast('Autorización guardada');
    } else {
      input.checked = true; // vuelve a su sitio hasta que la persona confirme el aviso A8
      if (!(await a8Confirm({ text: CT.A8text.withdraw(row.que), okLabel: 'Retirar' }))) return;
      await logConsent(row.id, row.kind, false, vars, { coachId });
      // Sin la copia en la nube el coach no puede ver nada: el vínculo se termina (A8: «Tu coach deja de verlo ya»).
      if (row.cloud && meta.link) {
        try { await remote.client.leaveCoach(); writeMeta({ ...readMeta(), link: null }); }
        catch (err) { showError('#perms-error', errorText(err, 'shares')); }
      }
      toast('Autorización retirada');
    }
    await flushConsents();
    if (row.cloud) document.dispatchEvent(new CustomEvent('pg:cloud-changed'));
    document.dispatchEvent(new CustomEvent('pg:consents-changed'));
    $('#perms-list').dataset.sig = '';
    renderCard();
    const again = document.querySelector(`#perms-list input[data-auth="${row.id}"]`);
    if (again) again.focus();
  });
  $('#btn-account-cloud').addEventListener('click', () => {
    showCloudStep({ then: () => { closeScreen(); if (CT.cloudAllowed(readMeta())) toast('Copia en la nube activada'); } });
  });
  // A8 al borrar la cuenta: se borra TODO lo de la nube; el teléfono conserva su copia. El servidor guarda solo la prueba mínima y sin nombre.
  $('#btn-account-delete').addEventListener('click', async () => {
    if (!(await a8Confirm({ text: CT.A8text.delete(), okLabel: 'Borrar mi cuenta' }))) return;
    try {
      await remote.account.deleteAccount();
      writeMeta(null);
      ls.del(OWNER_KEY); // los datos del teléfono quedan sin dueño: si entra otra cuenta, se le pregunta como siempre
      await renderCard();
      toast('Cuenta borrada. Tus datos siguen en este teléfono');
      $('#btn-account-login').focus();
    } catch (err) { toast(errorText(err, 'delete')); }
  });
  $('#btn-account-login').addEventListener('click', () => {
    const meta = readMeta();
    if (meta && meta.email) $('#acc-email').value = meta.email;
    openScreen('email');
  });
  // Cerrar sesión: pregunta si borrar también los datos del teléfono, con "No" por defecto (decisión del SM;
  // el texto definitivo lo da el Analista, contrato §5.6).
  $('#btn-account-logout').addEventListener('click', () => {
    const f = $('#form-logout');
    f.reset();
    f.classList.remove('hidden');
    f.querySelector('input[value=no]').focus();
  });
  $('#btn-logout-cancel').addEventListener('click', () => { $('#form-logout').classList.add('hidden'); $('#btn-account-logout').focus(); });
  $('#form-logout').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const wipe = ev.currentTarget.elements.wipe.value === 'yes';
    await remote.auth.signOut({ local: true });
    writeMeta(null);
    ev.currentTarget.classList.add('hidden');
    await renderCard();
    toast('Sesión cerrada');
    if (wipe) $('#btn-reset').click(); // "Borrar todo" de la app (pide su propia confirmación)
    else $('#btn-account-login').focus();
  });

  // Con sesión guardada: refresca roles en segundo plano. Sin conexión no pasa nada (la sesión sirve offline).
  async function refresh() {
    const s = await remote.auth.session();
    const meta = readMeta();
    if (!s || !meta || meta.userId !== s.user.id) return;
    try {
      const roles = await remote.account.roles();
      const next = { ...readMeta(), roles, authExpired: false };
      if (roles.includes('coach')) next.coach = await remote.coach.myCoach();
      else next.link = await remote.client.myLink();
      writeMeta(next);
      // Autorizaciones: lo pendiente sube y se aprende lo que ya se aceptó en otro teléfono (A7, A3, A4…).
      await flushConsents();
      try { const server = await remote.account.consents(); writeMeta(CT.mergeServer(readMeta(), server)); } catch (e) { if (e && e.code === 'auth') throw e; }
      document.dispatchEvent(new CustomEvent('pg:consents-changed'));
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
      const own = ownership(s.user.id);
      if (own !== 'ok') { openScreen(own === 'other' ? 'other' : 'owner'); return; }
      if (!meta.cloudAsked && !CT.cloudAllowed(meta)) { showCloudStep(); return; } // también cuentas de antes del Sprint 6: se pregunta una vez
      if (!meta.onboarded) { const inv = pendingInvite(); if (inv) showInviteRole(inv); else { openScreen('role'); updateRoleFields(); } return; }
      if (inviteFresh) handleInvite(meta);
      return;
    }
    if (ls.get(SKIP_KEY) === '1' && !(inviteFresh && pendingInvite())) return;
    openScreen('email');
  }

  // ---------- Arranque ----------
  connect().then(async (r) => {
    remote = r;
    // Puente para coach-panel.js (S3-4): el mismo Remote y los metadatos de la cuenta. Sin servidor no existe.
    window.PGAccount = { remote, meta: readMeta, setMeta: (m) => writeMeta({ ...readMeta(), ...m }), refresh, errorText,
      // Sprint 6: A7 (acuerdo del coach) y A8 los usa coach-panel.js; ConsentTexts decide si el acuerdo está vigente.
      acceptCoachAgreement: () => acceptStrict('A7', 'coach_agreement'), a8Confirm, fillLinks };
    renderTermsStep();
    renderA7Box();
    await renderCard();
    await maybeOffer();
    refresh();
    document.addEventListener('pg:legal-accepted', () => { maybeOffer(); flushConsents(); });
    // Sprint 7: el servidor respondió consent_required. Se envía lo pendiente y se aprende lo que dice la cuenta; solo si había
    // algo pendiente y llegó, se reintenta la sincronización (así no hay bucle: sin cola, queda en "falta aceptar").
    let fixing = false;
    document.addEventListener('pg:consent-required', async () => {
      if (fixing) return;
      fixing = true;
      try {
        const had = ((readMeta() || {}).consentQueue || []).length > 0;
        const sent = await flushConsents();
        await learnServerConsents();
        document.dispatchEvent(new CustomEvent('pg:consents-changed'));
        if (had && sent) document.dispatchEvent(new CustomEvent('pg:cloud-changed'));
      } finally { fixing = false; }
    });
    window.addEventListener('online', refresh);
    document.dispatchEvent(new CustomEvent('pg:account-ready'));
  }).catch((err) => {
    console.warn('Cuenta no disponible:', err);
  });
})();
