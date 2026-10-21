// Barrido de FOTOS HUÉRFANAS en Storage (QA-S3-1-D3, red de seguridad). Sin dependencias (Node 18+, fetch).
// Borra los archivos de 'grasa-photos/{user_id}/…' cuyo usuario ya no existe (bajas hechas desde el panel de Supabase,
// fallos a mitad de la baja…). La baja normal desde la app ya se niega si quedan fotos (core.delete_my_account).
//
// Uso (lo ejecuta el Stakeholder o una tarea programada; la clave service_role NUNCA va al repositorio ni al navegador):
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_KEY=<service_role> node supabase/tools/sweep-orphan-photos.js
//   …                                                                         node supabase/tools/sweep-orphan-photos.js --apply
// Sin --apply solo LISTA lo que borraría (simulación). Recomendado: semanal.
const BUCKET = 'grasa-photos';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main({ url, key, apply, fetchImpl = fetch, log = console.log }) {
  if (!url || !key) throw new Error('Faltan SUPABASE_URL y SUPABASE_SERVICE_KEY');
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const call = async (path, opts) => {
    const res = await fetchImpl(url.replace(/\/$/, '') + path, { headers, ...opts });
    if (!res.ok) throw new Error(`${opts.method || 'GET'} ${path} → HTTP ${res.status}: ${await res.text()}`);
    return res.json();
  };
  // 1. Carpetas sin usuario (función SQL solo para service_role).
  const folders = await call('/rest/v1/rpc/orphan_photo_folders', {
    method: 'POST', headers: { ...headers, 'Content-Profile': 'grasa' }, body: '{}',
  });
  let total = 0;
  for (const { folder, files } of folders) {
    if (!UUID_RE.test(folder)) { log(`Ignorada carpeta con nombre no UUID: ${folder}`); continue; }
    // 2. Archivos de la carpeta (API de Storage: en Supabase no se borran por SQL).
    const names = [];
    for (let offset = 0; ; offset += 1000) {
      const page = await call(`/storage/v1/object/list/${BUCKET}`, {
        method: 'POST', body: JSON.stringify({ prefix: folder, limit: 1000, offset }),
      });
      names.push(...page.filter((o) => o && o.name).map((o) => `${folder}/${o.name}`));
      if (page.length < 1000) break;
    }
    log(`${apply ? 'Borrando' : 'Se borrarían'} ${names.length} archivo(s) de ${folder} (SQL: ${files})`);
    total += names.length;
    if (apply) {
      for (let i = 0; i < names.length; i += 100) {
        await call(`/storage/v1/object/${BUCKET}`, { method: 'DELETE', body: JSON.stringify({ prefixes: names.slice(i, i + 100) }) });
      }
    }
  }
  log(folders.length ? `${apply ? 'Borrados' : 'Pendientes'}: ${total} archivo(s) en ${folders.length} carpeta(s)` : 'Sin fotos huérfanas');
  return { folders: folders.length, files: total };
}

module.exports = { main };

if (require.main === module) {
  main({ url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY, apply: process.argv.includes('--apply') })
    .catch((err) => { console.error('Error:', err.message); process.exit(1); });
}
