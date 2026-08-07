## 0. Preparación

- [ ] 0.1 Confirmar que `add-rag-cognitive-retrieval` y `add-knowledge-confidence-validation` están mergeados a `develop`; crear `feat/knowledge-mcp-tools`
- [ ] 0.2 Verificar baseline: `pnpm lint && pnpm format && pnpm test && pnpm build` en verde, anotar nº de tests
- [ ] 0.3 Cargar contexto: ADR-007 §6-§7, este `proposal.md`/`design.md`, `mcpServer.ts`, `diagnosisService.ts`, `Validate*UseCase.ts` y `confidenceScale.ts` de `add-knowledge-confidence-validation`

## 1. `KnowledgeStack` a `application/ports/`

- [ ] 1.1 RED: test — importar `KnowledgeStack` desde `@/application/ports/KnowledgeStack.js` falla porque el módulo no existe
- [ ] 1.2 GREEN: crear `application/ports/KnowledgeStack.ts`; actualizar `composition.ts` para importar el tipo desde ahí en vez de definirlo localmente
- [ ] 1.3 REFACTOR: con la suite en verde — TSDoc de `KnowledgeStack` explicando por qué agrupa los tres índices (comparten conexión LanceDB y `EmbeddingGenerator`)

## 2. `createMcpServer` con tercer parámetro

- [ ] 2.1 RED: test — `createMcpServer(repo, undefined, knowledgeStackMock).listTools()` no incluye las 6 tools de conocimiento (fallan porque no existen todavía)
- [ ] 2.2 GREEN: `createMcpServer(repo, vehicleRepo?, knowledgeStack?)`; `registerKnowledgeTools(register, stack)` — placeholder que registra las 6 tools con handlers mínimos (solo `search_similar_pids` funcional aún, resto placeholder) para validar el cableado de registro condicional
- [ ] 2.3 RED: test — `createMcpServer(repo)` sin tercer argumento, `listTools()` no incluye ninguna tool de conocimiento
- [ ] 2.4 RED: test — invocar `search_similar_pids` vía `callTool` sin `knowledgeStack` lanza `ToolNotFoundError`
- [ ] 2.5 GREEN: envolver la llamada a `registerKnowledgeTools` en un `if (knowledgeStack)`
- [ ] 2.6 REFACTOR: con la suite en verde — revisar que `registerKnowledgeTools` siga la misma forma que `registerDiagnosticTools` (mismo orden de parámetros, mismo estilo de JSDoc)

## 3. `search_similar_pids` / `search_similar_dtcs` / `search_similar_diagnoses`

- [ ] 3.1 RED: test — `search_similar_pids` con `pidsIndex.search` mockeado devolviendo resultados, el texto de respuesta lista distancia + campos
- [ ] 3.2 GREEN: implementar `handleSearchSimilarPids(stack)` y su registro con schema Zod `{ query, manufacturer?, model?, limit? }`
- [ ] 3.3 RED: test — `pidsIndex.search` resuelve `[]`, el texto indica ausencia de resultados sin `isError`
- [ ] 3.4 GREEN: cubrir el caso vacío
- [ ] 3.5 RED + GREEN (repetir 3.1-3.4 para `search_similar_dtcs` sobre `dtcsIndex` y `search_similar_diagnoses` sobre `diagnosisIndex`)
- [ ] 3.6 REFACTOR: con la suite en verde — extraer un formateador de resultados de búsqueda compartido (`formatSearchResults(results, fieldsToShow)`) parametrizado por los campos a mostrar de cada tipo de entrada, ya que las tres tools de búsqueda son estructuralmente idénticas salvo el índice y los campos

## 4. `index_pid` con validación síncrona

- [ ] 4.1 RED: test — `index_pid` sin datos de validación indexa una entrada con `confidence` inicial según `source` y `validated: false`; `pidsIndex.index` se invoca una sola vez
- [ ] 4.2 GREEN: implementar `handleIndexPid(stack, obdRepo)` — construye `PidKnowledgeEntry` con `id: crypto.randomUUID()`, `confidence: initialConfidenceFor(source)`, `validated: false`, indexa
- [ ] 4.3 RED: test — `index_pid` con `mode`/`pid`/`formula`/`dataBytes` y `obdRepo` que valida dentro de rango: se invoca `ValidateDiscoveredPidUseCase` antes del único `pidsIndex.index`, la entrada indexada tiene `validated: true` y `confidence` escalada
- [ ] 4.4 GREEN: integrar `ValidateDiscoveredPidUseCase` en el handler cuando los campos de validación están presentes
- [ ] 4.5 RED: test — validación `out_of_range`/`no_vehicle`/`unsupported`: se indexa igual, sin escalar confianza, y el texto de respuesta menciona el motivo
- [ ] 4.6 GREEN: mapear el `outcome` del caso de uso al texto de respuesta
- [ ] 4.7 REFACTOR: con la suite en verde — extraer la construcción del `PidKnowledgeEntry` desde los args de la tool a una función pura testeable; constantes con nombre para los mensajes de respuesta por `outcome`

## 5. `index_dtc` con validación síncrona

- [ ] 5.1 RED: test — `index_dtc` sin `code` indexa sin validar
- [ ] 5.2 GREEN: implementar `handleIndexDtc(stack, obdRepo)` análogo a `handleIndexPid` sin fórmula
- [ ] 5.3 RED: test — `index_dtc` con `code` presente en `readDtcCodes()` indexa con `validated: true` y confianza escalada
- [ ] 5.4 RED: test — `code` ausente o `obdRepo` indefinido, indexa sin validar
- [ ] 5.5 GREEN: integrar `ValidateDiscoveredDtcUseCase`
- [ ] 5.6 REFACTOR: con la suite en verde — comparar `handleIndexPid`/`handleIndexDtc`; extraer el patrón común "validar si hay datos suficientes, indexar una vez" a un helper genérico solo si no complica la lectura (cada uno usa un caso de uso distinto con forma de entrada distinta)

## 6. `index_diagnosis`

- [ ] 6.1 RED: test — `index_diagnosis` indexa con `confidence: 0.5` y `source: PreviousDiagnosis` fijos, ignorando cualquier campo de confianza que se intentara pasar
- [ ] 6.2 GREEN: implementar `handleIndexDiagnosis(stack)`
- [ ] 6.3 REFACTOR: con la suite en verde — TSDoc explicando por qué `confidence`/`source` no son parámetros de la tool (siempre `PreviousDiagnosis` al origen)

## 7. `DiagnosisServiceOptions.diagnosisIndex` → `knowledgeStack`

- [ ] 7.1 RED: test de `diagnosisService.test.ts` — construir `DiagnosisService` con `knowledgeStack: { pidsIndex, dtcsIndex, diagnosisIndex }` falla porque la opción no existe todavía
- [ ] 7.2 GREEN: `DiagnosisServiceOptions` gana `knowledgeStack?: KnowledgeStack`, se elimina `diagnosisIndex` suelto; `cognitiveDiagnosis()` pasa `this.knowledgeStack` a `createMcpServer(repository, undefined, this.knowledgeStack)` y `diagnosisIndex: this.knowledgeStack?.diagnosisIndex` al caso de uso; `callMcpTool()` pasa `this.knowledgeStack` también
- [ ] 7.3 RED: test — `callMcpTool('search_similar_pids', ...)` con `knowledgeStack` presente devuelve resultados de búsqueda (antes `callMcpTool` no tenía forma de llegar a estas tools)
- [ ] 7.4 GREEN: confirmar que el test de 7.3 pasa con el cableado de 7.2
- [ ] 7.5 Actualizar todos los tests existentes de `diagnosisService.ts`/`ExecuteCognitiveDiagnosisUseCase.ts` que mockean `diagnosisIndex` suelto (de `add-rag-cognitive-retrieval`) al nuevo `knowledgeStack`
- [ ] 7.6 REFACTOR: con la suite en verde — revisar que no queden referencias a `diagnosisIndex` como campo suelto de `DiagnosisServiceOptions` (`grep`); actualizar TSDoc de `DiagnosisServiceOptions.knowledgeStack`

## 8. Integración de extremo a extremo

- [ ] 8.1 Test de integración: `createMcpServer` con un `KnowledgeStack` real sobre LanceDB en directorio temporal (embedding inyectado determinista, mismo patrón que bloques anteriores) — indexar un PID vía `index_pid`, buscarlo vía `search_similar_pids`, verificar que aparece
- [ ] 8.2 Verificar con `grep` que `mcpServer.ts` no importa nada de `infrastructure/composition/`

## 9. Cierre

- [ ] 9.1 Revisión transversal (NO sustituye a los REFACTOR de cada fase, que ya deben estar hechos): coherencia entre las 6 tools y `@reviewer` sobre el diff completo
- [ ] 9.2 `pnpm lint && pnpm format && pnpm test && pnpm build` — los cuatro en verde
- [ ] 9.3 `gga run` (o el hook de pre-commit configurado) en verde
- [ ] 9.4 Actualizar `SESION ACTUAL` en `AGENTS.md`
- [ ] 9.5 Guardar resumen y decisiones no obvias en Engram
- [ ] 9.6 **Preguntar antes de commitear/pushear** (regla 7) — mostrar resumen de cambios y esperar OK humano
