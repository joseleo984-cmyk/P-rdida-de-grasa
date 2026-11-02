// Avisos push (R1 v1.19): Más → «Avisos en tu teléfono». Solo producto coach, solo para quien tiene coach (los avisos son del acompañamiento).
// Consentimiento «justo a tiempo» (concepto jurídico del 1/11/2026): el texto literal A11 sale solo cuando la persona decide activar los avisos y,
// al tocar «Continuar y permitir», se registra el consentimiento `push` y recién entonces el teléfono muestra su diálogo «Permitir notificaciones».
// Un solo permiso para el canal + interruptores por tipo de aviso. Los avisos NO llevan datos de salud: el servidor solo manda el TIPO y las frases
// fijas viven en sw.js. Apagar los avisos borra el identificador del dispositivo del servidor.
(function (root) {
  'use strict';
  const b64u = (k) => { const p = '='.repeat((4 - (k.length % 4)) % 4); const s = atob((k + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
  const api = { b64u };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.PushView = api;
  if (typeof document === 'undefined') return;

  const $ = (s) => document.querySelector(s);
  const ua = navigator.userAgent || '';
  // Entorno del navegador; las pruebas lo sustituyen con window.__pgPushEnv.
  const realEnv = {
    supported: () => 'serviceWorker' in navigator && 'PushManager' in root && 'Notification' in root,
    needsInstall: () => /iphone|ipad|ipod/i.test(ua) && !(navigator.standalone === true || (root.matchMedia && root.matchMedia('(display-mode: standalone)').matches)),
    permission: () => Notification.permission,
    request: () => Notification.requestPermission(),
    async subscribe(key) {
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(key) }));
      const j = sub.toJSON();
      return { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth };
    },
    async unsubscribe() {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) return null;
      const ep = sub.endpoint; await sub.unsubscribe(); return ep;
    },
  };
  const env = () => root.__pgPushEnv || realEnv;
  const remote = () => root.PGAccount && root.PGAccount.remote && root.PGAccount.remote.push;
  const say = (t) => { $('#push-msg').textContent = t || ''; };
  const show = (panel) => { for (const id of ['consent', 'on', 'unsupported']) $('#push-' + id).hidden = id !== panel; };
  const busy = (on) => { for (const b of document.querySelectorAll('#push-dialog button')) b.disabled = !!on; };

  function fillText() {
    const t = root.ConsentTexts && root.ConsentTexts.TEXTS.A11;
    if (!t) return false;
    $('#push-title').textContent = t.title;
    // Capa 1 (resumen literal) con «Política de Datos» enlazada a la capa 2 (la Política completa, sin salir del formulario).
    const body = $('#push-body'), i = t.body.lastIndexOf(t.linkText);
    const a = document.createElement('a'); a.href = 'legal/privacidad.html'; a.className = 'legal-link'; a.setAttribute('data-legal', ''); a.textContent = t.linkText;
    body.replaceChildren(document.createTextNode(t.body.slice(0, i)), a, document.createTextNode(t.body.slice(i + t.linkText.length)));
    for (const el of document.querySelectorAll('.push-note')) el.textContent = t.note;
    $('#push-yes').textContent = t.buttons.yes;
    $('#push-no').textContent = t.buttons.no;
    return true;
  }

  async function open() {
    const d = $('#push-dialog');
    if (!d || !fillText()) return;
    say('');
    if (!env().supported() || env().needsInstall()) { show('unsupported'); }
    else {
      show('consent');
      try {
        const s = await remote().state();
        if (s.consent && s.devices > 0 && env().permission() === 'granted') {
          $('#push-coach').checked = s.coachMsgs; $('#push-routines').checked = s.routines;
          show('on');
        }
      } catch { say('No pudimos revisar tus avisos. Revisa tu conexión.'); }
    }
    if (!d.open) d.showModal();
    $('#push-title').focus({ preventScroll: true });
  }

  async function activate() {
    busy(true); say('');
    const A = root.PGAccount;
    try {
      // Dentro del toque: se registra el consentimiento y se pide el permiso del teléfono (iOS exige que sea en el mismo gesto).
      const consent = A.setPushConsent(true);
      const perm = env().request();
      const [okConsent, permission] = await Promise.all([consent, perm]);
      if (!okConsent) { say('No pudimos guardar tu autorización. Revisa tu conexión e inténtalo de nuevo.'); return; }
      if (permission !== 'granted') {
        await A.setPushConsent(false);
        say('Tu teléfono no permitió los avisos, así que quedaron desactivados. Puedes cambiarlo en los ajustes del teléfono.');
        return;
      }
      const key = await remote().publicKey();
      const sub = await env().subscribe(key);
      await remote().register(sub);
      const s = await remote().state();
      $('#push-coach').checked = s.coachMsgs; $('#push-routines').checked = s.routines;
      show('on'); say('Avisos activados.');
    } catch (e) {
      say(e && e.code === 'unavailable' ? 'Los avisos no están disponibles por ahora. Inténtalo más tarde.' : 'No pudimos activar los avisos. Inténtalo de nuevo.');
    } finally { busy(false); $('#push-title').focus({ preventScroll: true }); }
  }

  async function deactivate() {
    busy(true); say('');
    try {
      await env().unsubscribe().catch(() => null);
      await remote().off();
      await root.PGAccount.setPushConsent(false);
      show('consent'); say('Avisos desactivados. Se borró el identificador de tu teléfono.');
    } catch { say('No pudimos desactivar los avisos. Revisa tu conexión e inténtalo de nuevo.'); }
    finally { busy(false); }
  }

  async function savePrefs() {
    try { await remote().setPrefs({ coachMsgs: $('#push-coach').checked, routines: $('#push-routines').checked }); say('Guardado.'); }
    catch { say('No pudimos guardar el cambio. Revisa tu conexión.'); }
  }

  function wire() {
    const row = $('#row-avisos');
    if (!row) return;
    row.addEventListener('click', open);
    $('#push-yes').addEventListener('click', activate);
    $('#push-no').addEventListener('click', () => $('#push-dialog').close());
    $('#push-off').addEventListener('click', deactivate);
    for (const id of ['#push-coach', '#push-routines']) $(id).addEventListener('change', savePrefs);
    for (const b of document.querySelectorAll('#push-dialog [data-push-close]')) b.addEventListener('click', () => $('#push-dialog').close());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})(typeof window !== 'undefined' ? window : globalThis);
