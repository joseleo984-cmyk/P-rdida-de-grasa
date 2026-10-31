# Piloto 1 · Recordatorio diario — ¿push en iPhone?

1. iPhone sí permite push a una PWA, pero solo con iOS 16.4+, la app instalada en pantalla de inicio y el permiso aceptado tras un toque.
2. Hace falta un servidor que envíe el push (claves VAPID, guardar la suscripción de cada persona). Este proyecto no tiene servidor propio.
3. Safari no programa avisos locales (no hay «notification triggers»): sin servidor no hay aviso con la app cerrada.
4. Guardar la suscripción push de cada persona sería un dato nuevo en servidor → pediría consentimiento del abogado.
5. **Conclusión: no es viable ahora.** Se implementó la alternativa: **aviso al abrir la app**.

**Cómo queda:** Más → «Recordatorio diario» (apagado por defecto, una hora a elegir, se apaga cuando quiera). Pasada esa hora, si hoy no registró, Inicio muestra «Cuando quieras: registra tu día. Un toque en «Agua» ya cuenta.» con «Luego» (no vuelve ese día). Hora y estado viven solo en el teléfono (`localStorage`): no se envía nada, no hay SQL ni consentimiento nuevo. Sin rachas ni «vas a perder».
Archivos: `piloto.js`, `app.js` (initRecordatorio), `index.html`, pruebas `tests/piloto.test.js` y `tests/e2e/piloto-recordatorio.spec.js`. Caché del SW v56.

---
# Piloto 2 · Resumen semanal («lo que lograste»)
Tarjeta en Inicio del asesorado, solo **domingo, lunes y martes** (domingo = semana en curso; lunes/martes = la que cerró). Muestra días con registro, entrenos, días de agua/sueño/pasos cumplidos, comodines y «Semana constante»; cierra con «Para mantener» y «Para probar» (siempre «anotar», nunca cifras de salud). Sin registros esa semana no aparece (sin culpa). «Entendido» la oculta esa semana (`localStorage`). No se muestra en pausa. Sin SQL: se calcula en el teléfono con `Piloto.resumenSemanal` (`piloto.js`). Pruebas: `tests/piloto.test.js`, `tests/e2e/piloto-resumen.spec.js`.

---
# Piloto 3 · Aviso al coach con guía de qué escribir
En la **ficha** del asesorado (solo el coach la ve) aparece la tarjeta «Reenganche» al llegar a **7 días sin registrar**: titular («Carla lleva 9 días sin registrar»), qué hacer (mensaje corto y amable, un paso pequeño, sin reproches ni cifras) y un mensaje sugerido **editable** que se envía como nota del coach (el mismo mecanismo de siempre; el asesorado la ve en Inicio). Sin mención de pagos. Quien nunca ha registrado no dispara el aviso (puede ser recién invitado). Sin SQL. `Piloto.avisoCoach` (`piloto.js`), `coach-panel.js`, `index.html`. Pruebas: `tests/piloto.test.js`, `tests/e2e/piloto-reenganche.spec.js`.

---
# Piloto 4 · Plantillas de reenganche
La tarjeta «Reenganche» de la ficha (solo coach) ofrece **5 plantillas** editables: Te extrañamos · Empezar pequeño · ¿Cómo te ayudo? · Una cosa pequeña · Aquí sigo. Elegir una rellena el cuadro con el nombre del asesorado; el coach la edita y la envía como nota. **Ajuste respecto al paso 3:** la tarjeta sale desde los **3 días** sin registrar (con «Todavía es pronto…»); a los **7 días** sale como aviso con «Qué hacer» (`data-urgent="true"`). Textos sin juicio, sin pagos, cifras ni consejos clínicos (probado en `tests/piloto.test.js`). **Pendiente: revisar el tono** (el pedido lo marca). Plantillas en `piloto.js` (`Piloto.TEMPLATES`). Prueba: `tests/e2e/piloto-reenganche.spec.js`.

---
# Resumen del bloque (piloto, funciones 1–4)
- **Sin SQL en ninguna** (todo se calcula en el teléfono o reutiliza las notas existentes): no hay que pegar nada en Supabase.
- Caché del SW v56 (`piloto.js` nuevo). Ligas (función 5): no construidas.
- Prueba en iPhone pendiente: instalar la PWA, activar el recordatorio en Más y abrir la app pasada la hora; ver el resumen un domingo/lunes; ver la tarjeta Reenganche en la ficha de alguien con 4+ y 7+ días sin registro.
- `npm test` ok (486; `qr.test.js` necesita `npm ci`). E2E completa: todo verde salvo s2-1-qa (esperado) y s14-legal «A6b nuevo» (formato de fecha del navegador del entorno; falla igual en `claude/comercial`, no lo toqué).
