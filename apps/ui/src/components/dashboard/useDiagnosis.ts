import { useCallback, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/lib/errors";
import type { DiagnosisResponse } from "./types";
import { severityMeta } from "./severityMeta";

/** Runs OBD diagnosis for the selected vehicle via the authenticated API. */
export function useDiagnosis(selectedId: string) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DiagnosisResponse | null>(null);

  const run = useCallback(async () => {
    if (!selectedId || loading) return;
    setLoading(true);
    setResult(null);
    try {
      const data = await api.runDiagnosis(selectedId);
      setResult(data);
      toast.success("Diagnóstico completado", {
        description: `Severidad: ${severityMeta(data.severity).label}`,
      });
    } catch (e: unknown) {
      const msg = extractErrorMessage(e, "Fallo al ejecutar el diagnóstico");
      toast.error("Error de diagnóstico", { description: msg });
    } finally {
      setLoading(false);
    }
  }, [selectedId, loading]);

  return { loading, result, runDiagnosis: run };
}
