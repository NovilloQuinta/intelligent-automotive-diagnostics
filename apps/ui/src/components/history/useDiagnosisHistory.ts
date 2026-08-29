import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { DiagnosisSession } from '@/components/dashboard/types'

export interface DiagnosisHistoryFilters {
  readonly from?: string
  readonly to?: string
  readonly severity?: string
  readonly limit: number
  readonly offset: number
}

export interface DiagnosisHistoryState {
  readonly sessions: DiagnosisSession[]
  readonly total: number
  readonly isLoading: boolean
  readonly isError: boolean
  readonly error: Error | null
}

/**
 * Fetches the paginated diagnosis history list for the authenticated user.
 * Filters are passed as query key dependencies so TanStack Query
 * automatically refetches when they change.
 */
export function useDiagnosisHistory(filters: DiagnosisHistoryFilters): DiagnosisHistoryState {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['diagnosis-history', filters],
    queryFn: () => api.getDiagnosisHistory(filters),
    select: (response) => ({
      sessions: response.items,
      total: response.total,
    }),
  })

  return {
    sessions: data?.sessions ?? [],
    total: data?.total ?? 0,
    isLoading,
    isError,
    error: error instanceof Error ? error : null,
  }
}
