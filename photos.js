// Almacenamiento de fotos de progreso en IndexedDB (localStorage no tiene espacio para imágenes).
(function (root) {
  'use strict';

  const DB_NAME = 'perdida-grasa';
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
      const result = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(result && 'result' in result ? result.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Transacción cancelada'));
    });
  }

  const all = () => tx('readonly', (s) => s.getAll());
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

  async function dataURLToBlob(dataURL) {
    return (await fetch(dataURL)).blob();
  }

  // Para el respaldo JSON: las fotos se guardan como data URLs.
  async function exportAll() {
    const photos = await all();
    return Promise.all(photos.map(async ({ blob, ...rest }) => ({ ...rest, data: await blobToDataURL(blob) })));
  }

  async function importAll(list) {
    await clear();
    for (const { data, ...rest } of list || []) {
      if (typeof data !== 'string' || !data.startsWith('data:image/')) continue;
      await put({ ...rest, blob: await dataURLToBlob(data) });
    }
  }

  root.Photos = { all, put, remove, clear, compress, exportAll, importAll };
})(window);
