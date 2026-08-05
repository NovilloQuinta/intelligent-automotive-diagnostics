import type { McpToolDefinition } from './McpToolDefinition.js'
import type { ToolCallHandler } from '@/application/ports/ToolCallHandler.js'

/** Elemento del historial de conversacion entre el LLM y el adaptador. */
export type LlmConversationItem =
  | { readonly __type: 'user_message'; readonly content: string }
  | { readonly __type: 'raw_response'; readonly data: unknown }
  | {
      readonly __type: 'tool_result'
      readonly toolCallId: string
      readonly content: string
      readonly isError: boolean
    }

/** Entrada para los metodos del puerto LLM. */
export interface LlmMessageInput {
  readonly systemPrompt: string
  readonly userMessage: string
  readonly tools: readonly McpToolDefinition[]
  readonly handler: ToolCallHandler
  readonly conversationHistory?: readonly LlmConversationItem[]
}
