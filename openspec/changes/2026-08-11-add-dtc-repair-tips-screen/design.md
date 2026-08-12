## Context

El catálogo de conocimiento vectorial (ADR-007, `openspec/specs/lancedb-infra/spec.md` y `openspec/specs/vector-repositories/spec.md`) expone tres índices en LanceDB detrás de `KnowledgeStack` (`apps/core-api/src/application/ports/KnowledgeStack.ts`): `pidsIndex`, `dtcsIndex` (`DtcVectorRepository` → `DtcKnowledgeEntry`) y `diagnosisIndex` (`DiagnosisVectorRepository` → `DiagnosisKnowledgeEntry`). Los tres comparten forma (`VectorRepository<T>.search(query, { limit, filter })`, `apps/core-api/src/application/ports/VectorRepository.ts`) y devuelven `VectorSearchResult<T>[]` ordenados de menor a mayor distancia.

`KnowledgeStack` ya se construye una vez en `composition.ts` (`createKnowledgeStack`) y se inyecta en **dos** sitios:
1. `AdminController` (`apps/core-api/src/infrastructure/composition/composition.ts:404-407`), que expone `GET /api/admin/knowledge` (stats) y `POST /api/admin/knowledge/search` — este último (`AdminController.searchKnowledge`, `apps/core-api/src/infrastructure/http/controllers/AdminController.ts:112-130`) es una búsqueda de prueba genérica: el cliente elige `text` + `index` (`pids|dtcs|diagnoses`) + `limit`, sin ningún filtro por fabricante/modelo. Ambas rutas están montadas bajo `/api/admin`, protegidas por `requireAdmin` (`admin.routes.ts`, `server.ts:198-204`) — solo administradores llegan a la UI (`apps/ui/src/components/admin/KnowledgePanel.tsx`).
2. `DiagnosisService` (`apps/core-api/src/infrastructure/services/diagnosisService.ts:196,209`), que recibe el `KnowledgeStack` completo (el comentario en `composition.ts:335-338` es explícito: "extiende `KnowledgeStack` ... para que siga siendo asignable donde se espera un `KnowledgeStack` simple, p. ej. `DiagnosisService`"), pero **hoy solo usa `knowledgeStack?.diagnosisIndex`** (línea 537, dentro de `cognitiveDiagnosis()`) para inyectar contexto de "casos similares previos" en el prompt del LLM (`ExecuteCognitiveDiagnosisUseCase.retrieveSimilarCases`, `apps/core-api/src/application/use-cases/ExecuteCognitiveDiagnosisUseCase.ts:226-260`). `knowledgeStack.dtcsIndex` **no se lee en ningún caso de uso de aplicación** — el único camino que hoy lo consulta es la tool MCP `search_similar_dtcs` (`apps/core-api/src/infrastructure/mcp/mcpServer.ts:692-702`), y esa tool solo se ejecuta si el LLM decide invocarla durante una conversación libre de `/api/mcp/cognitive-diagnosis`. No existe ningún caso de uso NO-LLM que lea `dtcsIndex` — es infraestructura ya cableada y alcanzable, pero infrautilizada fuera del flujo conversacional y del panel de administración. Este cambio es, en ese sentido, el primer consumidor estructurado de `dtcsIndex` fuera del LLM.

`MechanicChat.tsx` (`apps/ui/src/components/dashboard/MechanicChat.tsx`) sí llega a `search_similar_dtcs`/`search_similar_diagnoses`, pero indirectamente: el mecánico tiene que formular una pregunta en lenguaje libre y confiar en que el LLM decida usar esas tools. No hay una vinculación estructurada "DTC del panel → resultados del catálogo".

`DtcPanel.tsx` ya es seleccionable (`add-freeze-frame-screen`, archivado): `onSelect: (code: string) => void`, usado hoy solo para cargar el freeze frame vía `FreezeFramePanel`/`useFreezeFrame(scenarioId, dtc)`. El código seleccionado se eleva a `DashboardPage` como `selectedDtc: string | null` y se pasa a `DashboardSection` dentro de `DiagnosisState.selectedDtc`. La lista de códigos que renderiza `DtcPanel` (`CodeList`) sí tiene tanto `code` como `description` (`DtcCode = { code, description }`, tres fuentes: `codes` almacenadas, `usePendingDtc`, `usePermanentDtc`) — pero esa `description` nunca sale de `DtcPanel` hoy.

**Independencia del modo de conexión (`OBD_MODE`)**: confirmado por inspección. Los DTCs (`GET /api/diagnosis`, `/api/pending-dtc`, `/api/permanent-dtc`) y el catálogo de conocimiento (`KnowledgeStack`, LanceDB) son dos subsistemas totalmente desacoplados — ninguno de los dos sabe si el `ObdRepository` activo es `ObdSimulatorRepository` (`sync`) o `Elm327TcpRepository`/serial (`tcp`/`usb`). El único acoplamiento de `DiagnosisService` con el modo de conexión es `resolveRepository(scenarioId)` (para saber contra qué adaptador OBD hablar), que este cambio también usa (indirectamente, vía `getVehicleInfo(scenarioId)`) exactamente igual que `getFreezeFrame`/`getEcuInfo` — sin ninguna rama de código nueva por modo. A diferencia de `add-topology-mapping-screen` (donde el modo TCP degrada a 1 sola ECU sintética), aquí no hay ninguna degradación de datos por modo: el catálogo de conocimiento se busca igual tenga el vehículo 1 DTC o 5, venga de simulador o de ELM327 real. La única variable real es si el fabricante/modelo del vehículo activo es conocido (`make/model !== 'unknown'`, ver Decisión 3) — y esa variable ya existe hoy independientemente de este cambio (`TCP_DIRECT_SCENARIO`/`SERIAL_DIRECT_SCENARIO` fijan `make: 'unknown', model: 'unknown'` en `diagnosisService.ts:85-120`, mientras que los escenarios de simulador sí traen fabricante/modelo reales del descriptor).

## Goals / Non-Goals

**Goals:**
- Vincular cada DTC seleccionado en el dashboard con resultados de búsqueda semántica del catálogo de conocimiento (`dtcsIndex` + `diagnosisIndex`), accesibles para cualquier usuario autenticado (no solo `admin`).
- Reutilizar `VectorRepository.search()`/`KnowledgeStack` tal cual existen — cero cambios de esquema LanceDB, cero cambios de dominio, cero migraciones Drizzle.
- Degradación honesta: catálogo no configurado → el frontend lo sabe de antemano (flag de capacidad) y lo comunica, en vez de una llamada que falla; catálogo configurado sin resultados → "sin resultados", no error.

**Non-Goals:**
- No se añade ningún campo `code` estructurado a `DtcKnowledgeEntry` ni se cambia el schema de metadatos de `dtcs_index`. La búsqueda sigue siendo semántica sobre `embeddedText` (igual que hoy en `search_similar_dtcs`/`ExecuteCognitiveDiagnosisUseCase`), no un filtro exacto por código — ver Decisión 2.
- No se toca `/api/admin/knowledge/search` ni `AdminController` — la ruta admin sigue siendo la herramienta de prueba genérica que ya es, sin relación con este cambio.
- No se añade indexado nuevo (`index_dtc`/`index_diagnosis`) ni edición de entradas desde esta pantalla — es una pantalla de solo lectura, igual que `FreezeFramePanel`/`EcuInfoPanel`.
- No se cambia el flujo conversacional (`MechanicChat`/`ExecuteCognitiveDiagnosisUseCase`) ni las tools MCP existentes — este cambio añade un consumidor nuevo de `dtcsIndex`/`diagnosisIndex`, no modifica los actuales.

## Decisions

### 1. Exposición a usuarios no-admin: nuevo endpoint sobre `DiagnosisService`, no ampliar `/api/admin/knowledge/search`

**Elegido**: Nuevo endpoint `GET /api/dtc-repair-tips` en el namespace de diagnóstico (`diagnosis.routes.ts`, montado como el resto de `/api/*` tras el `authMiddleware` global en `server.ts:227-232` — **sin** `requireAdmin`, accesible a cualquier usuario autenticado). Detrás, un caso de uso nuevo `GetDtcRepairTipsUseCase` que reutiliza el mismo `KnowledgeStack` ya inyectado en `DiagnosisService` (mismo objeto que hoy solo usa `diagnosisIndex`), llamando a `dtcsIndex.search()` y `diagnosisIndex.search()` con el mismo `VectorRepository.search()` que ya usa el flujo admin y el flujo cognitivo — así el resultado es representativo de lo que el LLM vería en un diagnóstico real, mismo argumento que ya usa el comentario de `AdminController.searchKnowledge`.

**Por qué no (b) "extender `/api/admin/knowledge/search` para que cualquier usuario autenticado pueda llamarlo"**: ese endpoint ya tiene una forma pensada para *operador probando el catálogo* (`text` libre + selector manual de `index` + `limit`), no para *mecánico viendo un DTC concreto*. Reutilizarlo obligaría al frontend a construir `text`/`index` a mano en dos llamadas separadas (una por índice) y perdería la oportunidad de acotar por fabricante/modelo del vehículo activo (que el endpoint admin no soporta — no tiene noción de `scenarioId` ni de vehículo). Además tocar `requireAdmin` para hacerlo condicional (admin ve todos los índices con texto libre; mecánico solo ve resultados acotados a su DTC) mezclaría dos audiencias y dos contratos en el mismo controlador — mismo argumento de cohesión que ya usa `design.md` de `add-topology-mapping-screen` Decisión 1 para no mezclar problemas ortogonales en un cambio.

**Por qué no crear una tool MCP nueva ni reutilizar `search_similar_dtcs`/`search_similar_diagnoses` desde el backend**: esas tools están registradas contra un `McpServer` que se instancia por petición HTTP dentro de `cognitiveDiagnosis()`/`callMcpTool()` (`diagnosisService.ts`), pensado para que las invoque el LLM vía tool calling — no para que un caso de uso determinista las llame directamente sin pasar por el ciclo de conversación. Invocar una tool MCP "a mano" desde un caso de uso sería una capa de indirección sin beneficio: la propia tool internamente solo hace `stack.dtcsIndex.search(query, opts)` (`mcpServer.ts:698`), así que llamar a `dtcsIndex.search()` directamente desde `GetDtcRepairTipsUseCase` es la misma operación sin la sobrecarga de simular una llamada a herramienta MCP.

**Rechazado**: (b) tal cual — extender `/api/admin/knowledge/search` quitando `requireAdmin` para esta llamada concreta. Descartado por las razones anteriores: forma de contrato equivocada para esta UX y mezcla de audiencias/permisos en un único controlador.

### 2. Qué se busca: `dtcsIndex` + `diagnosisIndex` combinados, texto `"<code>: <description>"`, sin filtro exacto por código

**Elegido**: `GetDtcRepairTipsUseCase` busca en paralelo en ambos índices con el mismo texto de consulta, construido igual que `formatSimilarCase`/`buildUserMessage` ya hacen en `ExecuteCognitiveDiagnosisUseCase.ts:88-118` (`"<code>: <description>"` si hay descripción, o solo `<code>` si no la hay). Cada resultado se etiqueta con `source: 'dtc' | 'diagnosis'` y se combina/ordena por distancia. No hay filtro exacto por campo `code`, porque **`DtcKnowledgeEntry` no tiene un campo `code` estructurado** — solo `embeddedText` libre (confirmado leyendo `DtcKnowledgeEntry.ts` y `validatableEntryMapper.ts`: el `code` que acepta la tool `index_dtc` se usa únicamente para `ValidateDiscoveredDtcUseCase` — decide `validated: boolean` — y no se persiste como metadato propio). La búsqueda es y sigue siendo semántica, exactamente como en `search_similar_dtcs`.

**Por qué ambos índices y no solo uno**: `dtcsIndex` (`DtcKnowledgeEntry`) aporta "qué significa probablemente este código y qué síntomas suele traer" (glosario aprendido); `diagnosisIndex` (`DiagnosisKnowledgeEntry`) aporta "casos reales ya resueltos" con la narrativa completa de un diagnóstico previo (que en la práctica incluye recomendaciones, porque `toDiagnosisEntry` en `ExecuteCognitiveDiagnosisUseCase.ts:129-145` indexa el texto de diagnóstico ya limpio de JSON). Es justo la combinación glosario + casos que hace "MaxiFix" de Autel valioso frente a una tabla de códigos plana — un solo índice daría la mitad de la historia.

**Rechazado**: filtrar por `code` exacto vía metadato. Requeriría un cambio de schema de `dtcs_index` (nuevo campo estructurado, migración de datos existentes) fuera de alcance de este cambio — y el propio catálogo ya funciona con búsqueda semántica en todos sus consumidores actuales (LLM, admin), así que introducir un modo de filtro exacto solo para esta pantalla rompería la consistencia de cómo se consulta el catálogo en el resto del sistema.

### 3. Acotación por fabricante/modelo: resuelta en el servidor a partir de `scenarioId`, opcional

**Elegido**: `DiagnosisService.getDtcRepairTips(scenarioId, code, description, limit)` reutiliza `this.getVehicleInfo(scenarioId)` (ya existente, `diagnosisService.ts:385-405`) para obtener `make`/`model`, y solo pasa `filter: { manufacturer: make, model }` a `dtcsIndex.search()`/`diagnosisIndex.search()` cuando `make !== 'unknown'` (mismo centinela que ya usa `ExecuteCognitiveDiagnosisUseCase`/`toDiagnosisEntry` para modo TCP/serial directo sin descriptor). Si es `'unknown'` (modo TCP/serial real hoy, sin vehículo identificado por descriptor), la búsqueda va sin filtro — mismo patrón exacto que `retrieveSimilarCases` (`ExecuteCognitiveDiagnosisUseCase.ts:243-245`: `vehicleContext ? { manufacturer, model } : undefined`).

**Por qué en el servidor y no confiando en que el cliente mande `make`/`model`**: `DashboardPage` ya tiene `selectedScenario.vehicleInfo.make/model` disponible, pero confiar en el cliente para acotar una búsqueda de servidor (aunque no sea un control de seguridad crítico aquí) rompe el patrón ya establecido en todo `DiagnosisController` — todos los demás endpoints (`freezeFrame`, `ecuInfo`, `vehicleInfo`, `vehicleStatus`) resuelven todo lo que necesitan a partir de `scenarioId` en el servidor, nunca reciben datos derivados del vehículo por parámetro. Mantiene además el contrato mínimo: el cliente solo manda `scenarioId` + `code` (+ `description` opcional), igual de simple que `freeze-frame`.

**Rechazado**: mandar `manufacturer`/`model` como query params desde el cliente. Duplicaría una fuente de verdad (`selectedScenario.vehicleInfo` en cliente vs `this.scenarios`/`repository.getVehicleInfo()` en servidor) sin necesidad, ya resuelta por `getVehicleInfo()`.

### 4. Ubicación en la UI: nueva sección `repair-tips` del sidebar, no una pestaña dentro de `DtcPanel`

**Elegido**: Nueva entrada `'repair-tips'` en `SidebarSection` (`Sidebar.tsx`) y nuevo `case 'repair-tips'` en `DashboardSection.tsx` que renderiza `DtcRepairTipsPanel`, alimentado por el mismo `selectedDtc` (y la nueva `selectedDtcDescription`) que ya usa `freeze-frame` — mismo patrón sección-dentro-de-la-misma-ruta que `ecu`, `freeze-frame`, `report`, y el propuesto (aún no implementado) `topology`.

**Por qué no una cuarta pestaña dentro de `DtcPanel`** (que ya tiene `Almacenadas`/`Pendientes`/`Permanentes` más el botón "Borrar averías"): `DtcPanel` vive en la columna estrecha del dashboard (mismo layout que obliga a `EcuInfoPanel`/`FreezeFramePanel` a ser paneles de ancho completo aparte, según la Decisión 4 de `add-topology-mapping-screen`). El contenido de "tips" es más largo que una fila de tabla (texto narrativo de casos de diagnóstico, potencialmente varias líneas por resultado) — igual que el freeze frame, necesita más espacio horizontal del que una pestaña dentro del panel angosto de DTCs puede dar. Añadirlo como cuarta pestaña también complicaría la semántica de "pestaña por tipo de lectura OBD" (`Almacenadas`/`Pendientes`/`Permanentes` son los tres modos Mode 03/07/0A) mezclando una fuente de datos completamente distinta (RAG) en el mismo selector.

**Rechazado**: fusionar el panel de tips dentro de `FreezeFramePanel` (mostrar ambos —freeze frame y tips— en la misma sección `freeze-frame`). Se descarta porque ensancharía el propósito de una sección ya con nombre y contrato propios (`freeze-frame-screen` spec archivado), y porque el patrón establecido en este proyecto es una sección = una fuente de datos = un panel (`ecu` → `EcuInfoPanel`, `freeze-frame` → `FreezeFramePanel`, `report` → `SessionReportPanel`). Mantener esa correspondencia 1:1 facilita razonar sobre qué pantalla depende de qué endpoint.

### 5. `DtcPanel.onSelect` pasa también `description`: ensanchamiento de tipo, no cambio de contrato

**Elegido**: `onSelect: (code: string, description?: string) => void` — `CodeList` ya tiene el objeto `DtcCode` completo (`c.code`, `c.description`) en el `onClick`; solo hace falta pasarlo. `DashboardPage.handleDtcSelect` guarda ambos en estado (`selectedDtc` sin cambios de tipo, más `selectedDtcDescription: string | null` nuevo) y sigue navegando a `'freeze-frame'` exactamente igual que hoy — este cambio no toca ese comportamiento.

**Por qué necesario**: sin `description`, el texto de búsqueda para un DTC recién detectado sería solo el código pelado (p. ej. `"P0301"`), que aporta señal semántica mínima al modelo de embeddings comparado con `"P0301: Misfire detected — Cylinder 1"`. La `description` ya viaja hoy con cada `DtcCode` desde el backend (`GET /api/diagnosis`, `/api/pending-dtc`, `/api/permanent-dtc`) — es una ampliación de qué se propaga en la UI, no un dato nuevo que haya que ir a buscar.

**Por qué es seguro ensanchar en vez de duplicar `onSelect`**: es un cambio de tipo estrictamente aditivo (nuevo parámetro opcional al final) — `FreezeFramePanel`, el único consumidor actual de `selectedDtc`, no cambia ni de tipo ni de comportamiento porque nunca leyó el segundo argumento.

### 6. Disponibilidad del catálogo: flag `knowledgeBase` en `GET /api/mcp/capabilities`, no `503` por petición

**Elegido**: Extender la respuesta ya existente de `GET /api/mcp/capabilities` (`{ cognitiveDiagnosis: boolean }` → `{ cognitiveDiagnosis: boolean, knowledgeBase: boolean }`), con `knowledgeBase = DiagnosisService` tiene `knowledgeStack` configurado (nuevo getter `hasKnowledgeBase`, mismo patrón que el getter existente `hasCognitiveDiagnosis`, `diagnosisService.ts:222-225`). El frontend (`useCapabilities()`) consulta esta flag una vez (con `staleTime`) y la sección `repair-tips` la usa para mostrar un mensaje "no disponible en este entorno" en vez de intentar la llamada — mismo patrón que la sección `chat` ya usa hoy con `cognitive.available` (`DashboardSection.tsx:138-145`).

**Por qué no `503` en `GET /api/dtc-repair-tips`** (patrón que sí usa `AdminController` para `knowledge`/`knowledge/search` cuando `knowledgeStack` es `undefined`): el namespace `/api/diagnosis` ya tiene su propio patrón establecido para "feature opcional según configuración del servidor" — la flag de capacidad consultada por adelantado, no un código de estado por petición fallida. Usar `503` aquí introduciría dos patrones distintos para el mismo tipo de situación dentro del mismo namespace (`cognitiveDiagnosis` ya se resuelve con capacidad, no con `404`/`503` en cada llamada a `/api/mcp/cognitive-diagnosis` — ese endpoint sí puede devolver 404 vía `CognitiveDiagnosisUnavailableError`, pero el frontend nunca llega a llamarlo si `capabilities` ya dijo que no está disponible). Mantener consistencia interna del namespace es más importante aquí que imitar el patrón de `/api/admin` (audiencia y ciclo de vida distintos).

**Comportamiento del endpoint en sí cuando `knowledgeStack` no está configurado**: `GetDtcRepairTipsUseCase`/`DiagnosisService.getDtcRepairTips()` devuelve `[]` (lista vacía) en vez de lanzar — coherente con la filosofía de degradación ya documentada en `openspec/specs/rag-cognitive-retrieval/spec.md` ("un fallo del índice no debe interrumpir el diagnóstico"). La flag de capacidad es la señal principal para la UI; el endpoint en sí nunca deja al mecánico con un error duro solo porque el catálogo esté apagado.

## Data Model

Sin cambios de dominio ni de esquema. Nuevo DTO de salida (agregado, no persistido):

```typescript
// apps/core-api/src/application/dto/knowledge/DtcRepairTip.ts
export interface DtcRepairTip {
  readonly source: 'dtc' | 'diagnosis'
  readonly distance: number
  readonly embeddedText: string
  readonly manufacturer: string
  readonly model: string
  readonly confidence: number
  /** Solo presente cuando `source === 'dtc'` (DtcKnowledgeEntry.validated). */
  readonly validated?: boolean
  /** Solo presente cuando `source === 'diagnosis'` (DiagnosisKnowledgeEntry.symptoms). */
  readonly symptoms?: readonly string[]
}
```

### Flujo de ejecución

```
Mecánico selecciona un DTC en DtcPanel (cualquier pestaña: Almacenadas/Pendientes/Permanentes)
  → DashboardPage.handleDtcSelect(code, description)
  → selectedDtc + selectedDtcDescription (estado ya elevado, ensanchado)
  → sección 'repair-tips' activa (click manual en el sidebar, igual que 'freeze-frame')
  → useDtcRepairTips(scenarioId, code, description)
      → GET /api/dtc-repair-tips?scenarioId=&code=&description=
      → DiagnosisController.dtcRepairTips → DiagnosisService.getDtcRepairTips()
          → this.getVehicleInfo(scenarioId)  // reutilizado, ya existe
          → GetDtcRepairTipsUseCase.execute({ code, description, manufacturer?, model?, limit })
              → Promise.allSettled([ dtcsIndex.search(query, opts), diagnosisIndex.search(query, opts) ])
              → combina, etiqueta source, ordena por distancia, recorta a `limit`
  → DtcRepairTipsPanel renderiza tarjetas (o estado vacío / no disponible / cargando / error)
```

## UI

`DtcRepairTipsPanel` (`panel` CSS class, icono `lucide-react` `Wrench`, animación `fade-up` por tarjeta con `animationDelay` escalonado — mismo patrón que `FrameTable`/`EcuTable`). Estados vía `PanelState`:
- Sin `selectedDtc`: `empty` — "Selecciona un código DTC para ver tips de reparación".
- `!knowledgeBase` (capacidad ausente): `empty` — "Base de conocimiento no disponible en este entorno" (mismo tono que la sección `chat` sin `cognitive.available`).
- Cargando: `loading`.
- Error de red/servidor: `error`.
- `knowledgeBase` disponible, `tips.length === 0`: `empty` — "Sin resultados en el catálogo para este código todavía".
- `tips.length > 0`: lista de tarjetas, cada una con:
  - Badge de origen (`Significado del código` / `Caso resuelto previo`), color distinto por `source`.
  - Texto (`embeddedText`), fabricante/modelo, distancia (`mono`, como ya hace `KnowledgePanel` con `Badge variant="outline"`), badge de confianza/`validated` cuando `source === 'dtc'`.

```
┌─ Wrench  TIPS DE REPARACIÓN ──────────────── P0301 ─┐
│ [Significado del código]  Audi · A3 · dist 0.18     │
│ "Fallo de encendido detectado, cilindro 1..."        │
│ ────────────────────────────────────────────────────│
│ [Caso resuelto previo]  Audi · A3 · dist 0.24        │
│ "Bujía de encendido defectuosa en cilindro 1,        │
│  reemplazada. Confirmado con freeze frame..."         │
└───────────────────────────────────────────────────────┘
```

Detalle exacto de espaciado/tipografía es decisión de implementación libre para `ui`, siguiendo las clases ya usadas en `EcuInfoPanel`/`FreezeFramePanel`/`KnowledgePanel` (`Badge`, `mono`, `text-[10px] uppercase tracking-wider`).

## Hallazgos de código (siguiendo el patrón de `add-topology-mapping-screen`)

- **`KnowledgeStack.dtcsIndex` infrautilizado**: cableado en `composition.ts` e inyectado en `DiagnosisService` desde `add-rag-cognitive-retrieval`, pero ningún caso de uso de aplicación lo consulta — solo la tool MCP `search_similar_dtcs` (alcanzable solo si el LLM decide invocarla) y el endpoint admin de prueba. Este cambio es el primer consumidor de aplicación no-LLM. No es código muerto (es alcanzable y probado indirectamente vía MCP/admin), pero sí una capacidad de infraestructura ya pagada y sin explotar en el flujo de mecánico — exactamente el tipo de hallazgo que este cambio resuelve, no uno que deje pendiente.
- **Ningún otro hallazgo de código muerto/desconectado** en el área tocada: `DtcPanel`, `FreezeFramePanel`, `DashboardSection`, `Sidebar`, `useCapabilities` están todos activos y cableados en el flujo actual del dashboard.
