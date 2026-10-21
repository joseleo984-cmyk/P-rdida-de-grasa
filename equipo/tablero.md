# Tablero Kanban — WIP máximo "En curso": 2

## Sprint 1 — EN CURSO (aprobado por el Stakeholder 2026-10-21)
**Objetivo:** "Que nadie pierda sus datos ni la app se rompa, y que registrar comida cueste menos."

| Backlog | Listo | En curso | En revisión | Hecho |
|---|---|---|---|---|
| HU-03 Editar registros/alimentos (Sprint 2) | | S1-1 Esquema + importación segura — Dev Backend | | |
| HU-04 Porciones (Sprint 2) | | S1-2 HU-01 Proteger datos — Dev Frontend | | |
| HU-05 Gasto real estimado (Sprint 2) | S1-3 HU-02 Repetir comidas | | | |
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

## Decisiones del Stakeholder (supuestos por defecto mientras no responda)
- Se asume: usuarios con iPhone (máxima protección), sin servidor, `file://` debe seguir funcionando (scripts clásicos, sin módulos ES), sin dependencias de desarrollo en el repo.

Preguntas originales:
1. ¿Los usuarios usan iPhone/Safari? (más riesgo de borrado de datos)
2. ¿"Sin servidor" es innegociable?
3. ¿Hace falta abrir la app con doble clic (`file://`)? Si no, podemos usar módulos ES para dividir `app.js`.
4. ¿Se permiten dependencias solo de desarrollo (Playwright para pruebas E2E en CI)?
