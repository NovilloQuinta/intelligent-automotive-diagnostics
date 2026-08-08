import { useEffect, useRef, useState } from "react";
import { api, type CognitiveOutput } from "@/lib/api";
import { ApiHttpError } from "@/lib/api-errors";
import { extractErrorMessage } from "@/lib/errors";
import type { DiagnosisResponse, EcuInfo, FreezeFrame } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HTTP_NOT_FOUND = 404;

const COGNITIVE_UNAVAILABLE = "unavailable" as const;
type CognitiveSentinel = typeof COGNITIVE_UNAVAILABLE;

// ---------------------------------------------------------------------------
// Public facing state shape
// ---------------------------------------------------------------------------

export interface SessionReportState {
  readonly capabilities: { cognitiveDiagnosis: boolean } | null;
  readonly deterministic: DiagnosisResponse | null;
  readonly deterministicLoading: boolean;
  readonly deterministicError: string | null;
  readonly ecus: EcuInfo[] | null;
  readonly ecusLoading: boolean;
  readonly freezeFrame: FreezeFrame | null;
  readonly freezeFrameLoading: boolean;
  readonly cognitive: CognitiveOutput | CognitiveSentinel | null;
  readonly cognitiveLoading: boolean;
  readonly cognitiveError: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const INITIAL_STATE: SessionReportState = {
  capabilities: null,
  deterministic: null,
  deterministicLoading: false,
  deterministicError: null,
  ecus: null,
  ecusLoading: false,
  freezeFrame: null,
  freezeFrameLoading: false,
  cognitive: null,
  cognitiveLoading: false,
  cognitiveError: null,
};

function isNotFoundError(error: unknown): boolean {
  return error instanceof ApiHttpError && error.status === HTTP_NOT_FOUND;
}

/**
 * Runs a single fetch section inside the lifecycle of the report effect.
 * Handles the common `.then(guard).catch(guard).finally(guard)` pattern
 * that was repeated 4 times verbatim.
 */
type SetState = React.Dispatch<React.SetStateAction<SessionReportState>>;

function runSection<T>(
  fetchFn: () => Promise<T>,
  onData: (data: T) => Partial<SessionReportState>,
  onError: (e: unknown) => Partial<SessionReportState>,
  onFinally: () => Partial<SessionReportState>,
  setState: SetState,
  cancelled: { current: boolean },
): void {
  fetchFn()
    .then((data) => {
      if (cancelled.current) return;
      setState((prev) => ({ ...prev, ...onData(data) }));
    })
    .catch((e: unknown) => {
      if (cancelled.current) return;
      setState((prev) => ({ ...prev, ...onError(e) }));
    })
    .finally(() => {
      if (!cancelled.current) setState((prev) => ({ ...prev, ...onFinally() }));
    });
}

// ---------------------------------------------------------------------------
// Section loaders (extracted from the large useEffect body)
// ---------------------------------------------------------------------------

function loadCapabilitiesAndCognitive(
  scenarioId: string,
  setState: SetState,
  cancelled: { current: boolean },
): void {
  api.getCapabilities().then((caps) => {
    if (cancelled.current) return;
    setState((prev) => ({ ...prev, capabilities: caps }));

    if (caps.cognitiveDiagnosis) {
      runSection(
        () => api.getCognitiveDiagnosis(scenarioId),
        (data) => ({ cognitive: data }),
        (e) => ({
          cognitive: null,
          cognitiveError: extractErrorMessage(
            e,
            "Error en diagnóstico cognitivo",
          ),
        }),
        () => ({ cognitiveLoading: false }),
        setState,
        cancelled,
      );
    } else {
      setState((prev) => ({
        ...prev,
        cognitive: COGNITIVE_UNAVAILABLE,
        cognitiveLoading: false,
      }));
    }
  });
}

function loadDeterministic(
  scenarioId: string,
  setState: SetState,
  cancelled: { current: boolean },
): void {
  runSection(
    () => api.runDiagnosis(scenarioId),
    (data) => ({ deterministic: data }),
    (e) => ({
      deterministic: null,
      deterministicError: extractErrorMessage(e, "Error en diagnóstico"),
    }),
    () => ({ deterministicLoading: false }),
    setState,
    cancelled,
  );
}

function loadEcuInfo(
  scenarioId: string,
  setState: SetState,
  cancelled: { current: boolean },
): void {
  runSection(
    () => api.getEcuInfo(scenarioId),
    (data) => ({ ecus: data }),
    (e) => (isNotFoundError(e) ? { ecus: null } : {}),
    () => ({ ecusLoading: false }),
    setState,
    cancelled,
  );
}

function loadFreezeFrame(
  scenarioId: string,
  setState: SetState,
  cancelled: { current: boolean },
): void {
  runSection(
    () => api.getFreezeFrame(scenarioId),
    (data) => ({ freezeFrame: data }),
    (e) => (isNotFoundError(e) ? { freezeFrame: null } : {}),
    () => ({ freezeFrameLoading: false }),
    setState,
    cancelled,
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Orchestrates the parallel fetching of all sections that compose a diagnosis
 * session report for the given scenario:
 *
 * 1. Probes MCP capabilities to decide whether cognitive diagnosis is available.
 * 2. Fires deterministic diagnosis, ECU info, and freeze frame in parallel.
 * 3. If cognitive is available, fires the cognitive diagnosis call (which may
 *    take up to 60 s).
 *
 * 404 responses from ECU-info / freeze-frame silently set the corresponding
 * section to `null` — they are expected when a scenario has no ECUs or no
 * freeze-frame snapshot.
 */
export function useSessionReport(scenarioId: string): SessionReportState {
  const [state, setState] = useState<SessionReportState>(INITIAL_STATE);
  const cancelled = useRef(false);

  useEffect(() => {
    if (!scenarioId) return;

    cancelled.current = false;

    setState({
      ...INITIAL_STATE,
      deterministicLoading: true,
      ecusLoading: true,
      freezeFrameLoading: true,
      cognitiveLoading: true,
    });

    loadCapabilitiesAndCognitive(scenarioId, setState, cancelled);
    loadDeterministic(scenarioId, setState, cancelled);
    loadEcuInfo(scenarioId, setState, cancelled);
    loadFreezeFrame(scenarioId, setState, cancelled);

    return () => {
      cancelled.current = true;
    };
  }, [scenarioId]);

  return state;
}
