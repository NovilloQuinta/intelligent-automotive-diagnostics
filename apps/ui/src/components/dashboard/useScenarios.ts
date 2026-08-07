import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/lib/errors";
import type { Scenario } from "./types";

/** Fetches available vehicle scenarios from the real backend via the authenticated API. */
export function useScenarios() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    api
      .getScenarios()
      .then((data) => {
        if (!mounted) return;
        setScenarios(data);
        if (data.length && !selectedId) setSelectedId(data[0].id);
      })
      .catch((e: unknown) => {
        if (!mounted) return;
        const msg = extractErrorMessage(e, "Error de red");
        setError(msg);
        toast.error(msg);
      });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    scenarios,
    selectedId,
    setSelectedId,
    scenariosError: error,
  };
}
