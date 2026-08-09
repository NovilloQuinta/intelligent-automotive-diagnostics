# Knowledge MCP Tools

## Purpose

Exponer al LLM las 6 tools MCP de conocimiento del ADR-007 §7 para buscar y ampliar el catálogo auto-expansivo, con validación OBD síncrona al indexar cuando hay datos suficientes.

## ADDED Requirements

### Requirement: Registro condicional de las tools de conocimiento
El sistema SHALL registrar las 6 tools MCP de conocimiento (`search_similar_pids`, `index_pid`, `search_similar_dtcs`, `index_dtc`, `search_similar_diagnoses`, `index_diagnosis`) únicamente cuando `createMcpServer` recibe un `KnowledgeStack` definido.

#### Scenario: Stack disponible
- **WHEN** `createMcpServer(repo, vehicleRepo, knowledgeStack)` se invoca con `knowledgeStack` definido
- **THEN** `listTools()` incluye las 6 tools de conocimiento además de las de diagnóstico

#### Scenario: Stack ausente
- **WHEN** `createMcpServer(repo, vehicleRepo)` se invoca sin tercer argumento (o `undefined`)
- **THEN** `listTools()` no incluye ninguna tool de conocimiento
- **AND** invocar cualquiera de sus nombres vía `callTool` lanza `ToolNotFoundError`, igual que cualquier tool no registrada

---

### Requirement: Búsqueda semántica de PIDs, DTCs y diagnósticos
El sistema SHALL exponer `search_similar_pids`, `search_similar_dtcs` y `search_similar_diagnoses`, cada una buscando por similitud semántica en su índice correspondiente, opcionalmente filtrada por `manufacturer`/`model`.

#### Scenario: Resultados encontrados
- **WHEN** se invoca `search_similar_pids` con una consulta que tiene coincidencias
- **THEN** el resultado de texto lista cada coincidencia con su distancia y campos relevantes, ordenadas de menor a mayor distancia

#### Scenario: Sin resultados
- **WHEN** la búsqueda no encuentra coincidencias
- **THEN** el resultado de texto indica ausencia de resultados sin marcar `isError`

---

### Requirement: Indexado de un PID descubierto con validación síncrona
El sistema SHALL exponer `index_pid`, que indexa un `PidKnowledgeEntry` nuevo con `confidence` inicial según `source`, y valida contra el vehículo conectado cuando se aportan `mode`, `pid`, `formula` y `dataBytes`.

#### Scenario: Indexado sin datos de validación
- **WHEN** `index_pid` se invoca solo con `embeddedText`, `manufacturer`, `model`, `source`
- **THEN** se indexa una entrada con `confidence` inicial según `source` y `validated: false`
- **AND** no se intenta ninguna lectura OBD

#### Scenario: Indexado con validación exitosa
- **WHEN** `index_pid` se invoca con `mode`, `pid`, `formula`, `dataBytes` y el vehículo conectado responde un valor dentro de rango
- **THEN** se indexa una única entrada con `validated: true` y `confidence` escalada
- **AND** el texto de respuesta indica que la entrada quedó validada

#### Scenario: Indexado con validación fuera de rango o sin vehículo
- **WHEN** `index_pid` se invoca con datos de validación pero el valor leído está fuera de rango, o no hay vehículo conectado
- **THEN** se indexa igualmente la entrada, con `confidence` inicial sin escalar y `validated: false`
- **AND** el texto de respuesta indica el motivo (`out_of_range` / `no_vehicle` / `unsupported`)

---

### Requirement: Indexado de un DTC descubierto con validación síncrona
El sistema SHALL exponer `index_dtc`, análoga a `index_pid`, validando contra `readDtcCodes()` cuando se aporta `code`.

#### Scenario: Indexado con código presente en el vehículo
- **WHEN** `index_dtc` se invoca con `code` y el código aparece en `readDtcCodes()`
- **THEN** se indexa con `validated: true` y `confidence` escalada

#### Scenario: Indexado sin código o código ausente
- **WHEN** `index_dtc` se invoca sin `code`, o el código no aparece en `readDtcCodes()`
- **THEN** se indexa con `confidence` inicial sin escalar y `validated: false`

---

### Requirement: Indexado de un caso de diagnóstico resuelto
El sistema SHALL exponer `index_diagnosis`, que indexa un `DiagnosisKnowledgeEntry` con `confidence` fija en la inicial de `KnowledgeSource.PreviousDiagnosis` y `source: PreviousDiagnosis`.

#### Scenario: Indexado exitoso
- **WHEN** `index_diagnosis` se invoca con `embeddedText`, `manufacturer`, `model`, `symptoms`, `pidsInvolved`
- **THEN** se indexa una entrada con `confidence: 0.5` y `source: KnowledgeSource.PreviousDiagnosis`
