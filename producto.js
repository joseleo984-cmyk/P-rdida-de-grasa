// Sprint 11: modo producto «coach» y entrada «solo con cuenta» (SOLO en la copia de pruebas). Se leen de window.PG_CONFIG:
//   producto: 'coach'  → la interfaz del cliente muestra Inicio · Hábitos · Medidas · Fotos · Más (sin calorías, comidas, plan ni recomendaciones)
//                        y la del coach, Asesorados · Invitar · Más. El código de comidas/plan sigue ahí (Etapa 2).
//   soloNube: true     → no existe el modo «solo en mi teléfono» ni «Ahora no»: una pantalla de aceptación y entrada con el enlace del coach.
// La app OFICIAL (config.js sin estos campos) queda exactamente como antes: sin clases en <body> y sin nada de esto activo.
(function (root) {
  'use strict';
  const read = (cfg) => {
    const c = cfg && typeof cfg === 'object' ? cfg : {};
    return { coach: c.producto === 'coach', soloNube: c.soloNube === true };
  };
  const api = { read, coach: false, soloNube: false };
  Object.assign(api, read(root.PG_CONFIG));
  api.apply = function (flags) {
    Object.assign(api, flags);
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('producto-coach', api.coach);
    document.body.classList.toggle('solo-nube', api.soloNube);
  };
  if (typeof document !== 'undefined' && document.body) api.apply({});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Producto = api;
})(typeof window !== 'undefined' ? window : globalThis);
