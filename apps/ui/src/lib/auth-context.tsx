import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { api, AuthError } from '@/lib/api'
import type { AuthUser, LoginInput, RegisterInput } from '@/components/dashboard/types'
import type { LoginResult } from '@/lib/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AuthStatus = 'loading' | 'authed' | 'anonymous'

type AuthState = {
  status: AuthStatus
  user: AuthUser | null
  /**
   * Primer factor. Devuelve el resultado **sin tragarselo**: con segundo factor
   * activo no hay sesion todavia, y quien llama necesita saberlo para pintar el
   * paso del codigo en vez de navegar al escritorio.
   */
  login: (input: LoginInput) => Promise<LoginResult>
  /** Segundo factor: canjea el reto y abre la sesion. */
  verifyTwoFactor: (challengeToken: string, code: string) => Promise<void>
  register: (input: RegisterInput) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthState | null>(null)

/** Hook to access the current auth state. Must be used inside AuthProvider. */
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth() must be used inside <AuthProvider>')
  return ctx
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * Provides JWT auth state to the entire app.
 * On mount: if tokens exist in localStorage, validates them via GET /api/auth/me.
 * The user object is never persisted locally — /me is the single source of truth.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<AuthUser | null>(null)

  // Bootstrap: validate existing tokens on mount
  useEffect(() => {
    if (!api.hasTokens()) {
      setStatus('anonymous')
      return
    }

    let cancelled = false
    api
      .getMe()
      .then((u) => {
        if (!cancelled) {
          setUser(u)
          setStatus('authed')
        }
      })
      .catch(() => {
        // /me failed — tokens are invalid or the server is unreachable.
        // No stored-user fallback: go anonymous.
        if (!cancelled) {
          void api.logout()
          setStatus('anonymous')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  /**
   * Cola comun tras conseguir tokens, venga del primer factor o del segundo:
   * poblar el usuario desde `/me`, que es la unica fuente de verdad.
   */
  const adoptSession = useCallback(async () => {
    try {
      const u = await api.getMe()
      setUser(u)
      setStatus('authed')
    } catch {
      // No user without /me — never fall back to a stale stored user.
      setUser(null)
      setStatus('anonymous')
    }
  }, [])

  const login = useCallback(
    async (input: LoginInput): Promise<LoginResult> => {
      const result = await api.login(input)
      // Con reto no hay tokens: pedir `/me` aqui solo daria un 401 inutil y
      // dejaria la pantalla con un error que el usuario no puede corregir.
      if (result.kind === 'tokens') await adoptSession()
      return result
    },
    [adoptSession],
  )

  const verifyTwoFactor = useCallback(
    async (challengeToken: string, code: string) => {
      // Un codigo incorrecto propaga el error: el formulario lo muestra y el
      // usuario reintenta con el mismo reto, que sigue vivo.
      await api.verifyTwoFactor({ challengeToken, code })
      await adoptSession()
    },
    [adoptSession],
  )

  const register = useCallback(async (input: RegisterInput) => {
    try {
      const result = await api.register(input)
      setUser(result.user)
      setStatus('authed')
    } catch (error) {
      // A failed registration leaves the user signed out — re-throw so the
      // caller (e.g. the register form) can surface the error message.
      setUser(null)
      setStatus('anonymous')
      throw error
    }
  }, [])

  const logout = useCallback(async () => {
    await api.logout()
    setUser(null)
    setStatus('anonymous')
  }, [])

  /**
   * Refetches the current user via GET /api/auth/me and updates the cached
   * user. Used after profile edits so the UI reflects the persisted state.
   * On failure, the previously cached user is left untouched — the caller
   * decides how to surface the error (e.g. a toast).
   */
  const refreshUser = useCallback(async () => {
    const u = await api.getMe()
    setUser(u)
  }, [])

  const value = useMemo<AuthState>(
    () => ({ status, user, login, verifyTwoFactor, register, logout, refreshUser }),
    [status, user, login, verifyTwoFactor, register, logout, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
