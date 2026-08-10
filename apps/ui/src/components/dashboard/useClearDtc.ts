import { useState } from 'react'
import { api } from '@/lib/api'
import { extractErrorMessage } from '@/lib/errors'

/**
 * Clears stored DTCs and freeze frames via POST /api/clear-dtc.
 * Permanent DTCs are not cleared by this operation.
 */
export function useClearDtc() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clearDtc = async (scenarioId: string): Promise<boolean> => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.clearDtc(scenarioId)
      return result.cleared
    } catch (e: unknown) {
      const msg = extractErrorMessage(e, 'Fallo al borrar averías')
      setError(msg)
      throw e
    } finally {
      setLoading(false)
    }
  }

  return { clearDtc, loading, error }
}
