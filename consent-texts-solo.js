// Sprint 11: textos de la entrada «solo con cuenta» (soloNube, SOLO en la copia de pruebas). Se añaden a ConsentTexts sin tocar los
// textos v0.1/v0.3 existentes. AU y A5c: redacción LITERAL aprobada por el abogado del dueño (0.2-AU y compartir-c2); no cambiar ni una palabra sin subir la versión.
//   AU   Autorización única: reemplaza a A3 (datos) + A4 (nube y Brevo) con UNA sola casilla. Registra los MISMOS eventos que exige el
//        servidor (sensitive_health y cloud_transfer), con la huella de ESTE texto. Las fotos y compartir con el coach siguen aparte.
//   A5c  Compartir con el coach en el producto «coach»: peso y medidas y comidas (requeridas), hábitos (interruptor) y fotos (se piden aparte). Textos aprobados por el abogado.
//        compartir-c2 (Etapa 2, comidas): las comidas pasan de «no se comparten» a «necesarias»; quien tenía compartir-c1 debe confirmarlo (shareMigrationNeeded).
// Misma regla de siempre: si cambia una palabra, sube la versión; la huella es el SHA-256 del texto EXACTO mostrado.
(function (root) {
  'use strict';
  const CT = typeof module !== 'undefined' && module.exports ? require('./consent-texts.js') : root.ConsentTexts;
  const POLICY = 'legal/privacidad.html';

  CT.TEXTS.AU = {
    version: '0.2-AU', kinds: ['sensitive_health', 'cloud_transfer'],
    body: 'Autorizo a José Granados a tratar mi peso, medidas corporales, comidas y hábitos (agua, pasos, sueño y entrenamiento) para registrar mi progreso, a alojarlos en la nube (Supabase, servidores en EE. UU.) y a gestionar las comunicaciones del servicio a través de Brevo. Reconozco que esto implica una transmisión internacional de datos a proveedores encargados bajo estándares de seguridad internacionales. Entiendo que, al tratarse de datos sobre mi salud, no estoy obligado/a a autorizar su tratamiento; no obstante, su suministro es indispensable para la apertura y funcionamiento de mi cuenta. Puedo revocar esta autorización eliminando mi cuenta en cualquier momento.',
    links: [{ label: 'Política de datos', href: POLICY }],
  };
  // Texto aprobado por el abogado del dueño (literal). Peso y medidas y comidas son «requeridos» (sin interruptor); hábitos se muestra con un
  // interruptor Activar/Desactivar (el «[Opción: Activar/Desactivar]» del abogado indica el control, no es texto); fotos se autorizan aparte (A6a/A6b).
  CT.TEXTS.A5c = {
    version: 'compartir-c2', kinds: ['share_body', 'share_notes', 'share_nutrition', 'share_habits', 'share_photos'],
    intro: 'Compartir con {coach} (quien actúa como responsable independiente del tratamiento de los datos que reciba):',
    categories: {
      body: 'Peso y medidas corporales (requerido para el acompañamiento activo).',
      nutrition: 'Comidas e ingesta calórica (requerido para el acompañamiento activo).',
      habits: 'Hábitos (agua, pasos, sueño y entrenamiento)',
      photos: 'Fotos de progreso (se autorizan de forma independiente en la sección respectiva).',
    },
    outro: 'Tu coach nunca tiene acceso a tu correo electrónico. Puedes modificar el permiso de hábitos o desvincularte del coach en cualquier momento; al desvincularte, el acceso a todos tus datos cesará de forma inmediata.',
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
    return [CT.fill(t.intro, vars), ...['body', 'nutrition', 'habits', 'photos'].map((k) => '- ' + t.categories[k]), CT.fill(t.outro, vars)].join('\n') + '\n' + t.links.map((l) => `[${l.label}]`).join(' ');
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
