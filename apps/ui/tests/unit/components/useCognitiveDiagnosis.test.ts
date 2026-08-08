import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { useCognitiveDiagnosis } from "../../../src/components/dashboard/useCognitiveDiagnosis";
import type { CognitiveOutput } from "../../../src/lib/api";

vi.mock("../../../src/lib/api", () => ({
  api: {
    getCognitiveDiagnosis: vi.fn(),
  },
}));

import { api } from "../../../src/lib/api";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: qc }, children);
}

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
    vi.mocked(api.getCognitiveDiagnosis).mockRejectedValue(
      new Error("not called"),
    );
  });

  it("maps the returned observations to AI rows", async () => {
    vi.mocked(api.getCognitiveDiagnosis).mockResolvedValue(cognitiveOutput());

    const { result } = renderHook(() => useCognitiveDiagnosis("kawa-z900"), {
      wrapper,
    });

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

    const { result } = renderHook(() => useCognitiveDiagnosis("kawa-z900"), {
      wrapper,
    });

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

    const { result } = renderHook(() => useCognitiveDiagnosis("kawa-z900"), {
      wrapper,
    });

    await act(async () => {
      await result.current.trigger();
    });

    expect(result.current.pidRows).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("reset clears the rows and the loading flag", async () => {
    vi.mocked(api.getCognitiveDiagnosis).mockResolvedValue(cognitiveOutput());

    const { result } = renderHook(() => useCognitiveDiagnosis("kawa-z900"), {
      wrapper,
    });

    await act(async () => {
      await result.current.trigger();
    });
    expect(result.current.pidRows).toHaveLength(1);

    act(() => {
      result.current.reset();
    });

    await waitFor(() => {
      expect(result.current.pidRows).toBeNull();
    });
    expect(result.current.loading).toBe(false);
  });

  it("does not call the API when there is no selected scenario", async () => {
    const { result } = renderHook(() => useCognitiveDiagnosis(""), { wrapper });

    await act(async () => {
      await result.current.trigger();
    });

    expect(api.getCognitiveDiagnosis).not.toHaveBeenCalled();
    expect(result.current.pidRows).toBeNull();
  });

  it("clears pidRows when selectedId changes to a different vehicle", async () => {
    vi.mocked(api.getCognitiveDiagnosis).mockResolvedValue(cognitiveOutput());

    const { result, rerender } = renderHook(
      ({ id }) => useCognitiveDiagnosis(id),
      { initialProps: { id: "kawa-z900" }, wrapper },
    );

    await act(async () => {
      await result.current.trigger();
    });

    await waitFor(() => {
      expect(result.current.pidRows).toHaveLength(1);
    });

    rerender({ id: "audi-a3" });

    await waitFor(() => {
      expect(result.current.pidRows).toBeNull();
    });
    expect(result.current.loading).toBe(false);
  });
});
