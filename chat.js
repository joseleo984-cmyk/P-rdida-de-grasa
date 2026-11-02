// Chat entre asesorado y coach (R1 v1.22; concepto jurídico 14, 2/11/2026). Textos LITERALES del abogado y ayudas puras (probadas con node --test).
// Solo texto, hasta 1000 caracteres, solo con vínculo activo. Al desvincularse, el coach pierde el acceso de inmediato.
(function (root) {
  'use strict';
  const TEXTS = {
    // Aviso previo: la primera vez que se abre el chat (asesorado). No lleva casilla nueva: el chat es inherente al vínculo (A5c).
    aviso: { version: '0.1-C1', title: 'Chat con tu coach',
      body: 'Usa este espacio exclusivo para dudas sobre tu progreso y tu plan de entrenamiento. Por tu seguridad, no compartas contraseñas, documentos de identidad, historias clínicas ni datos bancarios. Recuerda que tu coach te orienta en hábitos deportivos, pero no emite diagnósticos médicos ni tratamientos.',
      button: 'Entendido' },
  };
  // Cláusula nueva del Acuerdo del Coach (1.0-A7-coach); el abogado no le dio número: se numera 18, la siguiente libre tras la 17 (pendiente de su confirmación).
  TEXTS.clausula = 'Cláusula 18. Uso del chat y confidencialidad de las comunicaciones: El Coach se obliga a mantener en estricta reserva todas las conversaciones sostenidas con sus asesorados a través del chat de la plataforma. Queda expresamente prohibido realizar capturas de pantalla, extraer, descargar, reenviar o publicar el contenido del chat, así como utilizarlo para fines distintos al acompañamiento deportivo. Asimismo, el Coach se compromete a mantener un lenguaje respetuoso y profesional, absteniéndose de solicitar datos financieros, información clínica reservada o de emitir diagnósticos y tratamientos médicos por este medio.';
  const MAX = 1000;
  const fullText = () => TEXTS.aviso.title + '\n' + TEXTS.aviso.body;
  // Validación del mensaje (la misma regla que el servidor): texto plano, 1 a 1000 caracteres tras recortar.
  function clean(body) { const t = String(body == null ? '' : body).trim(); return t.length >= 1 && t.length <= MAX ? t : null; }
  // Marca de hora corta para la burbuja: «hoy 14:05» o «3 nov 14:05».
  function stamp(iso, now) {
    const d = new Date(iso), n = now ? new Date(now) : new Date();
    if (isNaN(d)) return '';
    const hm = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
    const same = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
    return same ? `hoy ${hm}` : `${d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })} ${hm}`;
  }
  const api = { TEXTS, MAX, fullText, clean, stamp };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Chat = api;
})(typeof window !== 'undefined' ? window : globalThis);
