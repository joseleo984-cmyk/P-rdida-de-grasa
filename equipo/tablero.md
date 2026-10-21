# Tablero Kanban — WIP máximo "En curso": 2

## Sprint 1 — ✅ CERRADO (ver sprint1-review-retro.md)
**Objetivo:** "Que nadie pierda sus datos ni la app se rompa, y que registrar comida cueste menos."

| Backlog | Listo | En curso | En revisión | Hecho |
|---|---|---|---|---|
| HU-03 Editar registros/alimentos (Sprint 2) | | | | S1-1 Esquema + importación segura ✅ QA |
| HU-04 Porciones (Sprint 2) | | | S1-3 corregida — re-verificación QA | S1-2 HU-01 Proteger datos ✅ QA |
| HU-05 Gasto real estimado (Sprint 2) | | | | |
| Deuda: dividir app.js, SW, a11y | | | | |

### S1-1 Esquema versionado + importación segura (Backend/Datos + Front, M)
Origen: Arquitecto A2, A3, M1, M4 · QA BUG-01, BUG-02 y bug "100200".
- `schemaVersion` + migración v1→v2 pura con pruebas (respaldos antiguos siguen importando)
- Validar y normalizar el JSON importado ANTES de guardar; importación atómica (fotos incluidas)
- Escapar todo dato interpolado en `innerHTML`; números importados convertidos a número
- Perfil validado antes de mutar el estado

### S1-2 HU-01 Proteger datos (Front, S)
- `navigator.storage.persist()` y aviso si no se concede
- Recordatorio de respaldo si han pasado ≥ 7 días desde el último

### S1-3 HU-02 Repetir comidas (Front, S)
- "Repetir ayer" y repetir una comida concreta en el diario

Orden: S1-1 primero (S1-3 depende del esquema). QA revisa cada historia con la DoD.

## Sprint 2 — PLANIFICADO por el SM (Stakeholder ausente; solo trabajo basado en decisiones ya tomadas)
**Objetivo:** "Dejar la app lista para arrancar el piloto con 2 coaches."

| Listo | En curso | En revisión | Hecho |
|---|---|---|---|
| | | | S2-1 LEGAL-01 ✅ (D1, D3, obs. cerrados) · ✅ QA con condiciones (D2: rellenar datos del responsable + abogado) |
| | | | S2-2 QA-01 E2E Playwright + CI ✅ |
| | | | S2-3 Kit piloto ✅ QA (+ ajustes D1/O1/O2/O4) |
| | | S2-4 DATOS-v4: UUID, updatedAt, borrado lógico — QA revisando | |

Fuera de alcance sin el Stakeholder: merge a main/publicación, crear el proyecto Supabase, textos legales definitivos.

## Sprint 0 — Diagnóstico ✅ HECHO
| Hecho |
|---|
| Equipo y tablero (SM) · backlog.md (Analista) · arquitectura.md (Arquitecto) · qa-informe.md + capturas (QA) |

## Decisiones del Stakeholder (2026-10-21)
1. Usuarios: **la mayoría con iPhone/Safari** → la protección de datos (S1-1, S1-2) sigue siendo prioridad máxima.
2. **Habrá servidor** → nueva épica "Cuentas y sincronización". Antes de construir: spike del Arquitecto (opciones, coste, privacidad de datos de salud). Falta definir para qué se usa el servidor.
3. **No hace falta `file://`** → se permiten módulos ES; se habilita refactor de `app.js` (deuda M2).
4. **Se permiten dependencias de desarrollo** → Playwright E2E en CI (punto 3 de la DoD pasa a obligatorio).

## Próximo (Listo para Sprint 2, tras cerrar Sprint 1)
- ✅ SPIKE-01 hecho (equipo/spike-servidor.md): recomienda Supabase, login OTP de 6 dígitos (no enlace mágico en iPhone), local-first
- ✅ Visión plataforma coaches hecha (equipo/vision-plataforma.md): R0 descubrimiento → R1 MVP coach → R2 cobros → R3 retos → R4 comunidad
- DATOS-v3: esquema v3 preparado para sync (UUID, updatedAt, borrado lógico) — no se mete en S1-1 ya entregada
- LEGAL-01: aceptación de T&C y Política de Tratamiento de Datos en la app (versión + fecha aceptada), requisito para el piloto
- R0: kit del piloto concierge (2 coaches × 5 clientes) + guion de entrevistas a coaches
- QA-01: Playwright E2E en CI (workflow en PR) a partir de equipo/qa/run-sprint0.js
- DEUDA-M2: dividir app.js en módulos ES (después de QA-01, para tener red de seguridad)
- HU-03 Editar registros/alimentos
