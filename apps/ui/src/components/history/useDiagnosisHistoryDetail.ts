import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { DiagnosisSessionDetail } from '@/components/dashboard/types'
import type { SessionReportState } from '@/components/dashboard/useSessionReport'
import type { CognitiveOutput } from '@/lib/apiTypes'

export interface DiagnosisHistoryDetailState {
  readonly session: DiagnosisSessionDetail | null
  readonly reportState: SessionReportState | null
  readonly isLoading: boolean
  readonly isError: boolean
  readonly error: Error | null
}

/**
 * Forma real de `result_json` (ver `diagnosisSnapshots.ts` en el backend):
 * no es un `SessionReportState`, es un snapshot minimo del diagnostico
 * cognitivo. Un cast directo a `SessionReportState` dejaba `cognitive`
 * siempre `undefined` y el informe historico se quedaba en "Esperando
 * datos del diagnostico cognitivo…" para siempre, aunque el diagnostico ya
 * estuviera hecho y guardado.
 */
interface PersistedDiagnosisSnapshot {
  readonly vehicle?: unknown
  readonly diagnosis?: {
    readonly severity?: string
    readonly confidence?: number
    readonly narrative?: string
    readonly recommendations?: string[]
    readonly toolCalls?: CognitiveOutput['toolCalls']
  }
}

/** Traduce el snapshot persistido al `SessionReportState` que ya sabe pintar `SessionReportPanel`. */
function snapshotToReportState(raw: unknown): SessionReportState | null {
  const snapshot = raw as PersistedDiagnosisSnapshot
  if (!snapshot.diagnosis?.narrative) return null

  return {
    capabilities: { cognitiveDiagnosis: true },
    deterministic: null,
    deterministicLoading: false,
    deterministicError: null,
    ecus: null,
    ecusLoading: false,
    freezeFrame: null,
    freezeFrameLoading: false,
    cognitive: {
      diagnosis: snapshot.diagnosis.narrative,
      severity: snapshot.diagnosis.severity ?? 'low',
      confidence: snapshot.diagnosis.confidence ?? 0,
      recommendations: snapshot.diagnosis.recommendations ?? [],
      toolCalls: snapshot.diagnosis.toolCalls ?? [],
      pidObservations: [],
    },
    cognitiveLoading: false,
    cognitiveError: null,
  }
}

/**
 * Fetches the full detail of a diagnosis session by its ID, including the
 * `resultJson` snapshot that can be passed directly to `SessionReportPanel`.
 *
 * The `resultJson` is parsed as `SessionReportState` — if parsing fails the
 * hook still returns the session metadata with a null `reportState`.
 */
export function useDiagnosisHistoryDetail(id: number): DiagnosisHistoryDetailState {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['diagnosis-history-detail', id],
    queryFn: () => api.getDiagnosisHistoryDetail(id),
    enabled: id > 0,
  })

  const session = data ?? null
  let reportState: SessionReportState | null = null

  if (session?.resultJson) {
    try {
      reportState = snapshotToReportState(JSON.parse(session.resultJson))
    } catch {
      // resultJson is malformed — return session metadata without report state
    }
  }

  return {
    session,
    reportState,
    isLoading,
    isError,
    error: error instanceof Error ? error : null,
  }
}
