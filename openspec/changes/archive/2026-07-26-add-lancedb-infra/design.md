## Context

Fase 4 del TFM: diagnostico cognitivo vehicular con busqueda semantica. Stack: TypeScript (ESM, strict), Express 5, Clean Architecture con factory functions y puertos con sufijo `Port`. ADR de referencia: `docs/adr/007-catalogo-auto-expansivo-lancedb.md`.

Este cambio es el primero de 6 cambios atomicos para Fase 4. Solo cubre la infraestructura base: conexion a LanceDB y generacion de embeddings. Los puertos, repositorios y tools MCP van en cambios posteriores.

## Goals / Non-Goals

**Goals:**
- Instalar `@lancedb/lancedb` y `@xenova/transformers` en `apps/core-api`.
- Implementar `initLanceDb()` — factory que conecta a LanceDB (embedded, directorio en disco).
- Implementar `ensureTable()` — crea tablas con schema de columnas si no existen.
- Implementar `createEmbedding(text)` — genera vector de 384 dimensiones con transformers.js.
- Lazy loading del modelo de embeddings (primera llamada carga, siguientes usan cache).
- Normalizacion L2 del vector resultante.
- Tests unitarios con mock de filesystem para LanceDB y mock de pipeline para transformers.

**Non-Goals:**
- Puertos `PidSearchRepositoryPort`, `DtcSearchRepositoryPort`, `DiagnosisMemoryRepositoryPort` (cambios #2, #3, #4).
- Tools MCP `search_similar_pids`, `index_pid`, etc. (cambios #2-#5).
- Web search ni validacion OBD (cambio #5).
- Sistema de confianza (cambio #5).
- Integracion con `executeCognitiveDiagnosis` (cambio #6).

## Decisions

### 1. LanceDB sobre Chroma o pgvector

**Elegido**: LanceDB. Embedded (directorio en disco), sin servidor, sin Docker, sin Python runtime. Soporte nativo Node.js con `@lancedb/lancedb`. Indice ANN via IVF-PQ. Mismo paradigma que SQLite: un directorio = una base de datos.

**Rechazado**:
- **Chroma**: requiere Python runtime y servidor separado — rompe "zero infraestructura".
- **pgvector**: requiere PostgreSQL corriendo. En desarrollo usamos SQLite, no encaja.

### 2. transformers.js (local) sobre OpenAI embeddings

**Elegido**: `@xenova/transformers` con modelo `Xenova/paraphrase-multilingual-MiniLM-L12-v2`. ~118 MB descarga inicial (cacheada en `~/.cache/huggingface/`), ~300 MB RAM, 384 dimensiones, soporte español+ingles. Sin API key, sin latencia de red, sin coste por embedding.

**Rechazado**: OpenAI `text-embedding-3-small`. API key, coste (~$0.02/M tokens), latencia de red. El modelo de pago se reserva para el diagnostico cognitivo (LLM); para busqueda interna el modelo local es mas adecuado.

### 3. Factory functions sobre clases

**Elegido**: `initLanceDb(dbPath?)` y `createEmbedding()` como factory functions. El proyecto usa exclusivamente factory functions, sin clases en ninguna capa.

### 4. Lazy loading del modelo de embeddings

**Elegido**: El pipeline de transformers.js se inicializa en la primera llamada a `createEmbedding()` y se cachea en variable de modulo. Esto evita cargar ~300 MB de modelo al iniciar el servidor si nunca se usa busqueda semantica.

### 5. Normalizacion L2 del embedding

**Elegido**: Normalizar el vector resultante a norma L2 = 1. Esto asegura que cosine similarity y dot product sean equivalentes, simplificando las busquedas en LanceDB (que usa inner product por defecto en indices ANN).

## Data Model

### initLanceDb
```typescript
interface LanceDbConnection {
  db: Connection;
  tableNames: string[];
}

function initLanceDb(dbPath?: string): Promise<LanceDbConnection>;
// dbPath default: "./data/lancedb"
```

### ensureTable
```typescript
function ensureTable(
  db: Connection,
  name: string,
  schema: Array<{ name: string; type: "string" | "float32" | "int32" | "boolean" }>
): Promise<Table>;
```

### createEmbedding
```typescript
function createEmbedding(text: string): Promise<number[]>;
// Retorna vector de 384 dimensiones normalizado (L2 = 1)
// Lanza si text es string vacio
```

## Error Handling

| Error | Causa | Comportamiento |
|---|---|---|
| LanceDB connection error | Directorio sin permisos o corrupto | Se propaga al caller |
| `ensureTable` con schema invalido | Tipos no soportados | Validacion Zod previa |
| `createEmbedding("")` | Texto vacio | Lanza error de validacion |
| Modelo no descargado | Sin conexion en primera llamada | Error de transformers.js, se propaga |
| `createEmbedding` con texto muy largo (>512 tokens) | Excede contexto del modelo | El modelo trunca automaticamente |

## Risks / Trade-offs

- [Descarga de modelo en primera llamada] → ~118 MB, ~30-60s en conexion lenta. Mitigacion: lazy loading; solo se descarga si se usa busqueda semantica.
- [Memoria RAM del modelo] → ~300 MB en runtime. Mitigacion: aceptable para un servidor de desarrollo/demo. En produccion se podria mover a un worker thread.
- [Mock de transformers.js en tests] → Los tests unitarios mockean `pipeline()`. Mitigacion: los tests de integracion (si se añaden) validarian con el modelo real.
