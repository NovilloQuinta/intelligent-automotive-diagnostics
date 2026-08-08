import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { useLiveTelemetry } from "../../../src/components/dashboard/useLiveTelemetry";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: qc }, children);
}

const mockLiveData = { rpm: 800, coolantTemp: 90, speed: 0, intakeTemp: 35 };

describe("useLiveTelemetry", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches live data and returns TelemetrySnapshot", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockLiveData), { status: 200 }),
    );

    const { result } = renderHook(() => useLiveTelemetry("audi-a3"), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.streamOk).toBe(true);
    });
    expect(result.current.live).toEqual({
      rpm: 800,
      coolantTemp: 90,
      speed: 0,
      intakeTemp: 35,
      rawData: "",
      ts: expect.any(Number),
    });
  });

  it("handles null PID values by falling back to 0", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          rpm: null,
          coolantTemp: 90,
          speed: null,
          intakeTemp: 35,
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useLiveTelemetry("audi-a3"), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.live).not.toBeNull();
    });
    expect(result.current.live!.rpm).toBe(0);
    expect(result.current.live!.speed).toBe(0);
    expect(result.current.live!.coolantTemp).toBe(90);
  });

  it("sets streamOk false on fetch error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("fail"));

    const { result } = renderHook(() => useLiveTelemetry("audi-a3"), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.streamOk).toBe(false);
    });
  });

  it("returns null and false when selectedId is empty", () => {
    const { result } = renderHook(() => useLiveTelemetry(""), { wrapper });

    expect(result.current.live).toBeNull();
    expect(result.current.streamOk).toBe(false);
  });
});
