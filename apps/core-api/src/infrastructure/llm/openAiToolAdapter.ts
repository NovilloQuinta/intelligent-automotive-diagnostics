import type { McpToolDefinition } from '@/application/ports/llmClient.port.js'
import type OpenAI from 'openai'
import { mcpToolDefinitionSchema } from '@/infrastructure/llm/toolDefinitionSchema.js'

/** Schema por defecto cuando una herramienta no define schema. */
const DEFAULT_PARAMETERS: Record<string, unknown> = { type: 'object', properties: {} }

/** Tipo de herramienta OpenAI generado por el adaptador. */
export type OpenAiChatCompletionTool = OpenAI.Chat.Completions.ChatCompletionTool

/**
 * Convierte una definicion de herramienta MCP al formato
 * {@link OpenAiChatCompletionTool} esperado por la API de OpenAI.
 *
 * Valida la entrada con Zod y transforma el campo `schema` de JSON Schema
 * a `parameters` dentro del bloque `function` que espera la API de OpenAI.
 *
 * @param tool - Definicion de herramienta MCP con name, description y schema opcional.
 * @returns Herramienta en formato OpenAI `{ type: "function", function: { name, description, parameters } }`.
 */
export function openAiToolAdapter(tool: McpToolDefinition): OpenAiChatCompletionTool {
  const parsed = mcpToolDefinitionSchema.parse(tool)
  return {
    type: 'function' as const,
    function: {
      name: parsed.name,
      description: parsed.description,
      parameters: (parsed.schema ?? DEFAULT_PARAMETERS) as Record<string, unknown>,
    },
  }
}
