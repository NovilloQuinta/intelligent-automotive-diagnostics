/** Registro de una herramienta invocada por el LLM durante el diagnostico cognitivo. */
export interface ToolCallTrace {
  /** Nombre de la herramienta MCP invocada. */
  readonly tool: string
  /** Argumentos con los que se invoco la herramienta. */
  readonly args: Record<string, unknown>
  /** Resultado devuelto por la herramienta (serializado como string). */
  readonly result: string
}
