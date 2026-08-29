import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

/** Feature flags del backend (ej. diagnosis cognitiva); false por defecto hasta que responde. */
export function useCapabilities() {
  const { data } = useQuery<{ cognitiveDiagnosis: boolean }>({
    queryKey: ['capabilities'],
    queryFn: () => api.getCapabilities(),
    staleTime: 60_000,
  })

  return {
    cognitiveDiagnosis: data?.cognitiveDiagnosis ?? false,
  }
}
