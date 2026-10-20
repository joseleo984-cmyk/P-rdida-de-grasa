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
  y barras de progreso frente al objetivo.
- **Hábitos**: pasos, agua, sueño y entrenamiento de fuerza.
- **Recomendaciones automáticas**: avisa de estancamientos, pérdida demasiado rápida,
  proteína baja, poco sueño o falta de entrenamiento.
- **Datos**: exportar/importar JSON (respaldo) y exportar CSV.

## Uso

Abre `index.html` en el navegador, o sírvela localmente:

```bash
npm start        # http://localhost:8080
npm test         # pruebas de los cálculos
```

Para usarla desde el móvil, publícala con GitHub Pages (Settings → Pages → rama `main`)
y elige "Añadir a pantalla de inicio".

> Las cifras son estimaciones orientativas, no consejo médico. Ajusta las calorías según
> tu tendencia real de peso cada 2–3 semanas.
