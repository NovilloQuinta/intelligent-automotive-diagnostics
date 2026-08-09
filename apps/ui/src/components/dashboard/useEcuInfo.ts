import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { EcuInfo } from "./types";

export function useEcuInfo(selectedId: string | null) {
  const {
    data: ecus = [],
    isLoading: loading,
    error,
  } = useQuery<EcuInfo[]>({
    queryKey: ["ecu-info", selectedId],
    queryFn: () => api.getEcuInfo(selectedId!),
    enabled: !!selectedId,
  });

  return {
    loading,
    ecus,
    error: error instanceof Error ? error.message : null,
  };
}
