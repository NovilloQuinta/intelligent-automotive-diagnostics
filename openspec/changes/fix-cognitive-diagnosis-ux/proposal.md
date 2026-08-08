## Why

El chat mecánico (diagnóstico cognitivo LLM) tiene cuatro problemas encontrados en investigación de solo lectura, ya priorizados con el usuario:

**1. El LLM no aprende PIDs nuevos, aunque la infraestructura ya existe.** `lanceVectorStore.ts`, `ValidateDiscoveredPidUseCase` y la tool MCP `index_pid` (`mcpServer.ts:336-370`) funcionan y cierran el bucle de auto-aprendizaje del ADR-007 §6 (descubrir → indexar → validar). Pero el system prompt del diagnóstico cognitivo, en `ExecuteCognitiveDiagnosisUseCase.ts:22-34`, nunca le dice al LLM que use `index_pid`. El propio nombre de la tool `read_pid` ya avisa: `'Read an OBD-II PID value. Mode 01, 22 for manufacturer-specific.'` — Mode 22 es terreno de PIDs no estándar, justo donde el LLM se encuentra códigos que no reconoce y hoy los deja pasar sin registrar nada. Es infraestructura terminada que no se usa por una frase que falta en el prompt.

**2. El chat traga errores, y eso explica tres síntomas distintos con la misma causa.** `useCognitiveDiagnosis.ts:76-87` descarta cualquier fallo con el comentario `swallowed by design`. Efecto en cascada:
   - El chat mecánico (sección "chat" del dashboard) se queda sin respuesta, sin decir por qué.
   - La tabla de PIDs (`PidsTable.tsx`) muestra "Buscando PIDs adicionales…" y luego el spinner desaparece sin dejar filas ni explicación — parece que se ha quedado colgado.
   - Nada distingue "el LLM tardó demasiado", "se coló un bug" o "agotó los pasos de herramientas" — todo es el mismo silencio.

   En el backend, `DiagnosisController.ts` (`handleCognitiveError`, líneas ~397-417) solo mapea `CognitiveDiagnosisUnavailableError` (404) y `CognitiveDiagnosisTimeoutError` (504). `MaxToolCallIterationsError` — lanzado en `ExecuteLlmToolCalling.ts:94-97` cuando se agotan las 10 iteraciones de tool calls — no está entre los mapeados y cae al 500 genérico, cuyo mensaje el frontend (`api.ts`, `assertOk`) sustituye siempre por un texto genérico. Sin un código de error propio y un status **por debajo de 500**, dejar de tragar el error en el frontend no serviría de nada: seguiría sin haber un mensaje útil que mostrar.

**3. Doble scroll en el chat.** `MechanicChat.tsx` tiene `max-h-80 overflow-y-auto` en el hilo de mensajes, y ahora vive dentro de su propia sección de sidebar (`DashboardLayout.tsx`, `<main className="flex-1 overflow-auto ...">`), que ya es scrollable por sí sola. Dos scrolls anidados en una sección que ya tiene toda la pantalla para el chat es peor experiencia que antes de la reestructuración a sidebar.

**4. Respuestas verbosas y sin formato.** El mismo system prompt no pide nada sobre extensión ni estructura. El usuario lo describe como "demasiado verboso y sin formato para un mecánico, se queda loco". El proyecto ya distingue perfil mecánico vs. particular (memoria: "Dos perfiles: mecánico y particular") — este chat es el del taller, así que el tono es de mecánico: conciso, accionable, con pasos.

## What Changes

- **Prompt del diagnóstico cognitivo** (`ExecuteCognitiveDiagnosisUseCase.ts`): instruir al LLM para que, al toparse con un PID cuyo significado no reconoce (típicamente Mode 22 u otro PID no estándar), llame a `index_pid` para registrarlo en la vectorial — mismo patrón que ya usa `indexResolvedCase` para diagnósticos resueltos. Y para que responda de forma concisa, con pasos/bullets accionables, dirigida a un mecánico.
- **Nuevo error mapeado**: `MaxToolCallIterationsError` deja de caer al 500 genérico. Se mapea a un status **4xx** (422) con mensaje claro — el detalle importa porque el frontend descarta el mensaje real de cualquier respuesta ≥500 (`assertOk`, `apps/ui/src/lib/api.ts:216-218`) y lo sustituye por un texto genérico; solo un 4xx conserva el mensaje específico hasta la UI.
- **`useCognitiveDiagnosis.ts` deja de tragar errores**: expone `error: { message, kind } | null` derivado del fallo real (`ApiHttpError` con su `status`, u otro). Los componentes que consumen el hook (`MechanicChat`, `PidsTable` vía `DashboardPage`) reciben ese estado y pueden mostrar feedback visible.
- **`MechanicChat.tsx`** muestra el error de forma visible cuando lo hay, en vez de dejar el hilo mudo.
- **`PidsTable.tsx`**: cuando `aiLoading` termina con `aiRows` vacío y hay un error cognitivo, la fila deja de leerse como "colgada" — se sustituye por un aviso breve en vez de desaparecer sin más.
- **Un único contenedor con scroll en la sección de chat**: se quita `max-h-80`/`overflow-y-auto` del hilo interno de `MechanicChat.tsx`; `<main>` de `DashboardLayout.tsx` queda como el único scrollable.

## Capabilities

### Modified Capabilities
- `execute-cognitive-diagnosis`: el system prompt instruye indexar PIDs desconocidos vía `index_pid` y responder de forma concisa orientada a mecánico; se añade el mapeo de `MaxToolCallIterationsError` a un status 4xx específico en el controlador HTTP.

### New Capabilities
- `mechanic-chat-ux`: el hook `useCognitiveDiagnosis` deja de tragar errores y los expone tipados; `MechanicChat` y `PidsTable` los muestran; el chat usa un único contenedor con scroll.

## Dependencies

**Coordinar con `rebase-ui-autel-sidebar-dtc-badge`** (change en curso, sin archivar): su tarea 2.6 fija, como decisión explícita de resolución de conflicto (D4), conservar `max-h-80 min-h-0` en `MechanicChat.tsx`. Antes de tocar el scroll (sección de tasks correspondiente en este cambio), comprobar si esa rama ya se rebaseó y mergeó — si D4 todavía no se aplicó, no hay conflicto real: partimos del `max-h-80` actual y lo quitamos aquí, dejando anotado que esta decisión sustituye a D4 porque el layout con sidebar (que D4 asumía) ya hace innecesario el scroll interno.

**No depende de** `add-knowledge-mcp-tools` ni de `add-obd-standard-modes`: las tools de conocimiento y el adaptador ELM327 no se tocan en este cambio.

## Impact

- Modificado: `apps/core-api/src/application/use-cases/ExecuteCognitiveDiagnosisUseCase.ts` (prompt)
- Modificado: `apps/core-api/src/application/llm/llmErrors.ts` o `infrastructure/services/errors.ts` (nuevo error tipado, según a qué capa pertenezca semánticamente)
- Modificado: `apps/core-api/src/infrastructure/services/diagnosisService.ts` (traducir `MaxToolCallIterationsError` si hace falta en el punto donde hoy se traducen `CognitiveDiagnosisTimeoutError`/`Unavailable`)
- Modificado: `apps/core-api/src/infrastructure/http/controllers/DiagnosisController.ts` (`handleCognitiveError`)
- Modificado: `apps/ui/src/components/dashboard/useCognitiveDiagnosis.ts`
- Modificado: `apps/ui/src/components/dashboard/MechanicChat.tsx`
- Modificado: `apps/ui/src/components/dashboard/PidsTable.tsx`
- Modificado: `apps/ui/src/components/layout/DashboardLayout.tsx` (si hace falta ajustar el `<main>` para ser el único scrollable)
- Tests unitarios en `apps/core-api/tests/unit/` y `apps/ui/tests/unit/`
