// Configuración de la COPIA DE PRUEBAS (se publica como /pruebas/config.js; ver scripts/build-site.js).
// Proyecto Supabase "pruebas". La clave es PUBLICABLE (pública por diseño, la protege RLS): se puede versionar.
// Ninguna clave secreta va nunca aquí. env 'pruebas' separa localStorage, IndexedDB y caché del SW de la
// app oficial (mismo origen), y muestra el banner "VERSIÓN DE PRUEBAS".
// captchaSiteKey (opcional, Sprint 9): clave PÚBLICA de Cloudflare Turnstile (0x4…). Vacía = sin captcha: no se carga ningún script
// externo. La clave SECRETA de Turnstile va solo en el panel de Supabase, nunca aquí (equipo/handoffs/captcha-turnstile.md).
// Sprint 11 («App para coaches», Etapa 1), SOLO en esta copia (config.js oficial NO trae estos dos campos):
//   producto: 'coach'  → interfaz de la app para coaches: cliente = Inicio · Hábitos · Medidas · Fotos · Más; coach = Asesorados · Invitar · Más
//                        (comidas, calorías, plan y recomendaciones quedan escondidos; el código sigue ahí para la Etapa 2).
//   soloNube: true     → sin modo «solo en mi teléfono» ni «Ahora no»: una pantalla de aceptación y entrada con el enlace/QR del coach.
window.PG_CONFIG = {
  env: 'pruebas',
  url: 'https://myeuoqvyyhveoxrpkjvg.supabase.co',
  key: 'sb_publishable_rWpRdRrVbpckMDa27HNCcA_IkvuMz4B',
  mode: 'real',
  captchaSiteKey: '0x4AAAAAAFhgmwvskIW2eP_B',
  producto: 'coach',
  soloNube: true,
};
