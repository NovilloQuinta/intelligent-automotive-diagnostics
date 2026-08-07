import type { ToolCallTrace } from './ToolCallTrace.js'

/** Respuesta del LLM tras el ciclo de tool calling. */
export interface LlmResponse {
  readonly text: string
  readonly toolCalls: readonly ToolCallTrace[]
}
