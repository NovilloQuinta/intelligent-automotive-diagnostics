import type { LlmClientPort } from '@/application/ports/LlmClientPort.js'
import type { LlmMessageInput } from '@/application/dto/llm/LlmMessageInput.js'
import type { LlmResponse } from '@/application/dto/llm/LlmResponse.js'
import type { LlmSingleResponse } from '@/application/dto/llm/LlmSingleResponse.js'
import type { ToolCallHandler } from '@/application/ports/ToolCallHandler.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import type { LlmSingleMessageSender } from '@/application/use-cases/ExecuteLlmToolCalling.js'
import { ExecuteLlmToolCalling } from '@/application/use-cases/ExecuteLlmToolCalling.js'

/** Compone un remitente single-message con el use case de tool calling. */
export function composeLlmClient(
  sendSingleMessage: LlmSingleMessageSender,
  maxIterations: number | undefined,
  logger: LoggerPort,
): LlmClientPort {
  const useCase = new ExecuteLlmToolCalling(sendSingleMessage, maxIterations, logger)

  return {
    sendMessage(input: LlmMessageInput, handler: ToolCallHandler): Promise<LlmResponse> {
      return useCase.execute(input, handler)
    },
    sendSingleMessage(input: LlmMessageInput): Promise<LlmSingleResponse> {
      return sendSingleMessage(input)
    },
  }
}
