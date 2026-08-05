import type { LlmClientPort } from '@/application/ports/LlmClientPort.js'
import type { LlmMessageInput } from '@/application/dto/LlmMessageInput.js'
import type { LlmResponse } from '@/application/dto/LlmResponse.js'
import type { LlmSingleResponse } from '@/application/dto/LlmSingleResponse.js'
import type { LlmSingleMessageSender } from '@/application/use-cases/ExecuteLlmToolCalling.js'
import { ExecuteLlmToolCalling } from '@/application/use-cases/ExecuteLlmToolCalling.js'

const DEFAULT_MAX_ITERATIONS = 10

/** Adaptador delgado que implementa una sola llamada a la API del LLM. */
export interface ThinAdapter {
  sendSingleMessage: LlmSingleMessageSender
}

/** Compone un adaptador delgado con el use case de tool calling. */
export function composeLlmClient(adapter: ThinAdapter, maxIterations?: number): LlmClientPort {
  const useCase = new ExecuteLlmToolCalling(
    adapter.sendSingleMessage,
    maxIterations ?? DEFAULT_MAX_ITERATIONS,
  )

  return {
    sendMessage(input: LlmMessageInput): Promise<LlmResponse> {
      return useCase.execute(input)
    },
    sendSingleMessage(input: LlmMessageInput): Promise<LlmSingleResponse> {
      return adapter.sendSingleMessage(input)
    },
  }
}
