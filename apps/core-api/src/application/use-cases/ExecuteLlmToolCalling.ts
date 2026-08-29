import type { LlmMessageInput, LlmConversationItem } from '@/application/dto/llm/LlmMessageInput.js'
import type { LlmResponse } from '@/application/dto/llm/LlmResponse.js'
import type { LlmSingleResponse } from '@/application/dto/llm/LlmSingleResponse.js'
import type { ToolCallTrace } from '@/application/dto/llm/ToolCallTrace.js'
import type { ToolCallHandlerPort } from '@/application/ports/ToolCallHandlerPort.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import { MaxToolCallIterationsError } from '@/application/llm/llmErrors.js'

/**
 * Un diagnostico a fondo (varios PID, DTC, freeze frame, catalogo, web) ronda
 * facilmente las 15-25 tool calls repartidas en varias idas-vueltas.
 */
const DEFAULT_MAX_ITERATIONS = 20

/** Funcion que realiza una sola llamada a la API del LLM. */
export type LlmSingleMessageSender = (input: LlmMessageInput) => Promise<LlmSingleResponse>

/**
 * Resultado de ejecutar una tool: el exito o el fallo viaja en `ok`, nunca en
 * el texto. Un texto que empiece por «Unknown tool:» es contenido legitimo.
 */
interface ToolExecutionResult {
  readonly ok: boolean
  readonly text: string
}

/** Orquesta el bucle de tool calling del LLM. */
export class ExecuteLlmToolCalling {
  private readonly maxIterations: number

  constructor(
    private readonly sendSingleMessage: LlmSingleMessageSender,
    private readonly logger: LoggerPort,
    maxIterations: number = DEFAULT_MAX_ITERATIONS,
  ) {
    this.maxIterations = maxIterations
  }

  private async executeToolCall(
    name: string,
    args: Record<string, unknown>,
    toolNames: Set<string>,
    handler: ToolCallHandlerPort,
  ): Promise<ToolExecutionResult> {
    if (!toolNames.has(name)) return { ok: false, text: `Unknown tool: ${name}` }
    try {
      return { ok: true, text: await handler(name, args) }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      const stack = error instanceof Error ? error.stack : undefined
      this.logger.error(`[ExecuteLlmToolCalling] Tool handler error for '${name}': ${message}`, {
        stack,
      })
      return { ok: false, text: `Tool execution failed: ${name} — ${message}` }
    }
  }

  /**
   * Ejecuta el bucle de tool calling hasta obtener texto final del LLM.
   *
   * Agotar el presupuesto de idas-vueltas NO deja al mecanico sin respuesta: se fuerza
   * una ultima llamada sin herramientas para que el modelo conteste con lo que ya ha
   * reunido, en vez de lanzar un error y no devolver nada.
   *
   * Hubo una version que cortaba antes si el modelo repetia la misma tool con los
   * mismos argumentos 3 veces, pensada como bucle real. Se quito: contra un modelo que
   * a veces relee el mismo PID sin que eso sea un atasco (visto en la bateria de eval),
   * cortaba sesiones que iban bien. El presupuesto de iteraciones ya acota el coste
   * igual, y la respuesta forzada ya cierra bien pase lo que pase.
   *
   * @throws {MaxToolCallIterationsError} Si, tras forzar la respuesta final sin
   *   herramientas, el modelo aun asi no devuelve texto (caso limite).
   */
  async execute(input: LlmMessageInput, handler: ToolCallHandlerPort): Promise<LlmResponse> {
    const { systemPrompt, userMessage, tools } = input
    const toolNames = new Set(tools.map((t) => t.name))
    const conversationHistory: LlmConversationItem[] = input.conversationHistory
      ? [...input.conversationHistory, { __type: 'user_message', content: userMessage }]
      : [{ __type: 'user_message', content: userMessage }]
    const toolTrace: ToolCallTrace[] = []

    for (let iteration = 0; iteration < this.maxIterations; iteration++) {
      const response = await this.sendSingleMessage({
        systemPrompt,
        userMessage,
        tools,
        conversationHistory: [...conversationHistory],
      })

      if (response.text !== null) {
        return { text: response.text, toolCalls: toolTrace }
      }

      const toolResults: LlmConversationItem[] = []
      for (const tc of response.toolCalls) {
        const result = await this.executeToolCall(tc.name, tc.args, toolNames, handler)
        toolTrace.push({ tool: tc.name, args: tc.args, result: result.text })
        toolResults.push({
          __type: 'tool_result',
          toolCallId: tc.id,
          content: result.text,
          isError: !result.ok,
        })
      }

      conversationHistory.push({ __type: 'raw_response', data: response.raw }, ...toolResults)
    }

    return this.forceFinalAnswer(systemPrompt, userMessage, conversationHistory, toolTrace)
  }

  /**
   * Ultimo intento tras agotar el presupuesto de idas-vueltas: la misma llamada pero
   * sin `tools`, asi el modelo no puede seguir pidiendo herramientas y tiene que
   * resumir con lo que ya sabe. Si aun asi no llega texto (raro, pero posible), se
   * lanza el error de siempre en vez de devolver una respuesta vacia.
   */
  private async forceFinalAnswer(
    systemPrompt: string,
    userMessage: string,
    conversationHistory: readonly LlmConversationItem[],
    toolTrace: readonly ToolCallTrace[],
  ): Promise<LlmResponse> {
    const response = await this.sendSingleMessage({
      systemPrompt,
      userMessage,
      tools: [],
      conversationHistory: [...conversationHistory],
    })

    if (response.text !== null) {
      return { text: response.text, toolCalls: toolTrace }
    }

    throw new MaxToolCallIterationsError(
      `Exceeded maximum tool call iterations (${this.maxIterations}) and the model still requested tools.`,
      toolTrace,
    )
  }
}
