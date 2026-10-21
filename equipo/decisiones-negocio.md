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
