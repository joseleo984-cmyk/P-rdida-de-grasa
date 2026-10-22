// Sprint 6: textos EXACTOS de las autorizaciones A1–A8 (equipo/legal/borradores/autorizaciones-en-app.md) con id estable,
// versión y tipos de consentimiento que registran. Sin DOM (se prueba en tests/consent-texts.test.js).
// Regla: la versión SUBE cuando cambia una sola palabra; el servidor guarda la huella SHA-256 del texto exacto mostrado
// (account.js calcula Remote.textHash(fullText(...)) y guarda esa misma cadena en pantalla, así que huella = lo que se vio).
// ESTADO: BORRADOR v0.3 (Sprint 8: A3 y A4 con la redacción aprobada por el Stakeholder el 2026-10-22; A7 y A8 ajustados a 24 h / 3 años), pendiente del abogado. Mientras no se aprueben, la app oficial no se conecta a `plataforma`.
// Cambios respecto al borrador (a confirmar por el abogado), todos para no prometer lo que la app no hace:
//   · Dónde se retira: «Perfil → Privacidad / Cuenta» pasa a «Más → Mis datos y permisos» (así se llama la pantalla real).
//   · (v0.2, ya superado por la redacción de v0.3) A4: la última frase dice que al retirarla la copia deja de actualizarse y se borra al borrar la cuenta (no hay aún
//     borrado de la copia sin borrar la cuenta).
//   · A2 muestra la versión VIGENTE de los textos legales enlazados (hoy 0.1) en vez de «0.2», porque los enlaces siguen
//     apuntando a legal/*.html v0.1 hasta que el abogado apruebe los v1.0.
(function (root) {
  'use strict';

  const POLICY = 'legal/privacidad.html';
  const TERMS = 'legal/terminos.html';
  const AGREEMENT = 'legal/privacidad.html'; // hasta que exista la página del Acuerdo del coach (pendiente del abogado)

  // id → { version, kinds (tipos de consentimiento que registra), body, links }. `{x}` se reemplaza con vars.
  const TEXTS = {
    A1: {
      version: '0.2-A1', kinds: ['adult'],
      body: 'Declaro que soy mayor de 18 años. Esta app no es para menores de edad.',
      links: [],
    },
    A2: {
      version: '0.2-A2', kinds: ['terms', 'privacy'],
      body: 'Leí y acepto los Términos y Condiciones y la Política de Tratamiento de Datos (versión {legalVersion}).',
      links: [{ label: 'Ver Términos', href: TERMS }, { label: 'Ver Política', href: POLICY }],
    },
    A3: {
      version: '0.3-A3', kinds: ['sensitive_health'],
      body: 'Autorizo a José Granados a tratar mis datos sensibles de salud (peso, medidas, comidas, hábitos) para calcular mi plan y registrar mi progreso. Reconozco que autorizar es completamente facultativo y que puedo utilizar la aplicación en modo local sin cuenta.',
      links: [{ label: 'Política de datos', href: POLICY }],
    },
    A4: {
      version: '0.3-A4', kinds: ['cloud_transfer'],
      body: 'Autorizo almacenar una copia de mis datos en la nube (Supabase, servidores en EE. UU.) y procesar mi correo con Brevo. Conozco que es una transmisión internacional a proveedores encargados donde las medidas de protección pueden diferir de las de Colombia. Es facultativo; sin esta casilla la app funciona únicamente en tu teléfono.',
      links: [{ label: 'Política de datos', href: POLICY }],
    },
    // Aviso del envío del código (A4, nota): se muestra al pedir el código. No es una casilla.
    A4code: {
      version: '0.2-A4n', kinds: [],
      body: 'Te enviaremos un código con Brevo (proveedor de correo, fuera de Colombia).',
      links: [{ label: 'Ver Política §7.3', href: POLICY }],
    },
    A5: {
      version: 'compartir-2', kinds: ['share_body', 'share_notes', 'share_nutrition', 'share_habits', 'share_photos'],
      intro: 'Compartir con {coach} (él es responsable de cómo usa lo que ves):',
      categories: {
        body: 'Peso y medidas (necesario mientras estés vinculado/a)',
        notes: 'Notas personales',
        nutrition: 'Comidas',
        habits: 'Hábitos',
        photos: 'Fotos (se piden aparte, ver A6)',
      },
      outro: 'Tu coach no ve tu correo. Puedes quitar cada categoría o terminar el vínculo cuando quieras; deja de verla al instante.',
      links: [{ label: 'Texto completo: Política §7.1', href: POLICY }],
    },
    A6a: {
      version: '0.2-A6a', kinds: ['photos_cloud'],
      body: 'Autorizo guardar mis fotos de progreso en la nube (Supabase, EE. UU.), en almacenamiento privado, solo para mi seguimiento. Son datos sensibles y es opcional: sin esto tus fotos quedan solo en tu teléfono y la app funciona igual. Puedes retirarla y borrar tus fotos cuando quieras.',
      links: [{ label: 'Texto completo: Política §6', href: POLICY }],
    },
    A6b: {
      version: '0.2-A6b', kinds: ['photo_view_coach'],
      body: 'Autorizo que {coach} vea la foto que marqué, una a una. La abre con un enlace que vence en 60 segundos y queda registro de cada vista, que tú ves. No puede descargarla, capturarla ni compartirla (lo prohíbe su acuerdo; no podemos bloquear técnicamente las capturas). Retirar el permiso la oculta al instante. No condiciona nada.',
      links: [{ label: 'Texto completo: Política §6', href: POLICY }],
    },
    A7: {
      version: '0.3-A7', kinds: ['coach_agreement'],
      intro: 'Para ver datos de clientes, acepta el Acuerdo del coach. En resumen: usas los datos solo para acompañar a ese cliente; no descargas, capturas ni compartes fotos; guardas confidencialidad; no das planes de alimentación terapéuticos si no eres profesional habilitado; avisas incidentes en máximo 24 horas; borras al terminar el vínculo; y respondes por tu propio uso.',
      body: 'Acepto el Acuerdo del coach.',
      links: [{ label: 'Leer acuerdo completo', href: AGREEMENT }],
    },
  };

  // A8: avisos informativos (no se registran como consentimiento; el cliente confirma la acción).
  const A8 = {
    version: '0.3-A8',
    withdraw: 'Retirarás {que}. Tu coach deja de verlo ya. Lo ya guardado en la nube {destino}. Guardaremos solo una prueba mínima de tu autorización anterior, sin tu nombre. ¿Exportar antes?',
    destinoQuedaCuenta: 'se queda en tu cuenta hasta que la borres',
    destinoBorra: 'se borrará',
    delete: 'Se borrarán tu cuenta, tus datos, fotos y vínculos de la nube; no se puede deshacer. Tu teléfono conserva su copia hasta que la borres. Guardamos 3 años una prueba mínima y sin tu nombre de lo que autorizaste.',
    coachEnded: 'Perdiste el acceso a los datos de {cliente}. Borra cualquier copia que tengas en un máximo de 30 días.',
  };

  const fill = (s, vars = {}) => String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? m : String(vars[k])));
  const linkLine = (links) => (links && links.length ? '\n' + links.map((l) => `[${l.label}]`).join(' ') : '');

  function get(id) {
    const t = TEXTS[id];
    if (!t) throw new Error('Texto de autorización desconocido: ' + id);
    return t;
  }
  const version = (id) => get(id).version;
  const kinds = (id) => get(id).kinds.slice();

  // Lo que se ve en pantalla, tal cual (la huella es el SHA-256 de ESTA cadena). Para A5 y A7 incluye la introducción.
  function fullText(id, vars = {}) {
    const t = get(id);
    if (id === 'A5') {
      const c = t.categories;
      return [fill(t.intro, vars), ...['body', 'notes', 'nutrition', 'habits', 'photos'].map((k) => '- ' + c[k]), fill(t.outro, vars)].join('\n') + linkLine(t.links);
    }
    if (id === 'A7') return fill(t.intro, vars) + '\n' + fill(t.body, vars) + linkLine(t.links);
    return fill(t.body, vars) + linkLine(t.links);
  }

  // Sprint 10: textos EXACTOS de versiones ANTERIORES del acuerdo del coach (A7) que alguien pudo haber aceptado. Al subir la versión
  // de A7, el texto viejo (fullText completo) se MUEVE aquí sin cambiarle una letra: sirve para «Mi acuerdo» y para la copia por correo.
  const A7_PAST = {};
  // versión → texto exacto (el vigente más los anteriores). Alimenta supabase/functions/_shared/textos-acuerdo.mjs (npm run build:funcion).
  const agreementTexts = () => ({ ...A7_PAST, [version('A7')]: fullText('A7') });
  const agreementText = (ver) => { const all = agreementTexts(); return Object.prototype.hasOwnProperty.call(all, ver) ? all[ver] : null; };

  const A8text = {
    withdraw: (que, { borra = false } = {}) => fill(A8.withdraw, { que, destino: borra ? A8.destinoBorra : A8.destinoQuedaCuenta }),
    delete: () => A8.delete,
    coachEnded: (cliente) => fill(A8.coachEnded, { cliente: cliente || 'tu cliente' }),
  };

  // ---------- Estado local de las autorizaciones de la cuenta (meta de account.js; puro) ----------
  // meta.consents[kind] = { granted, version, textHash, clientAt, coachId? } (espejo del último evento);
  // meta.consentQueue = eventos aún no enviados al servidor (sin conexión), en orden.
  const grantedWith = (meta, kind, ver) => !!(meta && meta.consents && meta.consents[kind] && meta.consents[kind].granted === true && meta.consents[kind].version === ver);

  // Copia en la nube: A3 (datos de salud) + A4 (transmisión) vigentes. Sin ambas NO se sincroniza nada.
  const cloudAllowed = (meta) => grantedWith(meta, 'sensitive_health', version('A3')) && grantedWith(meta, 'cloud_transfer', version('A4'));
  const coachAgreementOK = (meta) => grantedWith(meta, 'coach_agreement', version('A7'));
  // Un vínculo creado con compartir-1 se confirma una vez con los textos de compartir-2 (nada se apaga solo).
  const shareMigrationNeeded = (meta) => !!(meta && meta.link && meta.shareVersion !== version('A5'));

  // Devuelve un meta nuevo con el evento aplicado y en cola. `ev`: { kind, granted, version, textHash, clientAt, coachId? }.
  function applyEvent(meta, ev) {
    const m = { ...(meta || {}) };
    m.consents = { ...(m.consents || {}), [ev.kind]: { granted: ev.granted === true, version: ev.version, textHash: ev.textHash, clientAt: ev.clientAt, ...(ev.coachId ? { coachId: ev.coachId } : {}) } };
    m.consentQueue = [...(m.consentQueue || []), { kind: ev.kind, granted: ev.granted === true, version: ev.version, textHash: ev.textHash, clientAt: ev.clientAt, ...(ev.coachId ? { coachId: ev.coachId } : {}) }];
    return m;
  }
  // Mezcla lo que dice el servidor (consents()) con lo local: gana lo más reciente por tipo. No toca la cola.
  function mergeServer(meta, server) {
    const m = { ...(meta || {}) };
    const cur = { ...(m.consents || {}) };
    for (const [kind, s] of Object.entries(server || {})) {
      if (!s || typeof s.granted !== 'boolean') continue;
      const mine = cur[kind];
      if (!mine || Date.parse(s.clientAt || 0) > Date.parse(mine.clientAt || 0)) cur[kind] = { granted: s.granted, version: s.version, textHash: s.textHash, clientAt: s.clientAt };
    }
    m.consents = cur;
    return m;
  }
  const dropSent = (meta, n) => ({ ...(meta || {}), consentQueue: ((meta && meta.consentQueue) || []).slice(n) });

  // A1/A2 se piden al pedir el código (antes de que el correo salga hacia Brevo). `terms` = lo guardado en este teléfono.
  const termsCurrent = (terms, legal) => !!(terms && terms.a1 === version('A1') && terms.a2 === version('A2') && terms.legal && terms.legal.terms === legal.terms && terms.legal.privacy === legal.privacy);

  const api = { TEXTS, A8, A8text, get, version, kinds, fullText, agreementTexts, agreementText, fill, cloudAllowed, coachAgreementOK, shareMigrationNeeded, applyEvent, mergeServer, dropSent, termsCurrent };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ConsentTexts = api;
})(typeof window !== 'undefined' ? window : globalThis);
