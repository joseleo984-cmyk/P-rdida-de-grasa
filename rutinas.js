// Etapa 2 («App para coaches»): rutinas de ejercicios y GIFs. Lógica PURA (sin DOM; pruebas en tests/rutinas.test.js).
// v1.8: el coach tiene una biblioteca de rutinas («Mis rutinas», plantillas), las ASIGNA (se crea una copia por asesorado; un asesorado puede tener
// varias y cada una se puede mostrar u ocultar) y publica una «Rutina de hoy» para todos. Cada rutina: título + días («Día 1 – Pecho y tríceps») + ejercicios (nombre, series × repeticiones,
// nota y animación opcionales). Las animaciones (GIF o WebP, máx. 3 MB; o video corto MP4/MOV/WebM, máx. 10 MB y 15 s, v1.9) se suben UNA vez a la biblioteca del coach y se reutilizan.
// Los límites y la firma de bytes son los mismos que impone el servidor (grasa.routine_content_ok y grasa.register_gif, r1 v1.7):
// aquí solo se validan antes para avisar con un mensaje claro; el servidor decide de verdad. El GIF NO se re-codifica (se perdería la animación).
(function (root) {
  'use strict';
  const LIMITS = { days: 7, exercises: 12, title: 60, dayTitle: 60, name: 60, sets: 30, note: 200, series: 20, reps: 10, weight: 10, rest: 600, gifName: 60, gifBytes: 3 * 1024 * 1024, videoBytes: 10 * 1024 * 1024, videoSeconds: 15, gifs: 200, templates: 50, perClient: 20, assignAtOnce: 100 };
  const GIF_TYPES = ['image/gif', 'image/webp'];
  const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // Valor del atributo accept del selector de archivo: «video/*» hace que el teléfono ofrezca además GRABAR con la cámara. Solo orienta al
  // teléfono: lo que de verdad se acepta lo decide checkGif (tipos mp4/mov/webm, GIF/WebP, firma de bytes, 10 MB / 3 MB), que no cambia.
  const ACCEPT = 'image/gif,image/webp,video/*';

  const str = (v) => (typeof v === 'string' ? v : '');
  const trim = (v) => str(v).trim();
  const mb = (n) => (n / 1048576).toLocaleString('es', { maximumFractionDigits: 1 });

  // ---------- GIF / WebP / video: tipo, tamaño y firma de bytes ----------
  const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const ascii = (bytes, from, to) => String.fromCharCode(...Array.from(bytes).slice(from, to));
  const isVideo = (mime) => VIDEO_TYPES.includes(mime);
  const maxBytes = (mime) => (isVideo(mime) ? LIMITS.videoBytes : LIMITS.gifBytes);
  // Mira los primeros 12 bytes: «GIF87a» / «GIF89a» → image/gif; «RIFF….WEBP» → image/webp; «ftyp» en los bytes 4–7 → video/mp4
  // (con la marca «qt  » en los bytes 8–11 → video/quicktime, el .mov del iPhone); EBML 1A45DFA3 → video/webm; otra cosa → null.
  function sniff(head) {
    if (!head || head.length < 12) return null;
    const g = ascii(head, 0, 6);
    if (g === 'GIF87a' || g === 'GIF89a') return 'image/gif';
    if (ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 12) === 'WEBP') return 'image/webp';
    if (ascii(head, 4, 8) === 'ftyp') return ascii(head, 8, 12) === 'qt  ' ? 'video/quicktime' : 'video/mp4';
    if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return 'video/webm';
    return null;
  }
  // file = { type, size }, head = los primeros bytes. Devuelve { ok, mime, message }. Un archivo con tipo vacío (algunos teléfonos) vale si los bytes son válidos.
  // mp4 y quicktime comparten contenedor (ftyp): un .mov declarado como video/mp4 (o al revés) vale; el tipo que se registra es el que dicen los bytes.
  // La DURACIÓN no se ve aquí (hace falta un <video>): la comprueba checkDuration en la pantalla. Es un límite blando.
  function checkGif(file, head) {
    const f = file || {};
    const size = Number(f.size);
    if (!Number.isFinite(size) || size <= 0) return { ok: false, message: 'Ese archivo está vacío. Elige otro.' };
    const type = str(f.type).toLowerCase();
    if (type && !GIF_TYPES.includes(type) && !VIDEO_TYPES.includes(type)) return { ok: false, message: 'Ese tipo de archivo no sirve. Sube un video MP4, MOV o WebM, o una animación GIF o WebP. Las fotos no se pueden usar aquí.' };
    const mime = sniff(head);
    const sameFamily = (a, b) => a === b || (a && b && a.startsWith('video/') && b.startsWith('video/') && a !== 'video/webm' && b !== 'video/webm');
    if (!mime || (type && !sameFamily(type, mime))) return { ok: false, message: 'Ese archivo no parece un video MP4, MOV o WebM ni una animación GIF o WebP de verdad. Elige otro.' };
    if (size > maxBytes(mime)) {
      return { ok: false, message: isVideo(mime)
        ? `Ese video pesa ${mb(size)} MB; el máximo es ${mb(LIMITS.videoBytes)} MB. Grábalo más corto o en menor calidad.`
        : `Esa animación pesa ${mb(size)} MB; el máximo es ${mb(LIMITS.gifBytes)} MB. Elige una más liviana o sube un video corto.` };
    }
    return { ok: true, mime };
  }
  // Duración (segundos) que informó un <video> temporal. Límite blando: solo la app la comprueba.
  function checkDuration(seconds) {
    const s = Number(seconds);
    if (!Number.isFinite(s) || s <= 0) return { ok: false, message: 'No pudimos leer este video en tu navegador. Prueba con otro o grábalo de nuevo.' };
    if (Math.round(s * 10) / 10 > LIMITS.videoSeconds) return { ok: false, message: `Ese video dura ${Number(s.toFixed(1)).toLocaleString('es')} s; el máximo son ${LIMITS.videoSeconds}. Recórtalo antes de subirlo.` };
    return { ok: true };
  }
  // Nombre sugerido para la biblioteca a partir del nombre del archivo («press-banca.gif» → «press banca»).
  const suggestName = (fileName) => trim(trim(fileName).replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[_-]+/g, ' ')).slice(0, LIMITS.gifName);

  // ---------- Rutina ----------
  const blankExercise = () => ({ name: '', sets: '', note: '', gif: '', series: '', reps: '', weight: '', rest: '' });

  // ---------- v2 (modo paso a paso): series, repeticiones, peso y descanso ESTRUCTURADOS, sin SQL ----------
  // El servidor (grasa.routine_content_ok, r1 v1.7) solo admite las claves name, sets, note y gif por ejercicio, y sets de 1 a 30 letras.
  // Para no cambiar el esquema, los cuatro campos opcionales del coach viajan DENTRO de «sets» con una forma fija y legible:
  //   «4×12» · «4×10-12 · 12 kg» · «3×30 s · desc. 45 s» · «4×12 · 12,5 kg · desc. 90 s»
  // Una versión anterior de la app lo muestra tal cual (se entiende); esta lo separa otra vez. Lo que no tiene esa forma es TEXTO LIBRE
  // («30 minutos», «Hasta sentir el glúteo») y el modo paso a paso lo muestra con «Hecho ›» y sin temporizador.
  // La app NO calcula ni sugiere nada: series, repeticiones, peso y descanso los escribe el coach.
  const SETS_RE = /^\s*(\d{1,2})\s*[×xX]\s*([^·]+?)(?:\s*·\s*(?!\s*desc\.)([^·]+?))?(?:\s*·\s*desc\.\s*(\d{1,3})\s*s)?\s*$/;
  const isNum = (v) => /^\d+(?:[.,]\d+)?$/.test(v);
  // «12» → «12 kg» (si es solo un número); «banda roja», «20 lb» o «corporal» quedan tal cual.
  const weightText = (w) => { const t = trim(w); return t && isNum(t) ? `${t} kg` : t; };
  // «4×12 · 12 kg · desc. 90 s» → { series: 4, reps: '12', weight: '12 kg', rest: 90 }. Texto libre → null.
  function parseSets(text) {
    const m = SETS_RE.exec(str(text));
    if (!m) return null;
    const series = Number(m[1]), reps = trim(m[2]), weight = trim(m[3]), rest = m[4] == null ? 0 : Number(m[4]);
    if (series < 1 || series > LIMITS.series || !reps || reps.length > LIMITS.reps || weight.length > LIMITS.weight || rest > LIMITS.rest) return null;
    return { series, reps, weight, rest };
  }
  // { series, reps, weight, rest } (números o textos del formulario) → «4×12 · 12 kg · desc. 90 s». Sin series → ''.
  function composeSets(x) {
    const t = (v) => (v == null ? '' : String(v).trim());
    const series = t(x && x.series), reps = t(x && x.reps), weight = weightText(t(x && x.weight)), rest = t(x && x.rest);
    if (!series) return '';
    return `${Number(series)}×${reps}${weight ? ` · ${weight}` : ''}${rest && Number(rest) > 0 ? ` · desc. ${Number(rest)} s` : ''}`;
  }
  // Para el editor del coach: lo guardado con la forma fija se separa en sus cuatro campos (y el texto libre queda vacío). Lo que el coach
  // escribió a mano antes («4 × 12», con espacios) sigue en su casilla de texto libre, tal cual lo dejó (el paso a paso igual lo entiende).
  function toEditable(r) {
    return { ...r, days: ((r && r.days) || []).map((d) => ({ ...d, exercises: ((d && d.exercises) || []).map((e) => {
      const p0 = parseSets(e && e.sets), p = p0 && composeSets(p0) === trim(e.sets) ? p0 : null;
      return p ? { ...e, sets: '', series: String(p.series), reps: p.reps, weight: p.weight, rest: p.rest ? String(p.rest) : '' } : { ...e, series: '', reps: '', weight: '', rest: '' };
    }) })) };
  }
  const hasStructured = (e) => !!(e && [e.series, e.reps, e.weight, e.rest].some((v) => v != null && String(v).trim()));
  // El «sets» que se guarda: lo estructurado manda; si el coach no llenó series, va su texto libre.
  const setsOf = (e) => (hasStructured(e) ? composeSets(e) : trim(e && e.sets));
  // Lo que ve el asesorado: «4 series · 12 repeticiones · 12 kg · descanso 90 s», o el texto libre tal cual.
  const repsText = (r) => (/^\d+(?:\s*[-–]\s*\d+)?$/.test(r) ? `${r} ${r === '1' ? 'repetición' : 'repeticiones'}` : r);
  function setsLine(e) {
    const p = parseSets(setsOf(e));
    if (!p) return trim(e && e.sets);
    return [`${p.series} ${p.series === 1 ? 'serie' : 'series'}`, repsText(p.reps), p.weight, p.rest ? `descanso ${p.rest} s` : ''].filter(Boolean).join(' · ');
  }
  const blankDay = (n) => ({ title: n ? `Día ${n}` : '', exercises: [blankExercise()] });
  const blankRoutine = () => ({ title: '', days: [blankDay(1)] });

  // Forma tal como la guarda el servidor (rutinas.content): sin vacíos, sin claves de más. note y gif solo si existen.
  function toContent(r) {
    const days = (r && Array.isArray(r.days) ? r.days : []).map((d) => ({
      title: trim(d && d.title),
      exercises: (d && Array.isArray(d.exercises) ? d.exercises : []).filter((e) => e && (trim(e.name) || trim(e.sets) || trim(e.note) || trim(e.gif) || hasStructured(e))).map((e) => {
        const o = { name: trim(e.name), sets: setsOf(e) };
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
      title: trim(row.title), updatedAt: row.updatedAt || row.updated_at || null, createdAt: row.createdAt || row.created_at || null,
      visible: row.visible !== false,
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
      const list = (d && Array.isArray(d.exercises) ? d.exercises : []).filter((e) => e && (trim(e.name) || trim(e.sets) || trim(e.note) || trim(e.gif) || hasStructured(e)));
      if (list.length > LIMITS.exercises) add(i, null, 'exercises', `El día ${i + 1} puede tener hasta ${LIMITS.exercises} ejercicios.`);
      list.forEach((e, j) => {
        const name = trim(e.name), sets = trim(e.sets), note = trim(e.note), gif = trim(e.gif);
        const where = `En el día ${i + 1}, ejercicio ${j + 1}`;
        if (!name) add(i, j, 'name', `${where}: escribe el nombre del ejercicio.`);
        else if (name.length > LIMITS.name) add(i, j, 'name', `${where}: el nombre es muy largo (máximo ${LIMITS.name} letras).`);
        const label = `${where}${name ? ` («${name}»)` : ''}`;
        if (hasStructured(e) && sets) add(i, j, 'sets', `${label}: usa las casillas de series o el texto libre, no los dos. Borra uno de los dos.`);
        else if (hasStructured(e)) {
          const t = (v) => (v == null ? '' : String(v).trim());
          const series = t(e.series), reps = t(e.reps), weight = t(e.weight), rest = t(e.rest);
          if (!series) add(i, j, 'series', `${label}: escribe cuántas series son (de 1 a ${LIMITS.series}).`);
          else if (!/^\d{1,2}$/.test(series) || Number(series) < 1 || Number(series) > LIMITS.series) add(i, j, 'series', `${label}: las series deben ser un número entero de 1 a ${LIMITS.series}.`);
          if (!reps) add(i, j, 'reps', `${label}: escribe las repeticiones, por ejemplo «12», «10-12» o «30 s».`);
          else if (reps.length > LIMITS.reps) add(i, j, 'reps', `${label}: las repeticiones son muy largas (máximo ${LIMITS.reps} letras).`);
          else if (/[·]/.test(reps) || /^desc\./i.test(reps)) add(i, j, 'reps', `${label}: las repeticiones no pueden llevar «·».`);
          if (weight.length > LIMITS.weight) add(i, j, 'weight', `${label}: el peso es muy largo (máximo ${LIMITS.weight} letras).`);
          else if (/[·]/.test(weight) || /^desc\./i.test(weight)) add(i, j, 'weight', `${label}: el peso no puede llevar «·» ni empezar por «desc.».`);
          if (rest && (!/^\d{1,3}$/.test(rest) || Number(rest) > LIMITS.rest)) add(i, j, 'rest', `${label}: el descanso va en segundos, de 0 a ${LIMITS.rest}.`);
          if (!errors.some((x) => x.day === i && x.ex === j)) {
            const out = composeSets(e);
            if (out.length > LIMITS.sets) add(i, j, 'reps', `${label}: series, repeticiones, peso y descanso juntos no caben (máximo ${LIMITS.sets} letras). Acorta las repeticiones o el peso.`);
            else if (!parseSets(out)) add(i, j, 'reps', `${label}: revisa las repeticiones y el peso.`);
          }
        } else if (!sets) add(i, j, 'sets', `${label}: escribe las series y repeticiones, por ejemplo «4 × 12».`);
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

  // «Rutina de hoy» tal como la guarda el servidor { coach_id, template_id, title, content, day, published_at } (sin id propio).
  function dailyFromServer(row) {
    if (!row || typeof row !== 'object' || !row.day) return null;
    const r = fromServer({ ...row, id: null });
    return { ...r, templateId: row.templateId || row.template_id || null, day: String(row.day).slice(0, 10), publishedAt: row.publishedAt || row.published_at || null };
  }
  // ¿La rutina de hoy publicada vale para el día `today` ('AAAA-MM-DD' del dispositivo)? Solo el MISMO día calendario.
  const dailyActive = (daily, today) => !!(daily && daily.day && today && String(daily.day).slice(0, 10) === String(today).slice(0, 10));
  // El día 'AAAA-MM-DD' del dispositivo (zona del propio dispositivo, igual que Hábitos y Medidas).
  const localDay = (d) => { const x = d || new Date(); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const fmtDay = (iso) => (iso ? new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('es', { day: 'numeric', month: 'short' }) : '');
  // Texto de la tarjeta de Inicio del cliente: una rutina → «Título · 2 días · 3 ejercicios»; varias → «Tienes 3 rutinas: A, B y C».
  function homeLine(list) {
    const l = Array.isArray(list) ? list : [];
    if (!l.length) return '';
    if (l.length === 1) return `${l[0].title} · ${summary(l[0])}`;
    const names = l.map((x) => x.title);
    const tail = names.length > 3 ? `${names.slice(0, 3).join(', ')} y ${names.length - 3} más` : names.length === 3 ? `${names[0]}, ${names[1]} y ${names[2]}` : `${names[0]} y ${names[1]}`;
    return `Tienes ${l.length} rutinas: ${tail}.`;
  }

  const api = { toEditable, parseSets, composeSets, setsOf, setsLine, weightText, hasStructured, dailyFromServer, dailyActive, localDay, fmtDay, homeLine, LIMITS, GIF_TYPES, VIDEO_TYPES, ACCEPT, isVideo, maxBytes, checkDuration, sniff, toHex, checkGif, suggestName, blankExercise, blankDay, blankRoutine, toContent, fromServer, validate, summary, dayLine, gifIds, fmtSize, UUID_RE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Rutinas = api;
})(typeof window !== 'undefined' ? window : globalThis);
