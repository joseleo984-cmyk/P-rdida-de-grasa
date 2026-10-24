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
  assert.strictEqual(CT.version('A7'), '0.4-A7-coach');
  assert.ok(CT.A7_PAST['0.3-A7'] && !/Cláusula/.test(CT.A7_PAST['0.3-A7']));
  assert.strictEqual(CT.agreementText('0.3-A7'), CT.A7_PAST['0.3-A7']);
  assert.strictEqual(CT.agreementText('0.4-A7-coach'), CT.fullText('A7'));
});

test('3.6 Importación: el aviso previo (título y párrafo) aparece LITERAL en index.html', () => {
  const [t] = A['3.6'];
  assert.match(t, /^Antes de importar tu historial:/);
  assert.ok(norm(visible(read('index.html'))).includes(norm(t)), 'index.html (#sheet-import)');
});
