# Autorización única de prueba («solo con cuenta»)

**Estado:** BORRADOR DE PRUEBA, PENDIENTE DEL ABOGADO. Solo se usa en la copia de pruebas (`config.pruebas.js` con `soloNube: true`). No reemplaza ningún texto v0.1/v0.3 de la app oficial.
**Versión:** `0.1-AU-prueba` · **Dónde vive en el código:** `consent-texts-solo.js` (`ConsentTexts.TEXTS.AU`).

## Texto exacto que se muestra y cuya huella (SHA-256) se guarda

> Autorizo a José Granados a tratar mis medidas de cuerpo y mis hábitos (agua, pasos, sueño y entrenamiento) para registrar mi progreso, a guardarlos en la nube (Supabase, servidores en EE. UU.) y a procesar mi correo con Brevo. Conozco que es una transmisión internacional a proveedores encargados donde las medidas de protección pueden diferir de las de Colombia. Entiendo que esta autorización es necesaria para usar la app y que puedo retirarla borrando mi cuenta.

Base: el texto de la consulta «solo con cuenta» (sección 3: datos, nube, EE. UU., Brevo). No se encontró un archivo de esa consulta en el repositorio: se usó el texto base que dio el Stakeholder y se cambió «datos de salud (peso, medidas, comidas, hábitos)» por «medidas de cuerpo y hábitos (agua, pasos, sueño y entrenamiento)», porque este producto no pide peso, comidas ni datos de salud clínicos.

## Cómo se registra (para no romper la SQL v1.5/v1.6)

Una casilla → dos eventos de consentimiento con la misma versión y la misma huella: `sensitive_health` y `cloud_transfer`. Además, en la misma pantalla:

| Casilla | Evento(s) | Obligatoria |
|---|---|---|
| Soy mayor de 18 años (A1) | `adult` | Sí |
| Acepto los Términos y la Política (A2) | `terms`, `privacy` | Sí |
| Autorización única (AU) | `sensitive_health`, `cloud_transfer` | Sí |
| Compartir mis hábitos con mi coach | se registra al vincularse (`share_habits`) | No, sin premarcar |

Siguen como autorizaciones opcionales y aparte: guardar mis fotos en la nube (A6a, `photos_cloud`) y que mi coach vea cada foto, una a una (A6b, `photo_view_coach`). Compartir por defecto: solo medidas (`share_body`); todo lo demás, apagado.

## Preguntas para el abogado
1. ¿Una sola autorización cubre medidas + hábitos + nube + EE. UU. + Brevo, o hay que separarlas?
2. ¿Los hábitos (sueño, pasos, entrenamiento) cuentan como dato sensible?
3. ¿«Retirarla borrando mi cuenta» es suficiente como mecanismo de retiro?
