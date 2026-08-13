import { z } from 'zod'
import {
  Elm327ConnectionError,
  Elm327NoDataError,
  Elm327ParseError,
} from '@/infrastructure/elm327/errors.js'
import { WebSearchProviderError } from '@/infrastructure/web-search/WebSearchProviderError.js'

/** Resultado de invocar una tool MCP (siempre contenido de tipo texto). */
export interface ToolCallResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

/** Tool handler: firma de una funcion que procesa una tool MCP. */
export type ToolHandler = (args: Record<string, unknown>) => Promise<ToolCallResult>

/** Callback de registro de una tool (inyectado por createMcpServer). */
export type ToolRegistrar = (
  name: string,
  description: string,
  shape: Record<string, z.ZodTypeAny>,
  handler: ToolHandler,
) => void

/** Categoria de error MCP segun best practices: permite al LLM decidir si reintentar. */
type ToolErrorCategory = 'client_error' | 'server_error' | 'external_error'

/** Crea un bloque de texto para el contenido de una tool MCP. */
export function text(content: string): ToolCallResult {
  return { content: [{ type: 'text' as const, text: content }] }
}

/** Envuelve un mensaje de error como resultado de tool marcado con `isError`. */
export function errorText(message: string): ToolCallResult {
  return { ...text(message), isError: true }
}

/**
 * Convierte un ZodTypeAny a su tipo JSON Schema primitivo (string/number/boolean).
 *
 * Usa `instanceof` y `unwrap()`, ambos API publica. La version anterior leia
 * `schema._def.typeName`, un interno de Zod cuya forma cambio entre versiones
 * mayores: al romperse devolvia `undefined` y cada propiedad degradaba a `{}`
 * en silencio, sin que el compilador ni los tests avisaran.
 */
function zodPrimitiveType(schema: z.ZodTypeAny): string | undefined {
  const inner = schema instanceof z.ZodOptional ? schema.unwrap() : schema
  if (inner instanceof z.ZodString) return 'string'
  if (inner instanceof z.ZodNumber) return 'number'
  if (inner instanceof z.ZodBoolean) return 'boolean'
  return undefined
}

/** Convierte un ZodRawShape a JSON Schema de objeto (subconjunto mínimo: primitivos + opcional). */
export function shapeToJsonSchema(shape: Record<string, z.ZodTypeAny>): Record<string, unknown> {
  /** Tipo no representable en el subconjunto soportado: se deja sin restringir. */
  const UNCONSTRAINED = {}
  const properties: Record<string, unknown> = {}
  const required: string[] = []
  for (const [key, field] of Object.entries(shape)) {
    const type = zodPrimitiveType(field)
    properties[key] = type ? { type } : UNCONSTRAINED
    if (!field.isOptional()) required.push(key)
  }
  return { type: 'object', properties, required }
}

/** Clasifica un error de tool para que el LLM pueda decidir si merece la pena reintentar. */
function categorizeError(err: unknown): ToolErrorCategory {
  if (err instanceof Elm327ConnectionError) return 'external_error'
  if (err instanceof Elm327NoDataError) return 'client_error'
  if (err instanceof Elm327ParseError) return 'server_error'
  if (err instanceof WebSearchProviderError) return 'external_error'
  return 'server_error'
}

/** Envuelve un handler para convertir excepciones en errores de ejecucion MCP categorizados. */
export function withErrorHandling(handler: ToolHandler): ToolHandler {
  return async (args) => {
    try {
      return await handler(args)
    } catch (err) {
      const category = categorizeError(err)
      const message = err instanceof Error ? err.message : 'Unknown error'
      const stack = err instanceof Error ? err.stack : undefined
      if (stack) {
        console.error(`[MCP tool error] ${category}: ${message}\n${stack}`)
      }
      return errorText(`[${category}] ${message}`)
    }
  }
}
