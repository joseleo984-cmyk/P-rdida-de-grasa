# Visión de plataforma — "Pérdida de Grasa" para coaches

> Autor: Agente Analista de Producto · 2026-10-21
> Origen: nueva visión del Stakeholder: *"Servidor para las 4 cosas (varios dispositivos, copia en la nube, coach que ve el progreso de sus clientes, otras), sobre todo C. La idea es regalársela a los coach y que ellos se las vendan a sus usuarios, ahí es donde ganaría yo. Que también se puedan hacer retos y se haga comunidad adentro."*
> Hechos confirmados: la mayoría de usuarios usa **iPhone/Safari**; **habrá servidor** (ver `tablero.md`, decisiones del 2026-10-21).
> **Supuestos (sin confirmar)**: el Stakeholder y el primer mercado están en **Colombia** (pesos colombianos, WhatsApp como canal principal, Ley 1581 de 2012 de protección de datos). Todo lo que depende de este supuesto lleva la marca **[SUP-CO]**.

---

## 0. Cambio de rumbo en una frase

Pasamos de *"app privada para una persona"* a una **plataforma B2B2C**: el **coach** es el cliente que adopta la herramienta y el **cliente final** es quien registra datos. El producto que se vende ya no es la calculadora: es **"el coach ve, sin perseguir a nadie por WhatsApp, cómo va cada cliente"**. La app actual pasa a ser la **app del cliente**, y es nuestra mayor ventaja: ya existe y funciona offline.

---

## 1. Lean Canvas

| Bloque | Contenido |
|---|---|
| **Problema** | **Coach:** (1) el seguimiento de clientes está disperso entre WhatsApp, fotos en la galería, Excel/Google Sheets y notas; consume 1–2 h diarias. (2) No ve a tiempo quién se está desconectando y pierde clientes ("churn" silencioso). (3) Le cuesta demostrar resultados para renovar o vender planes. **Cliente final:** (1) no sabe si va bien porque la báscula fluctúa; (2) registra en formularios, chats y hojas distintas; (3) se desmotiva solo. |
| **Segmentos de clientes** | **Pagador/adoptante:** coaches independientes de pérdida de grasa/recomposición, nutricionistas y entrenadores personales con 10–60 clientes online o híbridos. **Usuario:** clientes de esos coaches, mayormente en iPhone. **Early adopters:** coaches que ya cobran mensualidad online y hoy usan Google Sheets + WhatsApp (dolor alto, precio ya establecido). |
| **Propuesta de valor única** | *"Tus clientes registran en 30 segundos; tú ves en un panel quién va bien, quién está estancado y quién dejó de registrar, y le dejas un comentario. Gratis para empezar."* |
| **Solución** | (1) Código de invitación del coach → el cliente se vincula desde la PWA. (2) Panel del coach: lista de clientes con semáforo (peso/tendencia, cintura, adherencia, último registro). (3) Comentarios del coach en el progreso del cliente. Después: retos de grupo y comunidad. |
| **Canales** | Venta directa a coaches (Instagram, WhatsApp, gimnasios) por el Stakeholder; boca a boca entre coaches; cada cliente invitado ve "Coach: X" (viralidad ligada al coach, no al consumidor). **[SUP-CO]** Comunidades de fitness en Colombia y Latinoamérica. |
| **Flujo de ingresos** | Gratis para el coach hasta N clientes; a partir de ahí, **tarifa fija por cliente activo/mes** cobrada al coach (ver §2). Más adelante: comisión por cobros dentro de la app y marca blanca. |
| **Estructura de costes** | Backend gestionado (base de datos, auth, almacenamiento de fotos): bajo al inicio, crece con las fotos. Pasarela de pago (% por transacción). Tiempo de desarrollo y soporte a coaches. Cumplimiento legal de datos de salud (política de privacidad, consentimiento, posible asesoría). Dominio, correo transaccional. |
| **Métricas clave** | **Norte:** clientes finales *activos* por semana (registran ≥ 3 días/semana). Coaches activos (abren el panel ≥ 2 veces/semana). Clientes por coach. Retención del cliente a 30/60/90 días. % de coaches que pasan del límite gratis. Ingreso mensual recurrente (MRR). |
| **Ventaja injusta** | Hoy, poca: app ya construida, offline y en español, con cálculos sólidos (TDEE, US Navy, tendencia) y relación directa del Stakeholder con coaches **[SUP]**. A construir: datos de adherencia de muchos clientes y red de coaches (efecto de red de comunidad/retos). |

---

## 2. Modelos de ingreso "regalar al coach y ganar cuando él vende"

| Modelo | Cómo funciona | Pros | Contras |
|---|---|---|---|
| **A. Comisión % por venta** | El coach cobra a su cliente **dentro** de la app; nos quedamos 5–15 %. | Alineado 100 % con la frase del Stakeholder ("gano cuando él vende"). Coste cero para el coach. | Requiere pasarela de pago, payouts a coaches, facturación y soporte de cobros **desde el día 1** (E3, XL). El coach puede cobrar por fuera (WhatsApp/transferencia) y esquivar la comisión. **[SUP-CO]** Pagos locales (PSE, Nequi, tarjetas) implican pasarelas como Wompi, Mercado Pago o PayU; verificar disponibilidad de Stripe. |
| **B. Tarifa fija por cliente activo/mes cobrada al coach** | Ej.: los primeros 3–5 clientes gratis, luego un precio bajo por cliente activo/mes. El coach lo repercute en su mensualidad. | Simple de entender y de cobrar (una suscripción por coach). Predecible. No exige cobrar a los clientes finales. Se puede cobrar **fuera de la app** al principio (transferencia/link de pago). | El coach siente "pago yo" en vez de "gano yo". Hay que definir "activo" para que sea justo. |
| **C. Freemium con límite de clientes** | Gratis hasta N clientes; planes por tramos (p. ej. hasta 15, 40, ilimitado). | Muy fácil de comunicar; prueba sin fricción. | Saltos de tramo frenan el crecimiento; muchos coaches pequeños nunca pagan. |
| **D. Marca blanca** | App con logo/colores/dominio del coach por una cuota mayor. | Ticket alto; el coach la "vende como suya" (encaja con "que ellos se la vendan"). | Solo interesa a coaches grandes; más soporte y configuración. Mejor como upsell posterior. |
| **E. Cliente final paga suscripción "premium"** | El cliente paga funciones extra. | Ingreso independiente del coach. | Compite con la mensualidad del coach; desalineado con la visión. Descartado por ahora. |

**Recomendación para validar primero: B + C combinados** (*"gratis hasta 5 clientes, luego tarifa fija por cliente activo/mes"*), **cobrado fuera de la app** (link de pago o transferencia) durante R1–R2.
- Es el único modelo que se puede validar **sin construir cobros** (E3).
- La métrica a validar es simple: *¿cuántos coaches que superan 5 clientes pagan?*
- El modelo **A (comisión)** queda como hipótesis de R2/R3: solo si los coaches piden cobrar a sus clientes dentro de la app. **D (marca blanca)** como upsell cuando haya coaches con > 30 clientes.
- **Nota iPhone:** al ser PWA (no App Store), los cobros no pasan por la comisión de Apple. Si en el futuro hay app nativa en App Store, revisar las reglas de compras dentro de la app (a validar con @Arquitecto).

---

## 3. Personas

### Coach — "Laura, 31, coach online de recomposición" **[SUP-CO]**
- 25 clientes activos, la mayoría mujeres de 25–45 años; cobra una mensualidad por plan de alimentación + rutina + seguimiento. Trabaja sola, sin equipo.
- **Su día a día hoy:**
  - **Mañana:** responde 20–40 chats de WhatsApp: fotos de platos, fotos de la báscula, "¿me puedo comer esto?".
  - **Check-in semanal (domingo/lunes):** pide por WhatsApp peso, medidas y fotos; las copia a mano a un **Google Sheet/Excel** por cliente o a un formulario de Google. Las fotos se quedan en la galería de su móvil, mezcladas con las personales.
  - **Seguimiento:** no sabe quién dejó de registrar hasta que el cliente "desaparece"; persigue a los que no envían el check-in.
  - **Renovación:** arma a mano comparativas antes/después para convencer de renovar.
- **Dolores:** tiempo perdido copiando datos; clientes que se van sin aviso; no escala más allá de ~30 clientes; mezcla de datos de salud y fotos en su móvil personal.
- **Lo que pagaría:** ahorrar horas y retener clientes. **Lo que la frena:** que sus clientes tengan que instalar otra cosa, que sea en inglés, que cueste en dólares, que le quite la relación por WhatsApp.
- **Éxito para ella:** abrir un panel el lunes y en 5 minutos saber a quién escribir.

### Cliente final — "Andrea, 34, cliente de Laura"
- Oficina, fuerza 2–3 veces/semana, **iPhone**. Paga a su coach y quiere resultados sin complicarse.
- Hoy envía fotos y números por WhatsApp y a veces olvida el check-in.
- **Necesita:** registrar en < 1 minuto, ver que va bien aunque la báscula suba un día, sentir que su coach la ve. Le preocupa quién ve sus **fotos corporales**.
- **Éxito para ella:** "mi coach me comentó el progreso sin que yo tuviera que mandarle nada".
- La persona anterior "Carlos, principiante" sigue válida como cliente final que depende aún más del coach.

---

## 4. Hipótesis más riesgosas y experimento más barato (antes de construir)

Ordenadas por **riesgo × impacto** (si es falsa, el plan entero cae).

| # | Hipótesis | Experimento más barato | Criterio de éxito |
|---|---|---|---|
| H1 | **El seguimiento disperso es un dolor top-3 para coaches** y quieren una herramienta para ello. | **Entrevistas a 8–10 coaches** (30 min, guion de descubrimiento: cómo hacen seguimiento hoy, cuánto tiempo, qué herramientas pagan, por qué pierden clientes). Sin enseñar la app hasta el final. | ≥ 6 de 10 describen el dolor espontáneamente y dedican ≥ 3 h/semana a seguimiento. |
| H2 | **Los clientes finales registran en la app** de forma sostenida si su coach se lo pide (vs. seguir mandando todo por WhatsApp). | **Piloto concierge**: 2 coaches × 5 clientes usan la **app actual**; cada cliente envía su **exporte JSON/CSV** semanal (o el equipo lo recoge) y nosotros armamos a mano un resumen por cliente para el coach (Sheet o PDF). 4 semanas. | ≥ 60 % de clientes registran ≥ 3 días/semana en la semana 4. |
| H3 | **Al coach le sirve el resumen** y cambia su forma de trabajar (escribe a quien se estanca). | Mismo piloto: medir si el coach usa el resumen semanal y qué pregunta/pide. | Los 2 coaches lo usan cada semana y piden seguir; al menos 1 dice que le ahorra ≥ 1 h/semana. |
| H4 | **Los coaches pagarán** por cliente activo pasado el tramo gratis (modelo B+C). | **Landing de preventa** + oferta a los coaches entrevistados: "precio fundador" con pago anticipado de 3 meses (link de pago) o carta de intención. | ≥ 3 coaches dejan pago o compromiso firmado. |
| H5 | **Los clientes aceptan compartir peso/medidas/fotos** con su coach a través de un servidor. | Pregunta en el piloto + pantalla de consentimiento en papel/mock; medir cuántos aceptan compartir fotos vs. solo números. | ≥ 80 % comparte números; registrar % que comparte fotos (decide si fotos van en R1). |
| H6 | **Los retos aumentan retención** y atraen clientes nuevos al coach. | **Reto concierge** por WhatsApp de 14 días con 1 coach (ranking manual de adherencia en un Sheet). | Adherencia del grupo en reto ≥ 20 % mayor que sin reto; el coach consigue ≥ 1 cliente nuevo. |
| H7 | **La comunidad dentro de la app** aporta algo que el grupo de WhatsApp del coach no da. | Preguntar en entrevistas y observar el grupo de WhatsApp del piloto. | Si los coaches ya tienen grupo y no ven ventaja, **comunidad se aparca**. |
| H8 **[SUP-CO]** | **Es viable legalmente** guardar datos de salud y fotos de terceros (Ley 1581 de 2012, datos sensibles). | Revisión de 1 h con un abogado o guía oficial de la SIC; borrador de política y consentimiento. | Lista de requisitos mínimos clara antes de R1. |

**Regla Lean:** no se construye E1/E2 hasta tener H1 validada y el piloto (H2/H3) en marcha. El piloto **no requiere servidor**.

---

## 5. Mapa de épicas

| Épica | Valor | Tamaño | Dependencias |
|---|---|---|---|
| **E1 Cuentas y sincronización** | Base de todo: identidad (coach/cliente), datos en la nube, varios dispositivos, copia de seguridad (resuelve también el riesgo de borrado en iOS). | **L** | SPIKE-01 del Arquitecto; S1-1 (esquema versionado) para migrar datos locales; E6 (consentimiento) en el alta. |
| **E2 Panel del coach** (clientes, invitaciones, ver progreso, comentarios) | **El corazón de la propuesta ("sobre todo C")**; lo que el coach adopta. | **L** | E1 (auth, roles, datos en servidor), E6 (qué ve el coach). Reutiliza `calc.js` (tendencia, % grasa). |
| **E3 Cobros/suscripciones** | Monetización dentro de la app (cobro al coach y, si se valida, comisión sobre lo que cobra a sus clientes). | **XL** (si incluye comisión y payouts) / **M** (solo suscripción del coach) | E1, E2; H4 validada; elección de pasarela **[SUP-CO]**; facturación electrónica a revisar. |
| **E4 Retos** | Retención y adquisición: el coach lanza un reto (p. ej. 21 días de pasos/proteína/registro) con ranking. | **M** | E1, E2 (grupo de clientes del coach); H6 validada. |
| **E5 Comunidad** | Pertenencia, motivación entre pares, menos dependencia de WhatsApp. | **L** (feed, moderación, reportes, notificaciones) | E1, E2, E4; E6 (moderación, fotos); notificaciones push en iOS (PWA instalada, iOS ≥ 16.4); H7 validada. |
| **E6 Privacidad y consentimiento** (datos de salud y fotos) | Requisito legal y de confianza; habilita que el cliente comparta. | **M** | Transversal: debe estar listo **antes** de que el primer dato salga del dispositivo (R1). |

---

## 6. MVP de la plataforma (R1)

**Corte mínimo que un coach usaría y por el que pagaría:**
> El coach crea su cuenta, **invita clientes con un código**, ve en un panel **peso, cintura y adherencia** de cada uno con un semáforo, y **deja comentarios**. El cliente usa la app actual, vinculada a su coach, con sus datos sincronizados.

**Dentro:** cuentas (correo con enlace mágico o código), vínculo por código, sincronización de registros corporales + hábitos + resumen de comidas, panel del coach, comentarios, consentimiento.
**Fuera de R1:** cobros dentro de la app (se cobra por fuera), retos, comunidad, chat, fotos en el panel del coach (entran en R1 solo si H5 lo justifica; si no, R1.1), marca blanca, app nativa.

### HU-P01 · Cuenta de coach — S
**Como** coach, **quiero** crear mi cuenta con mi correo, **para** empezar a invitar clientes sin instalar nada.
- Registro con correo (enlace mágico o código de un solo uso), nombre y nombre comercial; sin contraseña obligatoria.
- Funciona en Safari de iPhone y en escritorio.
- Al entrar por primera vez ve un panel vacío con un único paso: "Invita a tu primer cliente".
- Acepta términos y política de tratamiento de datos (E6) antes de crear la cuenta.

### HU-P02 · Invitar clientes con código — S
**Como** coach, **quiero** generar un código/enlace de invitación, **para** que mis clientes se vinculen a mí en segundos.
- El coach ve un código corto (6 caracteres) y un enlace que puede pegar en WhatsApp.
- El código puede regenerarse (el anterior deja de servir para nuevos vínculos).
- El panel muestra la lista de clientes vinculados y la fecha de vínculo.
- En el plan gratis, al llegar al límite (p. ej. 5 clientes) el código sigue funcionando pero el coach ve aviso de "plan fundador" (sin bloquear durante el piloto).

### HU-P03 · Cliente se vincula y da consentimiento — M
**Como** cliente, **quiero** unirme a mi coach con su código y elegir qué comparto, **para** que me haga seguimiento sin mandarle todo por WhatsApp.
- Desde la app (Perfil → "Mi coach") introduce el código o abre el enlace; ve nombre del coach antes de confirmar.
- Pantalla de consentimiento explícito con casillas: peso y medidas, hábitos, resumen de comidas, fotos (desmarcada por defecto). Debe aceptar al menos peso para vincularse.
- Puede cambiar lo compartido o **desvincularse** en cualquier momento; al desvincularse el coach deja de ver sus datos de inmediato.
- Se registra fecha y versión del consentimiento.

### HU-P04 · Mis datos en la nube y en varios dispositivos — L
**Como** cliente, **quiero** que mis registros se guarden en mi cuenta, **para** no perderlos si iOS limpia la app o cambio de móvil, y para que mi coach los vea.
- Al iniciar sesión por primera vez, los datos locales existentes se suben sin duplicar (migración desde el esquema local versionado).
- La app sigue funcionando **sin conexión**; los cambios se sincronizan al recuperar red (local-first).
- Si edita el mismo registro en dos dispositivos, gana el último cambio por registro (o la regla que defina @Arquitecto) y no se pierde el resto.
- Un usuario sin coach también puede usar la cuenta solo como copia/sincronización.

### HU-P05 · Panel del coach con semáforo — M
**Como** coach, **quiero** ver en una lista a todos mis clientes con su estado, **para** saber en 5 minutos a quién escribir.
- Por cliente: peso actual, cambio de la tendencia 7 d vs. semana anterior, cintura (último valor y cambio), días con registro en los últimos 7, fecha del último registro.
- Semáforo: verde (registra ≥ 4/7 días y tendencia hacia la meta), amarillo (2–3/7 días o estancado ≥ 14 días), rojo (sin registro ≥ 5 días). Reglas en funciones puras con tests.
- Orden por defecto: rojos primero. Usable en móvil.
- Solo muestra datos que el cliente consintió compartir.

### HU-P06 · Ficha de progreso del cliente — M
**Como** coach, **quiero** abrir la ficha de un cliente y ver su evolución, **para** preparar el check-in semanal.
- Gráfico de peso con media de 7 días, cintura y % de grasa (si hay datos), resumen semanal (kcal y proteína medias, pasos, entrenos) reutilizando `calc.js`.
- Selector de rango 30 d / 90 d / todo.
- Vista de solo lectura: el coach no puede modificar los datos del cliente.

### HU-P07 · Comentarios del coach — S
**Como** coach, **quiero** dejar un comentario en la ficha de un cliente, **para** darle feedback sin perderlo en el chat.
- El coach escribe un comentario (texto, máx. 1000 caracteres) asociado a una fecha/semana.
- El cliente lo ve en su panel ("Nota de tu coach") con indicador de no leído; puede marcarlo como leído.
- El coach ve si el comentario fue leído.
- (Opcional R1) Botón "Abrir WhatsApp" con el número del cliente, para no competir con su canal actual.

### HU-P08 · Privacidad y borrado — S
**Como** cliente, **quiero** descargar o borrar todos mis datos de la nube, **para** tener el control de mi información de salud.
- "Exportar mis datos" genera el JSON actual (compatible con importar).
- "Eliminar mi cuenta" borra datos y fotos del servidor (tras confirmación) y desvincula del coach.
- Política de tratamiento de datos accesible desde la app **[SUP-CO: Ley 1581/2012, datos sensibles]**.

**Métrica del MVP:** ≥ 5 coaches activos con ≥ 5 clientes cada uno que registran ≥ 3 días/semana durante 4 semanas.

---

## 7. Roadmap por releases

| Release | Contenido | Criterio para pasar a la siguiente |
|---|---|---|
| **R0 Descubrimiento** (sin código nuevo de servidor) | Entrevistas H1, piloto concierge H2/H3 con la app actual + exportes, landing/preventa H4, revisión legal H8. En paralelo: terminar Sprint 1 y SPIKE-01. | H1 validada y piloto con ≥ 60 % de clientes activos en semana 4; ≥ 3 coaches comprometidos (pago o carta). |
| **R1 MVP coach** (E1 + E2 + E6) | HU-P01…HU-P08. Cobro al coach **fuera de la app** (link de pago/transferencia). | ≥ 5 coaches activos semanales, ≥ 25 clientes activos, retención de clientes a 30 días ≥ 60 %, y ≥ 3 coaches pagando el plan por fuera. |
| **R2 Cobros** (E3) | Suscripción del coach dentro de la app (tramos B+C). Si los coaches lo piden: cobro de su mensualidad a sus clientes con comisión (modelo A). Marca blanca básica como upsell (logo/colores). | Cobro automatizado sin incidencias en ≥ 90 % de renovaciones; MRR cubre costes de infraestructura; churn mensual de coaches < 10 %. |
| **R3 Retos** (E4) | Coach crea un reto (fechas, métrica: registro diario/pasos/proteína/entrenos), invita clientes y ve ranking; clientes ven su posición. Retos abiertos para atraer clientes nuevos al coach. | Clientes en reto con adherencia ≥ 20 % mayor; ≥ 30 % de coaches lanza un reto al mes; retos traen clientes nuevos. |
| **R4 Comunidad** (E5) | Feed por coach (logros, publicaciones del coach, reacciones), moderación y reportes, notificaciones. | Solo si H7 se valida. Métrica: ≥ 40 % de clientes activos interactúa semanalmente y la retención a 90 días mejora frente a R3. |

---

## 8. Qué pasa con el backlog actual (HU-01…HU-10)

| ID | Decisión | Motivo |
|---|---|---|
| HU-01 Proteger datos | **Sigue** (en curso, S1-2) | Sigue siendo crítico hasta R1 en iPhone; después la nube lo complementa (el aviso de copia se puede relajar si hay cuenta). |
| HU-02 Repetir comidas | **Sigue** (S1-3) | Menos fricción de registro = más adherencia = más valor para el coach. |
| HU-03 Editar registros | **Sigue** (Sprint 2) | Necesario antes de sincronizar: datos limpios, y el coach ve lo que el cliente corrige. |
| HU-04 Porciones | **Cambia / baja** | Útil, pero el coach pide sobre todo peso/medidas/adherencia. Pasa detrás del MVP salvo que el piloto muestre que el registro de comida es clave para los coaches. |
| HU-05 TDEE adaptativo | **Cambia** | Se convierte en una vista para el coach ("gasto real estimado") en HU-P06; la lógica de `calc.js` se reutiliza. Detrás de R1. |
| HU-06 Resumen semanal | **Sigue y sube** | Es la base del semáforo y de la ficha del coach (HU-P05/P06). Hacerlo como funciones puras reutilizables. |
| HU-07 Gráfico cintura/% grasa | **Sigue** | Se reutiliza en la ficha del coach (HU-P06). |
| HU-08 Aviso nueva versión | **Sigue y sube** | Con servidor y muchos clientes, todos deben estar en la versión compatible con la API. |
| HU-09 Biblioteca de alimentos | **Se aparca** | Bajo valor para la nueva visión. |
| HU-10 Sincronización | **Se reemplaza** por E1 / HU-P04 | Ya no es opcional: es la base del modelo de negocio. |
| "Descartado: gamificación, social, retos" | **Se revierte parcialmente** | Retos (E4) y comunidad (E5) entran en el roadmap, pero **después** de validar el MVP del coach. |
| Valor "100 % privado, sin servidor" | **Cambia** a "privado por diseño": el cliente decide qué comparte y con quién; la app sigue funcionando offline. | Decisión del Stakeholder de tener servidor. |

**Propuesta para Sprint 2** (sin servidor aún): HU-03, HU-06 (como funciones puras para el futuro panel), SPIKE-01 y kit del piloto concierge (exporte CSV/JSON pensado para el resumen del coach).

---

## 9. Preguntas

### Para el Stakeholder (máx. 5)
1. **¿Tienes ya 2–3 coaches concretos** dispuestos a probar 4 semanas con 5 clientes cada uno (piloto concierge)? ¿Nos pones en contacto para las entrevistas?
2. **Modelo de ingreso:** ¿te sirve empezar con *"gratis hasta 5 clientes y luego tarifa fija por cliente activo/mes"* cobrada por fuera, y dejar la comisión sobre lo que vende el coach para R2? ¿Qué precio por cliente/mes te parece razonable para el coach?
3. **Mercado inicial:** ¿confirmas que empezamos en **Colombia** (pesos, pagos locales, Ley 1581) o apuntas a varios países desde el inicio?
4. **Fotos:** ¿el coach necesita ver las fotos corporales del cliente en el MVP, o basta con peso/medidas/adherencia al principio (menos riesgo legal y coste)?
5. **Marca:** ¿la app se presenta con **tu marca** (el coach la "regala/usa") o cada coach quiere su propia marca desde el principio (marca blanca)?

### Para @Arquitecto
- **SPIKE-01 ampliado:** elegir backend (Supabase / PocketBase / API propia) considerando **roles coach/cliente**, permisos por fila según consentimiento (el coach solo lee lo compartido), almacenamiento de fotos con acceso restringido, y coste estimado con 50 coaches × 20 clientes.
- **Local-first:** ¿cómo sincronizamos el estado actual (`localStorage` + IndexedDB, con `schemaVersion` de S1-1) sin romper el uso offline? ¿Estrategia de conflictos por registro (último en escribir gana por fecha/campo)?
- **iPhone/PWA:** limitaciones reales en iOS (almacenamiento, push solo con PWA instalada en iOS ≥ 16.4, inicio de sesión con enlace mágico abriendo Safari fuera de la PWA instalada). ¿Necesitamos app nativa o envoltorio (Capacitor) antes de R4? Si vamos a App Store, ¿cómo afectan las reglas de compras dentro de la app a E3?
- **Datos de salud [SUP-CO]:** región del servidor, cifrado en reposo, registro de consentimientos y borrado completo; ¿qué exige la Ley 1581/2012 para datos sensibles y transferencia internacional si el servidor está fuera de Colombia?
- **Reutilización:** ¿podemos compartir `calc.js` (tendencia, semáforo, resumen semanal) entre la app del cliente y el panel del coach, para que ambos muestren exactamente las mismas cifras?
