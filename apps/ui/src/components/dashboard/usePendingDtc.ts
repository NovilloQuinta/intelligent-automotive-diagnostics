import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/lib/errors";
import type { DtcCode } from "./types";

/**
 * Fetches pending DTCs (Mode 07) for the given scenario.
 * Follows the useEcuInfo pattern with cancellation support.
 */
export function usePendingDtc(scenarioId: string) {
  const [loading, setLoading] = useState(false);
  const [dtcCodes, setDtcCodes] = useState<DtcCode[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!scenarioId) {
      setDtcCodes([]);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getPendingDtc(scenarioId)
      .then((data) => {
        if (cancelled) return;
        setDtcCodes(data.dtcCodes);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(extractErrorMessage(e, "Fallo al cargar averías pendientes"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scenarioId]);

  return { loading, dtcCodes, error };
}
