import { ApiHttpError } from "@/lib/api-errors";
import type {
  AuthTokens,
  AuthUser,
  DiagnosisResponse,
  EcuInfo,
  FreezeFrame,
  LoginInput,
  RegisterInput,
  Scenario,
  VehicleInfoResponse,
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
// Safe, user-facing error messages
// ---------------------------------------------------------------------------

/**
 * Shown for unexpected failures (server 5xx, network errors) instead of the
 * raw error. Never surfaces server internals, stack traces, or status codes
 * to the user.
 */
export const GENERIC_ERROR_MESSAGE =
  "Ha ocurrido un problema. Si el problema persiste, contacta con soporte.";

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
    // Network failures (offline, DNS, CORS…) surface a browser-specific
    // message — never show that raw text to the user.
    throw new Error(GENERIC_ERROR_MESSAGE);
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
 * Throws when a response is not ok. For 4xx responses, extracts the curated
 * server error message from the body (`details` first for validation
 * errors, then `error`), falling back to `fallbackMsg` when the body has no
 * usable message. For 5xx responses, always throws
 * {@link GENERIC_ERROR_MESSAGE} — server internals are never shown to the
 * user, regardless of what the body contains.
 */
export async function assertOk(
  res: Response,
  fallbackMsg: string,
): Promise<void> {
  if (res.ok) return;
  if (res.status >= 500) {
    throw new ApiHttpError(GENERIC_ERROR_MESSAGE, res.status);
  }
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
  throw new ApiHttpError(msg, res.status);
}

// ---------------------------------------------------------------------------
// Typed API methods
// ---------------------------------------------------------------------------

/** Scenarios wrapped response. */
type ScenariosResponse = { scenarios: Scenario[] };

/** Cognitive diagnosis output. */
/** PID reading enriched by the backend from the AI's `read_pid` tool calls. */
export type PidObservation = {
  code: string;
  name: string;
  unit?: string;
  value: number;
  status: "ok" | "review";
};

export type CognitiveOutput = {
  diagnosis: string;
  severity: string;
  confidence: number;
  recommendations: string[];
  toolCalls: { tool: string; args: Record<string, unknown>; result: string }[];
  pidObservations: PidObservation[];
};

export type ConversationItem = {
  readonly __type: "user_message" | "raw_response" | "tool_result";
  readonly content?: string;
  readonly data?: unknown;
  readonly toolCallId?: string;
  readonly isError?: boolean;
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
    await assertOk(res, GENERIC_ERROR_MESSAGE);
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
    await assertOk(res, GENERIC_ERROR_MESSAGE);
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
    await assertOk(res, GENERIC_ERROR_MESSAGE);
    const data = (await res.json()) as ScenariosResponse;
    return data.scenarios;
  },

  /** POST /api/diagnosis — runs OBD diagnosis for a scenario. */
  async runDiagnosis(scenarioId: string): Promise<DiagnosisResponse> {
    const res = await apiFetch("/api/diagnosis", {
      method: "POST",
      body: JSON.stringify({ scenarioId }),
    });
    await assertOk(res, GENERIC_ERROR_MESSAGE);
    return (await res.json()) as DiagnosisResponse;
  },

  /**
   * GET /api/freeze-frame — returns the freeze frame for a DTC, or null when
   * the code (or scenario) has no snapshot.
   */
  async getFreezeFrame(
    scenarioId: string,
    dtc?: string,
  ): Promise<FreezeFrame | null> {
    const query = new URLSearchParams({ scenarioId });
    if (dtc) query.set("dtc", dtc);
    const res = await apiFetch(`/api/freeze-frame?${query.toString()}`);
    await assertOk(res, GENERIC_ERROR_MESSAGE);
    const data = (await res.json()) as { freezeFrame: FreezeFrame | null };
    return data.freezeFrame;
  },

  /** GET /api/ecu-info — returns the ECUs discovered for the vehicle. */
  async getEcuInfo(scenarioId: string): Promise<EcuInfo[]> {
    const res = await apiFetch(
      `/api/ecu-info?scenarioId=${encodeURIComponent(scenarioId)}`,
    );
    await assertOk(res, GENERIC_ERROR_MESSAGE);
    const data = (await res.json()) as { ecus: EcuInfo[] };
    return data.ecus;
  },

  /** GET /api/vehicle-info — identifies the vehicle by reading and decoding its VIN. */
  async getVehicleInfo(scenarioId: string): Promise<VehicleInfoResponse> {
    const res = await apiFetch(
      `/api/vehicle-info?scenarioId=${encodeURIComponent(scenarioId)}`,
    );
    await assertOk(res, GENERIC_ERROR_MESSAGE);
    return (await res.json()) as VehicleInfoResponse;
  },

  /** POST /api/mcp/cognitive-diagnosis — AI-powered cognitive analysis. */
  async getCognitiveDiagnosis(
    scenarioId: string,
    query?: string,
    history?: readonly ConversationItem[],
  ): Promise<CognitiveOutput> {
    const res = await apiFetch("/api/mcp/cognitive-diagnosis", {
      method: "POST",
      body: JSON.stringify({ scenarioId, query, history }),
      signal: AbortSignal.timeout(COGNITIVE_TIMEOUT_MS),
    });
    await assertOk(res, GENERIC_ERROR_MESSAGE);
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
