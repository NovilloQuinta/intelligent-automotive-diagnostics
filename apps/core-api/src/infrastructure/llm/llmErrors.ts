/** Error de timeout al llamar a la API del proveedor LLM. */
export class LlmTimeoutError extends Error {
  constructor(message = 'LLM API call timed out') {
    super(message)
    this.name = 'LlmTimeoutError'
  }
}

/** Error genérico de la API del proveedor LLM. */
export class LlmApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message)
    this.name = 'LlmApiError'
  }
}
