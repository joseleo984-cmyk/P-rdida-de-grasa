# Liga semanal de constancia (función 5 del piloto) — rama `claude/piloto-funciones`

Aplica el **concepto jurídico 7** (`equipo/legal/concepto-7-2026-10-26.md`), que antes estaba «no construido». Cambia a propósito la guardia de `tests/legal-literal.test.js` («fuera de alcance») por pruebas de literalidad de la liga.

## Qué hace
- **Asesorado** (Progreso → Puntos → «Liga semanal de constancia»): aparece solo si su coach la habilitó. «Conocer y unirme» abre el modal con el encabezado, el texto, la casilla y el botón **literales**. Unido: aviso de cabecera literal (punto 12), su alias y la tabla (alias y puntos, nada más). Con 4 o menos: solo «Se requieren al menos 5 participantes para habilitar la liga del grupo». «Salir de la liga» lo quita al instante y registra el retiro.
- **Coach** (Más → Retos → «Liga semanal del team»): «Habilitar la liga» = aceptar el acuerdo **0.6-A7-coach** (cláusula 15 = la 7.6 del concepto, numerada tras la 14). Luego solo ve si se publica y cuántos participan. **Nunca** alias ni personas.
- **Servidor** (`grasa.liga_join / liga_leave / my_liga / coach_liga`): todo se calcula y se exige allá (consentimientos, 5 o más, alias de catálogo cerrado de 24, mayoría de edad, pago al día). Sin histórico: cada lunes empieza de cero. Puntos solo de constancia (los de v1.15).

## SQL — José debe pegarlo
`supabase/r1.sql` ya está regenerado (v1.16, migración `20261103120000_r1_liga.sql`). **José lo pega en Supabase (proyecto Pruebas), lo corre y confirma «OK r1 v1».** Sin eso, con la app nueva la liga simplemente no aparece (no rompe nada).

## Decisiones a revisar con el abogado / José
- **Cláusula 7.6 → «Cláusula 15»** (numeración correlativa; el acuerdo llegaba a la 14). La versión del acuerdo sube a 0.6; la 0.5 queda exacta en `A7_PAST`; `supabase/functions/_shared/textos-acuerdo.mjs` regenerado (`npm run build:funcion`). Si la función de correo está desplegada, hay que volver a desplegarla.
- **Premios del coach (punto 9 del concepto):** el abogado pide fijar en el acuerdo que se prohíbe pagar dinero en efectivo y que cualquier cortesía es responsabilidad exclusiva del coach. **No dio texto literal**, así que NO lo inventé: falta ese texto.
- **Catálogo de alias:** el concepto da 4 ejemplos (Halcón, Titán, Roble, Fénix); completé 24 nombres de animales y elementos neutrales. Conviene que el abogado los vea.
- **Mínimo 5:** cuenta quien participa y sigue vinculado, sin pausa y con consentimientos vigentes.
- La tabla la ven **solo** quienes participan (el concepto la presenta como «visible para otros miembros» que optaron).
- **Menores:** la app ya exige mayoría de edad para entrar; la unión lo vuelve a exigir en el servidor.
- Falta aún la Política v1.2 «Conócela aquí»: ya existía; no se tocó.

## Pruebas
`npm test` (liga, legal literal), `PGOPTIONS='-c qa.strict=on' npm run test:db` (200_liga: 26 comprobaciones; 937 en total), E2E `piloto-liga`. Caché del SW v57. Prueba en iPhone pendiente.
