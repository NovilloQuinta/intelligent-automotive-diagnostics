# RAG Cognitive Retrieval

## Purpose

Cablear la infraestructura vectorial del ADR-007 (bloque #1) en el flujo real de diagnóstico cognitivo: recuperar casos de diagnóstico previos similares antes de responder y guardar el caso resuelto al terminar, con degradación total si el motor vectorial o el modelo de embeddings no están disponibles.

## ADDED Requirements

### Requirement: Wiring del stack de conocimiento en composition root
El sistema SHALL instanciar en `composition.ts` un `VectorStore` y un índice de conocimiento (vía `createKnowledgeIndex`) para cada una de las tres tablas del ADR-007 (`pids_index`, `dtcs_index`, `diagnoses_index`), compartiendo una única conexión LanceDB y un único `EmbeddingGenerator`.

#### Scenario: Inicialización correcta
- **WHEN** `buildApp` arranca con `LANCEDB_PATH` accesible
- **THEN** se construyen los tres índices de conocimiento
- **AND** solo `diagnosisIndex` se inyecta en `DiagnosisService`

#### Scenario: Fallo de inicialización no bloquea el arranque
- **WHEN** `initLanceDb` o `createLanceVectorStore` lanzan una excepción
- **THEN** `buildApp` continúa sin el stack de conocimiento
- **AND** se registra un aviso con `logger.warn`
- **AND** la aplicación arranca y sirve el resto de endpoints con normalidad

---

### Requirement: Recuperación de contexto en el diagnóstico cognitivo
`ExecuteCognitiveDiagnosisUseCase` SHALL aceptar una dependencia opcional `diagnosisIndex: DiagnosisVectorRepository` y, cuando esté presente, SHALL buscar casos de diagnóstico similares antes de invocar al LLM, incorporando los resultados al mensaje de usuario.

#### Scenario: Contexto disponible
- **WHEN** `diagnosisIndex` está presente y la búsqueda devuelve uno o más casos
- **THEN** el mensaje de usuario incluye una sección "Casos similares previos" con la narrativa y la distancia de cada resultado
- **AND** el resto del mensaje (vehículo, consulta) no cambia

#### Scenario: Sin resultados
- **WHEN** la búsqueda no devuelve ningún caso
- **THEN** el mensaje de usuario es idéntico al que se genera sin `diagnosisIndex`
- **AND** no se añade ningún texto indicando ausencia de resultados

#### Scenario: Índice ausente
- **WHEN** `diagnosisIndex` no se inyecta (no configurado o degradado)
- **THEN** el caso de uso no intenta ninguna búsqueda
- **AND** el diagnóstico se comporta exactamente igual que antes de este cambio

#### Scenario: Fallo de la búsqueda no interrumpe el diagnóstico
- **WHEN** `diagnosisIndex.search(...)` rechaza (LanceDB no disponible, timeout del modelo)
- **THEN** el error se captura y se registra con `logger.warn`
- **AND** el diagnóstico continúa sin contexto recuperado, como si no hubiera resultados

---

### Requirement: Indexado del caso resuelto
Al completar un diagnóstico cognitivo con `diagnosisIndex` presente, el sistema SHALL indexar el caso como una nueva entrada en `diagnoses_index`, con el fabricante, modelo, síntomas y PIDs consultados durante el diagnóstico.

#### Scenario: Indexado exitoso
- **WHEN** el LLM devuelve una narrativa de diagnóstico y `diagnosisIndex` está presente
- **THEN** se construye un `DiagnosisKnowledgeEntry` con la narrativa como `embeddedText`, el fabricante/modelo del vehículo y los PIDs leídos vía la tool `read_pid`
- **AND** se invoca `diagnosisIndex.index(entry)`

#### Scenario: Fallo del indexado no invalida la respuesta
- **WHEN** `diagnosisIndex.index(...)` rechaza
- **THEN** el error se captura y se registra con `logger.warn`
- **AND** el diagnóstico ya calculado se devuelve igualmente al llamador

#### Scenario: Sin índice, sin indexado
- **WHEN** `diagnosisIndex` no se inyecta
- **THEN** no se produce ningún intento de indexado
