import { z } from 'zod'
import { categoryOf } from '@/application/shared/errorCategory.js'

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

/**
 * JSON Schema de un `z.enum(...)`, o `undefined` si el campo no lo es.
 *
 * Separado de {@link zodPrimitiveType} porque un enum necesita ademas los valores
 * permitidos, no solo el tipo: sin esto el modelo no ve restriccion alguna en el
 * propio schema de la tool y puede inventar un valor fuera de la union (visto en
 * vivo con `index_ecu.source`, que solo admite 'web'/'mechanic').
 */
function zodEnumSchema(schema: z.ZodTypeAny): { type: 'string'; enum: string[] } | undefined {
  const inner = schema instanceof z.ZodOptional ? schema.unwrap() : schema
  return inner instanceof z.ZodEnum ? { type: 'string', enum: inner.options } : undefined
}

/** Convierte un ZodRawShape a JSON Schema de objeto (subconjunto mínimo: primitivos + opcional). */
export function shapeToJsonSchema(shape: Record<string, z.ZodTypeAny>): Record<string, unknown> {
  /** Tipo no representable en el subconjunto soportado: se deja sin restringir. */
  const UNCONSTRAINED = {}
  const properties: Record<string, unknown> = {}
  const required: string[] = []
  for (const [key, field] of Object.entries(shape)) {
    const type = zodPrimitiveType(field)
    properties[key] = zodEnumSchema(field) ?? (type ? { type } : UNCONSTRAINED)
    if (!field.isOptional()) required.push(key)
  }
  return { type: 'object', properties, required }
}

/**
 * Envuelve un handler para convertir excepciones en errores de ejecucion MCP categorizados.
 *
 * La categoria la declara cada error implementando `CategorizedError`; este
 * modulo no conoce ningun tipo de error concreto. Anadir una fuente de errores
 * (otro transporte, otro proveedor) no obliga a tocar el toolkit.
 */
export function withErrorHandling(handler: ToolHandler): ToolHandler {
  return async (args) => {
    try {
      return await handler(args)
    } catch (err) {
      const category = categoryOf(err)
      const message = err instanceof Error ? err.message : 'Unknown error'
      const stack = err instanceof Error ? err.stack : undefined
      if (stack) {
        console.error(`[MCP tool error] ${category}: ${message}\n${stack}`)
      }
      return errorText(`[${category}] ${message}`)
    }
  }
}
