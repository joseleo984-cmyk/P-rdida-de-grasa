// Almacenamiento de fotos de progreso en IndexedDB (localStorage no tiene espacio para imágenes).
(function (root) {
  'use strict';

  const DB_NAME = PGNS.dbName();
  const STORE = 'photos';
  const MAX_SIDE = 1280;
  const QUALITY = 0.82;

  let dbPromise;
  function db() {
    dbPromise ||= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function tx(mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction(STORE, mode);
      let result;
      // Si `fn` lanza, se aborta para que no se confirme nada de lo ya pedido (p. ej. un clear()).
      try { result = fn(t.objectStore(STORE)); } catch (err) { t.abort(); reject(err); return; }
      t.oncomplete = () => resolve(result && 'result' in result ? result.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Transacción cancelada'));
    });
  }

  const all = () => tx('readonly', (s) => s.getAll());
  const get = (id) => tx('readonly', (s) => s.get(id));   // Sprint 11: una foto por id (sincronización de fotos)
  const put = (photo) => tx('readwrite', (s) => s.put(photo));
  const remove = (id) => tx('readwrite', (s) => s.delete(id));
  const clear = () => tx('readwrite', (s) => s.clear());

  // Reduce la imagen a MAX_SIDE px y la convierte a JPEG. El navegador aplica la orientación EXIF.
  async function compress(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error('No se pudo leer la imagen'));
        i.src = url;
      });
      const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
      if (!blob) throw new Error('No se pudo procesar la imagen');
      return { blob, width: w, height: h };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  // Decodifica sin fetch() para que también funcione con file:// y no dependa de la CSP.
  function dataURLToBlob(dataURL) {
    const comma = dataURL.indexOf(',');
    const type = dataURL.slice(5, dataURL.indexOf(';'));
    const bin = atob(dataURL.slice(comma + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type });
  }

  // Para el respaldo JSON: las fotos se guardan como data URLs.
  async function exportAll() {
    const photos = await all();
    return Promise.all(photos.map(async ({ blob, ...rest }) => ({ ...rest, data: await blobToDataURL(blob) })));
  }

  // Reemplaza todas las fotos de forma atómica. `list` ya viene validada (Schema.normalizePhotos):
  // primero se decodifica todo en memoria y después se borra e inserta en UNA transacción,
  // así que si algo falla IndexedDB la revierte y la galería anterior queda intacta.
  async function importAll(list) {
    const decoded = (list || []).map(({ data, ...rest }) => ({ ...rest, blob: dataURLToBlob(data) }));
    await tx('readwrite', (s) => {
      s.clear();
      for (const p of decoded) s.put(p);
    });
  }

  // S2-4: las fotos de versiones anteriores pasan a id UUID y reciben updatedAt, en UNA transacción
  // (borrar la clave vieja y poner la nueva van juntas: si algo falla, no se pierde ninguna foto).
  // La lectura (getAll) y la reescritura van en LA MISMA transacción readwrite: IndexedDB serializa las transacciones
  // de escritura sobre el mismo almacén, así que si dos pestañas (o dos loadPhotos) migran a la vez, la segunda ya ve
  // las fotos migradas y no las duplica (D1 de QA en S2-4). Idempotente.
  async function migrateIds({ isValid, uid, epoch }) {
    let migrated = 0;
    await tx('readwrite', (s) => {
      const req = s.getAll();
      req.onsuccess = () => {
        try {
          for (const p of req.result) {
            if (!p || (isValid(p.id) && p.updatedAt !== undefined)) continue;
            migrated++;
            if (isValid(p.id)) { s.put({ ...p, updatedAt: epoch }); continue; }
            s.delete(p.id);
            s.put({ ...p, id: uid(), updatedAt: p.updatedAt || epoch });
          }
        } catch {
          // Se revierte TODO (también los delete ya pedidos); tx() rechaza y la migración se reintenta en otra carga.
          s.transaction.abort();
        }
      };
    });
    return migrated;
  }

  root.Photos = { all, get, put, remove, clear, compress, exportAll, importAll, migrateIds, decode: dataURLToBlob };
})(window);
