// Sprint 9: CAPTCHA (Cloudflare Turnstile) para proteger el envío del código por correo contra abuso.
// Script clásico: expone window.Captcha y module.exports (pruebas en Node). No hace NADA hasta que account.js llama a
// Captcha.create(...).mount(...): sin `captchaSiteKey` en config.js este archivo ni se usa ni se descarga nada externo.
// - Carga PEREZOSA de https://challenges.cloudflare.com/turnstile/v0/api.js (solo al mostrar la pantalla de entrada).
// - Modo gestionado y no interactivo cuando es posible (appearance 'interaction-only'): el widget solo se ve si Cloudflare
//   necesita que la persona haga algo.
// - El token vale UNA sola vez: después de cada intento (bueno o malo) se llama a reset() y Turnstile genera otro.
// - Si el script no carga (sin red, bloqueado), el estado pasa a 'unavailable' y la app sigue funcionando.
// Estados: idle → loading → pending → solved; error (el widget falló); unavailable (el script no cargó).
(function (root) {
  'use strict';

  const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  const LOAD_TIMEOUT_MS = 12000;
  // Forma de una site key PÚBLICA de Turnstile: 0x4 + letras/números (22-30 caracteres en total). Las claves de prueba
  // oficiales (1x…AA pasa siempre, 2x…AB bloquea siempre, 3x…FF pide interacción) solo se aceptan para pruebas.
  const SITEKEY_RE = /^0x4[A-Za-z0-9_-]{17,27}$/;
  const TEST_SITEKEY_RE = /^[123]x[0-9A-Za-z]{22}$/;
  const MESSAGES = {
    failed: 'No pudimos verificar que eres una persona. Revisa tu conexión e intenta de nuevo.',
    waiting: 'Estamos verificando que eres una persona. Espera un momento e inténtalo de nuevo.',
    checking: 'Verificando que eres una persona…',
    ok: 'Verificación lista.',
  };

  function create({ siteKey, doc, win, scriptUrl = SCRIPT_URL, timeoutMs = LOAD_TIMEOUT_MS, onState } = {}) {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    const w = win || (typeof window !== 'undefined' ? window : null);
    let state = 'idle';
    let token = '';
    let widgetId = null;
    let el = null;
    let loading = null;
    let gen = 0; // cada mount() invalida el anterior (la carga puede terminar tarde)

    function set(next) {
      state = next;
      if (typeof onState === 'function') { try { onState(state, el); } catch { /* la interfaz no rompe el widget */ } }
    }

    function load() {
      if (w && w.turnstile && typeof w.turnstile.render === 'function') return Promise.resolve(w.turnstile);
      if (loading) return loading;
      loading = new Promise((resolve, reject) => {
        if (!d || !w) { reject(new Error('sin navegador')); return; }
        const s = d.createElement('script');
        let timer = null;
        const fail = (why) => {
          clearTimeout(timer);
          try { if (s.parentNode) s.parentNode.removeChild(s); } catch { /* nada */ }
          loading = null; // la próxima vez se vuelve a intentar
          reject(new Error(why));
        };
        s.src = scriptUrl;
        s.async = true;
        s.defer = true;
        s.onload = () => {
          clearTimeout(timer);
          if (w.turnstile && typeof w.turnstile.render === 'function') resolve(w.turnstile); else fail('Turnstile no quedó disponible');
        };
        s.onerror = () => fail('No se pudo cargar Turnstile');
        timer = setTimeout(() => fail('Turnstile tardó demasiado'), timeoutMs);
        d.head.appendChild(s);
      });
      return loading;
    }

    function removeWidget() {
      if (widgetId !== null && w && w.turnstile) { try { w.turnstile.remove(widgetId); } catch { /* ya no existe */ } }
      widgetId = null;
      token = '';
      if (el) { try { el.replaceChildren(); } catch { /* nada */ } }
    }

    // Pinta el widget dentro de `container` (reemplaza al anterior). Nunca lanza: si algo falla, el estado es 'unavailable'.
    async function mount(container, opts = {}) {
      const my = ++gen;
      removeWidget();
      el = container;
      set('loading');
      let ts;
      try { ts = await load(); } catch { if (my === gen) set('unavailable'); return state; }
      if (my !== gen) return state;
      try {
        const width = (el && el.clientWidth) || 0;
        widgetId = ts.render(el, {
          sitekey: siteKey,
          theme: opts.theme || 'auto', // sigue prefers-color-scheme del dispositivo, igual que la app
          size: width && width < 300 ? 'compact' : 'flexible', // 'flexible' ocupa el ancho del contenedor (mínimo 300 px)
          appearance: 'interaction-only', // invisible salvo que Cloudflare necesite una acción de la persona
          language: 'es',
          'response-field': false, // sin campo oculto: el token se manda por supabase-js, no por un formulario
          callback(t) { if (my === gen) { token = String(t || ''); set(token ? 'solved' : 'pending'); } },
          'expired-callback'() { if (my === gen) { token = ''; set('pending'); } },
          'timeout-callback'() { if (my === gen) { token = ''; set('pending'); } },
          'error-callback'() { if (my === gen) { token = ''; set('error'); } return true; },
        });
        if (widgetId === undefined || widgetId === null) { set('unavailable'); return state; }
        if (state === 'loading') set('pending');
      } catch { set('unavailable'); }
      return state;
    }

    // El token es de un solo uso: tras cada intento, nuevo desafío.
    function reset() {
      token = '';
      if (widgetId !== null && w && w.turnstile) {
        try { w.turnstile.reset(widgetId); set('pending'); return; } catch { /* se vuelve a pintar abajo */ }
      }
      if (el) mount(el);
    }
    function destroy() { gen++; removeWidget(); el = null; set('idle'); }

    return { mount, reset, destroy, token: () => token, state: () => state, siteKey };
  }

  const api = { create, SCRIPT_URL, SITEKEY_RE, TEST_SITEKEY_RE, MESSAGES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Captcha = api;
})(typeof window !== 'undefined' ? window : globalThis);
