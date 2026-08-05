import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useLiveTelemetry } from "../../../src/components/dashboard/useLiveTelemetry";
import type { Scenario } from "../../../src/components/dashboard/types";

const MOCK_SCENARIO: Scenario = {
  id: "audi-a3-idle",
  name: "Audi A3",
  vehicleType: "car",
  sensorValues: { rpm: 750, coolantTemp: 90, speed: 0, intakeTemp: 25 },
  dtcConfig: [],
  vehicleInfo: { make: "Audi", model: "A3", year: 2018, engineType: "2.0 TFSI", vin: "WAU..." },
};

describe("useLiveTelemetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits first frame immediately and sets streamOk", () => {
    const { result } = renderHook(() => useLiveTelemetry(MOCK_SCENARIO));

    // With fake timers, the first jitterFrame call happens synchronously in useEffect
    vi.advanceTimersToNextTimer();

    expect(result.current.streamOk).toBe(true);
    expect(result.current.live).not.toBeNull();
    expect(result.current.live!.rpm).toBeGreaterThanOrEqual(690);
    expect(result.current.live!.rpm).toBeLessThanOrEqual(810);
  });

  it("returns null and streamOk false when no scenario", () => {
    const { result } = renderHook(() => useLiveTelemetry(null));

    expect(result.current.live).toBeNull();
    expect(result.current.streamOk).toBe(false);
  });

  it("updates frame on interval tick", () => {
    const { result } = renderHook(() => useLiveTelemetry(MOCK_SCENARIO));

    vi.advanceTimersToNextTimer();
    expect(result.current.streamOk).toBe(true);

    const firstFrame = result.current.live;
    expect(firstFrame).not.toBeNull();

    // Advance by 500ms → new frame via setInterval callback
    vi.advanceTimersByTime(500);

    // Frame should have been updated
    expect(result.current.live).not.toBeNull();
  });

  it("cleans up interval on unmount", () => {
    const clearIntervalSpy = vi.spyOn(global, "clearInterval");
    const { unmount } = renderHook(() => useLiveTelemetry(MOCK_SCENARIO));

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it("resets when scenario changes to null", () => {
    const { result, rerender } = renderHook(
      ({ scenario }) => useLiveTelemetry(scenario),
      { initialProps: { scenario: MOCK_SCENARIO as Scenario | null } },
    );

    // First frame emitted synchronously with fake timers
    vi.advanceTimersToNextTimer();
    expect(result.current.streamOk).toBe(true);

    // Switch to null scenario
    rerender({ scenario: null });

    expect(result.current.live).toBeNull();
    expect(result.current.streamOk).toBe(false);
  });
});
