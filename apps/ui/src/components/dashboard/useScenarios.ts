import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Scenario } from "./types";

export function useScenarios() {
  const {
    data: scenarios = [],
    error,
  } = useQuery<Scenario[]>({
    queryKey: ["scenarios"],
    queryFn: () => api.getScenarios(),
    staleTime: 30_000,
  });

  const [selectedId, setSelectedId] = useState("");

  const scenariosError = error
    ? error instanceof Error
      ? error.message
      : "Error de red"
    : null;

  return {
    scenarios,
    selectedId,
    setSelectedId,
    scenariosError,
  };
}
