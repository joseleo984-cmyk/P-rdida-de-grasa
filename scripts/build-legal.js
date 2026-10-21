// LEGAL-01: genera las páginas HTML estáticas de los textos legales a partir de los .md del equipo.
// Uso: npm run legal   (se ejecuta a mano tras editar los .md; tests/legal.test.js comprueba que están al día)
// Conversor Markdown mínimo, sin dependencias: títulos, párrafos, listas, tablas, citas, **negrita**, *cursiva* y `código`.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DOCS = [
  { src: 'equipo/legal/terminos-y-condiciones.md', out: 'legal/terminos.html', title: 'Términos y Condiciones' },
  { src: 'equipo/legal/politica-tratamiento-datos.md', out: 'legal/privacidad.html', title: 'Política de Tratamiento de Datos' },
];

const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\s][^*]*)\*/g, '<em>$1</em>');
}

const isTable = (l) => /^\s*\|/.test(l);
const isQuote = (l) => /^\s*>/.test(l);
const isUl = (l) => /^\s*[-*]\s+/.test(l);
const isOl = (l) => /^\s*\d+\.\s+/.test(l);
const isHead = (l) => /^#{1,6}\s/.test(l);
const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

function mdToHtml(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    if (isHead(l)) {
      const level = l.match(/^#+/)[0].length;
      out.push(`<h${level}>${inline(l.slice(level).trim())}</h${level}>`);
      i++;
    } else if (isTable(l)) {
      const rows = [];
      while (i < lines.length && isTable(lines[i])) rows.push(lines[i++]);
      const body = rows.filter((r, k) => !(k === 1 && /^[\s|:-]+$/.test(r)));
      const [head, ...rest] = body;
      const th = cells(head).map((c) => `<th scope="col">${inline(c)}</th>`).join('');
      const empty = cells(head).every((c) => !c);
      out.push('<div class="table"><table>' + (empty ? '' : `<thead><tr>${th}</tr></thead>`) + '<tbody>' +
        rest.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('') + '</tbody></table></div>');
    } else if (isQuote(l)) {
      const q = [];
      while (i < lines.length && isQuote(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>${q.map((x) => `<p>${inline(x)}</p>`).join('')}</blockquote>`);
    } else if (isUl(l) || isOl(l)) {
      const ordered = isOl(l);
      const items = [];
      while (i < lines.length && (ordered ? isOl(lines[i]) : isUl(lines[i]))) {
        items.push(lines[i++].replace(ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/, ''));
        // Líneas de continuación (sangradas) del mismo elemento.
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !isUl(lines[i]) && !isOl(lines[i])) items[items.length - 1] += ' ' + lines[i++].trim();
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</${tag}>`);
    } else {
      const p = [];
      while (i < lines.length && lines[i].trim() && !isHead(lines[i]) && !isTable(lines[i]) && !isQuote(lines[i]) && !isUl(lines[i]) && !isOl(lines[i])) p.push(lines[i++].trim());
      out.push(`<p>${inline(p.join(' '))}</p>`);
    }
  }
  return out.join('\n');
}

const isDraft = (md) => /borrador/i.test(md.split('\n').slice(0, 5).join('\n'));
const versionOf = (md) => (md.match(/\*\*Versión:\*\*\s*([0-9a-z.\-]+)/i) || [])[1] || null;

function page(md, title) {
  const draft = isDraft(md)
    ? '<p class="draft" role="note"><strong>Borrador pendiente de revisión legal.</strong> Este texto aún no es definitivo.</p>\n'
    : '';
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Pérdida de Grasa</title>
<!-- Generado por scripts/build-legal.js desde equipo/legal/. No editar a mano. -->
<style>
:root { --bg: #ffffff; --text: #17201e; --muted: #64716e; --line: #e3e8e6; --accent: #0f766e; --warn-bg: #fff4e5; --warn: #8a4b00; color-scheme: light dark; }
@media (prefers-color-scheme: dark) { :root { --bg: #17211f; --text: #e6eeec; --muted: #93a39f; --line: #26332f; --accent: #2dd4bf; --warn-bg: #3a2a10; --warn: #fbbf24; } }
* { box-sizing: border-box; }
body { margin: 0; padding: 16px; background: var(--bg); color: var(--text); font: 16px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; overflow-wrap: anywhere; }
main { max-width: 720px; margin: 0 auto; }
h1 { font-size: 1.35rem; line-height: 1.25; } h2 { font-size: 1.12rem; margin-top: 1.6em; } h3 { font-size: 1rem; }
blockquote { margin: 0 0 1em; padding: 8px 12px; border-left: 4px solid var(--line); color: var(--muted); }
blockquote p { margin: .3em 0; }
.draft { margin: 0 0 16px; padding: 12px 14px; border: 2px solid var(--warn); border-radius: 10px; background: var(--warn-bg); color: var(--text); }
.table { overflow-x: auto; margin: 0 0 1em; }
table { border-collapse: collapse; width: 100%; font-size: .92rem; }
th, td { border: 1px solid var(--line); padding: 6px 8px; text-align: left; vertical-align: top; }
code { font-size: .9em; }
a { color: var(--accent); }
</style>
</head>
<body>
<main>
${draft}${mdToHtml(md)}
</main>
</body>
</html>
`;
}

function build() {
  return DOCS.map((d) => {
    const md = fs.readFileSync(path.join(ROOT, d.src), 'utf8');
    return { ...d, html: page(md, d.title), version: versionOf(md), draft: isDraft(md) };
  });
}

if (require.main === module) {
  for (const d of build()) {
    fs.mkdirSync(path.dirname(path.join(ROOT, d.out)), { recursive: true });
    fs.writeFileSync(path.join(ROOT, d.out), d.html);
    console.log(`${d.out}  (versión ${d.version}${d.draft ? ', borrador' : ''})`);
  }
}

module.exports = { mdToHtml, build, isDraft, versionOf, DOCS };
