import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

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
