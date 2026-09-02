# Guion de vídeo — Tecnologías utilizadas

> Material de apoyo para grabar el bloque "tecnologías" del vídeo del TFM.
> No es documentación de arquitectura (eso está en `05-arquitectura-core-api.md` y
> `02-embeddings-rag.md`): es **qué decir, en qué orden y por qué**, con las cifras
> reales del código para no improvisarlas delante de la cámara.

---

## Parte A — Stack de la API

### La idea que sostiene todo el bloque

No enumeres librerías. **Sigue una petición HTTP** desde que entra hasta que llega al caso de
uso, y cada pieza aparece cuando le toca. Es el mismo orden que tiene `server.ts`, así que si
enseñas el fichero en pantalla, el guion y el código van sincronizados.

```
Petición  →  Helmet  →  rate limit  →  auditoría  →  express.json  →  CORS
          →  ruta  →  auth JWT  →  Zod (validación)  →  caso de uso
                              (y Pino registrando todo el recorrido)
```

Frase de apertura sugerida:

> "El backend es una API REST en Node con TypeScript. Más que la lista de librerías, lo
> interesante es que cada una cubre una responsabilidad concreta de la cadena por la que pasa
> toda petición. Vamos a seguir una."

---

### 1. Express 5 — el esqueleto HTTP

**Qué decir**

- Framework HTTP minimalista, el estándar de facto en Node. Se eligió **la versión 5**, no la 4.
- La diferencia que importa: en Express 5 los errores de un handler `async` se propagan solos al
  manejador de errores. En Express 4 había que envolver cada handler en un `try/catch` o en un
  wrapper. Con un backend donde casi todo es asíncrono (puerto serie, LLM, base de datos), eso
  es menos código repetido y ningún fallo silencioso.
- **El punto de arquitectura**: Express vive **solo** en `infrastructure/http/`. Los casos de uso
  no importan Express ni saben que existe HTTP. Se comunican por puertos (interfaces).

**Frase de remate**

> "Si mañana cambiara Express por Fastify, tocaría una carpeta. El dominio y los casos de uso no
> se enteran. Eso no es casualidad, es lo que compra Clean Architecture."

---

### 2. Helmet — cabeceras de seguridad

**Qué decir**

- No añade funcionalidad: **quita superficie de ataque**. Pone las cabeceras HTTP de seguridad
  que el navegador respeta.
- Configuración real del proyecto:

| Cabecera | Valor | Por qué |
|---|---|---|
| `Content-Security-Policy` | `default-src 'none'` | Es una API REST: no sirve HTML ni carga recursos. La política más restrictiva que existe es literalmente correcta aquí. |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Un año. El navegador no vuelve a hablar por HTTP con este dominio. |
| `X-Frame-Options` | `deny` | Nadie mete la API en un iframe (clickjacking). |
| `X-Content-Type-Options` | `nosniff` | El navegador no adivina el tipo de contenido. |

**El detalle que demuestra que no es copy-paste** (buen momento para el vídeo):

> "Swagger UI sí necesita cargar scripts y estilos, así que con `default-src 'none'` global no
> arrancaría. En vez de aflojar la política de toda la API, `/api-docs` monta **su propio Helmet**
> con una CSP relajada, y además solo se publica fuera de producción."

---

### 3. Zod — la frontera entre el mundo exterior y el código tipado

**Qué decir**

- El argumento de fondo, y es el que engancha: **TypeScript desaparece al compilar**. Los tipos son
  una promesa en tiempo de desarrollo. Lo que llega en un `req.body`, en un `.env` o en la
  respuesta de un LLM no lo ha comprobado nadie.
- Zod valida **en tiempo de ejecución** y de la misma declaración se infiere el tipo de
  TypeScript. Un solo sitio donde está escrita la forma del dato: no hay interfaz por un lado y
  validación por otro que se desincronicen.
- En el proyecto se usa en **36 ficheros**, en cuatro frentes:

| Dónde | Qué protege |
|---|---|
| DTOs de entrada (`application/dto/`) | Lo que manda el cliente en cada endpoint. |
| Configuración (`configuration/index.ts`) | Las variables de entorno: tipos, valores por defecto, `.env` mal puesto → **la app no arranca**, falla al inicio y no a las tres de la mañana. |
| Capa LLM y tools MCP | La respuesta del modelo es texto: se valida antes de tratarla como dato. |
| OpenAPI | `zod-to-json-schema` genera la especificación **desde los mismos objetos Zod que validan**. |

**Los dos remates buenos** (elige uno según el tiempo):

> "La documentación OpenAPI no puede mentir, porque no está escrita a mano: se genera desde el
> mismo validador que corre en producción. Y hay un test que recorre los routers reales de Express
> y falla si aparece una ruta que no esté documentada."

> "El caso de seguridad concreto: después de `jwt.verify`, el payload todavía se valida con un
> schema Zod que **descarta claves desconocidas**. Gracias a eso, el reto del segundo factor —que
> también es un token— no puede colarse como token de acceso."

---

### 4. JWT — autenticación sin estado, con los matices

**Qué decir**

- Esquema de **doble token**:

```
ACCESS TOKEN                          REFRESH TOKEN
• TTL 15 minutos                      • TTL 7 días
• Va en Authorization: Bearer         • Va en el body de POST /api/auth/refresh
• Se valida en cada petición          • Se guarda HASHEADO en base de datos
• NO contiene el rol                  • Se revoca al usarse (rotación)
```

- **Rotación**: cada refresh revoca el token viejo y emite un par nuevo. Si llega un refresh ya
  revocado, es señal de reuso —token robado— y se responde 401.
- **El matiz que suele preguntar un tribunal**: "un JWT no se puede revocar, ¿cómo echas a un
  admin?" Respuesta preparada:

> "Por eso el access token **no lleva el rol**. El middleware de administración consulta el
> usuario en base de datos en cada petición, así que quitar el rol admin surte efecto inmediato,
> sin esperar a que caduque el token. Es un compromiso consciente: statelessness para lo barato,
> consulta a base de datos justo para lo que debe poder revocarse ya."

- Complementos que puedes mencionar de pasada si hay tiempo: bloqueo de cuenta a los 5 intentos
  fallidos (15 min, contador atómico en una sola sentencia SQL para evitar carreras) y segundo
  factor TOTP con secreto cifrado en reposo (AES-256-GCM).

---

### 5. Pino — logging estructurado

**Qué decir**

- Logger JSON, y es de los más rápidos de Node: serializa con muy poco coste, así que loguear no
  penaliza el tiempo de respuesta.
- **Estructurado, no texto**: cada línea es un objeto con contexto. Se puede filtrar y agregar; un
  `console.log` con interpolación, no.
- En el proyecto: `Logger implements LoggerPort`. Los casos de uso dependen del **puerto**, no de
  Pino. Otra vez inversión de dependencias.
- **Doble destino**: `stdout` (con `pino-pretty` legible en desarrollo, JSON crudo en producción
  para que lo ingiera el agregador) y la tabla `logs` de SQLite, que es la que alimenta el panel
  de administración.

**Detalle fino, si quieres enseñar oficio**

> "Los `Error` del contexto se serializan a mano antes de guardarlos, porque `JSON.stringify` se
> come el `stack`: no es una propiedad enumerable. Sin ese paso, el contexto del error se
> guardaba como un objeto vacío."

---

### 6. Cierre del bloque API (30 s)

Menciona en una frase lo que completa la cadena y no merece sección propia:

- **CORS** con allowlist configurable, solo `GET`/`POST`/`OPTIONS`.
- **express-rate-limit** con el contador **persistido en SQLite**, no en memoria: reiniciar el
  proceso no regala cuota. Límites por ruta: login 5/min, diagnóstico cognitivo 5/min, global
  100/15 min.
- **Auditoría HTTP** de cada petición (método, ruta, status, IP, duración, usuario) → OWASP A09.

> "Ninguna de estas piezas es exótica. La decisión de diseño no está en cuál elegí, está en que
> cada una ocupa una única responsabilidad de la cadena y ninguna se filtra al dominio."

---

## Parte B — La base vectorial (LanceDB)

### 1. Empieza por el problema, no por la tecnología

**El problema real** (30 s, y es lo que hace que se entienda todo lo demás):

> "El OBD-II estándar tiene unos PIDs comunes a todos los coches. Pero cada fabricante define
> además los suyos propios, en Mode 22, y sus propios códigos de avería. Son miles y no están
> publicados. Precargarlos todos es imposible. Así que el sistema tiene que **aprenderlos**: y si
> aprende, tiene que poder **recordar y encontrar** lo aprendido."

Y ahí es donde una base de datos relacional se queda corta:

> "Si un mecánico escribe 'el coche pierde presión de aceite' y el catálogo tiene guardado
> 'low oil pressure sensor', un `LIKE` no encuentra nada. Ni una sola palabra coincide. Y son lo
> mismo."

### 2. Qué es un embedding (explícalo así)

> "Un embedding es convertir un texto en una lista de números —aquí, 384— que codifica su
> **significado**, no sus letras. Textos que significan lo parecido acaban cerca en ese espacio de
> 384 dimensiones. Buscar deja de ser comparar cadenas y pasa a ser medir distancias."

Modelo usado: `Xenova/paraphrase-multilingual-MiniLM-L12-v2`, vía **transformers.js**.

- **Multilingüe** (español + inglés): es justo lo que necesita el caso anterior. La documentación
  técnica de automoción está en inglés y el mecánico escribe en español.
- **Local**, unos 118 MB, corre en CPU en el mismo proceso Node: sin API key, sin latencia de red,
  **coste cero por embedding**. Cuesta unos 300 MB de RAM, y ese es el precio que se paga.

### 3. Por qué LanceDB y no otra cosa

Este es el punto donde un tribunal valora la decisión, no el producto. Ten las alternativas
preparadas:

| Alternativa | Por qué se descartó |
|---|---|
| **pgvector** (Postgres) | Exige un PostgreSQL corriendo. El proyecto usa SQLite embebido: metería un servicio entero solo para esto. |
| **Chroma** | Necesita runtime de Python y un servidor aparte. Rompe el "cero infraestructura". |
| **Embeddings de OpenAI** | API key, coste por embedding y latencia de red para una búsqueda interna. |
| **Solo FTS5 de SQLite** | Busca por texto, no por significado: "presión de aceite" nunca casaría con "oil pressure". Es exactamente el problema que hay que resolver. |

**El argumento a favor, en una frase**:

> "LanceDB es a las bases vectoriales lo que SQLite a las relacionales: embebida, sin servidor, un
> directorio en disco, corriendo dentro del propio proceso. El proyecto se despliega igual con
> búsqueda semántica que sin ella —cero infraestructura añadida— y tiene soporte nativo en Node."

### 4. Cómo funciona, por dentro

**Cuatro tablas**, cada fila es un vector más sus metadatos:

| Tabla | Qué guarda |
|---|---|
| `pids_index` | PIDs propietarios aprendidos |
| `dtcs_index` | Códigos de avería específicos de fabricante |
| `diagnoses_index` | **Memoria de taller**: casos completos (síntomas → PIDs → solución) |
| `ecus_index` | Definiciones de centralitas descubiertas |

**La búsqueda**, en cuatro pasos:

1. La consulta se convierte en su vector de 384 dimensiones.
2. LanceDB devuelve los **5 más cercanos** por distancia L2.
3. Se puede filtrar por fabricante y modelo con un predicado SQL sobre los metadatos.
4. Resultados ordenados por distancia ascendente: menor distancia, más parecido.

**Si te preguntan por la métrica**, respuesta corta y correcta:

> "LanceDB usa distancia euclídea. Como los embeddings salen normalizados, la euclídea es
> equivalente a la similitud coseno: `coseno ≈ 1 − d²/2`. El umbral que usa el prompt del modelo
> es 0,5, que equivale a una similitud coseno de en torno a 0,87."

**Y si preguntan por el índice ANN** —es la pregunta de manual—:

> "No hay índice IVF-PQ: la búsqueda es exacta. Con un corpus de cientos de entradas, un índice
> aproximado añadiría complejidad y pérdida de precisión sin ganar tiempo. Es una decisión
> tomada con el volumen delante, no un olvido; el día que el corpus lo pida, se añade."

### 5. El bucle de aprendizaje (esto es lo que hay que enseñar)

```
1. Diagnóstico en marcha, aparece un PID o un DTC desconocido
2. El modelo busca en LanceDB → sin resultados o con confianza baja
3. Invoca la tool web_search → encuentra una definición candidata
4. La indexa con confianza 0.3
5. La VALIDA contra el coche: lee el PID y comprueba que el valor cae en su rango
6. Si valida → la confianza sube a 0.7. Si no → se descarta
7. Al cerrar el diagnóstico, el caso completo se indexa en la memoria de taller
```

**Sistema de confianza** (el mecánico vale más que internet):

| Origen | Confianza inicial | Tras validar contra el coche |
|---|---|---|
| Búsqueda web | 0,3 | 0,7 |
| Aportado por el mecánico | 0,8 | 0,9 |

**El cierre del bloque, y es el mejor argumento de venta del proyecto**:

> "Esto significa que el sistema **no es el mismo después de cada coche**. El primer Audi A3 que
> pasa por el taller enseña sus PIDs propietarios. El segundo Audi A3 ya se los encuentra
> aprendidos y validados. El conocimiento no lo pone el fabricante del software: lo pone la flota
> que atraviesa el taller."

### 6. Dos honestidades que suman ante el tribunal

Guárdalas para el final del bloque, o para preguntas. Reconocer un límite y explicar por qué se
decidió así puntúa más que fingir que no existe:

- **La confianza no escala con la reutilización, a propósito.** La función que subiría la
  confianza cada vez que una entrada se reutiliza con éxito está implementada y **sin cablear**:
  exige saber que el diagnóstico *acertó*, y esa señal no existe. Que un mecánico consulte un
  diagnóstico no significa que le sirviera. Inventarla —dar por buena toda entrada reutilizada—
  subiría por igual la confianza de los aciertos y la de los errores, y degradaría el catálogo.
  Hace falta feedback explícito del mecánico, y eso es un cambio de alcance, no una línea
  pendiente.
- **El motor está aislado en un solo fichero.** `lanceVectorStore.ts` es el único módulo de toda
  la cadena atado a LanceDB: aprovisiona la tabla, traduce el filtro, escapa los literales del
  predicado y valida dimensiones. Migrar a pgvector sería escribir otro fichero como ese.

Y si hay que rematar con robustez:

> "Si la capa vectorial fallara, el diagnóstico OBD-II básico sigue funcionando. El conocimiento
> aprendido enriquece el diagnóstico, no lo sostiene."

---

## Chuleta de cifras (para no dudar en cámara)

| Dato | Valor |
|---|---|
| Express | 5.x |
| Zod, ficheros que lo usan | 36 |
| Access token / refresh token | 15 min / 7 días |
| Bloqueo por intentos fallidos | 5 intentos → 15 min |
| Rate limit global / login | 100 por 15 min / 5 por min |
| HSTS | 31.536.000 s (1 año) |
| Modelo de embeddings | `paraphrase-multilingual-MiniLM-L12-v2` |
| Dimensiones del vector | 384, normalizado (norma L2 = 1) |
| Tamaño del modelo / RAM extra | ~118 MB / ~300 MB |
| Top-K por defecto | 5 |
| Umbral de alta relevancia | distancia < 0,5 (coseno ≈ 0,87) |
| Tablas vectoriales | 4 (`pids`, `dtcs`, `diagnoses`, `ecus`) |
| Confianza web / mecánico | 0,3 → 0,7 / 0,8 → 0,9 |

---

## Referencias en el repositorio

- `apps/core-api/src/infrastructure/http/server.ts` — la cadena de middleware, en orden.
- `apps/core-api/src/infrastructure/observability/logger.ts` — Pino + persistencia.
- `apps/core-api/src/infrastructure/services/authService.ts` — firma y verificación de JWT.
- `apps/core-api/src/infrastructure/persistence/vector/` — LanceDB y embeddings.
- `docs/adr/007-catalogo-auto-expansivo-lancedb.md` — la decisión y sus alternativas.
- `docs/tfm/02-embeddings-rag.md` y `docs/tfm/05-arquitectura-core-api.md` — el detalle completo.
