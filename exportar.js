// M6 · Exportar a Excel (coach, producto «coach»). Lógica PURA, sin DOM ni dependencias (se prueba en tests/exportar.test.js):
//   1) Filtro de permisos: de los registros que el coach YA recibe con coach_pull se queda SOLO con lo que puede ver (defensa en profundidad:
//      el servidor ya los filtra). Medidas siempre (peso y medidas son requeridos para el acompañamiento); comidas solo si las comparte;
//      hábitos y entrenos solo si comparte hábitos; NUNCA registros en pausa privada, fotos, perfil, datos de salud L4 ni avisos de dolor
//      (no se leen: solo entran las claves de una lista blanca de cada tipo); la nota solo si comparte sus notas.
//   2) Generador mínimo de XLSX (Office Open XML): un ZIP sin compresión (STORED, con CRC-32) con el XML de SpreadsheetML. Cadenas en la tabla de
//      cadenas compartidas (tipo texto: nunca fórmulas); las que empiezan con = + - @ tab o retorno llevan además «prefijo de comilla» (quotePrefix,
//      el apóstrofo de Excel) y formato texto. Fechas como fecha real (aaaa-mm-dd). Abre en Excel (también el de iPhone), Numbers y Google Sheets.
//   3) La condición legal del botón: Política publicada ≥ 1.1 con su aviso activo (legal/VERSIONS.json; concepto 6, respuesta del abogado).
(function (root) {
  'use strict';

  // Concepto 6 (casilla obligatoria antes de CADA descarga; concepto 5, punto 3). LITERAL: tests/legal-literal.test.js.
  const CUSTODY_TEXT = 'Asumo la custodia y confidencialidad de estos datos conforme a la Ley 1581 de 2012 como responsable independiente.';
  const MIN_POLICY = '1.1';

  // Qué datos (boceto M6). La clave viaja al registro del servidor (grasa.log_export). Fotos NO es una categoría: nunca se exportan.
  const CATS = [
    { key: 'medidas', sheet: 'Medidas', label: 'Medidas', sub: 'peso, perímetros' },
    { key: 'comidas', sheet: 'Comidas', label: 'Comidas', sub: 'platos, kcal aprox.' },
    { key: 'habitos', sheet: 'Hábitos', label: 'Hábitos', sub: 'agua, pasos, sueño' },
    { key: 'entrenos', sheet: 'Entrenos', label: 'Entrenos', sub: 'días, esfuerzo' },
  ];
  const CAT_KEYS = CATS.map((c) => c.key);

  const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
  const isISO = (d) => typeof d === 'string' && ISO_RE.test(d) && !Number.isNaN(Date.parse(d + 'T00:00:00Z'));
  const addDays = (iso, n) => { const t = new Date(iso + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const fileName = (todayISO) => `exportacion-${todayISO}.xlsx`;

  // ---------- Rango de fechas: atajos del boceto ----------
  // 'mes' = desde el día 1 del mes de hoy; '3m' = desde el mismo día de hace 3 meses; 'todo' = desde el primer día con vínculo (o hace 5 años).
  function rangeOf(kind, today, earliest) {
    if (kind === 'mes') return { from: today.slice(0, 8) + '01', to: today };
    if (kind === '3m') {
      const [y, m, d] = today.split('-').map(Number);
      const t = new Date(Date.UTC(y, m - 1 - 3, 1));
      const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
      t.setUTCDate(Math.min(d, last));
      return { from: t.toISOString().slice(0, 10), to: today };
    }
    const floor = addDays(today, -5 * 365);
    return { from: isISO(earliest) && earliest < today ? (earliest > floor ? earliest : floor) : floor, to: today };
  }
  // Valida la elección completa. Devuelve el mensaje (para la pantalla) o null si todo está bien.
  function validate({ clientIds, cats, from, to, today, custody }) {
    if (!Array.isArray(clientIds) || !clientIds.length) return 'Elige al menos un asesorado.';
    if (!Array.isArray(cats) || !cats.length || cats.some((c) => !CAT_KEYS.includes(c))) return 'Elige al menos un tipo de dato.';
    if (!isISO(from) || !isISO(to)) return 'Escribe las dos fechas: Desde y Hasta.';
    if (from > to) return '«Desde» debe ser anterior o igual a «Hasta».';
    if (today && to > addDays(today, 1)) return '«Hasta» no puede ser una fecha futura.';
    if (custody !== true) return 'Marca la casilla de custodia para descargar.';
    return null;
  }

  // ---------- Política v1.1: la descarga solo se habilita con la política publicada (≥ 1.1) y su aviso activo ----------
  const cmpVer = (a, b) => {
    const pa = String(a).split('.').map((x) => parseInt(x, 10) || 0), pb = String(b).split('.').map((x) => parseInt(x, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d < 0 ? -1 : 1; }
    return 0;
  };
  function policyGate(versions) {
    const p = versions && versions.privacy;
    if (!p || typeof p.version !== 'string') return { ok: false, reason: 'No pudimos comprobar la versión publicada de la Política de Tratamiento de Datos. Revisa tu conexión e inténtalo de nuevo.' };
    if (cmpVer(p.version, MIN_POLICY) < 0) return { ok: false, reason: `La descarga se habilita cuando esté publicada la Política de Tratamiento de Datos v${MIN_POLICY} y su aviso a los asesorados esté activo. Hoy está publicada la v${p.version}.` };
    if (!(p.notice && p.notice.active === true)) return { ok: false, reason: `La descarga se habilita cuando el aviso de la Política de Tratamiento de Datos v${p.version} esté activo para tus asesorados.` };
    return { ok: true, reason: '' };
  }

  // ---------- 1) Filtro de permisos y filas de cada hoja ----------
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const txt = (v, max = 400) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
  const EFFORT = { facil: 'Fácil', normal: 'Normal', duro: 'Duro', no_termine: 'No pude terminar' };
  const CLOSE = { si: 'Sí', casi: 'Casi todo', no: 'No' };
  const PORTION = { half: 'Media porción', normal: 'Porción normal', large: 'Porción grande', double: 'Doble porción' };
  const MEALS = ['Desayuno', 'Almuerzo', 'Cena', 'Snack'];
  const ENTRY = [['weight', 'Peso (kg)'], ['waist', 'Cintura (cm)'], ['abdomen', 'Abdomen (cm)'], ['hip', 'Cadera (cm)'], ['neck', 'Cuello (cm)'],
    ['armR', 'Brazo der. (cm)'], ['armL', 'Brazo izq. (cm)'], ['back', 'Espalda (cm)'], ['thighR', 'Muslo der. (cm)'], ['thighL', 'Muslo izq. (cm)'], ['bodyFat', '% grasa']];

  // Lo que el coach puede ver de UN asesorado (shares = los permisos vigentes que devuelve coach_clients).
  function visibleRecords(records, shares) {
    const sh = shares || {};
    return (Array.isArray(records) ? records : []).filter((r) => r && typeof r === 'object' && !r.deletedAt && !r.deleted_at
      && r.pausePrivate !== true && r.pause_private !== true            // nunca lo escrito en pausa privada (coach_pull ya no lo manda)
      && r.data && typeof r.data === 'object' && !Array.isArray(r.data)
      && (r.kind === 'entry' || (r.kind === 'food' && sh.nutrition === true) || (r.kind === 'habit' && sh.habits === true)));   // ni perfil, ni biblioteca, ni fotos
  }
  const dayOf = (r) => (r.kind === 'food' ? r.date : r.nkey || r.date);
  const inRange = (d, from, to) => isISO(d) && d >= from && d <= to;

  // clients: [{ name, shares, records }]; cats: claves de CATS. Devuelve las hojas en orden (Léame primero) y un resumen.
  function buildSheets({ clients, from, to, cats, generatedLabel = '' }) {
    const want = new Set(cats);
    const list = (clients || []).map((c) => ({ name: String(c.name || 'Asesorado sin nombre').slice(0, 120), shares: c.shares || {}, recs: visibleRecords(c.records, c.shares) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
    const notes = (c) => c.shares.notes === true;
    const anyNotes = list.some(notes);
    const sheets = [];
    const byDate = (a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
    const pick = (c, kind) => c.recs.filter((r) => r.kind === kind && inRange(dayOf(r), from, to));
    if (want.has('medidas')) {
      const rows = [];
      for (const c of list) {
        for (const r of pick(c, 'entry').sort((a, b) => (dayOf(a) < dayOf(b) ? -1 : 1))) {
          const vals = ENTRY.map(([k]) => num(r.data[k]));
          if (vals.every((v) => v == null) && !(notes(c) && txt(r.data.note))) continue;
          rows.push([c.name, { date: dayOf(r) }, ...vals, ...(anyNotes ? [notes(c) ? txt(r.data.note) : null] : [])]);
        }
      }
      sheets.push({ name: 'Medidas', head: ['Asesorado', 'Fecha', ...ENTRY.map((e) => e[1]), ...(anyNotes ? ['Nota'] : [])], rows });
    }
    if (want.has('comidas')) {
      const rows = [];
      for (const c of list) {
        const fs = pick(c, 'food').map((r) => [dayOf(r), txt(r.data.time, 5) || '', r]).sort((a, b) => byDate(a, b) || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
        for (const [d, time, r] of fs) {
          const x = r.data;
          rows.push([c.name, { date: d }, time || null, MEALS.includes(x.meal) ? x.meal : null, txt(x.name, 80), PORTION[x.portion] || null,
            num(x.kcal), num(x.protein), num(x.carbs), num(x.fat), ...(anyNotes ? [notes(c) ? txt(x.note) : null] : [])]);
        }
      }
      sheets.push({ name: 'Comidas', head: ['Asesorado', 'Fecha', 'Hora', 'Tipo de comida', 'Plato o alimento', 'Porción', 'kcal aprox.', 'Proteína (g)', 'Carbohidratos (g)', 'Grasas (g)', ...(anyNotes ? ['Nota'] : [])], rows });
    }
    if (want.has('habitos')) {
      const rows = [];
      for (const c of list) {
        for (const r of pick(c, 'habit').sort((a, b) => (dayOf(a) < dayOf(b) ? -1 : 1))) {
          const x = r.data;
          const row = [num(x.water), num(x.steps), num(x.sleep), CLOSE[x.close] || null];
          if (row.every((v) => v == null)) continue;
          rows.push([c.name, { date: dayOf(r) }, ...row]);
        }
      }
      sheets.push({ name: 'Hábitos', head: ['Asesorado', 'Fecha', 'Agua (L)', 'Pasos', 'Sueño (h)', '¿Registró todo el día?'], rows });
    }
    if (want.has('entrenos')) {
      const rows = [];
      for (const c of list) {
        for (const r of pick(c, 'habit').sort((a, b) => (dayOf(a) < dayOf(b) ? -1 : 1))) {
          if (r.data.trained !== true) continue;
          rows.push([c.name, { date: dayOf(r) }, 'Sí', EFFORT[r.data.effort] || null]);
        }
      }
      sheets.push({ name: 'Entrenos', head: ['Asesorado', 'Fecha', 'Entrenó', 'Esfuerzo'], rows });
    }
    const noHabits = list.filter((c) => c.shares.habits !== true).map((c) => c.name);
    const noFood = list.filter((c) => c.shares.nutrition !== true).map((c) => c.name);
    const catNames = CATS.filter((c) => want.has(c.key)).map((c) => c.label);
    const leame = [
      ['Exportación de datos de asesorados'],
      [],
      ['Rango de fechas', `Desde ${from} hasta ${to}`],
      ['Desde', { date: from }],
      ['Hasta', { date: to }],
      ['Generado', generatedLabel || null],
      ['Asesorados', list.length],
      ['Datos incluidos', catNames.join(', ')],
      ['Fotos', 'No se exportan.'],
      ['Custodia', CUSTODY_TEXT],
      [],
      ['Qué incluye', 'Solo lo que cada asesorado comparte contigo en la app. Nunca fotos, registros hechos durante una pausa del servicio, respuestas de salud ni avisos de dolor.'],
      ...(want.has('habitos') || want.has('entrenos') ? [['Sin hábitos ni entrenos', noHabits.length ? `No comparten sus hábitos: ${noHabits.join(', ')}` : 'Todos comparten sus hábitos.']] : []),
      ...(want.has('comidas') && noFood.length ? [['Sin comidas', `No comparten sus comidas: ${noFood.join(', ')}`]] : []),
      ['Cada hoja', 'Una fila por registro, con el asesorado y la fecha. Las calorías son aproximadas.'],
    ];
    return {
      sheets: [{ name: 'Leame', rows: leame, widths: [24, 90], plain: true }, ...sheets.map((s) => ({ ...s, rows: [s.head, ...s.rows], widths: s.head.map((h, i) => (i === 0 ? 24 : i === 1 ? 12 : Math.max(10, Math.min(28, h.length + 2)))) }))],
      summary: { clients: list.length, rows: Object.fromEntries(sheets.map((s) => [s.name, s.rows.length])), noHabits, noFood },
    };
  }

  // ---------- 2) XLSX: SpreadsheetML + ZIP (STORED) ----------
  const XML_BAD = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
  const clean = (s) => String(s).replace(XML_BAD, (m) => (m.length > 1 ? m[0] : ''));
  const xesc = (s) => clean(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // Inyección de fórmulas (CSV/hojas): texto que empieza con = + - @ tab o retorno.
  const RISKY = /^[=+\-@\t\r]/;
  const isRisky = (s) => RISKY.test(String(s));
  const colName = (i) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
  const serial = (iso) => { const [y, m, d] = iso.split('-').map(Number); return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000; };
  // Estilos (cellXfs): 0 normal · 1 encabezado en negrita · 2 fecha aaaa-mm-dd · 3 texto con apóstrofo (quotePrefix) · 4 texto largo con ajuste.
  const S = { head: 1, date: 2, quoted: 3, wrap: 4 };
  const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd"/></numFmts>'
    + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>'
    + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
    + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
    + '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
    + '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" quotePrefix="1"/>'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs>'
    + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
    + '</styleSheet>';
  const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

  // sheets: [{ name, rows: [[celda]], widths?, plain? }]; celda = string | number | { date: 'aaaa-mm-dd' } | null.
  // La primera fila de cada hoja (salvo `plain`) es el encabezado en negrita y queda fija al desplazarse.
  function workbookFiles(sheets, { created = '2026-01-01T00:00:00Z' } = {}) {
    const sst = [], sstIdx = new Map();
    let sstCount = 0;
    const str = (s) => { const v = clean(s).slice(0, 32767); sstCount++; if (!sstIdx.has(v)) { sstIdx.set(v, sst.length); sst.push(v); } return sstIdx.get(v); };
    const files = [];
    sheets.forEach((sh, si) => {
      const rowsXml = sh.rows.map((row, ri) => {
        const cells = (row || []).map((v, ci) => {
          if (v == null || v === '') return '';
          const ref = colName(ci) + (ri + 1);
          if (typeof v === 'number') return Number.isFinite(v) ? `<c r="${ref}"><v>${v}</v></c>` : '';
          if (typeof v === 'object' && isISO(v.date)) return `<c r="${ref}" s="${S.date}"><v>${serial(v.date)}</v></c>`;
          const s = String(v);
          const style = isRisky(s) ? S.quoted : !sh.plain && ri === 0 ? S.head : sh.plain && ri === 0 && ci === 0 ? S.head : sh.plain && ci === 1 && s.length > 60 ? S.wrap : 0;
          return `<c r="${ref}" t="s"${style ? ` s="${style}"` : ''}><v>${str(s)}</v></c>`;
        }).join('');
        return `<row r="${ri + 1}">${cells}</row>`;
      }).join('');
      const cols = (sh.widths || []).length ? `<cols>${sh.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
      const pane = sh.plain || sh.rows.length < 2 ? '<sheetView workbookViewId="0"' + (si === 0 ? ' tabSelected="1"' : '') + '/>'
        : '<sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView>';
      files.push([`xl/worksheets/sheet${si + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet ${NS}><sheetViews>${pane}</sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${rowsXml}</sheetData></worksheet>`]);
    });
    const n = sheets.length;
    const ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
      + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
      + '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>';
    const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
      + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>';
    const wb = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook ${NS}><bookViews><workbookView/></bookViews><sheets>`
      + sheets.map((s, i) => `<sheet name="${xesc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>';
    const wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
      + `<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
      + `<Relationship Id="rId${n + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`;
    const sstXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sstCount}" uniqueCount="${sst.length}">`
      + sst.map((s) => `<si><t${/^\s|\s$|\n/.test(s) ? ' xml:space="preserve"' : ''}>${xesc(s)}</t></si>`).join('') + '</sst>';
    const core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
      + `<dc:title>Exportación de datos de asesorados</dc:title><dc:creator>Pérdida de Grasa</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${xesc(created)}</dcterms:created></cp:coreProperties>`;
    const app = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Pérdida de Grasa</Application></Properties>';
    return [['[Content_Types].xml', ct], ['_rels/.rels', rels], ['docProps/core.xml', core], ['docProps/app.xml', app], ['xl/workbook.xml', wb],
      ['xl/_rels/workbook.xml.rels', wbRels], ['xl/styles.xml', STYLES], ['xl/sharedStrings.xml', sstXml], ...files];
  }

  // ZIP mínimo (sin compresión). CRC-32 estándar (polinomio 0xEDB88320).
  let CRC_T = null;
  function crc32(bytes) {
    if (!CRC_T) { CRC_T = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c >>> 0; } }
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_T[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  const utf8 = (s) => new TextEncoder().encode(s);
  function zip(entries, when = new Date(Date.UTC(2026, 0, 1))) {
    const dosTime = ((when.getUTCHours() << 11) | (when.getUTCMinutes() << 5) | Math.floor(when.getUTCSeconds() / 2)) & 0xFFFF;
    const dosDate = (((when.getUTCFullYear() - 1980) << 9) | ((when.getUTCMonth() + 1) << 5) | when.getUTCDate()) & 0xFFFF;
    const parts = [], central = [];
    let offset = 0;
    for (const [name, content] of entries) {
      const nb = utf8(name), data = typeof content === 'string' ? utf8(content) : content, crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nb.length, true); lh.setUint16(28, 0, true);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true);
      ch.setUint32(24, data.length, true); ch.setUint16(28, nb.length, true); ch.setUint32(42, offset, true);
      parts.push(new Uint8Array(lh.buffer), nb, data);
      central.push(new Uint8Array(ch.buffer), nb);
      offset += 30 + nb.length + data.length;
    }
    const cdSize = central.reduce((t, p) => t + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    const all = [...parts, ...central, new Uint8Array(end.buffer)];
    const out = new Uint8Array(all.reduce((t, p) => t + p.length, 0));
    let o = 0;
    for (const p of all) { out.set(p, o); o += p.length; }
    return out;
  }
  const xlsx = (sheets, opts = {}) => zip(workbookFiles(sheets, opts), opts.when);
  const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  // Lo que se registra en el servidor (sin contenido de los datos): cuántos asesorados, qué categorías, el rango y la casilla.
  const logPayload = ({ clientIds, cats, from, to, custody }) => ({ clients: clientIds.length, categories: CAT_KEYS.filter((k) => cats.includes(k)), from, to, custody: custody === true });

  const api = { CUSTODY_TEXT, MIN_POLICY, CATS, CAT_KEYS, fileName, rangeOf, validate, cmpVer, policyGate, visibleRecords, buildSheets, workbookFiles, crc32, zip, xlsx, MIME, isRisky, colName, serial, logPayload, addDays };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Exportar = api;
})(typeof window !== 'undefined' ? window : globalThis);
