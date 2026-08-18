import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import {
  isTimeoutError,
  hasStatusCode,
  wrapSdkError,
  SDK_TIMEOUT_ERROR_NAME,
} from '@/infrastructure/llm/sdkErrorUtils.js'
import { LlmTimeoutError, LlmApiError } from '@/infrastructure/llm/llmErrors.js'

const PROVIDER = 'anthropic'

/** Reproduce el error de timeout de los SDKs, que se distingue por `name`. */
function timeoutError(): Error {
  const error = new Error('connection timed out')
  error.name = SDK_TIMEOUT_ERROR_NAME
  return error
}

/** Reproduce un error de API del SDK, que lleva `status` HTTP. */
function apiError(status: number): Error & { status: number } {
  return Object.assign(new Error(`http ${status}`), { status })
}

describe('isTimeoutError', () => {
  it('reconoce el error de timeout por su nombre', () => {
    expect(isTimeoutError(timeoutError())).toBe(true)
  })

  it('rechaza un Error corriente', () => {
    expect(isTimeoutError(new Error('otra cosa'))).toBe(false)
  })

  it('rechaza lo que no es un Error', () => {
    expect(isTimeoutError({ name: SDK_TIMEOUT_ERROR_NAME })).toBe(false)
  })
})

describe('hasStatusCode', () => {
  it('reconoce un error con status numerico', () => {
    expect(hasStatusCode(apiError(404))).toBe(true)
  })

  it('rechaza un error sin status', () => {
    expect(hasStatusCode(new Error('pelado'))).toBe(false)
  })

  it('rechaza un status que no es numero', () => {
    expect(hasStatusCode(Object.assign(new Error('raro'), { status: '500' }))).toBe(false)
  })

  it('rechaza lo que no es un Error aunque traiga status', () => {
    expect(hasStatusCode({ status: 500 })).toBe(false)
  })
})

describe('wrapSdkError', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('convierte el timeout del SDK en LlmTimeoutError', () => {
    expect(() => wrapSdkError(PROVIDER, timeoutError())).toThrow(LlmTimeoutError)
  })

  it('traduce el 401 a fallo de autenticacion', () => {
    expect(() => wrapSdkError(PROVIDER, apiError(401))).toThrow('Authentication failed')
  })

  it('traduce el 429 a limite de peticiones', () => {
    expect(() => wrapSdkError(PROVIDER, apiError(429))).toThrow('Rate limit exceeded')
  })

  it('agrupa los 5xx como error de servidor del proveedor', () => {
    expect(() => wrapSdkError(PROVIDER, apiError(503))).toThrow(`${PROVIDER} API server error`)
  })

  it('conserva el codigo HTTP en el error resultante', () => {
    try {
      wrapSdkError(PROVIDER, apiError(418))
      expect.unreachable('wrapSdkError siempre lanza')
    } catch (error) {
      expect(error).toBeInstanceOf(LlmApiError)
      expect((error as LlmApiError).statusCode).toBe(418)
    }
  })

  it('detalla el codigo en los 4xx que no tienen traduccion propia', () => {
    expect(() => wrapSdkError(PROVIDER, apiError(418))).toThrow(`${PROVIDER} API error (HTTP 418)`)
  })

  it('envuelve un Error sin status como error de API generico', () => {
    expect(() => wrapSdkError(PROVIDER, new Error('vete a saber'))).toThrow(`${PROVIDER} API error`)
  })

  it('envuelve tambien lo que no es un Error', () => {
    expect(() => wrapSdkError(PROVIDER, 'un string suelto')).toThrow(LlmApiError)
  })
})
