# Sprint 1 — Review y Retro (2026-10-21)

**Objetivo:** "Que nadie pierda sus datos ni la app se rompa, y que registrar comida cueste menos." → ✅ **Cumplido**

## Review (demo para el Stakeholder)
| Historia | Resultado | Cómo verlo |
|---|---|---|
| S1-1 Importación segura + esquema versionado | ✅ QA (2 rondas) | Importar un JSON corrupto o malicioso: la app no se rompe, no ejecuta código y no cambia nada. Respaldos antiguos siguen importando. |
| S1-2 Proteger datos (HU-01) | ✅ QA (2 rondas) | Datos → estado "Almacenamiento protegido". Tras 7 días sin copia aparece el aviso; exportar pregunta "¿Se guardó el archivo?". |
| S1-3 Repetir comidas (HU-02) | ✅ QA (2 rondas) | Comidas → "Repetir desayuno de ayer" (1 toque) y "Deshacer" 6 s; en un día pasado, "Copiar este día a hoy". |

Métricas: pruebas unitarias 7 → 37 · E2E automáticas 0 → 29 (y CI en GitHub) · bugs críticos abiertos 2 → 0.

## Retro
**Qué funcionó**
- Diagnóstico en paralelo (Sprint 0) dio consenso rápido sobre el riesgo n.º 1 (integridad de datos).
- QA rechazando con pasos y archivo:línea: encontró pérdida de datos real que el Dev solo intuía.
- Handoffs escritos: cada agente sabía qué cambió sin preguntar.
- Worktrees aislados permitieron 2 devs en paralelo.

**Qué no funcionó**
- Los worktrees nacían desde `main` y no veían `equipo/` → hubo que avisar a mano.
- 3 conflictos de merge (app.js, piloto-r0.md) por tocar las mismas funciones (toast/save) en paralelo.
- Las tres historias necesitaron 2 rondas de QA: la DoD no se verificaba antes de entregar.
- Las capturas de los scripts E2E se sobrescribían en el repo al re-ejecutarlos.
- Cambio de visión (plataforma para coaches) a mitad de sprint: se absorbió sin romper el sprint, pero generó mucho trabajo de descubrimiento en paralelo.

**Acciones para el Sprint 2**
1. Cada dev hace `git merge` de la rama del sprint al empezar y antes de entregar (ya aplicado).
2. Funciones compartidas (`toast`, `save`, `schema.js`) tienen un dueño por sprint; quien necesite cambiarlas lo pide en el handoff.
3. Antes de entregar, el Dev corre `npm run test:all` y marca la DoD en su handoff.
4. E2E nuevas van a `tests/e2e/` (Playwright), no como scripts sueltos; los scripts `equipo/qa/*.js` quedan como histórico.
5. Una sola migración de esquema en vuelo a la vez (S2-4 espera a S2-1).
