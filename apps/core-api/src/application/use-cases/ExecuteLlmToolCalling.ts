import type { LlmMessageInput } from '@/application/dto/llm/LlmMessageInput.js'
import type { LlmConversationItem } from '@/application/dto/llm/LlmMessageInput.js'
import type { LlmResponse } from '@/application/dto/llm/LlmResponse.js'
import type { LlmSingleResponse } from '@/application/dto/llm/LlmSingleResponse.js'
import type { ToolCallTrace } from '@/application/dto/llm/ToolCallTrace.js'
import type { ToolCallHandler } from '@/application/ports/ToolCallHandler.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import { MaxToolCallIterationsError } from '@/application/llm/llmErrors.js'

const DEFAULT_MAX_ITERATIONS = 10

/** Funcion que realiza una sola llamada a la API del LLM. */
export type LlmSingleMessageSender = (input: LlmMessageInput) => Promise<LlmSingleResponse>

function isToolError(result: string): boolean {
  return result.startsWith('Unknown tool:') || result.startsWith('Tool execution failed:')
}

/** Orquesta el bucle de tool calling del LLM. */
export class ExecuteLlmToolCalling {
  private readonly maxIterations: number

  constructor(
    private readonly sendSingleMessage: LlmSingleMessageSender,
    maxIterations: number = DEFAULT_MAX_ITERATIONS,
    private readonly logger: LoggerPort,
  ) {
    this.maxIterations = maxIterations
  }

  private async executeToolCall(
    name: string,
    args: Record<string, unknown>,
    toolNames: Set<string>,
    handler: ToolCallHandler,
  ): Promise<string> {
    if (!toolNames.has(name)) return `Unknown tool: ${name}`
    try {
      return await handler(name, args)
    } catch (error: unknown) {
      this.logger.error(
        `[ExecuteLlmToolCalling] Tool handler error for '${name}': ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      return `Tool execution failed: ${name}`
    }
  }

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
        toolTrace.push({ tool: tc.name, args: tc.args, result })
        toolResults.push({
          __type: 'tool_result',
          toolCallId: tc.id,
          content: result,
          isError: isToolError(result),
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
