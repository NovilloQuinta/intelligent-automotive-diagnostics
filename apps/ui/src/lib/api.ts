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
  GENERIC_ERROR_MESSAGE,
  HTTP_LOCKED,
  apiFetch,
  assertOk,
  buildQuery,
  clearTokens,
  getTokens,
  logoutServer,
  postPublicJson,
  setTokens,
} from '@/lib/apiClient'
import type {
  CognitiveOutput,
  ConversationItem,
  LiveDataResponse,
  RegisterResponse,
  ScenariosResponse,
  DisableTwoFactorInput,
  LoginResult,
  TwoFactorActivation,
  TwoFactorSetup,
  VerifyTwoFactorInput,
} from '@/lib/apiTypes'
import { getNativeObdService, isNativePlatform } from '@/lib/obd/nativeObdBridge'
import { isNativeUsbScenario } from '@/lib/obd/nativeScenario'

/**
 * True cuando `scenarioId` es el vehiculo real por USB-OTG y la app corre
 * dentro del APK Android — la unica combinacion en la que existe un puerto
 * serie nativo al que desviar la lectura en vez de pedirsela al core-api.
 *
 * Sin esta comprobacion doble, un `scenarioId` coincidente por casualidad en
 * la web normal (sin Capacitor) intentaria hablar con un transporte que no
 * existe; y el modo nativo sin este id concreto seguiria yendo por HTTP, que
 * es lo correcto para los escenarios del emulador incluso dentro del APK.
 */
function usesNativeUsb(scenarioId: string): boolean {
  return isNativeUsbScenario(scenarioId) && isNativePlatform()
}

/** GET a un endpoint con `?scenarioId=`, con el manejo de error curado comun. */
async function fetchScenarioJson<T>(path: string, scenarioId: string): Promise<T> {
  const res = await apiFetch(`${path}?scenarioId=${encodeURIComponent(scenarioId)}`)
  await assertOk(res, GENERIC_ERROR_MESSAGE)
  return (await res.json()) as T
}

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
  LoginResult,
  PidObservation,
  TwoFactorActivation,
  TwoFactorSetup,
} from '@/lib/apiTypes'

// Account lockout (HTTP 423)

/**
 * Traduce el 423 del backend a un mensaje en español con los minutos que
 * quedan de bloqueo. El cuerpo del error llega en ingles y sin formatear:
 * mostrarlo tal cual deja al usuario sin saber cuanto tiene que esperar.
 */
async function accountLockedMessage(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { retryAfterSeconds?: unknown }
  const seconds = typeof body.retryAfterSeconds === 'number' ? body.retryAfterSeconds : 0
  const base = 'Cuenta bloqueada temporalmente por demasiados intentos fallidos.'

  if (seconds <= 0) return `${base} Inténtalo de nuevo más tarde.`

  const minutes = Math.max(1, Math.ceil(seconds / 60))
  return `${base} Inténtalo de nuevo en ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}.`
}

/** Forma del cuerpo cuando el login devuelve reto en vez de tokens. */
type TwoFactorChallengeBody = {
  twoFactorRequired: true
  challengeToken: string
  expiresAt: string
}

/**
 * Las dos formas posibles del cuerpo de `POST /api/auth/login`.
 *
 * El caso con tokens declara `twoFactorRequired?: false` porque el backend **si**
 * manda esa clave con valor `false`. Distinguir por presencia (`'x' in body`) seria
 * un error: la clave esta siempre, y todo login correcto se tomaria por un reto.
 * Se discrimina por el **valor**.
 */
type LoginResponseBody = (AuthTokens & { twoFactorRequired?: false }) | TwoFactorChallengeBody

export const api = {
  // ---- Auth ----

  /**
   * POST /api/auth/login — primer factor.
   *
   * Devuelve `kind: 'tokens'` cuando la cuenta no tiene segundo factor, y en ese
   * caso los guarda. Con segundo factor activo devuelve el reto y **no guarda
   * nada**: guardar el reto como si fuera un token dejaria a la SPA creyendose
   * dentro con una credencial que no abre ninguna ruta.
   */
  async login(input: LoginInput): Promise<LoginResult> {
    const res = await postPublicJson('/api/auth/login', input)
    if (res.status === HTTP_LOCKED)
      throw new ApiHttpError(await accountLockedMessage(res), res.status)
    await assertOk(res, GENERIC_ERROR_MESSAGE)

    const body = (await res.json()) as LoginResponseBody
    if (body.twoFactorRequired) {
      return {
        kind: 'twoFactorRequired',
        challengeToken: body.challengeToken,
        expiresAt: body.expiresAt,
      }
    }

    setTokens({ accessToken: body.accessToken, refreshToken: body.refreshToken })
    return { kind: 'tokens' }
  },

  /**
   * POST /api/auth/2fa/verify — segundo factor.
   *
   * Va con `postPublicJson` y no con `apiFetch`, igual que `login`: todavia no
   * hay sesion que adjuntar, y `apiFetch` intentaria refrescar un token inexistente.
   */
  async verifyTwoFactor(input: VerifyTwoFactorInput): Promise<AuthTokens> {
    const res = await postPublicJson('/api/auth/2fa/verify', input)
    if (res.status === HTTP_LOCKED)
      throw new ApiHttpError(await accountLockedMessage(res), res.status)
    await assertOk(res, 'El código no es válido o ha caducado')

    const tokens = (await res.json()) as AuthTokens
    setTokens(tokens)
    return tokens
  },

  /** POST /api/profile/2fa/setup — prepara el alta y devuelve el QR. No activa nada. */
  async setupTwoFactor(): Promise<TwoFactorSetup> {
    const res = await apiFetch('/api/profile/2fa/setup', { method: 'POST' })
    await assertOk(res, 'No se ha podido preparar el segundo factor')
    return (await res.json()) as TwoFactorSetup
  },

  /** POST /api/profile/2fa/activate — confirma con un codigo y entrega los de recuperacion. */
  async activateTwoFactor(code: string): Promise<TwoFactorActivation> {
    const res = await apiFetch('/api/profile/2fa/activate', {
      method: 'POST',
      body: JSON.stringify({ code }),
    })
    await assertOk(res, 'El código no es válido')
    return (await res.json()) as TwoFactorActivation
  },

  /** POST /api/profile/2fa/disable — exige contrasena **y** codigo vigente. */
  async disableTwoFactor(input: DisableTwoFactorInput): Promise<void> {
    const res = await apiFetch('/api/profile/2fa/disable', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    await assertOk(res, 'No se ha podido desactivar el segundo factor')
  },

  /** POST /api/auth/register — returns tokens + user. */
  async register(input: RegisterInput): Promise<{ user: AuthUser; tokens: AuthTokens }> {
    const res = await postPublicJson('/api/auth/register', input)
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
    const res = await postPublicJson('/api/auth/forgot-password', { email })
    await assertOk(res, GENERIC_ERROR_MESSAGE)
  },

  /**
   * POST /api/auth/reset-password — public endpoint, no token attached.
   * Rejects with a curated message when the token is invalid, expired, or
   * already used, or when the new password fails validation.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const res = await postPublicJson('/api/auth/reset-password', { token, newPassword })
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

  /**
   * POST /api/diagnosis — runs OBD diagnosis for a scenario.
   *
   * En el vehiculo real por USB-OTG (Android nativo) lee directo del puerto
   * serie en vez de pedirselo al core-api: el cable esta en el telefono, no
   * en el servidor.
   */
  async runDiagnosis(scenarioId: string): Promise<DiagnosisResponse> {
    if (usesNativeUsb(scenarioId)) return getNativeObdService().runDiagnosis()
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
    if (usesNativeUsb(scenarioId)) return getNativeObdService().getFreezeFrame(dtc)
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
    if (usesNativeUsb(scenarioId)) return getNativeObdService().getLiveData(pids)
    const query = new URLSearchParams({ scenarioId })
    if (pids && pids.length > 0) query.set('pids', pids.join(','))
    const res = await apiFetch(`/api/live-data?${query.toString()}`)
    await assertOk(res, GENERIC_ERROR_MESSAGE)
    return (await res.json()) as LiveDataResponse
  },

  /** GET /api/ecu-info — returns the ECUs discovered for the vehicle. */
  async getEcuInfo(scenarioId: string): Promise<EcuInfo[]> {
    if (usesNativeUsb(scenarioId)) return getNativeObdService().getEcuInfo()
    const data = await fetchScenarioJson<{ ecus: EcuInfo[] }>('/api/ecu-info', scenarioId)
    return data.ecus
  },

  /**
   * GET /api/vehicle-info — identifies the vehicle by reading and decoding its VIN.
   *
   * Sobre USB nativo solo lee el VIN crudo: decodificar fabricante/modelo por
   * WMI es RAG/LLM y sigue siendo el core-api, que sí tiene esa base — fuera
   * de alcance para el transporte serie en si mismo.
   */
  async getVehicleInfo(scenarioId: string): Promise<VehicleInfoResponse> {
    if (usesNativeUsb(scenarioId)) {
      const vin = await getNativeObdService().readVin()
      return {
        vin,
        make: 'unknown',
        model: 'unknown',
        year: 0,
        engineType: 'unknown',
        manufacturer: null,
        region: null,
        modelYearDecoded: null,
      }
    }
    return fetchScenarioJson<VehicleInfoResponse>('/api/vehicle-info', scenarioId)
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
    if (usesNativeUsb(scenarioId)) {
      return { dtcCodes: await getNativeObdService().readPendingDtcCodes() }
    }
    return fetchScenarioJson<{ dtcCodes: DtcCode[] }>('/api/pending-dtc', scenarioId)
  },

  /** GET /api/permanent-dtc — returns permanent DTCs (Mode 0A). */
  async getPermanentDtc(scenarioId: string): Promise<{ dtcCodes: DtcCode[] }> {
    if (usesNativeUsb(scenarioId)) {
      return { dtcCodes: await getNativeObdService().readPermanentDtcCodes() }
    }
    return fetchScenarioJson<{ dtcCodes: DtcCode[] }>('/api/permanent-dtc', scenarioId)
  },

  /** POST /api/clear-dtc — clears stored DTCs and resets emission monitors. */
  async clearDtc(scenarioId: string): Promise<{ cleared: boolean }> {
    if (usesNativeUsb(scenarioId)) {
      await getNativeObdService().clearDtcCodes()
      return { cleared: true }
    }
    const res = await apiFetch('/api/clear-dtc', {
      method: 'POST',
      body: JSON.stringify({ scenarioId }),
    })
    await assertOk(res, GENERIC_ERROR_MESSAGE)
    return (await res.json()) as { cleared: boolean }
  },

  /** GET /api/vehicle-status — returns MIL status, DTC count, and monitor readiness. */
  async getVehicleStatus(scenarioId: string): Promise<VehicleStatusOutput> {
    if (usesNativeUsb(scenarioId)) return getNativeObdService().getVehicleStatus()
    return fetchScenarioJson<VehicleStatusOutput>('/api/vehicle-status', scenarioId)
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
