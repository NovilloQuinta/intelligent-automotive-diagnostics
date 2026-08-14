import { ApiHttpError } from '@/lib/api-errors'
import type {
  AuthTokens,
  AuthUser,
  AvailablePid,
  ChangePasswordInput,
  DiagnosisHistoryResponse,
  DiagnosisSessionDetail,
  DiagnosisResponse,
  DtcCode,
  EcuInfo,
  FreezeFrame,
  LoginInput,
  PidReading,
  RegisterInput,
  Scenario,
  UpdateProfileInput,
  VehicleInfoResponse,
  VehicleIdentityInput,
  VehicleIdentityConfirmation,
  VehicleStatusOutput,
} from '@/components/dashboard/types'
import type {
  AdminAuditFilter,
  AdminAuditLog,
  AdminKnowledgeStats,
  AdminLog,
  AdminLogsFilter,
  AdminOverview,
  AdminUser,
  AdminUsersFilter,
  KnowledgeSearchInput,
  KnowledgeSearchResponse,
  Paginated,
} from '@/components/admin/types'

import {
  AuthError,
  COGNITIVE_TIMEOUT_MS,
  DEFAULT_TIMEOUT_MS,
  GENERIC_ERROR_MESSAGE,
  apiFetch,
  assertOk,
  buildQuery,
  clearTokens,
  getTokens,
  logoutServer,
  setTokens,
} from '@/lib/apiClient'
import type {
  CognitiveOutput,
  ConversationItem,
  LiveDataResponse,
  RegisterResponse,
  ScenariosResponse,
} from '@/lib/apiTypes'

/**
 * Contrato publico re-exportado: `@/lib/api` sigue siendo el unico punto de
 * entrada para los 30 consumidores, aunque la fontaneria y los tipos vivan
 * ahora en `apiClient` y `apiTypes`.
 */
export { AuthError, GENERIC_ERROR_MESSAGE, apiFetch, assertOk } from '@/lib/apiClient'
export type {
  CognitiveOutput,
  ConversationItem,
  LiveDataResponse,
  PidObservation,
} from '@/lib/apiTypes'

export const api = {
  // ---- Auth ----

  /** POST /api/auth/login — returns tokens only (no user object). */
  async login(input: LoginInput): Promise<AuthTokens> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    })
    await assertOk(res, GENERIC_ERROR_MESSAGE)
    const tokens = (await res.json()) as AuthTokens
    setTokens(tokens)
    return tokens
  },

  /** POST /api/auth/register — returns tokens + user. */
  async register(input: RegisterInput): Promise<{ user: AuthUser; tokens: AuthTokens }> {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    })
    await assertOk(res, GENERIC_ERROR_MESSAGE)
    const data = (await res.json()) as RegisterResponse
    setTokens({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    })
    return {
      user: data.user,
      tokens: {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      },
    }
  },

  /** GET /api/auth/me — returns current user (no local persistence). */
  async getMe(): Promise<AuthUser> {
    const res = await apiFetch('/api/auth/me')
    if (!res.ok) throw new AuthError()
    return (await res.json()) as AuthUser
  },

  /**
   * POST /api/auth/forgot-password — public endpoint, no token attached.
   * The backend always responds 200 regardless of whether the email exists
   * (anti-enumeration). Callers should show a generic success message
   * unconditionally rather than branching on this promise's outcome.
   */
  async forgotPassword(email: string): Promise<void> {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    })
    await assertOk(res, GENERIC_ERROR_MESSAGE)
  },

  /**
   * POST /api/auth/reset-password — public endpoint, no token attached.
   * Rejects with a curated message when the token is invalid, expired, or
   * already used, or when the new password fails validation.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    })
    await assertOk(res, GENERIC_ERROR_MESSAGE)
  },

  /** PATCH /api/profile — authenticated partial profile update. */
  async updateProfile(input: UpdateProfileInput): Promise<AuthUser> {
    const res = await apiFetch('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
    await assertOk(res, GENERIC_ERROR_MESSAGE)
    return (await res.json()) as AuthUser
  },

  /**
   * POST /api/profile/change-password — authenticated password change.
   * On success the server revokes all refresh tokens for the user; the
   * caller is responsible for logging out locally afterwards.
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const input: ChangePasswordInput = { currentPassword, newPassword }
    const res = await apiFetch('/api/profile/change-password', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    await assertOk(res, GENERIC_ERROR_MESSAGE)
  },

  // ---- Data ----

  /** GET /api/scenarios — returns unwrapped scenario list. */
  async getScenarios(): Promise<Scenario[]> {
    const res = await apiFetch('/api/scenarios')
    await assertOk(res, GENERIC_ERROR_MESSAGE)
    const data = (await res.json()) as ScenariosResponse
    return data.scenarios
  },

  /** GET /api/available-pids — returns the Mode 01 PID catalog for the selector. */
  async getAvailablePids(): Promise<AvailablePid[]> {
    const res = await apiFetch('/api/available-pids')
    await assertOk(res, GENERIC_ERROR_MESSAGE)
    const data = (await res.json()) as { pids: AvailablePid[] }
    return data.pids
  },

  /** POST /api/diagnosis — runs OBD diagnosis for a scenario. */
  async runDiagnosis(scenarioId: string): Promise<DiagnosisResponse> {
    const res = await apiFetch('/api/diagnosis', {
      method: 'POST',
      body: JSON.stringify({ scenarioId }),
    })
    await assertOk(res, GENERIC_ERROR_MESSAGE)
    return (await res.json()) as DiagnosisResponse
  },

  /**
   * GET /api/freeze-frame — returns the freeze frame for a DTC, or null when
   * the code (or scenario) has no snapshot.
   */
  async getFreezeFrame(scenarioId: string, dtc?: string): Promise<FreezeFrame | null> {
    const query = new URLSearchParams({ scenarioId })
    if (dtc) query.set('dtc', dtc)
    const res = await apiFetch(`/api/freeze-frame?${query.toString()}`)
    await assertOk(res, GENERIC_ERROR_MESSAGE)
    const data = (await res.json()) as { freezeFrame: FreezeFrame | null }
    return data.freezeFrame
  },

  /**
   * GET /api/live-data — reads the dashboard PIDs from the vehicle.
   *
   * `pids` are short Mode 01 codes (e.g. `['0C', '0D']`); when omitted the
   * backend returns the 4 defaults. A `null` field means that single PID
   * failed; the others keep their value.
   */
  async getLiveData(scenarioId: string, pids?: readonly string[]): Promise<LiveDataResponse> {
    const query = new URLSearchParams({ scenarioId })
    if (pids && pids.length > 0) query.set('pids', pids.join(','))
    const res = await apiFetch(`/api/live-data?${query.toString()}`)
    await assertOk(res, GENERIC_ERROR_MESSAGE)
    return (await res.json()) as LiveDataResponse
  },

  /** GET /api/ecu-info — returns the ECUs discovered for the vehicle. */
  async getEcuInfo(scenarioId: string): Promise<EcuInfo[]> {
    const res = await apiFetch(`/api/ecu-info?scenarioId=${encodeURIComponent(scenarioId)}`)
    await assertOk(res, GENERIC_ERROR_MESSAGE)
    const data = (await res.json()) as { ecus: EcuInfo[] }
    return data.ecus
  },

  /** GET /api/vehicle-info — identifies the vehicle by reading and decoding its VIN. */
  async getVehicleInfo(scenarioId: string): Promise<VehicleInfoResponse> {
    const res = await apiFetch(`/api/vehicle-info?scenarioId=${encodeURIComponent(scenarioId)}`)
    await assertOk(res, GENERIC_ERROR_MESSAGE)
    return (await res.json()) as VehicleInfoResponse
  },

  /**
   * POST /api/vehicle-identity — el mecánico corrige la identificación del coche.
   *
   * Última rama de la cascada de identificación, para cuando ni el catálogo ni
   * la búsqueda web sacan el vehículo.
   */
  async confirmVehicleIdentity(input: VehicleIdentityInput): Promise<VehicleIdentityConfirmation> {
    const res = await apiFetch('/api/vehicle-identity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    await assertOk(res, GENERIC_ERROR_MESSAGE)
    return (await res.json()) as VehicleIdentityConfirmation
  },

  /** GET /api/pending-dtc — returns pending DTCs (Mode 07). */
  async getPendingDtc(scenarioId: string): Promise<{ dtcCodes: DtcCode[] }> {
    const res = await apiFetch(`/api/pending-dtc?scenarioId=${encodeURIComponent(scenarioId)}`)
    await assertOk(res, GENERIC_ERROR_MESSAGE)
    return (await res.json()) as { dtcCodes: DtcCode[] }
  },

  /** GET /api/permanent-dtc — returns permanent DTCs (Mode 0A). */
  async getPermanentDtc(scenarioId: string): Promise<{ dtcCodes: DtcCode[] }> {
    const res = await apiFetch(`/api/permanent-dtc?scenarioId=${encodeURIComponent(scenarioId)}`)
    await assertOk(res, GENERIC_ERROR_MESSAGE)
    return (await res.json()) as { dtcCodes: DtcCode[] }
  },

  /** POST /api/clear-dtc — clears stored DTCs and resets emission monitors. */
  async clearDtc(scenarioId: string): Promise<{ cleared: boolean }> {
    const res = await apiFetch('/api/clear-dtc', {
      method: 'POST',
      body: JSON.stringify({ scenarioId }),
    })
    await assertOk(res, GENERIC_ERROR_MESSAGE)
    return (await res.json()) as { cleared: boolean }
  },

  /** GET /api/vehicle-status — returns MIL status, DTC count, and monitor readiness. */
  async getVehicleStatus(scenarioId: string): Promise<VehicleStatusOutput> {
    const res = await apiFetch(`/api/vehicle-status?scenarioId=${encodeURIComponent(scenarioId)}`)
    await assertOk(res, GENERIC_ERROR_MESSAGE)
    return (await res.json()) as VehicleStatusOutput
  },

  /** POST /api/mcp/cognitive-diagnosis — AI-powered cognitive analysis. */
  async getCognitiveDiagnosis(
    scenarioId: string,
    query?: string,
    history?: readonly ConversationItem[],
    sessionId?: number,
  ): Promise<CognitiveOutput> {
    const res = await apiFetch('/api/mcp/cognitive-diagnosis', {
      method: 'POST',
      body: JSON.stringify({ scenarioId, query, history, sessionId }),
      signal: AbortSignal.timeout(COGNITIVE_TIMEOUT_MS),
    })
    await assertOk(res, GENERIC_ERROR_MESSAGE)
    return (await res.json()) as CognitiveOutput
  },

  /** GET /api/mcp/capabilities — probes LLM availability. */
  async getCapabilities(): Promise<{ cognitiveDiagnosis: boolean }> {
    try {
      const res = await apiFetch('/api/mcp/capabilities')
      if (!res.ok) return { cognitiveDiagnosis: false }
      return (await res.json()) as { cognitiveDiagnosis: boolean }
    } catch {
      return { cognitiveDiagnosis: false }
    }
  },

  // ---- Diagnosis History ----

  /**
   * GET /api/diagnosis-history?from=&to=&severity=&limit=&offset=
   * Returns a paginated list of diagnosis sessions for the authenticated user.
   */
  async getDiagnosisHistory(
    params: {
      readonly from?: string
      readonly to?: string
      readonly severity?: string
      readonly limit?: number
      readonly offset?: number
    } = {},
  ): Promise<DiagnosisHistoryResponse> {
    const qs = buildQuery(params as Record<string, string | number | boolean | undefined>)
    const res = await apiFetch(`/api/diagnosis-history${qs}`)
    await assertOk(res, GENERIC_ERROR_MESSAGE)
    return (await res.json()) as DiagnosisHistoryResponse
  },

  /**
   * GET /api/diagnosis-history/:id
   * Returns the full session detail including the `resultJson` snapshot.
   */
  async getDiagnosisHistoryDetail(id: number): Promise<DiagnosisSessionDetail> {
    const res = await apiFetch(`/api/diagnosis-history/${id}`)
    await assertOk(res, GENERIC_ERROR_MESSAGE)
    return (await res.json()) as DiagnosisSessionDetail
  },

  // ---- Admin ----

  admin: {
    /** GET /api/admin/overview — returns aggregated admin dashboard stats. */
    async overview(): Promise<AdminOverview> {
      const res = await apiFetch('/api/admin/overview')
      await assertOk(res, GENERIC_ERROR_MESSAGE)
      return (await res.json()) as AdminOverview
    },

    /** GET /api/admin/logs?level=&from=&to=&q=&page=&pageSize= */
    async logs(filter: AdminLogsFilter): Promise<Paginated<AdminLog>> {
      const qs = buildQuery(filter as Record<string, string | number | boolean | undefined>)
      const res = await apiFetch(`/api/admin/logs${qs}`)
      await assertOk(res, GENERIC_ERROR_MESSAGE)
      return (await res.json()) as Paginated<AdminLog>
    },

    /** GET /api/admin/audit-logs?statusCode=&path=&userId=&from=&to=&q=&page=&pageSize= */
    async auditLogs(filter: AdminAuditFilter): Promise<Paginated<AdminAuditLog>> {
      const qs = buildQuery(filter as Record<string, string | number | boolean | undefined>)
      const res = await apiFetch(`/api/admin/audit-logs${qs}`)
      await assertOk(res, GENERIC_ERROR_MESSAGE)
      return (await res.json()) as Paginated<AdminAuditLog>
    },

    /** GET /api/admin/users?q=&from=&to=&page=&pageSize= */
    async users(filter: AdminUsersFilter): Promise<Paginated<AdminUser>> {
      const qs = buildQuery(filter as Record<string, string | number | boolean | undefined>)
      const res = await apiFetch(`/api/admin/users${qs}`)
      await assertOk(res, GENERIC_ERROR_MESSAGE)
      return (await res.json()) as Paginated<AdminUser>
    },

    /** GET /api/admin/knowledge — returns index stats for all knowledge bases. */
    async knowledgeStats(): Promise<AdminKnowledgeStats> {
      const res = await apiFetch('/api/admin/knowledge')
      await assertOk(res, GENERIC_ERROR_MESSAGE)
      return (await res.json()) as AdminKnowledgeStats
    },

    /** POST /api/admin/knowledge/search — semantic search across a knowledge index. */
    async knowledgeSearch(input: KnowledgeSearchInput): Promise<KnowledgeSearchResponse> {
      const res = await apiFetch('/api/admin/knowledge/search', {
        method: 'POST',
        body: JSON.stringify(input),
      })
      await assertOk(res, GENERIC_ERROR_MESSAGE)
      return (await res.json()) as KnowledgeSearchResponse
    },
  },

  // ---- Session management ----

  /**
   * Revokes the refresh token server-side (best-effort) and clears local
   * tokens. Never throws: network or server errors are swallowed so local
   * cleanup always happens.
   */
  async logout(): Promise<void> {
    await logoutServer()
    clearTokens()
  },

  /** Returns true if tokens exist in storage. */
  hasTokens(): boolean {
    return getTokens() !== null
  },
}
