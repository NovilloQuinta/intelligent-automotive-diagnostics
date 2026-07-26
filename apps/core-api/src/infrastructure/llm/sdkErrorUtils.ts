/** Nombre del error de timeout compartido por los SDKs (Anthropic y OpenAI). */
export const SDK_TIMEOUT_ERROR_NAME = 'APIConnectionTimeoutError'

/** Determina si un error es de tipo timeout basado en su nombre de error. */
export function isTimeoutError(error: unknown): error is Error {
  return error instanceof Error && error.name === SDK_TIMEOUT_ERROR_NAME
}

/** Determina si un error tiene codigo de estado HTTP (API error del SDK). */
export function hasStatusCode(error: unknown): error is Error & { status: number } {
  return (
    error instanceof Error &&
    'status' in error &&
    typeof (error as Record<string, unknown>).status === 'number'
  )
}
