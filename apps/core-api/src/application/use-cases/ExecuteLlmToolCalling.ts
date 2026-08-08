import type { LlmMessageInput, LlmConversationItem } from '@/application/dto/llm/LlmMessageInput.js'
import type { LlmResponse } from '@/application/dto/llm/LlmResponse.js'
import type { LlmSingleResponse } from '@/application/dto/llm/LlmSingleResponse.js'
import type { ToolCallTrace } from '@/application/dto/llm/ToolCallTrace.js'
import type { ToolCallHandler } from '@/application/ports/ToolCallHandler.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import { MaxToolCallIterationsError } from '@/application/llm/llmErrors.js'

const DEFAULT_MAX_ITERATIONS = 10

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
    handler: ToolCallHandler,
  ): Promise<ToolExecutionResult> {
    if (!toolNames.has(name)) return { ok: false, text: `Unknown tool: ${name}` }
    try {
      return { ok: true, text: await handler(name, args) }
    } catch (error: unknown) {
      this.logger.error(
        `[ExecuteLlmToolCalling] Tool handler error for '${name}': ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      return { ok: false, text: `Tool execution failed: ${name}` }
    }
  }

  /**
   * Ejecuta el bucle de tool calling hasta obtener texto final del LLM.
   *
   * @throws {MaxToolCallIterationsError} Si se agotan las iteraciones sin respuesta final.
   */
  async execute(input: LlmMessageInput, handler: ToolCallHandler): Promise<LlmResponse> {
    const { systemPrompt, userMessage, tools } = input
    const toolNames = new Set(tools.map((t) => t.name))
    const conversationHistory: LlmConversationItem[] = [
      { __type: 'user_message', content: userMessage },
    ]
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

    throw new MaxToolCallIterationsError(
      `Exceeded maximum tool call iterations (${this.maxIterations}).`,
      toolTrace,
    )
  }
}
