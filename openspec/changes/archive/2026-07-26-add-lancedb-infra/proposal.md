## Why

Fase 4 requiere un catalogo auto-expansivo con busqueda semantica para PIDs, DTCs y casos de diagnostico. El ADR 007 define LanceDB como base vectorial embedded y transformers.js para embeddings locales multilingues. Antes de construir puertos, repositorios o tools MCP, necesitamos la infraestructura base: conexion a LanceDB, creacion de tablas, y generacion de embeddings.

## What Changes

- **Nuevas dependencias**: `@lancedb/lancedb` y `@xenova/transformers` en `apps/core-api`.
- **LanceDB**: `initLanceDb()` — conexion embedded a directorio en disco, `ensureTable()` — crea tablas con schema, validacion Zod de configuracion.
- **Embeddings**: `createEmbedding(text)` — genera vectores de 384 dimensiones con modelo `Xenova/paraphrase-multilingual-MiniLM-L12-v2`, lazy loading, normalizacion L2.
- **Tests unitarios completos** para ambos modulos con TDD estricto.

## Capabilities

### New Capabilities
- `lancedb-infra`: Conexion embedded a LanceDB (sin servidor, sin Docker) y generacion de embeddings locales multilingues (sin API key, sin coste).

## Impact

- Modificado: `apps/core-api/package.json` (agregar 2 dependencias)
- Nuevo: `apps/core-api/src/infrastructure/persistence/vector/lancedb.ts`
- Nuevo: `apps/core-api/src/infrastructure/persistence/vector/embedding.ts`
- Nuevo: `apps/core-api/tests/unit/infrastructure/persistence/vector/lancedb.test.ts`
- Nuevo: `apps/core-api/tests/unit/infrastructure/persistence/vector/embedding.test.ts`
- Sin cambios en dominio, application, rutas ni use cases existentes.
