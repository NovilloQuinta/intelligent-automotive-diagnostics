import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Scenario } from './types'

/** Los escenarios de simulación apenas cambian; se refrescan cada 30s. */
const SCENARIOS_STALE_MS = 30_000

export function useScenarios() {
  const { data: scenarios = [], error } = useQuery<Scenario[]>({
    queryKey: ['scenarios'],
    queryFn: () => api.getScenarios(),
    staleTime: SCENARIOS_STALE_MS,
  })

  const [selectedId, setSelectedId] = useState('')

  const scenariosError = error ? (error instanceof Error ? error.message : 'Error de red') : null

  return {
    scenarios,
    selectedId,
    setSelectedId,
    scenariosError,
  }
}
