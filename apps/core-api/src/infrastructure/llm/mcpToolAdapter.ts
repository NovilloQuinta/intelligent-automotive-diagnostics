import type Anthropic from '@anthropic-ai/sdk'
import type { McpToolDefinition } from '@/application/ports/llmClient.port.js'
import { mcpToolDefinitionSchema } from '@/infrastructure/llm/toolDefinitionSchema.js'

/** Schema por defecto cuando una herramienta no define schema. */
const DEFAULT_INPUT_SCHEMA: Record<string, unknown> = { type: 'object', properties: {} }

/**
 * Convierte una definicion de herramienta MCP al formato Tool de Anthropic.
 *
 * Valida la entrada con Zod y transforma el campo `schema` de JSON Schema
 * a `input_schema` que espera la API de Anthropic Messages.
 *
 * @param tool - Definicion de herramienta MCP con name, description y schema opcional.
 * @returns Herramienta en formato `Anthropic.Messages.Tool`.
 */
export function mcpToolAdapter(tool: McpToolDefinition): Anthropic.Messages.Tool {
  const parsed = mcpToolDefinitionSchema.parse(tool)
  return {
    name: parsed.name,
    description: parsed.description,
    input_schema: (parsed.schema ?? DEFAULT_INPUT_SCHEMA) as Anthropic.Messages.Tool.InputSchema,
  }
}
