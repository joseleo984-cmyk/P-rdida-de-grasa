# Sprint 2 — Review y Retro (2026-10-21)

**Objetivo:** "Dejar la app lista para arrancar el piloto con 2 coaches." → ✅ **Cumplido en lo técnico.**
Bloqueado solo por tareas del Stakeholder (ver "Para arrancar el piloto").

## Review
| Historia | Resultado | Cómo verlo |
|---|---|---|
| S2-1 LEGAL-01 Aceptar T&C y Política | ✅ QA (3 rondas) | Primer uso: 5 casillas sin marcar; Perfil → Privacidad para ver/retirar. Sin autorización de salud, nada de salud se guarda (control central). |
| S2-2 E2E Playwright + CI | ✅ | GitHub → Actions → "CI" en cada push/PR. |
| S2-3 Kit piloto en la app | ✅ QA (2 rondas) | Perfil → Datos: "Exportar CSV" (Excel es-CO, con hábitos) y "Abrir copia de cliente" (solo lectura, no toca mis datos). |
| S2-4 Datos v4 listos para sync | ✅ QA (2 rondas) | Invisible para el usuario: UUID, updatedAt, borrados lógicos y fusión "gana el último cambio", sin servidor aún. |

Métricas: unitarias 37 → 61 · E2E Playwright 29 → 79 · textos legales en fase piloto · 0 defectos abiertos de código.
Único `test.fail` esperado: datos del responsable sin rellenar en los textos legales (D2, del Stakeholder).

## Retro
**Qué funcionó**
- "El autor resuelve sus conflictos" (acción del Sprint 1): el Frontend resolvió 6 conflictos solo y sin romper nada.
- Defectos documentados como `test.fail` por QA: el Dev sabía exactamente qué arreglar y cuándo quedaba hecho.
- El CI en GitHub encontró un fallo real (tabla desbordada) que en local no aparecía.
- Un solo esquema en vuelo a la vez (S2-4 esperó a S2-1): cero conflictos de migración.

**Qué no funcionó**
- Playwright reutilizaba el servidor de otra copia de trabajo → riesgo de probar código ajeno. Corregido (`reuseExistingServer: false`, `E2E_PORT`).
- Los textos legales generados (`legal/*.html`) chocaban al mezclar → se regeneran con `npm run legal`, no se resuelven a mano.
- Pausa de ~5 h por límite de uso de la cuenta.
- Al renumerar la política se rompieron enlaces de la app (#s4 → #s5): el test lo detectó.

**Acciones para el Sprint 3**
1. Conflictos en `legal/*.html`: regenerar siempre con `npm run legal`.
2. Cada worktree con su `E2E_PORT`.
3. Antes de cambiar los textos legales, buscar enlaces a sus secciones (`grep -n "privacidad.html#"`).

## Para arrancar el piloto (Stakeholder)
1. Rellenar los [CAMPOS] del responsable en `equipo/legal/*.md` (tabla al inicio de cada archivo) y llevar textos + `equipo/legal/preguntas-abogado.md` al abogado.
2. Aprobar el merge de `claude/agent-team-app-org-nnunot` a `main` (publica la app en GitHub Pages).
3. Activar GitHub Pages (Settings → Pages → Source: GitHub Actions) y, recomendado, proteger `main` exigiendo el check "CI".
4. Con el texto aprobado por el abogado: subir la versión legal (0.1 → 1.0) y publicar.
5. Usar `equipo/piloto-r0.md` con los 2 coaches.
