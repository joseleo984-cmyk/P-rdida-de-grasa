# Handoff: instructivos → Dev (mejoras pendientes y conexión de la base de datos)

De: Experto en inducción · Para: Dev / orquestador · Fecha: 2026-11-01
Contexto: instructivos ya en `main` (`equipo/instructivos/`). Soporte oficial: **3128876125**. El abogado confirmó todos los textos (según José, 2026-11-01).

## A. Conectar la base de datos (prioridad 1)
Seguir `equipo/handoffs/conectar-plataforma.md` tal cual. Lo que falta y solo José puede dar:
- [ ] URL y clave publicable (`sb_publishable_…`) del proyecto `plataforma`. Nunca claves secretas.
- [ ] Confirmación de DPA de Supabase y de Brevo archivados.
- [ ] Fecha de vigencia y datos del responsable para los textos v1.0 (quitar «borrador»).
- [ ] `supabase/r1.sql` más reciente pegado en `plataforma` y «OK r1 v1».
- [ ] Aprobación explícita de José para el merge a `main` y OTP por correo/Brevo activo.
Después: correr las pruebas del §2 del procedimiento, prueba en iPhone real (`equipo/prueba-iphone.md`) y avisar a José. Fecha objetivo: antes de la 2.ª semana de noviembre.
Al conectar, actualizar en los instructivos el marcador `[ENLACE DE LA APP]`.

## B. Mejoras de la app (de lo que se vio al escribir los instructivos)
1. **Nombre del coach en la invitación:** el mensaje de WhatsApp que arma `invite.js` no lleva el nombre comercial del coach. Pedido de José: tomarlo del registro del coach (limpiado/escapado como ya hace `invite.js`).
2. **Bot de ayuda dentro de la app (solo respuestas fijas):** sección «Ayuda» en Más con las preguntas de `equipo/instructivos/preguntas-frecuentes.md` (por rol), buscador simple y botón «Escribir a soporte» (WhatsApp 3128876125). Sin IA generativa, sin datos de salud en el mensaje, sin consentimientos nuevos. Pendiente de aprobación de José del alcance.
3. **Aviso en la lista del coach:** «Tienes N clientes: pasas del límite gratuito de 5… plan fundador» aparece también para el piloto (2 coaches, ~10 adultos). Decidir con José si se oculta en el piloto.
4. **Aviso «ranking que solo ves tú» (Analítica):** revisar la palabra «ranking» con el criterio «nunca ranking por peso/kg/cm»; si es de constancia, confirmar con el abogado o reformular.
5. **Demo para videos:** el aviso del punto 3 y los pesos en la lista conviene ocultarlos en modo demo para grabar. También, que los subtítulos no tapen el título (es del guion de grabación, no de la app).
6. **Recordatorio:** solo existe como aviso al abrir la app. No hay push; no prometer más (viabilidad en `piloto-1-recordatorio.md`).
7. **Pendientes ya conocidos que afectan al coach:** «deshacer» una reacción enviada; «deshacer» un pago marcado por error (hoy se corrige la fecha a mano).
8. **Verificar nombres de botones** de los instructivos contra la app real tras conectar (se escribieron desde los handoffs, sin abrir la app oficial).

## C. Videos
Guiones en `equipo/instructivos/videos-guiones.md`. Hay 3 pruebas grabadas con la copia Demo (Mi día, lista del coach, pago). Faltan 8 y repetir tras los puntos B3 y B5. Instalar en iPhone y crear cuenta con código real deben grabarse en un iPhone con la app conectada.

## D. Pregunta de José: ¿pasar de Supabase a Google (créditos gratis)?
Recomendación del experto de inducción: **no ahora**. Motivos: la base y la seguridad (`supabase/r1.sql`, RLS, ~340 comprobaciones SQL, login de 6 dígitos, funciones, URL firmadas de fotos) están hechas sobre Postgres de Supabase; el equivalente de Google (Firebase/Firestore) es otro tipo de base y exigiría rehacer casi todo. Los créditos de Google caducan, y el abogado aprobó textos que nombran a Supabase y Brevo (cambiar de proveedor obliga a revisar tratamiento de datos, DPA y transferencia). Para ~10 adultos el plan gratuito de Supabase alcanza. Pendiente para el Arquitecto: confirmar que el plan gratuito basta (pausa por inactividad, sin copias automáticas) y si conviene subir de plan antes de abrir. No tengo precios verificados de ninguno de los dos.

## E. Tour de bienvenida dentro de la app (pedido de José, 2026-11-01)
Sí es viable y barato. Propuesta para Dev (aprobar alcance con José antes de construir):
- **Dos tours:** uno para **asesorado** y otro para **coach**, según el rol elegido. Se muestran **una sola vez**, justo después de aceptar los textos legales y elegir rol (nunca encima de pantallas legales ni de la pantalla de pausa).
- **Forma:** 4 a 5 pantallas con «Siguiente», «Atrás» y «Saltar». Una idea por pantalla, frases cortas, letra grande, sin animación si hay «reducir movimiento». Probar a 390 px con letra al 200 %.
- **Asesorado (borrador):** 1) «Este es tu día: un toque ya cuenta» (Inicio). 2) «Anota tu comida» (Comidas). 3) «Entrena y mídete» (Entrenar y Progreso). 4) «Tú decides qué ve tu coach» (Más → Mi coach). 5) «¿Dudas? Más → Ayuda».
- **Coach (borrador):** 1) «Tu lista con semáforo» (Asesorados). 2) «Invita por WhatsApp o QR» (Invitar). 3) «La ficha, reacciones y comentarios». 4) «Marca los pagos». 5) «Rutinas» y «Más → Ayuda».
- **Volver a verlo:** botón «Ver el tour otra vez» en Más (junto al bot de ayuda, punto B2).
- **Datos:** solo `localStorage` (como la tarjeta de instalar). Sin servidor, sin SQL, sin consentimiento nuevo.
- **Reglas de texto:** sin promesas de resultados de salud, sin ranking por peso/kg/cm, sin nombrar funciones «próximamente». Textos legales no se tocan.
- **Pruebas:** E2E del primer arranque (aparece), «Saltar» (no vuelve), reabrir desde Más, y que no salga sobre legales ni pausa. Subir la caché del `sw.js`.
- **Alternativa más simple:** globos señalando botones reales. Es más frágil si cambia la pantalla; recomiendo pantallas con ilustración fija.
