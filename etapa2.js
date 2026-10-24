// UX Etapa 2 («App para coaches»): textos aprobados por el abogado y lógica PURA (sin DOM; pruebas en tests/etapa2.test.js).
//   · L4 (concepto 2, anexo 2) y pregunta de embarazo, lactancia o posparto (concepto 3): encabezado, pregunta, opciones y micro-texto del «Sí». LITERALES.
//   · L5 (concepto 2): texto junto a la meta de proteína que propone el coach. LITERAL, solo cambia la cifra. La app NUNCA calcula ni sugiere la meta.
//   · P1 (concepto 2): aviso del registro autónomo durante la pausa. LITERAL.
//   · Retos del coach: plantillas de PROCESO (nunca de kilos ni centímetros), avance del asesorado y resumen del coach (sin clasificación pública).
// Los textos legales no se editan aquí sin un concepto nuevo del abogado: tests/legal-literal.test.js los compara con equipo/legal/.
(function (root) {
  'use strict';

  // ---------- Textos legales ----------
  const HEALTH = {
    condition: {
      id: 'L4', version: '1.0-L4',
      head: 'Información sobre tu salud (dato sensible y voluntario): Esta pregunta permite que tu coach sepa si requieres un aval médico antes de entrenar o cambiar tu alimentación. No estás obligado(a) a responder.',
      question: '¿Tienes alguna condición médica diagnosticada, tomas medicamentos o tienes alguna restricción física o nutricional?',
      yes: 'Al marcar "Sí", autorizas de forma expresa que compartamos con tu coach únicamente la existencia de una restricción para que ajuste tu plan o te solicite un certificado médico. La app no guarda detalles de diagnósticos ni ofrece servicios médicos. Te recomendamos consultar a tu médico antes de iniciar.',
    },
    pregnancy: {
      id: 'L4E', version: '1.0-L4E',
      head: 'Información sobre tu etapa actual (dato sensible y voluntario): Esta pregunta permite que tu coach conozca si requieres pautas adaptadas o autorización médica especializada antes de entrenar o cambiar tu alimentación. No estás obligada a responder.',
      question: '¿Estás en embarazo, en periodo de lactancia o en los primeros meses de posparto?',
      yes: 'Al marcar "Sí", autorizas de forma expresa que compartamos únicamente este estado con tu coach para que adecúe la intensidad de tu plan o te solicite el aval de tu médico tratante. La plataforma no realiza seguimiento obstétrico, clínico ni de salud materna. Te recomendamos consultar con tu médico especialista antes de iniciar cualquier plan de ejercicio o nutrición.',
    },
  };
  const OPTIONS = [['yes', 'Sí'], ['no', 'No'], ['skip', 'Prefiero no responder']];
  const QUESTIONS = ['condition', 'pregnancy'];
  // Lo que vio la persona al responder (se guarda su SHA-256 como huella): encabezado, pregunta, opciones y, si marcó «Sí», el micro-texto.
  function healthText(q, answer) {
    const h = HEALTH[q];
    if (!h) throw new Error('Pregunta desconocida: ' + q);
    return [h.head, h.question, OPTIONS.map((o) => o[1]).join(' / '), answer === 'yes' ? h.yes : ''].filter(Boolean).join('\n');
  }
  // Lo que ve el coach (solo el indicador, sin detalle). null si no hay nada que mostrar.
  function coachHealth({ healthRestriction, pregnancyState } = {}) {
    if (!healthRestriction && !pregnancyState) return null;
    const parts = [];
    if (healthRestriction) parts.push({ key: 'condition', title: 'Tiene una restricción de salud', sub: 'Sin detalle. Pide aval médico antes de planes exigentes.' });
    if (pregnancyState) parts.push({ key: 'pregnancy', title: 'Embarazo, lactancia o posparto', sub: 'Sin detalle. Pide el aval de su médico tratante antes de ajustar la intensidad.' });
    const line = healthRestriction && pregnancyState ? 'Restricción de salud · embarazo, lactancia o posparto' : healthRestriction ? 'Restricción de salud' : 'Embarazo, lactancia o posparto';
    return { parts, line };
  }

  const PROTEIN_MIN = 20, PROTEIN_MAX = 400;
  const L5 = (g) => `Meta orientativa propuesta exclusivamente por tu coach (~${g} g). La plataforma no formula, valida ni prescribe requerimientos nutricionales.`;
  const P1 = 'Registro personal en modo autónomo. Durante la pausa del servicio con tu coach, tus nuevos hábitos no serán supervisados ni revisados por él.';
  // Meta válida que viene del coach (entero de 20 a 400) o null. Nada más: sin meta del coach no hay barra con meta.
  const goalOf = (g) => (Number.isInteger(g) && g >= PROTEIN_MIN && g <= PROTEIN_MAX ? g : null);
  // Barra de proteína: solo con meta del coach. Sin rojo ni «te faltan»: se llena hasta el 100 %.
  function proteinBar(grams, goal) {
    const g = goalOf(goal);
    if (g == null) return null;
    const v = Math.max(0, Math.round(Number(grams) || 0));
    return { goal: g, pct: Math.min(100, Math.round((v / g) * 100)), text: `de ~${g} g`, note: L5(g) };
  }

  // ---------- Retos del coach ----------
  const DAY = 86400000;
  const dayNum = (iso) => Math.floor(Date.parse(iso + 'T00:00:00Z') / DAY);
  const addDays = (iso, n) => new Date((dayNum(iso) + n) * DAY).toISOString().slice(0, 10);
  // Plantillas (equipo/diseno/04-gamificacion.md §4 y la imagen C04). Solo de proceso: «X de N días», nunca «N de N».
  const TEMPLATES = [
    { key: 'agua', habit: 'water', title: '7 días de agua', sub: 'meta de agua 5 de 7 días', target: 5, days: 7, unit: 'días' },
    { key: 'entrenos', habit: 'trained', title: '3 entrenos esta semana', sub: '7 días', target: 3, days: 7, unit: 'entrenos' },
    { key: 'sueno', habit: 'sleep', title: 'Dormir 7 h', sub: '5 de 7 noches', target: 5, days: 7, unit: 'noches' },
    { key: 'comidas', habit: 'foods', title: 'Registra tus comidas', sub: '5 de 7 días', target: 5, days: 7, unit: 'días' },
  ];
  const HABITS = { water: 'agua', steps: 'pasos', sleep: 'sueño', trained: 'entrenos', foods: 'comidas' };
  const UNIT = { water: 'días', steps: 'días', sleep: 'noches', trained: 'entrenos', foods: 'días' };
  const isISO = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
  // Validación del lado de la app (el servidor repite las mismas reglas).
  function checkChallenge({ title, habit, target, start, end } = {}, today) {
    const t = String(title || '').trim();
    if (t.length < 3 || t.length > 60) return 'El título debe tener entre 3 y 60 letras.';
    if (!HABITS[habit]) return 'Elige un hábito.';
    if (!isISO(start) || !isISO(end) || end < start) return 'Revisa las fechas: el final no puede ir antes del inicio.';
    const len = dayNum(end) - dayNum(start) + 1;
    if (len > 31) return 'Un reto dura como máximo 31 días.';
    if (today && (start < addDays(today, -7) || start > addDays(today, 60))) return 'El reto debe empezar entre hace una semana y dentro de dos meses.';
    const n = Number(target);
    if (!Number.isInteger(n) || n < 1 || n > len) return `La meta va de 1 a ${len} ${UNIT[habit]}.`;
    return '';
  }
  const fromTemplate = (tpl, today) => ({ title: tpl.title, habit: tpl.habit, target: tpl.target, start: today, end: addDays(today, tpl.days - 1) });
  const dayText = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('es', { weekday: 'short', day: 'numeric', timeZone: 'UTC' }).replace(/[,.]/g, '');
  const monthText = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('es', { month: 'short', timeZone: 'UTC' }).replace('.', '');
  // «Del sáb 24 al vie 30 oct · se cumple con 3 entrenos»
  function rangeLine(c) {
    const sameMonth = c.start.slice(0, 7) === c.end.slice(0, 7);
    const a = dayText(c.start) + (sameMonth ? '' : ' ' + monthText(c.start));
    return `Del ${a} al ${dayText(c.end)} ${monthText(c.end)} · se cumple con ${c.target} ${UNIT[c.habit] || 'días'}`;
  }
  const leftDays = (c, today) => (today > c.end ? 0 : dayNum(c.end) - dayNum(today < c.start ? c.start : today) + 1);
  const leftText = (n) => (n <= 0 ? 'terminó' : n === 1 ? 'queda 1 día' : `quedan ${n} días`);
  // Avance del asesorado en su reto (con SUS marcas).
  function progress(c, today) {
    const marks = (c.marks || []).filter((d) => d >= c.start && d <= c.end);
    const done = marks.length, left = leftDays(c, today);
    const met = done >= c.target, ended = today > c.end, upcoming = today < c.start;
    const shown = Math.min(c.target, 10);
    const dots = Array.from({ length: shown }, (_, i) => i < Math.min(done, shown));
    const markedToday = marks.includes(today);
    let line;
    if (met) line = `¡Reto cumplido! ${done} de ${c.target}`;
    else if (ended) line = `Lograste ${done} de ${c.target}. ¿Lo intentamos la otra vez?`;
    else if (upcoming) line = `Empieza el ${dayText(c.start)} ${monthText(c.start)}`;
    else line = `${done} de ${c.target} · ${leftText(left)}`;
    return { done, target: c.target, left, met, ended, upcoming, active: !ended && !upcoming, dots, markedToday, line, canMark: !ended && !upcoming };
  }
  // Resumen del coach: por persona ✓ cumplió / en camino / sin empezar / no alcanza; cuántos «van en camino» (cumplieron o aún pueden).
  function coachSummary(c, today) {
    const left = leftDays(c, today);
    const members = (c.members || []).map((m) => {
      const status = m.done >= c.target ? 'cumplio' : m.done === 0 ? (left > 0 && left >= c.target ? 'sin' : 'no') : m.done + left >= c.target ? 'camino' : 'no';
      const label = { cumplio: '✓ cumplió', camino: 'en camino', sin: 'sin empezar', no: 'no alcanza esta vez' }[status];
      return { ...m, status, label };
    });
    const onTrack = members.filter((m) => m.status === 'cumplio' || m.status === 'camino').length;
    const met = members.filter((m) => m.status === 'cumplio');
    return { members, onTrack, total: members.length, pct: members.length ? Math.round((onTrack / members.length) * 100) : 0, met, left, leftText: leftText(left),
      line: `${onTrack} de ${members.length} van en camino`, ended: today > c.end };
  }

  const api = { HEALTH, OPTIONS, QUESTIONS, healthText, coachHealth, L5, P1, PROTEIN_MIN, PROTEIN_MAX, goalOf, proteinBar,
    TEMPLATES, HABITS, UNIT, checkChallenge, fromTemplate, rangeLine, leftDays, leftText, progress, coachSummary, addDays };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Etapa2 = api;
})(typeof window !== 'undefined' ? window : globalThis);
