/** Respuesta de una sola llamada a la API del LLM (antes del bucle de tool calling). */
export interface LlmSingleResponse {
  /** Texto final del LLM, o null si la respuesta contiene tool calls. */
  readonly text: string | null
  /** Tool calls solicitadas por el LLM, o array vacío si es respuesta final. */
  readonly toolCalls: ReadonlyArray<{
    readonly name: string
    readonly args: Record<string, unknown>
    /** ID único del tool call (provider-specific, para correlacionar con tool_result). */
    readonly id: string
  }>
  /**
   * Respuesta cruda del provider.
   *
   * El use case {@link ExecuteLlmToolCalling} acumula este valor en el
   * {@link LlmMessageInput.conversationHistory} para que el adaptador pueda
   * reconstruir el mensaje del asistente en iteraciones posteriores del bucle.
   */
  readonly raw: unknown
}
