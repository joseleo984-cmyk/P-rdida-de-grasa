DE: QA / Revisor → PARA: Dev Backend (cc: Scrum Master, Arquitecto, Dev Frontend)
HISTORIA: S2-4 · Esquema v4 preparado para sincronizar (merge `2e9fcfb`, CACHE v15) + verificación rápida de S2-1 D3
FECHA: 2026-10-21 · Entorno: `@playwright/test` 1.56.1, Chromium 1194, 390x844, `E2E_PORT=4700` (sin reutilizar servidores ajenos)

## S2-1 · D3 y re-aceptación: ✅ CERRADO → S2-1 queda **HECHA**, salvo D2 (Stakeholder/abogado)
- Importar con fotos no autorizadas: IndexedDB queda con 0 fotos (`s2-1-qa.spec.js`, ya sin `test.fail`), y el
  `confirm` lo avisa.
- Al re-aceptar, las 5 casillas vuelven sin marcar y aparece la nota de lo autorizado antes (`s2-1.spec.js:118`).
- D2 sigue como `test.fail` (marcadores legales pendientes).

## S2-4 · VEREDICTO: **APROBADO CON CONDICIONES**
**Sin pérdida de datos** en todo lo probado:
- migración v1/v2/v3 → v4, al cargar y al importar;
- fallo de IndexedDB a mitad de la migración de fotos;
- cuota llena durante la migración;
- lápidas que no reaparecen en la UI, el CSV, la exportación ni el visor;
- ida y vuelta con `updatedAt` y lápidas, sin adoptar un consentimiento ajeno;
- el bloqueo de salud sigue funcionando.

Condición para cerrar: **D1**, fotos duplicadas si la migración se ejecuta dos veces a la vez. **D2** solo afecta a
`mergeRecords`, que hoy no se usa; debe corregirse antes de R1.

## Pruebas
| Suite | Resultado |
|---|---|
| `npm test` | 59/59 OK (11 en `tests/sync.test.js`) |
| `npm run test:e2e` | **78 passed**. Hay 3 `test.fail` esperados: S2-1 D2, S2-4 D1 y S2-4 D2 |
| `tests/e2e/s2-4.spec.js` (Backend) | 5/5 |
| **`tests/e2e/s2-4-qa.spec.js` (nuevo, QA)** | 11 casos: 9 en verde y 2 `test.fail` (D1, D2) |

`s2-4-qa.spec.js` cubre:
1. Migración desde localStorage de **v1, v2 y v3**: el contenido es idéntico sin contar `id`/`updatedAt`, todo pasa
   a UUID y se guarda `:backup-v<N>` igual al crudo.
2. **Fallo de IndexedDB** en el 2.º `put` de `migrateIds`: la transacción se revierte, se conservan las 3 fotos con
   sus ids antiguos y en la siguiente carga migran a UUID. La galería sigue igual.
3. **Cuota llena** durante la migración al cargar: el dato crudo queda intacto y la app se puede usar. Al liberar
   espacio y guardar, se escribe la v4 **sin lápidas falsas** de lo migrado.
4. **Lo borrado no reaparece** en la tabla (tampoco tras recargar), el CSV, el JSON exportado (solo está en
   `deleted`) ni el visor de copia. Al reimportar el propio respaldo se conservan las lápidas y los `updatedAt` tal
   cual y el consentimiento del dispositivo.
5. **Crecimiento**: 30 ciclos de «Copiar de ayer» (10 alimentos) + «Deshacer» → **300 lápidas** y unos 30-60 KB más
   en localStorage.
6. **Salud**: sin autorización de salud, cambiar solo el consentimiento (autorizar fotos) se guarda, y borrar un
   registro no (no genera lápida).
7. **LWW** (función pura): con 3 réplicas los empates son conmutativos y asociativos. El mismo instante en
   `.000Z`, `Z` o `-05:00` cuenta como empate. Una lápida más nueva gana y una edición posterior revive el registro.
   Un `updatedAt` inválido cuenta como EPOCH. Con clave natural queda un solo registro con el id remoto.

## Defectos
**D1 · Medio · La migración de fotos a UUID duplica las fotos si se ejecuta dos veces a la vez**
- Archivo: `photos.js` `migrateIds`. `todo = (await all())…` se lee **fuera** de la transacción de escritura. Si
  dos ejecuciones se solapan, cada una hace `delete(idViejo)` (que no falla aunque ya no exista) y `put` con **otro**
  UUID.
- Pasos (`s2-4-qa.spec.js:74`): 3 fotos antiguas → `Promise.allSettled([migrateIds(), migrateIds()])` → **6 fotos**.
- Cuándo ocurre: la app abierta en **dos pestañas** al actualizar (PWA + pestaña del navegador), o dos `loadPhotos()`
  seguidos en la misma pestaña. Por ejemplo, aceptar la pantalla legal (`app.js:1160`) mientras corre el
  `loadPhotos()` del arranque, o «Autorizar fotos» (`app.js:1198`) con otra carga en curso.
- Impacto: no se pierde nada, pero la galería y el respaldo salen duplicados, y R1 subiría el doble de fotos.
- Arreglo: leer y migrar **dentro de la misma transacción readwrite**, con `getAll()` en el propio `tx`. Así la
  segunda ejecución ve las fotos ya migradas. Otra opción es un id determinista derivado del antiguo.

**D2 · Bajo hoy / Alto en R1 · `mergeRecords` con clave natural no aplica LWW dentro del mismo lado**
- Archivo: `schema.js` `mergeRecords`, la línea `for (const r of local) out.set(k(r), r)`. Si el lado local trae dos
  registros con la misma fecha (vivo + lápida antigua, o dos pesajes de importaciones antiguas), gana **el último de
  la lista**, no el más reciente.
- Pasos (`s2-4-qa.spec.js:220`): `mergeRecords([vivo 16-oct, lápida vieja 16-oct], [], {key:'date'})` → queda la lápida.
- Hoy no se usa: `stampChanges` filtra las lápidas con fecha viva, así que el estado local no tiene ese caso. Pero
  `toRecords` de un estado importado o una lista del servidor sí pueden tenerlo.
- Arreglo: aplicar `newer()` también al rellenar el lado local, y `purgeDeleted`/`normalize` deberían eliminar
  lápidas cuya fecha tiene un registro vivo.

## Observaciones (no bloquean)
- **O1 · Relojes:** LWW con el reloj del dispositivo. Un móvil con la fecha adelantada (2030) gana **siempre**, y una
  lápida con fecha futura impide recrear el registro en otros dispositivos. Está probado y documentado como
  limitación. Para R1: que el servidor ponga `updated_at` (spike §4.2), o rechazar marcas futuras (más de 5 min por
  delante de la hora del servidor).
- **O2 · Lápidas sin destino:**
  - Hoy no hay servidor, así que **ninguna lápida se sincronizará nunca**: son espacio y metadatos (id + fecha de lo
    borrado) sin uso.
  - «Deshacer» una copia genera una lápida por alimento copiado.
  - El crecimiento medido es razonable (unos 0,1-0,2 KB por lápida), pero no tiene límite.
  - Propuesta: al conectar por primera vez en R1, purgar las lápidas anteriores al primer sync (no hay nada que
    propagar), o no crear lápidas de registros con `updatedAt` posterior al último sync.
- **O3 · Copias de seguridad acumuladas:**
  - Se guardan `:backup` + `:backup-v1` / `-v2` / `-v3` (una por versión de origen), cada una del tamaño del estado.
  - En un dispositivo que fue pasando por varias versiones son hasta 4 copias. Están en localStorage (unos 5 MB por
    origen, aparte de IndexedDB).
  - Además, el aviso de cuota («borra fotos antiguas») no libera localStorage.
  - Propuesta: conservar solo la copia de la versión más antigua y la última, o borrar `:backup-v<N>` tras N días o
    tras una exportación confirmada («Sí, se guardó»).
- **O4 · Migración con avisos:** al cargar datos con elementos inválidos, la versión normalizada (sin ellos) ahora se
  **guarda enseguida** al migrar, cuando antes se guardaba en el siguiente `save()`. Los originales siguen en
  `:backup` / `:backup-v<N>`, así que es aceptable.
- **O5 · Desempate por JSON (pregunta al Arquitecto):** sirve hasta R1: es determinista, conmutativo y asociativo
  (probado). Con `deviceId` el resultado sería explicable para el usuario; el JSON mayor es arbitrario pero estable.
- **Ajustes de las suites `qa-s1-1.js` / `run-s1-3.js`** (pregunta del Dev): revisados ✅. Solo cambian la forma de
  comparar (sin `id`/`updatedAt`, exigiendo UUID; fotos emparejadas por `createdAt`). No relajan lo que se exige.
- **Entorno:** de acuerdo con el aviso de puertos. En local usar `E2E_PORT` distinto por worktree. Propongo
  `reuseExistingServer: false` en `tests/e2e/playwright.config.js`: cuesta unos 0,3 s y evita resultados falsos. Lo
  cambio si el SM lo aprueba.
