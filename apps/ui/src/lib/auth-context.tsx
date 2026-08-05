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
  logout: () => void;
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
 * On mount: if tokens exist in localStorage, validates them via GET /api/auth/me
 * (falls back to stored user from register if /me is unavailable).
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
        // getMe failed (no /me endpoint or token expired without refresh) —
        // fall back to stored user from register
        if (!cancelled) {
          const stored = api.getStoredUser();
          if (stored) {
            setUser(stored);
            setStatus("authed");
          } else {
            api.logout();
            setStatus("anonymous");
          }
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    await api.login(input);
    // After login, try to get user info; if /me fails, use stored fallback
    try {
      const u = await api.getMe();
      setUser(u);
    } catch {
      const stored = api.getStoredUser();
      if (stored) setUser(stored);
    }
    setStatus("authed");
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const result = await api.register(input);
    setUser(result.user);
    setStatus("authed");
  }, []);

  const logout = useCallback(() => {
    api.logout();
    setUser(null);
    setStatus("anonymous");
  }, []);

  const value = useMemo<AuthState>(
    () => ({ status, user, login, register, logout }),
    [status, user, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
