# Equipo de agentes — Pérdida de Grasa

Metodología: Scrum ligero + Lean (WIP limitado, MVP, construir → medir → aprender).

| Rol | Quién | Artefacto |
|---|---|---|
| Stakeholder / PO | Humano | Aprueba backlog, arquitectura y demos |
| Scrum Master / Orquestador | Claude | `tablero.md`, daily, retro |
| Analista de producto | Agente | `backlog.md` |
| Arquitecto / Tech Lead | Agente | `arquitectura.md` |
| Dev Frontend + UX | Agente | Código UI |
| Dev Backend + Datos | Agente | Lógica, datos, cálculos |
| QA / Revisor | Agente | `qa-informe.md`, revisión de cada historia |

## Comunicación entre agentes
1. **Tablero** (`tablero.md`): cada agente mueve sus tarjetas.
2. **Handoffs** (`handoffs/AAAA-MM-DD-HU-XX-de-a.md`): nota de traspaso al terminar.
3. **Preguntas**: cada informe tiene "Preguntas para otros agentes"; el Scrum Master las enruta y
   lleva al Stakeholder las decisiones de producto.

### Plantilla de handoff
```
DE: <agente> → PARA: <agentes>
HISTORIA: HU-XX
HECHO:
PENDIENTE:
PREGUNTAS: @Agente ...
```

## Definición de Hecho (borrador, QA la ajusta)
- Criterios de aceptación cumplidos
- `npm test` en verde, con pruebas nuevas para la lógica añadida
- QA lo probó en navegador (móvil 390px) sin errores de consola
- Handoff escrito y tablero actualizado
- Commit en la rama del sprint; merge a `main` solo con aprobación del Stakeholder
