import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { VehicleStatusOutput } from "./types";

export function useVehicleStatus(scenarioId: string | null) {
  const {
    data: status = null,
    isLoading: loading,
    error,
  } = useQuery<VehicleStatusOutput>({
    queryKey: ["vehicle-status", scenarioId],
    queryFn: () => api.getVehicleStatus(scenarioId!),
    enabled: !!scenarioId,
  });

  return {
    status,
    loading,
    error: error instanceof Error ? error.message : null,
  };
}
