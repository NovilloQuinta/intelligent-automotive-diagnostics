import type { McpToolDefinition } from './McpToolDefinition.js'
import type { ToolCallHandler } from '@/application/ports/ToolCallHandler.js'

/** Entrada para el metodo `sendMessage` del puerto LLM. */
export interface LlmMessageInput {
  readonly systemPrompt: string
  readonly userMessage: string
  readonly tools: readonly McpToolDefinition[]
  readonly handler: ToolCallHandler
}
