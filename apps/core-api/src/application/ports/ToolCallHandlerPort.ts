/**
 * Manejador de invocacion de herramientas.
 *
 * Recibe el nombre de la herramienta y sus argumentos,
 * devuelve el resultado serializado como string.
 * Si falla, lanza una excepcion que el adaptador captura
 * para reportar al LLM como error de herramienta.
 */
export type ToolCallHandlerPort = (name: string, args: Record<string, unknown>) => Promise<string>
