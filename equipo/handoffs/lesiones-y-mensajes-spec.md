# Lesiones, seguimiento del coach y mensajes en los dos sentidos — especificación y consulta al abogado
Estado: **propuesta, NO construida.** Pedido de José (2 nov 2026). **Lesiones, condiciones médicas, dolor por ejercicio, restricciones, lista «a evitar» y avisos al coach: el abogado ya respondió** (textos literales en `equipo/legal/concepto-13-2026-11-02-lesiones.md`). **Mensajes en los dos sentidos: el abogado respondió el aviso previo, la conservación y la cláusula del Acuerdo** (`equipo/legal/concepto-14-2026-11-02-chat.md`).

## 1. Qué pidió José
1. La comunicación coach ⇄ asesorado debe ser **bidireccional** dentro de la app (hoy solo el coach escribe notas; el asesorado usa WhatsApp en la pantalla de pausa).
2. El asesorado debe poder **reportar una lesión** y contársela al coach, y el coach debe poder **hacerle seguimiento**.
3. El coach debe saber **qué restricción médica** tiene el asesorado, y **en qué ejercicio hubo dolor**, para no asignarlo de nuevo; si lo asigna, la app le **recuerda** el dolor o la lesión.
4. Avisos push al coach (neutrales: «Tienes un aviso de un asesorado»): el detalle se ve solo dentro de la app.

## 2. Estado actual (para no repetir)
- Dolor: `grasa.report_pain` guarda sí/no **por día**, con la versión y huella del texto literal. El coach ve «Reportó dolor» **sin detalle** y lo marca revisado (`review_pain`). Decisión legal previa: sin detalle.
- Salud: la pregunta voluntaria («Prefiero no responder») solo deja al coach la existencia de una restricción, sin detalle.
- Notas: `grasa.comments` (coach → asesorado). El asesorado no puede responder dentro de la app.
- Push (v1.19): avisos de mensaje del coach y rutina nueva al ASESORADO. Nada para el coach.

## 3. Diseño propuesto
**Lesión (asesorado → coach)**
- «Reportar una lesión» (Más o Inicio): zona/ejercicio (de una lista o texto), fecha, descripción **en sus palabras** (opcional), si quiere compartirla con su coach (autorización específica). Dos tipos: **lesión** (temporal) con estados **activa → en recuperación → superada**, y **condición médica** (de por vida, sin «superada»; sigue vigente y el coach la ve siempre). Una lesión que queda para siempre **se convierte en condición médica** (lo decide el asesorado o lo propone el coach y el asesorado confirma). El asesorado actualiza los estados.
- Dolor por ejercicio: en el paso a paso, botón opcional «Me dolió» por ejercicio; se suma al historial.
**Seguimiento (coach)**
- Ficha del asesorado: «Lesiones y restricciones» con estado, descripción y línea de tiempo; el coach agrega **notas de seguimiento** y cambia el estado (con aviso al asesorado: «Tu coach actualizó el seguimiento»).
- **Ejercicios a evitar** por asesorado: lista del coach; los ejercicios con dolor o lesión se sugieren solos.
- **Recordatorio al asignar** (rutina asignada o rutina de hoy): «Ana tiene una lesión activa (rodilla) y reportó dolor con «Sentadilla» el 28 oct. Revisa antes de asignarlo». No bloquea: decide el coach. La app **no interpreta** el texto libre ni dice qué es seguro (no es consejo médico).
**Mensajes en los dos sentidos**
- Conversación coach ⇄ asesorado (solo texto, hasta 1000 caracteres, sin adjuntos, solo con su coach activo, límite de envíos por hora). La lesión puede tener su propio hilo.
**Avisos push**
- Al coach: «Tienes un aviso de un asesorado» (mensaje nuevo, lesión nueva o actualizada). Al asesorado: «Tienes un mensaje nuevo de tu coach» / «Tu coach actualizó el seguimiento». Nunca nombre, ejercicio, zona ni texto en la pantalla bloqueada. El coach activa los avisos con el mismo consentimiento de la v1.19.

## 4. Servidor (SQL, nuevo; se entrega completo para pegar)
Tablas nuevas (RLS, sin acceso directo): `injuries` (asesorado, tipo `lesion`/`condicion`, zona/ejercicio, fecha, descripción, estado `activa`/`recuperacion`/`superada`, compartida con el coach, versión y huella de la autorización), `injury_notes` (seguimiento del coach y respuestas), `avoid_exercises` (coach × asesorado × ejercicio, origen: dolor/lesión/coach), `messages` (o `comments.author`). Funciones: reportar/actualizar lesión, seguimiento del coach, lista a evitar, consulta al asignar. Borrado en cascada con la cuenta; al desvincularse el coach pierde acceso inmediato.

## 5. Lo que necesita al abogado (consulta para copiar y pegar)
**Consulta: mensajes en los dos sentidos, lesiones, seguimiento y restricciones médicas**
Contexto: hoy el coach solo ve «Reportó dolor» sin detalle y solo el coach escribe notas. Queremos que (a) el asesorado y el coach se escriban dentro de la app (texto libre, 1000 caracteres, sin adjuntos); (b) el asesorado reporte una lesión o condición con sus palabras y el coach le haga seguimiento (estado activa/en recuperación/resuelta, notas); (c) se guarde en qué ejercicio hubo dolor y la app advierta al coach al asignarlo de nuevo; (d) el coach reciba un aviso push neutral («Tienes un aviso de un asesorado»), con el detalle solo dentro de la app.
1. Mensajes del asesorado al coach (pueden traer datos de salud): ¿basta la autorización vigente o se necesita aviso/casilla previa? Texto literal del aviso junto al cuadro de escribir («no es un canal de urgencias médicas» u otro).
2. Condición, lesión y dolor por ejercicio: ¿qué autorización específica y texto literal se necesitan para guardarlos y mostrarlos al coach? Hoy la decisión fue «sin detalle»; ¿qué se debe actualizar?
3. Texto literal del botón por ejercicio («Me dolió») y del formulario de lesión; ¿qué se debe decir sobre que la app no da consejo médico ni sustituye al médico?
4. Texto literal de la advertencia al coach al asignar un ejercicio con dolor o lesión registrados, sin que parezca consejo médico.
5. Conservación y borrado: lesiones, notas de seguimiento, historial de dolor y mensajes (al superarse la lesión, al desvincularse, al cerrar la cuenta del asesorado o del coach). ¿Puede cada parte borrar lo suyo?
6. Política: categorías de datos, finalidades y conservación nuevas. ¿Es cambio sustancial (re-consentimiento de quienes ya aceptaron) o informativo? ¿Quién debe re-aceptar?
7. Acuerdo del Coach: obligaciones nuevas sobre lo que recibe (usarlo solo para programar, no reenviarlo, pedir aval médico cuando corresponda, no dar consejo médico, borrar al terminar el vínculo). ¿Exige re-aceptación de los coaches?
8. Avisos push al coach: ¿alcanza el consentimiento aprobado para los asesorados (texto por capas, v0.2-A11-push) o el coach necesita uno propio? ¿La frase «Tienes un aviso de un asesorado» es adecuada?
9. Si el asesorado retira la autorización de compartir o se desvincula, ¿qué pasa con lo que el coach ya tiene (lesión, dolor, mensajes)? ¿Plazo para destruir copias?
10. Responsabilidad: ¿qué advertencia debe verse al coach de que es responsable independiente del uso de esta información?

## 5b. Pregunta adicional para el abogado
11. Lesión temporal vs. condición médica de por vida: ¿la condición médica exige una autorización o texto distinto de la lesión? ¿Cuánto se conserva una lesión «superada» (¿se borra o queda como historial para el coach?) y qué pasa con una condición cuando termina el vínculo? ¿Qué advertencia debe verse al convertir una lesión en condición médica?

## 6. Orden de construcción propuesto (actualizado: lo que ya tiene concepto va primero)
1) Lesión y condición médica + seguimiento + estados (concepto 13). 2) Dolor por ejercicio («Reportar molestia o dolor») + lista «a evitar» + advertencias al asignar + aviso push al coach. 3) Mensajes en los dos sentidos, cuando el abogado conteste el chat. Cada paso con su SQL completo para pegar y sus pruebas; los textos literales se completan al llegar el concepto.
