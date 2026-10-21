# Handoff S3 — Correcciones del QA en vivo (Dev Backend → QA)

Fecha: 2026-10-21 · Base: `2026-10-21-S3-qa-vivo-veredicto.md` · Contrato: `r1-contrato.md` §12 (v1.3)

| Hallazgo | Corrección | Prueba |
|---|---|---|
| H6 (media) | Nueva migración `supabase/migrations/20261021150000_r1_notas_todos_kinds.sql`: `coach_pull` quita `note` en **todo** kind si `share_notes = false`. Revisadas las demás rutas del coach: `coach_clients` solo da fechas; `grasa.records` no tiene política ni grant de lectura para el coach; no hay vistas. | `supabase/tests/70_notas_todos_kinds.test.sql` (10 comprobaciones; profile/entry/food/habit con y sin `notes`, `library` nunca). **Falla sin la migración** (verificado). `supabase/r1.sql` regenerado. |
| H7 (baja) | Sin cambio de BD (cambiar el tipo de retorno exige `drop function` + grants: más riesgo). Contrato §12.2 documenta la fila de nulos; `joinCoach()` ya exige `r.id`. | Pruebas existentes de `remote.test.js`. |
| H2 (media) | `remote.js` `mapError`: `validation_failed` + «refresh token» → `auth`. | `tests/remote.test.js` (y `validation_failed` de email sigue `invalid`). |
| H3 (baja) | `remote.js` `mapError`: `42501` con HTTP 401 → `auth`; con 403 sigue `forbidden`. | `tests/remote.test.js`. |
| H8 (baja) | Solo documentación: riesgo aceptado (contrato §12.5) + JWT expiry ≤ 3600 s en `guia-supabase-stakeholder.md` §7.1 y lista §9. | — |

Resultados: `npm test` 120/120 · `PGOPTIONS='-c qa.strict=on' npm run test:db` 219 OK · `test:e2e` 102/102 · `r1.sql` termina en `OK r1 v1`.
`sw.js` no se tocó (estrategia red primero: `remote.js` nuevo llega sin subir CACHE).

**Pedido a QA:** que el Stakeholder aplique el nuevo `supabase/r1.sql` en `pruebas` y repetir en vivo el caso H6
(food/habit con `note`, solo comidas/hábitos concedidos → sin `note`), más H2/H3 con el script de matriz.
