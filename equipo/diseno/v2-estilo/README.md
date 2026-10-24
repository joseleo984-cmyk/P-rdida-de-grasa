# Estilo propuesto para la próxima versión (v2)

Bocetos aprobados por José Granados el 24 de octubre de 2026 **para la próxima versión**. No se construyen ahora: primero se publica la Etapa 2 y se recogen los comentarios de quienes prueben la app.

Referencia: una app de entrenamiento de la App Store que José compartió (fondo negro, acento que brilla, tira de días en círculos, tarjetas grandes de rutina, temporizador en anillo). Se toma la idea, no su marca, colores exactos, íconos ni fotos.

## Pantallas

| Archivo | Pantalla | Qué cambia |
|---|---|---|
| `E1-inicio.png` | Inicio del asesorado | Semana en círculos por día (cumplido, comodín punteado, hoy en blanco); rutina de hoy como tarjeta grande con «Empezar»; agua, pasos y sueño en anillos; nota del coach como tarjeta de mensaje. |
| `E2-entrenar.png` | Entrenar | Cada rutina es una tarjeta grande con el GIF o la imagen que subió el coach, el nombre encima y los ejercicios en la esquina. Sin imagen, se ve un dibujo de color. |
| `E3-paso-a-paso.png` | Modo guiado (nuevo) | Sigue la rutina ejercicio por ejercicio: GIF, serie en curso, descanso en un anillo con cuenta regresiva, Pausa, anterior y siguiente. |
| `E4-terminado.png` | Entreno completo | Cierre con anillo, resumen (ejercicios, series, días de la semana), «¿Qué tan duro estuvo?» y «¿Alguna molestia?» para el coach. |
| `estilo-propuesto-todas.png` | Las cuatro juntas | — |
| `estilo.html` | Fuente de los bocetos | Se abre en el navegador. Usa `fonts/local.css` del panel (no incluido); sin él cae a las fuentes del sistema. |

## Reglas que se mantienen

- Nada de fotos de modelos ni imágenes ajenas (derechos de autor y cláusula del coach). Solo lo que sube el coach o dibujos de color.
- La barra inferior conserva el texto debajo de cada ícono, por recomendación del panel de UX.
- Nada de «Nº1», calificaciones ni premios que no existen.
- La app no prescribe: series, repeticiones, kilos y descansos los pone el coach. La nota del coach nunca es un consejo de la app.
- Las rutinas no guardan su duración: no se muestran minutos.

## Lo que hace falta para construirlo

- **Modo paso a paso (lo más grande):** que el coach pueda poner por ejercicio las series, las repeticiones, el peso opcional y los segundos de descanso. Requiere cambio de datos en las rutinas y probablemente SQL.
- **«¿Alguna molestia?»:** campo nuevo que ve el coach; revisar con el abogado si es dato de salud.
- **El resto (colores, tarjetas, tira de días, anillos):** cambio visual sin SQL.
