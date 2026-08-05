import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { Scenario } from './types'

/** Fetches available vehicle scenarios from the API on mount. */
export function useScenarios() {
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    fetch('/api/scenarios')
      .then((r) => {
        if (!r.ok) throw new Error('Error al obtener vehículos')
        return r.json() as Promise<Scenario[]>
      })
      .then((data) => {
        if (!mounted) return
        setScenarios(data)
        if (data.length && !selectedId) setSelectedId(data[0].id)
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : 'Error de red'
        setError(msg)
        toast.error(msg)
      })
    return () => { mounted = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { scenarios, selectedId, setSelectedId, scenariosError: error }
}
