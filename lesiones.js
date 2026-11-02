// Lesiones y condiciones médicas (R1 v1.20; concepto jurídico 13, 2/11/2026). Textos LITERALES del abogado y ayudas puras (probadas con node --test).
// La plataforma NO interpreta el texto libre ni diagnostica: muestra lo que la persona declara y el coach decide.
(function (root) {
  'use strict';
  const TEXTS = {
    lesion: { version: '0.1-L1', title: 'Registro de molestia o lesión física',
      body: 'Indícanos la zona o articulación afectada para evitar movimientos que la sobrecarguen. Esta función no reemplaza una valoración médica ni de fisioterapia.',
      buttons: { yes: 'Guardar lesión', no: 'Cancelar' } },
    condicion: { version: '0.1-L2', title: 'Declaración de condición médica',
      body: 'Registra solo diagnósticos confirmados por tu médico para que tu coach adapte o restrinja ejercicios. Tu coach no es médico ni prescribe tratamientos. Si tu condición cambia o genera síntomas, suspende la actividad y consulta a un profesional de la salud.',
      buttons: { yes: 'Guardar condición médica', no: 'Cancelar' } },
    convertir: { version: '0.1-L3', title: '⚠️ Cambio a condición médica',
      body: 'Al reclasificar esta molestia como condición médica, confirmas que cuentas con diagnóstico o indicación de un profesional de la salud. La app y tu coach no determinan diagnósticos clínicos ni planes de rehabilitación. Tu coach adaptará las rutinas únicamente para evitar riesgos en tu entrenamiento.',
      buttons: { yes: 'Confirmar y actualizar', no: 'Mantener como lesión' } },
    // Autorización contextual (casilla): se pide al guardar la primera vez.
    autorizacion: 'Autorizo a José Granados a registrar mi restricción física declarada y a compartirla con mi coach exclusivamente para que adapte mis rutinas. Entiendo que es un dato sensible de salud, que su registro es voluntario y que la plataforma no provee diagnóstico ni tratamiento médico.',
    microcopy: 'Usa este espacio solo para advertir limitaciones físicas a tu coach. Esta función no constituye historia clínica ni reemplaza la consulta con un profesional de la salud.',
  };
  // Dolor por ejercicio y «ejercicios a evitar» (concepto 13, puntos 2, 3 y 9). Textos LITERALES.
  TEXTS.dolor = { version: '0.1-D1', button: 'Reportar molestia o dolor', title: 'Reporte de molestia física',
    body: 'Guardaremos el ejercicio y la fecha para que tu coach adapte tus rutinas. No constituye valoración médica ni fisioterapéutica. Si el dolor es agudo o persiste, suspende el ejercicio y consulta a un médico.',
    buttons: { yes: 'Confirmar reporte', no: 'Cancelar' } };
  TEXTS.restringido = { version: '0.1-D2', title: '⚠️ Ejercicio restringido:', body: 'Marcaste este ejercicio como «a evitar» para este asesorado. ¿Confirmas que deseas asignarlo de todas formas?',
    buttons: { yes: 'Asignar de todos modos', no: 'Cancelar' } };
  // [DD/MM/AAAA] = la fecha del reporte (variable de formato).
  TEXTS.historial = { head: '⚠️ Historial de molestia:', body: 'Este asesorado reportó dolor en este ejercicio el [DD/MM/AAAA]. Verifica su evolución o evalúa ejercicios alternativos. Aviso: este registro es un reporte del usuario; como coach no emites diagnósticos ni tratas lesiones.' };
  // Cláusula nueva del Acuerdo del Coach (0.9-A7-coach); el abogado no le dio número: «[X]» = 17, la siguiente libre tras la 16.
  TEXTS.clausulaExclusion = 'Cláusula 17. Uso de listas de exclusión y adaptaciones: La marcación de ejercicios \'a evitar\' y la recepción de reportes de dolor constituyen herramientas operativas para la programación de actividad física en personas sanas. El Coach reconoce y acepta que no está facultado para emitir diagnósticos traumatológicos, tratamientos de rehabilitación física ni prescripciones de terapia kinesiológica, asumiendo la entera y exclusiva responsabilidad por las rutinas que asigne a través de la plataforma.';
  const STATUS = { activa: 'Activa', recuperacion: 'En recuperación', superada: 'Superada' };
  const KIND = { lesion: 'Lesión', condicion: 'Condición médica' };
  // Lo que se hashea al guardar: el texto contextual que la persona vio (título + texto).
  const fullText = (key) => [TEXTS[key].title, TEXTS[key].body].join('\n');
  // Una condición médica no se «supera»: solo las lesiones tienen los tres estados.
  const statusesFor = (kind) => (kind === 'condicion' ? ['activa'] : ['activa', 'recuperacion', 'superada']);
  // Activas primero (lesiones y condiciones vigentes); «historial» = lesiones superadas.
  function split(list) {
    const items = Array.isArray(list) ? list : [];
    return { activas: items.filter((i) => i.status !== 'superada'), historial: items.filter((i) => i.status === 'superada') };
  }
  // Clave de comparación de un ejercicio (igual que grasa.exercise_key): minúsculas, sin tildes, espacios simples.
  const key = (n) => String(n || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  const fmtDay = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
  // Cruza los ejercicios de una rutina con la lista «a evitar» y el historial de dolor de UN asesorado. flags = { avoid: [{exercise}], pain: [{exercise, day}] }.
  function conflicts(content, flags) {
    const f = flags || {}, avoid = new Set((f.avoid || []).map((a) => key(a.exercise))), out = [];
    const names = [];
    for (const d of (content && content.days) || []) for (const e of (d && d.exercises) || []) if (e && e.name) names.push(String(e.name).trim());
    const seen = new Set();
    for (const n of names) {
      const k = key(n);
      if (seen.has(k)) continue;
      seen.add(k);
      if (avoid.has(k)) out.push({ kind: 'avoid', exercise: n });
      const p = (f.pain || []).filter((x) => key(x.exercise) === k).sort((a, b) => (a.day < b.day ? 1 : -1))[0];
      if (p) out.push({ kind: 'pain', exercise: n, day: p.day });
    }
    return out;
  }
  const api = { key, fmtDay, conflicts, TEXTS, STATUS, KIND, fullText, statusesFor, split };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Lesiones = api;
})(typeof window !== 'undefined' ? window : globalThis);
