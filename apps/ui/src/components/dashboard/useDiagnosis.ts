import { useState } from 'react'
import { toast } from 'sonner'
import type { DiagnosisResponse } from './types'
import { severityMeta } from './severityMeta'

/** Runs OBD diagnosis for the selected vehicle and manages loading/result state. */
export function useDiagnosis(selectedId: string) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<DiagnosisResponse | null>(null)

  const run = async () => {
    if (!selectedId || loading) return
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/diagnosis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId: selectedId }),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error ?? `Error del servidor (${res.status})`)
      }
      const data = (await res.json()) as DiagnosisResponse
      setResult(data)
      toast.success('Diagnóstico completado', {
        description: `Severidad: ${severityMeta(data.severity).label}`,
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Fallo al ejecutar el diagnóstico'
      toast.error('Error de diagnóstico', { description: msg })
    } finally { setLoading(false) }
  }

  return { loading, result, runDiagnosis: run }
}
