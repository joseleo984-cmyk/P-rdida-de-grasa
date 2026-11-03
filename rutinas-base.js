// Ejercicios y rutinas de EJEMPLO que el coach puede cargar y editar (Etapa 2 «App para coaches»).
// Regla de producto: la plataforma NO prescribe. Por eso el catálogo trae solo NOMBRES de ejercicios y las rutinas de ejemplo solo traen la estructura
// (días y ejercicios): sin series, repeticiones, peso ni descanso. Eso lo escribe el coach. La rutina exige un texto en «series y repeticiones», así que cada ejercicio
// lleva el aviso neutro «Por definir con tu coach» hasta que el coach lo cambie. Sin imágenes ni videos (los suben los coaches, que responden por ellos).
(function (root) {
  'use strict';
  const CATALOG = [
    { group: 'Piernas y glúteos', items: ['Sentadilla', 'Sentadilla goblet', 'Sentadilla búlgara', 'Prensa de pierna', 'Zancadas', 'Peso muerto rumano', 'Puente de glúteos', 'Hip thrust', 'Extensión de cuádriceps', 'Curl femoral', 'Elevación de talones'] },
    { group: 'Pecho', items: ['Press de banca', 'Press inclinado con mancuernas', 'Press con mancuernas', 'Aperturas con mancuernas', 'Flexiones de brazos', 'Fondos en paralelas'] },
    { group: 'Espalda', items: ['Jalón al pecho', 'Remo con barra', 'Remo con mancuerna', 'Remo en polea baja', 'Dominadas', 'Face pull'] },
    { group: 'Hombros', items: ['Press militar', 'Elevaciones laterales', 'Elevaciones frontales', 'Vuelos posteriores'] },
    { group: 'Brazos', items: ['Curl de bíceps con barra', 'Curl martillo', 'Extensión de tríceps en polea', 'Press francés', 'Fondos en banco'] },
    { group: 'Abdomen y core', items: ['Plancha', 'Plancha lateral', 'Elevación de piernas', 'Crunch abdominal', 'Bird dog'] },
    { group: 'Cardio y movilidad', items: ['Caminata', 'Trote suave', 'Bicicleta', 'Remo en máquina', 'Saltar la cuerda', 'Movilidad de cadera', 'Movilidad de hombros', 'Estiramiento de piernas'] },
  ];
  const PENDING = 'Por definir con tu coach';
  const day = (title, names) => ({ title, exercises: names.map((name) => ({ name, sets: PENDING, note: '', gif: '' })) });
  const STARTERS = [
    { title: 'Cuerpo completo – 3 días', days: [
      day('Día 1 – Cuerpo completo A', ['Sentadilla', 'Press de banca', 'Remo con mancuerna', 'Plancha']),
      day('Día 2 – Cuerpo completo B', ['Peso muerto rumano', 'Press militar', 'Jalón al pecho', 'Puente de glúteos']),
      day('Día 3 – Cuerpo completo C', ['Prensa de pierna', 'Press inclinado con mancuernas', 'Remo en polea baja', 'Elevación de piernas'])] },
    { title: 'Torso y pierna – 4 días', days: [
      day('Día 1 – Torso A', ['Press de banca', 'Remo con barra', 'Press militar', 'Curl de bíceps con barra', 'Extensión de tríceps en polea']),
      day('Día 2 – Pierna A', ['Sentadilla', 'Peso muerto rumano', 'Extensión de cuádriceps', 'Elevación de talones']),
      day('Día 3 – Torso B', ['Press inclinado con mancuernas', 'Jalón al pecho', 'Elevaciones laterales', 'Curl martillo', 'Press francés']),
      day('Día 4 – Pierna B', ['Prensa de pierna', 'Zancadas', 'Curl femoral', 'Hip thrust'])] },
    { title: 'Empuje, jalón y pierna – 3 días', days: [
      day('Día 1 – Empuje', ['Press de banca', 'Press militar', 'Elevaciones laterales', 'Extensión de tríceps en polea']),
      day('Día 2 – Jalón', ['Dominadas', 'Remo con barra', 'Face pull', 'Curl de bíceps con barra']),
      day('Día 3 – Pierna', ['Sentadilla', 'Peso muerto rumano', 'Zancadas', 'Elevación de talones'])] },
    { title: 'Pierna y glúteo – 2 días', days: [
      day('Día 1 – Pierna', ['Sentadilla goblet', 'Prensa de pierna', 'Extensión de cuádriceps', 'Curl femoral']),
      day('Día 2 – Glúteo', ['Hip thrust', 'Peso muerto rumano', 'Sentadilla búlgara', 'Puente de glúteos'])] },
    { title: 'Calentamiento y movilidad', days: [
      day('Día 1 – Antes de entrenar', ['Caminata', 'Movilidad de cadera', 'Movilidad de hombros', 'Estiramiento de piernas'])] },
    { title: 'Cardio suave – 3 días', days: [
      day('Día 1 – Caminata', ['Caminata']), day('Día 2 – Bicicleta', ['Bicicleta']), day('Día 3 – Trote suave', ['Trote suave'])] },
  ];
  const names = () => CATALOG.flatMap((g) => g.items);
  const api = { CATALOG, STARTERS, PENDING, names };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RutinasBase = api;
})(typeof window !== 'undefined' ? window : globalThis);
