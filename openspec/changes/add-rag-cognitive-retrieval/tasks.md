## 0. Preparación

- [ ] 0.1 Confirmar rama `feat/rag-cognitive-retrieval` (creada desde `develop`)
- [ ] 0.2 Verificar baseline: `pnpm lint && pnpm format && pnpm test && pnpm build` en verde, anotar nº de tests
- [ ] 0.3 Cargar contexto: ADR-007, `proposal.md`/`design.md` de este cambio, spec archivada `vector-repositories`

## 1. `ExecuteCognitiveDiagnosisUseCase` — objeto de opciones

- [ ] 1.1 RED: test que instancia el caso de uso con `new ExecuteCognitiveDiagnosisUseCase({ llmClient, tools, handler })` (sin `diagnosisIndex`) y falla porque el constructor sigue siendo posicional
- [ ] 1.2 GREEN: `ExecuteCognitiveDiagnosisUseCaseOptions` con `llmClient`, `tools`, `handler`, `diagnosisIndex?: DiagnosisVectorRepository`; constructor recibe el objeto
- [ ] 1.3 Actualizar `diagnosisService.ts` (único call-site) al nuevo objeto de opciones
- [ ] 1.4 Actualizar los tests existentes de `ExecuteCognitiveDiagnosisUseCase` y de `diagnosisService` que instancian el caso de uso con la firma antigua
- [ ] 1.5 REFACTOR: con la suite en verde — extraer un helper de construcción de opciones en los tests si el objeto se repite en cada `it`, y revisar que los campos de `ExecuteCognitiveDiagnosisUseCaseOptions` estén ordenados y documentados con TSDoc

## 2. Recuperación de contexto (RAG search)

- [ ] 2.1 RED: test — con `diagnosisIndex` mockeado devolviendo resultados, el `userMessage` enviado a `llmClient.sendMessage` incluye la sección "Casos similares previos"
- [ ] 2.2 GREEN: `buildUserMessage` gana un parámetro con los resultados recuperados; se arma la sección solo si `results.length > 0`
- [ ] 2.3 RED: test — sin `diagnosisIndex`, el mensaje es idéntico al actual (snapshot del comportamiento previo)
- [ ] 2.4 RED: test — `diagnosisIndex` presente pero `search` resuelve `[]`, el mensaje es idéntico al actual
- [ ] 2.5 GREEN: en `execute()`, si `diagnosisIndex` está presente, invocar `search(query, { limit, filter })` antes de llamar al LLM; `query` = `userQuery` o `"diagnóstico general <make> <model>"` si falta; `filter` = `{ manufacturer, model }` del `vehicleContext` cuando existan
- [ ] 2.6 RED: test — `diagnosisIndex.search` rechaza; el diagnóstico se completa igual, con el mensaje sin sección de contexto, y se registra `logger.warn` — **requiere** inyectar `logger` en el caso de uso si no está ya disponible (ver 2.7)
- [ ] 2.7 Decidir e implementar cómo llega `logger` al caso de uso: añadir `logger: LoggerPort` a `ExecuteCognitiveDiagnosisUseCaseOptions` (mismo patrón que `DiagnosisServiceOptions`)
- [ ] 2.8 GREEN: envolver la búsqueda en `try/catch`, loggear y continuar con `results = []` en caso de fallo
- [ ] 2.9 REFACTOR: con la suite en verde — extraer el armado de la sección "Casos similares previos" a una función pura testeable aparte de `buildUserMessage`; constantes con nombre para el límite de resultados y el encabezado; verificar que la ruta "sin resultados" y la ruta "sin índice" comparten un único camino de código, no dos ramas duplicadas

## 3. Indexado del caso al cerrar

- [ ] 3.1 RED: test — con `diagnosisIndex` presente, tras `execute()` se invoca `diagnosisIndex.index(entry)` con `embeddedText` = narrativa del LLM, `manufacturer`/`model` del `vehicleContext` (o `'unknown'`), `symptoms` = `[userQuery]` o `[]`, `pidsInvolved` = PIDs únicos de `toolCalls` con `tool === 'read_pid'`
- [ ] 3.2 GREEN: construir el `DiagnosisKnowledgeEntry` (con `id: crypto.randomUUID()`) e invocarlo tras obtener `parsed`, antes de construir el `ExecuteCognitiveDiagnosisOutput`
- [ ] 3.3 RED: test — sin `diagnosisIndex`, no se invoca ningún indexado (spy no llamado, ni siquiera se intenta)
- [ ] 3.4 RED: test — `diagnosisIndex.index` rechaza; la respuesta ya calculada se devuelve igual y se registra `logger.warn`
- [ ] 3.5 GREEN: envolver el indexado en `try/catch` independiente del de la búsqueda
- [ ] 3.6 REFACTOR: con la suite en verde — extraer la construcción del `DiagnosisKnowledgeEntry` a una función pura (`toDiagnosisEntry(input, output, toolCalls)`) fuera del `execute()`; constante con nombre para `'read_pid'` y para el `'unknown'` de fabricante/modelo; unificar los dos `try/catch` de búsqueda e indexado en un helper compartido si el patrón resulta idéntico

## 4. `DiagnosisService` — propagar `diagnosisIndex`

- [ ] 4.1 RED: test de `diagnosisService.test.ts` — `cognitiveDiagnosis()` construye `ExecuteCognitiveDiagnosisUseCase` con el `diagnosisIndex` recibido en `DiagnosisServiceOptions`
- [ ] 4.2 GREEN: `DiagnosisServiceOptions` gana `diagnosisIndex?: DiagnosisVectorRepository`; se guarda en el campo privado y se pasa al construir el caso de uso
- [ ] 4.3 REFACTOR: con la suite en verde — revisar que `cognitiveDiagnosis()` no haya acumulado ramas por dependencias opcionales (`llmClient`, `obdRepo`, `diagnosisIndex`); si las guardas se repiten, extraerlas

## 5. Wiring en `composition.ts`

- [ ] 5.1 RED: test unitario de `createKnowledgeStack` (exportada para test o probada vía `buildApp`) — con `initLanceDb`/`createLanceVectorStore` mockeados en éxito, devuelve los tres índices
- [ ] 5.2 GREEN: `createKnowledgeStack(config, logger)` — abre `initLanceDb(config.LANCEDB_PATH)`, crea los tres `VectorStore` en paralelo (`Promise.all`) y los tres índices con `createKnowledgeIndex` + los mappers ya existentes de `application/knowledge/`
- [ ] 5.3 RED: test — `initLanceDb` (o cualquiera de los tres `createLanceVectorStore`) rechaza; `createKnowledgeStack` devuelve `undefined` y se registra `logger.warn`, sin propagar la excepción
- [ ] 5.4 GREEN: envolver `createKnowledgeStack` en `try/catch`
- [ ] 5.5 `buildApp` pasa a `async function buildApp(config): Promise<Application>`; llama a `createKnowledgeStack` y pasa `stack?.diagnosisIndex` a `DiagnosisService`
- [ ] 5.6 Actualizar `main.ts`: `const app = await buildApp(config)`
- [ ] 5.7 Verificar con `grep` que ningún otro fichero invoca `buildApp` de forma síncrona sin `await`
- [ ] 5.8 REFACTOR: con la suite en verde — eliminar la triplicación del trío `createLanceVectorStore` + `createKnowledgeIndex` + mapper (tabla de configuración recorrida, no tres bloques copiados); `KnowledgeStack` documentado con TSDoc incluyendo por qué `pidsIndex`/`dtcsIndex` no tienen consumidor todavía

## 6. Integración de extremo a extremo

- [ ] 6.1 Test de integración (con `diagnosisIndex` real sobre LanceDB en directorio temporal, embedding inyectado determinista — mismo patrón que el bloque #1): indexar un caso, ejecutar una segunda consulta similar y verificar que aparece en el `userMessage` construido
- [ ] 6.2 Verificar con `grep` que `ExecuteCognitiveDiagnosisUseCase.ts` no importa nada de `infrastructure/` ni de `@lancedb/lancedb`/`apache-arrow`/`@xenova/transformers`

## 7. Cierre

- [ ] 7.1 Revisión transversal (NO sustituye a los REFACTOR de cada fase, que ya deben estar hechos): coherencia de nombres entre fases y `@reviewer` sobre el diff completo
- [ ] 7.2 `pnpm lint && pnpm format && pnpm test && pnpm build` — los cuatro en verde
- [ ] 7.3 `gga run` (o el hook de pre-commit configurado) en verde
- [ ] 7.4 Actualizar `SESION ACTUAL` en `AGENTS.md`
- [ ] 7.5 Guardar resumen y decisiones no obvias en Engram
- [ ] 7.6 **Preguntar antes de commitear/pushear** (regla 7) — mostrar resumen de cambios y esperar OK humano
