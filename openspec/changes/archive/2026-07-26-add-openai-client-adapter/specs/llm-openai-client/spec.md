## ADDED Requirements

### Requirement: Creación del cliente OpenAI-compatible
El sistema SHALL implementar una factory function `createOpenAiClient(config)` en `infrastructure/llm/openAiClient.ts` que devuelva un objeto conforme a `LlmClientPort`, provider-agnostic.

#### Scenario: Respuesta de texto directa sin tool calling
- **WHEN** se envía un mensaje y el LLM responde con `finish_reason: "stop"` y contenido de tipo `text`
- **THEN** el adaptador devuelve `LlmResponse` con `text` igual al contenido del LLM y `toolCalls` vacío

#### Scenario: Tool calling simple (una iteración)
- **WHEN** el LLM responde con `finish_reason: "tool_calls"` solicitando una función
- **AND** el handler de tool se ejecuta exitosamente devolviendo un resultado string
- **AND** en la siguiente llamada el LLM responde con `finish_reason: "stop"` y contenido `text`
- **THEN** el adaptador devuelve `LlmResponse` con el texto final y `toolCalls` conteniendo la traza de la tool ejecutada

#### Scenario: Tool calling múltiple (varias iteraciones)
- **WHEN** el LLM solicita tools en 3 iteraciones consecutivas antes de devolver texto final
- **THEN** el adaptador ejecuta el handler en cada iteración, acumula la traza, y devuelve `LlmResponse` con todas las tool calls registradas en orden

#### Scenario: Tool handler lanza error
- **WHEN** el LLM solicita una tool pero el handler lanza una excepción
- **THEN** el adaptador envía un mensaje con `role: "tool"`, el `tool_call_id` correspondiente, y `content` con el mensaje de error (ej. `"Tool execution failed: tool_name"`)
- **AND** el bucle continúa (no se aborta) hasta que el LLM devuelva `finish_reason: "stop"` o se alcance el límite de iteraciones

#### Scenario: Tool desconocida solicitada por el LLM
- **WHEN** el LLM solicita una tool cuyo nombre no está en las definiciones proporcionadas
- **THEN** el adaptador envía un mensaje con `role: "tool"`, el `tool_call_id` correspondiente, y `content: "Unknown tool: <nombre>"`
- **AND** el bucle continúa

#### Scenario: Configuración provider-agnostic
- **WHEN** se crea el cliente con `baseURL: "https://api.deepseek.com/v1"` y `model: "deepseek-chat"`
- **THEN** las llamadas a la API se dirigen a ese endpoint con ese modelo
- **AND** NO existe ninguna constante hardcodeada para DeepSeek u otro proveedor específico

#### Scenario: Defaults cuando no se especifica baseURL ni model
- **WHEN** se crea el cliente solo con `apiKey`
- **THEN** `baseURL` por defecto es `https://api.openai.com/v1`
- **AND** `model` por defecto es `gpt-4o`

---

### Requirement: Límite de iteraciones de tool calling
El sistema SHALL limitar el bucle de tool calling a un máximo configurable de iteraciones (por defecto 10) para prevenir bucles infinitos.

#### Scenario: Límite de iteraciones alcanzado
- **WHEN** el LLM solicita tools en 10 iteraciones consecutivas sin devolver `finish_reason: "stop"`
- **THEN** el adaptador lanza un error `MaxToolCallIterationsError` con la traza parcial de tool calls ejecutadas

#### Scenario: Límite configurable
- **WHEN** se crea el cliente con `maxIterations: 5`
- **THEN** el bucle se detiene tras 5 iteraciones si el LLM no ha devuelto `finish_reason: "stop"`

---

### Requirement: Timeout por llamada a la API
El sistema SHALL aplicar un timeout de 30 segundos (configurable) por cada llamada individual a la API.

#### Scenario: Timeout por defecto
- **WHEN** una llamada a `client.chat.completions.create` excede 30 segundos
- **THEN** el adaptador lanza un error de timeout (`OpenAiTimeoutError`)

#### Scenario: Timeout configurable
- **WHEN** se crea el cliente con `timeoutMs: 15_000`
- **THEN** las llamadas a la API que excedan 15 segundos lanzan error de timeout

---

### Requirement: Adaptador de herramientas MCP a formato OpenAI
El sistema SHALL proporcionar una función pura `openAiToolAdapter` que convierta definiciones de herramientas MCP (`McpToolDefinition`) al formato `ChatCompletionTool` esperado por la API de OpenAI.

#### Scenario: Conversión básica
- **WHEN** se pasa una definición MCP con `name`, `description`, y `schema` (objeto JSON Schema)
- **THEN** la función devuelve un objeto `{ type: "function", function: { name, description, parameters } }` donde `parameters` es el JSON Schema equivalente

#### Scenario: Tool sin schema
- **WHEN** se pasa una definición MCP sin schema
- **THEN** la función devuelve `parameters: { type: "object", properties: {} }`

#### Scenario: Conversión de array de tools
- **WHEN** se pasa un array de definiciones MCP
- **THEN** la función devuelve un array de herramientas en formato OpenAI, preservando el orden

---

### Requirement: Sanitización de errores del SDK
El sistema SHALL sanitizar los errores del SDK `openai` antes de propagarlos al caller, siguiendo OWASP A09.

#### Scenario: Error de timeout del SDK
- **WHEN** el SDK lanza un `APIConnectionTimeoutError`
- **THEN** el adaptador lanza `OpenAiTimeoutError` con un mensaje genérico (NO el mensaje crudo del SDK)
- **AND** se registra el error en consola con contexto limitado (solo `name`, sin mensajes internos)

#### Scenario: Error HTTP del SDK (401)
- **WHEN** el SDK devuelve un error con `status: 401`
- **THEN** el adaptador lanza `OpenAiApiError` con mensaje `"Authentication failed"` y el status code

#### Scenario: Error HTTP del SDK (429)
- **WHEN** el SDK devuelve un error con `status: 429`
- **THEN** el adaptador lanza `OpenAiApiError` con mensaje `"Rate limit exceeded"` y el status code

#### Scenario: Error HTTP del SDK (5xx)
- **WHEN** el SDK devuelve un error con `status >= 500`
- **THEN** el adaptador lanza `OpenAiApiError` con mensaje `"OpenAI API server error"` y el status code

---

### Requirement: Estructura de respuesta LlmResponse
El sistema SHALL devolver un objeto `LlmResponse` con el texto final del diagnóstico y la traza completa de tool calls ejecutadas. (Mismo contrato que Anthropic, compartido vía `LlmClientPort`).

#### Scenario: Respuesta con tool calls
- **WHEN** el diagnóstico involucró 2 tool calls
- **THEN** `LlmResponse.text` contiene el diagnóstico narrativo del LLM
- **AND** `LlmResponse.toolCalls` contiene 2 entradas, cada una con `tool`, `args` y `result`

#### Scenario: Respuesta sin tool calls
- **WHEN** el LLM devuelve texto directamente sin solicitar herramientas
- **THEN** `LlmResponse.text` contiene el diagnóstico
- **AND** `LlmResponse.toolCalls` es un array vacío

---

### Requirement: Validación de configuración con Zod
El sistema SHALL validar la configuración del cliente con Zod antes de crear el cliente.

#### Scenario: Configuración válida
- **WHEN** se pasa `{ apiKey: "sk-...", baseURL: "https://api.openai.com/v1", model: "gpt-4o", maxIterations: 10, timeoutMs: 30000 }`
- **THEN** la validación pasa y el cliente se crea exitosamente

#### Scenario: apiKey vacía
- **WHEN** se pasa `{ apiKey: "" }`
- **THEN** Zod lanza un error de validación indicando que `apiKey` es requerida y no puede estar vacía

#### Scenario: maxIterations fuera de rango
- **WHEN** se pasa `{ apiKey: "sk-...", maxIterations: 0 }`
- **THEN** Zod lanza un error de validación indicando que `maxIterations` debe ser >= 1
