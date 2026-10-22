// Configuración de la COPIA DE PRUEBAS (se publica como /pruebas/config.js; ver scripts/build-site.js).
// Proyecto Supabase "pruebas". La clave es PUBLICABLE (pública por diseño, la protege RLS): se puede versionar.
// Ninguna clave secreta va nunca aquí. env 'pruebas' separa localStorage, IndexedDB y caché del SW de la
// app oficial (mismo origen), y muestra el banner "VERSIÓN DE PRUEBAS".
window.PG_CONFIG = {
  env: 'pruebas',
  url: 'https://myeuoqvyyhveoxrpkjvg.supabase.co',
  key: 'sb_publishable_rWpRdRrVbpckMDa27HNCcA_IkvuMz4B',
  mode: 'real',
};
