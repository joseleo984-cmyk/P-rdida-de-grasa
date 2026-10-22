// Sprint 10: lógica PURA de la copia del acuerdo del coach por correo (sin Deno, sin red): se prueba con `node --test`.
// La usan manejador.mjs e index.ts. Reglas: el texto NO lo manda el cliente (se resuelve por versión y se verifica con la huella
// del evento registrado), el correo sale del JWT, todo lo que entra en el HTML se escapa y nada del contenido va a los logs.
import { TEXTOS } from './textos-acuerdo.mjs';

export const KIND = 'coach_agreement';
export const APP = 'grasa';
export const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 envío por persona y versión cada hora
export const RATE_KEY = 'acuerdo_copia'; // dentro de app_metadata del usuario (solo el servidor lo escribe)
const HASH_RE = /^[0-9a-f]{64}$/;
const VERSION_RE = /^[\w.-]{1,20}$/;

// Mismo cálculo que remote.js textHash y core.record_consent: SHA-256 hex del texto con saltos de línea normalizados a \n.
export const normText = (t) => String(t == null ? '' : t).replace(/\r\n?/g, '\n');
export async function sha256Hex(text) {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(normText(text)));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export const escapeHtml = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Del resultado de core.my_consents(app) (una fila por tipo, la más reciente) toma el evento del acuerdo.
// Devuelve null si no hay evento o no está concedido; si lo está, { version, textHash, clientAt }.
export function grantedAgreement(rows) {
  const list = Array.isArray(rows) ? rows : rows == null ? [] : [rows];
  const r = list.find((x) => x && x.kind === KIND);
  if (!r || r.granted !== true) return null;
  const textHash = String(r.text_hash || '');
  const version = String(r.version || '');
  if (!HASH_RE.test(textHash) || !VERSION_RE.test(version)) return null;
  return { version, textHash, clientAt: r.client_at || null };
}

// Resuelve el texto por versión y comprueba que su huella es la registrada. `textos` y `hashFn` se inyectan en las pruebas.
// → { ok: true, text } | { ok: false, code: 'unknown_version' | 'hash_mismatch' }
export async function verifyAgreement({ version, textHash }, { textos = TEXTOS, hashFn = sha256Hex } = {}) {
  if (!Object.prototype.hasOwnProperty.call(textos, version)) return { ok: false, code: 'unknown_version' };
  const text = textos[version];
  if ((await hashFn(text)) !== textHash) return { ok: false, code: 'hash_mismatch' };
  return { ok: true, text };
}

// ---------- Límite: 1 envío por persona y versión por hora ----------
// `meta` = app_metadata del usuario (o {}). Devuelve { allowed, retryAfterSec, next } donde `next` es el app_metadata a guardar.
export function decideRate(meta, version, now, windowMs = RATE_WINDOW_MS) {
  const cur = (meta && typeof meta[RATE_KEY] === 'object' && meta[RATE_KEY]) || {};
  const last = Date.parse(cur[version] || '');
  if (Number.isFinite(last) && now - last < windowMs && now >= last) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((windowMs - (now - last)) / 1000)), next: null };
  }
  // Solo se guardan las 5 versiones más recientes (el objeto no crece sin fin).
  const entries = Object.entries({ ...cur, [version]: new Date(now).toISOString() }).sort((a, b) => Date.parse(a[1]) - Date.parse(b[1])).slice(-5);
  return { allowed: true, retryAfterSec: 0, next: { ...(meta || {}), [RATE_KEY]: Object.fromEntries(entries) } };
}
// Deshace la reserva si el envío falló (para poder reintentar enseguida). `before` = valor anterior de esa versión o undefined.
export function undoRate(meta, version, before) {
  const cur = { ...((meta && meta[RATE_KEY]) || {}) };
  if (before === undefined) delete cur[version]; else cur[version] = before;
  return { ...(meta || {}), [RATE_KEY]: cur };
}

// ---------- Correo ----------
export function formatWhen(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return 'No disponible';
  const d = new Date(t);
  const co = d.toLocaleString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  return `${co} (hora de Colombia) · ${d.toISOString()} (UTC)`;
}

// Arma el cuerpo para la API transaccional de Brevo. `sender` = { email, name }; `to` = correo del JWT.
export function buildEmail({ to, text, version, textHash, clientAt, sender }) {
  const when = formatWhen(clientAt);
  const subject = `Copia de tu Acuerdo del coach (versión ${version})`;
  const intro = 'Esta es la copia del Acuerdo del coach que aceptaste en la plataforma. Guárdala: el texto de abajo es exactamente el que aceptaste.';
  const note = 'Si no fuiste tú, responde a este correo o escríbenos para que revisemos tu cuenta.';
  const textContent = [
    intro, '', '--- Texto aceptado ---', normText(text), '--- Fin del texto ---', '',
    `Versión: ${version}`, `Fecha y hora de aceptación: ${when}`, `Huella (SHA-256): ${textHash}`, '', note, '',
  ].join('\n');
  const htmlContent = `<!doctype html><html lang="es"><body style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.5">
<h2 style="font-size:18px">Copia de tu Acuerdo del coach</h2>
<p>${escapeHtml(intro)}</p>
<pre style="white-space:pre-wrap;font-family:inherit;border:1px solid #ccc;border-radius:8px;padding:12px;background:#f7f7f7">${escapeHtml(normText(text))}</pre>
<table role="presentation" style="border-collapse:collapse;font-size:14px">
<tr><td style="padding:2px 12px 2px 0"><strong>Versión</strong></td><td>${escapeHtml(version)}</td></tr>
<tr><td style="padding:2px 12px 2px 0"><strong>Aceptado</strong></td><td>${escapeHtml(when)}</td></tr>
<tr><td style="padding:2px 12px 2px 0;vertical-align:top"><strong>Huella (SHA-256)</strong></td><td style="font-family:monospace;word-break:break-all">${escapeHtml(textHash)}</td></tr>
</table>
<p style="font-size:13px;color:#555">${escapeHtml(note)}</p>
</body></html>`;
  return { sender: { email: sender.email, ...(sender.name ? { name: sender.name } : {}) }, to: [{ email: to }], subject, htmlContent, textContent };
}

export const EMAIL_RE = /^[^\s@<>"',;]{1,64}@[^\s@<>"',;]{1,190}\.[^\s@<>"',;]{2,}$/;
export const isEmail = (e) => typeof e === 'string' && EMAIL_RE.test(e);
