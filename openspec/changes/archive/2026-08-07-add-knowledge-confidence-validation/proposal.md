## Why

El ADR-007 §4 define un sistema de confianza para el catálogo auto-expansivo: cada entrada aprendida (PID, DTC, caso de diagnóstico) nace con una confianza inicial según su procedencia y sube cuando se valida contra el vehículo real o se reutiliza con éxito. Hoy `PidKnowledgeEntry` y `DtcKnowledgeEntry` ya cargan `confidence`/`source` (bloque #1, `archive/2026-08-07-add-rag-vector-repositories`) pero **nadie escribe esos campos con criterio ni los actualiza**: no existe la validación OBD que sube la confianza de 0.3/0.8 a 0.7/0.9, ni el escalado por uso exitoso en diagnósticos.

Este cambio es el bloque **3a de 4** del plan RAG. Depende de `add-rag-cognitive-retrieval` (bloque #2, en curso): reutiliza el `KnowledgeStack` que ese cambio expone en `composition.ts` (`pidsIndex`, `dtcsIndex`, `diagnosisIndex`, instanciados pero sin consumidor para `pidsIndex`/`dtcsIndex`) y el patrón de degradación `try/catch` + `logger.warn`. Va **antes** que `add-knowledge-mcp-tools` y `add-web-search-tool` porque ambos escriben `confidence`/`source`/`validated` en las tres tablas — sin este cambio no habría semántica que respetar al indexar.

## What Changes

### 1. Campos de confianza en las tres entradas de conocimiento

- `DtcKnowledgeEntry` gana `validated: boolean` (ya tiene `confidence`/`source`).
- `DiagnosisKnowledgeEntry` gana `confidence: number` y `source: KnowledgeSource` (fijo a `KnowledgeSource.PreviousDiagnosis` al crearse). **No** gana `validated`: no existe una validación OBD de un caso de diagnóstico — su única forma de "confirmarse" es reutilizarse con éxito, que ya se modela subiendo `confidence`. Añadir un booleano sin semántica propia solo para uniformar el esquema violaría KISS; se documenta como decisión explícita en `design.md`.
- `PidKnowledgeEntry.obdValidated` se **renombra** a `validated` para unificar el nombre del campo entre `PidKnowledgeEntry` y `DtcKnowledgeEntry` (ambos sí tienen una validación OBD real). Cambio mecánico pero disruptivo: toca `pidKnowledgeMapper.ts` y `vectorTableConfigs.ts` (columna `obdValidated` → `validated` en `PIDS_TABLE_CONFIG`).
- `vectorTableConfigs.ts`: `DTCS_TABLE_CONFIG` gana columna `validated` (boolean); `DIAGNOSES_TABLE_CONFIG` gana `confidence` (float32) y `source` (string).
- `dtcKnowledgeMapper.ts` y `diagnosisKnowledgeMapper.ts` propagan los campos nuevos en `toXMetadata`/`toXEntry`.

### 2. Escalado de confianza (constantes con nombre, sin caso de uso propio)

- Nuevo módulo `application/knowledge/confidenceScale.ts` con las constantes del ADR-007 §4 (`WEB_INITIAL_CONFIDENCE = 0.3`, `WEB_VALIDATED_CONFIDENCE = 0.7`, `MECHANIC_INITIAL_CONFIDENCE = 0.8`, `MECHANIC_VALIDATED_CONFIDENCE = 0.9`, `PREVIOUS_DIAGNOSIS_INITIAL_CONFIDENCE = 0.5`, `SUCCESSFUL_REUSE_BONUS = 0.2`) y una función pura `boostConfidence(current, bonus)` que satura en `1.0`. Sin caso de uso propio: es una tabla de constantes + una función de un renglón, usada por `add-knowledge-mcp-tools` (`index_pid`/`index_dtc` aplican la confianza inicial según `source`) y por este mismo cambio (la validación OBD aplica `WEB_VALIDATED_CONFIDENCE`/`MECHANIC_VALIDATED_CONFIDENCE` según el `source` de la entrada validada).
- El escalado por uso exitoso de un caso de diagnóstico (+0.2, `PreviousDiagnosis`) se implementa en este cambio como una función pura (`boostConfidence`) pero **no se invoca desde ningún flujo todavía** — no hay señal de "uso exitoso" en el sistema (no hay feedback del mecánico). Se deja preparado y documentado como no invocado; invocarlo es trabajo futuro fuera de alcance de los 3 bloques de esta sesión.

### 3. Caso de uso: validación OBD de un PID/DTC descubierto

- Nuevo `ValidateDiscoveredPidUseCase` en `application/use-cases/`: recibe un `PidKnowledgeEntry` + su `formula`/`minValue`/`maxValue` (la forma mínima ya existe como `PidFormulaSource`, se extiende) y un `ObdRepository`. Lee el PID con un método de puerto nuevo (`readPidRaw`, ver más abajo), evalúa la fórmula con la `Formula` VO del dominio y comprueba el rango. Devuelve la entrada con `validated`/`confidence` actualizados, sin escribir en el índice (eso lo hace el llamador, `add-knowledge-mcp-tools`, que tiene el `PidVectorRepository` inyectado).
- Nuevo `ValidateDiscoveredDtcUseCase`, análogo pero sin fórmula: valida por presencia — el código aparece en `ObdRepository.readDtcCodes()` del vehículo conectado. No hay rango que comprobar, solo existencia.
- **Hallazgo de código that cambia el diseño**: `ObdRepository.readPid(mode, pid)` ya aplica una fórmula internamente (`Elm327TcpRepository` resuelve un `PidFormulaCatalog` construido en el constructor desde `ALL_SEED_PIDS`, la semilla SQLite). Para un PID **recién descubierto** — por definición fuera de esa semilla — `PidFormulaCatalog.apply` no encuentra la entrada y cae al fallback `bigEndian(bytes)`, ignorando la fórmula del PID descubierto; en modo 22 (el habitual para PIDs propietarios) además pasa `dataBytes: 0` al parseo de la respuesta, rompiendo el slice de bytes. `ObdRepository.readPid` **no sirve** para validar un PID que el catálogo interno no conoce.
- Por eso este cambio extiende el puerto `ObdRepository` con `readPidRaw(mode: string, pid: string, dataBytes: number): Promise<number[]>` — devuelve los bytes de datos crudos de la respuesta, sin aplicar ninguna fórmula. Se implementa en `Elm327TcpRepository` (reutiliza `client.sendCommand` + `parseModeResponse`/`parseMode22Response`, sin pasar por `pidFormulas.apply`) y en `ObdSimulatorRepository`/`ObdSimulator`: el simulador no modela bytes crudos por PID (solo valores físicos ya resueltos por escenario), así que `readPidRaw` en simulación lanza `PidRawReadNotSupportedError` para cualquier PID que no sea uno de los cuatro sensores fijos del escenario. Se documenta como limitación conocida: la validación OBD real de PIDs descubiertos solo es significativa en modo TCP (`OBD_MODE=tcp`, ELM327 real o el emulador Docker del proyecto).

### 4. Sin vehículo conectado o sin soporte de validación: degradación, no error

- `ValidateDiscoveredPidUseCase`/`ValidateDiscoveredDtcUseCase` reciben `obdRepo: ObdRepository | undefined`. Si es `undefined`, o si `readPidRaw`/`readDtcCodes` rechaza (incluido `PidRawReadNotSupportedError` en modo simulación), el caso de uso devuelve la entrada **sin modificar** (mismo `confidence`/`validated` de entrada) y una razón (`'no_vehicle' | 'unsupported' | 'out_of_range' | 'validated'`) que el llamador usa para decidir el mensaje al LLM. Nunca lanza: un intento de validación fallido no es una condición excepcional del flujo de diagnóstico, es el resultado normal de "no se pudo confirmar todavía".

### 5. Sin escritura en el índice desde este cambio: no hay versionado que resolver todavía

- Los dos casos de uso de este cambio (`ValidateDiscoveredPidUseCase`, `ValidateDiscoveredDtcUseCase`) son puros: reciben una entrada y devuelven una entrada, sin tocar `PidVectorRepository`/`DtcVectorRepository`. Quién y cuándo escribe en el índice lo decide `add-knowledge-mcp-tools`, que valida **antes** de indexar por primera vez (un único `index()` por entrada descubierta, ver su `design.md`). Por eso este cambio no necesita resolver "sobrescribir vs. versionar" una entrada ya indexada — ese problema solo aparecería si se revalida una entrada tiempo después de su primer índice, caso que queda fuera de alcance de los tres bloques de esta sesión (ver `add-knowledge-mcp-tools` → Non-Goals).

## Lo que NO cambia

- El registro de las tools MCP (`index_pid`, `index_dtc`, `search_similar_*`) — bloque `add-knowledge-mcp-tools`, que sí consume `confidenceScale.ts` y los casos de uso de validación de este cambio.
- `web_search` — bloque `add-web-search-tool`.
- La recuperación/indexado de `diagnoses_index` en el diagnóstico cognitivo — ya resuelto por `add-rag-cognitive-retrieval`; este cambio solo añade `confidence`/`source` al esquema, no toca `ExecuteCognitiveDiagnosisUseCase`.
- `createKnowledgeIndex.ts`, `lanceVectorStore.ts`, `lancedb.ts`, `embedding.ts` — sin cambios de comportamiento, solo consumen el esquema de columnas ampliado vía `vectorTableConfigs.ts`.
- El sistema de confianza de `PidDefinition` (entidad SQLite, `confidence`/`source: 'auto'|'llm_guess'|'manual'`) — es un mecanismo distinto, para PIDs persistidos en el catálogo relacional del vehículo, no para el índice vectorial. No se fusiona con `KnowledgeSource` en este cambio: son dos conceptos con dueños distintos (SQLite vs. LanceDB) y unificarlos es una decisión de producto mayor, fuera de alcance.

## Capabilities

### Added Capabilities
- `knowledge-confidence-validation`: las entradas de conocimiento del catálogo auto-expansivo (PIDs, DTCs, diagnósticos) cargan confianza y procedencia consistentes, y los PIDs/DTCs descubiertos pueden validarse contra el vehículo real conectado, subiendo su confianza cuando el valor leído cae en el rango esperado o el código se confirma presente.

## Impact

- **Modificado**: `application/dto/knowledge/{PidKnowledgeEntry,DtcKnowledgeEntry,DiagnosisKnowledgeEntry}.ts`
- **Modificado**: `application/knowledge/{pidKnowledgeMapper,dtcKnowledgeMapper,diagnosisKnowledgeMapper}.ts`
- **Modificado**: `infrastructure/persistence/vector/vectorTableConfigs.ts`
- **Modificado**: `application/ports/ObdRepository.ts` (nuevo método `readPidRaw`)
- **Modificado**: `infrastructure/elm327/elm327Adapter.ts`, `infrastructure/simulation/simulatorAdapter.ts`, `infrastructure/simulation/simulator.ts` (implementan/simulan `readPidRaw`)
- **Nuevo**: `application/knowledge/confidenceScale.ts`
- **Nuevo**: `application/use-cases/ValidateDiscoveredPidUseCase.ts`
- **Nuevo**: `application/use-cases/ValidateDiscoveredDtcUseCase.ts`
- **Nuevo**: `infrastructure/elm327/errors.ts` gana `PidRawReadNotSupportedError` (o módulo de errores de simulación equivalente)
- **Sin cambios**: `domain/value-objects/knowledgeSource.ts`, `application/knowledge/createKnowledgeIndex.ts`, `infrastructure/persistence/vector/{lanceVectorStore,lancedb,embedding}.ts`
