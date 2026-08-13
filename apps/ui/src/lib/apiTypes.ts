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
