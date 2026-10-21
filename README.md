# Pérdida de Grasa

App web (instalable en el móvil como PWA) para llevar el seguimiento de un proceso de pérdida de grasa.
Sin dependencias ni servidor: todos los datos se guardan en el propio dispositivo (`localStorage`).

## Funciones

- **Perfil y plan**: calcula metabolismo basal (Mifflin-St Jeor), calorías de mantenimiento,
  déficit según el ritmo elegido (0,25 %–1 % del peso por semana), objetivo diario de calorías
  y macros (proteína 2 g/kg, grasas ≥ 25 %, resto carbohidratos), con mínimo de seguridad.
- **Registro corporal**: peso, cintura, cuello, cadera y notas. Estima el % de grasa con el
  método US Navy (o acepta un valor manual) y la masa magra.
- **Panel**: peso actual, kilos perdidos, % de grasa, ritmo semanal real (regresión de las
  últimas 3 semanas), progreso y fecha estimada de meta, gráfico con tendencia de 7 días.
- **Diario de comidas**: calorías y macros por comida, con autocompletado de alimentos ya usados
  y barras de progreso frente al objetivo. **Repetir comidas**: "Copiar de ayer" añade al día elegido
  todo lo del día anterior (si ya hay comidas, pide confirmación y suma, nunca reemplaza), y al mirar
  un día pasado cada bloque (Desayuno, Almuerzo…) tiene "Repetir hoy". Las copias reciben ids nuevos.
- **Hábitos**: pasos, agua, sueño y entrenamiento de fuerza.
- **Fotos de progreso**: frente, perfil y espalda, comprimidas y guardadas en el dispositivo (IndexedDB).
  Galería por fecha con el peso de ese día y comparador antes/después por pose.
- **Recomendaciones automáticas**: avisa de estancamientos, pérdida demasiado rápida,
  proteína baja, poco sueño o falta de entrenamiento.
- **Datos**: exportar/importar JSON (respaldo, incluye las fotos) y exportar CSV.
- **Protección de datos**: al abrir, la app pide al navegador almacenamiento protegido y en
  Perfil → Datos muestra si lo está, el espacio usado y la fecha de la última copia.
  Si hay registros y han pasado 7 días o más sin copia, el panel muestra un aviso con
  "Hacer copia ahora" o "Recordar más tarde" (lo pospone 3 días). Tras exportar, la app pregunta
  si el archivo se guardó, y solo cuenta la copia si respondes "Sí".

## Uso

Abre `index.html` en el navegador, o sírvela localmente:

```bash
npm start        # http://localhost:8080
npm test         # pruebas de los cálculos
```

## Publicación (GitHub Pages)

El workflow `.github/workflows/pages.yml` ejecuta las pruebas y publica la app en cada push a `main`.
Solo hay que activarlo una vez: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
La app quedará en `https://joseleo984-cmyk.github.io/P-rdida-de-grasa/`; desde el móvil, ábrela y
elige "Añadir a pantalla de inicio".

> Las cifras son estimaciones orientativas, no consejo médico. Ajusta las calorías según
> tu tendencia real de peso cada 2–3 semanas.
