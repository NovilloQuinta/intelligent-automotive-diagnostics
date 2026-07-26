import { describe, it, expect } from 'vitest'
import { openAiToolAdapter } from '@/infrastructure/llm/openAiToolAdapter.js'
import type { McpToolDefinition } from '@/application/ports/llmClient.port.js'

/**
 * Schema JSON basico para tests del adaptador.
 */
const jsonSchema = {
  type: 'object',
  properties: {
    mode: { type: 'string', description: 'OBD mode' },
    pid: { type: 'string', description: 'PID code' },
  },
  required: ['mode', 'pid'],
} as const

describe('openAiToolAdapter', () => {
  it('should convert MCP tool definition to OpenAI ChatCompletionFunctionTool format', () => {
    const input: McpToolDefinition = {
      name: 'read_pid',
      description: 'Read an OBD-II PID value',
      schema: jsonSchema,
    }

    const result = openAiToolAdapter(input)

    expect(result).toEqual({
      type: 'function',
      function: {
        name: 'read_pid',
        description: 'Read an OBD-II PID value',
        parameters: jsonSchema,
      },
    })
  })

  it('should return empty parameters when schema is undefined', () => {
    const input: McpToolDefinition = {
      name: 'get_dtc_codes',
      description: 'Read stored DTCs',
      schema: undefined as unknown as Record<string, unknown>,
    }

    const result = openAiToolAdapter(input)

    expect(result).toEqual({
      type: 'function',
      function: {
        name: 'get_dtc_codes',
        description: 'Read stored DTCs',
        parameters: { type: 'object', properties: {} },
      },
    })
  })

  it('should preserve order when converting an array of tools', () => {
    const inputs: McpToolDefinition[] = [
      { name: 'tool_a', description: 'First tool', schema: jsonSchema },
      { name: 'tool_b', description: 'Second tool', schema: jsonSchema },
      { name: 'tool_c', description: 'Third tool', schema: jsonSchema },
    ]

    const results = inputs.map(openAiToolAdapter)

    expect(results).toHaveLength(3)
    expect(results[0].function.name).toBe('tool_a')
    expect(results[1].function.name).toBe('tool_b')
    expect(results[2].function.name).toBe('tool_c')
  })

  it('should handle tool with empty properties schema', () => {
    const input: McpToolDefinition = {
      name: 'read_vin',
      description: 'Read VIN',
      schema: { type: 'object', properties: {} },
    }

    const result = openAiToolAdapter(input)

    expect(result).toEqual({
      type: 'function',
      function: {
        name: 'read_vin',
        description: 'Read VIN',
        parameters: { type: 'object', properties: {} },
      },
    })
  })
})
