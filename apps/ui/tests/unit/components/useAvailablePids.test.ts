import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAvailablePids } from "../../../src/components/dashboard/useAvailablePids";

vi.mock("../../../src/lib/api", () => ({
  api: {
    getAvailablePids: vi.fn(),
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

describe("useAvailablePids", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches the Mode 01 catalog on mount", async () => {
    const catalog = [{ code: "01 0C", name: "Engine RPM", unit: "rpm" }];
    vi.mocked(api.getAvailablePids).mockResolvedValueOnce(catalog);

    const { result } = renderHook(() => useAvailablePids(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current).toEqual(catalog));
    expect(api.getAvailablePids).toHaveBeenCalledTimes(1);
  });

  it("degrades to an empty catalog when the fetch fails", async () => {
    vi.mocked(api.getAvailablePids).mockRejectedValueOnce(new Error("fail"));

    const { result } = renderHook(() => useAvailablePids(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current).toEqual([]));
  });
});
