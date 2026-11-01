# Autorizaciones del coach en 3 pasos: preguntas para el abogado
Estado: **propuesta, NO implementada.** El flujo de autorizaciones no cambió. La bienvenida y el inicio del coach sí están hechos (no tocan consentimientos).

## Qué hace hoy el flujo
1. Pantalla legal: Términos y Condiciones, Política de Datos, mayor de 18 (obligatorias, casillas separadas y sin marcar). Son los textos literales v1.0 / v1.2.
2. Cuenta: elegir «coach» y aceptar el Acuerdo del coach (A7, versión 0.7) antes de ver clientes.
3. Copia en la nube y transmisión internacional (autorización única de prueba).

## Propuesta de agrupación (la de la maqueta)
- **Paso 1 de 3:** Términos, Política, mayor de 18 → 3 casillas.
- **Paso 2 de 3:** Acuerdo del coach → 1 casilla.
- **Paso 3 de 3:** copia en la nube y transmisión internacional → 1 casilla.
Total: **5 casillas en 3 pantallas**, con una barra «Paso N de 3» y un botón por pantalla.

## Qué textos cambiarían
- **Ninguno.** Se mueven de pantalla; cada texto sigue literal, con su versión y su huella SHA-256 (`tests/legal-literal.test.js` debe seguir verde).
- Solo cambian textos de interfaz que no son legales: títulos de paso («Tus reglas del juego»), frases de apoyo («Cada casilla es tuya: nada viene marcado»). **Esas frases también las debe ver el abogado**, porque acompañan a una autorización.

## ¿La «autorización única» reduce pasos?
**Decisión del abogado: NO autorizó la aceptación única.** Cada autorización sigue con su casilla propia y no se unen. La opción de bajar a 2 pasos queda descartada: si se agrupa, son **3 pasos con 5 casillas** (o los que el abogado valide), sin unir textos.

## Preguntas concretas
1. ¿Se pueden mostrar Términos, Política y mayoría de edad en una misma pantalla, con **tres casillas separadas**, sin marcar y obligatorias antes de usar la app?
2. ¿El Acuerdo del coach puede ir en una pantalla aparte antes de ver datos de asesorados (como hoy), o debe ir junto a los Términos?
3. (Sigue abierta) ¿La copia en la nube y transmisión internacional puede ir en la misma **pantalla** que el Acuerdo del coach, con casilla propia cada una? Unir los textos en una sola casilla ya no es opción.
4. ¿Podemos agregar una pantalla de bienvenida sin casillas **antes** del primer paso, y una barra «Paso N de 3»? ¿Hay que decir «Son 3 pasos» o basta «pasos cortos»?
5. ¿Las frases de apoyo («Te pedimos esto para cuidar tus datos…») están bien, o prefiere que no haya texto entre el título y las casillas?
6. ¿Hay que mostrar el enlace al texto completo de cada documento antes de la casilla (hoy es «Leer los Términos», «Leer la Política»)?
7. ¿Se necesita guardar un registro adicional (por ejemplo, la pantalla desde la que se aceptó)? Hoy se guarda versión, fecha y huella SHA-256 del texto.
8. Si cambia una versión de algún texto, ¿se vuelve a pedir **solo ese** paso o todos?

## Reglas que no se tocan
Obligatorias antes de usar la app · casillas separadas y sin marcar · textos literales aprobados · versión y huella SHA-256 sin cambios.

## Respuesta del abogado (pregunta 3): SÍ pueden ir en la misma pantalla
Acuerdo del Coach y autorización de copia en la nube / transmisión internacional pueden mostrarse en **la misma pantalla**, siempre que:
1. **Casillas independientes y desmarcadas por defecto.** Sin botón «Marcar todo»; cada una exige un toque afirmativo propio.
2. **Dos eventos de consentimiento distintos en la base de datos**, aunque se marquen en la misma vista: uno para el Acuerdo del Coach y otro para la autorización de datos y transmisión internacional, cada uno con versión, fecha, hora y huella SHA-256 de su propio texto.
3. **Naturalezas jurídicas distinguidas en pantalla:** el Acuerdo es contractual (relación de servicio, fotos, incentivos, límites); la autorización es de Habeas Data (tratamiento y transmisión a la nube).
Base: Ley 1581 de 2012, Decreto 1377 de 2013, Ley 527 de 1999 (lo sancionable es el consentimiento empaquetado o las casillas premarcadas).

**Pendiente antes de construir:** el abogado dio una *estructura recomendada* con textos de ejemplo. **No son los textos literales aprobados.** Se usan los literales ya vigentes (Acuerdo A7 0.7 y autorización de copia en la nube vigente); si quiere cambiar su redacción, debe entregarla como texto definitivo.
Tampoco quedó respondido todavía: bienvenida sin casillas, barra «Paso N de 3», frases de apoyo (preguntas 4 y 5), enlace antes de la casilla (6) y qué se re-pide si cambia una versión (8).
