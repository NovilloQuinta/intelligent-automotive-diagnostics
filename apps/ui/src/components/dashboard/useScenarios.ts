import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { isNativePlatform } from '@/lib/obd/nativeObdBridge'
import { NATIVE_USB_SCENARIO } from '@/lib/obd/nativeScenario'
import type { Scenario } from './types'

/** Los escenarios de simulación apenas cambian; se refrescan cada 30s. */
const SCENARIOS_STALE_MS = 30_000

/**
 * Lista de escenarios de simulacion + escenario seleccionado (estado local, no persiste).
 *
 * Dentro del APK Android antepone el escenario sintetico del vehiculo real por
 * USB-OTG: es el unico sitio donde existe ese puerto serie, asi que solo tiene
 * sentido ofrecerlo ahi. En la web normal la lista sale igual que siempre.
 */
export function useScenarios() {
  const { data: fetchedScenarios = [], error } = useQuery<Scenario[]>({
    queryKey: ['scenarios'],
    queryFn: () => api.getScenarios(),
    staleTime: SCENARIOS_STALE_MS,
  })

  const scenarios = isNativePlatform()
    ? [NATIVE_USB_SCENARIO, ...fetchedScenarios]
    : fetchedScenarios

  const [selectedId, setSelectedId] = useState('')

  const scenariosError = error ? (error instanceof Error ? error.message : 'Error de red') : null

  return {
    scenarios,
    selectedId,
    setSelectedId,
    scenariosError,
  }
}
