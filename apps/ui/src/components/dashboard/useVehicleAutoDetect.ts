import { useCallback, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { extractErrorMessage } from '@/lib/errors'
import type { VehicleInfoResponse } from './types'

/** Steps of the vehicle identification wizard, in order. */
export type VehicleAutoDetectStep = 'selecting' | 'detecting' | 'confirming' | 'done'

const DETECT_ERROR = 'No se pudo identificar el vehículo'

/**
 * State machine of the vehicle identification wizard: the user picks a
 * connection (`selecting`), the VIN is read and decoded (`detecting`), the
 * identified vehicle is shown (`confirming`) and, once accepted, the diagnosis
 * menu opens (`done`).
 *
 * A failed read is recoverable: the step stays on `detecting` with `error`
 * set, so the wizard can offer a retry instead of dropping the user back to
 * the start.
 */
export function useVehicleAutoDetect() {
  const [step, setStep] = useState<VehicleAutoDetectStep>('selecting')
  const [scenarioId, setScenarioId] = useState('')
  const [vehicle, setVehicle] = useState<VehicleInfoResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Descarta respuestas obsoletas: cambiar de vehículo a media lectura no debe
  // dejar que la lectura anterior sobreescriba la nueva al resolver.
  const requestId = useRef(0)

  const detect = useCallback((id: string) => {
    const current = ++requestId.current
    setScenarioId(id)
    setVehicle(null)
    setError(null)
    setStep('detecting')
    api
      .getVehicleInfo(id)
      .then((data) => {
        if (requestId.current !== current) return
        setVehicle(data)
        setStep('confirming')
      })
      .catch((e: unknown) => {
        if (requestId.current !== current) return
        setError(extractErrorMessage(e, DETECT_ERROR))
      })
  }, [])

  const retry = useCallback(() => {
    if (scenarioId) detect(scenarioId)
  }, [detect, scenarioId])

  const confirm = useCallback(() => {
    setStep('done')
  }, [])

  const restart = useCallback(() => {
    requestId.current++
    setVehicle(null)
    setError(null)
    setStep('selecting')
  }, [])

  return { step, scenarioId, vehicle, error, detect, retry, confirm, restart }
}
