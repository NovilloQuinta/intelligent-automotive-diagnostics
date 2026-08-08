import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { pidObservationToRow, type PidRow } from "./pidCatalog";

const COGNITIVE_QUERY_KEY = "cognitive-diagnosis";

/**
 * Runs the LLM cognitive diagnosis for the selected scenario and exposes the
 * PIDs it discovered as table rows.
 *
 * Best-effort by design: the call can take up to 60 s and any failure is
 * swallowed (no toast) so the deterministic diagnosis already on screen keeps
 * its own error semantics.
 */
export function useCognitiveDiagnosis(selectedId: string) {
  const queryClient = useQueryClient();
  const queryKey = [COGNITIVE_QUERY_KEY, selectedId] as const;

  const { data: pidRows } = useQuery<PidRow[]>({
    queryKey,
    queryFn: async () => {
      const output = await api.getCognitiveDiagnosis(selectedId);
      return output.pidObservations.map(pidObservationToRow);
    },
    enabled: false,
  });

  const mutation = useMutation({
    mutationFn: async (query?: string) => {
      const output = await api.getCognitiveDiagnosis(selectedId, query);
      return output.pidObservations.map(pidObservationToRow);
    },
    onSuccess: (rows) => {
      queryClient.setQueryData(queryKey, rows);
    },
    onError: () => {
      // swallowed by design
    },
  });

  const trigger = async (query?: string) => {
    if (!selectedId) return;
    try {
      return await mutation.mutateAsync(query);
    } catch {
      // swallowed by design — onError already handled it
    }
  };

  const reset = () => {
    mutation.reset();
    queryClient.removeQueries({ queryKey });
  };

  return {
    pidRows: pidRows ?? null,
    loading: mutation.isPending,
    trigger,
    reset,
  };
}
