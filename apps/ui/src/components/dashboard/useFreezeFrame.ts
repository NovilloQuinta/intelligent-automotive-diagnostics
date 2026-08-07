import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { FreezeFrame } from "./types";

/**
 * Loads the OBD-II freeze frame for the selected DTC, refetching whenever the
 * scenario or the DTC changes. `frame` is null both when no snapshot exists
 * for the code and while nothing is selected; use `dtc` and `loading` to tell
 * those states apart.
 */
export function useFreezeFrame(scenarioId: string, dtc: string | null) {
  const [loading, setLoading] = useState(false);
  const [frame, setFrame] = useState<FreezeFrame | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!scenarioId || !dtc) {
      setFrame(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getFreezeFrame(scenarioId, dtc)
      .then((data) => {
        if (cancelled) return;
        setFrame(data);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : "Fallo al cargar el freeze frame",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scenarioId, dtc]);

  return { loading, frame, error };
}
