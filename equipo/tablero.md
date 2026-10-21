# Tablero Kanban — WIP máximo "En curso": 2

## Sprint 1 — EN CURSO (aprobado por el Stakeholder 2026-10-21)
**Objetivo:** "Que nadie pierda sus datos ni la app se rompa, y que registrar comida cueste menos."

| Backlog | Listo | En curso | En revisión | Hecho |
|---|---|---|---|---|
| HU-03 Editar registros/alimentos (Sprint 2) | | | S1-1 Esquema + importación segura — QA revisando | |
| HU-04 Porciones (Sprint 2) | | | S1-2 fixes D1-D5 — pendiente re-verificación QA | |
| HU-05 Gasto real estimado (Sprint 2) | | S1-3 HU-02 Repetir comidas — Dev Backend | | |
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
- SPIKE-01 Arquitecto: elegir servidor (Supabase / PocketBase / API propia), auth, coste, privacidad, plan local-first
- QA-01: Playwright E2E en CI (workflow en PR) a partir de equipo/qa/run-sprint0.js
- DEUDA-M2: dividir app.js en módulos ES (después de QA-01, para tener red de seguridad)
- HU-03 Editar registros/alimentos
