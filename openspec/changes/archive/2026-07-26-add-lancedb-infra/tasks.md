## 1. Dependencias

- [x] 1.1 Instalar `@lancedb/lancedb` en `apps/core-api`: `pnpm add @lancedb/lancedb`
- [x] 1.2 Instalar `@xenova/transformers` en `apps/core-api`: `pnpm add @xenova/transformers`
- [x] 1.3 Verificar que `pnpm build` compila con las nuevas dependencias.

## 2. LanceDB — init + ensureTable (TDD)

- [x] 2.1 RED: Escribir `tests/unit/infrastructure/persistence/vector/lancedb.test.ts`:
  - `initLanceDb()` conecta a un directorio temporal y devuelve `{ db, tableNames }`
  - `initLanceDb()` sin parametro usa default `./data/lancedb`
  - `ensureTable(db, name, schema)` crea tabla con columnas
  - `ensureTable()` con tabla existente no lanza error (idempotente)
  - Schema con tipo no soportado lanza error de validacion Zod
- [x] 2.2 GREEN: Implementar `src/infrastructure/persistence/vector/lancedb.ts`:
  - `initLanceDb(dbPath?: string): Promise<LanceDbConnection>`
  - `ensureTable(db, name, schema): Promise<Table>`
  - Zod schema para validar configuracion de columnas
- [x] 2.3 REFACTOR: TSDoc en exports, extraer constantes (default path).

## 3. Embeddings — createEmbedding (TDD)

- [x] 3.1 RED: Escribir `tests/unit/infrastructure/persistence/vector/embedding.test.ts`:
  - `createEmbedding("Engine Oil Pressure")` devuelve `number[]` de 384 dimensiones
  - Vector normalizado: norma L2 ≈ 1.0 (tolerancia 0.01)
  - Dos textos similares producen vectores con cosine similarity > 0.7
  - Dos textos distintos producen vectores con cosine similarity < 0.5
  - Lazy loading: primera llamada carga el modelo (mock verifica que `pipeline` se llama una vez)
  - Segunda llamada reusa el modelo cacheado (mock verifica que `pipeline` no se vuelve a llamar)
  - `createEmbedding("")` lanza error de validacion
  - Texto en español genera embedding valido
- [x] 3.2 GREEN: Implementar `src/infrastructure/persistence/vector/embedding.ts`:
  - `createEmbedding(text: string): Promise<number[]>`
  - Lazy init: `pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2')`
  - Normalizar embedding (norma L2 = 1)
  - Validar que text no sea vacio
- [x] 3.3 REFACTOR: TSDoc en exports, extraer constantes (modelo, dimensiones, threshold).

## 4. Verificacion final

- [x] 4.1 Ejecutar `pnpm lint && pnpm format && pnpm test && pnpm build`
- [x] 4.2 Ejecutar `pnpm test:coverage` — nuevos archivos >= 80% statements/lines
- [x] 4.3 Verificar que no hay imports circulares ni violaciones de capas
- [x] 4.4 Actualizar `CLAUDE.md` con estado de sesion
