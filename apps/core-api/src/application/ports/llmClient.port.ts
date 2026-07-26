/**
 * Puerto para cliente LLM (Large Language Model).
 *
 * Define el contrato que cualquier adaptador de proveedor LLM debe implementar
 * para integrarse con el sistema de diagnostico cognitivo vehicular.
 *
 * @module application/ports/llmClient.port
 */

/** Registro de una herramienta invocada por el LLM durante el diagnostico cognitivo. */
export interface ToolCallTrace {
  /** Nombre de la herramienta MCP invocada. */
  readonly tool: string
  /** Argumentos con los que se invoco la herramienta. */
  readonly args: Record<string, unknown>
  /** Resultado devuelto por la herramienta (serializado como string). */
  readonly result: string
}

/** Definicion de una herramienta MCP para enviar al LLM. */
export interface McpToolDefinition {
  /** Nombre de la herramienta. */
  readonly name: string
  /** Descripcion legible de lo que hace la herramienta. */
  readonly description: string
  /** Schema de validacion (ZodObject serializado como JSON Schema). */
  readonly schema: Record<string, unknown>
}

/**
 * Manejador de invocacion de herramientas.
 *
 * Recibe el nombre de la herramienta y sus argumentos,
 * devuelve el resultado serializado como string.
 * Si falla, lanza una excepcion que el adaptador captura
 * para reportar a Claude como `tool_result` con `is_error: true`.
 */
export type ToolCallHandler = (name: string, args: Record<string, unknown>) => Promise<string>

/** Entrada para el metodo `sendMessage` del puerto LLM. */
export interface LlmMessageInput {
  /** Prompt del sistema (instrucciones, contexto, rol del LLM). */
  readonly systemPrompt: string
  /** Mensaje del usuario (datos de telemetria, consulta de diagnostico). */
  readonly userMessage: string
  /** Definiciones de herramientas MCP disponibles para el LLM. */
  readonly tools: readonly McpToolDefinition[]
  /** Manejador que ejecuta una herramienta cuando el LLM la solicita. */
  readonly handler: ToolCallHandler
}

/** Respuesta del LLM tras el ciclo de tool calling. */
export interface LlmResponse {
  /** Texto final del diagnostico narrativo generado por el LLM. */
  readonly text: string
  /** Traza completa de herramientas ejecutadas durante el diagnostico. */
  readonly toolCalls: readonly ToolCallTrace[]
}

/** Error lanzado cuando el bucle de tool calling alcanza el limite maximo de iteraciones. */
export class MaxToolCallIterationsError extends Error {
  /** Traza parcial de herramientas ejecutadas antes de alcanzar el limite. */
  public readonly partialTrace: readonly ToolCallTrace[]

  constructor(message: string, partialTrace: readonly ToolCallTrace[]) {
    super(message)
    this.name = 'MaxToolCallIterationsError'
    this.partialTrace = partialTrace
  }
}

/**
 * Puerto para cliente LLM.
 *
 * Abstrae la comunicacion con un modelo de lenguaje (Anthropic Claude, OpenAI, etc.)
 * para diagnostico cognitivo vehicular con tool calling.
 */
export interface LlmClientPort {
  /**
   * Envia un prompt al LLM y gestiona el ciclo de tool calling.
   *
   * @param input - Prompt del sistema, mensaje de usuario, herramientas disponibles y manejador.
   * @returns Respuesta estructurada con el texto de diagnostico y la traza de herramientas.
   * @throws {MaxToolCallIterationsError} Si el LLM excede el limite maximo de iteraciones sin generar texto final.
   */
  sendMessage(input: LlmMessageInput): Promise<LlmResponse>
}
