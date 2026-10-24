# UX Etapa 1 — producto «coach» (rama `claude/ux-etapa1`)

Implementa la Etapa 1 de los diseños del panel de expertos (`equipo/diseno/01..05-*.md`) y del concepto jurídico 2 (`equipo/legal/concepto-2-2026-10-24.md`).
La app oficial (config.js sin `producto`) no cambia: todo lo nuevo cuelga de `Producto.coach` / `body.producto-coach`.

## Hecho

1. **Verificación legal.** En el producto coach no se dibuja `Calc.plan`, «Objetivo diario», «reduce ~150 kcal/día», «sube ~100–150» ni «~N semanas para la meta». La E2E `ux1-prescripcion.spec.js` recorre las pantallas y busca «Objetivo diario», «kcal/día», «reduce», «sube ~», «semanas para».
2. **Contraste y letra grande.** `--on-accent` sobre turquesa (oscuro ≥ 4,5:1; en claro, turquesa más profundo con texto blanco). Topbar y pestañas no se cortan a 390 px con letra al 200 % (E2E).
3. **Barras.** Asesorado: Inicio · Comidas · Entrenar · Progreso · Más (Hábitos vive en Inicio; Medidas, Fotos e Insignias son pestañas dentro de Progreso; «Medirme» es una pantalla aparte). Coach: Asesorados · Rutinas · Invitar · Más.
4. **Inicio «Mi día».** Nota del coach sin leer arriba; registro de 1 toque con autoguardado (agua +1, sueño, pasos por tramos <4k / 4–8k / 8k+, «Entrené», «Igual que ayer», «+ Comida», «Rutina de hoy» + «Empezar»); «Tu semana» con constancia semanal y 2 comodines; aviso de pago solo a ≤ 7 días; la pausa sigue bloqueando el registro.
5. **Celebración al guardar.** Anillo «Día completo» (≤ 1 s, sin animación con `prefers-reduced-motion`), «Registrado. Mañana sumamos». Nunca «fallaste». Mensajes reescritos según `03-neurociencia-pnl.md`.
6. **Comidas.** «Comidas anotadas» y «Proteína de hoy ~X g» al frente; kcal pequeñas, redondeadas y con «aprox.»; barra neutra; cierre del día «¿Registraste todo lo de hoy? Sí / Casi todo / No» guardado en el hábito del día (esquema v6, migración sin cambios, **sin SQL**: viaja en el jsonb); línea de bienestar; «Mis platos» (solo en el teléfono). No se muestra la meta de proteína (L5).
7. **Entrenar.** «Cómo se hace ›» en todos los ejercicios; un solo «Ya entrené» que marca el hábito y pide esfuerzo (Fácil / Normal / Duro / No pude terminar).
8. **Progreso y Medirme.** Tendencia de 7 días con los pesajes tenues; pestañas Peso · Cintura · Cadera · Otra; cambios en lenguaje neutro; métricas de constancia. Medirme solo muestra lo que toca hoy, con guía, la última medida como ayuda bajo el campo, teclado decimal con coma y «+ Más medidas (opcional)». **D2:** peso lunes·miércoles·viernes (opcional si no hay báscula), cintura semanal, cadera quincenal, el resto mensual y opcional. Pruebas actualizadas.
9. **Fotos (L1).** Modal bloqueante antes de la primera foto cuando A6b está activo, con el texto exacto del concepto; etiqueta «Visible para tu coach» en la vista previa y en las miniaturas; el modal vuelve si se retira y se vuelve a dar el permiso; reemplaza el aviso fijo. Los textos están en `tests/legal-literal.test.js`.
10. **Coach.** C01: lista ordenada por «Necesitan atención», semáforo con texto y forma (▲ Atención rojo a 7 días, ● Revisar ámbar a 3 días, ✓ Al día), pago en segundo plano; filtros «Necesitan atención · Todos · Vencen pronto · Sin pagar». C02: ficha con resumen semanal arriba, Anterior/Siguiente, reacciones de 1 toque (notas del coach existentes) y «Revisado ✓» (solo en el teléfono del coach). C06: 8 insignias del MVP calculadas en local, visibles al asesorado (Progreso → Insignias) y al coach (ficha); nunca por peso ni kcal.
11. **demo-data.js.** Esfuerzo, cierre del día, insignias y semáforo variado.
12. **Infra.** `sw.js` pasa a la caché v48 y registra `constancia.js`; también `scripts/build-site.js` y `tests/site.test.js`; `tests/e2e/site-pruebas.spec.js` ajustado a -v48.

## Decisiones que conviene conocer

- La lista del coach en «Necesitan atención» muestra a **todos** los asesorados con los que necesitan atención primero (el número del filtro cuenta solo a esos). «Todos» ordena por nombre.
- Quien registra ≥ 4 de 7 días pero no tiene pesajes cuenta como «Al día» (no como «Revisar» por falta de peso); un asesorado nuevo (< 7 días) tampoco se marca por tener pocos días.
- «Revisado ✓» y «Mis platos» se guardan en `localStorage` (no sincronizan).
- La barra segmentada de Progreso sigue visible aunque las fotos estén bloqueadas, para no dejar a nadie sin salida.
- Los esfuerzos y el cierre son opcionales y se descartan si el valor no es válido (`Schema.normalize`).

## Queda para la Etapa 2 / 3 (y por qué)

- **L5, meta de proteína**: depende del texto legal final y de que el coach la fije; por eso no se muestra.
- **P1, modo autónomo en pausa** y **congelar la constancia** durante la pausa: requieren decisión de producto sobre qué ve quien está en pausa.
- **Evidencia en servidor del consentimiento L1** (hoy queda en el evento de consentimiento A6b ya existente; el clic de «Entendido y autorizar» no se registra aparte).
- **Indicador y alertas de restricción de salud** al coach: pendiente del criterio legal; no se muestran.
- **Deshacer una reacción** enviada con 1 toque (hoy la nota queda enviada).
- **Barra de proteína** y objetivos nutricionales.

## Pruebas manuales en iPhone (no se pudieron hacer aquí)

- Letra grande (Ajustes → Pantalla → Tamaño del texto al máximo y «Texto más grande»): topbar y pestañas completas, nada cortado, sin scroll horizontal.
- Teclado decimal con coma en Medirme (Safari iOS muestra el teclado numérico con coma según el idioma).
- Celebración con «Reducir movimiento» activado: no debe haber animación.
- Instalar la PWA y verificar que la caché v48 reemplaza a la v47 (cerrar y abrir dos veces).
- Subir una foto real con el permiso A6b activo: modal, etiqueta, y retirar/volver a dar el permiso.

## Pasada de fidelidad (contra las imágenes aprobadas A01–A14 y C01–C07)

Se compararon, en Demo, modo oscuro y 390 px, Inicio, Comidas (con «Agregar comida»), Entrenar, Progreso, Medirme, Fotos (aviso y galería), Insignias, celebración, lista y ficha del coach. Cambios principales:

- **Barra superior** con tres zonas: «‹ Progreso» a la izquierda en Medirme, Fotos e Insignias; «Medirme ›» y «+ Foto» a la derecha; «‹ Anterior · Nombre · Siguiente ›» en la ficha; «Hoy, sáb 24 oct» en Comidas y «Actualizado 08:10» en la lista del coach.
- **Inicio:** nota del coach como aviso con barra de acento (con «Marcar como leído», que ya existía y se conserva); Pasos como ficha que despliega sus tres tramos (igual que Sueño); semana con círculos de comodín (línea discontinua) y días por venir con borde; rutina con «N ejercicios».
- **Comidas:** lista de una línea por comida (las opciones Editar, Borrar y Guardar se despliegan al tocar la fila); el cambio de día pasa al final; «Repetir la de ayer» queda como enlace.
- **Entrenar:** una sola tarjeta con los ejercicios, círculo para marcar cada uno (solo en el teléfono, no sincroniza) y «Cómo se hace ›»; «Ya entrené» grande; las demás rutinas, plegadas en «Mis otras rutinas». La rutina de hoy no se repite si es idéntica a una asignada.
- **Progreso:** «Cambios» muestra cintura y cadera, el resto en «Ver todas las medidas»; «Mis registros» plegado; marcas del gráfico enteras.
- **Medirme:** con báscula, el peso se muestra siempre (con «lun · mié · vie»); si hoy solo toca una medida, «Toca hoy: cintura» es el título de la tarjeta.
- **Fotos:** vista previa con la fecha dentro, galería de dos columnas sin encabezados de fecha, fila «Permiso de fotos: activo · Mi perfil ›», estado vacío con «Tomar mi primera foto».
- **Insignias:** dos columnas numeradas de 1 a 8, con la fecha o lo que falta.
- **Lista del coach:** semáforo a la derecha, avatares neutros, pago como línea tenue («Pago: al día hasta el 3 nov», «Pago: vence en 2 días», «Pago: venció el 15 oct»), chip Pagó/No pagó conservado.
- **Ficha:** reacciones con elección y «Enviar» (la primera viene elegida), enlaces a Medidas, Comidas y Constancia, constancia con tres fichas y últimas seis semanas.
- **Demo:** «Coach Fit Demo», Piernas de un solo día con seis ejercicios, cintura medida hace una semana (hoy toca) y báscula marcada.

Diferencias que quedan (y por qué): ver el informe de la pasada. En corto: alerta de seguridad y aviso de restricción de salud (Etapa 2/3), meta de proteína y su barra (L5), «¿Alguna molestia?» y el registro de kg y repeticiones (sin diseño de datos), «Escribirle ›» (no hay teléfono del asesorado), «+7 puntos de constancia» (los puntos no se implementaron), «La constancia se congela en pausa» (P1), Constancia como pantalla propia (sigue como sección de la ficha), las secciones largas de la ficha (medidas, hábitos, comidas, fotos, rutinas y comentarios) siguen debajo porque guardan funciones que se usan, y «Agregar comida» sigue siendo una hoja inferior (no una pantalla completa).
