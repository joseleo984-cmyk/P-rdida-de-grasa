// Configuración pública de la conexión con el servidor (R1, equipo/r1-contrato.md §6.5).
// Vacía por defecto: la app funciona como siempre, solo en este dispositivo, sin cuentas.
// Para conectar con Supabase: url = 'https://<ref>.supabase.co', key = 'sb_publishable_…' (clave PUBLICABLE; la
// secreta / service_role no va nunca aquí). mode 'fake' solo se acepta en localhost (pruebas), ver Remote.config().
window.PG_CONFIG = {
  url: '',
  key: '',
  mode: 'real',
};
