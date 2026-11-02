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
  const api = { TEXTS, STATUS, KIND, fullText, statusesFor, split };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Lesiones = api;
})(typeof window !== 'undefined' ? window : globalThis);
