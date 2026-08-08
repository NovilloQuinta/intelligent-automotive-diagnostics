import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/lib/errors";
import type { VehicleStatusOutput } from "./types";

/**
 * Fetches the vehicle status (MIL, DTC count, engine type, and emission
 * monitors) for the given scenario. Follows the useEcuInfo pattern with
 * cancellation support.
 */
export function useVehicleStatus(scenarioId: string | null) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<VehicleStatusOutput | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!scenarioId) {
      setStatus(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getVehicleStatus(scenarioId)
      .then((data) => {
        if (cancelled) return;
        setStatus(data);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(
          extractErrorMessage(e, "Fallo al cargar el estado del vehículo"),
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scenarioId]);

  return { status, loading, error };
}
