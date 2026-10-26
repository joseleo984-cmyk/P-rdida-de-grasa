// Política v1.1 (25/10/2026) y v1.2 (26/10/2026, concepto 7): versiones PUBLICADAS de los textos legales (legal/VERSIONS.json) y aviso informativo en pantalla.
// - Texto y botón LITERALES del anexo del concepto 2, punto 1 (tests/legal-literal.test.js). «[enlace]» es variable de formato: se reemplaza por
//   el enlace real a la política (la palabra «aquí» queda enlazada y el marcador no se escribe).
// - Sale UNA vez al iniciar sesión, para asesorados y coaches (cuenta con sesión), no tapa nada (va en el flujo de la página, no flotando) y no exige
//   re-aceptación (concepto 2: «sin requerir reaceptación forzada»). Se cierra con «Entendido».
// - Se recuerda que se vio EN ESTE DISPOSITIVO (localStorage, por cuenta y por versión del aviso). No hay en el servidor un patrón para «avisos vistos»
//   (consent_events es solo para autorizaciones y su tipo está cerrado por un CHECK); guardar esto allí sería registrar un consentimiento que el abogado
//   dijo que no hace falta. Consecuencia aceptada: en otro teléfono la persona lo verá una vez más.
// - versions(): lee legal/VERSIONS.json (el SW lo precachea). Lo usa también «Exportar a Excel» para habilitar la descarga (Exportar.policyGate).
(function (root) {
  'use strict';
  // v1.2 (concepto 7, punto 5): el aviso vigente. El de la v1.1 (concepto 2, anexo 1) queda como historial: quien no lo vio, ve solo el de la v1.2.
  const TEXT = 'Actualizamos nuestra Política de Tratamiento de Datos (v1.2) para incluir la opción voluntaria de retos y ligas de constancia en equipo. Conócela aquí [enlace].';
  const TEXT_V11 = 'Actualizamos nuestra Política de Tratamiento de Datos Personales (v1.1) para detallar el uso de tus registros (peso, medidas y comidas), el alcance de las estimaciones nutricionales y el funcionamiento de las alertas operativas de seguridad. Conócela aquí [enlace].';
  const BUTTON = 'Entendido';
  const HREF = 'legal/privacidad.html';
  const MARK = ' [enlace]';
  function parts() {
    const i = TEXT.indexOf(MARK);
    const before = TEXT.slice(0, i);
    return { before: before.replace(/aquí$/, ''), link: 'aquí', after: TEXT.slice(i + MARK.length), href: HREF };
  }
  // ¿Se muestra? Solo con sesión, con el aviso activo en VERSIONS.json y si esta cuenta no lo cerró ya en este dispositivo.
  const seenKey = (userId, versions) => `${userId}|${versions.privacy.notice.id}`;
  function shouldShow({ versions, userId, seen }) {
    const n = versions && versions.privacy && versions.privacy.notice;
    if (!userId || !n || n.active !== true || !n.id) return false;
    return !(Array.isArray(seen) && seen.includes(seenKey(userId, versions)));
  }
  const api = { TEXT, TEXT_V11, BUTTON, HREF, parts, shouldShow, seenKey };

  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.AvisoPolitica = api;
  if (typeof document === 'undefined') return;

  let cache = null;
  api.versions = function versions(force) {
    if (!cache || force) {
      cache = fetch('legal/VERSIONS.json', { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error('VERSIONS.json ' + r.status); return r.json(); })
        .catch((e) => { cache = null; throw e; });
    }
    return cache;
  };
  const KEY = root.PGNS ? PGNS.key('aviso-politica') : 'perdida-grasa:aviso-politica';
  const readSeen = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
  const writeSeen = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v.slice(-20))); } catch { /* sin almacenamiento: volverá a salir */ } };
  const $ = (s) => document.querySelector(s);
  let current = null;   // { userId, versions } del aviso a la vista

  function render() {
    const box = $('#aviso-politica');
    if (!box) return;
    const p = parts();
    const txt = $('#aviso-politica-text');
    const a = document.createElement('a');
    a.href = p.href; a.className = 'legal-link'; a.setAttribute('data-legal', ''); a.textContent = p.link;
    txt.replaceChildren(document.createTextNode(p.before), a, document.createTextNode(p.after));
    $('#btn-aviso-politica').textContent = BUTTON;
  }
  async function check(signedIn) {
    const box = $('#aviso-politica');
    if (!box) return;
    const meta = signedIn && root.PGAccount && PGAccount.meta ? PGAccount.meta() : null;
    const userId = meta && meta.userId;
    if (!userId) { box.classList.add('hidden'); current = null; return; }
    let versions;
    try { versions = await api.versions(); } catch { return; }   // sin el archivo (sin conexión y sin caché): no se muestra nada
    if (!shouldShow({ versions, userId, seen: readSeen() })) { box.classList.add('hidden'); return; }
    current = { userId, versions };
    render();
    box.classList.remove('hidden');
  }
  function dismiss() {
    const box = $('#aviso-politica');
    if (current) writeSeen([...readSeen(), seenKey(current.userId, current.versions)]);
    current = null;
    const hadFocus = box.contains(document.activeElement);
    box.classList.add('hidden');
    if (hadFocus) { const h = document.querySelector('.view.active h2, .view.active [tabindex="-1"]'); if (h && h.focus) h.focus(); }
  }
  function wire() {
    if (!$('#aviso-politica')) return;
    $('#btn-aviso-politica').addEventListener('click', dismiss);
    document.addEventListener('pg:account-changed', (ev) => { check(!!(ev.detail && ev.detail.signedIn)); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})(typeof window !== 'undefined' ? window : globalThis);
