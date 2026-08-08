import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useFreezeFrame } from "../../../src/components/dashboard/useFreezeFrame";

vi.mock("../../../src/lib/api", () => ({
  api: {
    getFreezeFrame: vi.fn(),
  },
}));

import { api } from "../../../src/lib/api";

describe("useFreezeFrame", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches the freeze frame when selectedDtc is set", async () => {
    const frame = { dtcCode: "P0301", pidValues: { "0C": 850 } };
    vi.mocked(api.getFreezeFrame).mockResolvedValueOnce(frame);

    const { result } = renderHook(() =>
      useFreezeFrame("audi-a3-idle", "P0301"),
    );

    await waitFor(() => {
      expect(result.current.frame).toEqual(frame);
    });
    expect(api.getFreezeFrame).toHaveBeenCalledWith("audi-a3-idle", "P0301");
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("keeps frame null when the API reports no freeze frame for the code", async () => {
    vi.mocked(api.getFreezeFrame).mockResolvedValueOnce(null);

    const { result } = renderHook(() =>
      useFreezeFrame("audi-a3-idle", "P0420"),
    );

    await waitFor(() => {
      expect(result.current.frame).toBeNull();
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toBeNull();
  });

  it("does not fetch when selectedDtc is null", () => {
    const { result } = renderHook(() => useFreezeFrame("audi-a3-idle", null));

    expect(api.getFreezeFrame).not.toHaveBeenCalled();
    expect(result.current.frame).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("surfaces the error message when the request fails", async () => {
    vi.mocked(api.getFreezeFrame).mockRejectedValueOnce(
      new Error("Scenario not found"),
    );

    const { result } = renderHook(() =>
      useFreezeFrame("audi-a3-idle", "P0301"),
    );

    await waitFor(() => {
      expect(result.current.error).toBe("Scenario not found");
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.frame).toBeNull();
  });

  it("refetches when the selectedDtc changes", async () => {
    vi.mocked(api.getFreezeFrame).mockResolvedValue(null);

    const { rerender } = renderHook(
      ({ dtc }: { dtc: string | null }) => useFreezeFrame("audi-a3-idle", dtc),
      { initialProps: { dtc: "P0301" } },
    );
    await waitFor(() => {
      expect(api.getFreezeFrame).toHaveBeenCalledWith("audi-a3-idle", "P0301");
    });

    rerender({ dtc: "P0420" });
    await waitFor(() => {
      expect(api.getFreezeFrame).toHaveBeenCalledWith("audi-a3-idle", "P0420");
    });
    expect(api.getFreezeFrame).toHaveBeenCalledTimes(2);
  });
});
