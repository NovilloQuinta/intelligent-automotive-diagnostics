import type { AuthTokens, AuthUser, PidReading, Scenario } from '@/components/dashboard/types'

/** Scenarios wrapped response. */
export type ScenariosResponse = { scenarios: Scenario[] }

/** Respuesta de `GET /api/live-data`: `null` en un campo = ese PID falló. */
export type LiveDataResponse = {
  rpm: number | null
  coolantTemp: number | null
  speed: number | null
  intakeTemp: number | null
  /** Generic per-PID readings (one entry per requested PID), used for gauges without a dedicated widget. */
  readings: PidReading[]
}

export type PidObservation = {
  code: string
  name: string
  unit?: string
  value: number
  status: 'ok' | 'review'
}

export type CognitiveOutput = {
  diagnosis: string
  severity: string
  confidence: number
  recommendations: string[]
  toolCalls: { tool: string; args: Record<string, unknown>; result: string }[]
  pidObservations: PidObservation[]
  /** Id de la `diagnosis_session` persistida; presente cuando el backend creó/resolvió la sesión. */
  sessionId?: number
}

export type ConversationItem = {
  readonly __type: 'user_message' | 'raw_response' | 'tool_result'
  readonly content?: string
  readonly data?: unknown
  readonly toolCallId?: string
  readonly isError?: boolean
}

/** Register response from backend. */
export type RegisterResponse = AuthTokens & { user: AuthUser }

/**
 * Resultado de `POST /api/auth/login`.
 *
 * Union discriminada, no una excepcion: que haga falta el segundo factor **no es
 * un error**, es un camino normal del login. Modelarlo como excepcion obligaria a
 * distinguirlo por el texto del mensaje.
 */
export type LoginResult =
  { kind: 'tokens' } | { kind: 'twoFactorRequired'; challengeToken: string; expiresAt: string }

/** Cuerpo que devuelve `POST /api/profile/2fa/setup`. */
export type TwoFactorSetup = {
  /** URI `otpauth://` que codifica el QR. */
  otpauthUri: string
  /** El QR ya renderizado, para un `<img src>`. */
  qrDataUri: string
  /** Secreto en Base32, para quien no pueda escanear y lo teclee a mano. */
  secret: string
}

/** Cuerpo que devuelve `POST /api/profile/2fa/activate`. */
export type TwoFactorActivation = {
  /** Los diez codigos. Es la unica vez que el servidor los entrega en claro. */
  recoveryCodes: string[]
}

/** Entrada del canje del reto. */
export type VerifyTwoFactorInput = {
  challengeToken: string
  /** Codigo TOTP o de recuperacion; el backend distingue por la forma. */
  code: string
}

/** Entrada de la desactivacion: hacen falta los dos factores. */
export type DisableTwoFactorInput = {
  password: string
  code: string
}
