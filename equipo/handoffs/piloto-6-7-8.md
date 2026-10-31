# Piloto 6, 7 y 8 (rama `claude/piloto-funciones-2`)

- **6 · «A quién reconocer este lunes»** (coach, lista de Asesorados, lunes a miércoles): hasta 3 personas de la semana que cerró, por **regreso** (volvió a registrar tras 7+ días) o **constancia** (2+ semanas constantes seguidas). «Felicitar» = 1 toque, envía una nota del coach; lo ya felicitado esa semana desaparece (solo en el teléfono del coach). `Piloto.reconocer`.
- **7 · Reporte semanal para José**: hoja manual (`equipo/comercial/reporte-semanal-jose.md`), como permite el pedido. No es código.
- **8 · Hito de 6 semanas y cierre de ciclo** (asesorado, Inicio): a las 6 semanas desde su primer registro («Cumpliste 6 semanas») y a las 8 («Cierre de ciclo»), 14 días cada uno. Semanas constantes, días con registro y comodines; elige un objetivo de proceso (4 opciones); «Entendido» lo oculta. Se mide en semanas, nunca en kilos. Estado solo en el teléfono. `Piloto.hito`.
- **Sin SQL.** Pruebas: `tests/piloto.test.js`, `tests/e2e/piloto-reconocer-hito.spec.js`.
- Falta revisar el tono de los mensajes con el abogado/José (felicitación y regreso).
