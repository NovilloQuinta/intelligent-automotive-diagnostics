import type { McpToolDefinition } from './McpToolDefinition.js'

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

/** Entrada para los metodos del puerto LLM (sin handler, que viaja por separado). */
export interface LlmMessageInput {
  readonly systemPrompt: string
  readonly userMessage: string
  readonly tools: readonly McpToolDefinition[]
  readonly conversationHistory?: readonly LlmConversationItem[]
}
