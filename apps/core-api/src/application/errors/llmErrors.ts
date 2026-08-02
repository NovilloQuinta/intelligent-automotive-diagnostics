import type { ToolCallTrace } from '@/application/ports/llmClient.port.js'

/** Error lanzado cuando el bucle de tool calling alcanza el limite maximo de iteraciones. */
export class MaxToolCallIterationsError extends Error {
  /** Traza parcial de herramientas ejecutadas antes de alcanzar el limite. */
  public readonly partialTrace: readonly ToolCallTrace[]

  constructor(message: string, partialTrace: readonly ToolCallTrace[]) {
    super(message)
    this.name = 'MaxToolCallIterationsError'
    this.partialTrace = partialTrace
  }
}
