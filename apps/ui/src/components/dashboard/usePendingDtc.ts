import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { DtcCode } from './types'

/** DTCs pendientes (no confirmados) del escenario; expone `refetch` para refrescar tras borrar averías. */
export function usePendingDtc(scenarioId: string) {
  const {
    data = { dtcCodes: [] },
    isLoading: loading,
    error,
    refetch,
  } = useQuery<{ dtcCodes: DtcCode[] }>({
    queryKey: ['pending-dtc', scenarioId],
    queryFn: () => api.getPendingDtc(scenarioId),
    enabled: scenarioId.length > 0,
  })

  return {
    loading,
    dtcCodes: data.dtcCodes,
    error: error instanceof Error ? error.message : null,
    refetch,
  }
}
