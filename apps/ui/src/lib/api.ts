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
// Fetch timeouts
// ---------------------------------------------------------------------------

/** Default timeout for authenticated requests. */
const DEFAULT_TIMEOUT_MS = 10_000;

/** Timeout for cognitive diagnosis — the backend itself allows 60s. */
const COGNITIVE_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// Authenticated fetch
// ---------------------------------------------------------------------------

/** True when fetch rejected because a signal aborted (timeout or caller). */
function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
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
export async function apiFetch(
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

  const signal = init.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
  const requestInit = { ...init, headers, signal };

  let res: Response;
  try {
    res = await fetch(path, requestInit);
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error("La petición tardó demasiado");
    }
    throw error;
  }

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
      res = await fetch(path, { ...requestInit, headers });
    } catch {
      clearTokens();
      throw new AuthError();
    }
  }

  return res;
}

// ---------------------------------------------------------------------------
// Shared response error handling
// ---------------------------------------------------------------------------

/**
 * Throws when a response is not ok. Extracts the server error message from
 * the body (`details` first for validation errors, then `error`), falling
 * back to `fallbackMsg` when the body has no usable message.
 */
export async function assertOk(
  res: Response,
  fallbackMsg: string,
): Promise<void> {
  if (res.ok) return;
  const body = (await res.json().catch(() => ({}))) as {
    error?: unknown;
    details?: unknown;
  };
  const msg =
    typeof body.details === "string"
      ? body.details
      : Array.isArray(body.details)
        ? body.details
            .map((d) => (d as { message?: string }).message)
            .filter((m): m is string => typeof m === "string")
            .join(", ")
        : typeof body.error === "string"
          ? body.error
          : fallbackMsg;
  throw new Error(msg);
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

// ---------------------------------------------------------------------------
// Server-side logout — best-effort revocation of the refresh token
// ---------------------------------------------------------------------------

/** POST /api/auth/logout — revokes the refresh token server-side. Never throws. */
async function logoutServer(): Promise<void> {
  const tokens = getTokens();
  if (!tokens?.refreshToken) return;
  try {
    const res = await fetch("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    if (!res.ok) {
      // Best-effort: server-side revocation is optional, local cleanup is not.
      return;
    }
  } catch {
    // Network failure — ignore; local cleanup happens in api.logout().
  }
}

export const api = {
  // ---- Auth ----

  /** POST /api/auth/login — returns tokens only (no user object). */
  async login(input: LoginInput): Promise<AuthTokens> {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    await assertOk(res, `Login failed (${res.status})`);
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
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    await assertOk(res, `Register failed (${res.status})`);
    const data = (await res.json()) as RegisterResponse;
    setTokens({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    });
    return {
      user: data.user,
      tokens: {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      },
    };
  },

  /** GET /api/auth/me — returns current user (no local persistence). */
  async getMe(): Promise<AuthUser> {
    const res = await apiFetch("/api/auth/me");
    if (!res.ok) throw new AuthError();
    return (await res.json()) as AuthUser;
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
    await assertOk(res, `Diagnosis failed (${res.status})`);
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
      signal: AbortSignal.timeout(COGNITIVE_TIMEOUT_MS),
    });
    await assertOk(res, `Cognitive diagnosis failed (${res.status})`);
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

  /**
   * Revokes the refresh token server-side (best-effort) and clears local
   * tokens. Never throws: network or server errors are swallowed so local
   * cleanup always happens.
   */
  async logout(): Promise<void> {
    await logoutServer();
    clearTokens();
  },

  /** Returns true if tokens exist in storage. */
  hasTokens(): boolean {
    return getTokens() !== null;
  },
};
