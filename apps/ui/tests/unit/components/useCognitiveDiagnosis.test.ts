import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useCognitiveDiagnosis } from "../../../src/components/dashboard/useCognitiveDiagnosis";
import type { CognitiveOutput } from "../../../src/lib/api";

vi.mock("../../../src/lib/api", () => ({
  api: {
    getCognitiveDiagnosis: vi.fn(),
  },
}));

import { api } from "../../../src/lib/api";

function cognitiveOutput(): CognitiveOutput {
  return {
    diagnosis: "Narrativa",
    severity: "low",
    confidence: 0.8,
    recommendations: [],
    toolCalls: [],
    pidObservations: [
      {
        code: "01 42",
        name: "Voltaje del módulo de control",
        unit: "V",
        value: 10.9,
        status: "review",
      },
    ],
  };
}

describe("useCognitiveDiagnosis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps the returned observations to AI rows", async () => {
    vi.mocked(api.getCognitiveDiagnosis).mockResolvedValue(cognitiveOutput());

    const { result } = renderHook(() => useCognitiveDiagnosis("kawa-z900"));

    await act(async () => {
      await result.current.trigger();
    });

    await waitFor(() => {
      expect(result.current.pidRows).toEqual([
        {
          code: "01 42",
          description: "Voltaje del módulo de control",
          value: "10.9 V",
          status: "review",
          source: "ai",
        },
      ]);
    });
    expect(api.getCognitiveDiagnosis).toHaveBeenCalledWith(
      "kawa-z900",
      undefined,
    );
    expect(result.current.loading).toBe(false);
  });

  it("sets loading while the cognitive call is in flight", async () => {
    vi.mocked(api.getCognitiveDiagnosis).mockImplementation(
      () => new Promise(() => {}),
    );

    const { result } = renderHook(() => useCognitiveDiagnosis("kawa-z900"));

    act(() => {
      void result.current.trigger();
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(true);
    });
    expect(result.current.pidRows).toBeNull();
  });

  it("swallows errors and leaves pidRows empty", async () => {
    vi.mocked(api.getCognitiveDiagnosis).mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useCognitiveDiagnosis("kawa-z900"));

    await act(async () => {
      await result.current.trigger();
    });

    expect(result.current.pidRows).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("reset clears the rows and the loading flag", async () => {
    vi.mocked(api.getCognitiveDiagnosis).mockResolvedValue(cognitiveOutput());

    const { result } = renderHook(() => useCognitiveDiagnosis("kawa-z900"));

    await act(async () => {
      await result.current.trigger();
    });
    expect(result.current.pidRows).toHaveLength(1);

    act(() => {
      result.current.reset();
    });

    expect(result.current.pidRows).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("does not call the API when there is no selected scenario", async () => {
    const { result } = renderHook(() => useCognitiveDiagnosis(""));

    await act(async () => {
      await result.current.trigger();
    });

    expect(api.getCognitiveDiagnosis).not.toHaveBeenCalled();
    expect(result.current.pidRows).toBeNull();
  });
});
