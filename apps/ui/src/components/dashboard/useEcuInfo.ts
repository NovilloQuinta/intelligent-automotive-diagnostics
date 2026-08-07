import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { EcuInfo } from "./types";

export function useEcuInfo(selectedId: string | null) {
  const [loading, setLoading] = useState(false);
  const [ecus, setEcus] = useState<EcuInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId) {
      setEcus([]);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getEcuInfo(selectedId)
      .then((data) => {
        if (cancelled) return;
        setEcus(data);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Fallo al cargar las ECUs");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  return { loading, ecus, error };
}
