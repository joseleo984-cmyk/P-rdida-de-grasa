// Lector mínimo de .xlsx para las pruebas (unitarias y E2E): abre el ZIP (STORED o DEFLATE), comprueba el CRC-32 de cada parte y
// devuelve las hojas como filas de valores (cadenas resueltas desde sharedStrings; números y fechas como número de serie).
const zlib = require('node:zlib');
function unzip(buf) {
  const b = Buffer.from(buf);
  const eocd = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('no es un ZIP');
  const n = b.readUInt16LE(eocd + 10), cdOff = b.readUInt32LE(eocd + 16);
  const out = new Map();
  let p = cdOff;
  for (let i = 0; i < n; i++) {
    if (b.readUInt32LE(p) !== 0x02014b50) throw new Error('cabecera central rota');
    const method = b.readUInt16LE(p + 10), crc = b.readUInt32LE(p + 16), csize = b.readUInt32LE(p + 20), nl = b.readUInt16LE(p + 28), xl = b.readUInt16LE(p + 30), cl = b.readUInt16LE(p + 32), off = b.readUInt32LE(p + 42);
    const name = b.slice(p + 46, p + 46 + nl).toString('utf8');
    const lnl = b.readUInt16LE(off + 26), lxl = b.readUInt16LE(off + 28);
    const raw = b.slice(off + 30 + lnl + lxl, off + 30 + lnl + lxl + csize);
    const data = method === 8 ? zlib.inflateRawSync(raw) : raw;
    if (zlib.crc32(data) !== crc) throw new Error('CRC incorrecto en ' + name);
    out.set(name, data.toString('utf8'));
    p += 46 + nl + xl + cl;
  }
  return out;
}
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
function workbook(buf) {
  const files = unzip(buf);
  const sst = [...(files.get('xl/sharedStrings.xml') || '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => unesc([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')));
  const rels = Object.fromEntries([...files.get('xl/_rels/workbook.xml.rels').matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const sheets = [...files.get('xl/workbook.xml').matchAll(/<sheet name="([^"]+)"[^>]*r:id="([^"]+)"/g)].map((m) => {
    const xml = files.get('xl/' + rels[m[2]].replace(/^\/?xl\//, ''));
    const rows = [...xml.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)].map((r) => {
      const row = [];
      for (const c of r[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>(?:<v>([^<]*)<\/v>)?<\/c>)/g)) {
        const col = [...c[1]].reduce((t, ch) => t * 26 + ch.charCodeAt(0) - 64, 0) - 1;
        if (c[3] == null) continue;
        row[col] = / t="s"/.test(c[2]) ? sst[Number(c[3])] : Number(c[3]);
      }
      return row;
    });
    return { name: unesc(m[1]), rows, xml };
  });
  return { files, sheets };
}
module.exports = { unzip, workbook };
