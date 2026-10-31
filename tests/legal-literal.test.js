// Guardia automática de LITERALIDAD: los textos que el abogado aprobó (equipo/legal/concepto-2026-10-24.md, puntos 3.1 a 3.6) deben aparecer
// EXACTAMENTE igual en el código y en los documentos. La huella de cada autorización es el SHA-256 del texto mostrado: una palabra o una coma
// distinta cambia la huella y deja de ser lo que el abogado aprobó. Solo se normalizan los espacios en blanco (saltos de línea, sangrías).
// Si este test falla, NO se «arregla» el test: se corrige el código o el documento, o se sube la versión del texto con un nuevo concepto del abogado.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Producto «coach» (config.pruebas.js): es donde viven AU, A5c, A6b y A7 con la cláusula nueva.
globalThis.PG_CONFIG = { producto: 'coach', soloNube: true };
globalThis.Producto = require('../producto.js');
const CT = require('../consent-texts.js');
require('../consent-texts-solo.js');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
// HTML → texto visible (sin etiquetas, con las entidades de build-legal.js y de index.html resueltas).
const visible = (html) => html.replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

// ---------- Extrae los textos aprobados del concepto: lo que está entre «…» en las citas (>) de cada punto 3.x ----------
function approved() {
  const md = read('equipo/legal/concepto-2026-10-24.md');
  const out = {};
  for (const sec of md.split(/^### (?=3\.\d)/m).slice(1)) {
    const id = sec.slice(0, 3);
    const quote = sec.split('\n').filter((l) => /^>/.test(l)).map((l) => l.replace(/^>\s?/, '')).join('\n');
    out[id] = [...quote.matchAll(/«([\s\S]*?)»/g)].map((m) => m[1]);
  }
  return out;
}
const A = approved();

test('el concepto se lee bien: cuántos textos aprobados hay en cada punto', () => {
  assert.deepStrictEqual(Object.fromEntries(Object.entries(A).map(([k, v]) => [k, v.length])), { '3.1': 1, '3.2': 1, '3.3': 1, '3.4': 2, '3.5': 1, '3.6': 1 });
  for (const t of Object.values(A).flat()) assert.ok(t.trim().length > 100, 'texto aprobado demasiado corto: ¿falló la lectura del concepto?');
});

test('3.1 AU (autorización única): el cuerpo es el texto aprobado, en el código y en la versión vigente', () => {
  const [t] = A['3.1'];
  assert.strictEqual(norm(CT.TEXTS.AU.body), norm(t));
  assert.ok(norm(read('consent-texts-solo.js')).includes(norm(t)), 'consent-texts-solo.js');
  assert.ok(!/coach/i.test(CT.TEXTS.AU.body), 'el abogado prohíbe mencionar al coach en la autorización única');
  assert.strictEqual(CT.version('AU'), '0.2-AU');
});

test('3.2 A5c (compartir con el coach): intro, cuatro categorías y cierre idénticos; «[Opción: Activar/Desactivar]» es el interruptor de hábitos, no texto', () => {
  const [t] = A['3.2'];
  const lines = t.split('\n').map((l) => l.trim());
  const intro = lines[0];
  const bullets = lines.filter((l) => l.startsWith('- ')).map((l) => l.slice(2));
  const outro = lines[lines.length - 1];
  assert.strictEqual(bullets.length, 4);
  // El marcador del abogado (y el punto que le sigue) indica el interruptor en pantalla; el texto de la categoría es lo anterior (decisión ya tomada del equipo).
  const MARK = / \[Opción: Activar\/Desactivar\]\.?$/;
  assert.ok(MARK.test(bullets[2]), 'el concepto trae el marcador en la categoría de hábitos');
  const cat = CT.TEXTS.A5c.categories;
  assert.strictEqual(norm(CT.TEXTS.A5c.intro), norm(intro));
  assert.deepStrictEqual([cat.body, cat.nutrition, cat.habits, cat.photos].map(norm), [bullets[0], bullets[1], bullets[2].replace(MARK, ''), bullets[3]].map(norm));
  assert.strictEqual(norm(CT.TEXTS.A5c.outro), norm(outro));
  assert.ok(!/Opción|Activar|Desactivar/.test(CT.fullText('A5c', { coach: 'Laura' })), 'el marcador no se escribe como texto');
  const src = norm(read('consent-texts-solo.js'));
  for (const piece of [intro, bullets[0], bullets[1], bullets[2].replace(MARK, ''), bullets[3], outro]) assert.ok(src.includes(norm(piece)), piece.slice(0, 40));
  assert.strictEqual(CT.version('A5c'), 'compartir-c2');
});

test('3.3 A6b (fotos con el coach): el cuerpo es el texto aprobado y la versión es la nueva (producto coach)', () => {
  const [t] = A['3.3'];
  assert.strictEqual(norm(CT.TEXTS.A6b.body), norm(t));
  assert.ok(norm(read('consent-texts-solo.js')).includes(norm(t)), 'consent-texts-solo.js');
  assert.strictEqual(CT.version('A6b'), '0.4-A6b-coach');
  assert.deepStrictEqual(CT.kinds('A6b'), ['photo_view_coach']);
  assert.strictEqual(norm(CT.fullText('A6b', { coach: 'Laura Fit' })).startsWith(norm(t).replace('{coach}', 'Laura Fit')), true);
});

test('3.4 Política: los párrafos §6 y §7.1 aprobados están, LITERALES, en la política vigente, en el borrador v0.3 y en la página legal de la app', () => {
  const [p6, p71] = A['3.4'];
  assert.match(p6, /^§6\./); assert.match(p71, /^§7\.1\./);
  const docs = { 'equipo/legal/politica-tratamiento-datos.md': norm(read('equipo/legal/politica-tratamiento-datos.md')),
    'equipo/legal/borradores/politica-tratamiento-datos-v0.3-cuentas.md': norm(read('equipo/legal/borradores/politica-tratamiento-datos-v0.3-cuentas.md')),
    'legal/privacidad.html': norm(visible(read('legal/privacidad.html'))) };
  for (const [file, text] of Object.entries(docs)) for (const p of [p6, p71]) assert.ok(text.includes(norm(p)), `${file}: falta «${p.slice(0, 30)}…»`);
  // No se duplican: cada párrafo aparece UNA sola vez por documento (la adenda los añade sin reemplazar ni repetir).
  for (const [file, text] of Object.entries(docs)) for (const p of [p6, p71]) assert.strictEqual(text.split(norm(p)).length - 1, 1, `${file}: «${p.slice(0, 20)}…» repetido`);
});

test('3.5 Acuerdo del coach: la cláusula aprobada está LITERAL en el texto que se acepta (A7 del producto coach) y en el borrador del acuerdo', () => {
  const [t] = A['3.5'];
  assert.match(t, /^Cláusula \[X\]\. Contenidos Cargados, Propiedad Intelectual y Derechos de Imagen:/);
  const clause = CT.TEXTS.A7.clause;
  const n = (clause.match(/^Cláusula (\d+)\./) || [])[1];
  assert.ok(n, 'la cláusula de la app trae su número');
  const expected = norm(t.replace('[X]', n));
  assert.strictEqual(norm(clause), expected, 'A7.clause');
  assert.ok(norm(CT.fullText('A7')).includes(expected), 'fullText(A7) la incluye (es lo que se acepta y se hashea)');
  const src = norm(read('consent-texts-solo.js'));   // en el código cada línea es una cadena aparte: se comprueba línea por línea
  for (const line of t.replace('[X]', n).split('\n')) assert.ok(src.includes(norm(line)), 'consent-texts-solo.js: ' + line.slice(0, 40));
  assert.ok(norm(read('equipo/legal/borradores/acuerdo-coach.md')).includes(expected), 'equipo/legal/borradores/acuerdo-coach.md');
  // El texto anterior (0.3-A7) se conserva EXACTO en A7_PAST (para «Mi acuerdo» y la copia por correo) y no trae la cláusula.
  // M6 (concepto 6): la versión vigente es 0.5-A7-coach (añade la cláusula 14); la 0.4-A7-coach, con la 13 y sin la 14, queda EXACTA en A7_PAST.
  assert.strictEqual(CT.version('A7'), '0.6-A7-coach');   // función 5: la 0.6 añade la cláusula 15 (ligas)
  assert.ok(CT.A7_PAST['0.3-A7'] && !/Cláusula/.test(CT.A7_PAST['0.3-A7']));
  assert.strictEqual(CT.agreementText('0.3-A7'), CT.A7_PAST['0.3-A7']);
  assert.ok(norm(CT.A7_PAST['0.4-A7-coach']).includes(expected) && !/Cláusula 14/.test(CT.A7_PAST['0.4-A7-coach']));
  assert.strictEqual(CT.agreementText('0.6-A7-coach'), CT.fullText('A7'));
  assert.ok(CT.A7_PAST['0.5-A7-coach'] && /Cláusula 14/.test(CT.A7_PAST['0.5-A7-coach']) && !/Cláusula 15/.test(CT.A7_PAST['0.5-A7-coach']), '0.5 queda EXACTA, sin la 15');
});

test('3.6 Importación: el aviso previo (título y párrafo) aparece LITERAL en index.html', () => {
  const [t] = A['3.6'];
  assert.match(t, /^Antes de importar tu historial:/);
  assert.ok(norm(visible(read('index.html'))).includes(norm(t)), 'index.html (#sheet-import)');
});

// ---------- Concepto jurídico 2 (24/10/2026): textos de la tabla de decisiones (equipo/legal/concepto-2-2026-10-24.md) ----------
// La tabla trae, por punto, el texto exacto entre «…». Se leen de ahí (la fuente) y se comparan con lo que muestra la app (index.html y app.js).
function approved2() {
  const md = read('equipo/legal/concepto-2-2026-10-24.md');
  const out = {};
  for (const row of md.split('\n').filter((l) => /^\| [A-Z]\d?\./.test(l) || /^\| [A-Za-z]+/.test(l))) {
    const id = (row.match(/^\| ([A-Z]\d)\./) || [])[1];
    if (id) out[id] = [...row.matchAll(/«([\s\S]*?)»/g)].map((m) => m[1]);
  }
  return out;
}
const B = approved2();

test('concepto 2 se lee bien: L1 trae el aviso, el botón y la etiqueta', () => {
  assert.deepStrictEqual(B.L1, [
    'Cada foto que guardes será visible para tu coach de forma automática. Puedes ocultar fotos específicas o retirar este permiso en cualquier momento desde tu perfil.',
    'Entendido y autorizar', 'Visible para tu coach']);
});

test('concepto 2 · L1: el aviso previo a la primera foto, su botón «Entendido y autorizar» y la etiqueta «Visible para tu coach» están LITERALES', () => {
  const [aviso, boton, etiqueta] = B.L1;
  const html = read('index.html'), app = read('app.js');
  const dlg = html.slice(html.indexOf('id="sheet-foto-aviso"'), html.indexOf('</dialog>', html.indexOf('id="sheet-foto-aviso"')));
  assert.ok(norm(visible(dlg)).includes(norm(aviso)), 'el modal (#sheet-foto-aviso) trae el texto aprobado');
  assert.ok(norm(visible(dlg)).includes(norm(boton)), 'el botón del modal');
  assert.ok(/id="fa-ok"[^>]*>\s*Entendido y autorizar\s*</.test(dlg), '#fa-ok dice exactamente «Entendido y autorizar»');
  // La etiqueta persistente: vista previa (hero), visor y miniaturas (app.js)
  assert.ok(/id="foto-hero-tag">\s*Visible para tu coach\s*</.test(html), 'etiqueta de la vista previa');
  assert.ok(/id="viewer-vis">\s*Visible para tu coach\s*</.test(html), 'etiqueta del visor');
  assert.ok(app.includes(`Visible para tu coach`) && /visTag/.test(app), 'etiqueta de las miniaturas (visTag en app.js)');
  assert.strictEqual((app.match(/Visible para tu coach/g) || []).length >= 3, true);
  assert.strictEqual(norm(etiqueta), 'Visible para tu coach');
  // El aviso fijo anterior (concepto 1, 3.3) se reemplaza por este esquema: ya no existe en la página.
  assert.ok(!html.includes('id="photo-share-notice"'), 'el recuadro fijo anterior ya no está');
  assert.ok(!/Puedes ocultar una foto abriéndola/.test(html + app), 'el texto anterior ya no se muestra');
});

// ---------- UX Etapa 2: L4 (anexo 2 del concepto 2), embarazo/lactancia/posparto (concepto 3), L5 y P1 (tabla del concepto 2) ----------
const E2 = require('../etapa2.js');
const quotes = (md) => [...md.matchAll(/«([\s\S]*?)»/g)].map((m) => m[1]);
function annex2() {
  const md = read('equipo/legal/concepto-2-2026-10-24.md');
  const sec = md.slice(md.indexOf('### 2. Autorización integrada para la pregunta de salud (L4)'), md.indexOf('### 3. Cláusulas'));
  return quotes(sec);
}
function concept3() {
  const md = read('equipo/legal/concepto-3-2026-10-24.md');
  return quotes(md.slice(md.indexOf('## Texto exacto'), md.indexOf('## Justificación')));
}

test('concepto 2 · L4 (anexo 2): encabezado, pregunta, opciones y micro-texto del «Sí» están LITERALES en la app', () => {
  const q = annex2();
  assert.strictEqual(q.length, 4, 'encabezado, pregunta, micro-texto (+ la cita «Sí» dentro del micro-texto)');
  const [head, question, yes] = [q[0], q[1], q.find((t) => t.startsWith('Al marcar'))];
  assert.strictEqual(E2.HEALTH.condition.head, head);
  assert.strictEqual(E2.HEALTH.condition.question, question);
  assert.strictEqual(E2.HEALTH.condition.yes, yes);
  const md = read('equipo/legal/concepto-2-2026-10-24.md');
  assert.ok(md.includes('Opciones: [ Sí ] [ No ] [ Prefiero no responder ]'));
  assert.deepStrictEqual(E2.OPTIONS.map((o) => o[1]), ['Sí', 'No', 'Prefiero no responder']);
});

test('concepto 3 · pregunta de embarazo, lactancia o posparto: encabezado, pregunta, opciones y micro-texto del «Sí» LITERALES (aprobados)', () => {
  const q = concept3();
  const head = q.find((t) => t.startsWith('Información sobre tu etapa actual'));
  const question = q.find((t) => t.startsWith('¿Estás en embarazo'));
  const yes = q.find((t) => t.startsWith('Al marcar'));
  assert.ok(head && question && yes, 'el concepto 3 se lee bien');
  assert.strictEqual(question, '¿Estás en embarazo, en periodo de lactancia o en los primeros meses de posparto?');
  assert.strictEqual(E2.HEALTH.pregnancy.head, head);
  assert.strictEqual(E2.HEALTH.pregnancy.question, question);
  assert.strictEqual(E2.HEALTH.pregnancy.yes, yes);
  assert.ok(read('equipo/legal/concepto-3-2026-10-24.md').includes('[ Sí ] [ No ] [ Prefiero no responder ]'));
  assert.ok(!/pendiente de confirmar/i.test(read('etapa2.js') + read('etapa2-view.js')), 'ya no está pendiente: el abogado lo aprobó');
});

test('concepto 2 · L5: el texto junto a la meta es el aprobado, cambiando SOLO la cifra que puso el coach', () => {
  const [t] = B.L5;
  assert.match(t, /\(~110 g\)/);
  assert.strictEqual(E2.L5(110), t);
  assert.strictEqual(E2.L5(150), t.replace('~110 g', '~150 g'));
});

test('concepto 2 · P1: el aviso del modo autónomo está LITERAL en la pausa (index.html) y en etapa2.js', () => {
  const [t] = B.P1;
  assert.strictEqual(E2.P1, t);
  const html = read('index.html');
  const p1 = html.slice(html.indexOf('id="dia-p1"'), html.indexOf('</p>', html.indexOf('id="dia-p1"')));
  assert.strictEqual(norm(visible('<p ' + p1 + '</p>')), norm(t));
});

// ---------- Concepto jurídico 4 (aviso de dolor al terminar el entreno, estilo v2) ----------
test('concepto 4: la pregunta cerrada, sus opciones y el bloqueo preventivo están LITERALES en la app (paso.js)', () => {
  const md = read('equipo/legal/concepto-4-2026-10-25.md');
  const sec = md.slice(md.indexOf('## Textos exactos'), md.indexOf('Notas de integración'));
  const q = [...sec.matchAll(/«([\s\S]*?)»/g)].map((m) => m[1]).filter((t) => t !== 'Sí');
  assert.strictEqual(q.length, 2, 'pregunta y bloqueo');
  const P = require('../paso.js');
  assert.strictEqual(P.DOLOR.question, q[0]);
  assert.strictEqual(P.DOLOR.block, q[1]);
  assert.ok(sec.includes('Opciones: [No] / [Sí]'));
  assert.deepStrictEqual(P.DOLOR.options.map((o) => o[1]), ['No', 'Sí']);
  assert.strictEqual(P.dolorText(), `${q[0]}\nNo / Sí`);
  // El primer párrafo del concepto cita los mismos textos
  assert.ok(md.includes(`«${q[0]} [No] / [Sí]»`) && md.includes(`«${q[1]}»`));
  // No se construye «¿Alguna molestia?» ni ningún campo de texto para el dolor
  const html = read('index.html');
  assert.ok(!/Alguna molestia/i.test(html + read('rutinas-view.js') + read('paso.js')));
  assert.ok(!/<(textarea|input)[^>]*(dolor|pd-)/i.test(html), 'sin campo de texto para el dolor');
});

test('concepto 5 · metas: el ÚNICO pie de Progreso es el texto aprobado, LITERAL (analitica.js), y no queda «Meta orientativa propuesta por tu coach» por tarjeta', () => {
  const md = read('equipo/legal/concepto-5-2026-10-25.md');
  const A = require('../analitica.js');
  const m = md.match(/> «(Metas orientativas fijadas exclusivamente por tu coach\.[^»]+)»/);
  assert.ok(m, 'el concepto 5 trae el pie de Progreso');
  assert.strictEqual(A.GOALS_FOOTER, m[1]);
  assert.ok(!read('analitica-view.js').includes('Meta orientativa propuesta por tu coach'), 'sin la línea por tarjeta del boceto');
  assert.strictEqual(A.RANKING_LABEL, 'Solo tú lo ves. Tus asesorados nunca ven un ranking.');
  assert.ok(read('analitica-view.js').includes('<b>Solo tú lo ves.</b> Tus asesorados nunca ven un ranking.'), 'el rótulo del ranking en la vista');
  assert.ok(read('index.html').includes('Solo comunicación operativa, técnica o de servicio.'), 'ayuda de los avisos (concepto 5, punto 5)');
});

// ---------- Concepto jurídico 6 (25/10/2026): exportación a Excel (M6) ----------
function concept6() {
  const md = read('equipo/legal/concepto-6-2026-10-25.md');
  const sec = (a, b) => md.slice(md.indexOf(a), b ? md.indexOf(b) : undefined);
  const q = (t) => [...t.matchAll(/> «([\s\S]*?)»/g)].map((m) => m[1]);
  const s1 = sec('## 1. Cláusula', '## 2. Párrafo');
  return {
    title: (s1.match(/^Cláusula \[Número\]\. (.+)$/m) || [])[1],
    clause: q(s1),
    policy: q(sec('## 2. Párrafo', '## Casilla')),
    box: q(sec('## Casilla', '---')),
    answer: q(sec('## Respuesta del abogado')),
  };
}

test('concepto 6 se lee bien: título y cuerpo de la cláusula, párrafo de la política, casilla y respuesta del abogado', () => {
  const c = concept6();
  assert.strictEqual(c.title, 'Descarga y custodia local de datos de los asesorados');
  assert.deepStrictEqual([c.clause.length, c.policy.length, c.box.length, c.answer.length], [1, 1, 1, 1]);
  assert.strictEqual(c.box[0], 'Asumo la custodia y confidencialidad de estos datos conforme a la Ley 1581 de 2012 como responsable independiente.');
  assert.match(c.answer[0], /banner in-app de la versión v1\.1/);
});

test('concepto 6 · cláusula del acuerdo: «Cláusula 14. …» LITERAL en el A7 que se acepta (0.5-A7-coach), en el código, en el borrador del acuerdo y en la función de correo', () => {
  const c = concept6();
  const expected = `Cláusula 14. ${c.title}\n${c.clause[0]}`;   // «[Número]» = 14, la siguiente libre tras la 13
  assert.strictEqual(CT.TEXTS.A7.clauseExport, expected);
  assert.ok(CT.fullText('A7').includes(expected), 'fullText(A7) la incluye: es lo que se acepta y se hashea');
  assert.ok(CT.fullText('A7').indexOf('Cláusula 13.') < CT.fullText('A7').indexOf('Cláusula 14.'), 'va después de la 13');
  assert.strictEqual(CT.version('A7'), '0.6-A7-coach');
  assert.ok(norm(read('equipo/legal/borradores/acuerdo-coach.md')).includes(norm(expected)), 'equipo/legal/borradores/acuerdo-coach.md');
  assert.ok(read('supabase/functions/_shared/textos-acuerdo.mjs').includes(JSON.stringify(CT.fullText('A7')).slice(1, -1)), 'textos-acuerdo.mjs (npm run build:funcion)');
  // Sin re-aceptación forzada para el resto de la app: 0.4 sigue valiendo; para exportar hace falta la 0.5.
  const m = (v) => ({ consents: { coach_agreement: { granted: true, version: v } } });
  assert.deepStrictEqual(['0.3-A7', '0.4-A7-coach', '0.5-A7-coach', '0.6-A7-coach'].map((v) => CT.coachAgreementOK(m(v))), [false, true, true, true]);
  assert.deepStrictEqual(['0.3-A7', '0.4-A7-coach', '0.5-A7-coach', '0.6-A7-coach'].map((v) => CT.exportAgreementOK(m(v))), [false, false, true, true]);
  assert.strictEqual(CT.exportAgreementOK({ consents: { coach_agreement: { granted: false, version: '0.5-A7-coach' } } }), false);
});

test('concepto 6 · casilla previa a cada descarga: LITERAL en exportar.js (y en ningún otro texto reescrito)', () => {
  const c = concept6();
  const X = require('../exportar.js');
  assert.strictEqual(X.CUSTODY_TEXT, c.box[0]);
  assert.ok(read('exportar-view.js').includes('X.CUSTODY_TEXT'), 'la vista pinta la casilla desde la constante');
});

test('concepto 6 · párrafo de la política: LITERAL en la política publicada (§6.5), en el borrador con cuentas y en legal/privacidad.html, una sola vez', () => {
  const [p] = concept6().policy;
  const docs = { 'equipo/legal/politica-tratamiento-datos.md': read('equipo/legal/politica-tratamiento-datos.md'),
    'equipo/legal/borradores/politica-tratamiento-datos-v0.3-cuentas.md': read('equipo/legal/borradores/politica-tratamiento-datos-v0.3-cuentas.md'),
    'legal/privacidad.html': visible(read('legal/privacidad.html')) };
  for (const [f, t] of Object.entries(docs)) assert.strictEqual(norm(t).split(norm(p)).length - 1, 1, f);
  const html = read('legal/privacidad.html');
  const s6 = html.slice(html.indexOf('<h2 id="s6">'), html.indexOf('<h2 id="s7">'));
  assert.ok(norm(visible(s6)).includes(norm(p)), 'va en la sección «¿Con quién compartimos tus datos?»');
});

// ---------- Política v1.1 (concepto 2, anexo puntos 1 y 4; concepto 6) ----------
function annex(n) {
  const md = read('equipo/legal/concepto-2-2026-10-24.md');
  const a = md.slice(md.indexOf('## Anexo'));
  const s = a.slice(a.indexOf(`### ${n}.`), a.indexOf(`### ${n + 1}.`) > 0 ? a.indexOf(`### ${n + 1}.`) : undefined);
  return [...s.matchAll(/«([\s\S]*?)»/g)].map((m) => m[1]);
}

test('v1.1 · finalidad L6d (anexo 4): LITERAL en las finalidades (§4) de la política publicada y del borrador, con la numeración correlativa', () => {
  const [t] = annex(4);
  assert.match(t, /^\[Finalidad X\.X\] Desarrollar análisis/);
  const body = t.replace('[Finalidad X.X] ', '');
  const html = read('legal/privacidad.html');
  const s4 = norm(visible(html.slice(html.indexOf('<h2 id="s4">'), html.indexOf('<h2 id="s5">'))));
  assert.ok(s4.includes(norm('Finalidad 4.5 ' + body)), 'legal/privacidad.html §4');
  assert.ok(norm(read('equipo/legal/politica-tratamiento-datos.md')).includes(norm('Finalidad 4.5 ' + body)));
  assert.ok(norm(read('equipo/legal/borradores/politica-tratamiento-datos-v0.3-cuentas.md')).includes(norm('Finalidad 4.8 ' + body)));
  // La finalidad se describe, pero las alertas L6 siguen APAGADAS (Etapa 3): ningún archivo de la app las emite.
  for (const f of ['app.js', 'coach-panel.js', 'analitica-view.js', 'index.html', 'exportar-view.js', 'aviso-politica.js']) {
    assert.ok(!read(f).includes('Alerta de seguridad operativa'), f + ' no muestra alertas L6');
    assert.ok(!/Línea 106|L[ií]nea Nacional 192/.test(read(f)), f + ' sin la tarjeta 106/192');
  }
  assert.ok(!/Cláusula 7\.[34]/.test(CT.fullText('A7')), 'las cláusulas 7.3 y 7.4 no entran todavía');
});

test('v1.1 · aviso en pantalla (anexo 1): texto y botón «Entendido» LITERALES en aviso-politica.js; «[enlace]» es el enlace real a la política', () => {
  const [t, btn] = annex(1);
  assert.match(t, /\(v1\.1\).*Conócela aquí \[enlace\]\.$/);
  assert.strictEqual(btn, 'Entendido');
  const AV = require('../aviso-politica.js');
  assert.strictEqual(AV.TEXT_V11, t, 'el de la v1.1 queda como historial (lo reemplaza el de la v1.2, concepto 7)');
  assert.strictEqual(AV.BUTTON, btn);
  const html = read('index.html');
  const box = html.slice(html.indexOf('id="aviso-politica"'), html.indexOf('</div>', html.indexOf('id="aviso-politica"')));
  assert.ok(/>\s*Entendido\s*</.test(box), 'el botón de index.html dice «Entendido»');
});


// ---------- Concepto jurídico 7 (26/10/2026): gamificación, meta colectiva, ranking del coach y Política v1.2 ----------
function concept7() {
  const md = read('equipo/legal/concepto-7-2026-10-26.md');
  const sec = (a, b) => md.slice(md.indexOf(a), b ? md.indexOf(b) : undefined);
  const q = (t) => [...t.matchAll(/«([\s\S]*?)»/g)].map((m) => m[1]);
  const s5 = sec('## 5. Política', '## 6.');
  return { md, finalidad: q(s5).find((x) => x.startsWith('[Finalidad X.X]')), aviso: q(s5).find((x) => x.startsWith('Actualizamos')), boton: (s5.match(/\(Botón: «([^»]+)»\)/) || [])[1] };
}

test('concepto 7 se lee bien: finalidad, aviso y botón del punto 5', () => {
  const c = concept7();
  assert.match(c.finalidad, /^\[Finalidad X\.X\] Calcular indicadores de cumplimiento/);
  assert.match(c.aviso, /\(v1\.2\).*Conócela aquí \[enlace\]\.$/);
  assert.strictEqual(c.boton, 'Entendido');
});

test('concepto 7 · Política v1.2: la finalidad LITERAL en §4 de la política publicada (4.6), del borrador (4.9) y de legal/privacidad.html, una sola vez', () => {
  const body = concept7().finalidad.replace('[Finalidad X.X] ', '');
  const html = read('legal/privacidad.html');
  const s4 = norm(visible(html.slice(html.indexOf('<h2 id="s4">'), html.indexOf('<h2 id="s5">'))));
  assert.ok(s4.includes(norm('Finalidad 4.6 ' + body)), 'legal/privacidad.html §4');
  assert.strictEqual(norm(visible(html)).split(norm(body)).length - 1, 1, 'una sola vez en la página');
  assert.ok(norm(read('equipo/legal/politica-tratamiento-datos.md')).includes(norm('Finalidad 4.6 ' + body)));
  assert.ok(norm(read('equipo/legal/borradores/politica-tratamiento-datos-v0.3-cuentas.md')).includes(norm('Finalidad 4.9 ' + body)));
  assert.strictEqual(JSON.parse(read('legal/VERSIONS.json')).privacy.version, '1.2');
});

test('concepto 7 · aviso v1.2: texto y botón «Entendido» LITERALES en aviso-politica.js; «[enlace]» es el enlace real a la política', () => {
  const c = concept7();
  const AV = require('../aviso-politica.js');
  assert.strictEqual(AV.TEXT, c.aviso);
  assert.strictEqual(AV.BUTTON, c.boton);
  assert.deepStrictEqual(AV.parts(), { before: c.aviso.slice(0, c.aviso.indexOf(' [enlace]')).replace(/aquí$/, ''), link: 'aquí', after: '.', href: 'legal/privacidad.html' });
});

function liga7() {
  const md = read('equipo/legal/concepto-7-2026-10-26.md');
  const sec = (a, b) => md.slice(md.indexOf(a), b ? md.indexOf(b) : undefined);
  const s4 = sec('## 4. Texto literal', '## 5.');
  const consent = s4.slice(s4.indexOf('> Texto del consentimiento:'), s4.indexOf('> Casilla de aceptación'));
  return {
    title: (s4.match(/> Encabezado: (.+)/) || [])[1],
    consent: consent.replace('> Texto del consentimiento:', '').split('\n').map((l) => l.replace(/^>\s?/, '').trim()).filter(Boolean).join('\n').replace(/^«/, '').replace(/»$/, ''),
    box: (s4.match(/Casilla de aceptación: \[ \] «([^»]+)»/) || [])[1],
    button: (s4.match(/Botón de acción: «([^»]+)»/) || [])[1],
    notice: (sec('## 12.', '---').match(/> «(Recuerda: esta dinámica[^»]+)»/) || [])[1],
    min: (sec('## 3.', '## 4.').match(/informa: «([^»]+)»/) || [])[1],
    clause: (sec('## 8.', '## 9.').match(/> «(En caso de habilitar[^»]+)»/) || [])[1],
    aliases: (sec('## 3.', '## 4.').match(/\(ej\. ([^)]+)\)/) || [])[1],
  };
}

test('concepto 7 · liga: opt-in (encabezado, texto, casilla y botón), aviso de cabecera y mensaje del mínimo LITERALES en liga.js', () => {
  const c = liga7();
  const L = require('../liga.js');
  assert.ok(c.title && c.consent && c.box && c.button && c.notice && c.min && c.clause, 'el concepto trae todos los textos');
  assert.strictEqual(L.TITLE, c.title);
  assert.strictEqual(L.CONSENT.join('\n'), c.consent);
  assert.strictEqual(L.BOX, c.box);
  assert.strictEqual(L.BUTTON, c.button);
  assert.strictEqual(L.NOTICE, c.notice);
  assert.strictEqual(L.MIN_MESSAGE, c.min);
  assert.strictEqual(L.CLAUSE_BODY, c.clause);
  assert.strictEqual(L.MIN, 5);
});

test('concepto 7 · liga: el consentimiento A9 guarda el texto completo; el acuerdo 0.6-A7-coach trae la cláusula 15 literal y 0.5 queda intacta', () => {
  const c = liga7(), L = require('../liga.js');
  assert.strictEqual(CT.fullText('A9'), [c.title, c.consent, c.box].join('\n') + '\n[Política de datos]');
  assert.deepStrictEqual(CT.kinds('A9'), ['liga']);
  assert.ok(CT.fullText('A7').includes(L.CLAUSE_TITLE + '\n' + c.clause), 'cláusula 15 en lo que se acepta y se hashea');
  assert.ok(CT.fullText('A7').indexOf('Cláusula 14.') < CT.fullText('A7').indexOf('Cláusula 15.'));
  assert.ok(norm(read('equipo/legal/borradores/acuerdo-coach.md')).includes(norm(L.CLAUSE)), 'borrador del acuerdo');
  assert.ok(read('supabase/functions/_shared/textos-acuerdo.mjs').includes(JSON.stringify(CT.fullText('A7')).slice(1, -1)), 'textos-acuerdo.mjs (npm run build:funcion)');
  const m = (v) => ({ consents: { coach_agreement: { granted: true, version: v } } });
  assert.deepStrictEqual(['0.4-A7-coach', '0.5-A7-coach', '0.6-A7-coach'].map((v) => CT.ligaAgreementOK(m(v))), [false, false, true]);
  assert.strictEqual(CT.ligaAgreementOK({ consents: { coach_agreement: { granted: false, version: '0.6-A7-coach' } } }), false);
});

test('concepto 7 · liga: alias de catálogo cerrado (los del concepto incluidos), 24 únicos, igual en la app y en el SQL', () => {
  const sql = read('supabase/migrations/20261103120000_r1_liga.sql');
  const list = sql.slice(sql.indexOf("select array['Halcón'"), sql.indexOf("]::text[]", sql.indexOf("select array['Halcón'")));
  const names = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.strictEqual(names.length, 24);
  assert.strictEqual(new Set(names).size, 24);
  for (const n of ['Halcón', 'Titán', 'Roble', 'Fénix']) assert.ok(names.includes(n));
  assert.deepStrictEqual(require('../remote-fake.js').LIGA_ALIASES, names);
});

test('concepto 7 · liga: sin «posición relativa» (opción 2) ni capturas de la tabla; la tabla no pinta nada distinto de alias y puntos', () => {
  for (const f of ['index.html', 'app.js', 'puntos-view.js', 'liga-view.js']) assert.ok(!/grupo de arriba/.test(read(f)), f);
  const v = read('liga-view.js');
  assert.ok(!/weight|waist|kcal|photo|email|displayName|\.name\b/.test(v.replace(/\/\/.*$/gm, '')), 'liga-view.js solo toca alias y puntos');
});
