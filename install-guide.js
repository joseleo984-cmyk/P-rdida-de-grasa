// A3: guía para instalar la app en iPhone/iPad (Safari no ofrece un botón de "instalar").
// Lógica pura (probada en tests/install-guide.test.js) + pegamento mínimo con la página, que solo corre en el navegador.
(function (root) {
  'use strict';

  // Safari de iPhone/iPad: dispositivo iOS con Safari (no Chrome, Firefox, Edge, Opera ni navegadores dentro de otras apps).
  // iPadOS 13+ se presenta como Mac: se reconoce por la pantalla táctil (maxTouchPoints).
  function esSafariIOS(ua, maxTouchPoints) {
    ua = String(ua || '');
    const ios = /\b(iPhone|iPad|iPod)\b/.test(ua) || (/\bMacintosh\b/.test(ua) && Number(maxTouchPoints) > 1);
    if (!ios) return false;
    if (/\b(CriOS|FxiOS|EdgiOS|OPiOS|OPT|GSA|DuckDuckGo|Instagram|FBAN|FBAV|Line|MicroMessenger|Snapchat|TikTok)\b/i.test(ua)) return false;
    return /\bSafari\//.test(ua) && /\bVersion\//.test(ua);
  }
  // ¿Mostrar la tarjeta "Instala la app en tu iPhone"? Solo en Safari de iPhone/iPad, con la app sin instalar y sin haberla descartado.
  function debeMostrarGuiaInstalacion({ ua, standalone, descartada, maxTouchPoints } = {}) {
    return esSafariIOS(ua, maxTouchPoints) && !standalone && !descartada;
  }

  const api = { esSafariIOS, debeMostrarGuiaInstalacion };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.InstallGuide = api;

  // ---------- Pegamento con la página (solo navegador) ----------
  if (typeof document === 'undefined' || !root.PGNS) return;
  const $ = (sel) => document.querySelector(sel);
  const KEY = root.PGNS.key('install-guide'); // 'ok' (Entendido) | 'never' (No mostrar más)
  const ls = {
    get() { try { return localStorage.getItem(KEY); } catch { return null; } },
    set(v) { try { localStorage.setItem(KEY, v); } catch { /* sin espacio */ } },
  };
  const standalone = () => {
    try { return navigator.standalone === true || (root.matchMedia && root.matchMedia('(display-mode: standalone)').matches); } catch { return false; }
  };
  const legalOK = () => {
    if (document.body.classList.contains('consent-open')) return false;
    try { return root.Schema.consentStatus((JSON.parse(localStorage.getItem(root.PGNS.key('v1')) || 'null') || {}).consent) === 'ok'; } catch { return false; }
  };
  const fillSteps = (el) => { el.innerHTML = ''; el.appendChild($('#install-steps').content.cloneNode(true)); };

  function refresh() {
    const card = $('#install-card');
    if (!card) return;
    const show = legalOK() && debeMostrarGuiaInstalacion({ ua: navigator.userAgent, standalone: standalone(), descartada: !!ls.get(), maxTouchPoints: navigator.maxTouchPoints });
    if (show && card.classList.contains('hidden')) fillSteps($('#install-card-steps'));
    card.classList.toggle('hidden', !show);
  }
  let opener = null;
  // Acceso permanente (botón "Cómo instalar la app" del menú Más / Perfil → Datos).
  function openGuide(from) {
    const dlg = $('#install-dialog');
    if (!dlg || typeof dlg.showModal !== 'function') return;
    opener = from || document.activeElement;
    fillSteps($('#install-dialog-steps'));
    $('#install-dialog-note').classList.toggle('hidden', esSafariIOS(navigator.userAgent, navigator.maxTouchPoints));
    dlg.showModal();
    $('#install-dialog-close').focus();
  }
  function wire() {
    if (!$('#install-card')) return;
    const dismiss = (v) => { ls.set(v); $('#install-card').classList.add('hidden'); const t = document.querySelector('.tabbar button.on') || $('#tab-panel'); if (t) t.focus(); };
    $('#btn-install-ok').addEventListener('click', () => dismiss('ok'));
    $('#btn-install-never').addEventListener('click', () => dismiss('never'));
    $('#install-dialog-close').addEventListener('click', () => $('#install-dialog').close());
    $('#install-dialog').addEventListener('close', () => { if (opener && opener.focus) opener.focus(); opener = null; });
    document.addEventListener('click', (ev) => { const b = ev.target.closest('[data-install-guide]'); if (b) openGuide(b); });
    document.addEventListener('pg:legal-accepted', refresh);
    refresh();
  }
  root.InstallGuide.open = openGuide;
  root.InstallGuide.refresh = refresh;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})(typeof window !== 'undefined' ? window : globalThis);
