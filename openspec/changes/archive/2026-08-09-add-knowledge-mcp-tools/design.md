## Context

Rama `feat/knowledge-mcp-tools`, creada desde `develop` una vez mergeados `add-rag-cognitive-retrieval` y `add-knowledge-confidence-validation` (confirmar orden real en fase 0 — si `develop` aún no los tiene, crear desde la rama del segundo). Fase 4. Stack: TypeScript ESM strict, Clean Architecture, Vitest, `@modelcontextprotocol/sdk`.

Bloque **3b de 4** del plan RAG (ADR-007 §7). Depende de `add-rag-cognitive-retrieval` (bloque #2) y `add-knowledge-confidence-validation` (bloque #3a). No depende de `add-web-search-tool`, pero éste sí depende de este cambio (comparten el patrón de registro condicional de tools y `confidenceScale.ts`).

Estado de partida:
- `mcpServer.ts` registra 6 tools de diagnóstico OBD-II vía `registerDiagnosticTools(register, repo, vehicleRepo)`, con `register` inyectado por `createMcpServer` (cierra sobre `handlers`/`toolDefinitions`/`server.tool(...)`).
- `createMcpServer(repo, vehicleRepo?)` se invoca en **dos** sitios de `diagnosisService.ts`: `cognitiveDiagnosis()` (tools van al LLM) y `callMcpTool()` (invocación manual de una tool desde el controlador HTTP). Ambos necesitan ver las tools de conocimiento si el stack está disponible.
- `KnowledgeStack` (de `add-rag-cognitive-retrieval`) vive hoy como interfaz local en `composition.ts`.

## Goals / Non-Goals

**Goals:**
- Registrar las 6 tools MCP de conocimiento cuando el `KnowledgeStack` está disponible.
- Cerrar el bucle de auto-aprendizaje del ADR-007 §6 para PIDs/DTCs: descubrir → indexar → validar (síncrono, en la misma llamada a `index_pid`/`index_dtc`) → confianza actualizada.
- No registrar las tools cuando el stack no está disponible, sin que el LLM vea un error.

**Non-Goals:**
- No se implementa `web_search` — bloque `add-web-search-tool`.
- No se implementa revalidación de una entrada ya indexada (sin fórmula/rango/código en el momento del primer índice, validada más tarde). Requeriría `delete`/versionado en `VectorStore` — no hay caso de uso real hoy que lo pida; se deja como deuda documentada.
- No se cambia el formato de respuesta de las tools de diagnóstico existentes.
- No se añade autenticación/autorización por tool — ya la resuelve el middleware HTTP que protege el endpoint de diagnóstico cognitivo, sin cambios en este bloque.

## Decisions

### 1. `KnowledgeStack` se promueve a `application/ports/`

`composition.ts` es la raíz de composición: nada debería importar desde ella salvo `main.ts`. Que `mcpServer.ts` (infraestructura, pero no la raíz) necesite el tipo `KnowledgeStack` para su firma es la señal de que ese tipo no es un detalle de wiring, sino un contrato de aplicación — igual que `DiagnosisServiceOptions` no vive en `composition.ts` aunque lo construya. Se mueve a `application/ports/KnowledgeStack.ts`:

```ts
import type { PidVectorRepository } from './PidVectorRepository.js'
import type { DtcVectorRepository } from './DtcVectorRepository.js'
import type { DiagnosisVectorRepository } from './DiagnosisVectorRepository.js'

/** Los tres índices de conocimiento del catálogo auto-expansivo (ADR-007 §3), agrupados
 * porque comparten conexión LanceDB y `EmbeddingGenerator` en `composition.ts`. */
export interface KnowledgeStack {
  readonly pidsIndex: PidVectorRepository
  readonly dtcsIndex: DtcVectorRepository
  readonly diagnosisIndex: DiagnosisVectorRepository
}
```
`composition.ts` cambia el `import type { KnowledgeStack }` de local a `@/application/ports/KnowledgeStack.js`; `createKnowledgeStack` no cambia de cuerpo.

### 2. Registro condicional: ausencia de tools, no tools que fallan

Se consideraron dos alternativas para "RAG caído":
1. **Registrar siempre las 6 tools; si `knowledgeStack` es `undefined`, cada handler devuelve `errorText('Knowledge stack unavailable')`.** Descartada: el LLM ve las tools en su lista, puede intentarlas, gasta un turno de tool-calling en un fallo garantizado, y el prompt de sistema tendría que explicar la posibilidad de fallo de una tool que en la práctica nunca funciona en ese proceso.
2. **No registrar las tools cuando `knowledgeStack` es `undefined`.** El LLM nunca las ve — `tools: this.tools` en `LlmClientPort.sendMessage` no las incluye. Elegida: mismo principio que `get_available_pids` ya aplica para `vehicleRepo` ausente (ahí sí se registra pero degrada a "no PIDs available" porque es una respuesta legítima con contenido; aquí no hay contenido legítimo posible sin el stack, así que no registrar es más honesto que fingir).

### 3. `createMcpServer`: tercer parámetro posicional, no objeto de opciones

`createMcpServer(repo, vehicleRepo?, knowledgeStack?)`. Se decide NO migrar a un objeto de opciones (a diferencia de `ExecuteCognitiveDiagnosisUseCaseOptions` en `add-rag-cognitive-retrieval`) porque aquí solo hay tres parámetros, dos ya opcionales, y `repo` siempre va primero por ser la única dependencia obligatoria — no hay ambigüedad de orden real (un booleano no podría confundirse con `vehicleRepo` ni con `knowledgeStack`, tipos completamente distintos). Migrar sería una refactorización cosmética sin beneficio de legibilidad, y tocaría los dos call-sites existentes en `diagnosisService.ts` sin necesidad.

### 4. Validación síncrona dentro de `index_pid`/`index_dtc`, no una tool separada

El ADR-007 §7 no lista una tool `validate_pid` separada — solo `index_pid`. Se decide que `index_pid` intente validar automáticamente cuando el LLM aporta suficiente información (`mode`, `pid`, `formula`, `dataBytes`; opcionalmente `minValue`/`maxValue`), reutilizando `ValidateDiscoveredPidUseCase` con el `ObdRepository` ya disponible en `registerKnowledgeTools` (el mismo `repo` que usan las tools de diagnóstico). Si el LLM no aporta esos campos (ej. el mecánico solo describe el PID sin conocer su fórmula), se indexa sin validar — `confidence` inicial, `validated: false`. Esto cierra el flujo del ADR §6 en una sola invocación de tool en el caso feliz, sin inventar una séptima tool no pedida por el ADR.

`index_dtc` es análogo con `code` opcional y `ValidateDiscoveredDtcUseCase`.

### 5. `DiagnosisServiceOptions.diagnosisIndex` se sustituye por `knowledgeStack`

`add-rag-cognitive-retrieval` introdujo `diagnosisIndex?: DiagnosisVectorRepository` como campo suelto porque en ese momento era la única pieza del stack con consumidor. Ahora `createMcpServer` también necesita `pidsIndex`/`dtcsIndex`, y pasar tres campos sueltos (`pidsIndex`, `dtcsIndex`, `diagnosisIndex`) en vez de un `knowledgeStack` sería reintroducir manualmente la agrupación que `KnowledgeStack` ya modela — con el riesgo real de que alguien actualice uno sin el otro (ej. un test que mockea `diagnosisIndex` pero olvida `dtcsIndex`, dejando `search_similar_dtcs` sin cobertura sin que nada lo señale). Se sustituye el campo suelto por `knowledgeStack?: KnowledgeStack` completo:

```ts
export interface DiagnosisServiceOptions {
  // ...
  readonly knowledgeStack?: KnowledgeStack
}
```
`cognitiveDiagnosis()` pasa `this.knowledgeStack` a `createMcpServer(repository, undefined, this.knowledgeStack)` y a `new ExecuteCognitiveDiagnosisUseCase({ ..., diagnosisIndex: this.knowledgeStack?.diagnosisIndex })`. `callMcpTool()` pasa `this.knowledgeStack` también, para que una invocación manual de `search_similar_pids` desde el controlador HTTP funcione igual que desde el LLM.

Es un cambio de forma, no de comportamiento: los tests que ya mockean `diagnosisIndex` en `DiagnosisServiceOptions` (de `add-rag-cognitive-retrieval`) se actualizan a `knowledgeStack: { pidsIndex, dtcsIndex, diagnosisIndex }` con los tres mocks — contenido en un único fichero de test y su call-site.

### 6. Formato de texto de las tools: coherente con las de diagnóstico

Las tools de búsqueda listan resultados como `"<distancia> <embeddedText> (manufacturer/model)"`, uno por línea, igual estilo que `handleGetAvailablePids`. Las de indexado devuelven una única línea de confirmación con el `id` generado (`crypto.randomUUID()`), la confianza final y si quedó validada. Ningún resultado usa JSON crudo en el texto — mismo criterio que el resto de tools MCP del proyecto, pensadas para que un LLM las lea como prosa corta, no como payload estructurado.

## Risks / Trade-offs

| Riesgo | Mitigación |
|---|---|
| Cambiar `DiagnosisServiceOptions.diagnosisIndex` → `knowledgeStack` justo después de que `add-rag-cognitive-retrieval` lo introdujera puede leerse como reabrir su diseño | Se documenta explícitamente aquí y en el `proposal.md`; el cambio es de forma (agrupar tres campos relacionados), no reabre ninguna decisión de comportamiento de `add-rag-cognitive-retrieval` (recuperación/indexado del diagnóstico) |
| `index_pid`/`index_dtc` validando síncronamente añaden latencia perceptible a la respuesta de la tool (lectura OBD real) | Aceptable: es una única lectura adicional, del mismo orden que cualquier `read_pid` que el LLM ya podría invocar por su cuenta; si se mide relevante, se puede hacer asíncrono en un cambio posterior con datos delante |
| El LLM podría inventar `minValue`/`maxValue` incorrectos al llamar a `index_pid`, validando "falso positivo" si el valor real cae dentro de un rango mal estimado | Riesgo inherente al ADR-007 (confianza escalada, no verdad garantizada); mitigado por el propio sistema de confianza — nunca llega a 1.0, y `add-web-search-tool` marca aparte lo aprendido de la web como `validated: false` hasta este paso |

## Migration Plan

Cambio aditivo sobre un `KnowledgeStack` sin datos reales todavía (ver `add-knowledge-confidence-validation` → Migration Plan). El único cambio de forma pública es `DiagnosisServiceOptions.diagnosisIndex` → `knowledgeStack`, contenido a `composition.ts` (único productor) y a los tests de `diagnosisService.ts`/`ExecuteCognitiveDiagnosisUseCase.ts` que ya mockean esa dependencia.

## Open Questions

Ninguna.
