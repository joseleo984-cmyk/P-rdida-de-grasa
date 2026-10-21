# Daily — noche del 2026-10-21 (Stakeholder durmiendo)

Reglas de la noche: nada a `main`, nada publicado, solo trabajo sobre decisiones ya tomadas.

## Estado al empezar la noche
- S1-2 Proteger datos: ✅ aprobada por QA
- S1-1 Importación segura: corregida, QA re-verificando
- S1-3 Repetir comidas: Frontend aplicando ajustes de QA
- Analista: redactando borradores de T&C y Política de datos + historia LEGAL-01
- Backend: empieza S2-3 (CSV completo + "Ver copia de un cliente" para el coach)

## Registro
- S1-2 ✅ aprobada (QA) · S1-1 ✅ aprobada tras corregir 2 casos de pérdida de datos · S1-3 corregida, QA re-verificando.
- SM resolvió un conflicto de merge en app.js entre S1-1 (avisos de error) y S1-3 (botón Deshacer); 31/31 unitarias y las 5 E2E en verde.
- Analista: borradores de T&C y Política de datos en equipo/legal/ + LEGAL-01 y HU-P10 en backlog.
  ⚠ Riesgo legal: la Ley 1581 (art. 6) no permite condicionar el servicio a entregar datos sensibles; el servicio central ES seguimiento de salud → consultar con abogado.
- En curso: S2-1 LEGAL-01 (Frontend), S2-3 kit piloto (Backend). QA: re-verifica S1-3 y luego monta E2E en CI (S2-2).
- S2-3 ✅ entregada por Backend (CSV completo para Excel es-CO + "Abrir copia de cliente" en solo lectura; 37/37 unitarias, E2E 18/18 verifica que los datos propios quedan intactos). SM resolvió conflicto en piloto-r0.md. Pendiente de QA.
- S2-4 (datos v3 para sync) espera a que S2-1 termine su migración de consentimiento, para no crear dos "v3" en paralelo.
- Sprint 1 CERRADO (review y retro en sprint1-review-retro.md). S2-2 (E2E Playwright + CI en GitHub) ✅. S2-3 ✅ con ajustes.
- CI falló en GitHub: el visor de copia de cliente desbordaba 13 px a 390 px con las fuentes de Linux (fallo real en móviles con letra grande). SM lo corrigió (tabla con scroll propio); CI ✅ verde en 674aa83.
- S2-1 (pantalla legal) implementada por Frontend; al integrarla hubo 6 conflictos → devuelta al autor para resolver (acción de la retro).
- S2-1 (pantalla legal) integrada: 47/47 unitarias, 48 E2E Playwright, 8 suites QA en verde. QA revisándola.
- S2-4 (datos v4 para sync: UUID, updatedAt, borrado lógico) en curso con Backend.
- ⏸ ~04:35–09:30 UTC: los agentes se detuvieron por el límite de uso de la cuenta. Reanudados al restablecerse; sin trabajo perdido.
- S2-1 ✅ (D1, D3 cerrados; D2 = rellenar datos del responsable, del Stakeholder). S2-4 ✅ (D1 fotos duplicadas en 2 pestañas, D2 fusión, reloj adelantado, copias acotadas).
- Textos legales reescritos para la FASE PILOTO (sin servidor); Supabase pasa a "cambios previstos R1".
- **Sprint 2 CERRADO.** 61 unitarias · 79 E2E · 8 suites QA en verde. Ver sprint2-review-retro.md → "Para arrancar el piloto".
