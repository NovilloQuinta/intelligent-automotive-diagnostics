import type { ToolCallTrace } from '@/application/dto/llm/ToolCallTrace.js'

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

/**
 * Error lanzado cuando el modelo termina pero no deja narrativa que ensenar.
 *
 * Pasa cuando la respuesta es **solo** el bloque `---JSON`, sin prosa delante: al quitarlo
 * para no filtrar internos, el texto queda vacio. Es mas frecuente en los seguimientos de
 * un hilo largo, donde el modelo contesta mas seco.
 *
 * Existe para que eso **no salga como un 200 con el texto vacio**, que en pantalla es una
 * burbuja en blanco sin explicacion: ni respuesta ni error. Mejor decir que no hubo
 * respuesta legible que fingir que si la hubo.
 */
export class EmptyDiagnosisError extends Error {
  constructor(message = 'The model returned no readable narrative.') {
    super(message)
    this.name = 'EmptyDiagnosisError'
  }
}

/**
 * Error lanzado cuando el proveedor corta la respuesta por el limite de tokens de salida.
 *
 * Sin esto, un texto a medias (narrativa cortada a mitad de frase, sin el bloque
 * `---JSON---` final porque nunca se llego a escribir) se trataba como respuesta
 * final valida: `severity`/`confidence` caian al fallback en silencio y el mecanico
 * veia una respuesta inacabada sin ningun aviso de que lo era.
 */
export class TruncatedLlmResponseError extends Error {
  constructor(message = 'The model response was truncated by the output token limit.') {
    super(message)
    this.name = 'TruncatedLlmResponseError'
  }
}
