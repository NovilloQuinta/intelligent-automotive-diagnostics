import { useCallback, useState } from "react";
import { api } from "@/lib/api";
import { pidObservationToRow, type PidRow } from "./pidCatalog";

/**
 * Runs the LLM cognitive diagnosis for the selected scenario and exposes the
 * PIDs it discovered as table rows.
 *
 * Best-effort by design: the call can take up to 60 s and any failure is
 * swallowed (no toast) so the deterministic diagnosis already on screen keeps
 * its own error semantics.
 */
export function useCognitiveDiagnosis(selectedId: string) {
  const [loading, setLoading] = useState(false);
  const [pidRows, setPidRows] = useState<PidRow[] | null>(null);

  const trigger = useCallback(
    async (query?: string) => {
      if (!selectedId) return;
      setLoading(true);
      setPidRows(null);
      try {
        const output = await api.getCognitiveDiagnosis(selectedId, query);
        setPidRows(output.pidObservations.map(pidObservationToRow));
      } catch {
        setPidRows(null);
      } finally {
        setLoading(false);
      }
    },
    [selectedId],
  );

  const reset = useCallback(() => {
    setPidRows(null);
    setLoading(false);
  }, []);

  return { pidRows, loading, trigger, reset };
}
