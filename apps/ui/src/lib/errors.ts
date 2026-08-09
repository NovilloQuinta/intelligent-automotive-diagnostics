/**
 * Safe error-message extraction shared across hooks and utilities.
 *
 * Avoids the `e instanceof Error ? e.message : fallback` pattern that was
 * duplicated in 5 places (useDiagnosis, useEcuInfo, useFreezeFrame,
 * useScenarios, useSessionReport).
 */
export function extractErrorMessage(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}
