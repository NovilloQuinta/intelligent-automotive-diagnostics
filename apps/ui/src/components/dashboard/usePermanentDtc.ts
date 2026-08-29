import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { DtcCode } from './types'

/** DTCs permanentes (no se borran con el reset de averías) del escenario activo. */
export function usePermanentDtc(scenarioId: string) {
  const {
    data = { dtcCodes: [] },
    isLoading: loading,
    error,
    refetch,
  } = useQuery<{ dtcCodes: DtcCode[] }>({
    queryKey: ['permanent-dtc', scenarioId],
    queryFn: () => api.getPermanentDtc(scenarioId),
    enabled: scenarioId.length > 0,
  })

  return {
    loading,
    dtcCodes: data.dtcCodes,
    error: error instanceof Error ? error.message : null,
    refetch,
  }
}
