import { LlmTimeoutError, LlmApiError } from './llmErrors.js'

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

/** Envuelve errores del SDK en LlmTimeoutError o LlmApiError segun el tipo de error. */
export function wrapSdkError(providerLabel: string, error: unknown): never {
  if (isTimeoutError(error)) {
    console.error(`[${providerLabel}] API call timed out`, {
      name: error instanceof Error ? error.name : undefined,
    })
    throw new LlmTimeoutError(`${providerLabel} API call timed out`)
  }
  if (hasStatusCode(error)) {
    const status = error.status
    console.error(`[${providerLabel}] API error`, { status })
    if (status === 401) throw new LlmApiError('Authentication failed', status)
    if (status === 429) throw new LlmApiError('Rate limit exceeded', status)
    if (status >= 500) throw new LlmApiError(`${providerLabel} API server error`, status)
    throw new LlmApiError(`${providerLabel} API error (HTTP ${status})`, status)
  }
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[${providerLabel}] SDK error`, { message })
  throw new LlmApiError(`${providerLabel} API error`)
}
