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
Sí, si el abogado la aprueba para el coach: el paso 3 se podría unir al paso 1 o 2 (quedarían 2 pasos) siempre que el texto diga con claridad qué se autoriza (copia en la nube y transmisión internacional) y siga separada de Términos y Política. Si no la aprueba, quedan 3 pasos.

## Preguntas concretas
1. ¿Se pueden mostrar Términos, Política y mayoría de edad en una misma pantalla, con **tres casillas separadas**, sin marcar y obligatorias antes de usar la app?
2. ¿El Acuerdo del coach puede ir en una pantalla aparte antes de ver datos de asesorados (como hoy), o debe ir junto a los Términos?
3. ¿La autorización de copia en la nube y transmisión internacional puede ir **junta** con el Acuerdo del coach en una sola pantalla, siempre con casilla propia?
4. ¿Podemos agregar una pantalla de bienvenida sin casillas **antes** del primer paso, y una barra «Paso N de 3»? ¿Hay que decir «Son 3 pasos» o basta «pasos cortos»?
5. ¿Las frases de apoyo («Te pedimos esto para cuidar tus datos…») están bien, o prefiere que no haya texto entre el título y las casillas?
6. ¿Hay que mostrar el enlace al texto completo de cada documento antes de la casilla (hoy es «Leer los Términos», «Leer la Política»)?
7. ¿Se necesita guardar un registro adicional (por ejemplo, la pantalla desde la que se aceptó)? Hoy se guarda versión, fecha y huella SHA-256 del texto.
8. Si cambia una versión de algún texto, ¿se vuelve a pedir **solo ese** paso o todos?

## Reglas que no se tocan
Obligatorias antes de usar la app · casillas separadas y sin marcar · textos literales aprobados · versión y huella SHA-256 sin cambios.
