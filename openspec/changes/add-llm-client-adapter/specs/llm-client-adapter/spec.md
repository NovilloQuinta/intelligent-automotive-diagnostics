## ADDED Requirements

### Requirement: Puerto LlmClientPort
El sistema SHALL definir un puerto `LlmClientPort` en `application/ports/` que exponga un método `sendMessage` para enviar prompts al LLM con herramientas MCP.

#### Scenario: Envio de mensaje con tools
- **WHEN** el use case invoca `sendMessage` con `systemPrompt`, `userMessage`, `tools` (definiciones MCP) y un `handler` de tool
- **THEN** el puerto devuelve una `LlmResponse` que contiene el texto de diagnóstico y la traza de tool calls ejecutadas

#### Scenario: Puerto como interfaz pura
- **WHEN** se define `LlmClientPort`
- **THEN** la interfaz no importa ninguna dependencia de infraestructura (ni `@anthropic-ai/sdk`, ni `http`, ni `fs`)

---

### Requirement: Creacion del cliente Anthropic
El sistema SHALL implementar una factory function `createAnthropicClient(apiKey)` en `infrastructure/llm/anthropicClient.ts` que devuelva un objeto conforme a `LlmClientPort`.

#### Scenario: Respuesta de texto directa sin tool calling
- **WHEN** se envía un mensaje y Claude responde con `stop_reason: "end_turn"` y contenido de tipo `text`
- **THEN** el adaptador devuelve `LlmResponse` con `text` igual al contenido de Claude y `toolCalls` vacío

#### Scenario: Tool calling simple (una iteración)
- **WHEN** Claude responde con `stop_reason: "tool_use"` solicitando una tool
- **AND** el handler de tool se ejecuta exitosamente devolviendo un resultado string
- **AND** en la siguiente llamada Claude responde con `stop_reason: "end_turn"` y contenido `text`
- **THEN** el adaptador devuelve `LlmResponse` con el texto final y `toolCalls` conteniendo la traza de la tool ejecutada

#### Scenario: Tool calling múltiple (varias iteraciones)
- **WHEN** Claude solicita tools en 3 iteraciones consecutivas antes de devolver texto final
- **THEN** el adaptador ejecuta el handler en cada iteración, acumula la traza, y devuelve `LlmResponse` con todas las tool calls registradas en orden

#### Scenario: Tool handler lanza error
- **WHEN** Claude solicita una tool pero el handler lanza una excepción
- **THEN** el adaptador envía un `tool_result` con `is_error: true` y el mensaje de error a Claude
- **AND** el bucle continúa (no se aborta) hasta que Claude devuelva texto o se alcance el límite de iteraciones

#### Scenario: Tool desconocida solicitada por Claude
- **WHEN** Claude solicita una tool cuyo nombre no está en las definiciones proporcionadas
- **THEN** el adaptador envía un `tool_result` con `is_error: true` indicando "Unknown tool: <nombre>"
- **AND** el bucle continúa

---

### Requirement: Limite de iteraciones de tool calling
El sistema SHALL limitar el bucle de tool calling a un máximo configurable de iteraciones (por defecto 10) para prevenir bucles infinitos.

#### Scenario: Limite de iteraciones alcanzado
- **WHEN** Claude solicita tools en 10 iteraciones consecutivas sin devolver texto final
- **THEN** el adaptador lanza un error `MaxToolCallIterationsError` con la traza parcial de tool calls ejecutadas

#### Scenario: Limite configurable
- **WHEN** se crea el cliente con `maxIterations: 5`
- **THEN** el bucle se detiene tras 5 iteraciones si Claude no ha devuelto texto final

---

### Requirement: Timeout por llamada a la API
El sistema SHALL aplicar un timeout de 30 segundos (configurable) por cada llamada individual a la API de Anthropic.

#### Scenario: Timeout por defecto
- **WHEN** una llamada a `messages.create` excede 30 segundos
- **THEN** el adaptador lanza un error de timeout (`AnthropicTimeoutError`)

#### Scenario: Timeout configurable
- **WHEN** se crea el cliente con `timeoutMs: 15_000`
- **THEN** las llamadas a la API que excedan 15 segundos lanzan error de timeout

---

### Requirement: Adaptador de herramientas MCP a formato Anthropic
El sistema SHALL proporcionar una función pura `mcpToolAdapter` que convierta definiciones de herramientas MCP (con schemas Zod) al formato `Tool` esperado por la API de Anthropic.

#### Scenario: Conversion basica
- **WHEN** se pasa una definición MCP con `name`, `description`, y `schema` (Zod object)
- **THEN** la función devuelve un objeto `{ name, description, input_schema }` donde `input_schema` es el JSON Schema equivalente

#### Scenario: Tool sin schema
- **WHEN** se pasa una definición MCP con `schema: undefined` o sin schema
- **THEN** la función devuelve `input_schema: { type: "object", properties: {} }`

#### Scenario: Conversion de array de tools
- **WHEN** se pasa un array de definiciones MCP
- **THEN** la función devuelve un array de herramientas en formato Anthropic, preservando el orden

---

### Requirement: Estructura de respuesta LlmResponse
El sistema SHALL devolver un objeto `LlmResponse` con el texto final del diagnóstico y la traza completa de tool calls ejecutadas.

#### Scenario: Respuesta con tool calls
- **WHEN** el diagnóstico involucró 2 tool calls
- **THEN** `LlmResponse.text` contiene el diagnóstico narrativo de Claude
- **AND** `LlmResponse.toolCalls` contiene 2 entradas, cada una con `tool`, `args` y `result`

#### Scenario: Respuesta sin tool calls
- **WHEN** Claude devuelve texto directamente sin solicitar herramientas
- **THEN** `LlmResponse.text` contiene el diagnóstico
- **AND** `LlmResponse.toolCalls` es un array vacío
