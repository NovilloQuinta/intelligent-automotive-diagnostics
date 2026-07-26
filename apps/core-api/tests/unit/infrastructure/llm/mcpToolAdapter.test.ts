import { describe, it, expect } from 'vitest'
import { mcpToolAdapter } from '@/infrastructure/llm/mcpToolAdapter.js'
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

describe('mcpToolAdapter', () => {
  it('should convert MCP tool definition to Anthropic Tool format', () => {
    const input: McpToolDefinition = {
      name: 'read_pid',
      description: 'Read an OBD-II PID value',
      schema: jsonSchema,
    }

    const result = mcpToolAdapter(input)

    expect(result).toEqual({
      name: 'read_pid',
      description: 'Read an OBD-II PID value',
      input_schema: jsonSchema,
    })
  })

  it('should return empty input_schema when schema is undefined', () => {
    const input: McpToolDefinition = {
      name: 'get_dtc_codes',
      description: 'Read stored DTCs',
      schema: undefined as unknown as Record<string, unknown>,
    }

    const result = mcpToolAdapter(input)

    expect(result).toEqual({
      name: 'get_dtc_codes',
      description: 'Read stored DTCs',
      input_schema: { type: 'object', properties: {} },
    })
  })

  it('should preserve order when converting an array of tools', () => {
    const inputs: McpToolDefinition[] = [
      { name: 'tool_a', description: 'First tool', schema: jsonSchema },
      { name: 'tool_b', description: 'Second tool', schema: jsonSchema },
      { name: 'tool_c', description: 'Third tool', schema: jsonSchema },
    ]

    const results = inputs.map(mcpToolAdapter)

    expect(results).toHaveLength(3)
    expect(results[0].name).toBe('tool_a')
    expect(results[1].name).toBe('tool_b')
    expect(results[2].name).toBe('tool_c')
  })

  it('should handle tool with empty properties schema', () => {
    const input: McpToolDefinition = {
      name: 'read_vin',
      description: 'Read VIN',
      schema: { type: 'object', properties: {} },
    }

    const result = mcpToolAdapter(input)

    expect(result).toEqual({
      name: 'read_vin',
      description: 'Read VIN',
      input_schema: { type: 'object', properties: {} },
    })
  })
})
