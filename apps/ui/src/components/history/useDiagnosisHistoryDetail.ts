import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { DiagnosisSessionDetail } from '@/components/dashboard/types'
import type { SessionReportState } from '@/components/dashboard/useSessionReport'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiagnosisHistoryDetailState {
  readonly session: DiagnosisSessionDetail | null
  readonly reportState: SessionReportState | null
  readonly isLoading: boolean
  readonly isError: boolean
  readonly error: Error | null
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

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
      reportState = JSON.parse(session.resultJson) as SessionReportState
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
