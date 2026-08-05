import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, AuthError } from "@/lib/api";
import type {
  AuthUser,
  LoginInput,
  RegisterInput,
} from "@/components/dashboard/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AuthStatus = "loading" | "authed" | "anonymous";

type AuthState = {
  status: AuthStatus;
  user: AuthUser | null;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthState | null>(null);

/** Hook to access the current auth state. Must be used inside AuthProvider. */
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth() must be used inside <AuthProvider>");
  return ctx;
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
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);

  // Bootstrap: validate existing tokens on mount
  useEffect(() => {
    if (!api.hasTokens()) {
      setStatus("anonymous");
      return;
    }

    let cancelled = false;
    api
      .getMe()
      .then((u) => {
        if (!cancelled) {
          setUser(u);
          setStatus("authed");
        }
      })
      .catch(() => {
        // /me failed — tokens are invalid or the server is unreachable.
        // No stored-user fallback: go anonymous.
        if (!cancelled) {
          void api.logout();
          setStatus("anonymous");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    await api.login(input);
    try {
      const u = await api.getMe();
      setUser(u);
      setStatus("authed");
    } catch {
      // No user without /me — never fall back to a stale stored user.
      setUser(null);
      setStatus("anonymous");
    }
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    try {
      const result = await api.register(input);
      setUser(result.user);
      setStatus("authed");
    } catch (error) {
      // A failed registration leaves the user signed out — re-throw so the
      // caller (e.g. the register form) can surface the error message.
      setUser(null);
      setStatus("anonymous");
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
    setStatus("anonymous");
  }, []);

  const value = useMemo<AuthState>(
    () => ({ status, user, login, register, logout }),
    [status, user, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
