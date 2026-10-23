// Etapa 2 («App para coaches»): rutinas de ejercicios y GIFs. Lógica PURA (sin DOM; pruebas en tests/rutinas.test.js).
// El coach arma UNA rutina por cliente: título + días («Día 1 – Pecho y tríceps») + ejercicios (nombre, series × repeticiones,
// nota y animación opcionales). Las animaciones (GIF o WebP, máx. 3 MB) se suben UNA vez a la biblioteca del coach y se reutilizan.
// Los límites y la firma de bytes son los mismos que impone el servidor (grasa.routine_content_ok y grasa.register_gif, r1 v1.7):
// aquí solo se validan antes para avisar con un mensaje claro; el servidor decide de verdad. El GIF NO se re-codifica (se perdería la animación).
(function (root) {
  'use strict';
  const LIMITS = { days: 7, exercises: 12, title: 60, dayTitle: 60, name: 60, sets: 30, note: 200, gifName: 60, gifBytes: 3 * 1024 * 1024, gifs: 200 };
  const GIF_TYPES = ['image/gif', 'image/webp'];
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const str = (v) => (typeof v === 'string' ? v : '');
  const trim = (v) => str(v).trim();
  const mb = (n) => (n / 1048576).toLocaleString('es', { maximumFractionDigits: 1 });

  // ---------- GIF / WebP: tipo, tamaño y firma de bytes ----------
  const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const ascii = (bytes, from, to) => String.fromCharCode(...Array.from(bytes).slice(from, to));
  // Mira los primeros 12 bytes: «GIF87a» / «GIF89a» → image/gif; «RIFF….WEBP» → image/webp; otra cosa → null.
  function sniff(head) {
    if (!head || head.length < 12) return null;
    const g = ascii(head, 0, 6);
    if (g === 'GIF87a' || g === 'GIF89a') return 'image/gif';
    if (ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 12) === 'WEBP') return 'image/webp';
    return null;
  }
  // file = { type, size }, head = los primeros bytes. Devuelve { ok, mime, message }. Un archivo con tipo vacío (algunos teléfonos) vale si los bytes son válidos.
  function checkGif(file, head) {
    const f = file || {};
    const size = Number(f.size);
    if (!Number.isFinite(size) || size <= 0) return { ok: false, message: 'Ese archivo está vacío. Elige otro.' };
    if (size > LIMITS.gifBytes) return { ok: false, message: `Esa animación pesa ${mb(size)} MB y el máximo es ${mb(LIMITS.gifBytes)} MB. Elige una más liviana.` };
    const type = str(f.type).toLowerCase();
    if (type && !GIF_TYPES.includes(type)) return { ok: false, message: 'Solo se pueden subir animaciones GIF o WebP. Las fotos y los videos no sirven aquí.' };
    const mime = sniff(head);
    if (!mime || (type && type !== mime)) return { ok: false, message: 'Ese archivo no parece una animación GIF o WebP de verdad. Elige otro.' };
    return { ok: true, mime };
  }
  // Nombre sugerido para la biblioteca a partir del nombre del archivo («press-banca.gif» → «press banca»).
  const suggestName = (fileName) => trim(trim(fileName).replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[_-]+/g, ' ')).slice(0, LIMITS.gifName);

  // ---------- Rutina ----------
  const blankExercise = () => ({ name: '', sets: '', note: '', gif: '' });
  const blankDay = (n) => ({ title: n ? `Día ${n}` : '', exercises: [blankExercise()] });
  const blankRoutine = () => ({ title: '', days: [blankDay(1)] });

  // Forma tal como la guarda el servidor (rutinas.content): sin vacíos, sin claves de más. note y gif solo si existen.
  function toContent(r) {
    const days = (r && Array.isArray(r.days) ? r.days : []).map((d) => ({
      title: trim(d && d.title),
      exercises: (d && Array.isArray(d.exercises) ? d.exercises : []).filter((e) => e && (trim(e.name) || trim(e.sets) || trim(e.note) || trim(e.gif))).map((e) => {
        const o = { name: trim(e.name), sets: trim(e.sets) };
        if (trim(e.note)) o.note = trim(e.note);
        if (trim(e.gif)) o.gif = trim(e.gif).toLowerCase();
        return o;
      }),
    }));
    return { days };
  }
  // Lo que viene del servidor o del editor, con todos los textos presentes (para pintar sin comprobar nada).
  function fromServer(row) {
    if (!row || typeof row !== 'object') return null;
    const c = row.content && typeof row.content === 'object' ? row.content : { days: row.days };
    return {
      id: row.id || null, coachId: row.coachId || row.coach_id || null, clientId: row.clientId || row.client_id || null,
      title: trim(row.title), updatedAt: row.updatedAt || row.updated_at || null,
      days: (Array.isArray(c.days) ? c.days : []).map((d) => ({
        title: trim(d && d.title),
        exercises: (d && Array.isArray(d.exercises) ? d.exercises : []).map((e) => ({ name: trim(e && e.name), sets: trim(e && e.sets), note: trim(e && e.note), gif: trim(e && e.gif) })),
      })),
    };
  }

  // Revisa la rutina con mensajes para la persona. Devuelve { ok, errors: [{ day, ex, field, message }] } (day y ex desde 0).
  function validate(r) {
    const errors = [];
    const add = (day, ex, field, message) => errors.push({ day, ex, field, message });
    const title = trim(r && r.title);
    if (!title) add(null, null, 'title', 'Ponle un título a la rutina, por ejemplo «Fuerza en 4 días».');
    else if (title.length > LIMITS.title) add(null, null, 'title', `El título es muy largo: máximo ${LIMITS.title} letras.`);
    const days = r && Array.isArray(r.days) ? r.days : [];
    if (!days.length) add(null, null, 'days', 'Agrega al menos un día.');
    if (days.length > LIMITS.days) add(null, null, 'days', `Una rutina puede tener hasta ${LIMITS.days} días.`);
    days.forEach((d, i) => {
      const dt = trim(d && d.title);
      if (!dt) add(i, null, 'title', `El día ${i + 1} necesita un nombre, por ejemplo «Día ${i + 1} – Piernas».`);
      else if (dt.length > LIMITS.dayTitle) add(i, null, 'title', `El nombre del día ${i + 1} es muy largo: máximo ${LIMITS.dayTitle} letras.`);
      const list = (d && Array.isArray(d.exercises) ? d.exercises : []).filter((e) => e && (trim(e.name) || trim(e.sets) || trim(e.note) || trim(e.gif)));
      if (list.length > LIMITS.exercises) add(i, null, 'exercises', `El día ${i + 1} puede tener hasta ${LIMITS.exercises} ejercicios.`);
      list.forEach((e, j) => {
        const name = trim(e.name), sets = trim(e.sets), note = trim(e.note), gif = trim(e.gif);
        const where = `En el día ${i + 1}, ejercicio ${j + 1}`;
        if (!name) add(i, j, 'name', `${where}: escribe el nombre del ejercicio.`);
        else if (name.length > LIMITS.name) add(i, j, 'name', `${where}: el nombre es muy largo (máximo ${LIMITS.name} letras).`);
        if (!sets) add(i, j, 'sets', `${where}${name ? ` («${name}»)` : ''}: escribe las series y repeticiones, por ejemplo «4 × 12».`);
        else if (sets.length > LIMITS.sets) add(i, j, 'sets', `${where}: las series y repeticiones son muy largas (máximo ${LIMITS.sets} letras).`);
        if (note.length > LIMITS.note) add(i, j, 'note', `${where}: la nota es muy larga (máximo ${LIMITS.note} letras).`);
        if (gif && !UUID_RE.test(gif)) add(i, j, 'gif', `${where}: la animación no es válida. Elígela otra vez.`);
      });
    });
    return { ok: !errors.length, errors };
  }

  // «3 días · 9 ejercicios»
  function summary(r) {
    const days = (r && r.days) || [];
    const n = days.reduce((a, d) => a + ((d && d.exercises) || []).length, 0);
    return `${days.length} ${days.length === 1 ? 'día' : 'días'} · ${n} ${n === 1 ? 'ejercicio' : 'ejercicios'}`;
  }
  const dayLine = (d) => { const n = ((d && d.exercises) || []).length; return n ? `${n} ${n === 1 ? 'ejercicio' : 'ejercicios'}` : 'Día de descanso'; };
  // Cuántas veces se usa cada animación en una rutina (para avisar antes de quitarla).
  const gifIds = (r) => { const out = []; for (const d of (r && r.days) || []) for (const e of (d && d.exercises) || []) if (e && e.gif) out.push(e.gif); return out; };
  const fmtSize = (n) => (n >= 1048576 ? `${mb(n)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

  const api = { LIMITS, GIF_TYPES, sniff, toHex, checkGif, suggestName, blankExercise, blankDay, blankRoutine, toContent, fromServer, validate, summary, dayLine, gifIds, fmtSize, UUID_RE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Rutinas = api;
})(typeof window !== 'undefined' ? window : globalThis);
