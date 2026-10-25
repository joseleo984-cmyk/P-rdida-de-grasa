// Sprint 11: textos de la entrada «solo con cuenta» (soloNube, SOLO en la copia de pruebas). Se añaden a ConsentTexts sin tocar los
// textos v0.1/v0.3 existentes. AU y A5c: redacción LITERAL aprobada por el abogado del dueño (0.2-AU y compartir-c2); no cambiar ni una palabra sin subir la versión.
//   AU   Autorización única: reemplaza a A3 (datos) + A4 (nube y Brevo) con UNA sola casilla. Registra los MISMOS eventos que exige el
//        servidor (sensitive_health y cloud_transfer), con la huella de ESTE texto. Las fotos y compartir con el coach siguen aparte.
//   A5c  Compartir con el coach en el producto «coach»: peso y medidas y comidas (requeridas), hábitos (interruptor) y fotos (se piden aparte). Textos aprobados por el abogado.
//        compartir-c2 (Etapa 2, comidas): las comidas pasan de «no se comparten» a «necesarias»; quien tenía compartir-c1 debe confirmarlo (shareMigrationNeeded).
//   A6b  Fotos con el coach (solo producto coach): 0.4-A6b-coach, literal del concepto del 24/10/2026 (punto 3.3).
//   A7   Acuerdo del coach (solo producto coach): 0.4-A7-coach = el resumen de siempre + la cláusula 13 literal del concepto (punto 3.5); el texto
//        0.3-A7 pasa a A7_PAST. 0.5-A7-coach (M6) = lo anterior + la cláusula 14 literal del concepto 6 (descarga y custodia local); 0.4 sigue
//        valiendo para todo menos exportar. Guardia automática de literalidad: tests/legal-literal.test.js.
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

  // Producto «coach» (todo lo de abajo; la app oficial conserva sus textos A6b y A7 de siempre).
  if (root.Producto && root.Producto.coach) {
    // A6b (fotos con el coach): redacción LITERAL aprobada por el abogado del dueño (concepto del 24/10/2026, punto 3.3). Con este permiso vigente,
    // cada foto que la persona guarda la ve su coach de forma automática; puede ocultar una foto o quitar el permiso. Quien tenía 0.3-A6b-coach
    // queda sin permiso vigente y debe volver a darlo (account.js retira lo que el coach ya veía). El aviso visible junto al formulario de fotos
    // NO es un texto de consentimiento y no lleva huella.
    CT.TEXTS.A6b = {
      version: '0.4-A6b-coach', kinds: ['photo_view_coach'],
      body: 'Autorizo que {coach} acceda a las fotos de progreso que he subido y a las que suba a partir de este momento. El acceso se realiza mediante enlaces cifrados que caducan a los 60 segundos y genera una bitácora de visualización disponible en mi perfil. Mi coach tiene prohibido contractualmente descargar, almacenar, capturar o difundir este material. Comprendo que este permiso es voluntario, no condiciona el uso de la app y puedo excluir fotos individuales o revocar el permiso en su totalidad cuando lo desee, bloqueando su acceso de manera inmediata.',
      links: [{ label: 'Texto completo: Política §6', href: POLICY }],
    };

    // A7 (acuerdo del coach): se añade la cláusula 13 «Contenidos Cargados, Propiedad Intelectual y Derechos de Imagen» (concepto del 24/10/2026, punto 3.5),
    // LITERAL. Es la siguiente cláusula libre del acuerdo (el borrador equipo/legal/borradores/acuerdo-coach.md llega hasta la 12). El texto de la
    // versión anterior (0.3-A7) se conserva EXACTO en A7_PAST para «Mi acuerdo» y la copia por correo. Quien aceptó 0.3-A7 debe aceptar la nueva.
    CT.A7_PAST[CT.version('A7')] = CT.fullText('A7');
    CT.TEXTS.A7 = {
      ...CT.TEXTS.A7, version: '0.4-A7-coach',
      clause: ['Cláusula 13. Contenidos Cargados, Propiedad Intelectual y Derechos de Imagen:',
        '- El Coach declara y garantiza que es el titular exclusivo o cuenta con las licencias y autorizaciones necesarias sobre todos los planes, rutinas, textos, imágenes, animaciones (GIF) y videos que cargue en la plataforma.',
        '- Queda estrictamente prohibido cargar material que contenga la imagen de terceras personas sin su autorización previa y expresa, o que infrinja derechos de propiedad intelectual, intimidad, o constituya publicidad engañosa.',
        '- En caso de que el material reproduzca la imagen personal del propio Coach, este autoriza expresamente a José Granados a hospedarla, reproducirla y exhibirla temporalmente dentro del entorno privado de la plataforma exclusivamente para los asesorados vinculados a su cuenta.',
        '- La plataforma se reserva el derecho de retirar de manera unilateral y sin previo aviso cualquier contenido que sea objeto de reclamo por parte de terceros o que infrinja las políticas del servicio, sin derecho a indemnización. El Coach mantendrá indemne a José Granados frente a cualquier reclamo, demanda, sanción o perjuicio derivado del material subido.'].join('\n'),
    };

    // M6 (exportar a Excel): se añade la cláusula 14 «Descarga y custodia local de datos de los asesorados» (concepto 6 del 25/10/2026, punto 1),
    // LITERAL; «[Número]» es la numeración correlativa (la siguiente libre tras la 13). Versión 0.5-A7-coach; el texto 0.4-A7-coach pasa EXACTO a A7_PAST.
    // Quien aceptó 0.4-A7-coach NO tiene que volver a aceptar para el resto de la app (coachAgreementOK la sigue dando por buena): la versión nueva
    // se le pide solo la PRIMERA vez que va a exportar (exportAgreementOK). Quien acepta el acuerdo desde cero acepta ya la 0.5 (con las dos cláusulas).
    CT.A7_PAST[CT.version('A7')] = CT.fullText('A7');
    CT.TEXTS.A7 = {
      ...CT.TEXTS.A7, version: '0.5-A7-coach',
      clauseExport: ['Cláusula 14. Descarga y custodia local de datos de los asesorados',
        'Al utilizar la función de exportación o descarga de registros de sus asesorados (archivos en formato Excel, CSV o similares), el Coach asume la condición de Responsable directo e independiente del tratamiento de dicha información a partir del momento de la descarga. El Coach se obliga expresamente a: (i) almacenar los archivos en dispositivos seguros, privados y protegidos contra accesos no autorizados; (ii) utilizar la información exclusivamente para la planificación y seguimiento de la asesoría del cliente; (iii) abstenerse de divulgar, transferir o comercializar estos datos con terceros; y (iv) eliminar de forma definitiva los archivos locales una vez finalice la relación comercial con el asesorado. La Plataforma queda totalmente indemne y exenta de responsabilidad ante cualquier pérdida, filtración o uso indebido de los datos que ocurra fuera de sus servidores una vez exportados por el Coach.'].join('\n'),
    };
    // Versiones del acuerdo que siguen valiendo para el resto de la app (sin re-aceptación forzada) y las que valen para exportar (traen la cláusula 14).
    CT.A7_STILL_VALID = ['0.4-A7-coach', '0.5-A7-coach'];
    CT.A7_EXPORT_VERSIONS = ['0.5-A7-coach'];
    const a7 = (meta) => (meta && meta.consents && meta.consents.coach_agreement) || null;
    CT.coachAgreementOK = (meta) => { const c = a7(meta); return !!(c && c.granted === true && CT.A7_STILL_VALID.includes(c.version)); };
    CT.exportAgreementOK = (meta) => { const c = a7(meta); return !!(c && c.granted === true && CT.A7_EXPORT_VERSIONS.includes(c.version)); };
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
