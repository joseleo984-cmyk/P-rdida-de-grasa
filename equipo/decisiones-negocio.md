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

## Pendiente
- Revisión legal antes del piloto (datos de salud y fotos = datos sensibles): sin respuesta aún.
- ¿Empresa constituida o persona natural? (afecta pasarela de pagos en R2)
