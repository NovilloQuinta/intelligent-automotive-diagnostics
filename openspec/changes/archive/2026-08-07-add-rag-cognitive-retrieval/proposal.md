## Why

El ADR-007 define un catálogo auto-expansivo: el sistema recuerda casos de diagnóstico resueltos y los reutiliza para razonar mejor sobre vehículos futuros. El cambio anterior (`archive/2026-08-07-add-rag-vector-repositories`) entregó toda la fontanería vectorial — puertos, servicios de aplicación, adaptador LanceDB, `createKnowledgeIndex` — pero **nadie la usa**. `composition.ts` no instancia ningún `VectorStore` ni índice de conocimiento, y `ExecuteCognitiveDiagnosisUseCase` construye el prompt exactamente igual que si el ADR-007 no existiera: sin contexto recuperado y sin aprender del caso que acaba de resolver.

Este es el bloque **2 de 4** del plan RAG (`docs/adr/007-catalogo-auto-expansivo-lancedb.md`): cablear lo ya construido para que el diagnóstico cognitivo recupere casos similares antes de responder y guarde el caso resuelto al terminar. Sin esto, la infraestructura vectorial sigue siendo peso muerto — módulos correctos que ningún flujo real invoca.

## What Changes

### 1. Wiring en `composition.ts`

- Nueva función privada `createKnowledgeStack(config, logger)` que instancia el `EmbeddingGenerator` (`createEmbedding` de `embedding.ts`, ya perezoso) y, para las tres tablas (`pids_index`, `dtcs_index`, `diagnoses_index`), abre `initLanceDb(config.LANCEDB_PATH)` una única vez y crea los tres `VectorStore` vía `createLanceVectorStore` + los tres índices vía `createKnowledgeIndex`.
- Se ejecuta dentro de un `try/catch`: si falla (disco no escribible, esquema corrupto), se loggea `warn` con la causa y `buildApp` continúa sin índices — igual que hoy ocurre con `llmClient` u `obdRepo` ausentes.
- Solo se construye el índice `diagnoses_index` como dependencia inyectada en el flujo de diagnóstico cognitivo. `pids_index` y `dtcs_index` se cablean también (misma factory, mismo coste) porque los usará el bloque #3 (7 tools MCP) sin volver a tocar `composition.ts`, pero **no se inyectan** en `ExecuteCognitiveDiagnosisUseCase` en este cambio.

### 2. Recuperación de contexto en `ExecuteCognitiveDiagnosisUseCase`

- El caso de uso pasa de tres parámetros posicionales a un objeto de opciones `ExecuteCognitiveDiagnosisUseCaseOptions`, con `diagnosisIndex?: DiagnosisVectorRepository` como dependencia opcional añadida a las tres actuales.
- Antes de invocar al LLM, si `diagnosisIndex` está presente, busca casos similares con `diagnosisIndex.search(...)` usando `userQuery` + fabricante/modelo del `vehicleContext` como filtro. El resultado (0 a N casos) se inserta en `buildUserMessage` como una sección adicional; si no hay resultados o no hay índice, el mensaje es idéntico al actual.
- La búsqueda se envuelve en `try/catch`: cualquier fallo (LanceDB caído, timeout del modelo) se loggea y el diagnóstico continúa sin contexto recuperado. El diagnóstico cognitivo NUNCA falla por un problema del RAG.

### 3. Indexado del caso al cerrar

- Tras obtener el diagnóstico parseado, si `diagnosisIndex` está presente, se construye un `DiagnosisKnowledgeEntry` (texto = narrativa del diagnóstico; metadatos = fabricante/modelo del vehículo, síntomas = `userQuery`, PIDs implicados = extraídos de `toolCalls` filtrando la tool `read_pid`) y se indexa con `diagnosisIndex.index(entry)`.
- Mismo patrón de degradación: `try/catch` + `logger.warn`, nunca bloquea ni invalida la respuesta ya calculada.

### 4. `DiagnosisService` propaga la nueva dependencia opcional

- `DiagnosisServiceOptions` gana `diagnosisIndex?: DiagnosisVectorRepository`, que `cognitiveDiagnosis()` pasa al construir `ExecuteCognitiveDiagnosisUseCase`.

## Lo que NO cambia

- Las 6 tools MCP de conocimiento (`search_similar_pids`, `index_pid`, `search_similar_dtcs`, `index_dtc`, `search_similar_diagnoses`, `index_diagnosis`) y `web_search` — bloque #3 y #4 del ADR-007 (§7, §5).
- El sistema de confianza (`KnowledgeSource`, escalado de `confidence`) y la validación OBD de PIDs/DTCs descubiertos — bloque #3 (§4).
- `pids_index` y `dtcs_index` no se leen ni escriben desde el diagnóstico cognitivo en este cambio; solo se instancian en `composition.ts` para que el bloque #3 no repita el wiring.
- `createKnowledgeIndex`, los mappers de conocimiento, `lanceVectorStore.ts`, `lancedb.ts`, `embedding.ts` — sin cambios, ya entregados y probados.
- La firma pública HTTP de `POST /api/diagnose/cognitive` (o el endpoint equivalente) — el contrato externo no cambia, solo mejora la calidad de la respuesta cuando hay casos previos.

## Capabilities

### Added Capabilities
- `rag-cognitive-retrieval`: el diagnóstico cognitivo recupera casos de diagnóstico previos similares antes de responder y guarda el caso resuelto al terminar, con degradación total si LanceDB o el modelo de embeddings no están disponibles.

## Impact

- **Modificado**: `apps/core-api/src/infrastructure/composition/composition.ts` (nueva función `createKnowledgeStack`, wiring en `buildApp`)
- **Modificado**: `apps/core-api/src/application/use-cases/ExecuteCognitiveDiagnosisUseCase.ts` (constructor a objeto de opciones, recuperación + indexado)
- **Modificado**: `apps/core-api/src/infrastructure/services/diagnosisService.ts` (`DiagnosisServiceOptions` + paso de `diagnosisIndex`)
- **Nuevo**: tests unitarios de `ExecuteCognitiveDiagnosisUseCase` con `diagnosisIndex` mockeado (con y sin resultados, con fallo simulado)
- **Nuevo**: test de `createKnowledgeStack` / `buildApp` verificando degradación cuando LanceDB falla
- **Sin cambios**: `application/knowledge/`, `application/ports/{VectorStore,EmbeddingGenerator,VectorRepository,PidVectorRepository,DtcVectorRepository,DiagnosisVectorRepository}.ts`, `infrastructure/persistence/vector/*`, `infrastructure/mcp/mcpServer.ts`
