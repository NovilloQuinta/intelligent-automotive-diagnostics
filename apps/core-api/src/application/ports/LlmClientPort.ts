import type { LlmMessageInput } from '@/application/dto/llm/LlmMessageInput.js'
import type { LlmResponse } from '@/application/dto/llm/LlmResponse.js'
import type { LlmSingleResponse } from '@/application/dto/llm/LlmSingleResponse.js'
import type { ToolCallHandler } from '@/application/ports/ToolCallHandler.js'

/** Puerto para cliente LLM con soporte de tool calling. */
export interface LlmClientPort {
  /** Envia un prompt al LLM y gestiona el ciclo completo de tool calling. */
  sendMessage(input: LlmMessageInput, handler: ToolCallHandler): Promise<LlmResponse>

  /** Realiza una sola llamada a la API del LLM, sin bucle de tool calling. */
  sendSingleMessage(input: LlmMessageInput): Promise<LlmSingleResponse>
}
