# Gamerbit Capture 360

PWA móvil para fotografiar una escena desde un punto fijo y exportar las imágenes con poses relativas para reconstrucción posterior con Python, OpenCV o Hugin. La aplicación conserva las fotos y sesiones en IndexedDB del dispositivo. La captura y el análisis se ejecutan en el navegador.

## Instalación y ejecución

Requiere Node.js 22.13 o posterior de la rama 22, o Node.js 24, y npm.

```sh
npm ci
npm run dev
```

Abre la URL impresa por Vite. En el mismo ordenador, `localhost` sirve para comprobar la interfaz. Para probar la cámara y los sensores desde un iPhone, abre la aplicación mediante HTTPS. Una dirección IP de la red local servida por HTTP es insuficiente.

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run preview
```

El Service Worker se registra en la compilación de producción, incluida la que sirve `npm run preview`.

## Vercel e instalación en iPhone

Importa el repositorio en Vercel, selecciona el preset Vite, usa el directorio raíz del proyecto y deja `npm run build` como comando de compilación y `dist` como salida. Selecciona Node.js 22 o 24. Para pruebas en el iPhone, usa la URL HTTPS que genere el despliegue. [Documentación de Vercel para Vite](https://vercel.com/docs/frameworks/frontend/vite).

Abre esa URL directamente en Safari. En el menú Compartir, toca **Añadir a pantalla de inicio** y activa **Abrir como app web** si aparece. Abre el icono con conexión una primera vez para que se guarden la interfaz, los workers y el módulo ZIP. Para comprobar el modo sin conexión, activa el modo avión y vuelve a abrir la app. Safari puede eliminar el almacenamiento y la caché, y las sesiones se guardan por origen y contexto de instalación. Exporta las sesiones que necesites conservar. [Instrucciones de Apple para añadir un sitio a inicio](https://support.apple.com/guide/iphone/bookmark-a-website-iph42ab2f3a7/ios).

## Flujo de captura

1. En **Configuración**, ajusta el campo de visión vertical y horizontal al encuadre en vertical de la cámara. Los valores iniciales de 48° y 64° son aproximaciones. El modo automático usa 50% de superposición objetivo, 3° de tolerancia y 700 ms de estabilidad.
2. Crea una sesión con establecimiento, ambiente y punto de captura. Sujeta el iPhone en vertical, fija el centro óptico de la cámara en un punto y gira alrededor de él. Evita caminar, desplazarte lateralmente o cambiar de lente.
3. Pulsa **Activar cámara y sensores**, concede los permisos y apunta al horizonte con el teléfono nivelado. Pulsa **Calibrar orientación**. El azimut inicial queda en 0° y la inclinación se refiere a la vertical del sensor. En Safari la solicitud de permiso de sensores se hace desde el toque del botón. [Documentación de Apple para DeviceOrientationEvent](https://developer.apple.com/documentation/webkitjs/deviceorientationevent).
4. Sigue el punto objetivo y las flechas. En automático, la aplicación guarda una foto por objetivo si se cumplen la alineación y la estabilidad. En manual, puedes disparar fuera de tolerancia y la toma se marca para revisión. Selecciona cualquier punto guardado en el mapa para repetirlo.
5. Para reanudar o corregir una desviación, vuelve al mismo punto físico y al encuadre de la foto de referencia antes de calibrar. Puedes abrir la referencia debajo de la cámara. Una pérdida de señal, un salto angular abrupto, un cambio de orientación de pantalla o pasar a segundo plano invalidan la calibración. La deriva lenta requiere comprobar el encuadre de referencia manualmente.
6. Exporta el ZIP desde la sesión o el historial. Las sesiones parciales también se pueden exportar.

## Cobertura y calidad

- El plan incorpora el horizonte, anillos por encima y por debajo, techo y suelo. Las separaciones salen del campo de visión y la superposición objetivo. La planificación verifica celdas angulares con un campo de visión reducido de forma conservadora. La superposición objetivo controla el espaciado, y la superposición de área de cada par depende de sus poses.
- El porcentaje de la secuencia cuenta objetivos fotografiados. El porcentaje de cobertura estima la unión de los campos de visión rectangulares sobre 4096 muestras uniformes de la esfera, usando las poses reales y el roll. La cobertura incluye fotos con advertencias. El ZIP también informa la cobertura calculada sólo con tomas sin advertencias.
- El análisis calcula varianza del Laplaciano sobre una imagen reducida, luminancia media y fracciones de píxeles oscuros o saturados. Registra movimiento a partir de cambios de orientación y, cuando Safari los entrega, de aceleración y velocidad de giro. Los umbrales iniciales requieren validación en escenas reales.
- La comparación visual usa parches de esquinas, coincidencias mutuas y consistencia con un modelo afín para un vecino ya guardado. La superposición visual se estima como la fracción del encuadre que ese modelo proyecta dentro del vecino. Se guarda como `null` si las coincidencias son insuficientes. Patrones repetidos, poca textura, perspectiva marcada y paralaje pueden invalidar la estimación. Esta alternativa usa JavaScript y workers, con ejecución local en el hilo principal si falla el worker.
- Los sensores pueden denunciar movimiento y cambios de orientación. La coincidencia del centro óptico entre tomas depende de cómo se sostenga y gire el dispositivo.

## Formato de exportación

```text
session_<uuid>/
  metadata.json
  images/
    capture_001.jpg
    capture_002.jpg
```

`metadata.json` usa `schemaVersion: 1`. Incluye identificador, establecimiento, ambiente, punto, fecha ISO 8601, configuración, objetivos y cobertura. Cada entrada de `photos` incluye ruta interna, hora, pose objetivo (`target`), pose real (`actual`), dimensiones JPEG, ángulo de pantalla, movimiento disponible, tiempo estable y métricas de calidad. `visualComparison` se incluye si hubo análisis. `adjacentPairs` contiene pares con al menos 10% de superposición geométrica estimada, expresada como fracción del campo de visión de la primera foto. Los índices de archivo identifican objetivos y pueden tener huecos en sesiones parciales.

Las poses están en grados. Yaw positivo gira a la derecha desde el encuadre inicial, pitch positivo apunta por encima del horizonte y roll positivo inclina el eje superior de la imagen hacia la izquierda en el marco de cámara. Antes de reconstruir, convierte estos ejes a los que espera tu herramienta. La aplicación entrega imágenes y metadatos para el procesamiento posterior.

## Validación física en iPhone 13

- Abre el despliegue HTTPS en Safari y como app instalada. Crea una sesión y comprueba permisos concedidos, permisos denegados y reactivación tras apagar la pantalla.
- Mide el campo de visión del flujo real con un patrón o escena de dimensiones conocidas. Verifica el ancho y alto registrados para cada ajuste, la lente usada y si la relación de aspecto cambia. La resolución del JPEG viene del fotograma del vídeo negociado con Safari, que puede ser menor que la de la app Cámara. Safari decide qué lente trasera usar para el flujo solicitado.
- Verifica la guía desde el horizonte hacia izquierda, derecha, techo y suelo. Completa una vuelta sobre un soporte de punto fijo, compara el último encuadre con el inicial y cuantifica la deriva. Cambia la orientación de pantalla y comprueba que la captura se pausa hasta recalibrar.
- Comprueba que el automático no duplique objetivos, espera el tiempo configurado y rechaza movimiento. Prueba manual, repetición, recarga con una sesión incompleta y reanudación desde la foto de referencia.
- Repite con buena luz, escenas oscuras, zonas saturadas y paredes lisas. Revisa las advertencias y comprueba coincidencias y solapamiento con OpenCV o Hugin. Prueba también capturas bajo poca memoria disponible. Exportar requiere memoria proporcional al tamaño del ZIP.
- Guarda el ZIP en Archivos, extrae las imágenes y comprueba los nombres, las dimensiones y las poses contra los encuadres. Repite el flujo con modo avión después de instalar la versión de producción.

La validación automatizada cubre geometría, objetivos y cobertura. Cámara, sensores, precisión de las poses, umbrales de calidad, instalación en iOS y reconstrucción con imágenes reales requieren ejecutar este protocolo en el iPhone 13.
