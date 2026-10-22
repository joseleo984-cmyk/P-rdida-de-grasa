// Sprint 10: lógica pura de «Mi acuerdo» (coach): qué se muestra del acuerdo aceptado y los archivos de la copia descargable.
// Sin DOM (se prueba en tests/acuerdo-view.test.js). Regla: se muestra el texto EXACTO de la versión registrada, y solo si su
// SHA-256 coincide con la huella guardada; si no, no se enseña un texto que no se pueda demostrar.
(function (root) {
  'use strict';
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shortHash = (h) => (typeof h === 'string' && h.length >= 20 ? `${h.slice(0, 8)}…${h.slice(-8)}` : String(h || ''));
  const validMs = (iso) => { const t = Date.parse(iso || ''); return Number.isFinite(t) ? t : null; };
  // "22 de octubre de 2026, 3:30 p. m." (zona del dispositivo; `tz` solo para pruebas)
  function when(iso, tz) {
    const t = validMs(iso);
    if (t == null) return 'No disponible';
    return new Date(t).toLocaleString('es', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz });
  }

  // meta = meta de account.js (consents.coach_agreement = { granted, version, textHash, clientAt }); CT = ConsentTexts; hashFn = Remote.textHash.
  // state: 'none' (sin aceptar o retirado) | 'ok' (vigente) | 'outdated' (hay una versión más nueva: pedir re-aceptar) | 'mismatch' (no se puede probar el texto).
  async function resolve(meta, CT, hashFn) {
    const c = meta && meta.consents && meta.consents.coach_agreement;
    if (!c || c.granted !== true) return { state: 'none', currentVersion: CT.version('A7') };
    const currentVersion = CT.version('A7');
    const base = { version: c.version, hash: c.textHash || '', hashShort: shortHash(c.textHash), at: c.clientAt || null, currentVersion };
    const text = CT.agreementText(c.version);
    const proven = text != null && (await hashFn(text)) === c.textHash;
    const state = c.version !== currentVersion ? 'outdated' : proven ? 'ok' : 'mismatch';
    return { ...base, state, text: proven ? text : null };
  }

  const FILE_BASE = (version) => 'acuerdo-del-coach-' + String(version || 'sin-version').replace(/[^\w.-]+/g, '_');
  const meta4 = (r, who) => [
    ...(who ? [['Cuenta', who]] : []), ['Versión del acuerdo', r.version], ['Aceptado el', when(r.at)], ['Huella (SHA-256)', r.hash],
  ];
  const NOTE = 'La huella es la firma digital del texto exacto que aceptaste. Si cambia una sola letra del texto, la huella cambia. Guarda este archivo como prueba de lo que aceptaste.';

  // Copia descargable en texto plano.
  function fileText(r, who) {
    return ['Acuerdo del coach: copia de lo que aceptaste', '', '--- Texto aceptado ---', r.text, '--- Fin del texto ---', '', ...meta4(r, who).map(([k, v]) => `${k}: ${v}`), '', NOTE, ''].join('\n');
  }
  // Copia descargable en HTML imprimible (sin dependencias ni scripts externos; todo escapado).
  function fileHtml(r, who) {
    const rows = meta4(r, who).map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td${k.startsWith('Huella') ? ' class="mono"' : ''}>${esc(v)}</td></tr>`).join('');
    return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Acuerdo del coach (versión ${esc(r.version)})</title>
<style>body{font:16px/1.5 system-ui,Arial,sans-serif;max-width:42rem;margin:0 auto;padding:16px;color:#111}h1{font-size:1.25rem}pre{white-space:pre-wrap;word-break:break-word;font:inherit;border:1px solid #bbb;border-radius:8px;padding:12px;background:#f7f7f7}table{border-collapse:collapse;width:100%}th,td{text-align:left;vertical-align:top;padding:4px 8px 4px 0}th{white-space:nowrap}.mono{font-family:ui-monospace,Menlo,monospace;word-break:break-all}.n{font-size:.875rem;color:#444}@media print{body{padding:0}}</style></head>
<body><h1>Acuerdo del coach: copia de lo que aceptaste</h1>
<pre>${esc(r.text)}</pre>
<table>${rows}</table>
<p class="n">${esc(NOTE)}</p></body></html>
`;
  }
  const fileName = (r, ext = 'html') => `${FILE_BASE(r.version)}.${ext}`;

  const COPY_TEXT = {
    sent: 'Te enviamos una copia a tu correo.',
    rate_limited: 'Ya te enviamos una copia hace poco. Revisa tu correo (y la carpeta de correo no deseado) o inténtalo más tarde.',
    offline: 'Sin internet: no pudimos enviar la copia. Inténtalo de nuevo cuando vuelva.',
    auth: 'Tu sesión se cerró. Entra de nuevo con tu correo para pedir la copia.',
    unavailable: 'Por ahora no pudimos enviar la copia por correo. Tu aceptación ya quedó guardada y puedes descargar la copia aquí.',
  };
  // Código de RemoteError → clave de COPY_TEXT.
  const copyKey = (code) => (code === 'rate_limited' ? 'rate_limited' : code === 'offline' ? 'offline' : code === 'auth' ? 'auth' : 'unavailable');

  const api = { resolve, shortHash, when, fileText, fileHtml, fileName, COPY_TEXT, copyKey };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AcuerdoView = api;
})(typeof window !== 'undefined' ? window : globalThis);
