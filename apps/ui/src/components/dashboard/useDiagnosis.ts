import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { extractErrorMessage } from '@/lib/errors'
import type { DiagnosisResponse } from './types'
import { severityMeta } from './severityMeta'

const DIAGNOSIS_QUERY_KEY = 'diagnosis'

/** Runs OBD diagnosis for the selected vehicle via the authenticated API. */
export function useDiagnosis(selectedId: string) {
  const queryClient = useQueryClient()
  const queryKey = [DIAGNOSIS_QUERY_KEY, selectedId] as const

  const { data: result } = useQuery<DiagnosisResponse>({
    queryKey,
    queryFn: () => api.runDiagnosis(selectedId),
    enabled: false,
  })

  const mutation = useMutation({
    mutationFn: () => api.runDiagnosis(selectedId),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data)
      toast.success('Diagnóstico completado', {
        description: `Severidad: ${severityMeta(data.severity).label}`,
      })
    },
    onError: (e: unknown) => {
      const msg = extractErrorMessage(e, 'Fallo al ejecutar el diagnóstico')
      toast.error('Error de diagnóstico', { description: msg })
    },
  })

  const runDiagnosis = async () => {
    if (!selectedId || mutation.isPending) return
    return mutation.mutateAsync()
  }

  return {
    loading: mutation.isPending,
    result: result ?? null,
    runDiagnosis,
  }
}
