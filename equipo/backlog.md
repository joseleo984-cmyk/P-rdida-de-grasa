# Backlog de producto — "Pérdida de Grasa"

> Autor: Agente Analista de Producto · Sprint 0 (diagnóstico) · 2026-10-21
> Fuentes revisadas: `README.md`, `index.html`, `app.js`, `calc.js`, `photos.js`, `sw.js`.

---

## 1. Lo que la app ya hace

- **Perfil y plan**: BMR (Mifflin-St Jeor), mantenimiento, déficit por ritmo (0,25–1 %/sem), kcal y macros con mínimo de seguridad (1500/1200 kcal).
- **Registro corporal**: peso, cintura, cuello, cadera y nota por fecha (un registro por día; se fusiona si ya existe); solo se puede borrar, no editar desde la tabla.
- **% de grasa**: estimación US Navy o valor manual, y masa magra derivada.
- **Panel**: peso actual, kilos perdidos, % grasa, ritmo semanal (regresión 21 días), progreso y ETA a la meta.
- **Gráfico**: evolución del peso con media móvil de 7 días (30 d / 90 d / todo).
- **Diario de comidas**: kcal y macros por comida (4 tipos), barras frente al objetivo; autocompleta alimentos usados (con los macros de la última porción registrada, sin escalar por gramos).
- **Hábitos**: pasos, agua, sueño y entrenamiento de fuerza por día.
- **Fotos de progreso**: frente/perfil/espalda comprimidas en IndexedDB, galería con peso del día y comparador antes/después.
- **Recomendaciones**: reglas sobre estancamiento, pérdida rápida, proteína baja, sueño, fuerza, frecuencia de pesaje y cintura.
- **Datos**: exportar/importar JSON (incluye fotos), exportar CSV, borrar todo.
- **PWA offline**: service worker "red primero, caché de respaldo", instalable; publicación en GitHub Pages con tests de `calc.js`.

## 2. Usuario objetivo y problema

**Persona principal — "Andrea, 34, recomposición por su cuenta"**
Trabaja en oficina, entrena fuerza 2–3 veces por semana, usa el móvil para todo. Quiere perder 6–10 kg de grasa sin perder músculo, sin pagar suscripción y sin entregar sus datos (ni fotos corporales) a una empresa. Se desmotiva cuando la báscula sube un día suelto y abandona si registrar comida le cuesta más de un minuto.

**Persona secundaria — "Carlos, 45, principiante con sobrepeso"**
Necesita que le digan cuántas calorías comer y si va bien; no sabe interpretar datos.

**Problema principal que resuelve**: convertir datos diarios ruidosos (peso, comida, hábitos) en una señal clara de *"¿voy bien y qué ajusto?"*, de forma privada y sin conexión.

**Riesgos de producto detectados en el diagnóstico**
1. **Pérdida de datos**: todo vive en `localStorage`/IndexedDB de un solo navegador. Safari/iOS puede borrar el almacenamiento de sitios no usados; no se pide almacenamiento persistente ni se recuerda hacer copia de seguridad.
2. **Fricción de registro de comidas**: cada alimento se teclea a mano y no hay "repetir ayer", ni edición, ni escalado por cantidad. Es la causa número 1 de abandono en este tipo de apps.
3. **El plan no aprende**: las kcal objetivo salen solo de fórmulas; la app ya tiene ingesta y tendencia de peso para estimar el gasto real, pero no lo hace.

---

## 3. Backlog priorizado

Criterio Lean: **valor / esfuerzo**, atacar primero lo que evita abandono o pérdida de datos. Todo es *client-side* salvo lo marcado explícitamente.

| Prio | ID | Historia | Tamaño | Valor |
|---|---|---|---|---|
| 1 | HU-01 | Proteger los datos (persistencia + recordatorio de copia) | S | Alto |
| 2 | HU-02 | Repetir comidas de otro día | S | Alto |
| 3 | HU-03 | Editar registros y alimentos existentes | S | Alto |
| 4 | HU-04 | Porciones escalables en la biblioteca de alimentos | M | Alto |
| 5 | HU-05 | Gasto real estimado (TDEE adaptativo) y sugerencia de ajuste | M | Alto |
| 6 | HU-06 | Resumen semanal en el panel | S | Medio |
| 7 | HU-07 | Gráfico de cintura y % de grasa | S | Medio |
| 8 | HU-08 | Aviso de nueva versión de la app | S | Medio |
| 9 | HU-09 | Gestionar la biblioteca de alimentos | S | Bajo |
| 10 | HU-10 | Sincronización entre dispositivos / cuenta | L | Medio |

### HU-01 · Proteger mis datos — S · Alto
**Como** usuaria que lleva meses registrando, **quiero** que la app proteja mis datos y me recuerde hacer copia, **para** no perder mi historial ni mis fotos si el navegador limpia el almacenamiento o cambio de móvil.
- Al iniciar, la app solicita `navigator.storage.persist()` y en Perfil → Datos muestra si el almacenamiento es persistente y el espacio usado (`storage.estimate()`).
- Se guarda la fecha del último "Exportar JSON"; si han pasado más de 14 días (o nunca) y hay ≥ 7 registros, el panel muestra un aviso con botón "Hacer copia ahora".
- El aviso se puede posponer 7 días y desaparece tras exportar.
- Si `save()` falla por cuota, el mensaje explica la causa y sugiere exportar.

### HU-02 · Repetir comidas — S · Alto
**Como** persona que come casi lo mismo entre semana, **quiero** copiar las comidas de ayer (o de un día elegido) al día actual, **para** registrar mi día en segundos.
- En el diario hay "Copiar de ayer" y, por cada bloque de comida (Desayuno, Almuerzo…), "Repetir este bloque".
- Los elementos copiados reciben `id` nuevo y se suman a los existentes, sin sustituirlos.
- Un toast indica cuántos alimentos se copiaron; si el día origen está vacío, se avisa y no se hace nada.

### HU-03 · Editar registros y alimentos — S · Alto
**Como** usuario que se equivoca al teclear, **quiero** editar un registro corporal o un alimento ya guardado, **para** corregirlo sin borrar y volver a crear.
- Tocar una fila del historial corporal carga sus valores en el formulario con la fecha bloqueada; al guardar se actualiza (no se duplica).
- Tocar un alimento permite cambiar nombre, comida, kcal y macros; los totales y las barras se recalculan al instante.
- Hay forma de **vaciar** un campo opcional (hoy la fusión ignora los campos vacíos, así que no se pueden quitar).

### HU-04 · Porciones escalables — M · Alto
**Como** usuaria que pesa su comida, **quiero** guardar un alimento "por 100 g" y luego indicar solo los gramos, **para** no recalcular macros a mano cada vez.
- El formulario permite elegir "por porción" (comportamiento actual) o "por 100 g" + campo cantidad (g).
- Al elegir de la biblioteca un alimento "por 100 g", basta escribir los gramos: kcal y macros se calculan (redondeo a 1 decimal) y se muestran antes de guardar.
- Los datos antiguos siguen funcionando como "por porción" (sin migración destructiva) y la exportación/importación JSON los conserva.
- La función de escalado está en `calc.js` con tests.

### HU-05 · Gasto real estimado (TDEE adaptativo) — M · Alto
**Como** persona estancada, **quiero** que la app estime mi gasto real a partir de lo que como y de cómo cambia mi peso, **para** ajustar mis calorías con datos y no a ciegas.
- Con ≥ 14 días que tengan comida registrada y ≥ 6 pesajes en los últimos 21–28 días, se calcula `TDEE_real ≈ ingesta_media − (pendiente_kg/día × 7700)` en `calc.js`, con tests.
- La tarjeta del plan muestra "Estimado por fórmula" frente a "Estimado con tus datos" y la diferencia.
- Si la diferencia es > 150 kcal, se sugiere un nuevo objetivo (respetando el mínimo de seguridad); el usuario lo **acepta** explícitamente y nunca se aplica solo.
- Con datos insuficientes se indica cuántos días faltan, en lugar de mostrar un número poco fiable.

### HU-06 · Resumen semanal — S · Medio
**Como** usuario que se agobia con las fluctuaciones diarias, **quiero** ver un resumen de la semana, **para** juzgar mi progreso por la tendencia y no por un día suelto.
- Tarjeta en el panel con: cambio de la media de 7 días frente a la semana anterior, kcal y proteína medias, días entrenados, pasos medios y días con registro.
- La semana va de lunes a domingo y los días sin datos no cuentan en las medias.
- Las agregaciones son funciones puras en `calc.js` con tests.

### HU-07 · Gráfico de cintura y % de grasa — S · Medio
**Como** persona que hace fuerza, **quiero** ver la evolución de la cintura y del % de grasa, **para** notar progreso aunque la báscula no se mueva (recomposición).
- El selector del gráfico permite cambiar entre Peso, Cintura y % de grasa, reutilizando el canvas actual.
- Con menos de 2 puntos de esa métrica se muestra un mensaje en vez de un gráfico vacío.

### HU-08 · Aviso de nueva versión — S · Medio
**Como** usuario con la app instalada, **quiero** saber cuándo hay una versión nueva y aplicarla con un toque, **para** recibir mejoras sin desinstalar ni borrar caché.
- Cuando el service worker detecta una nueva versión, se muestra "Nueva versión disponible · Actualizar".
- Al pulsar se recarga con la versión nueva y **sin perder datos**.
- La versión de caché (`CACHE`) se incrementa en cada release; el proceso queda documentado para el equipo.

### HU-09 · Gestionar la biblioteca de alimentos — S · Bajo
**Como** usuario frecuente, **quiero** ver, editar y borrar los alimentos guardados para autocompletar, **para** que las sugerencias no se llenen de errores tipográficos.
- Lista de la biblioteca (Perfil → Datos o Comidas) con búsqueda, edición de macros y borrado.
- Borrar de la biblioteca no afecta a los registros históricos.

### HU-10 · Sincronización entre dispositivos — L · Medio (fuera del alcance actual)
**Como** usuaria con móvil y portátil, **quiero** tener mis datos en ambos, **para** registrar desde donde esté.
- **Requiere backend** (cuentas, API, almacenamiento de fotos, cifrado, RGPD/ley de datos), lo que hoy **no existe** y va contra el valor "privado y sin servidor". Por eso es **L**.
- Alternativa Lean sin servidor ya cubierta en parte: exportar/importar JSON. Una evolución posible sin backend sería compartir el archivo con la Web Share API (a evaluar por @Arquitecto).
- Solo entra al backlog activo si el stakeholder confirma que la multi-dispositivo es un motivo real de abandono.

**Descartado a propósito (no "por si acaso")**: base de datos nutricional online o escáner de códigos de barras (requieren API externa o servidor, y añaden coste y dependencia), notificaciones push (necesitan servidor push), gamificación, social o retos.

---

## 4. Propuesta de objetivo del Sprint 1

> **"Que nadie pierda sus datos ni abandone por la fricción de registrar comida."**

Historias comprometidas (las tres son S, sin backend y con riesgo técnico bajo):
1. **HU-01** Proteger mis datos
2. **HU-02** Repetir comidas
3. **HU-03** Editar registros y alimentos

Métrica de éxito (local, sin analítica): el registro de un día habitual de comidas pasa de unos 4–6 formularios a 1–2 toques, y ningún usuario de prueba puede llegar a 30 días sin haber visto el aviso de copia.
Siguiente candidata: **HU-04 + HU-05** (Sprint 2: "plan que aprende").

---

## 5. Preguntas para el Stakeholder (humano)

1. ¿Los usuarios reales usan la app en **iPhone/Safari**? Si es así, HU-01 es crítica (iOS borra con más facilidad el almacenamiento de webs no instaladas o poco usadas).
2. ¿El valor "100 % privado, sin servidor" es **innegociable**? La respuesta decide si HU-10 se descarta del todo o se plantea a futuro.
3. ¿Qué causa hoy más abandono: **registrar comida** (HU-02/03/04) o **no ver progreso** (HU-05/06/07)? Con eso confirmamos el orden de los sprints 1 y 2.

## 6. Preguntas para otros agentes

- **@Arquitecto**: `state` se guarda entero en `localStorage` con `JSON.stringify` en cada cambio. ¿Hace falta un campo `schemaVersion` y una función de migración **antes** de HU-03/HU-04, que cambian la forma de los datos? ¿Movemos comidas y registros a IndexedDB ya, o lo dejamos hasta que la cuota sea un problema real?
- **@Arquitecto**: para HU-08, ¿mantenemos "red primero" en el service worker y añadimos detección de `updatefound`, o cambiamos a una estrategia *stale-while-revalidate* con versión explícita?
- **@QA**: hoy solo `calc.js` tiene tests (Node). ¿Qué estrategia mínima propones para cubrir la lógica de `app.js` (fusión de registros, copiar comidas, importación JSON con datos antiguos) sin añadir dependencias? ¿Extraemos esa lógica a módulos puros?
- **@QA**: ¿puedes definir un caso de regresión para "importar un respaldo antiguo (sin `photos`, sin porciones) tras HU-04" que no rompa el panel?

---

## 7. Legal y consentimiento (añadido 2026-10-21)

> Origen: decisiones del Stakeholder #8–#10 (`decisiones-negocio.md`): todos aceptan los T&C y la Política; el responsable es persona natural; servidor en Supabase (EE. UU.). Textos en borrador: `equipo/legal/terminos-y-condiciones.md` y `equipo/legal/politica-tratamiento-datos.md` (**deben revisarse con un abogado antes de usar datos reales**). Épica E6 de `vision-plataforma.md`.

| Prio | ID | Historia | Tamaño | Valor |
|---|---|---|---|---|
| Antes del piloto | LEGAL-01 | Aceptar T&C y Política (app actual, sin servidor) | S | Alto (bloquea el piloto) |
| R1 | HU-P10 | Registro de consentimiento en el servidor | M | Alto (bloquea R1) |

### LEGAL-01 · Aceptar T&C y Política en la app actual (piloto) — S · Alto
**Como** usuario/a del piloto, **quiero** leer y aceptar los Términos y la Política de Datos, y autorizar aparte mis datos sensibles y mis fotos, **para** saber qué se hace con mi información y decidir qué permito.
- **Primer uso:** antes de mostrar cualquier vista (ni perfil ni registro), aparece una pantalla de consentimiento a pantalla completa. Usuarios que ya tienen datos también la ven al actualizar y no pueden seguir registrando hasta aceptar; sus datos no se borran.
- **Casillas separadas, ninguna marcada por defecto:**
  1. "Acepto los **Términos y Condiciones**" (obligatoria).
  2. "Acepto la **Política de Tratamiento de Datos**" (obligatoria).
  3. "Autorizo de forma expresa el tratamiento de mis **datos sensibles de salud** (peso, medidas, % de grasa, comidas, hábitos). Sé que es facultativo." (Si no se marca, la app explica qué funciones quedan limitadas; el texto lo valida el abogado.)
  4. "Autorizo el tratamiento de mis **fotos de progreso**" (opcional y aparte; si no se marca, la pestaña Fotos queda bloqueada con una explicación y un botón para autorizar).
  5. "Declaro que soy **mayor de 18 años**" (obligatoria).
- **Enlaces** a los textos completos desde cada casilla. Se abren dentro de la app (sin perder lo marcado) y funcionan **sin conexión** (en caché del service worker).
- El botón "Continuar" solo se activa con las casillas obligatorias marcadas.
- **Se guarda** en el estado local: `consent = { termsVersion, privacyVersion, sensitiveHealth: bool, photos: bool, adult: true, acceptedAt (ISO), updatedAt }`. Se incluye en el **Exportar JSON** (prueba para el piloto) y en `schemaVersion` con su migración.
- **Re-aceptación:** las versiones vigentes están en una constante (p. ej. `LEGAL_VERSIONS`). Si `termsVersion` o `privacyVersion` guardadas son distintas de las vigentes, se vuelve a mostrar la pantalla con un aviso "Actualizamos…" y un resumen de los cambios.
- **Retirar la autorización:** en Perfil → Privacidad se ven el estado y la fecha de cada autorización, y se pueden desmarcar las de datos sensibles y fotos. Al retirar la de fotos se ofrece **borrar las fotos** del dispositivo. Retirar la Política o los T&C lleva a "Borrar todo" con confirmación (la app no puede usarse sin ellos).
- Accesible (etiquetas, foco, lectura por VoiceOver en iPhone) y probado en Safari iOS (Playwright con WebKit).
- **Fuera de alcance:** guardar el consentimiento en un servidor (llega con HU-P10).

### HU-P10 · Registro de consentimiento en el servidor (no modificable) — M · Alto
**Como** responsable del tratamiento, **quiero** que cada aceptación o retiro de autorización quede registrado en el servidor de forma que nadie pueda modificarlo, **para** poder probar ante el titular o la SIC qué autorizó cada persona, cuándo y sobre qué versión.
- Tabla `consent_events` de **solo inserción**: `user_id`, `tipo` (terms / privacy / sensitive_health / photos / adult / coach_share), `accion` (granted / revoked), `version_documento`, `hash_texto` (SHA-256 del texto aceptado), `fecha_servidor`, `app_version`, `dispositivo` (user-agent resumido). Las políticas de seguridad de Supabase (RLS) **no permiten UPDATE ni DELETE** a ningún rol de la app; el titular solo puede leer sus propios eventos.
- El estado vigente de cada autorización se calcula a partir del último evento por tipo; el panel del coach y el acceso a fotos (HU-P05/P06/P09) **lo consultan en el servidor** antes de mostrar datos.
- Al crear la cuenta (HU-P01/HU-P03) se exige el mismo flujo de casillas que en LEGAL-01. Los consentimientos locales del piloto se suben como eventos con su fecha original y la marca `origen = local`.
- Cambio de versión de T&C o Política → en el siguiente inicio de sesión se pide re-aceptar y se inserta un nuevo evento. Sin re-aceptación no se sincronizan datos nuevos.
- Retirar una autorización tiene efecto inmediato (el coach deja de ver los datos o fotos en la siguiente petición) y queda como evento `revoked`.
- El titular puede **descargar su historial de consentimientos** (prueba de autorización, art. 8.b Ley 1581).
- Si la cuenta se elimina, los datos se borran, pero se conserva un registro mínimo del consentimiento y del borrado (seudonimizado) por el plazo que indique el abogado.
- Pruebas: un usuario no puede modificar ni borrar eventos (ni los suyos ni los de otros); un coach no puede leer eventos de clientes no vinculados.
