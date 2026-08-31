import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { shapeToJsonSchema } from '@/infrastructure/mcp/mcpToolkit.js'

describe('shapeToJsonSchema', () => {
  it('maps primitive types', () => {
    const schema = shapeToJsonSchema({
      name: z.string(),
      count: z.number(),
      active: z.boolean(),
    })

    expect(schema).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string' },
        count: { type: 'number' },
        active: { type: 'boolean' },
      },
      required: ['name', 'count', 'active'],
    })
  })

  it('marks optional fields as not required', () => {
    const schema = shapeToJsonSchema({ model: z.string().optional() })

    expect((schema.required as string[]).includes('model')).toBe(false)
  })

  it('maps a z.enum() to a string schema with the allowed values, not an unconstrained object', () => {
    const schema = shapeToJsonSchema({ source: z.enum(['web', 'mechanic']) })

    expect((schema.properties as Record<string, unknown>).source).toEqual({
      type: 'string',
      enum: ['web', 'mechanic'],
    })
  })

  it('keeps an optional z.enum() constrained too', () => {
    const schema = shapeToJsonSchema({ source: z.enum(['web', 'mechanic']).optional() })

    expect((schema.properties as Record<string, unknown>).source).toEqual({
      type: 'string',
      enum: ['web', 'mechanic'],
    })
    expect((schema.required as string[]).includes('source')).toBe(false)
  })

  it('leaves an unsupported type unconstrained', () => {
    const schema = shapeToJsonSchema({ tags: z.array(z.string()) })

    expect((schema.properties as Record<string, unknown>).tags).toEqual({})
  })
})
