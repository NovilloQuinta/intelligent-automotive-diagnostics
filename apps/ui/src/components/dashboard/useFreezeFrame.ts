import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { FreezeFrame } from './types'

/** Freeze frame de un DTC concreto; query deshabilitada hasta que hay escenario y `dtc` seleccionados. */
export function useFreezeFrame(scenarioId: string, dtc: string | null) {
  const {
    data: frame = null,
    isLoading: loading,
    error,
  } = useQuery<FreezeFrame | null>({
    queryKey: ['freeze-frame', scenarioId, dtc],
    queryFn: () => api.getFreezeFrame(scenarioId, dtc!),
    enabled: !!scenarioId && !!dtc,
  })

  return {
    loading,
    frame,
    error: error instanceof Error ? error.message : null,
  }
}
