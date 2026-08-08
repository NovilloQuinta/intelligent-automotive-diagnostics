## Contexto

Cuatro problemas con causas independientes pero que comparten los mismos ficheros (`ExecuteCognitiveDiagnosisUseCase.ts`, `useCognitiveDiagnosis.ts`, `MechanicChat.tsx`) — van en un solo cambio por la misma razón que `add-obd-standard-modes`: separarlos en varias ramas garantiza conflictos en el prompt y en el hook.

## Decisión 1: el prompt instruye, no se añade lógica determinista para detectar "PID desconocido"

`derivePidObservations` (`pidObservationEnricher.ts`) resuelve contra `PID_OBSERVATION_CATALOG`, un catálogo estático. Se podría usar ese catálogo para decidir en código cuándo un PID es "desconocido" y forzar una llamada a `index_pid` desde el propio use case. **Se descarta.**

**Por qué.** El catálogo estático solo cubre los PIDs fijos que ya se muestran en el dashboard (rpm, temperatura, velocidad...). El hueco real está en Mode 22 y otros PIDs de fabricante que el LLM lee por iniciativa propia explorando el vehículo — ninguno de esos está ni estará en un catálogo estático a priori, es justo lo que se quiere que el LLM descubra. Forzar la detección en código solo cubriría el caso que menos falta hace. La decisión correcta es dejar que el LLM, que sí tiene conocimiento general de PIDs estándar SAE J1979, decida cuándo un código no le suena y actúe él mismo llamando a `index_pid` — exactamente el patrón que ya usa `indexResolvedCase` para el diagnóstico completo, aplicado ahora a nivel de PID individual.

**Instrucción a añadir al prompt** (ampliando `COGNITIVE_DIAGNOSIS_SYSTEM_PROMPT`):
- Cuando `read_pid` devuelva un PID cuyo significado no reconozcas (frecuente en Mode 22, específico de fabricante), llama a `index_pid` con `source: "web"`, `embeddedText` describiendo qué crees que mide y por qué, `manufacturer`/`model` del vehículo actual, y si puedes inferir la fórmula de conversión con `mode`+`pid`+`formula`+`dataBytes` (y opcionalmente `minValue`/`maxValue`), inclúyelos — eso dispara la validación síncrona contra el vehículo conectado (`ValidateDiscoveredPidUseCase`) y sube la confianza inicial de la entrada.
- Esto no cambia el contrato de `index_pid` ni su handler (`handleIndexPid` en `mcpServer.ts`) — ya acepta exactamente esos campos opcionales.

## Decisión 2: `MaxToolCallIterationsError` se mapea a 422, no a 503

Dos candidatos estudiados: 503 (Service Unavailable, en línea con "el LLM no pudo completar") y 422 (Unprocessable Entity, "la petición era válida pero el proceso no pudo terminar con esos parámetros").

**Se elige 422**, y la razón no es semántica sino de comportamiento real del frontend: `assertOk` en `apps/ui/src/lib/api.ts:216-218` sustituye el mensaje de **cualquier** respuesta con `status >= 500` por un texto genérico fijo, precisamente para no filtrar detalles internos al usuario (mismo criterio OWASP A09 que ya aplica el backend en `respondUnexpected`). Si se mapea a 503, el mensaje específico ("el diagnóstico necesitó demasiados pasos...") nunca llegaría a la UI — quedaría indistinguible de un 500 real. 422 es un 4xx: `assertOk` deja pasar el `error` del body tal cual, que es justo lo que se necesita para que dejar de tragar el error en el frontend tenga sentido.

**Mensaje**: `"El diagnóstico necesitó demasiados pasos. Prueba con una pregunta más concreta."` — implementable y accionable, no un error técnico.

**Dónde vive el mapeo**: `MaxToolCallIterationsError` ya existe en `application/llm/llmErrors.ts` y se propaga sin capturar desde `ExecuteLlmToolCalling.execute()` a través de `ExecuteCognitiveDiagnosisUseCase.execute()` y de `diagnosisService.getCognitiveDiagnosis()`. Sigue el mismo camino que `CognitiveDiagnosisTimeoutError` (que si se mira `diagnosisService.ts:392-406`, es un error de *infraestructura* que envuelve la llamada con `withTimeout`, no una traducción de un error de aplicación). `MaxToolCallIterationsError` en cambio ya es un error de aplicación con nombre propio — no necesita envoltorio nuevo en `diagnosisService`, solo un `if` más en `handleCognitiveError` del controlador, igual que los otros dos.

## Decisión 3: el error se tipa en el hook con `{ message, kind }`, no se relanza la excepción cruda

`useCognitiveDiagnosis` usa TanStack Query (`useMutation`). Relanzar la excepción tal cual y dejar que cada consumidor la interprete (`instanceof ApiHttpError`, leer `.status`) duplicaría esa lógica en `MechanicChat` y en `PidsTable` (vía `DashboardPage`). Se centraliza en el hook:

```ts
interface CognitiveDiagnosisError {
  readonly message: string;
  readonly kind: "timeout" | "unavailable" | "too_many_steps" | "unknown";
}
```

`kind` se deriva del `status` de `ApiHttpError` (504 → timeout, 404 → unavailable, 422 → too_many_steps, cualquier otro incluido no-`ApiHttpError` → unknown con el mensaje genérico). Los componentes consumen `kind` solo si necesitan variar el icono/tono; el `message` ya viene listo para pintar directamente — es el mismo que ya prepara `assertOk` en el cliente HTTP, no se reinterpreta.

**Por qué no un simple `string | null`.** Porque `PidsTable` necesita distinguir "timeout" (el LLM iba bien, tardó) de "too_many_steps" (dio vueltas) si en el futuro se quiere un icono distinto; ahora mismo ambos consumidores solo usan `message`, pero tipar `kind` desde ya evita que el primer componente que lo necesite tenga que volver a tocar el hook.

## Decisión 4: un único scroll, y gana `<main>` sobre el contenedor interno del chat

Antes de la reestructuración a sidebar, `MechanicChat` vivía apilado junto a otros paneles dentro de una rejilla con altura limitada — ahí `max-h-80` tenía sentido: sin él, el chat podía crecer y empujar el resto de paneles fuera de la pantalla. Con el layout de sidebar (`feat/restructure-ui-autel-flow`), el chat es su **propia sección**, ocupa toda el área de `<main>`, y `<main>` ya es `overflow-auto`. El `max-h-80` interno ahora es una caja pequeña dentro de una pantalla grande que también scrollea: dos comportamientos de scroll compitiendo por el mismo gesto del ratón/trackpad, el clásico "scroll interno atrapa el scroll del documento".

**Se quita `max-h-80 overflow-y-auto` del hilo de mensajes** y se deja que `<main>` sea el único contenedor con scroll de la sección. `min-h-0` se conserva donde haga falta para que el hilo no fuerce su propia altura mínima dentro del flex.

**Relación con `rebase-ui-autel-sidebar-dtc-badge` (D4).** Esa decisión fijó `max-h-80 min-h-0` como lo correcto *en el momento en que se tomó*, resolviendo un conflicto de rebase entre un dashboard apilado (`develop` antiguo) y el nuevo layout con sidebar. Esta decisión D4 (aquí) la sustituye una vez el layout con sidebar ya está en pie: el supuesto bajo el que D4 tenía sentido (chat compartiendo espacio con otros paneles) ya no aplica.

## Decisión 5: el prompt pide formato de mecánico, no un cambio de modelo/temperatura

Nada de tocar `LlmClientPort`, parámetros del modelo ni post-procesado del texto para acortarlo. Se añaden instrucciones directas al `COGNITIVE_DIAGNOSIS_SYSTEM_PROMPT`:

- Responde de forma concisa: prioriza pasos accionables sobre explicaciones largas.
- Usa bullets o una lista numerada para las acciones a realizar.
- El destinatario es un mecánico en el taller, no un particular sin conocimientos — puedes usar términos técnicos, pero sin rodeos innecesarios.

**Por qué no forzar longitud máxima en caracteres.** Un límite duro puede cortar el bloque `---JSON---` final o una explicación de causa raíz a medio terminar, que el parser (`extractLlmDiagnosis.js` / `JSON_BLOCK_REGEX`) necesita íntegro. Se pide concisión como instrucción de estilo, no como recorte mecánico del texto de salida.

## Riesgos

- **El LLM podría llamar a `index_pid` con descripciones incorrectas de PIDs de fabricante que no entiende bien.** Riesgo ya aceptado y documentado en `add-knowledge-mcp-tools` (design.md, tabla de riesgos): la confianza inicial nunca llega a 1.0 y solo escala con validación repetida. No se introduce un riesgo nuevo, se activa uno ya mitigado.
- **Instrucciones de estilo en el prompt no garantizan cumplimiento estricto** (los LLMs no siempre respetan "sé conciso"). Se acepta como límite conocido del enfoque; si en verificación manual el modelo sigue siendo verboso, hay que iterar el wording del prompt, no añadir post-procesado que trunque texto.
- **Quitar el scroll interno del chat sin verificar en pantalla real** podría dejar el listado de mensajes creciendo sin límite visual dentro de `<main>`, que es aceptable (es su comportamiento esperado) pero debe confirmarse visualmente en la verificación manual, no solo con tests.
