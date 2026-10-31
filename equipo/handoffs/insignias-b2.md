# Insignias v4 (diseño B): las 2 que faltaban — «Técnica primero» y «Te escucho» (rama `claude/insignias`, sobre `claude/agent-team-app-org-nnunot`)

Faltaban 2 de las 19 porque no existían los datos (ver `insignias-b.md`). Ya están las 19. **Sin SQL nuevo**, todo en el teléfono, privado (la persona; el coach no las ve en su ficha, como «Equipo» y los retos). Nada por peso, cm, kcal ni fotos; sin ligas, posición relativa ni alias.

- **Técnica primero** (Entreno, silueta escudo, glifo ojo). Una semana cuenta cuando se abrió «Cómo se hace» en TODOS los ejercicios de un día de la rutina. `rutinas-view.js` anota en `PGNS 'tecnica'` los ejercicios vistos por día y los ejercicios de cada día de la rutina.
- **Te escucho** (Registro, glifo globo). Nueva tarjeta en Inicio «¿Cómo te sentiste esta semana?» (Bien · Normal · Pesada, 1 toque, una por semana; `PGNS 'checkin'`). La respuesta no viaja, no cambia puntos ni niveles.
- Niveles: igual que las demás de la v4, 1 / 4 / 12 semanas (no seguidas). El diseño original proponía otros umbrales (5/15 rutinas; 4/12/26 semanas); se unificó con lo ya construido.
- `logros.js`: `compute(..., { tecnica, checkins })`, `FUERA = []`. `logros-view.js`: lee esos datos y dibuja el check-in. Caché del SW sin cambio de versión (se sube al juntar).
- Pruebas: `npm test` 476 ok; falla 1 que ya fallaba en `main` (siembra del servidor falso en demo-data). E2E ib-logros, ux1-*, s15-demo, rutinas, pm-puntos: ver mensaje final.
- Pendiente: que el coach vea estas dos (haría falta guardar los datos en el servidor: SQL nuevo); revisión visual de José de la tarjeta de Inicio.
