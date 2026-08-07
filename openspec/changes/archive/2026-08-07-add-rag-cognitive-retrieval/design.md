## Context

Rama `feat/rag-cognitive-retrieval`, creada desde `develop`. Fase 4 (Diagnóstico Cognitivo LLM). Stack: TypeScript ESM strict, Clean Architecture, Vitest. Baseline: 556 tests verdes en core-api (47 ficheros).

Bloque **2 de 4** del plan RAG auto-expansivo (ADR-007). El bloque #1 (`add-rag-vector-repositories`, archivado) entregó puertos, servicios de aplicación y adaptador LanceDB — huérfanos hasta ahora. Los otros dos bloques pendientes: #3 sistema de confianza + validación OBD + 6 tools MCP de conocimiento + `web_search`, #4 (numeración informal de la sesión, puede fusionarse con #3).

Estado de partida:
- `application/knowledge/createKnowledgeIndex.ts` — factory genérica `index(entry)` / `search(query, options?)`, habla solo con `VectorStore` y `EmbeddingGenerator`.
- `infrastructure/persistence/vector/{lancedb,lanceVectorStore,vectorTableConfigs,embedding}.ts` — adaptador LanceDB completo, `LANCEDB_PATH` ya en `AppConfig`.
- `composition.ts` no instancia nada de esto. `ExecuteCognitiveDiagnosisUseCase` no conoce el RAG.

## Goals / Non-Goals

**Goals:**
- Cablear `pids_index`, `dtcs_index` y `diagnoses_index` en `composition.ts`, con degradación total si falla la inicialización.
- Inyectar recuperación de contexto (`diagnoses_index`) en `ExecuteCognitiveDiagnosisUseCase`, sin acoplar el caso de uso a LanceDB ni a transformers.js.
- Indexar el caso resuelto al cerrar el diagnóstico cognitivo.
- Mantener el diagnóstico cognitivo funcional aunque el RAG completo falle o esté vacío.

**Non-Goals:**
- No se registra ninguna tool MCP de conocimiento (`search_similar_pids`, `index_pid`, etc.) — bloque #3.
- No se implementa el sistema de confianza (`KnowledgeSource`, escalado de `confidence` tras validación OBD) — bloque #3.
- No se busca ni se escribe en `pids_index` / `dtcs_index` desde el flujo de diagnóstico — solo se instancian, listos para el bloque #3.
- No se añade `web_search` — bloque #3/#4.
- No se siembra corpus alguno: `diagnoses_index` arranca vacío y se puebla con casos reales.
- No se toca la firma HTTP del endpoint de diagnóstico cognitivo.

## Decisions

### 1. Degradación: dependencia opcional + `try/catch`, sin feature flag nuevo

El proyecto ya resuelve exactamente este problema para `llmClient` y `obdRepo`: son `| undefined` en `DiagnosisServiceOptions`, se construyen con una función `createX(config)` que devuelve `undefined` cuando no aplica, y el caso de uso comprueba su presencia antes de usarlos.

Se sigue el mismo patrón para el RAG, sin introducir un flag de configuración nuevo (`RAG_ENABLED` u similar): añadir una variable de entorno para deshabilitar algo que ya se auto-deshabilita ante cualquier fallo es una abstracción que nadie pediría operar por separado — viola KISS. Si en el futuro hace falta apagarlo explícitamente en producción, se añade entonces con el caso real delante.

`createKnowledgeStack(config, logger)` en `composition.ts`:
```ts
async function createKnowledgeStack(
  config: AppConfig,
  logger: LoggerPort,
): Promise<KnowledgeStack | undefined> {
  try {
    const { db } = await initLanceDb(config.LANCEDB_PATH)
    const embed: EmbeddingGenerator = createEmbedding
    const [pidsStore, dtcsStore, diagnosesStore] = await Promise.all([
      createLanceVectorStore(db, PIDS_TABLE_CONFIG),
      createLanceVectorStore(db, DTCS_TABLE_CONFIG),
      createLanceVectorStore(db, DIAGNOSES_TABLE_CONFIG),
    ])
    return {
      pidsIndex: createKnowledgeIndex({ store: pidsStore, embed, toMetadata: toPidMetadata, fromMetadata: toPidEntry }),
      dtcsIndex: createKnowledgeIndex({ store: dtcsStore, embed, toMetadata: toDtcMetadata, fromMetadata: toDtcEntry }),
      diagnosisIndex: createKnowledgeIndex({ store: diagnosesStore, embed, toMetadata: toDiagnosisMetadata, fromMetadata: toDiagnosisEntry }),
    }
  } catch (err) {
    logger.warn('RAG knowledge stack unavailable, continuing without it', { err: String(err) })
    return undefined
  }
}
```
`buildApp` pasa `stack?.diagnosisIndex` a `DiagnosisService`. `pidsIndex` y `dtcsIndex` quedan construidos pero sin consumidor hasta el bloque #3 (evita reabrir `composition.ts` y repetir el wiring de LanceDB entonces).

Dentro del caso de uso, la búsqueda y el indexado llevan su propio `try/catch` independiente del de `composition.ts`: un fallo transitorio de LanceDB (ej. lock de fichero) durante una única petición no debe tumbar los índices para toda la vida del proceso, así que no hay estado global de "RAG deshabilitado" — cada llamada decide por sí misma si el resultado fue útil.

### 2. Coste de arranque: ya resuelto por diseño existente, se preserva

`embedding.ts` ya cachea el pipeline de forma perezosa (`getPipeline()` solo lo crea la primera vez que se llama a `createEmbedding`). La descarga de 118 MB del modelo ocurre en la **primera búsqueda o indexado real**, no al arrancar el servidor. Este cambio no toca `embedding.ts` y no llama a `createEmbedding` durante `composition.ts` — solo pasa la función como referencia (`EmbeddingGenerator`).

Lo que sí ocurre en `composition.ts` es `initLanceDb` + `ensureVectorTable` × 3, que es I/O de disco local (abrir/crear un directorio LanceDB), sin red y del orden de milisegundos: aceptable en el arranque. Por eso `buildApp` pasa de síncrona a `async function buildApp(config): Promise<Application>`, y `main.ts` hace `await buildApp(config)`. No hay otro punto de la app que invoque `buildApp` de forma síncrona (no existe test que lo importe directamente hoy).

En los tests, `diagnosisIndex` se inyecta mockeado en `DiagnosisServiceOptions` — ningún test unitario ni de integración de `ExecuteCognitiveDiagnosisUseCase` o `DiagnosisService` pasa por `composition.ts`, así que la suite no descarga el modelo ni toca disco real de LanceDB. Los tests existentes de `lanceVectorStore`/`createKnowledgeIndex` (bloque #1) ya siguen ese patrón (embedding inyectado).

### 3. Clean Architecture: el caso de uso solo depende de `DiagnosisVectorRepository`

`ExecuteCognitiveDiagnosisUseCase` recibe `diagnosisIndex?: DiagnosisVectorRepository`, un puerto de `application/ports/`. No importa `VectorStore`, `EmbeddingGenerator` ni nada de `infrastructure/`. La composición de `VectorStore` + `EmbeddingGenerator` en un `DiagnosisVectorRepository` ya la resuelve `createKnowledgeIndex` en `composition.ts`, fuera del caso de uso.

### 4. Firma: objeto de opciones, siguiendo `DiagnosisServiceOptions`

La firma actual, `constructor(llmClient, tools, handler)`, ya tiene tres posicionales del mismo "tipo genérico" (nada distingue `tools` de `handler` en la firma salvo el orden) — añadir un cuarto posicional opcional agravaría la ambigüedad de llamada. Se adopta el mismo patrón que `DiagnosisServiceOptions` y `AuthControllerUseCases`: una interfaz `ExecuteCognitiveDiagnosisUseCaseOptions` con las cuatro dependencias, todas por nombre.

```ts
export interface ExecuteCognitiveDiagnosisUseCaseOptions {
  readonly llmClient: LlmClientPort
  readonly tools: readonly McpToolDefinition[]
  readonly handler: ToolCallHandler
  readonly diagnosisIndex?: DiagnosisVectorRepository
}

export class ExecuteCognitiveDiagnosisUseCase {
  constructor(private readonly options: ExecuteCognitiveDiagnosisUseCaseOptions) {}
  ...
}
```
Todos los call-sites (`diagnosisService.ts` y sus tests) se actualizan al nuevo objeto. Es un cambio disruptivo pero contenido: un único productor (`DiagnosisService.cognitiveDiagnosis`) y sus tests.

### 5. Prompt: bloque nuevo en `buildUserMessage`, silencioso si no hay resultados

El contexto recuperado se inserta en `buildUserMessage`, no en `COGNITIVE_DIAGNOSIS_SYSTEM_PROMPT` — el prompt de sistema describe el *rol* y es estático; el contexto de casos similares es *dato* de la petición, igual que `vehicleContext` y `userQuery`.

```
Vehículo: Audi A3 (2019), motor 1.6 TDI, VIN ...
Consulta del usuario: ruido metálico al frenar

Casos similares previos:
1. (distancia 0.12) Audi A3 2018, TDI: pastillas desgastadas, sensor de desgaste activado...
2. (distancia 0.31) Golf 2017, TDI: disco alabeado tras...
```

Reglas:
- Se buscan como máximo `DEFAULT_SEARCH_LIMIT` (5, ya definido en `createKnowledgeIndex.ts`) casos, filtrados por `manufacturer`/`model` del `vehicleContext` cuando existan (mismo `VehicleScope` que ya consume `VectorSearchOptions`).
- Si `diagnosisIndex` no está presente, la búsqueda falla, o no hay resultados (índice vacío o sin coincidencias) → el bloque **se omite por completo**. El mensaje es byte a byte el mismo que produce el código actual. No se escribe "no se encontraron casos similares": una negación no aporta señal al LLM y ensucia el prompt.
- La búsqueda usa `userQuery` como texto de consulta; si no hay `userQuery`, se usa una consulta genérica derivada del vehículo (`"diagnóstico general <make> <model>"`) para no perder la oportunidad de recuperar contexto en el caso de uso más común (botón "diagnosticar" sin texto libre).

### 6. Indexado del caso: qué se guarda y de dónde sale

`DiagnosisKnowledgeEntry` ya define la forma (`id`, `embeddedText`, `manufacturer`, `model`, `symptoms`, `pidsInvolved`). Mapeo desde lo que ya produce el caso de uso:

| Campo | Origen |
|---|---|
| `id` | `crypto.randomUUID()` — no hay entidad de sesión persistida que aportar aquí (fuera de alcance, no hay tabla de sesiones) |
| `embeddedText` | La narrativa devuelta por el LLM (`text`), que es lo que luego se recupera y se muestra como caso similar |
| `manufacturer` / `model` | `vehicleContext?.make` / `vehicleContext?.model`, o `'unknown'` si no hay contexto |
| `symptoms` | `[userQuery]` si existe, si no `[]` — de momento no se extraen síntomas estructurados; eso pertenece al sistema de confianza del bloque #3 |
| `pidsInvolved` | `toolCalls.filter(tc => tc.tool === 'read_pid').map(tc => String(tc.args.pid))`, deduplicado |

Se indexa siempre que `diagnosisIndex` esté presente, sin condicionar a la severidad o a si hubo DTCs — un caso "todo normal" también es información útil (evita falsos positivos en diagnósticos futuros del mismo síntoma). Si se quisiera indexar solo casos con severidad relevante, sería una decisión de producto para el bloque #3, cuando exista el sistema de confianza que la sustente.

### 7. `pids_index` y `dtcs_index`: se instancian, no se consumen

Instanciarlos ahora en `createKnowledgeStack` evita que el bloque #3 tenga que volver a tocar `composition.ts` para el wiring de LanceDB — comparten la misma conexión (`db`) y el mismo `embed`. El coste es cero: `ensureVectorTable` es idempotente y no hay operación de escritura/lectura sin que algo la invoque. Se documenta explícitamente como "instanciado, sin consumidor" para que no parezca código muerto al leerlo.

## Risks / Trade-offs

| Riesgo | Mitigación |
|---|---|
| `buildApp` pasa a async — cualquier futuro caller síncrono rompería | Único caller hoy es `main.ts`; se documenta en el propio JSDoc de `buildApp` |
| El indexado del caso añade latencia (embed + upsert) tras ya tener la respuesta lista | Se acepta: es una escritura local sin red, del mismo orden que el embed de la búsqueda ya pagado antes. Si se mide relevante, se puede indexar de forma fire-and-forget en un cambio posterior con datos delante |
| `pids_index`/`dtcs_index` instanciados sin consumidor puede leerse como sobre-ingeniería | Se documenta explícitamente en `proposal.md` y en comentario del código; alternativa (instanciar solo `diagnoses_index` ahora) obligaría a reabrir `composition.ts` en el bloque #3 para repetir el mismo `initLanceDb` |
| Un `diagnosisIndex` mockeado que "nunca fallara" en los tests puede ocultar que el `try/catch` real funciona | Se añade un test explícito que fuerza `search`/`index` a rechazar y verifica que el diagnóstico se completa igual |

## Migration Plan

Cambio aditivo. `data/lancedb` puede no existir aún en algunos entornos; `initLanceDb` ya lo crea. Sin datos que migrar — `diagnoses_index` empieza vacío y se puebla con el uso real. `buildApp` pasa a `Promise<Application>`: único ajuste de firma pública, contenido a `main.ts`.

## Open Questions

Ninguna. Alcance y decisiones de producto acotados por el plan de 4 bloques del ADR-007 y por esta sesión.
