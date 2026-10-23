# Sprint 11: «App para coaches», Etapa 1 (Dev Full-stack, QA propio)

Para: QA / Stakeholder · Rama `claude/agent-team-app-org-nnunot` (sin push ni PR) · Contrato: `equipo/r1-contrato.md` §15 (v1.6) · Maqueta aprobada: artefacto «Maqueta M1 Coach» (M1 lista, M2 ficha, M3 inicio del cliente, M4 acceso en pausa).

**Alcance cambiado durante el sprint (Stakeholder):** los **hábitos entran en la Etapa 1**. Comidas, calorías, plan y recomendaciones siguen escondidos (Etapa 2).

## Cómo se activa (y cómo la app oficial queda igual)
- `config.pruebas.js` añade `producto: 'coach'` y `soloNube: true`. **`config.js` oficial no se toca** y no trae esos campos: sin ellos no se pone ninguna clase en `<body>` (`producto.js`), las pestañas nuevas no tienen botón y todo lo nuevo está oculto. Prueba: `s11-entrada.spec.js` («la app OFICIAL no cambia»), `tests/producto.test.js` y las 174 pruebas E2E anteriores en verde (se ajustaron solo las que miraban la versión 4 del esquema, el texto exacto de `photosCloudAllowed` y un vínculo que ahora necesita estar al día).
- Sin servidor configurado, `soloNube` se desactiva solo (no tiene sentido sin cuenta).

## Qué cambió (por punto del encargo)
| # | Qué | Dónde |
|---|---|---|
| 1 Cobros manuales | Lista «Mis asesorados» con chip **Pagó / No pagó**, «Pagó hasta el 10 nov · vence en 20 días», resumen «N pagaron / N sin pagar», orden por vencimiento o nombre. Tocar el chip abre «Cobro»: **Pagó** = hoy + 30 días (fecha editable), **No pagó** = vencido desde ayer. Visible solo para ese coach y ese cliente (RLS). Botones «＋ Agregar asesorado» y «Mostrar QR o enlace». | `coach-panel.js`, `pagos.js`, `index.html` |
| 2 Bloqueo | Cliente vinculado y vencido (o sin fecha): pantalla **M4** «Tu acceso está en pausa» en Inicio; formularios de hábitos, medidas y fotos escondidos y rechazados por código; **siempre** puede ver (Ver mis datos), **descargar** (JSON) y **borrar su cuenta**. Se reactiva sola al marcar el coach (revisa al volver a la app y cada minuto; botón «Ya pagué: volver a comprobar»). Servidor: `sync_push` y subida de fotos fallan con `42501 payment_required`; pull y borrar cuenta, no. Sin coach: nunca se bloquea. `payment_required` es un código propio (`remote.js`), la app lo trata como pausa (estado `paused` en `sync.js`), no como error técnico. | `app.js` (`renderPaused`), `sync.js`, `remote.js`, SQL |
| 3 Días para el próximo pago | Cliente: «Faltan N días para tu próximo pago» (resaltada si N ≤ 7). Coach: «vence en N días» en cada fila y ficha. Solo dentro de la app. | `pagos.js`, `app.js`, `coach-panel.js` |
| 4 Medidas | Cuello, brazo der./izq., espalda, cintura, muslo der./izq. (cm con coma o punto), por fecha, **sin peso obligatorio** ni datos de salud. Gráfica sencilla (SVG) por medida; tabla Inicio / Hoy / Cambio (en verde si baja) para el cliente y en la ficha del coach (M2). Reusa el registro `entry` (una fila por día). **Esquema v5**: campos opcionales nuevos, migración v4→v5 sin cambiar datos (copia `:backup-v4`), compatible hacia atrás con respaldos y sync. | `schema.js`, `medidas.js`, `app.js` |
| 5 Fotos | **Encendidas** solo con producto coach. Detrás de **A6a** (guardar en la nube, desde la pestaña Fotos, con su texto exacto) y **A6b** (que el coach vea cada foto, una a una; además hay que marcar cada foto). Subida bloqueada por pago (también en Storage). Borrar una foto borra el archivo de la nube. Coach: ve solo las marcadas, cada apertura pide un enlace de 60 s y queda registrada; **comparar antes/después**. Quitar A6b o A6a oculta al instante. Detalle abajo. | `app.js`, `sync.js`, `photos.js`, `coach-panel.js`, `account.js`, SQL |
| 6 Entrada solo con cuenta | Una pantalla: ☐ mayor de 18 · ☐ Términos y Política · ☐ autorización única (texto del encargo, ajustado a «medidas de cuerpo y hábitos») con marca visible **«Borrador de prueba, pendiente del abogado»** · ☐ Compartir mis hábitos con mi coach (opcional, sin premarcar). Sin «solo en mi teléfono» ni «Ahora no». Entra con enlace/QR (el código es obligatorio para un cliente). Pide el **nombre** (así lo ve el coach). Registra los mismos eventos que exige el servidor: `adult`, `terms`, `privacy`, `sensitive_health` y `cloud_transfer` (con la huella de la autorización única) y, al vincularse, los 5 `share_*` (solo medidas activado; hábitos si lo marcó; el resto apagado) con el texto `compartir-c1`. Cerrar sesión o borrar la cuenta devuelve a la entrada. | `index.html` (`#solo`), `app.js`, `account.js`, `consent-texts-solo.js` |
| 7 Modo producto coach | Cliente: **Inicio · Hábitos · Medidas · Fotos · Más**. Coach: **Asesorados · Invitar · Más**. Oculto: calorías, comidas, plan, recomendaciones, peso y «Mi plan y perfil». El código de comidas/plan sigue ahí. | `producto.js`, CSS `home-legacy` |

**Hábitos (alcance nuevo):** pestaña Hábitos con lo que la app ya guardaba (agua en **vasos de 250 ml**, pasos, horas de sueño, entrenó). Se limpió la interfaz a esos cuatro: «Cumplido» = 8 vasos, 8.000 pasos, 7 h de sueño, entrenó. «Mi semana» muestra «N de 7 días» con barra por hábito (últimos 7 días, hoy incluido); Inicio muestra los de hoy en lugar de calorías. El coach ve en la ficha **«Hábitos de la semana»** (como M2) y en cada fila de la lista «Hábitos de la semana: 39 %» (días cumplidos sobre 28). Si el cliente no los comparte: «Ana todavía no comparte sus hábitos» en la ficha y «No comparte sus hábitos» en la lista. Compartir se cambia luego en Más → Mi coach / Mis datos y permisos.

## Fotos: qué se entregó (claro)
**Entregado completo, no a medias**, en el servidor falso y en SQL probado (342 comprobaciones): autorizar A6a → subir (archivo privado + metadatos) → autorizar A6b → marcar foto por foto → el coach las ve con enlace de 60 s y registro → comparar → retirar permiso/borrar. También baja las fotos en otro teléfono (`photos.applyRemote` con URL firmada).
**No verificado contra Supabase real**: la subida con la política de Storage nueva, las URL firmadas reales y el rechazo 403 por pago (el script `qa-live-rls.js` sección a3 lo prueba, pero no pude correrlo). La app no puede distinguir en el 403 de Storage «sin permiso» de «sin pago» sin preguntar por el vínculo: lo hace con `my_link()`.

## Para el Stakeholder: qué pegar y qué verificar
1. Pegar `supabase/r1.sql` (r1 v1.6) en **`pruebas`** y después en **`plataforma`** (SQL Editor; idempotente; debe terminar con una fila `OK r1 v1`). Los vínculos que ya existían reciben 30 días de gracia una sola vez.
2. Correr `scripts/qa-live-rls.js` y `scripts/qa-live-recheck.js` (no pude: sin acceso a Supabase). El primero borra la cuenta B al final.
3. **Ojo con el orden:** con r1 v1.6 aplicado, una versión antigua de la app no puede sincronizar a un cliente vinculado vencido. La copia de `/pruebas/` se actualiza al hacer merge a `main`.
4. En el iPad, abre `/pruebas/` con un enlace de invitación de un coach de prueba y verifica (marca `[ ]`):
   - [ ] Pantalla única: el botón «Continuar» solo se activa con las tres casillas; se ve el rótulo del borrador; no hay «solo en mi teléfono».
   - [ ] Entras con correo + nombre + código; llegas a «Te vas a conectar con «…»» con solo medidas fijo y hábitos según lo que marcaste.
   - [ ] Recién vinculado ves «Tu acceso está en pausa». En el otro teléfono (coach) marca «Pagó»: en menos de un minuto (o con «Ya pagué») se reactiva.
   - [ ] Medidas con coma decimal (teclado del iPad), la gráfica, y la tabla en el coach en verde cuando bajan.
   - [ ] Hábitos: vasos con + y −, y la ficha del coach con las barras.
   - [ ] Fotos: autorizar, tomar una foto con la cámara, marcarla, que el coach la abra y compare dos; quitar el permiso y que desaparezca.
   - [ ] Poner «No pagó» y comprobar que no deja guardar nada nuevo pero sí Descargar y Borrar mi cuenta.
   - [ ] Letra grande del iPad y modo oscuro: sin texto cortado.

## Pruebas (resultado)
`npm test` **270/270** (antes 242) · `PGOPTIONS='-c qa.strict=on' npm run test:db` **342** comprobaciones OK (antes 298; `100_pagos_coach.test.sql` nueva) · E2E **195** pasadas (antes 174; nuevas `s11-entrada`, `s11-cobros`, `s11-medidas-habitos`, `s11-fotos`: letra ancha a 390 px, botones ≥ 48 px, claro/oscuro, foco con teclado) · `node equipo/qa/run-all.js` 9 suites en verde · `npm run build:site` OK (la raíz sin URL/clave de pruebas ni claves secretas; `check:conexion` falla igual que antes, a propósito: `config.js` vacío y legales v0.1) · caché del SW v34. Capturas nuevas: `equipo/qa-capturas/s11-*.png` (los PNG antiguos no se tocaron).

## No verificado
Supabase real (SQL probado en PostgreSQL 16 local con un stub de Supabase), Safari/iPad real, cámara real, enlace/QR con un teléfono real, Brevo.

## Riesgos
- **Botón «Escribirle a mi coach» de la maqueta M4 no existe:** la app no tiene un canal de contacto con el coach (el coach no ve el correo del cliente y viceversa). Se sustituyó por «Ya pagué: volver a comprobar». Si se quiere, hace falta un dato de contacto (WhatsApp del coach) en su perfil.
- Un coach marcando «Pagó» por error no puede deshacerlo a la fecha anterior (no hay historial); marca la fecha correcta a mano.
- El cliente vencido que se desvincula deja de estar bloqueado (por diseño: «sin coach no se bloquea»); el coach lo pierde de su lista.
- Mientras la app cree que el cliente está al día, deja guardar localmente; el servidor rechaza la subida y la app pasa a pausa (el dato queda en el teléfono y sube cuando se reactive).
- El jsonb de `entry` no valida claves: un cliente con una versión nueva y otro dispositivo con la v4 podrían perder las medidas nuevas si editan el mismo día en el dispositivo viejo (los dispositivos se actualizan juntos por el service worker).
- Autorización única, hábitos como dato sensible y retiro «borrando la cuenta»: pendientes del abogado.
- No se encontró el archivo de la consulta «solo con cuenta»: se usó el texto base del encargo (ver `equipo/legal/borradores/autorizacion-unica-prueba.md`).
