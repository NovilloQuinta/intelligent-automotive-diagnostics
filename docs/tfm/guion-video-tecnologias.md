# Guion de vídeo — Bloque de tecnologías

**Duración: 2 minutos.** Se lee tal cual.

---

## API (45 segundos)

El backend es una API REST en Node con TypeScript, sobre Express 5.

Alrededor hay cuatro piezas, cada una con una responsabilidad. **Helmet** fija las cabeceras de
seguridad de la respuesta, con la política más restrictiva que existe, que aquí además es la
correcta: una API que solo devuelve datos no necesita cargar nada de fuera. **Zod** valida en
tiempo de ejecución todo lo que entra —las peticiones, la configuración y la respuesta del modelo
de lenguaje—, que es justo lo que TypeScript no puede hacer, porque los tipos desaparecen al
compilar. **JWT** resuelve la sesión, con un token de acceso corto y un refresco que se rota en
cada uso. Y **Pino** registra de forma estructurada; ese registro es el que alimenta el panel de
administración.

Las cuatro viven confinadas en la capa de infraestructura. Los casos de uso no las conocen.

---

## Base vectorial (75 segundos)

La base vectorial responde a un problema concreto.

Cada fabricante define sus propios PID en el Mode 22 y sus propios DTC. Son miles, no están
publicados, y no hay forma de precargarlos. Así que el catálogo no puede ser estático: el sistema
tiene que aprenderlos sobre la marcha.

Y buscarlos por texto no sirve. Si el mecánico escribe "pérdida de presión de aceite" y la entrada
está guardada como *low oil pressure*, no hay una sola palabra en común. Y son lo mismo. Una base
vectorial no compara palabras: compara significado.

Elegí LanceDB con un criterio: no añadir infraestructura. Es embebida, un directorio en disco,
corriendo dentro del propio proceso. pgvector me obligaba a levantar un PostgreSQL entero,
Chroma un servicio en Python, y los embeddings de OpenAI habrían metido clave de API y coste por
consulta para una búsqueda que es interna. Los vectores los genera un modelo local y multilingüe,
porque la documentación técnica está en inglés y el mecánico escribe en español.

Y lo importante es esto: cuando el sistema encuentra una definición nueva, no se la cree. La
valida contra el coche, leyendo ese PID y comprobando que el valor cae en el rango esperado. Si
valida, sube la confianza; si no, la descarta.

Por eso el segundo Audi que entra al taller ya se encuentra aprendido lo que enseñó el primero.

---

## Reserva para preguntas (no leer en el vídeo)

- **JWT no se revoca** → el rol no va en el token; se consulta en base de datos en cada petición.
- **¿Índice vectorial?** → búsqueda exacta; con cientos de entradas un índice aproximado añade
  complejidad y pérdida de precisión sin ganar tiempo.
- **¿Confianza?** → web 0,3 → 0,7 tras validar contra el coche; mecánico 0,8 → 0,9.
- **¿Y si LanceDB se queda corto?** → un solo módulo está acoplado al motor; y si la capa
  vectorial cae, el diagnóstico OBD básico sigue.

Detalle completo en `05-arquitectura-core-api.md` y `02-embeddings-rag.md`.
