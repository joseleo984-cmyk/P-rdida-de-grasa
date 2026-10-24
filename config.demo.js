// Configuración de la COPIA DEMO (se publica como /demo/config.js; ver scripts/build-site.js y equipo/handoffs/demo.md).
// SIN servidor: no hay url ni clave de Supabase, ni captcha. La app corre con el servidor FALSO en memoria del navegador (remote-fake.js)
// y con datos 100 % ficticios sembrados por demo-data.js / demo.js. env 'demo' separa localStorage, IndexedDB y la caché del SW de la raíz
// y de /pruebas/ (mismo origen). El producto es el de la app para coaches.
window.PG_CONFIG = {
  env: 'demo',
  url: '',
  key: '',
  mode: 'fake',
  demo: true,
  producto: 'coach',
  soloNube: true,
};
