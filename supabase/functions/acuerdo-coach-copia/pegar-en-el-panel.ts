// GENERADO por scripts/build-funcion-acuerdo.js: la función «acuerdo-coach-copia» en UN solo archivo para pegarla en el
// editor del panel de Supabase (Edge Functions). NO editar a mano: se rehace con npm run build:funcion.
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

// GENERADO por scripts/build-funcion-acuerdo.js a partir de consent-texts.js y consent-texts-solo.js: NO editar a mano (npm run build:funcion).
// versión → texto exacto del Acuerdo del coach (A7), el que se muestra y cuyo SHA-256 se registra al aceptar.
const TEXTOS = {
  "0.3-A7": "Para ver datos de clientes, acepta el Acuerdo del coach. En resumen: usas los datos solo para acompañar a ese cliente; no descargas, capturas ni compartes fotos; guardas confidencialidad; no das planes de alimentación terapéuticos si no eres profesional habilitado; avisas incidentes en máximo 24 horas; borras al terminar el vínculo; y respondes por tu propio uso.\nAcepto el Acuerdo del coach.\n[Leer acuerdo completo]",
  "0.4-A7-coach": "Para ver datos de clientes, acepta el Acuerdo del coach. En resumen: usas los datos solo para acompañar a ese cliente; no descargas, capturas ni compartes fotos; guardas confidencialidad; no das planes de alimentación terapéuticos si no eres profesional habilitado; avisas incidentes en máximo 24 horas; borras al terminar el vínculo; y respondes por tu propio uso.\nCláusula 13. Contenidos Cargados, Propiedad Intelectual y Derechos de Imagen:\n- El Coach declara y garantiza que es el titular exclusivo o cuenta con las licencias y autorizaciones necesarias sobre todos los planes, rutinas, textos, imágenes, animaciones (GIF) y videos que cargue en la plataforma.\n- Queda estrictamente prohibido cargar material que contenga la imagen de terceras personas sin su autorización previa y expresa, o que infrinja derechos de propiedad intelectual, intimidad, o constituya publicidad engañosa.\n- En caso de que el material reproduzca la imagen personal del propio Coach, este autoriza expresamente a José Granados a hospedarla, reproducirla y exhibirla temporalmente dentro del entorno privado de la plataforma exclusivamente para los asesorados vinculados a su cuenta.\n- La plataforma se reserva el derecho de retirar de manera unilateral y sin previo aviso cualquier contenido que sea objeto de reclamo por parte de terceros o que infrinja las políticas del servicio, sin derecho a indemnización. El Coach mantendrá indemne a José Granados frente a cualquier reclamo, demanda, sanción o perjuicio derivado del material subido.\nAcepto el Acuerdo del coach.\n[Leer acuerdo completo]",
  "0.5-A7-coach": "Para ver datos de clientes, acepta el Acuerdo del coach. En resumen: usas los datos solo para acompañar a ese cliente; no descargas, capturas ni compartes fotos; guardas confidencialidad; no das planes de alimentación terapéuticos si no eres profesional habilitado; avisas incidentes en máximo 24 horas; borras al terminar el vínculo; y respondes por tu propio uso.\nCláusula 13. Contenidos Cargados, Propiedad Intelectual y Derechos de Imagen:\n- El Coach declara y garantiza que es el titular exclusivo o cuenta con las licencias y autorizaciones necesarias sobre todos los planes, rutinas, textos, imágenes, animaciones (GIF) y videos que cargue en la plataforma.\n- Queda estrictamente prohibido cargar material que contenga la imagen de terceras personas sin su autorización previa y expresa, o que infrinja derechos de propiedad intelectual, intimidad, o constituya publicidad engañosa.\n- En caso de que el material reproduzca la imagen personal del propio Coach, este autoriza expresamente a José Granados a hospedarla, reproducirla y exhibirla temporalmente dentro del entorno privado de la plataforma exclusivamente para los asesorados vinculados a su cuenta.\n- La plataforma se reserva el derecho de retirar de manera unilateral y sin previo aviso cualquier contenido que sea objeto de reclamo por parte de terceros o que infrinja las políticas del servicio, sin derecho a indemnización. El Coach mantendrá indemne a José Granados frente a cualquier reclamo, demanda, sanción o perjuicio derivado del material subido.\nCláusula 14. Descarga y custodia local de datos de los asesorados\nAl utilizar la función de exportación o descarga de registros de sus asesorados (archivos en formato Excel, CSV o similares), el Coach asume la condición de Responsable directo e independiente del tratamiento de dicha información a partir del momento de la descarga. El Coach se obliga expresamente a: (i) almacenar los archivos en dispositivos seguros, privados y protegidos contra accesos no autorizados; (ii) utilizar la información exclusivamente para la planificación y seguimiento de la asesoría del cliente; (iii) abstenerse de divulgar, transferir o comercializar estos datos con terceros; y (iv) eliminar de forma definitiva los archivos locales una vez finalice la relación comercial con el asesorado. La Plataforma queda totalmente indemne y exenta de responsabilidad ante cualquier pérdida, filtración o uso indebido de los datos que ocurra fuera de sus servidores una vez exportados por el Coach.\nAcepto el Acuerdo del coach.\n[Leer acuerdo completo]",
  "0.6-A7-coach": "Para ver datos de clientes, acepta el Acuerdo del coach. En resumen: usas los datos solo para acompañar a ese cliente; no descargas, capturas ni compartes fotos; guardas confidencialidad; no das planes de alimentación terapéuticos si no eres profesional habilitado; avisas incidentes en máximo 24 horas; borras al terminar el vínculo; y respondes por tu propio uso.\nCláusula 13. Contenidos Cargados, Propiedad Intelectual y Derechos de Imagen:\n- El Coach declara y garantiza que es el titular exclusivo o cuenta con las licencias y autorizaciones necesarias sobre todos los planes, rutinas, textos, imágenes, animaciones (GIF) y videos que cargue en la plataforma.\n- Queda estrictamente prohibido cargar material que contenga la imagen de terceras personas sin su autorización previa y expresa, o que infrinja derechos de propiedad intelectual, intimidad, o constituya publicidad engañosa.\n- En caso de que el material reproduzca la imagen personal del propio Coach, este autoriza expresamente a José Granados a hospedarla, reproducirla y exhibirla temporalmente dentro del entorno privado de la plataforma exclusivamente para los asesorados vinculados a su cuenta.\n- La plataforma se reserva el derecho de retirar de manera unilateral y sin previo aviso cualquier contenido que sea objeto de reclamo por parte de terceros o que infrinja las políticas del servicio, sin derecho a indemnización. El Coach mantendrá indemne a José Granados frente a cualquier reclamo, demanda, sanción o perjuicio derivado del material subido.\nCláusula 14. Descarga y custodia local de datos de los asesorados\nAl utilizar la función de exportación o descarga de registros de sus asesorados (archivos en formato Excel, CSV o similares), el Coach asume la condición de Responsable directo e independiente del tratamiento de dicha información a partir del momento de la descarga. El Coach se obliga expresamente a: (i) almacenar los archivos en dispositivos seguros, privados y protegidos contra accesos no autorizados; (ii) utilizar la información exclusivamente para la planificación y seguimiento de la asesoría del cliente; (iii) abstenerse de divulgar, transferir o comercializar estos datos con terceros; y (iv) eliminar de forma definitiva los archivos locales una vez finalice la relación comercial con el asesorado. La Plataforma queda totalmente indemne y exenta de responsabilidad ante cualquier pérdida, filtración o uso indebido de los datos que ocurra fuera de sus servidores una vez exportados por el Coach.\nCláusula 15. Manejo ético y confidencialidad en dinámicas grupales y ligas de constancia:\nEn caso de habilitar o participar en funciones de ligas comunitarias o retos de constancia entre sus clientes, el Coach asume formalmente las siguientes obligaciones: (i) abstenerse de revelar, asociar o divulgar por cualquier medio (verbal, escrito, redes sociales o chats grupales) la identidad real de las personas que se encuentren detrás de los alias de la plataforma; (ii) no utilizar las posiciones relativas o tablas de puntos como mecanismo de coacción, presión psicológica, burla, reproche o exposición pública; y (iii) abstenerse de realizar y compartir capturas de pantalla de las tablas grupales. La inobservancia de esta disposición constituirá incumplimiento grave del presente acuerdo y hará responsable al Coach de los perjuicios y violaciones a la intimidad que se ocasionen a los usuarios.\nAcepto el Acuerdo del coach.\n[Leer acuerdo completo]",
  "0.7-A7-coach": "Para ver datos de clientes, acepta el Acuerdo del coach. En resumen: usas los datos solo para acompañar a ese cliente; no descargas, capturas ni compartes fotos; guardas confidencialidad; no das planes de alimentación terapéuticos si no eres profesional habilitado; avisas incidentes en máximo 24 horas; borras al terminar el vínculo; y respondes por tu propio uso.\nCláusula 13. Contenidos Cargados, Propiedad Intelectual y Derechos de Imagen:\n- El Coach declara y garantiza que es el titular exclusivo o cuenta con las licencias y autorizaciones necesarias sobre todos los planes, rutinas, textos, imágenes, animaciones (GIF) y videos que cargue en la plataforma.\n- Queda estrictamente prohibido cargar material que contenga la imagen de terceras personas sin su autorización previa y expresa, o que infrinja derechos de propiedad intelectual, intimidad, o constituya publicidad engañosa.\n- En caso de que el material reproduzca la imagen personal del propio Coach, este autoriza expresamente a José Granados a hospedarla, reproducirla y exhibirla temporalmente dentro del entorno privado de la plataforma exclusivamente para los asesorados vinculados a su cuenta.\n- La plataforma se reserva el derecho de retirar de manera unilateral y sin previo aviso cualquier contenido que sea objeto de reclamo por parte de terceros o que infrinja las políticas del servicio, sin derecho a indemnización. El Coach mantendrá indemne a José Granados frente a cualquier reclamo, demanda, sanción o perjuicio derivado del material subido.\nCláusula 14. Descarga y custodia local de datos de los asesorados\nAl utilizar la función de exportación o descarga de registros de sus asesorados (archivos en formato Excel, CSV o similares), el Coach asume la condición de Responsable directo e independiente del tratamiento de dicha información a partir del momento de la descarga. El Coach se obliga expresamente a: (i) almacenar los archivos en dispositivos seguros, privados y protegidos contra accesos no autorizados; (ii) utilizar la información exclusivamente para la planificación y seguimiento de la asesoría del cliente; (iii) abstenerse de divulgar, transferir o comercializar estos datos con terceros; y (iv) eliminar de forma definitiva los archivos locales una vez finalice la relación comercial con el asesorado. La Plataforma queda totalmente indemne y exenta de responsabilidad ante cualquier pérdida, filtración o uso indebido de los datos que ocurra fuera de sus servidores una vez exportados por el Coach.\nCláusula 15. Manejo ético y confidencialidad en dinámicas grupales y ligas de constancia:\nEn caso de habilitar o participar en funciones de ligas comunitarias o retos de constancia entre sus clientes, el Coach asume formalmente las siguientes obligaciones: (i) abstenerse de revelar, asociar o divulgar por cualquier medio (verbal, escrito, redes sociales o chats grupales) la identidad real de las personas que se encuentren detrás de los alias de la plataforma; (ii) no utilizar las posiciones relativas o tablas de puntos como mecanismo de coacción, presión psicológica, burla, reproche o exposición pública; y (iii) abstenerse de realizar y compartir capturas de pantalla de las tablas grupales. La inobservancia de esta disposición constituirá incumplimiento grave del presente acuerdo y hará responsable al Coach de los perjuicios y violaciones a la intimidad que se ocasionen a los usuarios.\nCláusula 16. Prohibición de pagos y responsabilidad sobre incentivos.\n- Queda estrictamente prohibido al Coach ofrecer, prometer, sortear o entregar sumas de dinero en efectivo, transferencias bancarias, criptomonedas o cualquier medio de pago líquido equivalente como premio, incentivo o recompensa dentro del marco de la plataforma.\n- Cualquier estímulo, cortesía o premio en especie (tales como artículos deportivos, sesiones gratuitas, planes, bonos, entre otros) que el Coach decida ofrecer corre por su cuenta y riesgo, y es de su exclusiva y entera responsabilidad. El Coach asume la obligación de entrega, cumplimiento y garantía, eximiendo de forma expresa y manteniendo indemne a la plataforma y a José Granados frente a cualquier reclamación, queja o demanda de terceros derivada de la oferta o materialización de dichos estímulos.\nAcepto el Acuerdo del coach.\n[Leer acuerdo completo]",
  "0.8-A7-coach": "Para ver datos de clientes, acepta el Acuerdo del coach. En resumen: usas los datos solo para acompañar a ese cliente; no descargas, capturas ni compartes fotos; guardas confidencialidad; no das planes de alimentación terapéuticos si no eres profesional habilitado; avisas incidentes en máximo 24 horas; borras al terminar el vínculo; y respondes por tu propio uso.\nCláusula 13. Contenidos Cargados, Propiedad Intelectual y Derechos de Imagen:\n- El Coach declara y garantiza que es el titular exclusivo o cuenta con las licencias y autorizaciones necesarias sobre todos los planes, rutinas, textos, imágenes, animaciones (GIF) y videos que cargue en la plataforma.\n- Queda estrictamente prohibido cargar material que contenga la imagen de terceras personas sin su autorización previa y expresa, o que infrinja derechos de propiedad intelectual, intimidad, o constituya publicidad engañosa.\n- En caso de que el material reproduzca la imagen personal del propio Coach, este autoriza expresamente a José Granados a hospedarla, reproducirla y exhibirla temporalmente dentro del entorno privado de la plataforma exclusivamente para los asesorados vinculados a su cuenta.\n- La plataforma se reserva el derecho de retirar de manera unilateral y sin previo aviso cualquier contenido que sea objeto de reclamo por parte de terceros o que infrinja las políticas del servicio, sin derecho a indemnización. El Coach mantendrá indemne a José Granados frente a cualquier reclamo, demanda, sanción o perjuicio derivado del material subido.\nCláusula 14. Descarga y custodia local de datos de los asesorados\nAl utilizar la función de exportación o descarga de registros de sus asesorados (archivos en formato Excel, CSV o similares), el Coach asume la condición de Responsable directo e independiente del tratamiento de dicha información a partir del momento de la descarga. El Coach se obliga expresamente a: (i) almacenar los archivos en dispositivos seguros, privados y protegidos contra accesos no autorizados; (ii) utilizar la información exclusivamente para la planificación y seguimiento de la asesoría del cliente; (iii) abstenerse de divulgar, transferir o comercializar estos datos con terceros; y (iv) eliminar de forma definitiva los archivos locales una vez finalice la relación comercial con el asesorado. La Plataforma queda totalmente indemne y exenta de responsabilidad ante cualquier pérdida, filtración o uso indebido de los datos que ocurra fuera de sus servidores una vez exportados por el Coach.\nCláusula 15. Manejo ético y confidencialidad en dinámicas grupales y ligas de constancia:\nEn caso de habilitar o participar en funciones de ligas comunitarias o retos de constancia entre sus clientes, el Coach asume formalmente las siguientes obligaciones: (i) abstenerse de revelar, asociar o divulgar por cualquier medio (verbal, escrito, redes sociales o chats grupales) la identidad real de las personas que se encuentren detrás de los alias de la plataforma; (ii) no utilizar las posiciones relativas o tablas de puntos como mecanismo de coacción, presión psicológica, burla, reproche o exposición pública; y (iii) abstenerse de realizar y compartir capturas de pantalla de las tablas grupales. La inobservancia de esta disposición constituirá incumplimiento grave del presente acuerdo y hará responsable al Coach de los perjuicios y violaciones a la intimidad que se ocasionen a los usuarios.\nCláusula 16. Prohibición de pagos y responsabilidad sobre incentivos.\n- Queda estrictamente prohibido al Coach ofrecer, prometer, sortear o entregar sumas de dinero en efectivo, transferencias bancarias, criptomonedas o cualquier medio de pago líquido equivalente como premio, incentivo o recompensa dentro del marco de la plataforma.\n- Cualquier estímulo, cortesía o premio en especie (tales como artículos deportivos, sesiones gratuitas, planes, bonos, entre otros) que el Coach decida ofrecer corre por su cuenta y riesgo, y es de su exclusiva y entera responsabilidad. El Coach asume la obligación de entrega, cumplimiento y garantía, eximiendo de forma expresa y manteniendo indemne a la plataforma y a José Granados frente a cualquier reclamación, queja o demanda de terceros derivada de la oferta o materialización de dichos estímulos.\nHe leído y acepto el Acuerdo del Coach (versión 0.8), comprometiéndome a respetar los límites éticos y legales del servicio, la confidencialidad de mis asesorados y la prohibición estricta de descargar, capturar o difundir sus fotografías corporales o datos sensibles fuera de la plataforma.\n[Leer acuerdo completo]"
};

// Sprint 10: lógica PURA de la copia del acuerdo del coach por correo (sin Deno, sin red): se prueba con `node --test`.
// La usan manejador.mjs e index.ts. Reglas: el texto NO lo manda el cliente (se resuelve por versión y se verifica con la huella
// del evento registrado), el correo sale del JWT, todo lo que entra en el HTML se escapa y nada del contenido va a los logs.

const KIND = 'coach_agreement';
const APP = 'grasa';
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 envío por persona y versión cada hora
const RATE_KEY = 'acuerdo_copia'; // dentro de app_metadata del usuario (solo el servidor lo escribe)
const HASH_RE = /^[0-9a-f]{64}$/;
const VERSION_RE = /^[\w.-]{1,20}$/;

// Mismo cálculo que remote.js textHash y core.record_consent: SHA-256 hex del texto con saltos de línea normalizados a \n.
const normText = (t) => String(t == null ? '' : t).replace(/\r\n?/g, '\n');
async function sha256Hex(text) {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(normText(text)));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

const escapeHtml = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Del resultado de core.my_consents(app) (una fila por tipo, la más reciente) toma el evento del acuerdo.
// Devuelve null si no hay evento o no está concedido; si lo está, { version, textHash, clientAt }.
function grantedAgreement(rows) {
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
async function verifyAgreement({ version, textHash }, { textos = TEXTOS, hashFn = sha256Hex } = {}) {
  if (!Object.prototype.hasOwnProperty.call(textos, version)) return { ok: false, code: 'unknown_version' };
  const text = textos[version];
  if ((await hashFn(text)) !== textHash) return { ok: false, code: 'hash_mismatch' };
  return { ok: true, text };
}

// ---------- Límite: 1 envío por persona y versión por hora ----------
// `meta` = app_metadata del usuario (o {}). Devuelve { allowed, retryAfterSec, next } donde `next` es el app_metadata a guardar.
function decideRate(meta, version, now, windowMs = RATE_WINDOW_MS) {
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
function undoRate(meta, version, before) {
  const cur = { ...((meta && meta[RATE_KEY]) || {}) };
  if (before === undefined) delete cur[version]; else cur[version] = before;
  return { ...(meta || {}), [RATE_KEY]: cur };
}

// ---------- Correo ----------
function formatWhen(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return 'No disponible';
  const d = new Date(t);
  const co = d.toLocaleString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  return `${co} (hora de Colombia) · ${d.toISOString()} (UTC)`;
}

// Arma el cuerpo para la API transaccional de Brevo. `sender` = { email, name }; `to` = correo del JWT.
function buildEmail({ to, text, version, textHash, clientAt, sender }) {
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

const EMAIL_RE = /^[^\s@<>"',;]{1,64}@[^\s@<>"',;]{1,190}\.[^\s@<>"',;]{2,}$/;
const isEmail = (e) => typeof e === 'string' && EMAIL_RE.test(e);

// Sprint 10: el «manejador» de la función `acuerdo-coach-copia`, con todo lo externo INYECTADO (env, fetch, clientes de
// Supabase, reloj). index.ts lo conecta a Deno; las pruebas (tests/acuerdo-coach-copia.test.js) lo usan con dobles.
// Respuestas: JSON { ok: true } o { ok: false, error: '<código>' } — nunca el contenido del correo ni datos personales.

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const CORS = {
  'Access-Control-Allow-Origin': '*', // la autorización va en el JWT (cabecera), no en cookies
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status, body, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json', ...extra } });
const err = (status, error, extra) => json(status, { ok: false, error }, extra);
// Solo códigos y estados en los logs: jamás el correo, el texto ni lo que responde Brevo.
const log = (deps, ...a) => { try { (deps.log || console.error)('acuerdo-coach-copia:', ...a); } catch { /* nada */ } };

// Sin base de datos nueva: la cuenta recuerda cuándo se envió (app_metadata, que solo el servidor puede escribir). Si la función no
// tiene la llave de servicio, queda un límite en memoria (menos fiable, pero sigue frenando el abuso).
const memory = new Map();
async function readMeta(deps, userId) {
  const admin = deps.getAdminClient && deps.getAdminClient();
  if (!admin) return { admin: null, meta: memory.get(userId) || {} };
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data || !data.user) throw new Error('admin_read');
  return { admin, meta: data.user.app_metadata || {} };
}
async function writeMeta(deps, admin, userId, meta) {
  if (!admin) { memory.set(userId, meta); return; }
  const { error } = await admin.auth.admin.updateUserById(userId, { app_metadata: meta });
  if (error) throw new Error('admin_write');
}

async function handle(req, deps) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return err(405, 'method_not_allowed');
  // El cuerpo de la petición se IGNORA a propósito: ni el correo, ni el texto, ni la versión salen del cliente.

  const apiKey = deps.env('BREVO_API_KEY');
  const senderEmail = deps.env('BREVO_SENDER_EMAIL');
  const senderName = deps.env('BREVO_SENDER_NAME') || '';
  if (!apiKey || !isEmail(senderEmail || '')) { log(deps, 'not_configured'); return err(503, 'not_configured'); }

  const auth = req.headers.get('authorization') || '';
  const token = (auth.match(/^Bearer\s+(.+)$/i) || [])[1];
  if (!token) return err(401, 'unauthorized');
  const userClient = deps.getUserClient(auth, req.headers.get('apikey') || '');

  const { data: ud, error: ue } = await userClient.auth.getUser(token);
  const user = ud && ud.user;
  if (ue || !user || !user.id || !isEmail(user.email || '')) return err(401, 'unauthorized'); // el correo viene del JWT validado

  // El ÚLTIMO evento del acuerdo, leído con la sesión de la propia persona (core.my_consents solo ve sus eventos).
  const { data: rows, error: ce } = await userClient.schema('core').rpc('my_consents', { p_app: deps.app || APP });
  if (ce) { log(deps, 'consents_error'); return err(502, 'consents_unavailable'); }
  const ev = grantedAgreement(rows);
  if (!ev) return err(403, 'agreement_not_granted');

  const v = await verifyAgreement(ev, deps.verifyOpts);
  if (!v.ok) { log(deps, v.code, ev.version); return err(409, v.code); } // no se envía nada que no coincida con la huella registrada

  let admin, meta;
  try { ({ admin, meta } = await readMeta(deps, user.id)); } catch { log(deps, 'rate_state_error'); return err(502, 'rate_state_unavailable'); }
  const now = (deps.now || Date.now)();
  const rate = decideRate(meta, ev.version, now);
  if (!rate.allowed) return err(429, 'rate_limited', { 'Retry-After': String(rate.retryAfterSec) });
  const before = (meta[RATE_KEY] || {})[ev.version];
  try { await writeMeta(deps, admin, user.id, rate.next); } catch { log(deps, 'rate_state_error'); return err(502, 'rate_state_unavailable'); }

  const payload = buildEmail({ to: user.email, text: v.text, version: ev.version, textHash: ev.textHash, clientAt: ev.clientAt, sender: { email: senderEmail, name: senderName } });
  let res;
  try {
    res = await deps.fetch(BREVO_URL, {
      method: 'POST',
      headers: { 'api-key': apiKey, accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined,
    });
  } catch { res = null; }
  if (!res || !res.ok) {
    log(deps, 'brevo_failed', res ? res.status : 'sin_respuesta');
    try { await writeMeta(deps, admin, user.id, undoRate(rate.next, ev.version, before)); } catch { /* el límite se libera solo en una hora */ }
    return err(502, 'send_failed');
  }
  log(deps, 'sent', ev.version);
  return json(200, { ok: true, version: ev.version });
}

// Sprint 10: Edge Function `acuerdo-coach-copia` (Supabase, Deno). Tras aceptar el Acuerdo del coach (A7), le manda al coach por
// Brevo una copia del texto aceptado. Deja «Verify JWT» ACTIVADO. Los secretos se leen SOLO de los secretos de la función:
//   BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME  (nada de esto vive en el repo ni lo manda la app).
// Toda la lógica está en ../_shared/*.mjs (probada con node --test); este archivo solo la conecta a Deno y a Supabase.
// Si lo pegas en el editor del panel (sin terminal), usa pegar-en-el-panel.ts: es lo mismo en un solo archivo.

const env = (k: string): string | undefined => Deno.env.get(k) || undefined;

Deno.serve((req: Request) =>
  handle(req, {
    env,
    fetch: (...a: Parameters<typeof fetch>) => fetch(...a),
    // Cliente con la sesión de la PERSONA (su JWT): es el que lee su último evento del acuerdo.
    getUserClient: (authHeader: string, apikey: string) =>
      createClient(env('SUPABASE_URL')!, apikey || env('SUPABASE_ANON_KEY') || '', {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
      }),
    // Cliente de servicio (solo para recordar cuándo se envió, límite de 1 por hora). Sin la llave, el límite queda en memoria.
    getAdminClient: () => {
      const key = env('SUPABASE_SERVICE_ROLE_KEY');
      return key ? createClient(env('SUPABASE_URL')!, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
    },
  }),
);
