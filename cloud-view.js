// Lógica pura de lo que Perfil dice sobre la cuenta y la copia en la nube (sin DOM, probada en tests/cloud-view.test.js).
// Regla: no prometer lo que no ocurre. Con sync activa se suben peso/medidas, comidas y hábitos según los
// consentimientos; las FOTOS no se suben a la nube todavía.
(function (root) {
  'use strict';
  const DAY = 86400000;
  const validMs = (iso) => { const t = Date.parse(iso || ''); return Number.isFinite(t) ? t : null; };
  const clock = (ms, tz) => new Date(ms).toLocaleTimeString('es', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz });

  // "hoy 9:41 p. m." / "ayer 9:41 p. m." / "el 12 oct, 9:41 p. m."
  function when(iso, now = Date.now(), tz) { // tz: solo para pruebas; en la app, la zona del dispositivo
    const t = validMs(iso);
    if (t == null) return '';
    const d = new Date(t);
    const day = (x) => new Date(x).toLocaleDateString('en-CA', { timeZone: tz }); // AAAA-MM-DD en la zona
    const ymd = (x) => Math.floor(Date.parse(day(x) + 'T00:00:00Z') / DAY);
    const diff = ymd(now) - ymd(t);
    if (diff === 0) return `hoy ${clock(t, tz)}`;
    if (diff === 1) return `ayer ${clock(t, tz)}`;
    return `el ${d.toLocaleDateString('es', { day: 'numeric', month: 'short', timeZone: tz }).replace('.', '')}, ${clock(t, tz)}`;
  }

  const TEXT = {
    running: 'Guardando en tu cuenta…',
    offline: 'Sin internet: se guardará en tu cuenta cuando vuelva.',
    error: 'No se pudo guardar en tu cuenta. Lo intentamos de nuevo solos.',
    auth: 'Tu sesión se cerró. Entra de nuevo con tu correo para seguir guardando en tu cuenta (tus datos siguen aquí).',
    nocloud: 'La copia en la nube está apagada: tus datos están solo en este teléfono.',
    consent: 'Falta aceptar las autorizaciones de la copia en la nube: revísalas en Más → Mis datos y permisos. Tus datos siguen en este teléfono.',
    blocked: 'No se guarda en tu cuenta porque no autorizaste los datos de salud.',
    owner: 'Falta que confirmes que estos datos son tuyos.',
    paused: 'Tu acceso está en pausa: habla con tu coach. Tus datos siguen aquí y puedes verlos, descargarlos o borrarlos.',
  };
  // Texto del indicador para el estado del motor (sync.js). Devuelve '' si no hay nada que decir (idle sin éxito previo).
  function syncText(st, now = Date.now(), tz) {
    const s = (st && st.state) || 'idle';
    if (s === 'ok') return st.lastOkAt ? `Se guardó en tu cuenta ${when(st.lastOkAt, now, tz)}` : 'Se guardó en tu cuenta';
    if (s === 'syncing') return TEXT.running;
    if (TEXT[s]) return TEXT[s];
    return s === 'idle' ? '' : TEXT.error;
  }
  // "hace un momento" / "hace 5 min" / "hace 3 h" / fecha: para la cabecera del menú Más.
  function ago(iso, now = Date.now(), tz) {
    const t = validMs(iso);
    if (t == null || t > now + 60000) return '';
    const min = Math.floor((now - t) / 60000);
    if (min < 1) return 'hace un momento';
    if (min < 60) return `hace ${min} min`;
    if (min < 24 * 60) return `hace ${Math.floor(min / 60)} h`;
    return when(iso, now, tz);
  }
  // Línea de la cabecera de Más con cuenta: "Guardado en tu cuenta · hace 5 min" o el aviso del estado (sin internet, sesión cerrada…).
  function savedLine(st, now = Date.now(), tz) {
    const s = (st && st.state) || 'idle';
    if (s === 'ok' || (s === 'syncing' && st.lastOkAt) || s === 'idle') {
      const a = st && st.lastOkAt ? ago(st.lastOkAt, now, tz) : '';
      return a ? `Guardado en tu cuenta · ${a}` : 'Tu cuenta está activa';
    }
    return syncText(st, now, tz);
  }
  // Clave de estado normalizada para el atributo data-state.
  const stateKey = (st) => { const s = (st && st.state) || 'idle'; return s === 'syncing' ? 'running' : s; };

  const recentOk = (lastOkAt, now = Date.now(), hours = 24) => { const t = validMs(lastOkAt); return t != null && now - t >= 0 && now - t <= hours * 3600000; };

  // ¿Cómo hablar de los datos? `remoteOn`: hay config de Supabase (Remote habilitado). Sin ella: modo solo-local, textos de siempre.
  //  cloud: la copia en la nube está funcionando ahora (cuenta + sync OK + salud autorizada).
  //  quietBackup: el aviso de copia cada 7 días no molesta (sync exitoso en las últimas 24 h con salud autorizada).
  function dataMode({ remoteOn, signedIn, st, healthOk, now = Date.now() }) {
    if (!remoteOn || !signedIn || !healthOk) return { cloud: false, quietBackup: false };
    const s = (st && st.state) || 'idle';
    const cloud = s === 'ok' || ((s === 'syncing') && !!(st && st.lastOkAt));
    return { cloud, quietBackup: recentOk(st && st.lastOkAt, now, 24) };
  }

  const api = { when, ago, savedLine, syncText, stateKey, recentOk, dataMode, TEXT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CloudView = api;
})(typeof window !== 'undefined' ? window : globalThis);
