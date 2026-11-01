// Ayuda dentro de la app (producto «coach»): preguntas frecuentes con RESPUESTAS FIJAS por rol (de equipo/instructivos/preguntas-frecuentes.md),
// buscador simple y botón «Escribir a soporte» (WhatsApp). Sin IA, sin datos de salud en el mensaje y sin consentimientos nuevos.
// Parte pura (datos y búsqueda; pruebas en tests/ayuda.test.js) + vista mínima (solo si hay DOM). Todo entra al DOM con textContent.
(function (root) {
  'use strict';
  const SUPPORT_PHONE = '573128876125';          // 3128876125 (Colombia)
  const SUPPORT_SHOW = '312 887 6125';
  const SUPPORT_MESSAGE = 'Hola, necesito ayuda con la app Pérdida de Grasa.';   // fijo: nunca lleva datos de salud ni de la persona
  const supportUrl = () => 'https://wa.me/' + SUPPORT_PHONE + '?text=' + encodeURIComponent(SUPPORT_MESSAGE);

  const COACH = [
    ['No me llega el código de 6 dígitos.', 'Espera 1 minuto y mira en Spam o «Correo no deseado». Revisa que escribiste bien el correo. Pide un código nuevo. Hay un límite de envíos por hora: si pediste varios, espera una hora. Si sigue sin llegar, escríbenos a soporte con la hora del intento.'],
    ['La app no abre o se ve vieja.', 'Cierra la app por completo (desliza hacia arriba en el selector de apps) y ábrela dos veces. La primera vez descarga la versión nueva. En iPhone, ábrela desde el icono de la pantalla de inicio.'],
    ['En iPhone no encuentro «Añadir a pantalla de inicio».', 'Estás en otro navegador o dentro de WhatsApp. Abre el enlace en Safari. Toca Compartir (cuadrado con flecha) y baja hasta encontrar la opción. También está en Más → Cómo instalar la app.'],
    ['Un asesorado no aparece en mi lista.', 'Revisa que haya abierto tu enlace y terminado el registro, eligiendo Cliente y aceptando. Si solo creó la cuenta sin vincularse, no aparece. Reenvíale el enlace o muéstrale el QR.'],
    ['Un asesorado aparece pero no veo sus comidas.', 'Es normal: no marcó la casilla de comidas. Solo ves lo que cada persona autoriza. Puedes pedirle con amabilidad que lo active, pero es su decisión.'],
    ['La lista no se actualiza.', 'Toca Actualizar o cierra y abre la app. Si tu teléfono no tiene internet, no se actualiza. Los datos de los asesorados llegan cuando ellos tienen internet.'],
    ['No me deja invitar a nadie.', 'Probablemente falta aceptar el Acuerdo del coach. Acéptalo y vuelve a Invitar. Revisa también Más → Mi acuerdo: si hay una versión nueva, debes aceptarla de nuevo.'],
    ['No me llegó la copia del acuerdo por correo.', 'Revisa Spam. Puedes pedirla otra vez en Más → Mi acuerdo → Reenviarme la copia (máximo una por hora) o descargarla ahí mismo. Que no llegue no afecta tu aceptación: ya quedó registrada.'],
    ['Marqué «Pagó» por error. ¿Lo puedo deshacer?', 'No hay «deshacer». Abre el chip del asesorado y corrige la fecha a mano para que quede como corresponde.'],
    ['¿Por qué un asesorado ve «Tu acceso está en pausa»?', 'Su fecha de pago venció (o aún no tiene fecha). Marca Pagó y se reactiva en menos de un minuto. Mientras tanto, él puede ver, descargar y borrar sus datos.'],
    ['¿Puedo ver quién va «ganando» por peso o centímetros?', 'No. La app nunca ordena ni compara personas por peso ni medidas. Tampoco debes hacerlo por tu cuenta.'],
    ['¿Cómo sé si alguien dejó de registrar?', 'Abre la lista de Asesorados: el semáforo y «Necesitan atención» te lo dicen. En la ficha de quien lleva 3 días o más sin registrar aparece la tarjeta «Reenganche» con mensajes sugeridos que puedes editar y enviar. No hay avisos con la app cerrada.'],
    ['¿Qué es la liga semanal del team?', 'Es una tabla semanal por alias, solo de constancia, para quienes se unan por su propia voluntad (mínimo 5 participantes). Para habilitarla, en Más → Retos aceptas la versión del acuerdo con las cláusulas 15 y 16. Tú no ves quién es cada alias y no debes revelarlo ni compartir capturas.'],
  ];
  const CLIENT = [
    ['No me llega el código de 6 dígitos.', 'Espera 1 minuto y mira en Spam. Revisa que escribiste bien tu correo. Pide un código nuevo. Si pediste muchos, espera una hora. Si no llega, avísale a tu coach o escríbenos a soporte.'],
    ['La app no abre.', 'Cierra la app del todo (desliza hacia arriba) y ábrela otra vez. Hazlo dos veces. Si sigue igual, borra el icono y vuelve a instalar desde el enlace de tu coach. Descarga primero tus datos si ya tenías cosas anotadas.'],
    ['No puedo instalar en iPhone.', 'Abre el enlace en Safari. Si lo abres desde WhatsApp u otra app, no aparece la opción. Toca Compartir → Añadir a pantalla de inicio → Añadir. También está en Más → Cómo instalar la app.'],
    ['No me sincroniza.', 'Mira el aviso en Más. Si dice «Sin internet», se guardará solo cuando vuelva la señal. Tus datos no se pierden: siguen en tu celular.'],
    ['Cambié de celular. ¿Pierdo mis cosas?', 'Si activaste la copia en la nube, entra con tu correo y pide un código nuevo: tus datos vuelven. Si no la activaste, tus datos solo estaban en el celular viejo: descarga una copia allí antes de cambiarlo.'],
    ['¿Qué ve mi coach?', 'Solo lo que tú marcaste. Mira Más → Mi coach para ver y cambiar esas casillas. Las fotos solo si diste permiso de fotos.'],
    ['¿Puedo dejar de compartir algo?', 'Sí, cuando quieras. Más → Mi coach, quita la categoría y toca Continuar. Tu coach deja de verla.'],
    ['¿Cómo borro mis datos?', 'Más → Mis datos y permisos. Se borra todo y no se puede deshacer. Antes puedes descargar una copia en Más → Descargar una copia.'],
    ['No me deja anotar. Dice «Tu acceso está en pausa».', 'Tu pago con tu coach venció. Habla con él. Cuando lo marque, la app se reactiva sola. Mientras tanto puedes ver, descargar y borrar tus datos.'],
    ['Me pidió permiso para la cámara. ¿Tengo que dárselo?', 'No. Las fotos son opcionales. Puedes decir que no y la app funciona igual.'],
    ['Se me pasó un día. ¿Pierdo todo?', 'No. La app no te regaña. Tienes 2 comodines por semana. Anota hoy y sigue.'],
    ['¿La app me dice cuánto debo comer o cuánto peso perder?', 'No. La app no prescribe nada ni promete resultados. Para tu alimentación y salud, habla con tu coach o un profesional de la salud.'],
    ['¿Cómo activo el recordatorio diario?', 'Más → Recordatorio diario: lo enciendes y eliges la hora. Es un aviso que ves al abrir la app, pasada esa hora, si hoy aún no registras. No es una notificación y no se envía a nadie.'],
    ['¿Qué es la liga semanal?', 'Es voluntaria y está apagada por defecto. Si te unes (Progreso → Puntos), otros miembros del equipo de tu coach ven tu alias y tu puntaje de constancia en una tabla semanal; nunca tu nombre, fotos, peso, medidas ni comidas. Puedes salir cuando quieras y desapareces al instante. Solo se publica con 5 o más participantes.'],
  ];
  const FAQ = { coach: COACH.map(([q, a]) => ({ q, a })), client: CLIENT.map(([q, a]) => ({ q, a })) };

  // Sin acentos, minúsculas.
  const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  // Búsqueda simple: TODAS las palabras (2+ letras) deben estar en la pregunta o en la respuesta. Sin texto: todas.
  function search(role, text) {
    const list = FAQ[role === 'coach' ? 'coach' : 'client'];
    const words = norm(text).split(/[^a-z0-9ñ]+/).filter((w) => w.length >= 2);
    if (!words.length) return list;
    return list.filter((x) => { const hay = norm(x.q + ' ' + x.a); return words.every((w) => hay.includes(w)); });
  }

  const api = { SUPPORT_PHONE, SUPPORT_SHOW, SUPPORT_MESSAGE, supportUrl, FAQ, search, norm };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.Ayuda = api;

  // ---------- Vista (solo producto coach) ----------
  const PROD = root.Producto || { coach: false };
  if (!PROD.coach || typeof document === 'undefined') return;
  const $ = (s) => document.querySelector(s);
  function render() {
    const box = $('#ayuda-faq');
    if (!box) return;
    const role = document.body.classList.contains('mode-coach') ? 'coach' : 'client';
    const items = search(role, $('#ayuda-q').value);
    const ul = $('#ayuda-list');
    ul.textContent = '';
    for (const x of items) {
      const d = document.createElement('details'), s = document.createElement('summary'), p = document.createElement('p');
      s.textContent = x.q; p.textContent = x.a;
      d.append(s, p); ul.append(d);
    }
    $('#ayuda-empty').classList.toggle('hidden', items.length > 0);
    $('#ayuda-role').textContent = role === 'coach' ? 'Preguntas para coaches' : 'Preguntas para asesorados';
  }
  function wire() {
    if (!$('#ayuda-faq')) return;
    $('#ayuda-q').addEventListener('input', render);
    $('#ayuda-soporte').setAttribute('href', supportUrl());
    $('#ayuda-tel').textContent = SUPPORT_SHOW;
    document.addEventListener('pg:view', (ev) => { if (ev.detail && ev.detail.view === 'ayuda') render(); });
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})(typeof window !== 'undefined' ? window : globalThis);
