import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Mock the API module
// ---------------------------------------------------------------------------

vi.mock("../../../../src/lib/api", () => ({
  api: {
    getDiagnosisHistory: vi.fn(),
  },
}));

import { api } from "../../../../src/lib/api";
import type {
  DiagnosisHistoryResponse,
  DiagnosisSession,
} from "../../../../src/components/dashboard/types";

// SUT — not created yet (RED)
// import { useDiagnosisHistory } from "../../../../src/components/history/useDiagnosisHistory";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SAMPLE_SESSIONS: DiagnosisSession[] = [
  {
    id: 1,
    vehicleId: 1,
    scenarioId: "audi-a3-idle",
    startedAt: "2026-08-09T10:30:00.000Z",
    endedAt: "2026-08-09T10:31:00.000Z",
    severity: "high",
    dtcCount: 3,
  },
  {
    id: 2,
    vehicleId: 2,
    scenarioId: "seat-leon",
    startedAt: "2026-08-09T09:00:00.000Z",
    endedAt: "2026-08-09T09:01:00.000Z",
    severity: "low",
    dtcCount: 1,
  },
];

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

// ---------------------------------------------------------------------------
// Tests — will fail until useDiagnosisHistory is created
// ---------------------------------------------------------------------------

describe("useDiagnosisHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fetch diagnosis history and return sessions + total", async () => {
    vi.mocked(api.getDiagnosisHistory).mockResolvedValue({
      items: SAMPLE_SESSIONS,
      total: 2,
    } as DiagnosisHistoryResponse);

    // Dynamic import so the test can compile before the module exists
    const { useDiagnosisHistory } = await import(
      "../../../../src/components/history/useDiagnosisHistory"
    );

    const { result } = renderHook(
      () => useDiagnosisHistory({ limit: 25, offset: 0 }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.sessions).toEqual(SAMPLE_SESSIONS);
    expect(result.current.total).toBe(2);
    expect(api.getDiagnosisHistory).toHaveBeenCalledWith({
      limit: 25,
      offset: 0,
    });
  });

  it("should pass date range and severity filters to the API", async () => {
    vi.mocked(api.getDiagnosisHistory).mockResolvedValue({
      items: [],
      total: 0,
    });

    const { useDiagnosisHistory } = await import(
      "../../../../src/components/history/useDiagnosisHistory"
    );

    renderHook(
      () =>
        useDiagnosisHistory({
          from: "2026-08-01",
          to: "2026-08-09",
          severity: "high",
          limit: 10,
          offset: 20,
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(api.getDiagnosisHistory).toHaveBeenCalledWith({
        from: "2026-08-01",
        to: "2026-08-09",
        severity: "high",
        limit: 10,
        offset: 20,
      });
    });
  });

  it("should refetch when filters change", async () => {
    vi.mocked(api.getDiagnosisHistory).mockResolvedValue({
      items: SAMPLE_SESSIONS,
      total: 2,
    });

    const { useDiagnosisHistory } = await import(
      "../../../../src/components/history/useDiagnosisHistory"
    );

    const { rerender } = renderHook(
      ({ from }: { from?: string }) =>
        useDiagnosisHistory({ limit: 25, offset: 0, from }),
      { wrapper: createWrapper(), initialProps: { from: undefined } },
    );

    await waitFor(() => {
      expect(api.getDiagnosisHistory).toHaveBeenCalledTimes(1);
    });

    rerender({ from: "2026-08-01" });

    await waitFor(() => {
      expect(api.getDiagnosisHistory).toHaveBeenCalledTimes(2);
      expect(api.getDiagnosisHistory).toHaveBeenLastCalledWith({
        from: "2026-08-01",
        limit: 25,
        offset: 0,
      });
    });
  });

  it("should expose isError and error when the API fails", async () => {
    vi.mocked(api.getDiagnosisHistory).mockRejectedValue(
      new Error("Network error"),
    );

    const { useDiagnosisHistory } = await import(
      "../../../../src/components/history/useDiagnosisHistory"
    );

    const { result } = renderHook(
      () => useDiagnosisHistory({ limit: 25, offset: 0 }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });
});
