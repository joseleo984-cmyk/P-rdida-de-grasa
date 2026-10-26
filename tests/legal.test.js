const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Schema = require('../schema.js');
const Legal = require('../scripts/build-legal.js');

const ROOT = path.join(__dirname, '..');
const NOW = '2026-10-21T15:00:00.000Z';
const boxes = { terms: true, privacy: true, adult: true, sensitiveHealth: true, photos: false };

test('LEGAL-01: las páginas HTML están al día con los .md (ejecuta "npm run legal")', () => {
  for (const d of Legal.build()) {
    assert.strictEqual(fs.readFileSync(path.join(ROOT, d.out), 'utf8'), d.html, d.out + ' desactualizado');
  }
});

test('LEGAL-01: versiones de los .md = LEGAL_VERSIONS y aviso de borrador visible', () => {
  const [terms, privacy] = Legal.build();
  assert.strictEqual(terms.version, Schema.LEGAL_VERSIONS.terms);
  assert.strictEqual(privacy.version, Schema.LEGAL_VERSIONS.privacy);
  for (const d of [terms, privacy]) assert.strictEqual(d.html.includes('Borrador pendiente de revisión legal'), d.draft);
});

test('LEGAL-01: los HTML legales están en la caché del service worker y en el despliegue', () => {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const pages = fs.readFileSync(path.join(ROOT, 'scripts/build-site.js'), 'utf8'); // el despliegue lo arma build-site.js (pages.yml lo invoca)
  for (const d of Legal.DOCS) assert.ok(sw.includes(`'${d.out}'`), 'sw.js ASSETS sin ' + d.out);
  assert.ok(/\['legal', 'legal'\]/.test(pages), 'build-site.js no copia legal/');
});

test('LEGAL-01: el HTML no muestra notas internas ni la cabecera de trabajo (siguen en los .md)', () => {
  for (const d of Legal.build()) {
    assert.ok(!/NOTA|Alternativas:|A confirmar|Autor: Agente|Dudas para el abogado/.test(d.html), d.out + ' muestra notas internas');
    assert.ok(/NOTA/.test(fs.readFileSync(path.join(ROOT, d.src), 'utf8')), d.src + ' debería conservar sus notas');
  }
  assert.strictEqual(Legal.publicMarkdown('> cabecera\n\n# T\n- a\n- *NOTA: x*\n\nTexto *NOTA, y:* **z** *(Alternativas: w)*'), '# T\n- a\n\nTexto **z**');
});

test('LEGAL-01: anclas de sección para los enlaces de la app (#s5 fotos/salud, #s7 menores)', () => {
  const privacy = Legal.build().find((d) => d.out === 'legal/privacidad.html').html;
  assert.match(privacy, /<h2 id="s5">5\. Datos sensibles/);
  assert.match(privacy, /<h2 id="s7">7\. Menores de edad/);
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const id of index.match(/legal\/privacidad\.html#(s[\d-]+)/g) || []) assert.ok(privacy.includes(`id="${id.split('#')[1]}"`), id);
  assert.strictEqual(Legal.publicMarkdown('# T\n## 1. A\nx\n## Dudas para el abogado\n- ¿y?\n### sub\nz\n## 2. B\ny'), '# T\n## 1. A\nx\n## 2. B\ny');
});

test('mdToHtml: escapa HTML y convierte formato básico', () => {
  const html = Legal.mdToHtml('# T\n\nHola **b** *i* `c` <script>x</script>\n\n- a\n- b\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n> nota');
  assert.ok(html.includes('<h1>T</h1>'));
  assert.ok(html.includes('<strong>b</strong> <em>i</em> <code>c</code> &lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('<ul><li>a</li><li>b</li></ul>'));
  assert.ok(html.includes('<th scope="col">A</th>') && html.includes('<td>2</td>'));
  assert.ok(html.includes('<blockquote><p>nota</p></blockquote>'));
});

test('consent: migración v2 → v3 añade consent null; respaldos viejos siguen cargando', () => {
  assert.ok(Schema.CURRENT_VERSION >= 3);   // v4 (S2-4) mantiene la regla
  const v1 = Schema.migrate({ entries: [] });
  assert.strictEqual(v1.consent, null);
  const v2 = Schema.normalize(Schema.migrate({ schemaVersion: 2, entries: [{ id: 'a', date: '2026-10-20', weight: 70 }] }));
  assert.strictEqual(v2.state.consent, null);
  assert.strictEqual(v2.state.entries.length, 1);
  assert.deepStrictEqual(v2.warnings, []);
});

test('consent: buildConsent exige T&C, Política y mayor de 18; facultativas por defecto en false', () => {
  for (const k of ['terms', 'privacy', 'adult']) assert.throws(() => Schema.buildConsent({ ...boxes, [k]: false }, NOW), /obligatorias/);
  assert.throws(() => Schema.buildConsent(boxes, 'ayer'), /Fecha/);
  const c = Schema.buildConsent({ terms: true, privacy: true, adult: true }, NOW);
  assert.deepStrictEqual(c, {
    termsVersion: '0.1', privacyVersion: '1.2', sensitiveHealth: false, photos: false, adult: true,
    acceptedAt: NOW, updatedAt: NOW, sensitiveHealthAt: NOW, photosAt: NOW,
  });
});

test('consent: consentStatus missing / outdated / ok', () => {
  assert.strictEqual(Schema.consentStatus(null), 'missing');
  assert.strictEqual(Schema.consentStatus({ termsVersion: '0.1' }), 'missing');
  const c = Schema.buildConsent(boxes, NOW);
  assert.strictEqual(Schema.consentStatus(c), 'ok');
  assert.strictEqual(Schema.consentStatus(c, { terms: '0.2', privacy: '0.1' }), 'outdated');
  assert.strictEqual(Schema.consentStatus({ ...c, privacyVersion: '0.0' }), 'outdated');
  // v1.1: cambio informativo, sin re-aceptación forzada: quien aceptó la 0.1 sigue vigente (solo con las versiones publicadas)
  assert.strictEqual(Schema.consentStatus({ ...c, privacyVersion: '0.1' }), 'ok');
  assert.strictEqual(Schema.consentStatus({ ...c, privacyVersion: '0.1' }, { terms: '0.1', privacy: '1.1' }), 'outdated');
  // v1.2 (concepto 7, punto 5): también informativa: quien aceptó la 1.1 sigue vigente
  assert.strictEqual(Schema.consentStatus({ ...c, privacyVersion: '1.1' }), 'ok');
});

test('v1.2: legal/VERSIONS.json es la fuente única y coincide con los .md, con Schema.LEGAL_VERSIONS y con LEGAL_COMPAT', () => {
  const V = JSON.parse(fs.readFileSync(path.join(ROOT, 'legal/VERSIONS.json'), 'utf8'));
  const [terms, privacy] = Legal.build();
  assert.strictEqual(V.privacy.version, '1.2');
  assert.strictEqual(V.privacy.notice.id, 'politica-1.2', 'aviso nuevo: sale una vez aunque ya se haya visto el de la v1.1');
  assert.strictEqual(V.privacy.version, privacy.version);
  assert.strictEqual(V.terms.version, terms.version);
  assert.deepStrictEqual({ terms: V.terms.version, privacy: V.privacy.version }, Schema.LEGAL_VERSIONS);
  assert.deepStrictEqual({ terms: V.terms.acceptedStillValid, privacy: V.privacy.acceptedStillValid }, Schema.LEGAL_COMPAT);
  assert.strictEqual(V.privacy.notice.active, true);
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  assert.ok(sw.includes("'legal/VERSIONS.json'"), 'el SW precachea VERSIONS.json (la app lo lee sin conexión)');
});

test('consent: normalize descarta formas inválidas y conserva las válidas (ida y vuelta)', () => {
  const c = Schema.buildConsent(boxes, NOW);
  const ok = Schema.normalize({ entries: [], consent: c });
  assert.deepStrictEqual(ok.state.consent, c);
  assert.deepStrictEqual(ok.warnings, []);
  for (const bad of ['sí', 1, [], { ...c, adult: false }, { ...c, acceptedAt: 'ayer' }, { ...c, termsVersion: '<b>' }]) {
    const r = Schema.normalize({ entries: [], consent: bad });
    assert.strictEqual(r.state.consent, null, JSON.stringify(bad));
    assert.strictEqual(r.warnings.length, 1);
  }
  // Campos extra o tipos raros no pasan.
  const r = Schema.normalize({ entries: [], consent: { ...c, photos: 'true', extra: '<img>' } });
  assert.strictEqual(r.state.consent.photos, false);
  assert.ok(!('extra' in r.state.consent));
});

test('consent: setConsentFlag cambia solo la autorización facultativa y su fecha, sin mutar', () => {
  const c = Schema.buildConsent(boxes, NOW);
  const later = '2026-10-22T10:00:00.000Z';
  const d = Schema.setConsentFlag(c, 'photos', true, later);
  assert.strictEqual(d.photos, true);
  assert.strictEqual(d.photosAt, later);
  assert.strictEqual(d.updatedAt, later);
  assert.strictEqual(d.sensitiveHealthAt, NOW);
  assert.strictEqual(c.photos, false);
  assert.throws(() => Schema.setConsentFlag(c, 'terms', false, later), /no válida/);
  assert.throws(() => Schema.setConsentFlag(null, 'photos', true, later), /No hay/);
});
