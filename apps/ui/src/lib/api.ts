import type {
  AuthTokens,
  AuthUser,
  DiagnosisResponse,
  LoginInput,
  RegisterInput,
  Scenario,
} from "@/components/dashboard/types";

// ---------------------------------------------------------------------------
// Token storage (localStorage)
// ---------------------------------------------------------------------------

const KEYS = {
  accessToken: "iad.accessToken",
  refreshToken: "iad.refreshToken",
  user: "iad.user",
} as const;

function getTokens(): AuthTokens | null {
  try {
    const accessToken = localStorage.getItem(KEYS.accessToken);
    const refreshToken = localStorage.getItem(KEYS.refreshToken);
    return accessToken && refreshToken ? { accessToken, refreshToken } : null;
  } catch {
    return null;
  }
}

function setTokens(tokens: AuthTokens): void {
  localStorage.setItem(KEYS.accessToken, tokens.accessToken);
  localStorage.setItem(KEYS.refreshToken, tokens.refreshToken);
}

function clearTokens(): void {
  localStorage.removeItem(KEYS.accessToken);
  localStorage.removeItem(KEYS.refreshToken);
  localStorage.removeItem(KEYS.user);
}

function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(KEYS.user);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function setStoredUser(user: AuthUser): void {
  localStorage.setItem(KEYS.user, JSON.stringify(user));
}

// ---------------------------------------------------------------------------
// Auth error — thrown when refresh fails, caught by AuthContext
// ---------------------------------------------------------------------------

export class AuthError extends Error {
  constructor() {
    super("Authentication required");
    this.name = "AuthError";
  }
}

// ---------------------------------------------------------------------------
// Single-flight refresh — concurrent 401s share the same refresh call
// ---------------------------------------------------------------------------

let refreshPromise: Promise<AuthTokens> | null = null;

/** Refreshes the access token using the stored refresh token. */
async function refreshAccessToken(): Promise<AuthTokens> {
  const tokens = getTokens();
  if (!tokens?.refreshToken) {
    clearTokens();
    throw new AuthError();
  }

  try {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });

    if (!res.ok) {
      clearTokens();
      throw new AuthError();
    }

    const newTokens = (await res.json()) as AuthTokens;
    setTokens(newTokens);
    return newTokens;
  } catch (e) {
    clearTokens();
    if (e instanceof AuthError) throw e;
    throw new AuthError();
  }
}

// ---------------------------------------------------------------------------
// Authenticated fetch
// ---------------------------------------------------------------------------

/**
 * Wraps fetch() with automatic JWT auth and single-flight token refresh.
 * On 401: refreshes the token once and retries. On refresh failure, clears
 * storage and throws {@link AuthError}.
 */
async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const tokens = getTokens();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (tokens?.accessToken) {
    headers["Authorization"] = `Bearer ${tokens.accessToken}`;
  }

  let res = await fetch(path, { ...init, headers });

  if (res.status === 401 && tokens?.refreshToken) {
    // Single-flight: all concurrent 401s share one refresh
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
    }

    try {
      const newTokens = await refreshPromise;
      headers["Authorization"] = `Bearer ${newTokens.accessToken}`;
      res = await fetch(path, { ...init, headers });
    } catch {
      clearTokens();
      throw new AuthError();
    }
  }

  return res;
}

// ---------------------------------------------------------------------------
// Typed API methods
// ---------------------------------------------------------------------------

/** Scenarios wrapped response. */
type ScenariosResponse = { scenarios: Scenario[] };

/** Cognitive diagnosis output. */
export type CognitiveOutput = {
  diagnosis: string;
  severity: string;
  confidence: number;
  recommendations: string[];
  toolCalls: { tool: string; args: Record<string, unknown>; result: string }[];
};

/** Register response from backend. */
type RegisterResponse = AuthTokens & { user: AuthUser };

export const api = {
  // ---- Auth ----

  /** POST /api/auth/login — returns tokens only (no user object). */
  async login(input: LoginInput): Promise<AuthTokens> {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `Login failed (${res.status})`);
    }
    const tokens = (await res.json()) as AuthTokens;
    setTokens(tokens);
    return tokens;
  },

  /** POST /api/auth/register — returns tokens + user. */
  async register(
    input: RegisterInput,
  ): Promise<{ user: AuthUser; tokens: AuthTokens }> {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as {
        error?: string;
        details?: unknown;
      };
      const msg =
        typeof err.details === "string"
          ? err.details
          : Array.isArray(err.details)
            ? (err.details as Array<{ message: string }>)
                .map((d) => d.message)
                .join(", ")
            : (err.error ?? `Register failed (${res.status})`);
      throw new Error(msg);
    }
    const data = (await res.json()) as RegisterResponse;
    setTokens({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    });
    setStoredUser(data.user);
    return {
      user: data.user,
      tokens: {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      },
    };
  },

  /** GET /api/auth/me — returns current user. Falls back to stored user. */
  async getMe(): Promise<AuthUser> {
    const res = await apiFetch("/api/auth/me");
    if (!res.ok) {
      // Fallback to stored user (from register)
      const stored = getStoredUser();
      if (stored) return stored;
      throw new AuthError();
    }
    const user = (await res.json()) as AuthUser;
    setStoredUser(user);
    return user;
  },

  // ---- Data ----

  /** GET /api/scenarios — returns unwrapped scenario list. */
  async getScenarios(): Promise<Scenario[]> {
    const res = await apiFetch("/api/scenarios");
    if (!res.ok) throw new Error(`Failed to fetch scenarios (${res.status})`);
    const data = (await res.json()) as ScenariosResponse;
    return data.scenarios;
  },

  /** POST /api/diagnosis — runs OBD diagnosis for a scenario. */
  async runDiagnosis(scenarioId: string): Promise<DiagnosisResponse> {
    const res = await apiFetch("/api/diagnosis", {
      method: "POST",
      body: JSON.stringify({ scenarioId }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `Diagnosis failed (${res.status})`);
    }
    return (await res.json()) as DiagnosisResponse;
  },

  /** POST /api/mcp/cognitive-diagnosis — AI-powered cognitive analysis. */
  async getCognitiveDiagnosis(
    scenarioId: string,
    query?: string,
  ): Promise<CognitiveOutput> {
    const res = await apiFetch("/api/mcp/cognitive-diagnosis", {
      method: "POST",
      body: JSON.stringify({ scenarioId, query }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(
        err.error ?? `Cognitive diagnosis failed (${res.status})`,
      );
    }
    return (await res.json()) as CognitiveOutput;
  },

  /** GET /api/mcp/capabilities — probes LLM availability. */
  async getCapabilities(): Promise<{ cognitiveDiagnosis: boolean }> {
    try {
      const res = await apiFetch("/api/mcp/capabilities");
      if (!res.ok) return { cognitiveDiagnosis: false };
      return (await res.json()) as { cognitiveDiagnosis: boolean };
    } catch {
      return { cognitiveDiagnosis: false };
    }
  },

  // ---- Session management ----

  /** Clears all stored auth data. */
  logout(): void {
    clearTokens();
  },

  /** Returns true if tokens exist in storage. */
  hasTokens(): boolean {
    return getTokens() !== null;
  },

  /** Returns the stored user (from register or /me). */
  getStoredUser,
};
