# 2. Base de Conocimiento Vectorial: Embeddings + RAG

> Documento para el tribunal del TFM — Intelligent Automotive Diagnostics  
> Jesús Novillo | Máster IA | Demo: semana del 10 de agosto de 2026

---

## 2.1 ¿Qué es la base vectorial y para qué sirve?

El sistema de diagnóstico automotriz se enfrenta a un problema fundamental: cada fabricante (Audi, Renault, Toyota, etc.) define sus propios **PIDs propietarios** (parámetros OBD-II en Mode 22) y **DTCs específicos** (códigos de fallo más allá del estándar SAE J2012). Es imposible precargarlos todos. La base de conocimiento vectorial resuelve esto implementando un **catálogo auto-expansivo** con tres funciones:

1. **Memoria semántica** — Recuerda PIDs, DTCs y diagnósticos previos usando búsqueda por similitud de significado, no por coincidencia exacta de texto. Así, una búsqueda sobre _"presión de aceite"_ encuentra resultados sobre _"oil pressure"_ o _"lubricación del motor"_.

2. **Auto-aprendizaje** — Cada vehículo diagnosticado enriquece el catálogo. Cuando el LLM encuentra un PID o DTC desconocido, lo investiga (vía web o aportación del mecánico), lo indexa y lo valida contra el vehículo real. Cuantos más coches pasan por el sistema, más inteligente se vuelve.

3. **RAG (Retrieval-Augmented Generation)** — Antes de cada diagnóstico, el sistema busca casos similares en la memoria de taller y los inyecta en el prompt del LLM. Esto permite que el modelo base (que no fue entrenado con datos del taller) disponga de ejemplos reales de diagnósticos previos del mismo modelo de vehículo.

```
┌──────────────────────────────────────────────────────────────────────┐
│                    CATÁLOGO AUTO-EXPANSIVO                           │
│                                                                      │
│   Vehículo nuevo                                                     │
│   (ej. Audi A3)                                                      │
│        │                                                             │
│        ▼                                                             │
│   ┌──────────┐     ┌──────────────┐     ┌──────────────────┐        │
│   │  LLM     │────▶│ LanceDB      │────▶│ Prompt mejorado  │        │
│   │ detecta  │     │ (búsqueda    │     │ con conocimiento │        │
│   │ PID/DTC  │     │  semántica)  │     │ previo           │        │
│   │ nuevo    │     └──────────────┘     └──────────────────┘        │
│   └──────────┘                                                       │
│        │                                                             │
│        │ Sin resultados                                              │
│        ▼                                                             │
│   ┌──────────┐     ┌──────────────┐     ┌──────────────────┐        │
│   │ web_search│───▶│ index_pid    │────▶│ validate contra  │        │
│   │ (SerpAPI) │    │ / index_dtc  │     │ vehículo real    │        │
│   └──────────┘     └──────────────┘     │ (OBD)            │        │
│                                         └──────────────────┘        │
│                                                │                     │
│                                                ▼                     │
│                                         ┌──────────────────┐        │
│                                         │ Catálogo         │        │
│                                         │ enriquecido      │        │
│                                         └──────────────────┘        │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2.2 Arquitectura de la capa vectorial

La capa vectorial sigue los principios de **Clean Architecture** del proyecto:

| Capa | Responsabilidad | Archivos clave |
|------|----------------|----------------|
| **domain** | Value objects (`KnowledgeSource`) | `domain/value-objects/KnowledgeSource.ts` |
| **application** | Puertos, DTOs, casos de uso, lógica de confianza | `ports/VectorStorePort.ts`, `ports/VectorRepository.ts`, `knowledge/*` |
| **infrastructure** | Implementación con LanceDB + transformers.js | `persistence/vector/*`, `mcp/mcpServer.ts` |

El puerto `VectorStorePort` es la única pieza que cambia al cambiar de motor vectorial. Todo lo demás —los casos de uso, los mappers, el sistema de confianza— es independiente del backend.

### 2.2.1 Puertos (interfaces)

```
application/ports/
├── VectorStorePort.ts          # Almacén vectorial crudo (upsert, query, count, sample)
├── VectorRepository.ts     # Repositorio tipado con búsqueda semántica (index, search)
├── EmbeddingGeneratorPort.ts   # Función pura: (text: string) => Promise<number[]>
├── KnowledgeStackPort.ts       # Agrupa los tres índices (pids, dtcs, diagnosis)
├── PidVectorRepository.ts  # = VectorRepository<PidKnowledgeEntry>
├── DtcVectorRepository.ts  # = VectorRepository<DtcKnowledgeEntry>
└── DiagnosisVectorRepository.ts  # = VectorRepository<DiagnosisKnowledgeEntry>
```

### 2.2.2 Tablas (colecciones) en LanceDB

LanceDB almacena los datos en tres tablas, una por tipo de entidad indexada:

| Tabla | Propósito | Entrada |
|-------|-----------|---------|
| `pids_index` | PIDs propietarios de fabricante (descubiertos en Mode 22) | `PidKnowledgeEntry` |
| `dtcs_index` | Códigos DTC específicos de fabricante | `DtcKnowledgeEntry` |
| `diagnoses_index` | Casos de diagnóstico resueltos (memoria de taller) | `DiagnosisKnowledgeEntry` |

### 2.2.3 Esquema de cada tabla

**`pids_index`** — PIDs propietarios aprendidos:

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `vector` | `FixedSizeList(384, Float32)` | Embedding del texto descriptivo del PID |
| `id` | `Utf8` | UUID v4 |
| `embeddedText` | `Utf8` | Texto que fue embebido (descripción del PID) |
| `manufacturer` | `Utf8` | Fabricante (ej. "Audi", "Renault") |
| `model` | `Utf8` | Modelo (ej. "A3", "Clio") |
| `confidence` | `Float32` | Confianza [0, 1] según procedencia y validación |
| `source` | `Utf8` | Procedencia: `web`, `mechanic`, `obd_validated` |
| `validated` | `Bool` | `true` si se confirmó leyendo el vehículo real |

**`dtcs_index`** — DTCs específicos de fabricante:

Mismo esquema que `pids_index`. Comparten la interfaz `ValidatableKnowledgeEntry` porque ambos admiten validación OBD (leer el código del vehículo real para confirmarlo). El código DTC concreto (ej. "P0301") viaja como parte de `embeddedText`.

**`diagnoses_index`** — Memoria de taller:

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `vector` | `FixedSizeList(384, Float32)` | Embedding de la narrativa del diagnóstico |
| `id` | `Utf8` | Identificador único (timestamp + random) |
| `embeddedText` | `Utf8` | Narrativa completa del diagnóstico resuelto |
| `manufacturer` | `Utf8` | Fabricante del vehículo |
| `model` | `Utf8` | Modelo del vehículo |
| `symptoms` | `Utf8` | Lista de síntomas serializada como JSON |
| `pidsInvolved` | `Utf8` | PIDs leídos durante el diagnóstico (JSON) |
| `confidence` | `Float32` | Confianza inicial: `0.5` (`PreviousDiagnosis`) |
| `source` | `Utf8` | Siempre `"previous_diagnosis"` |

> **Nota sobre tipos**: LanceDB en Node.js no acepta los nombres de tipo como cadenas (`"string"`, `"boolean"`) — requieren las clases Apache Arrow (`Utf8`, `Float32`, `Bool`). Esta decisión está documentada en `lancedb.ts` como protección contra un bug de la librería.

### 2.2.4 Scopes por vehículo

Las búsquedas pueden filtrarse por fabricante y modelo mediante la interfaz `VehicleScope`:

```typescript
// application/dto/vector/VehicleScope.ts
interface VehicleScope {
  readonly manufacturer?: string  // ej. "Audi"
  readonly model?: string         // ej. "A3"
}
```

El filtro se traduce a una cláusula SQL-style que LanceDB ejecuta sobre los metadatos. Si no se especifica ningún filtro, la búsqueda explora todo el catálogo (cross-manufacturer).

---

## 2.3 Pipeline de generación de embeddings

### 2.3.1 Modelo

| Propiedad | Valor |
|-----------|-------|
| **Nombre** | `Xenova/paraphrase-multilingual-MiniLM-L12-v2` |
| **Framework** | `@xenova/transformers` (Hugging Face Transformers para Node.js) |
| **Dimensiones** | **384** |
| **Normalización** | L2 (norma = 1) |
| **Pooling** | Mean pooling sobre todos los tokens |
| **Idiomas** | Español + inglés (multilingüe, 50+ idiomas) |
| **Tamaño del modelo** | ~118 MB (descarga única, cacheado en disco) |
| **RAM adicional** | ~300 MB en el proceso Node.js |
| **Ejecución** | CPU, in-process, sin API key, sin latencia de red |

### 2.3.2 Código de generación

```typescript
// infrastructure/persistence/vector/embedding.ts
const MODEL_NAME = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2'

let cachedPipeline: FeatureExtractionPipeline | null = null

export async function createEmbedding(text: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error('El texto no puede estar vacío')
  }

  const pipe = await getPipeline()  // Singleton cacheado
  const output = await pipe(text, {
    pooling: 'mean',     // Mean pooling sobre tokens
    normalize: true,     // L2 normalization
  })

  // output.tolist() devuelve [[...]] (batch de 1), extraemos la fila 0
  const [vector] = output.tolist() as number[][]
  return vector  // 384 floats, L2-norm = 1
}
```

El pipeline se cachea en memoria tras la primera carga. La función `resetEmbeddingCache()` existe únicamente para testing.

### 2.3.3 Serialización en LanceDB

El vector se almacena como `FixedSizeList(384, Float32)` de Apache Arrow. LanceDB resuelve la búsqueda por similitud sobre esta columna. Antes de insertar, se valida que el vector tenga exactamente 384 dimensiones: LanceDB no rechaza vectores de dimensión incorrecta (los rellena con `null` o trunca silenciosamente), lo que produciría resultados de similitud incorrectos.

---

## 2.4 Flujo de indexación (escritura)

### 2.4.1 Indexación de PIDs y DTCs (auto-aprendizaje)

El flujo está embebido en el **system prompt del LLM**. Cuando el modelo encuentra un PID en Mode 22 o un DTC propietario que no reconoce:

```
┌─────────────────────────────────────────────────────────────────┐
│  1. LLM recibe PID desconocido (ej. Mode 22, PID 0x1234)       │
│                          │                                       │
│                          ▼                                       │
│  2. LLM invoca search_similar_pids(search_similar_dtcs)         │
│     → ¿Ya existe en el catálogo?                                │
│                          │                                       │
│              ┌───────────┴───────────┐                          │
│              ▼                       ▼                          │
│         Existe y                  No existe                     │
│       confianza alta              o confianza                   │
│              │                    baja                           │
│              │                       │                          │
│              ▼                       ▼                          │
│        Usa el dato           3. LLM invoca web_search           │
│        existente                 (SerpAPI)                       │
│                                      │                          │
│                                      ▼                          │
│                              4. LLM invoca index_pid            │
│                                 / index_dtc con:                │
│                                 - embeddedText (descripción)    │
│                                 - manufacturer, model           │
│                                 - source: "web"                 │
│                                 - mode, pid, formula (si aplica)│
│                                      │                          │
│                                      ▼                          │
│                              5. Confianza inicial = 0.3 (web)  │
│                                 Si lo aporta el mecánico = 0.8  │
│                                      │                          │
│                                      ▼                          │
│                              6. ¿Incluye fórmula + rango?       │
│                                      │                          │
│                           ┌─────────┴─────────┐                │
│                           ▼ Sí                ▼ No              │
│                    ValidateDiscovered       Indexado sin        │
│                    PidUseCase               validar             │
│                    (lee PID real,           (validated=false)   │
│                     parsea, comprueba                           │
│                     rango)                                      │
│                           │                                     │
│                           ▼                                     │
│                    Si OK → confidence=0.7                       │
│                    validated=true                               │
│                    source="obd_validated"                       │
│                    Si no → descartado                           │
└─────────────────────────────────────────────────────────────────┘
```

La implementación en `mcpServer.ts` (`handleIndexPid`, `handleIndexDtc`):

```typescript
function handleIndexPid(stack: KnowledgeStackPort, obdRepo: ObdRepository): ToolHandler {
  return async (args) => {
    const source = resolveKnowledgeSource(args)
    const entry: PidKnowledgeEntry = { ...baseKnowledgeEntry(args, source), validated: false }

    // Si el LLM proporcionó fórmula de conversión, validar contra el vehículo
    const { mode, pid, formula, dataBytes } = args
    if (mode && pid && formula && dataBytes !== undefined) {
      const useCase = new ValidateDiscoveredPidUseCase()
      const result = await useCase.execute(entry, pidFormula, { minValue, maxValue }, obdRepo)
      await stack.pidsIndex.index(result.entry)
      return text(formatIndexedMessage('PID', result.entry, ...))
    }

    // Sin fórmula: indexar sin validar
    await stack.pidsIndex.index(entry)
    return text(formatIndexedMessage('PID', entry, false))
  }
}
```

### 2.4.2 Indexación de diagnósticos (memoria de taller)

Al finalizar cada diagnóstico cognitivo, el caso completo se indexa automáticamente en `diagnoses_index`:

```typescript
// application/use-cases/ExecuteCognitiveDiagnosisUseCase.ts

private async indexResolvedCase(
  text: string,
  toolCalls: readonly ToolCallTrace[],
  userQuery: string | undefined,
  vehicleContext: VehicleInfo | undefined,
): Promise<void> {
  const entry: DiagnosisKnowledgeEntry = {
    id: `${Date.now().toString(36)}-...`,
    embeddedText: text,                          // Narrativa del diagnóstico
    manufacturer: vehicleContext?.make ?? 'unknown',
    model: vehicleContext?.model ?? 'unknown',
    symptoms: userQuery?.trim() ? [userQuery.trim()] : [],
    pidsInvolved: toUniquePids(toolCalls),       // PIDs leídos durante el diagnóstico
    confidence: initialConfidenceFor(KnowledgeSource.PreviousDiagnosis),  // 0.5
    source: KnowledgeSource.PreviousDiagnosis,
  }
  await diagnosisIndex.index(entry)
}
```

### 2.4.3 Sistema de confianza

La confianza de cada entrada sigue una política definida en `confidenceScale.ts`:

| Procedencia (`KnowledgeSource`) | Confianza inicial | Tras validación OBD |
|--------------------------------|-------------------|---------------------|
| `web` | 0.3 | 0.7 (máx.) |
| `mechanic` | 0.8 | 0.9 (máx.) |
| `previous_diagnosis` | 0.5 | N/A (no validable vía OBD) |
| `obd_validated` | 1.0 | N/A (ya está confirmada) |

La función `markValidated()` aplica la transición de estado y escala la confianza. Existe además `boostConfidence()` (bonus de +0.2 por reutilización exitosa) implementada como función pura, pero **no está cableada a ningún flujo** — requeriría un botón de feedback del mecánico en la UI.

---

## 2.5 Flujo de búsqueda (RAG)

### 2.5.1 Búsqueda por similitud

Cuando se invoca una búsqueda (ya sea desde una tool MCP como `search_similar_pids` o desde el caso de uso `ExecuteCognitiveDiagnosisUseCase`), el flujo es:

```
┌──────────────────────────────────────────────────────────────────┐
│  search(query: string, options?: VectorSearchOptions)            │
│       │                                                          │
│       ▼                                                          │
│  1. createEmbedding(query) → vector de 384 dims (L2-norm=1)     │
│       │                                                          │
│       ▼                                                          │
│  2. store.query({ vector, limit: 5, filter: VehicleScope? })    │
│       │                                                          │
│       ▼                                                          │
│  3. LanceDB: table.search(vector).limit(5)                      │
│     - Métrica: L2 (Euclidean) por defecto                       │
│     - Sin índice ANN → búsqueda exacta (flat/brute-force)       │
│     - Para vectores L2-normalizados:                            │
│         cosine_similarity ≈ 1 - (L2_distance² / 2)              │
│       │                                                          │
│       ▼                                                          │
│  4. Filtros SQL: WHERE manufacturer='Audi' AND model='A3'       │
│     (escapado de literales contra inyección)                     │
│       │                                                          │
│       ▼                                                          │
│  5. Resultados ordenados por _distance ascendente                │
│     (menor distancia = más parecido)                             │
│       │                                                          │
│       ▼                                                          │
│  6. fromMetadata() reconstruye las entradas tipadas              │
│     → VectorSearchResult<TEntry>[]                               │
└──────────────────────────────────────────────────────────────────┘
```

### 2.5.2 Parámetros de búsqueda

| Parámetro | Valor por defecto | Descripción |
|-----------|-------------------|-------------|
| `limit` (top-K) | **5** | Nº máximo de resultados |
| `filter.manufacturer` | — | Filtro opcional por fabricante |
| `filter.model` | — | Filtro opcional por modelo |
| Métrica de distancia | **L2** (Euclidean) | Sobre vectores L2-normalizados ≈ cosine |
| Umbral de relevancia | **< 0.5** | Distancias menores se consideran "muy relevantes" |

> **¿Por qué L2 y no cosine?** LanceDB usa L2 por defecto. Como los embeddings están normalizados (L2-norm = 1), la distancia L2 es equivalente a la distancia coseno: `cos_sim = 1 - d²/2`. Una distancia de 0.5 equivale a una similitud coseno de ~0.875. El proyecto no configura un índice ANN (IVF-PQ) porque el corpus actual no lo justifica — la búsqueda exacta es correcta y suficientemente rápida.

### 2.5.3 Inyección en el prompt del LLM (RAG)

Antes de cada diagnóstico, el caso de uso `ExecuteCognitiveDiagnosisUseCase` ejecuta una **búsqueda proactiva** de casos similares:

```typescript
// retrieveSimilarCases() en ExecuteCognitiveDiagnosisUseCase
const results = await diagnosisIndex.search(query, {
  limit: DEFAULT_SEARCH_LIMIT,   // 5
  filter: { manufacturer: 'Audi', model: 'A3' }  // scope del vehículo actual
})
```

Los resultados se formatean como texto y se inyectan en el mensaje del usuario:

```
Casos similares previos:
1. (distancia 0.23) Audi A3 2018: fallo de encendido en cilindro 3, bujía defectuosa...
2. (distancia 0.41) Audi A3 2019: pérdida de potencia, fallo en bobina de encendido...
```

Esto se combina con el **system prompt**, que instruye al LLM a:

1. **Consultar el catálogo proactivamente** (`search_similar_diagnoses`, `search_similar_dtcs`) antes de leer datos del vehículo.
2. **Priorizar hipótesis** de casos anteriores con distancia < 0.5.
3. **Indexar descubrimientos** (PIDs y DTCs nuevos) para enriquecer el catálogo.
4. **Indexar el diagnóstico** al finalizar para futuros casos.

### 2.5.4 Tools MCP de conocimiento

El LLM dispone de **7 tools MCP** específicas para interactuar con la base de conocimiento:

| Tool MCP | Operación | Capa |
|----------|-----------|------|
| `search_similar_pids` | Buscar PIDs por similitud semántica | Lectura |
| `search_similar_dtcs` | Buscar DTCs por similitud semántica | Lectura |
| `search_similar_diagnoses` | Buscar diagnósticos previos con síntomas similares | Lectura |
| `index_pid` | Indexar un PID nuevo (con validación OBD opcional) | Escritura |
| `index_dtc` | Indexar un DTC nuevo (con validación OBD opcional) | Escritura |
| `index_diagnosis` | Guardar un caso de diagnóstico completado | Escritura |
| `web_search` | Buscar en internet información no encontrada en el catálogo | Fallback |

Las tres tools de búsqueda comparten la misma forma (query, manufacturer, model, limit) y usan una factory genérica `handleSearchSimilar<TEntry>()`. Los resultados se devuelven como texto formateado:

```
0.23 presión de aceite elevada en ralentí, Audi, A3
0.41 pérdida de presión de aceite en altas RPM, Audi, A4
```

### 2.5.5 Composición (wiring)

La conexión entre capas se realiza en `infrastructure/composition/composition.ts`:

```typescript
export async function createKnowledgeStack(
  config: AppConfig,
  logger: LoggerPort,
): Promise<KnowledgeStackWithStores | undefined> {
  const { db } = await initLanceDb(config.LANCEDB_PATH)
  const embed: EmbeddingGeneratorPort = createEmbedding

  const [pidsStore, dtcsStore, diagnosesStore] = await Promise.all([
    createLanceVectorStore(db, PIDS_TABLE_CONFIG),
    createLanceVectorStore(db, DTCS_TABLE_CONFIG),
    createLanceVectorStore(db, DIAGNOSES_TABLE_CONFIG),
  ])

  return {
    pidsIndex: createKnowledgeIndex({
      store: pidsStore, embed,
      toMetadata: toPidMetadata, fromMetadata: toPidEntry,
    }),
    dtcsIndex: createKnowledgeIndex({
      store: dtcsStore, embed,
      toMetadata: toDtcMetadata, fromMetadata: toDtcEntry,
    }),
    diagnosisIndex: createKnowledgeIndex({
      store: diagnosesStore, embed,
      toMetadata: toDiagnosisMetadata, fromMetadata: toDiagnosisEntry,
    }),
  }
}
```

Si LanceDB no puede inicializarse (por ejemplo, permisos de disco), el sistema continúa funcionando sin capacidad RAG — el logger emite un warning y `knowledgeStack` queda `undefined`. Esto sigue el principio de **degradación elegante**: el diagnóstico básico con tools OBD-II sigue disponible.

### 2.5.6 Distancia y relevancia numérica

Para interpretar los valores de distancia que el sistema maneja:

| Distancia L2 | Similitud coseno (aprox.) | Interpretación |
|-------------|--------------------------|----------------|
| 0.0 – 0.3 | 1.00 – 0.95 | Muy relevante — probablemente el mismo concepto |
| 0.3 – 0.5 | 0.95 – 0.88 | Relevante — concepto relacionado |
| 0.5 – 0.8 | 0.88 – 0.68 | Moderadamente relevante |
| 0.8 – 1.2 | 0.68 – 0.28 | Débilmente relacionado |
| > 1.2 | < 0.28 | Probablemente no relacionado |

El system prompt del LLM usa **0.5 como umbral de alta relevancia** (línea 35 de `ExecuteCognitiveDiagnosisUseCase.ts`): _"Si obtienes resultados con distancia < 0.5, considera que son muy relevantes: prioriza las hipótesis que ya funcionaron en casos anteriores"_.

---

## 2.6 Discrepancias detectadas

Comparación entre el **ADR 007** (`docs/adr/007-catalogo-auto-expansivo-lancedb.md`) y el **código real**:

| # | Discrepancia | ADR 007 | Código real | Impacto |
|---|-------------|---------|-------------|---------|
| 1 | **Índice ANN** | Dice _"Índice ANN vía IVF-PQ"_ (§1) | `lancedb.ts` línea 101-103: _"Sin indice: LanceDB resuelve por busqueda exacta [...] Si algun dia hace falta un IVF-PQ, se anade con el volumen delante"_ | Bajo. La búsqueda flat es correcta y rápida para el corpus actual (~cientos de entradas). El ADR describe una intención futura, no un hecho. |
| 2 | **Columna `validated` en DTCs** | Tabla DTC (§3): `manufacturer, model, confidence, source` (sin `validated`) | `vectorTableConfigs.ts`: `dtcs_index` incluye `validated: boolean` | Bajo. La columna existe y se usa (los DTCs sí se validan contra el vehículo real vía `ValidateDiscoveredDtcUseCase`). El ADR omitió este campo en la tabla. |
| 3 | **Columnas `confidence`/`source` en diagnoses** | Tabla diagnoses (§3): `manufacturer, model, symptoms, pids_involved` (sin `confidence` ni `source`) | `vectorTableConfigs.ts`: `diagnoses_index` incluye `confidence: float32` y `source: string` | Bajo. Las columnas existen y se usan. El ADR las omitió de la tabla pero las menciona en el sistema de confianza (§4). |
| 4 | **Convención de nombres** | ADR usa `pids_involved` (snake_case) | Código usa `pidsInvolved` (camelCase) | Nulo. Es diferencia de estilo de documentación, no de implementación. El ADR describe el concepto; el código sigue la convención camelCase de TypeScript. |
| 5 | **Nombre del campo de embedding** | ADR §3: _"Cada entrada se compone de `text` (texto para el embedding)"_ | Código usa `embeddedText` en todas las entradas | Nulo. Diferencia de nomenclatura en la documentación. El código es consistente en usar `embeddedText`. |
| 6 | **boostConfidence no cableado** | ADR §4 y nota 2026-08-09: explícitamente documentado como _"no se invoca desde ningún flujo"_ | Código: implementado como función pura en `confidenceScale.ts` pero sin wiring | Nulo. El ADR ya documenta esta limitación. No es una discrepancia, es deuda técnica conocida. |

**Resumen**: 0 discrepancias graves. Las diferencias son de documentación (ADR describe intención o usa nombres conceptuales) o de alcance (el ADR ya reconoce lo que falta). El código implementa fielmente el espíritu del ADR.

---

## 2.7 Resumen técnico para el tribunal

| Aspecto | Valor |
|---------|-------|
| **Motor vectorial** | LanceDB (embebido, sin servidor, Node.js nativo) |
| **Modelo de embeddings** | `Xenova/paraphrase-multilingual-MiniLM-L12-v2` |
| **Dimensiones** | 384 (Float32) |
| **Normalización** | L2 (norma = 1) |
| **Distancia** | L2 (Euclidean) ≈ cosine sobre vectores normalizados |
| **Búsqueda** | Exacta (flat), sin índice ANN |
| **Top-K por defecto** | 5 resultados |
| **Umbral de relevancia** | Distancia < 0.5 (~similitud coseno > 0.875) |
| **Colecciones** | `pids_index`, `dtcs_index`, `diagnoses_index` |
| **Idiomas** | Español + inglés (modelo multilingüe) |
| **Infraestructura** | Cero: in-process, sin API keys, sin servicios externos |
| **Degradación elegante** | Si LanceDB falla, el diagnóstico OBD-II básico sigue funcionando |

---

*Rutas investigadas para este documento (22 archivos):*

- `apps/core-api/src/infrastructure/persistence/vector/embedding.ts`
- `apps/core-api/src/infrastructure/persistence/vector/lancedb.ts`
- `apps/core-api/src/infrastructure/persistence/vector/lanceVectorStore.ts`
- `apps/core-api/src/infrastructure/persistence/vector/vectorTableConfigs.ts`
- `apps/core-api/src/application/knowledge/createKnowledgeIndex.ts`
- `apps/core-api/src/application/knowledge/dtcKnowledgeMapper.ts`
- `apps/core-api/src/application/knowledge/pidKnowledgeMapper.ts`
- `apps/core-api/src/application/knowledge/diagnosisKnowledgeMapper.ts`
- `apps/core-api/src/application/knowledge/validatableEntryMapper.ts`
- `apps/core-api/src/application/knowledge/confidenceScale.ts`
- `apps/core-api/src/application/dto/vector/VectorMatch.ts`
- `apps/core-api/src/application/dto/vector/VectorQuery.ts`
- `apps/core-api/src/application/dto/vector/VectorRecord.ts`
- `apps/core-api/src/application/dto/vector/VectorSearchOptions.ts`
- `apps/core-api/src/application/dto/vector/VectorSearchResult.ts`
- `apps/core-api/src/application/dto/vector/VehicleScope.ts`
- `apps/core-api/src/application/dto/knowledge/DtcKnowledgeEntry.ts`
- `apps/core-api/src/application/dto/knowledge/PidKnowledgeEntry.ts`
- `apps/core-api/src/application/dto/knowledge/DiagnosisKnowledgeEntry.ts`
- `apps/core-api/src/application/dto/knowledge/ValidationResult.ts`
- `apps/core-api/src/application/use-cases/ExecuteCognitiveDiagnosisUseCase.ts`
- `apps/core-api/src/infrastructure/mcp/mcpServer.ts` (funciones `handleSearchSimilar`, `handleIndexPid`, `handleIndexDtc`, `handleIndexDiagnosis`, `registerKnowledgeTools`)
- `apps/core-api/src/application/ports/` (VectorStorePort, VectorRepository, EmbeddingGeneratorPort, KnowledgeStackPort, PidVectorRepository, DtcVectorRepository, DiagnosisVectorRepository)
- `apps/core-api/src/infrastructure/composition/composition.ts` (función `createKnowledgeStack`)
- `apps/core-api/src/domain/value-objects/KnowledgeSource.ts`
- `docs/adr/007-catalogo-auto-expansivo-lancedb.md`
