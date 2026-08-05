import { useEffect, useRef, useState } from "react";
import type { Scenario, TelemetrySnapshot } from "./types";
import { jitterFrame } from "@/lib/jitter";

const TICK_MS = 500;

/**
 * Generates live telemetry by jittering the selected scenario's baseline
 * sensorValues at 2 Hz. Replaces the old SSE-based fake stream.
 *
 * When no scenario is selected, returns `null` live data and `streamOk: false`.
 */
export function useLiveTelemetry(scenario: Scenario | null) {
  const [live, setLive] = useState<TelemetrySnapshot | null>(null);
  const [streamOk, setStreamOk] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Clear previous interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!scenario) {
      setLive(null);
      setStreamOk(false);
      return;
    }

    // Emit first frame immediately
    setLive(jitterFrame(scenario.sensorValues, Date.now()));
    setStreamOk(true);

    // Then tick at TICK_MS
    intervalRef.current = setInterval(() => {
      setLive(jitterFrame(scenario.sensorValues, Date.now()));
    }, TICK_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [scenario]);

  return { live, streamOk };
}
