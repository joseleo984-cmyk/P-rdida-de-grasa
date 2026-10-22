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
    running: 'Sincronizando…',
    offline: 'Sin conexión: se subirá al volver.',
    error: 'No se pudo sincronizar: se reintentará solo.',
    auth: 'Tu sesión caducó: vuelve a entrar con tu correo para sincronizar (tus datos siguen aquí).',
    blocked: 'No sincroniza: no autorizaste datos de salud.',
    owner: 'Falta confirmar que estos datos son tuyos.',
  };
  // Texto del indicador para el estado del motor (sync.js). Devuelve '' si no hay nada que decir (idle sin éxito previo).
  function syncText(st, now = Date.now(), tz) {
    const s = (st && st.state) || 'idle';
    if (s === 'ok') return st.lastOkAt ? `Sincronizado ${when(st.lastOkAt, now, tz)}` : 'Sincronizado';
    if (s === 'syncing') return TEXT.running;
    if (TEXT[s]) return TEXT[s];
    return s === 'idle' ? '' : TEXT.error;
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

  const api = { when, syncText, stateKey, recentOk, dataMode, TEXT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CloudView = api;
})(typeof window !== 'undefined' ? window : globalThis);
