/** Definicion de una herramienta MCP para enviar al LLM. */
export interface McpToolDefinition {
  /** Nombre de la herramienta. */
  readonly name: string
  /** Descripcion legible de lo que hace la herramienta. */
  readonly description: string
  /** Schema de validacion (ZodObject serializado como JSON Schema). */
  readonly schema: Record<string, unknown>
}
