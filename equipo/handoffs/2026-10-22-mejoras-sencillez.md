# Handoff: mejoras de sencillez y barra nueva (DEV Frontend)

El Stakeholder quiere la app lo más fácil y amigable posible. Se hicieron las 4 mejoras pequeñas (fase A) y la barra de abajo nueva (fase B). El rediseño de Inicio/Panel NO se tocó.

## Qué cambió (un commit por mejora)
- **A1 Invitar por WhatsApp.** `invite.js` (puro, con `tests/invite.test.js`): código con el formato del servidor, enlace `location.origin + location.pathname + '?c=CODIGO'` (sirve en la raíz y en `/pruebas/`), mensaje, URL `wa.me`, caducidad de 7 días. Panel del coach: tarjeta "Invitar por WhatsApp" (nombre opcional, vista previa, botón que abre WhatsApp, "Copiar enlace" con alternativa por selección). Nombres siempre con `textContent` / `encodeURIComponent`. Con servidor, al abrir `?c=` se guarda la invitación (clave `PGNS.key('invite')`), se quita de la URL (`history.replaceState`, conserva `?remote=fake`) y la cuenta deja listo "cliente" + código (sin sesión: tras entrar; cliente sin coach: comprueba el código y muestra el nombre del coach; ya vinculado o coach: frase simple; código inválido o vencido: mensaje y se puede escribir a mano). Se borra al usarla. Sin servidor no se toca ni la URL ni el almacenamiento.
- **A2 Textos sencillos.** Solo cuenta, vinculación, panel del coach, estado de guardado y tarjetas de Perfil/Datos con cuenta (ver tabla). La app oficial sin servidor no cambia (`DATA_LOCAL` igual). No se tocó ninguna casilla ni texto legal. Nuevos `CloudView.ago()` y `CloudView.savedLine()`.
- **A3 Instalar en iPhone.** `install-guide.js`: `debeMostrarGuiaInstalacion({ua, standalone, descartada})` (Safari de iPhone/iPad, también iPad en modo escritorio; no Chrome/Firefox/Edge ni in-app). Tarjeta de 3 pasos con iconos SVG, "Entendido" / "No mostrar más" (`PGNS.key('install-guide')`), tras aceptar los textos legales. Acceso permanente: fila "Cómo instalar la app" en Más (`data-install-guide`).
- **A4 Código del correo.** Atributos de autollenado en correo y código (`maxlength` 6); el código entra solo al completar 6 dígitos, sin doble envío; el botón "Entrar" sigue funcionando. Las pruebas ya no pulsan "Entrar" después de escribir el código.
- **B Barra nueva.** Cliente y sin cuenta: Inicio | Comidas | ＋ Registrar | Progreso | Más. Coach: Clientes | ＋ Invitar | Más (empieza en Clientes; su seguimiento personal está en Más: Mi panel, Mi peso y medidas, Mis comidas). Iconos SVG de trazo, etiquetas de 12 px, botones ≥ 44 px, `aria-current`, foco visible, contraste ≥ 4,5:1 (también en oscuro), disco central que sobresale 20 px sin tapar contenido. Hoja "¿Qué quieres registrar?" (`<dialog>`, ×/Escape, foco al abrir y al cerrar): Mi peso de hoy → Progreso con el foco en el peso; Una comida → Comidas; Repetir la de ayer (solo si ayer hay comidas); Cómo me fue hoy → hábitos; "Foto de mi plato · Próximamente" es un `div` punteado, no un botón. Más: cabecera (nombre, correo o "Tus datos están solo en este teléfono", "Guardado en tu cuenta · hace N min"), filas Mi plan y perfil, Mis fotos, Mi coach (solo con coach vinculado), Mis datos y permisos, Descargar una copia, Cómo instalar la app, Ayuda, Cerrar sesión (con cuenta); cada pantalla con "← Más" (el foco vuelve a la fila). Ayuda es nueva (5 preguntas; la parte de cuentas solo con servidor).

## Cómo quedaron las vistas
- Se conservan `#view-panel/registro/comidas/fotos/perfil/coach` y `data-view`. Nuevas: `#view-mas`, `#view-ayuda`, `#view-invitar`.
- Perfil se muestra por partes con `#view-perfil[data-mode]`: `plan` (perfil + plan), `datos` (cuenta, privacidad, datos), `copia` (Datos), `coach` (`#form-shares`, ahora su propia tarjeta), `all` (todo, como antes). Sin permiso de datos de salud, `plan` se convierte en `all` para poder autorizar.
- Ya no existen `#tab-perfil` ni `#tab-fotos`. Ayudantes de pruebas: `app.goPerfil(mode='all')`, `app.tab('perfil'|'fotos')` y `window.PGNav.show(view, mode)` / `PGNav.applyNav(isCoach)`. `tests/e2e/fake-helpers.js` agrupa coach/teléfono/entrada con el servidor falso.

## Textos: antes → después
| Dónde | Antes | Después |
|---|---|---|
| Estado de guardado | Sincronizado hoy 9:41 | Se guardó en tu cuenta hoy 9:41 |
| | Sincronizando… | Guardando en tu cuenta… |
| | Sin conexión: se subirá al volver. | Sin internet: se guardará en tu cuenta cuando vuelva. |
| | No se pudo sincronizar: se reintentará solo. | No se pudo guardar en tu cuenta. Lo intentamos de nuevo solos. |
| | Tu sesión caducó: vuelve a entrar con tu correo para sincronizar… | Tu sesión se cerró. Entra de nuevo con tu correo para seguir guardando en tu cuenta (tus datos siguen aquí). |
| | No sincroniza: no autorizaste datos de salud. | No se guarda en tu cuenta porque no autorizaste los datos de salud. |
| | Falta confirmar que estos datos son tuyos. | Falta que confirmes que estos datos son tuyos. |
| Perfil: tarjeta | Cuenta y copia en la nube | Tu cuenta |
| | Sesión iniciada: X (cliente). | Entraste con X. (coach: «Tienes cuenta de coach.») |
| | Sin cuenta: estás usando la app solo en este dispositivo. Entra o crea una cuenta para guardar una copia en la nube. | Sin cuenta: tus datos están solo en este teléfono. Crea una cuenta o entra para que queden guardados también en tu cuenta. |
| | Vincularme con un coach / Sincronizar ahora | Conectarme con mi coach / Guardar ahora |
| | Terminar el vínculo (+ confirmación) | Dejar de compartir con mi coach · «Tu coach ya no verá tus datos…» |
| | Qué ve tu coach (efecto inmediato) | Lo que ve tu coach (se aplica al momento) + línea «Tu coach puede ver tu peso y tus medidas, tus comidas…» |
| | Guardado: tu coach ya ve solo lo que marcaste | Listo: tu coach verá solo lo que marcaste |
| Datos (con cuenta) | …también en la nube. Las fotos se guardan solo en este dispositivo por ahora. | Tus datos se guardan en este teléfono y también en tu cuenta. Las fotos, por ahora, solo se guardan en este teléfono. |
| Pantalla de cuenta | Con una cuenta tus datos se guardan también en el servidor… sin que le envíes archivos. | Con una cuenta tus datos quedan guardados y no los pierdes si cambias de teléfono. Si tienes coach, podrá ver tu progreso sin que le mandes nada. |
| | Te enviaremos un código de 6 dígitos. No usamos contraseña. | Te enviamos un código de 6 números a tu correo. No necesitas contraseña. |
| | Ahora no: usar solo en este dispositivo | Ahora no: usar solo en este teléfono |
| | Código incorrecto o caducado… | Ese código no es el correcto o ya venció. Mira el último correo que te llegó o pide uno nuevo. |
| | Ese código de coach no existe o ya no es válido. | Ese código no existe o ya venció. Pídele a tu coach un enlace nuevo, o escríbelo aquí a mano. |
| | Sin conexión. Para entrar la primera vez… | No hay internet. Para entrar por primera vez en este teléfono necesitas conexión. |
| | Te vas a vincular con «X» / Vincularme y continuar | Te vas a conectar con «X» / Conectarme y continuar |
| | Registro mi progreso; puedo tener un coach. | Llevo mi progreso; puedo tener un coach. |
| | Las fotos nunca se comparten salvo que lo autorices foto a foto | Tus fotos no las ve nadie, a menos que tú lo autorices (próximamente, foto por foto). |
| | Este teléfono ya tiene registros que se hicieron sin cuenta. Si son tuyos… | Estos datos se guardaron en este teléfono antes de crear tu cuenta. ¿Son tuyos? |
| | Sesión iniciada como X. Ya estás vinculado con «Y». | Entraste como X. Ya estás con tu coach «Y». |
| Panel del coach | Comparte contigo: … No comparte: … Vinculado desde el… | Te muestra: … No te muestra: … Es tu cliente desde el… |
| | Adherencia / Validez / Usos | Constancia / Cuánto dura / A cuántos clientes sirve |
| | Terminar el vínculo con este cliente | Dejar de acompañar a este cliente |

## Cómo probar en el teléfono
1. `/pruebas/` (con servidor de pruebas): como coach, Invitar → escribe un nombre → "Invitar por WhatsApp" abre WhatsApp con el mensaje; envíalo a otro teléfono y toca el enlace: debe pedir el correo, luego el código (en iPhone el teclado ofrece el código del correo) y dejar el código del coach puesto.
2. iPhone con Safari: tras aceptar los textos legales aparece "Instala la app en tu iPhone"; ya instalada desde la pantalla de inicio no. Más → "Cómo instalar la app" siempre.
3. Barra: probar con la letra del sistema grande; el botón ＋ debe verse completo y no tapar el final de las pantallas.

## Pruebas
`npm test` (139), E2E completo (139 con la prueba de letra ancha en 390 px: barra de 5 y de 3 posiciones, `elementFromPoint` de cada botón y de lo que sobresale del central, disco fuera del contenido), `node equipo/qa/run-all.js` (8 suites; los scripts usan `PGNav` con respaldo para la app anterior), `build:site` sin URL ni clave de pruebas en la raíz. SW: caché v25. Capturas: `equipo/qa-capturas/barra-*.png` (4).

## Límites y riesgos
- NO se hizo "Mostrar QR" de la maqueta ni el rediseño de Inicio/Panel (tarjetas, mensaje del coach).
- La barra y la guía de instalación sí cambian la app oficial (sin servidor); nada de cuentas aparece ni se ejecuta sin configuración (hay prueba).
- Posibles ajustes: la hoja "Registrar" y "Repetir la de ayer" confirman si hoy ya hay comidas (comportamiento previo de copiar el día). "Foto de mi plato" es solo informativa.
- El código del correo es de 6 dígitos (`OTP_LEN` en `account.js`); si el proyecto del servidor se configura con otro largo, hay que cambiarlo allí y en el `maxlength` del HTML.
- La guía de instalación detecta Safari por el agente de usuario; navegadores nuevos de iOS podrían no reconocerse (en ese caso no se muestra, la fila de Más sigue).
