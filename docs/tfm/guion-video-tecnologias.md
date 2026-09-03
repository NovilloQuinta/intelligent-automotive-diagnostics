# Notas del ponente — Slide 3.1 «Tecnologías utilizadas»

> Sustituyen a las notas actuales de esa slide en `docs/presentacion/build.mjs`
> (rama `claude/tfm-slide-presentation-2fflme`). Presupuesto: **~60 s**.
> El texto de lectura es el resumen del autor, corregido en tres puntos:
> los TTL de los tokens iban cruzados, Helmet no obliga a HTTPS —se lo obliga al
> navegador— y faltaba el reparto de trabajo entre las dos bases de datos.

---

## Para leer (~60 s)

Todo el proyecto es TypeScript sobre Node, backend e interfaz.

En persistencia hay dos bases de datos, y las dos son embebidas: no hay que levantar ningún
servidor, corren dentro del propio proceso. SQLite guarda el dato firme —usuarios, vehículos,
diagnósticos— y LanceDB guarda solo lo que el sistema aprende, que es lo que permite buscarlo por
significado y no por coincidencia de texto.

En la API, Express para el enrutado. JWT para la sesión: un token de acceso de quince minutos y
un refresco de siete días que se rota en cada uso, de forma que si alguien reutiliza uno robado,
el sistema lo detecta y corta. Zod para garantizar la estructura de todo lo que entra, incluida
la configuración al arrancar. Helmet para las cabeceras de seguridad, que entre otras cosas
obliga al navegador a usar siempre HTTPS. Y pino para el log estructurado, que es el que alimenta
el panel de administración.

El agente va sobre el SDK oficial de MCP, y por debajo Anthropic u OpenAI según lo configurado.
El acceso al coche es un ELM327 por serie o TCP, más un emulador en Python que es lo que me
permitió desarrollar el proyecto entero sin tener el vehículo delante.

La interfaz es React 19 con Vite y TanStack. Las pruebas: Vitest en unidad, supertest para los
endpoints y Playwright de extremo a extremo. Y la entrega, GitHub Actions, Docker y Caddy
delante, que es quien termina el TLS y reparte hacia los contenedores.

Lo importante no es la lista: de la tercera fila para abajo, todo está detrás de un puerto. Se
sustituye sin tocar la lógica.

---

## Reserva para preguntas

**¿Por qué Express y no Fastify?**
Fastify es más rápido y trae validación por esquema de serie. Pero el cuello de botella no está
en la capa HTTP: la petición se pasa la vida esperando al puerto serie del ELM327 y al modelo de
lenguaje, con un límite de sesenta segundos. Y su mejor baza ya la cubre Zod, que hace falta
igualmente fuera de las rutas. Express vive solo en infraestructura, detrás de los puertos: si
algún día el cuello de botella fuera ese, cambiarlo afectaría a un directorio.

**¿Por qué LanceDB y no otra?**
pgvector obligaba a levantar un PostgreSQL entero solo para esto. Chroma necesita un runtime de
Python y un servicio aparte. Los embeddings de OpenAI metían clave de API y coste por consulta en
una búsqueda interna. Y la búsqueda de texto de SQLite no captura significado, que es justo el
problema: "presión de aceite" nunca casaría con *low oil pressure*. Además, un solo módulo del
proyecto está acoplado a LanceDB: cambiar de motor es reescribir ese fichero.

**¿Qué es HSTS?**
La cabecera que obliga al navegador a usar siempre HTTPS con este dominio. Evita el ataque de
degradación: que alguien en la misma red intercepte la primera petición, que va en claro, y
mantenga al usuario en HTTP. Está puesta con un año de vigencia, incluyendo subdominios y con
`preload`, que inscribe el dominio en la lista que los navegadores traen de fábrica para que ni
la primera visita quede expuesta.

**¿Quién hace qué en el despliegue?**
El DNS está en el registrador: un registro A que apunta el dominio a la IP del VPS. Caddy entra
cuando la petición ya ha llegado: tiene el certificado —lo saca y lo renueva de Let's Encrypt
solo—, pone las cabeceras de seguridad del dominio y reparte, `/api/*` al contenedor del backend
y el resto a la interfaz. Los contenedores solo escuchan en `127.0.0.1`, así que Caddy es la
única puerta de entrada.

**¿Por qué la interfaz lleva nginx y la API no?**
Porque la interfaz se compila a ficheros estáticos y alguien tiene que servirlos; la API es un
proceso Node que genera cada respuesta. nginx hace además dos cosas ahí: el fallback del
enrutado —recargar estando en `/dashboard` devuelve el `index.html` en vez de un 404— y la
política de seguridad de contenido de la web, que Helmet no puede poner porque solo actúa sobre
las respuestas de Express. Son dos políticas distintas a propósito: la API va con `default-src
'none'` y la web con `'self'` más las excepciones justas.

**¿Qué es supertest?**
Lanza peticiones HTTP reales contra la aplicación levantándola él en un puerto efímero. Como la
petición atraviesa la pila entera, los tests prueban también el middleware: cabeceras, límite de
tasa y autenticación. Y a `createServer` se le pasan las dependencias, así que se prueba el
servidor completo sin base de datos real, sin coche y sin modelo.

---

## Dos avisos sobre el deck

1. **El índice suma 20:35.** Si el vídeo son 10-15 minutos, no cabe: hay que decidir qué se
   recorta antes de grabar.
2. El **por qué del modelo de embeddings multilingüe** —la documentación técnica está en inglés y
   el mecánico escribe en español— encaja en la slide 4.7, la de modelos empleados. En 3.1 basta
   con "en local".
