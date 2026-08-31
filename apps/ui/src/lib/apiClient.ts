import { ApiHttpError } from '@/lib/api-errors'
import type { AuthTokens } from '@/components/dashboard/types'

const HTTP_UNAUTHORIZED = 401
const HTTP_SERVER_ERROR_MIN = 500
const HTTP_TOO_MANY_REQUESTS = 429

const KEYS = {
  accessToken: 'iad.accessToken',
  refreshToken: 'iad.refreshToken',
  /** Ultima eleccion de la casilla "Recordarme", para devolverla como estaba. */
  rememberMe: 'iad.rememberMe',
  /** Email del ultimo login recordado. La contrasena NO se guarda nunca. */
  rememberedEmail: 'iad.rememberedEmail',
} as const

/**
 * Almacen donde viven los tokens: `localStorage` si la sesion es recordada,
 * `sessionStorage` si dura lo que la pestaña.
 *
 * Devuelve `null` en vez de lanzar porque el mero acceso al almacen tira en
 * navegadores con el almacenamiento bloqueado, y quedarse sin guardar la sesion
 * no es motivo para tumbar la navegacion en curso.
 */
function storeFor(persist: boolean): Storage | null {
  try {
    return persist ? localStorage : sessionStorage
  } catch {
    return null
  }
}

/** Lee el par de tokens de un almacen concreto; null si falta alguno. */
function readTokensFrom(store: Storage | null): AuthTokens | null {
  try {
    const accessToken = store?.getItem(KEYS.accessToken)
    const refreshToken = store?.getItem(KEYS.refreshToken)
    return accessToken && refreshToken ? { accessToken, refreshToken } : null
  } catch {
    return null
  }
}

/** True si la sesion viva es una recordada, es decir, si vive en `localStorage`. */
export function isRememberedSession(): boolean {
  return readTokensFrom(storeFor(true)) !== null
}

/** Lee ambos tokens: primero la sesion recordada, luego la de esta visita. */
export function getTokens(): AuthTokens | null {
  return readTokensFrom(storeFor(true)) ?? readTokensFrom(storeFor(false))
}

/**
 * Persiste ambos tokens en el almacen que corresponda y los borra del otro, para
 * que una sesion no quede duplicada ni ascienda de pestaña a permanente.
 *
 * Sin `persist` se queda donde ya estaba la sesion: es lo que necesita la
 * renovacion, que no debe cambiar la duracion que eligio el usuario.
 */
export function setTokens(tokens: AuthTokens, options: { persist?: boolean } = {}): void {
  const persist = options.persist ?? isRememberedSession()
  try {
    const previous = storeFor(!persist)
    previous?.removeItem(KEYS.accessToken)
    previous?.removeItem(KEYS.refreshToken)
    const target = storeFor(persist)
    target?.setItem(KEYS.accessToken, tokens.accessToken)
    target?.setItem(KEYS.refreshToken, tokens.refreshToken)
  } catch {
    // Almacenamiento lleno o bloqueado: la sesion vive en memoria hasta recargar.
  }
}

/** Borra ambos tokens de los dos almacenes; se llama en logout y si el refresh falla. */
export function clearTokens(): void {
  for (const store of [storeFor(true), storeFor(false)]) {
    try {
      store?.removeItem(KEYS.accessToken)
      store?.removeItem(KEYS.refreshToken)
    } catch {
      // Nada que borrar si el almacen no esta disponible.
    }
  }
}

/**
 * Ultima eleccion de la casilla "Recordarme". Marcada mientras el usuario no
 * diga lo contrario: el sentido del cambio es no repetir la contrasena.
 */
export function wasSessionRemembered(): boolean {
  try {
    return localStorage.getItem(KEYS.rememberMe) !== 'false'
  } catch {
    return true
  }
}

/** Email del ultimo login recordado, para prerrellenar el formulario. */
export function getRememberedEmail(): string | null {
  try {
    return localStorage.getItem(KEYS.rememberedEmail)
  } catch {
    return null
  }
}

/**
 * Guarda la eleccion del usuario y, con ella, su email. La contrasena no entra
 * aqui ni en ningun otro almacen: de eso se encarga el gestor del navegador.
 */
export function rememberLoginChoice(email: string, rememberMe: boolean): void {
  try {
    localStorage.setItem(KEYS.rememberMe, String(rememberMe))
    if (rememberMe) localStorage.setItem(KEYS.rememberedEmail, email)
    else localStorage.removeItem(KEYS.rememberedEmail)
  } catch {
    // Sin almacen no hay nada que recordar: el formulario saldra en blanco.
  }
}

// Auth error — thrown when refresh fails, caught by AuthContext

/** Se lanza cuando el refresh token tambien es invalido; AuthContext la usa para forzar logout. */
export class AuthError extends Error {
  constructor() {
    super('Authentication required')
    this.name = 'AuthError'
  }
}

// Single-flight refresh — concurrent 401s share the same refresh call

let refreshPromise: Promise<AuthTokens> | null = null

/** Pide un access token nuevo; si falla por cualquier motivo, limpia los tokens y no reintenta. */
async function refreshAccessToken(): Promise<AuthTokens> {
  const tokens = getTokens()
  if (!tokens?.refreshToken) {
    clearTokens()
    throw new AuthError()
  }

  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    })

    if (!res.ok) {
      clearTokens()
      throw new AuthError()
    }

    const newTokens = (await res.json()) as AuthTokens
    setTokens(newTokens)
    return newTokens
  } catch (e) {
    clearTokens()
    if (e instanceof AuthError) throw e
    throw new AuthError()
  }
}

/**
 * Shown for unexpected failures (server 5xx, network errors) instead of the
 * raw error. Never surfaces server internals, stack traces, or status codes
 * to the user.
 */
export const GENERIC_ERROR_MESSAGE =
  'Ha ocurrido un problema. Si el problema persiste, contacta con soporte.'

/** Shown for 429 instead of the raw express-rate-limit body, que llega en ingles. */
export const RATE_LIMITED_MESSAGE =
  'Estás preguntando muy rápido. Espera un momento y vuelve a intentarlo.'

export const DEFAULT_TIMEOUT_MS = 10_000

/** Timeout for cognitive diagnosis — the backend itself allows 120s. */
export const COGNITIVE_TIMEOUT_MS = 120_000

/** True when fetch rejected because a signal aborted (timeout or caller). */
function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  )
}

/**
 * Wraps fetch() with automatic JWT auth and single-flight token refresh.
 * On 401: refreshes the token once and retries. On refresh failure, clears
 * storage and throws {@link AuthError}.
 *
 * Adds a 10s timeout via {@link AbortSignal.timeout} unless the caller
 * provides its own signal (which is then respected as-is). A timeout is not
 * an auth error: tokens are never cleared and {@link Error} is thrown.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const tokens = getTokens()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  }
  if (tokens?.accessToken) {
    headers['Authorization'] = `Bearer ${tokens.accessToken}`
  }

  const signal = init.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
  const requestInit = { ...init, headers, signal }

  let res: Response
  try {
    res = await fetch(path, requestInit)
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error('La petición tardó demasiado')
    }
    // Network failures (offline, DNS, CORS…) surface a browser-specific
    // message — never show that raw text to the user.
    throw new Error(GENERIC_ERROR_MESSAGE)
  }

  if (res.status === HTTP_UNAUTHORIZED && tokens?.refreshToken) {
    // Single-flight: all concurrent 401s share one refresh
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null
      })
    }

    try {
      const newTokens = await refreshPromise
      headers['Authorization'] = `Bearer ${newTokens.accessToken}`
      res = await fetch(path, { ...requestInit, headers })
    } catch {
      clearTokens()
      throw new AuthError()
    }
  }

  return res
}

/**
 * Throws when a response is not ok. For 4xx responses, extracts the curated
 * server error message from the body (`details` first for validation
 * errors, then `error`), falling back to `fallbackMsg` when the body has no
 * usable message. For 5xx responses, always throws
 * {@link GENERIC_ERROR_MESSAGE} — server internals are never shown to the
 * user, regardless of what the body contains.
 */
type ErrorBody = { error?: unknown; details?: unknown }

/** Extrae el mensaje curado del cuerpo de error: `details` (string o array) antes que `error`. */
function extractErrorMessage(body: ErrorBody, fallbackMsg: string): string {
  if (typeof body.details === 'string') return body.details
  if (Array.isArray(body.details)) {
    return body.details
      .map((d) => (d as { message?: string }).message)
      .filter((m): m is string => typeof m === 'string')
      .join(', ')
  }
  return typeof body.error === 'string' ? body.error : fallbackMsg
}

/** Lanza ApiHttpError con mensaje generico en 5xx, mensaje fijo en 429, o el mensaje del backend en el resto. */
export async function assertOk(res: Response, fallbackMsg: string): Promise<void> {
  if (res.ok) return
  if (res.status >= HTTP_SERVER_ERROR_MIN) {
    throw new ApiHttpError(GENERIC_ERROR_MESSAGE, res.status)
  }
  if (res.status === HTTP_TOO_MANY_REQUESTS) {
    throw new ApiHttpError(RATE_LIMITED_MESSAGE, res.status)
  }
  const body = (await res.json().catch(() => ({}))) as ErrorBody
  throw new ApiHttpError(extractErrorMessage(body, fallbackMsg), res.status)
}

// Server-side logout — best-effort revocation of the refresh token

/** POST /api/auth/logout — revokes the refresh token server-side. Never throws. */
export async function logoutServer(): Promise<void> {
  const tokens = getTokens()
  if (!tokens?.refreshToken) return
  try {
    const res = await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    })
    if (!res.ok) {
      // Best-effort: server-side revocation is optional, local cleanup is not.
      return
    }
  } catch {
    // Network failure — ignore; local cleanup happens in api.logout().
  }
}

/**
 * Builds a query string from a filter object, omitting undefined/null values.
 * Used by admin API methods to serialize filter params without sending empty
 * query parameters.
 */
export function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const sp = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      sp.set(key, String(value))
    }
  }
  const qs = sp.toString()
  return qs ? `?${qs}` : ''
}
