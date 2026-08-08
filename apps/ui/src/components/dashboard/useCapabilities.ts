import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/**
 * Probes the backend for optional capabilities once on mount.
 *
 * Defaults to `cognitiveDiagnosis: false` while the probe is pending and stays
 * false if it fails: the cognitive layer is opt-in enrichment, never a blocker.
 */
export function useCapabilities() {
  const [cognitiveDiagnosis, setCognitiveDiagnosis] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .getCapabilities()
      .then((caps) => {
        if (active) setCognitiveDiagnosis(caps.cognitiveDiagnosis);
      })
      .catch(() => {
        // Capacidad opcional: sin ella el dashboard funciona igual.
      });
    return () => {
      active = false;
    };
  }, []);

  return { cognitiveDiagnosis };
}
