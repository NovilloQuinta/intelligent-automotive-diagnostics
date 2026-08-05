import type { TelemetrySnapshot } from "@/components/dashboard/types";

// ---------------------------------------------------------------------------
// Jitter ranges — SAE J1979 typical sensor noise
// ---------------------------------------------------------------------------

const JITTER = {
  RPM_PCT: 0.04, // ±4% of baseline RPM
  COOLANT_DEG: 1.5, // ±1.5 °C
  INTAKE_DEG: 1.0, // ±1.0 °C
  SPEED_KPH: 2, // ±2 km/h (tiny for idle, noticeable on-road)
} as const;

/** Pseudo-random number in [-range, +range]. */
function jitter(range: number, rand: () => number): number {
  return (rand() - 0.5) * 2 * range;
}

/** Clamps value to at least 0. */
function clampMin0(v: number): number {
  return v < 0 ? 0 : v;
}

/** Rounds to the nearest integer. */
function round(v: number): number {
  return Math.round(v);
}

/**
 * Generates a hex-like OBD raw data string from parsed values.
 * Cosmetic only — the backend sends `rawData` as JSON, so we reconstruct
 * a plausible hex frame for the dashboard's RAW display.
 */
function toRawData(
  rpm: number,
  coolant: number,
  speed: number,
  intake: number,
): string {
  const hex = (v: number) => v.toString(16).toUpperCase().padStart(2, "0");
  return `41 0C ${hex(rpm >> 2)} ${hex(rpm & 3)} 41 05 ${hex(coolant)} 41 0D ${hex(speed)} 41 0F ${hex(intake)}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Produces a jittered {@link TelemetrySnapshot} from a baseline sensor reading.
 * Pure function — same `baseline` + `now` + `rand` → same output.
 *
 * @param baseline - static sensor values (from `Scenario.sensorValues`)
 * @param now      - timestamp for the frame
 * @param rand     - injectable PRNG (defaults to `Math.random`)
 */
export function jitterFrame(
  baseline: {
    rpm: number;
    coolantTemp: number;
    speed: number;
    intakeTemp: number;
  },
  now: number,
  rand: () => number = Math.random,
): TelemetrySnapshot {
  const rpm = clampMin0(
    round(baseline.rpm + jitter(baseline.rpm * JITTER.RPM_PCT, rand)),
  );
  const coolantTemp = clampMin0(
    round(baseline.coolantTemp + jitter(JITTER.COOLANT_DEG, rand)),
  );
  const speed = clampMin0(
    round(baseline.speed + jitter(JITTER.SPEED_KPH, rand)),
  );
  const intakeTemp = clampMin0(
    round(baseline.intakeTemp + jitter(JITTER.INTAKE_DEG, rand)),
  );

  return {
    rpm,
    speed,
    coolantTemp,
    intakeTemp,
    rawData: toRawData(rpm, coolantTemp, speed, intakeTemp),
    ts: now,
  };
}
