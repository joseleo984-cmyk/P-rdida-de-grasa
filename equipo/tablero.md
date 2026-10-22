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

## ⏸ PAUSA (decisión del Stakeholder 2026-10-21): ahorrar consumo
Se pausa el equipo hasta que exista el proyecto Supabase (guía: `guia-supabase-stakeholder.md`).
**Reglas al retomar:**
1. Un solo agente a la vez para sincronización/seguridad; Frontend y QA de rutina con modelo más barato (Sonnet). Modelo potente solo para BD/RLS y sync.
2. QA revisa por lotes (una vez por bloque de historias), no por historia; la seguridad de BD sigue con revisión propia.
3. No reanudar agentes con contexto enorme: lanzar agentes nuevos con un resumen corto del handoff.
**Estado exacto para retomar:**
- Rama del sprint al día y publicada hasta `0ee762e` (S3-0, S3-1 + correcciones de seguridad, S3-2, S3-3 `sync.js`). 92 unitarias, 205 comprobaciones BD (modo estricto), 93 E2E, CI verde incluido job `db`.
- Pendiente de QA: re-verificación de las correcciones de seguridad de S3-1 y revisión de S3-3 (`sync.js`).
- Pendiente del Frontend (worktree `agent-af1625ac0d1874b1b`, sin commitear): S3-4 panel del coach + correcciones de S3-2 (textHash, fake solo en localhost, dueño de los datos por userId).
- Pendiente del Backend: S3-3b (`remote.js` real con supabase-js vendorizado + integrar sync en la app).
- Pendiente del Arquitecto: revisar contrato §11 (v1.2).
- Del Stakeholder: crear cuenta y proyectos `plataforma` y `pruebas` en Supabase, pasar URL y clave `sb_publishable_`; textos legales (fecha de vigencia, dónde guarda archivos, abogado).

> 📋 **Lista maestra antes de abrir la app a coaches y clientes: [`checklist-antes-de-abrir.md`](checklist-antes-de-abrir.md)**

## ▶ Reanudado con reglas de ahorro (2026-10-21 noche)
Un agente a la vez; Frontend y QA de rutina con Sonnet; modelo potente solo para BD/RLS y sync.
**Estado:** rama del sprint con S3-0…S3-4 integrados (S3-1 BD + seguridad, S3-2 cuenta, S3-3 sync, S3-3b remote.js real, S3-4 panel del coach). 120 unitarias, 209 comprobaciones BD (estricto), 102 E2E.
**Proyectos Supabase creados por el Stakeholder:** `pruebas` (con `supabase/r1.sql` aplicado: OK r1 v1; esquemas core y grasa expuestos; 3 de 4 comprobaciones verificadas) y `Plataforma` (sin SQL todavía). Claves publishable NO commiteadas (config.js vacío).
**Pendiente QA (un solo lote):** S3-1 my_link + re-verificación; S3-3/3b sync y remote.js; S3-2 correcciones; S3-4 panel del coach.
**Pendiente Stakeholder:** habilitar `*.supabase.co` en la red del entorno (para `npm run smoke:remote`), activar OTP por correo + Brevo (guía §7), textos legales (fecha de vigencia, dónde guarda archivos, abogado).

## Sprint 4 — Inicio del cliente y panel del coach (2026-10-22, alcance cerrado por el Stakeholder: solo apariencia)
| Historia | Estado |
|---|---|
| S4-1 Inicio con tarjetas (Hoy llevas, repetir el desayuno de ayer, Tu peso, saludo) | ✅ Dev + pruebas propias, pendiente de QA y revisión del Stakeholder |
| S4-2 Panel del coach "Mis clientes" (estado Al día / Se atrasa / Sin registrar) | ✅ Dev + pruebas propias, pendiente de QA y revisión del Stakeholder |

Detalle, umbrales y riesgos: `handoffs/2026-10-22-sprint4-inicio-panel.md`. Pruebas: 152 unitarias, 145 E2E, 8 suites de QA, build del sitio sin claves.

## Sprint 3 — EN CURSO: R1 "Cuentas y panel del coach" (decisión del Stakeholder 2026-10-21: opción B)
**Objetivo:** "El cliente registra en la app y el coach ve su progreso en su panel, sin enviar archivos."
Motivo: el Stakeholder considera que enviar datos por WhatsApp no da confianza → se adelanta R1 al piloto.

| Listo | En curso | En revisión | Hecho |
|---|---|---|---|
| | | S3-2 Cuenta con código de 6 dígitos + remote-fake — pendiente QA | S3-0 Contrato R1 + guía Supabase ✅ |
| | | S3-3 sync.js (19 pruebas) + S3-1 correcciones de seguridad (205 comprobaciones) — QA · S3-3b remote.js real + sync en la app (handoff S3-3b; falta smoke contra el proyecto real) — QA | |
| | S3-4 Panel del coach: lista con semáforo, ficha, comentarios — Dev Frontend | | |
| S3-5 Textos legales versión con cuentas + registro de consentimientos HU-P10 (Analista + Back) | | | |

Bloqueos externos: proyecto Supabase (lo crea el Stakeholder con la guía de S3-0).

## Sprint 2 — ✅ CERRADO (ver sprint2-review-retro.md)
**Objetivo:** "Dejar la app lista para arrancar el piloto con 2 coaches."

| Listo | En curso | En revisión | Hecho |
|---|---|---|---|
| | | | S2-1 LEGAL-01 ✅ (D1, D3, obs. cerrados) · ✅ QA con condiciones (D2: rellenar datos del responsable + abogado) |
| | | | S2-2 QA-01 E2E Playwright + CI ✅ |
| | | | S2-3 Kit piloto ✅ QA (+ ajustes D1/O1/O2/O4) |
| | | | S2-4 DATOS-v4 ✅ QA |

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

## Sprint 5 — Mostrar QR en Invitar (Dev Frontend) ✅ listo para revisión de QA
Alcance cerrado por el Stakeholder: solo el botón "Mostrar QR" en Invitar del coach, con hoja de QR grande + código de respaldo.
- Generador QR propio `qr.js` (modo byte, versión 1-10, nivel M/L, mejor máscara), sin dependencias ni servicios externos; el enlace no sale del dispositivo.
- Validado con jsQR (solo devDependency de pruebas) + vectores de la norma; E2E con letra ancha a 390 px; caché v27.
- Handoff: `equipo/handoffs/2026-10-22-sprint5-qr.md`. Pendiente: probar con la cámara de un iPhone y un Android reales.

## Sprint 7 — El servidor impone los consentimientos (Dev Full-stack) ✅ listo para revisión de QA
Origen: tras el Sprint 6 el acuerdo del coach (A7) y A3 + A4 solo se exigían en la app. Contexto: piloto CERRADO (2 coaches, ~10 adultos) sobre `plataforma`, que sigue **sin conectarse** (`config.js` vacío) hasta que el abogado apruebe los textos.

| Listo | En curso | En revisión | Hecho |
|---|---|---|---|
| | | | S7-1 BD r1 v1.5 (migración `20261023120000`): funciones de coach y código de invitación exigen `coach_agreement` vigente; `sync_push`, `sync_pull` y `join_coach` exigen `sensitive_health` + `cloud_transfer`. Errores `42501` (`forbidden` / `consent_required`). Pruebas SQL nuevas `90_consentimientos_servidor` |
| | | | S7-2 App: `consent_required` = «falta aceptar» (sin error técnico, modo local intacto), `agreement_required`, servidor falso con las mismas reglas, E2E nueva `s7-servidor-consentimientos`, caché v29 |
| | | | S7-3 `scripts/check-conexion.js` (`npm run check:conexion`, sin red, 11 pruebas; fuera del CI obligatorio) + `equipo/handoffs/conectar-plataforma.md` (procedimiento y reversa) |
| | | | S7-4 `equipo/legal/plan-incidentes.md` y `equipo/prueba-iphone.md` |
| ⏸ | | | `equipo/piloto-r0.md`: **fuera de alcance por decisión del Stakeholder** (sigue con el modelo antiguo) |

Handoff: `equipo/handoffs/2026-10-23-sprint7.md`.

## Sprint 6 — Autorizaciones A1–A8 y bloqueos legales (Dev Full-stack) ✅ listo para revisión de QA
Alcance cerrado por el Stakeholder el 2026-10-22 (decisiones #15 a #21 en `decisiones-negocio.md`). La app oficial **no se conecta a `plataforma`** (`config.js` vacío); lo nuevo solo existe con servidor configurado, salvo la edad mínima.

| Listo | En curso | En revisión | Hecho |
|---|---|---|---|
| | | | S6-1 BD r1 v1.4: tipos `cloud_transfer`, `photo_view_coach`, `coach_agreement`; compartir apagado por defecto; `core.consent_archive` seudonimizado + `delete_my_account` que archiva (28 pruebas SQL nuevas, estricto en verde) |
| | | | S6-2 Edad mínima 18 (perfil, formulario, datos de menores no se borran en silencio) |
| | | | S6-3 `consent-texts.js` con A1–A8 versionados + A1/A2 al crear cuenta, A3/A4 al activar la copia (sin A3+A4 no se sincroniza), A5 por categoría (`compartir-2`, comidas y hábitos apagados, migración de vínculos), A6a/A6b (solo registran; **fotos a la nube siguen apagadas**), A7 (bloquea Clientes e Invitar del coach), A8 |
| | | | S6-4 Pruebas: unitarias, E2E con letra ancha a 390 px (`s6-consentimientos.spec.js`), caché v28 |

Pendiente del abogado (no es código): aprobar los textos y el Acuerdo del coach, fijar plazos, y **antes de conectar `plataforma` regenerar `legal/*.html` desde los textos v1.0 y subir `LEGAL_VERSIONS`**. Pendiente del Stakeholder: volver a pegar `supabase/r1.sql` en `pruebas` y `plataforma`.
Handoff: `equipo/handoffs/2026-10-22-sprint6-consentimientos.md`.
