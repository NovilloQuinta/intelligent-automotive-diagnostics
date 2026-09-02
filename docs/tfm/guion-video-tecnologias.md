# Notas del ponente — Slide 3.1 «Tecnologías utilizadas»

> Sustituyen a las notas actuales de esa slide en `docs/presentacion/build.mjs`
> (rama `claude/tfm-slide-presentation-2fflme`). Mismo presupuesto: **~60 s**.
> Las notas de ahora enumeran la tabla; estas dicen **por qué** está cada cosa,
> que es lo que pregunta un tribunal.

---

## Para leer (~60 s)

Todo el proyecto es TypeScript en modo estricto sobre Node 22, backend y frontend. Un solo
lenguaje y un solo modelo mental de punta a punta.

En la API, Express 5 porque propaga solo los errores de los handlers asíncronos, y aquí casi todo
lo es: el puerto serie, el modelo, la base de datos. Zod porque los tipos de TypeScript
desaparecen al compilar, así que lo que entra de fuera —peticiones, configuración y la respuesta
del modelo— hay que validarlo en ejecución; y de esos mismos esquemas se genera la documentación
OpenAPI, así que no puede quedarse desfasada. Helmet para las cabeceras de seguridad, JWT para la
sesión y pino para el log estructurado, que es el que alimenta el panel de administración.

En persistencia, SQLite con Drizzle: sin servidor que mantener, y los esquemas son TypeScript,
no un fichero aparte. Y LanceDB para la búsqueda vectorial por el mismo criterio: es embebida
igual que SQLite, una carpeta en disco, así que la búsqueda semántica no añade infraestructura.
Los embeddings se generan en local con transformers.js: sin clave de API, sin latencia y sin
coste por consulta.

El agente va sobre el SDK oficial de MCP, que es un estándar de herramientas y no un formato
propio mío, y por debajo Anthropic u OpenAI según lo configurado. El acceso al coche es un
ELM327 por serie o TCP, más un emulador en Python que es lo que me permitió desarrollar el
proyecto entero sin tener el vehículo delante.

La interfaz es React 19 con Vite y TanStack. Las pruebas, Vitest en unidad, supertest en los
endpoints y Playwright de extremo a extremo. Y la entrega, GitHub Actions, Docker y Caddy.

Lo importante no es la lista: de la tercera fila para abajo, todo está detrás de un puerto. Se
sustituye sin tocar la lógica.

---

## Si preguntan por qué LanceDB y no otra

Una frase por alternativa, no las sueltes todas:

- **pgvector** obligaba a levantar un PostgreSQL entero solo para esto.
- **Chroma** necesita un runtime de Python y un servicio aparte.
- **Los embeddings de OpenAI** metían clave de API y coste por consulta en una búsqueda interna.
- **La búsqueda de texto de SQLite** no captura significado, que es justo el problema: "presión
  de aceite" nunca casaría con *low oil pressure*.

Y si van a por el riesgo de elegir un motor joven: un solo módulo del proyecto está acoplado a
LanceDB. Cambiar de motor es reescribir ese fichero.

---

## Dos avisos sobre el deck

1. **El índice suma 20:35.** Si el vídeo son 10-15 minutos, no cabe: hay que decidir qué bloques
   se recortan antes de grabar, no sobre la marcha.
2. **El "por qué" del modelo de embeddings** (multilingüe porque la documentación técnica está en
   inglés y el mecánico escribe en español) encaja mejor en la slide 4.7, la de modelos empleados,
   que aquí. En 3.1 basta con "en local".
