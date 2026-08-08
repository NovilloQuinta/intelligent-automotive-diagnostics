/**
 * Errores tipados relacionados con la invocacion de tools MCP.
 *
 * Viven en su propio modulo porque los lanzan tanto `mcpServer` como
 * `DiagnosisService`, y los consumen los controladores HTTP: dejarlos en
 * cualquiera de esos extremos obligaria a importar en la direccion equivocada.
 */

/** Error lanzado cuando una tool MCP solicitada no existe en el servidor. */
export class ToolNotFoundError extends Error {
  constructor(readonly toolName: string) {
    super(`Tool not found: ${toolName}`)
    this.name = 'ToolNotFoundError'
  }
}

/** Error lanzado cuando una tool MCP responde sin ningun bloque de contenido. */
export class EmptyToolResultError extends Error {
  constructor(readonly toolName: string) {
    super(`Tool returned no content: ${toolName}`)
    this.name = 'EmptyToolResultError'
  }
}

/** Error lanzado cuando una llamada a tool MCP excede el timeout. */
export class ToolCallTimeoutError extends Error {
  constructor(message: string = 'Tool call timed out') {
    super(message)
    this.name = 'ToolCallTimeoutError'
  }
}
