import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCapabilities } from "../../../src/components/dashboard/useCapabilities";

vi.mock("../../../src/lib/api", () => ({
  api: {
    getCapabilities: vi.fn(),
  },
}));

import { api } from "../../../src/lib/api";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe("useCapabilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("probes the backend capabilities on mount", async () => {
    vi.mocked(api.getCapabilities).mockResolvedValue({
      cognitiveDiagnosis: true,
    });

    const { result } = renderHook(() => useCapabilities(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.cognitiveDiagnosis).toBe(true);
    });
    expect(api.getCapabilities).toHaveBeenCalledTimes(1);
  });

  it("defaults to cognitiveDiagnosis false while the probe is pending", () => {
    vi.mocked(api.getCapabilities).mockImplementation(
      () => new Promise(() => {}),
    );

    const { result } = renderHook(() => useCapabilities(), {
      wrapper: createWrapper(),
    });

    expect(result.current.cognitiveDiagnosis).toBe(false);
  });

  it("keeps cognitiveDiagnosis false when the probe rejects", async () => {
    vi.mocked(api.getCapabilities).mockRejectedValue(new Error("network"));

    const { result } = renderHook(() => useCapabilities(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(api.getCapabilities).toHaveBeenCalled();
    });
    expect(result.current.cognitiveDiagnosis).toBe(false);
  });
});
