import { z } from 'zod'

/** Schema Zod compartido para validar una definicion de herramienta MCP. */
export const mcpToolDefinitionSchema = z.object({
  /** Nombre de la herramienta (obligatorio, no vacio). */
  name: z.string().min(1),
  /** Descripcion de la herramienta (obligatorio, no vacio). */
  description: z.string().min(1),
  /** Schema JSON opcional para los argumentos de la herramienta. */
  schema: z.record(z.unknown()).optional(),
})
