import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MOCK_USER, freshApiModule, setStoredTokens } from './apiTestSetup'

describe('apiClient — fontaneria HTTP', () => {
  let api: typeof import('../../../src/lib/api').api
  let apiFetch: typeof import('../../../src/lib/api').apiFetch
  let assertOk: typeof import('../../../src/lib/api').assertOk
  let GENERIC_ERROR_MESSAGE: typeof import('../../../src/lib/api').GENERIC_ERROR_MESSAGE

  beforeEach(async () => {
    const mod = await freshApiModule()
    api = mod.api
    apiFetch = mod.apiFetch
    assertOk = mod.assertOk
    GENERIC_ERROR_MESSAGE = mod.GENERIC_ERROR_MESSAGE
  })
  describe('refreshAccessToken', () => {
    it('throws AuthError and clears tokens when no refresh token is stored', async () => {
      setStoredTokens()
      // The first call returns 401 and simulates tokens disappearing before
      // refreshAccessToken re-reads storage
      const mockFetch = vi.fn().mockImplementation(async () => {
        localStorage.clear()
        return { ok: false, status: 401 }
      })
      vi.stubGlobal('fetch', mockFetch)

      await expect(api.getScenarios()).rejects.toThrow('Authentication required')
      expect(localStorage.getItem('iad.accessToken')).toBeNull()
      expect(localStorage.getItem('iad.refreshToken')).toBeNull()
    })

    it('throws AuthError and clears tokens when the refresh fetch fails', async () => {
      setStoredTokens()
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 401 })
        .mockRejectedValueOnce(new TypeError('Network request failed'))
      vi.stubGlobal('fetch', mockFetch)

      await expect(api.getScenarios()).rejects.toThrow('Authentication required')
      expect(localStorage.getItem('iad.accessToken')).toBeNull()
      expect(localStorage.getItem('iad.refreshToken')).toBeNull()
    })
  })

  // -----------------------------------------------------------------------
  // apiFetch — raw error propagation
  // -----------------------------------------------------------------------

  describe('apiFetch error handling', () => {
    it('wraps non-abort network errors into the generic message', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network request failed')))

      await expect(apiFetch('/api/scenarios')).rejects.toThrow(GENERIC_ERROR_MESSAGE)
    })

    it('treats TimeoutError as an abort and throws the timeout message', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue({ name: 'TimeoutError' }))

      await expect(apiFetch('/api/scenarios')).rejects.toThrow('La petición tardó demasiado')
    })

    it('wraps non-abort rejections that are not Error instances into the generic message', async () => {
      // Plain object without a `name` property
      vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce({}))
      await expect(apiFetch('/api/scenarios')).rejects.toThrow(GENERIC_ERROR_MESSAGE)

      // null
      vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(null))
      await expect(apiFetch('/api/scenarios')).rejects.toThrow(GENERIC_ERROR_MESSAGE)

      // string
      vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce('boom'))
      await expect(apiFetch('/api/scenarios')).rejects.toThrow(GENERIC_ERROR_MESSAGE)
    })
  })

  // -----------------------------------------------------------------------
  // runDiagnosis
  // -----------------------------------------------------------------------

  describe('timeout', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('rejects with a timeout error and keeps tokens when the request hangs', async () => {
      setStoredTokens()
      vi.useFakeTimers()

      // Mock AbortSignal.timeout so the 10s timer is controllable.
      const controller = new AbortController()
      vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal)
      // fetch never resolves — it only rejects when the signal aborts.
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(
          (_url: string, init: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
              init.signal?.addEventListener('abort', () => {
                reject(new DOMException('The operation was aborted.', 'AbortError'))
              })
            }),
        ),
      )

      const promise = api.getMe()
      // Simulate 10s elapsing and the timeout signal firing.
      await vi.advanceTimersByTimeAsync(10_000)
      controller.abort()

      await expect(promise).rejects.toThrow('La petición tardó demasiado')
      // A timeout is not an auth error — tokens must NOT be cleared.
      expect(localStorage.getItem('iad.accessToken')).toBe('access-abc')
      expect(localStorage.getItem('iad.refreshToken')).toBe('refresh-xyz')
    })

    it('resolves normally when fetch completes before the timeout', async () => {
      setStoredTokens()
      vi.spyOn(AbortSignal, 'timeout')
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => MOCK_USER,
        }),
      )

      const user = await api.getMe()

      expect(user).toEqual(MOCK_USER)
    })

    it('respects a caller-provided signal instead of creating a new one', async () => {
      setStoredTokens()
      const controller = new AbortController()
      const timeoutSpy = vi.spyOn(AbortSignal, 'timeout')
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => MOCK_USER,
      })
      vi.stubGlobal('fetch', mockFetch)

      const res = await apiFetch('/api/auth/me', {
        signal: controller.signal,
      })

      expect(res.ok).toBe(true)
      expect(timeoutSpy).not.toHaveBeenCalled()
      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(init.signal).toBe(controller.signal)
    })

    it('getCognitiveDiagnosis uses a 60s timeout', async () => {
      setStoredTokens()
      const timeoutSpy = vi
        .spyOn(AbortSignal, 'timeout')
        .mockReturnValue(new AbortController().signal)
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            diagnosis: 'ok',
            severity: 'low',
            confidence: 0.9,
            recommendations: [],
            toolCalls: [],
          }),
        }),
      )

      await api.getCognitiveDiagnosis('scenario-1', 'why?')

      expect(timeoutSpy).toHaveBeenCalledTimes(1)
      expect(timeoutSpy).toHaveBeenCalledWith(60_000)
    })
  })

  // -----------------------------------------------------------------------
  // forgotPassword (public, no apiFetch)
  // -----------------------------------------------------------------------

  describe('assertOk', () => {
    it('resolves without throwing when the response is ok', async () => {
      const res = new Response(JSON.stringify({}), { status: 200 })

      await expect(assertOk(res, 'Fallback')).resolves.toBeUndefined()
    })

    it('throws the server error message when body.error is a string', async () => {
      const res = new Response(JSON.stringify({ error: 'Invalid credentials' }), {
        status: 401,
      })

      await expect(assertOk(res, 'Login failed (401)')).rejects.toThrow('Invalid credentials')
    })

    it('throws joined detail messages when body.details is an array', async () => {
      const res = new Response(
        JSON.stringify({
          error: 'Validation failed',
          details: [{ message: 'Email is invalid' }, { message: 'Password too short' }],
        }),
        { status: 400 },
      )

      await expect(assertOk(res, 'Register failed (400)')).rejects.toThrow(
        'Email is invalid, Password too short',
      )
    })

    it('uses body.details as-is when it is a string', async () => {
      const res = new Response(JSON.stringify({ details: 'Password too short' }), {
        status: 400,
      })

      await expect(assertOk(res, 'Register failed (400)')).rejects.toThrow('Password too short')
    })

    it('filters out non-string detail messages', async () => {
      const res = new Response(
        JSON.stringify({
          details: [{ message: 'Email is invalid' }, { message: 42 }, { message: undefined }],
        }),
        { status: 400 },
      )

      await expect(assertOk(res, 'Register failed (400)')).rejects.toThrow('Email is invalid')
    })

    it('throws the generic message when the body is not parseable on a 5xx', async () => {
      const res = new Response('not json', { status: 500 })

      await expect(assertOk(res, 'Diagnosis failed (500)')).rejects.toThrow(GENERIC_ERROR_MESSAGE)
    })

    it('throws the generic message on any 5xx, ignoring the fallback and body.error', async () => {
      const res = new Response(
        JSON.stringify({ error: 'Database connection refused at 10.0.0.5' }),
        { status: 502 },
      )

      await expect(assertOk(res, 'Diagnosis failed (502)')).rejects.toThrow(GENERIC_ERROR_MESSAGE)
    })

    it('still surfaces the curated server message for 4xx responses', async () => {
      const res = new Response(JSON.stringify({ error: 'Email already registered' }), {
        status: 409,
      })

      await expect(assertOk(res, 'Register failed (409)')).rejects.toThrow(
        'Email already registered',
      )
    })

    it('replaces the raw express-rate-limit body on 429 with a curated Spanish message', async () => {
      const res = new Response(
        JSON.stringify({ error: 'Too many requests, please try again later.' }),
        { status: 429 },
      )

      await expect(assertOk(res, 'Diagnosis failed (429)')).rejects.toThrow(
        'Estás preguntando muy rápido. Espera un momento y vuelve a intentarlo.',
      )
    })
  })
})
