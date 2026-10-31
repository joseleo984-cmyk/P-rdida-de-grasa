# Decisiones de negocio del Stakeholder (2026-10-21)

| # | Tema | Decisión |
|---|---|---|
| 1 | Piloto | Hay **2 coaches dispuestos** (2 × ~5 clientes, 3-4 semanas) |
| 2 | Precio | **USD 5 por cliente** (supuesto: por cliente activo al mes) |
| 3 | Mercado | **Solo Colombia** (Ley 1581/2012; pasarelas locales) |
| 4 | Modelo de ingreso | Fase 1: gratis para el coach hasta 5 clientes y tarifa por cliente, cobrada fuera de la app. **Fase 2: cada cliente paga** directamente en la app (requiere reparto coach/plataforma → R2) |
| 5 | Servidor | Abierto a **Render** además de Supabase. **Requisito nuevo: se crearán varias apps** → la plataforma elegida debe permitir alojar varias apps (y idealmente compartir cuentas/infra) |
| 6 | Cuentas | **Cada persona con su cuenta y login** (cliente y coach). Se mantiene el funcionamiento offline (local-first) |
| 7 | Fotos | **El coach ve fotos desde R1** (con consentimiento explícito del cliente, opt-in por foto o por categoría) |

| 8 | Legal | Los usuarios (coaches y clientes) deben **aceptar Términos y Condiciones y Política de Tratamiento de Datos** antes de usar la app (también en el piloto) |
| 9 | Figura legal | **Persona natural** (responsable del tratamiento de datos; afecta a pasarela de pagos y facturación en R2) |
| 10 | Servidor | **Aprobado Supabase**, un proyecto compartido para varias apps (SPIKE-02) |

## Pendiente
- Que un abogado revise los borradores de T&C y Política antes de datos reales (recomendación del equipo).
- Región de datos (Virginia vs. São Paulo): medir latencia desde Colombia antes de crear el proyecto.

## 2026-10-21 (tarde)
| # | Tema | Decisión |
|---|---|---|
| 11 | Publicación | Sprints 1–2 publicados en `main` y GitHub Pages (PR #3) |
| 12 | Datos de contacto | José Granados · Calle 18 # 16-27, Barranquilla · joseleo984@gmail.com · +57 312 887 6135. **No se publica la cédula.** |
| 13 | Conservación | Archivos recibidos: mientras el cliente siga en el servicio; máx. 30 días después de dejarlo |
| 14 | Canal de datos | **No usar WhatsApp para enviar datos** (no da confianza) → **opción B: cuentas reales (R1) antes del piloto**, Supabase plan gratis durante el piloto |

## 2026-10-22 (Sprint 6: consentimientos y bloqueos legales)
| # | Tema | Decisión |
|---|---|---|
| 15 | Edad mínima | **18 años.** El perfil rechaza edades menores con un mensaje claro y amable. Los datos ya guardados de menores no se borran en silencio: la app avisa y pide corregir. |
| 16 | Acuerdo del coach (A7) | El coach lo **acepta al registrarse como coach**, antes de ver datos de clientes y antes de tener código de invitación activo. Se registra como consentimiento `coach_agreement` (versión y huella del texto). |
| 16b | Acuerdo del coach: solo digital (2026-10-23) | **El acuerdo con los coaches es SOLO DIGITAL dentro de la plataforma** (aceptación click-wrap A7 con registro SHA-256). **No se exige firma en papel ni firma electrónica certificada aparte** (la respuesta jurídica P5 la recomendaba para el piloto: queda como **decisión del Stakeholder, a validar por el abogado**). Para reforzar la prueba, el Stakeholder **aprobó** que el coach reciba **copia del acuerdo aceptado por correo** (Brevo) y pueda **verlo y descargarlo** en la app (Más → Mi acuerdo). Se quita de sus pendientes «firmar con los 2 coaches». |
| 17 | Fotos | **Dos autorizaciones separadas**: A6a «guardar mis fotos en la nube» y A6b «que mi coach vea cada foto, una a una». Opcionales y revocables; no condicionan el servicio. En este sprint solo se registra el consentimiento: **la subida de fotos a la nube sigue apagada**. |
| 18 | Brevo | Se **nombra explícitamente** en A4 (copia en la nube y transmisión internacional): Supabase EE. UU. (Virginia) y Brevo para el correo del código. |
| 19 | Retención | Se acepta la propuesta del borrador: cuenta inactiva con aviso a los 12 meses y borrado entre los 13 y 24 meses; prueba mínima seudonimizada del consentimiento 3 a 5 años. **En este sprint solo se implementa la conservación mínima seudonimizada al borrar la cuenta**; los plazos de inactividad quedan documentados, no automatizados. |
| 20 | Dominio y correo propios | Se pospone hasta que la app tenga acogida. |
| 21 | Impuestos (IVA de la plataforma) | Posición del Stakeholder, **por validar con un contador**. No es tarea de código. |

## 2026-10-31 (calendario de cobro y precio; propuesta en `comercial/propuesta-comercial.md`)
| # | Tema | Decisión |
|---|---|---|
| 22 | Piloto y pruebas | **Gratis hasta 5 asesorados por coach** durante el piloto y las pruebas de 30 días. **Modifica el punto 4** en lo relativo a cuándo se cobra. |
| 23 | Cobro después del piloto | Terminados el piloto y las pruebas: **gratis los 2 primeros asesorados y USD 5 por asesorado activo al mes desde el tercero** (antes: gratis hasta 5). Cobro fuera de la app, en COP. **Sustituye el límite de 5 gratis del punto 4.** |
| 24 | Precio fundador | Se ofrece a los **primeros 20 coaches**: precio fijo mientras sigan activos. **De por vida mientras siga activo.** **«Activo» = coach que paga.** Si se va y vuelve: por definir (suposición: pierde el precio tras 60 días sin pagar). |
| 25 | Dato de mercado | Los coaches del piloto cobran **COP 400.000 al mes** por asesorado (dato de José; USD 5 ≈ 5 % si el dólar está cerca de COP 4.000, hipótesis). |
| 26 | Dedicación | José dedica **5 horas por semana** a hablar con coaches durante los 30 días de pruebas. |
| 27 | Duración del piloto | **8 semanas** (decisión de José), con revisión a las 4. |
| 28 | Inicio del piloto | **Segunda semana de noviembre de 2026.** Dura 8 semanas. |
| 29 | Orden de construcción para el piloto | 1) recordatorio diario, 2) resumen semanal del asesorado, 3) aviso al coach con guía, 4) plantillas de reenganche, 5) liga, 6) lista «a quién reconocer», 7) reporte para José, 8) hito de 6 semanas y cierre de ciclo. Ver `comercial/pedido-funciones-piloto.md`. |
| 30 | Revisión legal de la liga | No se pide si no es necesario: se usa el texto literal del Concepto 7. |

