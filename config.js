// Configuración pública de la conexión con el servidor (R1, equipo/r1-contrato.md §6.5).
// Conectada al proyecto `plataforma` de Supabase. Solo la URL y la clave PUBLICABLE (sb_publishable_…); la clave secreta no va nunca aquí.
// Reversa (volver a «solo en este dispositivo»): url = '' y key = '' (equipo/handoffs/conectar-plataforma.md §4).
// env: '' (producción, nombres de almacenamiento de siempre) o 'pruebas' (ver config.pruebas.js y ns.js).
window.PG_CONFIG = {
  env: '',
  url: 'https://naybnhxtragszulpisav.supabase.co',
  key: 'sb_publishable_lf2oxJLBlRSzJCukKhBw7g_Yy9SD8O5',
  mode: 'real',
};
