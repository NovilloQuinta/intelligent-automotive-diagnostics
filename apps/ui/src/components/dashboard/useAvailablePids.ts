import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { AvailablePid } from './types'

/**
 * Catálogo de PIDs Mode 01 disponibles para el selector de telemetría en vivo.
 *
 * Es un catálogo global SAE J1979 (no depende del vehículo conectado), así que
 * se consulta una sola vez y se marca `staleTime` alto. Si el endpoint falla,
 * devuelve `[]` para que `PidsTable` degrade al listado de PIDs del diagnóstico.
 */
export function useAvailablePids(): readonly AvailablePid[] {
  const { data } = useQuery<AvailablePid[]>({
    queryKey: ['available-pids'],
    queryFn: () => api.getAvailablePids(),
    staleTime: 5 * 60 * 1000,
  })
  return data ?? []
}
