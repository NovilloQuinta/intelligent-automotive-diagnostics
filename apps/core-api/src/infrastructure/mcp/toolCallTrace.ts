/** Registro de una tool invocada por el LLM durante el diagnostico cognitivo. */
export interface ToolCallTrace {
  /** Nombre de la tool MCP invocada. */
  readonly tool: string
  /** Argumentos con los que se invoco. */
  readonly args: Record<string, unknown>
  /** Resultado devuelto (serializado). */
  readonly result: string
}
