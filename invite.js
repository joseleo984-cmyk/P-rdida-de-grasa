// A1: enlace de invitación por WhatsApp. Lógica pura (sin DOM), probada en tests/invite.test.js.
// El código de coach tiene el formato del servidor: 6 caracteres de este alfabeto (sin 0/O/1/I/L).
// Todo texto que escribe una persona (nombre del cliente, nombre comercial) se limpia aquí y se escapa/codifica
// al usarlo: esc() en el DOM, encodeURIComponent en la URL de WhatsApp.
(function (root) {
  'use strict';
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const CODE_RE = new RegExp('^[' + ALPHABET + ']{6}$');
  const PENDING_DAYS = 7;

  const normalizeCode = (c) => String(c == null ? '' : c).toUpperCase().replace(/[\s-]/g, '');
  const isValidCode = (c) => CODE_RE.test(normalizeCode(c));
  // Nombre para el mensaje: una sola línea, sin caracteres de control, máx. 40.
  const cleanName = (n) => String(n == null ? '' : n).replace(/[\u0000-\u001f\u007f​-‏‪-‮]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);

  // Enlace: sirve igual en la raíz y en /pruebas/ porque parte del path actual.
  function inviteLink(loc, code) {
    const c = normalizeCode(code);
    if (!isValidCode(c)) return '';
    return String(loc.origin || '') + String(loc.pathname || '/') + '?c=' + c;
  }
  function inviteMessage({ clientName, businessName, link }) {
    const who = cleanName(clientName);
    const biz = cleanName(businessName) || 'tu coach';
    return `${who ? `Hola ${who}` : 'Hola'}, soy ${biz}. Te invito a seguir tu progreso conmigo en Pérdida de Grasa. Toca este enlace y listo: ${link}`;
  }
  const whatsappUrl = (message) => 'https://wa.me/?text=' + encodeURIComponent(message);

  // Código que trae la URL (?c=…): devuelve { code } (normalizado, máx. 12 caracteres, puede no ser válido) o null.
  function codeFromSearch(search) {
    try {
      const v = new URLSearchParams(search || '').get('c');
      if (v == null) return null;
      return { code: normalizeCode(v).slice(0, 12) };
    } catch { return null; }
  }
  // La misma URL sin el parámetro c (conserva el resto: ?remote=fake en pruebas, #hash).
  function withoutCode(search, hash) {
    const p = new URLSearchParams(search || '');
    p.delete('c');
    const s = p.toString();
    return (s ? '?' + s : '') + (hash || '');
  }

  // Invitación pendiente: { code, at } con caducidad de 7 días.
  const makePending = (code, now = Date.now()) => ({ code: normalizeCode(code).slice(0, 12), at: new Date(now).toISOString() });
  function pendingState(p, now = Date.now()) { // 'none' | 'expired' | 'ok'
    if (!p || typeof p.code !== 'string' || !p.code) return 'none';
    const t = Date.parse(p.at || '');
    if (!Number.isFinite(t) || now - t > PENDING_DAYS * 86400000 || now < t - 60000) return 'expired';
    return 'ok';
  }

  const api = { ALPHABET, PENDING_DAYS, normalizeCode, isValidCode, cleanName, inviteLink, inviteMessage, whatsappUrl, codeFromSearch, withoutCode, makePending, pendingState };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Invite = api;
})(typeof window !== 'undefined' ? window : globalThis);
