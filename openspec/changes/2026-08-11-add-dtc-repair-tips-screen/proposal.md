## Why

Autel MaxiSys incluye "MaxiFix": al seleccionar un DTC, el escáner muestra casos reales resueltos por otros técnicos para ese mismo código — causa probable, síntomas asociados y pasos de reparación — en vez de dejar al mecánico con solo la descripción genérica del código. Este proyecto ya tiene la pieza de infraestructura que haría posible ese mismo flujo: un catálogo de conocimiento vectorial (RAG, ADR-007) con tres índices en LanceDB, uno de ellos (`dtcs_index`) específicamente de significados de DTC por fabricante/modelo y otro (`diagnoses_index`) de casos de diagnóstico previos resueltos con su narrativa completa (incluye recomendaciones).

Hoy ese catálogo es accesible desde la UI por exactamente un camino: `KnowledgePanel.tsx`, montado bajo `/api/admin/knowledge/search`, protegido por `requireAdmin` — una herramienta de prueba interna para operadores, no un flujo de mecánico. El chat cognitivo (`MechanicChat.tsx` → `POST /api/mcp/cognitive-diagnosis`) sí puede consultar `search_similar_dtcs`/`search_similar_diagnoses` porque el LLM tiene esas tools MCP disponibles, pero solo si el mecánico decide preguntar en lenguaje libre — no hay ninguna vinculación estructurada "este DTC concreto del panel → estos resultados de conocimiento", ni tampoco hay ningún caso de uso de aplicación que invoque esos índices sin pasar por el LLM. El panel de códigos de avería (`DtcPanel.tsx`) ya es seleccionable (desde `add-freeze-frame-screen`) pero solo dispara la carga del freeze frame — no hay ningún vínculo con el conocimiento acumulado.

Este cambio añade esa vinculación estructurada: al seleccionar un DTC en el dashboard, un panel nuevo muestra los resultados de búsqueda semántica en `dtcs_index` (qué significa probablemente el código) y en `diagnoses_index` (casos previos resueltos con síntomas similares), sin pasar por el LLM ni por `/api/admin`. No hace falta ningún dato nuevo, tabla nueva ni motor de embeddings nuevo — reutiliza `VectorRepository.search()` exactamente como ya hace `ExecuteCognitiveDiagnosisUseCase` para `diagnosisIndex`, y como ya hacen las tools MCP `search_similar_dtcs`/`search_similar_diagnoses` para el LLM. Es, igual que `add-topology-mapping-screen`, una capability principalmente de aplicación+UI sobre datos e infraestructura que ya existen.

## What Changes

- **Nuevo endpoint `GET /api/dtc-repair-tips`** (namespace `/api/diagnosis`, detrás de `authMiddleware` global, accesible a cualquier usuario autenticado — NO bajo `/api/admin`, NO requiere `requireAdmin`): dado `scenarioId`, `code` (DTC) y `description` opcional, busca en paralelo en `dtcsIndex` y `diagnosisIndex` (mismo `KnowledgeStack` que ya usa `DiagnosisService` para el diagnóstico cognitivo) y devuelve resultados combinados ordenados por distancia, acotados por fabricante/modelo del vehículo activo cuando se conocen.
- **Nuevo caso de uso `GetDtcRepairTipsUseCase`** (`application/use-cases/`, no `application/use-cases/admin/`): construye el texto de búsqueda (`"<code>: <description>"`), invoca `dtcsIndex.search()` y `diagnosisIndex.search()` con degradación independiente por índice (un índice caído no vacía el otro), y combina/etiqueta (`source: 'dtc' | 'diagnosis'`) el resultado.
- **Nueva flag de capacidad `knowledgeBase`** en `GET /api/mcp/capabilities`: `true` cuando `DiagnosisService` tiene `knowledgeStack` configurado, siguiendo el mismo patrón que la flag existente `cognitiveDiagnosis`. El frontend la usa para distinguir "sin resultados" de "RAG no disponible en este entorno" — igual que `MechanicChat`/sección `chat` ya hacen con `cognitiveDiagnosis`.
- **Nueva sección del dashboard `repair-tips`**: pestaña adicional en el `Sidebar`, sin nueva ruta — mismo patrón que `dtc`, `freeze-frame`, `ecu`, `topology` (sección dentro de la única ruta autenticada `/`). Reacciona al mismo `selectedDtc` que ya alimenta `freeze-frame` (elevado en `DashboardPage`), sin duplicar el estado de selección.
- **Nuevo componente `DtcRepairTipsPanel`** (`apps/ui/src/components/dashboard/DtcRepairTipsPanel.tsx`): lista de tarjetas con el texto del conocimiento recuperado, distancia, fabricante/modelo, confianza y una etiqueta de origen ("Significado del código" vs "Caso resuelto previo"), siguiendo el patrón visual ya establecido (`panel`, `lucide-react`, `fade-up`, `PanelState`) de `EcuInfoPanel`/`FreezeFramePanel`.
- **Descripción del DTC seleccionado disponible en la selección**: `DtcPanel`'s `onSelect` pasa también la `description` del código clicado (ensanchamiento de tipo compatible hacia atrás, `(code: string, description?: string) => void`), para que la búsqueda tenga más que el código pelado — sin este dato el `embeddedText` de un código aislado (p. ej. `"P0301"`) apenas aporta señal semántica al embedding.
- **Sin cambios de dominio, LanceDB ni Drizzle**: reutiliza `VectorRepository.search()`, `KnowledgeStack`, `DtcKnowledgeEntry` y `DiagnosisKnowledgeEntry` tal cual existen hoy.

## Capabilities

### New Capabilities
- `dtc-repair-tips-screen`: Panel del dashboard que vincula cada DTC seleccionado con resultados de búsqueda semántica del catálogo de conocimiento (`dtcs_index` + `diagnoses_index`), inspirado en "MaxiFix" de Autel MaxiSys — inicialmente disponible para cualquier usuario autenticado, no solo administradores.

## Impact

- Nuevo: `apps/core-api/src/application/use-cases/GetDtcRepairTipsUseCase.ts`
- Nuevo: `apps/core-api/src/application/dto/knowledge/DtcRepairTip.ts`
- Modificado: `apps/core-api/src/infrastructure/services/diagnosisService.ts` (+ `getDtcRepairTips()`, + getter `hasKnowledgeBase`, capabilities extendido)
- Modificado: `apps/core-api/src/infrastructure/http/controllers/DiagnosisController.ts` (+ `dtcRepairTips`, `capabilities` extendido)
- Modificado: `apps/core-api/src/infrastructure/http/routes/diagnosis.routes.ts` (+ `GET /dtc-repair-tips`)
- Modificado: `apps/core-api/src/infrastructure/http/server.ts` (`applyDiagnosisRateLimits` + `/api/dtc-repair-tips`)
- Nuevo: `apps/ui/src/components/dashboard/DtcRepairTipsPanel.tsx`
- Nuevo: `apps/ui/src/components/dashboard/useDtcRepairTips.ts`
- Modificado: `apps/ui/src/components/dashboard/DtcPanel.tsx` (`onSelect` pasa `description`)
- Modificado: `apps/ui/src/components/dashboard/DashboardPage.tsx` (`selectedDtcDescription`, `handleDtcSelect`)
- Modificado: `apps/ui/src/components/dashboard/DashboardSection.tsx` (+ `case 'repair-tips'`)
- Modificado: `apps/ui/src/components/dashboard/useCapabilities.ts` y `apps/ui/src/lib/api.ts` (`knowledgeBase` flag, `getDtcRepairTips()`)
- Modificado: `apps/ui/src/components/layout/Sidebar.tsx` (+ sección `repair-tips`)
- Modificado: `apps/ui/src/components/dashboard/types.ts` (+ `DtcRepairTip`)
- Tests nuevos/modificados en `apps/core-api/tests/unit/` (`GetDtcRepairTipsUseCase`, `DiagnosisService.getDtcRepairTips`, `DiagnosisController.dtcRepairTips`) y `apps/ui/tests/unit/components/` (`DtcRepairTipsPanel`, `DtcPanel`, `Sidebar`, `DashboardSection`)
