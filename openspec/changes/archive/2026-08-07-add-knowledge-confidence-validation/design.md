## Context

Rama `feat/knowledge-confidence-validation`, creada desde `develop` (o desde `feat/rag-cognitive-retrieval` si el bloque #2 aún no se ha mergeado a `develop` cuando arranque este cambio — confirmar en la fase 0). Fase 4 (Diagnóstico Cognitivo LLM). Stack: TypeScript ESM strict, Clean Architecture, Vitest.

Bloque **3a de 4** del plan RAG (ADR-007). Depende de `add-rag-cognitive-retrieval` (bloque #2): reutiliza `KnowledgeStack`/`createKnowledgeStack` en `composition.ts` y el `pidsIndex`/`dtcsIndex` ya instanciados sin consumidor. No depende de `add-knowledge-mcp-tools` ni `add-web-search-tool` — al contrario, ambos dependen de este.

Estado de partida (verificado leyendo el código, no asumido del ADR):
- `PidKnowledgeEntry` ya tiene `confidence: number` y `source: KnowledgeSource`, más `obdValidated: boolean` (nombre a unificar).
- `DtcKnowledgeEntry` ya tiene `confidence`/`source`, sin campo de validación.
- `DiagnosisKnowledgeEntry` no tiene ninguno de los tres.
- `ObdRepository.readPid(mode, pid)` ya aplica una fórmula — pero la resuelve de un catálogo interno construido en el constructor del adaptador (`PidFormulaCatalog` desde `ALL_SEED_PIDS`), no de la fórmula que trae el `PidDefinition` descubierto. Para un PID fuera de esa semilla, `PidFormulaCatalog.apply` cae a `bigEndian(bytes)` — un fallback pensado para "no sé qué fórmula usar", no para "aplica esta fórmula concreta". Este hallazgo obliga a extender el puerto, no solo a llamar a `readPid` como asumía el encargo inicial.
- `ObdSimulator`/`ObdSimulatorRepository` no modelan bytes crudos de PID: `readPidValue` devuelve directamente un valor físico ya resuelto por el escenario (o lanza si el PID no está en la lista fija de cuatro sensores). No hay "hex crudo" que exponer en simulación para un PID arbitrario.

## Goals / Non-Goals

**Goals:**
- Confianza y procedencia consistentes (`confidence`, `source`, `validated` donde aplique) en las tres entradas de conocimiento y en las tres tablas LanceDB.
- Validación real de un PID descubierto contra el vehículo conectado: leer, aplicar la fórmula del PID descubierto (no la del catálogo interno del adaptador), comprobar rango.
- Validación real de un DTC descubierto: comprobar que el código aparece en una lectura real de DTCs.
- Degradación explícita y sin excepciones cuando no hay vehículo conectado o el adaptador no soporta lectura cruda (modo simulación).

**Non-Goals:**
- No se registra ninguna tool MCP — bloque `add-knowledge-mcp-tools` decide cuándo y con qué argumentos se invoca la validación.
- No se implementa `web_search` — bloque `add-web-search-tool`.
- No se implementa el escalado por "uso exitoso" de un caso de diagnóstico end-to-end (no hay señal de éxito en el sistema); solo se deja la función pura preparada.
- No se unifica `KnowledgeSource` con el `confidence`/`source` de `PidDefinition` (SQLite) — son catálogos distintos con dueños distintos.
- No se implementa lectura de bytes crudos en modo simulación más allá de lo que el escenario ya define — el simulador sigue siendo un simulador de escenarios fijos, no un emulador OBD de propósito general.

## Decisions

### 1. `validated` unificado en Pid/Dtc, ausente en Diagnosis

`PidKnowledgeEntry.obdValidated` → `validated`. `DtcKnowledgeEntry` gana `validated`. Ambos tienen una validación OBD real y comparable (leer del vehículo, comprobar algo objetivo). `DiagnosisKnowledgeEntry` **no** gana `validated`: no hay una lectura OBD que confirme un caso de diagnóstico — su corrección se demuestra reutilizándolo con éxito, que ya es lo que sube `confidence` (+0.2 por uso, ADR-007 §4). Añadir un booleano sin una fuente de verdad que lo escriba sería un campo muerto desde el día uno — antipatrón directamente señalado en `AGENTS.md` (code smell: magic/campo sin uso). Si en el futuro se define qué significa "diagnóstico confirmado", se añade con ese caso de uso delante.

### 2. `readPidRaw`: nuevo método de puerto, no una reinterpretación de `readPid`

Se consideró reutilizar `readPid` asumiendo (como sugería el encargo) que devuelve hex crudo. La lectura del código lo descarta: `Elm327TcpRepository.readPid` ya invoca `pidFormulas.apply(...)`, así que devuelve un valor físico — y para un PID fuera del catálogo semilla, ese valor es un fallback `bigEndian` incorrecto para modo 22 (bytes truncados a 0). Alternativas consideradas:

| Alternativa | Por qué se descarta |
|---|---|
| Registrar el PID descubierto en `PidFormulaCatalog` antes de llamar a `readPid` | El catálogo se construye una vez en el constructor del adaptador (`Map` cerrado); mutarlo en caliente añade estado compartido entre peticiones concurrentes de validación, un riesgo mayor que añadir un método de puerto |
| Parsear la respuesta cruda fuera del puerto, exponiendo el transporte TCP | Rompe Clean Architecture: la aplicación tendría que conocer `parseModeResponse`/`formatCommand`, funciones de `infrastructure/elm327/protocol.ts` |
| **Nuevo método `readPidRaw(mode, pid, dataBytes): Promise<number[]>`** | Mismo nivel de abstracción que `readPid`, sin decidir la fórmula — la decide el llamador con la `Formula` VO del PID descubierto. Elegida. |

`Elm327TcpRepository.readPidRaw` reutiliza `client.sendCommand` + `parseModeResponse`/`parseMode22Response`, sin pasar por `pidFormulas`. `ObdSimulatorRepository.readPidRaw` lanza `PidRawReadNotSupportedError` salvo que el PID sea uno de los cuatro sensores fijos del escenario (mismo camino de excepción que `readPidValue` ya usa para PIDs no soportados, reutilizando su mensaje).

### 3. Validación como caso de uso puro, sin escribir en el índice

`ValidateDiscoveredPidUseCase.execute(entry, formulaSource, obdRepo)` devuelve `{ entry: PidKnowledgeEntry, outcome: 'validated' | 'out_of_range' | 'no_vehicle' | 'unsupported' }` — no llama a `PidVectorRepository.index(...)`. Mantiene el caso de uso testeable sin mockear LanceDB y deja la decisión de "cuándo reindexar" al llamador (`index_pid`/`revalidate_pid`, bloque `add-knowledge-mcp-tools`), que sí tiene el índice inyectado. Mismo patrón que `add-rag-cognitive-retrieval` separa `createKnowledgeStack` (wiring) de `ExecuteCognitiveDiagnosisUseCase` (uso).

```ts
export interface ValidationResult<TEntry> {
  readonly entry: TEntry
  readonly outcome: 'validated' | 'out_of_range' | 'no_vehicle' | 'unsupported'
}

export class ValidateDiscoveredPidUseCase {
  async execute(
    entry: PidKnowledgeEntry,
    formula: PidFormulaSource,
    range: { minValue?: number; maxValue?: number },
    obdRepo: ObdRepository | undefined,
  ): Promise<ValidationResult<PidKnowledgeEntry>> {
    if (!obdRepo) return { entry, outcome: 'no_vehicle' }
    try {
      const bytes = await obdRepo.readPidRaw(formula.pidCode.key.split(' ')[0], formula.pidCode.key.split(' ')[1], formula.dataBytes)
      const value = new Formula(formula.formula.toString()).evaluate(bytes)
      const inRange =
        (range.minValue === undefined || value >= range.minValue) &&
        (range.maxValue === undefined || value <= range.maxValue)
      if (!inRange) return { entry, outcome: 'out_of_range' }
      return {
        entry: { ...entry, validated: true, confidence: validatedConfidenceFor(entry.source) },
        outcome: 'validated',
      }
    } catch (err) {
      if (err instanceof PidRawReadNotSupportedError) return { entry, outcome: 'unsupported' }
      throw err
    }
  }
}
```
`validatedConfidenceFor(source)` vive en `confidenceScale.ts` (mapea `Web → 0.7`, `Mechanic → 0.9`, cualquier otro `source` no sube — ya está validado o no aplica). Solo `PidRawReadNotSupportedError` se traduce a `'unsupported'`; cualquier otro error (fallo de conexión ELM327, timeout) se propaga — es una condición excepcional real, no el "no se pudo confirmar todavía" que sí se degrada.

`ValidateDiscoveredDtcUseCase` es análogo pero sin fórmula: `outcome: 'validated' | 'not_found' | 'no_vehicle'` (no hay `'unsupported'` — `readDtcCodes()` ya funciona en simulación, es una lista de DTCs del escenario).

### 4. Sin problema de versionado: se valida antes de indexar, no después

`store.upsert` en `lanceVectorStore.ts` llama a `table.add(rows)` — LanceDB no impone unicidad de `id`, así que reescribir con el mismo `id` **añadiría una fila nueva**, no sobrescribiría. Esto importaría si una entrada se indexara sin validar y se revalidara más tarde. Se decide evitar el problema en origen: `add-knowledge-mcp-tools` diseña `index_pid`/`index_dtc` para que, cuando el LLM aporta los datos suficientes (fórmula, rango, o el código DTC), la validación OBD ocurra **síncronamente, antes del único `index()`** — un PID/DTC descubierto se escribe una sola vez, ya con su `confidence`/`validated` finales. No hace falta `delete(id)` ni versionado en ninguno de los dos cambios.

Queda como caso no resuelto (documentado, no implementado): revalidar una entrada que ya se indexó sin datos de validación en su momento (ej. el mecánico solo aportó el nombre, sin fórmula, y más tarde se conecta un vehículo que sí permite validarla). Ese flujo sí requeriría `delete`/versionado — se deja fuera de alcance explícitamente en `add-knowledge-mcp-tools` (Non-Goals) hasta que haya un caso de uso real que lo pida.

### 5. `confidenceScale.ts`: tabla de constantes, no un servicio

Cuatro constantes + dos funciones puras (`initialConfidenceFor(source)`, `boostConfidence(current, bonus)`). No hay estado, no hay dependencias — vive en `application/knowledge/` junto a los mappers, mismo nivel que `createKnowledgeIndex.ts`. Evita crear un "ConfidenceService" para cuatro números — sería una abstracción prematura (KISS).

## Risks / Trade-offs

| Riesgo | Mitigación |
|---|---|
| Extender `ObdRepository` (puerto usado en 6+ sitios) con `readPidRaw` obliga a tocar ambos adaptadores | Alcance acotado: firma nueva, no se cambia ninguna existente; los tests de contrato de puerto ya existentes (si los hay) se extienden, no se reescriben |
| La validación OBD de PIDs descubiertos solo funciona en modo TCP — en simulación siempre degrada a `'unsupported'` | Se documenta explícitamente como limitación, no como bug; es coherente con que el simulador modela escenarios fijos, no un ELM327 genérico |
| Renombrar `obdValidated` → `validated` rompe cualquier dato ya escrito en `pids_index` con la columna antigua | Ver Migration Plan — entornos existentes no tienen la tabla poblada (bloque #1 se archivó sin consumidor, nadie ha indexado nada real todavía) |
| `bigEndian` fallback de `PidFormulaCatalog.apply` para PIDs desconocidos queda sin usar en el flujo de validación pero sigue existiendo para `read_pid` genérico | Correcto: es su propósito original (mostrar "algo" cuando no hay fórmula conocida para inspección manual), no se toca |

## Migration Plan

`pids_index`/`dtcs_index`/`diagnoses_index` no tienen datos reales en ningún entorno (bloque #1 se archivó sin consumidor; bloque #2 solo indexa `diagnoses_index` desde el diagnóstico cognitivo, que aún no se ha ejecutado en producción). No hay migración de datos que hacer: al desplegar este cambio, `ensureVectorTable` crea las tablas con el esquema nuevo desde cero. Si en el futuro existiera una tabla `pids_index` con datos y columna `obdValidated`, requeriría un script de migración de esquema LanceDB (renombrar columna) fuera de alcance de este cambio — se señala como deuda si llegara a ser necesario.

## Open Questions

Ninguna. Las decisiones de producto (qué campos, qué degrada vs. qué propaga, por qué Diagnosis no tiene `validated`) están resueltas arriba con su justificación.
