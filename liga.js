// Liga semanal de constancia (función 5 del piloto). Puro, sin DOM; pruebas en tests/liga.test.js y tests/legal-literal.test.js.
// TEXTOS LITERALES del concepto jurídico 7 (equipo/legal/concepto-7-2026-10-26.md, puntos 3, 4, 8 y 12): no cambiar ni una palabra.
// La liga la CALCULA EL SERVIDOR (grasa.my_liga): aquí solo se dan formas a lo que llega. Solo alias y puntos de constancia: nunca peso, medidas,
// kcal ni fotos. Sin histórico: cada lunes arranca de cero.
(function (root) {
  'use strict';
  const MIN = 5;
  // Punto 4 del concepto: modal al intentar encender el interruptor de la liga.
  const TITLE = 'Participación en la Liga Semanal de Constancia (Función voluntaria)';
  const CONSENT = [
    'Esta función es 100 % opcional y no afecta tu plan de entrenamiento ni la relación con tu coach. Al activarla, autorizas de manera previa y expresa que tu puntaje de constancia (calculado a partir del cumplimiento de tus hábitos diarios y entrenamientos) y un alias neutral asignado por la app sean visibles para otros miembros del equipo de tu coach en una tabla semanal de progreso.',
    'Tu nombre real, fotografías, peso corporal, medidas y comidas nunca serán visibles para otros usuarios. Puedes desactivar esta función en cualquier momento: tu alias y puntaje desaparecerán de inmediato de la tabla activa.',
  ];
  const BOX = 'Acepto participar voluntariamente en la liga de constancia y autorizo la visualización de mis puntos de hábito bajo un alias.';
  const BUTTON = 'Unirme a la liga';
  // Punto 12: aviso visible y permanente en la cabecera de la liga.
  const NOTICE = 'Recuerda: esta dinámica mide tu constancia, no tu exigencia física extrema. Escucha a tu cuerpo, respeta tus días de descanso planificados y no omitas comidas ni fuerces entrenamientos para sumar puntos. Tu salud es lo primero: si sientes fatiga desmedida o dolor, detente y consulta a un profesional médico.';
  // Punto 3: con 4 o menos participantes la liga no se publica.
  const MIN_MESSAGE = 'Se requieren al menos 5 participantes para habilitar la liga del grupo';
  // Punto 8: cláusula del Acuerdo del Coach. Numerada correlativamente (la siguiente libre tras la 14): «Cláusula 15».
  const CLAUSE_TITLE = 'Cláusula 15. Manejo ético y confidencialidad en dinámicas grupales y ligas de constancia:';
  const CLAUSE_BODY = 'En caso de habilitar o participar en funciones de ligas comunitarias o retos de constancia entre sus clientes, el Coach asume formalmente las siguientes obligaciones: (i) abstenerse de revelar, asociar o divulgar por cualquier medio (verbal, escrito, redes sociales o chats grupales) la identidad real de las personas que se encuentren detrás de los alias de la plataforma; (ii) no utilizar las posiciones relativas o tablas de puntos como mecanismo de coacción, presión psicológica, burla, reproche o exposición pública; y (iii) abstenerse de realizar y compartir capturas de pantalla de las tablas grupales. La inobservancia de esta disposición constituirá incumplimiento grave del presente acuerdo y hará responsable al Coach de los perjuicios y violaciones a la intimidad que se ocasionen a los usuarios.';
  const CLAUSE = CLAUSE_TITLE + '\n' + CLAUSE_BODY;
  // Concepto 8 (31-oct-2026), punto 1: «Cláusula [X]. Prohibición de pagos y responsabilidad sobre incentivos.» LITERAL; [X] = 16 (la siguiente tras la 15).
  const PREMIOS_TITLE = 'Cláusula 16. Prohibición de pagos y responsabilidad sobre incentivos.';
  const PREMIOS_BULLETS = [
    'Queda estrictamente prohibido al Coach ofrecer, prometer, sortear o entregar sumas de dinero en efectivo, transferencias bancarias, criptomonedas o cualquier medio de pago líquido equivalente como premio, incentivo o recompensa dentro del marco de la plataforma.',
    'Cualquier estímulo, cortesía o premio en especie (tales como artículos deportivos, sesiones gratuitas, planes, bonos, entre otros) que el Coach decida ofrecer corre por su cuenta y riesgo, y es de su exclusiva y entera responsabilidad. El Coach asume la obligación de entrega, cumplimiento y garantía, eximiendo de forma expresa y manteniendo indemne a la plataforma y a José Granados frente a cualquier reclamación, queja o demanda de terceros derivada de la oferta o materialización de dichos estímulos.',
  ];
  const CLAUSE_PREMIOS = [PREMIOS_TITLE, ...PREMIOS_BULLETS.map((b) => '- ' + b)].join('\n');

  // Texto exacto que ve la persona al unirse (la huella del consentimiento es el SHA-256 de ESTA cadena).
  const consentFullText = () => [TITLE, ...CONSENT, BOX].join('\n');

  // Lo que se pinta de la liga a partir de la respuesta del servidor.
  //   state: 'off' (tu coach no la habilita) | 'invite' (se puede unir) | 'waiting' (unida, faltan participantes) | 'table'
  function view(my) {
    const m = my && typeof my === 'object' ? my : {};
    if (!m.enabled) return { state: 'off', rows: [] };
    if (!m.opted_in) return { state: 'invite', rows: [] };
    if (!m.published || !Array.isArray(m.table)) return { state: 'waiting', alias: m.alias || '', message: MIN_MESSAGE, rows: [] };
    const rows = m.table.map((r, i) => ({ rank: i + 1, alias: String(r.alias), points: Number(r.points) || 0, me: r.me === true }));
    return { state: 'table', alias: m.alias || '', participants: m.participants || rows.length, rows, weekStart: m.week_start, weekEnd: m.week_end };
  }

  const api = { MIN, TITLE, CONSENT, BOX, BUTTON, NOTICE, MIN_MESSAGE, CLAUSE_TITLE, CLAUSE_BODY, CLAUSE, PREMIOS_TITLE, PREMIOS_BULLETS, CLAUSE_PREMIOS, consentFullText, view };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Liga = api;
})(typeof window !== 'undefined' ? window : globalThis);
