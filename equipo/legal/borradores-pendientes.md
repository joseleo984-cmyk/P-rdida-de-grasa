> Lista de textos legales que el equipo redactará **cuando el abogado conteste** `preguntas-abogado.md` (rev. 3). Aún no se redacta nada.
> Estado: 2026-10-22 · Tarea de origen: S3-5. No son asesoría legal: el abogado aprueba el texto final.

| # | Texto | Qué debe cubrir (según los hechos del `paquete-abogado.md`) | Depende de | Dónde irá |
|---|---|---|---|---|
| 1 | **Términos y Condiciones, versión con cuentas** | Cuentas por correo y código, copia en la nube, roles (cliente / coach), vínculo y permisos, fin del vínculo, borrado de cuenta, mayoría de edad, limitación de responsabilidad, coaches no sustituyen a un profesional de salud | P1, P2, P9, P14, P15 | Reemplaza `terminos-y-condiciones.md` y `legal/terminos.html` (subir a versión 1.0) |
| 2 | **Política de Tratamiento de Datos, versión con cuentas** | Responsable, finalidades, datos sensibles, Supabase (EE. UU.) y Brevo, transmisión internacional, derechos y canal de reclamos, plazos de conservación y borrado, incidentes | P1, P6, P7, P10, P11, P12 | Reemplaza `politica-tratamiento-datos.md` y `legal/privacidad.html` |
| 3 | **Consentimiento de datos de salud y de compartir con el coach** | Texto de las casillas (datos sensibles, notas, comidas, hábitos), revocación, que peso y medidas son necesarios solo mientras haya vínculo | P1, P2 | Pantalla de consentimiento; el servidor guarda la huella del texto |
| 4 | **Consentimiento de «copia en la nube»** | Qué se guarda, dónde (fuera de Colombia), quién lo ve, cómo desactivar y borrar | P3, P6 | Pantalla de cuenta; reemplaza el aviso actual |
| 5 | **Consentimiento de fotos en la nube y con el coach** | Autorización propia de fotos, registro de vistas del coach, revocación | P8 | Se activa `photosCloudAllowed` solo cuando exista |
| 6 | **Acuerdo de encargado para coaches** | Finalidad, confidencialidad, seguridad, no copiar ni reenviar, borrado al terminar, no subencargar, qué ocurre si incumple | P4, P5, P14 | Se acepta al registrarse como coach |
| 7 | **Aviso de privacidad del correo (códigos)** | Qué datos recibe el proveedor de correo y para qué | P7 | Pantalla de correo y política |
| 8 | **Procedimiento de incidentes y de reclamos (una página)** | Quién, a quién y en cuánto tiempo se avisa; modelo de respuesta al titular | P12 | Documento interno y enlace en la política |
| 9 | **Texto de menores / mayoría de edad** | Declaración o verificación, qué pasa si se descubre un menor | P9 | Casilla y página «por qué solo mayores de 18» |

Después de redactar: actualizar `Schema.LEGAL_VERSIONS` (obliga a volver a aceptar), regenerar `legal/*.html` y volver a enviar al abogado la versión final antes de conectar la app a `plataforma`.
