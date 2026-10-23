// Sprint 11: textos de la entrada «solo con cuenta» (soloNube, SOLO en la copia de pruebas). Se añaden a ConsentTexts sin tocar los
// textos v0.1/v0.3 existentes. BORRADOR DE PRUEBA, PENDIENTE DEL ABOGADO (equipo/legal/borradores/autorizacion-unica-prueba.md).
//   AU   Autorización única: reemplaza a A3 (datos) + A4 (nube y Brevo) con UNA sola casilla. Registra los MISMOS eventos que exige el
//        servidor (sensitive_health y cloud_transfer), con la huella de ESTE texto. Las fotos y compartir con el coach siguen aparte.
//   A5c  Compartir con el coach en el producto «coach»: solo medidas (obligatorio), hábitos (opcional) y fotos (se piden aparte).
// Misma regla de siempre: si cambia una palabra, sube la versión; la huella es el SHA-256 del texto EXACTO mostrado.
(function (root) {
  'use strict';
  const CT = typeof module !== 'undefined' && module.exports ? require('./consent-texts.js') : root.ConsentTexts;
  const POLICY = 'legal/privacidad.html';

  CT.TEXTS.AU = {
    version: '0.1-AU-prueba', kinds: ['sensitive_health', 'cloud_transfer'],
    body: 'Autorizo a José Granados a tratar mis medidas de cuerpo y mis hábitos (agua, pasos, sueño y entrenamiento) para registrar mi progreso, a guardarlos en la nube (Supabase, servidores en EE. UU.) y a procesar mi correo con Brevo. Conozco que es una transmisión internacional a proveedores encargados donde las medidas de protección pueden diferir de las de Colombia. Entiendo que esta autorización es necesaria para usar la app y que puedo retirarla borrando mi cuenta.',
    links: [{ label: 'Política de datos', href: POLICY }],
  };
  CT.TEXTS.A5c = {
    version: 'compartir-c1', kinds: ['share_body', 'share_notes', 'share_nutrition', 'share_habits', 'share_photos'],
    intro: 'Compartir con {coach} (él es responsable de cómo usa lo que ves):',
    categories: {
      body: 'Medidas de cuerpo (necesario mientras estés vinculado/a)',
      habits: 'Hábitos (agua, pasos, sueño y entrenamiento)',
      photos: 'Fotos (se piden aparte)',
    },
    outro: 'Tu coach no ve tu correo. Puedes quitar los hábitos o terminar el vínculo cuando quieras; deja de verlos al instante.',
    links: [{ label: 'Texto completo: Política §7.1', href: POLICY }],
  };

  // Producto «coach»: al subir una foto con este permiso vigente, el coach la ve (sin marcarla una por una). La app oficial conserva el A6b de siempre.
  if (root.Producto && root.Producto.coach) {
    CT.TEXTS.A6b = {
      version: '0.3-A6b-coach', kinds: ['photo_view_coach'],
      body: 'Autorizo que {coach} vea las fotos de progreso que yo suba a mi cuenta, las que ya tengo y las que suba después. Las abre con un enlace que vence en 60 segundos y queda registro de cada vista, que tú ves. No puede descargarlas, capturarlas ni compartirlas (lo prohíbe su acuerdo; no podemos bloquear técnicamente las capturas). Puedes ocultar una foto o retirar el permiso y deja de verlas al instante. No condiciona nada.',
      links: [{ label: 'Texto completo: Política §6', href: POLICY }],
    };
  }

  const fullText0 = CT.fullText;
  CT.fullText = function (id, vars = {}) {
    if (id !== 'A5c') return fullText0(id, vars);
    const t = CT.TEXTS.A5c;
    return [CT.fill(t.intro, vars), ...['body', 'habits', 'photos'].map((k) => '- ' + t.categories[k]), CT.fill(t.outro, vars)].join('\n') + '\n' + t.links.map((l) => `[${l.label}]`).join(' ');
  };
  // La copia en la nube también vale con la autorización única (AU) vigente: es A3 + A4 en una.
  const granted = (meta, kind, ver) => !!(meta && meta.consents && meta.consents[kind] && meta.consents[kind].granted === true && meta.consents[kind].version === ver);
  const cloud0 = CT.cloudAllowed;
  CT.soloAllowed = (meta) => granted(meta, 'sensitive_health', CT.version('AU')) && granted(meta, 'cloud_transfer', CT.version('AU'));
  CT.cloudAllowed = (meta) => cloud0(meta) || CT.soloAllowed(meta);
  // Un vínculo creado con cualquiera de los dos textos de compartir no necesita migración.
  const migr0 = CT.shareMigrationNeeded;
  CT.shareMigrationNeeded = (meta) => !!(meta && meta.link) && meta.shareVersion !== CT.version('A5c') && migr0(meta);
  // Qué texto de compartir usa cada producto.
  CT.shareId = (coachProduct) => (coachProduct ? 'A5c' : 'A5');
})(typeof window !== 'undefined' ? window : globalThis);
