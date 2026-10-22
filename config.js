// Configuración pública de la conexión con el servidor (R1, equipo/r1-contrato.md §6.5).
// Vacía por defecto: la app funciona como siempre, solo en este dispositivo, sin cuentas.
// Para conectar con Supabase: url = 'https://<ref>.<dominio de Supabase>', key = 'sb_publishable_…' (clave PUBLICABLE; la
// secreta no va nunca aquí.. mode 'fake' solo se acepta en localhost (pruebas), ver Remote.config().
// env: '' (producción, nombres de almacenamiento de siempre) o 'pruebas' (ver config.pruebas.js y ns.js).
window.PG_CONFIG = {
  env: '',
  url: '',
  key: '',
  mode: 'real',
};
