import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useScenarios } from "../../../src/components/dashboard/useScenarios";

// Mock the api module
vi.mock("../../../src/lib/api", () => ({
  api: {
    getScenarios: vi.fn(),
  },
}));

import { api } from "../../../src/lib/api";

describe("useScenarios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches and selects first scenario on mount", async () => {
    const mockScenarios = [
      { id: "audi-a3-idle", name: "Audi A3", vehicleType: "car" as const, sensorValues: { rpm: 750, coolantTemp: 90, speed: 0, intakeTemp: 25 }, dtcConfig: [], vehicleInfo: { make: "Audi", model: "A3", year: 2018, engineType: "2.0 TFSI", vin: "WAU..." } },
      { id: "kawa-z900", name: "Kawasaki Z900", vehicleType: "motorcycle" as const, sensorValues: { rpm: 4500, coolantTemp: 105, speed: 0, intakeTemp: 28 }, dtcConfig: [], vehicleInfo: { make: "Kawasaki", model: "Z900", year: 2020, engineType: "948cc", vin: "JKA..." } },
    ];
    vi.mocked(api.getScenarios).mockResolvedValueOnce(mockScenarios);

    const { result } = renderHook(() => useScenarios());

    await waitFor(() => {
      expect(result.current.scenarios).toEqual(mockScenarios);
    });
    expect(result.current.selectedId).toBe("audi-a3-idle");
    expect(result.current.scenariosError).toBeNull();
  });

  it("sets error on API failure", async () => {
    vi.mocked(api.getScenarios).mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useScenarios());

    await waitFor(() => {
      expect(result.current.scenariosError).toBe("Network error");
    });
    expect(result.current.scenarios).toEqual([]);
  });
});
