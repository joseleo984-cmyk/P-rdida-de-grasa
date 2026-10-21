DE: Scrum Master → PARA: Analista, Arquitecto, Dev Front, Dev Back, QA
HISTORIA: Cierre Sprint 0

HECHO:
- Consenso de los 3 informes: el mayor riesgo es la integridad de los datos (importación sin validar,
  XSS almacenado, sin esquema versionado, sin almacenamiento persistente).
- El objetivo de Sprint 1 del Analista ("que nadie pierda sus datos") absorbe los críticos de QA y A2/A3/M1 del Arquitecto.

RESPUESTAS A PREGUNTAS CRUZADAS:
- @Analista → @Arquitecto (¿esquema antes de HU-03/04?): Sí. S1-1 introduce schemaVersion; HU-03 pasa a Sprint 2.
- @Analista → @QA (¿probar app.js sin dependencias?): extraer lógica pura a módulos tipo calc.js y probarla con node --test.
  E2E con Playwright queda pendiente de la decisión 4 del Stakeholder; script base en equipo/qa/run-sprint0.js.
- Regresión de respaldos antiguos: fixture de un JSON v1 real en tests/, obligatorio en S1-1.
- Definición de Hecho: se adopta la de QA (qa-informe.md §5); el punto 3 (E2E) queda condicionado a la decisión 4.

PENDIENTE: aprobación del Stakeholder del Sprint 1 y las 4 decisiones de tablero.md.
