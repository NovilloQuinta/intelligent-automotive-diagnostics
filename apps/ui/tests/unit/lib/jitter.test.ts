import { describe, expect, it } from "vitest";
import { jitterFrame } from "../../../src/lib/jitter";

const BASELINE = { rpm: 750, coolantTemp: 90, speed: 0, intakeTemp: 25 };

/** Deterministic PRNG that always returns 0.5 (jitter = 0). */
function fakeRand(): number {
  return 0.5;
}

describe("jitterFrame", () => {
  it("returns exact baseline values when rand is centered (0.5)", () => {
    const frame = jitterFrame(BASELINE, 1000, fakeRand);
    expect(frame.rpm).toBe(750);
    expect(frame.coolantTemp).toBe(90);
    expect(frame.speed).toBe(0);
    expect(frame.intakeTemp).toBe(25);
  });

  it("is deterministic: same inputs produce same output", () => {
    const a = jitterFrame(BASELINE, 1000, fakeRand);
    const b = jitterFrame(BASELINE, 1000, fakeRand);
    expect(a).toEqual(b);
  });

  it("includes ts in the frame", () => {
    const frame = jitterFrame(BASELINE, 42, fakeRand);
    expect(frame.ts).toBe(42);
  });

  it("includes a hex rawData string", () => {
    const frame = jitterFrame(BASELINE, 1000, fakeRand);
    expect(frame.rawData).toMatch(/^41 0C [0-9A-F]{2} [0-9A-F]{2} 41 05 [0-9A-F]{2} 41 0D [0-9A-F]{2} 41 0F [0-9A-F]{2}$/);
  });

  it("clamps negative values to 0", () => {
    // A rand of 0 produces max negative jitter: -(range)
    const randMinus = () => 0;
    const frame = jitterFrame({ rpm: 10, coolantTemp: 0, speed: 0, intakeTemp: 0 }, 1000, randMinus);
    expect(frame.rpm).toBeGreaterThanOrEqual(0);
    expect(frame.coolantTemp).toBeGreaterThanOrEqual(0);
    expect(frame.speed).toBeGreaterThanOrEqual(0);
    expect(frame.intakeTemp).toBeGreaterThanOrEqual(0);
  });

  it("values stay within expected jitter range", () => {
    // 100 frames with Math.random should all stay within ±4% RPM, ±1.5°C coolant, etc.
    for (let i = 0; i < 100; i++) {
      const frame = jitterFrame(BASELINE, i);
      expect(frame.rpm).toBeGreaterThanOrEqual(690); // 750 - 4%*750*2 ≈ 690 (worst case)
      expect(frame.rpm).toBeLessThanOrEqual(810);
      expect(frame.coolantTemp).toBeGreaterThanOrEqual(87); // 90 - 1.5*2
      expect(frame.coolantTemp).toBeLessThanOrEqual(93);
      expect(frame.speed).toBeGreaterThanOrEqual(0); // already 0
      expect(frame.speed).toBeLessThanOrEqual(4); // 0 + 2*2 (worst case)
    }
  });
});
