const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
global.window = { PG_CONFIG: { producto: 'coach', soloNube: true } };
global.Producto = require('../producto.js');
global.window.Producto = global.Producto;
const CT = require('../consent-texts.js');
require('../consent-texts-solo.js');
const PV = require('../push-view.js');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const norm = (t) => t.replace(/\s+/g, ' ').trim();

test('avisos push · A11: texto del abogado LITERAL, tipo propio `push` y huella del texto completo', () => {
  const md = norm(read('equipo/legal/concepto-12-2026-11-01-push.md'));
  const t = CT.TEXTS.A11;
  for (const frase of [t.title, t.body.replace('Política de Datos.', '[Política de Datos].'), t.buttons.yes, t.buttons.no, t.note]) assert.ok(md.includes(norm(frase)), frase.slice(0, 50));
  assert.deepStrictEqual(CT.kinds('A11'), ['push']);
  assert.strictEqual(CT.fullText('A11'), [t.title, t.body].join('\n'));
  assert.strictEqual(CT.version('A11'), '0.2-A11-push');
  assert.doesNotMatch(t.body, /\b(kg|kcal|peso|medidas)\b/i);
  assert.notStrictEqual(CT.version('A11'), CT.version('A10'));
});

test('avisos push · las frases del teléfono (sw.js) son neutrales: sin datos de salud, sin vista previa de mensajes, sin la palabra «grasa» ni cobros', () => {
  const sw = read('sw.js');
  const block = sw.slice(sw.indexOf('const PUSH_TEXT'), sw.indexOf("self.addEventListener('push'"));
  assert.match(block, /Tienes un mensaje nuevo de tu coach/);
  assert.match(block, /reminder: \{ title: 'Recordatorio', body: 'Es hora de registrar tu día' \}/);
  assert.ok(read('supabase/functions/_shared/push.mjs').includes("'reminder'"), 'la función de envío conoce el tipo reminder');
  assert.doesNotMatch(block, /\b(kg|kcal|cm|peso|medidas?|calor[ií]as?|comidas?|grasa|dieta|obesidad|d[eé]ficit|ansiedad|pag[oó]|mensualidad|cobro)\b/i);
  // el servidor manda solo el TIPO: ninguna columna ni función de la cola lleva texto
  const sql = read('supabase/migrations/20261106120000_r1_push.sql');
  assert.doesNotMatch(sql.slice(sql.indexOf('create table if not exists grasa.push_outbox'), sql.indexOf('create table if not exists grasa.push_config')), /^\s+(body|title|text|message)\s/m);
});

test('avisos push · la clave pública (base64 url) se convierte a bytes', () => {
  const bytes = PV.b64u('AQID_-8');
  assert.deepStrictEqual([...bytes], [1, 2, 3, 255, 239]);
});
