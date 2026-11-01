# Pedido de funciones para el piloto (orden de José, 2026-10-31)

> Origen: `propuesta-comercial.md` (plan semanas 6 a 8). Piloto: **8 semanas, desde la segunda semana de noviembre de 2026**.
> Para el orquestador y el equipo técnico. El experto comercial **no tocó código**. «Suposición» = lo que no está confirmado.
> Reglas comunes: solo constancia (nunca peso, kg, cm ni fotos); sin rachas diarias que castiguen; sin mencionar pagos en mensajes de salud; textos legales literales de `equipo/legal/`.

| # | Función | Para qué | Criterio de listo (propuesto) | Riesgos / notas |
|---|---|---|---|---|
| 1 | **Recordatorio diario** (máx. 1, hora elegida, desactivable) | Que no se enfríe | Texto amable, sin «¡vas a perder…!»; el usuario lo activa, no viene encendido | **iPhone:** las notificaciones de una PWA exigen instalarla en pantalla de inicio y tienen límites. Si no es viable, alternativa: aviso al abrir la app o mensaje del coach. **Validar con el técnico.** Puede requerir consentimiento (**[Abogado]** si se guarda hora o token) |
| 2 | **Resumen semanal del asesorado** («lo que lograste») | Reconocimiento y cierre del bucle | Solo días, hábitos, constancia y comodines; sin peso ni kcal protagonistas | Usar los textos de `diseno/03` |
| 3 | **Aviso al coach con guía de qué escribir** | Reenganche a tiempo | Al llegar a 7 días sin registrar, sugiere una acción y un mensaje | Visible solo para el coach. Sin mención de pago |
| 4 | **Plantillas de reenganche para el coach** | Ahorrar tiempo al coach | 3 a 5 plantillas «sin juicio», editables | Revisar tono; el coach no es profesional de salud: sin consejos clínicos |
| 5 | **Liga semanal** | Pertenencia | Opt-in apagado por defecto, alias de catálogo cerrado, solo con 5 o más, reinicio cada lunes, puntos solo de constancia | Concepto 7: usar el opt-in **literal** y Política v1.2. Sin ranking por kg/cm. Cláusula 7.6 en el acuerdo del coach. **Suposición:** no se usa en el piloto si ningún grupo llega a 5 |
| 6 | **Lista «a quién reconocer este lunes»** | Que el coach felicite con intención | Sugiere 3 personas (constancia, regreso); felicitar es 1 toque | Ya existe «Felicitar» |
| 7 | **Reporte semanal para José** | Medir los experimentos | Contactos, demos, pruebas, pagos prometidos | Puede ser una hoja manual al principio |
| 8 | **Hito de 6 semanas y cierre de ciclo** | Que haya un cierre y un nuevo objetivo | Se mide en semanas, nunca en peso | Semana 8 del piloto |

**Fecha:** el piloto empieza la segunda semana de noviembre; el orden es de prioridad, no un compromiso de fecha. **[Equipo técnico]** estimar cuántas caben antes del inicio y avisar a José.

---

## Pedido adicional (2026-11-01): pantallas de inicio del coach
**Orden decidido por José:** se hace **después de terminar las funciones 1 a 4** y antes del inicio del piloto (segunda semana de noviembre). No debe retrasar esas funciones.
**Referencia visual:** `equipo/comercial/maqueta-inicio-coach.html` (maqueta aprobada por José; datos de ejemplo).

**Qué cambia:** hoy lo primero que ve el coach es «Antes de empezar» con las casillas. Se quiere que antes haya una pantalla de bienvenida y que las autorizaciones queden en pasos más ligeros.
1. **Bienvenida:** logo, «Bienvenido, coach», frase corta y un botón «Empezar». Sin casillas.
2. **Paso 1 de 3:** Términos, Política y mayoría de edad.
3. **Paso 2 de 3:** Acuerdo del coach.
4. **Paso 3 de 3:** copia en la nube y transmisión internacional.
5. **Inicio del coach:** «Hoy, escríbele a N personas», resumen de la semana (constantes, se apagan, sin registrar) y la lista de asesorados con «Felicitar» y «Escribirle». Sin peso ni fotos.

**Lo que NO cambia (obligatorio):**
- Todas las autorizaciones siguen exigidas antes de usar la app (decisión 8), **casillas separadas y sin marcar** (P3), con **los textos literales aprobados** por el abogado. Los textos de la maqueta son marcadores.
- La agrupación en 3 pasos es una **propuesta**: el equipo técnico y el abogado definen la lista exacta de casillas. Si el abogado aprueba la autorización única de prueba, los pasos se reducen.
- No debe cambiar lo que se registra como consentimiento (versión y huella SHA-256 del texto).

**No hacer:** no tocar los textos legales, no precargar casillas, no mostrar datos de salud en la pantalla de inicio.
